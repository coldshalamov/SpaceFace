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

## Implementation status

Built on `plans/combat-convergence-2026-10-25` (draft PR #605). Everything below is wired on the default route; tests are `node --test test/<name>.test.mjs`.

**Shipped**

- **One target-truth projection** — `src/combat/targetTruth.js` returns `{cursorAimPoint, selectedId, effectiveGunTargetId, reason, manualAimAuthoritative}` (+ `divergent`, `leadTargetId`, `lastKnown`, `selectedStatus`) by *reading* `state.player.targetId`, the tether and `resolvePlayerGunTarget()`. Reasons: `line-target` (a hostile on the Massline owns the guns at any assist strength, so the cursor is not authoritative), `assist` (aim correction onto the selected hostile), `selection` (a selected hostile that nothing corrects aim onto: assist off or the free-aim kill switch — an information focus never enables correction or fire), `free-aim`. Saved assist strengths are untouched (`light`/`standard`/`full`/`off` read through `targetAssistScale`).
- **Identity and sensor truth** — `src/combat/targetIdentity.js` binds the selection to its occupant token (`perception.targetIdentityGeneration`, the token weapons already match missile locks against). A recycled id retires the bracket, the panel, the sigil and the assist (free aim); a deliberate re-pick re-binds (the `player.targetId` lane writer in `simLaneCommands.js` calls `bindSelection`). A cloak-hidden hull (`cloak.cloakHidesEntityFrom`, the single gate) gets no bracket, panel, rings, sigil or assist — only a last-known mark that expires on the sim clock (4 s, frozen by pause, global XZ so a rebase moves nothing). An irreversibly dying wreck (packet 08 lifecycle) gets no bracket. `lockedHostileEntity` (the resolver's selection branch) applies both gates, so every gunnery consumer agrees.
- **Presentation through the existing frame** — `hud.js`: lock bracket, health rings and the target panel follow the identity/sensor-true selection; the **lead pip rides the hull the guns address** and, for the line, uses the fire path's own constrained solve at the fire path's own speed (`lineLeadSolution`; mixed batteries tested); a small **LINE TARGET** tag (mark + words, token colours, static) sits under the effective hull only when it differs from the selection; a BLOCKED denial strikes the pip through and suffixes the tag. `targetContour` (world sigil subject) and `targetPanel.engagedContactReadout` now read the same projection instead of the weapons-written `gunTargetId` mirror (the panel row reads `LINE TARGET ▸ name`).
- **Acquisition** — `src/combat/targetAcquisition.js` (pure): cursor-edge proximity (aim ray with no cursor) + the existing 0.25 range weight, a rear gate (never auto-acquires a contact >100° off the intent direction unless the cursor is on it; a held lock that drifts behind stays held), entry/exit radii, challenger margin, sim-clock dwell that restarts when the challenger changes, id tie-breaks, occupant tokens, camera-zoom-scaled prototype thresholds. `uiRoot.targetNearestHostileToPlayer` uses it for acquisition; a deliberate press with nothing forward still gets the nearest hostile. `classifyPickIntent` + the RMB hover hint now say what a press commits to (`RMB lock target` / `RMB select` / `RMB inspect`).
- **Living contacts** — `src/combat/contactClassifier.js` (pure): independent dimensions (physical class, relation, lifecycle via `combat/lifecycle.js`, awareness from existing AI facts with an `awarenessOf` seam for packet 04, attack posture, selected, observed, living). A living, observed, unselected hull too small on screen to read by silhouette (<18 px radius) gets one mark in the radar's own IFF shapes (triangle hostile / diamond friendly / square neutral; dashed when down, filled core when it has the player in its sights); wrecks, rocks and cargo never do. Status chips are exploit-gated (`ARC READY` only when a fitted attack's compiled spec chains off Ionized, clock from the sim's `expiresTick`). One denial vocabulary (`unobserved`, `out-of-range`, `blocked`, `no-lock`, `protected-cargo`, `too-large`) with a fixable order; `gunLineDenial` answers BLOCKED from the real line-of-sight witness and the shield-pylon intercept (the owner's own wall never blocks the owner).
- **Telegraph hierarchy** — footprint == query: `src/combat/telegraphFootprint.js` holds the Brood's query conventions and both the sim queries (`swarmBrood.js`, numerically identical) and the drawn footprints (`broodPresentation.js`, via the engine's published `view.victimRadius`) call it: the spitter marker closes onto the real splash radius, acid pools stay at their hit radius, a committed charger draws the lane its dash will sweep. Priority: `src/presentation/telegraphPriority.js` ranks tells by consequence then time-to-contact; the 32-slot action pool admits a telegraph by displacing the lowest-ranked plain answer instead of refusing it and never evicts a tell at or above the newcomer's rank; a doctrine telegraph cue carries an explicit admission priority so it outlives an ordinary explosion in the shared pools.

**Tests** — `target-truth-projection` (18: crossing/tether/neutral/rock/free-aim/death/recycled/lane re-bind/cloak lose+reacquire/last-known expiry/rebase/pause/dying), `target-truth-presentation` (6: contour, panel row, pip solve, mixed battery, hidden/recycled), `target-acquisition` (12: crossing hysteresis, dwell, rear gate, entry/exit, tie-break, zoom, recycled, pause), `target-acquisition-live` (7), `contact-classifier` (8), `gun-line-denial` (2, real pylon + physics harness), `telegraph-footprint` (5, real Brood engine at the drawn rim), `telegraph-priority` (6, incl. a full `ActionVfx` pool). Updated: `target-lock-cursor-pick` (the "nearest hostile with no cursor" case now pins the rear gate), `selection-sigil` (the engaged hull is a tethered hostile), `swarm-brood-families` (7 objects: the lane mesh). UI: `node scripts/ui-bench.mjs --shot=flight-line-target | flight-line-blocked | flight-contacts` mount the real `createHud` (still-frame composition evidence, opened and read).

**Honestly still open**

- **Soft retargeting of an auto lock is built and tested in the picker but deliberately not wired.** SF-2b #8 and `target-lock-cursor-pick` pin "only Tab, a click or losing the lock changes a held lock"; the packet's hover hysteresis/dwell applies to a *soft* lock, which the code cannot tell from a Tab/click lock without a provenance flag. Wiring it is one hunk in `targetNearestHostileToPlayer`'s sticky branch (`stepAcquisition` with the held id as incumbent), and it flips that pinned contract — it needs the owner's call, not another test.
- Footprint == query is done for the Brood (spitter, pool, charger). Not audited: capital-boss telegraphs, mine layers, the ambient predation tells, and the shield-panel/obstacle clipping of drawn footprints.
- No "group low-priority pack intent" and no offscreen-threat labelling pass (`threatHalo`). The camera/contrast chain (08) is untouched.
- Touch/gamepad acquire/cycle/release parity and the G/Backspace binding audit were not done; no binding was added or moved.
- The living-contact mark is evidenced by a bench still over a stand-in camera; the live-route read at the real gameplay camera (hull pixel size, 8-mark pool saturation in a swarm) has not been measured. Thresholds are prototypes (`ACQUISITION_PROTOTYPE`, `MARK_BELOW_PX`).
- Pre-existing and not caused here: `hud-g-lag`, `hud-contact-roster-*`, `hud-layout` fake-DOM suites fail identically on the parent commit; the 47a sim goldens (`sim`, `sim-v3`) are red on this branch since the master merge (same actual hash before and after these changes); `check:impulse:authority`, `check-ui-budgets` (stale baseline digest + flight DOM debt), `check-colour-tokens` (station.css).
