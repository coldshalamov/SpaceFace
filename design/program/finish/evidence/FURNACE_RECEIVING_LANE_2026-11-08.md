# CR-FEED: a readable release shoulder

## New scope after Scale 4

Fresh remote remained `39887a0186bea79eed4c8648fa34a4eb6c4e461e`; current claims and dirty paths were checked before work. This is a new increment after the frozen Scale 4 comparison, not another edit to it. Exact ownership: clean `src/systems/furnaceIntake.js`, new `src/missions/furnaceReceivingLane.js`, `test/furnace-receiving-lane.test.mjs`, and this note. Missions, furnace worksite ledger, side-event director, existing models and all earlier candidates remain untouched. No publication/worktree/permission changes.

Book 1 actually routes alloys to Tethys, Scale 4, then the infested hauler disposal detail at Ceres (`campaignData`, `embodiedMissions`, `STORY_BEATS`). The current contract owns four repair-mite clearance sites and three quarantined ore lots. `furnaceWorksite.js` already routes the pilot from marked pods to the mouth; `furnaceIntake.js` consumes real edible bodies crossing its 90-WU radius; missions validates exact lot receipts and owns completion. None of those laws is replaced.

## Player-facing assembly

The disposal stage now gains a small, optional release-shoulder ring 180 WU east of the mouth, between the existing pod staging area and intake. It reuses existing nonphysical beacon/circuit-ring presentation, not a new model or collision body. Its scan label says to aim the marked pod at CR-FEED. Once the actual clearance ledger is complete and pending lots exist, the ring is present; only a living nearby undocked pilot in flight hears the brief. It explains that marked quarantine lots, not random rock, count; tow or fling remains a choice; and the other loads should stay outside the swing.

This is a working position and visual orientation aid, not a mandatory gate, automatic throw, teleport, safe-zone promise, or extra reward. The ordinary mission waypoint still belongs to missions and still points to the payload/mouth. Deliveries before the marker is present remain legal under existing rules. The shoulder is 90 WU outside the intake lip, with a 35-WU drawn radius and no physical body or tether target. It does not promise a collision-free approach through all ambient traffic or refinery scenery.

CR-FEED now names each genuine authored lot as it crosses the lip, with the actual received count and explicit lost count. A final two-received/one-lost result says no marked lots remain, rather than telling the pilot to fetch an imaginary fourth load. The three-received result says all three reached intake. Ordinary rock keeps the existing generic furnace line and never gets the three-lot receipt voice. No new person, revived victim, cleared infestation, or reward is invented by this copy.

## Owner boundaries, review corrections, persistence

The new helper is read-only with respect to mission/cargo/payment state. It owns only its transient nonphysical guide and one additive story flag recording the heard briefing's mission ID. Callout truth delegates to existing `furnaceReceiptMatches` after intake has set `_furnaceTaken` but before its synchronous `furnace:fed` event can complete/remove the mission. An invalid ledger also refuses specific voice. Initial review caught a weaker hand-built receipt check and terminal-loss copy; both were corrected and regressed for malformed type/version/ledger and loss-aware terminal output.

Guide creation is idempotent, bound to the current active authored detail, and removed on cancellation, settlement, invalid ledger, sector exit and owner destruction. It does not remove surviving freight or alter the persistent aftermath ledger. Save restoration reconstructs the guide from the active mission rather than serializing a body reference. The heard flag is tested through actual `_serializeMissions`, then restored into a fresh fixture; pending mission/actor full Continue is not claimed. The reinitialization test calls real `init`, not just `_sync`.

## Evidence

Focused tests cover the actual Book 1 offer builder after `alloy_run`/`scale_4`, mission instancing, clearance ledger, optional marker admission, real intake events feeding the mission owner, synchronous third-lot completion, ordinary-rock isolation, loss, invalid records, local/docked voice guards, actual owner reinit, cancellation and serializer-boundary briefing memory.

A separate native Rapier case launches an actual 40t authored mission lot from the shoulder with an initial velocity fixture of 30 WU/s toward the mouth. Physics carries it across the open ring; the real intake emits one feed at 3.25 simulated seconds. There is no injected `furnace:fed`, coordinate overwrite after spawn, or marker collision. This is native payload/intake geometry evidence, **not** actual player Massline latch/throw/release input or a full played combat/disposal route. The mission settlement proof is separate from that native fixture.

The wider quiet-Ceres census test fails at FULL ship 21>20, FULL payload 28>16, UNTAGGED payload 10>3. The same exact census failure was reproduced with a Node loader substituting the pristine HEAD furnaceIntake source, without modifying the checkout. Logs `/tmp/furnace-lane-combined.log` and `/tmp/furnace-census-before.log`; baseline source/loader `/tmp/furnace-lane-baseline/`. No census expectation was raised and this result is not called green CI. This new guide appears only during the active disposal stage, not that quiet census.

No rendered ring/label screenshot, full authored-field navigation, hardware input, combat clearance, all-three native throw, full save/load, broad CI, GitHub publication, merge, deployment or user acceptance claim.

## Goal state / next action

SF-GAME / SF-WORLD-DIRECTION / SF-SECTOR-COHERENCE / SF-LIVING-WORLD remain open. This fills one physical work location on the actual outward mission route; the larger scope and prior acceptance gaps remain. Local agents own models. After independent review/preservation, next action is authorized publication followed by a rendered Ceres disposal playthrough with the existing loaded-line controls and ambient field, checking the new shoulder against the actual visible worksite.

Final focused suite **7/7 pass**; combined receiving-lane, Ceres aftermath, Book 0–2 and Book 1 mission-log continuity suites **18/18 pass**, independently reproduced. Log: `/tmp/furnace-lane-final-all.log`. Source diff whitespace check passes. Review found no remaining source blocker; visual/full-route acceptance remains open.
