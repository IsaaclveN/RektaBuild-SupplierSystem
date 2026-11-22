import { ApiKey, User } from "../models/index.js";
import { generateApiKey } from "../middleware/apiKey.js";

export const apiKeyListPage = async (req, res) => {
  const keys = await ApiKey.findAll({
    include: [{ model: User, as: "createdBy", attributes: ["id", "name"] }],
    order: [["id", "DESC"]],
  });
  res.render("api_keys/index", { title: "API Keys", keys });
};

export const createApiKey = async (req, res) => {
  const { name, role, expiresAt } = req.body;
  if (!name || !name.trim()) {
    req.flash("error_msg", "Key name is required.");
    return res.redirect("/api-keys");
  }

  const { plain, prefix, hash } = generateApiKey();
  try {
    await ApiKey.create({
      name: name.trim(),
      keyPrefix: prefix,
      keyHash: hash,
      role: role === "writer" ? "writer" : "reader",
      active: true,
      expiresAt: expiresAt || null,
      createdById: req.session?.userId || null,
    });
    // The plaintext key is returned in this one response only and never stored.
    res.render("api_keys/created", {
      title: "API Key Created",
      keyName: name.trim(),
      plainKey: plain,
      role: role === "writer" ? "writer" : "reader",
    });
  } catch (err) {
    req.flash("error_msg", `Could not create API key: ${err.message}`);
    res.redirect("/api-keys");
  }
};

export const revokeApiKey = async (req, res) => {
  const key = await ApiKey.findByPk(req.params.id);
  if (!key) {
    req.flash("error_msg", "API key not found.");
    return res.redirect("/api-keys");
  }
  await key.update({ active: false, revokedAt: new Date() });
  req.flash("success_msg", `API key "${key.name}" revoked.`);
  res.redirect("/api-keys");
};

export const toggleApiKey = async (req, res) => {
  const key = await ApiKey.findByPk(req.params.id);
  if (!key) {
    req.flash("error_msg", "API key not found.");
    return res.redirect("/api-keys");
  }
  const nextActive = !key.active;
  await key.update({ active: nextActive, revokedAt: nextActive ? null : key.revokedAt });
  req.flash("success_msg", `API key "${key.name}" ${nextActive ? "enabled" : "disabled"}.`);
  res.redirect("/api-keys");
};
