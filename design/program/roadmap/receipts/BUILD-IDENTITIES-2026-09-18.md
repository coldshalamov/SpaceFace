# Build Identity Pilot Proof

Generated: 2026-09-18 · seed: 20260918 · hull: ship_drifter (all fits) · content: 3 corsair raiders + tow anchor + terrain ring
Verdict: PASS

| identity | completed | alive | raiders down | ticks | signature verbs |
|---|---|---|---|---|---|
| Momentum Predator | true | true | 3/3 | 9449 | whipSnap=22, swingDash=22 |
| Control Specialist | true | true | 3/3 | 9615 | snareDeployed=14, decoyDeployed=11 |
| Precision Pilot | true | true | 3/3 | 1672 | shotsFired=1686, lineCuts=8 |
| Salvage Industrialist | true | true | 3/3 | 10527 | latches=1, towFlailHit=4 |

| identity | shotsFired | latches | lineCuts | whipSnap | whipImpact | swingDash | snareDeployed | snareCaught | decoyDeployed | pdsIntercept | towFlailHit | kills |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Momentum Predator | 7258 | 23 | 22 | 22 | 0 | 22 | 0 | 0 | 0 | 0 | 0 | 3 |
| Control Specialist | 5794 | 0 | 0 | 0 | 0 | 0 | 14 | 0 | 11 | 0 | 0 | 3 |
| Precision Pilot | 1686 | 8 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 3 |
| Salvage Industrialist | 88 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 3 |

Every counted verb is a bus event the live sim published (`combat:fire`, `tether:whipSnap`,
`ship:swingDash`, `massline:snareDeployed`, `countermeasure:deployed` kind=decoy, `pds:intercept`,
`combat:collisionConsequence` provenance=tow_flail, `entity:killed`). Same seed, same content,
same hull — the fits play differently, which is the acceptance.
