# S-15 plan — The Bolus (tribunal synthesis)

Unanimous: +2 POIs, +1 zone, +1 plate — all inside `theBolus.js`'s three frozen arrays
and the existing card `pois:`; layout (99 rows), lore keys (20 flag-triggered), and
`bolusPlay` constants untouched.

| Axis | Drifter | Archivist | Skeptic |
|------|---------|-----------|---------|
| Critical-path weight | 4 | 3 | 4 |
| Authenticity | 5 | 5 | 4 |
| Specificity | 5 (named swallowed crew) | 5 | 4 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 4 | 5 (the Cough has zero finds) | 5 |

## Landed plan (`src/data/theBolus.js` only)
1. Card `pois:` — append:
   - `poi_bolus_manifest` type `derelict`, name 'The Last Manifest' — a swallowed
     hauler hulk inside the Cough. discoveryPlate names two of its crew (named dead +
     harvest flavor: what the gut keeps).
   - `poi_bolus_rib_watch` type `beacon`, name 'Rib Watch Buoy' — the station's watch
     buoy off the berth. discoveryPlate in the Rib's clipped shift-log register.
   - `discoveryPlate` added to existing `poi_bolus_charon_buoy` (beacon — legal,
     previously silent; plate files which Charon crew dropped it and what it still
     reports). POI keeps eligibility — the gut hosts no writ pool, and the buoy is a
     beacon (already ineligible in zero-hostility sectors anyway).
2. `BOLUS_ANCHORS.pois` — append matching anchor rows:
   - `poi_bolus_manifest` pos (1700,820) inside the Cough zone (1800,900 r700),
     `landmarkGlb: 'place_dead_hulk'`, visualRadius 22.
   - `poi_bolus_rib_watch` pos (-880,-780) near the berth (-980,-900),
     `landmarkGlb: 'place_nav_buoy'`, visualRadius 10.
3. `BOLUS_ZONES` — append `zone_bolus_nursery` 'The Nursery', type `anomaly_deep`,
   faction_free, center (-560,-400) r300 (the `bolusPlay` nursery coords —
   `nurseryX:-560, nurseryZ:-400`), reason naming the fingerlings the play code already
   simulates.

## Not landing (rejected at tribunal)
- Any layout/body/force-table edit — the 99-row contract is pinned and the interior's
  choreography is machinery, not data surface.
- New `BOLUS_LORE` keys — every key is flag-triggered; untriggered text is dead data.
- Colliders, salvage points, recovery encounters — new machinery.
- More POIs — two finds plus the nursery name is the dose for a one-POI gut.

## Test
`node --test test/bolus-lore.test.mjs` — layout pins + lore predicate contract
(unmodified surfaces stay green; confirms the gut's pinned shape survives the add).

## Approvals
Tribunal synthesis recorded above (Drifter + Archivist + Skeptic in S-15-drafts.md).
Single-agent unit per the row instruction.
