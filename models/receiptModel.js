import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Mirrors OpenBoxes Receipt.groovy / ReceiptItem.groovy.
// Supports partial receiving; receipt items carry a comment field for item quality.
export const Receipt = sequelize.define("Receipt", {
  receiptNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  shipmentNumber: { type: DataTypes.STRING },
  receivedById: { type: DataTypes.INTEGER },
  dateReceived: { type: DataTypes.DATEONLY },
  comments: { type: DataTypes.TEXT }
});

export const ReceiptItem = sequelize.define("ReceiptItem", {
  receiptId: { type: DataTypes.INTEGER, allowNull: false },
  orderItemId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantityReceived: { type: DataTypes.INTEGER, allowNull: false },
  quantityRejected: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  inspectionStatus: {
    type: DataTypes.ENUM("ACCEPTED", "PARTIAL_REJECT", "REJECTED"),
    allowNull: false,
    defaultValue: "ACCEPTED"
  },
  // Standardized per-item inspection checklist (AS-IS P7). Nullable: NULL means
  // the check was not recorded (e.g. receipts created before the checklist).
  qtyMatchesPo: { type: DataTypes.BOOLEAN },
  packagingIntact: { type: DataTypes.BOOLEAN },
  specsCorrect: { type: DataTypes.BOOLEAN },
  noVisibleDamage: { type: DataTypes.BOOLEAN },
  comment: { type: DataTypes.STRING }
});
export { sequelize };
