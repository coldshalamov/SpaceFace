# Opening experience: Helios starter workday

Source implementation base: `6388cd3b25d39ee8178a5fac21be27affccadc4e`. This successor preserves the separately published Foundry opening increment.

## What the player does

The default Kestrel/Hitch starter work and selectable Pelican work now lead through three authored Helios work sites rather than repeating indistinct objectives. These are optional board jobs on the normal opening route, not a replacement for the campaign, rescue rail or Wasp starter branch.

Pelican's named lane-buoy jobs previously spawned a generic slag-core asteroid on a player-relative ring. New offers instead use the existing authored lane-beacon asset as a real dynamic mission payload. The first loose buoy is near the starting lane; the second is heavier and drifting by the claim rim; the third is heavier again at the outer yard. The three authored local positions are (310,-35), (1000,30), and (-1560,-1100), converted through the existing sector coordinate owner. Their explicit simulation masses are 40, 65 and 90. Existing physical-objective ownership still handles custody, delivery, loss and payment.

Hitch's three jobs now point to successive actual iron-bearing work faces. The hints exclude nearer ice/crystal rocks and use current ore-table data. The player is not locked to a particular rock: any required iron they cut in Helios counts, including another suitable face if the marked site is depleted. NPC, unknown-miner and foreign-sector receipts cannot complete these newly versioned player jobs. Old saved offers and unrelated contracts retain their previous policy.

This creates a small outward work route with changing handling demands using existing models and mechanics. It does not claim to finish every first-frame interaction or the entire starting district.

## Persistence is part of the piece

The new body is a payload, so treating it like the prior asteroid or a generic living ship would lose its identity across capture/restoration. This increment repairs the narrow chain for these version-one starter buoys:

- The mission owner reacquires the exact payload through the existing job-interactable index instead of spawning another target.
- The world's ordinary durable-capture entry includes only strictly identified starter buoys in addition to its existing living-actor scan.
- Durable-marker admission and record normalization preserve only the known job/step/mission identity, not arbitrary saved spawn specifications.
- Reconstruction uses the known buoy model/body and restores the actual saved position, velocity, angular motion, damage and record identity rather than resetting the buoy to its original site.
- Corrupt versions, steps, roles, unrelated types/kinds/sectors and destroyed records cannot impersonate this body. Generic payload capture policy is unchanged.

No new money, cargo or reward writer was introduced. Existing settlement cleanup remains responsible for retiring completed mission targets and records.

## Evidence and limits

Thirteen focused checks pass and all eight changed source modules pass syntax checks. Root and an independent reviewer reran the focused suite. Tests execute current production owner functions for the board, physical spawn/count, mining receipts, loss, adoption, world capture, record normalization and reconstruction. A composed ready-index/fallback capture roundtrip preserves a moved, damaged buoy, then binds and adopts it without an extra entity or reward event. The production physics resolver confirms the explicit masses and dynamic/CCD configuration.

Review found and fixed a missing production import that isolated injected ports initially hid. Positive tests now read current production source paths; only two genuine negative-control baseline snapshots ship. Unchanged dependencies staged locally for sparse-source testing are not publication files.

These are composed source-owner tests, not a full browser boot, rendered asset-decoding verdict, native towing playthrough or whole-save-system Continue test. Actual kill/cleanup-to-record integration and broader intersector handling are not newly qualified by these checks. Those limits remain visible rather than turning the packet into a claim of a finished opening.

The new test is independently reachable through the existing static-check aggregate. The preload change adds the new helper without removing any prior hint. Full canonical dependency-closure verification remains a hosted-CI question for this sparse local environment; no gate is relaxed.

## Next outward pass

Keep creating the experience from the opening outward: connect what the player sees before accepting work, the routes to Kessler and the first mission destinations, and the ordinary activity and consequences along those routes. Reuse the model owners' existing pieces. SF-WORLD-DIRECTION, SF-SECTOR-COHERENCE, SF-LIVING-WORLD and SF-GAME remain open.


## Current integration: actual native recovery and full Continue

The source-composed thirteen-case claim above was historical branch evidence, not a new integration run. Current composition preserves accepted Adventure world records, physical provenance and foreign mission work; no furnace/Cinder/compost/Helios-claim increment is included.

A real production-runtime check reproduced an opening blocker: radius10 buoys require LineT1 under the ordinary throw-class rule, so the bare-line Pelican could not begin its first recovery. The repair uses the existing recovery exception for only the exact active versioned Pelican contract's original buoy. Missions registers its current occupant generation at actual spawn/adoption. Failed, generic, foreign, unregistered and recycled bodies keep ordinary tier policy; the equipped Pelican winch remains required. There is no global tier change or radius/mass/force adjustment and no new save field/writer.

All authored40/65/90 native masses now sustain ordinary winching, with measured acceleration toward the pilot4.612/2.309/2.646WU/s in the fixed-seed fixture. A canonical attachment/physics-owner break is injected for each; the same original body can be caught again at a bare LineT0. This is a failure-path injection, not a claim that a natural overload occurred.

The90 case additionally keeps4.505WU of real motion, hull200.45 damage, position/velocity/angular state and stable world record through full Save/Continue. One payload remains, mission adoption and real line reacquisition bind that original, and no reward occurs. Actual packaged-prop and prewarm owners admit the existing lane-beacon body. That is source/native admission, not a decoded live picture or browser route.

The focused fixture ports were updated for current imported field-rock/capture owners and CRLF source. The original ten unaffected checks and the three repaired checks pass at their exact current boundaries. The separate negative control refuses generic, failed, foreign, missing-winch and recycled occupants. Reproduction: `npm run check:starter-workday` and `npm run check:starter-workday-native` after integration. Player-route, rendered readability, docking delivery and campaign completion remain separate root integration checks.
