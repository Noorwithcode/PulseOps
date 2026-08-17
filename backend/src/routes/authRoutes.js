import { Router } from "express";

import {
  getCurrentUser,
  login,
  logout,
  refreshAccessToken,
} from "../controllers/authController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

import {
  loginLimiter,
  refreshLimiter,
} from "../middleware/securityMiddleware.js";

const router = Router();

/*
 * Authentication responses can contain
 * access-token or session information.
 * Prevent browser/proxy caching.
 */
router.use(
  (_req, res, next) => {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    next();
  }
);

router.post(
  "/login",
  loginLimiter,
  login
);

router.post(
  "/refresh",
  refreshLimiter,
  refreshAccessToken
);

router.post(
  "/logout",
  logout
);

router.get(
  "/me",
  protect,
  getCurrentUser
);

export default router;