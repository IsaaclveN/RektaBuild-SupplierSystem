import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Mirrors OpenBoxes Location.groovy + Address.groovy.
// A location is linked to an organization and stores its address inline.
export const Location = sequelize.define("Location", {
  name: { type: DataTypes.STRING, allowNull: false },
  locationType: { type: DataTypes.STRING, defaultValue: "Office" },
  organizationId: { type: DataTypes.INTEGER, allowNull: false },
  address1: { type: DataTypes.STRING },
  address2: { type: DataTypes.STRING },
  city: { type: DataTypes.STRING },
  stateOrProvince: { type: DataTypes.STRING },
  postalCode: { type: DataTypes.STRING },
  country: { type: DataTypes.STRING }
});
export { sequelize };
