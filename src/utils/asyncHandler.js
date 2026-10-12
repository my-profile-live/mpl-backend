/**
 * Wraps an async Express route handler so any thrown error / rejected promise
 * is forwarded to the global error-handling middleware automatically.
 *
 * Usage:
 *   export const myController = asyncHandler(async (req, res) => { ... });
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;