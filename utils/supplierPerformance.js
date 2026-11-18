import { Order, Receipt, ReceiptItem } from "../models/index.js";

// Derives supplier performance strictly from recorded transactions:
// on-time delivery (receipt vs. PO expected delivery date) and quality
// acceptance (accepted vs. rejected quantities). No manual input involved.

const gradeFor = (onTimeRate, qualityRate) => {
  if (onTimeRate === null && qualityRate === null) return "NO_DATA";
  // A missing metric is treated as neutral so it does not skew the grade.
  const ot = onTimeRate === null ? 100 : onTimeRate;
  const q = qualityRate === null ? 100 : qualityRate;
  if (ot >= 95 && q >= 98) return "OUTSTANDING";
  if (ot >= 85 && q >= 95) return "GOOD";
  if (ot >= 70 && q >= 90) return "FAIR";
  return "POOR";
};

export const computeSupplierPerformance = async () => {
  const [orders, receipts, items] = await Promise.all([
    Order.findAll({
      attributes: ["id", "supplierId", "status", "expectedDeliveryDate"],
      raw: true,
    }),
    Receipt.findAll({ attributes: ["id", "orderId", "dateReceived"], raw: true }),
    ReceiptItem.findAll({
      attributes: ["receiptId", "quantityReceived", "quantityRejected"],
      raw: true,
    }),
  ]);

  const orderById = new Map(orders.map((o) => [o.id, o]));

  const quantitiesByReceipt = new Map();
  for (const it of items) {
    const acc = quantitiesByReceipt.get(it.receiptId) || { accepted: 0, rejected: 0 };
    acc.accepted += it.quantityReceived || 0;
    acc.rejected += it.quantityRejected || 0;
    quantitiesByReceipt.set(it.receiptId, acc);
  }

  const buckets = new Map();
  const bucket = (supplierId) => {
    if (!buckets.has(supplierId)) {
      buckets.set(supplierId, {
        totalOrders: 0,
        openOrders: 0,
        completedOrders: 0,
        deliveries: 0,
        onTimeDeliveries: 0,
        acceptedQty: 0,
        rejectedQty: 0,
      });
    }
    return buckets.get(supplierId);
  };

  for (const o of orders) {
    if (!o.supplierId) continue;
    const b = bucket(o.supplierId);
    b.totalOrders += 1;
    if (o.status === "RECEIVED") b.completedOrders += 1;
    if (["PENDING", "APPROVED", "PLACED", "PARTIALLY_RECEIVED"].includes(o.status)) b.openOrders += 1;
  }

  for (const r of receipts) {
    const order = orderById.get(r.orderId);
    if (!order || !order.supplierId) continue;
    const b = bucket(order.supplierId);
    b.deliveries += 1;

    const q = quantitiesByReceipt.get(r.id) || { accepted: 0, rejected: 0 };
    b.acceptedQty += q.accepted;
    b.rejectedQty += q.rejected;

    if (order.expectedDeliveryDate && r.dateReceived) {
      const due = new Date(order.expectedDeliveryDate);
      due.setHours(23, 59, 59, 999);
      if (new Date(r.dateReceived) <= due) b.onTimeDeliveries += 1;
    }
  }

  const result = {};
  for (const [supplierId, b] of buckets) {
    const deliveredQty = b.acceptedQty + b.rejectedQty;
    const onTimeRate = b.deliveries ? (b.onTimeDeliveries / b.deliveries) * 100 : null;
    const qualityRate = deliveredQty ? (b.acceptedQty / deliveredQty) * 100 : null;
    result[supplierId] = {
      ...b,
      onTimeRate: onTimeRate === null ? null : Number(onTimeRate.toFixed(1)),
      qualityRate: qualityRate === null ? null : Number(qualityRate.toFixed(1)),
      grade: gradeFor(onTimeRate, qualityRate),
    };
  }
  return result;
};

export const performanceFor = (performanceMap, supplierId) =>
  performanceMap[supplierId] || {
    totalOrders: 0,
    openOrders: 0,
    completedOrders: 0,
    deliveries: 0,
    onTimeDeliveries: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    onTimeRate: null,
    qualityRate: null,
    grade: "NO_DATA",
  };
