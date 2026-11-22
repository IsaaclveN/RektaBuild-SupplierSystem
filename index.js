/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import express from "express";
import path from "path";
import session from "express-session";
import SequelizeStoreFactory from "connect-session-sequelize";
import flash from "connect-flash";
import helmet from "helmet";
import cors from "cors";
import router from "./routes/index.js";
import fs from 'fs';
import hbs from "hbs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";
import { sequelize } from "./models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
// Behind Nginx every request arrives from the proxy, so trust the first hop to
// make secure cookies and req.ip behave correctly.
const HOST = process.env.HOST || (isProduction ? "127.0.0.1" : "0.0.0.0");

const SESSION_SECRET = process.env.SESSION_SECRET ||
  (isProduction ? null : "xianfire-dev-secret");
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set when NODE_ENV=production.");
}

app.set("trust proxy", 1);

app.use(helmet({
  // Inline theme bootstrap and Tailwind's CDN require a permissive policy here.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS is limited to the API surface and to an explicit allowlist. Never "*".
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (allowedOrigins.length) {
  app.use("/api", cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "X-API-Key", "Content-Type"],
    maxAge: 600,
  }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

// Persistent session store so logins survive restarts and multiple processes.
const SequelizeStore = SequelizeStoreFactory(session.Store);
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: "Sessions",
});
sessionStore.sync().catch((err) => {
  console.error("Could not initialise the session store:", err.message);
});

app.use(session({
  secret: SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000,
  },
}));
app.use(flash());

app.engine("xian", async (filePath, options, callback) => {
  try {
     const originalPartialsDir = hbs.partialsDir;
    hbs.partialsDir = path.join(__dirname, 'views');

    const result = await new Promise((resolve, reject) => {
      hbs.__express(filePath, options, (err, html) => {
        if (err) return reject(err);
        resolve(html);
      });
    });

    hbs.partialsDir = originalPartialsDir;
    callback(null, result);
  } catch (err) {
    callback(err);
  }
});
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.currentPath = req.path;
  next();
});


hbs.registerHelper("eq", (a, b) => a === b);
hbs.registerHelper("navActive", (currentPath, targetPath) => {
  if (!currentPath) return false;
  if (targetPath === "/dashboard") return currentPath === "/dashboard";
  if (targetPath.endsWith("/new")) return currentPath === targetPath;
  if (currentPath === targetPath) return true;
  return currentPath.startsWith(targetPath + "/") && !currentPath.endsWith("/new");
});
hbs.registerHelper("formatDate", (d) => {
  if (!d) return "—";
  const date = new Date(d);
  return isNaN(date) ? "—" : date.toISOString().slice(0, 10);
});
hbs.registerHelper("multiply", (a, b) => ((parseFloat(a) || 0) * (parseFloat(b) || 0)).toFixed(2));
hbs.registerHelper("money", (v) => (v === null || v === undefined || v === "" ? "—" : `₱${parseFloat(v).toFixed(2)}`));
hbs.registerHelper("remaining", (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
hbs.registerHelper("statusClass", (s) => ({
  PENDING: "badge-amber",
  APPROVED: "badge-teal",
  PLACED: "badge-slate",
  PARTIALLY_RECEIVED: "badge-amber",
  RECEIVED: "badge-green",
  CANCELLED: "badge-red",
}[s] || "badge-slate"));
hbs.registerHelper("accredClass", (s) => ({
  ACCREDITED: "badge-green",
  PENDING: "badge-amber",
  PROBATION: "badge-amber",
  BLACKLISTED: "badge-red",
}[s] || "badge-slate"));
hbs.registerHelper("inspectClass", (s) => ({
  ACCEPTED: "badge-green",
  PARTIAL_REJECT: "badge-amber",
  REJECTED: "badge-red",
}[s] || "badge-slate"));
hbs.registerHelper("gradeClass", (s) => ({
  OUTSTANDING: "badge-green",
  GOOD: "badge-teal",
  FAIR: "badge-amber",
  POOR: "badge-red",
  NO_DATA: "badge-slate",
}[s] || "badge-slate"));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");
const partialsDir = path.join(__dirname, "views/partials");
fs.readdir(partialsDir, (err, files) => {
  if (err) {
    console.error("❌ Could not read partials directory:", err);
    return;
  }

   files
    .filter(file => file.endsWith('.xian'))
    .forEach(file => {
      const partialName = file.replace('.xian', ''); 
      const fullPath = path.join(partialsDir, file);

      fs.readFile(fullPath, 'utf8', (err, content) => {
        if (err) {
          console.error(`❌ Failed to read partial: ${file}`, err);
          return;
        }
        hbs.registerPartial(partialName, content);
        
      });
    });
});

app.use("/", router);

export default app;

// Start the HTTP server; resolves once the server is listening.
// Exported so the Electron main process can control startup itself.
export const startServer = (port = PORT) => {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST, () => {
      console.log(`🔥 XianFire running at http://${HOST}:${port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
};

// Auto-start when executed directly (node index.js) or when supervised by PM2.
// PM2 fork mode runs ProcessContainerFork.js as the entry, so process.argv[1]
// never matches this module; PM2_HOME/pm_id is used to detect that case.
// When imported by electron/main.js, Electron manages the server lifecycle.
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const isSupervised = Boolean(process.env.pm_id || process.env.PM2_HOME);

if ((isDirectRun || isSupervised) && !process.env.XIAN_ELECTRON) {
  startServer();
}
