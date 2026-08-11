/**
 * Base class for all application-level errors.
 *
 * Extends the native Error with an HTTP status code and an `isOperational` flag.
 * Operational errors are expected runtime conditions (e.g. bad input, not found)
 * and are safe to expose to the client. Non-operational errors are unexpected
 * programmer mistakes and should only be logged server-side.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintain a correct prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 400 Bad Request – input failed schema / business-rule validation.
 * Optionally carries a `details` array with per-field error messages.
 */
export class ValidationError extends AppError {
  constructor(
    message: string = 'Validation failed',
    readonly details?: { field: string; message: string }[]
  ) {
    super(400, message);
  }
}

/** 404 Not Found – the requested resource could not be located. */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, message);
  }
}

/** 401 Unauthorized – authentication is required or has failed. */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
  }
}

/** 403 Forbidden – the caller is authenticated but lacks the required permission. */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
  }
}

/** 409 Conflict – the request conflicts with the current state of the resource. */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(409, message);
  }
}
