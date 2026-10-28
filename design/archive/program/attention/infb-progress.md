# devin-infb — TERRITORY B progress

Session resumed 2026-10-25; completed 2026-10-26. Four dead zcode-inf20 CLAIMED lines adopted — ALL FOUR resolved and pushed.

## Line status — DONE

| Line | State | Evidence |
|---|---|---|
| PULSE-07 (landmark+rim POI lore join) | ALREADY SHIPPED @ aad659da0d | `test/pulse-volume-fill.test.mjs` 7/7 green this session — 88 rim POIs + every live flavorTargetRef pinned ≥3 lore lines; catalog cell already SHIPPED. |
| EXP-12 (LOG narrates physics) | ALREADY SHIPPED @ 6b4b42bc84 + feed @ 187daf8fa6 | `test/zc-exp-12-log-narration.test.mjs` 4/4 green; 66 authored lines across outcome kinds, §3.2 register, silent in terminal zones. |
| SEED-SC-08 (Slag Hauler Hulk, poi_rhea_slag) | **SHIPPED @ 635fc7f96a** (shared-file un-sweep fixup a67b1bdce8) | Authored `place_rhea_slag_hauler` (15.9k tris, burned pot-line hauler, 3 derelict sockets) through Forge→release→pilots; `test/seed-sc-08-rhea-slag-hauler-4242.test.mjs` 1/1 green; fleet-look stills `.devshots/fleet-look/place_rhea_slag_hauler_{inspect,close,top}.png`. |
| SEED-SC-15 (The Funnel, poi_proteus_hulk) | **SHIPPED @ 635fc7f96a** (+ a67b1bdce8) | Authored `place_proteus_funnel` (8.4k tris, cut-throat freighter, violet-only lights) through same pipeline; `test/seed-sc-15-proteus-funnel-4242.test.mjs` 1/1 green; violet confirmed in close/top stills. |

## What landed (635fc7f96a + a67b1bdce8)

- New Forge sources: `tools/blender/forge/ships/place_rhea_slag_hauler.py`, `place_proteus_funnel.py`; fleet.json entries (`layout:'place'`, `new_place:true`, SF_PLACE_RHEA_SLAG_HAULER / SF_PLACE_PROTEUS_FUNNEL).
- Source GLBs in `assets/ships/parts/places/`; synced parts_manifest rows (rhea 15,897 tris / proteus 8,352 tris; SOCKET_Hazard_Core+Salvage_Core+Camera_Focus on both).
- Release GLBs (496 KiB / 355 KiB, KTX2+meshopt) + release_manifest rows; pilots `rhea-slag-hauler` / `proteus-funnel` (364 total); renderPackageManifest.js entries.
- `landmarkGlb` swapped in north.js/east.js; DRESSING_RADIUS 42/40 in world.js; POSTCARD_LANDMARK_PLACE_FILE_BY_ID + RELEASE_URL maps (authored-set-piece gate — deliberately NOT in PLACE_FILES so ordinary dressing can't borrow them).
- Focused tests pin sector pin, memorial/cache/buoy untouched, live `_spawnPOIs` placeId, `resolvePlaceFileForEntity` (+ null for non-POI), release sha != dead_hulk, sockets, materials, and postcard geometry signatures (pot rims + empty station / wall bands + violet strips + debris plug).
- `npm run check:release-manifest-pins`: 364 pilots consistent. `check-parts-manifest`: 7564 ok 0 fail.

## Shared-tree incident (resolved)

- `git commit -- <paths>` takes WORKTREE content, not staged hunks — 635fc7f96a swept devin-fart's in-flight rock-family rows (fleet/parts_manifest/pilots/release_manifest/renderPackageManifest + world.js+partsLibrary hunks) whose GLBs were uncommitted → broken refs on remote.
- Fix a67b1bdce8 restored every shared file to 79e98092f4 + my rows only (index-level blob staging; disk untouched — fart's work preserved).
- devin-fart's rock assets remain dirty on disk, uncommitted, for their lane to land. Their census regen (modelTruthCensus.{json,generated.js}) and 340 render-package.json churn files were never staged.

## Bookkeeping done

- inference-record: seed-sc-08 + seed-sc-15 recorded (WF-11, opportunity, implemented, focused_green, commit 635fc7f96a).
- LANDED_REVIEW.md: R-635fc7f-08 + R-635fc7f-15 OPEN rows.
- INFERENCE_IDEAS.md cells: both → SHIPPED.
- check-inference-control: PASS.
