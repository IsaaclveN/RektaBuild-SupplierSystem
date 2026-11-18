import {
  sequelize, Product, Organization, ProductSupplier,
  PreferenceType, ProductSupplierPreference,
} from "../models/index.js";
import { computeSupplierPerformance, performanceFor } from "../utils/supplierPerformance.js";
await sequelize.sync();

const loadFormData = async () => {
  const [products, suppliers] = await Promise.all([
    Product.findAll({ where: { active: true }, order: [["name", "ASC"]] }),
    Organization.findAll({ where: { active: true }, order: [["name", "ASC"]] }),
  ]);
  return { products, suppliers };
};

// ─── Product Sources — mirrors OpenBoxes ProductSupplier ────────────────────

export const productSourceListPage = async (req, res) => {
  const [sources, performance] = await Promise.all([
    ProductSupplier.findAll({
      include: [
        { model: Product, as: "product" },
        { model: Organization, as: "supplier" },
      ],
      order: [["id", "DESC"]],
    }),
    computeSupplierPerformance(),
  ]);
  res.render("product_sources/index", {
    title: "Product Sources",
    sources: sources.map((s) => ({ ...s.toJSON(), performance: performanceFor(performance, s.supplierId) })),
  });
};

export const newProductSourcePage = async (req, res) => {
  const { products, suppliers } = await loadFormData();
  res.render("product_sources/form", {
    title: "New Product Source",
    source: null, products, suppliers,
  });
};

export const createProductSource = async (req, res) => {
  const b = req.body;
  try {
    await ProductSupplier.create({
      productId: b.productId,
      supplierId: b.supplierId,
      supplierCode: b.supplierCode,
      name: b.name,
      manufacturer: b.manufacturer,
      manufacturerCode: b.manufacturerCode,
      minOrderQuantity: b.minOrderQuantity || null,
      standardLeadTimeDays: b.standardLeadTimeDays || null,
      packagePrice: b.packagePrice || null,
      contractPrice: b.contractPrice || null,
      contractPriceValidUntil: b.contractPriceValidUntil || null,
      tieredPricing: b.tieredPricing === "on",
      active: b.active === "on" || b.active === "true" || b.active === undefined,
      createdById: req.session.userId,
      updatedById: req.session.userId,
    });
    req.flash("success_msg", "Product source created.");
    res.redirect("/product-sources");
  } catch (err) {
    req.flash("error_msg", `Could not create product source: ${err.message}`);
    res.redirect("/product-sources/new");
  }
};

export const showProductSourcePage = async (req, res) => {
  const source = await ProductSupplier.findByPk(req.params.id, {
    include: [
      { model: Product, as: "product" },
      { model: Organization, as: "supplier" },
      {
        model: ProductSupplierPreference,
        as: "preferences",
        include: [{ model: PreferenceType, as: "preferenceType" }],
      },
    ],
  });
  if (!source) {
    req.flash("error_msg", "Product source not found.");
    return res.redirect("/product-sources");
  }
  const preferenceTypes = await PreferenceType.findAll({ order: [["name", "ASC"]] });
  const performance = await computeSupplierPerformance();
  res.render("product_sources/show", {
    title: source.name || `Source #${source.id}`,
    source: { ...source.toJSON(), performance: performanceFor(performance, source.supplierId) },
    preferenceTypes,
  });
};

export const editProductSourcePage = async (req, res) => {
  const source = await ProductSupplier.findByPk(req.params.id);
  if (!source) {
    req.flash("error_msg", "Product source not found.");
    return res.redirect("/product-sources");
  }
  const { products, suppliers } = await loadFormData();
  res.render("product_sources/form", {
    title: "Edit Product Source",
    source, products, suppliers,
  });
};

export const updateProductSource = async (req, res) => {
  const b = req.body;
  try {
    await ProductSupplier.update(
      {
        productId: b.productId,
        supplierId: b.supplierId,
        supplierCode: b.supplierCode,
        name: b.name,
        manufacturer: b.manufacturer,
        manufacturerCode: b.manufacturerCode,
        minOrderQuantity: b.minOrderQuantity || null,
        standardLeadTimeDays: b.standardLeadTimeDays || null,
        packagePrice: b.packagePrice || null,
        contractPrice: b.contractPrice || null,
        contractPriceValidUntil: b.contractPriceValidUntil || null,
        tieredPricing: b.tieredPricing === "on",
        active: b.active === "on" || b.active === "true",
        updatedById: req.session.userId,
      },
      { where: { id: req.params.id } }
    );
    req.flash("success_msg", "Product source updated.");
    res.redirect(`/product-sources/${req.params.id}`);
  } catch (err) {
    req.flash("error_msg", `Could not update product source: ${err.message}`);
    res.redirect(`/product-sources/${req.params.id}/edit`);
  }
};

// ─── Preferences (Preferred / Contract with validity dates) ─────────────────

export const addSourcePreference = async (req, res) => {
  const { preferenceTypeId, validityStartDate, validityEndDate, comments } = req.body;
  try {
    await ProductSupplierPreference.create({
      productSupplierId: req.params.id,
      preferenceTypeId,
      validityStartDate: validityStartDate || null,
      validityEndDate: validityEndDate || null,
      comments,
    });
    req.flash("success_msg", "Preference added.");
  } catch (err) {
    req.flash("error_msg", `Could not add preference: ${err.message}`);
  }
  res.redirect(`/product-sources/${req.params.id}`);
};

export const deleteSourcePreference = async (req, res) => {
  await ProductSupplierPreference.destroy({
    where: { id: req.params.preferenceId, productSupplierId: req.params.id },
  });
  req.flash("success_msg", "Preference removed.");
  res.redirect(`/product-sources/${req.params.id}`);
};

// ─── CSV export / import (mirrors OpenBoxes export + import template) ────────

const CSV_HEADER = [
  "productCode", "supplierCode", "supplierProductCode", "name",
  "manufacturer", "manufacturerCode", "minOrderQuantity", "standardLeadTimeDays",
  "packagePrice", "contractPrice", "contractPriceValidUntil", "active",
];

export const exportProductSourcesCsv = async (req, res) => {
  const sources = await ProductSupplier.findAll({
    include: [
      { model: Product, as: "product" },
      { model: Organization, as: "supplier" },
    ],
    order: [["id", "ASC"]],
  });

  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = sources.map((s) => [
    s.product?.productCode, s.supplier?.code, s.supplierCode, s.name,
    s.manufacturer, s.manufacturerCode, s.minOrderQuantity, s.standardLeadTimeDays,
    s.packagePrice, s.contractPrice, s.contractPriceValidUntil, s.active,
  ].map(esc).join(","));

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=product-sources.csv");
  res.send([CSV_HEADER.join(","), ...rows].join("\n"));
};

// Naive CSV line splitter that respects quoted fields.
const parseCsvLine = (line) => {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
};

export const importProductSourcesCsv = async (req, res) => {
  if (!req.file) {
    req.flash("error_msg", "Please choose a CSV file to import.");
    return res.redirect("/product-sources");
  }

  const lines = req.file.buffer.toString("utf8").split(/\r?\n/).filter((l) => l.trim());
  const dataLines = /^productCode\s*,/i.test(lines[0] || "") ? lines.slice(1) : lines;

  let created = 0, skipped = 0;
  for (const line of dataLines) {
    const c = parseCsvLine(line);
    const [productCode, supplierCode] = c;
    if (!productCode || !supplierCode) { skipped++; continue; }

    const [product, supplier] = await Promise.all([
      Product.findOne({ where: { productCode } }),
      Organization.findOne({ where: { code: supplierCode } }),
    ]);
    if (!product || !supplier) { skipped++; continue; }

    await ProductSupplier.create({
      productId: product.id,
      supplierId: supplier.id,
      supplierCode: c[2] || null,
      name: c[3] || null,
      manufacturer: c[4] || null,
      manufacturerCode: c[5] || null,
      minOrderQuantity: c[6] || null,
      standardLeadTimeDays: c[7] || null,
      packagePrice: c[8] || null,
      contractPrice: c[9] || null,
      contractPriceValidUntil: c[10] || null,
      active: c[11] ? c[11].toLowerCase() === "true" : true,
      createdById: req.session.userId,
      updatedById: req.session.userId,
    });
    created++;
  }

  req.flash(created ? "success_msg" : "error_msg",
    `Import finished: ${created} product source(s) created, ${skipped} row(s) skipped.`);
  res.redirect("/product-sources");
};

// JSON feed used by the PO form to auto-fill sourcing info per supplier.
export const apiProductSourcesBySupplier = async (req, res) => {
  const sources = await ProductSupplier.findAll({
    where: { supplierId: req.params.id, active: true },
    include: [{ model: Product, as: "product" }],
  });
  res.json(sources);
};
