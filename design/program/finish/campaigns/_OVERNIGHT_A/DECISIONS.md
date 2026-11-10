# Lane A overnight — decisions log

One line per decision, timestamped (local). Dispatch: `.overnight-dispatch/LANE_A_GATES_AND_INTEGRATION.md`.

- 2026-11-08 — Lane A claimed. `git status --short` at T+0 shows `M design/program/NOW.md`
  (foreign zcode INFERENCE claims row — preserved, not sim/render code) and untracked
  `.overnight-dispatch/` (the dispatch files themselves). The previously contaminating foreign
  hunks in `src/data/newGameDefaults.js` / `src/systems/input.js` are no longer in the tree, so
  the checkout is measurement-clean for E2/E6 purposes. Proceeding to Workstream 1.
