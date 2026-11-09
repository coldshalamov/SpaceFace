# Morrowlight: spending the last racked plate

Narrow correction to the already-published original-pod patch activity, not a second implementation of it. Verified exact published base `a4be76e105dd5b20a4f7e8bec97fb74069d16d3d` on draft #982 through GitHub's read connector. The prior disabled-reactivation change/test from `finish_pod_patch` is retained byte-for-byte outside this correction.

## Defect and correction
An independent reviewer found that spending the last scrap in a racked pod left the live constraint and racked status intact, whereas save normalization made it empty and cleared its rack. Continue therefore changed custody.

The final patch validates the exact active native rack line before spending the last unit. After the existing callback-free station repair writer and finite manifest debit, empty status, cleared rack binding, repaired hull and save records commit before cutting that exact native line. The state-wide transfer fence remains held through cut callbacks. A callback-time save sees spent stock and released custody. After callbacks, original home/pod lives are revalidated; a recycled life receives neither the physical receipt nor the success narrative.

No pricing, repair amount, cargo capacity, sealed-freight, movement, or new-asset rule changes. Empty originals remain originals, with no free refill. The existing menu action and its limits are unchanged.

## Scope and proof
- `src/features/salvageTender/physical.js`
- `src/features/salvageTender/runtime.js` (one receipt-suppression condition)
- `test/tender-pod-patch.test.mjs` (two new regressions)
- this note

Exact published source/test snapshots: `/tmp/tender-{physical,runtime}.published-pod-patch.js` and `/tmp/tender-test.published-pod-patch.mjs`. Delta is limited to the fix above. Seven focused tests and 48/48 combined pass:

```
node --test test/tender-pod-patch.test.mjs test/tender-pod-restock.test.mjs test/tender-prepaid-hold.test.mjs test/tender-selective-recovery.test.mjs test/pro-experiences-salvageTender.test.mjs
```

Log `/tmp/tender-pod-patch-rack-final.log`. New test uses actual selective unload to leave one scrap, actual rack attachment, ordinary patch action, actual tether cut callback, nested second physical adapter request, callback-time SaveSystem envelope and a fresh native world's restore. It asserts empty stock, repaired hull, no restored active rack and no nested duplicate consumption. A separate callback test changes each original generation and verifies no falsely attributed receipt. `git diff --check` passes.

Exact published-source baseline substitution: `/tmp/tender-pod-patch-rack-before-loader.mjs`, log `/tmp/tender-pod-patch-rack-before.log`. The old version cannot produce the expected last-unit cut callback; the new regression detects that mismatch.

The prior native prepared-home pilot approach and full-hold/menu proof continue to pass. This is not a newly demonstrated acquisition/haul route, rendered UI, collision-free journey, or full browser/disk Continue. Fresh envelope/native restoration is the tested persistence boundary. No publication was performed by this worker.
