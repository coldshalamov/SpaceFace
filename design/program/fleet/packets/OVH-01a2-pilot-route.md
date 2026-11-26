# OVH-01a2 — The Pilot Tree's route: the sim deals, the screen only asks

> **Pipeline (director, 2026-11-19):** make NO git writes (this overrides `PROTOCOL.md`'s commit
> step). Edit surgically: other agents keep uncommitted work in the same files — never reformat,
> never normalise line endings, never revert a hunk you did not write. You built OVH-01a
> (`src/data/pilotTree.js`, the pilot record in `src/core/runState.js`, the owner seams in
> `src/systems/runSession.js`); this packet finishes its route so the cards (OVH-01b) and the node
> effects (OVH-01c) can plug in.

**Design:** `design/overhaul/04_SWARM.md` §3, `design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §2.
Never-return list for OVH-01 (`build_map.md` §40): *levelling that grants nothing*.

## Do

1. **The sim deals at a fixed moment, never the screen.** Nothing outside the run owner may call
   `drawPilotOffer`. The owner deals:
   - right after a level-up commit that banked a pick, when no offer is open;
   - right after `choosePilotCard` commits, when `banked > 0` (a second banked pick gets a fresh hand).
   So the moment a hand is dealt (and the `state.rng` it consumes) is the same whatever the player's
   display settings are. A display preference must never change a seeded run.
2. **An empty draw opens no offer.** When nothing is eligible, leave `offer` null and keep the pick
   banked; the next deal moment (a level-up or a choice) tries again. No offer with zero cards, ever.
3. **Only built nodes are dealt.** Add `src/data/pilotLive.js` exporting
   `PILOT_LIVE_NODE_IDS` (a frozen `Set`, **empty** in this packet, with a header comment: "a node
   joins only when its effect is built and tested — the director edits this list"). Gate
   `isPilotCardEligible` on it, so the draw, the re-roll and the choose all respect it. Tests that
   need eligible cards inject a live set: export a test seam
   (e.g. `withPilotLiveNodesForTest(ids, fn)` or an optional `live` argument threaded through
   `eligiblePilotCards` / `isPilotCardEligible`), never by mutating the frozen set.
4. **The screen asks through intents.** The run owner listens (next to its other `bus.on` lines) to:
   - `run:pilotCardRequested` `{ index }` → `choosePilotCard(state, index)`;
   - `run:pilotRerollRequested` `{}` → `rerollPilotOffer(state)`.
   A refusal emits the owner's usual refusal receipt (follow how `survivalDraft` reports a refused
   pick) so the screen can say it in words.
5. **Both intents cross the lane.** Regenerate `src/core/mainToSimEventSurface.js` with
   `node scripts/lib/eventSurfaceCensus.mjs --forward-set` (do not hand-edit it). Confirm that
   `state.run.pilot` (offer, banked, nodes, points) reaches the main side under `?simLane=worker`
   the same way `state.run` offers for the draft already do; if it does not, fix the mirror and say
   where.
6. **Tests** (extend `test/ovh-01a-pilot-tree.test.mjs` or add `test/ovh-01a2-pilot-route.test.mjs`):
   a level-up deals exactly once with no offer open; a second banked pick deals after the first
   choice; an empty live set opens no offer and keeps the pick banked; only live nodes are ever
   dealt (draw, re-roll, choose); the two intents route to the owner; two runs with the same seed and
   inputs deal identical hands; the forward set contains both intents.

**Files:** `src/systems/runSession.js`, `src/data/pilotTree.js`, new `src/data/pilotLive.js`,
`src/core/mainToSimEventSurface.js` (regenerated), the mirror only if step 5 needs it, the tests.
**Not:** any UI file, any node effect.

**Run:** `node --test test/ovh-01a-pilot-tree.test.mjs` (and your new test), plus
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash`
must still pass unchanged.

**Report:** each step done or not, the file:line of each change, the test names and their result.
