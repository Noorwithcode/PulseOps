import AppError from "../utils/AppError.js";

export const authorizeRoles =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError(
          401,
          "Authentication is required."
        )
      );
    }

    const userRoleCode =
      req.user?.roleCode ||
      req.user?.role?.code;

    if (!userRoleCode) {
      return next(
        new AppError(
          403,
          "User role information is unavailable."
        )
      );
    }

    const normalizedUserRole =
      String(userRoleCode).toUpperCase();

    const normalizedAllowedRoles =
      allowedRoles.map((role) =>
        String(role).toUpperCase()
      );

    if (
      !normalizedAllowedRoles.includes(
        normalizedUserRole
      )
    ) {
      return next(
        new AppError(
          403,
          "You do not have permission to perform this action."
        )
      );
    }

    next();
  };