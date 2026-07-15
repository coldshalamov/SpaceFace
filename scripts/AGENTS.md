# scripts/ agent notes

This directory owns executable checks, probes, build/index generation, launch helpers, and simulation
harnesses. Find the public command in `package.json`, then inspect only its direct script/imports.

## Rules

- A check must prove a durable behavior or contract. Do not enforce aesthetic taste through string
  allowlists, exact effect/module counts, or CSS-property bans.
- Preserve fail-closed checks for determinism, save compatibility, asset reachability, launcher
  parity, accessibility, and ownership contracts.
- Do not weaken a check to accommodate a regression. If a rule is obsolete, remove the obsolete
  requirement and add behavioral coverage for the intended result.
- `scripts/lib/gameServer.cjs` is the shared server implementation. Do not duplicate its MIME,
  freshness, containment, or serving logic into browser/Electron wrappers.
- Generated `docs/EVENT_ROUTING.md` and `docs/SYSTEM_REGISTRY.md` come from the index builder; never
  patch generated output as the source fix.
- Prefer focused tests/probes before the full `npm run check` chain. Do not hide failures by changing
  expected goldens or default quality.
- Probes must clean up their own browser/server/process resources and write evidence only to the
  designated ignored artifact tree.

## Routing

- Simulation: `sf-sim.mjs` and focused `check-*-sim`/compare scripts.
- Browser/Electron proof: launcher/probe scripts plus the shared game server.
- Assets: reachability, status, live-load, release-build, and visual-stability scripts.
- UI: accessibility, contrast, reachability, player labels, performance, and behavior checks.
- Production tooling belongs under `tools/production/`; production campaign state is not source.
