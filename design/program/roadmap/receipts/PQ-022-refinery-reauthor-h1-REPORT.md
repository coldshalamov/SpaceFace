<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.refinery-reauthor-h1
acceptance: route_accepted
disposition: PASS
candidateCommit: bd648bae38e11e64d9ceb20434b0b8ef5104184c
-->

# PQ-022 revised refinery station H1 receipt

```yaml
packet: PQ-022
dispatchUnit: PQ-022.refinery-reauthor-h1
candidateCommit: bd648bae38e11e64d9ceb20434b0b8ef5104184c
disposition: PASS
acceptance: FUNCTIONAL_H1_ACCEPTED
fixedSeed: 47
browserClaimId: 23668-ef07462410790475af28f61d
browserCandidateDigest: 45035c13407444741163c1ff35768df6c6322300a6054f7860685dd8472cc661
browserManifestDigest: cef2f2a43af673f61ecebc561a8077e9d91a2a61dd56014cf24191e4eccc1fb9
browserInputDigest: 4be1d5b2a73fb560c7fec997384d00c644efa0bdc4f85c139b79c2eb5708fcb5
browserReportSha256: f4d3da984b2e53822a83c24ab99f3557ad2d1e3f9526fb61d1f175140809f0e7
electronClaimId: 25260-f03f0389c73071d7b23b931c
electronCandidateDigest: ac75dbbecfb3bcf9fcb809d72bdd4ed734d5a28df0e39f94027cc63d57a4070d
electronManifestDigest: dbb373345954160aa76dd352af2ab422f6736198b229e086998ea9cdac2f9c81
electronInputDigest: ef8165803fa37f3d2c92ff72bbf74c3a9eeaafa14a85f73cba9db89f2764fc4a
electronReportSha256: c853408c3b3c6c53b031b30e720d7a14c0df64d1a1ca531fbb93b9f8dd344f6d
sourceSha256: 9faf59a697a9faafbf18f3c74c6abc27b7fc38e0ec3ffe3ea803396f46365d88
releaseSha256: 3b673f761f8e47c32ffa0563b933ad099380d2df75629dca927481cec4c8b7c0
performanceEvidenceClaimed: false
causalVisualVerdictClaimed: false
physicalHardwareClaimed: false
```

## Accepted result

The registered Browser and source-Electron manifests each spent broker-authorized launches and
passed cleanly. Both used fixed seed `47`, real Intel ANGLE/D3D11, the authored release
(`place_station_refinery.glb`), and live Ceres sector station placement for `station_ceres` in
`sector_ceres_belt`. Browser and Electron each retained ordinary (default / LOD1) and diagnostic-close
(close / LOD0) game-canvas views. Electron consumed the exact current Browser receipt, matched its
normalized semantic projection, emitted zero page issues, and closed its owned runtime/profile.

The four captures and their broker ledgers are retained at
[`refinery-reauthor/`](../evidence/h1/row7-pq022-asset-leaves/refinery-reauthor/EVIDENCE.md). The retained
tree is bound by `SHA256SUMS.txt` (29 files verified before commit) and records exact source
`9faf59a6...5d88` / release `3b673f76...7c0` identity, authored-release admission, placement,
material texture roles, capture hashes, claim consumption, launch counts, and cross-runtime parity.

## Capture identity

| Host / framing | SHA-256 | Bytes |
|---|---|---:|
| Browser default / LOD1 | `4575a655725ec7eabde4c133486fcc9bac48fd4b362793878c03aa7c1c57116c` | 543,680 |
| Browser close / LOD0 | `c35daf81a01078d8e6ee71a469dfe9beee92e0cd63ed6a2fdbbef8d3cdb89e49` | 457,923 |
| Electron default / LOD1 | `c187e8a19c471f94d4b3ba80b3d76afe8295b595c43ee0154b8b5db19e3772ef` | 550,714 |
| Electron close / LOD0 | `77cc9772cd22d513a731abe9a5566dcd17ffdc61cd36ae5572d609fa9cee8098` | 493,874 |

## Verification budget and claim boundary

- Browser headed acceptance: **1 pass / 1 launch / 0 retries**.
- Electron headed acceptance: **1 pass / 1 launch / 0 retries**.
- Corridor assets check: `npm run check:pq022:corridor-assets` PASS.
- Live assets check: `npm run check:assets:live` PASS.

No additional validation run is justified by this receipt closeout. `browser-gpu` and
`validation-broker` are released. This unit proves exact route admission, visibility, two framings,
semantic host parity, and clean native teardown. It does not claim the separate causal G1/G2/G4
visual verdict, matched performance, physical hardware, or parent promotion. The next exact unit is
`PQ-022.refinery-reauthor-review`.
