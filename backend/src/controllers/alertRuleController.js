import {
  changeAlertRuleStatus,
  createAlertRule,
  deleteAlertRule,
  getAlertRuleById,
  listAlertRules,
  listAlertRuleStates,
  modifyAlertRule,
} from "../services/alertRuleManagementService.js";

const getActorUserId = (req) =>
  Number(
    req.user?.userId ||
      req.user?.id ||
      req.user?.sub
  );

export const createRule = async (
  req,
  res,
  next
) => {
  try {
    const rule = await createAlertRule({
      input: req.body,

      actorUserId:
        getActorUserId(req),
    });

    return res.status(201).json({
      success: true,
      message:
        "Alert rule created successfully.",

      data: {
        rule,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRules = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await listAlertRules(req.query);

    return res.status(200).json({
      success: true,
      message:
        "Alert rules loaded successfully.",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getRule = async (
  req,
  res,
  next
) => {
  try {
    const rule =
      await getAlertRuleById(
        req.params.id
      );

    return res.status(200).json({
      success: true,
      message:
        "Alert rule loaded successfully.",

      data: {
        rule,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateRule = async (
  req,
  res,
  next
) => {
  try {
    const rule = await modifyAlertRule({
      ruleIdValue: req.params.id,
      input: req.body,

      actorUserId:
        getActorUserId(req),
    });

    return res.status(200).json({
      success: true,
      message:
        "Alert rule updated successfully.",

      data: {
        rule,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateRuleStatus = async (
  req,
  res,
  next
) => {
  try {
    const rule =
      await changeAlertRuleStatus({
        ruleIdValue: req.params.id,
        input: req.body,

        actorUserId:
          getActorUserId(req),
      });

    return res.status(200).json({
      success: true,

      message: `Alert rule ${
        rule.isEnabled
          ? "enabled"
          : "disabled"
      } successfully.`,

      data: {
        rule,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const removeRule = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await deleteAlertRule({
        ruleIdValue: req.params.id,
        versionValue:
          req.body?.version,

        actorUserId:
          getActorUserId(req),
      });

    return res.status(200).json({
      success: true,
      message:
        "Alert rule deleted successfully.",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getRuleStates = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await listAlertRuleStates({
        ruleIdValue: req.params.id,
        query: req.query,
      });

    return res.status(200).json({
      success: true,
      message:
        "Alert-rule states loaded successfully.",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};