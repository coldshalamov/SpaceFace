<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-021
leafId: PQ-021.h2-legibility-controller
acceptance: route_accepted
disposition: PASS
candidateCommit: b74da808e32028ba1f52c345ea5938697df25955
-->

# PQ-021 Ledger legibility and input-reachability review

```yaml
packet: PQ-021
dispatchUnit: PQ-021.h2-legibility-controller
reviewMode: solo-integrator-self-review
candidateCommit: b74da808e32028ba1f52c345ea5938697df25955
disposition: PASS
visualDisposition: KEEP
controllerDisposition: SEMANTIC_ROUTE_ACCEPTED
physicalDeviceClaimed: false
performanceEvidenceClaimed: false
```

## Verdict

KEEP the shared Ledger panel and all five Cathedral evidence pages. The retained Browser and
Electron route receipts prove identical copy, image identity, alt text, caption, provenance,
bounded `720x405` presentation, and exact focus return in the station and in-flight Codex hosts.
This review inspected the original-resolution route stills and each of the five admitted source
images rather than inferring visual quality from the route's PASS flag.

The five page-image dispositions are:

| Page | Disposition | Review reason |
|---|---|---|
| The Missing Convoy | KEEP | The separated bow/stern and central rupture read immediately at the bounded crop. |
| Capital Hull Located | KEEP | The high-contrast registry silhouette supports the identification purpose without relying on color. |
| The Clock Stopped First | KEEP | The close three-quarter view preserves the split hull, exposed frame, and surviving marker. |
| Released From Inside | KEEP | The cavity view clearly supports the outward-fracture account and gives the page a distinct spatial read. |
| What Was Carried | KEEP | The forensic wireframe makes the cradle/cavity relationship legible and is visually distinct from the other four records. |

The Browser list still was captured during the screen's opening fade and is therefore darker than
the stable Electron station still. It was not used as the sole legibility basis. The stable stills,
original page images, retained computed layout facts, and focused checks establish the claim; this
is a capture-timing limitation, not evidence of clipped or unreadable settled UI.

## Input reachability

The shipped standard-gamepad contract maps button `3` (`Y / Triangle`) to `alt`, then maps `alt` to
the `codex` action. The live UI input owner consumes `gp.actions.codex.pressed` in flight and pushes
the same `codex` screen used by the accepted keyboard route. D-pad/left-stick focus navigation,
`A / Cross` activation, and `B / Circle` back are handled by the same modal-navigation owner. This
closes controller *semantic reachability*. No physical controller was attached or claimed.

## Focused evidence

- Retained Browser/Electron H1 pair:
  `evidence/h1/row2-pq021-ledger/EVIDENCE.md` — PASS with five pages in both hosts and no page issue.
- `npm run check:pq021-ledger` — PASS: 18 Node assertions, two-host Ledger check, and live read-route
  check; stable nodes/images/listeners, `1920x1080 -> 720x405`, exact focus return, and both ordinary
  hosts.
- `node --test test/settings-controller-label-truth.test.mjs
  test/accessibility-settings-parity.test.mjs` — PASS; controller label/action truth and gamepad
  focus styling are wired.
- `npm run check:wcag-contrast` — PASS for all panel-composited text at the applicable WCAG AA
  thresholds. The command's raw-nebula diagnostics are not Ledger panel failures.

## Scope

This is the required PQ-021 evidence-page usefulness, legibility, provenance, focus, and controller
reachability verdict. It is not a physical-device test, a whole Wreck Cathedral art verdict, or
matched performance evidence. No product or harness source changed, so the accepted H1 pair was not
rerun.
