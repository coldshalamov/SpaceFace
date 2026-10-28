# X-06 draft — Drifter: every sector has its own broken lamp

Persona: The Drifter. Row §1P 564 (joint V-01). Audit: `X-06-audit.md`.

## Ground

You know you're home when the radio moans about the same busted thing as yesterday. A place gets its
voice from in-jokes about things actually placed there, so a pilot can fly over and see what's being
moaned about.

## Banks (patrol-greeting, ≤12 words, faction register kept)

**Helios** (`sector_helios_prime`)
- scn: *"Helios traffic. Berth Four lamp's out again. Use Six."*
- scn: *"Tally post's still counting the raid. Pass clean."*
- mts: *"Helios exchange. Iron's short this shift. Somebody's getting paid."*
- dmc: *"Seam by the beacon's thin. Go past the spindle."*
- free: *"Helios. Fuel's honest. Berths ain't. Tip the dock hand."*

**Ceres** (`sector_ceres_belt`)
- dmc: *"Kettle Line's backed to the weigh pin again. Hold your drift."*
- dmc: *"RU-7's still blinking. Third shift nobody's fixed it."*
- mts: *"Ceres desk. Cells are cheap here. Don't tell Hyperion."*
- scn: *"Ceres corridor. Flare rack's lit for a reason. Keep off."*

Every noun is placed or taught: tally post, spindle, Kettle Line, Inbound Weigh Pin, RU-7, Flare Rack
(FIRST_SESSION_MAP §1, §3), and the cells→Hyperion loop (§4). "Berth Four/Six" echoes Maera's
*"Changed the names on the berths."*

## Lands in

- `src/data/barks.js`: a frozen `SECTOR_PATROL_GREETINGS[sectorId][factionId]` export placed after
  `MAERA_FLIGHT_LINES`, which is already sector-keyed. Add `sectorBarkFor(sectorId, factionId, index)`,
  returning `null` for an empty cell. **BARKS cells untouched**, so the WAV index stays stable. The new
  lines ride as text plus the radio blip, the same way history and trophy lines do.
- `barkDirector.js:1085-1089`: one more link in the existing history → trophy → `barkFor` chain. For
  `patrol-greeting`, try `sectorBarkFor(currentSectorId(state), …)` on even `index` and fall through
  otherwise. The faction corpus still speaks, and the existing ambient gap clock (`:3267-3286`) rations it.
- Pins: bark corpus tests, `check:player-facing-labels`. No WAV regeneration.

## Working life

The same lamp is out every time you come home.
