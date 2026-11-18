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

## Getting Started

Requirements: Node.js and a running MySQL server (XAMPP, Laragon, or standalone).

```bash
npm install
cp .env.example .env      # optional; defaults match a local root/no-password setup
npm run migrate           # creates the Rektadb database, tables, and seed data
npm run dev               # http://localhost:3000
```

> `npm run migrate` runs `sequelize.sync({ force: true })` and **drops all existing
> tables**. Run it only on a fresh setup.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run xian` | Start with nodemon |
| `npm start` | Start without watcher |
| `npm run migrate` | Create database, sync tables, seed preference types |
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

Consumed by the Inventory and Accounting modules over the local network.

| Endpoint | Returns |
|---|---|
| `GET /api/integration/suppliers` | Supplier master data, TIN, payment terms, locations |
| `GET /api/integration/orders` | Purchase orders with items, project site, terms |
| `GET /api/integration/receipts` | Receipts with accepted and rejected quantities per item |

Example from another machine on the same network:

```
http://<host-ip>:3000/api/integration/orders
```

## Configuration

Environment variables (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DB_NAME` | `Rektadb` | Database name |
| `DB_USER` | `root` | MySQL user |
| `DB_PASS` | *(empty)* | MySQL password |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_LOGGING` | `false` | Print SQL queries when `true` |
| `PORT` | `3000` | HTTP port |

## Notes

- Authentication middleware currently passes requests through for demo use.
- To connect from other devices on the same Wi-Fi, allow inbound TCP port `3000`
  in the host machine's firewall.
