import { admitReceipt } from './hudAttention.js';
import { getPromptDeck } from './promptDeck.js';

// Event-only adapter over the existing decision deck; receipts use the receipt lane.
export const lastShiftPrompt = {
  name: 'lastShiftPrompt',
  init(ctx) {
    this.bus = ctx.bus; this._deckId = 'last-shift:evidence'; this._subs = []; this._active = null;
    this.state = ctx.state; this._workerMain = ctx.simLane === 'worker'; this._cueToken = null;
    this._subs.push(ctx.bus.on('lastShift:cue', row => this.cue(row)));
    this._subs.push(ctx.bus.on('lastShift:offer', row => this.offer(row)));
    for (const event of ['sector:exit', 'dock:docked', 'save:restoring', 'save:loaded', 'game:load', 'game:new', 'game:newGame']) {
      this._subs.push(ctx.bus.on(event, () => this.interrupt()));
    }
  },
  cue(row) {
    this._cueToken = null;
    if (!row?.id || !row.text || this.state.mode !== 'flight' || typeof document === 'undefined'
      || !document.getElementById('toasts')) return false;
    const job = document.body?.dataset?.sfHudJob;
    if (!admitReceipt({ text: row.text, kind: 'info', combat: job === 'fight' || job === 'hurt' }).admit) return false;
    const token = {}; this._cueToken = token;
    this.bus.emit('toast', { text: row.text, kind: 'info', ttl: 8 });
    if (this._cueToken !== token || typeof document === 'undefined') return false;
    // The receipt consumer is synchronous. A DOM root alone can exist before it is bound.
    const surfaced = [...(document.getElementById('toasts')?.querySelectorAll('.sf-toast__text') || [])]
      .some(node => node.isConnected && node.textContent === row.text);
    if (!surfaced || this._cueToken !== token) return false;
    const acknowledge = () => {
      if (this._cueToken !== token || this.state.mode !== 'flight') return;
      this._cueToken = null; this.bus.emit('lastShift:cueSurfaced', { id: row.id });
    };
    // Worker event replay suppresses synchronous echoes. A verified receipt crosses
    // after replay unwinds; lifecycle interruption still cancels the acknowledgement.
    if (this._workerMain) queueMicrotask(acknowledge); else acknowledge();
    return true;
  },
  offer(row, showSources = false) {
    if (!row?.canArchive && !row?.canReturnRecorder) { this.clear(); return false; }
    const choices = [];
    if (row.canArchive) choices.push({ id: 'archive', label: `FILE ${row.clueIds.length}/3 SOURCES`, title: 'Publish only the facts already read. No extra payout.' });
    if (row.canReturnRecorder) choices.push({ id: 'return', label: 'RETURN ORIGINAL RECORDER', title: 'Give the actual towed recorder to this berth; keep its evidence, surrender its hardware value.' });
    if (row.recoveryActive) choices.push({ id: showSources ? 'guidance' : 'sources',
      label: showSources ? 'RECOVERY DIRECTIONS' : 'READ SOURCES', title: 'Switch between the physical recovery directions and the evidence already read.' });
    if (row.recoveryActive) choices.push({ id: 'cancelRecovery', label: 'STOP RECOVERY GUIDANCE', title: 'Keep all read evidence. No obligation to return the hardware.' });
    else if (row.canRecoverRecorder && !row.canReturnRecorder) choices.push({ id: 'recover', label: 'RECOVER ORIGINAL', title: 'Tow the recorder to an exterior berth. Keep the evidence, surrender the hardware salvage value; no extra payment.' });
    choices.push({ id: 'leave', label: 'KEEP INVESTIGATING', cancel: true });
    const token = {}, allowed = new Set(choices.map(choice => choice.id)); this._active = token;
    const accepted = getPromptDeck()?.offerDecision({ id: this._deckId, kind: 'info', sender: 'LAST SHIFT — SOURCE REGISTER',
      statusFlag: `${row.clueIds.length}/3 SOURCES · ${row.recorderReturned ? 'ORIGINAL RETURNED' : 'PARTIAL REPORTS ALLOWED'}`,
      headline: row.recoveryActive && !showSources ? 'Recover the original recorder' : 'What the wreck can prove',
      detail: row.recoveryActive && !showSources
        ? `${row.clueIds.length}/3 sources read. ${row.recoveryGuidance}` : row.text, choices,
      onChoose: id => {
        if (this._active !== token || !allowed.has(id)) return false;
        this.clear();
        if (id === 'sources' || id === 'guidance') this.offer(row, id === 'sources');
        if (id === 'archive') this.bus.emit('lastShift:archive', { revision: row.revision });
        if (id === 'recover') this.bus.emit('lastShift:recover');
        if (id === 'cancelRecovery') this.bus.emit('lastShift:cancelRecovery');
        if (id === 'return') this.bus.emit('lastShift:returnRecorder', { revision: row.revision });
        return true;
      } }) || false;
    if (!accepted && this._active === token) this._active = null;
    return accepted;
  },
  clear() { this._active = null; getPromptDeck()?.resolveDecision(this._deckId); },
  interrupt() { this._cueToken = null; this.clear(); },
  newGame() { this.interrupt(); },
  destroy() { this.newGame(); for (const off of this._subs || []) off(); },
};
