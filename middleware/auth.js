import { User } from "../models/userModel.js";

// Demo bypass: active outside production unless AUTH_BYPASS=false. In production
// (NODE_ENV=production) the session check below is enforced.
const bypassEnabled = () =>
  process.env.AUTH_BYPASS === "true" ||
  (process.env.AUTH_BYPASS !== "false" && process.env.NODE_ENV !== "production");

export const requireAuth = async (req, res, next) => {
  if (!req.session.userId) {
    if (bypassEnabled()) return next();
    req.flash("error_msg", "Please sign in to continue.");
    return res.redirect("/login");
  }

  try {
    const user = await User.findByPk(req.session.userId);
    if (!user) {
      req.session.userId = null;
      return res.redirect("/login");
    }

    req.user = user;
    res.locals.currentUser = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (role) => [
  requireAuth,
  (req, res, next) => {
    const allowed = Array.isArray(role) ? role : [role];

    if (!req.user || !allowed.includes(req.user.role)) {
      req.flash("error_msg", "You do not have permission to perform this action.");
      return res.redirect("/dashboard");
    }

    next();
  },
];
