<!-- LIFETIME: VOLATILE — register of dead / unintegrated / repurposable work found in the sweep. -->
# Thermonuclear Review — Abandoned / Unintegrated Work Register

The user's hypothesis was "there's probably abandoned work that could be repurposed." The
empirical finding after an orphan-import scan of all 780 src files: **the codebase is remarkably
well-integrated.** Encounters/flavor are wired through generated barrels; systems through the
runtime manifest; nearly everything ships. The disease is documentation rot, not dead code.

## Confirmed dead / unwired code
- `src/render/starfield.js` — **deliberately unwired**, already documented in ARCHITECTURE §2.4 ("NOT WIRED ... Retained deliberately (harvest candidate)"). Superseded by `spaceBackground.js`. 4-layer parallax Points + procedural nebula + distant planet. Candidate for harvest or deletion. **Known/documented, not a new discovery.**

## Production-off feature flags (candidate abandoned/disabled features)
- `combat.momentumInherit: false` in `PRODUCTION_FEATURES` (`runtimeProfiles.js:14`) — a combat flag that ships OFF even in production. Either intentionally disabled (balance?) or a stale/abandoned feature. Worth confirming intent.
- (All other production combat/massline2/travel flags are `true` — massline2 M2 family fully live.)

## In-flight / uncommitted (protected, NOT abandoned — from NOW.md)
These are active or staged work, listed here so they're not mistaken for dead code:
- `--class/` (untracked) — PQ-019 receiver Phase A candidate GLB reports. NOW.md "Uncommitted work" row: needs REVISE/KEEP/discard decision.
- 5 tracked binary files at repo root (`2026-*.png`, `hull_*.blend`, `place_*.blend`) + 4 `_*lab.html` — **misplaced junk** (assets belong under `assets/`, labs under `lab/`). Not "abandoned work" so much as committed-by-accident clutter; safe to relocate/remove. (The stray `-` and `nul` files are gitignored local-only Windows-redirect accidents, not tracked.)
- PQ-046 work (collision/heat/spawnBudget/visual-energy) — mid-mutation per NOW.md; `check:baseline` red on `check:impulse:authority` is expected.

## Compatibility/legacy paths retained by policy (NOT abandoned)
Per AGENTS.md §5, these are kept as fallbacks and must NOT be deleted casually:
- `src/systems/flight.js` + `src/core/flightDynamics.js` — legacy flight (production uses `flightV3.js`).
- `src/systems/ai.js` — legacy AI (production uses `tacticalAI.js`).
- `src/core/rapierCollisionWorld.js` + the plain `'rapier'` backend branch in `physics.js:_syncOptionalBackend` — legacy physics (production uses `'rapier-dynamic'` / SG-02). Reachable only via `physicsBackend==='rapier'` which no default sets.

## "Could be repurposed" candidates (low confidence — needs owner eyes)
- `starfield.js` (above) — the procedural-nebula/planet code could donate to `spaceBackground.js` if visually useful.
- Nothing else rose to "clearly abandoned but repurposable." The orphan scan was clean.

## Net
The repo does NOT have a large block of dead/unintegrated gameplay code. The maintainer's
instinct that "nobody has a sense of everything" is better explained by **(a) the doc rot** (ARCH
describes a 20-system game; reality is 127 systems; many concrete numbers drifted) and **(b) the
sheer surface area** (780 src files, 698 tests, 827 scripts) than by abandoned code per se. The
`review/` ledger this sweep produces is itself the "sense of everything" artifact that was missing.
