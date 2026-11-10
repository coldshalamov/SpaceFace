# S-12 plan — Landmarks (tribunal synthesis)

Two non-overlapping seams, both landed: Archivist's lore completion (the fifth scan line
on every under-filled entry) + Drifter/Set Dresser's pilgrim dressing (memorial arrays
and mooring buoys attending the four ledger-adjacent monuments).

| Axis | Drifter | Archivist | Set Dresser |
|------|---------|-----------|-------------|
| Critical-path weight | 4 | 3 | 4 |
| Authenticity | 5 | 5 | 4 |
| Specificity | 4 | 5 | 4 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 4 | 5 | 5 |

## Landed plan
1. `src/data/flavor/080-landmark-lore.js` — append one line to each four-line entry:
   `c2_05` (Obelisk), `c4_05` (Vault Maw), `c6_05` (Caved Shaft), `c7_05` (Lung of
   Charon), `c8_05`, `c9_05`, `c10_05`, `c13a_05`–`c13c_05`, `c13e_05` (Resonant
   Cathedral), `c15_05` (Metronome-adjacent). Twelve lines; each continues its entry's
   own scan register and answers the question the other lines circle.
2. `src/data/sectors.js` + `src/data/sectorAnchors.js` — four pilgrim-dressing POIs
   (beacon type, packaged props, discoveryPlates in the mourner register):
   - `poi_helios_pilgrim_moor` — `place_nav_buoy` vr10 at (1560,-700), attending the
     Candle Fleet (1680,-820). Plate: the raft mooring where the ribbons get tied.
   - `poi_io_cathedral_vigil` — `place_memorial_array` vr18 at (-1560,-660), off the
     Wreck Cathedral stern (-1420,-780). Plate: the vigil lights the Reach crews relight.
   - `poi_sker_penance_moor` — `place_nav_buoy` vr10 below the Throne anchor
     (throne at anchor; moor set ~200 WU off). Plate: what penitents pay the Reach to
     tie on.
   - `poi_ashfall_keykeeper` — `place_ash_pin` vr6 near the Vault Maw (-980,1240 →
     moor at -860,1150). Plate: the watch that keeps count of wrong keys.

## Not landing (rejected at tribunal)
- New landmark_lore entries — slot list is exact-pinned (C1–C15+C13a–e).
- New worldOneOffs — count pinned at 33; dressing rides POIs instead.
- `flavorTargetRef` on the new POIs — that wires them to the pinned lore contract;
  plain plated finds instead.
- Any change to the landmark bodies themselves or their anchor scale.

## Test
`node --test test/depth-program-flavor-loader.test.mjs` — landmark_lore 3–5 lines per
entry + all pack contracts.

## Approvals
Tribunal synthesis recorded above (Drifter + Archivist + Set Dresser in S-12-drafts.md).
Single-agent unit per the row instruction.
