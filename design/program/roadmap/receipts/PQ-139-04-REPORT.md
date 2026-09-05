<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-139.04 — Tumbling ships corkscrew their trail

```text
NOT DONE  PQ-139.04 — the player's contrail now corkscrews with the hull's spin (built, tested, gated, and captured at the shipping camera when a craft slam spun the player), but the ships that get spun most in play are enemies, whose card plumes carry no trail history to corkscrew; that half is the remaining piece.
WHAT I FOUND     A spun ship's exhaust history already traced the tiny circle its nozzle makes, a few units wide, which at the chase camera is narrower than the plume itself and reads as nothing: a tumbling ship looked like a ship flying a straight line.
WHAT I CHANGED   The contrail now records its history with a spin-driven sideways swing across the flown line — nothing at rest, growing with the spin, saturating at a hard tumble at a hull's width — with the phase of the hull's own spin, so a spun ship draws a corkscrew behind it; the plume root stays on the bell and brightness still follows the throttle.
WHAT YOU WILL FEEL   When your ship is spun (a concussion hit, a Massline release gone wrong), the trail behind you corkscrews at the rate you are turning, so the spin reads from across the screen. What has not changed: enemy plumes are card plumes with no history and do not corkscrew, and nothing changes while nobody is spinning.
THE NUMBERS      sideways swing of the recorded trail at a hard tumble (>= 2 rad/s) | 0 | 6 WU (a light hull's width) | visible at the chase camera · swing at rest | 0 | 0 | 0 · samples recorded for the same flight | equal | equal | unchanged · idle VFX budget gate | PASS | PASS | PASS
THE FRAMES       the player's own spin, at the shipping camera: knock strip manifests/crucible/b025ed3a/swarm_piloted-physics_toolkit-s4242 (seed 4242, real time 0.63) — a craft slam half a second in spins the hull (heading jumps over two radians between frames) and frames 4–8 show the trail wrapped around the hull in a bright spiral, frame 12 the hooked trail as the spin dies; before this change the same spin drew a straight line
NEXT             PQ-180.00 the surface manifest (a live writer holds it; take the next free unit)
```

## The mechanism

`src/render/thruster/ribbon/contrailTrail.js` (the contrail's owner; the packet's path list predates
the contrail's move into `src/render/thruster/`):

- `spinHelixOffset(spin, phase)` — pure: `min(1, |spin| / 2 rad/s) * 6 WU * sin(phase)`.
- `update(dt, nozzle, env)` advances a helix phase by `env.spin * dt` and records each sample
  offset across the **flown line** (the perpendicular of the bell's own movement since the last
  recorded sample). The gate that decides whether to record (`MIN_STEP_WU`, the discontinuity
  rule) still reads the raw nozzle, so a spinning ship samples when its bell moves, never because
  the helix turned; the plume root and the ribbon jet never see the offset. The contrail never
  learns the exhaust axis (the B14 technique guard forbids it there, and it holds).
- `src/render/thruster/systems/plasmaStream.js` hands the hull's `angVel` to the trail as `env.spin`.

Brightness with thrust was already true: every sample is born with the drive it had.

## Evidence

- `test/contrail-corkscrew.test.mjs` (2/2): the offset is zero at rest, grows with spin, saturates
  at 6 WU; a spun hull's recorded line swings a hull's width across the flown line with the period
  of the spin while an unspun hull's line is straight to 1e-9; the same flight records the same
  number of samples either way.
- `npm run check:vfx-techniques`: PASS (11 entries, 9 files) — the contrail still never advects
  along the exhaust axis, samples still gate on real bell movement, strands still vary by seed.
- `npm run check:vfx-sleep`: PASS — the idle budget, the steady state, the wake/sleep contracts.

## What remains, exactly

1. `src/render/thruster/systems/continuousPlume.js`: the enemy card plume takes `angVel` from its owner and adds a spin-phased sideways wobble along its length (a uniform on the plume material; zero at rest), so a shoved and spun hostile reads as spun.
2. A `shove_spin` tape: the shove cannon on one light hostile with the cursor held on it until its helm goes (the hitstun law), captured at the shipping camera, so the corkscrew is on a strip a critic can grade.

## What this does not do

Enemy plumes are `ContinuousPlumeSystem` card plumes with no flown history, so a shoved and spun
hostile has no trail to corkscrew; giving those plumes a spin wobble is shader work on the card
plume and is left open here, honestly. The frames row is the player's own spin.
