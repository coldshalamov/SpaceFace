# X-07 draft — The Skeptic

**Verdict.** I poked the peg, and holding forever is the *best* play today. The vent bonus is
`0.75 · _pulseOre · depth` (`mining.js:916`), and `_pulseOre` keeps accruing through a pegged gauge (`:1175`).
One mk1 hold to empty (about 13 s) is a single depth-1 pulse: +75% on the whole rock, with no cooling
downtime. A rhythm player loses beam time to cooling and never wins, so the taught rhythm is a trap.

**Proposal — the peg stops banking.** This honors owner ruling 2026-09-21 (`:194-198`): no lockout, no
penalized cooling, no forfeit.
- `mining.js:1175`: accrue `_pulseOre` only while `beam.heat < heatMax`.
- Extraction, uptime, `coolRate` and the band are untouched.
- A release at the peg still pays depth 1 on all pre-peg ore. Holding longer just stops growing the bonus.

**Numbers (mk1: heat 22/s, cool 55/s, band 0.62, so 4.5 s to peg).**

| style | bonus |
|---|---|
| hold to empty | about +26% (4.5 s banked) |
| rhythm (release at peg, about 0.7 s cool, 1.7 s re-climb) | +75%, every beam-second banked |

That is about 39% more ore per rock for discipline, on top of seam aim's 3× (`:168`).

**Naming it.** Add `peggedS` to the `mining:heatChanged` / `mining:ventBonus` payloads (`:889-895, 933-941`).
The HUD seam word (`miningHud.js:402-408`, `dom.word.textContent`) then reads:
- **"PEGGED · NOT BANKING"** after 0.5 s pegged;
- **"CLEAN CUT"** for 1.2 s on a vent with depth ≥ 0.95 and `peggedS` ≤ 0.25.

Text only, no layout.

**Poke → reward.**
- Sit on the peg: the HUD says it stopped paying.
- Release on the edge: "+N Ore" plus CLEAN CUT.
- Drones stay excluded (`:1173`).

**Regression risk.** Scripted pilots hold the beam, so their seam income drops about 28%.
`first-hour-economy-floor` may fail; retune the pilot to vent, not the economy. Keep green:
- `mining-beam-heat-no-lockout`, all three. A peg release still pays qty ≥ 2 at depth 1 from 4.5 s of ore.
- `mining-hud-three-rhythms`, `inf-mine-heat-4242`, `metallic-ore-mining`, `mining-first-player`
- `npc-starter-seam-mining`, `salvage-vent-core`
