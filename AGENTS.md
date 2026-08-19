# AGENTS

## Project intent
This repository is a FoalTS backend with TypeScript, TypeORM, and PostgreSQL for the application runtime. The project is intentionally structured around framework-native patterns and small, readable domain boundaries.

## Core principles
- Prefer existing project patterns over generic Node.js solutions.
- Keep the codebase framework-aligned and easy to reason about.
- Favor small, reviewable changes over broad refactors or speculative abstractions.
- Before introducing a new abstraction, check the nearest matching pattern in the repo.
- Do not add complexity unless it clearly serves a real requirement.

## Architecture expectations
- Controllers handle HTTP concerns: request parsing, validation, service calls, and response shaping.
- Hooks handle request-level guards such as auth, permission, and role checks.
- Services contain reusable business logic.
- Entities are TypeORM models and should stay focused on persistence concerns.
- Validators and utils should be reused instead of reimplemented per route.
- Auth and authorization flows should follow the existing FoalTS and JWT patterns already present in the project.

## Validation and quality
- Validate incoming payloads with Zod schemas and existing helper utilities before processing.
- Return consistent FoalTS HTTP response objects and clear error payloads.
- Keep tests behavior-driven and real: use Mocha and Supertest for API-level validation.
- Add tests for changed behavior, especially for auth, validation, and error paths.

## Comments and documentation
- Add comments only when intent, tradeoff, or framework-specific flow is not obvious.
- Do not add comments that merely restate what the code already says.
- Prefer explanatory comments that clarify why a pattern exists or why a constraint matters.

## Execution and verification
Use the project scripts for validation:
- npm run build:test
- npm run setup:test-db
- npm run start:test
- npm run build:e2e
- npm run start:e2e
- npm run e2e
- npm run lint
- npm run lint:fix
- npm run format:check
- npm run format
- npm run db
- npm run db:start
- npm run db:stop
- npm run db:restart
- npm run db:status
- npm run db:logs
- npm run backendDev

## Working style
- Keep imports organized and consistent with the repo’s current style.
- Prefer readable, explicit code over clever abstraction.
- If functionality is not needed yet, defer it rather than overbuilding.
- Keep changes aligned with the current project maturity and avoid solving future problems before they exist.