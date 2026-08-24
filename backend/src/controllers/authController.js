import {
  loginUser,
  refreshUserSession,
  logoutUser,
} from "../services/authService.js";

/*
 * =========================================================
 * REFRESH TOKEN COOKIE CONFIG
 * =========================================================
 */

const REFRESH_COOKIE_NAME =
  "pulseops_refresh_token";

const getRefreshCookieOptions = () => {
  const expiryDays = Number(
    process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7
  );

  if (
    !Number.isInteger(expiryDays) ||
    expiryDays < 1 ||
    expiryDays > 30
  ) {
    throw new Error(
      "REFRESH_TOKEN_EXPIRES_DAYS must be between 1 and 30."
    );
  }

  const isProduction =
    process.env.NODE_ENV === "production";

  return {
    httpOnly: true,

    /*
     * Production:
     * Render backend uses HTTPS.
     */
    secure: isProduction,

    /*
     * Local development:
     *   sameSite = lax
     *
     * Production:
     *   Vercel frontend and Render backend
     *   are on different domains, therefore
     *   SameSite=None is required.
     */
    sameSite: isProduction
      ? "none"
      : "lax",

    /*
     * Cookie is only available
     * under authentication endpoints.
     */
    path: "/api/auth",

    maxAge:
      expiryDays *
      24 *
      60 *
      60 *
      1000,
  };
};

/*
 * =========================================================
 * LOGIN
 *
 * POST /api/auth/login
 * =========================================================
 */

export const login = async (
  req,
  res,
  next
) => {
  try {
    const authentication =
      await loginUser({
        email:
          req.body?.email,

        password:
          req.body?.password,

        ipAddress:
          req.ip,

        userAgent:
          req.get("user-agent") ||
          null,
      });

    /*
     * Refresh token must never be sent
     * inside the normal JSON response.
     *
     * It is stored only inside an
     * HTTP-only secure cookie.
     */
    const {
      refreshToken,
      ...safeAuthentication
    } = authentication;

    res.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken,
      getRefreshCookieOptions()
    );

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Login successful.",

        data:
          safeAuthentication,
      });
  } catch (error) {
    next(error);
  }
};

/*
 * =========================================================
 * CURRENT AUTHENTICATED USER
 *
 * GET /api/auth/me
 * =========================================================
 */

export const getCurrentUser = (
  req,
  res
) => {
  return res
    .status(200)
    .json({
      success: true,

      message:
        "Authenticated user retrieved successfully.",

      data: {
        user:
          req.user,
      },
    });
};

/*
 * =========================================================
 * REFRESH ACCESS TOKEN
 *
 * POST /api/auth/refresh
 *
 * Refresh token is read only from:
 *
 * pulseops_refresh_token
 *
 * HTTP-only cookie.
 * =========================================================
 */

export const refreshAccessToken =
  async (
    req,
    res,
    next
  ) => {
    try {
      const refreshToken =
        req.cookies?.[
          REFRESH_COOKIE_NAME
        ];

      const authentication =
        await refreshUserSession({
          refreshToken,

          ipAddress:
            req.ip,

          userAgent:
            req.get(
              "user-agent"
            ) || null,
        });

      /*
       * Refresh token rotation.
       *
       * The previous refresh token
       * becomes invalid and a new
       * refresh token is stored.
       */
      const {
        refreshToken:
          rotatedRefreshToken,

        ...safeAuthentication
      } = authentication;

      res.cookie(
        REFRESH_COOKIE_NAME,
        rotatedRefreshToken,
        getRefreshCookieOptions()
      );

      return res
        .status(200)
        .json({
          success: true,

          message:
            "Access token refreshed successfully.",

          data:
            safeAuthentication,
        });
    } catch (error) {
      /*
       * Missing, invalid or expired
       * refresh token should also
       * remove the browser cookie.
       */

      const {
        maxAge,
        ...clearCookieOptions
      } =
        getRefreshCookieOptions();

      res.clearCookie(
        REFRESH_COOKIE_NAME,
        clearCookieOptions
      );

      next(error);
    }
  };

/*
 * =========================================================
 * LOGOUT
 *
 * POST /api/auth/logout
 * =========================================================
 */

export const logout = async (
  req,
  res,
  next
) => {
  const {
    maxAge,
    ...clearCookieOptions
  } =
    getRefreshCookieOptions();

  try {
    /*
     * Refresh token is taken
     * from the HTTP-only cookie.
     */
    const refreshToken =
      req.cookies?.[
        REFRESH_COOKIE_NAME
      ];

    await logoutUser({
      refreshToken,
    });

    /*
     * Remove refresh cookie.
     */
    res.clearCookie(
      REFRESH_COOKIE_NAME,
      clearCookieOptions
    );

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Logout successful.",
      });
  } catch (error) {
    /*
     * Even if database revoke fails,
     * browser cookie should be removed.
     */
    res.clearCookie(
      REFRESH_COOKIE_NAME,
      clearCookieOptions
    );

    next(error);
  }
};