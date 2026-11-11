# Redcut Sorrel: two hulls, two sealed labels

## Earned result

The continuing pilot defeated Redcut Sorrel on the actual second Coalition Patrol contract, m_15, at sim time 6704.4167. The mission paid **1,150 credits once** and the canonical Book 5 completion paid **2,500 once**. The real KeyC scanner pulse at 6704.4333 observed Sorrel’s surviving hulk. It separately earned a **150-credit survey_cartography grant**, not paperwork or mission pay.

Sable and Sorrel now have two independent, persistent label observations. Both name Vale Holdings and three years of sealed administrative records. The contents remain sealed. The Weighing remains `cleared_unverified`; no Helix exposure was awarded. Book 5 is complete with `custody_patrol`, the live cursor is Book 6, and no income asset has been deployed by this continuation.

Final resources: **27,007 credits, 2,056 debt, 44 fuel, 140 hull, 210 shields**. The return trip genuinely spent 571 credits on fuel. Relative to the prior 23,778-credit Sable checkpoint, the net change is +3,229: 1,150 + 2,500 + 150 − 571.

## What changed

- Sorrel’s active briefing connects to Sable only when this pilot actually observed Sable’s label. It asks the player to compare a surviving wreck, without promising its owner or opening its contents.
- The optional wreck-scan instruction survives the real Book 5→6 transition. Previously the second kill immediately advanced the book and hid that instruction on the same tick the wreck appeared.
- Two independently identified observations produce a single comparison in the existing story log. The next asset instruction keeps that evidence and its limits visible. Missing, consumed, unobserved, malformed or duplicate-identity records do not manufacture a two-hull conclusion. The paperwork observation is never an asset/progression gate and adds no reward.
- A real live-target read exposed another defect: the normal identified wreck story suppressed the independently scanned sealed label. The target-facts reader now displays valid scanned paperwork independently of the generic black-box deduplication gate. No scanner or save owner changed.

The existing fight, target spawning, capture authentication, finite 60-hull wreck durability, mission progression, economy and reputation owners are unchanged. This is not a combat rebalance. The bruiser’s 157 armor plus 549 hull/176 shields made the pilot’s pulse-laser fight substantially longer than Sable’s.

## Forward native evidence

Every stage continues the preceding honest saved ending. There is no replay of the Sable fight, no revival of its destroyed hull, and no fabricated target or progression writes.

1. Continued the earned Sable save; physically docked/refuelled at Expanse, cleared the berth, travelled via Vesta, docked/refuelled at Coalition. Fuel costs: 269 + 302 credits.
2. Accepted the actual saved Sorrel posting through the UI intent, tracked it, physically cleared Coalition, and routed to Charon. No route interruptions. m_15 is the authored Bastion bruiser.
3. Three title Continues preserved selected state and exactly one durable Sorrel target.
4. The first combat harness reached its 200-second cap with both ships alive. That failure and damaged target were saved, not discarded. The pilot still had 140 hull and 105.456 shields.
5. Continued that actual failed ending. Ordinary thrust, yaw, boost/dash and firing inputs defeated the same damaged target. The forward stage records 6,023 firing frames, zero admitted while protected. First fire occurred at 6602.6167 with invuln false after the normal dash grace expired. The first-stage first-frame invulnerability was the ordinary Shift boost/dash grace, not a harness grant; first actual player hit was 6405.9333, after the logged false protection frame at 6401.5833. No complete per-input protection trace was recorded for that initial stage.
6. The actual kill, rewards and scanner observation succeeded, but a target-facts assertion failed: the live scanned hull showed only salvage. Both the failure and the earned ending were preserved. This was a real presentation bug, unlike the earlier Sable stale-pointer assertion.
7. Continued forward for diagnosis and one real scan. The same surviving Sorrel hulk had scanned=true, valid paperwork and an identified generic story, yet the old facts reader omitted its label. After the narrow presentation fix, another forward real scan returned owner, sealed manifest and “Seal closed” in the actual target-facts reader. No additional observation or grant was produced.
8. Three final selected-field-equal title Continues plus 600 physics frames retained both observations, Book 6, the unverified Weighing and all retained receipts. No credits were granted. Sorrel’s marker remained present; Sable’s destroyed hulk remained absent. Generic transient scanner identification still resets on rematerialization, while the permanent label observations and Journal comparison persist.

Nine prior recent receipts m_6–m_14 remain exact. m_5 naturally rolled out of the existing ten-receipt cap. Earlier Kessler, Furnace, Cinder, Nest, Elroy, Patrol-choice and Weighing flags remain unchanged. Living-world reputation and heat changed during real travel/combat; this is not whole-save equality. The historical garden-growth notification still re-emits on Continue.

## Verification and limits

Final source: **51 tests pass** (8 focused continuity/presentation groups, 11 existing paperwork tests, 32 surrounding regressions). The focused groups include both scan orders, absent/consumed evidence, repeated owner serialization, duplicate mission/wreck identities, and the generic-story presentation regression. An independent reviewer reran all eight focused groups and verified final source, exact parent and patch application.

Six direct audits pass: Mission Log terms, mission preflight, map handoff, 55 UI screen imports, player-facing labels and type floor (2,554 live declarations). An initial type-floor invocation used the wrong working directory and inspected zero declarations; that retained harness failure was corrected with the proper repository working directory. The broad w534 check still fails with the same 13 named failures as the frozen exact-parent baseline. It is not a broad green result.

Source closure verifies the frozen per-stage native sources and final tests/audits against the exact parent plus candidate. Node replacement decoding of an inherited invalid-UTF8 source file is accounted for. All 14 monitored shared paths, including all seven denied paths, remain byte-identical. No shared checkout, model work, user computer or execution thread was altered.

This is production-profile, Node-safe, public-input/native-intent simulation evidence, not a rendered human playthrough. There are no inspected pixels/screenshots, audio, performance, full New Game, whole-campaign or hosted-CI claims. The prior browser socket denial was not retried through an alternate route. Native target-facts strings are not visual layout acceptance.

## Candidate status

Unpublished candidate against exact PR #939 head **5561258581c90ec94ecbc5d7880644b32a06a213**, tree **4c3cc3bb3c9c81e0352c4a0ea66077e451db6ff0**. The complete 28,295-leaf parent tree is reconstructed and all 169 inherited overlay paths match its blobs. Fresh final PR read confirms the same head, open draft and not mergeable. Nothing was uploaded, committed, pushed, merged or deployed by this continuation.

Only the frozen candidate overlay is publication eligible. Inherited parent/native/testing overlays include read-only source and are not upload payloads. The resumable handoff records exact hashes and the final actual checkpoint. Any publication requires fresh destination/head verification and independent evidence review; this report does not declare merge readiness.
