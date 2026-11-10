# S-11 catalog — Asteroid fields (all sectors)

Ledger register: geology + claim culture. Sanctioned detail: graffiti (exists), claim marks,
micro-props. Surface files: `src/data/sectors.js`, `src/data/sectorAnchors.js`,
`src/data/frontierRegions/`, `src/data/mining.js`, `src/data/claimableBodies.js`.

## What the player literally perceives
- Every core sector fields one to three authored asteroid clusters (`fields:` on the card,
  pinned centers/radii in `sectorAnchors.js` — e.g. `f_ceres_1` 420,-720 r480,
  `f_charon_3` -980,-540 r400). Rocks spawn from `ASTEROIDS` type rows
  (`mining.js:123-141`); four of six types map to packaged geology props via
  `authoredPlaceId` (`place_asteroid_seamed`, `place_asteroid_rock_a/b/c`).
- Field *culture* is almost all in Helios Prime: `poi_helios_claim_mark` (place_claim_mark,
  vr 5), `poi_helios_ash_pin` (place_ash_pin, vr 6, "SPAN-HOLD" plate), `poi_helios_tally`
  (place_tally_post), plus the Starter Seam tutorial furniture. `place_asteroid_graffiti`
  (the tagged-rock GLB) is shipped in the release manifest and used by swarm arenas — but no
  live sector POI mounts it anywhere in the galaxy.
- The fifteen claimable bodies (`claimableBodies.js`) cover claims as *mechanic*: S/M/L
  claimable sites with SITE_HISTORIES plates. They are deliberately scarce — "Helios never
  sells land" — and sit on the far side of sectors from most field centers.
- Claim *marks* as dressing exist only in Helios (`poi_helios_claim_mark`). The other nine
  core fields and every frontier field are bare rock clusters: a pilot cutting a Ceres seam
  sees rocks and the generic debris scatter, nothing that says crews worked here.

## What is thin
- Nine of ten core sectors have zero claim-culture dressing at their fields: no stakes, no
  burned pins, no tag rocks, no work lamps, no dead survey gear. The field is a geometry
  source, not a place with a work history.
- `place_asteroid_graffiti` — the shipped "tagged rock" — is entirely unmounted in live
  sectors; the sanctioned "graffiti (exists)" exists as art, not as world content.
- The register (claim tags, burned-out stakes, tally walls, cold drills) already has legal
  packaged props: `place_claim_mark`, `place_ash_pin`, `place_tally_post`,
  `place_asteroid_graffiti`, `place_worklight_tower`, `place_drill_platform_cold`,
  `place_extraction_mast`, `place_slurry_tank`, `place_nav_buoy`, `place_dead_hulk`,
  `place_pirate_sensor_mast`.

## Constraints discovered
- `discoveryPlate` on a POI makes it bounty-mark-ineligible (`bountyMarks.js:133`). New
  plated POIs are pool-neutral (the POI itself can't host a mark, nothing else changes) —
  but plating *existing* POIs would shrink pools. All additions here are new POIs.
- Every POI needs a semantic row (card `pois:`) plus an anchor row (`pos` + `landmarkGlb`)
  or inline `pos`; `sector-geography.test.mjs` fails on a pos-less unowned POI.
- Frontier POI type whitelist (m2b tests): beacon, derelict, cache, colony, anomaly,
  wormhole, wreck — `beacon`/`derelict` cover stakes and dead gear.
- `graffiti` flavor pack entries are exact-count pinned (365); `ad_board` pinned (353);
  landmark_lore entries pinned (19 slots). None of those are this row's surface anyway —
  the POI/anchor pair is the authored dressing seam.
- `sectors.js` currently carries a foreign hunk (`appendSectorWonderPois` import +
  `.map(...)`) — add rows inside `pois:` arrays, untouched by that diff.

## Additive seams (clean)
- `sectors.js` — append field-culture POI rows (beacon/derelict + discoveryPlate) to the
  ten core sector cards.
- `sectorAnchors.js` — append matching anchor rows (`pos` near authored field centers,
  `landmarkGlb`, `visualRadius`). All dressing props stay non-colliding (no `collides`,
  no `landmark`), so the change is pure dressing — zero sim delta.
- Frontier fields are handled under S-14 (its region files carry their own anchors).
