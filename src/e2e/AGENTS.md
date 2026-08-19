# AGENTS

## Scope
This folder contains end-to-end tests for the application API.

## Rules
- E2E tests should validate real user-facing flows through the application.
- Use realistic requests and assert on HTTP behavior, not internal implementation details.
- Prefer the same request patterns the client would use.
- Keep database state isolated between tests.
- Focus on full flows: registration, login, token refresh, protected routes, validation failures, and auth failures.

## Expectations
- Test real API behavior and status codes.
- Reuse the project’s existing setup and app factory patterns.
- Do not mock a large part of the system in E2E tests.
- If a feature is added or changed, add the relevant E2E coverage.