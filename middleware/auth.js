import { User } from "../models/userModel.js";

// TEMPORARY: auth disabled for demo — pages are accessible without login.
// Restore the session check below when login is needed again.
export const requireAuth = async (req, res, next) => {
  if (!req.session.userId) return next();

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
