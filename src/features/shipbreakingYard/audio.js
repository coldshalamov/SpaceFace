/** Reuse the gesture-gated game mixer and existing authored sounds. One voice per semantic event. */
export const YARD_AUDIO_CUES = Object.freeze({
  discovered: Object.freeze({ id: 'scan_resolve', gain: .42, cooldownS: 8 }),
  strain: Object.freeze({ id: 'sfx_tether_strain_creak', gain: .35, cooldownS: 2.5 }),
  released: Object.freeze({ id: 'sfx_salvage_hydraulic', gain: .55, cooldownS: .15 }),
  hazard: Object.freeze({ id: 'warning', gain: .55, cooldownS: 2 }),
  delivered: Object.freeze({ id: 'sfx_cargo_seat_thunk', gain: .65, cooldownS: .25 }),
});
export function createShipbreakingYardAudio() {
  return {
    name: 'shipbreakingYardAudio',
    init(ctx) {
      this.destroy(); this._bus = ctx.bus; this._state = ctx.state; this._last = new Map();
      const bus = this._bus, listener = cue => this.cue(cue);
      // Mapping is cheap and synchronous; the existing mixer owns playback scheduling.
      // A presentation-queued callback could otherwise outlive destroy/newGame and
      // accidentally voice an old run's cue against this adapter's new context.
      const remove = bus.on('shipbreakingYard:cue', listener);
      this._off = typeof remove === 'function' ? remove : () => bus.off?.('shipbreakingYard:cue', listener);
    },
    cue(cue) {
      const recipe = YARD_AUDIO_CUES[cue?.kind]; if (!recipe || !this._bus) return false;
      // Native Massline/combat audio owns its own sound. The adapter only voices yard-specific changes.
      if (cue.playbackOwnedByRaw === true) return false;
      const now = Number(this._state?.simTime) || 0, key = cue.kind;
      const before = this._last.get(key); if (Number.isFinite(before) && now >= before && now - before < recipe.cooldownS) return false;
      this._last.set(key, now);
      this._bus.emit('audio:cue', { id: recipe.id, gain: recipe.gain, position: cue.pos || null, source: 'shipbreakingYard', cueId: cue.id || null });
      return true;
    },
    newGame() { this._last?.clear(); },
    destroy() { this._off?.(); this._off = null; this._last = new Map(); this._bus = this._state = null; },
  };
}
export const shipbreakingYardAudio = createShipbreakingYardAudio();
export default shipbreakingYardAudio;
