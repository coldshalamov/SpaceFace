// UIUX-OUTFITTING-SPEND-CONFIRMATION-TESTS-001
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  describeOutfittingSpendConfirm,
  isOutfittingSpendDanger,
} from '../src/ui/screens/outfitting.js';

const paid = { id: 'mod_probe', name: 'Probe Array', price: 6000 };

assert.equal(isOutfittingSpendDanger(0, 10000), false, 'zero-cost actions are never danger');
assert.equal(isOutfittingSpendDanger(5000, 10000), true, 'spend at 50% is danger');
assert.equal(isOutfittingSpendDanger(4999, 10000), false, 'spend just under 50% is not danger');
assert.equal(isOutfittingSpendDanger(449, 900), true, 'a sub-50% spend leaving <=500 CR is danger');

let dialog = describeOutfittingSpendConfirm(paid, 15000, { fitSlotIndex: 2 });
assert.equal(dialog.title, 'Buy Probe Array?', 'confirmation names the module');
assert.match(dialog.body, /Cost: 6,000 CR\./, 'confirmation names the exact spend');
assert.match(dialog.body, /open hardpoint/, 'Buy & Fit confirmation states the fit consequence');
assert.equal(dialog.confirmLabel, 'Buy & Fit');
assert.equal(dialog.cancelLabel, 'Cancel');
assert.equal(dialog.danger, false);

dialog = describeOutfittingSpendConfirm(paid, 10000);
assert.equal(dialog.confirmLabel, 'Buy');
assert.match(dialog.body, /module inventory/, 'inventory purchase confirmation states destination');
assert.equal(dialog.danger, true, 'spending at least half available credits is danger-styled');

dialog = describeOutfittingSpendConfirm({ ...paid, price: 449 }, 900, { fitSlotIndex: 2 });
assert.equal(dialog.danger, true);
assert.match(dialog.body, /operationally thin/, 'thin-reserve confirmation explains the risk');

assert.equal(describeOutfittingSpendConfirm({ name: 'Free Sample', price: 0 }, 10), null,
  'zero-cost actions skip consequential-spend confirmation');

const source = readFileSync(new URL('../src/ui/screens/outfitting.js', import.meta.url), 'utf8');
const confirmAt = source.indexOf('ok = await confirm(confirmOpts)');
const emitAt = source.indexOf("ctx.bus.emit('ui:buyModule', payload)");
assert(confirmAt >= 0 && emitAt > confirmAt,
  'paid Buy awaits confirmation before emitting ui:buyModule');
assert.match(source, /if\s*\(!ok\)\s*\{[\s\S]*?return;\s*\}/,
  'cancel returns before the canonical purchase emit');
assert.match(source, /buyConfirmBusy\s*\|\|\s*isConfirmOpen\(\)/,
  'repeated activation cannot double-purchase while confirmation is active');
assert.match(source, /btn\.focus\(\{\s*preventScroll:\s*true\s*\}\)/,
  'native Buy activation establishes the focus-restoration opener');
assert.match(source, /shopList\.addEventListener\('click',\s*async/,
  'pointer, keyboard, gamepad, and touch share the native button click path');

console.log('Outfitting spend confirmation checks OK');
