<!-- LIFETIME: STABLE -->
# SpaceFace bounded INFERENCE invocation

```text
INFERENCE [N] [SCOPE or WF-ID]

Current player-facing deficit:
[what ordinary play lacks]

Desired player outcome:
[what the player should perceive, decide, do, or cause]

Protected exact paths:
[only current live collisions, if any]

Read root AGENTS.md, design/program/INFERENCE_LANES.md, the relevant workflow, and the live owner.

N means sequential committed production units. Plans, tests, reviews, receipts, probes, harnesses,
and acceptance infrastructure do not count.

For each unit: choose one bounded slice, implement production, run focused checks, self-review once,
commit, record as implemented or accepted, then continue.

Do not create a candidate portfolio before unit one. Do not make two support-only commits in a row.
Do not repair a high-level harness unless one bounded repair is required for the claim this unit
actually makes. Route-unproven is an honest terminal state.

Stop at N production units, the completed product outcome, a concrete external blocker, or an
unchanged failure fingerprint. Return partial production immediately if the environment ends.
```

Compact form:

```text
INFERENCE 20 WORLD — build twenty sequential player-visible world units. Production first; focused
proof; one commit and record per unit; no acceptance-infrastructure detour.
```
