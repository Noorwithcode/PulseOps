import express from "express";

import {
  getMyNotification,
  getUnreadCount,
  listMyNotifications,
  markAllAsRead,
  markAsRead,
  removeMyNotification,
} from "../controllers/notificationController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

const router =
  express.Router();

router.use(protect);

/*
 * GET /api/notifications
 *
 * Optional query:
 * page
 * limit
 * unreadOnly
 * notificationType
 * severity
 */
router.get(
  "/",
  listMyNotifications
);

/*
 * GET /api/notifications/unread-count
 */
router.get(
  "/unread-count",
  getUnreadCount
);

/*
 * PATCH /api/notifications/read-all
 */
router.patch(
  "/read-all",
  markAllAsRead
);

/*
 * GET /api/notifications/:id
 */
router.get(
  "/:id",
  getMyNotification
);

/*
 * PATCH /api/notifications/:id/read
 *
 * Body:
 * {
 *   "version": 1
 * }
 */
router.patch(
  "/:id/read",
  markAsRead
);

/*
 * DELETE /api/notifications/:id
 *
 * Body:
 * {
 *   "version": 1
 * }
 */
router.delete(
  "/:id",
  removeMyNotification
);

export default router;