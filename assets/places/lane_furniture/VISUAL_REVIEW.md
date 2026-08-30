# Helios lane furniture — hash-bound still panel (2026-08-18)

Untextured role paint is allowed. Construction repair removed floating vanes,
pads, and the ash cut-end brick. Eighteen stills:
`lane-furniture-stills/<id>/{three_quarter,starboard,rear}.png`.

## Exact wired release bytes

| id | release SHA-256 | Panel |
|---|---|---|
| `place_lane_pin` | `c94e53f749dfd743d8cf9dd069936d5ce0aa2ee244251c54ab0e222d7d7a3a45` | A/B/C WIRE |
| `place_cold_locker` | `bc59994f9fc9b6e084571abefbacc01fd7b706298f442a6777c69afc6724abb8` | A/B/C WIRE |

## Held on disk (released, not admitted)

| id | release SHA-256 | Blocking note |
|---|---|---|
| `place_tally_post` | `85fec641d6c3dc4d3d8f077cd65510ee8a0ae07e48ad31b97824a31d0f6f0c47` | A: LEGO slats/cubes at the deck |
| `place_claim_mark` | `2eddb266ccec8dffd8df52d919f4b446f78701f2627982ce521478245c9b8fb3` | A: brick-rubble foot |
| `place_ash_pin` | `81118a505c5a3f7ba3df89923488b2d7b74c8a782f949c4ce6cd030adff48dbb` | A: plaque cubes + pad scatter |
| `place_whistle` | `1cfdaa1808da4ce3ca8fe4103352f2457d65cb352caa69a0b03b1a05df6d1071` | A: stray foot brick + cube lantern |

## Reviewers

| Reviewer | Family |
|---|---|
| A | WIRE_SUBSET — pin + locker only |
| B | WIRE_ALL — no floats |
| C | WIRE_ALL — no floats |

**Admit only the unanimous pair.** G1/G2/G4 stay OPEN.

The 2026-08-30 release rebuild changed only generated semantic node names for cold locker, tally
post, and ash pin; topology, materials, and supported-view appearance stayed unchanged. The hashes
above bind the same reviewed visual payload to the packageable release bytes.
