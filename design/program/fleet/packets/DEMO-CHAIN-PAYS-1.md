# DEMO-CHAIN-PAYS-1 — the chain multiplier pays Scrap and XP, as designed

**For:** a builder agent (sim + economy, careful). **Kind:** gameplay rule + tests. Commit your own files.

`design/overhaul/04_SWARM.md` §4: the style meter (the chain, shown as ×2 / ×3 / ×4 under the round
plate) "multiplies Scrap and XP". Today it only multiplies score (Opus review 2026-11-23). In a
Swarm run, a chain of kills should make each kill pay more Scrap and XP: that is what makes
chaining throws, room kills and pile-ups worth more than plain shooting.

## Do
1. Find the chain/style meter owner (the tier the HUD shows as ×N; grep the chain bridge
   `swarmChainBridge`, the style meter system under src/systems, and where `run:awarded` /
   kill Scrap and run XP are granted).
2. Apply the CURRENT tier multiplier to the kill's base Scrap and base XP at the moment the kill pays
   (chips that drop: multiply the chips' value at spawn, so what you fly through is what you get).
   Same tiers the HUD already shows; at tier 1 (no chain) nothing changes. Cap the multiplier at the
   meter's top tier (do not invent higher tiers). Room-kill pay (2.5×) and the chain multiply
   together only up to a total cap of ×6 on one kill.
3. Deterministic: sim code only reads state, no Math.random / Date.now. `npm run check:sim` must stay
   green (if the golden moves, the change touched Adventure or the recorded flight: find out why;
   never re-record).
4. Economy sanity (report numbers): with the existing economy tests/bench
   (`test/crucible-run-economy.test.mjs`, `scripts/bench-sim-fight.mjs --scene=swarm6` or the Swarm
   economy forecast `test/swarm-shop-forecast.test.mjs`), a shoot-only pilot's Scrap by round 3 and 10
   is unchanged; a pilot who keeps a ×2-×3 chain earns roughly 1.5-2.5× by round 10, not 5×. If it
   explodes, lower the Scrap share (e.g. chain multiplies XP fully and Scrap at half the tier bonus)
   and say so.
5. The HUD's chain line may add one quiet word so the player knows it pays ('×3 · Scrap'), only if it
   fits the existing layer without crowding (src/ui/swarmHudLayer.js; own-commit it).
6. Focused tests: a kill at tier 3 pays 3× base Scrap and XP; tier 1 unchanged; the ×6 cap holds;
   Adventure kills unchanged.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout. Plain-English commit messages with the economy numbers.

## Receipt
Protocol headings; where the multiplier applies (file:line, commit); the economy table (shoot-only
vs chaining pilot, Scrap and level by rounds 3 and 10, before/after); tests; check:sim.
