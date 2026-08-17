import {
  deleteMyNotification,
  getMyNotificationById,
  getMyNotifications,
  getMyUnreadCount,
  readAllMyNotifications,
  readMyNotification,
} from "../services/notificationService.js";

const getCurrentUserId = (req) =>
  Number(
    req.user?.userId ||
      req.user?.id ||
      req.user?.sub
  );

export const listMyNotifications =
  async (req, res, next) => {
    try {
      const recipientUserId =
        getCurrentUserId(req);

      const result =
        await getMyNotifications(
          recipientUserId,
          req.query
        );

      return res.status(200).json({
        success: true,
        message:
          "Notifications loaded successfully.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

export const getMyNotification =
  async (req, res, next) => {
    try {
      const recipientUserId =
        getCurrentUserId(req);

      const notification =
        await getMyNotificationById(
          recipientUserId,
          req.params.id
        );

      return res.status(200).json({
        success: true,
        message:
          "Notification loaded successfully.",
        data: {
          notification,
        },
      });
    } catch (error) {
      next(error);
    }
  };

export const getUnreadCount =
  async (req, res, next) => {
    try {
      const recipientUserId =
        getCurrentUserId(req);

      const result =
        await getMyUnreadCount(
          recipientUserId
        );

      return res.status(200).json({
        success: true,
        message:
          "Unread notification count loaded successfully.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

export const markAsRead =
  async (req, res, next) => {
    try {
      const recipientUserId =
        getCurrentUserId(req);

      const notification =
        await readMyNotification(
          recipientUserId,
          req.params.id,
          req.body?.version
        );

      return res.status(200).json({
        success: true,
        message:
          "Notification marked as read successfully.",
        data: {
          notification,
        },
      });
    } catch (error) {
      next(error);
    }
  };

export const markAllAsRead =
  async (req, res, next) => {
    try {
      const recipientUserId =
        getCurrentUserId(req);

      const result =
        await readAllMyNotifications(
          recipientUserId
        );

      return res.status(200).json({
        success: true,
        message:
          "All notifications marked as read successfully.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

export const removeMyNotification =
  async (req, res, next) => {
    try {
      const recipientUserId =
        getCurrentUserId(req);

      const result =
        await deleteMyNotification(
          recipientUserId,
          req.params.id,
          req.body?.version
        );

      return res.status(200).json({
        success: true,
        message:
          "Notification deleted successfully.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };