# OVH-01a — The Pilot Tree engine: data, banked picks, the three-card draw (no UI, no node effects)

> **Pipeline (director, 2026-11-19) — overrides PROTOCOL.md on git:** make NO git writes (no add,
> commit, stash, reset, checkout, restore, worktree). Leave your edits in the working tree; the
> director harvests, reviews and commits them. Other agents keep uncommitted work in many files: edit
> surgically, never reformat, keep each file's line endings (most are CRLF). Never run the whole
> test suite; nothing here needs a game boot.

**Design:** `design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §2 (the tree: six combat branches +
Industry, ten nodes each, tiers open at 2 / 4 / 6 points in the branch, evolutions, exclusive bends)
and `design/overhaul/04_SWARM.md` §3 (how a run uses it: XP sources, level curve, the three-card
rule). The owner: fast specialisation; "you could spread all your points… but you'd be kind of weak."
This packet builds the engine only. The card UI (OVH-01b) and the node effects (OVH-01c…) follow.

## Do

1. **Data** `src/data/pilotTree.js`: every node in 06 §2.2 exactly as written (id, branch, tier 1/2/3
   or capstone, name, one-sentence text), the branch list, the tier gates (tier 2 at 2 points in the
   branch, tier 3 at 4, capstone at 6), evolutions (two branches at 5 each; list the ones 06 names)
   and the exclusive bend groups. Pure frozen data + pure functions; no bus, no DOM, no RNG.
2. **Run state** (the run owner is `src/systems/runSession.js`; state shape in `src/core/runState.js`):
   `run.pilot = { points: { <branch>: n }, nodes: [ids], banked: n, offer: null | { cards: [3 ids], rerolls } }`.
   `run:levelUp` banks one pick (the engine exists and only an announcer listens today).
3. **The draw** `drawPilotOffer(state)`: three distinct eligible cards from `state.rng` (deterministic
   for a seed) following 04 §3 exactly — at least one from the deepest branch, at least one from an
   untouched branch, the third weighted toward what combines; a capstone only once its branch holds 5;
   an evolution only from 8 total points with both prerequisites met; never a node locked by a taken
   bend; graceful when fewer than three are eligible. `choosePilotCard(state, index)` applies it
   (points, node, bend locks, banked − 1) through the run owner. `rerollPilotOffer(state)` costs Scrap
   (use the run purse owner; price a named constant, start 150) and redraws.
4. **Query API** for effect sites: `pilotHas(state, nodeId)` and `pilotPoints(state, branch)` — the
   only way any system reads the tree.
5. **XP sources and curve** (04 §3): gun kill 1, room kill 2.5, chain link +0.5 rising, round cleared
   10 × round, boss 100; retune `RUN_XP_LEVEL_BASE` / `RUN_XP_LEVEL_STEP` (or the curve function) so a
   seeded bot-free estimate hits level 2 ≈ 25 s into round 1, ~6 by round 3, ~14 by round 10. Show the
   arithmetic in the receipt.
6. **Tests** `test/ovh-01a-pilot-tree.test.mjs`: data shape (70 nodes, every branch 10, gates), the
   draw rule (deepest / untouched / capstone gate / evolution gate / bend lock) over many seeds,
   determinism for one seed, choose/reroll bookkeeping, level-up banks a pick.
7. `npm run check:sim` before and after — report the hash; do not re-record.

**Files:** `src/data/pilotTree.js` (new), `src/systems/runSession.js`, `src/core/runState.js`, the new
test. **Not:** any UI file, `src/data/weapons.js`, `src/ai/*`.

**Done when:** the tests pass and the receipt shows the curve arithmetic and check:sim.
