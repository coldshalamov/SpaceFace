BM6 improved; BM5 did not demonstrate a performance win.

| Leg | Named owner | Before → after |
|---|---|---|
| BM5 | AI `entityContacts` | Sampled time **164.6 → 257.7 ms**; p99 **149.4 → 146.6 ms**. Candidate remains unaccepted. |
| BM6 | `clearanceNeighborhoodRaw` | **1.648 → 0.139 ms/frame**; p99 **130.9 → 73.1 ms**. Highest-first BVH pruning preserves exact roof heights. |

**70 focused checks passed.** Both frame-solid comparisons failed on missing-body/admission counters. Host contention was recorded, so these are not quiet-host certifications. Ledger unchanged; edits uncommitted.

[Full report, exact changed files, test names, and raw evidence](C:/Users/93rob/Documents/GitHub/SpaceFace/design/program/demo-maturity-2026-10-17/results/BM5-BM6-final.md).

