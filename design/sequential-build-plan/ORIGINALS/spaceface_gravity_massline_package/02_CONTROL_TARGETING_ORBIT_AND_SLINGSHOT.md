# Control, Targeting, Orbit Assist, and Slingshot Design

## 1. Why this is the foundational feature

The massline is not failing primarily because the rope physics lacks possibilities. It is failing because the game does not reliably answer three questions:

1. What does the player intend to tether?
2. What maneuver does the player intend after tethering?
3. How much precision should the computer supply without taking the maneuver away?

Raw control asks too much of the player's hands:

- Aim a trackpad cursor at a fast or large target.
- Press the tether key.
- Continue holding thrust.
- Hold left or right to establish the orbit.
- Boost.
- Manage reel distance.
- Aim or select a destination.
- Release at a narrow angular window.
- Immediately resume cursor combat.

That is not a reasonable baseline on a trackpad. A joystick might make it possible, but the shipping control system must work with keyboard and trackpad.

The target solution is not stronger automation in general. It is a **hierarchy of intent inference, previews, and bounded assists**.

## 2. The target-acquisition problem

A simple “closest target” rule is insufficient:

- A small enemy may be closer than the planet the player is clearly turning toward.
- A cursor may be resting over an irrelevant object while the player is using keyboard flight.
- A towable object may need precise cursor selection even when a large anchor is nearby.
- During a high-speed flyby, the most relevant enemy may only be targetable for a fraction of a second.
- A slingshot route needs to favor the next route anchor over unrelated bodies.

A simple cursor ray is also insufficient:

- Trackpad aim becomes difficult during simultaneous flight input.
- A large visual body may have only a small logical target region.
- The player may be deliberately using directional input rather than cursor input.

The selector therefore needs to combine several weak signals rather than trusting one absolute signal.

## 3. Candidate taxonomy

Each tetherable candidate should be classified before scoring.

### 3.1 Massive anchor

Examples:

- Planet.
- Moon.
- Station.
- Large wreck section.
- Massive asteroid.
- Artificial mass anchor.
- Black-hole tether node, if fiction permits.

Likely intentions:

- Orbit.
- Self-sling.
- Stabilize position.
- Atmosphere skim.
- Route traversal.

### 3.2 Combat body

Examples:

- Hostile ship.
- Hostile drone.
- Disabled enemy.
- Boss component.

Likely intentions:

- Tether-lock fire.
- Orbit attack.
- Drag.
- Tumble.
- Throw.
- Net or bridle combination.

### 3.3 Towable body

Examples:

- Cargo pod.
- Wreck fragment.
- Meteorite.
- Construction component.
- Salvage module.
- Friendly disabled ship.

Likely intentions:

- Tow.
- Deliver.
- Catch.
- Throw.
- Frame-match.

### 3.4 Route anchor

A route anchor is any massive anchor currently selected by an authored or player-defined slingshot route. Route status does not replace the underlying category; it adds strong context.

### 3.5 Field deployable

Examples:

- Mass Seed.
- Repulsor Seed.
- Temporary acceleration node.

Likely intentions:

- Create an anchor.
- Group enemies.
- Launch or escape.
- Alter a route.

## 4. Input-intent signals

The target scorer should read a short history, not merely the current frame. Recommended window: roughly 150–250 ms, tuned through playtesting.

### 4.1 Cursor precision

Measure the cursor's surface miss from the candidate:


aimMiss = distance(cursorWorld, candidateCenter) - candidateRadius

Convert this into a score. A candidate directly under the cursor receives a very large bonus. A candidate near but not under the cursor receives a smaller soft-target bonus.

The soft radius should be dynamic:

- Cursor stationary and close to a target: shrink the radius, treating the cursor as deliberate precision.
- Cursor moving quickly or no recent pointer input: enlarge the radius modestly, treating it as broad intent.
- Large bodies: use visible projected extent or authored target surfaces, not an arbitrary tiny center sphere.

This implements the useful intuition: precise pointer aim should override broader assistance, but an idle cursor should not veto clear keyboard intent.

### 4.2 Turn-direction alignment

If the player is turning right, compute how strongly each candidate lies in the right-side acquisition lobe. A candidate on the right should gain preference; one far to the left should lose preference.

Use the ship's local frame:

- Forward vector `f`.
- Right vector `r`.
- Unit direction to candidate `d`.

Right-side alignment:

rightAlignment = dot(d, r)

If right input is held, map positive values to a bonus. If left is held, invert the sign.

This should be a preference, not a hard exclusion. A precisely cursor-selected object on the opposite side should still win.

### 4.3 Forward-trajectory relevance

A candidate should gain score if the current velocity or nose direction will pass near it soon.

Useful quantities:

- Time to closest approach.
- Closest-approach distance.
- Whether the object is ahead or behind.
- Whether the player is closing or separating.

This is critical for flyby tethering. A ship that will pass within 100 world units in 0.5 seconds is more relevant than a stationary ship at the same current distance but moving away.

### 4.4 Distance

Closer bodies receive a moderate preference. Distance must never dominate a strong cursor selection or route anchor.

Use surface distance, not center distance:

surfaceDistance = max(0, centerDistance - candidateRadius)

This prevents a giant planet from appearing falsely distant because its center is far away.

### 4.5 Relative mass and intended context

Relative mass provides a strong clue:

- Candidate mass far greater than player: likely anchor.
- Similar or lower mass and hostile: likely combat tether.
- Low mass and neutral: likely towable payload.

When the player is holding a side-turn and forward thrust near a huge body, anchor intent should gain a large bonus. There is almost no plausible reason to tether a planet and deliberately thrust radially into empty space away from the intended orbit.

### 4.6 Current route

If a slingshot route is active, the next valid route anchor receives a major score bonus. It must still be within a reasonable acquisition cone or cursor neighborhood; routes should assist, not tether across the sector.

### 4.7 Combat focus

A hostile target gains preference when:

- It is the selected combat target.
- It is near the center of the camera during flyby focus.
- It recently fired at the player.
- It is the nearest hostile on the player's current passage.
- It is already highlighted by target cycling.

### 4.8 Recent candidate memory

Once a candidate is highlighted, apply hysteresis. Do not switch candidates every frame because two scores are close.

Recommended rules:

- Current candidate retains a stability bonus.
- A new candidate must beat it by a margin.
- A precise cursor hit may override immediately.
- A candidate leaving the valid cone or range is dropped.
- A short grace period survives temporary occlusion or pointer jitter.

## 5. Example scoring model

The implementation does not need to use exactly this equation, but it needs a model of this form:

```text
score(candidate) =
    Wcursor   * cursorScore
  + Wturn     * turnAlignment
  + Wapproach * approachScore
  + Wdistance * distanceScore
  + Wmass     * massContextScore
  + Wroute    * routeScore
  + Wcombat   * combatFocusScore
  + Wmemory   * candidateMemory
  + Wtype     * modeCompatibility
```

Weights change by inferred context.

### Anchor acquisition profile

High weights:

- Turn alignment.
- Surface proximity.
- Route status.
- Relative mass.
- Approach geometry.

Moderate weight:

- Cursor alignment.

### Combat acquisition profile

High weights:

- Cursor alignment.
- Flyby focus.
- Selected target.
- Time to closest approach.

Moderate weights:

- Distance.
- Turn alignment.

### Tow acquisition profile

High weights:

- Precise cursor alignment.
- Existing interaction objective.
- Distance.

Low weight:

- Turn alignment.

This prevents the same scoring rule from making all contexts feel wrong in different ways.

## 6. Player-facing acquisition feedback

Target assistance must not be invisible.

Before the massline fires, show one candidate with:

- A thin bracket or contour.
- A small tether endpoint preview.
- A semantic glyph: anchor, combat, tow, route.
- The projected line from ship to attachment point.
- Optional microcopy only during onboarding: `ANCHOR`, `TOW`, `HOSTILE`.

When several candidates are close, the strongest candidate is highlighted and the runner-up may receive a faint secondary mark. Do not draw ten brackets.

The preview should appear as soon as the score crosses a confidence threshold, not only after the player presses tether. This lets the player steer the selection before committing.

## 7. Recommended input redesign

The massline is central enough to deserve a thumb-accessible action. Space is the strongest candidate, with F preserved as an alias or legacy option.

The recommendation is a **tap/hold massline action with input history**, not a simultaneous D+F chord requirement.

### 7.1 Unattached

- Press Massline: immediately latch the currently previewed candidate if confidence is sufficient.
- Hold Massline: latch and enter temporary line-control mode.
- No valid candidate: display a brief dry-fire or acquisition sweep; do not attach to a random object behind the player.

### 7.2 Attached

- Quick tap Massline: cut.
- Hold Massline beyond a short threshold: enter line-control mode; releasing the button does not cut.
- The threshold must be forgiving and visually signaled.

### 7.3 Line-control mode

While the Massline modifier is held:

- Up / forward: reel in.
- Down / reverse: pay out line.
- Left / right: choose or reinforce orbit direction.
- Shift: boost / orbit pump.
- Cursor: select throw or release destination when relevant.

After releasing the modifier, ordinary flight controls resume while the line remains attached.

This is one recommended mapping, not an immutable law. The important contract is that line extension, retraction, and orbit direction must become accessible without adding separate obscure keys.

### 7.4 Input-history tolerance

The game should treat side input within a short window before or after latch as intended orbit direction.

Example:

- Player holds forward and right.
- Player presses tether 80 ms later.
- Target scorer prefers the right-side massive anchor.
- Orbit assist enters clockwise mode immediately.

The player should not need perfect simultaneity.

## 8. Flyby Focus 2.0

The current concept of flyby focus is correct but must be made mechanically authoritative rather than purely presentational.

### 8.1 Trigger conditions

A valid flyby candidate exists when:

- Relative speed exceeds a threshold.
- Time to closest approach is within a short window.
- Closest-approach distance is within tether opportunity range.
- Candidate is hostile or otherwise interactable.
- Candidate occupies a meaningful screen area or target score.

### 8.2 Effect

When the player begins holding Massline or enters the acquisition window:

- Time scale eases toward perhaps 0.4–0.6 for a bounded interval.
- Camera framing includes player and candidate.
- Candidate receives a large acquisition bonus.
- Tether endpoint preview becomes prominent.
- Audio and motion streaks communicate the opportunity.

Time dilation must ease in and out; it should not abruptly freeze the game.

### 8.3 Failure recovery

If the player misses:

- The focus ends cleanly.
- No target is auto-latched after it has passed outside the valid cone.
- The player remains in control.
- A cooldown prevents repeated strobing.

### 8.4 Acceptance

A normal player should be able to perform a high-speed pass and tether the intended enemy repeatedly without placing the cursor exactly on a small moving model.

## 9. Anchor-relative orbit assist

## 9.1 Problem

With raw steering, the player turns too quickly or too slowly for the current tether radius. The ship then:

- Flies inward and collides with the anchor.
- Rotates away and boosts against the line.
- Loses tangential velocity.
- Oscillates around the constraint edge.
- Feels slower and less controllable than untethered flight.

## 9.2 Player intention

When attached to a much more massive object and holding a side direction, the likely intention is almost always:

> Establish or maintain a clockwise/counterclockwise orbit while building tangential speed.

The assist should recognize that intention and solve the angular coordination.

## 9.3 Reference frame

For player position `p`, anchor position `a`, and relative vector:

```text
r = p - a
rHat = normalize(r)
tHatCW  = perpendicularCW(rHat)
tHatCCW = -tHatCW
```

Relative velocity:

```text
vRel = vPlayer - vAnchor
vRadial = dot(vRel, rHat)
vTangential = dot(vRel, tHatChosen)
```

Tether error:

```text
lengthError = currentDistance - desiredLength
```

## 9.4 Controller goals

The controller should:

1. Align the ship's useful thrust direction toward the selected tangent.
2. Dampen excessive radial velocity.
3. Correct large length error.
4. Preserve player-supplied tangential acceleration.
5. Avoid canceling physics-earned speed.
6. Keep some visible looseness and dynamics.

A bounded correction might use:

```text
radialCorrection = -Kr * lengthError - Kd * vRadial
```

and a facing target based on `tHatChosen`.

The correction must be capped. It is an assist, not an invisible rigid rail.

## 9.5 Activation

Orbit assist engages only when:

- Tether target is classified as a massive anchor.
- Side input is held or an orbit direction was recently selected.
- Tether is meaningfully taut or approaching tautness.
- Player is not explicitly braking or commanding tow behavior.

It disengages when:

- Tether is cut.
- Player commands the opposite orbit direction long enough to reverse.
- Player applies strong manual radial input.
- Target becomes dynamic/towable.
- Player disables assist in settings.

## 9.6 Strength settings

Recommended player-facing options:

- Full assist: strong angular matching and radial damping.
- Standard: recommended default.
- Light: facing help and small radial damping.
- Off: raw physics.

This preserves mastery without making baseline play hostile.

## 10. Reel and pay-out

The current one-way reel is too limiting. Line extension creates several new verbs:

- Adjust orbital radius.
- Manage atmosphere-skimming depth.
- Reduce excessive angular speed.
- Increase throw lever arm.
- Give a towable body more room.
- Escape an inward spiral without cutting.

The line should have:

- Minimum length.
- Maximum length based on spool or upgrade.
- Reel-in rate.
- Pay-out rate.
- Tension and overload.
- Optional elastic compliance by massline type.

Paying out should not instantly create free energy. It changes constraint geometry; any energy effects should emerge from the controller and motion model.

## 11. Sling-release presentation

The player needs an intuitive release language, not an orbital mechanics lecture.

### 11.1 Destination selection

The release destination may come from:

- Current navigation waypoint.
- Next authored route anchor.
- Cursor world point.
- Current combat target for payload throws.

The HUD must show which destination is active.

### 11.2 Release arc

Around the anchor, display a restrained annular ribbon:

- Red: release path misses badly or sends the player toward danger.
- Amber: viable but inefficient.
- Green: predicted path intersects destination gate.
- White-hot or cyan tick: current exact solution moment.

The ribbon may only appear while tethered and a destination exists. Avoid painting every planet with permanent arcade circles.

### 11.3 Screen-edge timing cue

The user's red-to-green screen-edge idea is valuable as a secondary cue. Use a subtle vignette:

- Neutral outside the opportunity window.
- Amber as solution approaches.
- Green at valid release.
- Brief red flash after the window passes.

The world-space release arc remains the authoritative cue; the vignette supports peripheral timing.

### 11.4 Snap and arm modes

Offer two assistance styles:

- **Arm:** hold release/throw input; system cuts on the next valid solution frame.
- **Snap:** player taps within a forgiveness window; system delays or slightly corrects to the solution.

No assist mode should fabricate a solution when the player has not built enough tangential speed or chosen a reachable destination.

## 12. Authored slingshot chains

## 12.1 Player fantasy

The player enters a planetary or anchor sequence, builds speed around one body, releases through a corridor, catches the next body, and crosses a vast region through a chain of increasingly fast momentum transfers.

The camera pulls out with speed. Trails lengthen. The player may pass an enemy installation too quickly for defenders to catch, drop a bomb, intercept cargo, or escape a pursuit.

## 12.2 Route structure

A sling route should use deliberately placed anchors. Random placement will not reliably produce good chains.

Each route node needs:

- Anchor position and effective radius.
- Tether acquisition radius.
- Recommended approach hemisphere.
- Allowed orbit directions.
- Minimum entry speed.
- Recommended line-length band.
- Destination gate toward the next node.
- Recovery gate for missed releases.
- Hazard volumes.
- Camera scale.

## 12.3 Optional versus fixed order

Two route styles are useful:

- Authored order: teaches or supports a cinematic high-speed route.
- Player-planned order: map allows selecting several anchors; solver indicates reachable connections.

Build authored order first. Player-planned routing is a later layer.

## 12.4 Momentum chain

A successful chain should preserve physics-earned speed. It may also maintain a presentation-only chain state:

- `Chain 2`, `Chain 3`, etc.
- Longer trails.
- Stronger camera pullback.
- Increased navigation reward or mission bonus.

Do not add an arbitrary speed multiplier merely because the player hit multiple anchors. The route geometry and sling assistance should create the speed; the chain state communicates mastery.

## 13. Sling-route compiler and validator

This is essential if agents are authoring routes.

A route-design tool should:

1. Load anchor positions, radii, assist limits, ship reference stats, and route order.
2. Sample entry positions, entry velocities, orbit directions, tether lengths, and release phases.
3. Simulate each connection using the same or conservative gameplay model.
4. Report reachable release windows.
5. Estimate player timing tolerance.
6. Reject routes with no robust solution.
7. Generate debug visualizations or JSON diagnostics.

Useful outputs:

```text
Node A -> Node B
reachable: true
entry speed band: 150–260
recommended clockwise: true
valid release arc: 21.4 degrees
standard-assist timing window: 310 ms
miss recovery: Node C outer gate
```

## 13.1 Route acceptance thresholds

A route should not be accepted merely because one mathematically exact solution exists.

Require:

- Multiple valid sampled approaches.
- A release window wide enough for the standard assist.
- No unavoidable collision under ordinary variation.
- A recoverable miss path.
- No dependence on a single frame-perfect boost.
- Normal camera and target acquisition support.

## 14. Moving-body hitchhiking

Fast meteors, cargo tugs, and express liners can serve as moving reference frames.

Recommended sequence:

1. Traffic route is visible and predictable.
2. Candidate gains a hitchhike targeting glyph.
3. Player latches or uses a Frame Coupler.
4. Relative velocity gradually matches.
5. Player rides through the route.
6. The moving body may itself sling around authored anchors.
7. Player cuts at a chosen destination.

This can become a memorable world event: a meteor train sweeps through a sector at intervals, whips around a moon, and exits toward another region.

## 15. Camera and speed presentation

Physics-earned speed needs strong but controlled presentation.

### Camera behavior

- Zoom out as speed exceeds ordinary combat cruise.
- Bias camera ahead of velocity, not only ship facing.
- Frame anchor and player during tether orbit.
- Ease changes; never snap zoom on every speed fluctuation.
- Cap zoom so targets remain readable.

### Speed effects

- Longer engine and field trails.
- Sparse star or dust streaks aligned with velocity.
- Tether vibration and emissive intensity tied to load.
- Subtle FOV or orthographic-scale punch on release.
- Audio low-pass and Doppler-like pitch treatment, if quality permits.

The camera should make speed feel enormous without making the player unable to see the next anchor.

## 16. Failure modes to prevent

### Wrong-target latch

Cause: one dominant nearest-target or cursor-only rule.  
Prevention: context-weighted scoring, preview, hysteresis, and precision override.

### Orbit assist becomes a canned animation

Cause: direct position writes or perfectly fixed circular path.  
Prevention: bounded force/turn corrections, player-driven boost and line length, visible wobble.

### Assist drains momentum

Cause: generic velocity damping or speed governor.  
Prevention: preserve tangential component and physics-earned provenance.

### Player flies into the anchor

Cause: facing-only assistance without radial control.  
Prevention: bounded radial damping and line-length error correction.

### Player boosts against the line

Cause: ship orientation does not match tangent.  
Prevention: tangent-facing controller and clear orbit-direction state.

### Route is only solvable in debug

Cause: anchor placement based on appearance rather than sampled trajectory solutions.  
Prevention: route compiler and robust acceptance thresholds.

### HUD becomes a permanent geometry textbook

Cause: every field and anchor always displays all information.  
Prevention: contextual reveal; show only the active candidate, route, and immediate solution.

## 17. Vertical-slice acceptance

The first complete control slice should prove all of the following on the ordinary player route:

1. Player approaches a massive anchor on the right while an enemy is closer on the left.
2. Right-turn input plus tether action selects the anchor.
3. Precise cursor aim at the enemy overrides the anchor selection.
4. Candidate preview makes the selection visible before latch.
5. Orbit assist establishes a stable clockwise pass without collision.
6. Player can reel in and pay out.
7. Boost increases tangential speed rather than pushing against the line.
8. A selected destination produces a green release window.
9. Standard assist permits a reliable release.
10. Physics-earned speed survives the release.
11. Camera pulls out smoothly.
12. Manual input and raw-assist-off modes remain available.
13. The same setup is deterministic under a fixed input trace.
