# RektaBuild Supplier ↔ Inventory Integration

Status: **prepared, awaiting the Inventory domain + API key.**
Supply (this module) and Inventory run as separate applications with separate
databases. All communication is server-to-server HTTPS. Neither module ever
reads the other's database.

This document covers both directions of the contract:

- **Outbound** — Supply calls Inventory's `/api/v1` reads (products, stock, POs).
- **Inbound** — Inventory calls Supply's `/api/integration/*` reads (suppliers,
  orders, receipts).

`API.md` documents the inbound endpoints in full; this file is the integration
runbook and the cross-module contract record.

---

## 1. Credentials

Two **separate** API keys are involved. Do not confuse them.

| Direction | Key | Created in | Stored on | Sent as |
|---|---|---|---|---|
| Supply → Inventory | Inventory's `rbk_` key | Inventory UI `/api-keys` (role `reader`) | Supply server env `INVENTORY_API_KEY` | `Authorization: Bearer` or `X-API-Key` |
| Inventory → Supply | Supply's `rbk_` key | Supply UI `/api-keys` (role `reader`) | Inventory server env (their choice of name) | `Authorization: Bearer` or `X-API-Key` |

- Only SHA-256 hashes are stored; plaintext is shown once at creation.
- An Inventory `rbk_` key does **not** authenticate calls to Supply and vice
  versa — each module issues and validates its own keys.
- Keys live only in environment variables on each server. Never in browser
  JavaScript, Git, URLs, or logs.

### Supply-side environment variables

```bash
INVENTORY_API_BASE_URL=   # e.g. https://inventory.example.com/api/v1
                          # (the /api/v1 prefix is part of the base URL)
INVENTORY_API_KEY=        # rbk_... key issued by the Inventory admin
INVENTORY_API_TIMEOUT_MS= # optional, default 8000
INVENTORY_API_RETRY_MAX=  # optional, default 2 (GETs only)
```

Note: Inventory keys are `rbk_<48 hex>` (24 random bytes) — shorter than
Supply's own `rbk_<64 hex>` keys. Inventory roles are `staff`/`manager`/`admin`;
any of them can call every GET in their contract (the "All" tier). Writes need
`manager`/`admin`. Supply's role model is `reader`/`writer` — a `reader` key is
what Inventory needs to call back into us.

Set them in `/var/www/rekta-supplier/.env` and start/restart the app with the
variables exported (`set -a; source .env; set +a`) — `ecosystem.config.cjs`
forwards them under `--env production`.

### Verify before deploying

```bash
cd /var/www/rekta-supplier
set -a && source .env && set +a
npm run inventory:check
```

Expected on success:

```
Checking Inventory at https://inventory.example.com ...
health  (84ms): {"status":"ok","module":"inventory","role":"reader"}
products: reachable, X-Total-Count=128
Inventory connection OK.
```

Without configuration the command exits 1 with `not_configured` instructions —
it never prints the key.

---

## 2. Contract table

| Caller | Provider | Method / path | Purpose | Auth | Key fields | Status |
|---|---|---|---|---|---|---|
| Supply | Inventory | `GET /api/v1/health` | Liveness + module identity | Inventory key | `data.status`, `data.module`, `data.role` | Implemented (client) |
| Supply | Inventory | `GET /api/v1/products` | Product catalog + on-hand | Inventory key | `id, sku, name, quantity, unit, minStockLevel`; `X-Total-Count`, `X-Page`, `X-Per-Page` | Implemented (client) |
| Supply | Inventory | `GET /api/v1/products/:id` | Product + category + supplier + last 20 movements | Inventory key | product fields | Implemented (client) |
| Supply | Inventory | `GET /api/v1/products/low-stock` | `quantity <= minStockLevel`, unpaginated | Inventory key | product fields | Implemented (client) |
| Supply | Inventory | `GET /api/v1/categories`, `/:id` | Category tree + counts | Inventory key | parent/children, `products_count` | Implemented (client) |
| Supply | Inventory | `GET /api/v1/suppliers`, `/:id` | Inventory's **legacy** supplier data (overlap audit) | Inventory key | search; supplier + recent POs | Implemented (client) |
| Supply | Inventory | `GET /api/v1/purchase-orders`, `/:id` | Inventory-side PO visibility | Inventory key | `status`, `supplier_id`, `page`, `per_page` → `X-Total-Count` | Implemented (client) |
| Supply | Inventory | `GET /api/v1/stock-movements` | Movement ledger | Inventory key | `product_id`, `type`, `from`, `to`, `page`, `per_page` → `X-Total-Count` | Implemented (client) |
| Supply | Inventory | `GET /api/v1/stock-movements/product/:id` | Last 50 movements for a product | Inventory key | unpaginated | Implemented (client) |
| Supply | Inventory | `GET /api/v1/stock-summary` | `total_products, total_value, low_stock, out_of_stock` | Inventory key | `total_value` uses cost price | Implemented (client) |
| Supply | Inventory | `GET /api/inventory/products` | Warehouse ext: active products | Inventory key | `{source,exportedAt,count,data}` envelope | Implemented (client) |
| Supply | Inventory | `GET /api/inventory/warehouses` | Warehouse ext: warehouses | Inventory key | same envelope | Implemented (client) |
| Supply | Inventory | `GET /api/inventory/stock-levels` | Warehouse ext: balances per product/warehouse | Inventory key | `productId`, `warehouseId` | Implemented (client) |
| Supply | Inventory | `GET /api/inventory/low-stock` | Warehouse ext: reorder point list | Inventory key | same envelope | Implemented (client) |
| Supply | Inventory | `GET /api/inventory/movements` | Warehouse ext: movements (max 200) | Inventory key | `productId`, `from`, `to` | Implemented (client) |
| Supply | Inventory | `POST`/`PUT`/`DELETE` any path | Stock-in / master-data writes | — | — | **Not implemented** — awaits ownership + idempotency agreement (§5, §6) |
| Inventory | Supply | `GET /api/integration/suppliers` | Supplier master data | Supply key | Organizations + `locations[]` | Live |
| Inventory | Supply | `GET /api/integration/orders` | POs + line items | Supply key | `status`, `projectSite`, `expectedDeliveryDate`, `items[].quantityReceived` | Live |
| Inventory | Supply | `GET /api/integration/receipts` | Stock-in source data | Supply key | `receiptId`, `finalized`, `items[].quantityReceived/quantityRejected/inspectionStatus` | Live |
| anyone | Supply | `GET /health` | Liveness | none | `status`, `db` | Live |

Inventory error codes (confirmed): `400` malformed JSON, `401` missing/invalid/
revoked key, `403` insufficient role, `404` not found, `422` validation or
business rule, `500` server failure. `InventoryApiError.code` maps these to
`unauthorized | forbidden | not_found | invalid | unavailable`.

Envelope conventions (confirmed by the Inventory handoff doc):

- `/api/v1` responses: success `{ "data": ... }`, error `{ "error": "message" }`,
  health `{ "data": { "status": "ok", "module": "...", "role": "..." } }`.
  Creates return 201; deletes return `{data:{message:"..."}}`.
  Responses are camelCase (`minStockLevel`, `costPrice`); request bodies use
  snake_case (`category_id`, `unit_price`); decimals may be strings; no
  `productCode` field exists on Inventory products — the join key is `sku`.
- `/api/inventory` warehouse-extension responses use our own envelope shape:
  `{ "source": ..., "exportedAt": ..., "count": n, "data": [...] }`.
- Supply export responses: `{ "source": "RektaBuild-Supplier", "exportedAt": ISO,
  "count": n, "data": [...] }`.

Pagination:

- `/api/v1` paginates products, purchase-orders and stock-movements:
  `page` (default 1), `per_page` (default 20, clamped 1–100). All three return
  `X-Total-Count`; only products also return `X-Page`/`X-Per-Page`.
  `utils/inventoryClient.js::listAllPages()` walks `X-Total-Count`.
- `/api/inventory` extension lists are unpaginated (`movements` caps at 200).
- Supply export endpoints are **not** paginated — they return full sets with
  `count`. Filter orders by `?status=` if needed.

### Receipts are finalized at creation

Supply receipts are append-only: `createReceipt` writes the `Receipt` and all
`ReceiptItem` rows in one request, increments `OrderItem.quantityReceived`, and
recomputes the order status. There are no update/delete routes for receipts.
An exported receipt row is therefore **final** — `quantityReceived` is the
accepted quantity to stock in; `quantityRejected` never enters stock.
There is no `finalized` database column; finality is guaranteed by the absence
of any mutation path (report this if a void/amend feature is ever added).

Each `ReceiptItem` also carries the standardized inspection checklist
(`qtyMatchesPo`, `packagingIntact`, `specsCorrect`, `noVisibleDamage` — nullable
booleans) recorded at receiving time. `inspectionStatus` is derived from both
the rejected quantity and failed checks; consumers should treat the checklist as
informational and continue to use only `quantityReceived`/`quantityRejected` for
stock calculations.

---

## 3. Outbound client (`utils/inventoryClient.js`)

Server-side only. Built on Node's global `fetch` — no extra dependencies.

```js
import { listProducts, getProduct, listAllPages } from "./utils/inventoryClient.js";

const page = await listProducts({ search: "cement", page: 1, per_page: 20 });
//  -> { data: [...], raw, headers, status }

const all = await listAllPages("/products", { stock_status: "low" });
//  -> array across all pages; throws on failure (never returns [] on error)
```

Behaviour:

- `Authorization: Bearer <INVENTORY_API_KEY>` on every request.
- `INVENTORY_API_TIMEOUT_MS` per-attempt timeout via `AbortController`.
- GETs retry `INVENTORY_API_RETRY_MAX` times on network errors, timeouts and
  502/503/504 with exponential backoff. Non-GET calls are never retried —
  no stock-changing endpoint is implemented anyway (see §6).
- Failures throw `InventoryApiError` with `code` =
  `not_configured | unauthorized | forbidden | invalid | unavailable |
  timeout | network`. Messages are sanitized — `rbk_` values are redacted.
- **A failed call is never treated as zero stock or an empty list.** Callers
  must catch and surface the error.

Helpers: `normalizeInventoryProduct()` (camelCase → our shape, string decimals
→ numbers, no invented fields) and `matchProductsBySku()` (§4).

### Smoke test

```bash
npm test   # node:test suite — auth header, 401/403/5xx/timeout mapping,
           # GET retry vs POST no-retry, pagination, product mapping
```

---

## 4. Product identity mapping

Numeric `id` values are **module-local** — `Product.id` in Supply and
`product.id` in Inventory mean nothing to each other. The agreed join key is:

```
Inventory product `sku`  <->  Supply `Product.productCode`  (unique, required)
```

`matchProductsBySku(inventoryProducts, supplyProducts)` returns:

```js
{
  matched:              [{ sku, inventoryId, supplyId, supplyProductCode }],
  unmatchedInventory:   [...],   // SKUs Inventory has that Supply lacks
  unmatchedSupply:      [...],   // productCodes Supply has that Inventory lacks
  duplicateSupplyCodes: [...],   // same code on >1 Supply product
  duplicateInventorySkus: [...], // same sku on >1 Inventory product
}
```

Rules:

- All unmatched/duplicate rows must be reported to the operator — never
  silently dropped or guessed.
- `sku`/`productCode` values are matched exactly (case-sensitive). If either
  side normalizes differently, agree a normalization rule before syncing.
- Keep both IDs in any persisted mapping — `inventoryId` and `supplyId` are
  stored side by side, never merged.

Open question for Inventory: confirm whether their `sku` is case-sensitive and
globally unique, and whether legacy rows exist with empty `sku`.

---

## 5. Ownership split (proposed — needs sign-off)

| Domain | Owner | Notes |
|---|---|---|
| Supplier records, accreditation | **Supply** | `Organizations` + `Locations` are the master |
| Sourcing / product-supplier terms | **Supply** | `ProductSuppliers`, `PreferenceTypes` |
| Purchase orders + line items | **Supply** | `Orders`/`OrderItems`, PO lifecycle statuses |
| Receiving / goods receipts | **Supply** | `Receipts`/`ReceiptItems`, accepted vs rejected |
| Warehouse balances, stock movements | **Inventory** | `/api/v1/stock-*` endpoints |
| Product physical catalog (qty on hand, min levels) | **Inventory** | `quantity`, `minStockLevel` live there |
| Product identity (`productCode`/`sku` join) | shared | §4 mapping contract |

**Overlap to resolve before go-live:** Inventory also has legacy supplier and
purchase-order features. The agreed workflow should be:

1. Suppliers, POs and receipts are created **only** in Supply.
2. Inventory consumes `/api/integration/*` reads (or pushes) to reflect stock.
3. Inventory's own supplier/PO write paths are retired or made read-only
   mirrors — otherwise orders exist twice and stock posts twice.

Until that is agreed, do **not** create POs in both modules and do not post
receipt quantities anywhere.

---

## 6. Pending items / Inventory-side work needed

The Inventory API contract (API.md + deploy/INTEGRATION.md handoff) has been
received and the read surface is fully implemented. Still blocking a real
stock-in flow — none of this is implemented or assumed:

1. **Receiving endpoint** — Inventory's automatic ingestion of Supply receipts
   is not built and their doc still says not to automate receiving. Their
   `POST /api/v1/purchase-orders/:id/status` ("received adds stock
   transactionally") and `POST /api/inventory/movements` exist but are **not**
   an agreed receipt-ingestion contract.
2. **Target stock source** — their legacy `/api/v1` `Product.quantity` and the
   `/api/inventory` warehouse balances are separate and must not be combined.
   One must be chosen before any posting.
3. **Accepted-quantity rule** — confirm Inventory stocks in only
   `quantityReceived` (accepted), never `quantityRejected`.
4. **Idempotency** — a receipt push needs a dedupe key (propose:
   `receiptNumber` + `orderNumber` or `receiptId`), so retries can't
   double-post stock.
5. **`user_id` mapping** — their write endpoints require an Inventory-side
   `user_id`; Supply employee IDs do not map automatically. Needs an agreed
   service-user or mapping table.
6. **`sku` uniqueness/casing** — confirm on the Inventory side (§4).
7. **Real URL + key** — `inventory.example.com` is a placeholder; the public
   HTTPS hostname and Supply's Inventory key are shared privately when ready.

---

## 7. Verification commands

```bash
# Supply health
curl -sS https://<SUPPLY_DOMAIN>/health

# Inbound contract (Supply export) with a Supply reader key
curl -sS -H "Authorization: Bearer rbk_<SUPPLY_KEY>" \
  https://<SUPPLY_DOMAIN>/api/integration/receipts

# Outbound contract (Inventory) once credentials arrive
set -a && source .env && set +a
npm run inventory:check
```

Do not claim end-to-end integration until `npm run inventory:check` passes
against the real Inventory deployment and an Inventory-side consumer proves
it can read `/api/integration/receipts` with a Supply key.
