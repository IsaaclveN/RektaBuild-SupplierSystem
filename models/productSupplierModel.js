import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Mirrors OpenBoxes ProductSupplier.groovy (+ ProductPrice/ProductPackage fields).
// Links a product to a supplier organization with sourcing terms.
export const ProductSupplier = sequelize.define("ProductSupplier", {
  productId: { type: DataTypes.INTEGER, allowNull: false },
  supplierId: { type: DataTypes.INTEGER, allowNull: false },
  code: { type: DataTypes.STRING },
  supplierCode: { type: DataTypes.STRING },
  name: { type: DataTypes.STRING },
  manufacturer: { type: DataTypes.STRING },
  manufacturerCode: { type: DataTypes.STRING },
  minOrderQuantity: { type: DataTypes.INTEGER },
  standardLeadTimeDays: { type: DataTypes.INTEGER },
  packagePrice: { type: DataTypes.DECIMAL(10, 2) },
  contractPrice: { type: DataTypes.DECIMAL(10, 2) },
  contractPriceValidUntil: { type: DataTypes.DATEONLY },
  tieredPricing: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdById: { type: DataTypes.INTEGER },
  updatedById: { type: DataTypes.INTEGER }
});
export { sequelize };
