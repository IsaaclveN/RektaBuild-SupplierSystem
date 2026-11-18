import {
  sequelize, Organization, Product, User,
  Order, OrderItem, Receipt, ReceiptItem,
} from "../models/index.js";
await sequelize.sync();

const toArray = (v) => (Array.isArray(v) ? v : v !== undefined ? [v] : []);

const RECEIVABLE = ["PLACED", "PARTIALLY_RECEIVED"];

const loadOrderWithItems = (id) => Order.findByPk(id, {
  include: [
    { model: Organization, as: "supplier" },
    { model: OrderItem, as: "items", include: [{ model: Product, as: "product" }] },
  ],
});

// ─── Receiving — mirrors OpenBoxes Receipt/ReceiptItem (partial receiving) ──

export const receiptListPage = async (req, res) => {
  const receipts = await Receipt.findAll({
    include: [
      { model: Order, as: "order", include: [{ model: Organization, as: "supplier" }] },
      { model: User, as: "receivedBy", attributes: ["id", "name"] },
      { model: ReceiptItem, as: "items" },
    ],
    order: [["id", "DESC"]],
  });
  res.render("receipts/index", { title: "Receiving", receipts });
};

export const newReceiptPage = async (req, res) => {
  const order = await loadOrderWithItems(req.params.id);
  if (!order || !RECEIVABLE.includes(order.status)) {
    req.flash("error_msg", "Only placed or partially received orders can be received against.");
    return res.redirect(`/orders/${req.params.id}`);
  }
  res.render("receipts/new", { title: `Receive ${order.orderNumber}`, order });
};

export const createReceipt = async (req, res) => {
  const order = await loadOrderWithItems(req.params.id);
  if (!order || !RECEIVABLE.includes(order.status)) {
    req.flash("error_msg", "This order is not open for receiving.");
    return res.redirect("/orders");
  }

  const orderItemIds = toArray(req.body.orderItemId);
  const quantities = toArray(req.body.quantityReceived);
  const rejectedQtys = toArray(req.body.quantityRejected);
  const comments = toArray(req.body.itemComment);

  const items = orderItemIds
    .map((id, i) => {
      const orderItem = order.items.find((it) => String(it.id) === String(id));
      const qty = parseInt(quantities[i], 10) || 0;
      const rej = Math.max(0, parseInt(rejectedQtys[i], 10) || 0);
      if (!orderItem || (qty <= 0 && rej <= 0)) return null;
      const acceptedQty = Math.min(qty, orderItem.quantity - orderItem.quantityReceived);
      const inspectionStatus = rej > 0
        ? (acceptedQty > 0 ? "PARTIAL_REJECT" : "REJECTED")
        : "ACCEPTED";
      return { orderItem, qty: acceptedQty, rej, inspectionStatus, comment: comments[i] };
    })
    .filter(Boolean)
    .filter((it) => it.qty > 0 || it.rej > 0);

  if (!items.length) {
    req.flash("error_msg", "Enter a received or rejected quantity for at least one item.");
    return res.redirect(`/orders/${order.id}/receive`);
  }

  const receipt = await Receipt.create({
    receiptNumber: `RCT-${Date.now()}`,
    orderId: order.id,
    shipmentNumber: req.body.shipmentNumber || null,
    receivedById: req.session.userId,
    dateReceived: new Date(),
    comments: req.body.comments,
  });
  await ReceiptItem.bulkCreate(items.map((it) => ({
    receiptId: receipt.id,
    orderItemId: it.orderItem.id,
    productId: it.orderItem.productId,
    quantityReceived: it.qty,
    quantityRejected: it.rej,
    inspectionStatus: it.inspectionStatus,
    comment: it.comment || null,
  })));

  // Update received quantities, then recompute order status.
  for (const it of items) {
    if (it.qty > 0) {
      await it.orderItem.increment("quantityReceived", { by: it.qty });
    }
  }
  const refreshed = await OrderItem.findAll({ where: { orderId: order.id } });
  const allReceived = refreshed.every((it) => it.quantityReceived >= it.quantity);
  await order.update({ status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" });

  req.flash("success_msg", `Receipt ${receipt.receiptNumber} recorded.`);
  res.redirect(`/receipts/${receipt.id}`);
};

export const showReceiptPage = async (req, res) => {
  const receipt = await Receipt.findByPk(req.params.id, {
    include: [
      { model: Order, as: "order", include: [{ model: Organization, as: "supplier" }] },
      { model: User, as: "receivedBy", attributes: ["id", "name"] },
      { model: ReceiptItem, as: "items", include: [{ model: Product, as: "product" }] },
    ],
  });
  if (!receipt) {
    req.flash("error_msg", "Receipt not found.");
    return res.redirect("/receipts");
  }
  res.render("receipts/show", { title: receipt.receiptNumber, receipt });
};

export const printReceiptPage = async (req, res) => {
  const receipt = await Receipt.findByPk(req.params.id, {
    include: [
      { model: Order, as: "order", include: [{ model: Organization, as: "supplier" }] },
      { model: User, as: "receivedBy", attributes: ["id", "name"] },
      { model: ReceiptItem, as: "items", include: [{ model: Product, as: "product" }] },
    ],
  });
  if (!receipt) {
    req.flash("error_msg", "Receipt not found.");
    return res.redirect("/receipts");
  }
  res.render("receipts/print", {
    title: `Print Receipt ${receipt.receiptNumber}`,
    receipt,
    generatedAt: new Date().toISOString().slice(0, 10),
  });
};
