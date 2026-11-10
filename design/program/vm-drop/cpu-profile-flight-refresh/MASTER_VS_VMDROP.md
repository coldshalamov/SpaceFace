# Master vs vm-drop hitch inventory

Master tip: `35e519ebd`
vm-drop tip: `55275d66e`

## Already on master (or equivalent)

- lanes C+D merge `1198e70e7`: runway hold prefetch, wave hull decode warmup, soft-GPU hitch floor
- asteroid `cellKey` numeric encoding present in `asteroidField.js` on master
- picture defaults ON (no change needed)

## vm-drop ONLY (import candidates for Robin)

- **hitch-asteroid-cell-key** `5f84208e3` — asteroid cellKey numeric — CODE already on master tip
- **asteroid-query-callers** `2e62210f4` — tight rock disc + drop dead decode-runway scan
- **far-actor-cell-key** `070c58394` — integer far-actor grid keys
- **prepare-pitch-settle** `847e893e3` — settled-idle pitch skip + middle-band cadence
- **flight-dormant-skip** `c2de7839b` — entityNeedsFlightStep shelves dormant S2/S3/S4
- **sync-entity-views-closure-gate** `4df3ba34f` — closure gate for syncEntityViews
- **sync-entity-views-submit-scratch** `364b555f2` — submit scratch pooling
- **classify-pinfacts-cache** `a23a8619e` — pinFacts cache
- **classify-closed-form-scan** `3e798170f` — closed-form classify scan
- **radar-range-plate-cache** `81f70888d` — range plate draw cache
- **radar-contact-color-defer** `2d7bc6c71` — defer contact color work
- **radar-project-scratch** `77064b0b5` — projectRadarPoint out-param + pooled marks
- **hud-settext-cache** `941643eb8` — setText last-write cache
- **hud-screen-transform-cache** `792186592` — setHudScreenTransform quantized early-out
- **hud-glag-transform-cache** `fe6fe56c3` — setLagTranslate hundredths early-out
- **threat-halo-transform-cache** `933ac2e85` — setHudTransform tenths early-out
- **trail-history-pool** `d352c55af` — recycle radar trail {x,z}
- **opening-residency-deadline** `9fdb832df` — soft-GPU upload deadline
- **opening-plan-complete** `f69e5c849` — opening plan complete
- **hitch-opening-drain** `d6a1c419e` — opening drain
- **hitch-opening-admission** `?` — opening admission
- **alloc-journal-churn** `16c2a6810` — alloc journal churn

## Known misses (do not import)

- overview-contact-pool
- radar-contact-list-reuse
- shader-admission-slice (hitch regress)
- hold-prefetch-inbound (measured miss; lane-c inbound already on master)
- cloneUniforms ocean — avoid per brief
