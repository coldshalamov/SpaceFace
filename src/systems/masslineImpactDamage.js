// Massline impact-damage additions (Wave M2 §3.5, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// COLLISION ASYMMETRY, stated as the invariant this file enforces: the PLAYER never takes hull
// damage from any physical impact (the shipped baseline — no system deals contact hull damage —
// now kept true by construction in every new path); deliberate player-made kinetic energy DOES
// hurt NPCs and objects. Two additions over the shipped whipDamage consumer (combat.js):
//
//   1. Reciprocal whip damage — a thrown SHIP that smashes into something takes a fraction of
//      the momentum damage it dealt (being used as a club hurts the club).
//   2. Tumble contact damage — a tumbling ship that drifts into a solid body above the shipped
//      whip-impact speed bar takes momentum damage (the "flung him into an asteroid" jackpot).
//
// Both route through the combat kernel like every other damage source (never direct hull writes)
// and are attributed to the player (the fling caused it). combat.js itself is untouched.
import { massline2Flag } from '../data/featureFlags.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';

// Mirror the shipped whip-damage scaling (combat.js: 1/1600 momentum scale, 45 ceiling) so the
// two halves of one impact stay proportionate.
const MOMENTUM_DAMAGE_SCALE = 1 / 1600;
const WHIP_RECOIL_FRACTION = 0.35;   // thrown ship's share of the damage its impact dealt
const RECOIL_DAMAGE_MAX = 24;
const TUMBLE_IMPACT_MIN_DP = 900;    // physics:impact dp floor before a tumble contact hurts
const TUMBLE_DAMAGE_SCALE = 1 / 220; // dp -> damage (dp is impulse x material impactScale)
const TUMBLE_DAMAGE_MAX = 30;
const DAMAGEABLE = new Set(['ship', 'drone']);

export const masslineImpactDamage = {
  id: 'masslineImpactDamage',
  name: 'masslineImpactDamage',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('tether:whipImpact', (p) => this._onWhipImpact(p || {})));
      this._unsubs.push(this.bus.on('physics:impact', (p) => this._onPhysicsImpact(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  // No per-tick work — the system is purely event-driven. Present for registry symmetry.
  update() {},

  _onWhipImpact(payload) {
    if (!massline2Flag('impactDamage')) return;
    if (payload.rating !== 'solid' && payload.rating !== 'crushing') return;
    const mass = this._entity(payload.targetId); // the whipped mass (masslineImpacts naming)
    if (!mass || mass.alive === false || !DAMAGEABLE.has(mass.type)) return;
    if (mass.id === this.state.playerId) return; // invariant: never the player
    const momentum = Math.max(0, Number(payload.momentum) || 0);
    const damage = Math.min(RECOIL_DAMAGE_MAX, momentum * MOMENTUM_DAMAGE_SCALE * WHIP_RECOIL_FRACTION);
    if (damage <= 0) return;
    this._routeKinetic(mass, damage, 'massline_whip_recoil');
  },

  _onPhysicsImpact(payload) {
    if (!massline2Flag('impactDamage') || !massline2Flag('tumble')) return;
    const dp = Math.max(0, Number(payload.dp) || 0);
    if (dp < TUMBLE_IMPACT_MIN_DP) return;
    for (const id of [payload.aId, payload.bId]) {
      const e = this._entity(id);
      if (!e || e.alive === false || !DAMAGEABLE.has(e.type)) continue;
      if (e.id === this.state.playerId) continue;          // invariant: never the player
      if (!e.data || !e.data.tumble) continue;             // only uncontrolled hulls get hurt
      const damage = Math.min(TUMBLE_DAMAGE_MAX, dp * TUMBLE_DAMAGE_SCALE);
      if (damage <= 0) continue;
      this._routeKinetic(e, damage, 'massline_tumble_impact', payload.pos);
    }
  },

  _routeKinetic(target, damage, sourceKind, pos = null) {
    const kernel = combatKernel(this);
    if (!kernel || typeof kernel.routeDamage !== 'function') return;
    const hitPos = pos && Number.isFinite(pos.x)
      ? { x: pos.x, z: pos.z }
      : { x: target.pos.x, z: target.pos.z };
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'kinetic',
      pos: hitPos,
      source: { kind: sourceKind },
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    kernel.routeDamage({
      attackerId: this.state.playerId,
      targetId: target.id,
      packet,
      origin: { kind: sourceKind, id: target.id },
    });
  },

  _entity(id) {
    if (id == null || !this.state.entities || !this.state.entities.get) return null;
    return this.state.entities.get(id) || null;
  },
};

function combatKernel(host) {
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  if (combat && combat.kernel) return combat.kernel;
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  return actions && actions.kernel ? actions.kernel : null;
}
