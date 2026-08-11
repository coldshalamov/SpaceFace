<!-- LIFETIME: VOLATILE — proposed fixes from the thermonuclear review. -->
# Thermonuclear Review — Proposed Fixes

> **OWNER TRIAGE (2026-08-10):** Partial Category A landed (ARCHITECTURE pointers/counts,
> shaders row removed). See `review/OWNER_TRIAGE.md` for executed / rejected / deferred.
> Remaining Category A/B/C items still need explicit go — do not auto-execute.

Owner direction (original): **document only, keep reviewing to a complete whole first.** This file persists the
plan so it survives across sessions. Pitborn (B3) deferred.

## Proposed AGENTS.md docs-sync rules (the structural cure for doc rot)
Add to §6 (Hard engineering contracts):

> **Docs are part of the contract — sync at the source, don't duplicate.** A change is not done until the docs that describe it match the code. The rot this prevents: ARCHITECTURE described a 20-system game while 127 shipped.
> - **Never hardcode an enumerative fact in prose.** System lists, faction/sector/event rosters, counts, and default values live in exactly one place — code/data. Docs point there, they do not re-list. ARCH §4.2/§2.3 order → `src/runtime/authoritativeSystemManifest.js`; §3.10 factions → `FACTION_META`; §6 sector/ship counts → `SECTORS`/`SHIPS`; §4.4 events → generated `docs/EVENT_ROUTING.md`.
> - **A new system** → entry in `authoritativeSystemManifest.js` (init + update order). Manifest is source of truth; ARCH §4.2 illustrative.
> - **A new faction** → `FACTION_META` AND `newGameDefaults.factionRep` AND a recorded `startingRep` in both — never one without the other.
> - **A new `bus.emit`** → row in §4.4 master table; run `node scripts/build-code-index.mjs` to regenerate `docs/EVENT_ROUTING.md` + surface orphans.
> - **Changing a `createGameState` default** → update the matching ARCH §3 schema line in the same commit.
> - **Changing an AUTHORITATIVE resolution (§0.x)** → requires a design ticket; frozen.
> - Run `node scripts/check-program-docs.mjs` after touching program docs; extend it for new invariants.

## Category A — safe to execute once approved (doc-only or additive; no protected paths)
- A1. Add the docs-sync rules above to AGENTS.md.
- A2. Refresh ARCH quantitative tables to committed code (§2.2 loop cap 8→4; §3.10 factions 8→14 + K1 note; §6 sectors 10→24; §3.4.1 entity types + mask bits; §1.1 rapier/floating-ui deps; §4.4 add physics:impact/gate:range/projectile:nearMiss; §3.5 magnetRange 90→250; §0.14 lookAhead 18→26 + zoom scale; §3.3 audio levels). **Skip bloom values** (PQ-046 in-flight).
- A3. Convert ARCH §4.2/§2.3 enumerative system lists → pointers to authoritativeSystemManifest.js (structural cure; prevents re-rot).
- A4. Fix broken doc citations (GDD HUD_REVAMP_DESIGN.md→_ARCHIVE; WORLD_OVERHAUL_2_1.md; FLIGHT_PHYSICS_SPEC.md; COMMAND_DECK authority chain → re-insert VISION).
- A5. Single-writer enforcement test (`test/single-writer-contracts.test.mjs`) — greps live src for direct .credits/.rep/.usedVolume/.derived writes outside owners.
- A6. Event-name conformance check (`scripts/check-event-names.mjs`) — fails on non-`:` emits or orphan emits.
- A7. `check:docs-sync` script asserting code↔doc invariants (FACTION_META vs newGameDefaults coverage; SECTORS.length not hardcoded in ARCH; §4.2 is a pointer) + wire into check:baseline.

## Category B — needs owner decision
- B1. Wire check:baseline into check:all — CI goes RED immediately (PQ-046 impulse assertion). Wire now or wait?
- B2. Remove tracked root junk (5 bin + 4 lab HTML) — destructive; are clay PNGs reference material to relocate?
- B3. pitborn startingRep / unify FACTION_META vs newGameDefaults — DEFERRED (decide later).
- B4. combat.momentumInherit:false — confirm intentional?
- B5. Production-profile golden — churn during PQ-046; do after?
- B6. GEMINI_HUD_BRIEF "LAWS/Non-negotiable" + rest-motion ban — reframe to reference?
- B7. De-hardcode wpn_emp_disruptor_m from damage.js — behavior-preserving data refactor.

## Category C — blocked by active NOW.md work (do not touch)
gameState/bloom/palettes/sectorVisualProfiles/kestrelHero (PQ-046.visual-energy); impulseKernel/collisionConsequences (PQ-046.craft-collision); heat (PQ-046.hauler-wanted); spawnBudget + 4 encounters (PQ-046.swarm-density); lootShards (PQ-046.reward-fountain); partsLibrary/traffic (PQ-045).

## Status
Review NOT complete. Remaining to read in whole: ~130 systems files, render (69k), ui (75k),
save/audio/balance/careers/contracts/etc, scripts (136k), tools (129k), tests (79k). See
MANIFEST.md for the live checkpoint.
