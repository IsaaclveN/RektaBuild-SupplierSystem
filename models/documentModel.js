import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Mirrors OpenBoxes documents attached to a purchase order (e.g. canvass files).
export const Document = sequelize.define("Document", {
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  filename: { type: DataTypes.STRING, allowNull: false },
  originalName: { type: DataTypes.STRING },
  filePath: { type: DataTypes.STRING },
  fileSize: { type: DataTypes.INTEGER },
  contentType: { type: DataTypes.STRING },
  uploadedById: { type: DataTypes.INTEGER }
});
export { sequelize };
