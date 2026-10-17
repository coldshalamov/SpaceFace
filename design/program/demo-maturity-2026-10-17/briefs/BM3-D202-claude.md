# Task BM3 — demo defect D202: ORRERY text legibility (finish the eligible corrections)

You are working in the SpaceFace repo. Read `AGENTS.md` at the repo root, then
`design/frontend/ORRERY.md` (the one direction for the whole interface), `src/ui/AGENTS.md` and
`styles/AGENTS.md`. You are doing frontend typography work under the ORRERY direction.

## The defect (demo defect ledger row D202)

"ORRERY text legibility": the official exact-phone audit finds **154 below-floor text
declarations** (not the earlier miscount of 496). Two stale native tooltip writes are already
fixed. A typography-only packet was being repaired against the official checker when the lane
stopped; affected Save/Load screen work (PR432) is separate and landed.

Evidence you MUST read first:
- `.devshots/motion-maturity-backport/ui-canonical/` (the canonical checker + its outputs)
- `.devshots/phone-pr431-d202/title-type-floor-analysis.md` (the floor analysis)

## Your job

1. Read the evidence above and find the official checker (a script under `scripts/` — locate it;
   the ui-canonical folder names it). Run it to reproduce the 154 below-floor declarations on the
   current tree.
2. Fix the **eligible** below-floor declarations: raise the text to the floor. Never lower the
   floor. Keep edits minimal and consistent with ORRERY.md — no redesign, no layout churn, no
   new components. If a declaration is below floor for an authored reason (e.g. a deliberate
   watermark or canvas-drawn label outside DOM audit), leave it and note it.
3. Re-run the checker; iterate until the remaining count is only the justified exemptions.
4. Per the frontend iteration law (`docs/UI_VISUAL_ITERATION.md`): for the screens you changed,
   shoot the real screen over a still (`node scripts/ui-bench.mjs --shot=<id>`) if the bench has
   those ids, open the PNG, and fix what you see (clipping, overlap, wrap breaks). If the bench
   does not cover a screen, say so honestly rather than faking it.

## Hard constraints

- Do NOT run any `git add`, `git commit`, `git stash`, `git checkout`, `git restore`, or `git reset`.
- Touch only `src/ui/**` and `styles/**` (typography-scale properties: font-size, line-height,
  letter-spacing, and only directly-related properties).
- Do NOT touch: `src/ui/screens/newGame.js` startup scheduling, any JS logic paths, or the
  foreign-dirty paths: `artifacts/moment-machine/**`, `design/alien-ecology-program/**`,
  `design/program/inference-memory.json`, `src/data/environmentalMachinery.js`,
  `src/data/newGameDefaults.js`, `src/data/sectorWayOfLife.js`,
  `src/localization/catalogs/en-US.generated.js`, `test/cr-feed-sector-machines.test.mjs`,
  `test/hud-g-lag.test.mjs`, `test/infer-cruise-hit-drop.test.mjs`.
- Reduced-motion and accessibility behavior must be preserved.

## Deliverable (final message)

- Checker before/after counts (exact numbers), and the checker command.
- Files changed (exact paths) grouped by screen.
- Any declaration you left below floor and the authored reason.
- What the ui-bench shots showed and what you fixed because of them.
