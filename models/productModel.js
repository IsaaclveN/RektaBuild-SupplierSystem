import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Minimal product catalog needed by product sources and purchase orders.
export const Product = sequelize.define("Product", {
  productCode: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  category: { type: DataTypes.STRING },
  unitOfMeasure: { type: DataTypes.STRING, defaultValue: "EA" },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
});
export { sequelize };
