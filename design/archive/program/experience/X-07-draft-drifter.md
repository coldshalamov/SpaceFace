# X-07 draft — Drifter: you can cook a cut

Persona: The Drifter. Row §1P 565. Audit: `X-07-audit.md`.

## Ground

Every miner knows a clean cut from a cooked one. Holding past the peg should cost something, but not
the tool. The owner killed the lockout because it punished mining (`mining.js:194-198`). So the beam
keeps cutting at full rate and cooling is unchanged. What you lose is the **bonus**. The vent becomes
a peak you hit, not a plateau you park on.

## Rule (bonus only)

- Depth is unchanged up to the peg: band 0.62→1.0 pays up to +75 % of the pulse.
- At the peg, a cook timer runs: −0.5 depth per second pegged (floor 0). Release within ~0.3 s for
  near-full bonus. Two seconds pegged pays zero bonus. Extraction is untouched. Leaving the peg resets
  the timer.

## What the player gets

- While pegged, the heat-arc band word reads **COOKING**. It's a word on the existing instrument.
- First deep vent (depth ≥ 0.9), one-time hint: *"Clean cut."*
- First cooked vent, one-time hint: *"Held it too long. Cooked the bonus."*

## Lands in

- `mining.js` `_updateBeamHeat` (`:843-901`): runtime `beam.peggedS` (like `beam.heat`), and
  `band:'pegged'` on `mining:heatChanged` at `pct ≥ 1`. In `_resolveVent` (`:907-944`):
  `depth = max(0, depth − BEAM_VENT_COOK_PER_S·peggedS)`, plus `cooked:true` on `mining:ventBonus`. One
  exported constant `BEAM_VENT_COOK_PER_S = 0.5` beside `BEAM_VENT_BONUS_MAX`. Amend the ruling comment:
  no lockout, no penalized cooling, no forfeit of extracted ore.
- `miningHud.js` `resolveHeatArc`: map `'pegged'` → COOKING. Instrument-local; ORRERY tokens unchanged.
- `onboarding.js`: a `mining:ventBonus` listener → `_showHint('miningCleanCut' | 'miningCooked')`.
- Pins: mining vent tests, `miningHud` tests.

## Working life

Skill shows up as money you didn't leave on the rock, and a cooked cut is your own fault, not the
tool's.
