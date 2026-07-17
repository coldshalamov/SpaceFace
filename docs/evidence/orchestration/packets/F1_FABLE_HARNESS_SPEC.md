# Packet F1 — Fable: Natural-route harness architecture spec

## Mission

Write the **one-page contract** for the shared unassisted-route driver (Fable F0 §5.1 / W2 task 5).  
No large implementation — architecture decision only so Codex builds once for R1/R2/E1/SP1/GT1.

## Read first (packed)

- `docs/evidence/orchestration/returns/F0_FABLE_ADVISOR_RETURN.md` §3 W2, §5.1
- `docs/evidence/orchestration/context/NATURAL_WRECK_PATH.md`
- `docs/evidence/orchestration/CONTEXT_BRIEF_FOR_AGENTS.md`

## Write to

`docs/evidence/orchestration/returns/F1_NATURAL_ROUTE_HARNESS_SPEC.md`

## Spec must define

1. Public-input vocabulary (keyboard intents only; no SF state injection for primary)
2. Seed policy (≥5 held-out seeds; when 2 is enough for CI)
3. Compression rules (what is forbidden; what may be labeled supporting)
4. Evidence JSON shape
5. Browser vs Electron switch
6. Pass/fail semantics per content class (wreck, encounter, set-piece, golden thread)
7. Reuse API shape for scripts (pseudo-API is fine)
8. How D10 teaching path anchors the first-hour

## Do not

- Implement the full driver (Codex C1/C2 does that after this)
- Edit design/program status
