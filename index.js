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
import flash from "connect-flash";
import router from "./routes/index.js";
import fs from 'fs';
import hbs from "hbs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

app.use(session({
  secret: "xianfire-secret-key",
  resave: false,
  saveUninitialized: false
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
    const server = app.listen(port, () => {
      console.log(`🔥 XianFire running at http://localhost:${port}`);
      resolve(server);
    });
    server.on("error", reject);
  });
};

// Auto-start only when executed directly (node index.js).
// When imported by electron/main.js, Electron manages the server lifecycle.
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun && !process.env.XIAN_ELECTRON) {
  startServer();
}
