# FB-128 — The five sectors without a named lane contact get one, stamped on their traffic

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: laneContacts.js, seam: traffic.js
**Write-set:** `src/data/laneContacts.js`, `test/fb-named-face-every-sector.test.mjs`
**Neighbours (extend, never restate):** SFQ-B101, SF-175

## The gap
`NAMED_LANE_CONTACTS` authors 21 named civilian identities across 20 sectors and `traffic.js` stamps them
deterministically onto ambient hulls; ashfall_reach, orcus_shadow, phoebe_echo, triton_wake and sedna_dark
have none. Five sectors have no face. Adjacent to SF-175 (a moving clue that belongs to a real worker).

## Why this direction
Five data rows on a stamping path that already works; each name carries a job and a hail so the sector's way
of life has a voice.

## Mechanism
- Author one named contact per missing sector with a role that matches the sector (a vael research courier, a
  quiet-sector tanker), a hail line and a memory hook the station contact system can use.
- Pin that every sector resolves at least one named contact and that the stamp is deterministic on seed 4242.

## Done when
`test/fb-named-face-every-sector.test.mjs`: 24/24 sectors, deterministic stamp;
`npc-jobs-runtime-occupational-heads.test.mjs` stays green.

## Do not
Do not add roles. Do not stamp two names on one hull.

## Focus test starting points
- `test/npc-jobs-runtime-occupational-heads.test.mjs`
- Locate lane-contact suites with `rg laneContacts test/`.
