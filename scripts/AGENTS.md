<!-- LIFETIME: STABLE -->
# `scripts/` agent notes

Executable checks, probes, index builders, launch helpers, and control-plane readers. Find the
public command in `package.json`, then inspect only its direct script/imports. The 660+ scripts
are tiered by prefix — read [`SCRIPT_TIERS.md`](./SCRIPT_TIERS.md) first.
`program-dispatch.mjs` is a direct read-only command; it needs no coordination window.

**Development iteration starts without a full boot:** `node scripts/agent-loop.mjs plan` names
small proof surfaces; `sim <scenarios...>` batches the existing authoritative lab, and
`ui <screens...> --viewports=960x540,1920x1080 --walk` batches the real UI bench. Read
[`../docs/AGENT_FAST_LOOP.md`](../docs/AGENT_FAST_LOOP.md). Do not boot through the main menu for
a screen the bench mounts, or repeat an unchanged expensive failure. Fast diagnostics are not
public-route acceptance; run the affected real route at the coherent integration boundary below.

Proof selection lives in [`../docs/VALIDATION_WORKFLOW.md`](../docs/VALIDATION_WORKFLOW.md). Finite
state machine: [`../design/program/roadmap/00_EXECUTION_PROTOCOL.md`](../design/program/roadmap/00_EXECUTION_PROTOCOL.md).
Checkpoint / NOW protocol: root `AGENTS.md` §3.

## Rules

- A check proves a durable behavior or contract. Do not enforce taste through string allowlists,
  effect/module counts, CSS-property bans, palettes, or arbitrary geometry ceilings.
- Preserve fail-closed checks for determinism, save compatibility, asset reachability, launcher
  parity, accessibility, ownership, provenance, and measured performance.
- Do not weaken a correct check or silently re-record a golden to hide a regression.
- `scripts/lib/gameServer.cjs` is the shared server. Do not duplicate it into launcher wrappers.
- Never patch generated `docs/EVENT_ROUTING.md` / `docs/SYSTEM_REGISTRY.md` as the source fix.
- Prefer focused tests/probes before broad chains. After an expensive failure, reduce it to a
  focused regression before rerunning the acceptance cell.
- Probes clean up browser/server/process resources and write only to the designated ignored tree.
- Acceptance actors use public controls. Observers may collect approved evidence but may not mutate
  gameplay or tell the actor hidden facts.
- Use the current Finish Program's claim-specific verification rule. `scripts/player-truth/`
  remains an available ordinary-route harness: `npm run player-truth -- --mode=swarm --gate`
  (also gauntlet, adventure, racing). Choose it when it answers the changed gameplay claim;
  there is no blanket per-PR verdict or contact-sheet quota. Fix relevant failed checks before
  repeating them. Its actor stays public-input only; its reader stays observer-only.
  `--start-round=<1..30>` opens a swarm run on the dev route `?swarmRound=N` (title and door
  skipped, first wave is round N, checkpoint purse funded); pair with `--arena=` for a room.
- Performance probes bind candidate, route, runtime, hardware/profile, settings, viewport, seed/save,
  and raw trace identity. Never reuse a capture across acceptance cells.
- `agent-loop` plans/summaries, UI fixtures and handling reports never promote evidence. `sf lab
  trace` now returns actual poses/input as an internal diagnostic: successful capture exits 4,
  not acceptance-green 0. Read `captureOk` and the original oracle result. Compare metrics only
  for matching scenario/input/sample identity; a number is not a fun score.

## Routing

- Program: `board-chunks.mjs` for the live §1C seams. `program-dispatch.mjs --next` / `--ready` / `--id PQ-XXX` only for the old packet queue. A drained dispatch is the board, not an empty plan.
- Simulation: `node scripts/agent-loop.mjs sim <scenario...>` for a no-boot batch; `sf-sim.mjs` and focused `check-*-sim`/compare scripts remain the owner doors. `--trace` adds diagnostic handling artifacts, never a second simulator.
- Runtime liveness: `probe-runtime-witness.mjs` → `.devshots/runtime-witness/`.
- Stability gate: `npm run gate` (`scripts/fleet/gate.mjs`) — src import lint → playable boot → headless swarm boot → 47-A sim replay, one verdict; `--quick` runs the lint + boot only.
- Browser/Electron: launcher/probe scripts plus the shared game server and validation broker.
- Frontend look/iteration: `node scripts/ui-bench.mjs` ([`../docs/UI_VISUAL_ITERATION.md`](../docs/UI_VISUAL_ITERATION.md)). A screen the bench mounts does not need a game boot. Batch viewports with `--viewports`; inspect PNGs and finish untried controls before claiming the screen is done.
- Assets / UI: the focused reachability, a11y, contrast, labels, and compositor checks.
