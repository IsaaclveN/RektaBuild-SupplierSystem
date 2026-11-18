import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Mirrors OpenBoxes Order.groovy / OrderItem.groovy for purchase orders.
// Statuses follow the PO lifecycle: PENDING -> APPROVED -> PLACED ->
// PARTIALLY_RECEIVED -> RECEIVED (or CANCELLED).
export const Order = sequelize.define("Order", {
  orderNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  supplierId: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM("PENDING", "APPROVED", "PLACED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"),
    allowNull: false,
    defaultValue: "PENDING"
  },
  orderedById: { type: DataTypes.INTEGER },
  approvedById: { type: DataTypes.INTEGER },
  dateOrdered: { type: DataTypes.DATEONLY },
  dateApproved: { type: DataTypes.DATEONLY },
  expectedDeliveryDate: { type: DataTypes.DATEONLY },
  projectSite: { type: DataTypes.STRING },
  paymentTerms: { type: DataTypes.STRING },
  comments: { type: DataTypes.TEXT }
});

export const OrderItem = sequelize.define("OrderItem", {
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  productSupplierId: { type: DataTypes.INTEGER },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  unitPrice: { type: DataTypes.DECIMAL(10, 2) },
  quantityReceived: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
});
export { sequelize };
