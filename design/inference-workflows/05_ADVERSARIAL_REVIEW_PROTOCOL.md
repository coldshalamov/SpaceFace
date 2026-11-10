<!-- LIFETIME: STABLE -->
# Bounded adversarial review

Review protects the player, but review is support work. It must not become a recursive institution or
a prerequisite to beginning production.

## Default review

The implementer remains responsible for reviewing the production change and its direct verification.
Self-review is disclosed, but it is valid.

A separate cold reviewer is required only when:

- the user explicitly requests one;
- an active packet explicitly requires one;
- the change alters a high-risk architecture, save/determinism contract, core control feel, or
  previously human-accepted hero work;
- the agent claims whole-slice or milestone acceptance.

The absence of a separate reviewer is never a blocker for recording an `implemented` unit.

## Evidence

Review the actual diff and the narrowest evidence supporting the claim. Do not award credit for code
volume, process difficulty, test count, or paperwork. Do not require a beauty render when the claim is
behavioral, or a browser campaign when an owner-level regression proves the narrower claim.

## Questions

1. What changed for the player?
2. Can the claimed behavior be reached through the live owner?
3. What evidence could falsify it?
4. Is it distinct from existing behavior?
5. Did the change create a new regression?
6. What is the single largest in-scope causal defect?

## Verdicts

- `APPROVE_IMPLEMENTED` — production is coherent; route acceptance may remain unproven.
- `APPROVE_ACCEPTED` — current ordinary-route evidence supports the player-facing claim.
- `REVISE` — one bounded causal repair is needed.
- `REBUILD` — the implementation model is wrong; preserve useful evidence and stop patching it.
- `CUT` — the premise is redundant or harmful.

## Finite review boundary

Review continues only while a named unresolved finding could materially change the result, minimum
fix, or significant risk. Verify a repair at the layer relevant to that finding; do not restart a
general audit afterward. Unrelated discoveries are follow-ups unless they invalidate the current
unit's core claim.

Repeated unsuccessful repairs of the same causal defect require changing the implementation model,
cutting the unit, or recording a blocker. They do not justify more reviewers or new acceptance
infrastructure by themselves.

## Portfolio review

Portfolio review is optional and occurs only after multiple production units exist. It never blocks
individual units from being recorded as implemented. A reel or fresh review panel is required only
when the user or an active milestone explicitly asks for it.

## Review record

A review file is optional metadata. `scripts/inference-record.mjs` requires a production commit for
implemented/accepted live units; it does not require a separate reviewer. `accepted` additionally
requires current evidence. This keeps product truth and reviewer availability separate.
