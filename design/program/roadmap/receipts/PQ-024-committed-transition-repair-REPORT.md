<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-024
leafId: PQ-024.committed-transition-repair
acceptance: focused_green
disposition: PASS
candidateCommit: 7ad32c948f1b01780ae85dc530a0c02415e18de7
-->

# PQ-024 committed-transition presentation repair

```yaml
packet: PQ-024
dispatchUnit: PQ-024.committed-transition-repair
entryCommit: af86b108f5a9fd04fb51e6d3611536154e79addf
implementationCommit: 7ad32c948f1b01780ae85dc530a0c02415e18de7
disposition: PASS
acceptance: focused_green
focusedTests: 30/30
headedBrowserLaunched: false
headedElectronLaunched: false
retainedRouteCellsRecaptured: false
performanceEvidenceClaimed: false
visualAcceptanceClaimed: false
```

## Reproduced defect

The retained Browser and source-Electron Core frames showed durable committed owner state beside a
stale player presentation: `NO CLAIM`, red `ASSAY 2/3`, and `PLACEMENT PREVIEW / A machine already
occupies this cell.` Code archaeology and a new event-order regression isolated two causes:

- on the first Core, `site:surveyCommitted` is emitted before `site:anchored`; the screen listener
  compared against still-null `currentSiteId` and dropped the commitment feedback;
- the route actor screenshotted as soon as owner state committed while it was still in Build mode,
  leaving the installed Core under the occupied placement ghost and racing the ordinary HUD cadence.

The owner transaction, exact adopted cells, producing transition, relay, Continue, re-entry, and H3
were already valid. None of those retained cells was reopened.

## Repair

The survey-commit listener now lazily resolves the new site through the live owner before applying
the event. It marks the projection dirty and schedules the existing HUD and inspector owners for the
next frame; it does not create parallel UI or gameplay state.

The public actor now presses the shipped `Escape` control after Core placement and waits, fail-closed,
for one coherent snapshot: matching site ID, anchored committed owner lifecycle, positive committed
cell count, `Anchored`, `Assay N cells`, `Site overview`, `Anchored claim`, durable `Survey record`,
`Awaiting first real output`, and no occupied-placement error. A pure helper assesses the same
snapshot, and the broker digest includes that helper.

## Focused evidence

- `node --test test/pq024-survey-claim.test.mjs test/pq024-asteroid-claim-manifest.test.mjs`
  — **PASS, 30/30**, about `0.45 s`.
- `git diff --check` — PASS apart from Git's informational LF/CRLF notices.
- Regressions cover the exact stale frame, the settled frame, first-Core owner event order, actor
  order, visible DOM predicates, forbidden owner mutation, listener site resolution/cadence, and
  harness-source digest inclusion.

## Honest boundary

This unit proves the causal code repair and seconds-scale contracts only. It launched neither
Browser nor Electron and makes no visual or performance claim. `PQ-024.committed-transition-h1`
owns one isolated stop-after-Core Browser claim plus its gated source-Electron counterpart;
`PQ-024.committed-transition-review` then judges only those two corrected frames. The previously
accepted production, exactly-one relay, save/Continue, re-entry, exact-final relay art, and H3 cells
remain authoritative and must not be rerun.
