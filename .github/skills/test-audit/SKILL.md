---
name: test-audit
description: 'Audit the test coverage of a file or feature in this FoalTS project. Use when: checking if existing tests cover real behavior; finding missing unit or e2e tests; verifying auth paths are tested; reviewing test quality not just test count; a code-review flagged test gaps.'
argument-hint: 'Optional: file or feature name to audit'
---

# Test Audit

## What This Skill Produces
A focused audit of test coverage for a file or feature:
- What is actually tested vs what only appears to be tested
- Which auth, validation, and error paths are missing
- Concrete list of missing test cases per method
- Distinction between unit and e2e gaps

## Key Principle
A test that calls a method without triggering its hooks or middleware is not testing the protected behavior — it is only testing the method body in isolation. In FoalTS, `createController()` bypasses all hooks. Tests using it cannot verify `@JwtRequired`, `@RoleRequired`, or `@PermissionRequired` behavior. Always distinguish between these two test levels.

## Procedure

### 1. Read the source file and its spec file together
Understand what the source actually does: which hooks are applied, which routes exist, which guards are in place, which validation runs.

### 2. Map each method to its test coverage
For each public method or route, list:
- Does a unit test exist?
- Does it test the happy path?
- Does it test auth failure (401/403)?
- Does it test validation failure (400)?
- Does it test edge cases (expired token, duplicate, not found)?

### 3. Identify false coverage
Flag tests that appear to cover a behavior but actually bypass it:
- Unit tests using `createController()` that check auth behavior → these do not work, hooks are skipped
- Tests that assert a 200 response without first asserting that 401 is returned without a token

### 4. List missing unit test cases
Format as a table: method name, missing scenario, expected HTTP status.

### 5. List missing E2E test cases
Format as a table: route, missing scenario, expected HTTP status.
E2E tests are the only reliable way to verify hook behavior end-to-end.

### 6. Priority table

| Priorität | Maßnahme |
|---|---|
| Jetzt | ... |
| Bald | ... |
| Optional | ... |

## Rules
- Always distinguish: "test exists but is incorrect" vs "test is missing entirely"
- Auth gaps (401, 403) are always higher priority than edge case gaps
- Do not flag missing tests for behavior that is already covered by hook-level specs (e2g. jwt-required.hook.spec.ts)
- Keep output tied to this project — reference actual file names and method names
- Start with a one-sentence verdict on the overall test quality before diving into details
