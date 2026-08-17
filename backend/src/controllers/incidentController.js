import {
  createManualIncident,
  getIncidents,
  getIncidentById,
  getIncidentTimeline,
  acknowledgeIncidentById,
  assignIncidentById,
  unassignIncidentById,
  changeIncidentSeverity,
  resolveIncidentById,
  closeIncidentById,
  reopenIncidentById,
  addIncidentComment,
} from "../services/incidentService.js";

/*
 * =========================================================
 * AUTHENTICATED USER HELPER
 * =========================================================
 */

const getCurrentUserId = (
  req
) =>
  Number(
    req.user?.userId ||
      req.user?.id ||
      req.user?.sub
  );

/*
 * =========================================================
 * CREATE MANUAL INCIDENT
 * POST /api/incidents
 * =========================================================
 */

export const createIncident =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const result =
        await createManualIncident(
          {
            serverId:
              req.body.serverId,

            incidentType:
              req.body
                .incidentType,

            title:
              req.body.title,

            description:
              req.body
                .description,

            severity:
              req.body.severity,

            assignedTo:
              req.body
                .assignedTo,

            actorUserId,

            idempotencyKey:
              req.get(
                "Idempotency-Key"
              ),
          }
        );

      res.set(
        "Idempotency-Key",
        result.idempotencyKey
      );

      res.set(
        "Idempotency-Replayed",
        String(
          result.replayed
        )
      );

      return res
        .status(
          result.replayed
            ? 200
            : 201
        )
        .json({
          success: true,

          message:
            result.replayed
              ? "Manual incident request replayed successfully."
              : "Manual incident created successfully.",

          data: {
            incident:
              result.incident,

            idempotency: {
              key:
                result.idempotencyKey,

              replayed:
                result.replayed,
            },
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * LIST INCIDENTS
 * GET /api/incidents
 * =========================================================
 */

export const listIncidents =
  async (
    req,
    res,
    next
  ) => {
    try {
      const data =
        await getIncidents(
          req.query
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incidents loaded successfully.",

          data,
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * GET INCIDENT DETAILS
 * GET /api/incidents/:id
 * =========================================================
 */

export const getIncident =
  async (
    req,
    res,
    next
  ) => {
    try {
      const incident =
        await getIncidentById(
          req.params.id
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident loaded successfully.",

          data: {
            incident,
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * GET INCIDENT TIMELINE
 * GET /api/incidents/:id/timeline
 * =========================================================
 */

export const getTimeline =
  async (
    req,
    res,
    next
  ) => {
    try {
      const data =
        await getIncidentTimeline(
          req.params.id
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident timeline loaded successfully.",

          data,
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * ACKNOWLEDGE
 * PATCH /api/incidents/:id/acknowledge
 * =========================================================
 */

export const acknowledge =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const incident =
        await acknowledgeIncidentById(
          {
            incidentId:
              req.params.id,

            actorUserId,

            version:
              req.body.version,
          }
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident acknowledged successfully.",

          data: {
            incident,
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * ASSIGN
 * PATCH /api/incidents/:id/assign
 * =========================================================
 */

export const assign =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const incident =
        await assignIncidentById(
          {
            incidentId:
              req.params.id,

            assignedTo:
              req.body
                .assignedTo,

            actorUserId,

            version:
              req.body.version,
          }
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident assigned successfully.",

          data: {
            incident,
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * UNASSIGN
 * PATCH /api/incidents/:id/unassign
 * =========================================================
 */

export const unassign =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const incident =
        await unassignIncidentById(
          {
            incidentId:
              req.params.id,

            actorUserId,

            version:
              req.body.version,
          }
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident unassigned successfully.",

          data: {
            incident,
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * CHANGE SEVERITY
 * PATCH /api/incidents/:id/severity
 * =========================================================
 */

export const changeSeverity =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const incident =
        await changeIncidentSeverity(
          {
            incidentId:
              req.params.id,

            severity:
              req.body.severity,

            actorUserId,

            version:
              req.body.version,
          }
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident severity updated successfully.",

          data: {
            incident,
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * RESOLVE
 * PATCH /api/incidents/:id/resolve
 * =========================================================
 */

export const resolve =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const incident =
        await resolveIncidentById(
          {
            incidentId:
              req.params.id,

            actorUserId,

            version:
              req.body.version,

            resolutionNotes:
              req.body
                .resolutionNotes,
          }
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident resolved successfully.",

          data: {
            incident,
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * CLOSE
 * PATCH /api/incidents/:id/close
 * =========================================================
 */

export const close =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const incident =
        await closeIncidentById(
          {
            incidentId:
              req.params.id,

            actorUserId,

            version:
              req.body.version,
          }
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident closed successfully.",

          data: {
            incident,
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * REOPEN
 * PATCH /api/incidents/:id/reopen
 * =========================================================
 */

export const reopen =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const incident =
        await reopenIncidentById(
          {
            incidentId:
              req.params.id,

            actorUserId,

            version:
              req.body.version,

            reason:
              req.body.reason,
          }
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Incident reopened successfully.",

          data: {
            incident,
          },
        });
    } catch (error) {
      next(error);
    }
  };

/*
 * =========================================================
 * ADD COMMENT
 * POST /api/incidents/:id/comments
 * =========================================================
 */

export const addComment =
  async (
    req,
    res,
    next
  ) => {
    try {
      const actorUserId =
        getCurrentUserId(
          req
        );

      const data =
        await addIncidentComment(
          {
            incidentId:
              req.params.id,

            actorUserId,

            version:
              req.body.version,

            comment:
              req.body.comment,
          }
        );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Incident comment added successfully.",

          data,
        });
    } catch (error) {
      next(error);
    }
  };