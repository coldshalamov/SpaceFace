<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.relay-reauthor
acceptance: focused_green
disposition: PASS
candidateCommit: e69af0ef
-->

# PQ-022 leaf — claim-relay visible-identity re-author

```yaml
packet: PQ-022
dispatchUnit: PQ-022.relay-reauthor
candidateCommit: e69af0ef
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
productionState: integration_candidate
exactFinalVisualBinding: false
routeEvidenceClaimed: false
performanceEvidenceClaimed: false
```

## Verdict

PASS for the offline implementation unit at artifact commit `e69af0ef`. The material-truth V2
relay replaces the rejected cylinder-and-box read with a rock-gripping claim collar, powered core,
serviceable transfer structure, recovery receiver, communications mast, and localized ownership
signals while preserving the accepted asset identity and runtime contract. This is an integration
candidate, not route acceptance or final program promotion.

## Exact artifact identity

| Artifact | SHA-256 | Bytes |
|---|---|---:|
| Technical source candidate `assets/ships/m5_claim_outposts/source_candidates/material_truth_v2/places/place_claim_outpost_relay.glb` | `a8789308e39f733bc6565198b2afee0ba5fd106affc54a22dd7d30e40ac10a7a` | 13,416,020 |
| Technical release candidate `assets/ships/m5_claim_outposts/release_candidates/material_truth_v2/places/place_claim_outpost_relay.glb` | `a8789308e39f733bc6565198b2afee0ba5fd106affc54a22dd7d30e40ac10a7a` | 13,416,020 |
| Live source `assets/ships/parts/places/place_claim_outpost_relay.glb` | `57f6e1a42d0f1b259aada019e1960d1cbb4f81cbe0aaabfe66ed0248a8e206c9` | 13,424,076 |
| Live release `assets/ships/release/parts/places/place_claim_outpost_relay.glb` | `85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8` | 3,338,672 |

The promoter published the technical candidate into the canonical source, packet-source mirror, and
optimized KTX2/Meshopt release, then refreshed manifest and PQ-017 binding hashes. The resulting
live hashes therefore differ from the promotion input by design; the table records both sides rather
than implying byte identity.

## Structural and validation evidence

- LOD0/LOD1/LOD2 contain respectively **62,992 / 27,592 / 8,384 triangles**, with five material
  draw groups per LOD; the broadphase collision mesh contains 44 triangles.
- All 15 visible draw groups are triangulated and position-welded closed surfaces: every recorded
  edge has exactly two incident faces, `badEdges: 0`, and `nonTriangleDrawGroupFaces: 0`.
- The exported GLB contains 16 mesh primitives and all 16 carry tangents. The frozen root
  `SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT`, `COLLISION_HULL`, seven sockets, identity, envelope, and
  placement-facing contract are recorded unchanged.
- The hash-bound Foundry report passes with **0 failures / 0 warnings**. The hash-bound Khronos glTF
  report records **0 errors / 0 warnings / 0 infos / 0 hints**.

## Focused gates recorded for `e69af0ef`

| Gate | Result |
|---|---|
| `npm run check:pq022:relay-collar` | **11/11 pass** after the closed-topology regression was added (previous suite: 10 cases) |
| `npm run check:graphics:asset-receipts` | PASS |
| `npm run check:asset-reachability` | PASS |

These are the focused artifact-commit results; this receipt-only step did not spend another Browser,
Electron, or test run.

## Visual-review lineage and claim boundary

The six-view, original-resolution matched review records **G1 KEEP / G2 KEEP / G4 KEEP** only for
reviewed source SHA-256
`242748956ec90ad328e6cabaa52823feff213c3c6fa17a9e1fd4920f022a76e3`. The later technical rebuild
changed producer and artifact hashes through triangulation/export hardening and replacement of four
coincident service-bay boxes by one topologically closed frame with the same visible envelope and
opening. Consequently the KEEP verdict remains useful lineage-bound authoring evidence, but it is
not rebound to the final live source/release bytes:
`exactFinalVisualBinding: false`.

No Browser/Electron player-route, exact-final visual, native performance, or matched-performance
claim is made by this unit.

## Residual dependency chain

1. `PQ-022.relay-reauthor-h1` — capture the exact promoted release on the ordinary Browser and
   Electron close/default/far route using one bounded evidence pass.
2. `PQ-022.relay-reauthor-review` — causally review that candidate-bound route evidence and bind the
   final live visual verdict.
3. `PQ-022.h3-performance` — complete the declared matched corridor performance/cleanup evidence.
4. `PQ-022.promote-relay` — upgrade and blob-bind the relay receipt for final promotion.
