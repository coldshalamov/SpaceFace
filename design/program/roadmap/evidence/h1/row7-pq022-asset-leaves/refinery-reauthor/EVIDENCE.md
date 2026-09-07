# PQ-022 refinery re-author — retained revised H1 evidence

**Result: PASS.** This subtree retains the exact generated Browser and Electron evidence for
`PQ-022.refinery-reauthor-h1`. Each broker-authorized cell used the literal `refinery` selector,
captured only the revised refinery station at ordinary (default) and diagnostic-close framing, and consumed one launch. No unrelated
Row-7 identity or still was recaptured.

## Exact claims and candidate binding

| Runtime | Manifest | Claim ID | Candidate digest | Manifest digest | Input digest |
|---|---|---|---|---|---|
| Browser | `pq022-refinery-reauthor-browser` | `23668-ef07462410790475af28f61d` | `45035c13407444741163c1ff35768df6c6322300a6054f7860685dd8472cc661` | `cef2f2a43af673f61ecebc561a8077e9d91a2a61dd56014cf24191e4eccc1fb9` | `4be1d5b2a73fb560c7fec997384d00c644efa0bdc4f85c139b79c2eb5708fcb5` |
| Electron | `pq022-refinery-reauthor-electron` | `25260-f03f0389c73071d7b23b931c` | `ac75dbbecfb3bcf9fcb809d72bdd4ed734d5a28df0e39f94027cc63d57a4070d` | `dbb373345954160aa76dd352af2ab422f6736198b229e086998ea9cdac2f9c81` | `ef8165803fa37f3d2c92ff72bbf74c3a9eeaafa14a85f73cba9db89f2764fc4a` |

The issued claims, consumed claim copies/markers, and consumed-claim ledgers are retained under each
runtime's `broker-claims/` directory without rewriting their original `.devshots` provenance paths.

## Exact promoted asset identity

| Artifact | SHA-256 | Bytes |
|---|---|---:|
| `assets/ships/parts/places/place_station_refinery.glb` | `9faf59a697a9faafbf18f3c74c6abc27b7fc38e0ec3ffe3ea803396f46365d88` | 23,088,680 |
| `assets/ships/release/parts/places/place_station_refinery.glb` | `3b673f761f8e47c32ffa0563b933ad099380d2df75629dca927481cec4c8b7c0` | 5,725,268 |

Both reports record `presentationAdmission: "ready"`, `authoredAssetState: "authored"`,
`authoredAssetMode: "release"`, no retained readable fallback, the exact release slot, 5 visible
meshes, and a centered refinery station in both frames.

## Retained captures

| Runtime | Framing / LOD | Retained file | SHA-256 | Bytes |
|---|---|---|---|---:|
| Browser | default / LOD1 | [01-refinery-ordinary.png](browser/01-refinery-ordinary.png) | `4575a655725ec7eabde4c133486fcc9bac48fd4b362793878c03aa7c1c57116c` | 543,680 |
| Browser | close / LOD0 | [02-refinery-diagnostic-close.png](browser/02-refinery-diagnostic-close.png) | `c35daf81a01078d8e6ee71a469dfe9beee92e0cd63ed6a2fdbbef8d3cdb89e49` | 457,923 |
| Electron | default / LOD1 | [01-refinery-ordinary.png](electron/01-refinery-ordinary.png) | `c187e8a19c471f94d4b3ba80b3d76afe8295b595c43ee0154b8b5db19e3772ef` | 550,714 |
| Electron | close / LOD0 | [02-refinery-diagnostic-close.png](electron/02-refinery-diagnostic-close.png) | `77cc9772cd22d513a731abe9a5566dcd17ffdc61cd36ae5572d609fa9cee8098` | 493,874 |

## Runtime, parity, cleanup, and launch budget

- Both cells used fixed and recorded New Game seed `47`, viewport `1440 x 900`, and the real hardware
  path `ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
- Electron reports `browserComparison.pass: true`: normalized source/release identity, admission,
  framing LOD requests, and placement match Browser exactly. The matched placement is in
  `sector_ceres_belt`, entity station `station_ceres`, archetype `place_station_refinery`.
- Both page-issue arrays are empty. Browser's latest-run record exited `0`, did not time out, and
  required no kill. Electron additionally records `ownedRuntimeClosed: true`; its latest-run record
  also exited `0`, did not time out, and required no kill.
- `launch-counts.json` records clean launch budgets with authorized claims consumed and PASS records.

## Evidence boundary

These are functional/perceptual H1 records only. The reports explicitly set
`informational_contended: true` and `noPerformanceEvidence: true`; process durations and timestamps
are broker diagnostics, not frame-time, hitch, GPU-cost, or matched-performance evidence. Phase H3
retains the performance claim.

Only the new `refinery-reauthor/{browser,electron}` subtree was copied from
`.devshots/pq022-refinery-reauthor/{browser,electron}`. The existing files at the Row-7 root and in
sibling folders remain their respective retained evidence and were neither overwritten nor relabeled.
All 28 generated files were copied byte-for-byte. `SHA256SUMS.txt` binds those files plus this summary; it
intentionally omits itself.
