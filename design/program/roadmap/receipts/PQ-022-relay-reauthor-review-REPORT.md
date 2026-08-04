<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.relay-reauthor-review
acceptance: route_accepted
disposition: PASS
candidateCommit: 780b77b3608fd075b81fa607154129edea6575a7
-->

# PQ-022 revised claim-relay causal visual review

```yaml
packet: PQ-022
dispatchUnit: PQ-022.relay-reauthor-review
candidateCommit: 780b77b3608fd075b81fa607154129edea6575a7
disposition: PASS
visualDisposition: KEEP
acceptance: CAUSAL_VISUAL_REVIEW_ACCEPTED
exactFinalVisualBinding: true
g1ManufacturedForm: KEEP
g2MaterialResponse: KEEP
g4RoleCoherence: KEEP
sourceSha256: 57f6e1a42d0f1b259aada019e1960d1cbb4f81cbe0aaabfe66ed0248a8e206c9
releaseSha256: 85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8
browserReportSha256: 8e98944fe8a6d1467ac1c35896c3cb551b409d2cb56383c4452edeae75937901
electronReportSha256: 576532c365bef5723ea1269f171553968eb711680779b2630b7eb3347ffcf503
performanceEvidenceClaimed: false
physicalHardwareClaimed: false
```

## Verdict

**PASS / KEEP G1, G2, and G4.** The exact final release closes the recorded generic
cylinder-and-box defect on the ordinary player route. Close and default views in both hosts show a
manufactured, asteroid-gripping recovery/communications installation: an asymmetric clamp/lug ring,
formed twin vessels, open transfer trusses, a recovery receiver, service frame, and dish/mast have
visible attachment and load paths. The authored object—not the surrounding HUD ring—now carries the
claim-relay identity.

The final live release SHA-256
`85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8` is therefore bound to route
visual acceptance. No P0 or P1 visual defect remains in this exact review scope.

## Causal comparison

The retained original Row-7 close/default/far images show the rejected state as a small gray post:
a cylinder, box, and cap whose function is supplied mainly by the HUD. The revised exact-final
Browser/Electron pair instead preserves the offline candidate's causal changes at all three LODs:

- **G1 manufactured form — KEEP:** gripping collar and lugs visibly key into the rock; vessels,
  trusses, receiver, mast, and service frame create a supported, asymmetric assembly rather than a
  primitive stack.
- **G2 material response — KEEP:** cool vessel metal, dark mechanical structure, warm orange
  load/service members, faceted rock, and localized cyan diagnostics remain separated in both hosts.
- **G4 role coherence — KEEP:** recovery hardware, communications hardware, ownership accents, and
  the asteroid contact structure read as one claim-and-recovery installation through LOD0/1/2.

At the far framing (`336.47 m`), meso detail necessarily collapses, but the irregular, top-heavy
manufactured silhouette remains distinguishable. That is an intentional screen-space boundary, not
a recurrence of the gray-post defect. Browser/Electron differences are limited to host viewport and
background framing; the normalized asset, placement, admission, and LOD payloads match.

## Evidence reviewed

- all six original-resolution revised runtime captures and both reports under
  [`relay-reauthor/`](../evidence/h1/row7-pq022-asset-leaves/relay-reauthor/EVIDENCE.md);
- the three retained rejected Row-7 relay captures at the parent evidence root;
- the six-angle offline material-truth candidate review and component/material bill under
  `assets/ships/m5_claim_outposts/`;
- exact source/release, manifest, LOD, socket, placement, and no-fallback facts recorded by
  `PQ-022-relay-reauthor-REPORT.md` and `PQ-022-relay-reauthor-h1-REPORT.md`.

## Claim boundary

This closes only `PQ-022.relay-reauthor-review` and releases `evidence-review`. It does not claim
matched H3 performance, physical hardware, corridor-wide asset acceptance, milestone promotion, or
PQ-024 receipt-blob binding. No Browser, Electron, Blender, or test process was launched for this
review; it consumes the already-accepted, hash-bound evidence once.
