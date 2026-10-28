<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-020
leafId: PQ-020.ceres-h1-capture
acceptance: route_accepted
disposition: PASS
candidateCommit: 04514d0bfe3c1b1a7ea9b85a02905418ad675033
-->

# PQ-020 Ceres H1 functional-pair receipt

```yaml
packet: PQ-020
dispatchUnit: PQ-020.ceres-h1-capture
candidateCommit: 04514d0bfe3c1b1a7ea9b85a02905418ad675033
disposition: PASS
acceptance: FUNCTIONAL_H1_ACCEPTED
fixedSeed: 47
browserClaimId: 26052-3223fa474a1b497e1638943b
candidateDigest: c864caec77a6ba911efab9c2dbae1ae3f11bf2a2bbb1bc7fde993830a49f7f46
browserReceiptSha256: 70687669c36a30233c0c3afd27b27be376a2bd355d00da49d0fab6ee86c29ef1
electronReceiptSha256: ae10134fa9905117667a5e8466e12504be41fec1f510692ce71bdadb2e4feca0
performanceEvidenceClaimed: false
h2VerdictClaimed: false
physicalControllerClaimed: false
```

## Accepted result

The registered Browser route passed all 21 declared frames on one fixed-seed claim, real Intel
ANGLE/D3D11, and zero page/request issues. Only after that pass, the distinct source-Electron run
passed the same 21 frames, matched the normalized Browser gameplay projection, recorded zero issues,
and closed its owned runtime/profile.

The pair proves both source-specific Ceres endpoint directions; natural public-map/autopilot travel
through Ceres Refinery, Belt Outpost, Throughline Weigh Beacon, and Wreck Cathedral; authored
Cathedral admission and public-control far/default/close framing; F5 → canonical reload → visible
Continue restoration; exact one-beacon/fifteen-Cathedral materialization; sub-WU pose restoration;
and repeat map selection after Continue. Keyboard and pointer paths both preserve named controls,
focusable actions, and text identity.

The complete paired evidence is committed under
[`row5-pq020-ceres-route/`](../evidence/h1/row5-pq020-ceres-route/). The older blocker receipt and
failure artifacts remain historical diagnostics for earlier candidates; they are not current state.

## Causal boundary

The accepted candidate follows the proven Electron repair: the shared actor no longer performs a
duplicate root navigation after the canonical Electron first window has already loaded. The bounded
native regression pins first-window plus explicit-reload document ownership, one narrowly classified
reload abort, zero hard issues, registration generation `2/2`, and clean teardown.

## Scope

This closes only exact unit `PQ-020.ceres-h1-capture`. It does not claim the H2 visual verdict,
matched H3 performance, a physical-controller run, or parent promotion. Both headed mutexes are
released.
