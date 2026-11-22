import { Sequelize } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  PreferenceType,
} from "../models/index.js";

// Non-destructive schema setup. Creates missing tables and seeds reference rows
// without dropping or altering existing data. Safe to run repeatedly.

const DB_NAME = process.env.DB_NAME || "Rektadb";
const DB_USER = process.env.DB_USER || "root";
const DB_PASS = process.env.DB_PASS || "";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT) || 3306;

const PREFERENCE_TYPES = [
  { code: "PREFERRED", name: "Preferred", description: "Preferred supplier for this product" },
  { code: "CONTRACT", name: "Contract", description: "Supplier under contract pricing" },
  { code: "BACKUP", name: "Backup", description: "Backup/alternate source" },
];

const run = async () => {
  // 1. Make sure the database itself exists.
  const admin = new Sequelize("mysql://root:@localhost:3306/", {
    logging: process.env.DB_LOGGING === "true" ? console.log : false,
  });
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
    console.log(`Database "${DB_NAME}" is present.`);
  } catch (err) {
    console.warn(`Could not verify the database (${err.message}). Continuing.`);
  } finally {
    await admin.close().catch(() => {});
  }

  // 2. Create missing tables. No force, no alter — existing data is untouched.
  await sequelize.authenticate();
  await sequelize.sync();
  console.log("Schema is up to date (non-destructive).");

  // 3. Idempotent seed of preference types.
  for (const row of PREFERENCE_TYPES) {
    const [record, created] = await PreferenceType.findOrCreate({
      where: { code: row.code },
      defaults: row,
    });
    if (created) console.log(`Seeded preference type ${record.code}.`);
  }
  console.log("Seed data verified.");

  console.log(`Target: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);
};

try {
  await run();
  console.log("Database setup complete.");
  process.exit(0);
} catch (err) {
  console.error("Database setup failed:", err.message);
  process.exit(1);
}
