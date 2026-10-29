import { getPromptDeck } from './promptDeck.js';
export const borrowedSunPrompt = {
  name: 'borrowedSunPrompt',
  init(ctx) {
    this.bus = ctx.bus; this._subs = [ctx.bus.on('borrowedSun:offer', r => this.offer(r))];
    for (const name of ['sector:exit', 'dock:docked', 'save:restoring', 'borrowedSun:lost'])
      this._subs.push(ctx.bus.on(name, () => this.newGame()));
    this._subs.push(ctx.bus.on('borrowedSun:phase', p => {
      if (p?.phase !== 'open' && p?.phase !== 'close_pending') this.newGame();
    }));
  },
  offer(row) {
    const ledger = row?.ledger || {};
    const choices = [{ id: 'route', label: 'PLOT THE SAFE BERTH', title: 'Use the current fixed service anchor. Trade through the ordinary dock market.' }];
    if (ledger.canBuyLease) choices.push({ id: 'lease', label: `BUY LIGHT PAPER · ${ledger.leaseCostCr} CR`,
      title: 'Eight bounded beats collect only while you remain in the light.' });
    if (ledger.canAcceptCharter) choices.push({ id: 'charter', label: 'ACCEPT THE VISIT CHARTER',
      title: ledger.charter?.kind === 'light_tithe'
        ? `Sell ${ledger.charter.wantQty} units of the named commodity across the counter.`
        : ledger.charter?.kind === 'glass_oath'
          ? 'Keep the reflector glass whole until this visit folds.'
          : 'Tow the folded-sail crate back to the carrier.' });
    if (ledger.canSettleDebt) choices.push({ id: 'settle', label: `SETTLE LEDGER · ${ledger.debt.balance} CR`,
      title: 'Pay the current balance in full through the ordinary credits owner.' });
    choices.push({ id: 'leave', label: 'KEEP FLYING', cancel: true });
    return getPromptDeck()?.offerDecision({ id: 'borrowed-sun:berth', sender: 'NEMI · BORROWED SUN', kind: 'info',
      headline: 'The light is free. Spare parts are regrettably not.', statusFlag: row.status,
      detail: `${row.detail} ${row.rumor}`,
      choices,
      onChoose: id => {
        this.newGame();
        const intent = { visitId: row.visitId };
        if (id === 'route') this.bus.emit('borrowedSun:route', intent);
        else if (id === 'lease') this.bus.emit('borrowedSun:leaseBuy', intent);
        else if (id === 'charter') this.bus.emit('borrowedSun:charter', intent);
        else if (id === 'settle') this.bus.emit('borrowedSun:debtSettle', intent);
      } }) || false;
  },
  newGame() { getPromptDeck()?.resolveDecision('borrowed-sun:berth'); },
  destroy() { this.newGame(); for (const off of this._subs || []) off(); },
};
