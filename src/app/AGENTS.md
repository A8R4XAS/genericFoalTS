**# AGENTS

## Scope
This folder contains the app layer: controllers, hooks, services, entities, validators, and related logic.

## Conventions
- Keep domain logic separated by responsibility.
- Controllers should remain thin and focused on HTTP concerns.
- Hooks should be used for authorization and request-level checks.
- Services should contain business logic and domain operations.
- Entities should represent database models and persistence structure, not application orchestration.
- Reuse validators and helpers already used in the project.

## Preferred flow
- Validate input
- Resolve or guard the request
- Call a service if business logic is needed
- Return a proper Foal response

## Quality bar
- Prefer patterns already established in this app over introducing new abstractions.
- When in doubt, follow the nearest existing feature or route.
- Keep changes minimal and in line with the current architecture.**