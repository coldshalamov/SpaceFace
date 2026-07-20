# Implementation Roadmap, Testing, and Agent Work Lanes

## 1. Development doctrine

The project should not begin by implementing a black hole, a complete planetary system, or seven massline heads. The first objective is to prove that one assisted tether maneuver is reliably controllable and satisfying on the ordinary game route.

The correct implementation order is dependency-driven:

```text
intent detection
  → candidate selection
  → line-control ergonomics
  → orbit assist
  → release prediction
  → authored sling route
  → physical weapon response
  → fields and atmosphere
  → world activities
  → industrial infrastructure
```

Each phase must produce a player-visible vertical slice. Infrastructure without playtest evidence is not completion.

## 2. Current repository seams to audit first

Before editing, the planning agent should inspect the live versions of at least:

- `src/systems/input.js`
- `src/systems/autoTargetAssist.js`
- `src/combat/autoTargetMode.js`
- `src/systems/tetherGameplay.js`
- `src/core/constraints/masslineController.js`
- `src/systems/masslineTelemetry.js`
- `src/systems/masslineThrow.js`
- `src/systems/masslineImpacts.js`
- `src/systems/flightV3.js`
- `src/core/physics.js`
- `src/core/sg02DynamicBodyOwner.js`
- `src/systems/impulseCharges.js`
- `src/systems/weapons.js`
- `src/render/vfx.js`
- `src/render/energy/energyMaterials.js`
- `src/ui/masslineHud.js`
- `src/ui/hud.js`
- `src/core/registry.js`
- `src/data/featureFlags.js`

Relevant current architectural facts to verify rather than assume:

- The repository already contains throw-solution logic and physics-authority impulse routing.
- Auto-target mode currently records trackpad gestures into a path-following system.
- Current massline targeting and throw semantics have multiple context-dependent branches.
- The physics backend uses entity-level collision representations and a separate dynamic-body authority.
- Impulse charges already provide radial momentum and massline combination hooks.
- Flight governor behavior can destroy the feel of physics-earned velocity if not coordinated.

The agent must identify current owners and existing tests before proposing parallel systems.

## 3. Phase 0: Physics control laboratory

### Goal

Create a deterministic, rapidly repeatable proving ground for massline and gravity mechanics.

### Contents

- One player ship.
- One massive anchor on each side.
- One towable object.
- One hostile flyby target.
- One destination gate.
- One terrain impact target.
- Toggleable telemetry.

### Debug overlays

- Candidate scores and score components.
- Current inferred intent.
- Radial/tangential velocity.
- Tether length and error.
- Orbit direction.
- Assist force and turn command.
- Predicted release path.
- Physics-earned velocity provenance.
- Current input history.

### Why

Without a laboratory, agents will tune through one brittle scripted route and mistake accidental success for a robust mechanic.

### Acceptance

- Replayable input traces.
- Deterministic outputs.
- Screenshot/video capture.
- No debug-state injection required for core interactions.

## 4. Phase 1: Intent-aware tether targeting

### Problem

The player cannot reliably combine trackpad aim, turn input, thrust, and tether timing.

### Deliverables

- Candidate taxonomy.
- Shared scoring kernel.
- Cursor precision override.
- Turn-direction preference.
- Approach/flyby relevance.
- Relative-mass context.
- Route priority.
- Candidate hysteresis.
- Candidate preview.
- Debug score display.

### Non-goals

- Orbit assist.
- New massline heads.
- Gravity fields.
- New world content.

### Required tests

#### Pure scoring tests

- Exact cursor candidate wins over closer off-cursor candidate.
- Right-turn intent favors right-side massive anchor.
- Route anchor beats unrelated anchor under route context.
- Towable objective beats large anchor under precise tow context.
- Candidate remains stable under small score jitter.

#### Metamorphic tests

- Mirroring positions left/right mirrors selected candidate.
- Scaling all distances proportionally preserves ordering where normalized.
- Shuffling candidate iteration order does not change result.

#### Browser route

- Approach two competing objects and visibly select each through different intent signals.

### Forbidden completion claim

“Targeting score function exists” is not sufficient. The ordinary player must reliably latch the intended body.

## 5. Phase 2: Massline input and line control

### Deliverables

- Thumb-accessible massline mapping or selectable mapping.
- Tap/hold state machine.
- Input-history tolerance.
- Reel-in and pay-out.
- Line-control overlay.
- Clear cut versus control semantics.
- Settings and rebinding support.

### Tests

- Quick tap cuts.
- Hold enters line control without cutting on release.
- Side input before or after latch selects orbit direction.
- Pay-out cannot exceed spool maximum.
- Reel cannot cross minimum.
- UI/modal states suppress flight actions.
- Blur/focus clears transient input safely.

### Failure modes

- Tap/hold ambiguity cuts unexpectedly.
- Releasing modifier leaves movement keys captured.
- Massline action conflicts with brake or fire.
- Trackpad scrolling changes camera while intended to adjust line.

## 6. Phase 3: Orbit assist

### Deliverables

- Anchor-relative telemetry kernel.
- Orbit-mode inference.
- Tangent-facing command.
- Bounded radial correction.
- Tension-preserving behavior.
- Assist strength settings.
- Immediate manual override.
- Camera framing.

### Deterministic fixtures

Test at multiple:

- Tether lengths.
- Player masses.
- Anchor masses.
- Entry speeds.
- Clockwise and counterclockwise directions.
- Boost states.

Metrics:

- Collision rate.
- Mean radial error.
- Tangential speed retention.
- Time to stable orbit.
- Control saturation.
- Energy added or removed by assist.

### Important invariant

The assist may correct error but must not create unbounded free energy. Any sanctioned launch bonus must be explicit, bounded, and separately tagged.

### Browser acceptance

A human using ordinary controls can repeatedly:

- Latch a massive anchor.
- Enter orbit in chosen direction.
- Boost without fighting the line.
- Change line length.
- Cut cleanly.

## 7. Phase 4: Release prediction and sling course

### Deliverables

- Shared predictor.
- Destination gate.
- Release arc.
- Snap and arm assistance.
- Physics-earned velocity preservation.
- Speed-responsive camera.
- One authored two- or three-anchor course.
- Route validator tool.

### Predictor tests

- Predicted and actual path stay within tolerance over a short horizon.
- Mirrored orbit produces mirrored solution.
- Destination outside reachable velocity cone shows no green window.
- Larger destination radius yields wider release tolerance.
- Higher tangential speed changes window appropriately.

### Route validator tests

- Known-good route passes.
- Deliberately impossible route fails.
- Route with one frame-perfect solution but no robust window fails acceptance.
- Miss recovery path exists.

### Player-route evidence

Capture an uninterrupted run:

- Latch first anchor.
- Establish orbit.
- Release through window.
- Acquire second anchor.
- Complete route.

No console injection or position teleportation.

## 8. Phase 5: Universal weapon impulse

### Deliverables

- Weapon impulse fields in data.
- Surface-normal or shot-direction impulse.
- Angular impulse for off-center impact where supported.
- Mass-scaled response.
- Physics-authority routing.
- Tuned starter-weapon micro-response.
- Dedicated concussion weapon.

### Tests

- Starter weapon moves light target slightly over repeated hits.
- Concussion moves light target strongly.
- Heavy target moves less.
- Lightened target moves more.
- Player recoil/impact policy remains intentional.
- Damage and impulse are independently tunable.

### Browser acceptance

The player can intentionally walk an enemy into a large asteroid using the concussion weapon.

## 9. Phase 6: Mass Seed and Repulsor Seed

Build Anchor mode before Well mode.

### Anchor mode deliverables

- Deployable seed.
- Frame-lock behavior.
- Tether candidate category.
- Lifetime and collapse.
- Placement restrictions.
- VFX.
- Sling interaction.

### Well mode deliverables

- Shared continuous-field kernel.
- Bounded attraction.
- Affected entity masks.
- Trajectory visualization.
- Gravity Mark composition.
- NPC and projectile response.

### Repulsor deliverables

- Sustained outward field.
- Escape and debris-clearing use.
- Distinct VFX and force law.

### Tests

- Field result deterministic.
- Force continuous at center/edge according to authored law.
- No NaN or singularity.
- Heavy targets resist.
- Marked/lightened targets respond more.
- Seed cannot spawn inside invalid geometry.
- Field cleanup removes all transient references.

## 10. Phase 7: Atmosphere and reentry

### Deliverables

- Authored atmosphere bands.
- Density/heat/risk readout.
- Player skim feedback.
- Enemy reentry state machine.
- Progressive VFX.
- Emergency player recovery.
- One harvesting tool or collector.

### Tests

- Outer skim safe.
- Deeper band increases collection and heat.
- Paying out line raises safe radius.
- Healthy enemy can escape marginal entry.
- Disabled or tumbled enemy cannot.
- Reentry progression survives save/load or is explicitly nonpersistent with safe recovery.

### Browser acceptance

The player uses a physics setup to drive an enemy into reentry and watches a staged breakup.

## 11. Phase 8: Living planetary operations

### Deliverables

- One mass driver.
- Scheduled capsule launches.
- One catcher.
- Miner/hauler/patrol routes.
- One legal mission.
- One theft opportunity.
- Heat/faction/economic consequence.

### Why after physics

Physical traffic is only meaningful when the player can intercept, tow, push, catch, or escape with it.

### Tests

- Schedule deterministic.
- Capsule has a physical route.
- Catcher receives legal capsule.
- Player diversion changes outcome.
- Patrol response follows witnessed crime.
- Market or mission consequence routes through existing owners.

## 12. Phase 9: Massline variants

Priority order:

1. Tractor Spool.
2. Elastic Whip.
3. Frame Coupler.
4. Monofilament.
5. Twin Bridle.
6. Drag Net.

Do not begin this phase until the baseline Orbital Spool is delightful.

Each variant requires:

- Clear role.
- Same primary input grammar.
- Unique visual language.
- At least one traversal/world use and one combat/utility use.
- A reason to choose it over baseline.
- A normal-route teaching situation.

## 13. Phase 10: Sector identity and built gravity

### Deliverables

- Recompose one sector around a planet and activity topology.
- Add separate spatial pockets.
- Add visible routes.
- Add a signature landmark.
- Exteriorize player-built physics infrastructure.
- Allow Asteroid Ops to manufacture at least one permanent anchor or catcher.

### Acceptance

A player can describe the sector without naming its color palette or faction label.

## 14. Three-agent lane division

Concurrent agents need authority boundaries, not merely different task titles.

### Agent A: Controls and physics authority

Owns bounded changes to:

- Input action semantics.
- Target-scoring kernel.
- Orbit controller.
- Predictor.
- Field force requests.
- Physics provenance.
- Pure tests.

Must coordinate before editing broad shared files such as `input.js`, `flightV3.js`, `physics.js`, or `registry.js`.

### Agent B: Gameplay systems and world state

Owns:

- Mass Seed lifecycle.
- Weapon data/effects.
- Atmosphere states.
- Reentry state.
- NPC job controllers.
- Mass-driver schedules.
- Mission/economy/faction event adapters.
- Save normalization.

Must not bypass credit, cargo, faction, or physics owners.

### Agent C: World composition and presentation

Owns:

- Planet and anchor visual assets.
- Sling-course layout.
- Candidate/release HUD.
- VFX library.
- Camera presentation.
- Sector spatial composition.
- Browser captures and visual evidence.

Must not author gameplay outcomes in render code.

### Shared-file lease rule

Before editing a shared file:

1. Announce the exact file and intended seam.
2. Check current diff.
3. Make the smallest ownership-safe edit.
4. Commit a coherent slice.
5. Release the lease.

Do not let three agents simultaneously rewrite `input.js` because all three features use a key.

## 15. Feature flags and rollout

High-risk mechanics should be independently flaggable:

```text
physicsIntentTargeting
masslineInputV2
masslineOrbitAssist
masslinePayOut
masslineSlingRoutes
weaponImpulse
massSeedAnchor
massSeedWell
repulsorSeed
atmosphereGameplay
reentryGameplay
masslineVariants
```

Flags are not a substitute for wiring. Player-facing acceptance still requires the normal game route with the intended default configuration.

## 16. Test strategy

### 16.1 Pure kernel tests

Use for:

- Candidate scoring.
- Orbit reference-frame math.
- Force falloff.
- Predictor steps.
- Route reachability.
- Status response multipliers.

### 16.2 Contract tests

Verify ownership and event routing:

- Physics systems request impulses/forces rather than writing velocity.
- Economy remains sole credit writer.
- Cargo remains sole cargo writer.
- Faction response routes through faction events.
- Presentation reads semantic state and events.

### 16.3 Metamorphic tests

Useful invariants:

- Mirror geometry → mirror outcome.
- Candidate array order does not affect selection.
- Time-step subdivision produces boundedly similar results.
- Increasing target radius cannot shrink release window unexpectedly.
- Increasing mass cannot increase impulse response unless status overrides.
- Turning assist off produces no hidden assist force.

### 16.4 Replay tests

Record input traces for:

- Anchor selection.
- Clockwise and counterclockwise orbit.
- Sling route.
- Concussion terrain kill.
- Mass Seed cluster.
- Atmospheric reentry.

### 16.5 Browser route evidence

Each feature needs:

- Ordinary start/load route.
- Player controls only.
- Video or sequence of screenshots.
- Console error gate.
- Performance trace.
- No debug injection for feature outcome.

### 16.6 Visual acceptance

Require independent review of:

- Readability.
- Timing cues.
- Scale.
- Palette distinction.
- Bright/dark scenes.
- Reduced motion.
- Far zoom.

## 17. Anti-placeholder gates

A feature fails acceptance if:

- The target selector exists but no pre-latch preview is visible.
- Orbit assist is a position animation.
- Gravity is a circular buff zone.
- Atmosphere is an invisible damage radius.
- A mass driver launch is a toast and inventory increment.
- NPC routes exist only as metadata.
- A Mass Seed is a glowing sphere with no curved trajectories.
- A weapon says “knockback” but velocity change is negligible or direct-written.
- A sling course is traversed only through teleports in capture scripts.
- VFX is one primitive plus bloom.
- The implementation is unreachable from default play.

## 18. Performance budgets

The exact numbers should be measured on target hardware, but require named budgets for:

- Fixed-step physics cost.
- Candidate queries per tick.
- Predictor samples and cadence.
- Field-affected body cap.
- Trail samples.
- Instanced particle count.
- Dynamic lights.
- Distortion emitters.
- NPC job updates.

Suggested architecture:

- Candidate scoring at input/target cadence, not every render object blindly.
- Predictor at 10–20 Hz with interpolation, unless timing window requires higher cadence.
- Field forces at fixed step with spatial query and affected-body cap.
- NPC job decisions at low cadence; movement remains normal AI/flight.
- Pooled VFX.
- LOD based on camera scale and screen area.

## 19. Stop conditions

Pause a feature track when:

- Core control is not reliable after two focused iterations.
- The agent proposes adding more UI rather than resolving intent.
- Performance requires removing the visual payoff.
- A feature cannot name two meaningful uses.
- It creates a parallel owner for physics, cargo, credits, missions, or state.
- It depends on another unproven high-risk system.

A smaller complete physical toy is more valuable than a cathedral of unverified systems.
