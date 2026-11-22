# RektaBuild — Supplier Management System

Supplier and procurement module of the RektaBuild ERP, built on the XianFire framework
(Express + `.xian`/Handlebars templates + Sequelize/MySQL).

It owns the procure-to-pay cycle: supplier master data, product sourcing terms,
purchase orders with approval, receiving with quality inspection, monthly reporting,
and JSON endpoints consumed by the Inventory and Accounting modules.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Server | Express 4 |
| Templating | XianFire `.xian` (Handlebars via `hbs`) |
| ORM | Sequelize 6 |
| Database | MySQL |
| Sessions | express-session + connect-flash |
| Uploads | multer |

No front-end framework and no chart library — the UI uses custom CSS and native SVG.

## Features

**Supplier master**
- Organization code, name, role (supplier / manufacturer / distributor), active flag
- TIN, payment terms, accreditation status (accredited / pending / probation / blacklisted)
- Business permit expiry, contact person, phone, email
- Multiple locations and addresses per supplier

**Product sources**
- Supplier-specific product code, manufacturer, MOQ, standard lead time
- Package price, contract price with validity date, tiered pricing flag
- Preference types (Preferred / Contract / Backup) with validity ranges
- CSV export and bulk import

**Purchase orders**
- Line items with auto-filled pricing from the selected supplier's sources
- Project / delivery site, expected delivery date, payment terms
- Approval workflow: `PENDING → APPROVED → PLACED → PARTIALLY_RECEIVED → RECEIVED` (`CANCELLED` at any open stage)
- Document attachments and comments
- Printable purchase order slip (browser print / save as PDF)

**Receiving**
- Partial receiving against open orders
- Per-item accepted and rejected quantities with automatic inspection status
- Automatic order status recalculation
- Printable goods receipt and inspection slip

**Reporting**
- Monthly reports with month selector and full history of past months
- Purchase orders, supplier compliance, and receiving/quality report types
- Monthly activity graph rendered from actual records
- Print / save as PDF layout

**Supplier performance**
- Automatically computed from transaction history — no manual rating
- On-time delivery percentage (receipt date vs. expected delivery date)
- Quality acceptance percentage (accepted vs. rejected quantities)
- Derived grade: `OUTSTANDING`, `GOOD`, `FAIR`, `POOR`, or `NO_DATA`

**Integration and operations**
- API keys issued from `/api-keys`; only SHA-256 hashes are stored
- `Authorization: Bearer rbk_...` or `X-API-Key` for cross-module calls
- Role-scoped keys: `reader` (GET only) and `writer`
- Unauthenticated `GET /health` liveness probe
- Persistent MySQL session store, Helmet security headers, explicit CORS allowlist
- Non-destructive `npm run db:setup` for existing databases

## Getting Started

Requirements: Node.js and a running MySQL server (XAMPP, Laragon, or standalone).

```bash
npm install
cp .env.example .env      # optional; defaults match a local root/no-password setup
npm run migrate           # creates the Rektadb database, tables, and seed data
npm run dev               # http://localhost:3000
```

> `npm run migrate` runs `sequelize.sync({ force: true })` and **drops all existing
> tables**. Run it only on a fresh setup. For an existing database use
> `npm run db:setup`, which creates missing tables and seeds reference rows without
> touching existing data. The destructive script also refuses to run when
> `NODE_ENV=production`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run xian` | Start with nodemon |
| `npm start` | Start without watcher |
| `npm run db:setup` | Non-destructive schema + seed setup (safe to re-run) |
| `npm run migrate` | Destructive reset: create database, drop and recreate tables |
| `npm run route:list` | Print all registered routes |

## Project Structure

```
controllers/    Request handlers grouped by domain
models/         Sequelize models and associations
routes/         Express router
views/          .xian pages and partials (head, nav, footer)
public/         app.css and app.js (theme, charts, tables, command palette)
middleware/     Auth and upload handling
utils/          Supplier performance computation
migrate.js      Database bootstrap
index.js        App setup, helpers, partial registration, server start
```

## Integration API

Consumed by the Inventory and Accounting modules over the local network or HTTPS.
Full contract, payloads, and error shapes: [API.md](API.md).

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /health` | none | `{ status, db, uptime, version, timestamp }` |
| `GET /api/integration/suppliers` | API key | Supplier master data, TIN, payment terms, locations |
| `GET /api/integration/orders` | API key | Purchase orders with items, project site, terms |
| `GET /api/integration/receipts` | API key | Receipts with accepted and rejected quantities per item |

```bash
curl -H "Authorization: Bearer rbk_<KEY>" https://<domain>/api/integration/orders
```

Issue and revoke keys from the **API Keys** page (`/api-keys`). The plaintext key is
shown once; only its SHA-256 hash is stored.

## Deployment

AWS EC2 with Node.js, PM2, Nginx, and Let's Encrypt. The manual runbook, including
DNS, Security Groups, database setup, certificates, and rollback, is in
[deploy/README.md](deploy/README.md).

Supporting files:

| File | Purpose |
|---|---|
| `ecosystem.config.cjs` | PM2 process definition with a production environment |
| `deploy/nginx/rekta-supplier.conf` | Nginx reverse proxy and TLS termination |
| `deploy/scripts/healthcheck.sh` | Curl-based health probe |

## Configuration

Environment variables (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` on EC2 |
| `PORT` | `3000` | Internal HTTP port |
| `HOST` | `0.0.0.0` dev / `127.0.0.1` prod | Bind address |
| `SESSION_SECRET` | dev-only fallback | **Required** when `NODE_ENV=production` |
| `AUTH_BYPASS` | active outside production | `false` forces the login check in development |
| `COOKIE_SECURE` | `true` in production | Set `false` for a plain-HTTP deployment; otherwise login cannot persist |
| `CORS_ORIGIN` | *(empty)* | Comma-separated allowlist for `/api/*`; never `*` |
| `DB_NAME` | `Rektadb` | Database name |
| `DB_USER` | `root` | MySQL user |
| `DB_PASS` | *(empty)* | MySQL password |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_LOGGING` | `false` | Print SQL queries when `true` |

## Notes

- The web session check is bypassed outside production so the demo stays usable.
  In production it is enforced automatically; set `AUTH_BYPASS=false` to enforce it
  locally too.
- Production session cookies are `secure`, so the web UI requires HTTPS (a domain
  plus Certbot). API key access works over HTTP. For an IP-only deployment set
  `COOKIE_SECURE=false` to allow login over plain HTTP — the session cookie is then
  transmitted unencrypted, so prefer HTTPS.
- Sessions are stored in MySQL (`Sessions` table) and survive restarts.
- The server auto-starts when run directly (`node index.js`) or under PM2.
- To connect from other devices on the same Wi-Fi, allow inbound TCP port `3000`
  in the host machine's firewall. On EC2, only Nginx exposes `80`/`443`.
