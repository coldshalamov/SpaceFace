# OVH-03a — The Foundry as a lit set: a deck under the fight and one sun

> **Pipeline (director, 2026-11-19) — overrides PROTOCOL.md on git:** make NO git writes (no add,
> commit, stash, reset, checkout, restore, worktree). Leave your edits in the working tree; the
> director harvests, reviews and commits them. Other agents keep uncommitted work in many files
> (especially `src/render/renderer.js`): edit surgically, never reformat, keep each file's line
> endings. Every game or browser launch goes through `node scripts/fleet/game-lock.mjs run -- <cmd>`.

**Design:** `design/overhaul/04_SWARM.md` §6.2, `design/overhaul/07_LOOK_AND_LIGHT.md` §2 and §4,
`design/overhaul/10_ENGINE.md` §4 (budget). The owner wants light like Freelancer and Dead Space —
never cheap web effects. **Target picture:** the Swarm PLAY screen's Foundry key art (find the image
the crucible/PLAY screen layout uses, `src/ui/orrery/screenLayouts.js`) — a warm-lit factory floor
with trusses, conveyors and panel banks, the best image in the game. Today the fight happens over
black space and a nebula; light has nothing to land on, so the picture reads flat.

## Do

1. **Frames before**, both:
   `node scripts/fleet/game-lock.mjs run -- node .devshots/director/powers-probe.mjs --out=.devshots/fleet/OVH-03a/before --round=3`
   and the headed one at the display's real scale:
   `node scripts/fleet/game-lock.mjs run -- node .devshots/director/sharp-probe.mjs --out=.devshots/fleet/OVH-03a/before-headed`.
2. **The deck.** A factory floor 40–90 WU below the play plane across the arena: plating, rails, two
   conveyors carrying crates (presentation-only motion on the presented clock), the furnace mouth
   glowing **and lighting the deck around it**, pools of work-lamp light. Scenery only — no collision,
   no sim entities: a render-side set keyed to the Foundry arena. Build from the existing place and
   prop kits (`assets/ships/parts/places/`, the Everyday Space kit) to the places look bar in
   `docs/visual-assets/README.md`; instanced, shared materials; any new GLB only through the existing
   place builders.
3. **One sun.** A high shop lamp as the room's key light, casting the bodies' shadows onto the deck:
   one fitted shadow map over the arena through the existing shadow/look owners
   (`src/render/look.js`, `src/data/lookMoods.js` — a Foundry mood), not a new system.
4. **Walls you can read.** The hard banks rise from the deck to the play plane with lit edges and
   hazard paint, matching the collision that already exists.
5. **Budget.** Shadow + bloom + media + light pools ≤ 4 ms on this laptop at preset low; report a
   matched, interleaved before/after frame-time measurement.
6. **Frames after**, same two probes. Compare with the key art and iterate until the room reads as a
   lit place in one frame at the default zoom, the player's ship stays the easiest thing to find, and
   enemies stay readable (07 §6).

**Files:** a new render-side set module (e.g. `src/render/arenaSets/foundrySet.js`), its hook where
the Swarm arena's scene is built, the Foundry mood in `src/data/lookMoods.js`, place GLBs through
their builders, a focused test that the set is render-only (no entities, no colliders) and loads
only in the Foundry. **Not:** simulation or collision code.

**Done when:** the after frames show a lit deck with the fight's shadows on it and the room reads
like the key art; the cost is measured and within budget. **Receipt:** before/after frame paths, the
measurement, files changed, tests.
