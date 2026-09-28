# FOOTPRINT — builder brief (wave 2)

Screen: `src/ui/screens/footprint.js` (F3; bench id `footprint`). Reads state.provenance.chains / openIncidents,
state.player.heat and bounty; emits intents only (single-writer: heat -> WANTED heat is the heat system's).
Read first: design/frontend/review/BUILDER_BRIEF.md (rules, owner criteria, the MEASURED WEIGHT BAR), design/frontend/ORRERY.md,
design/frontend/OVERHAUL_PLAN_2026-09-25.md (Footprint row), src/ui/orrery/ (compose the library).

## What is there now (the pre-overhaul screen)
The bench shows the loading state only ("FOOTPRINT IS INDEXING YOUR RECENT ACTIVITY", a spinner, a boxed OPEN
CHART) over the station photo, "CLEAN" as the title, "T0 heat · clears in 0 s" at the corner, and four verbs as
plain text across the foot. FIRST build a rich bench state (chains with nodes, open incidents, a bounty, heat at
a mid tier with a clear timer) in tools/ui-bench.js so the real screen can be seen and judged at clean / marked /
wanted.

## The mini-app: THE HEAT DIAL
- Hero: one big dial — your heat as a thin display numeral in the hub, the ring cut into sectors, one per SOURCE of
  heat (each chain / incident / bounty that contributes), each sector's arc lit to its share; the tier stops
  (T0..Tn) as major ticks round the rim with the WANTED threshold in red (red only for threat). The ring COOLS IN
  REAL TIME: the lit arcs recede toward the clear point as heat decays (state.simTime-driven reading of the real
  decay — read, never write), with the "clears in" time as a rolling counter under the hub.
- SIGNATURE — trace a source: drag round the dial (or arrow keys / pad) and the Hand sweeps sector to sector; the
  sector under the Hand lifts, its chain unfolds beside the dial as a beam of its nodes (the consequence graph for
  that source: act -> witness -> report -> faction), and the verbs that can answer THAT source (Pay bounty / Bribe /
  Find the accuser / Take amends) light as the one Lamp Key + words, each showing its cost/effect as a preview
  on the dial (e.g. "Pay bounty" previews its sector going dark and the numeral dropping). Clean: the dial is a
  cold, complete ring with the clean record as its rim engraving.
- Temperature: wanted-cold stays the kit's (src/ui/kit/temperature.js) — do not set it here.
- No boxes: OPEN CHART becomes a word; the foot verbs sit on the dial's reading, not as a text strip.

## Must survive
Every verb and its intent, the ledger/record data, entity links (entityResolver), openGalaxyMap, keyboard and
gamepad reach, the tests that import footprint.js (`grep -l footprint test/*.mjs`).

## Proof
Stills 1920/1280/2560 at clean / marked / wanted, a mid-trace state (Hand on a sector, its chain unfolded, a
verb previewing), reduced motion. Tests; commit by exact pathspec; report.
