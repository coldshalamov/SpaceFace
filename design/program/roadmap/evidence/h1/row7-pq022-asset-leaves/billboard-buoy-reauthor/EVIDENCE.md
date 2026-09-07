# PQ-022 billboard and buoy re-author — retained revised H1 evidence

**Result: PASS.** This subtree retains the exact generated Browser and Electron evidence for
`PQ-022.billboard-buoy-reauthor-h1`. Each broker-authorized cell used the literal `billboard-buoy` selector,
captured the revised core station billboard and Tethys customs navigation buoy at ordinary game-canvas framing, and consumed one launch. No unrelated
Row-7 identity or still was recaptured.

## Exact claims and candidate binding

| Runtime | Manifest | Claim ID | Candidate digest | Manifest digest | Input digest |
|---|---|---|---|---|---|
| Browser | `pq022-billboard-buoy-reauthor-browser` | `22656-ed0390da7a1a0cec93644940` | `7da5886085a235cfcc02a1975186a8841ac84fc4da1ef0f4e5f4793b48a2d032` | `e330ff2e9d65e8bc5265f64a3623db81b09b6a7bb6474f02d4b89fba2d1e1a2f` | `8abf98d22289855c1b238060dc487e656e26e4a5f14efd347d018e169e5da338` |
| Electron | `pq022-billboard-buoy-reauthor-electron` | `19524-eb8abeebdaf49e41131bda02` | `43b6df2f6dbf64e8abade141c546c36804dd71c1b38034f69f3a3a650660954c` | `fdda6875a8a9ea9ec8ed242fffee94120d8e17153cf75c448137be26dbe8daee` | `f749e1bf43c495fa6af64ee47ba23881d7f76335e4dcea66f14984800849c3dc` |

The issued claims, consumed claim copies/markers, and consumed-claim ledgers are retained under each
runtime's `broker-claims/` directory without rewriting their original `.devshots` provenance paths.

## Exact promoted asset identities

| Artifact | SHA-256 | Bytes |
|---|---|---:|
| `assets/ships/parts/places/place_station_billboard.glb` | `9245e7275b36ebed9e7e853a14f1e0315d85d23c14323b6d947ea4cb3a1f2ff6` | 1,314,736 |
| `assets/ships/release/parts/places/place_station_billboard.glb` | `f94ce276f99defb0aa770dd9cc0accd24e828d9b56ecb27d5ea0b3383699a293` | 430,692 |
| `assets/ships/parts/places/place_nav_buoy.glb` | `ced25c9c6d47bf27ab1c58ed61658738d2b28e36e7b0e743c6d245df042cf77b` | 429,928 |
| `assets/ships/release/parts/places/place_nav_buoy.glb` | `d39f5b42d5b790c12546cb395629ff79c82b607296e1b0b555eed6b25f7a2dcd` | 205,128 |

Both reports record `presentationAdmission: "ready"`, `authoredAssetState: "authored"`,
`authoredAssetMode: "release"`, no retained readable fallback, the exact release slots, and 5 visible
meshes centered in ordinary framing.

## Retained captures

| Runtime | Subject | Retained file | SHA-256 | Bytes |
|---|---|---|---|---:|
| Browser | station-billboard | [01-core-station-billboard-ordinary.png](browser/01-core-station-billboard-ordinary.png) | `b3827221c619c4dc1b26dea789a0741b3d80c632d64bb3c167870c4093ef3f78` | 486,830 |
| Browser | nav-buoy | [02-tethys-customs-buoy-ordinary.png](browser/02-tethys-customs-buoy-ordinary.png) | `0588ced7ab2cfbe8fc5e9f7807faf1584b70ff11e92a2976cdda4f8b5514c2fc` | 299,450 |
| Electron | station-billboard | [01-core-station-billboard-ordinary.png](electron/01-core-station-billboard-ordinary.png) | `4f1ec269087b03a0b7698dbdea29fb79b35b37d678af8c9e4ba7a6648d710aa5` | 489,467 |
| Electron | nav-buoy | [02-tethys-customs-buoy-ordinary.png](electron/02-tethys-customs-buoy-ordinary.png) | `553091044674535e600f820c6e717f3e7d4ad4abf86dd6a782c41eab96a26dc5` | 291,960 |

## Runtime, parity, cleanup, and launch budget

- Both cells used fixed and recorded New Game seed `47`, viewport `1440 x 900`, and the real hardware
  path `ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
- Electron reports `browserComparison.pass: true`: normalized source/release identity, admission,
  framing LOD requests, and placement match Browser exactly. The matched placements are in
  `sector_helios_prime` (core-station billboard) and `sector_tethys_junction` (Tethys customs navigation buoy).
- Both page-issue arrays are empty. Browser's latest-run record exited `0`, did not time out, and
  required no kill. Electron additionally records `ownedRuntimeClosed: true`; its latest-run record
  also exited `0`, did not time out, and required no kill.
- `launch-counts.json` records clean launch budgets with authorized claims consumed and PASS records.

## Evidence boundary

These are functional/perceptual H1 records only. The reports explicitly set
`informational_contended: true` and `noPerformanceEvidence: true`; process durations and timestamps
are broker diagnostics, not frame-time, hitch, GPU-cost, or matched-performance evidence. Phase H3
retains the performance claim.

Only the new `billboard-buoy-reauthor/{browser,electron}` subtree was copied from
`.devshots/pq022-billboard-buoy-reauthor/{browser,electron}`. The existing files at the Row-7 root and in
sibling folders remain their respective retained evidence and were neither overwritten nor relabeled.
All generated files were copied byte-for-byte. `SHA256SUMS.txt` binds those files plus this summary; it
intentionally omits itself.
