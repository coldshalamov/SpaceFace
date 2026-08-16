<!-- LIFETIME: DURABLE -->
# 22 — STATION CHARACTER: no two docks alike

Stations are the most-visited places in the game and currently read as menus with a backdrop.
`stationBubbles.js`, `stationContacts.js`, `bandRadio.js`, and the station hub UI exist. This
plan gives every station a **body, a voice, and a specialty**.

## Station archetypes (each = exterior dressing + services + personality + one rumor)

| Archetype | Exterior reads | Services emphasis | Voice (barks/radio) |
|---|---|---|---|
| **Trade hub** | Container yards, queue of freighters, ad hoardings | Full market, shipyard, insurance (59) | Brisk, commercial, bored controller |
| **Refinery** | Forge glow, slag vents, ore hulks parked | Buys ore hot, sells alloys, refinery fees | Heat-crackle radio, shift whistles |
| **Shipyard** | Half-built hulls in cradles, weld flashes | Best outfitting, hulls, repairs | Dry engineering patter |
| **Black market** | *Not on the map*; dark hull, no beacons, one unlit dock | Contraband market (49), disguises, no questions | Whispers, code phrases, sudden silence |
| **Monastery/shrine** | Lanterns, pilgrim docks, quiet | Cheap repairs, rumor-rich, no weapons | Soft, strange, hospitable |
| **Military post** | Turret ring, patrol cradle, restricted zones | Licenses, bounty board, ammo | Clipped, hostile-ish, procedural |
| **Waystation** | Fuel bladder + a bar, barely a station | Fuel, bar rumors, beds | Lonely, chatty, knows everyone |

## Ambient life standards (ties 39_AMBIENT_VFX)

- Approach reads: docking queue actually queues; clamps actually grab; containers actually get
  craned. All looped, all cheap, all physical.
- The station *notices* you: controller hail by reputation (stationContacts), turrets track
  you when wanted, dock crews wave off contraband scans you've bribed.
- Interior hub: one signature visual per archetype (hoarding wall, forge viewport, shrine
  lanterns) — the rest is the shared shell. Menus stay fast; character lives in backdrop,
  audio, and stock.

## Bans

- No station that is a palette swap with identical stock.
- No ambient animation that costs a per-frame allocation (39's pooling rules).

## Acceptance

- Blind test: owner identifies ≥ 5 of 7 archetypes from approach captures.
