import { ApiError } from "../utils/ApiError.js";

export function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let { statusCode, message } = err;

  // Mongoose validation error
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(", ");
  }
  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    message = `An account with this ${field} already exists.`;
  }
  // Mongoose bad ObjectId — do not echo the raw value back to the client.
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid id.";
  }

  statusCode = statusCode || 500;
  message = message || "Internal server error";

  if (!err.isOperational || statusCode >= 500) {
    console.error("[unhandled error]", err);
  }

  if (!err.isOperational && statusCode >= 500) {
    message = "Internal server error";
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    details: err.isOperational ? err.details || undefined : undefined,
  });
}
