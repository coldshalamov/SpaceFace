// inf-line-shield-bite — latching a shielded hull, straining it, and tearing free all read on
// the shield itself.
//
// The shield-contact wire only ever fired from damage receipts. A massline could bite a
// shielded hull, load the line to its limit and rip free while the membrane showed nothing at
// all: the strongest thing the Line does had no read on the one surface it acts on. Now the
// latch bites at hit parity, a strained line re-asserts its bite on a bounded cadence so the
// lattice visibly carries the load, and a break under load lands one last full-strength bite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LINE_SHIELD_LATCH_STRENGTH,
  LINE_SHIELD_LOAD_FLOOR,
  LINE_SHIELD_SUSTAIN_S,
  REDUCED_LINE_SHIELD_GAIN,
  resolveLatchShieldBite,
  resolveLineShieldSustain,
  shieldBiteDir,
  targetShieldUp,
} from '../src/render/vfx/lineShieldBite.js';
import { addShieldContact, readShieldContacts, clearShieldContacts } from '../src/render/weapons/shieldContacts.js';

const TARGET = { id: 'tgt', alive: true, shield: 40, pos: { x: 900, z: 0 } };
const SOURCE = { x: 800, z: 0 }; // due "west" of the target: the bite aims at the biting hull

test('the bite aims from the target toward the hull biting it', () => {
  const dir = shieldBiteDir(SOURCE.x, SOURCE.z, TARGET.pos.x, TARGET.pos.z, {});
  assert.ok(Math.abs(dir.x + 1) < 1e-9 && Math.abs(dir.z) < 1e-9,
    'the bite faces the attacker, the same convention projectile contacts use');
  assert.equal(shieldBiteDir(5, 5, 5, 5, {}), null, 'a zero-length axis is no axis');
});

test('a latch on a shielded hull plans a full-strength bite; an unshielded hull plans nothing', () => {
  const plan = resolveLatchShieldBite(TARGET, SOURCE.x, SOURCE.z, {});
  assert.equal(plan.live, true);
  assert.equal(plan.strength, LINE_SHIELD_LATCH_STRENGTH, 'hit parity: the shell cannot tell a round from a cable');
  assert.equal(resolveLatchShieldBite({ ...TARGET, shield: 0 }, SOURCE.x, SOURCE.z, {}).live, false);
  assert.equal(resolveLatchShieldBite(null, SOURCE.x, SOURCE.z, {}).live, false);
  assert.equal(resolveLatchShieldBite({ ...TARGET, alive: false }, SOURCE.x, SOURCE.z, {}).live, false);
  assert.equal(targetShieldUp(TARGET), true);
});

test('a strained line keeps its bite alive on the bounded cadence; slack lets it decay', () => {
  const out = {};
  // Fresh bite at t=0: loaded line re-asserts only after the sustain window.
  assert.equal(resolveLineShieldSustain(0, -Infinity, 0.8, 0, true, false, out).bite, true);
  assert.ok(out.strength > 0.4 && out.strength <= 0.9, 'a loaded carry is strong but not a hull hit');
  assert.equal(resolveLineShieldSustain(LINE_SHIELD_SUSTAIN_S - 0.01, 0, 0.8, 0, true, false, out).bite, false,
    'the bite holds between re-asserts — the wire never blinks off under load');
  assert.equal(resolveLineShieldSustain(LINE_SHIELD_SUSTAIN_S, 0, 0.8, 0, true, false, out).bite, true,
    'the cadence re-asserts before the 0.28 s contact life dies');
  // Slack: the membrane has nothing to answer.
  assert.equal(resolveLineShieldSustain(10, -Infinity, LINE_SHIELD_LOAD_FLOOR * 0.5, 0, true, false, out).bite, false);
  // Whip alone (a line trying to leave the shell) still earns a bite.
  assert.equal(resolveLineShieldSustain(10, -Infinity, 0, 0.7, true, false, out).bite, true);
});

test('load reads as a steady carry, never as loud as the strike that just landed', () => {
  const carry = resolveLineShieldSustain(0, -Infinity, 1.0, 1.0, true, false, {});
  assert.ok(carry.strength < 1.0, 'sustain never shouts over hull hits');
  const reduced = resolveLineShieldSustain(0, -Infinity, 1.0, 1.0, true, true, {});
  assert.ok(reduced.strength < carry.strength, 'reduced flash calms the sustained read');
  assert.ok(Math.abs(reduced.strength - carry.strength * REDUCED_LINE_SHIELD_GAIN) < 1e-9);
  // No shield, no answer — even at full load.
  assert.equal(resolveLineShieldSustain(0, -Infinity, 1.0, 0, false, false, {}).bite, false);
});

test('the bite lands on the live contact wire the shield shell samples', () => {
  clearShieldContacts('tgt');
  const plan = resolveLatchShieldBite(TARGET, SOURCE.x, SOURCE.z, {});
  addShieldContact(TARGET.id, plan.dirX, 0.12, plan.dirZ, plan.strength);
  const wire = readShieldContacts(TARGET.id, new Float32Array(16));
  let lit = 0;
  for (let i = 0; i < 4; i++) if (wire[i * 4 + 3] > 0.01) lit++;
  assert.equal(lit, 1, 'exactly one contact slot carries the Line bite');
  clearShieldContacts('tgt');
});

test('the live owners are wired: latch bite, break bite and sustained strain all feed the shell', () => {
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  const events = readFileSync(new URL('../src/render/vfx/tetherCableEventMethods.js', import.meta.url), 'utf8');
  assert.match(events, /import \{ addShieldContact \} from '\.\.\/weapons\/shieldContacts\.js';/);
  assert.match(events, /resolveLatchShieldBite\(target, ship\.x, ship\.z/,
    'the latch handler bites the shielded target where the cable meets it');
  assert.match(events, /LINE_SHIELD_BREAK_STRENGTH/,
    'a break under load lands its own bite');
  assert.match(vfx, /resolveLineShieldSustain\(\s*this\._causeNow\(\), this\._lineShieldBiteAt/,
    'the latch-rim frame read sustains the strain bite');
});
