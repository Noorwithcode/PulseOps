import express from "express";

import {
  getAlert,
  getAlertEvaluations,
  getAlerts,
  getAlertsSummary,
} from "../controllers/alertManagementController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

const router =
  express.Router();

router.use(protect);

router.get(
  "/summary",
  getAlertsSummary
);

router.get(
  "/",
  getAlerts
);

router.get(
  "/:id/evaluations",
  getAlertEvaluations
);

router.get(
  "/:id",
  getAlert
);

export default router;