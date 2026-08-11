// std
import { strictEqual, ok, deepStrictEqual } from 'assert';

// 3p
import { isHttpResponseBadRequest } from '@foal/core';
import { z } from 'zod';

// App
import { validateBody } from './validate-body';

const testSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().positive('Age must be positive'),
});

describe('validateBody', () => {
  it('should return parsed data when the body is valid.', () => {
    const result = validateBody(testSchema, { name: 'Alice', age: 30 });

    ok(!result.error, 'Should not return an error');
    deepStrictEqual(result.data, { name: 'Alice', age: 30 });
  });

  it('should return an HttpResponseBadRequest when a required field is missing.', () => {
    const result = validateBody(testSchema, { age: 30 });

    ok(!result.data, 'Should not return data');
    ok(isHttpResponseBadRequest(result.error), 'Should return an HttpResponseBadRequest');

    const body = result.error.body;
    strictEqual(body.error, 'Validation failed');
    ok(Array.isArray(body.details), 'Should include details array');
  });

  it('should include field path and message in each validation detail.', () => {
    const result = validateBody(testSchema, { name: '', age: -1 });

    ok(isHttpResponseBadRequest(result.error));

    const body = result.error.body;
    ok(body.details.length >= 1, 'Should have at least one detail');
    ok(body.details.every((d: any) => 'field' in d && 'message' in d));
  });

  it('should re-throw non-Zod errors.', () => {
    const throwingSchema = z.object({}).transform(() => {
      throw new TypeError('unexpected');
    });

    let threw = false;
    try {
      validateBody(throwingSchema, {});
    } catch (err) {
      threw = true;
      ok(err instanceof TypeError);
    }
    ok(threw, 'Expected a TypeError to be re-thrown');
  });
});
