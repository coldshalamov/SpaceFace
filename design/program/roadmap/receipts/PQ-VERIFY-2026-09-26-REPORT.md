<!-- LIFETIME: RECEIPT -->
# Verification pass 2026-09-26 — implemented → done transitions

```text
VERIFIED  Four implemented leaves re-proven against their declared checks and done-when
clauses today, then transitioned to done. Two sibling leaves deliberately not closed.
```

## Closed this pass

| Leaf | Done-when evidence | Re-verified today |
|---|---|---|
| PQ-172.00 JSON content loader | Sample pack "Helios Surplus" adds 1 weapon + 1 encounter + 1 module + 1 place through owning validators; determinism hashes identical without it (PQ-172-REPORT) | `npm run check:pq172` 18/18 + `node scripts/check-data.mjs` green |
| PQ-172.01 Workshop | Publish→subscribe→mirror→load round-trip through the real Workshop code path, 7/7 tests (PQ-172-REPORT). LIMIT: live Steam service is owner-side per `build/steam/README.md` §7 — recorded, not hidden | `npm run check:pq172` workshop suite 7/7 green |
| PQ-189.00 control contract | 16/16 taught actions resolve labels from input.js incl. remap/focus-loss/rover; walk test + screenshots on disk (PQ-189-00-REPORT) | `node scripts/check-ui-control-labels.mjs` OK; `npm run check:ui-a11y` green |
| PQ-173.04 critic's verdict | Three-part verdict emitted; synthetic blocker+ten-yeses fails; §3.3 generated from rubric — drift found and regenerated this pass (`d0f02a9e`), pinned by suite | `node --test test/fun-critic.test.mjs` 34/34; `npm run check:baseline` green |

## Deliberately not closed

| Leaf | Why |
|---|---|
| PQ-173.02 the critic | Done-when requires reproducing all three 2026-09-03 findings from frames alone; its own IMPLEMENTED note records terrain helm was not singled out. Stays `implemented`. |
| PQ-173.03 report+translator | Evidence exists (rope cycle OWNER-REPORT committed, KEEP 16.3%→5.0%) but declared check `check:crucible:route` is unstable on this host — transition waits on a green run. |
| PQ-163.00 | `>=80% unaided tester` clause never measured — stays partial. |
| PQ-033.02 | Min-spec floors measured honestly RED — open perf work, not closeable. |
