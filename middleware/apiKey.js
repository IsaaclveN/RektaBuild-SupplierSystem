import crypto from "node:crypto";
import { ApiKey } from "../models/index.js";

// Plaintext format: rbk_<64 hex chars>. Only the SHA-256 hash is persisted.
export const hashApiKey = (plain) =>
  crypto.createHash("sha256").update(plain).digest("hex");

export const generateApiKey = () => {
  const plain = `rbk_${crypto.randomBytes(32).toString("hex")}`;
  return { plain, prefix: plain.slice(0, 12), hash: hashApiKey(plain) };
};

const readHeaderKey = (req) => {
  const auth = req.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const alt = req.get("x-api-key");
  return alt ? alt.trim() : null;
};

const deny = (res, status, error, message) => res.status(status).json({ error, message });

// Session bypass mirrors middleware/auth.js: enabled outside production unless
// AUTH_BYPASS=false, so the demo keeps working locally while production is closed.
const bypassEnabled = () =>
  process.env.AUTH_BYPASS === "true" ||
  (process.env.AUTH_BYPASS !== "false" && process.env.NODE_ENV !== "production");

const authenticateKey = async (req) => {
  const plain = readHeaderKey(req);
  if (!plain || !plain.startsWith("rbk_")) return { error: "missing" };

  const key = await ApiKey.findOne({ where: { keyHash: hashApiKey(plain) } });
  if (!key) return { error: "invalid" };
  if (!key.active || key.revokedAt) return { error: "revoked" };

  if (key.expiresAt) {
    const expiry = new Date(`${key.expiresAt}T23:59:59`);
    if (expiry < new Date()) return { error: "expired" };
  }

  const isRead = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (!isRead && key.role !== "writer") return { key, error: "readonly" };

  // Throttle the write so read-heavy consumers do not update on every call.
  const stale = !key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > 300000;
  if (stale) await key.update({ lastUsedAt: new Date() });

  return { key };
};

export const requireApiKey = async (req, res, next) => {
  try {
    const { key, error } = await authenticateKey(req);
    if (error === "readonly") {
      return deny(res, 403, "forbidden", "This API key is read-only (reader role).");
    }
    if (error === "expired") {
      return deny(res, 401, "unauthorized", "This API key has expired.");
    }
    if (!key) {
      return deny(res, 401, "unauthorized",
        "Provide a valid key via 'Authorization: Bearer rbk_...' or 'X-API-Key'.");
    }
    req.apiKey = key;
    next();
  } catch (err) {
    next(err);
  }
};

// Used by the purchase order form, which is called from the browser session
// rather than by another module. Accepts a logged-in session or, while the
// demo bypass is active, an unauthenticated local request.
export const requireApiKeyOrSession = async (req, res, next) => {
  try {
    if (req.session?.userId || bypassEnabled()) return next();

    const { key, error } = await authenticateKey(req);
    if (error === "readonly") {
      return deny(res, 403, "forbidden", "This API key is read-only (reader role).");
    }
    if (!key) {
      return deny(res, 401, "unauthorized", "Sign in or provide a valid API key.");
    }
    req.apiKey = key;
    next();
  } catch (err) {
    next(err);
  }
};
