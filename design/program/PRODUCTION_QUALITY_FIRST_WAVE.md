<!-- LIFETIME: ACTIVE_PLAN — detailed selected proposals, not implementation status. -->
# First wave: movement, matter, and a complete place

Parent: [production-quality plan](PRODUCTION_QUALITY_COMPOUNDING.md).
These are three finite assignments. Numbers identify sections, not new dispatcher IDs.
Reconcile the cited existing owners once at pickup. If an equivalent result is already true,
retain it and work only the residual. No human playtest is a prerequisite.

## Assignment 1 — The throw reaches the world

**Purpose:** make an existing attack supply a dependable environmental outcome.
**Existing work:** hull-burst continuation; NXB-007 attribution, NXB-011 physical ordnance,
NXB-049/050 cue hierarchy; notebook I10 useful wreck states.
**First scope:** hostile ship thrown by Gravity Bumper into an existing rock or machinery anvil.
Do not include all asteroid promotion, all ordnance, or player stun in this slice.

### Decided experience

Use a light hostile and a heavier hostile on the same approach. One readable rock bank intercepts
the light body's path; a clear player escape lane sits beside it. A second scene uses an existing
Ceres machine with warning/surge/calm, preserving its current phase law. The player can either
use the environment or win with ordinary weapons.

After a successful throw, the victim remains a physical body through the decisive impact.
The applied consequence names the actual attacker, victim and surface. Any eligible remnant is
usable by the existing recovery/tether path; non-gameplay fragments remain cosmetic.
Do not make a special scripted kill because the body crossed a zone.

### Implementation boundary

Read `src/systems/hullBurst.js`, `src/data/hullBurst.js`,
`src/core/physicsAuthority.js`, and the live collision/residency owner called by the production
physics backend. Follow the actual impact consumer into existing damage/aftermath owners.
The dated [handoff](../../docs/plans/2026-09-30-hull-burst-handoff.md) records fast victims outrunning
collision coverage; first establish whether that still happens.

Use the existing bumper/fling scenarios as the narrow reproduction. Compare the same approach:
burst off, low closing speed, high closing speed, light target and heavy target. Inspect a thrown
body nearing the live residency boundary. If coverage already works, do not rebuild it: improve the
selected visible scene or a real attribution/aftermath gap.

Preferred fix direction is bounded trajectory-aware residency using existing authority
([architecture note](PRODUCTION_QUALITY_ARCHITECTURE.md)), not global drag, teleportation,
artificial kill zones, a permanent world-sized active radius, or increased global body budgets.
Any different fix needs to preserve the same playable outcome and explain the tradeoff.

### Geometry and acceptance

Derive spacing from current fitted speeds, collider extents and stopping distance. Put the bank
inside the camera-readable approach and leave an ordinary non-contact exit. Test the edge of
supported collision coverage separately; hiding all content inside a short radius does not fix
an underlying broken trajectory.

Accept when:
- Real speed/mass differences change the physical result without repeated bulldozing contacts.
- The target collides with the selected surface throughout the supported trajectory.
- One secondary kill has one attribution and one reward; harmless contact does not fabricate a kill.
- Early death, target removal, neutral interruption and sector exit leave no held/body reference leak.
- The existing ordinary gun route remains viable; the scene does not demand the bumper.
- Focused checks remain green and the mechanism's body/query cost is bounded.

Use `scripts/run-bench-scenario.mjs` and the existing bumper/fling scenes by their current
interfaces. The browser burst probe is a controlled fixture with spawned targets/equipment;
it can demonstrate input/wiring, not normal acquisition. Do not call it earned progression.

**Stop:** the one rock-bank and one existing-machine interaction work, their failure cases are
handled, and any inherited cue child already covered is mapped to the same result. No new engine.

## Assignment 2 — Rebound Skates makes an asteroid useful to the pilot

**Lineage:** notebook I03. This is a resolved proposal for that idea, not a claim it is new.
**Existing context:** THE HAND, NXB-004 loaded handling, NXB-006 moving-gap traversal.
Before mutation, resolve any existing implementation under an alias. Admit the missing capability
through the existing program convention rather than inventing another task registry.

### Control and physical rule

Use one optional mobility fitting, not a new mandatory key or replacement flight model.
Normal steering/thrust aims the approach. The fitting assists an oblique contact only while the
pilot intentionally drives along a supported surface. Dedicated braking suppresses assistance;
coasting without deliberate input retains normal collision behavior. Fire/Tab remain available
for combat and do not secretly steer the ship. Rebinding must continue to work.

The first eligible surface is a fixed, convex asteroid collider with a reliable contact normal.
Exclude ships, receiver/dock volumes, moving machinery, loose debris and concave seams in this
first slice. Do not auto-latch to invisible rails. Keep ordinary collision forgiveness.

Use relative contact velocity: tangential motion supplies the outgoing direction. Preserve a
bounded part of existing speed; do not accelerate from rest, reverse along the tangent without
pilot intent, or award a speed bonus per physics contact. A head-on hit remains a normal collision.
Apply the response once per continuous contact episode through physics authority; jittering
between adjacent contact points must not mint repeated impulses. Rearming requires real
separation, not merely a different contact id.

Do not change hands-off settle-to-rest globally: root AGENTS §12 explicitly preserves it.
Do not require an active tether to obtain the effect. Suspend the first-version assist during a
loaded attachment or Grip carry and communicate that limitation through existing fitting/denial
surfaces; cargo-loaded ships still participate with their real derived mass.

### The authored route

Use the existing Helios starter-field crescent as the candidate location, preserving its station
approach, existing working actors and authored mission spaces. Choose two existing large rocks
with compatible collision normals; move only the selected dressing/arrangement if needed.

The course is an ordinary optional shortcut, not another mode:
1. A broad approach lets the pilot see the convex contact face before commitment.
2. That face redirects an oblique arrival toward a visible gap.
3. The gap opens into a generous recovery area, with an unobstructed outer bypass.
4. The route joins an existing useful destination, not an isolated finish ring.

First freeze the collider/layout identity and measure the supported starter's dimensions, turn
response, approach speed and braking distance. Size the bypass to clear the wider comparison hull;
size recovery to exceed the measured braking path at the selected exit speed. Exact world
coordinates and final coefficients are outputs of that measurement, not arbitrary prose constants.

The bounded tuning question is retention versus steering help: compare the same approaches with
assist off and two candidate strengths, keeping layout and incoming state fixed. Choose the smallest
intervention that produces a distinct controllable route without oscillation or free energy.
Do not optimize solely for fastest completion or secretly auto-aim the exit.

### Acquisition, art and checks

Prototype through existing fitting/derived-stat ownership. The playable delivery includes an
ordinary legal purchase/fit route at an existing early service and an optional Swarm offer.
Choose an existing comparable mobility tier and price basis from current progression; no debug
item in real saves, extra currency, or tech-tree rewrite. Normal movement remains satisfying and
complete without the fitting.

Use current asteroid media if the intended face reads correctly. New art is justified only by a
demonstrated silhouette/contact mismatch. A brief contact trace and hull-local response should
show the surface used and the departure direction; no automatic camera turn or new persistent bar.

Test oblique approaches from both sides, grazing, head-on, too slow, brake held, seam/corner
contacts, repeated contacts, loaded cargo, fitting removed and save/Continue. Compare the existing
starter-compatible build and a heavier purchasable hull with accepted fittings. All responses must
respect actual collider normals and authority; no change to a non-equipped control run.

**Stop:** one reusable fitting and one useful optional shortcut, with no mandatory new input.
Do not add wake weapons, aerial ramps, moving-surface skating or universal wall-running here.
Focused physical/input proof can close implementation; unavailable graphics tooling does not
justify claiming an unseen visual result or blocking all production.

## Assignment 3 — One working district uses the new vocabulary

**Existing work:** NXB-006/008/015/023/024/038/043 as relevant residuals; NXB-030 build comparison;
NXB-046 ordinary-story access; notebook I11/12/16 retained for later expansion.
**Place:** existing Ceres Sluice/Refinery route. Preserve current activity pockets and durable IDs.
This assignment deepens one route; it does not require implementing every cited parent in full.

### Decided play sequence

1. Approach the existing Cinder Sluice from its readable staging side. Ordinary traffic demonstrates
   the warning/calm rhythm. The safe route waits or goes around.
2. A skilled optional route rides the discharge, uses existing heavy geometry to redirect/recover,
   and rejoins the approach to a real service. Do not move station/gate anchors merely to fit a sketch.
3. An existing recovery/delivery job concerns one real load near that route. A slower loaded route
   is valid; an unloaded pilot may take the faster line. The job does not require an equipped skate.
4. One existing hostile interruption contests the load or approach. Ordinary weapons, interception
   and the existing throw/machine interaction offer alternatives. Do not spawn an endless pack.
5. Actual accepted quantity/condition settles once through existing cargo/economy owners. Damage,
   retreat and a failed delivery leave the surviving load recoverable under existing law.
6. At the service, the result and one relevant existing fitting/work opportunity are understandable.
   The pilot can leave and return to the changed situation.

**Three jobs for the same geometry:** transit shortcut, cargo recovery, and a fight using the
machinery. This is a small content multiplier, not three separate systems.

### Implementation and resources

Start at `src/data/environmentalMachinery.js`, its runtime consumer,
`src/data/sectorActivityPockets.js`, `src/data/sectorCompositions.js`,
`src/systems/npcJobsRuntime.js` and the selected existing mission/receiver owners.
Use the existing world-site operation and stable-object identity paths.
Trace current callsites before changing data. Ceres-specific choreography must not accidentally
become a global traffic override.

Reuse the Sluice, its current cycle and existing props. No new station or fleet is necessary.
If a catch bay/loose body is absent from the chosen scene, reuse an existing compatible body first;
otherwise commission precisely that functional asset with socket/collision/material requirements.
Do not count atmospheric dressing as physical content or increase simultaneous population to
make the place appear busy.

### Agent-only completion

Use one bounded normal-route run when judging the combined session shape, supported by fast focused
fixtures. Compare a light mobility build and an existing tow/control or heavy build under the same
job conditions; do not require every combination to be equally fast.

Verify:
- The safe path works without newly acquired equipment.
- The optional line has a useful consequence: shorter route, interception angle or reliable escape.
- Arrival before/after the surge changes the sensible action, not just visual effects.
- The moving load remains the same object through relatch, receiver entry, partial settlement and reload.
- Accepting cargo twice does not pay twice; ignored/rejected cargo is not erased.
- Save while towing, leave/return, kill the threatening actor early and abandon the job all resolve.
- A complete acquisition/action/result/return path works without debug grants; report separately
  any prepared fixture used for isolated physics.
- The selected current body/field/spawn budgets remain respected.

**Stop:** this district route works in all three uses. Later expansion chooses Pallas debris or
Tethys freight by observed benefit; it is not automatically another identical Sluice.

## Copy-ready implementation dispatch

> Continue the selected SpaceFace production-quality first wave. Read the current root and nearest
> AGENTS, build map, NOW and the selected assignment in this file. Preserve existing workers.
> Start with assignment 1 only, through the current hull-burst/physical-outcome owner; reuse any
> already-completed outcome and fix its residual. Deliver the two specified interactions, not new
> planning documents. Use existing fixed-seed scenarios and focused checks, scope any ordinary-route
> run to the claim, and get an independent agent review. Preserve current input, physics authority,
> single writers, deterministic sim and performance budgets. Update only existing canonical task
> state that this result actually satisfies. Report changed gameplay, checks run and remaining
> uncertainty. Stop when the named assignment is complete; do not silently launch assignments 2–3.

To assign a later section, substitute its number and outcome explicitly. Assignment 2 can be
designed/implemented independently where files are disjoint; assignment 3 consumes only capabilities
actually ready. Missing optional skates must not block ordinary Sluice-route improvement.
