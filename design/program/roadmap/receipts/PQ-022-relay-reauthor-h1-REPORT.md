<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.relay-reauthor-h1
acceptance: route_accepted
disposition: PASS
candidateCommit: 780b77b3608fd075b81fa607154129edea6575a7
-->

# PQ-022 revised claim-relay H1 receipt

```yaml
packet: PQ-022
dispatchUnit: PQ-022.relay-reauthor-h1
candidateCommit: 780b77b3608fd075b81fa607154129edea6575a7
disposition: PASS
acceptance: FUNCTIONAL_H1_ACCEPTED
fixedSeed: 47
browserClaimId: 25068-5f75ea9c6a14de2404bb4bf3
browserCandidateDigest: 11b25335771caf612bfd9cf944737848d0144c7b96e4e369be318f68fc098cff
browserManifestDigest: bcfdbd9dd1f1fd5bb1cdd1b77cf0558f676093750751007d78a00bf469ae7425
browserInputDigest: d35b317be10a073766b7faf405389f1fef516cce95745af1c21927aefff22358
browserReportSha256: 8e98944fe8a6d1467ac1c35896c3cb551b409d2cb56383c4452edeae75937901
electronClaimId: 45252-4720537cb0b09b0fb0f6d1ff
electronCandidateDigest: 402de724d86c59e401a6a3435dff19774e36c5e38430ce863c20247acefb2bd0
electronManifestDigest: 4c8043104a8289265359e6d13c362f83166eb4e4148322fee32ab1b681d3c9cf
electronInputDigest: 39a1c7a543ff620bab7930bbe241e40b8bbc4f173be14bc380492f86f067e2b1
electronReportSha256: 576532c365bef5723ea1269f171553968eb711680779b2630b7eb3347ffcf503
sourceSha256: 57f6e1a42d0f1b259aada019e1960d1cbb4f81cbe0aaabfe66ed0248a8e206c9
releaseSha256: 85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8
performanceEvidenceClaimed: false
causalVisualVerdictClaimed: false
physicalHardwareClaimed: false
```

## Accepted result

The registered Browser and source-Electron manifests each spent exactly one broker-authorized
launch and passed without a retry. Both used fixed seed `47`, real Intel ANGLE/D3D11, the authored
release rather than a readable fallback, and the live asteroid-site placement for entity `319` in
`sector_helios_prime`. Browser and Electron each retained close, default, and far game-camera views
covering LOD0, LOD1, and LOD2. Electron consumed the exact current Browser receipt, matched its
normalized semantic projection, emitted zero page issues, and closed its owned runtime/profile.

The six captures and their one-use broker ledgers are retained at
[`relay-reauthor/`](../evidence/h1/row7-pq022-asset-leaves/relay-reauthor/EVIDENCE.md). The retained
tree is bound by `SHA256SUMS.txt` (23/23 files verified before commit) and records exact source
`57f6e1a4...06c9` / release `85b8d74e...67a8` identity, authored-release admission, placement,
material texture roles, capture hashes, claim consumption, launch counts, and cross-runtime parity.

## Capture identity

| Host / framing | SHA-256 | Bytes |
|---|---|---:|
| Browser close / LOD0 | `89990e38a7c5f77614e452fc91a248e146bff50ebbec63ea5a10beaddb5d7d15` | 430,561 |
| Browser default / LOD1 | `93a7a03e4e18c2da2dbd373afc1e6ccc0c4b1296b67926e9334660d6b3183198` | 413,146 |
| Browser far / LOD2 | `fc96a6160dea8cf1ae3f6acf8c756d4558dc61c9ff3d1ebb2024ae0ee540162a` | 345,318 |
| Electron close / LOD0 | `899597ff418d5357e5c3f062ef7038a3ea2a4379bae2184e94d97ee48b6bbe08` | 565,734 |
| Electron default / LOD1 | `8bed5cf44c6127ce4e23c104d506111376cf53fa48a4f3d1f5928a3b5b1fbaa2` | 544,625 |
| Electron far / LOD2 | `f8d8f863aa62f33af5e8f01ac60a4df5ab3b49eb8802c6535b200e24a8651980` | 467,135 |

## Verification budget and claim boundary

- Browser headed acceptance: **1 pass / 1 launch / 0 retries**.
- Electron headed acceptance: **1 pass / 1 launch / 0 retries**.
- Relay admission suite: **5 invocations total** across implementation and the two broker preflight
  gates; the final three invocations passed the hardened 11/11 suite.
- H1 static manifest/parity suite: **4 invocations total** across implementation and broker
  preflights; the final four passed 16/16.
- `check:assets:live`: **2 invocations**, the declared one per host preflight.
- Broad baseline in this phase: **1 invocation, PASS 10/10 in 46.628 s**.

No additional validation run is justified by this receipt-only closeout. `browser-gpu` and
`validation-broker` are released. This unit proves exact route admission, visibility, three LOD
framings, semantic host parity, and clean native teardown. It does not claim the separate causal
G1/G2/G4 visual verdict, matched performance, physical hardware, parent promotion, or receipt-blob
binding. The next exact unit is `PQ-022.relay-reauthor-review`.
