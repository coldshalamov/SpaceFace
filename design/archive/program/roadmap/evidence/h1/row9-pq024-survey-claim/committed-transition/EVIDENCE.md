# PQ-024 corrected Core-commit transition

**Result: PASS — targeted Browser/Electron H1 and causal review accepted.**

Candidate head `d02f0cf5` consumed Browser claim `33664-f9675c3395d754504988f263`
at fixed seed `24024`. The broker bound candidate digest `965e0b46…f4c` to one headed
Browser launch. The Browser-gated source-Electron wrapper then ran the same public actor once,
matched the normalized semantic projection, reported no page issues, and closed its owned runtime.

The corrected frame is intentionally stopped before production. Both hosts visibly agree with the
authoritative committed owner state: `ANCHORED`, `ASSAY 3 CELLS`, `Site overview`, `ANCHORED CLAIM`,
the durable three-cell Survey record, and `Awaiting first real output`. Neither frame contains the
old `NO CLAIM`, incomplete assay, placement-preview, or occupied-cell contradiction.

## Retained artifacts

- [Browser committed frame](browser-03-core-committed.png)
- [Electron committed frame](electron-03-core-committed.png)
- `browser-committed-transition-receipt.json`
- `electron-committed-transition-receipt.json`
- `browser-claim.json` and `browser-claim.consumed.json`
- `browser-fast-gate.json`, `browser-launch-counts.json`, and `browser-run-result.json`
- `route-pair-summary.json`
- `attempt-reconciliation.json` retains the earlier bounded failure history.

## Hash binding

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Browser frame | 698365 | `0e04354e48d6bc0be6155433d4429bb1c83d1a3e67df0d0ce0f92ea7b34ce731` |
| Electron frame | 765787 | `4a9cc74198f872dd1c08ed6a5af107f34d23a0b8439355bdde20d8262430a8ad` |
| Browser route receipt | 6226 | `c9e16b89482b8140ce04a37d57aafd3ce3d440bf1f089bc9cded4b757205da5e` |
| Electron route receipt | 5666 | `0f1dcdc31b1198414d9ba7704752c35206dfc87d23ed6c3f3ec7f8e3e9ee1995` |
| Consumed Browser claim | 2359 | `02a06862ac9d136aaa62c02bad5a74a2c96cce4eaeef15bd71d41b1ea678990e` |
| Consumed-claim ledger entry | 1990 | `96c1d372b26b872a1779bf965c01b31376a63fe7aed692bccb5a037e49c35387` |

## Claim boundary

This closes only the corrected committed-transition H1 and the prior H2 review's causal Core-frame
finding. It reuses the already accepted production, relay, Continue, re-entry, and matched H3 cells;
it does not relabel this bounded functional capture as performance, relay-art promotion, physical-
controller, or screen-reader evidence.
