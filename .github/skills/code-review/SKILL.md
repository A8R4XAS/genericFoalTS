---
name: code-review
description: 'Review a file or feature for structure, project fit, and test coverage in this FoalTS project. Use when: reviewing a controller, hook, service, or entity; auditing test gaps; checking if logic belongs in the current layer; evaluating project maturity fit.'
argument-hint: 'Optional: name of file or feature to review'
---

# Code Review

## What This Skill Produces
A structured review of a file or feature covering:
- A short TL;DR verdict
- Layer correctness (what should move to a service, hook, or elsewhere)
- Test coverage gaps, ordered by priority
- Clear separation of "fix now" vs "defer"

## Procedure

### 1. TL;DR
Always start with 1–3 sentences: overall verdict on structure and the most urgent finding.

### 2. Was ist für jetzt okay
List what is acceptable given the current project maturity. Avoid flagging things that would constitute over-engineering to fix at this stage.

### 3. Was gehört woanders hin
Identify code that violates the FoalTS layer contract:
- Business logic that belongs in a Service
- Domain checks that belong in a Hook
- Duplicated patterns that should be consolidated

For each item, name the pattern and explain why it belongs elsewhere. Be concrete — reference the actual code, not general principles.

### 4. Was fehlt an Tests
List missing test cases in two groups:

**Unit Tests** — what is not covered at the method level  
**E2E Tests** — what full flows are missing end-to-end

Order both lists by priority: auth failures and validation gaps first, edge cases second, optional coverage last.

### 5. Prioritätsliste
End with a table:

| Priorität | Maßnahme |
|---|---|
| Jetzt | ... |
| Bald | ... |
| Später / Optional | ... |

## Rules
- Always start with the TL;DR. Never skip it.
- Keep all recommendations tied to this project and its FoalTS patterns — not generic Node.js advice.
- Do not recommend Service extraction unless the same logic is duplicated or is genuinely reusable.
- Separate "fix now" from "defer" in every section, not just the table.
- Do not flag issues that are intentional patterns already established in the project (e.g. direct DB access in controllers is acceptable at current maturity).