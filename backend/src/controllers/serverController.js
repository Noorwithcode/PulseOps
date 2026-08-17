import {
  changeServerStatus,
  createServer,
  deleteServerSafely,
  getServerById,
  listServers,
  restoreServerSafely,
  updateServerDetails,
} from "../services/serverService.js";


export const registerServer = async (
  req,
  res,
  next
) => {
  try {
    const server = await createServer({
      input: req.body,
      createdBy:
        req.user?.id ||
        req.user?.userId ||
        req.user?.sub,
    });

    res.status(201).json({
      success: true,
      message: "Server registered successfully.",
      data: {
        server,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getServers = async (
  req,
  res,
  next
) => {
  try {
    const result = await listServers(
      req.query
    );

    res.status(200).json({
      success: true,
      message: "Servers retrieved successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getServerDetails = async (
  req,
  res,
  next
) => {
  try {
    const server = await getServerById(
      req.params.serverId
    );

    res.status(200).json({
      success: true,
      message: "Server retrieved successfully.",
      data: {
        server,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateServer = async (
  req,
  res,
  next
) => {
  try {
    const server =
      await updateServerDetails({
        serverIdValue:
          req.params.serverId,
        input: req.body,
      });

    res.status(200).json({
      success: true,
      message:
        "Server updated successfully.",
      data: {
        server,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateServerStatus = async (
  req,
  res,
  next
) => {
  try {
    const server =
      await changeServerStatus({
        serverIdValue:
          req.params.serverId,
        input: req.body,
      });

    res.status(200).json({
      success: true,
      message:
        "Server status updated successfully.",
      data: {
        server,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteServer = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await deleteServerSafely({
        serverIdValue:
          req.params.serverId,
        input: req.body,
      });

    res.status(200).json({
      success: true,
      message:
        "Server deleted successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const restoreServer = async (
  req,
  res,
  next
) => {
  try {
    const server =
      await restoreServerSafely({
        serverIdValue:
          req.params.serverId,
        input: req.body,
      });

    res.status(200).json({
      success: true,
      message:
        "Server restored successfully.",
      data: {
        server,
      },
    });
  } catch (error) {
    next(error);
  }
};