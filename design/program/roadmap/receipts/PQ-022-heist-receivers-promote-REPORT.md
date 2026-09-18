<!-- LIFETIME: EVIDENCE -->
# PQ-022.heist-receivers-promote — Tethys heist catcher and fence read as their roles

```yaml
unit: PQ-022.heist-receivers-promote
parent: PQ-022
dispatchPriority: 493
state: integrated
acceptance: focused_green
date: 2026-09-16
```

## What changed

The two KEEP re-authored PQ-019 receiver-facility candidates already lived in
`assets/ships/m5_claim_outposts/{source,release}_candidates/receiver_facility_material_truth_v1/places/`
but carried no asset identity and no manifest rows, so the Tethys heist facilities still wore the
shared World Site bodies (`place_claim_outpost_base`, `place_claim_outpost_refinery`).

- **Recovered and published the KEEP bodies under their own place ids.** New
  `tools/art/publish_receiver_facility_variants.mjs` stamps the reviewed candidates with
  `SF_PLACE_CLAIM_OUTPOST_CATCHER` / `SF_PLACE_CLAIM_OUTPOST_FENCE` identity (asset/scene/root
  contracts, root node renamed), writes the canonical sources, splices the two parts-manifest rows
  plus their runtime-slot entries, and inserts the release-manifest placeholder rows. It never
  touches the shared base/refinery files, rows, or bindings; geometry, sockets, collision hull,
  AABB and the +X approach are byte-preserved from the reviewed candidates.
- **Packaged releases with the standard place pipeline** (`scripts/build-place-release-assets.mjs
  --ids place_claim_outpost_catcher,place_claim_outpost_fence`): KTX2 15/15 textures, 65 meshopt
  buffer views, release-manifest rows patched transactionally:

  | asset | source bytes | source sha256 | release bytes | release sha256 |
  |---|---|---|---|---|
  | place_claim_outpost_catcher | 6,489,504 | `705c277e…7d4b` | 1,575,280 | `e2943d27…32eb` |
  | place_claim_outpost_fence | 5,940,356 | `defefcb6…4e65` | 1,462,828 | `8768850d…fd1a` |

- **Wired the two heist facilities** to the new place ids (`src/data/heistFacilities.js`), added the
  two immutable bindings with the unchanged socket layout/visual centers
  (`src/data/worldSiteAssetBindings.js`), registered the files in the runtime place map
  (`src/render/partsLibrary.js`), and moved the facility derivations onto the new corridor-set rows
  (`scripts/lib/pq022CorridorAssetSet.mjs`). The World Site stages keep
  `place_claim_outpost_base` / `place_claim_outpost_refinery` unchanged.

## Checks (all on the candidate tree)

| Check | Result |
|---|---|
| `npm run check:pq019a:facility-embodiment` | 19/19 pass — pinned socket heads, route legs, materialization, map courses |
| `npm run check:pq019c:mission` | 67/67 pass |
| `node --test test/world-site-assets.test.mjs` | 6/6 pass — hash-exact source/release/binding/release-manifest identity and socket transforms |
| `npm run check:asset-reachability` | OK — 614 referenced runtime assets exist and are retail-routable |
| `npm run check:pq022:corridor-assets` | PASS — 80 required assets, 78/80 bind; the two named gaps are the foreign, allowlisted wasp LODs |
| `node scripts/check-parts-manifest.mjs` | New rows 0 fails (dimensions/tris match exactly; only byte-profile/generator diagnostics); the 79 failures are foreign pre-existing wholeship/place dirt |
| `node scripts/check-claim-outpost-visuals.mjs` | 70 ok, 0 fail |
| `npm run check:atlas-integrity` | PASS |
| `npm run check:render-package-plan` | 238/238 packages build a valid instance plan |
| `npm run check:runtime-assets` | 8 required failures, all foreign wholeship textures/LODs; neither new place appears |
| `npm run check:baseline` | 15/15 links green; wall 95.46s against the 90s budget under concurrent lanes (contention overrun, not a link failure) |

## Route and visual basis

Per the owner capture decision (2026-09-16, `AGENTS.md` §13), close is a focused test, not a headed
still. The visual identity was already judged whole-asset KEEP (G1/G2/G4) on 2026-08-10
(`visual-review.json`: "open capture fork with rooted jaws/load path and partial impound" /
asymmetric shielded-handoff), and this unit preserves that exact geometry while making the live
route use it. The facilities' live place ids, socket projections, materialization and map courses
are pinned by the embodiment check.

## Unproven / residual

- No fresh headed chase-camera still was taken; the live-route read is argued from the reviewed
  candidate plus the deterministic checks above (owner ruling: capture is optional and never the
  default proof).
- The KEEP review notes surface residual: panel-assembly grammar rather than continuous shell
  plating; deterministic substrate maps rather than hand-authored wear.
- The review's open P0/P1 list is empty; its Phase B promotion and Phase C release/runtime recapture
  clauses are satisfied by this promotion.

## Follow-ups deliberately excluded

- No change to World Site stage bodies, claim-outpost specialization maps, or the launcher.
- No second launcher, fork mechanics, or mission change (that is PQ-195 territory).
- No new acceptance infrastructure.

## Publishing note (2026-09-17)

A concurrent lane's sweep commit (`2be848900`, PQ-195.00) carried this unit's
`parts_manifest.json` / `release_manifest.json` rows, bindings, facility wiring and corridor-set
entries into `HEAD` without the new GLB blobs, so `HEAD` referenced two files that did not exist.
This unit's commit supplies the four blobs, the promotion tool, this receipt and the packet note.

Two shared-file updates remain in the working tree because they carry foreign uncommitted hunks and
this repo publishes partial work with pathspecs only:

- `src/render/partsLibrary.js` — the two `PLACE_FILES` entries (first hunk) ride the next legitimate
  commit of that file by its owning lane.
- `design/program/roadmap/program-queue.json` — the row flips to `done` with this receipt; left for
  the queue-owning fleet lane's next sweep, together with that lane's own pending row flips.

