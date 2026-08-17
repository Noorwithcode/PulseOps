import express from "express";

import {
  createRule,
  getRule,
  getRules,
  getRuleStates,
  removeRule,
  updateRule,
  updateRuleStatus,
} from "../controllers/alertRuleController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

const router =
  express.Router();

const requireAdmin = (
  req,
  res,
  next
) => {
  const roleCode =
    req.user?.role?.code ||
    req.user?.roleCode ||
    req.user?.role;

  if (
    String(
      roleCode || ""
    ).toUpperCase() !==
    "ADMIN"
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Administrator access is required.",
    });
  }

  next();
};

/*
 * All alert-rule management routes require:
 * 1. Valid access token
 * 2. ADMIN role
 */
router.use(
  protect,
  requireAdmin
);

router
  .route("/")
  .post(createRule)
  .get(getRules);

router.get(
  "/:id/states",
  getRuleStates
);

router.patch(
  "/:id/status",
  updateRuleStatus
);

router
  .route("/:id")
  .get(getRule)
  .patch(updateRule)
  .delete(removeRule);

export default router;
