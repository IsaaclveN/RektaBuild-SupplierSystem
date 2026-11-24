import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  health, request, listAllPages, listStockLevels,
  normalizeInventoryProduct, matchProductsBySku,
  isConfigured, InventoryApiError,
} from "../utils/inventoryClient.js";

let server;
let baseUrl;
const calls = { authHeaders: [], flakyHits: 0 };

const respond = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    calls.authHeaders.push(req.headers.authorization || null);

    if (url.pathname === "/api/v1/health") {
      return respond(res, 200, { data: { status: "ok", module: "inventory", role: "reader" } });
    }
    if (url.pathname === "/api/v1/products") {
      const page = Number(url.searchParams.get("page") || 1);
      const perPage = Number(url.searchParams.get("per_page") || 20);
      const all = [
        { id: 11, sku: "CEM-001", name: "Portland Cement", quantity: "12.5", unit: "BAG", minStockLevel: "5" },
        { id: 12, sku: "RBR-010", name: "Deformed Bar 10mm", quantity: 30, unit: "PC", minStockLevel: 10 },
        { id: 13, sku: "PLY-STD", name: "Plywood 1/2", quantity: 4, unit: "SHT", minStockLevel: 8 },
      ];
      const slice = all.slice((page - 1) * perPage, page * perPage);
      return respond(res, 200, { data: slice }, {
        "X-Total-Count": "3", "X-Page": String(page), "X-Per-Page": String(perPage),
      });
    }
    if (url.pathname === "/api/v1/flaky") {
      calls.flakyHits += 1;
      if (calls.flakyHits < 3) return respond(res, 503, { error: "booting" });
      return respond(res, 200, { data: { recovered: true } });
    }
    if (url.pathname === "/api/v1/boom") return respond(res, 503, { error: "down" });
    if (url.pathname === "/api/v1/no-key") {
      return respond(res, 401, { error: `invalid key rbk_deadbeef1234` });
    }
    if (url.pathname === "/api/v1/slow") {
      return setTimeout(() => respond(res, 200, { data: {} }), 300);
    }
    if (url.pathname === "/api/v1/unprocessable") {
      return respond(res, 422, { error: "quantity must be >= 1" });
    }
    if (url.pathname === "/api/inventory/stock-levels") {
      return respond(res, 200, {
        source: "rekta-inventory", exportedAt: "2026-11-22T00:00:00.000Z", count: 1,
        data: [{ productId: 11, warehouseId: 1, quantity: 40 }],
      });
    }
    return respond(res, 404, { error: "nope" });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  process.env.INVENTORY_API_BASE_URL = `${baseUrl}/api/v1`;
  process.env.INVENTORY_API_KEY = "rbk_testkey";
  process.env.INVENTORY_API_TIMEOUT_MS = "150";
  process.env.INVENTORY_API_RETRY_MAX = "2";
});

after(() => {
  server.close();
  delete process.env.INVENTORY_API_BASE_URL;
  delete process.env.INVENTORY_API_KEY;
  delete process.env.INVENTORY_API_TIMEOUT_MS;
  delete process.env.INVENTORY_API_RETRY_MAX;
});

test("isConfigured reflects env", () => {
  assert.equal(isConfigured(), true);
});

test("health unwraps the {data} envelope and sends Bearer auth", async () => {
  calls.authHeaders.length = 0;
  const h = await health();
  assert.deepEqual(h.data, { status: "ok", module: "inventory", role: "reader" });
  assert.equal(calls.authHeaders[0], "Bearer rbk_testkey");
});

test("401 maps to InventoryApiError unauthorized and sanitizes keys", async () => {
  await assert.rejects(
    request("/no-key"),
    (err) => {
      assert.ok(err instanceof InventoryApiError);
      assert.equal(err.code, "unauthorized");
      assert.equal(err.status, 401);
      assert.ok(!err.message.includes("rbk_deadbeef1234"), "key leaked in error message");
      return true;
    },
  );
});

test("GET retries transient 503 then succeeds", async () => {
  calls.flakyHits = 0;
  const r = await request("/flaky");
  assert.deepEqual(r.data, { recovered: true });
  assert.equal(calls.flakyHits, 3);
});

test("GET gives up after retries and reports unavailable", async () => {
  await assert.rejects(
    request("/boom"),
    (err) => err instanceof InventoryApiError && err.code === "unavailable" && err.status === 503,
  );
});

test("non-GET requests are never retried", async () => {
  calls.flakyHits = 0;
  await assert.rejects(
    request("/flaky", { method: "POST", body: { x: 1 } }),
    (err) => err instanceof InventoryApiError && err.code === "unavailable",
  );
  assert.equal(calls.flakyHits, 1);
});

test("slow endpoint maps to timeout", async () => {
  await assert.rejects(
    request("/slow"),
    (err) => err instanceof InventoryApiError && err.code === "timeout",
  );
});

test("network failure maps to network after retries", async () => {
  process.env.INVENTORY_API_BASE_URL = "http://127.0.0.1:1"; // closed port
  await assert.rejects(
    request("/health"),
    (err) => err instanceof InventoryApiError && err.code === "network",
  );
  process.env.INVENTORY_API_BASE_URL = `${baseUrl}/api/v1`;
});

test("404 maps to not_found and 422 to invalid", async () => {
  await assert.rejects(
    request("/missing"),
    (err) => err.code === "not_found" && err.status === 404,
  );
  await assert.rejects(
    request("/unprocessable"),
    (err) => err.code === "invalid" && err.status === 422,
  );
});

test("warehouse extension unwraps {source,exportedAt,count,data}", async () => {
  const r = await listStockLevels({ productId: 11 });
  assert.deepEqual(r.data, [{ productId: 11, warehouseId: 1, quantity: 40 }]);
});

test("missing config throws not_configured", async () => {
  const saved = process.env.INVENTORY_API_KEY;
  delete process.env.INVENTORY_API_KEY;
  await assert.rejects(
    request("/health"),
    (err) => err.code === "not_configured",
  );
  process.env.INVENTORY_API_KEY = saved;
});

test("listAllPages accumulates pages via X-Total-Count", async () => {
  const items = await listAllPages("/products", {}, { perPage: 2 });
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((p) => p.sku), ["CEM-001", "RBR-010", "PLY-STD"]);
});

test("normalizeInventoryProduct converts string decimals, never invents fields", () => {
  const p = normalizeInventoryProduct(
    { id: 11, sku: "CEM-001", name: "Portland Cement", quantity: "12.5", unit: "BAG", minStockLevel: "5" },
  );
  assert.equal(p.quantity, 12.5);
  assert.equal(p.minStockLevel, 5);
  assert.equal(p.inventoryId, 11);
  assert.equal("productCode" in p, false);
});

test("matchProductsBySku pairs on sku<->productCode and reports gaps", () => {
  const inventory = [
    { id: 11, sku: "CEM-001" },
    { id: 12, sku: "RBR-010" },
    { id: 99, sku: "GHOST-1" },
  ];
  const supply = [
    { id: 2, productCode: "CEM-001" },
    { id: 5, productCode: "RBR-010" },
    { id: 8, productCode: "PLY-STD" },
    { id: 8, productCode: "PLY-STD" }, // duplicate code -> reported, not used
  ];
  const r = matchProductsBySku(inventory, supply);
  assert.equal(r.matched.length, 2);
  assert.deepEqual(r.matched[0], { sku: "CEM-001", inventoryId: 11, supplyId: 2, supplyProductCode: "CEM-001" });
  assert.deepEqual(r.unmatchedInventory.map((p) => p.sku), ["GHOST-1"]);
  assert.deepEqual(r.unmatchedSupply.map((p) => p.productCode), ["PLY-STD", "PLY-STD"]);
  assert.deepEqual(r.duplicateSupplyCodes, ["PLY-STD"]);
});
