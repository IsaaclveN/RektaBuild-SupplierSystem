import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Mirrors OpenBoxes PreferenceType.groovy (e.g. Preferred, Contract).
export const PreferenceType = sequelize.define("PreferenceType", {
  code: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.STRING }
});
export { sequelize };
