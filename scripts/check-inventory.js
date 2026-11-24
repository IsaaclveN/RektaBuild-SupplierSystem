// Read-only connectivity check for the Inventory module.
//
//   set -a && source .env && set +a
//   npm run inventory:check
//
// Exits 0 when the Inventory API answers with a valid health envelope and a
// product list page, 1 otherwise. Prints no secrets — only the base URL and
// sanitized error messages.

import {
  health, listProducts, isConfigured, InventoryApiError,
} from "../utils/inventoryClient.js";

const main = async () => {
  if (!isConfigured()) {
    console.error("Inventory integration is not configured.");
    console.error("Set INVENTORY_API_BASE_URL and INVENTORY_API_KEY in the environment (see .env.example).");
    process.exit(1);
  }

  console.log(`Checking Inventory at ${process.env.INVENTORY_API_BASE_URL} ...`);

  const started = Date.now();
  const h = await health();
  console.log(`health  (${Date.now() - started}ms): ${JSON.stringify(h.data)}`);

  const p = await listProducts({ page: 1, per_page: 1 });
  const total = p.headers.get("x-total-count");
  console.log(`products: reachable, X-Total-Count=${total ?? "not provided"}`);

  console.log("Inventory connection OK.");
};

try {
  await main();
} catch (err) {
  if (err instanceof InventoryApiError) {
    console.error(`Inventory check failed [${err.code}${err.status ? `/${err.status}` : ""}]: ${err.message}`);
  } else {
    console.error("Inventory check failed:", err.message);
  }
  process.exit(1);
}
