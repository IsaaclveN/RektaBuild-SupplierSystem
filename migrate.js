
import { Sequelize } from "sequelize";
import { sequelize } from "./models/db.js";
import { User } from "./models/userModel.js";
import {
  Organization, Location, Product, ProductSupplier,
  PreferenceType, ProductSupplierPreference,
  Order, OrderItem, Receipt, ReceiptItem, Document,
} from "./models/index.js";
import inquirer from "inquirer";

// DESTRUCTIVE: this script drops and recreates every table.
// Use scripts/db-setup.js for non-destructive setup on existing databases.
if (process.env.NODE_ENV === "production" && !process.argv.includes("--force-destroy")) {
  console.error(
    "Refusing to run the destructive migration with NODE_ENV=production.\n" +
    "Use 'npm run db:setup' instead. To override deliberately, pass --force-destroy."
  );
  process.exit(1);
}

const rootSequelize = new Sequelize("mysql://root:@localhost:3306/", {
  logging: process.env.DB_LOGGING === "true" ? console.log : false,
});

const { createDb } = await inquirer.prompt([
  {
    type: "confirm",
    name: "createDb",
    message: "Database 'Rektadb' may not exist. Create it?",
    default: true,
  },
]);

if (createDb) {
  await rootSequelize.query("CREATE DATABASE IF NOT EXISTS Rektadb;");
  console.log("✅ Database created (if it did not exist)");
}

try {
  await sequelize.authenticate();
  console.log("✅ Connected to MySQL database!");
  await sequelize.sync({ force: true });
  console.log("✅ Tables created for all models!");

  // Seed preference types (mirrors OpenBoxes PreferenceType: e.g. Preferred, Contract)
  await PreferenceType.bulkCreate([
    { code: "PREFERRED", name: "Preferred", description: "Preferred supplier for this product" },
    { code: "CONTRACT", name: "Contract", description: "Supplier under contract pricing" },
    { code: "BACKUP", name: "Backup", description: "Backup/alternate source" },
  ]);
  console.log("✅ Preference types seeded!");
} catch (err) {
  console.error("❌ Migration failed:", err);
} finally {
  process.exit();
}
