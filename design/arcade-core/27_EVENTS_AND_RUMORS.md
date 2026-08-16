<!-- LIFETIME: DURABLE -->
# 27 — EVENTS, NEWS & RUMORS: the world's pulse

`frontierRumors.js`, `newsTemplates.js`, `stationBroadcast.js`, `encounterDirector.js` are the
seams. Standard: **the news reports the sim**, rumors point at real things, and events are
physical, not modal popups.

## Dynamic events (world-driven, spawn from sim state)

- **Convoy raid in progress** — pirates hit a real hauler; you arrive mid-robbery (07).
- **Distress call** — damaged ship, drifting; may be genuine (rescue pay) or a trap (26).
- **Blockade** — a faction chokes a lane for a few days; prices move at the cut station (06
  legibility: the chart bends *because* of the event, and the news says so).
- **Comet pass** — a bright, mineable ice body crosses the sector on a real trajectory for a
  few days; miners swarm it; pirates swarm the miners. Physics: it's a moving field (24).
- **Solar flare** — sensor fuzz sector-wide + gorgeous limb glow; smugglers' holiday.
- **Salvage rush** — a capital died somewhere (maybe by you); everyone with a beam is
  inbound. Get there first or rob the robbers.
- **Refinery strike** — production stops at a site; its commodities spike. You can break it,
  join it, or just trade it.

## News and rumor rules

- **News is generated from sim events, including player deeds**: "Pirates wiped out near Ceres"
  after you do it; "Freighter lost with all hands" after you fail. No fake variety — if it's
  on the radio, it happened (or the station is lying for a *reason*, see 30).
- **Rumors are pointers**: every rumor resolves to a real POI, event, wreck, cache, ace, or
  market fact. Bought rumors (bar) set map markers. A rumor about nothing is a bug.
- **Cadence**: events cluster around islands (I-6); empty space stays eventless and scary.

## Acceptance

- Seed-run audit: for N generated news items, N trace to real sim events; for N rumors, N
  resolve to real targets. Both are checkable assertions.
