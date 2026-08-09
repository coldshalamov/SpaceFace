// VFX NEXT — library entry point.
//
// ISOLATED AND ADDITIVE BY DESIGN. Nothing under src/ imports this tree, and this tree imports
// nothing from src/render/. Both directions matter:
//
//   * unimported downward, so the library cannot affect the live game, the goldens, or the frame
//     budget until someone deliberately wires one effect;
//   * importing nothing upward, so a promoted effect carries no dependency on live internals and
//     can genuinely be swapped in one at a time, which is what the brief asks for.
//
// `src/vfxnext/` sits outside the reachability ratchet's roots (src/systems/, src/ui/, src/render/
// — see test/src-reachability.baseline.json), so an unwired library here is not an orphan failure.
// PROMOTION MOVES THAT: the moment an effect lands in src/render/ it becomes ratcheted and must be
// reachable from src/main.js, which is exactly the right place for that gate to bite.
//
// ── Promotion adapter shape ────────────────────────────────────────────────────────────────────
// Wiring one family is a translation from an existing bus payload into one ForceRecord. The live
// handlers already carry the truth; the adapter is the only new code:
//
//   src/render/vfx.js handler          ->  family id            ->  record fields to fill
//   _onProjectileHit                       impact_normal            pos, dir(projectile), v(target),
//                                                                   severity, seed, surface normal
//   _onDamage (heavy/kinetic)              impact_concussion        pos, dir OR axis, impulse, v
//   _onCollisionConsequence                impact_concussion        pos, AXIS ONLY (never dir),
//                                                                   impulse, severity
//   _onKilled / _onDestroyed (light)       destruction_light        pos, v(target at death),
//                                                                   dir(killing) if lethal receipt
//   _onDestroyed (capital)                 explosion_heavy          as above, radius = hull size
//   _onThrust / _onBoost                   thruster_boost   [hold]  pos(nozzle), dir(thrust),
//                                                                   severity = throttle, v
//   cruise / high-speed state              speed_extreme    [hold]  pos, v, severity = speed band
//   _onTetherLatch                         massline_latch           pos(ship), dir->anchor,
//                                                                   radius = line length
//   tether phase/load                      massline_tension [hold]  same + impulse = load
//   _onTetherRelease / _onTetherSnap       massline_release         same + v = retained velocity
//   field_well_standard / mass_seed        field_attractor  [hold]  pos, radius, severity
//   field_repulsor_standard                field_repulsor   [hold]  pos, radius, severity
//   (no live producer yet)                 reentry          [hold]  pos, v(relative), severity ramp
//
// The one rule an adapter must not break: `combat:collisionConsequence` supplies an UNORIENTED
// axis. Call setAxis(), never setDir(). See core/force.js and bible §6/§7.

import { createStage, DEFAULT_BUDGETS } from './core/stage.js';
import { IMPACT_FAMILIES } from './families/impacts.js';
import { DESTRUCTION_FAMILIES } from './families/destruction.js';
import { PROPULSION_FAMILIES } from './families/propulsion.js';
import { MASSLINE_FAMILIES } from './families/massline.js';
import { FIELD_FAMILIES } from './families/fields.js';
import { REENTRY_FAMILIES } from './families/reentry.js';

export const ALL_FAMILIES = [
  ...IMPACT_FAMILIES,
  ...DESTRUCTION_FAMILIES,
  ...PROPULSION_FAMILIES,
  ...MASSLINE_FAMILIES,
  ...FIELD_FAMILIES,
  ...REENTRY_FAMILIES,
];

/** Families that are driven by a continuous state (hold/release) rather than an event (emit). */
export const SUSTAINED_IDS = ALL_FAMILIES.filter((f) => typeof f.tick === 'function').map((f) => f.id);
export const ONE_SHOT_IDS = ALL_FAMILIES.filter((f) => typeof f.emit === 'function').map((f) => f.id);

export function createVfxNext(scene, opts = {}) {
  const stage = createStage(scene, opts);
  for (const family of ALL_FAMILIES) stage.register(family);
  return stage;
}

/** Sum of every family's declared budget — the worst case if all twelve ran at once, which is not a
 *  scenario the game produces but IS the number a pool has to survive without evicting a hero
 *  event. Printed by the lab so the headroom claim is checkable rather than asserted. */
export function totalDeclaredBudget() {
  const total = { sparks: 0, smoke: 0, debris: 0, fronts: 0, ribbons: 0, lights: 0 };
  for (const f of ALL_FAMILIES) {
    for (const k of Object.keys(total)) total[k] += (f.budget && f.budget[k]) || 0;
  }
  return total;
}

export { createStage, DEFAULT_BUDGETS };
export * from './core/force.js';
