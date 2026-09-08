// BP-13/B7 Fake-Civilian-Until-Scan.
//
// Listens to the existing scanner pulse event and reveals disguised pirate traffic. Scanner/HUD
// remain unchanged; after reveal, their existing contact readers see ordinary hostile AI fields.
import { revealPirateDisguise, shouldRevealOnScan } from '../data/pirateDisguise.js';

export const pirateDisguise = {
  name: 'pirateDisguise',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._onScanPulse = (p) => this._scan(p);
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('scan:pulse', this._onScanPulse);
    }
  },

  _scan(payload) {
    const state = this.state;
    const pos = payload && payload.pos;
    if (!state || !pos) return;
    const list = Array.isArray(state.entityList) ? state.entityList : [];
    for (const entity of list) {
      if (!shouldRevealOnScan(entity, pos)) continue;
      const reveal = revealPirateDisguise(entity, state, { by: 'scan' });
      if (!reveal) continue;
      this._speak(entity, reveal);
      this._emit('pirateDisguise:revealed', reveal);
    }
  },

  _speak(entity, reveal) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text: reveal.text,
        kind: 'pirateDisguise',
        ttl: 1,
        id: `pirateDisguise:${entity.id}`,
        factionId: entity.factionId,
      });
    } else {
      this._emit('toast', { text: reveal.text, kind: 'pirateDisguise', ttl: 1 });
    }
    this._emit('pirateDisguise:voice', {
      entityId: entity.id,
      situation: reveal.situation,
      text: reveal.text,
      factionId: entity.factionId,
    });
  },

  _emit(evt, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(evt, payload);
  },

  destroy() {
    if (this.bus && this._onScanPulse && typeof this.bus.off === 'function') {
      this.bus.off('scan:pulse', this._onScanPulse);
    }
    this._onScanPulse = null;
  },
};

export default pirateDisguise;
