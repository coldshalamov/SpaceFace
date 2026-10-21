import { admitReceipt } from './hudAttention.js';
import { getPromptDeck } from './promptDeck.js';

// Event-only adapter over the existing decision deck; receipts use the receipt lane.
export const lastShiftPrompt = {
  name: 'lastShiftPrompt',
  init(ctx) {
    this.bus = ctx.bus; this._deckId = 'last-shift:evidence'; this._subs = [];
    this.state = ctx.state;
    this._subs.push(ctx.bus.on('lastShift:cue', row => this.cue(row)));
    this._subs.push(ctx.bus.on('lastShift:offer', row => this.offer(row)));
    for (const event of ['sector:exit', 'dock:docked', 'save:restoring']) {
      this._subs.push(ctx.bus.on(event, () => getPromptDeck()?.resolveDecision(this._deckId)));
    }
  },
  cue(row) {
    if (!row?.id || !row.text || this.state.mode !== 'flight' || typeof document === 'undefined'
      || !document.getElementById('toasts')) return false;
    const job = document.body?.dataset?.sfHudJob;
    if (!admitReceipt({ text: row.text, kind: 'info', combat: job === 'fight' || job === 'hurt' }).admit) return false;
    this.bus.emit('toast', { text: row.text, kind: 'info', ttl: 8 });
    // The receipt consumer is synchronous. A DOM root alone can exist before it is bound.
    const surfaced = [...document.getElementById('toasts').querySelectorAll('.sf-toast__text')]
      .some(node => node.isConnected && node.textContent === row.text);
    if (!surfaced) return false;
    this.bus.emit('lastShift:cueSurfaced', { id: row.id });
    return true;
  },
  offer(row, showSources = false) {
    if (!row?.canArchive && !row?.canReturnRecorder) return false;
    const choices = [];
    if (row.canArchive) choices.push({ id: 'archive', label: `FILE ${row.clueIds.length}/3 SOURCES`, title: 'Publish only the facts already read. No extra payout.' });
    if (row.canReturnRecorder) choices.push({ id: 'return', label: 'RETURN ORIGINAL RECORDER', title: 'Give the actual towed recorder to this berth; keep its evidence, surrender its hardware value.' });
    if (row.recoveryActive) choices.push({ id: showSources ? 'guidance' : 'sources',
      label: showSources ? 'RECOVERY DIRECTIONS' : 'READ SOURCES', title: 'Switch between the physical recovery directions and the evidence already read.' });
    if (row.recoveryActive) choices.push({ id: 'cancelRecovery', label: 'STOP RECOVERY GUIDANCE', title: 'Keep all read evidence. No obligation to return the hardware.' });
    else if (row.canRecoverRecorder && !row.canReturnRecorder) choices.push({ id: 'recover', label: 'RECOVER ORIGINAL', title: 'Tow the recorder to an exterior berth. Keep the evidence, surrender the hardware salvage value; no extra payment.' });
    choices.push({ id: 'leave', label: 'KEEP INVESTIGATING', cancel: true });
    return getPromptDeck()?.offerDecision({ id: this._deckId, kind: 'info', sender: 'LAST SHIFT — SOURCE REGISTER',
      statusFlag: `${row.clueIds.length}/3 SOURCES · ${row.recorderReturned ? 'ORIGINAL RETURNED' : 'PARTIAL REPORTS ALLOWED'}`,
      headline: row.recoveryActive && !showSources ? 'Recover the original recorder' : 'What the wreck can prove',
      detail: row.recoveryActive && !showSources
        ? `${row.clueIds.length}/3 sources read. ${row.recoveryGuidance}` : row.text, choices,
      onChoose: id => {
        getPromptDeck()?.resolveDecision(this._deckId);
        if (id === 'sources' || id === 'guidance') this.offer(row, id === 'sources');
        if (id === 'archive') this.bus.emit('lastShift:archive', { revision: row.revision });
        if (id === 'recover') this.bus.emit('lastShift:recover');
        if (id === 'cancelRecovery') this.bus.emit('lastShift:cancelRecovery');
        if (id === 'return') this.bus.emit('lastShift:returnRecorder', { revision: row.revision });
      } }) || false;
  },
  newGame() { getPromptDeck()?.resolveDecision(this._deckId); },
  destroy() { this.newGame(); for (const off of this._subs || []) off(); },
};
