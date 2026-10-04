# Independent bounded review: Latch lifecycle correction

## Verdict: both original findings corrected in the exact two-file overlay

The original functional-successor-1 request-changes verdict remains sealed separately in `../REVIEW.md` and `../ORIGINAL_REVIEW_MANIFEST.json`. This review independently tests only the author's two production corrections over that original frozen runtime. It does not certify a different successor package by its label or by author-reported results.

## Reviewed source

Original SOURCE_MAP SHA-256: `223d37c0160c681cf8d8aa1835edc48f49fefebb201119c0036655e32aaf26b5`

Exact replacements:
- `src/systems/latchNine.js`: `92829583512ab1fc4910cfc49cc6fe47961f457c2bafe3f9f239f8e2921f7339`
- `src/render/latchNineVisuals.js`: `12d276e7009b2894522666f16f1782ac91c420e19378f3571659d62c61740146`

The two exact postimages are retained under `reviewed-postimages/`. `audit-overlay-loader.mjs` selectively replaces only those two canonical source URLs, routes their relative imports back into the original runtime, verifies expected hashes, and throws if an original version of either corrected module bypasses the overlay. It logs actual source bytes and realpaths. `source-audit.json` records the complete imported module graph and final runtime/overlay hash checks. No other overlay source was imported; the underlying 57-file original runtime still matched the frozen packet after testing.

## Independent results

`independent-correction.tap`: 17/17 passed. Original reproduction files and their fixture helpers are unchanged from the sealed original review. The eight new adversarial cases are independently authored in this subdirectory.

F1 now behaves correctly:
- Disabled exact owned death immediately sets `destroyed:true`, releases budget to 0 and drops materializer ownership
- Repeated death is idempotent
- JSON semantic Continue keeps `destroyed:true`, budget 0 and creates no fresh actor
- A cold/de-admitted scene actor's real owned death is also remembered
- Matching tags on an unrelated actor, replacement objects under identical ID/generation, and a reused object in a newer generation cannot mark owned destruction
- Late old-life kill events after sector exit cannot destroy a newly returned actor

F2 now behaves correctly:
- Hiding the entity root produces zero lit mouth channels and zero active pooled plume slots
- Hiding a higher ancestor or the scene also suppresses mouth/plume output
- Restoring valid visibility resumes the same current native receipt without replacing/reallocating the owned mouth materials
- Restoring visibility after the object's generation changes does not resurrect the retired visual lease
- Root replacement and repeated material disposal still withdraw and clean up correctly

The exact old failing diagnostic outputs become:
- After kill: saved.destroyed=true, budget=0, ownedActorRetained=false
- After Continue: freshActor=false, budget=0, destroyed=true
- Hidden root: emitted=0, active=0, lit=[]

`unchanged-regression.tap`: 126/126 passed. This is the unchanged original focused/package suite plus shared Ceres/native ownership cases and seven prior adverse cases, run together with duplicate test-file arguments removed. The changes therefore retain the tested guidance, save hooks, normal materialization, consumed-control ownership, canonical package/source admission, native body, pooled plume and teardown contracts.

The first correction invocation used the outer workspace as cwd, so its five asset-reading presentation cases could not open the runtime's pilots registry. This was an invocation error before the tested asset path could run, not a production regression. Its log is preserved as `invalid-invocation-assets-cwd.log`; the corrected invocation used the original runtime cwd and passed all 17 cases.

## Scope and disposition

The corrections are narrow: destruction authentication now selects the materializer's retained exact owned entity/life independently of active guidance presence; visibility validation includes the body root and every ancestor through the current scene. Current-map, generation, departure and one-time destruction guards remain in place.

No remaining failure was found in this bounded correction review. The original three baseline docking failures, unpromoted status, art/triangle/mesh-count WIP, missing real game-view/GPU/performance acceptance and lack of a full ambient piloted route remain unchanged. This is scoped functional correction acceptance, not approval to promote or deploy.

No source file or shared integration tree was modified by the reviewer. All executions were local, and the original review artifacts remained hash-identical throughout this correction review.
