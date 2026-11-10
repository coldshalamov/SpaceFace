# Handoff: clear native launch

Successor to PR568 head `60c654268b4c5b05f5d2833062de0a937380599e`. Production changes are confined to encounter357. Prior followthrough packet remains frozen. Its handoff-followthrough.png and handoff-followthrough-native-evidence.json are historical synthetic radius-2 evidence, unchanged here; they do not depict this measured-hull clear-launch successor.

## Physical defect and correction
The original 64 WU layout placed the first radius-3 pod at a nominal axial offset of6.4 WU from its seller before jitter. Actual `mule_trader` factory bodies resolve to `ship_mule`, radius18, mass55, and the public measured `skin:ship_mule:hull` convex collider (type9,32vertices), not the earlier synthetic radius-2 fixture. Its planar bounds are x[-15.80131816864,15.57161998749], z±7.33431577682; conservative corner radius17.4205006754 is below18.

The new layout uses an 80 WU seller/buyer gap and original pod offsets22/30/38/46 WU along the seeded bearing, with at most2 WU perpendicular jitter. Seller clearance is at least22-(18+3)=1 WU. Adjacent pods are at least8 WU apart, leaving2 WU between their surfaces. The last pod remains at least34 WU from the buyer, outside both its21 WU hull-plus-pod envelope and the26 WU receipt radius. All four original two-unit pods remain initially unreceived.

No heading behavior was added. Text now describes hulls holding off the lane rather than claiming nose-to-nose orientation. Quiet seller/MTS buyer roles, seeded bearing, four original pods, native impulses, six-second hold, 60-credit/+2-Quiet reward intents, 110-second deadline and settled-custody followthrough remain intact. Only legitimate pre-adoption spawn positions changed; no later pose or velocity writes were introduced.

## Qualification
- Focused plus legacy director tests:63/63. Harness factories now honor authored initial spawn positions instead of silently retaining their obsolete64 WU fixture.
- Native tests:12/12, comprising the existing two synthetic authority tests, eight cardinal/diagonal bearing tests with extreme perpendicular jitter, and actual director/native hold and pass routes.
- All six original scene bodies are sampled for native solid contacts. Each of eight geometry cases has zero contacts at the first native step. Actual hold and pass have zero contacts throughout their first60 native steps.
- Exact published-source baseline fails the same new actual-director assertion:32 total directed contact rows during the first second, including30 rows below the -0.0001 WU penetration threshold (15 reciprocal negative-pair samples); minimum separation -2.177396822726148 WU. These represent repeated seller/first-pod contact, not32 distinct collision pairs.
- Actual hold bonds at6.10s and resolves contact_made at8.1167s, with one original player-owned pod and three buyer-owned originals; exactly one60-credit intent and one+2 reputation intent. Actual pass resolves deal_done at14.1167s, with all four originals buyer-owned and no bond/reward.
- [Compact native evidence](handoff-clear-launch-native-evidence.json) contains baseline failure, all bearing results, and actual player/original-body positions at spawn, acceptance and terminal receipt. Snapshots are measurements, not interpolated trajectories.

## Reproduction and limits
The review packet includes a compressed RAM module runner and a focused runner. Native graph reconstruction verifies exact public owner blobs, including factories, encounter director, tacticalAI, aiPorts and native physics owners and the exact public census; historical archive dependencies, including FlightV3, remain mixed. The runtime graph uses20 pinned sources plus901 historical archive modules and one local localization shim. This is not a complete exact-current-tree build.

The actual routes use requestAuthoredEncounter with force:true and the original mule_trader/Kestrel factories, production controllers and Rapier geometry. They establish authored admission and these native routes, not natural ambient admission frequency. The pass player has legitimate initial spawn velocity and ordinary drift input; the hold uses ordinary brake input. No gameplay economy system is installed, so reward checks establish event intents rather than wallet balances.

Full Save/Continue, browser/live camera, asset-rendering quality and whole-game acceptance remain unqualified. The inherited -2 Quiet penalty for unexplained missing/destroyed pending freight is unchanged and does not establish player causality. No shared director, steering, physics, model, persistence or economy source was edited.
