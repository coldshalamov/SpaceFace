# DEMO-SIMFIX-1 — entities stay fast objects (no dictionary mode)

**For:** a builder agent (careful engine work). **Kind:** measured performance fix. Commit your own files.

Swarm's world runs in slow motion in heavy rounds: the simulation step costs ~30 ms against a 16.7 ms
budget. Two Opus engineers profiled it (`.devshots/director/demo/RESUME.md`; workflow reports in
the director's notes) and found that a quarter of the bodies the physics reads each step are V8
"dictionary mode" objects, which makes every property read on them a hash lookup in every system.

1. **Bullets:** `armAttackContinue` in `src/combat/attackHit.js` redefines `alive` as a per-entity
   accessor (Object.defineProperty) on every bouncing or piercing bullet. That turns the entity into
   a dictionary-mode object. Every slow bullet in the live bench has that accessor and no fast one
   does. Fix it without an accessor: keep `alive` a plain data field and move whatever the getter/
   setter did (probably "a continuing attack stays alive while its continuation is pending") into an
   explicit check at the writer or the reader. Same behaviour, same results.
2. **Stations and rocks:** all 17 stations are dictionary-mode from boot, as are ~15 of 36 rocks.
   Find out why (a `delete entity.x`, a defineProperty, very many properties added after
   construction, or keys added in varying order). Use `node --allow-natives-syntax` with
   `%HasFastProperties(obj)` in a scratch script against a bench state
   (`scripts/bench-sim-fight.mjs --scene=swarm6` shows how to build one), and fix the cause where it
   is safe (construct with all fields in one order; replace delete with = undefined).
3. **Prove it is result-identical and faster:**
   - `node scripts/bench-sim-fight.mjs --scene=swarm6 --hash` twice before and after: same hash.
     (Note: the bench has a known nondeterminism — in one process the hash can flip between two
     worlds; compare fresh processes.)
   - `npm run check:sim`: it currently FAILS on the shared tree for an unrelated reason (another
     agent's change, being bisected in DEMO-DETERMINISM-1); your change must not change its actual
     hash (`4dac41d0…` at 01:45Z) — compare before/after.
   - Gate the change behind a `simCoreFlags` switch (default on) and measure with
     `node scripts/bench-sim-fight.mjs --scene=swarm6 --ab=<flag> --profile`; report per-system
     ms/step OFF vs ON. Count dictionary-mode entities before/after.

## Rules
Edit src/combat/attackHit.js, the entity construction / station / rock spawn code you find,
src/core/simCoreFlags.js, and tests. Before editing a file run `git diff -- <file>`; if it has
changes you did not make, use `bash scripts/fleet/own-commit.sh begin <file>` before and
`... commit "<msg>" <file>` after. Never git add -A, reset, stash, restore or checkout. Deterministic
code never uses Math.random or Date.now. Do not boot the game. Write your RECEIPT.md early and update it.

## Receipt
Protocol headings; causes (file:line); fixes (commits); dictionary-mode counts before/after; the
OFF/ON table; hashes.
