# Task FIX2 — repair the four MAJOR findings from the campaign review (review batch 2)

Read first: `_constraints-codex.md`. An independent xhigh review of the campaign's landed
commits verified 15 and returned four MAJOR player-facing findings. Fix exactly these four;
each with a pinning test that reproduces the reported failure first.

1. **[P1] Wire nursery relocation to a player-accessible action**
   (`src/systems/alienEcology.js:150-153`, from M24/row 355): relocation has no production
   caller — nothing emits `alienEcology:relocateSite`, the substrate ribs are static bodies, so
   players cannot perform either the gentle or the rushed move; the tests bypass the missing
   route by emitting the event directly. Add the reachable player route the brief intended
   (brief: `design/finish-expansion-2026-09/missions/M24.md` — observe, lure, divert, protect;
   the move is a staged tow: the player tows/drags the substrate, or a machine job moves it —
   use the ordinary tether/interaction surface; do not invent a new UI screen).

2. **[P2] Retire Foundry prompts when the workpiece is lost**
   (`src/systems/machineWork.js:207-208`, from M29/row 352): after the Foundry protocol prompt
   opens, destroying its ballast marks the job lost and returns before the lifecycle check, so
   `offerFoundryProtocol` never closes the decision — the untimed chip stays until dismissed or
   sector change. Run prompt retirement independently of the live-workpiece path; cover the
   destroy-then-leave case.

3. **[P2] Preserve the first refusal cue when no whole cargo unit fits**
   (`src/audio/audioSystem.js:4937-4940`, from INST-36): cargo admission floors available space
   to whole units, but the latch requires volume to reach the exact cap — e.g. 2.8 of 3 units
   used, next pickup refused, no cue at all. Deduplicate the first capacity refusal without
   requiring exact fill; keep the one-cue-per-crossing law.

4. **[P2] Use debt-specific wording for partial restitution deliveries**
   (`src/systems/missions.js:8437-8441`, from M13/row 349): custody-recovery jobs fall through
   to the generic partial-freight message that says the remainder was "written off" while
   lawSecurity still requires those units and reposts the remainder. Keep partial delivery; the
   receipt must name the outstanding obligation truthfully.

## Done when

- Four reproducing regressions (one per finding) fail-before/fix-after, all green.
- `node --test` on each touched file's suite + the adjacent suites you touch stay green.
- Report exact files changed. Do not re-record any `*.expected.json` golden; if a fix shifts a
  sim hash, say so and stop that item — the orchestrator owns goldens.
