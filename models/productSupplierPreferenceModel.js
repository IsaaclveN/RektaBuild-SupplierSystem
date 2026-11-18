import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Mirrors OpenBoxes ProductSupplierPreference.groovy.
// A preference type with validity dates attached to a product source.
export const ProductSupplierPreference = sequelize.define("ProductSupplierPreference", {
  productSupplierId: { type: DataTypes.INTEGER, allowNull: false },
  preferenceTypeId: { type: DataTypes.INTEGER, allowNull: false },
  validityStartDate: { type: DataTypes.DATEONLY },
  validityEndDate: { type: DataTypes.DATEONLY },
  comments: { type: DataTypes.TEXT }
});
export { sequelize };
