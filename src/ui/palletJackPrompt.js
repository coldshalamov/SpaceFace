import { getPromptDeck } from './promptDeck.js';

export const palletJackPrompt = {
  name: 'palletJackPrompt',
  init(ctx) {
    this.bus = ctx.bus; this._subs = [ctx.bus.on('palletJack:offer', row => this.offer(row))];
    for (const name of ['sector:exit', 'dock:docked', 'save:restoring', 'palletJack:released', 'palletJack:lost'])
      this._subs.push(ctx.bus.on(name, () => this.newGame()));
  },
  offer(row) {
    const choices = [];
    if (row.canDemandDrop) choices.push({ id: 'drop', label: 'OPEN THE CLAMP', title: 'Demand release of this original body. No fee or inventory transfer.' });
    choices.push({ id: 'trail', label: 'PLOT THE ORIGINAL LOAD', title: 'Follow this same cargo provenance and real escape endpoint.' });
    choices.push({ id: 'leave', label: 'KEEP FLYING', cancel: true });
    return getPromptDeck()?.offerDecision({ id: 'pallet-jack:freight', sender: 'PALLET JACK', kind: 'info',
      headline: row.canDemandDrop ? 'We can all become less involved.' : 'Unsecured freight. Tragic oversight.',
      statusFlag: row.status, detail: row.detail, choices,
      onChoose: id => { this.newGame();
        if (id === 'drop') this.bus.emit('palletJack:drop', { incidentId: row.incidentId, revision: row.revision });
        if (id === 'trail') this.bus.emit('palletJack:trail', { incidentId: row.incidentId });
      } }) || false;
  },
  newGame() { getPromptDeck()?.resolveDecision('pallet-jack:freight'); },
  destroy() { this.newGame(); for (const off of this._subs || []) off(); },
};
