# SpaceFace Revamp Execution Lanes

Status: live routing note, refreshed 2026-07-08.

This file routes remaining revamp work by lane. It does not supersede `PROGRESS.md`;
the ledger remains the task-state truth. Use this file to decide whether a row is
safe for a backend agent before claiming it.

Authority order for this lane map:

1. `AGENTS.md` repo policy and ownership lanes.
2. `design/revamp/WAVE4_PROMPT.md` ledger and verification protocol.
3. `design/revamp/PROGRESS.md` row state.
4. `design/revamp/STATUS.md` evidence notes.
5. Live command output from the current tree.

## 1. Serialization Points

These points should have only one active writer at a time.

1. Massline / 47-A sim lane:
   `T3-*`, `47aLiveScene.js`, `scenarioRuntime.js`, Massline checks, and
   `scripts/sf-sim.mjs` compare expectations are one lane. Do not edit
   `test/*.expected.json` to make a check pass. `check:sim:compare` is allowed
   to fail only on the documented 47-A projectile-collision precondition while
   that precondition remains accepted in `_BASELINE.md`.

2. Graphics / assets / render lane:
   `assets/**`, ship manifests, release outputs, and `src/render/**` are a
   graphics lane. Backend agents should not edit, regenerate, stage, clean, or
   roll back these files. If a render issue blocks a backend row, record the
   blocker and pick another backend-safe row.

3. Default gate / deep perf lane:
   Do not fold `check:perf`, `check:hitch-budget`, or `check:gpu-path` into
   default `check` or `check:ci` until their render/runtime prerequisites are
   stable. A default gate that fails on a known out-of-lane render blocker is
   not green.

## 2. Backend Agent Contract

A backend agent may work rows that are pure systems, data, save/schema,
deterministic sim, or honest check-script scaffolding.

Before claiming:

- Confirm the row is not `IN-FLIGHT`.
- Confirm dependencies are `DONE` or `DONE-VALIDATED`.
- Confirm the listed files avoid `assets/**`, `src/render/**`, HUD/frontend
  screens, screenshot rituals, and graphics-lane handoffs.
- If the row creates a file, run `git add -N <file>` immediately after creation.
- Work on `master` only for this cleanup pass.

To finish a row:

- The row's named check must pass.
- The check must have teeth: break a meaningful invariant, observe FAIL,
  restore, observe GREEN.
- `npm run check:balance` must remain `2 PASS / 2 WARN / 0 FAIL`.
- `npm run check:sim:compare` must fail only on the documented 47-A
  projectile-collision precondition unless that baseline is deliberately
  re-recorded by a separate approved pass.

## 3. Remaining Row Classification

Current ledger state shows no unblocked backend implementation row remaining.

| Row | Lane | Current route |
|---|---|---|
| T1a-T1c | Backend checks | DONE. No action unless a live check regresses. |
| T2a-T2h | Docs | DONE. No action unless a live doc contradiction is found. |
| T3-01-T3-24 | Backend sim / Massline | DONE. T3-24 aggregate is green. |
| T4a | Mixed | Backend/data halves DONE. Remaining render handoffs only. Backend skips. |
| T4b | Backend economy | DONE. `check:causal-economy` owns the umbrella. |
| T4c | Backend salvage/loss ledger | DONE. Salvage anatomy check is in T8c. |
| T4d | Backend pirate ecology | DONE. `check:pirate-ecology` owns the umbrella. |
| T5a | Backend combat/mining packets | DONE. FRAGILE-ORE now uses the shipped `physics:impact` seam and cargo owner helper. |
| T5b | Backend proof ritual | DONE. BARK-01, BARK-02, and PKT-RITUAL backend proof checks are green. |
| T5c | Mixed | Backend halves DONE. DRIVE-VOICE, OVERLOAD-HANDLING, and HULL-SCARS are render/HUD/frontend remainders. Backend skips. |
| T5d | Backend audio-signature checks | DONE. |
| T5e | Mixed | Backend halves DONE. LOADOUT-SILHOUETTE needs render socket props. Backend skips. |
| T5f | Backend-checkable map model | DONE. INTENT-STRIP, PRICE-MEMORY, and MAP-CONFIDENCE are green. |
| T6a-T6h | Assets / graphics | NEXT but out of backend scope. Backend skips. |
| T7a | Gate hardening blocked by render lane | BLOCKED. `node --check src/render/bloom.js` currently fails at `src/render/bloom.js:344` with `SyntaxError: Unexpected token '.'`, so folding headed perf checks into default gates would make the default gate fail on out-of-lane render code. |
| T7b | Perf CI | NEXT but depends on T7a. Backend skips until T7a is unblocked. |
| T8a-T8h | Backend/story check scaffolding | DONE. |
| T9a-T9h | Release bar | NEXT but explicitly out of this backend goal. Requires screenshot pairs, release-bar review, or full-gate work. Backend stops before T9. |

## 4. Backend Recommended Sequence

Use this sequence only when a row is not already DONE/BLOCKED in `PROGRESS.md`.
As of 2026-07-08, every unblocked backend row in this list is DONE.

1. T4c WRECK_PROVENANCE and loss ledger.
2. BP-12 CONVOY_LOSS_INVESTIGATION.
3. T4c salvage packets:
   SALVAGE_DISTINCT_FROM_MINING, SURVIVOR_POD_TRIAGE,
   SALVAGE_PERMIT_AND_FINES, GHOST_CONVOY_RUMOR.
4. T4d BP-13 pirate ecology packets.
5. T8 checks:
   smuggling-card, station-mood, market-chart, claim-ledger, war-overlay,
   fact-ledger.
6. T1 checks:
   encounter-director, one-voice, release-soak.
7. T3-17 mining bulk-haul and T3-24 Massline aggregate.
8. T7a default perf-gate fold, only after render lane parses and headed probes
   are green.
9. T5 backend halves, packet by packet, skipping render/HUD/frontend halves.

## 5. Iterate-To-Green Protocol

For each backend-safe row:

1. Claim the row in `PROGRESS.md` and commit the claim on `master`.
2. Read the named detail spec section and the row's current implementation.
3. Implement only the row's files and direct registration/wiring.
4. Add or augment an honest check with behavioral assertions.
5. Run the check and nearest related checks.
6. Prove a non-vacuous control by breaking one meaningful invariant, observing
   FAIL, restoring the invariant, and observing GREEN.
7. Run the floor:
   `git diff --check`, `npm run check:balance`, and
   `npm run check:sim:compare`.
8. Stamp the row DONE only after the evidence above is current.
9. Commit and push the logical unit to `master`.
10. After every push, report:
    `git status --short --branch`,
    `git rev-parse HEAD origin/master`,
    `git worktree list --porcelain`.

## 6. Known Pre-Existing Failures / Non-Backend Blockers

- `src/render/bloom.js` does not parse:
  `node --check src/render/bloom.js` fails at line 344 with
  `SyntaxError: Unexpected token '.'`.
- `npm run check:sim:compare` currently stops on the documented 47-A
  projectile-collision precondition at `scripts/sf-sim.mjs:1161`; this is the
  accepted baseline failure for backend floor checks.
- T6 and T9 are not backend-lane work for this objective.
