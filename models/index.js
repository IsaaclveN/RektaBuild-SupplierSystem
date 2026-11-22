import { sequelize } from "./db.js";
import { User } from "./userModel.js";
import { Organization } from "./organizationModel.js";
import { Location } from "./locationModel.js";
import { Product } from "./productModel.js";
import { ProductSupplier } from "./productSupplierModel.js";
import { PreferenceType } from "./preferenceTypeModel.js";
import { ProductSupplierPreference } from "./productSupplierPreferenceModel.js";
import { Order, OrderItem } from "./orderModel.js";
import { Receipt, ReceiptItem } from "./receiptModel.js";
import { Document } from "./documentModel.js";
import { ApiKey } from "./apiKeyModel.js";

// ─── Associations (mirroring OpenBoxes domain relationships) ────────────────

// Organization -> Locations (supplier addresses)
Organization.hasMany(Location, { foreignKey: "organizationId", as: "locations" });
Location.belongsTo(Organization, { foreignKey: "organizationId", as: "organization" });

// Product sources: Product <-> Organization (supplier)
Product.hasMany(ProductSupplier, { foreignKey: "productId", as: "productSources" });
ProductSupplier.belongsTo(Product, { foreignKey: "productId", as: "product" });
Organization.hasMany(ProductSupplier, { foreignKey: "supplierId", as: "productSources" });
ProductSupplier.belongsTo(Organization, { foreignKey: "supplierId", as: "supplier" });
ProductSupplier.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });
ProductSupplier.belongsTo(User, { foreignKey: "updatedById", as: "updatedBy" });

// Preferences on product sources
ProductSupplier.hasMany(ProductSupplierPreference, { foreignKey: "productSupplierId", as: "preferences" });
ProductSupplierPreference.belongsTo(ProductSupplier, { foreignKey: "productSupplierId", as: "productSupplier" });
PreferenceType.hasMany(ProductSupplierPreference, { foreignKey: "preferenceTypeId", as: "preferences" });
ProductSupplierPreference.belongsTo(PreferenceType, { foreignKey: "preferenceTypeId", as: "preferenceType" });

// Purchase orders
Organization.hasMany(Order, { foreignKey: "supplierId", as: "orders" });
Order.belongsTo(Organization, { foreignKey: "supplierId", as: "supplier" });
Order.belongsTo(User, { foreignKey: "orderedById", as: "orderedBy" });
Order.belongsTo(User, { foreignKey: "approvedById", as: "approvedBy" });
Order.hasMany(OrderItem, { foreignKey: "orderId", as: "items" });
OrderItem.belongsTo(Order, { foreignKey: "orderId", as: "order" });
OrderItem.belongsTo(Product, { foreignKey: "productId", as: "product" });
OrderItem.belongsTo(ProductSupplier, { foreignKey: "productSupplierId", as: "productSupplier" });

// Receiving
Order.hasMany(Receipt, { foreignKey: "orderId", as: "receipts" });
Receipt.belongsTo(Order, { foreignKey: "orderId", as: "order" });
Receipt.belongsTo(User, { foreignKey: "receivedById", as: "receivedBy" });
Receipt.hasMany(ReceiptItem, { foreignKey: "receiptId", as: "items" });
ReceiptItem.belongsTo(Receipt, { foreignKey: "receiptId", as: "receipt" });
ReceiptItem.belongsTo(OrderItem, { foreignKey: "orderItemId", as: "orderItem" });
ReceiptItem.belongsTo(Product, { foreignKey: "productId", as: "product" });

// Documents on purchase orders
Order.hasMany(Document, { foreignKey: "orderId", as: "documents" });
Document.belongsTo(Order, { foreignKey: "orderId", as: "order" });
Document.belongsTo(User, { foreignKey: "uploadedById", as: "uploadedBy" });

// API keys for cross-module integration
ApiKey.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });

export {
  sequelize, User, Organization, Location, Product, ProductSupplier,
  PreferenceType, ProductSupplierPreference, Order, OrderItem,
  Receipt, ReceiptItem, Document, ApiKey
};
