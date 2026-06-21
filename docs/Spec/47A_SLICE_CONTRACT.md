# 47-A Slice Contract

Source of truth: `docs/Spec/MASTER_MAKEOVER_PLAN.md`. This file freezes the first resident
contract for the gold vertical slice so implementation, agent review, replay, and telemetry work
against one measurable target instead of a loose feature wish list.

## North Star

47-A: The Mass Discrepancy is a 10-12 minute playable encounter in a shattered freight lane. The
player recovers a sealed evidence spindle whose manifest mass and physical inertia disagree. The
Massline tether turns that story fact into the core combat verb: lock, attach, reel, pay out, brake,
cut, re-anchor, counterpulse, tow, and sling.

## Beat Sheet

| Time | Beat | Proof |
|---|---|---|
| 0:00-0:15 | Drop into wreck field; spindle signal pulses | First steering input within 5s; no exposition wall |
| 0:15-1:15 | Attach and stabilize spindle; mass overloads spool | Tether attach within 60s; tension is readable |
| 1:15-2:45 | Two scavengers arrive, one harasses and one steals | First hostile shot within 90s; basic counter-tether |
| 2:45-4:30 | Debris can be swung, shielded, and released | Momentum weapon tactic works |
| 4:30-6:30 | Recovery tug and escorts demand surrender | Faction pressure, subsystem targets, squad roles |
| 6:30-8:30 | Evidence destabilizes fractured carrier section | Spatial hazard and camera composition hold |
| 8:30-10:00 | Civilian pod competes with evidence priority | Narrative choice is physical, not menu-only |
| 10:00-12:00 | Escape, surrender, destroy, or deliver | Immediate world fact changes and replay branch evidence |

## Proof Metrics

- First meaningful steering input within 5s.
- First tether attachment within 60s.
- First hostile shot within 90s.
- No uninterrupted tutorial text exceeds two short lines.
- At least 3 scripted policies complete the encounter.
- At least 2 enemy counter-tether behaviors occur across the seed suite.
- Every branch changes at least 1 immediate world fact.
- Death-to-retry under 6s.
- Same seed + input tape reproduce the same authoritative state hash.
- Baseline holds 60 Hz sim and declared frame budget at p95.
- Every hero asset passes its DoD.
- Every critical beat has audio, VFX, camera, UI, and accessibility evidence.

## Current Phase 0 Resident Commitments

- Remove authoritative `Math.random` from story, traffic, and intervention paths.
- Reverse combat camera zoom-out into threat/tether composition.
- Surface the starter Pulse Laser S in HUD/onboarding/loadout language.
- Replace mining-first onboarding copy with 47-A cold-open intent.
- Maintain `test/47a.inputs.json` and `test/47a.telemetry.expected.json` as the first golden evidence handles.
- Record deterministic runtime events through `src/core/eventTrace.js`.

## Guardrails

No temporary physics, mission, UI, or asset formats. No bulk content without schemas, validators, and
canon. No feature expansion before this slice is shippable. Every merge must name the slice metric it
improves and must pass the evidence gate that claims to cover it.
