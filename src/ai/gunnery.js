// Gunnery — the player-facing lead-aim façade (BP-02 combat ceiling).
//
// This module exists so the flight HUD can draw a **lead pip** (where to point your nose so a shot
// fired now intercepts a moving target) using the EXACT SAME ballistic solver the sim fire path uses.
// It is a thin, PURE, side-effect-free wrapper over `solveLeadAngle` (exported from systems/weapons.js)
// — never a second solver. A second lead solver is how a pip starts lying: the sim leads one way, the
// pip points another. One model, imported here.
//
// This file must never mutate state or draw RNG. It runs only for the local player's HUD (Tier A —
// render/UI), so it needs no determinism guard. Sim call sites keep calling weapons._leadAngle; they
// do not import this.
import { solveLeadAngle } from '../systems/weapons.js';
import { WEAPONS } from '../data/weapons.js';
import { combatFlag } from '../data/featureFlags.js';

const WPN = new Map(WEAPONS.map((w) => [w.id, w]));
const DEFAULT_PROJ_SPEED = 360; // fallback matching weapons._playerProjSpeed

// Representative projectile speed of a ship's primary (first speed-bearing) gun — what the pip should
// solve for. Mirrors weapons._playerProjSpeed so the pip matches the weapon that will actually fire.
export function primaryProjSpeed(entity) {
  const ws = entity && entity.data && entity.data.weapons;
  if (Array.isArray(ws)) {
    for (const w of ws) {
      const def = WPN.get(w.defId);
      const sp = w.projSpeed != null ? w.projSpeed : (def && def.projSpeed);
      // Continuous beams are hitscan (Infinity speed) — a lead pip is meaningless; skip to a real gun.
      if (Number.isFinite(sp) && sp > 0) return sp;
    }
  }
  return DEFAULT_PROJ_SPEED;
}

// True if `entity` carries any projectile (non-beam) weapon worth showing a lead pip for.
export function hasBallisticWeapon(entity) {
  const ws = entity && entity.data && entity.data.weapons;
  if (!Array.isArray(ws)) return false;
  for (const w of ws) {
    const def = WPN.get(w.defId);
    const sp = w.projSpeed != null ? w.projSpeed : (def && def.projSpeed);
    if (Number.isFinite(sp) && sp > 0) return true;
  }
  return false;
}

// World-space lead solution for a shooter firing at a moving target.
// Returns { valid, angle, x, z, dist } where (x,z) is a point along the lead direction at the target's
// current range — the HUD places the pip there and the player aligns their nose to it. `valid` is false
// when inputs are missing or the target is effectively co-located (no meaningful lead).
export function leadSolution(shooter, target, projSpeed) {
  if (!shooter || !shooter.pos || !shooter.vel || !target || !target.pos) {
    return { valid: false, angle: 0, x: 0, z: 0, dist: 0 };
  }
  const tvel = target.vel || { x: 0, z: 0 };
  const tgt = { pos: target.pos, vel: { x: tvel.x || 0, z: tvel.z || 0 } };
  const speed = Number.isFinite(projSpeed) && projSpeed > 0 ? projSpeed : primaryProjSpeed(shooter);
  const angle = solveLeadAngle(shooter, tgt, speed);
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const dist = Math.hypot(dx, dz);
  if (!(dist > 1e-3)) return { valid: false, angle, x: target.pos.x, z: target.pos.z, dist: 0 };
  // Place the pip along the lead direction at the target's current range (classic offset-ahead pip).
  return {
    valid: true,
    angle,
    x: shooter.pos.x + Math.cos(angle) * dist,
    z: shooter.pos.z + Math.sin(angle) * dist,
    dist,
  };
}

// Whether the current ballistic model matches what the pip assumes. With momentum-inheritance OFF
// (this wave), bullets are aim-true lateral-compensated and solveLeadAngle is exactly correct. If the
// flag is ever enabled the pip would need a matching model; expose the state so the HUD can decide.
export function leadModelIsExact() {
  return !combatFlag('momentumInherit');
}
