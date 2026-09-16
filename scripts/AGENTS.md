<!-- LIFETIME: STABLE -->
# `scripts/` agent notes

Executable checks, probes, index builders, launch helpers, and control-plane readers. Find the
public command in `package.json`, then inspect only its direct script/imports.
`program-dispatch.mjs` is a direct read-only command; it needs no coordination window.

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
- Performance probes bind candidate, route, runtime, hardware/profile, settings, viewport, seed/save,
  and raw trace identity. Never reuse a capture across acceptance cells.

## Routing

- Program: `program-dispatch.mjs --next` / `--ready` / `--id PQ-XXX`.
- Simulation: `sf-sim.mjs` and focused `check-*-sim`/compare scripts.
- Runtime liveness: `probe-runtime-witness.mjs` → `.devshots/runtime-witness/`.
- Browser/Electron: launcher/probe scripts plus the shared game server and validation broker.
- Assets / UI: the focused reachability, a11y, contrast, labels, and compositor checks.
