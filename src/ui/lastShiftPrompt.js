import { admitReceipt } from './hudAttention.js';
import { getPromptDeck } from './promptDeck.js';

const recoveryDetail = {
  available: 'Optional: tow the original recorder to an exterior berth and return it before docking. Filing sources does not return hardware.',
  towing: 'Original recorder on your line. Bring both bodies into the same slow exterior berth; return before docking. Filing is separate.',
  'berth-ready': 'Both bodies meet the return gate. Return the original before docking. You keep its evidence, not its hardware salvage value. No extra payment.',
  'custody-pending': 'The recorder line is not yet confirmed by physics. Return is unavailable until custody is restored. Read evidence remains yours.',
  unavailable: 'The original recorder is not available here. This is not proof of loss. Your read evidence can still be filed separately.',
  returned: 'Original recorder returned. Your read evidence remains available to file. The hardware is gone; no extra payment.',
  lost: 'Original recorder lost or salvaged. It cannot be returned. Your read evidence survives and can still be filed.',
};
const towingAdvice = 'Keep separation: a slack line won\'t brake the recorder. Slow both bodies gradually on a clear path; settle before reeling. Tight reeling can destroy it. No extra payment; hardware value surrendered.';

// Admission is synchronous but may reenter via HUD claims; resolution may publish a newer offer.
// Keep same-ID updates in place, and dispatch only after an accepted card survives resolution.

// Event-only adapter over the existing decision deck; receipts use the receipt lane.
export const lastShiftPrompt = {
  name: 'lastShiftPrompt',
  init(ctx) {
    this.bus = ctx.bus; this._deckId = 'last-shift:evidence'; this._subs = []; this._active = null; this._epoch = 0; this._destroyed = false;
    this._subs.push(ctx.bus.on('lastShift:offer', row => {
      if (row?.view === 'recoveryUpdate') {
        if (!this._active?.accepted || !['recovery', 'advice'].includes(this._view)) return;
        this.offer(row, this._view); return;
      }
      if (row?.requestId != null && row.requestId !== this._epoch) return;
      this.offer(row);
    }));
    for (const event of ['sector:exit', 'dock:docked', 'save:restoring', 'save:loaded', 'game:load', 'game:new', 'game:newGame']) {
      this._subs.push(ctx.bus.on(event, () => this.clear()));
    }
  },
  offer(row, view = row?.view || 'sources') {
    if (this._destroyed) return false;
    if (!row?.canArchive && !row?.canReturnRecorder) { this.clear(); return false; }
    const recovery = typeof row.recorderRecovery === 'string' && Object.hasOwn(recoveryDetail, row.recorderRecovery)
      ? recoveryDetail[row.recorderRecovery] : null;
    if (!recovery) view = 'sources';
    const choices = [];
    if (view === 'sources' && row.canArchive && row.archiveFiled !== true) choices.push({ id: 'archive', label: `FILE ${row.clueIds.length}/3 SOURCES`, title: 'Publish only the facts already read. No extra payout.' });
    if (view !== 'advice' && row.canReturnRecorder) choices.push({ id: 'return', label: 'RETURN ORIGINAL RECORDER', title: 'Give the actual towed recorder to this berth; keep its evidence, surrender its hardware value.' });
    if (view === 'sources' && recovery) choices.push({ id: 'recovery', label: 'ORIGINAL RECOVERY', title: 'Read optional hardware-return directions. Filing evidence is separate.' });
    if (view === 'recovery' && !['returned', 'lost'].includes(row.recorderRecovery)) choices.push({ id: 'advice', label: 'TOWING ADVICE' });
    if (view !== 'sources') choices.push({ id: 'back', label: view === 'advice' ? 'BACK TO RECOVERY' : 'BACK TO SOURCES' });
    choices.push({ id: 'leave', label: view === 'sources' ? 'KEEP INVESTIGATING' : 'CLOSE', cancel: true });
    this._view = view;
    const token = { accepted: false }, epoch = ++this._epoch, allowed = new Set(choices.map(choice => choice.id)); this._active = token;
    const accepted = getPromptDeck()?.offerDecision({ id: this._deckId, kind: 'info', sender: 'LAST SHIFT — SOURCE REGISTER',
      statusFlag: `${row.clueIds.length}/3 SOURCES · ${row.archiveFiled === true ? 'REPORT FILED' : row.recorderReturned ? 'ORIGINAL RETURNED' : 'PARTIAL REPORTS ALLOWED'}${row.archiveFiled === true && row.recorderReturned ? ' · ORIGINAL RETURNED' : ''}`,
      headline: view === 'sources' ? 'What the wreck can prove' : view === 'advice' ? 'Bring it back intact' : 'Optional original recovery',
      detail: view === 'sources' ? row.text : view === 'advice' ? towingAdvice : recovery, choices,
      onChoose: id => {
        if (this._active !== token || !token.accepted || !allowed.has(id)) return false;
        const clearedEpoch = this.clear();
        if (this._epoch !== clearedEpoch || this._destroyed) return false;
        if (id === 'recovery' || (id === 'back' && view === 'advice')) this.bus.emit('lastShift:readRecovery', { requestId: this._epoch });
        if (id === 'advice') this.offer(row, 'advice');
        if (id === 'back' && view === 'recovery') this.bus.emit('lastShift:readRecovery', { view: 'sources', requestId: this._epoch });
        if (id === 'archive') this.bus.emit('lastShift:archive', { revision: row.revision });
        if (id === 'recover') this.bus.emit('lastShift:recover');
        if (id === 'cancelRecovery') this.bus.emit('lastShift:cancelRecovery');
        if (id === 'return') this.bus.emit('lastShift:returnRecorder', { revision: row.revision });
        return true;
      } }) || false;
    if (!accepted && this._active === token) this._active = null;
    token.accepted = !!accepted && this._active === token && this._epoch === epoch;
    return token.accepted;
  },
  clear() { const epoch = ++this._epoch; this._active = null; getPromptDeck()?.resolveDecision(this._deckId); return epoch; },
  newGame() { this.clear(); },
  destroy() { this._destroyed = true; this.newGame(); for (const off of this._subs || []) off(); },
};
