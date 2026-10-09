import { getPromptDeck } from './promptDeck.js';
export const borrowedSunPrompt = {
  name: 'borrowedSunPrompt',
  init(ctx) {
    this.bus = ctx.bus; this._subs = [ctx.bus.on('borrowedSun:offer', r => this.offer(r))];
    for (const name of ['sector:exit', 'dock:docked', 'save:restoring', 'borrowedSun:lost'])
      this._subs.push(ctx.bus.on(name, () => this.newGame()));
  },
  offer(row) {
    return getPromptDeck()?.offerDecision({ id: 'borrowed-sun:berth', sender: 'NEMI · BORROWED SUN', kind: 'info',
      headline: 'The light is free. Spare parts are regrettably not.', statusFlag: row.status,
      detail: `${row.detail} ${row.rumor}`,
      choices: [{ id: 'route', label: 'PLOT THE SAFE BERTH', title: 'Use the current fixed service anchor. Trade through the ordinary dock market.' },
        { id: 'leave', label: 'KEEP FLYING', cancel: true }],
      onChoose: id => { this.newGame(); if (id === 'route') this.bus.emit('borrowedSun:route', { visitId: row.visitId }); } }) || false;
  },
  newGame() { getPromptDeck()?.resolveDecision('borrowed-sun:berth'); },
  destroy() { this.newGame(); for (const off of this._subs || []) off(); },
};
