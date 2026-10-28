# PQ-022 relay re-author — retained revised H1 evidence

**Result: PASS.** This subtree retains the exact generated Browser and Electron evidence for
`PQ-022.relay-reauthor-h1`. Each broker-authorized cell used the literal `relay-collar` selector,
captured only the revised relay at close/default/far framing, and consumed one launch. No unrelated
Row-7 identity or still was recaptured.

## Exact claims and candidate binding

| Runtime | Manifest | Claim ID | Candidate digest | Manifest digest | Input digest |
|---|---|---|---|---|---|
| Browser | `pq022-relay-reauthor-browser` | `25068-5f75ea9c6a14de2404bb4bf3` | `11b25335771caf612bfd9cf944737848d0144c7b96e4e369be318f68fc098cff` | `bcfdbd9dd1f1fd5bb1cdd1b77cf0558f676093750751007d78a00bf469ae7425` | `d35b317be10a073766b7faf405389f1fef516cce95745af1c21927aefff22358` |
| Electron | `pq022-relay-reauthor-electron` | `45252-4720537cb0b09b0fb0f6d1ff` | `402de724d86c59e401a6a3435dff19774e36c5e38430ce863c20247acefb2bd0` | `4c8043104a8289265359e6d13c362f83166eb4e4148322fee32ab1b681d3c9cf` | `39a1c7a543ff620bab7930bbe241e40b8bbc4f173be14bc380492f86f067e2b1` |

The cells share production/route digest
`de12c7c5d6dd7c950371459f04f6211e7f4c3711bbe1946cc2ca2a38167eb98f`, harness digest
`05cb72ea9570f6c89ee0c769135819b7fdc37a2a2887715c6d18a51c117de142`, regression digest
`9025a3e7828990ca23cc191e8e1d9cbf78b39ad1a90fae09949f9a19b4b38dfb`, and build digest
`cdd523a24578c280983f59a98f0439201a07e1136dcf24686b379de8a74671dd`.
The issued claims, consumed claim copies/markers, and consumed-claim ledgers are retained under each
runtime's `broker-claims/` directory without rewriting their original `.devshots` provenance paths.

## Exact promoted asset identity

| Artifact | SHA-256 | Bytes |
|---|---|---:|
| `assets/ships/parts/places/place_claim_outpost_relay.glb` | `57f6e1a42d0f1b259aada019e1960d1cbb4f81cbe0aaabfe66ed0248a8e206c9` | 13,424,076 |
| `assets/ships/release/parts/places/place_claim_outpost_relay.glb` | `85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8` | 3,338,672 |

Both reports record `presentationAdmission: "ready"`, `authoredAssetState: "authored"`,
`authoredAssetMode: "release"`, no retained readable fallback, the exact release slot, one visible
mesh, and a centered relay in all three frames.

## Retained captures

| Runtime | Framing / LOD | Retained file | SHA-256 | Bytes |
|---|---|---|---|---:|
| Browser | close / LOD0 | [01-relay-close.png](browser/01-relay-close.png) | `89990e38a7c5f77614e452fc91a248e146bff50ebbec63ea5a10beaddb5d7d15` | 430,561 |
| Browser | default / LOD1 | [02-relay-default.png](browser/02-relay-default.png) | `93a7a03e4e18c2da2dbd373afc1e6ccc0c4b1296b67926e9334660d6b3183198` | 413,146 |
| Browser | far / LOD2 | [03-relay-far.png](browser/03-relay-far.png) | `fc96a6160dea8cf1ae3f6acf8c756d4558dc61c9ff3d1ebb2024ae0ee540162a` | 345,318 |
| Electron | close / LOD0 | [01-relay-close.png](electron/01-relay-close.png) | `899597ff418d5357e5c3f062ef7038a3ea2a4379bae2184e94d97ee48b6bbe08` | 565,734 |
| Electron | default / LOD1 | [02-relay-default.png](electron/02-relay-default.png) | `8bed5cf44c6127ce4e23c104d506111376cf53fa48a4f3d1f5928a3b5b1fbaa2` | 544,625 |
| Electron | far / LOD2 | [03-relay-far.png](electron/03-relay-far.png) | `f8d8f863aa62f33af5e8f01ac60a4df5ab3b49eb8802c6535b200e24a8651980` | 467,135 |

## Runtime, parity, cleanup, and launch budget

- Both cells used fixed and recorded New Game seed `47`, viewport `1440 x 900`, and the real hardware
  path `ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
- Electron reports `browserComparison.pass: true`: normalized source/release identity, admission,
  close/default/far LOD requests, and placement match Browser exactly. The matched placement is
  `sector_helios_prime`, scale `0.16`, world dressing enabled, no collision writer, rock radius
  `11.910889`, and contact-ring distance `18.910889`.
- Both page-issue arrays are empty. Browser's latest-run record exited `0`, did not time out, and
  required no kill. Electron additionally records `ownedRuntimeClosed: true`; its latest-run record
  also exited `0`, did not time out, and required no kill.
- `launch-counts.json` records exactly `1` launch for each candidate digest. Both claims are marked
  consumed and both latest-run records are PASS. There was no retry.

## Evidence boundary

These are functional/perceptual H1 records only. The reports explicitly set
`informational_contended: true` and `noPerformanceEvidence: true`; process durations and timestamps
are broker diagnostics, not frame-time, hitch, GPU-cost, or matched-performance evidence. Phase H3
retains the performance claim.

Only the new `relay-reauthor/{browser,electron}` subtree was copied from
`.devshots/pq022-relay-reauthor/{browser,electron}`. The existing thirteen files at the Row-7 root
remain the earlier candidate's retained evidence and were neither overwritten nor relabeled. All 22
generated files were copied byte-for-byte. `SHA256SUMS.txt` binds those files plus this summary; it
intentionally omits itself.
