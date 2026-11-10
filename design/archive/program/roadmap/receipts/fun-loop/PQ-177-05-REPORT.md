# PQ-177.05 — Interesting decisions per hour — DONE 2026-09-22

**Done-when:** the fun-loop measurer prints interesting decisions per hour; ≥ 6 on the
reference route. A decision counts only when the player sees ≥ 2 viable options and each
option names a different tradeoff.

## Measured

`node scripts/measure-fun-loop.mjs --adventure --seeds=4242` → **9.0/hour** (bar 6)
on the reference corridor (Helios → Belt Outpost → Tethys → Ceres), one sim hour,
9 counted decisions: 8 contract choices, 1 haul choice. Receipt:
`design/program/roadmap/receipts/fun-loop/2026-09-22-adventure-summary.md`.

The adventure block also rides every full `measure-fun-loop` sweep as `rollup.adventure`
(informational; it never enters the pooled §B bar evaluation).

## What landed

- `src/ui/adventureDecisions.js` — decision registry: presents contract-pair, forecast
  (sell-now vs hold), haul (buy-and-fly vs keep credits), and repair decisions; a record
  counts only via `isInterestingDecision`; choosing routes through the existing
  economy/mission/service owners (`ui:acceptMission`, `ui:buy`/`ui:sell`, `ui:service`,
  or the economy system's `handleTrade`); `chosenIds` makes a choice exactly-once.
- `src/ui/station/screens/contracts.js`, `src/ui/station/screens/market.js` — decision
  cards rendered on the board/stage; clicks call `chooseAdventureDecision`; the normal
  accept path folds into the decision record when the offer is one of the presented pair.
- `src/ui/hud.js` — one quiet line under nav shows the open decision's situation
  (slow tick, no per-frame allocation).
- `scripts/lib/bench/adventureDecisionRoute.mjs` — fixed-seed reference route playing the
  corridor for one sim hour; deterministic (sim rng/simTime only).
- `scripts/measure-fun-loop.mjs` — `--adventure` mode prints/writes the metric
  (`spaceface.funMeasure.adventure.v1`); crucible bench import is lazy so the route never
  pulls three.js.
- `test/adventure-decisions.test.mjs` — pins the ≥2-viable-option/different-tradeoff
  rule and the ≥6/hour bar through the measurer CLI. `npm run check:adventure-decisions`.

## Checks

- `check:adventure-decisions` — pass (2/2; measurer prints 9/h on seed 4242).
- `check:market-first-loop` — pass. `check:economy:regional-supply` — pass.
  `check:price-memory` — pass.
- `check:baseline` — 12/16 at run time; the four failures (save-schema, sim, sim-compare,
  sim-v3) sit in a concurrent lane's in-flight combat/economy state edits, not this unit's
  files (UI + bench + measurer only; the decision log is a WeakMap, never serialized).
