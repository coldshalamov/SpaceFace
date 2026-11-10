# S-14 catalog — Frontier regions (first five)

Ledger register: raw frontier. Sanctioned detail: region dressing, reach flavor, isolation
texture — splittable per region when claimed. Scope for this pass (recorded in the ledger):
the FIRST FIVE named regions — Hyperion Cut, Dione Lane, Eris Margin, Eunomia Gulf,
Haumea Rift (5 of 14). Surface files: `src/data/frontierRegions/west.js`,
`src/data/frontierRegions/south.js`, `src/data/frontierRegions/north.js`.

## What the player literally perceives (per region)
- **Hyperion Cut** (west.js:270-345): refinery + claim stations with authored chartNotes,
  three fields (f_hyperion_1 metallic 380,-640 r460; f_2 common -820,220 r400; f_3
  crystalline 1040,560 r340), a dense-asteroid hazard, the Caved Shaft landmark POI
  (plated, flavorTargetRef C6) and one bare beacon. The lane is "cut through wreck-mass
  older than the Concord" — but only the Shaft says so.
- **Dione Lane** (south.js:256-318): the lawful southern freight corridor — two stations
  (Exchange + Customs, both noted), one field (f_dione_1 common -320,540 r420), Lane
  Relay landmark pylon, a hidden dead drop with plate. The charted, watched lane — but
  its single field reads empty; nothing marks the convoy culture the stations describe.
- **Eris Margin** (north.js:213-288): Quiet blackmarket fence sector, two fields
  (f_eris_1 metallic 540,-420 r450; f_eris_2 common -480,-880 r400), nebula hazard, four
  POIs — hidden Quiet drop, Toll-Runner Wreck (NO plate), Margin Dead Drop (hidden),
  The Metronome (plated landmark). Isolation texture is strong on paper; the field edges
  and the wreck are silent.
- **Eunomia Gulf** (south.js:94-170): Understory salvage fence, two fields (f_eunomia_1
  rare-exotic 200,380 r400; f_eunomia_2 metallic "licensed plate drift" 1000,700 r400),
  debris + radiation hazards, four POIs — Gulf Hulk (derelict, landmark, NO plate),
  Gulf Ledger Plate (bare beacon), Paint-Scar Debris (wreck, NO plate), The Hush
  (plated anomaly). A salvage yard with no marks of who worked it.
- **Haumea Rift** (north.js:155-210): Free research observatory, two fields (f_haumea_1
  icy -380,520 r460; f_haumea_2 crystalline 860,240 r400), dense hazard, three POIs —
  Ice Fissure Signal (plated anomaly + foreign fracture-mouth GLB wiring in flight —
  DO NOT TOUCH that hunk), Rift Range Buoy (bare), Rift Probe Shell (derelict, NO plate).

## What is thin
- Every one of the five fields reads as bare geometry: no claim stakes, no survey pins,
  no tags — the "first crews already came through" register is missing at the rocks.
- Three wreck/derelict finds in-scope are silent at discovery (eunomia_hulk,
  eunomia_debris, eris_wreck, haumea_probe — handled with S-13's memorial POIs).
- Bare beacons (`poi_hyperion_beacon`, `poi_haumea_buoy`, `poi_eunomia_ledger`) are
  radar furniture with no authored read.

## Constraints discovered
- m2b-frontier-* tests whitelist POI types (beacon/derelict/cache/colony/anomaly/
  wormhole/wreck), require `poi_*` ids, matching anchor rows (`pos` + `landmarkGlb`),
  zone rows fully populated (`reason` required).
- `discoveryPlate` ⇒ mark-ineligible — new POIs only (pool neutral).
- north.js `poi_haumea_fissure.landmarkGlb` hunk is foreign work (fracture-mouth asset
  lane) — append new rows, don't touch that row.
- inf-landmark-discovery-plates contract: any landmark/anomaly/flavored POI needs a plate;
  plates on ordinary finds are optional but must stay 60–420 body / 3–48 title when
  present. Write all new plates to that contract.
- Station `chartNote` count is pinned at 17 — no station additions.

## Additive seams (clean)
- Per region: +2 field-edge POIs (claim stake / tag rock / dead lamp / survey pin —
  beacon/derelict types, packaged props, plates in the region's register), each with a
  matching anchor row adjacent to an authored field center.
- S-13 memorial POIs at the silent wrecks ride the same files (eris_wreck, haumea_probe,
  eunomia_hulk, eunomia_debris) — recorded there, implemented in the same hunks.
