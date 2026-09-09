<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-023
leafId: PQ-023.combat-readability-h1
acceptance: route_accepted
disposition: PASS
candidateCommit: b626a8b305b57a98fabd3f3eaa12c42fb4233965
-->

# PQ-023 targeted combat-readability H1 receipt

```yaml
packet: PQ-023
dispatchUnit: PQ-023.combat-readability-h1
candidateCommit: b626a8b305b57a98fabd3f3eaa12c42fb4233965
disposition: PASS
acceptance: FUNCTIONAL_H1_ACCEPTED
fixedSeed: 47
browserClaimId: 20336-b461d7ba80289197646bd11d
browserCandidateDigest: f50250e37d65128fd8f60d5620c630292123173d39faf6c3841d442812296a93
browserReportSha256: 748b41ea26d4f1cd8ec2cea88051e19a70c0f353e2d96e945031f3b790a3737b
electronReceiptSha256: d64968dd6985403b9e44808a0beedcee2c7a62aaf9a5d82fe1fb842bdb2fbe17
performanceEvidenceClaimed: false
causalVisualVerdictClaimed: false
physicalControllerClaimed: false
```

## Accepted result

One broker-authorized Browser launch passed the targeted five-cell route on real Intel ANGLE/D3D11:
22 captures, five motion segments, three contact sheets, zero page issues, all acceptance predicates
true, and clean VFX pools. The distinct source-Electron continuation captured the same five cells,
matched Browser's normalized executed-pool projection exactly, emitted zero page issues, used real
Intel ANGLE/D3D11, and closed its owned runtime/profile.

The route deliberately selected only autocannon, flak, small destruction, reduced small destruction,
and one dense representative. It did not spend headed work on the already-accepted Cathedral,
unrelated weapon families, ordinary destruction, or capital destruction. Complete artifacts are
committed under
[`row6-pq023-combat-readability/`](../evidence/h1/row6-pq023-combat-readability/EVIDENCE.md).

## Evidence identity

- Browser claim: `20336-b461d7ba80289197646bd11d`, consumed once.
- Candidate digest: `f50250e37d65128fd8f60d5620c630292123173d39faf6c3841d442812296a93`.
- Route/production digest: `6b53733a3709abe36fd4ebf05d5adb802a85ada472279e5987083e625c3835a3`.
- Regression digest: `5f3619f94e798efdb3d59d27e29279fdc2662f8ee9635f9f0ba0d1d4516b0761`.
- Manifest digest: `b07f35a34548cc22a69a2c7eebb45848ddd60b5baf37b33a1424d1d085e1f7f7`.
- Browser report SHA-256: `748b41ea26d4f1cd8ec2cea88051e19a70c0f353e2d96e945031f3b790a3737b`.
- Browser WebM SHA-256: `386a00f8f0493f5c30c97aedfc1116977477c3bb665a6ca7b4563cc9e45b5729`.
- Electron receipt SHA-256: `d64968dd6985403b9e44808a0beedcee2c7a62aaf9a5d82fe1fb842bdb2fbe17`.

## Verification and release

- Registered Browser broker manifest `pq023-combat-readability`: **PASS**.
- `node scripts/check-pq023-corridor-cues-electron.mjs --combat-readability-only`: **PASS**.
- `node --test test/pq023-corridor-cues-h1-manifest.test.mjs`: **PASS 16/16**.
- `npm run check:pq023:corridor-cues`: **PASS 22/22**, critical dense cues `18/18`.
- `npm run check:presentation`: **PASS**.

`browser-gpu` and `validation-broker` are released. The next exact unit is
`PQ-023.combat-readability-review`. This receipt does not turn H1 capture into a causal visual
verdict and does not claim matched performance, physical hardware, or milestone promotion.
