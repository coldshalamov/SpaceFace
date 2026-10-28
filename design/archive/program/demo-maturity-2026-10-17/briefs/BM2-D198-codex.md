# Task BM2 — demo defect D198: New Game screen open cost (attribute the current route, then fix what is real)

Read first: `_constraints-codex.md`, then the ledger row D198 in
`design/program/DEMO_READINESS_2026-09-20.md` §6 (it names the files and the history).

## The defect

Menu → New Game historically froze the picture ~1 s (1.2 s main-thread work, 250 ms stalls).
Repair candidates already landed: hull-ring geometry cache (`f3bcb16f8e`), yard-measurement
batching (`7b2d9c9675`), embark decode scheduling through the post-present arm (`088c183cca`).
**The row stays open because the current residual cost is unmeasured.** Named files:
`src/ui/screens/newGame.js` (`onShow`, `setLaunching`), `src/render/startupGpuResidency.js`;
historical suspects also included 245 ms GL command-buffer waits, 1104 microtask checkpoints
(104 ms), and 138 ms forced style/layout under `ui/kit/dom.js` button activation.

## Your job

1. **Attribute first, on the current tree.** Use the existing instruments —
   `node scripts/probe-frame-solid.mjs --cpu-profile` (see `build_map.md` §21.4 for the plan),
   `npm run probe:runtime-witness`, or a focused Puppeteer/CDP trace of the Menu → New Game
   route if a script exists for it. Do not invent a quiet-host claim; other apps may be running —
   report contention if you see it.
2. Fix only what the attribution actually shows, with the minimal correct change (cadence,
   batching, deferral, caching — never removing authored visuals or lowering default quality).
3. If attribution shows the historical residual is already gone on the current route, say so
   with numbers — that is a valid outcome; the orchestrator decides whether it closes the row.

## Done when

- A before/after number for the owned leg (same instrument, same route), or an honest
  "already-clean, here is the evidence" verdict.
- No layout/style signature regressions in any fixture you touch; focused checks pass.
- Do not capture headed stills for review — numbers decide (owner capture decision, AGENTS §13).
