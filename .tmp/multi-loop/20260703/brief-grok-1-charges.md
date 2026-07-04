# TASK: Impulse charges system — standalone module (SpaceFace WS-D2)

You are grok in the SpaceFace repo (Three.js top-down space game; deterministic XZ-plane sim at 60 Hz;
sim code NEVER imports Three.js). Read `design/GDD_2_0.md` §4.4 and `design/BUILD_PLAN_2_0.md` (ownership
GROK-1) first. Study `src/systems/mining.js` and `src/systems/countermeasures.js` for the exact system
module pattern (registry `{id, init(ctx), update(dt, state)}`, bus events, `state.rng` for randomness).

## Build ONLY these two new files (touch nothing else)
1. `src/data/impulseCharges.js`:
   `export const IMPULSE_CHARGES = { charge_standard: { throwSpeed: 120, stickRadius: 6, armTimeS: 6,
   impulse: <derive>, damage: <small>, radius: 42, falloff: 'linear', maxActive: 4, cargoVolume: 2,
   price: 180 } }` — derive `impulse` so one charge shifts a mid-class ship (~mass in src/data/ships.js)
   by roughly 25 wu/s delta-v at contact, with linear falloff to zero at radius. Document the derivation
   in a comment with the actual mass numbers you read.
2. `src/systems/impulseCharges.js` — a registry-style system:
   - Consumes input contract fields `state.input.actions.chargeThrow` and `.chargeDetonate` (edge bools;
     guard with `?.` — they may not exist yet; do NOT edit src/systems/input.js).
   - Throw: spawn a `charge` entity from the player nose along `aimWorld` direction at throwSpeed inheriting
     player velocity; on first contact within stickRadius of any hull/asteroid, parent to it (store hostId +
     local offset; follow host position each tick). Max 4 active; oldest despawns.
   - Detonate: all ARMED charges (age >= armTimeS is NOT armed-time — armTimeS is the cooldown between
     throws; charges arm instantly on stick, re-read GDD §4.4) explode: apply radial impulse with linear
     falloff to every entity within radius INCLUDING the player (friendly fire true), small damage via the
     existing damage API in `src/combat/damage.js` (find the exported apply function and use it), emit
     `charge:detonated {pos, hits:[ids]}` per charge plus existing VFX cue event pattern
     (`presentation:vfxCue` — copy the payload shape used by combat.js explosions).
   - Impulse application: entities store velocity as vx/vz — apply delta-v = impulse * falloff / mass
     directly. Y stays 0. Deterministic: no Math.random anywhere, `state.rng` only if needed.
   - Charges are consumed from cargo: require `cmdty_impulse_charge` in cargo to throw (add this commodity
     usage via the existing cargo API in `src/systems/cargo.js` — read how ammo/munitions are consumed and
     copy that pattern; if a munitions pattern doesn't exist, gate on credits instead and note it).
3. At the END of your run, print an INTEGRATION NOTE (max 10 lines): the exact registry line to add and
   where, the commodity def to add to src/data/commodities.js (id, name, basePrice, volume — you do NOT
   add it yourself), and any payload-shape assumptions you made.

## Hard constraints
- NEW FILES ONLY. Do not edit ANY existing file — no registry wiring, no commodity def, no input, no UI,
  no render. The lead integrates from your note.
- No Three.js imports. No new deps. Match mining.js style.

## Self-check
Write a tiny throwaway sanity script `.tmp/multi-loop/20260703/grok-charge-sim-check.mjs` that imports your
system, fakes a minimal state with one player + one drone 30 wu apart, throws + sticks + detonates, and
asserts the drone velocity changed away from the blast and player also received impulse. Run it with node,
make it pass, report the output.
