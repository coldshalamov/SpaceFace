# Mite LOD interpretation

Current candidate counts: LOD0 3456, LOD1 1482, LOD2 978 triangles; nine batches at every tier. Proposed ceilings 3500/1600/1000 and nine batches are review candidates, not admitted shipping budgets.

The frozen runtime uses `src/render/lod.js`'s selector metric, nominal thresholds120 and45 with25-pixel hysteresis:
- Starting at LOD0, demote to LOD1 below95
- Return from LOD1 to LOD0 above145
- Demote LOD1 to LOD2 below20
- Return from LOD2 to LOD1 above70

These values are the existing radius-based projected-size metric, not the exact occupied image width in the review sheet. The renderer measures the visual cull radius and calls the same selector. `wholeShipLodPolicy.js` disables separate-file live demotion; this candidate uses in-file authored tiers, whose toggles remain supported.

The170px sheet is a deliberately equal-screen-size comparison to expose simplification. It does not propose showing LOD2 at normal combat or close scale. LOD2's faceted abdomen and simplified mouth are suitable only for distant contact scale. Existing hysteresis can retain LOD2 until the metric exceeds70; actual occupied-pixel appearance and transition popping must be checked on the real renderer before admission. Do not claim that merely packaging tiers verifies their screen-size selection.

No selector thresholds, camera settings or difficulty stats were changed. If the actual-game review finds the generic retained LOD2 band too large, propose a narrowly scoped Brood visual-policy change for review rather than quietly reducing global quality.
