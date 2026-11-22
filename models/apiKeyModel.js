import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// API keys used by other ERP modules (Inventory, Accounting) to read data over
// HTTP. Only the SHA-256 hash and a short display prefix are stored; the
// plaintext key is shown once at creation and never persisted.
export const ApiKey = sequelize.define("ApiKey", {
  name: { type: DataTypes.STRING, allowNull: false },
  keyPrefix: { type: DataTypes.STRING(16), allowNull: false },
  keyHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  role: {
    type: DataTypes.ENUM("reader", "writer"),
    allowNull: false,
    defaultValue: "reader"
  },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  lastUsedAt: { type: DataTypes.DATE },
  expiresAt: { type: DataTypes.DATEONLY },
  revokedAt: { type: DataTypes.DATE },
  createdById: { type: DataTypes.INTEGER }
});

export { sequelize };
