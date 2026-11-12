# The muscle belongs to the wall

Exact parent: #942 `61d633dc` (resolve full SHA in the accompanying candidate manifest).

## Player experience

Round24 is already a physical room rather than another introductory score: light bodies arrive first, a breakable chord offers two openings, then two Anchor hulls pressure that side of the encounter. The pilot can retreat, choose an opening, circle the chord or break its existing monoliths. Preserve that scene and the subsequent boss/Mooring Line sequence.

The delayed heavy gate previously followed the pilot while its wall stayed fixed. Ordinary retreat therefore brought the supposedly far-side muscle onto the near side of the original chord. This broke the physical choice: moving around the room also moved the source of its closing pressure.

The wave owner now snapshots the room origin when the wall plan is accepted and passes it only to its `wall:true` batches. The materializer uses that origin for the existing authored bearing and distance. The original physical wall and its two owed hulls remain unchanged. Fortify's corridor policy takes precedence. Ordinary batches, reinforcements and subsequent non-wall waves retain their existing placement. Current-player minimum arrival distance and swept solid checks still run after proposals; occupied positions can be safely relocated or deferred, never forced onto a pilot who crossed the wall. No change to enemy stats, count, quota, rewards, damage, models or rendering.

## Evidence

New eight-case suite plus existing materialization suite:21/21. Tests cover retreat/sidestep, translated room, current-pilot clearance, non-wall/non-Swarm exclusion, malformed anchors, Fortify priority, duplicate planning and next-wave reset. Three new assertions fail on exact parent; the other five already pass. This is a scoped behavioral comparison, not three separate bugs.

Existing `swarm-mass-gap.test.mjs` has five failures both before and after: older assertions still expect mass-gap rooms in Foundry rounds already replaced by preceding authored acts. This candidate does not change that plan or edit those expectations.

Native Rapier comparison uses the same fresh staged round24, seed73311, ordinary starter energy hull and directional input lane events for500ticks. No hull/prop relocation, injected kills, damage immunity or population overrides. At tick320 the exact two delayed Anchor seats previously admitted at wall-axis27/45WU, on the near side of the original250WU chord. Candidate admissions occur at363/330WU, beyond that chord. Player hull ends140/140 in both. Input and dispatch timing are unchanged; enemy trajectories necessarily differ. This demonstrates restored room relationship under retreat, not a won fight, guaranteed safety, perfect gap navigation or balance equivalence.

Two other parent-only active trials waited300ticks before attempting the original gap routes: the left attempt died at485 after reaching the first waypoint; the right completed both waypoints at601 with140hull. Unlike prior `wave_intro` probes these had active enemy admissions, but they are not earned late-run fields. The candidate was not claimed to reproduce their outcomes.

## Open acceptance

The gate's existing spread and blocked-position search remain; this does not claim every possible admitted collider stays beyond the wall plane for every seed or obstacle arrangement. Full earned passage into24, accumulated late-run geometry, deliberate throw/fracture under pressure, full Save/Continue, rendered readability and balance remain open. Runtime reconstruction follows existing wave/arena reconstruction; the transient anchor is not a new saved field. No publication, merge, deployment, denied path or model-production work occurred in this candidate.
