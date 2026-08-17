import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

const rateLimitHandler = (
  _req,
  res,
  _next,
  options
) => {
  res.status(options.statusCode).json({
    success: false,
    message:
      "Too many requests. Please try again later.",
  });
};

export const securityHeaders = helmet();

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitHandler,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (
    _req,
    res
  ) => {
    res.status(429).json({
      success: false,
      message:
        "Too many login attempts. Please try again after 15 minutes.",
    });
  },
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitHandler,
});