<!-- LIFETIME: STABLE -->
# `scripts/` agent notes

This directory owns executable checks, probes, build/index generation, launch helpers, simulation
harnesses, and compact control-plane readers. Find the public command in `package.json` when one
exists, then inspect only its direct script/imports. `program-dispatch.mjs` is intentionally a direct
command; no package alias or coordination window is required to run it.

Feature-proof selection and evidence classes live in
[`../docs/VALIDATION_WORKFLOW.md`](../docs/VALIDATION_WORKFLOW.md); this file owns script-side
implementation hazards.

## Rules

- A check proves a durable behavior or contract. Do not enforce aesthetic taste through string allowlists, exact effect/module counts, CSS-property bans, palettes, or arbitrary geometry ceilings.
- Preserve fail-closed checks for determinism, save compatibility, asset reachability, launcher parity, accessibility, ownership, provenance, and measured performance.
- Do not weaken a correct check or silently re-record a golden to accommodate a regression. If a rule is obsolete, remove it and add behavioral coverage for the intended result.
- `scripts/lib/gameServer.cjs` is the shared server implementation. Do not duplicate its serving/security/freshness logic into Browser/Electron wrappers.
- Generated `docs/EVENT_ROUTING.md` and `docs/SYSTEM_REGISTRY.md` come from the index builder; never patch generated output as the source fix.
- Prefer focused tests/probes before broad chains. `package.json` is not a verification shopping list; the active packet names the relevant ladder.
- Expensive Browser/Electron acceptance routes use the validation broker and a packet manifest. Direct launches are diagnostic unless the execution protocol records a one-use equivalent claim.
- After an expensive failure, reduce it to a focused deterministic regression before rerunning the acceptance cell — don't loop an identical failed capture. See the execution protocol's failure-class dispositions.
- Probes clean up browser/server/process resources and write evidence only to the designated ignored artifact tree.
- Acceptance actors use public controls and visible semantics. Observers may collect approved owner evidence but may not mutate gameplay state or tell the actor hidden facts.
- Performance probes bind candidate, route, runtime, hardware/profile, settings, viewport, seed/save, and raw trace identity. Never reuse a capture across acceptance cells.
- `program-dispatch.mjs` is read-only, omits narrative queue fields, and reports exact queue
  `dispatchUnits` at the current integration front when their machine dependencies are `done`. Before
  mutation, reread `NOW.md` and preserve exact foreign dirty hunks; neither the check nor a
  coordination hint creates task-long ownership or blocks a packet. The command never mutates,
  launches acceptance, or promotes work.

See [`../design/program/roadmap/00_EXECUTION_PROTOCOL.md`](../design/program/roadmap/00_EXECUTION_PROTOCOL.md) for the finite state machine.

## Routing

- Program orientation: `program-dispatch.mjs --next` for one exact unit, `--ready` for the current
  ready set, and `--id PQ-XXX` for parent context.
- Simulation: `sf-sim.mjs` and focused `check-*-sim`/compare scripts.
- Browser/Electron proof: launcher/probe scripts plus the shared game server and validation broker.
- Assets: reachability, status, live-load, release-build, residency, and visual-stability scripts.
- UI: accessibility, contrast, reachability, player labels, behavior, and compositor/performance checks.
- Production tooling: `tools/production/`; production campaign state is not source.
