# Ceres borrowed-anchor swing

Status: implemented bounded increment, not route accepted. EC-S02 remains incomplete.
Parent: PR #945, `7998335b8774d1395f099bd854ed1e61f9d5a4e7`.

## What the player can do

At Second Measure, take the original Long Plate on the ordinary player Line after it is free.
Old Hob offers three fixed worksite winches: Mouth, Apron and Cradle. Borrow one with a clear
rope path and the load inside its 480-WU span. Keep the player Line attached and fly sideways to
build a physical swing. The existing Prompt Deck provides reel in, hold, pay out, change anchor
and cast off. Its compact page leaves flight controls available and keeps a way back to the drum.

Switching anchors uses the existing atomic attachment rebind. It does not snap, accelerate,
lighten or respawn the load. Cast-off removes only the borrowed constraint and preserves
instantaneous motion. The original 1,800-tonne plate, original cradle and existing receiver
conditions remain authoritative. A weak player Line can still fail on this load.

The existing extraction-mast asset supplies each fixed winch's visible body and measured skin.
Its normal packaged-prop fit is reflected in the collision proxy. The existing resident NPC
cable pool displays the borrowed constraint between its real endpoints, including slack/load
and accessibility behavior. There are no new models or alternate physics/render owners.

The feature prepares the player for the commission's later Ninth Mouth work. It does not add
Ninth Mouth geography, Dessa, a stranded barge, a bell-shift complication, or a new mission.

## Custody and recovery

- The finite Long Plate stays under asteroidSites ownership. Winches use the ordinary generic
  persistent entity codec; the NPC-jobs owner saves only bounded command/history state.
- Each mast waits for an empty conservative hull/proxy envelope before admission. A blocked
  spot retries; an admitted mast that is destroyed never remints.
- A borrowed rope coexists with the player's standard Line. Other claims block borrowing;
  a later conflicting claim releases only the borrowed rope.
- Offers carry player/load IDs and occupant lives. Duplicate, stale and disabled intents are
  revalidated in the simulation. A player-incarnation change stops powered operation and
  publishes fresh controls.
- Leaving attendance, docking, sector departure and Continue hold the drum. Continue does not
  resume a previously powered command. Deferred world-site restore rebinds only the original
  plate and the saved mast incarnation, with exact rest length and no motion correction.
- Old Hob records observed angular travel only while the real borrowed rope is near taut.
  Anchor-board text follows the existing physical receiver's secured state, never substitutes
  for it. Three-anchor and long-swing text require the corresponding observed history.

## Repeatable evidence

Targeted tests:

```sh
node --test test/ceres-anchor-winching.test.mjs \
  test/ceres-anchor-winching-save.test.mjs \
  test/ceres-anchor-winching-continuity.test.mjs \
  test/ceres-anchor-cable.test.mjs
```

- 28 new assertions/tests pass: native borrow/reel/hold/cast-off and atomic transfer; lifetime,
  duplicate intent and admission/no-remint negatives; mounted Prompt Deck keyboard; persistence
  validation; full-envelope native continuity; cable geometry/lifecycle and ordinary-clamp
  exclusion. The mounted DOM and Three.js geometry checks are not browser screenshots.
- 133 existing Ceres neighbor tests pass, including player winching, terminal recovery,
  attachment saves, articulation, earned interventions, wages, shipbreak consequence, receiver
  handoff and cradle admission.
- 22 existing cable/surface tests pass. Save-schema and player-facing-label checks pass. Native
  v3 47-A uninterrupted/reload comparison passes with identical final hashes.
- The final frozen fast tier passes 39/39 under the default 120-second per-entry budget.
  An earlier pre-final-change run reported 38/39 with a sector-membership traversal timeout;
  that same entry passes in the final run. Three broader domain-differ lifecycle tests fail
  identically on unchanged parent and candidate at initial projected-domain parity. They are
  not repaired by this feature; the overall broad suite is not represented as green.

The production-runtime continuity test explicitly stages Class IV (80,000 logged tonnes) and
the original player-retained plate at the apron. Thereafter it uses raw F/W/A/D plus offered
winch actions, without pose, velocity, mass or class writes to produce movement. In 30 simulated
seconds the original travels 427.75 WU and accumulates 1.52017 radians of observed anchor-0
sweep. The fixed anchor is unchanged and the player Line remains live. Transfer to anchor 1
retains the same attachment ID and exact instantaneous motion. A full production save envelope
restores both lines, 367.78290716574617-WU anchor rest length, and exact position, orientation,
linear velocity and angular velocity. Cast-off after ordinary post-load ticks preserves motion.

This is staged mechanical and Continue evidence, not earned Class-IV progression, three complete
swings, receiver delivery, or the uninterrupted authored mouth-to-cradle route. Class I did not
sustain the longer raw-thrust swing; its player Line failed, and that limitation is retained.

## Review and acceptance limits

Independent review found and reproduced an occupant-life offer-refresh defect. It was fixed;
fresh controls and powered-command hold now pass. The production differ/mirror/prompt contract,
safe mast admission and no-remint checks pass. Final cable admission uses the existing pool,
not a separate visual implementation.

Browser launch was blocked before any page loaded by the environment's socket restriction.
There is no rendered screenshot, real browser pointer/touch/gamepad check, full New Game route,
camera/composition acceptance or measured rendered performance in this increment. No denied
browser action was retried. EC-S02 stays draft and the next acceptance work is the actual
mouth/apron/cradle flight and its presentation, followed by the still-unimplemented Ninth Mouth.

The event-surface generator also reports unrelated parent drift. Only the generated new Ceres
action and its provenance counts are included; unrelated event entries are preserved. This is
not a claim that the entire generated surface is clean.
