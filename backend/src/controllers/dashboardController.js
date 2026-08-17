import {
  getDashboardOverview,
} from "../services/dashboardService.js";

const optionalPositiveInteger = (
  value,
  fallback,
  maximum
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(parsed, maximum);
};

export const getOverview =
  async (
    req,
    res,
    next
  ) => {
    try {
      const recentIncidentLimit =
        optionalPositiveInteger(
          req.query.recentIncidentLimit,
          10,
          50
        );

      const serverHealthLimit =
        optionalPositiveInteger(
          req.query.serverHealthLimit,
          10,
          50
        );

      const dashboard =
        await getDashboardOverview({
          recentIncidentLimit,
          serverHealthLimit,
        });

      return res.status(200).json({
        success: true,
        message:
          "Dashboard overview loaded successfully.",
        data: dashboard,
      });
    } catch (error) {
      next(error);
    }
  };