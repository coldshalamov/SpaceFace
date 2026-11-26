# PT-FIX-C — Fix the review's blockers in the rope and power effects (OVH-01c2)

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically, keep each file's line
> endings, never revert a hunk you did not write. Other builders work at the same time on other files.

**Context.** You built OVH-01c2 (Rigger + Conjurer node effects) and just moved Deep Cast's hold into the
recorded input. An adversarial review — `.devshots/director/reviews/agy-pilot-tree.md`, section
`fa663feb9c OVH-01c2` — found blockers. **Read that section first.** Fix these, as the review proposes
unless you find a better fix (say why), each with a regression test that fails before the fix:

1. **Rack-bomb Echo never fires** (`src/systems/bombs.js`): the echo drop hits the bay cooldown and toasts
   "Bomb bay cycling". Give `drop()` an internal echo option that bypasses the cooldown check, does not
   overwrite the bay's cooldowns, and spawns at half strength. Test a rack-bomb echo.
2. **Long Reel is clamped back to 390 WU by the rope physics** (`src/combat/attachments.js`
   `effectiveTetherMaxLength` / `physicsPolicy`, and `src/systems/tetherGameplay.js` ~2959 and ~4232): make
   the attachment's `tetherPolicy.maxLength` scale with `rigger_long_reel` (pass `state` where needed) so
   the acquisition, the latch, the winch and the physics joint read ONE number. Test through the real
   `attachments.js` (not a stub): a latch at 500 WU with the node creates a joint whose rest length is 500.
3. **Combo blasts the player** (`src/systems/impulseCharges.js` `comboBlast`): pass `excludeId: playerId`.
4. **Combo recursion and recycled ids** (`src/systems/fields.js` `_notePowerComboTouch` /
   `_noteBombComboTouch`): a combo blast must never trigger further combo blasts (ignore
   `trigger === 'pilot_combo'`), triggered combos queue and drain after the force pass with a per-tick cap,
   and the touch ledger keys on the entity (or validates its generation) so a recycled id inherits nothing.
   Test: 40 bodies in a Pull well hit by Shove → at most the capped number of blasts that tick, no
   recursion.
5. (non-blocking, do it) **Bomb echo is free** like Pull/Shove (no second cargo charge); **Pin** gets no
   echo — say so in the card text if the tree's sentence promises "every power".

**Not:** `src/ui/`, `src/combat/damage.js`, `src/systems/collisionConsequences.js`, `src/data/pilotTree.js`,
`src/data/pilotLive.js`, `src/systems/runSession.js`, `src/core/runState.js` (another builder, now),
`src/systems/weapons.js`, `src/data/weapons.js`, `src/render/`, `src/ai/`.

**Run:** `test/ovh-01c2-rope-power-effects.test.mjs`, the existing tests of every file you touch
(including `test/r12-line-relation*.test.mjs` and the attachments tests), and
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 5`.

**Report:** per item — done or not, file:line, the regression test and result; every file you touched.
