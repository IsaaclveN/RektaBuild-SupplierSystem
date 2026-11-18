import { sequelize, Product } from "../models/index.js";
await sequelize.sync();

// Minimal product catalog — needed by product sources and purchase orders.

export const productListPage = async (req, res) => {
  const products = await Product.findAll({ order: [["name", "ASC"]] });
  res.render("products/index", { title: "Products", products });
};

export const newProductPage = (req, res) => {
  res.render("products/form", { title: "New Product", product: null });
};

export const createProduct = async (req, res) => {
  const { productCode, name, description, category, unitOfMeasure, active } = req.body;
  try {
    await Product.create({
      productCode: productCode.trim(),
      name,
      description,
      category,
      unitOfMeasure: unitOfMeasure || "EA",
      active: active === "on" || active === "true",
    });
    req.flash("success_msg", "Product created.");
    res.redirect("/products");
  } catch (err) {
    req.flash("error_msg", err.name === "SequelizeUniqueConstraintError"
      ? `Product code "${productCode}" is already taken.`
      : `Could not create product: ${err.message}`);
    res.redirect("/products/new");
  }
};

export const editProductPage = async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (!product) {
    req.flash("error_msg", "Product not found.");
    return res.redirect("/products");
  }
  res.render("products/form", { title: "Edit Product", product });
};

export const updateProduct = async (req, res) => {
  const { productCode, name, description, category, unitOfMeasure, active } = req.body;
  try {
    await Product.update(
      {
        productCode: productCode.trim(),
        name,
        description,
        category,
        unitOfMeasure: unitOfMeasure || "EA",
        active: active === "on" || active === "true",
      },
      { where: { id: req.params.id } }
    );
    req.flash("success_msg", "Product updated.");
    res.redirect("/products");
  } catch (err) {
    req.flash("error_msg", err.name === "SequelizeUniqueConstraintError"
      ? `Product code "${productCode}" is already taken.`
      : `Could not update product: ${err.message}`);
    res.redirect(`/products/${req.params.id}/edit`);
  }
};
