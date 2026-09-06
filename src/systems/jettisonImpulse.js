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

const JETTISON_EJECT_SPEED = 60;   // wu/s the dumped mass is "pushed" backward at
const JETTISON_DV_MAX = 45;        // wu/s cap so a full-hold dump is a kick, not a teleport

const MASS_BY_ID = new Map((COMMODITIES || []).map((c) => [c.id, c]));

export const jettisonImpulse = {
  id: 'jettisonImpulse',
  name: 'jettisonImpulse',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      this._unsubs.push(this.bus.on('cargo:jettisoned', (p) => this._onJettison(p || {})));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update() {},

  _onJettison(payload) {
    if (!massline2Flag('jettisonImpulse')) return;
    const state = this.state;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || player.flags && player.flags.docked) return;
    const physics = this.helpers && this.helpers.combatPhysics;
    if (!physics || typeof physics.applyImpulse !== 'function') return;

    const qty = Math.max(0, Number(payload.amount) || 0);
    if (!(qty > 0)) return;
    // The kick's audio is the dump's voice, not the kick's: any real dump speaks, even a token
    // one whose dv is below the physical-kick floor (otherwise small gas dumps are fully silent
    // on routes where this flag is on and the audioSystem's own handler is gated off).
    this.bus.emit('audio:cue', { id: 'massline.jettisonKick' });
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
  },
};
