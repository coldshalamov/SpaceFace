# ADR-0003: Flight Physics Controller

- **Status:** Accepted
- **Date:** 2026-06-18
- **Deciders:** Codex, project owner
- **Tags:** flight, physics, gameplay, engine

## Context
The previous flight handling was too rudimentary for a space game: banking could read backward, turn release allowed whipping, and the ship could drift toward apparent preferred diagonal headings. SpaceFace needs satisfying authored ship feel more than a generic rigid-body solver. It also needs stronger collision and CCD experiments as speeds rise.

## Decision
We will keep production starship handling in a deterministic custom controller and expose Rapier only as an optional collision/proxy backend behind `settings.gameplay.physicsBackend`.

The canonical flight API is `resolveFlightProfile`, `stepPlayerFlight`, `stepNpcFlight`, and `computeFlightFrame`. Default control feel is `assisted`, with `drift` and `newtonian` available as alternate modes. Banking is visual-only and cannot influence physics.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Custom controller + optional Rapier collision | Best authored ship feel, deterministic tests, low migration risk, Rapier escape hatch for CCD/contact research | More custom code to maintain | **Chosen** |
| Full Rapier rigid-body flight | Strong contact solver and CCD | Raw solver would fight desired arcade/space-sim controls, harder save/replay determinism, larger migration risk | Rejected |
| Tune old parameters only | Fastest patch | Does not fix architecture, NPC/player split, diagnostics, or collision tunneling | Rejected |

## Consequences
- **Positive:** flight feel is owned by a testable gameplay module; player and NPC movement share semantics; bank sign and turn release are regression-tested.
- **Negative / costs:** custom collision remains production-critical and needs continued focused tests.
- **Risks / follow-ups:** Rapier is currently optional and must prove better behavior/performance before becoming default. Keep collision proxies simple and visible through diagnostics.
- **Reversal cost:** moderate. The API boundary lets another backend replace collision, but replacing authored flight handling would require retuning every hull and NPC behavior.

## References
- `design/FLIGHT_PHYSICS_SPEC.md`
- `skills/threejs-gameplay-systems/references/physics-engine-selection.md`
- Rapier JavaScript package: `@dimforge/rapier3d-compat`
