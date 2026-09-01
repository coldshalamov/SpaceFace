# Controller acceptance — PQ-131.01 Rover Cycle 79

**Verdict: KEEP. Scope: whole asset, G1/G2/G4.**

## Frozen identity

- LOD0 source SHA256: `7B5DE3BA6ADA36AFCE236BEB300B5323AB83A35FF4B92C48A33A911743C02267`
- LOD1 source SHA256: `4D19D8C5813308759DDB3FE2D90168C08CBCB61DC8EC44C751C58BB63907EA3F`
- Combined source SHA256: `444DA580C97A5A993D713AF6656A1049D8B9FBBD6E86697F8B21B58D6354D5CB`
- Released GLB SHA256: `7F759A4853517D1622D9293552C596C61CB5987EF74418DDADDA85C515B67D4C`
- Render-package GLB SHA256: `9BEBA0E36ED10375F7C392EBC30DFCD3753D8DEAD07E966D2009ADF1971D4380`

Two identical final source builds matched at raw GLB, normalized JSON, and BIN payload hashes for LOD0,
LOD1, LOD2, and the combined source. LOD0 is 17,438 triangles against the 18,000 budget.

## Visual decision

The controller inspected the original-resolution `works_top`, `works_edge`, `works_site`, textured and
clay 1:1 crops, beside-flight comparison, and the final live work/site captures. Tracks, hopper/well,
raised cab, pane, body bridge, boom/bit, livery/steel/glass, and site silhouette read as one authored
mining crawler. The final live work frame does not reproduce the earlier overbright headlamp candidate.

Cycle 79 deliberately retains the automated `clay.CAB_PANE = 0.0081 < 0.02` result and overall
`planform.pass = false`. It is not hidden or rewritten. Three independent reviewers inspected the same
frozen candidate and each returned G1/G2/G4 KEEP, no P0/P1 defect, and
`CLAY_PANE: MEASUREMENT_FALSE_POSITIVE`. Controller inspection agrees: the framed pane is visibly inset
in clay and clearly dark/recessed in the textured and live work views. The evaluator miss is therefore
dispositioned as non-material for this exact candidate; it is not a blanket waiver for later assets.

## Runtime decision

Independent runtime review found and the implementation corrected: lost non-mesh package markers,
validate-after-attach stale state, LOD hopper visibility reset, inert/per-frame-upload tread animation,
late async installation after teardown, and per-instance material leaks. Final focused tests cover actual
released hook resolution, both hopper LODs, per-instance tread UV phase without `needsUpdate` churn, and
resource cleanup. Final live capture resolves all 13 hooks plus asset identity.

The controller browser playable run passed every gameplay, Continue, shader, asset, and authored-hull
assertion but recorded the repo's documented intermittent
`opening submission post-submit validation failed` diagnostic as its sole CLEAN error. The Works asset
was not requested on that flight route, and the added render-package row is lookup-only. The same frozen
candidate had already passed the browser route 16/16; the controller switched evidence layer instead of
rerunning the unchanged failure, and the real Electron/desktop route passed 16/16 with no uncaught error.
The browser fingerprint remains a known opening-diagnostic issue, not a `PQ-131.01` product-path blocker.

**Controller disposition: accepted for `PQ-131.01`; proceed to `PQ-131.02`.**
