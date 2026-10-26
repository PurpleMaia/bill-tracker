/**
 * Rate limits shared by an operation's two transports (API route and server
 * action), so flipping the data-client transport never changes the budget.
 * Route files may only export handlers, hence this module.
 */

/** Forgot-password requests per client IP. */
export const FORGOT_PASSWORD_RATE_LIMIT = { limit: 5, windowMs: 15 * 60_000 };
