import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Mirrors OpenBoxes Organization.groovy (ROLE_SUPPLIER).
// code is required + unique; name, description, active flag.
export const Organization = sequelize.define("Organization", {
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  role: {
    type: DataTypes.ENUM("supplier", "manufacturer", "distributor", "customer"),
    allowNull: false,
    defaultValue: "supplier"
  },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  tin: { type: DataTypes.STRING },
  paymentTerms: { type: DataTypes.STRING, defaultValue: "Net 30" },
  accreditationStatus: {
    type: DataTypes.ENUM("PENDING", "ACCREDITED", "PROBATION", "BLACKLISTED"),
    allowNull: false,
    defaultValue: "ACCREDITED"
  },
  permitExpiry: { type: DataTypes.DATEONLY },
  contactPerson: { type: DataTypes.STRING },
  contactPhone: { type: DataTypes.STRING },
  contactEmail: { type: DataTypes.STRING }
});
export { sequelize };
