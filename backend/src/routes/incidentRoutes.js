import express from "express";

import {
  createIncident,
  listIncidents,
  getIncident,
  getTimeline,
  acknowledge,
  assign,
  unassign,
  changeSeverity,
  resolve,
  close,
  reopen,
  addComment,
} from "../controllers/incidentController.js";

import {
  protect,
} from "../middleware/authMiddleware.js";

const router =
  express.Router();

/*
 * =========================================================
 * ROLE HELPERS
 * =========================================================
 */

const getCurrentRoleCode = (
  req
) => {
  const roleCode =
    req.user?.role?.code ||
    req.user?.roleCode ||
    req.user?.role;

  return String(
    roleCode || ""
  )
    .trim()
    .toUpperCase();
};

const requireRoles =
  (...allowedRoles) =>
    (
      req,
      res,
      next
    ) => {
      const currentRole =
        getCurrentRoleCode(
          req
        );

      const normalizedAllowedRoles =
        allowedRoles.map(
          (role) =>
            String(role)
              .trim()
              .toUpperCase()
        );

      if (
        !normalizedAllowedRoles.includes(
          currentRole
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You do not have permission to perform this incident action.",
          });
      }

      next();
    };

/*
 * All incident routes require
 * authentication first.
 */
router.use(
  protect
);

/*
 * =========================================================
 * READ ROUTES
 *
 * Any authenticated user may view incidents.
 * =========================================================
 */

router.get(
  "/",
  listIncidents
);

router.get(
  "/:id/timeline",
  getTimeline
);

router.get(
  "/:id",
  getIncident
);

/*
 * =========================================================
 * WRITE / MANAGEMENT ROUTES
 *
 * Current strict policy:
 * ADMIN only.
 *
 * Later, when OPERATOR/NOC/etc roles are formally
 * added, we can safely expand allowed roles here.
 * =========================================================
 */

const requireIncidentManager =
  requireRoles(
    "ADMIN",
    "RESPONDER"
  );

/*
 * Create manual incident.
 */
router.post(
  "/",
  requireIncidentManager,
  createIncident
);

/*
 * Acknowledge incident.
 */
router.patch(
  "/:id/acknowledge",
  requireIncidentManager,
  acknowledge
);

/*
 * Assign incident.
 */
router.patch(
  "/:id/assign",
  requireIncidentManager,
  assign
);

/*
 * Remove assignment.
 */
router.patch(
  "/:id/unassign",
  requireIncidentManager,
  unassign
);

/*
 * Change severity.
 */
router.patch(
  "/:id/severity",
  requireIncidentManager,
  changeSeverity
);

/*
 * Resolve incident.
 */
router.patch(
  "/:id/resolve",
  requireIncidentManager,
  resolve
);

/*
 * Close incident.
 */
router.patch(
  "/:id/close",
  requireIncidentManager,
  close
);

/*
 * Reopen incident.
 */
router.patch(
  "/:id/reopen",
  requireIncidentManager,
  reopen
);

/*
 * Add incident comment.
 */
router.post(
  "/:id/comments",
  requireIncidentManager,
  addComment
);

export default router;