# AGENTS

## Scope
This folder contains request hooks and authorization guards.

## Rules
- Hooks should handle request-level validation, auth, and permission checks.
- Keep hooks small and predictable.
- Return a consistent unauthorized or forbidden error when access is denied.
- Attach necessary user context to the request in the same way used across the project.
- Do not implement domain logic inside hooks.
- Prefer reusing the existing hook patterns already in the project.

## Important patterns
- JWT validation belongs in a dedicated hook.
- Permission and role checks should remain explicit and readable.
- Hook behavior should be easy to test in isolation with existing hook specs.