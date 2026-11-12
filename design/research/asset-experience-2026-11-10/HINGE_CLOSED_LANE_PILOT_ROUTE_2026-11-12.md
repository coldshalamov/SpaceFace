# Hinge Works: one rescue is not the whole shift

Source parent: `a18afeaea68330aeb8ff9f06dcd2932069598a10`, PR #982. This is a connected native simulation route on the existing scene, not new gameplay implementation, a live browser playthrough, visual review or whole-game acceptance.

Continues the [Hinge rescue-handoff dossier](../../creative-direction/CERES_HINGE_RESCUE_HANDOFF_2026-11-12.md) and this directory’s [living asset toolbox](ASSET_EXPERIENCE_TOOLBOX.md). It closes the earlier local-movement evidence gap for one mixed-outcome route, not all rescue branches.

## What was actually flown

The [route](../../../test/industrial-pilot-rescue.test.mjs) uses the stock Kestrel specification, Flight V3, Rapier, combat, ordinary tether input and existing feature/economy owners. Production feature maps are active before backend preparation. Initial scene selection (Closed Lane), pilot position 65 WU north of Lio and initial heading are fixtures. The test begins the existing response through its command. Thereafter there are no pose/velocity writes, scripted damage, reward injection or direct movement impulses. Explicit owner composition is not production registry-order evidence.

1. Latch Lio's original shelter pod with normal fire input. The new handoff yields its evacuation drive, not rescue credit.
2. Fly north, then east outside the two obstructing plates, then south toward the refuge. These are pilot-controller waypoints, not in-game navigation additions. The long cable swings widely around corners. Braking the ship does not brake the load instantly.
3. Lio physically enters the refuge at 89.83 simulated seconds, hull 100. Paz, left in the hot lane, is lost. This is not an all-crew rescue route.
4. Cut normally, fly back to the surviving original medical consignment, latch and tow it into the real refuge. Intake at 164.50 seconds, hull 100. No copy or replacement original is used.
5. The carrier has meanwhile left the shelter lane naturally. The scene settles with one crew safe, one lost, equipment preserved and medical consignment safe. The asserted economy event requests 380 cr once: 180 crew + 80 equipment + 120 consignment. This is an accounting consequence, not a new bonus or moral grade. The check asserts the emitted settlement amount, not a wallet balance or faction reputation mutation; the factions owner is not registered in this explicit harness.

The test also checks feature-section cold restoration of the settled mixed outcome and no repeated reward/handoff. It does not restore the complete campaign save or browser Continue.

## The connected scene and player knowledge

[Authored setup](../../../src/features/industrialDisasters/scenarios.js): Lio and Paz are shelter crews behind two torn plates. A moving hot carrier is the common cause of danger; the medical pallet is a separate useful survivor, not a substitute for either crew. The lit refuge is the shared destination.

[Physical logic](../../../src/features/industrialDisasters/causality.js): opening a lane is not itself rescue. Prolonged thermal exposure disables then breaches pods. A valid player cable now offers a second route but consumes the pilot's time. Intact medical cargo remains meaningful after a human loss. [Runtime](../../../src/features/industrialDisasters/runtime.js) retains original consequences and a once-only settlement; it does not wipe the loss because later work succeeds.

The rescue detour provides a credible choice with cost, not a universally optimal tutorial. The first briefing already recommends pulling plates or diverting the carrier, which can help both crews. Keep that shared-danger emphasis. Do not replace it with 'tow a pod first' merely because a scripted pilot completed that route.

## Creative decisions from this evidence

- Preserve the authored carrier, plates, two crews, medical pallet and refuge. Their different jobs produce an intelligible rescue story without more models.
- Preserve cable inertia and physical arrival. The long settling interval is a real cost of the alternate route, not evidence that rescue gates should be loosened.
- Preserve the mixed outcome. Do not silently rescue Paz, refund losses or reward a latch to make the route look successful.
- On the next rendered pass, assess whether the player can see the other crew and moving carrier while hauling one pod away. The important question is whether the cost is legible, not whether every first response succeeds.
- Only if that view fails should the next edit add a specific causal warning from the endangered original or adjust scene information. No fresh pixels were available in this pass, so this is a next-action hypothesis, not a proven UI defect or an asset commission.

## Toolbox and continuation

| Existing capability | Concrete role | Proven here / remaining gap |
| --- | --- | --- |
| Player MassLine handoff | Carry one healthy pod around the blocked lane | Full native refuge arrival; not rendered control readability |
| Torn plates + autonomous evacuation | Shared route for both crews | Source confirmed; not flown in this pass |
| Hot carrier and exposure | Time pressure with irreversible loss | Paz actually lost; prioritization still needs rendered evaluation |
| Surviving medical original | Useful second trip after mixed rescue | Native return, latch, haul and real arrival |
| Settlement/history | Honest remembered aftermath | Once-only reward and feature-section restore; full Save/Continue open |

SF-GAME / SF-SECTOR-COHERENCE: this alternate rescue plus medical return has native route evidence, not scene acceptance. Owner: experience integration. Next executable action: ordinary-camera Closed Lane triage playthrough, including plate-first response; compare what the player sees before committing and while towing away. Requires a working renderer for visual acceptance.

SF-WORLD-DIRECTION / SF-LIVING-WORLD: preserve the worksite's shared hazard and named human costs. Keep mixed aftermath visible on return. Full campaign arrival and return remain open; no original twenty-concept scope was removed.

SF-ASSETBANK / SF-ASSET-QUALITY: existing pod, cargo, carrier, plate and refuge assets are sufficient for this tested physical relationship. Their composition/readability is unreviewed here. No new missing-asset brief is justified by this evidence.
