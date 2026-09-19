# Conventions you must know

## The game
SpaceFace is a top-down 2.5D space game (Three.js rendering, custom simulation): fly, mine, trade,
fight, smuggle, upgrade in one persistent, deterministic pocket universe. Six sectors, factions at
war, a physical tether called the Massline as the signature mechanic.

## Architecture laws (non-negotiable in anything you ship)
- Flat GameState object; systems registered in src/core/registry.js run in a fixed order.
- Event bus at src/core/eventBus.js: systems publish facts, other systems subscribe. No direct
  cross-writes to other systems' state.
- 60 Hz fixed-timestep simulation, fully decoupled from rendering. Gameplay is 2D on the XZ plane
  (y is up, presentation-only).
- Sim code NEVER touches Three.js, the DOM, or wall time. All randomness goes through state.rng;
  all time through state.simTime. Same seed + same inputs = same world, always.
- ES modules, no external dependencies, no build step. Plain modern JavaScript.

## Deliverable contract
- Ship COMPLETE, WORKING files against the interfaces included in this packet. Not a design doc —
  the thing itself, with any new modules you need alongside it.
- Include a fixture: a small standalone harness or test that demonstrates your component working
  on its own, with a fixed seed.
- Include INTEGRATION-NOTES.md: where your files attach, what events you consume/emit, what a
  local engineer must wire.
- We integrate, run our checks, and measure the result locally. Creation is yours; wiring is ours.

## Your budget
You have about 60 minutes. Everything essential is IN this packet — spend your time creating, not
exploring. You may pull a handful of individual files from the GitHub repo ( https://github.com/coldshalamov/SpaceFace , commit
de9f3f1fc ) if you need to check a signature, but treat that as garnish, not research.
