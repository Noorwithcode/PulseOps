import {
  getAlertById,
  getAlertSummary,
  listAlertEvaluations,
  listAlerts,
} from "../services/alertManagementService.js";

export const getAlerts = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await listAlerts(
        req.query
      );

    return res
      .status(200)
      .json({
        success: true,
        message:
          "Alerts loaded successfully.",
        data: result,
      });
  } catch (error) {
    next(error);
  }
};

export const getAlertsSummary =
  async (
    req,
    res,
    next
  ) => {
    try {
      const summary =
        await getAlertSummary();

      return res
        .status(200)
        .json({
          success: true,
          message:
            "Alert summary loaded successfully.",
          data: {
            summary,
          },
        });
    } catch (error) {
      next(error);
    }
  };

export const getAlert =
  async (
    req,
    res,
    next
  ) => {
    try {
      const alert =
        await getAlertById(
          req.params.id
        );

      return res
        .status(200)
        .json({
          success: true,
          message:
            "Alert loaded successfully.",
          data: {
            alert,
          },
        });
    } catch (error) {
      next(error);
    }
  };

export const getAlertEvaluations =
  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await listAlertEvaluations({
          alertStateIdValue:
            req.params.id,
          query:
            req.query,
        });

      return res
        .status(200)
        .json({
          success: true,
          message:
            "Alert evaluations loaded successfully.",
          data: result,
        });
    } catch (error) {
      next(error);
    }
  };