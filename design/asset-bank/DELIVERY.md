# Reusable asset bank delivery

The first complete authoring bank contains **156 distinct models and 12 composition recipes**: 36 structure pieces, 36 operations components, 36 cargo/aftermath pieces, 36 natural/ancient forms and 12 large place modules. LODs and recolors are not counted as additional models.

## Verified exports and tests

The exact combined file projection passes the independent contract validator: **156 models / 468 actual GLBs / 196,921,332 GLB bytes**. Each model has a sidecar, all-LOD transformed bounds, occurrence costs, collision/socket declarations and content hashes. All 12 recipes pass transformed bounds, joins, approach/exit proxy and actual dependency-file checks. Their 47 unique dependencies are pinned to141LOD hashes.

Focused JavaScript suites pass108tests (66contract,15catalogue/planner,27assembly), alongside18Python bounds/cost tests. Reviewer's strict scene semantics and newer changes are preserved. Repository-wide CI is not all green: observed failures also occur on the actual tested master68ace403 baseline, run38501227696; latest-head CI is monitored separately.

## Visual review

Actual exported CPU views were inspected across all families, including coarse LODs. Revisions include continuous pipe elbows, planar coarse windows, preserved transformer fins and array patches, a detailed lathe, sagging sacks, fractured engine/hull pieces, natural strata cores, hollow growths and a genuinely curved nerve corner. Large pieces include dock supports, habitat shells, terraces, a fabrication hall, ring segments and a dish backframe. Composition renders show candidate arrangements using exact reviewed peers.

See family review manifests and assets/models/asset-bank/large/evidence/recipes-v3. These are export views, not live gameplay captures or final visual acceptance.

## Use the bank

- CATALOG.md and scripts/list-asset-bank.mjs: discover published IDs, tags, dimensions, costs and sockets.
- SCENE_PLANNING.md and scripts/plan-asset-bank-scene.mjs: deterministic placement matrices, conservative bounds and occurrence costs without booting the game.
- design/asset-bank/assemblies.json:12candidate compositions with hash-locked dependencies.
- scripts/check-asset-bank-assemblies.mjs: validate joins, proxy clearance, bounds and referenced export hashes/bytes.
- INTEGRATION_BOUNDARY.md: current loader/release ownership and consumer checklist. The bank is not automatically preloaded or included in retail packages.

## Open acceptance and next work

This completes the first bank's modeled/exported/reviewed/published increment, not whole-game or integration acceptance. Consumers must explicitly package selected assets and verify live camera readability, collision/motion clearance, loading/Continue behavior and target-device performance. Repository storage/clone cost increases even though these assets are outside current retail copy roots.

Keep SF-ASSETBANK, SF-ASSET-QUALITY and the larger goals in OPEN_GOALS.md open until usable integration and acceptance are demonstrated. Continue the active Orchard/world-depth work under existing path ownership. No master merge, deployment or security change is included.

Transient blob timeouts were checked by exact remote SHA; successful objects were retained, independent work continued and the missing files were later verified successfully.
