<!-- LIFETIME: STABLE -->
# `scripts/` agent notes

This directory owns executable checks, probes, build/index generation, launch helpers, simulation harnesses, and compact control-plane readers. Find the public command in `package.json` when one exists, then inspect only its direct script/imports. `program-dispatch.mjs` intentionally remains a direct command until the package/launch mutex is free.

## Rules

- A check proves a durable behavior or contract. Do not enforce aesthetic taste through string allowlists, exact effect/module counts, CSS-property bans, palettes, or arbitrary geometry ceilings.
- Preserve fail-closed checks for determinism, save compatibility, asset reachability, launcher parity, accessibility, ownership, provenance, and measured performance.
- Do not weaken a correct check or silently re-record a golden to accommodate a regression. If a rule is obsolete, remove it and add behavioral coverage for the intended result.
- `scripts/lib/gameServer.cjs` is the shared server implementation. Do not duplicate its serving/security/freshness logic into Browser/Electron wrappers.
- Generated `docs/EVENT_ROUTING.md` and `docs/SYSTEM_REGISTRY.md` come from the index builder; never patch generated output as the source fix.
- Prefer focused tests/probes before broad chains. `package.json` is not a verification shopping list; the active packet names the relevant ladder.
- Expensive Browser/Electron acceptance routes use the validation broker and a packet manifest. Direct launches are diagnostic unless the execution protocol records a one-use equivalent claim.
- After an expensive product, harness, or nondeterminism failure, do not rerun the affected acceptance
  cell until a deterministic seconds-scale regression at the owner seam is observed failing then
  passing. Environment, stale-baseline, out-of-scope, and unknown failures follow the protocol's
  class-specific disposition. Unchanged cell/failure fingerprints cannot authorize another attempt.
- Probes clean up browser/server/process resources and write evidence only to the designated ignored artifact tree.
- Acceptance actors use public controls and visible semantics. Observers may collect approved owner evidence but may not mutate gameplay state or tell the actor hidden facts.
- Performance probes bind candidate, route, runtime, hardware/profile, settings, viewport, seed/save, and raw trace identity. Never reuse a capture across acceptance cells.
- `program-dispatch.mjs` is read-only, omits narrative queue fields, and labels its output as dependency-ready rather than claim-ready. Do not add mutation, leasing, or automatic promotion to it.

See [`../design/program/roadmap/00_EXECUTION_PROTOCOL.md`](../design/program/roadmap/00_EXECUTION_PROTOCOL.md) for the finite state machine.

## Routing

- Program orientation: `program-dispatch.mjs` for one compact queue/packet record.
- Simulation: `sf-sim.mjs` and focused `check-*-sim`/compare scripts.
- Browser/Electron proof: launcher/probe scripts plus the shared game server and validation broker.
- Assets: reachability, status, live-load, release-build, residency, and visual-stability scripts.
- UI: accessibility, contrast, reachability, player labels, behavior, and compositor/performance checks.
- Production tooling: `tools/production/`; production campaign state is not source.
