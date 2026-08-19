# AGENTS

## Scope
This folder contains FoalTS controllers for API endpoints.

## Rules
- Keep controller methods focused on request handling, validation, and response creation.
- Do not place business logic directly in controller methods.
- Reuse the existing validation utilities and request schemas.
- Keep endpoint behavior consistent with established patterns in the app.
- Return clear, predictable HTTP response objects.
- Avoid leaking raw internal state or implementation details in responses.

## Auth conventions
- Follow the existing auth controller patterns and JWT flow.
- For protected routes, rely on hook-based authorization rather than ad hoc checks inside handlers.

## Testing
- Update or add tests when an endpoint contract changes.
- Include success and failure scenarios, especially validation and auth edge cases.