import { getPromptDeck } from './promptDeck.js';

// Scanner-confirmed, optional lesson. It never fabricates a danger label or steals combat input.
export const mothlightPrompt = { name: 'mothlightPrompt', init(ctx) {
  this.bus = ctx.bus; this._id = 'mothlight:identified'; this._subs = [];
  this._subs.push(ctx.bus.on('mothlight:identified', p => this.offer(p)));
  for (const event of ['save:restoring', 'dock:docked', 'sector:exit'])
    this._subs.push(ctx.bus.on(event, () => this.newGame()));
}, offer(p) {
  if (!p?.sourceKey || !p.lampId) return false;
  return getPromptDeck()?.offerDecision({ id: this._id, kind: 'info', sender: 'SCANNER · MOTHLIGHT',
    statusFlag: 'DECOY CONFIRMED', headline: 'A lamp has no gun and no engine.',
    detail: 'This original light drifts with its launch velocity. One real hit extinguishes it. The tender’s six-petal iris opens before its single true shot; cover blocks that shot.',
    choices: [{ id: 'close', label: 'KEEP THE IRIS IN SIGHT', cancel: true }],
    onChoose: () => this.newGame() }) || false;
}, newGame() { getPromptDeck()?.resolveDecision(this._id); }, destroy() {
  this.newGame(); for (const off of this._subs || []) off();
} };
