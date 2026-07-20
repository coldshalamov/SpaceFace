# Pasteable Agent Briefs

Each brief is intentionally self-contained. Paste one brief into a planning thread. Require the planner to inspect the current repository before naming exact files or asserting current behavior.

---

# Brief 01 — Intent-Aware Massline Target Acquisition

## Problem

The player currently has to aim at an object with a trackpad while simultaneously flying and pressing the tether input. This is unreliable during fast combat passes and awkward around large bodies. A nearest-target rule would select the wrong body in clutter. A cursor-only rule overweights wherever the pointer happened to rest. A target-cycle-only rule adds menu-like friction.

## What this causes

- The player misses flyby tether opportunities.
- A nearby enemy may steal selection from the planet the player is turning toward.
- Large planetary or station anchors feel harder to target than their visible scale suggests.
- The player cannot trust the massline enough to build advanced maneuvers around it.
- Every future massline feature inherits a broken acquisition layer.

## Why solving it is cool

The massline begins to feel like a flight computer interpreting physical intention rather than a pixel-precise grappling hook. The player can turn toward a planet, hit the massline, and expect the planet; point precisely at cargo and expect cargo; pass an enemy at speed and expect the focused enemy.

## Proposed solution

Create a pure candidate-scoring system combining:

- Cursor surface miss and pointer precision.
- Turn direction and recent side-input history.
- Time to closest approach.
- Surface distance.
- Relative mass and object category.
- Current route anchor.
- Current combat target and threat focus.
- Candidate hysteresis.

Use context-specific weight profiles for massive anchors, combat targets, and towable objects.

## General implementation direction

1. Collect tetherable candidates through the existing spatial-query path.
2. Normalize each candidate into a record containing category, surface distance, direction in ship-local coordinates, relative velocity, relative mass, cursor miss, route/combat flags, and current-highlight memory.
3. Score with a pure deterministic function.
4. Keep the winner stable until another candidate wins by a margin or receives a precise cursor override.
5. Publish the current candidate and reason category to state for HUD use.
6. Fire the tether only at the published candidate.
7. Never allow iteration order to choose ties accidentally; use stable IDs as final tie-breakers.

## Player-facing presentation

- One primary candidate bracket.
- A short preview line to the predicted attachment point.
- A small glyph for `ANCHOR`, `HOSTILE`, `TOW`, or `ROUTE`.
- Stronger highlight when the candidate is precise-cursor selected.

## Non-goals

- Do not implement orbit assist.
- Do not rewrite combat target cycling.
- Do not add a radial menu.
- Do not auto-latch without player input.

## Acceptance

- Precise cursor aim overrides a closer body.
- Holding right and approaching a massive anchor on the right favors it over a closer enemy on the left.
- A valid route anchor receives priority without tethering across unreasonable distance.
- A tow objective precisely under the cursor beats a massive anchor.
- Candidate does not flicker under small pointer or score changes.
- Mirrored geometry produces mirrored selection.
- Browser capture proves the player intentionally selects competing candidates.

## Forbidden shortcuts

- Closest object only.
- Cursor ray only.
- Invisible selection with no preview.
- Expanding the target radius until everything near the cursor is equally valid.
- Hardcoding planet priority over all other objects.

---

# Brief 02 — Massline Input and Line-Control Redesign

## Problem

Advanced massline maneuvers require simultaneous directional flight, tether activation, boost, reel control, and later release. The current F-centered interaction is not ergonomic enough for a primary mechanic, and one-way reeling prevents orbit-radius control and atmosphere-skimming design.

## What this causes

- The player cannot reliably hit turn and tether together.
- The player must release movement to reach the tether key.
- Tethered flight becomes slower and less expressive.
- No way exists to pay out line and recover from an inward spiral.
- Future massline variants would require more buttons.

## Why solving it is cool

The massline becomes a first-class control layer: easy to enter, easy to steer, and deep without cockpit-keyboard complexity.

## Proposed solution

Introduce one rebindable central Massline action, preferably thumb-accessible. Preserve F as an alias if desired.

Recommended semantics:

- Unattached press: latch current candidate.
- Attached quick tap: cut.
- Attached hold: enter temporary line-control mode; release does not cut.
- In line-control mode:
  - Up/forward reels in.
  - Down/reverse pays out.
  - Left/right reinforces orbit direction.
  - Shift boosts/pumps.

Use a 150–250 ms input-history window so side input just before or after latch counts as intent.

## General implementation direction

1. Define edge/level actions without consumer systems reading raw keys.
2. Implement an explicit tap/hold state machine with clear timers.
3. Avoid delaying the initial latch while waiting to decide tap versus hold.
4. Ensure UI and modal states zero all transient controls.
5. Preserve rebinding and gamepad/touch mapping.
6. Publish line-control mode for HUD prompts.
7. Add pay-out to massline controller using bounded target length.

## Player-facing presentation

- Brief mode label when line-control activates.
- Current length and allowed range.
- Reel direction packets moving along the line.
- Clear cut prompt when a quick tap would cut.

## Non-goals

- Do not implement a new flight model.
- Do not require holding the modifier for the entire tether lifetime.
- Do not introduce separate keys for reel-in and pay-out unless accessibility mapping needs them.

## Acceptance

- Tap and hold are distinguishable in repeated ordinary play.
- Hold never cuts on release after line-control use.
- Side input within the tolerance window sets orbit direction.
- Reel and pay-out work under high tension.
- No stuck controls after modal, docking, blur, or pointer-lock changes.
- All actions are rebindable or have accessible alternatives.

## Forbidden shortcuts

- Making line extension a UI slider.
- Using direct distance teleportation.
- Capturing movement keys after line-control exits.
- Requiring a frame-perfect D+F chord.

---

# Brief 03 — Anchor-Relative Orbit Assist

## Problem

When tethered to a massive anchor, ordinary yaw input is not matched to tether length or angular velocity. The player turns too fast and collides inward, or too slowly and boosts against the line. The massline therefore inhibits motion instead of enabling it.

## What this causes

- Planetary slingshots are impractical.
- Combat orbiting loses speed.
- The player bounces at the constraint boundary.
- Boost feels broken while tethered.
- The supposed UVP feels worse than free flight.

## Why solving it is cool

The player can turn toward a planet, latch, hold the chosen side, and enter a dynamic Spider-Man-like orbit while still choosing boost, radius, release destination, and timing.

## Proposed solution

Implement a bounded anchor-relative controller. Decompose relative motion into radial and tangential components. Use player side input to choose clockwise or counterclockwise tangent. Supply:

- Tangent-facing assistance.
- Bounded radial-velocity damping.
- Tether-length error correction.
- Tension preservation.

Do not animate the ship along a circle or overwrite position.

## General implementation direction

1. Create a pure reference-frame helper returning `rHat`, both tangents, radial velocity, tangential velocity, angular rate, and length error.
2. Engage only for targets classified as massive anchors.
3. Infer orbit direction from recent side input.
4. Feed bounded turn/thrust corrections through existing flight/physics ports.
5. Preserve player tangential input and boost.
6. Disengage on manual radial override, cut, brake, or incompatible target.
7. Expose assist strength settings.

## Presentation

- Small orbit-direction chevron.
- Tangent arrow near ship.
- Tether tension and radius.
- Optional debug vectors in laboratory only.

## Acceptance

- Stable clockwise and counterclockwise orbits at several line lengths.
- Player does not collide under ordinary entry conditions.
- Boost increases tangential speed.
- Assist does not erase physics-earned speed.
- Player may reel in and pay out while orbiting.
- Manual override is immediate.
- Assist-off mode applies no hidden force.

## Forbidden shortcuts

- Positioning the ship on a parametric circle.
- Setting angular velocity directly to a target value without force/turn authority.
- Global damping that makes all tether flight slow.
- Perfectly rigid motion with no dynamics.

---

# Brief 04 — Slingshot Predictor, Release Arc, and Route Compiler

## Problem

Even with a stable orbit, releasing toward a specific destination is a narrow timing problem. Agents may also place planets or anchors based on visual composition without verifying that a robust slingshot path exists.

## What this causes

- Slingshots miss unpredictably.
- Authored routes are only solvable through debug or luck.
- The player cannot learn timing.
- Future missions become fake checkpoint races.

## Why solving it is cool

The player reads a red/amber/green release arc, times a launch, catches the next anchor, and chains momentum through a deliberately designed planetary route.

## Proposed solution

Build one shared trajectory predictor and one offline route validator.

The predictor uses the same relevant force and release assumptions as live gameplay and produces:

- Future path samples.
- Destination intercept error.
- Current release validity.
- Time to solution.
- Closest approach.
- Expected exit speed.

The route validator samples entry states and proves robust release windows between authored anchors.

## General implementation direction

1. Keep predictor pure and deterministic.
2. Simulate a bounded horizon at fixed substeps.
3. Use target radius and destination gate to compute tolerance.
4. Publish a world-space ribbon and annular release window.
5. Support arm and snap assistance modes.
6. Tag release velocity as physics-earned.
7. Build a Node script that loads route JSON and outputs reachability diagnostics.

## Presentation

- Annular red/amber/green ribbon around current anchor.
- Current phase marker.
- Predicted trajectory ribbon.
- Subtle screen-edge timing vignette.
- Next-anchor bracket.

## Acceptance

- Predictor and actual path agree within defined tolerance.
- Impossible destinations never show green.
- Larger destination gates widen the window.
- Route validator rejects frame-perfect-only routes.
- One two- or three-anchor route is completed in uninterrupted normal play.
- Miss recovery is possible.

## Forbidden shortcuts

- Teleporting to the next anchor.
- Making all release phases valid.
- Using a predictor with different physics from gameplay.
- Placing anchors by eye and adjusting capture scripts until one run passes.

---

# Brief 05 — Universal Weapon Impulse and Concussion Cannon

## Problem

Combat is dominated by repeated damage application. Weapons rarely change relative position, so the environment and massline do not meaningfully combine with gunplay.

## What this causes

- Higher-tier weapons only shorten time-to-kill.
- Asteroids and planets are scenery rather than combat tools.
- Flinging and gravity fields lack setup support.
- Players cannot discover displacement-based styles.

## Why solving it is cool

Every hit has physical character. A dedicated concussion weapon can herd enemies, peel attackers off a convoy, knock a lightened target into an asteroid, or force a disabled enemy into atmosphere.

## Proposed solution

Add independently tunable impulse behavior to weapon data. Give ordinary weapons small but visible physical response and create one low-damage/high-impulse Concussion Cannon.

## General implementation direction

1. Extend weapon definitions with impulse and optional angular impulse.
2. Apply impulse along projectile direction or contact normal through physics authority.
3. Scale response by target mass/response status.
4. Separate damage balance from impulse balance.
5. Add off-center torque only where hit geometry supports it.
6. Add target velocity-change trails and directional impact VFX.

## Acceptance

- Starter weapon creates subtle response without ruining aim.
- Concussion weapon strongly displaces light targets.
- Heavy targets resist.
- Lightened targets respond more.
- Player can intentionally drive an enemy into terrain.
- No direct velocity writes.

## Forbidden shortcuts

- Applying a generic slow instead of impulse.
- Making impulse a visual-only shake.
- Giving all weapons the same force.
- Increasing damage and calling the result “physics combat.”

---

# Brief 06 — Mass Seed: Temporary Anchor and Gravity Well

## Problem

Open-space encounters often lack anchors or a way to gather bodies. The massline needs a portable reference frame, and gravity combat needs one multi-use flagship tool.

## What this causes

- Massline utility depends too heavily on sector clutter.
- Enemy formations remain difficult to manipulate.
- Escape and traversal setups are unavailable in empty regions.

## Why solving it is cool

The player deploys a temporary artificial moon: sling around it, pull enemies into it, bend projectiles, group a swarm, or use it as a route anchor.

## Proposed solution

Build in two stages.

### Stage A: Anchor mode

- Deployable frame-locked node.
- High effective anchor mass.
- Tetherable.
- No surrounding pull.
- Bounded lifetime and count.

### Stage B: Well mode

- Continuous attractive field.
- Strong effect on light, marked, or projectile bodies.
- Weak effect on heavy ships.
- Player affected honestly with preview.

## General implementation direction

1. Reuse existing deployable/projectile lifecycle where possible.
2. Lock anchor mode through physics authority or explicit fixed entity type.
3. Create one pure bounded field function for well mode.
4. Query affected bodies spatially with a cap.
5. Route force through physics authority.
6. Publish semantic field telemetry for VFX and HUD.
7. Add deterministic cleanup.

## Presentation

- Containment node.
- SDF lens ring.
- Local distortion buffer.
- Inward flow particles following field direction.
- Curved trajectory ribbons.

## Acceptance

- Anchor supports ordinary massline orbit and sling.
- Well gathers light bodies without freezing them.
- Heavy bodies resist.
- Marked/lightened body responds more.
- Player can use it for both traversal and combat.
- No singularity, NaN, or unbounded acceleration.
- VFX is not a translucent sphere.

## Forbidden shortcuts

- A radial stun.
- A damage-over-time black sphere.
- Teleporting bodies to center.
- Affecting enemies but not player/projectiles.
- Building Well mode before Anchor mode is proven.

---

# Brief 07 — Repulsor Seed and Forward Gravity Cone

## Problem

The player needs a physics-based escape and corridor-clearing tool distinct from an explosive damage bomb.

## What this causes

- Pursuit has few creative escape options.
- Debris and asteroid fields remain passive obstruction.
- Attractive fields lack counterplay.
- Swarms can crowd the player without a positioning response.

## Why solving it is cool

Drop a repulsor behind the ship to scatter pursuers, fire one into a crowd to dash enemies against terrain, or activate a forward gravitic cone to snowplow a route through debris.

## Proposed solution

Create one sustained radial Repulsor Seed and, later, a short-duration directional cone using the same field kernel.

## General implementation direction

- Smooth bounded outward force.
- Strong response on small bodies and missiles.
- Weak response on heavy ships.
- Clear duration and field boundary.
- Player affected honestly.
- Energy/cooldown or manufactured deployable cost.

## Acceptance

- Opens a pursuit corridor.
- Pushes an enemy into a nearby hazard under deliberate placement.
- Clears small debris without deleting it.
- Counters attractive seed interaction.
- VFX communicates outward direction.

## Forbidden shortcuts

- Instant radial teleport.
- Generic explosion reskin.
- Deleting debris rather than moving it.
- Full-strength effect on capital ships.

---

# Brief 08 — Inertial Shunt and Gravity Mark

## Problem

Heavy enemies resist physics tools, but making all fields universally strong would trivialize combat. Players need a setup tool that changes how a chosen target participates in the physics sandbox.

## What this causes

- Large ships remain HP sponges.
- Gravity wells must be either weak or overpowered.
- Weapon combinations lack preparatory states.

## Why solving it is cool

A player can lighten a large enemy, then shove or sling it; ballast a convoy to protect it; or mark one target so a gravity field selectively pulls it out of formation.

## Proposed solution

Implement explicit physical-response statuses rather than one generic speed debuff.

### Lighten

- Increased impulse response.
- Increased tether/field response.
- Increased angular disturbance.

### Ballast

- Decreased impulse response.
- Increased anchoring.
- Reduced propulsion response while active.

### Gravity Mark

- Increased artificial-field coupling only.

## General implementation direction

- Add centralized response multipliers.
- Do not scatter weapon-specific checks.
- Keep rigid-body mass stable unless thoroughly proven safe.
- Add clear visual state on target.
- Make durations and stacking policy explicit.

## Acceptance

- Same concussion hit moves lightened target farther.
- Ballasted target resists.
- Marked target is selectively pulled by Mass Seed.
- Status affects massline throws and fields consistently.
- Status does not silently alter unrelated economy or cargo values.

## Forbidden shortcuts

- Generic movement slow.
- Flat damage vulnerability.
- Directly changing every mass-dependent subsystem without audit.
- Tiny HUD icon as the only feedback.

---

# Brief 09 — Atmospheric Skimming and Enemy Reentry

## Problem

Planets currently offer little interactive play, and enemy flings often lack a durable payoff.

## What this causes

- Planets remain background balls.
- Atmosphere feels like unnecessary simulation detail.
- Environmental combat lacks a dramatic endpoint.

## Why solving it is cool

The player tethers to a gas giant, adjusts line length to skim a dense harvesting band, builds speed, and later drags or blasts a disabled enemy past the point of no return where it burns apart in reentry.

## Proposed solution

Create authored radial atmosphere bands and a staged enemy reentry state.

### Player skim

- Resource rate depends on density and distance traveled.
- Deeper band increases heat/drag/risk.
- Reel/pay-out controls depth.
- Boost controls tangential travel.

### Enemy reentry

- Trigger requires inward trajectory plus disability, tumble, lightening, or insufficient escape authority.
- Progress through skim, commit, breakup, descent.

## General implementation direction

1. Use simple radial density curves.
2. Publish atmosphere telemetry.
3. Apply player drag/heat asymmetrically and forgivingly.
4. Evaluate enemy escape capacity before committing reentry.
5. Drive VFX from state progression.
6. Route resource collection through cargo/industry owners.

## Acceptance

- Outer skim safe and low yield.
- Working band better yield.
- Deep band visibly dangerous.
- Pay-out raises altitude.
- Healthy enemy escapes marginal pass.
- Disabled/tumbled enemy enters staged breakup.
- Player has warning and emergency recovery.

## Forbidden shortcuts

- Invisible damage circle.
- Instant enemy explosion at threshold.
- Modal atmosphere minigame disconnected from flight.
- Resource increment based only on time spent inside radius.

---

# Brief 10 — Surface Mass Driver and Cargo Heist

## Problem

The world lacks visible economic events the player can opportunistically protect or rob. Station markets contain value but do not put it into motion.

## What this causes

- GTA-in-space fantasy has no physical targets.
- NPC economy feels decorative.
- Missions create waypoints rather than situations.

## Why solving it is cool

A planetary rail charges, fires a valuable capsule into orbit, lawful catchers and patrols move to receive it, and the player may escort it, intercept it, redirect it, steal it, or sabotage the schedule.

## Proposed solution

Implement one deterministic launch cycle with a physical capsule, catcher, patrol response, legal mission, and criminal branch.

## General implementation direction

1. Author launcher, path, capsule specs, catcher, and schedule.
2. Spawn capsule through world owner with stable identity.
3. Give it velocity and route, not position animation.
4. Allow massline, Frame Coupler, concussion, and Momentum Sink interactions.
5. Catcher resolves legal delivery.
6. Player diversion emits witnessed-crime events.
7. Route economic consequence through existing owners.
8. Persist schedule disruption and capsule outcome.

## Acceptance

- Launch is visible from ordinary flight.
- Capsule follows physical route.
- Catcher receives it when uninterrupted.
- Player can redirect and steal it.
- Patrol responds based on witnesses/coverage.
- Theft changes heat, faction, mission, or market state.
- No dialogue choice is required to initiate the crime.

## Forbidden shortcuts

- Toast announcing launch with no physical capsule.
- Capsule moving along a CSS or render-only spline.
- Adding stolen cargo directly on proximity.
- Hardcoded crime outcome without law-system routing.

---

# Brief 11 — Meteor Express and Frame Coupler

## Problem

Sector travel contains too much empty thrusting, and traffic is not usable as physical infrastructure.

## What this causes

- Open world feels stitched together by empty space.
- Hitchhiking fantasy is absent.
- High-speed routes have no world schedule.

## Why solving it is cool

A huge meteor or express freighter crosses the region on a known route, slings around a planet, and becomes a moving high-speed platform the player can catch, ride, rob from, or use to infiltrate hostile territory.

## Proposed solution

Create one scheduled moving body and a Frame Coupler massline head that gradually matches velocity without pulling centers together aggressively.

## General implementation direction

- Authored deterministic itinerary.
- Clear map and world telegraph.
- Coupler applies bounded relative-velocity convergence through physics authority.
- Safe offset and release.
- Route may cross a planetary sling assist.
- NPCs or cargo may use the same body.

## Acceptance

- Player catches it without debug teleportation.
- Coupler matches velocity smoothly.
- Player can ride and release near destination.
- Route repeats predictably.
- Pursuers struggle to match without route knowledge.
- Body has visible world purpose beyond being a taxi.

## Forbidden shortcuts

- Autopilot fast travel screen.
- Direct velocity copy in one frame.
- Decorative meteor with no route timing.
- Player-only object ignored by NPC/world systems.

---

# Brief 12 — Monofilament Massline

## Problem

The massline currently affects the endpoints but the swept line itself is not a major combat verb. This leaves orbiting and positioning disconnected from damage.

## What this causes

- The player still relies on LMB for payoff while performing massline maneuvers.
- Movement path does not become attack geometry.
- Swarm combat lacks a skillful area-clearing technique.

## Why solving it is cool

Orbit a heavy anchor and sweep a high-tension luminous filament through drones, external weapon mounts, or authored braces. The player's path becomes the blade.

## Proposed solution

Create a specialized massline head whose line segment deals controlled cutting effects under high tension and high sweep speed.

## General implementation direction

1. Compute swept segment volume between prior and current line positions.
2. Query eligible targets spatially.
3. Require tension and sweep-speed thresholds.
4. Apply per-target cooldown.
5. Route damage/component effects through combat owner.
6. Overheat or discharge line after sustained cutting.
7. Make player immune to self-line damage.

## Acceptance

- Ordinary low-tension towing causes no damage.
- High-speed sweep cuts light drones.
- Armored targets resist except at weak components.
- Contact point and line path are visually obvious.
- No duplicate hits from frame-rate variation.
- Reduced-motion mode preserves gameplay cue.

## Forbidden shortcuts

- Radial damage around player.
- Damage based only on tether active state.
- Invisible segment collision.
- Unlimited continuous damage with no cooldown or heat.

---

# Brief 13 — Twin Bridle: Body-to-Body Attachment

## Problem

The current massline relationship always centers the player, limiting the ability to make two world bodies interact directly.

## What this causes

- The player cannot tie enemies together.
- Large salvage orientation requires awkward personal positioning.
- Many interesting traps require the player to remain one endpoint.

## Why solving it is cool

Attach one enemy to another, or an enemy to a planet, then let their different velocities turn the pair into a violent spinning system. Use it for capture, collision, salvage, or field combinations.

## Proposed solution

Add one capped body-to-body bridle attachment with explicit first-endpoint and second-endpoint acquisition.

## General implementation direction

1. First activation stores endpoint A.
2. Candidate selector enters endpoint-B profile.
3. Second activation creates attachment through generalized attachment owner.
4. Enforce mass, range, cycle, and count limits.
5. Provide clear endpoint colors and preview line.
6. Cleanup deterministically on death/despawn/cut.
7. Let artificial fields and impulses act normally on both bodies.

## Acceptance

- Tie two light enemies together and observe momentum exchange.
- Tie enemy to massive anchor and create orbit/impact opportunity.
- Bridle cannot create attachment graph cycles.
- Save/load either restores safely or explicitly resolves attachment.
- UI always shows whether selecting A or B.

## Forbidden shortcuts

- Freezing two objects in place.
- Making the player an invisible permanent endpoint.
- Unlimited bridles.
- Hidden automatic selection of endpoint B.

---

# Brief 14 — Massline Drag Net

## Problem

A more numerous enemy-swarm direction needs a way to capture or redirect several light bodies without individually tethering each one.

## What this causes

- Massline play remains single-target.
- Swarms are handled only through damage or radial explosions.
- Piracy and capture lack a distinctive heavy-ship tool.

## Why solving it is cool

A large ship deploys a luminous net behind it, sweeps through drones or raiders, drags the struggling cluster around a planet, and releases them into reentry or a prison catcher.

## Proposed solution

Implement a visually curved capture volume supported by a few endpoint nodes and bounded per-target constraints. Do not simulate cloth.

## General implementation direction

- Deploy net nodes and parametric ribbon surface.
- Detect small eligible bodies crossing the capture surface.
- Add captured bodies to a capped list.
- Dampen them relative to net frame.
- Apply load penalty to player acceleration/turn.
- Permit release-all initially; selective release later only if needed.
- Route capture/crime consequences through existing systems.

## Acceptance

- Captures multiple small targets.
- Heavy targets break or ignore net.
- Net load visibly affects ship.
- Captured enemies remain physical and may collide.
- Player can release them near atmosphere or catcher.
- Net VFX deforms convincingly without cloth simulation.

## Forbidden shortcuts

- Radial stun or vacuum effect.
- Deleting captured enemies into inventory.
- Unlimited target count.
- Net that has no physical or handling consequence.

---

# Brief 15 — Modern Physics VFX Foundation

## Problem

Current physics effects risk reading as translucent primitive geometry with bloom. New mechanics will not feel premium if every field is a colored sphere and every tether is a pulsing tube.

## What this causes

- Mechanics lack force direction and timing clarity.
- Effects look like prototypes despite sophisticated code.
- Increasing particle count harms performance without improving composition.
- Different mechanics become visually interchangeable.

## Why solving it is cool

Massline tension flows visibly down a layered ribbon; a Mass Seed bends stars and curves field particles; concussion impacts produce directional pressure fronts; reentry escalates from heat to plasma to breakup.

## Proposed solution

Build a pooled semantic VFX library using:

- Instanced particles.
- Shader-driven ribbons.
- SDF rings/arcs/cones.
- Local distortion buffer.
- Depth-aware soft particles.
- Mesh shockwaves.
- Pooled dynamic lights.
- Speed-responsive camera and trails.

## General implementation direction

1. Define semantic VFX events and telemetry inputs.
2. Build reusable pooled emitters and ribbon geometry.
3. Separate anticipation, event, response, and decay phases.
4. Add near/far LOD.
5. Test bright/dark backgrounds and reduced motion.
6. Profile allocations and draw calls.

## Acceptance

- Massline, attraction, repulsion, concussion, and reentry have distinct visual grammar.
- Forces are readable from particle/ribbon motion.
- Effects work at combat and sling zoom.
- No primary effect relies on one translucent primitive.
- Performance remains inside measured budget.
- Browser capture includes side-by-side before/after.

## Forbidden shortcuts

- “Advanced VFX” implemented by more bloom.
- New Mesh/Material creation per activation.
- Full-screen distortion for local effects.
- Random particles unrelated to force vectors.

---

# Brief 16 — First Planetary Physics Vertical Slice

## Problem

The project has many planetary ideas but no bounded slice proving that one planet can support traversal, economy, crime, atmosphere, NPC routes, and combat payoff without becoming several disconnected systems.

## What this causes

- Teams build isolated planet features with no shared activity loop.
- Planet content risks another noninteractive fixture.
- Scope expands into an entire solar-system simulator.

## Why solving it is cool

One planet becomes a complete place: sling around it, skim atmosphere, watch cargo launch, escort or steal a capsule, see patrols respond, and burn a disabled enemy in reentry.

## Proposed solution

Build exactly one planet with:

- Massive visible body and aligned collision.
- Massline sling band.
- Atmosphere harvest band.
- Mass driver.
- Cargo catcher.
- Scheduled capsule.
- Patrol route.
- Legal escort contract.
- Physical theft path.
- Reentry payoff.
- Route to one secondary anchor or station.

## General implementation direction

Use the shared targeting, orbit, predictor, field/atmosphere, NPC-job, and event-owner primitives. Do not build a separate modal planet game.

## Acceptance

- Each activity is reachable in ordinary play.
- Planet has visible traffic independent of the player.
- Legal and criminal interactions share the same physical capsule.
- Sling and atmosphere reuse massline controls.
- Enemy reentry emerges from combat state.
- Player action causes persistent world/economy response.
- Sector can be described by the planet's activity rather than its palette.

## Forbidden shortcuts

- Separate bespoke UIs for every activity.
- A planet that remains mostly decorative while activities spawn elsewhere.
- A mission script that teleports capsules or enemies.
- Expanding to multiple planets before this one is accepted.
