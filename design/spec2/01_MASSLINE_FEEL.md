# SPEC2/01 — MASSLINE FEEL: from "boink" to swing

**Owner lane:** sim/physics agent (Codex-class). Read `spec2/00_MASTER_TASTE.md` first.
**Files:** `src/core/sg02DynamicBodyOwner.js` (joint model), `src/data/combatDefs.js` (tune tables),
`src/systems/tetherGameplay.js` (phase mirror only), new `scripts/check-massline-feel.mjs`.
**Do not touch:** vfx.js (visual already binds to the mirror), input.js, UI.

## 1. The bug being fixed (verbatim player report)
"When I snag something going by, it doesn't smoothly pull taut and then swing my ship around — as
soon as it pulls tight it just boinks me back at what I'm snagged on, 100% of the time."

**Root cause (verified):** `_createAttachmentJoints` at `src/core/sg02DynamicBodyOwner.js:497` uses
`RAPIER.JointData.rope(restLength, anchorA, anchorB)` — a HARD unilateral limit. The solver resolves
taut-crossing radial velocity impulsively in one step: an elastic bounce along the rope axis. The
`stiffness: 90, damping: 6` values in `combatDefs` `break` blocks are used ONLY by the telemetry
formula (`tension = stretch*stiffness + radialSpeed*damping`) — the actual joint never sees them.

## 2. The model to implement: damped-spring capture (no rope joint)
Replace the rope joint for `tether_standard` and `attachment_massline` with a **custom radial
spring-damper impulse** applied by the sg02 owner each physics tick (the owner already owns
attachment stepping and applies impulses; keep `setContactsEnabled(false)` behavior between the
paired bodies).

Per tick, for an active attachment:
```
d      = |anchorBworld - anchorAworld|            // current anchor separation
stretch = max(0, d - restLength)
if (stretch == 0): no force. The line NEVER pushes. (unilateral)
u      = (anchorB - anchorA) / d                  // radial unit vector, A→B
vRel   = dot(velB - velA, u)                      // radial closing(+)/opening(-) speed
F      = K(t) * stretch + C * vRel                // scalar along u; clamp F >= 0 (never push)
impulseA = +u * F * dt ; impulseB = -u * F * dt   // applied at the ANCHOR OFFSETS (torque preserved)
```
- **K (stiffness)** and **C (damping)** come from the def's `spring` block (new, see §4).
- **Capture ramp — the actual anti-boink:** on the tick where stretch first becomes > 0 after a
  slack period ≥ 0.1 s, start `captureT = 0`. While `captureT < CAPTURE_S`:
  `K(t) = K * smoothstep(captureT / CAPTURE_S)²`, `C(t) = C * (0.5 + 0.5 * smoothstep(...))`.
  `CAPTURE_S = 0.35`. This spreads the radial-velocity kill over ~21 ticks instead of 1. Tangential
  velocity is untouched by construction (force is purely radial) → momentum converts into swing.
- **Critical damping target:** with reduced mass `μ = mA*mB/(mA+mB)`, choose C so that
  `ζ = C / (2 * sqrt(K * μ))` lands in **0.85–1.05** for the scout-vs-mid-asteroid pairing
  (Wasp mass 16 vs asteroid mass ~55 → μ ≈ 12.4). ζ < 0.7 feels bungee; ζ > 1.3 feels like the old
  rope. Derive C at runtime from actual body masses: `C = 2 * ζ_target * sqrt(K * μ)`, ζ_target from
  the def. This keeps the feel constant across mass ratios — heavy ships load the line harder but
  nothing ever twangs.
- **Max stretch guard:** if `stretch > restLength * 0.45`, break the line (reason 'threshold') —
  a spring must not silently stretch to silly lengths. Telemetry tension continues to use the same
  formula but now reads the REAL spring force: `tension = F / dt` equivalent (report `K*stretch +
  C*max(0, vRel)` so strain color/HUD behave identically).
- **Reel interaction:** winching (restLength changes) must never inject energy: when reeling IN,
  clamp restLength reduction so `stretch` never exceeds the break guard within one tick; when the
  reel would do so, slow the winch (`restLength -= min(reelStep, allowed)`).

## 3. Phase state (mirror for visuals/audio — tetherGameplay writes, others read)
Extend `state.player.tether` with `phase: 'slack' | 'capture' | 'loaded' | 'overload'`:
slack (stretch=0), capture (captureT < CAPTURE_S), loaded (steady, tension < 0.75·break),
overload (≥ 0.75·break). The cable visual already colors by strain; audio (spec2/07) binds hum
pitch to phase. No other schema changes.

## 4. Tune table (add `spring` block to both defs in `src/data/combatDefs.js`)
```
tether_standard:    spring: { K: 140, zeta: 0.95, captureS: 0.35 }
attachment_massline: spring: { K: 170, zeta: 0.90, captureS: 0.30 }
```
Keep existing `break` blocks (standard maxTension 2600 -> 12000 and maxImpulse 90 -> 220 because real
spring-force telemetry peaks above the old rope proxy during the accepted mid-asteroid slingshot) —
they now measure real spring force, so verify the three tether contracts still pass and adjust
`break.maxTension` (not the spring) if the overload scenario needs it. Socket stays `[0.3, 0.15]`
(three-way tune — see the comment in combatDefs; do not move it without re-running all three tether
checks).

## 5. The feel matrix (what each pairing must produce)
| Player ship | Target | Expected behavior |
|---|---|---|
| Scout (m16) | Mid asteroid (m50+) | Ship swings a smooth arc; asteroid barely moves (< 8% of ship's speed change) |
| Scout | Light drone (m6) | Drone is YANKED along; ship path deflects < 15° |
| Hauler (m60) | Scout-class ship (m16) | Target whipped through > 90° of arc in < 1.5 s at 120 wu/s |
| Any | Station anchor (static) | Pure pendulum; ordinary boost and a botched swing do not auto-break the standard line |

## 6. Acceptance assertions (`scripts/check-massline-feel.mjs`, sim harness, deterministic)
Scenario: player at 150 wu/s passes a static-ish mid asteroid, perpendicular miss distance = 0.8 ×
restLength; latch at closest approach; coast (no thrust) 2.0 s; cut at the tangent point.
1. **No boink:** radial velocity component after capture completes is ≤ **15%** of its pre-taut
   magnitude AND never REVERSES sign by more than 10% of pre-taut magnitude at any tick (a bounce
   reverses it ~100%).
2. **Swing preserved:** tangential speed at t = capture+0.5 s ≥ **85%** of pre-taut tangential speed.
3. **Smoothness:** per-tick speed delta during capture ≤ **9 wu/s per tick** (no impulsive spike;
   old rope produced 40+).
4. **Arc monotonic:** heading change accumulates monotonically (same sign) from taut to cut.
5. **Slingshot contract intact:** release preserves real momentum and adds only
   `15% × actual exit speed × live line load` along the real exit vector. Slack, unloaded, and
   near-stationary releases add zero. Any old fixed `exit ≥ 1.25×` assertion is stale; do not restore
   a flat launch or change rope physics to satisfy it.
6. All of: `check:sg02:tether`, `check:sg02:tether-break`, `check:sim:compare` (hashEqual:true).

## 7. Explicitly out of scope here
Cable visual (already shipped, binds to mirror), reel keybinds, NPC counter-tether AI, energy cost.
