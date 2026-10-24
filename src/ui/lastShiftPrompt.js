import { getPromptDeck } from './promptDeck.js';

// Event-only adapter over the existing decision deck; receipts use the receipt lane.
export const lastShiftPrompt = {
  name: 'lastShiftPrompt',
  init(ctx) {
    this.bus = ctx.bus; this._deckId = 'last-shift:evidence'; this._subs = []; this._active = null;
    this._subs.push(ctx.bus.on('lastShift:offer', row => this.offer(row)));
    for (const event of ['sector:exit', 'dock:docked', 'save:restoring', 'save:loaded', 'game:load', 'game:new', 'game:newGame']) {
      this._subs.push(ctx.bus.on(event, () => this.clear()));
    }
  },
  offer(row) {
    if (!row?.canArchive && !row?.canReturnRecorder) { this.clear(); return false; }
    const choices = [];
    if (row.canArchive) choices.push({ id: 'archive', label: `FILE ${row.clueIds.length}/3 SOURCES`, title: 'Publish only the facts already read. No extra payout.' });
    if (row.canReturnRecorder) choices.push({ id: 'return', label: 'RETURN ORIGINAL RECORDER', title: 'Give the actual towed recorder to this berth; keep its evidence, surrender its hardware value.' });
    choices.push({ id: 'leave', label: 'KEEP INVESTIGATING', cancel: true });
    const token = {}, allowed = new Set(choices.map(choice => choice.id)); this._active = token;
    const accepted = getPromptDeck()?.offerDecision({ id: this._deckId, kind: 'info', sender: 'LAST SHIFT — SOURCE REGISTER',
      statusFlag: `${row.clueIds.length}/3 SOURCES · ${row.recorderReturned ? 'ORIGINAL RETURNED' : 'PARTIAL REPORTS ALLOWED'}`,
      headline: 'What the wreck can prove', detail: row.text, choices,
      onChoose: id => {
        if (this._active !== token || !allowed.has(id)) return false;
        this.clear();
        if (id === 'archive') this.bus.emit('lastShift:archive', { revision: row.revision });
        if (id === 'return') this.bus.emit('lastShift:returnRecorder', { revision: row.revision });
        return true;
      } }) || false;
    if (!accepted && this._active === token) this._active = null;
    return accepted;
  },
  clear() { this._active = null; getPromptDeck()?.resolveDecision(this._deckId); },
  newGame() { this.clear(); },
  destroy() { this.newGame(); for (const off of this._subs || []) off(); },
};
