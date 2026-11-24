# Agent Notes — RektaBuild Supplier

## Commit and push after every change

Uncommitted work on the EC2 host is easily lost. After any code change:

```bash
git add -A
git commit -m "<what changed and why>"
git push origin main
```

Then deploy on the server:

```bash
cd /var/www/rekta-supplier && git pull --ff-only
set -a; . ./.env; set +a
pm2 restart rekta-supplier --update-env
```

## Never edit source on the production host

Changes made directly in `/var/www/rekta-supplier` are not versioned and block
`git pull`. Make changes in the repo, commit, push, then pull on the server.

## Database changes

- `npm run migrate` is destructive (`sync({ force: true })`) and refuses to run
  with `NODE_ENV=production`. Do not use it outside a fresh local setup.
- `npm run db:setup` is the safe path: creates missing tables, adds new nullable
  columns with `ADD COLUMN`, and seeds reference rows idempotently.
- New columns must be added to both the model and the `ADDITIVE_COLUMNS` list in
  `scripts/db-setup.js`; plain `sync()` never alters existing tables.

## Production environment

- `.env` lives only on the server, `chmod 600`, never committed.
- `SESSION_SECRET` is required when `NODE_ENV=production`.
- Session cookies are `Secure`; the site is served over HTTPS
  (`rekta-supplier.petcareplus.tech`). Do not set `COOKIE_SECURE=false` while
  HTTPS is active.
- PM2 keeps stale environment variables across `--update-env`. If a variable was
  removed from `.env`, use `pm2 delete` + `pm2 start` so the process env is rebuilt.
- Verify the running env with:
  `sudo tr '\0' '\n' < /proc/$(pgrep -f '/var/www/rekta-supplier/index.js' | head -1)/environ`

## API keys

- Issued from `/api-keys`; only the SHA-256 hash is stored.
- Header: `Authorization: Bearer rbk_...` or `X-API-Key`.
- `reader` = GET only, `writer` = also mutating methods.

## Verification commands

```bash
node --check <changed files>
npm test                                  # node:test suite
curl -s https://rekta-supplier.petcareplus.tech/health
curl -s -o /dev/null -w "%{http_code}\n" https://rekta-supplier.petcareplus.tech/api/integration/orders  # expect 401
pm2 logs rekta-supplier --lines 30 --nostream
```
