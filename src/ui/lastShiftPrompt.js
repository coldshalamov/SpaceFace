import { getPromptDeck } from './promptDeck.js';

// Event-only adapter over the existing decision deck; receipts use the receipt lane.
export const lastShiftPrompt = {
  name: 'lastShiftPrompt',
  init(ctx) {
    this.bus = ctx.bus; this._deckId = 'last-shift:evidence'; this._subs = [];
    this._subs.push(ctx.bus.on('lastShift:offer', row => this.offer(row)));
    for (const event of ['sector:exit', 'dock:docked', 'save:restoring']) {
      this._subs.push(ctx.bus.on(event, () => getPromptDeck()?.resolveDecision(this._deckId)));
    }
  },
  offer(row) {
    if (!row?.canArchive && !row?.canReturnRecorder) return false;
    const choices = [];
    if (row.canArchive) choices.push({ id: 'archive', label: `FILE ${row.clueIds.length}/3 SOURCES`, title: 'Publish only the facts already read. No extra payout.' });
    if (row.canReturnRecorder) choices.push({ id: 'return', label: 'RETURN ORIGINAL RECORDER', title: 'Give the actual towed recorder to this berth; keep its evidence, surrender its hardware value.' });
    choices.push({ id: 'leave', label: 'KEEP INVESTIGATING', cancel: true });
    return getPromptDeck()?.offerDecision({ id: this._deckId, kind: 'info', sender: 'LAST SHIFT — SOURCE REGISTER',
      statusFlag: `${row.clueIds.length}/3 SOURCES · ${row.recorderReturned ? 'ORIGINAL RETURNED' : 'PARTIAL REPORTS ALLOWED'}`,
      headline: 'What the wreck can prove', detail: row.text, choices,
      onChoose: id => {
        getPromptDeck()?.resolveDecision(this._deckId);
        if (id === 'archive') this.bus.emit('lastShift:archive', { revision: row.revision });
        if (id === 'return') this.bus.emit('lastShift:returnRecorder', { revision: row.revision });
      } }) || false;
  },
  newGame() { getPromptDeck()?.resolveDecision(this._deckId); },
  destroy() { this.newGame(); for (const off of this._subs || []) off(); },
};
