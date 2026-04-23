import { HttpResponseBadRequest } from '@foal/core';
import { ZodSchema, ZodError } from 'zod';

type ValidationSuccess<T> = { data: T; error?: never };
type ValidationFailure = { data?: never; error: HttpResponseBadRequest };
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Parse and validate a request body against a Zod schema.
 *
 * Returns `{ data }` on success, or `{ error }` (an HttpResponseBadRequest with
 * standardised error details) when validation fails.
 * Any non-Zod error is re-thrown so it bubbles up as an unexpected server error.
 *
 * @example
 * const result = validateBody(loginSchema, ctx.request.body);
 * if (result.error) return result.error;
 * // result.data is fully typed here
 */
export function validateBody<T>(schema: ZodSchema<T>, body: unknown): ValidationResult<T> {
  try {
    const data = schema.parse(body);
    return { data };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        error: new HttpResponseBadRequest({
          error: 'Validation failed',
          details: err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        }),
      };
    }
    throw err;
  }
}
