import test from 'node:test';
import assert from 'node:assert/strict';
import { crucibleDraftScreen, refitRowLines } from '../src/ui/screens/crucibleDraft.js';

test('a cached reading still marks its offer after the shelf rebuilds its rows', () => {
  const offer = { id: 'autocannon', available: true };
  const card = (id) => ({ dataset: { offerId: id }, lit: false,
    classList: { toggle(_name, value) { this.owner.lit = value; } },
    setAttribute(key, value) { this[key] = value; } });
  const selected = card(offer.id), other = card('railgun');
  selected.classList.owner = selected; other.classList.owner = other;
  const screen = Object.create(crucibleDraftScreen);
  screen._cards = { querySelectorAll: () => [selected, other] };
  screen._reading = { offerId: offer.id, credits: 0, available: true, armed: true,
    fitKey: '|', receiptKey: '', generation: undefined };
  screen._purchaseArmed = true;
  screen._syncRailScale = () => {};
  screen._paintReading({ state: { player: { ownedShips: [] }, run: { credits: 0 } },
    registry: { get: () => null } }, offer);
  assert.equal(selected.lit, true, 'the visible reading retains an explicit selected row');
  assert.equal(selected['aria-pressed'], 'true');
  assert.equal(other.lit, false);
});

for (const defId of ['wpn_bank_stream_m', 'wpn_concussion_cannon_m', 'mod_bank_shot', 'mod_repulsion_trap_s']) {
  test(`a fitted ${defId} keeps its authored explanation in Rearrange loadout`, () => {
    const row = refitRowLines({ slotIndex: 0, defId, spares: [] });
    assert.ok(row.description?.length >= 12, 'fitted name/Strip controls alone cannot explain this toy');
    assert.equal(row.contrast, null, 'the description does not invent a spare comparison');
  });
}
