# SPEC3-F3 — Flight, Physics & Feel (specs 16–18)
**Thread:** F3 · **Reads:** GDD_2_0 §4, constitution · **Status:** PLAN
**Thread pitch:** make momentum the game's signature toy — a flight model that feels assisted and
cinematic by default, hides an expert ceiling one toggle away, and turns the dormant tether system
into the most memorable verb in the genre.

Research anchors used throughout (verified numbers): Freelancer cruise **300 u/s, 3 s charge,
weapons-off, disruptor counter**; thruster **+120 burst** on a **200-drain / regen pool**; engine-kill
(Z) Newtonian coast; reference physics constants (mass 150, linear drag as the speed cap, reverse
0.5× forward thrust, 80° bank limit). Rebel Galaxy Outlaw's **inertial-dampener slide** is retained
as a research comparison; its automatic target pursuit is explicitly excluded from SpaceFace.
Highfleet: enemy fire **leads your current velocity vector**; afterburner (×3 thrust) breaks AI
prediction; **projectiles inherit ship momentum**; hard G-force turn caps are "realistic but unfun" —
never do that. Elite: FA-off 180° flip in **2–3 s** is the canonical expert move; every successful
game ships **assist-on by default, raw Newtonian opt-in**.

---

## SPEC3-16 — Flight model: Helm Assist, direct auto-target control, and the travel grammar
**One-line pitch:** finish GDD §4.1's helm-assist with the three missing pieces that make flight feel
professional: leash steering done right, user-directed auto-target/draw-to-fly, and the cruise/disruptor travel triad.

### 1. Why / what's holding us back
GDD §2 diagnosed "really hard to fly" as split attention (`src/systems/flight.js:169`). §4.1 already
mandates mouse-nose helm assist + brake-to-stop. What §4.1 does NOT specify — and what separates
"fine" from "professional" — is (a) the *leash model* for how the nose follows direct input, (b) a
clutchable trackpad flight path independent from locked-target weapon lead, and (c) how the speed tiers interlock as one travel grammar with
counters. This spec locks all three.

### 2. The design
**2a. Leash steering (not 1:1 virtual joystick).** The cursor raycast onto the XZ plane is a
*go-to point*; the ship continuously torques its nose toward it, rate-limited by hull turn stats.
Freelancer's feel comes from the rubber-band lag: hold the cursor left of the ship and it keeps
turning left forever. Big ships lag the cursor visibly — that IS the mass read. Never snap.
- Feel targets (GDD §4.1 kept): response begins <50 ms; scout 90° in ≤0.45 s; hauler ~1.4 s.
- Deadzone: 24 px around ship screen-pos where torque fades to 0 (prevents idle jitter).

**2b. Auto-target / draw-to-fly (user-owned control contract).** G may keep weapon lead on the
locked hostile while relative trackpad motion records a clutchable world-space flight path for the
ship. Weapon aim and flight intent are independent channels. Lifting and swiping again extends or
reverses the route immediately. The computer follows the player's path; it never selects or holds a
bearing/range station around the target. MMB pursuit selection, target-relative station keeping,
pursuit impulses, and pursuit-specific HUD/toasts are explicitly prohibited.

**2c. Inertial-dampener toggle ("drift", the expert layer).** Z toggles assist off (exists as
`newtonian` in `flightDynamics.js`) — reframe it as the *slide*: keep your velocity vector, re-point
the nose freely, guns stay on target while you strafe past. Target: a practiced player performs a
180° "reverski" flip-and-burn in 2–3 s (Elite parity). Assist re-engages with a 0.4 s velocity-blend,
never a snap.

**2d. Travel grammar (one table, all tiers + counters).**
| Tier | Engage | Speed | Agility | Weapons | Counter |
|---|---|---|---|---|---|
| Combat thrust | default | 1× | full | free | — |
| Boost (hold) / dash (tap) | Shift | burst | full | free | drains boost pool |
| **Cruise** | V, 3 s charge | 4× | crushed | **offline** | damage, mass-lock ≤350 wu of large body, **snare** |
| Lanes/gates | existing | rails | none | offline | lane disruption events (SPEC3-29) |
Cruise numbers: charge 3.0 s with audible spool; drop-out applies a 0.5 s "stumble" (agility 0.4×)
so getting snared *feels* like being yanked off a highway. The snare/interdiction consumer is
SPEC3-21/29; this spec only guarantees the state machine + events.

**2e. Boost as a pool, not a cooldown.** Freelancer model: boost drains a pool (~200 units, drain
55/s, regen 34/s idle, 0 while draining); tap-dash costs a fixed 28. Pool size/regen become module
stats (SPEC3-23). Reverse thrust = 0.5× forward (universal constant that reads as "ships have a
front").

### 3. Architecture & wiring
- `src/core/flight/` owns bounded interpretation of direct path intent. It must not add a target-relative
  station-keeping or velocity-matching controller.
- `src/systems/flightV3.js`: owns live flight authority and consumes the direct draw-to-fly path;
  `state.flight.mode` remains `manual|cruise|lane`,
  emits `flight:modeChanged {from,to,reason}` on the bus. Cruise charge/drop already lives in
  `src/systems/cruise.js` (check-juice-contract covers charge/drop) — extend with the stumble window
  + `cruise:snared {sourceId}` event; do not duplicate its state.
- Input: G toggles auto-target/draw-to-fly through the existing input system; V replaces Tab for cruise per GDD §7.1.
- Determinism: all of this runs inside the fixed-step sim on state + inputs only — replay-safe by
  construction. New tunables live in `src/data/` (e.g. `flightTuning.js`), not inline constants.
- Save/load: transient drawn-path/control state fails closed on load; no automatic pursuit mode exists.

### 4. Key code — the parts a smart implementer would botch
```js
// flightDynamics.js — leash steering. The taste is in the *rate-limited ease*, not proportional snap.
export function steerToPoint(body, point, dt, hull) {
  const pos = body.translation();
  const desired = Math.atan2(point.x - pos.x, point.z - pos.z);
  let err = wrapAngle(desired - body.rotation().yaw);      // [-PI, PI]
  const dead = hull.leashDeadzoneRad ?? 0.02;
  if (Math.abs(err) < dead) err = 0;
  // Rate limit: max turn accel toward the point, capped by hull turn rate. NO proportional gain on
  // small errors > deadzone — constant-rate closure is what reads as "mass", P-control reads as "toy drone".
  const maxRate = hull.turnRate;                            // rad/s, scout ~3.5, hauler ~1.1
  const targetRate = Math.sign(err) * Math.min(maxRate, Math.abs(err) * 6.0); // 6.0 = leash stiffness, tune 4–8
  applyYawTorqueTowardRate(body, targetRate, hull.turnAccel, dt);
}

```
```js
// cruise.js — the stumble. Dropping out of cruise must cost a beat of control; that beat is the
// pirate's opening and the player's "oh no". 0.5 s, agility crushed, camera does the work (SPEC3-18).
if (dropped) {
  state.cruise.stumbleT = 0.5;
  bus.emit('cruise:dropped', { reason, snare: reason === 'snared' });
}
// in flight update: const agilityMul = state.cruise.stumbleT > 0 ? 0.4 : 1.0;
```

### 5. Assets & generation
No new meshes. VFX/audio hooks consumed by SPEC3-18/34/39: cruise spool whine (3 s riser),
drop-stumble "compressor dump" cue, counter-thrust puffs for brake — all procedural (audioRecipes).

### 6. Libraries / tooling
Start the tuning lab from the existing debug overlay. Tooling/runtime dependencies are allowed when
they materially improve tuning or the shipped result and document license, bundle/performance,
determinism/save, parity, and maintenance impact; keep development-only tooling out of the player path.

### 7. Build plan
1. `steerToPoint` + deadzone + feel-target check `scripts/check-helm-leash.mjs` (asserts 90°-turn
   times per hull class from scripted inputs). Parallel-safe.
2. Boost pool → data-driven (`flightTuning.js`), reverse 0.5×; extend `check-massline-feel.mjs`.
3. Auto-target/draw-to-fly contract checks: locked-target weapon lead remains independent from
   clutchable relative path steering; reversal is immediate; rejected pursuit state/impulses/UI stay absent.
4. Cruise stumble + snare event + V-key rebind; extend `check-juice-contract`.
5. Regression floor: `check:sim:compare` hashEqual, `check-tether-gameplay.mjs`.

### 8. Anti-patterns
- P-control leash (reads as drone, not mass). Any target-relative position/velocity pursuit controller.
- Hard G-force turn caps (Highfleet's one documented mistake). Raw Newtonian as default (genre-proven unfun).
- Auto-anything that can't be instantly overridden by touching a manual input.

### 9. Ambition ceiling
Direct-path composition and restrained comms can make dogfights readable without automating the maneuver.
Lane-riding with other traffic (SPEC3-29) makes highways feel like infrastructure, not teleports.

---

## SPEC3-17 — The tether & momentum verbs (flagship)
**One-line pitch:** wire the dormant `attachments.js`/`masslineController.js` rope system into the
signature verb set — latch, winch, slingshot, yank, tow — and add impulse charges as its comedy twin.

### 1. Why / what's holding us back
GDD §2's sharpest finding: *a complete tether system exists and is wired to nothing* —
`src/combat/attachments.js` + `masslineController.js` implement rope/winch constraints on Rapier
joints with tension telemetry and break thresholds; `reel()` exists; enemy tether-cutter counterplay
exists in `check:47a:counterplay`. GDD §4.3/4.4 sketch the design. What's missing is the *wiring
spec*: inputs, targeting, feedback, save, and the balance numbers. This is it.

### 2. The design
- **Fire:** G (or RMB when mining beam inactive) → tether launches at the reticle target ≤260 wu.
  Valid anchors: asteroids, wrecks, cargo pods/chunks, station anchor points, ships. Miss = 1.2 s
  cooldown, quiet fizzle (no punishment scream).
- **Winch:** scroll = reel in/out (`reel()`); reeling against load costs energy/s scaled by tension.
- **Cut:** G again or X. Auto-break at tension threshold with a 0.25 s fray warning first.
- **Slingshot (user-corrected 2026-08-05):** tether a massive body, burn tangentially, and cut at
  the tangent. The rope owns only its physical constraint; ordinary flight remains unchanged. A
  taut release may add a game-feel flourish of `15% × actual exit speed × live line load` along the
  real exit vector. Slack or near-stationary release adds zero; no fixed threshold or flat kick may
  manufacture a launch.
- **Combat verbs:** yank ships with mass ratio <0.6 out of formation (stagger 1.2 s); anchor to a
  capital hull to orbit-strafe it; tether a mine cluster and sling it (inherits momentum — Highfleet
  rule: *all* released/launched objects inherit carrier velocity, see SPEC3-20).
- **Industry verbs:** haul >20 u ore chunks (Mining 2.0 fracture output) to refineries for bulk
  payout; tow wrecks to salvage yards (new contract type, SPEC3-12); rescue drifting ships (bar-rumor
  missions already exist as flavor — make one real mission template).
- **Counterplay both ways:** pirates carry cutters (surfaced from 47a scripts); the *player* can be
  tethered by grapple-pirates in SPEC3-21 encounters — the panic of being winched is content.
- **Impulse charges (GDD §4.4, unchanged numbers):** sticky bombs, F detonates all, radial impulse
  primary / damage secondary; 2 on your own tail-plate = desperation dash; cheap-but-heavy ammo
  economy sink; 6 s arm; friendly-fire on.

Tension telegraphy (locked): cable is an energy filament with sag; color lerps cyan→amber→red across
0–100% break threshold; audio is a taut-line hum whose pitch tracks tension (SPEC3-39). No numbers on
screen, ever.

### 3. Architecture & wiring
- New thin system `src/systems/tetherSystem.js` (init/update contract) that *orchestrates* the
  existing `attachments.js` API — do not fork the joint code. It owns: input edge-detection, target
  validation (raycast via existing targeting), energy drain, the slingshot-state timer, and events:
  `tether:attached {anchorType, anchorId}`, `tether:tension {01}` (throttled 10 Hz for UI),
  `tether:cut {velocity, slingshot:boolean}`, `tether:broke`.
- Save: serialize `{anchorId, restLength}`; on load re-create the joint if both bodies exist, else
  drop silently. Never serialize Rapier handles.
- Determinism: joint creation order must be stable (sort by entity id at re-create); the 47a tape
  doesn't exercise tethers today — new golden inputs get recorded as a *deliberate batch* per
  constitution when tether ships.
- Mass-ratio yank rule lives in data (`tetherTuning.js`), evaluated in the fixed step.

### 4. Key code
```js
// tetherSystem.js — the cut is where the feature lives or dies. Sample velocity BEFORE joint removal.
function cutTether(state, bus, world) {
  const v = playerBody.linvel();
  const speed = Math.hypot(v.x, v.z);
  detachJoint(world, state.tether.jointHandle);          // attachments.js API
  const sling = speed > state.tether.maxThrustSpeed * 1.4;
  if (sling) { state.tether.slingT = 1.0; }              // low-drag window, streaks, whipcrack
  bus.emit('tether:cut', { speed, slingshot: sling });
  state.tether.jointHandle = null;
}
// Fray warning: emit once when tension first crosses 0.82; auto-break at 1.0 after 0.25s grace.
// The grace beat converts "wtf it snapped" into "I felt it coming" — that's the whole trick.
```

### 5. Assets & generation
Cable filament: 12-segment ribbon mesh, additive, vertex-colored by tension (no texture). Whipcrack +
hum: procedural (SPEC3-39 owns recipes). Impulse charge: reuse mine mesh with amber strobe.

### 6. Libraries / tooling
Use the current Rapier impulse/rope facilities where they meet the behavior target. Additional
dependencies remain allowed under repository policy when their material benefit and impact are proven.

### 7. Build plan
1. `tetherSystem.js` skeleton + fire/cut on static asteroid + `scripts/check-tether-verbs.mjs`
   (attach, reel, cut; assert joint lifecycle + events).
2. Tension telemetry → filament color + hum hook; fray-grace; break.
3. Slingshot check: preserve real tangent momentum; assert the load-scaled 15% ceiling and zero
   bonus for slack/unloaded/near-stationary release.
4. Yank/anchor combat rules + mass-ratio data; extend 47a counterplay scripts to live game.
5. Chunk-hauling + refinery payout (pairs with SPEC3-14); tow-wreck contract template.
6. Impulse charges as a weapon-slot item (SPEC3-20 owns weapon plumbing; this spec owns the impulse).
7. Golden batch: record tether inputs into a new scenario tape; keep 47a untouched.

### 8. Anti-patterns
- Drawing the optimal tangent / turning slingshot into a UI minigame (it's a *feel* skill).
- Tether as a DPS weapon (it's a *momentum* tool; damage stays ~0).
- Silent instant break (always fray-warn); rubber-band joints that stretch forever (break = drama).
- Serializing physics handles; creating joints outside the fixed step.

### 9. Ambition ceiling
Tether two objects *together* (not just to yourself): sling asteroid-pairs, chain cargo trains,
tether a pirate to his own mine. One extra anchor slot in the data model buys a sandbox of stories.

---

## SPEC3-18 — Camera & juice: momentum made visible
**One-line pitch:** the camera, hit-pause, and speed-read system that makes mass legible — trauma
scales with momentum exchanged, not damage dealt.

### 1. Why
GDD §4.5/§9 set the principle; this spec sets the numbers and the wiring. Without it, F3's physics
work is invisible: players judge mass by camera behavior more than by trajectories.

### 2. The design (numbers locked, tune ±20% in lab)
- **Trauma model:** single scalar `trauma ∈ [0,1]`, decays 1.8/s, shake = trauma² (Squirrel Eiserloh
  standard). Sources: momentum-exchange collisions `min(0.5, Δp/8000)`, shield-break 0.3, kill 0.25,
  cruise-drop 0.2, slingshot release 0.15. Never additive above 1.
- **Hit-pause:** 60 ms on shield-break, 90 ms on kill, 40 ms on heavy ram (Δp>4000). Sim keeps
  stepping (determinism!) — pause is *render-side interpolation hold*, never a sim stall.
- **Speed read:** camera zoom eases out +12% at cruise, +6% at boost; near-mote parallax layer
  (GDD §9.1) stretches into streaks ∝ speed above 0.6× max; FOV stays fixed (top-down: zoom, not FOV).
- **Direct-path framing:** while draw-to-fly is active, frame the player-authored route endpoint
  without biasing the ship toward a target-relative chase position.
- **Mass contrast:** freighter-vs-fighter collision → the *fighter's* camera gets the trauma. Trauma
  applied ∝ Δv of YOUR ship, so the truck barely notices the bicycle. This one rule sells mass.
- `motionReduce` accessibility: shake ×0.3, hit-pause off, streaks halved (existing setting).

### 3. Architecture & wiring
`src/render/camera.js` owns trauma/zoom (render-side, non-sim); subscribes to bus events
(`combat:shieldBreak`, `combat:kill`, `physics:impact {dp}`, `cruise:dropped`, `tether:cut`).
`physics:impact` needs emitting from the collision handler in `core/physics.js` with Δp computed —
verify the impact event exists; if only damage events exist, add Δp to their payload rather than a
new event. Hit-pause: a `renderHold` timer in the render loop; the fixed-step accumulator is
untouched.

### 4. Key code
```js
// camera.js — trauma standard. The ² is not optional; linear shake reads as jitter, not impact.
let trauma = 0;
export function addTrauma(t) { trauma = Math.min(1, trauma + t); }
export function cameraFrame(dt) {
  trauma = Math.max(0, trauma - 1.8 * dt);
  const s = trauma * trauma;
  cam.position.x += (noise1(t * 31) - 0.5) * s * MAX_SHAKE;   // seeded noise, NOT Math.random —
  cam.position.z += (noise1(t * 47) - 0.5) * s * MAX_SHAKE;   // render may not touch sim RNG anyway
}
```

### 5–6. Assets / deps
None / none. Near-mote streak layer is SPEC3-33's parallax stack; this spec only drives its stretch.

### 7. Build plan
1. Trauma scalar + sources + `scripts/check-camera-trauma.mjs` (scripted impacts → assert trauma
   curve + decay; assert sim hash unchanged with juice on/off — the critical determinism proof).
2. Hit-pause render-hold; assert tick count unaffected in the same check.
3. Zoom/streak speed read; direct-path composition.
4. Extend `check:camera` composition suite.

### 8. Anti-patterns
Linear shake; sim-side pauses; trauma from damage numbers instead of momentum; shake at rest
(pillar: nothing moves unless the world moved); FOV changes in a top-down game.

### 9. Ambition ceiling
Kill-cam micro-beat: on boss kill (SPEC3-22), 0.6 s slow-render (sim untouched) + zoom punch — the
one sanctioned violation of "camera never performs," reserved for named enemies.
