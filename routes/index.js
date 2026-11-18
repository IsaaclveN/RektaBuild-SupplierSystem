
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
    
import express from "express";
import { homePage } from "../controllers/homeController.js";
const router = express.Router();
router.get("/", homePage);

import { loginPage, registerPage, forgotPasswordPage, dashboardPage, loginUser, registerUser, logoutUser } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { upload, uploadCsv } from "../middleware/upload.js";
import {
  supplierListPage, newSupplierPage, createSupplier, showSupplierPage,
  editSupplierPage, updateSupplier, toggleSupplierActive,
  addSupplierLocation, deleteSupplierLocation,
} from "../controllers/supplierController.js";
import {
  productListPage, newProductPage, createProduct, editProductPage, updateProduct,
} from "../controllers/productController.js";
import {
  productSourceListPage, newProductSourcePage, createProductSource,
  showProductSourcePage, editProductSourcePage, updateProductSource,
  addSourcePreference, deleteSourcePreference,
  exportProductSourcesCsv, importProductSourcesCsv, apiProductSourcesBySupplier,
} from "../controllers/productSourceController.js";
import {
  orderListPage, newOrderPage, createOrder, showOrderPage, printOrderPage,
  approveOrder, placeOrder, cancelOrder, updateOrderComments,
  uploadOrderDocument, deleteOrderDocument,
} from "../controllers/orderController.js";
import {
  receiptListPage, newReceiptPage, createReceipt, showReceiptPage, printReceiptPage,
} from "../controllers/receivingController.js";
import {
  reportsPage, apiIntegrationSuppliers, apiIntegrationOrders, apiIntegrationReceipts,
} from "../controllers/reportController.js";

router.get("/login", loginPage);
router.post("/login", loginUser);
router.get("/register", registerPage);
router.post("/register", registerUser);
router.get("/forgot-password", forgotPasswordPage);
router.get("/dashboard", dashboardPage);
router.get("/logout", logoutUser);

// ─── Suppliers (Organizations) ──────────────────────────────────────────────
router.get("/suppliers", requireAuth, supplierListPage);
router.get("/suppliers/new", requireAuth, newSupplierPage);
router.post("/suppliers", requireAuth, createSupplier);
router.get("/suppliers/:id", requireAuth, showSupplierPage);
router.get("/suppliers/:id/edit", requireAuth, editSupplierPage);
router.post("/suppliers/:id", requireAuth, updateSupplier);
router.post("/suppliers/:id/toggle", requireAuth, toggleSupplierActive);
router.post("/suppliers/:id/locations", requireAuth, addSupplierLocation);
router.post("/suppliers/:id/locations/:locationId/delete", requireAuth, deleteSupplierLocation);

// ─── Products ───────────────────────────────────────────────────────────────
router.get("/products", requireAuth, productListPage);
router.get("/products/new", requireAuth, newProductPage);
router.post("/products", requireAuth, createProduct);
router.get("/products/:id/edit", requireAuth, editProductPage);
router.post("/products/:id", requireAuth, updateProduct);

// ─── Product Sources ────────────────────────────────────────────────────────
router.get("/product-sources", requireAuth, productSourceListPage);
router.get("/product-sources/new", requireAuth, newProductSourcePage);
router.post("/product-sources", requireAuth, createProductSource);
router.get("/product-sources/export.csv", requireAuth, exportProductSourcesCsv);
router.post("/product-sources/import", requireAuth, uploadCsv.single("csvFile"), importProductSourcesCsv);
router.get("/product-sources/:id", requireAuth, showProductSourcePage);
router.get("/product-sources/:id/edit", requireAuth, editProductSourcePage);
router.post("/product-sources/:id", requireAuth, updateProductSource);
router.post("/product-sources/:id/preferences", requireAuth, addSourcePreference);
router.post("/product-sources/:id/preferences/:preferenceId/delete", requireAuth, deleteSourcePreference);
router.get("/api/suppliers/:id/product-sources", requireAuth, apiProductSourcesBySupplier);

// ─── Purchase Orders ────────────────────────────────────────────────────────
router.get("/orders", requireAuth, orderListPage);
router.get("/orders/new", requireAuth, newOrderPage);
router.post("/orders", requireAuth, createOrder);
router.get("/orders/:id", requireAuth, showOrderPage);
router.get("/orders/:id/print", requireAuth, printOrderPage);
router.post("/orders/:id/approve", requireAuth, approveOrder);
router.post("/orders/:id/place", requireAuth, placeOrder);
router.post("/orders/:id/cancel", requireAuth, cancelOrder);
router.post("/orders/:id/comments", requireAuth, updateOrderComments);
router.post("/orders/:id/documents", requireAuth, upload.single("document"), uploadOrderDocument);
router.post("/orders/:id/documents/:docId/delete", requireAuth, deleteOrderDocument);

// ─── Receiving ──────────────────────────────────────────────────────────────
router.get("/receipts", requireAuth, receiptListPage);
router.get("/orders/:id/receive", requireAuth, newReceiptPage);
router.post("/orders/:id/receive", requireAuth, createReceipt);
router.get("/receipts/:id", requireAuth, showReceiptPage);
router.get("/receipts/:id/print", requireAuth, printReceiptPage);

// ─── Reports & PDF Export + ERP Integration APIs ────────────────────────────
router.get("/reports", requireAuth, reportsPage);
router.get("/api/integration/suppliers", apiIntegrationSuppliers);
router.get("/api/integration/orders", apiIntegrationOrders);
router.get("/api/integration/receipts", apiIntegrationReceipts);

export default router;
