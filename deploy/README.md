# EC2 Deployment Runbook — RektaBuild Supplier

Manual, step-by-step deployment of the Supplier module to its own AWS EC2 instance
running Node.js + PM2 + Nginx + Let's Encrypt.

Nothing here is automated. Run each block yourself and check the output before
continuing.

Replace every placeholder before running:

| Placeholder | Meaning | Example |
|---|---|---|
| `<DOMAIN>` | Public hostname for this module | `supplier.rektabuild.com` |
| `<EC2_PUBLIC_IP>` | Instance public IP | `54.251.x.x` |
| `<EC2_ELASTIC_IP>` | Elastic IP, if attached | `54.251.x.x` |
| `<DB_HOST>` | RDS or MySQL endpoint | `rekta-db.abc123.ap-southeast-1.rds.amazonaws.com` |
| `<DB_NAME>` | Database name | `Rektadb` |
| `<DB_USER>` | Application DB user | `rekta_app` |
| `<DB_PASS>` | Application DB password | *(secret)* |
| `<SESSION_SECRET>` | 48-byte hex string | *(secret)* |
| `<REPO_URL>` | Git remote | `https://github.com/IsaaclveN/RektaBuild-SupplierSystem.git` |

---

## 1. DNS

In your DNS provider create:

```
Type: A     Name: supplier     Value: <EC2_ELASTIC_IP>     TTL: 300
```

Wait until it resolves before requesting a certificate:

```bash
dig +short <DOMAIN>
```

## 2. Security Group

| Direction | Port | Source | Purpose |
|---|---|---|---|
| Inbound | 22 | **Your IP only** | SSH |
| Inbound | 80 | `0.0.0.0/0` | HTTP → HTTPS redirect + ACME |
| Inbound | 443 | `0.0.0.0/0` | HTTPS |
| Outbound | all | `0.0.0.0/0` | Package installs, DB, ACME |

**Never** open `3000` or `3306` to the internet. Node listens on `127.0.0.1` and the
database is reached over the private network only.

## 3. Database

### If using RDS

1. Create a MySQL 8 instance in the same VPC and Security Group scope as EC2.
2. Allow inbound `3306` **only** from the EC2 Security Group (not a CIDR).
3. Create a least-privilege application user:

```sql
CREATE DATABASE IF NOT EXISTS `<DB_NAME>` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '<DB_USER>'@'%' IDENTIFIED BY '<DB_PASS>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON `<DB_NAME>`.* TO '<DB_USER>'@'%';
FLUSH PRIVILEGES;
```

Note: `CREATE`/`ALTER`/`INDEX`/`REFERENCES` are needed because the setup script
creates missing tables on first deploy. You may revoke them afterwards if you switch
to versioned migrations.

### If using MySQL on the same EC2

```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation
sudo mysql -e "CREATE DATABASE IF NOT EXISTS \`<DB_NAME>\`;"
```

Then create the same application user, with `'<DB_USER>'@'localhost'`.

Verify connectivity from the app host:

```bash
mysql -h <DB_HOST> -u <DB_USER> -p -e "SELECT 1;" <DB_NAME>
```

## 4. Install runtime

```bash
sudo apt update
sudo apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
sudo npm install -g pm2
```

## 5. Deploy the code

```bash
sudo mkdir -p /var/www /var/log/rekta-supplier
sudo chown -R "$USER":"$USER" /var/www /var/log/rekta-supplier

git clone <REPO_URL> /var/www/rekta-supplier
cd /var/www/rekta-supplier
npm ci --omit=dev
```

`npm ci` uses the committed `package-lock.json` and will not mutate it.

## 6. Production environment file

Create `/var/www/rekta-supplier/.env` (**never commit this file**):

```bash
cat > /var/www/rekta-supplier/.env <<'EOF'
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
SESSION_SECRET=<SESSION_SECRET>
CORS_ORIGIN=https://<DOMAIN>
DB_NAME=<DB_NAME>
DB_USER=<DB_USER>
DB_PASS=<DB_PASS>
DB_HOST=<DB_HOST>
DB_PORT=3306
DB_LOGGING=false
EOF

chmod 600 /var/www/rekta-supplier/.env
```

Generate the session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Note:** `index.js` reads `process.env` directly and does not auto-load `.env`. PM2
must export these variables. Either:

- start PM2 with the env file sourced (step 7, option A), or
- add `require("dotenv").config()` if you decide to add the `dotenv` package.

## 7. First-deployment schema setup

**Do not run `npm run migrate`.** It executes `sequelize.sync({ force: true })` and
drops every table. It also refuses to run when `NODE_ENV=production`.

Run the non-destructive setup instead:

```bash
cd /var/www/rekta-supplier
set -a; source .env; set +a
npm run db:setup
```

Expected output: database present, schema up to date, seed data verified.
This is safe to re-run.

## 8. Start with PM2

**Option A — env file sourced (recommended):**

```bash
cd /var/www/rekta-supplier
set -a; source .env; set +a
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME"
# run the command PM2 prints, then:
pm2 status
```

**Option B — PM2 reads the file through a wrapper:**

```bash
pm2 start ecosystem.config.cjs --env production --update-env
```

Confirm the app answers locally before touching Nginx:

```bash
curl -sS http://127.0.0.1:3000/health
```

Expect `{"status":"ok","db":"up",...}`.

## 9. Nginx

```bash
sudo mkdir -p /var/www/certbot
sudo cp /var/www/rekta-supplier/deploy/nginx/rekta-supplier.conf \
        /etc/nginx/sites-available/rekta-supplier
sudo sed -i 's|<DOMAIN>|<DOMAIN>|g' /etc/nginx/sites-available/rekta-supplier
sudo ln -s /etc/nginx/sites-available/rekta-supplier /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

Before the certificate exists, `nginx -t` will fail on the missing cert paths.
Comment out the `listen 443` block, reload, issue the certificate, then uncomment.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 10. TLS certificate

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --webroot -w /var/www/certbot \
  -d <DOMAIN> --email you@example.com --agree-tos --no-eff-email
```

Then enable the `listen 443` block and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Auto-renewal is installed by the package. Verify:

```bash
sudo systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

## 11. Verification

```bash
# Health through Nginx + TLS
curl -sS https://<DOMAIN>/health

# Redirect check
curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://<DOMAIN>/health

# Create a key in the UI, then:
curl -sS -H "Authorization: Bearer rbk_<KEY>" https://<DOMAIN>/api/integration/suppliers

# Must be 401 without a key
curl -sS -o /dev/null -w "%{http_code}\n" https://<DOMAIN>/api/integration/orders
```

Bundle script:

```bash
chmod +x deploy/scripts/healthcheck.sh
./deploy/scripts/healthcheck.sh https://<DOMAIN>
```

## 12. Logs

```bash
pm2 logs rekta-supplier --lines 100
pm2 describe rekta-supplier
tail -f /var/log/rekta-supplier/out.log
tail -f /var/log/nginx/rekta-supplier.error.log
sudo journalctl -u nginx --since "10 min ago"
```

## 13. Backup before any schema change

```bash
mysqldump -h <DB_HOST> -u <DB_USER> -p \
  --single-transaction --routines --triggers \
  <DB_NAME> > ~/backup-$(date +%F-%H%M).sql
```

Restore:

```bash
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < ~/backup-YYYY-MM-DD-HHMM.sql
```

## 14. Redeploy (code update)

```bash
cd /var/www/rekta-supplier
git pull --ff-only
npm ci --omit=dev
set -a; source .env; set +a
npm run db:setup          # additive only, safe to re-run
pm2 restart rekta-supplier --update-env
curl -sS http://127.0.0.1:3000/health
```

## 15. Rollback

Application:

```bash
cd /var/www/rekta-supplier
git log --oneline -5
git checkout <PREVIOUS_COMMIT>
npm ci --omit=dev
pm2 restart rekta-supplier --update-env
```

Database (only if a schema change must be undone):

```bash
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < ~/backup-YYYY-MM-DD-HHMM.sql
```

Nginx:

```bash
sudo rm /etc/nginx/sites-enabled/rekta-supplier
sudo systemctl reload nginx
```

## 16. Troubleshooting

**PM2 shows `online` but nothing listens on 3000, then the process exits.**
PM2 fork mode runs `ProcessContainerFork.js` as the entry, so a naive
`process.argv[1]` check never matches `index.js`. `index.js` detects PM2 via
`process.env.pm_id` / `process.env.PM2_HOME` and starts the server anyway. If you
see this on an older checkout, update the code (`git pull`) rather than adding a
wrapper script.

**PM2 daemon inherits IDE or agent environment variables.**
If PM2 was first started from an editor or agent shell, the daemon can carry
`ELECTRON_RUN_AS_NODE`, `VSCODE_*`, `WINDSURF_*`, or `NODE_CHANNEL_*` and the app
behaves unexpectedly. Reset it:

```bash
pm2 kill
for v in $(compgen -e); do case "$v" in VSCODE_*|WINDSURF_*|ELECTRON_*|ACP_*|DEVIN_*) unset "$v";; esac; done
unset NODE_CHANNEL_FD NODE_CHANNEL_SERIALIZATION_MODE
pm2 start ecosystem.config.cjs --env production
```

**`bcrypt` fails to load after `npm ci`.**
Newer npm versions gate install scripts. Approve and rebuild:

```bash
npm install-scripts approve bcrypt && npm rebuild bcrypt
```

**`/health` returns `"db":"down"`.**
Check `pm2 logs rekta-supplier --lines 50`, then confirm the `.env` credentials
work: `mysql -u <DB_USER> -p -e "SELECT 1;" <DB_NAME>`.

**Web login does not persist over plain HTTP.**
`NODE_ENV=production` sets `secure` cookies, which browsers only send over HTTPS.
Complete the TLS step before relying on the web UI; API key access is unaffected.

## 17. What must be verified on EC2 (cannot be verified locally)

- TLS issuance and renewal for `<DOMAIN>`
- Nginx syntax with the real certificate paths present
- PM2 startup persistence across reboot
- RDS connectivity, VPC routing, and Security Group rules
- DNS resolution
- Real firewall behavior for ports 80/443/22

Report the output of step 11 back before declaring the deployment successful.
