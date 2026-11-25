# CAM-MENU-TRUTH-1 — Pause, Records, Credits finishing

Builder packet. Work in the shared checkout. Do not create a worktree. Do not commit. Edit only:
`src/ui/screens/pause.js`, `src/ui/screens/statistics.js`, `src/ui/screens/credits.js`, `src/data/credits.js`, focused styles/layout owners for those exact screens if unavoidable, and focused tests you create or already exist for those screens. Do not touch New Game, Help, HUD, Swarm teaching, render, worker transport, law/heat, or station files.

Read the experience audit receipt `.devshots/fleet/runs/CAM-AUDIT-EXPERIENCE-1.neon2.2026-11-24T22-49-53/RECEIPT.md`, especially task P5, and inspect current screen code before editing because other lanes may already have changed pause copy.

Player-facing goal: nothing reachable in Pause, Records Wall, or Credits may feel like a stub or a broken promise.

Required professional outcomes:
- Pause: remove or hide retired/broken destinations such as Operations/Automation and unfinished Media controls unless they already work fully by keyboard/pad; keep useful pause actions clear and honest. Do not remove working save/settings/help/map controls.
- Records Wall: replace blank/depressing `NOT YET` rows with truthful zeroed counters, current progress, or next milestone targets in plain words. If a stat cannot be measured honestly, omit it rather than showing a stub.
- Credits: fix wrong/product-inconsistent names such as `Massline` if confirmed, keep studio/creator wording truthful rather than inventing facts, and make the screen fit cleanly without visual overflow.
- Preserve accessibility, keyboard/gamepad navigation, and plain player-facing language. Do not add explanatory clutter.

Verification required:
1. `node --check` edited JS files.
2. Focused tests for every behavioral rule you change.
3. `node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --shot=pause,statistics,credits --viewports=1280x720,390x844 --walk --out=<your run dir>/bench` and open every captured PNG yourself. Fix visible overlap/stub/broken controls you introduced or own.
4. `npm run check:plain-words` and relevant UI checks if affected.
5. Do not boot the full game and do not commit.

Write the fleet receipt with exact changes, evidence, files, checks, and remaining unverified issues.
