import {
  recordServerHeartbeat,
} from "../services/heartbeatService.js";

export const receiveServerHeartbeat = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await recordServerHeartbeat({
        serverIdValue:
          req.params.serverId,
        input: req.body,
      });

    let statusCode = 201;
    let message =
      "Heartbeat processed successfully.";

    if (result.duplicate) {
      statusCode = 200;
      message =
        "Heartbeat was already processed. No duplicate changes were made.";
    } else if (!result.stateChanged) {
      statusCode = 202;
      message =
        "Heartbeat saved for audit, but the newer monitoring state was not changed.";
    }

    res.status(statusCode).json({
      success: true,
      message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};