# S-13 plan — Debris/wreck fields (tribunal synthesis)

Unanimous mechanism: NEW adjacent memorial/stake POIs (beacon type) beside the ten
unplated named wrecks, each carrying a `discoveryPlate` written as a loss-ledger excerpt —
casualty names (named dead), what was already stripped (salvage note), where the scoring
reads (kill-marks). Existing wreck POIs keep their bounty-mark eligibility untouched.

| Axis | Drifter | Archivist | Skeptic |
|------|---------|-----------|---------|
| Critical-path weight | 4 | 3 | 4 |
| Authenticity | 5 | 5 | 4 |
| Specificity | 5 (names on the dead) | 5 | 4 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 5 | 5 (two core wrecks file empty; frontier already dressed) | 4 |

## Landed plan (site → new POI)

Core (`sectors.js`, inline pos + glb per the `poi_helios_overtime` precedent):
- Charon `poi_charon_tether_wreck` (-1280,360) → `poi_charon_tether_memorial`
  beacon `place_nav_buoy` vr10 (-1140,300). Dead: the intake town's evacuated bunks —
  Foreman Del Okra, the school roster's second page.
- Sker `poi_bounty` (1180,920) → `poi_sker_bounty_tally`
  beacon `place_tally_post` vr9 (1300,850). Kill-marks: eleven professionally spaced
  tallies on the sail, a twelfth on the engine block; the names the writ didn't.

Frontier — VERIFIED ALREADY DRESSED by a prior pass (no work added): all eight silent
wreck sites already carry plated memorial beacons in the exact pattern this plan
proposed (nyx_runner_memorial, rhea_slag_memorial, haumea_probe_memorial,
eris_toll_memorial, nereid_shoal_memorial, triton_wake_memorial,
eunomia_row_marker + eunomia_bed_marker). Each names dead crew, a salvage disposition,
and the hull's scoring read. This row's contribution completes the pattern at the two
core sites rather than duplicating it at the frontier.

Every plate: title 3–48, body 60–420, one named casualty minimum (per the Archivist's
"no placeholder dead" rule — `historyWear.js` law), a salvage disposition line, and the
hull's kill-mark read. Positions sit 120–220 WU off the wreck anchor — inside the
same investigation pass, clear of the hulk's own silhouette.

## Not landing (rejected at tribunal)
- `discoveryPlate` on the wreck rows themselves — removes them from the bounty-writ
  pool (`bountyMarks.js:133`); the memorial neighbor carries the prose instead.
- `uniqueWrecks.js` edits — CANON slot contract pinned (D1–D14).
- `wreckAftermathDressing.js` edits — seeded family grammar; names in procedural
  dressing = machinery.
- `worldOneOffs.js` — pinned at 33.
- Static dead-roll data file — doesn't exist as a schema; names ride the plates.

## Test
`node --test test/inf-landmark-discovery-plates.test.mjs` — frontier plate contract
(the new POIs' plates are written to the same 60–420/3–48 bounds).

## Approvals
Tribunal synthesis recorded above (Drifter + Archivist + Skeptic in S-13-drafts.md).
Joint with board row ATT-S13 — this pass covers the named-dead/salvage-note/kill-mark
prose surface only; no wreck-body or salvage-mechanic work.
