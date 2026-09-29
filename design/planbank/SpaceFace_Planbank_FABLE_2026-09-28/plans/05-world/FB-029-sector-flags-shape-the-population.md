# FB-029 — Nineteen sectors stop sharing one byte-identical traffic mix

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: sectors.js, seam: frontierRegions, seam: traffic.js
**Write-set:** `src/data/sectors.js`, `src/data/frontierRegions/north.js`, `src/data/frontierRegions/south.js`, `src/data/frontierRegions/east.js`, `src/data/frontierRegions/west.js`, `test/fb-sector-traffic-identity.test.mjs`
**Neighbours (extend, never restate):** SFQ-B101, SFQ-B116

## The gap
`trafficRoleMixForSector` resolves only three distinct role mixes across 24 sectors: high-sec core, Ceres, and
one identical low-sec mix shared by nineteen sectors. The multipliers it reads (`sec.industries`,
`sec.scenic`, `sec.threat`) already exist in `traffic.js`; only Ceres sets `industries` and nothing sets
`scenic`, so the `tourist` role has weight zero everywhere.

## Why this direction
A per-sector traffic table was rejected: the mixer is fine, the flags are missing. Three or four flags per
sector in data changes the population with no code.

## Mechanism
- Set `industries` (mining/refinery/research) on the station-typed frontier sectors (hyperion_cut, rhea_cinder,
  nereid_shoal, charon_expanse, the research stations), `scenic` on Helios, Tethys and Veil, and a `threat` bias
  on the vael and quiet sectors.
- Assert in a table test that no two sectors have identical role mixes and that every role with an unlock
  condition (tourist, tanker) has at least one sector where its weight is non-zero.
- Read the mix on seed 4242 for three sectors and record the population counts before/after in the test.

## Done when
`test/fb-sector-traffic-identity.test.mjs`: 24 distinct role mixes; tourists appear in a scenic sector within
the first 10 minutes on seed 4242; `traffic-role-mix-reads-contents.test.mjs` stays green.

## Do not
Do not raise `ambientCountForSector`. Do not add roles. Do not touch the pocket cast machinery (that is
FB-030).

## Focus test starting points
- `test/traffic-role-mix-reads-contents.test.mjs`
- Locate frontier-region suites with `rg frontierRegions test/`.
