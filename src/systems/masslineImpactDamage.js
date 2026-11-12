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
//
// ROW 482 (ROCK-GUN, build_map §33.1) — "the rock is the gun": these are the impact-payoff
// coefficients on the player's own thrown bodies. Every scale here reads the SAME momentum /
// impulse input the victim-side packets read (mass × relative speed), so the club half and the
// victim half of one impact stay proportionate; the club deliberately pays MORE than the struck
// hull (being ammunition hurts). The tuning rewards multi-kill packing: a caught hull swung
// through a pack survives several committed contacts (the recoil per contact is bounded by
// RECOIL_DAMAGE_MAX), so one throw can sweep multiple packmates before the club breaks.
// BEFORE the 2026-10-23 guns-nudge retune: MOMENTUM_DAMAGE_SCALE 1/250, TUMBLE_DAMAGE_SCALE
// 1/60, TUMBLE_IMPACT_MIN_DP 400 (a flung Wasp at 100 WU/s chipped itself for ~4 — noise next
// to the gun grind the retune removes). Pinned by test/zc-a34-guns-nudge.test.mjs.
import { massline2Flag } from '../data/featureFlags.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { isMasslineTumbling } from '../combat/tumbleStatus.js';
import { isHostileToPlayer } from './scanner.js';

export const MOMENTUM_DAMAGE_SCALE = 1 / 100;   // momentum -> recoil damage on the thrown body
export const WHIP_RECOIL_FRACTION = 0.65;       // thrown ship's share of the damage its impact dealt
export const RECOIL_DAMAGE_MAX = 300;
export const TUMBLE_IMPACT_MIN_DP = 300;        // physics:impact dp floor before a tumble contact hurts
export const TUMBLE_DAMAGE_SCALE = 1 / 40;      // dp -> damage (dp is impulse x material impactScale)
export const TUMBLE_DAMAGE_MAX = 300;
export const MONOFILAMENT_DAMAGE_SCALE = 1 / 1600;
export const MONOFILAMENT_DAMAGE_MAX = 35;
const DAMAGEABLE = new Set(['ship', 'drone']);

const _kineticHitPos = { x: 0, z: 0 };
const _kineticSource = { kind: null };
const _kineticOrigin = { kind: null, id: null };
const _KINETIC_PACKET_FLAGS = Object.freeze({ ignoreFriendlyFire: true, allowAnyTarget: true });
const _routeDamageArgs = { attackerId: null, targetId: null, packet: null, origin: null };

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
      this._unsubs.push(this.bus.on('massline:sweepImpact', (p) => this._onSweepImpact(p || {})));
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
    // PQ-009-marked contacts are resolved by collisionConsequences for every impulse source.
    // Keeping the older Massline-only fallback for unmarked fixtures/compatibility avoids applying
    // two terrain hits to the same tumbling hull on the shipped SG-02 route.
    if (payload.consequenceKernelVersion === 1) return;
    if (!massline2Flag('impactDamage') || !massline2Flag('tumble')) return;
    const dp = Math.max(0, Number(payload.dp) || 0);
    if (dp < TUMBLE_IMPACT_MIN_DP) return;
    for (const id of [payload.aId, payload.bId]) {
      const e = this._entity(id);
      if (!e || e.alive === false || !DAMAGEABLE.has(e.type)) continue;
      if (e.id === this.state.playerId) continue;          // invariant: never the player
      if (!isMasslineTumbling(this.state, e)) continue;     // only uncontrolled hulls get hurt
      const damage = Math.min(TUMBLE_DAMAGE_MAX, dp * TUMBLE_DAMAGE_SCALE);
      if (damage <= 0) continue;
      this._routeKinetic(e, damage, 'massline_tumble_impact', payload.pos);
    }
  },

  _onSweepImpact(payload) {
    const features = this.state.runtime && this.state.runtime.features;
    if (!massline2Flag('masslineHeadMonofilamentSweep', features)) return;
    if (payload.headId !== 'monofilament_sweep') return;
    if (payload.rating !== 'solid' && payload.rating !== 'crushing') return;
    const victim = this._entity(payload.victimId);
    if (!victim || victim.alive === false || !victim.pos || !DAMAGEABLE.has(victim.type)) return;
    if (victim.id === this.state.playerId) return;
    const player = this._entity(this.state.playerId);
    if (!player || !isHostileToPlayer(victim, player.team, this.state)) return;
    const momentum = Math.max(0, Number(payload.momentum) || 0);
    const damage = Math.min(MONOFILAMENT_DAMAGE_MAX, momentum * MONOFILAMENT_DAMAGE_SCALE);
    if (damage <= 0) return;
    this._routeKinetic(victim, damage, 'massline_monofilament_sweep', payload.pos);
  },

  _routeKinetic(target, damage, sourceKind, pos = null) {
    const kernel = combatKernel(this);
    if (!kernel || typeof kernel.routeDamage !== 'function') return;
    // Sync-read scratches: normalizeDamagePacket copies pos/source/flags field-by-field and
    // routeDamage reads the args wrapper without retaining it.
    _kineticHitPos.x = pos && Number.isFinite(pos.x) ? pos.x : target.pos.x;
    _kineticHitPos.z = pos && Number.isFinite(pos.z) ? pos.z : target.pos.z;
    _kineticSource.kind = sourceKind;
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'kinetic',
      pos: _kineticHitPos,
      source: _kineticSource,
    });
    packet.flags = _KINETIC_PACKET_FLAGS;
    _routeDamageArgs.attackerId = this.state.playerId;
    _routeDamageArgs.targetId = target.id;
    _routeDamageArgs.packet = packet;
    _kineticOrigin.kind = sourceKind;
    _kineticOrigin.id = target.id;
    _routeDamageArgs.origin = _kineticOrigin;
    kernel.routeDamage(_routeDamageArgs);
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
