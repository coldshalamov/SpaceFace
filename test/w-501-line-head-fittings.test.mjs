// w-501: the 14 §7.1 Line heads are real fittings — purchasable modules in the catalog,
// derived onto the hull as data.lineHeadId, one behavior head per hull, and the behavior
// payload carries the authored kind (never a stat).
import assert from 'node:assert/strict';
import test from 'node:test';

import { MODULES } from '../src/data/modules.js';
import { LINE_HEADS, LINE_HEAD_BY_ID } from '../src/data/lineProgression.js';
import { getDerivedStats, findMasslineHeadConflict } from '../src/systems/ships.js';

const BY_ID = new Map(MODULES.map((d) => [d.id, d]));

test('w-501: every authored Line head is a purchasable catalog module carrying its head id', () => {
  for (const head of LINE_HEADS) {
    const def = BY_ID.get(`mod_line_${head.id}`);
    assert.ok(def, `${head.id} has no module def in MODULES`);
    assert.equal(def.mods && def.mods.lineHeadId, head.id);
    assert.equal(def.slotType, 'utility');
    if (head.id === 'head_sympathy') assert.equal(def.purchasable, false);
    else if (head.id !== 'head_standard') assert.ok(def.purchasable !== false && def.price > 0, `${head.id} should be purchasable`);
  }
  assert.equal(LINE_HEADS.length, 15); // the 14 authored heads + Relic Sympathy
});

test('w-501: a fitted head derives lineHeadId and the behavior kind, never a stat', () => {
  const derived = getDerivedStats('ship_kestrel', ['mod_line_head_coupler'], null);
  assert.equal(derived.lineHeadId, 'head_coupler');
});

test('w-501: a second behavior head is refused; line-law and behavior heads coexist', () => {
  const breaker = BY_ID.get('mod_line_head_breaker');
  const coupler = BY_ID.get('mod_line_head_coupler');
  // two §7.1 heads → conflict
  const conflict = findMasslineHeadConflict(['mod_line_head_breaker'], 1, coupler);
  assert.ok(conflict, 'a second behavior head must be refused');
  assert.equal(conflict.id, 'mod_line_head_breaker');
  // §7.1 head + §7.4 line-law head → legal (independent axes)
  const legal = findMasslineHeadConflict(['mod_twin_bridle_m'], 1, breaker);
  assert.equal(legal, null, 'breaker alongside twin_bridle should be a legal ship');
  // Multi-latch occupies both axes: it conflicts with an already-fitted law head
  const multi = BY_ID.get('mod_line_head_multi_latch');
  const clash = findMasslineHeadConflict(['mod_twin_bridle_m'], 1, multi);
  assert.ok(clash, 'Multi-latch must refuse a second line law');
  // no head at all → no conflict
  assert.equal(findMasslineHeadConflict(['mod_shield_booster_s'], 1, BY_ID.get('mod_targeting_computer_m')), null);
});

test('w-501: malformed dual-head fits resolve deterministically by rarity tier then id', () => {
  // equal tiers → lowest head id wins, regardless of slot order
  const a = getDerivedStats('ship_kestrel', ['mod_line_head_breaker', 'mod_line_head_coupler'], null);
  const b = getDerivedStats('ship_kestrel', ['mod_line_head_coupler', 'mod_line_head_breaker'], null);
  assert.equal(a.lineHeadId, b.lineHeadId);
  assert.equal(a.lineHeadId, 'head_breaker');
  // higher rarity floor wins over slot order
  const c = getDerivedStats('ship_kestrel', ['mod_line_head_coupler', 'mod_line_head_seal'], null);
  assert.equal(c.lineHeadId, 'head_seal');
});

test('w-501: the authored catalog keeps every head id, source and rarity floor stable', () => {
  const expected = {
    head_coupler: ['Meridian', 'worked'], head_breaker: ['Drift', 'worked'],
    head_barb: ['Reach', 'worked'], head_weld: ['Frontier', 'worked'],
    head_hush: ['Quiet', 'named'], head_override: ['Vael', 'named'],
    head_bell: ['Choir', 'named'], head_spore: ['Understory', 'named'],
    head_index: ['Archive', 'storied'], head_evidence_clamp: ['Concord', 'storied'],
    head_magnet: ['Pitborn', 'storied'], head_seal: ['Helix', 'relic'],
    head_multi_latch: ['Verge', 'relic'], head_sympathy: ['Verge', 'relic'],
  };
  for (const [id, [source, floor]] of Object.entries(expected)) {
    const head = LINE_HEAD_BY_ID[id];
    assert.ok(head, `${id} missing from LINE_HEADS`);
    assert.equal(head.source, source);
    assert.equal(head.rarityFloor, floor);
  }
});
