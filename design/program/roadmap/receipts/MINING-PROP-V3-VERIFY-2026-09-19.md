<!-- LIFETIME: RECEIPT -->
# MINING-PROP-V3-VERIFY-2026-09-19 — `place_mining_drone` / `place_conveyor_barge` were already re-authored (receipt)

```text
CURRENT STATUS 2026-09-19

CLOSED — no production work was needed and none was done.

The 2026-08-18 "mining-prop stragglers" finding claimed the two props were still on the 2026-07-05
bevel pass (drone 580 tris / 4 meshes / 4 KB flat normal; barge 1,144 tris / 4 KB stub ORM). That
measurement was stale. Both live release GLBs are already the V3 material-truth re-author
(2026-08-18 manifest note; builders tools/blender/remaster_opening_{mining_drone,conveyor_barge}_v3.py).
Source, release, release manifest, and render-package provenance all agree by hash. The queue row
admitted on the stale finding (PQ-210) is withdrawn; the packet is retained under ../retired/.
```

## Live evidence (measured 2026-09-19)

| | `place_mining_drone` | `place_conveyor_barge` |
|---|---|---|
| source GLB | `assets/ships/parts/places/place_mining_drone.glb` | `assets/ships/parts/places/place_conveyor_barge.glb` |
| source sha256 | `052bd455…d52c1a` (4,035,648 B) | `4880514e…0496bc` (12,970,868 B) |
| release GLB | `assets/ships/release/parts/places/place_mining_drone.glb` | `assets/ships/release/parts/places/place_conveyor_barge.glb` |
| release sha256 | `79cffc2f…185661` (1,465,028 B) | `73e83200…d93683` (4,988,468 B) |
| triangles / meshes | 17,924 total (LOD0/1/2 8716 / 6704 / 2504) | 37,332 total (LOD0/1/2 19500 / 12608 / 5224) |
| materials | 7 semantic | 9 semantic |
| textures | 22 KTX2 (base/normal/ORM + emissive) | 29 KTX2 (base/normal/ORM + emissive) |
| render-package | `render-packages/mining-drone` contentHash `cf33b2ec…` | `render-packages/conveyor-barge` contentHash `4433a25f…` |
| render-package provenance | `sourceGlb.sha256 79cffc2f…`, 1,465,028 B — \*matches the release GLB\* | `sourceGlb.sha256 73e83200…`, 4,988,468 B — \*matches the release GLB\* |
| build report | `assets/ships/opening_route_props/reports/mining_drone_v3/report.json` (`modifierOrUvFailures: []`, tangents valid) | `.../conveyor_barge_v3/report.json` (same) |
| hooks / socket preserved | `HOOK_Spin`, `HOOK_Emissive`, `SOCKET_Mining_Front` | `HOOK_DRIVE_PLUME`, `HOOK_Emissive`, `SOCKET_Trail_Main` |

Both release GLBs are what the game loads: `src/render/renderPackageManifest.js` points each
`sourceUrl` at `assets/ships/release/parts/places/…`, and each compiled `render-package.json`
records the release GLB's exact byte count and sha256 as its `sourceGlb`. The drone maps through
`src/render/partsLibrary.js` (`places/place_mining_drone.glb`, `PQ_193_05_DRONE_PACKAGED_FILE`);
the barge through `places/place_conveyor_barge.glb`.

## Checks run

- `node scripts/check-asset-status.mjs` — `Asset status OK: 168 parts tracked, 2 blocked, 0 reachable
  from runtime, 0 ambiguous.` (exit 0)
- `node scripts/check-parts-manifest.mjs` — **no `FAIL` row for either prop**; only informational
  `DIAG` profile-drift notes (`generator is outside the historical tool chain`; the barge's total
  byte/tri count exceeds a legacy per-part profile). The 81 `FAIL` rows in that run are pre-existing
  and belong to other parts (`place_lane_pin`, `place_tally_post`, `wholeship_hornet_production_v1`,
  the trade-hub overlays, etc.), not to these two props.
- `node scripts/check-render-package-pilots.mjs` — fails on `apron-shuttle` (stale pilot), outside
  this pair; the required pilot keys are `kestrel`, `helios-span`, `debris-chunk`.

## Why no re-author was run

The named outcome ("both props are material-truth V3, released, manifest-matched, LOD-authored,
and reachable on the default route") is already true in the committed tree. Re-running the V3
builders over an accepted release would regress landed work and violate the
`assets/AGENTS.md` "inspect before rebuilding over live work" rule. Per the owner's 2026-09-16
capture ruling, a fixed-numeric/hash close is the proof; a headed still is optional and was not
required.

## Known, non-blocking deltas (not part of this close)

- The V3 candidate reports still say `status: candidate-not-promoted` and list "collision" as
  controller-owned work. They are generated evidence and were not hand-edited. Both release
  render-packages have `collisions: []`, which matches the place-dressing convention (only 53 of
  238 render-packages carry collision, essentially all ships/wholeships and a few stations; the
  only barge-like entry with collision is the separate `ore-barge` wholeship).
- The report's `knownDefects` "not yet inspected on the live player route" remains an acceptance
  note for the owning lane, not a build gap.

## Provenance

- Withdraws the queue admission `PQ-210` and corrects the source finding
  `design/program/02_REMAINING_WORK.md` §Verified-open findings.
- Superseded finding origin: 2026-08-18 verify-open measurement against the pre-V3 bevel pass.
