// Jettison-as-impulse (Wave M2 §5.3, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// Cargo has real mass; dumping it is reaction mass. One honest equation: the ship gains
// ejectedMass x ejectSpeed / shipMass of forward velocity, applied through the physics authority
// (never a direct vel write). A panic button that doubles as a bribe — the pirate chooses between
// chasing you and scooping your ore.
//
// Listens to the additive `cargo:jettisoned` seam (cargo.js emits it unconditionally; the event
// itself is not state and nothing in the sim harness subscribes). Flag-gated; player-only.
import { massline2Flag } from '../data/featureFlags.js';
import { COMMODITIES } from '../data/commodities.js';
import { recordImpulseProvenance } from '../combat/impulseKernel.js';

const JETTISON_EJECT_SPEED = 60;   // wu/s the dumped mass is "pushed" backward at
const JETTISON_DV_MAX = 45;        // wu/s cap so a full-hold dump is a kick, not a teleport
const POD_RECOVERY_MAX_REL_SPEED = 14;

const MASS_BY_ID = new Map((COMMODITIES || []).map((c) => [c.id, c]));

export const jettisonImpulse = {
  id: 'jettisonImpulse',
  name: 'jettisonImpulse',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._unsubs = [];
    this._pendingPodIds = new Set();
    this._rebuildPendingPods();
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('cargo:jettisoned', (p) => this._onJettison(p || {})));
      this._unsubs.push(this.bus.on('physics:impact', (p) => this._onImpact(p || {})));
      this._unsubs.push(this.bus.on('save:loaded', () => this._rebuildPendingPods()));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
    this._pendingPodIds?.clear();
  },

  update(_dt, state) {
    const now = Number(state && state.simTime) || 0;
    for (const podId of this._pendingPodIds || []) {
      const entity = state && state.entities && state.entities.get && state.entities.get(podId);
      const data = entity && entity.data;
      if (!entity || entity.alive === false || !data || data.recoverableCargoPod !== true) {
        this._pendingPodIds.delete(podId);
        continue;
      }
      if (entity.collides !== false) {
        this._pendingPodIds.delete(podId);
        continue;
      }
      if (now < Number(data.pickupEmbargoUntil)) continue;
      entity.collides = true;
      if (entity.physicsBody && typeof entity.physicsBody === 'object') {
        entity.physicsBody.material = String(data.solidMaterialAfterEmbargo || 'payload');
        entity.physicsBody.revision = Math.max(0, Math.trunc(Number(entity.physicsBody.revision) || 0)) + 1;
      }
      if (this.helpers && typeof this.helpers.refreshEntityIndex === 'function') {
        this.helpers.refreshEntityIndex(entity);
      }
      this.bus.emit('cargo:podArmed', {
        podId: entity.id,
        commodityId: data.commodityId,
        amount: data.amount,
        tick: state.tick | 0,
      });
      this._pendingPodIds.delete(podId);
    }
  },

  _onJettison(payload) {
    const state = this.state;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || player.flags && player.flags.docked) return;
    const podIds = Array.isArray(payload.podIds) ? payload.podIds : [];
    for (const podId of podIds) {
      const pod = state.entities && state.entities.get && state.entities.get(podId);
      if (!pod || pod.alive === false || pod.data?.recoverableCargoPod !== true) continue;
      if (pod.collides === false) this._pendingPodIds.add(pod.id);
      recordImpulseProvenance(pod, {
        actorId: player.id,
        weaponId: 'cargo_pod',
        tag: 'cargo_jettison',
        appliedTick: state.tick,
        magnitude: Math.max(0, Number(pod.mass) || 0) * JETTISON_EJECT_SPEED,
      });
    }
    if (!massline2Flag('jettisonImpulse')) return;
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return;

    const qty = Math.max(0, Number(payload.amount) || 0);
    if (!(qty > 0)) return;
    const def = MASS_BY_ID.get(payload.commodityId);
    const unitMass = def && Number.isFinite(def.massPerU) ? def.massPerU : 0.5;
    const shipMass = Math.max(0.1, Number.isFinite(player.mass) ? player.mass : 18);
    const dv = Math.min(JETTISON_DV_MAX, (qty * unitMass * JETTISON_EJECT_SPEED) / shipMass);
    if (!(dv > 0.5)) return;   // token dumps don't kick

    const rot = Number.isFinite(player.rot) ? player.rot : 0;
    physics.applyImpulse({
      entityId: player.id,
      impulse: { x: Math.cos(rot) * dv * shipMass, z: Math.sin(rot) * dv * shipMass },
      point: null,
      reason: 'cargo_jettison',
      tick: state.tick,
    });
    this.bus.emit('audio:cue', { id: 'massline.jettisonKick' });
  },

  _onImpact(payload) {
    const state = this.state;
    if (!state || payload.aId == null || payload.bId == null) return;
    const a = state.entities && state.entities.get && state.entities.get(payload.aId);
    const b = state.entities && state.entities.get && state.entities.get(payload.bId);
    const pod = a && a.data?.recoverableCargoPod === true ? a
      : b && b.data?.recoverableCargoPod === true ? b : null;
    const other = pod === a ? b : pod === b ? a : null;
    if (!pod || !other || pod.alive === false || other.alive === false) return;

    if (other.id !== state.playerId) {
      if (other.type === 'ship' || other.type === 'drone') {
        this.bus.emit('cargo:podStrike', {
          podId: pod.id,
          targetId: other.id,
          sourceActorId: pod.data.sourceActorId == null ? null : pod.data.sourceActorId,
          impulse: Math.max(0, Number(payload.impulse ?? payload.dp) || 0),
          tick: Number.isFinite(payload.tick) ? payload.tick : state.tick | 0,
        });
      }
      return;
    }

    const relativeSpeed = Math.hypot(
      (Number(pod.vel && pod.vel.x) || 0) - (Number(other.vel && other.vel.x) || 0),
      (Number(pod.vel && pod.vel.z) || 0) - (Number(other.vel && other.vel.z) || 0),
    );
    if (relativeSpeed > POD_RECOVERY_MAX_REL_SPEED) return;
    const amount = Math.max(0, Math.floor(Number(pod.data.amount) || 0));
    if (amount <= 0) return;
    const collection = {
      pickupId: pod.id,
      collectorId: other.id,
      kind: 'cargo',
      commodityId: pod.data.commodityId,
      amount,
      pos: { x: Number(pod.pos && pod.pos.x) || 0, z: Number(pod.pos && pod.pos.z) || 0 },
      richLotSource: pod.data.richLotSource || null,
    };
    this.bus.emit('pickup:collected', collection);
    const accepted = Math.max(0, Math.floor(Number(collection.acceptedAmount) || 0));
    if (accepted <= 0) return;
    pod.data.amount = Math.max(0, amount - accepted);
    if (pod.data.amount <= 0) pod.alive = false;
    this.bus.emit('cargo:podRecovered', {
      podId: pod.id,
      commodityId: pod.data.commodityId,
      amount: accepted,
      remainingAmount: pod.data.amount,
      tick: Number.isFinite(payload.tick) ? payload.tick : state.tick | 0,
    });
  },

  _rebuildPendingPods() {
    if (!this._pendingPodIds) this._pendingPodIds = new Set();
    this._pendingPodIds.clear();
    const list = this.state && Array.isArray(this.state.entityList) ? this.state.entityList : [];
    for (const entity of list) {
      if (entity && entity.alive !== false && entity.collides === false
        && entity.data?.recoverableCargoPod === true) this._pendingPodIds.add(entity.id);
    }
  },
};
