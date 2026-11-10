// X-03 (row 561): the yard row the voice named wears one chip in its existing strip.
// fitOfferChipHtml is a pure function — the states are the live outfittingGuidance states.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fitOfferChipHtml } from '../src/ui/station/screens/shipworks.js';

const D = { id: 'mod_veil_step' };

test('a matching unequipped fit row gets the is-up chip', () => {
  const html = fitOfferChipHtml(D, { fitOfferDefId: 'mod_veil_step' }, { state: 'fit', price: 4200 }, false, 5000);
  assert.equal(html, '<span class="sx-modrow__chip is-up">Named at the berth</span>');
});

test('the inventory state carries the same chip', () => {
  const html = fitOfferChipHtml(D, { fitOfferDefId: 'mod_veil_step' }, { state: 'inventory', price: 4200 }, false, 5000);
  assert.equal(html, '<span class="sx-modrow__chip is-up">Named at the berth</span>');
});

test('funding names the exact shortfall', () => {
  const html = fitOfferChipHtml(D, { fitOfferDefId: 'mod_veil_step' }, { state: 'funding', price: 4200 }, false, 3900);
  assert.equal(html, '<span class="sx-modrow__chip">Named at the berth · short 300 cr</span>');
});

test('equipped, non-matching, missing hints, and non-live states stay silent', () => {
  const hints = { fitOfferDefId: 'mod_veil_step' };
  assert.equal(fitOfferChipHtml(D, hints, { state: 'fit' }, true, 5000), '', 'equipped row: no chip');
  assert.equal(fitOfferChipHtml({ id: 'mod_other' }, hints, { state: 'fit' }, false, 5000), '', 'wrong id');
  assert.equal(fitOfferChipHtml(D, { fitOffer: true }, { state: 'fit' }, false, 5000), '', 'legacy save without the id');
  assert.equal(fitOfferChipHtml(D, hints, { state: 'locked' }, false, 5000), '', 'locked is not a live buy state');
  assert.equal(fitOfferChipHtml(D, null, { state: 'fit' }, false, 5000), '', 'no hints bag');
});
