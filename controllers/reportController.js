import { Op } from "sequelize";
import {
  sequelize, Organization, Location, Product,
  Order, OrderItem, Receipt, ReceiptItem, User,
} from "../models/index.js";
await sequelize.sync();

const formatMonthLabel = (ym) => {
  if (!ym || ym === "all") return "All Months";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return isNaN(d) ? ym : d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthBounds = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, "0")}`,
    daysInMonth: lastDay,
  };
};

export const reportsPage = async (req, res) => {
  const type = ["orders", "suppliers", "receipts"].includes(req.query.type) ? req.query.type : "orders";
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rawMonth = req.query.month;
  const hasCustomDates = Boolean(req.query.from || req.query.to);
  const month = hasCustomDates ? "custom" : (rawMonth === "all" ? "all" : (rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonth));

  let from = req.query.from || "";
  let to = req.query.to || "";
  let daysInMonth = 30;
  if (month !== "all" && month !== "custom") {
    const b = monthBounds(month);
    from = b.start;
    to = b.end;
    daysInMonth = b.daysInMonth;
  }

  const status = req.query.status || "";
  const supplierId = req.query.supplierId || "";

  const [suppliersAll, allOrderDates, allReceiptDates] = await Promise.all([
    Organization.findAll({ order: [["name", "ASC"]] }),
    Order.findAll({ attributes: ["dateOrdered"], raw: true }),
    Receipt.findAll({ attributes: ["dateReceived"], raw: true }),
  ]);

  const monthSet = new Set([currentMonth]);
  allOrderDates.forEach((r) => { if (r.dateOrdered) monthSet.add(String(r.dateOrdered).slice(0, 7)); });
  allReceiptDates.forEach((r) => { if (r.dateReceived) monthSet.add(String(r.dateReceived).slice(0, 7)); });
  const availableMonths = [...monthSet].sort().reverse().map((m) => ({
    value: m,
    label: formatMonthLabel(m),
    selected: m === month,
  }));

  let orders = [];
  let suppliers = [];
  let receipts = [];
  let summary = { count: 0, totalAmount: 0, totalReceived: 0, totalRejected: 0 };
  const dailyMap = {};

  if (type === "orders") {
    const where = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (from || to) {
      where.dateOrdered = {};
      if (from) where.dateOrdered[Op.gte] = from;
      if (to) where.dateOrdered[Op.lte] = to;
    }
    const raw = await Order.findAll({
      where,
      include: [
        { model: Organization, as: "supplier" },
        { model: OrderItem, as: "items" },
      ],
      order: [["id", "DESC"]],
    });
    orders = raw.map((o) => {
      const total = (o.items || []).reduce((s, it) => s + it.quantity * (parseFloat(it.unitPrice) || 0), 0);
      summary.totalAmount += total;
      const dKey = o.dateOrdered ? String(o.dateOrdered).slice(0, 10) : null;
      if (dKey) {
        dailyMap[dKey] = dailyMap[dKey] || { date: dKey, count: 0, value: 0 };
        dailyMap[dKey].count += 1;
        dailyMap[dKey].value += total;
      }
      return {
        ...o.toJSON(),
        itemCount: (o.items || []).length,
        totalAmount: total.toFixed(2),
      };
    });
    summary.count = orders.length;
    summary.totalAmount = summary.totalAmount.toFixed(2);
  } else if (type === "suppliers") {
    const where = {};
    if (status) where.accreditationStatus = status;
    suppliers = await Organization.findAll({
      where,
      include: [{ model: Location, as: "locations" }],
      order: [["name", "ASC"]],
    });
    summary.count = suppliers.length;
  } else if (type === "receipts") {
    const where = {};
    if (from || to) {
      where.dateReceived = {};
      if (from) where.dateReceived[Op.gte] = from;
      if (to) where.dateReceived[Op.lte] = to;
    }
    const raw = await Receipt.findAll({
      where,
      include: [
        {
          model: Order,
          as: "order",
          where: supplierId ? { supplierId } : undefined,
          include: [{ model: Organization, as: "supplier" }],
        },
        { model: User, as: "receivedBy", attributes: ["id", "name"] },
        { model: ReceiptItem, as: "items", include: [{ model: Product, as: "product" }] },
      ],
      order: [["id", "DESC"]],
    });
    receipts = raw.map((r) => {
      const rec = (r.items || []).reduce((s, it) => s + (it.quantityReceived || 0), 0);
      const rej = (r.items || []).reduce((s, it) => s + (it.quantityRejected || 0), 0);
      summary.totalReceived += rec;
      summary.totalRejected += rej;
      const dKey = r.dateReceived ? String(r.dateReceived).slice(0, 10) : null;
      if (dKey) {
        dailyMap[dKey] = dailyMap[dKey] || { date: dKey, count: 0, accepted: 0, rejected: 0 };
        dailyMap[dKey].count += 1;
        dailyMap[dKey].accepted += rec;
        dailyMap[dKey].rejected += rej;
      }
      return {
        ...r.toJSON(),
        qtyReceivedSum: rec,
        qtyRejectedSum: rej,
      };
    });
    summary.count = receipts.length;
  }

  const chartSeries = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const chartDataJson = JSON.stringify({
    type,
    month,
    monthLabel: formatMonthLabel(month),
    daysInMonth,
    series: chartSeries,
  });

  res.render("reports/index", {
    title: "Reports & PDF Export",
    type,
    month: month === "custom" ? "" : month,
    isAllMonths: month === "all",
    monthLabel: month === "custom" ? `${from || "..."} to ${to || "..."}` : formatMonthLabel(month),
    prevMonth: month !== "all" && month !== "custom" ? shiftMonth(month, -1) : shiftMonth(currentMonth, -1),
    nextMonth: month !== "all" && month !== "custom" ? shiftMonth(month, 1) : currentMonth,
    availableMonths,
    from,
    to,
    status,
    supplierId,
    suppliersAll,
    orders,
    suppliers,
    receipts,
    summary,
    chartDataJson,
    generatedAt: new Date().toISOString().slice(0, 10),
  });
};

// ─── ERP Integration Endpoints (Inventory & Accounting) ─────────────────────

export const apiIntegrationSuppliers = async (req, res) => {
  const suppliers = await Organization.findAll({
    include: [{ model: Location, as: "locations" }],
    order: [["id", "ASC"]],
  });
  res.json({
    source: "RektaBuild-Supplier",
    exportedAt: new Date().toISOString(),
    count: suppliers.length,
    data: suppliers,
  });
};

export const apiIntegrationOrders = async (req, res) => {
  const where = req.query.status ? { status: req.query.status } : {};
  const orders = await Order.findAll({
    where,
    include: [
      { model: Organization, as: "supplier", attributes: ["id", "code", "name", "tin", "paymentTerms"] },
      { model: OrderItem, as: "items", include: [{ model: Product, as: "product", attributes: ["id", "productCode", "name", "unitOfMeasure"] }] },
    ],
    order: [["id", "DESC"]],
  });
  res.json({
    source: "RektaBuild-Supplier",
    exportedAt: new Date().toISOString(),
    count: orders.length,
    data: orders,
  });
};

export const apiIntegrationReceipts = async (req, res) => {
  const receipts = await Receipt.findAll({
    include: [
      { model: Order, as: "order", attributes: ["id", "orderNumber", "projectSite", "supplierId", "status"] },
      { model: ReceiptItem, as: "items", include: [{ model: Product, as: "product", attributes: ["id", "productCode", "name", "unitOfMeasure"] }] },
    ],
    order: [["id", "DESC"]],
  });
  res.json({
    source: "RektaBuild-Supplier",
    exportedAt: new Date().toISOString(),
    count: receipts.length,
    // Receipts are append-only (no update/delete path exists), so every row is
    // final. `receiptId` aliases `id` because the integration contract names it
    // explicitly; `finalized` marks rows as safe to ingest for stock-in.
    data: receipts.map((r) => ({ ...r.toJSON(), receiptId: r.id, finalized: true })),
  });
};
