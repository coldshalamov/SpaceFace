<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.billboard-buoy-reauthor-h1
acceptance: route_accepted
disposition: PASS
candidateCommit: 5b1ee35e0dc05a3d2154ff91aa111c4c84a45e41
-->

# PQ-022 revised billboard and buoy H1 receipt

```yaml
packet: PQ-022
dispatchUnit: PQ-022.billboard-buoy-reauthor-h1
candidateCommit: 5b1ee35e0dc05a3d2154ff91aa111c4c84a45e41
disposition: PASS
acceptance: FUNCTIONAL_H1_ACCEPTED
fixedSeed: 47
browserClaimId: 22656-ed0390da7a1a0cec93644940
browserCandidateDigest: 7da5886085a235cfcc02a1975186a8841ac84fc4da1ef0f4e5f4793b48a2d032
browserManifestDigest: e330ff2e9d65e8bc5265f64a3623db81b09b6a7bb6474f02d4b89fba2d1e1a2f
browserInputDigest: 8abf98d22289855c1b238060dc487e656e26e4a5f14efd347d018e169e5da338
browserReportSha256: 8cbc7ea1e8a9cf7fe45895260578def3f12173d85bd690de9c01454d7a3e0473
electronClaimId: 19524-eb8abeebdaf49e41131bda02
electronCandidateDigest: 43b6df2f6dbf64e8abade141c546c36804dd71c1b38034f69f3a3a650660954c
electronManifestDigest: fdda6875a8a9ea9ec8ed242fffee94120d8e17153cf75c448137be26dbe8daee
electronInputDigest: f749e1bf43c495fa6af64ee47ba23881d7f76335e4dcea66f14984800849c3dc
electronReportSha256: f54cfa37f650c39f86b59ac7becb4738e24647361d533e67fca50c060b0ce73f
sourceSha256:
  stationBillboard: 9245e7275b36ebed9e7e853a14f1e0315d85d23c14323b6d947ea4cb3a1f2ff6
  navBuoy: ced25c9c6d47bf27ab1c58ed61658738d2b28e36e7b0e743c6d245df042cf77b
releaseSha256:
  stationBillboard: f94ce276f99defb0aa770dd9cc0accd24e828d9b56ecb27d5ea0b3383699a293
  navBuoy: d39f5b42d5b790c12546cb395629ff79c82b607296e1b0b555eed6b25f7a2dcd
performanceEvidenceClaimed: false
causalVisualVerdictClaimed: false
physicalHardwareClaimed: false
```

## Accepted result

The registered Browser and source-Electron manifests each spent broker-authorized launches and
passed cleanly. Both used fixed seed `47`, real Intel ANGLE/D3D11, authored releases
(`place_station_billboard.glb` and `place_nav_buoy.glb`), and live sector placements in
`sector_helios_prime` (station billboard dressing) and `sector_tethys_junction` (public Customs Log buoy).
Browser and Electron each retained ordinary game-canvas views of both assets. Electron consumed the
exact current Browser receipt, matched its normalized semantic projection, emitted zero page issues,
and closed its owned runtime/profile.

The four captures and their broker ledgers are retained at
[`billboard-buoy-reauthor/`](../evidence/h1/row7-pq022-asset-leaves/billboard-buoy-reauthor/EVIDENCE.md).
The retained tree is bound by `SHA256SUMS.txt` (23 files verified before commit) and records exact source
and release identities, authored-release admission, placement, material texture roles, capture hashes,
claim consumption, launch counts, and cross-runtime parity.

## Capture identity

| Host / subject | Retained file | SHA-256 | Bytes |
|---|---|---|---:|
| Browser station-billboard | [01-core-station-billboard-ordinary.png](browser/01-core-station-billboard-ordinary.png) | `b3827221c619c4dc1b26dea789a0741b3d80c632d64bb3c167870c4093ef3f78` | 486,830 |
| Browser nav-buoy | [02-tethys-customs-buoy-ordinary.png](browser/02-tethys-customs-buoy-ordinary.png) | `0588ced7ab2cfbe8fc5e9f7807faf1584b70ff11e92a2976cdda4f8b5514c2fc` | 299,450 |
| Electron station-billboard | [01-core-station-billboard-ordinary.png](electron/01-core-station-billboard-ordinary.png) | `4f1ec269087b03a0b7698dbdea29fb79b35b37d678af8c9e4ba7a6648d710aa5` | 489,467 |
| Electron nav-buoy | [02-tethys-customs-buoy-ordinary.png](electron/02-tethys-customs-buoy-ordinary.png) | `553091044674535e600f820c6e717f3e7d4ad4abf86dd6a782c41eab96a26dc5` | 291,960 |

## Verification budget and claim boundary

- Browser headed acceptance: **1 pass / 1 launch / 0 retries**.
- Electron headed acceptance: **1 pass / 1 launch / 0 retries**.
- Corridor assets check: `npm run check:pq022:corridor-assets` PASS.
- Live assets check: `npm run check:assets:live` PASS.

No additional validation run is justified by this receipt closeout. `browser-gpu` and
`validation-broker` are released. This unit proves exact route admission, visibility, ordinary framing,
semantic host parity, and clean native teardown. It does not claim the separate causal G1/G2/G4
visual verdict, matched performance, physical hardware, or parent promotion. The next exact unit is
`PQ-022.billboard-buoy-reauthor-review`.
