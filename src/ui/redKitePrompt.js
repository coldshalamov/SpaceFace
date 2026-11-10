import { getPromptDeck } from './promptDeck.js';

export const redKitePrompt = {
  name: 'redKitePrompt',
  init(ctx) {
    this.bus = ctx.bus; this._subs = [ctx.bus.on('redKite:offer', row => this.offer(row))];
    for (const event of ['redKite:started', 'redKite:aborted', 'sector:exit', 'dock:docked', 'save:restoring'])
      this._subs.push(ctx.bus.on(event, () => this.newGame()));
  },
  offer(row) {
    const choices = [{ id: 'course', label: 'PLOT TIMING BUOY', title: 'Inspect the marked course. This sets a course without engaging autopilot.' }];
    if (row.canStart) choices.unshift({ id: 'start', label: row.solo ? 'RUN PUBLIC TIME TRIAL' : 'RACE RED KITE' });
    choices.push({ id: 'leave', label: 'MAYBE NEXT RUN', cancel: true });
    return getPromptDeck()?.offerDecision({ id: 'red-kite:relay', kind: 'info', sender: row.solo ? 'RED KITE — PUBLIC TIMING BUOY' : 'RED KITE',
      headline: 'Three handoffs. Your ship. Your route.', statusFlag: row.canStart ? 'READY AT START · NO STAKES' : row.reason,
      detail: row.detail, choices, onChoose: id => {
        this.newGame();
        if (id === 'course') this.bus.emit('redKite:course');
        if (id === 'start') this.bus.emit('redKite:start', { revision: row.revision });
      } }) || false;
  },
  newGame() { getPromptDeck()?.resolveDecision('red-kite:relay'); },
  destroy() { this.newGame(); for (const off of this._subs || []) off(); },
};
