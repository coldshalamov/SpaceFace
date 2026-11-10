# Inference 5x tranche — 2026-08-11

**Mode:** INTEGRATION (+ starved UI/economy repair)  
**Director:** `node scripts/inference-detect.mjs --nx=5` → integration debt + starved WF-06/14  
**Method:** `design/vision/INFERENCE_CONVERGENCE_METHOD.md`

## Ordinary-player diagnosis

- Tractor modules catalogued magnetRange but mining used only MAGNET_RANGE floor / dead player knob.
- Bruiser fights used interceptor flyby doctrine; concentration board ~57% flyby.
- Ceres causal stamps drove VFX only — no hail/target literacy for living work.
- Hauler MANIFEST listed cargo without credit scale.
- Starved domains WF-06/WF-14 never recorded.

## Candidate pool

≥16 candidates; 5 selected. Cut list in scratch `slate.txt` (incubator bulk, new job kinds when saturated, microevent authoring without surface, etc.).

## Units (all KEEP after triple cold review + revise)

| ID | Slug | WF | Mode | Player-visible |
|----|------|----|------|----------------|
| U1 | fitted-tractor-magnet-range | WF-05 | integration | Fitted tractor scoops ore farther (560/780 vs 420 floor) |
| U2 | brawler-commit-doctrine | WF-02 | repair | Bruiser sticky orbit commit + fire + choreography |
| U3 | causal-work-hail | WF-01 | integration | Stamp-gated work hail with tactical means |
| U4 | manifest-cargo-value | WF-06 | starved | MANIFEST shows ~CR + ranked lines |
| U5 | target-living-work-readout | WF-14 | starved | Tab-lock WORK · phase |

## Owners / protected seams

- U1: ships derived max-wins magnetRange; mining single resolver; unique Tideline wreck-only; no cargo/economy writers
- U2: pure combatDoctrine; engagement fire table; choreography; enemies.bruiser only
- U3–U4: contactHail read-only; parley sole toll authority
- U5: targetPanel pure intel; selection vs gunTarget unchanged

## Evidence

- Focused tests: `test/inference-5x-*.test.mjs` (+ massline tractor, R2 tideline, combat-doctrines, contact-hail)
- Route probes: shipped entry seams (see scratch unit-*-route.log / unit-all-routes.log)
- Reviews: `design/inference-workflows/records/inference-5x-2026-08-11/`

## Reusable grammar

- Fitted capability max-wins → derived → single consumer
- Lock thin / hail deep for living stamps
- Stamp-gated worker vs trader channels
- First-class doctrine requires fire table + choreography + spawn

## Authored limits

- Phase/means copy maps are Ceres-specific
- Brawler retag is bruiser_brawler exemplar only
- ~CR is catalog basePrice, not station market
