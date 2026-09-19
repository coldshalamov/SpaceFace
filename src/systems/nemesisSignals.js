// Event-only presentation adapter. Existing voice/toast/news owners render these receipts.
// No DOM, sound synthesis, simulation-state mutation or extra animation loop.
import { NEMESIS_RIVAL as RIVAL } from '../data/nemesisRival.js';

export function createNemesisSignals() {
  return {
    name: 'nemesisSignals',
    init(ctx) {
      this.destroy(); this._offs = [];
      const on = (name, fn) => this._offs.push(ctx.bus.on(name, fn));
      on('nemesis:announced', (p) => ctx.bus.emit('toast', {
        text: `COUNTEREXAMPLE INBOUND — ${p.tell} Counterplay: ${p.opening}`, kind: 'warn',
      }));
      on('nemesis:voice', (p) => {
        const voice = ctx.helpers && ctx.helpers.voice;
        if (voice && typeof voice.say === 'function') voice.say({
          channel: 'bark', kind: 'nemesis', id: `${p.encounterId}:${p.situation}:${p.t}`,
          text: p.text, factionId: RIVAL.factionId, ttl: 6,
        });
      });
      on('nemesis:surrenderOffered', (p) => ctx.bus.emit('toast', {
        text: 'COUNTEREXAMPLE SURRENDERS — Orra has ceased fire. Hold fire and accept the surrender in comms, or finish the fight.',
        kind: 'info',
      }));
      on('nemesis:resolved', (p) => ctx.bus.emit('news:headline', {
        headline: p.ending === 'spared' ? 'Counterexample stands down. Orra closes the file.'
          : p.ending === 'destroyed' ? 'Counterexample destroyed. The Revision has lost its captain.'
            : 'Counterexample lost. No player victory confirmed.',
        kind: 'nemesis-resolution', aceId: RIVAL.id,
      }));
    },
    destroy() {
      if (Object.hasOwn(this, '_offs')) for (const off of this._offs || []) if (typeof off === 'function') off();
      this._offs = [];
    },
  };
}
export const nemesisSignals = createNemesisSignals();
export default nemesisSignals;
