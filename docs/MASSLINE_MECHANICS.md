# Massline Mechanics

This document is the current mechanics map for the SpaceFace Massline ladder. It describes the runtime contract checked by `npm run check:massline`.

## Runtime Contract

- The sim runs at 60 Hz. Massline state is deterministic sim state, not wall-clock or render timing.
- The combat action layer owns attach, reel, sling, cut, and impulse-charge verbs. The physics layer owns dynamic body motion and Massline rope authority.
- `src/combat/attachments.js` maintains the semantic attachment and feeds the Massline controller in `src/core/constraints/masslineController.js`.
- `src/systems/tetherGameplay.js`, `src/systems/masslineTelemetry.js`, `src/systems/masslineThreats.js`, and `src/systems/masslineImpacts.js` expose player-readable Massline state without taking over combat ownership.
- Render/VFX/UI read Massline outputs. They do not author sim outcomes.

## Player Readouts

- `tether.load` is the presentation load signal. It is separate from physical break strain and lets VFX/audio/UI read tension before the rope is near failure.
- Snap-catch detects a meaningful sudden load and records it as a player-facing event instead of a silent physics surprise.
- Reel-pump detects useful reel timing and emits `tether:reelPump` for feedback.
- Arc preview data predicts a readable sling path from current Massline telemetry. The visual renderer consumes this data but does not compute the mechanic.

## Targeting And Threat

- Massline auto-target mode ranks candidates with `src/combat/masslineTargetScoring.js`.
- Auto-targeting includes physical anchors such as asteroids and payloads, not only enemies.
- Threat events from `masslineThreats` describe readable danger around the line, payload, and current encounter.
- Feedback checks verify those events reach the presentation layer without adding hidden gameplay side effects.

## Whip And Impact

- Whip impact is detected by `masslineImpacts` when a latched or recently slung mass contacts a valid solid victim at meaningful speed.
- The observer writes `state.player.masslineImpacts` and emits `tether:whipImpact`.
- Damage and presentation consume the emitted event. The observer itself does not write health, cargo, credits, or reputation.

## Impulse Charge And Bulk-Haul

- Impulse charge authority remains in `src/systems/impulseCharges.js`; Massline combo checks verify that impulse verbs can work with active Massline state without bypassing the action/physics ports.
- Mining bulk haul is a guidance/readout layer. Oversized chunks and current-sector refinery hints are checked without changing cargo ownership or mining ownership.

## 47-A Proof Surface

Contract 47-A is the live slice that proves the Massline is more than an isolated mechanic:

- `check:47a:spindle` proves the evidence spindle keeps its false mass, manifest mass, dynamic body, and Massline attachment.
- `check:47a:scavenger-threat` proves the scavenger beat creates timed hostile fire, projectile hits, and combat damage.
- `check:47a:debris-sling` proves the debris beat is reached and `action_sling` routes through SG-02 `physics.impulse`.
- `check:47a:recovery-contested` proves the official recovery tug activates during its beat with tug/disable/counter-tether capabilities.
- `check:47a:civilian-priority` proves the civilian pod is a distinct priority target, not cargo.
- `check:47a:physical-branches` proves all four resolution branches mutate authored world facts through the scenario branch helper.

## Aggregate Gate

`npm run check:massline` runs the Massline telemetry, release, load, snap-catch, reel-pump, target scoring, auto-target, threat, arc, whip, impulse, mining bulk-haul, and 47-A child checks. It also asserts that this document exists and names the core mechanics above.
