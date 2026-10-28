# Veil research edge: working and observation margins

## The place

The eastern approach still leads straight to Research Station Veil. A short southern branch leaves a pilot outside the instrument run, with a cold locker, utility module and small crew habitat making a modest working apron rather than another destination. The habitat's real -X airlock faces the empty waiting circle. Its own solar wings already explain its power; there is no redundant array.

North of the work, one observation blister gives the second pause a readable edge. From the empty observation position the existing tender's anomaly-side turn is about 120 WU away and the listener's near turn about 91 WU away. This is a voluntary view of work, not a new interaction or reward. Quiet Ice remains a separate journey roughly 2,663 WU from the station.

Veil remains Free Frontier and brusque, not the unresolved canonical Vael hospitality binding. Existing docked Rumors keeps the Surge Shrine lead and adds only: “If you are here to watch, leave the instrument run clear.” This remains truthful when fallback or old layouts lack the props.

## Feature files and scope

Only these five source/test paths belong to this candidate:

- `src/data/veilResearchEdge.js` (new): authored four-model contract and anchor-relative composition.
- `src/data/everydaySpaceKitDressing.js`: one import and one early Veil dispatch, layered over PR552 without changing Tethys or the random picker.
- `src/data/frontierRumors.js`: `station_veil` sentence only.
- `test/veil-research-edge.test.mjs` (new): eleven bounded tests.
- `test/pq136-everyday-space-kit-placement.test.mjs`: explicit authored Veil case; all non-Veil assertions, including PR552's Tethys branch, retained.

The publication increment adds a focused `check:veil-research-edge` command and one static-module preload alongside these feature files. No world, traffic, ecology, save, reward, cargo, UI or asset implementation is changed. Read-only runtime sources and assets used for the bounded checks are not shipping changes.

## Exact base and preservation

PR552 head: `b7145c1f5e9ea68b2919e11cf6d6c45f544e082e`.

- PR552 kit base blob: `1e85cdd334326f2b6f6fde703b481ae95f21e210`.
- PR552 legacy-test base blob: `d4452b38d19d24b891735cc055b1981fae166f00`.
- Fresh master frontierRumors blob: `8656ec67af1ba4e9ec6230a27b20faf0443c336c`.
- Fresh master legacy-test blob: `8f0e59ca11df99449323037cb0d588e627943eb5`; its only differences from the PR552 base are that PR's three Tethys hunks.

These narrow public checks were completed on 2026-10-23 at approximately 15:09–15:13 UTC. The source/data basis was immutable `8bc5e265adfcd515f4c335cc785b73020d614518`, with unchanged relevant placements checked against later public master. `candidate-manifest.json` contains exact candidate and base hashes. The patch is against the pinned PR552 kit/test plus the unchanged public frontierRumors base, not against bare master without Tethys.

## Four bodies, not a forty-seventh random model

All paths are under `assets/ships/release/parts/`:

| Asset | Position X,Z | Rotation | Radius | Draw scale |
|---|---:|---:|---:|---:|
| `places/place_cold_locker.glb` | 505,-1290 | 0 | 10 | 10/12 |
| `places/place_utility_module.glb` | 550,-1290 | 0 | 8 | 1 |
| `places/place_habitat_pod.glb` | 590,-1280 | -atan2(60,50) | 8 | 1 |
| `places/place_observation_blister.glb` | 535,-885 | 0 | 8 | 1 |

The locker is already released occupational stock with radius 10. There are no occupational Veil placements to duplicate. It resolves through the production explicit PLACE_FILES route; the other three use the existing everydaySpaceKit family map. The 46-model random catalog, membership helper and random map remain unchanged. The legacy test now explicitly recognizes Veil as authored dispatch rather than pretending the locker is a random-kit member.

One unique finite live `station_veil` anchor is required. All four rows translate from its real position. A missing, ambiguous or malformed anchor returns null and leaves the original picker in charge; no props are fabricated at sector origin. Authoring stops and passes are reference geometry, not navigation commands or gameplay safe zones.

## Physical evidence

The four real GLBs were parsed through normalized quantized accessors and scene-node transforms. `measured-geometry-evidence.json` gives asset hashes and full projected bounds. The outward clearance radii used in tests are 6/4/8/5 WU respectively. These exceed the complete transformed projected footprints, not merely the smaller collision slices. Habitat socket direction has dot product 1.0 toward the waiting circle.

Station M planar skin is about 71.545 WU; tests reserve a conservative 90 WU surround. Tender/listener measured skins are under 17 WU; actor corridor checks use 18 WU around waiting positions and a wider 36 WU buffer around props. The ordinary eastern approach remains open. Existing instrument paths, Surge Shrine, the missing center and Quiet Ice ecology are untouched.

Under the current ordinary solid-dressing floor, locker and habitat are solid; utility and blister are visual-only. This does not imply enterable rooms, docking, sample handoff or instrument use. Actor motion/collision is not repaired or rerouted here.

## Validation and acceptance boundary

Command: `node --test test/veil-research-edge.test.mjs test/tethys-watch-overlook.test.mjs`.

Result: 20/20 passed (11 Veil + 9 unchanged Tethys), with a final rerun after comment-only clarification. `node --check test/pq136-everyday-space-kit-placement.test.mjs` passed. The other-sector picker checksum matches 48 independently captured PR552 cases across eight seeds and six sectors, including Tethys.

Resolver proof executes the actual production `placeFileForEntity` function and PLACE_FILES array expression from partsLibrary blob `4e542f47d74b8832b0d5b40b9944f1f371df823e`, with the real kit map. Unrelated family guards, tables and constants are supplied stand-ins; the tested locker entry is production data, not a mocked result. This is extracted resolver execution, not full renderer boot.

Placement proof similarly executes the actual `_spawnEverydaySpaceKitDressing` method from the copied world source blob `163edc60eda67e1aa8f924a077248fd1ebded00f`, with a recording `_spawnPlaceProp` and deterministic hash/RNG stand-ins. The pinned public PR552 fetch reports world blob `94eb8dbe73d9cd2c0afb26f9f65bcb2dfe04ee6b`. Independent verification compared that public method body with both local copies: all have SHA-256 `fe62d24d0986f6d2103ebb118b97e1d9034584dc7991114bdca413cff991e041` (851 bytes). The bounded consumer body matches; full-file byte identity is not claimed.

The full registered PQ136 world test remains an explicit acceptance boundary, not a claimed pass. Native flight, PBR appearance, saved-layout migration and Save/Continue are not exercised. The separate offline preview uses the actual exported station M and four-piece geometry; visual review found sparse intentional spacing and no overlaps, requiring no geometry change. It is not native-flight acceptance. No broad harness or aggregate/anvil test was run.

## Remaining acceptance

The authored composition and local courtesy are the deliverable. Preserve the Tethys placement when reconciling this increment with newer work. Run the broader registered placement test and inspect ordinary flight, saved-layout return and the normal game camera before accepting the place as complete. The finite observation and waiting references are not an installed route or a promise of safety.

Existing sample progression remains Sori's DMC, natural Veil gathering, eight units delivered to `station_triton` Wake Lab. Nothing here adds a new research, food, reputation, reward or sample authority. The place is the deliverable.
