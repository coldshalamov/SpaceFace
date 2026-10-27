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
