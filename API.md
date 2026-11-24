# RektaBuild Supplier — API Integration Contract

Base URL: `https://<DOMAIN>` in production, `http://localhost:3000` in development.

All endpoints below are read-only and require an API key. The web UI is session
authenticated and is **not** part of this contract.

## Authentication

Every request must carry a key issued from **API Keys** (`/api-keys`) in the web UI.

| Header | Format |
|---|---|
| `Authorization` | `Bearer rbk_<64 hex chars>` |
| `X-API-Key` | `rbk_<64 hex chars>` |

- Only the SHA-256 hash is stored server-side. The plaintext key is displayed once
  at creation and cannot be retrieved again.
- Roles: `reader` allows `GET`/`HEAD`/`OPTIONS` only; `writer` also allows mutating
  methods. All endpoints in this contract are `GET`, so `reader` is sufficient.
- Revoked or disabled keys return `401` immediately.
- Expired keys (`expiresAt` in the past) return `401`.

### Error responses

| Status | Body | When |
|---|---|---|
| `401` | `{"error":"unauthorized","message":"..."}` | Missing, malformed, unknown, revoked, or expired key |
| `403` | `{"error":"forbidden","message":"This API key is read-only (reader role)."}` | `reader` key used on a mutating method |
| `404` | HTML | Unknown route |
| `500` | HTML | Unhandled server error |

## Endpoints

### `GET /health`

Unauthenticated liveness probe. Used by Nginx, PM2, and uptime checks.

**Response `200`**

```json
{
  "status": "ok",
  "db": "up",
  "uptime": 42,
  "version": "1.0.0",
  "timestamp": "2026-11-22T15:17:23.655Z"
}
```

Returns `503` with `"status":"degraded"` and `"db":"down"` when the database
connection fails.

---

### `GET /api/integration/suppliers`

Supplier master data, including TIN, payment terms, accreditation status, and
addresses. This is the endpoint the **Accounting** module should call.

**Auth:** API key (`reader`)

**Query parameters:** none

**Response `200`**

```json
{
  "source": "RektaBuild-Supplier",
  "exportedAt": "2026-11-22T15:17:36.919Z",
  "count": 1,
  "data": [
    {
      "id": 1,
      "code": "SUP-001",
      "name": "SteelBuild Aggregates Inc.",
      "description": null,
      "role": "supplier",
      "active": true,
      "tin": "000-123-456-000",
      "paymentTerms": "Net 30",
      "accreditationStatus": "ACCREDITED",
      "permitExpiry": "2027-03-31",
      "contactPerson": "Ana Reyes",
      "contactPhone": "0917-000-0000",
      "contactEmail": "sales@steelbuild.ph",
      "createdAt": "2026-11-10T02:11:04.000Z",
      "updatedAt": "2026-11-10T02:11:04.000Z",
      "locations": [
        {
          "id": 1,
          "name": "Main Yard",
          "locationType": "Warehouse",
          "organizationId": 1,
          "address1": "12 Industrial Rd",
          "address2": null,
          "city": "Makati",
          "stateOrProvince": "Metro Manila",
          "postalCode": "1200",
          "country": "Philippines"
        }
      ]
    }
  ]
}
```

---

### `GET /api/integration/orders`

Purchase orders with line items. Use this for **incoming deliveries** visibility and
for **Accounting** payables matching.

**Auth:** API key (`reader`)

**Query parameters**

| Name | Type | Description |
|---|---|---|
| `status` | string | Optional. One of `PENDING`, `APPROVED`, `PLACED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED` |

**Response `200`**

```json
{
  "source": "RektaBuild-Supplier",
  "exportedAt": "2026-11-22T15:17:36.919Z",
  "count": 1,
  "data": [
    {
      "id": 4,
      "orderNumber": "PO-1762000000000",
      "name": "Site A Rebar & Cement Batch 1",
      "description": null,
      "supplierId": 1,
      "status": "PLACED",
      "orderedById": null,
      "approvedById": null,
      "dateOrdered": "2026-11-01",
      "dateApproved": "2026-11-02",
      "expectedDeliveryDate": "2026-11-10",
      "projectSite": "Site A - Makati Tower",
      "paymentTerms": "Net 30",
      "comments": null,
      "createdAt": "2026-11-01T03:00:00.000Z",
      "updatedAt": "2026-11-02T03:00:00.000Z",
      "supplier": {
        "id": 1,
        "code": "SUP-001",
        "name": "SteelBuild Aggregates Inc.",
        "tin": "000-123-456-000",
        "paymentTerms": "Net 30"
      },
      "items": [
        {
          "id": 9,
          "orderId": 4,
          "productId": 2,
          "productSupplierId": 3,
          "quantity": 100,
          "unitPrice": "250.00",
          "quantityReceived": 60,
          "product": {
            "id": 2,
            "productCode": "CEM-001",
            "name": "Portland Cement 40kg",
            "unitOfMeasure": "BAG"
          }
        }
      ]
    }
  ]
}
```

---

### `GET /api/integration/receipts`

Goods receipts with per-item accepted and rejected quantities. **This is the endpoint
the Inventory module must call for stock-in.** Use `quantityReceived` (accepted only);
never post `quantityRejected` into stock.

Receipts are **finalized at creation** — the module has no update or delete path
for them. Each exported row is a complete, immutable record of what was accepted
and rejected. Every row carries `"finalized": true` and a `receiptId` field
(aliases `id`) so consumers can rely on them for one-time stock-in ingestion.

**Auth:** API key (`reader`)

**Query parameters:** none

**Response `200`**

```json
{
  "source": "RektaBuild-Supplier",
  "exportedAt": "2026-11-22T15:17:36.919Z",
  "count": 1,
  "data": [
    {
      "id": 7,
      "receiptId": 7,
      "finalized": true,
      "receiptNumber": "RCT-1762000000000",
      "orderId": 4,
      "shipmentNumber": "SHP-001",
      "receivedById": null,
      "dateReceived": "2026-11-09",
      "comments": "Second delivery",
      "createdAt": "2026-11-09T06:00:00.000Z",
      "updatedAt": "2026-11-09T06:00:00.000Z",
      "order": {
        "id": 4,
        "orderNumber": "PO-1762000000000",
        "projectSite": "Site A - Makati Tower",
        "supplierId": 1,
        "status": "PARTIALLY_RECEIVED"
      },
      "items": [
        {
          "id": 11,
          "receiptId": 7,
          "orderItemId": 9,
          "productId": 2,
          "quantityReceived": 60,
          "quantityRejected": 4,
          "inspectionStatus": "PARTIAL_REJECT",
          "qtyMatchesPo": true,
          "packagingIntact": false,
          "specsCorrect": true,
          "noVisibleDamage": true,
          "comment": "4 bags torn",
          "product": {
            "id": 2,
            "productCode": "CEM-001",
            "name": "Portland Cement 40kg",
            "unitOfMeasure": "BAG"
          }
        }
      ]
    }
  ]
}
```

`inspectionStatus` enum: `ACCEPTED` | `PARTIAL_REJECT` | `REJECTED`. The status is
derived server-side from the accepted/rejected quantities **and** the standardized
inspection checklist (AS-IS P7): all four checks must pass for `ACCEPTED`; any
failed check with accepted quantity yields `PARTIAL_REJECT`.

Checklist fields on `items[]` (all `boolean | null` — `null` means the check was
not recorded, e.g. receipts created before the checklist existed):

| Field | Check |
|---|---|
| `qtyMatchesPo` | Delivered quantity matches the PO line |
| `packagingIntact` | Packaging is undamaged/sealed |
| `specsCorrect` | Product matches ordered specs |
| `noVisibleDamage` | No visible defects on the goods |

Checklist values are informational for consumers — stock-in should still use only
`quantityReceived`/`quantityRejected`.

---

### `GET /api/suppliers/:id/product-sources`

Internal helper used by the purchase order form to auto-fill pricing. Accepts a
logged-in web session **or** an API key. Not intended for cross-module integration.

**Auth:** session or API key

**Response `200`** — array of product source rows with the related `product`.

---

## Pagination

**None.** All integration endpoints return the complete result set with a `count`
field. Consumers with large datasets should filter by `status` (orders) or cache
locally. If the dataset grows, add `?page=&limit=` in a future version — do not
assume it exists today.

## Which endpoint to call

| Consumer need | Endpoint |
|---|---|
| Supplier master, TIN, payment terms, addresses | `GET /api/integration/suppliers` |
| Purchase orders, expected delivery, project site | `GET /api/integration/orders` |
| Stock-in quantities (accepted/rejected) per receipt | `GET /api/integration/receipts` |
| Product identity for joining (`productId`, `productCode`, `unitOfMeasure`) | Embedded in `orders.items[].product` and `receipts.items[].product` |
| Liveness / uptime | `GET /health` |

## Verification commands

```bash
# 1. Health (no auth)
curl -sS https://<DOMAIN>/health

# 2. Authenticated read-only call
curl -sS -H "Authorization: Bearer rbk_<KEY>" \
  https://<DOMAIN>/api/integration/suppliers

# 3. Expected 401 without a key
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://<DOMAIN>/api/integration/orders
```

## Cross-module integration

This document covers the endpoints **other modules call on Supply**. For the
reverse direction — Supply calling the Inventory module's `/api/v1` API — see
[`deploy/INTEGRATION.md`](deploy/INTEGRATION.md), which also records the product
mapping contract and the proposed ownership split.

## Key lifecycle

1. An admin signs in and opens **API Keys** (`/api-keys`).
2. A key is created with a name, role (`reader`/`writer`), and optional expiry.
3. The plaintext key is shown **once** — copy it and share it privately.
4. The consumer sends it via `Authorization: Bearer ...` or `X-API-Key`.
5. To stop access, press **Revoke**. The consumer immediately receives `401`.
   **Disable** is reversible; **Revoke** records `revokedAt`.
