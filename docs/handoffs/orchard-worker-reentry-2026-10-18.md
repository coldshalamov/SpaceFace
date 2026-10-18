# Orchard worker re-entry: accepted sequential scope

Production source: local `036cb396b0ddc99045f467942edd92d1d34841e2`; its entire
`src/` tree matches approved public PR456 snapshot `ff05b09ba0aa030fb05799cc81757ea3ec06ead1`.
The new regression below changes no production code or existing tests.

The independently reviewed natural return closes **sequential worker re-entry** only.
From the retained back-away endpoint at tick 23,219, one raw-input continuation ran
3,234/3,600 ticks, ending at 26,453, exit 0 in 14.018 wall seconds. Ordinary world
promotion restored receiver 114 at tick 23,692 and collector 113 at 26,334. Each then
passed 120 consecutive native ticks with canonical Mule hardware, durable identity,
manifest and budget ownership. Cargo stayed 8, hull 140, and finite Orchard custody
stayed source 37 + retained 3 + delivered 8 = 48; peak budget was 9/24.
Independent review verified all 18 archive file hashes and all 3,234 consecutive trace rows,
with no forced participant-state writes. The prior failed approach and successful
escape remain separate, unchanged evidence; this result does not rewrite their outcomes.

The receiver later shelved normally during travel to the collector. The terminal save
contains real motion, not a parked craft. Simultaneous residency, a full additional
harvest cycle, production UI Continue, the complete production manifest, browser and
visual acceptance remain open. The native load-readiness callback substitutes for the
renderer/UI finalizer. No broader gameplay or publication acceptance follows.

Accepted recovery packet identity: `libfile_b937a6e819c08191bb86e0e5571fa0c6`;
1,024,933 bytes, SHA256 `ec02f252560be343d8d2a5d6e63cffdacdcb89be1a3b2e5b0516483464666956`.
Terminal save SHA256: `a691e47203958cdf9071efd54219bd5751d1fcaab31cc953a4dceffb40aed32e`.

## Compact regression and its limits

[The additive regression](../../test/anvil-worker-world-promotion.test.mjs) uses seed
424214 and existing simulation, ship, work and budget owners. Explicit setup supplies
a four-unit loaded collector and a separated tender, then freezes participant setup.
Ordinary world ticks must shelf both; raw forward input must approach them and trigger
world promotion, followed by 120 native ticks of canonical hardware and unchanged finite
traffic manifests. It calls no far-table insertion/promotion or native pose setter and
needs no generated save. The approach cap is 600 ticks, not the long harvesting route.

This covers a connection the four controlled residency cases omit: those invoke
promotion directly. The existing input-route test disables world updates and omits
spawnBudget. A synthetic, test-only omission of world promotion dispatch leaves those
four controlled cases green while this approach fails with zero promotions. This is
an oracle check, not a reproduced production defect. The seeded fixture's nearby
workers do not establish simultaneous residency on the accepted natural route.

The final combined selection passes 26/26 in 2.881 wall seconds. The dispatch-only
negative control passes the four controlled cases and fails the new case as expected.
Run `node --test --test-concurrency=1 test/anvil-work-rematerialization.test.mjs test/anvil-orchard-refill-residency.test.mjs test/anvil-worker-world-promotion.test.mjs test/far-actors.test.mjs`.
The already passing long input route and CI workflow remain unchanged.

## Next substantive ordinary gameplay gap

Follow the existing [continuation runbook](../../design/program/world-depth-2026-10-02/CONTINUATION_RUNBOOK.md)
and its source-scoped [execution status](../../design/program/world-depth-2026-10-02/EXECUTION_STATUS.md),
preserving historical attempts and reviewer fields. The next useful gameplay unit is
the loaded collector's physical return and once-only handoff after re-entry, then a
complete additional finite harvest/refill cycle. These remain unproven by the short
native windows. Inspect the moving tick-26,453 endpoint before choosing a bounded leg;
the collector is still far from the receiving berth. Require ordinary flight, actual
transfer distance and relative speed, custody conservation and no replayed delivered
lots. Do not assume a whole cycle fits one 3,600-tick segment, silently renew a consumed
bound, teleport an observer, or force a worker phase. No further gameplay ticks were
consumed while preparing this regression and handoff.
