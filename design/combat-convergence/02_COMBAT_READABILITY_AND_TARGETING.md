# 02 — Combat readability, living contacts, and targeting

**Outcome:** the player knows what is alive, what is dangerous, what they are aiming at, and why a shot or power will behave as shown. Preserve personal piloting and enjoyable mouse aim. Planning only. Relevant evidence: E07, E10, E11. Coordinate with 01, 03, 04, 08, and 09.

## Separate the questions the picture must answer

A contact has independent dimensions: physical class, faction/relation, living/disabled/dying/wreck lifecycle, awareness, attack intent, and player selection. Do not compress all of them into a single red outline. A neutral worker can be alive and alert without being hostile. A wreck can be useful without being alive. A cloaked enemy can exist in simulation without being available to the player's sensors.

At normal camera scale, a known hostile should read as a ship before the player reads its name. Use coherent hull silhouette, visible facing, operational engine/nozzle cues, restrained faction accent, and meaningful motion. Add a minimal contact mark when needed. The selected target receives detailed state; distant ambient workers do not need full health bars and status stacks.

Living information is useful only when it explains a decision. Show a miner cutting, an escort screening, a guard investigating, or a fighter charging. Do not decorate every model with unrelated symbols. For inanimate objects, make useful physical or interaction classes identifiable on focus or tool preview rather than illuminating all scenery constantly.

## Resolve target identity once

At the audited revision, `state.player.targetId`, `state.player.tether.targetId`, and `resolvePlayerGunTarget()` have distinct meanings. A tethered hostile can own the gun solution. Reuse that authoritative resolver and examine every consumer: weapons, lead pip, missile lock, focus frame, power preview, and selected-target readout. Do not create a competing combatTarget variable.

Present three concepts only when they differ: the cursor/aim point, the selected contact, and the effective weapon target. The tethered body keeps its own physical attachment cue. If the gun target differs from selection, indicate why—for example, a small LINE TARGET annotation—rather than drawing a confident bracket around the wrong hull.

An information focus must not silently enable aim correction or firing. In explicit manual mode, the cursor's ballistic aim remains authoritative. In assisted mode, show the corrected solution and allow immediate deliberate override. Preserve the existing controller and saved assist strengths unless a tested migration is intentionally approved. A player should never wonder whether moving the mouse still matters.

## Acquisition without target thrash

Use the existing selection/input seams for acquire, cycle, and release. Select a visible eligible contact near explicit cursor intent; do not substitute the nearest hostile behind the player. Resolve candidates by screen-space proximity and relevance with stable ties. Distinguish an interactable prop from an attack target before the input commits.

An explicit lock is sticky until released, invalidated, or changed deliberately. Soft hover candidates may use entry/exit thresholds and dwell so two crossing ships do not alternate every frame. Prototype hysteresis and dwell values must be tested at actual camera scale and motion, not copied as universal constants.

Invalidate stale identity using the current entity-generation/lifetime contract, not numeric ID alone. On death or unload, retire the old bracket and keep free aim rather than jumping to an unrelated hull. Reacquisition after concealment follows sensor truth. No wallhack bracket on an unseen target; a last-known position is visibly uncertain and expires.

Map actions only after the binding audit. The current G combat stick and Backspace release behavior are existing meanings to reconcile, not keys to repurpose casually. A gamepad or touch route must offer comparable intent without turning the PC route into auto-aim-only play.

## The target's useful information

The selected living hostile can expose name/role, range, shield/armor/hull, one current attack commitment, and a small set of relevant statuses. Status duration and interaction readiness come from simulation. Suppress duplicate status labels and unrelated trivia. An ionized enemy should not display ARC READY unless the fitted attack can actually exploit it.

Show the important denial at the point of intent: out of range, blocked, no lock, invalid arc, insufficient charge, protected cargo, too large, or unobserved target. Prediction is not confirmation. A preview can change as targets move; confirmed hit, blocked impact, shield break, and subsystem disable must come from accepted simulation events.

Use shape as well as color for shield/armor/hull and awareness. Current UI conventions and ORRERY tokens win over a new visual kit. Reduced-motion and reduced-flash modes preserve geometry, state transitions, and text. Optional damage numbers must not be the only way to notice a successful hit.

## Telegraphs and attention hierarchy

An important attack has a readable preparation, commitment, effect, and recovery. Its telegraph footprint matches the damage/force query, including obstacles and shield panels. Enemy aim may track during preparation, then visibly commit; do not imply a dodgeable fixed line while the actual beam continues tracking instantly.

Prioritize by consequence and time-to-contact: an imminent ram or disabling lance outranks a distant ordinary shot. A telegraph already shown cannot be deleted merely because an explosion requested the last VFX slot. Group low-priority pack intent where possible, while keeping individual dangerous emitters identifiable. The threat schedule in 03 should help ensure there is enough attention to read what is displayed.

A selected target, dangerous unselected attacker, and player-controlled projectile need separate salience. A launched Gyre mass should remain trackable through its initial impact without eclipsing the player ship or next incoming threat. Offscreen cues should indicate actual threats, not label every simulated enemy.

## Camera and contrast contract

Do not fix targeting by zooming unpredictably or constantly rotating/reframing the camera. Measure projected target size, relative screen speed, reticle lag, lead-pip stability, and occlusion at the existing gameplay camera. Where a camera behavior steals control or hides the target, reproduce and repair that behavior through its existing owner.

Dark atmosphere remains allowed. Known relevant subjects must separate from the background through illumination, silhouette, and restrained focus cues. Address the full contrast chain with 08; a permanent thick outline around everything is not the default solution.

## Deliverables and proof

Deliver a target-source audit, current-player-intent state diagram, integrated existing target/lead/lock presentation, contextual living/contact information, and scene-level threat hierarchy. No new independent HUD framework or omniscient selection database.

Test crossing targets, a hostile on the tether while another is selected, a neutral or rock on the tether, free aim beside a locked target, mixed weapon projectile speeds, line-of-sight obstruction, shield interception, target death, recycled IDs, cloak loss/reacquisition, rebasing, and pausing while a button is held.

Player proof: in a moving fight, ask the tester which hull their guns will address, which opponent will attack next, which body is incapacitated, and which object can be thrown. Compare answers to recorded simulation truth. Also ask them to deliberately miss the locked target in manual mode: the shot must obey their aim. Fail the packet if clarity improves only in a still image or diagnostic zoom.
