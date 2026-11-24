// Server-side client for the RektaBuild Inventory module's /api/v1 contract.
// Runs inside the Supply backend only — the Inventory API key must never reach
// browser JavaScript, Git, URLs, or logs.
//
// Configuration (environment variables, see .env.example):
//   INVENTORY_API_BASE_URL   e.g. https://inventory.example.com/api/v1
//                            (the /api/v1 prefix is part of the base URL)
//   INVENTORY_API_KEY        rbk_... key issued by an Inventory admin
//   INVENTORY_API_TIMEOUT_MS optional, default 8000
//   INVENTORY_API_RETRY_MAX  optional, default 2 (GET requests only)
//
// Only GET endpoints confirmed by the Inventory contract are implemented here.
// No write/stock-changing calls exist yet — those await an agreed receiving
// endpoint, target stock source, accepted-quantity rules, and idempotency.

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;
const MAX_PAGES = 100;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export class InventoryApiError extends Error {
  constructor(code, message, { status = null } = {}) {
    super(message);
    this.name = "InventoryApiError";
    this.code = code;       // not_configured | unauthorized | forbidden | invalid | unavailable | timeout | network
    this.status = status;   // HTTP status when the failure came from a response
  }
}

export const isConfigured = () =>
  Boolean(process.env.INVENTORY_API_BASE_URL && process.env.INVENTORY_API_KEY);

const config = () => {
  const baseUrl = (process.env.INVENTORY_API_BASE_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.INVENTORY_API_KEY || "";
  if (!baseUrl) {
    throw new InventoryApiError("not_configured", "INVENTORY_API_BASE_URL is not set.");
  }
  if (!apiKey) {
    throw new InventoryApiError("not_configured", "INVENTORY_API_KEY is not set.");
  }
  return {
    baseUrl,
    apiKey,
    timeoutMs: Number(process.env.INVENTORY_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    retries: process.env.INVENTORY_API_RETRY_MAX != null
      ? Number(process.env.INVENTORY_API_RETRY_MAX)
      : DEFAULT_RETRIES,
  };
};

// Keys must never leak into thrown errors even if a remote error body echoes one.
const sanitize = (msg) => String(msg ?? "").replace(/rbk_\S+/g, "rbk_***");

const buildUrl = (baseUrl, path, query) => {
  const url = new URL(`${baseUrl}${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Single transport entry point. GETs may retry on transient failures; any
// future mutating call passes retries: 0 by default — never re-post a stock
// change without an agreed idempotency key.
export const request = async (path, { method = "GET", query, retries, body, baseUrlOverride } = {}) => {
  const { baseUrl: configuredBase, apiKey, timeoutMs, retries: defaultRetries } = config();
  const baseUrl = baseUrlOverride || configuredBase;
  const maxRetries = retries ?? (method === "GET" ? defaultRetries : 0);
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(buildUrl(baseUrl, path, query), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === "AbortError";
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(200 * 2 ** attempt);
        continue;
      }
      throw new InventoryApiError(
        isTimeout ? "timeout" : "network",
        isTimeout
          ? `Inventory did not answer within ${timeoutMs}ms.`
          : `Inventory unreachable: ${sanitize(err.message)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      const json = await res.json().catch(() => null);
      return {
        data: json && typeof json === "object" && "data" in json ? json.data : json,
        raw: json,
        headers: res.headers,
        status: res.status,
      };
    }

    const errBody = await res.json().catch(() => null);
    if (attempt < maxRetries && RETRYABLE_STATUS.has(res.status)) {
      attempt += 1;
      await sleep(200 * 2 ** attempt);
      continue;
    }
    const code = res.status === 401 ? "unauthorized"
      : res.status === 403 ? "forbidden"
      : res.status === 404 ? "not_found"
      : res.status >= 500 ? "unavailable"
      : "invalid"; // 400 malformed JSON, 422 validation / business rule
    throw new InventoryApiError(
      code,
      `Inventory API ${method} ${path} failed (${res.status}): ${sanitize(errBody?.error || res.statusText)}`,
      { status: res.status },
    );
  }
};

export const get = (path, query) => request(path, { method: "GET", query });

// ─── Confirmed Inventory read endpoints (/api/v1 via the base URL) ──────────
// Roles on the Inventory side are staff/manager/admin; every GET here is in
// the "All" tier, so any valid key can call them.

export const health = () => get("/health");

// params: search, category_id, supplier_id, stock_status, low_stock, page, per_page
// Paginated: X-Total-Count, X-Page, X-Per-Page (default 20, max 100).
export const listProducts = (params = {}) => get("/products", params);
export const getProduct = (id) => get(`/products/${encodeURIComponent(id)}`);
// Unpaginated: products where quantity <= minStockLevel.
export const listLowStock = (params = {}) => get("/products/low-stock", params);
// { total_products, total_value, low_stock, out_of_stock }
export const stockSummary = (params = {}) => get("/stock-summary", params);
// params: product_id, type=in|out|adjustment|return, from, to, page, per_page
export const listStockMovements = (params = {}) => get("/stock-movements", params);
// Last 50 movements for one product (unpaginated).
export const listStockMovementsForProduct = (productId) =>
  get(`/stock-movements/product/${encodeURIComponent(productId)}`);

export const listCategories = () => get("/categories");
export const getCategory = (id) => get(`/categories/${encodeURIComponent(id)}`);

// Inventory's own (legacy) supplier records — for overlap audit only. Supply
// remains the proposed owner of supplier master data (see INTEGRATION.md §5).
export const listInventorySuppliers = (params = {}) => get("/suppliers", params);
export const getInventorySupplier = (id) => get(`/suppliers/${encodeURIComponent(id)}`);

// params: status, supplier_id, page, per_page. Paginated via X-Total-Count.
export const listPurchaseOrders = (params = {}) => get("/purchase-orders", params);
export const getPurchaseOrder = (id) =>
  get(`/purchase-orders/${encodeURIComponent(id)}`);

// ─── Warehouse extension (/api/inventory) ───────────────────────────────────
// Separate stock source from legacy Product.quantity — do NOT combine them.
// Its envelope is {source, exportedAt, count, data}; still unwrapped to `data`.
// Lists are unpaginated; movements are capped at 200 server-side.

const extensionGet = (path, query) => {
  const { baseUrl } = config();
  const origin = new URL(baseUrl).origin;
  return request(path, { method: "GET", query, baseUrlOverride: origin + "/api/inventory" });
};

export const listWarehouseProducts = () => extensionGet("/products");
export const listWarehouses = () => extensionGet("/warehouses");
// params: productId, warehouseId
export const listStockLevels = (params = {}) => extensionGet("/stock-levels", params);
export const listWarehouseLowStock = () => extensionGet("/low-stock");
// params: productId, from, to — server returns at most 200 rows.
export const listWarehouseMovements = (params = {}) => extensionGet("/movements", params);

// Accumulates every page of a paginated list using X-Total-Count. Throws on
// failure — a failed fetch is never reported as an empty list or zero stock.
export const listAllPages = async (path, params = {}, { perPage = 100 } = {}) => {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, headers } = await get(path, { ...params, page, per_page: perPage });
    const rows = Array.isArray(data) ? data : [data];
    items.push(...rows.filter((r) => r !== null && r !== undefined));
    const total = Number(headers.get("x-total-count"));
    if (Number.isFinite(total)) {
      if (items.length >= total) return items.slice(0, total);
      if (!rows.length) return items;
    } else if (rows.length < perPage) {
      return items;
    }
  }
  throw new InventoryApiError("invalid", `Pagination exceeded ${MAX_PAGES} pages for ${path}.`);
};

// ─── Product mapping helpers ────────────────────────────────────────────────
// Inventory fields arrive camelCase and decimals may be strings. Numeric IDs
// are module-local — they are never used to join across modules.

const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const normalizeInventoryProduct = (p) => ({
  inventoryId: p.id ?? null,
  sku: p.sku ?? null,
  name: p.name ?? null,
  quantity: numOrNull(p.quantity),
  unit: p.unit ?? null,
  minStockLevel: numOrNull(p.minStockLevel),
});

// Maps Inventory products onto Supply products by stable code:
//   Inventory `sku` <-> Supply `productCode`.
// Returns matches plus every row that could not be paired, so callers can
// report gaps instead of silently dropping products.
export const matchProductsBySku = (inventoryProducts, supplyProducts) => {
  const indexByCode = (rows, keyOf) => {
    const map = new Map();
    const dupes = new Set();
    for (const row of rows) {
      const key = keyOf(row);
      if (!key) continue;
      if (map.has(key)) dupes.add(key);
      else map.set(key, row);
    }
    return { map, dupes: [...dupes] };
  };

  const supply = indexByCode(supplyProducts, (p) => p.productCode ?? p.sku);
  const inventory = indexByCode(inventoryProducts, (p) => p.sku);

  const matched = [];
  const unmatchedInventory = [];
  for (const [sku, ip] of inventory.map) {
    const sp = supply.map.get(sku);
    if (sp) matched.push({ sku, inventoryId: ip.id ?? null, supplyId: sp.id ?? null, supplyProductCode: sp.productCode ?? sku });
    else unmatchedInventory.push(ip);
  }
  const matchedSupplyCodes = new Set(matched.map((m) => m.sku));
  const unmatchedSupply = supplyProducts.filter(
    (p) => !matchedSupplyCodes.has(p.productCode ?? p.sku),
  );

  return {
    matched,
    unmatchedInventory,
    unmatchedSupply,
    duplicateSupplyCodes: supply.dupes,
    duplicateInventorySkus: inventory.dupes,
  };
};
