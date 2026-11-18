
      /*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";
import {
  sequelize, Organization, Product, ProductSupplier, Order, Receipt,
} from "../models/index.js";
await sequelize.sync();

export const loginPage = (req, res) => res.render("login", { title: "Login" });
export const registerPage = (req, res) => res.render("register", { title: "Register" });
export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: "Forgot Password" });
export const dashboardPage = async (req, res) => {
  const [
    supplierCount, productCount, sourceCount, openOrderCount, receiptCount,
    recentOrders, recentReceipts, allOrders, allReceipts, allOrgs,
  ] = await Promise.all([
    Organization.count(),
    Product.count(),
    ProductSupplier.count(),
    Order.count({ where: { status: ["PENDING", "APPROVED", "PLACED", "PARTIALLY_RECEIVED"] } }),
    Receipt.count(),
    Order.findAll({
      include: [{ model: Organization, as: "supplier" }],
      order: [["id", "DESC"]],
      limit: 5,
    }),
    Receipt.findAll({
      include: [{ model: Order, as: "order", include: [{ model: Organization, as: "supplier" }] }],
      order: [["id", "DESC"]],
      limit: 5,
    }),
    Order.findAll({ attributes: ["status", "dateOrdered", "createdAt"], raw: true }),
    Receipt.findAll({ attributes: ["dateReceived", "createdAt"], raw: true }),
    Organization.findAll({ attributes: ["role"], raw: true }),
  ]);

  const toDay = (d, fallback) => {
    const dt = new Date(d || fallback);
    return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
  };

  const statusMap = {};
  allOrders.forEach((o) => {
    statusMap[o.status] = (statusMap[o.status] || 0) + 1;
  });

  const roleMap = {};
  allOrgs.forEach((org) => {
    const r = (org.role || "supplier").toUpperCase();
    roleMap[r] = (roleMap[r] || 0) + 1;
  });

  const analyticsJson = JSON.stringify({
    counts: [
      { label: "Suppliers", value: supplierCount, color: "#0D9488" },
      { label: "Products", value: productCount, color: "#14B8A6" },
      { label: "Sources", value: sourceCount, color: "#0284C7" },
      { label: "Open Orders", value: openOrderCount, color: "#D97706" },
      { label: "Receipts", value: receiptCount, color: "#059669" },
    ],
    orders: allOrders.map((o) => ({ date: toDay(o.dateOrdered, o.createdAt), status: o.status })).filter((o) => o.date),
    receipts: allReceipts.map((r) => ({ date: toDay(r.dateReceived, r.createdAt) })).filter((r) => r.date),
    statusCounts: statusMap,
    supplierRoles: roleMap,
  });

  res.render("dashboard", {
    title: "Dashboard",
    stats: { supplierCount, productCount, sourceCount, openOrderCount, receiptCount },
    recentOrders,
    recentReceipts,
    analyticsJson,
  });
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });
  if (!user) return res.send("User not found");
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send("Incorrect password");
  req.session.userId = user.id;
  res.redirect("/dashboard");
};

export const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hashed });
  req.session.userId = user.id;
  res.redirect("/dashboard");
};

export const logoutUser = (req, res) => {
  req.session.destroy();
  res.redirect("/login");
};
