# WORK PACKET `<ID>` — `<PLAYER OUTCOME>`

> This template must be compiled. Dispatch fails if any `<PLACEHOLDER>` remains.

## Coverage

- Ledger IDs:
- Required maturity:
- Milestone:

## Player outcome

## Existing canonical foundation

## Single writer / authority / file lease

- Lease kind and ID:
- Isolated candidate workspace:
- Exact writable paths:
- Baseline/control hashes:
- Heartbeat/expiry and stale-input policy:

## Full scope

## Non-goals

## Technique or implementation profile

- Required:
- Conditional:
- Not applicable with orchestrator-approved reason:
- Forbidden:

## First vertical application

## Family / production coverage

## Technical acceptance

## Runtime and observatory acceptance

## Quality acceptance card and benchmark

- Compiled card path/hash:
- Held-out selection policy:

## Reference captures (REQUIRED — re-grounds the quality bar after every compaction)

> A compiled packet for any visual, feel, or gameplay task MUST embed at least 2 reference
> captures (actual image files) showing the specific quality being targeted, plus at least 1
> failure example. References are admired-game captures or accepted SpaceFace exemplars — never
> prose descriptions of "$30 quality." The worker sees these FIRST, before starting work, so it
> starts from the external standard rather than its own interpretation. Missing references fail
> compilation.

- Reference 1 (admired capture + exact quality to extract):
- Reference 2 (admired capture + exact quality to extract):
- Failure example (what to avoid):
- SpaceFace identity constraints (how references are adapted, not imitated):

## Observatory thresholds (REQUIRED for any task touching combat, flight, mining, world, or assets)

> The compiler pulls the relevant gates from `10_OBSERVATORY_HARD_GATES.md` and embeds them here.
> These are mechanical pass/fail thresholds — the worker cannot round them up. A gate marked
> `pending` (detector not yet implemented) is NOT a pass; it blocks until the detector exists.

- Applicable gates and thresholds:
- Required observatory route/policy/seeds:
- Performance gate class (desktop/browser/both):

## Evidence bundle

## Rejection and continuation rules

## Worker output

Allowed statuses: `submitted`, `needs_continuation`, `external_blocker_claimed`.
The worker cannot emit `accepted`, `done`, or `complete`.
The final output must validate against
`design/production/schemas/worker-submission.schema.json`.
