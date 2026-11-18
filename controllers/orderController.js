import fs from "node:fs";
import {
  sequelize, Organization, Location, Product, ProductSupplier,
  Order, OrderItem, Receipt, ReceiptItem, Document, User,
} from "../models/index.js";
await sequelize.sync();

const toArray = (v) => (Array.isArray(v) ? v : v !== undefined ? [v] : []);

const loadOrder = (id) => Order.findByPk(id, {
  include: [
    { model: Organization, as: "supplier", include: [{ model: Location, as: "locations" }] },
    { model: User, as: "orderedBy", attributes: ["id", "name"] },
    { model: User, as: "approvedBy", attributes: ["id", "name"] },
    {
      model: OrderItem, as: "items",
      include: [
        { model: Product, as: "product" },
        { model: ProductSupplier, as: "productSupplier" },
      ],
    },
    { model: Document, as: "documents", include: [{ model: User, as: "uploadedBy", attributes: ["id", "name"] }] },
    { model: Receipt, as: "receipts", include: [{ model: ReceiptItem, as: "items" }] },
  ],
});

// ─── Purchase Orders — mirrors OpenBoxes Order + approval ───────────────────

export const orderListPage = async (req, res) => {
  const orders = await Order.findAll({
    include: [{ model: Organization, as: "supplier" }],
    order: [["id", "DESC"]],
  });
  res.render("orders/index", { title: "Purchase Orders", orders });
};

export const newOrderPage = async (req, res) => {
  const [suppliers, products] = await Promise.all([
    Organization.findAll({ where: { active: true, role: "supplier" }, order: [["name", "ASC"]] }),
    Product.findAll({ where: { active: true }, order: [["name", "ASC"]] }),
  ]);
  res.render("orders/new", { title: "New Purchase Order", suppliers, products });
};

export const createOrder = async (req, res) => {
  const b = req.body;
  const productIds = toArray(b.productId);
  const quantities = toArray(b.quantity);
  const unitPrices = toArray(b.unitPrice);
  const sourceIds = toArray(b.productSupplierId);

  const items = productIds
    .map((pid, i) => ({
      productId: pid,
      quantity: parseInt(quantities[i], 10),
      unitPrice: unitPrices[i] || null,
      productSupplierId: sourceIds[i] || null,
    }))
    .filter((it) => it.productId && it.quantity > 0);

  if (!items.length) {
    req.flash("error_msg", "Add at least one item with a valid quantity.");
    return res.redirect("/orders/new");
  }

  const supplier = await Organization.findByPk(b.supplierId);
  const order = await Order.create({
    orderNumber: `PO-${Date.now()}`,
    name: b.name,
    description: b.description,
    supplierId: b.supplierId,
    projectSite: b.projectSite || null,
    expectedDeliveryDate: b.expectedDeliveryDate || null,
    paymentTerms: b.paymentTerms || (supplier ? supplier.paymentTerms : null),
    comments: b.comments,
    status: "PENDING",
    orderedById: req.session.userId,
    dateOrdered: new Date(),
  });
  await OrderItem.bulkCreate(items.map((it) => ({ ...it, orderId: order.id })));

  req.flash("success_msg", `Purchase order ${order.orderNumber} created (pending approval).`);
  res.redirect(`/orders/${order.id}`);
};

export const showOrderPage = async (req, res) => {
  const order = await loadOrder(req.params.id);
  if (!order) {
    req.flash("error_msg", "Order not found.");
    return res.redirect("/orders");
  }
  const grandTotal = order.items.reduce(
    (sum, it) => sum + it.quantity * (parseFloat(it.unitPrice) || 0), 0
  );
  res.render("orders/show", { title: order.orderNumber, order, grandTotal });
};

export const printOrderPage = async (req, res) => {
  const order = await loadOrder(req.params.id);
  if (!order) {
    req.flash("error_msg", "Order not found.");
    return res.redirect("/orders");
  }
  const grandTotal = order.items.reduce(
    (sum, it) => sum + it.quantity * (parseFloat(it.unitPrice) || 0), 0
  );
  res.render("orders/print", {
    title: `Print PO ${order.orderNumber}`,
    order,
    grandTotal,
    generatedAt: new Date().toISOString().slice(0, 10),
  });
};

// PO approval — mirrors openboxes.purchasing.approval
export const approveOrder = async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  if (!order || order.status !== "PENDING") {
    req.flash("error_msg", "Only pending orders can be approved.");
    return res.redirect(`/orders/${req.params.id}`);
  }
  await order.update({
    status: "APPROVED",
    approvedById: req.session.userId,
    dateApproved: new Date(),
  });
  req.flash("success_msg", "Order approved.");
  res.redirect(`/orders/${order.id}`);
};

export const placeOrder = async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  if (!order || order.status !== "APPROVED") {
    req.flash("error_msg", "Only approved orders can be placed.");
    return res.redirect(`/orders/${req.params.id}`);
  }
  await order.update({ status: "PLACED" });
  req.flash("success_msg", "Order placed with supplier.");
  res.redirect(`/orders/${order.id}`);
};

export const cancelOrder = async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  if (!order || order.status === "RECEIVED") {
    req.flash("error_msg", "Fully received orders cannot be cancelled.");
    return res.redirect(`/orders/${req.params.id}`);
  }
  await order.update({ status: "CANCELLED" });
  req.flash("success_msg", "Order cancelled.");
  res.redirect(`/orders/${order.id}`);
};

export const updateOrderComments = async (req, res) => {
  await Order.update({ comments: req.body.comments }, { where: { id: req.params.id } });
  req.flash("success_msg", "Comments saved.");
  res.redirect(`/orders/${req.params.id}`);
};

// ─── Documents on purchase orders (e.g. abstract of canvass) ────────────────

export const uploadOrderDocument = async (req, res) => {
  if (!req.file) {
    req.flash("error_msg", "Please choose a file to upload.");
    return res.redirect(`/orders/${req.params.id}`);
  }
  await Document.create({
    orderId: req.params.id,
    filename: req.file.filename,
    originalName: req.file.originalname,
    filePath: `/uploads/${req.file.filename}`,
    fileSize: req.file.size,
    contentType: req.file.mimetype,
    uploadedById: req.session.userId,
  });
  req.flash("success_msg", "Document uploaded.");
  res.redirect(`/orders/${req.params.id}`);
};

export const deleteOrderDocument = async (req, res) => {
  const doc = await Document.findOne({ where: { id: req.params.docId, orderId: req.params.id } });
  if (doc) {
    fs.promises.unlink(`public${doc.filePath}`).catch(() => {});
    await doc.destroy();
    req.flash("success_msg", "Document deleted.");
  }
  res.redirect(`/orders/${req.params.id}`);
};
