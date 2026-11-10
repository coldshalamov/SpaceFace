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
    this.bus = ctx.bus; this.state = ctx.state; this._workerMain = ctx.simLane === 'worker';
    this._deckId = 'last-shift:evidence'; this._subs = []; this._active = null; this._epoch = 0; this._destroyed = false;
    this._cueToken = null;
    this._subs.push(ctx.bus.on('lastShift:cue', row => this.cue(row)));
    this._subs.push(ctx.bus.on('lastShift:offer', row => {
      if (row?.view === 'recoveryUpdate') {
        if (!this._active?.accepted || !['recovery', 'advice', 'guidance'].includes(this._view)) return;
        this.offer(row, this._view); return;
      }
      if (row?.requestId != null && row.requestId !== this._epoch) return;
      this.offer(row);
    }));
    for (const event of ['sector:exit', 'dock:docked', 'save:restoring', 'save:loaded', 'game:load', 'game:new', 'game:newGame']) {
      this._subs.push(ctx.bus.on(event, () => this.clear()));
    }
  },
  cue(row) {
    this._cueToken = null;
    if (!row?.id || !row.text || this.state?.mode !== 'flight' || typeof document === 'undefined'
      || !document.getElementById('toasts')) return false;
    const job = document.body?.dataset?.sfHudJob;
    if (!admitReceipt({ text: row.text, kind: 'info', combat: job === 'fight' || job === 'hurt' }).admit) return false;
    const token = {};
    this._cueToken = token;
    this.bus.emit('toast', { text: row.text, kind: 'info', ttl: 8 });
    if (this._cueToken !== token || typeof document === 'undefined') return false;
    // A root may exist before the receipt listener is bound; only its matching connected text
    // proves that the optional cue reached the player.
    const surfaced = [...(document.getElementById('toasts')?.querySelectorAll('.sf-toast__text') || [])]
      .some(node => node.isConnected && node.textContent === row.text);
    if (!surfaced || this._cueToken !== token) return false;
    const acknowledge = () => {
      if (this._cueToken !== token || this.state?.mode !== 'flight') return;
      this._cueToken = null;
      this.bus.emit('lastShift:cueSurfaced', { id: row.id });
    };
    // Worker replay suppresses synchronous echoes. A verified receipt crosses after replay unwinds;
    // lifecycle interruption still cancels the acknowledgement.
    if (this._workerMain) queueMicrotask(acknowledge); else acknowledge();
    return true;
  },
  offer(row, view = row?.view || 'sources') {
    if (this._destroyed) return false;
    if (!row?.canArchive && !row?.canReturnRecorder) { this.clear(); return false; }
    const recovery = typeof row.recorderRecovery === 'string' && Object.hasOwn(recoveryDetail, row.recorderRecovery)
      ? recoveryDetail[row.recorderRecovery] : null;
    if (view === 'guidance' && (!row.recoveryActive || !row.recoveryGuidance)) view = 'sources';
    else if (view !== 'guidance' && !recovery) view = 'sources';
    const choices = [];
    if (view === 'sources' && row.canArchive && row.archiveFiled !== true) choices.push({ id: 'archive', label: `FILE ${row.clueIds.length}/3 SOURCES`, title: 'Publish only the facts already read. No extra payout.' });
    if (view !== 'advice' && row.canReturnRecorder) choices.push({ id: 'return', label: 'RETURN ORIGINAL RECORDER', title: 'Give the actual towed recorder to this berth; keep its evidence, surrender its hardware value.' });
    if (view === 'sources' && recovery) choices.push({ id: 'recovery', label: 'RETURN INSTRUCTIONS', title: 'Read optional hardware-return directions. Filing evidence is separate.' });
    if (view === 'sources' && row.recoveryActive) choices.push({ id: 'guidance', label: 'RECOVERY GUIDANCE', title: 'Reopen the active, physical return guidance.' });
    if (view === 'sources' && !row.recoveryActive && row.canRecoverRecorder && !row.canReturnRecorder) choices.push({ id: 'recover', label: 'START RETURN GUIDANCE', title: 'Start optional physical recovery guidance. This does not return the recorder or file evidence.' });
    if (view === 'guidance') choices.push({ id: 'sources', label: 'READ SOURCES', title: 'Return to the evidence already read.' });
    if (view === 'recovery' && !['returned', 'lost'].includes(row.recorderRecovery)) choices.push({ id: 'advice', label: 'TOWING ADVICE' });
    if (view === 'guidance') choices.push({ id: 'cancelRecovery', label: 'STOP RECOVERY GUIDANCE', title: 'Keep the read evidence; stop optional return guidance.' });
    if (view === 'recovery' || view === 'advice') choices.push({ id: 'back', label: view === 'advice' ? 'BACK TO RECOVERY' : 'BACK TO SOURCES' });
    choices.push({ id: 'leave', label: view === 'sources' ? 'KEEP INVESTIGATING' : 'CLOSE', cancel: true });
    this._view = view;
    const token = { accepted: false }, epoch = ++this._epoch, allowed = new Set(choices.map(choice => choice.id)); this._active = token;
    const accepted = getPromptDeck()?.offerDecision({ id: this._deckId, kind: 'info', sender: 'LAST SHIFT — SOURCE REGISTER',
      statusFlag: `${row.clueIds.length}/3 SOURCES · ${row.archiveFiled === true ? 'REPORT FILED' : row.recorderReturned ? 'ORIGINAL RETURNED' : 'PARTIAL REPORTS ALLOWED'}${row.archiveFiled === true && row.recorderReturned ? ' · ORIGINAL RETURNED' : ''}`,
      headline: view === 'sources' ? 'What the wreck can prove' : view === 'advice' ? 'Bring it back intact' : 'Optional original recovery',
      detail: view === 'sources' ? row.text : view === 'advice' ? towingAdvice : view === 'guidance' ? row.recoveryGuidance : recovery, choices,
      onChoose: id => {
        if (this._active !== token || !token.accepted) return false;
        if (!allowed.has(id)) {
          // The canonical owner is idempotent. Let a stale duplicate FILE request receive its
          // visible already-filed receipt without reopening or mutating the current dossier.
          if (id === 'archive' && row.archiveFiled === true) this.bus.emit('lastShift:archive', { revision: row.revision });
          return false;
        }
        const clearedEpoch = this.clear();
        if (this._epoch !== clearedEpoch || this._destroyed) return false;
        if (id === 'recovery' || (id === 'back' && view === 'advice')) this.bus.emit('lastShift:readRecovery', { requestId: this._epoch });
        if (id === 'advice') this.offer(row, 'advice');
        if (id === 'back' && view === 'recovery') this.bus.emit('lastShift:readRecovery', { view: 'sources', requestId: this._epoch });
        if (id === 'sources' && view === 'guidance') this.offer(row, 'sources');
        if (id === 'guidance') this.offer(row, 'guidance');
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
  clear() { const epoch = ++this._epoch; this._active = null; this._cueToken = null; getPromptDeck()?.resolveDecision(this._deckId); return epoch; },
  newGame() { this.clear(); },
  destroy() { this._destroyed = true; this.newGame(); for (const off of this._subs || []) off(); },
};
