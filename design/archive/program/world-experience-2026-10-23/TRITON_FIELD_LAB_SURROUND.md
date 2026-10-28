# Triton Archive field office: existing pieces, coherent place

2026-10-23. Source implementation and focused geometry/consumer checks. Not native flight, full Save/Continue, live-render visual acceptance, or completion of Triton/whole-game scope.

## Experience and limits

The Archive's instrument mast at local (1600,-700) remains the research identity. Four existing released pieces now give it an understandable working margin: freight-platform instrument apron east of the mast; compact utility service and habitat beside that apron; observation dome north. The habitat's native -X airlock faces its own apron. The west approach remains open, so arrival can read the instruments before entering the small service yard, or pass outside without taking an activity. Returning recreates the same layout from the actual live POI coordinate, without consuming the random kit stream or storing a new timer/state owner.

This is a small field office, not a relocated station or a claimed new settlement. Free Frontier Wake Lab at (480,-980) and its existing tender/sampler remain separate; no Archive workers have been invented. Watcher at (-1700,1500) remains untouched, including its current placeholder body. Archive arbitrary-bearing, three-bearing research remains authoritative. The sample west pass and watch stop are authoring references, never mandatory scan bearings, navigation markers, rewards or safe zones.

## Exact composition

Offsets from the unique visible active.pois entry with poiId=poi_triton_field_lab, type=anomaly, and finite numeric global pos:

- Instrument apron: place_freight_platform, (+45,0), yaw0, radius28.
- Instrument service: place_utility_module, (+68,+30), yaw pi/2, radius8.
- Field habitat: place_habitat_pod, (+68,-30), yaw atan2(-30,23), radius8.
- Watch dome: place_observation_blister, (+15,+40), yaw0, radius8.

Missing, hidden, mismatched or ambiguous anchors return null to the ordinary generated kit. This replaces the sector kit allocation with four rows, rather than adding four to it. The random inventory remains46 models. No exported model, texture or collider asset is new. All other sectors retain exact previous results and RNG consumption.

The actual world consumer now passes active.pois in one new line. _spawnPOIs computes global coordinates before the dressing consumer runs. Existing _spawnPlaceProp still owns exclusion admission, measured skins and residency. A later explicit POI exclusion still rejects these placements normally; there is no bypass.

## Geometry evidence

Four actual release GLBs were read and hash-checked, and their decoded rest-pose bounds compared with conservative row radii. Runtime census reference radii28/8/8/8 and drawScale1 were checked. Habitat yaw follows the renderer's -entity.rot convention: native-X points northwest toward apron vector(-23,+30), not merely a plot convention.

The existing mast is different: its merged POI has neither landmark:true nor collides:true, no target radius and no exclusion. The current _spawnPOIs therefore creates a radius10 presentation marker with no solidPlan. Census mast reference radius14 means its draw ratio is10/14, with no explicit target fit. It must not be described as a new solid collider. Even conservative marker10 plus apron28 leaves7WU clearance at center separation45, not a ship lane or structural attachment. All four new conservative circles clear each other, the sampled west approach with36WU allowance, and the watch stop. The illustrative180–300WU survey annulus also remains open; that does not make it a required research path.

## Checks and provenance

- Focused test/triton-field-lab-dressing.test.mjs:8/8 passed. Covers count/identity, live anchor schema, moved global anchor, malformed/ambiguous fallback, deterministic repeat and serialized-anchor reconstruction, exact production consumer, release hashes, runtime census/geometry, actual exclusion prelude and habitat yaw.
- Red control removing only new world consumer pois input: expected failure6!=4. The old consumer cannot supply the Archive anomaly anchor.
-288 comparisons of 24 non-Triton sector fixtures x4 palettes x3 seeds against exact PR552 kit blob3c41800934147c2abaf44e59d8f0670025153c3c: output and RNG counts identical. Station fixtures use actual runtime stationId, including the authored Tethys and Veil branches. Digest366adeecbb111313e17758688a72530b9ec7cefead04b4df083f12d7f0f4550c.
- Base PR552 head2544cdaf1b151f0c785f3f7b9c6af88b8dae2d77; inspected public master808d4a99c5c7010a0fb6cf7b9edeaf5393a738e9. world.js blob94eb8dbe73d9cd2c0afb26f9f65bcb2dfe04ee6b identical at both. All59 openPR path lists and five world.js PR patches reviewed; consumer hunk disjoint from claimed interdiction/wonder and other active patches. Recheck remote before publication.

## Remaining acceptance and next connected work

Preview the actual exported composition including the original mast, then ordinary arrival, bypass, leave/re-enter and native Save/Continue in an approved live browser route. Source serialization is not a Save/Continue witness. Verify labels, lighting, real craft clearance/performance and research comprehension. Existing broad goals and commission6 remain open. Next useful world work is a properly owned Archive ordinary-work experience and clearer narrative connection to the Watcher, not an invented staffed lab or more arbitrary props. Any larger missing setpiece belongs in the existing build-map request, not duplicate queue creation.

## Visual iteration and exact runtime data

The first exported-geometry composition was too dispersed: the dome90WU from the mast read as an isolated object. A second compact arrangement groups the office on the east/north side, moves the pause to(-45,+40), and keeps the west pass. First-iteration source/test/report remain recoverable in the delivery packet. Second composition visual review remains pending, not accepted by these tests.

Public east source7f183fbbf41042cbeb34f9ee9851c2ef30c6764e was used in the final fixture. The canonical census file is older than public; all five COMPLETE relevant rows were compared against public census blob4a9da6061a48489dcd5389d3559dbacc9ce16525 at master808d4a9 and were identical. Their exact bounds, centering, reference radius and scale therefore remain supported by current public evidence.

Regression inventory qualification: the24 fixture sectors come from the read-only canonical SECTORS inventory, not a claim that every current public sector was enumerated. The unchanged non-Triton code suffix, exact baseline blob, sector guard, and actual Tethys/Veil runtime-anchor cases are the bounded regression evidence.
