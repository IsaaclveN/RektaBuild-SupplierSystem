import { sequelize, Organization, Location, ProductSupplier, Product } from "../models/index.js";
import { computeSupplierPerformance, performanceFor } from "../utils/supplierPerformance.js";
await sequelize.sync();

// ─── Organizations (Suppliers) — mirrors OpenBoxes Organization + Location ──

export const supplierListPage = async (req, res) => {
  const suppliers = await Organization.findAll({
    include: [{ model: Location, as: "locations" }],
    order: [["name", "ASC"]],
  });
  res.render("suppliers/index", { title: "Suppliers", suppliers });
};

export const newSupplierPage = (req, res) => {
  res.render("suppliers/form", { title: "New Supplier", supplier: null });
};

export const createSupplier = async (req, res) => {
  const {
    code, name, description, role, active,
    tin, paymentTerms, accreditationStatus, permitExpiry,
    contactPerson, contactPhone, contactEmail,
  } = req.body;
  try {
    const status = accreditationStatus || "ACCREDITED";
    await Organization.create({
      code: code.trim(),
      name,
      description,
      role: role || "supplier",
      active: status === "BLACKLISTED" ? false : (active === "on" || active === "true"),
      tin: tin ? tin.trim() : null,
      paymentTerms: paymentTerms || "Net 30",
      accreditationStatus: status,
      permitExpiry: permitExpiry || null,
      contactPerson: contactPerson || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
    });
    req.flash("success_msg", "Supplier created.");
    res.redirect("/suppliers");
  } catch (err) {
    req.flash("error_msg", err.name === "SequelizeUniqueConstraintError"
      ? `Code "${code}" is already taken.`
      : `Could not create supplier: ${err.message}`);
    res.redirect("/suppliers/new");
  }
};

export const showSupplierPage = async (req, res) => {
  const supplier = await Organization.findByPk(req.params.id, {
    include: [
      { model: Location, as: "locations" },
      {
        model: ProductSupplier,
        as: "productSources",
        include: [{ model: Product, as: "product" }],
      },
    ],
  });
  if (!supplier) {
    req.flash("error_msg", "Supplier not found.");
    return res.redirect("/suppliers");
  }
  const performance = await computeSupplierPerformance();
  const supplierPerformance = performanceFor(performance, supplier.id);
  res.render("suppliers/show", {
    title: supplier.name,
    supplier: {
      ...supplier.toJSON(),
      productSources: supplier.productSources.map((s) => ({
        ...s.toJSON(),
        performance: supplierPerformance,
      })),
    },
    performance: supplierPerformance,
  });
};

export const editSupplierPage = async (req, res) => {
  const supplier = await Organization.findByPk(req.params.id);
  if (!supplier) {
    req.flash("error_msg", "Supplier not found.");
    return res.redirect("/suppliers");
  }
  res.render("suppliers/form", { title: "Edit Supplier", supplier });
};

export const updateSupplier = async (req, res) => {
  const {
    code, name, description, role, active,
    tin, paymentTerms, accreditationStatus, permitExpiry,
    contactPerson, contactPhone, contactEmail,
  } = req.body;
  try {
    const status = accreditationStatus || "ACCREDITED";
    await Organization.update(
      {
        code: code.trim(),
        name,
        description,
        role: role || "supplier",
        active: status === "BLACKLISTED" ? false : (active === "on" || active === "true"),
        tin: tin ? tin.trim() : null,
        paymentTerms: paymentTerms || "Net 30",
        accreditationStatus: status,
        permitExpiry: permitExpiry || null,
        contactPerson: contactPerson || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
      },
      { where: { id: req.params.id } }
    );
    req.flash("success_msg", "Supplier updated.");
    res.redirect(`/suppliers/${req.params.id}`);
  } catch (err) {
    req.flash("error_msg", err.name === "SequelizeUniqueConstraintError"
      ? `Code "${code}" is already taken.`
      : `Could not update supplier: ${err.message}`);
    res.redirect(`/suppliers/${req.params.id}/edit`);
  }
};

// SM-06: status review — activate / deactivate (blacklisting is done outside the ERP)
export const toggleSupplierActive = async (req, res) => {
  const supplier = await Organization.findByPk(req.params.id);
  if (!supplier) {
    req.flash("error_msg", "Supplier not found.");
    return res.redirect("/suppliers");
  }
  await supplier.update({ active: !supplier.active });
  req.flash("success_msg", `Supplier ${supplier.active ? "activated" : "deactivated"}.`);
  res.redirect(`/suppliers/${supplier.id}`);
};

// ─── Supplier locations (addresses) ─────────────────────────────────────────

export const addSupplierLocation = async (req, res) => {
  const { name, locationType, address1, address2, city, stateOrProvince, postalCode, country } = req.body;
  try {
    await Location.create({
      name,
      locationType: locationType || "Office",
      organizationId: req.params.id,
      address1, address2, city, stateOrProvince, postalCode, country,
    });
    req.flash("success_msg", "Location added.");
  } catch (err) {
    req.flash("error_msg", `Could not add location: ${err.message}`);
  }
  res.redirect(`/suppliers/${req.params.id}`);
};

export const deleteSupplierLocation = async (req, res) => {
  await Location.destroy({ where: { id: req.params.locationId, organizationId: req.params.id } });
  req.flash("success_msg", "Location removed.");
  res.redirect(`/suppliers/${req.params.id}`);
};
