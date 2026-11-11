# Cinder tow motion: feedback improvement, handling unresolved

## Player-facing increment

Unpublished candidate against PR #939 commit `4f713575a43440b26d74c20a7885c7c5d665df51`. Current remote was rechecked unchanged, open, draft and unmerged on 2026-11-11 UTC. No shared-checkout edits, publication, new execution threads, laptop use, merge, deployment or new assets.

The existing Cinder flight guide and Journal now distinguish the original hull's absolute speed, the tug's speed and their center-to-center relative sideways motion. A stopped tug no longer leaves the player with only the vague instruction “BRAKE THE HULL.” The readout identifies an actual swing, warns against shortening a swinging Line, and tells the pilot to keep clear of the hull when changing pull direction. It does not promise that a maneuver will arrest the load.

The existing receiving scene now shows one short actionable receipt before the load reaches the busy apron, within 1,000 WU of either market. Full explanation reaches the ordinary LOG through its durable-story receipt path; it does not appear as narrative prose over flight. Each original hull receives an approach warning and, if relevant later, a swing warning once. Existing Rook/Quiet terms retain priority and scene memory uses the existing serialized mission-scoped contact record. A reviewer reproduced handling text repeating on first stand terms after Continue; the guard prevents that repeat while still allowing the new stand's terms. These are text surfaces, not spoken audio.

The 8-WU/s sale law, current rings, law refusal, hull damage, original identity, cargo, settlement and all physical movement are unchanged. The center-line projection is explanatory information, not an attachment-socket telemetry claim or a replacement intake gate. Invalid/missing physical evidence gives no numerical instruction. Relative swing cannot refuse a hull whose actual absolute speed satisfies the booth.

## What the preserved failures actually establish

The prior earned market run repeatedly brought original `aft_1pgx7p8` into or near the Quiet Line ring at roughly 65–110 WU/s. Its tug was moving only about 2–6 WU/s. It ultimately hit another craft, not the nonphysical pad. The original controller abruptly reduced tug command from 70 WU/s to at most 6 within 220 WU, chased a moving goal, and had reeled the Line to about 69.43 WU. It did not account for the payload's sideways motion.

The native rope applies equal/opposite radial tension. Stopping the tug does not directly remove tangential momentum. Tractor and Frame Coupler are not hidden sideways velocity clamps. The existing Ceres receiver receives an already-slow, physically seated load; it is not evidence that a single anchored rope can safely catch this fast swinging hull.

Three explicit alternative experiments were preserved separately, without resetting the original failed outcomes:

1. **Longer Line, slow straight tow.** Replayed the same inherited Ceres/Charon handoff through genuine combat, recovered the same first-kill marker `aft_1pgx7p8` and retained its approximately 108.40-WU Line. A fixed straight goal and 25-WU/s tug cap did not solve route clearance. The original hit terrain175 at `(7282.50, 27485.86)`, after 255.12 WU and 1,046 held frames. No sale; zero credits. The checkpoint before hauling and the actual terminal save are both retained.
2. **Payload-velocity feedback after Continue.** The saved original restored as entity2934, with the same marker and 1 HP. The player Line was inactive after Continue. An initial F attempt without ordinary pointer activation selected another object, and its identity assertion stopped immediately. After correcting only pointer activation, F latched the actual original. Direct feedback steering then crossed the tug through the payload: craft1 collision at `(7298.70, 27352.04)`, deltaV30.268, damage26.182. No sale; zero credits.
3. **Collision-aware annular correction.** A separately labeled continuation of the pre-loss checkpoint moved around rather than through the hull. It kept tug-hull separation at 104.47–110.71 WU over 11,159 ticks, avoiding the prior direct tug contact, but generated large excursions with a peak actual hull speed of 57.38 WU/s. The original ultimately hit terrain400 at `(7591.12, 26852.23)`. No sale; zero credits. Per-tick inputs, both physical velocities and the terminal save are preserved. No additional attempts were started.

These are native production-runtime experiments through ordinary ingested keyboard/pointer input and genuine physics. They are not rendered human play. No pose, velocity, health, fuel, money, cargo or progression grants were used to obtain the outcomes. Their controllers are evidence harnesses, not candidate gameplay code. They executed the exact published parent with virtual probe scripts; the final warning copy is verified separately and is not misrepresented as the source of those flight outcomes.

## Verification

- Final delivery-corrected exact-overlay aggregate: 104 passed, zero failures/skips. Includes twelve new motion/receiving/presenter tests and the existing 92 Cinder/Rook/Journal neighbors.
- The first independent review passed nine supplied cases plus its separate save/receiving repetition regression. A subsequent review found that Adventure discarded the original narrative popup before LOG insertion, so those event-capture tests did not prove actual delivery. The corrected scene uses the existing durable LOG path and a short objective receipt; no global attention policy is changed. Final independent review details and hashes are recorded in the handoff.
- Three additional regressions mount actual production `createComms` and `createToasts` listeners, pass projected/structured-cloned worker-event payloads to a separate main bus, and inspect the receipt card, polite live region and LOG DOM. They cover normal flight, combat/hurt, WANTED priority, Quiet contract consequence and repeated updates. Narrative prose remains off the live feed. These are actual listener/DOM-construction tests, not browser geometry or pixel review.
- Player-facing label and type-floor checks pass.
- Owner fixtures cover real mission/wreck identities, current attachment generations, wrong modes, WANTED priority, fractional speed limits, actual sale refusal/acceptance, immutable physical/financial observations and saved warning memory. They stage positions and velocities and are not earned-flight acceptance.
- Full production-runtime title/Continue-controller checks loaded both newly failed branches, saved them and continued again. Both retained the destroyed original marker, zero credits, no sale and the exact field report, with no reissued hull. This is actual runtime persistence of loss, not rendered title interaction or successful receipt continuity.

Source changes are confined to `src/missions/cinderRoute.js`, `src/missions/cinderReceivingScene.js`, `test/cinder-tow-motion.test.mjs` and this report. The sparse source audit verifies executed modules/files against the current parent plus these exact candidates. One pre-existing source file contains non-UTF-8 bytes; raw Git blob identity and Node's replacement-decoded import bytes are distinguished, as in the parent handoff.

## Remaining acceptance

**The recovery/receiving experience remains unresolved.** This increment explains a real physical condition and prevents misleading feedback; it does not establish a successful ordinary original-hull sale. Slow straight approach, payload feedback and a collision-aware correction all failed in distinct ways. No successful market receipt, successful receipt across Continue, whole New Game campaign, browser/GPU rendering, screenshots, audio, frame pacing or full CI acceptance is claimed.

The next substantial step should address practical payload-aware braking and terrain clearance or an explicit physically modeled receiving operation. More favorable fixtures or more instructions alone are not evidence that the demonstrated handling problem is solved. Keep all terminal losses and original-hull evidence intact.
