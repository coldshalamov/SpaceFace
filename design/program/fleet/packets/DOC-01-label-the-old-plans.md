# DOC-01 — Label the old plans so no agent takes work from them

**Lane 4.** Mechanical. Do exactly this and nothing else.

## Why
The repo has dozens of plan documents from earlier programs. Agents read one, assume it is current,
and later find a different one. From 2026-11-11 there is one source of work
(`design/program/fleet/QUEUE.md`) and one design authority (`design/game/`). These files stay for
history, but each must say so on its first line.

## The banner (copy exactly, as the first lines of each file, followed by one blank line)

```
> **HISTORY — not a source of work.** Superseded on 2026-11-11 by `design/program/fleet/QUEUE.md`
> (work) and `design/game/` (design). Read for background only; do not take tasks from this file.
```

## Rules
- Insert the banner **above** the file's existing first line. Change nothing else in the file.
- If a file already starts with this banner, skip it.
- If a file starts with `<!--` front-matter (an HTML comment block), put the banner **after** that
  comment block.
- Keep the file's line endings (CRLF stays CRLF).
- After all edits, run: `node --test test/*program*.test.mjs test/*inference*.test.mjs test/*now*.test.mjs`
  and `node scripts/check-now-liveness.mjs` and report the results. If any of them fails because of a
  banner, remove the banner from that one file, note it in your receipt, and re-run.
- Commit: `git commit -m "docs: label superseded plan documents as history (DOC-01)" -- <the files>`.

## The files
- `design/program/01_VERIFIED_DONE.md`
- `design/program/02_REMAINING_WORK.md`
- `design/program/03_LIVE_ACCEPTANCE_MATRIX.md`
- `design/program/04_WORKTREE_AND_INTEGRATION.md`
- `design/program/06_RETAINED_FUTURE_BACKLOG.md`
- `design/program/07_HISTORICAL_BUILDS.md`
- `design/program/08_GRAPHICS_OVERHAUL_CHECKPOINT.md`
- `design/program/AGENT_TASK_PROMPTS.md`
- `design/program/ANIMATION_PHASE2_AUDIT.md`
- `design/program/ANIMATION_REFERENCE_PROGRAM.md`
- `design/program/ARSENAL_EXPERIENCE.md`
- `design/program/ASSET_PERFORMANCE_PROGRAM.md`
- `design/program/ASTEROID_WORKS_ART_CAMPAIGN.md`
- `design/program/ASTEROID_WORKS_PLAYFIELD.md`
- `design/program/ATTENTION_LEDGER.md`
- `design/program/ATTENTION_PROGRAM.md`
- `design/program/BETA_PLAN_2026-10-23.md`
- `design/program/CENTRAL_BRAIN.md`
- `design/program/DELEGATED_WORK_LOOP.md`
- `design/program/DEMO_READINESS_2026-09-20.md`
- `design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md`
- `design/program/EXPANSION_PROGRAM.md`
- `design/program/EXPERIENCE_PROGRAM.md`
- `design/program/FINISH_LANES.md`
- `design/program/FINISH_THE_GAME.md`
- `design/program/FIRST_SESSION_MAP.md`
- `design/program/FLEET_VISUAL_INTEGRITY.md`
- `design/program/FUN_CONVERGENCE_LOOP.md`
- `design/program/GRAPHICS_3D_CAMPAIGN.md`
- `design/program/GRAPHICS_ASSESSMENT_2026-09-28.md`
- `design/program/GRAPHICS_ITERATION_LOOP.md`
- `design/program/GRAPHICS_PROGRAM.md`
- `design/program/INFERENCE_CONVERGENCE.md`
- `design/program/INFERENCE_IDEAS.md`
- `design/program/INFERENCE_INTENTIONAL_FUN.md`
- `design/program/INFERENCE_LANES.md`
- `design/program/LANDED_REVIEW.md`
- `design/program/MATURITY_2026_10_15.md`
- `design/program/MODEL_STOCKTAKE.md`
- `design/program/MODEL_STOCKTAKE_MANIFEST.md`
- `design/program/MODEL_STOCKTAKE_PLAN.md`
- `design/program/ORPHAN_HARVEST_LEDGER.md`
- `design/program/ORPHAN_HARVEST_PLAYBOOK.md`
- `design/program/PLAN_ENGINE.md`
- `design/program/PRODUCTION_QUALITY_ARCHITECTURE.md`
- `design/program/PRODUCTION_QUALITY_COMPOUNDING.md`
- `design/program/PRODUCTION_QUALITY_FIRST_WAVE.md`
- `design/program/PROGRAM_MAP.md`
- `design/program/PROGRESSION_VERTICAL_2026-09-18.md`
- `design/program/PROGRESSION_VERTICAL_AUDIT.md`
- `design/program/QUIET_HOST_PROGRAM.md`
- `design/program/RACING_FLIGHT_PROGRAM.md`
- `design/program/README.md`
- `design/program/REMAINING_WORK_GOALS.md`
- `design/program/REPORT_CARD.md`
- `design/program/TASK_SOURCE_CROSSWALK.md`
- `design/program/TRANSLATOR_CHECKLIST.md`
- `design/program/UTILIZATION.md`
- `design/program/VISION_ALIGNMENT_PLAN.md`
- `design/program/VISUAL_WORLD_CLEANUP.md`
- `design/program/VM_LANES.md`
- `design/program/WORKTREE_RECOVERY.md`
- `design/program/WORLD_VISUAL_CENSUS.md`
- `design/program/ZERO_TO_HERO_2026-09-23.md`
- `design/program/alive-world-plan-2026-10-27.md`
- `design/program/demo-maturity-2026-10-17.md`
- `design/program/finish/DIRECTION.md`
- `design/program/finish/EXECUTION_STATUS_2026-11-06.md`
- `design/program/finish/INTEGRATION_COVERAGE.md`
- `design/program/finish/KIT.md`
- `design/program/finish/LANE_1_MACHINE_AND_PICTURE.md`
- `design/program/finish/LANE_2_FIGHT_AND_SIM.md`
- `design/program/finish/LANE_3_WORLD_GLASS_HOUSE.md`
- `design/program/finish/MASTER_LANES.md`
- `design/program/finish/MASTER_PLAN.md`
- `design/program/finish/PERFORMANCE_HANDOFF_2026-11-05.md`
- `design/program/finish/PROMPT_LANE_1.md`
- `design/program/finish/PROMPT_LANE_2.md`
- `design/program/finish/PROMPT_LANE_3.md`
- `design/program/finish/PRO_CREATION_PORTFOLIO_2026-10-30.md`
- `design/program/finish/PR_INTEGRATION.md`
- `design/program/finish/README.md`
- `design/program/finish/SMOOTH_PROGRAM_2026-11-05.md`
- `design/program/finish/SOURCE_COVERAGE_2026-10-29.md`
- `design/program/finish/STUDIO.md`
- `design/program/finish/SWARM_RENAISSANCE_GAPS.md`
- `design/program/finish/TOOLS.md`
- `build_map.md`

## Files that code reads — check these after banning

For each pair below, after adding the banner run the reader (`node --test <test>` for a test file, `node <script> --help` or the script's check mode for a script; if a script has no safe check mode, run `node --check <script>` and `node --test` on any test that imports it). If a reader fails or prints a parse error because of the banner, remove the banner from that file only and list it in your receipt.

- `design/program/ASSET_PERFORMANCE_PROGRAM.md` — read by `scripts/probe-crucible-programs.mjs`
- `design/program/ASTEROID_WORKS_PLAYFIELD.md` — read by `scripts/check-drill-smooth.mjs`
- `design/program/DEMO_READINESS_2026-09-20.md` — read by `scripts/lib/planFrontDoor.mjs`
- `design/program/EXPERIENCE_PROGRAM.md` — read by `scripts/asset-stocktake.mjs`
- `design/program/FINISH_LANES.md` — read by `test/first-hour-choice-contracts.test.mjs`
- `design/program/FINISH_THE_GAME.md` — read by `scripts/scratch-genie-packets.mjs`
- `design/program/FUN_CONVERGENCE_LOOP.md` — read by `scripts/check-rulings-guards.mjs`
- `design/program/INFERENCE_CONVERGENCE.md` — read by `scripts/lib/inferenceLedger.mjs`
- `design/program/INFERENCE_IDEAS.md` — read by `scripts/lib/planEngine.mjs`
- `design/program/INFERENCE_LANES.md` — read by `scripts/check-inference-control.mjs`
- `design/program/LANDED_REVIEW.md` — read by `scripts/check-plan-integrity.mjs`
- `design/program/PLAN_ENGINE.md` — read by `scripts/lib/planEngine.mjs`
- `design/program/PROGRAM_MAP.md` — read by `scripts/check-program-docs.mjs`
- `design/program/PROGRESSION_VERTICAL_AUDIT.md` — read by `scripts/check-progression-verb-audit.mjs`
- `design/program/QUIET_HOST_PROGRAM.md` — read by `scripts/quiet-host-session.mjs`
- `design/program/README.md` — read by `scripts/build-cas-shader.mjs`
- `design/program/VISION_ALIGNMENT_PLAN.md` — read by `src/render/velocityLanguage.js`
- `design/program/WORKTREE_RECOVERY.md` — read by `tools/recovery/audit-corrupt-asset-clone.mjs`
- `design/program/finish/DIRECTION.md` — read by `test/player-truth-environment.test.mjs`
- `design/program/finish/MASTER_PLAN.md` — read by `src/data/survivalWaves.js`
