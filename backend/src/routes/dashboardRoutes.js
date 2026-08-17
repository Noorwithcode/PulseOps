import express from "express";

import {
  getOverview,
} from "../controllers/dashboardController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/*
 * GET /api/dashboard/overview
 * Protected dashboard summary endpoint.
 */
router.get(
  "/overview",
  protect,
  getOverview
);

export default router;