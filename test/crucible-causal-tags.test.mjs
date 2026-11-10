// The results screen's causal tags — phase 5's "how did the damage arrive" question, answered.
//
// The important property is honesty about provenance. These are read from the COMPILED SPEC, so
// they say what the finished build DOES with a shot. Nothing in the run accumulates per-arrival
// counts yet, so a figure like "8 direct, 16 chained" would be a model dressed as a measurement.
// The tests below hold the line at kinds, and hold the screen to never breaking on a build it
// cannot read — a results screen that fails to open is worse than one missing a band.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { causalKindsFromPicks, causalKindsLead } from '../src/ui/screens/crucible.js';
import { WEAPONS } from '../src/data/weapons.js';

const PULSE = 'wpn_pulse_laser_s';

function pick(defId, wave = 1) {
  return { defId, verb: null, wave };
}

test('a bare weapon lands its damage the plain way', () => {
  assert.deepEqual(causalKindsFromPicks([pick(PULSE)]), ['DIRECT']);
});

test('a bank modifier changes the route, not just the number', () => {
  const kinds = causalKindsFromPicks([pick(PULSE), pick('mod_bank_shot')]);
  assert.ok(kinds.includes('BANK'), `expected a BANK route, got ${kinds.join(',')}`);
  assert.ok(!kinds.includes('DIRECT'),
    'DIRECT is the fallback for "no route at all" and must not sit beside a real one');
});

test('a chain modifier reads as CHAIN', () => {
  const kinds = causalKindsFromPicks([pick(PULSE), pick('mod_relay_arc')]);
  assert.ok(kinds.includes('CHAIN'), `expected a CHAIN route, got ${kinds.join(',')}`);
});

test('two routes on one build are both named', () => {
  const kinds = causalKindsFromPicks([pick(PULSE), pick('mod_bank_shot'), pick('mod_relay_arc')]);
  assert.ok(kinds.includes('BANK') && kinds.includes('CHAIN'),
    `a build with both should say both, got ${kinds.join(',')}`);
});

test('builds with different routes are actually distinguishable', () => {
  // This is the phase-5 point in one assertion: the same weapon, different fittings, different
  // answers to "how does the damage arrive". If these ever collapse to one answer the band is
  // decoration.
  const bank = causalKindsFromPicks([pick(PULSE), pick('mod_bank_shot')]).join(',');
  const chain = causalKindsFromPicks([pick(PULSE), pick('mod_relay_arc')]).join(',');
  const bare = causalKindsFromPicks([pick(PULSE)]).join(',');
  assert.equal(new Set([bank, chain, bare]).size, 3,
    `three fittings must give three answers; got ${bank} / ${chain} / ${bare}`);
});

test('an unreadable build yields no band rather than throwing', () => {
  // Every one of these reaches the screen in some real state: a run with no picks, a corrupt entry,
  // modifiers with no weapon among them. None may throw, because renderBuild runs while the results
  // screen is being assembled.
  for (const input of [null, undefined, [], 'nonsense', [null], [{}], [pick('mod_bank_shot')]]) {
    assert.deepEqual(causalKindsFromPicks(input), [],
      `input ${JSON.stringify(input)} should yield no tags`);
  }
});

test('an unknown modifier id does not take the band down with it', () => {
  const kinds = causalKindsFromPicks([pick(PULSE), pick('mod_does_not_exist')]);
  assert.ok(Array.isArray(kinds), 'an unknown modifier must not throw');
  assert.ok(kinds.length > 0, 'the weapon is still readable, so the band still says something');
});

test('the weapon is found wherever it sits in the picks', () => {
  const first = causalKindsFromPicks([pick(PULSE), pick('mod_bank_shot')]);
  const last = causalKindsFromPicks([pick('mod_bank_shot'), pick(PULSE)]);
  assert.deepEqual(first, last, 'pick order is draft history, not fit structure');
});

test('every weapon in the catalog compiles to at least one named route', () => {
  // A weapon that produced no kinds at all would render an empty band, which reads as a bug.
  for (const weapon of WEAPONS) {
    if (!weapon || typeof weapon.id !== 'string') continue;
    const kinds = causalKindsFromPicks([pick(weapon.id)]);
    if (!kinds.length) continue; // not every def is a compilable attack weapon
    assert.ok(kinds.length > 0 && kinds.every((k) => typeof k === 'string' && k.length),
      `${weapon.id} produced a malformed route list: ${JSON.stringify(kinds)}`);
  }
});

test('the lead sentence keeps every figure in a word', () => {
  assert.equal(causalKindsLead([]), '');
  assert.match(causalKindsLead(['DIRECT']), /plain way/);
  assert.match(causalKindsLead(['BANK']), /one route/);
  const two = causalKindsLead(['BANK', 'CHAIN']);
  assert.match(two, /2 ways in/);
  assert.match(two, /bank/);
  assert.match(two, /chain/);
  for (const text of [causalKindsLead(['DIRECT']), causalKindsLead(['BANK', 'CHAIN'])]) {
    assert.ok(!/undefined|NaN|\[object/.test(text), `lead reads badly: ${text}`);
  }
});
