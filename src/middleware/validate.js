import { ApiError } from "../utils/ApiError.js";

/**
 * Validates req.body against a Zod schema, replacing req.body with the
 * parsed (and coerced/defaulted) result on success.
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      throw new ApiError(400, "Validation failed.", details);
    }
    req.body = result.data;
    next();
  };
}
