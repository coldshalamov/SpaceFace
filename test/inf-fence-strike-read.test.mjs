// inf-fence-strike-read — the fence answers the throw on the glass.
// The wave-10 strike law (`mines:struck`) and the plow-turn law (`mines:turned`) had no
// render consumer anywhere: a thrown mass tripping a fence played only the generic
// snap/blast, and a field-turned mine flipped allegiance in silence. mineStrikeRead.js owns
// the plan; this file pins its decisions. Pure module — no sim chain, no three.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMineStrikeMoment,
  isMineTurnMoment,
  mineStrikeHue,
  mineStrikeColorCss,
  mineStrikePlan,
  mineTurnPlan,
  MINE_STRIKE_FLOOR_WU,
  MINE_STRIKE_FULL_WU,
  MINE_STRIKE_PRIORITY,
} from '../src/render/vfx/mineStrikeRead.js';

const STRIKE = { mineId: 7, bodyId: 42, custody: 'throw', speed: 46, pos: { x: 10, z: -4 } };

test('gate: a strike reads only from a finite position and a positive speed', () => {
  assert.equal(isMineStrikeMoment(STRIKE), true, 'the ordinary receipt plays');
  assert.equal(isMineStrikeMoment({ ...STRIKE, speed: 0 }), false, 'no speed, no strike beat');
  assert.equal(isMineStrikeMoment({ ...STRIKE, pos: { x: NaN, z: 1 } }), false, 'NaN position refused');
  assert.equal(isMineStrikeMoment(null), false);
  assert.equal(isMineTurnMoment({ pos: { x: 1, z: 2 } }), true, 'the turn needs only a position');
  assert.equal(isMineTurnMoment({ pos: { x: 1, z: Infinity } }), false);
});

test('hue: custody voices the strike, unknown custody falls to the fence amber', () => {
  const throwHue = mineStrikeHue('throw');
  const lineHue = mineStrikeHue('line');
  const wreckHue = mineStrikeHue('wreck');
  assert.notDeepEqual(throwHue, lineHue, 'throw and line never share a hue');
  assert.notDeepEqual(throwHue, wreckHue, 'throw and wreck never share a hue');
  for (const hue of [throwHue, lineHue, wreckHue]) {
    for (const c of hue) assert.ok(c >= 0 && c <= 1, 'channels stay in 0..1');
  }
  assert.deepEqual(mineStrikeHue('drift'), mineStrikeHue(undefined),
    'non-custody strikes read the fence, never black');
  assert.match(mineStrikeColorCss(throwHue), /^rgb\(\d+,\d+,\d+\)$/);
});

test('plan: the scrape keys to the throw band, the star outlives the contact ~3:1', () => {
  const floor = mineStrikePlan(MINE_STRIKE_FLOOR_WU, mineStrikeHue('throw'), 0.5);
  const full = mineStrikePlan(MINE_STRIKE_FULL_WU, mineStrikeHue('throw'), 0.5);
  const over = mineStrikePlan(MINE_STRIKE_FULL_WU + 60, mineStrikeHue('throw'), 0.5);
  assert.ok(full.contact.size1 > floor.contact.size1, 'a harder throw stretches the contact');
  assert.ok(full.scrape.drift > floor.scrape.drift, 'a harder throw throws sparks farther');
  assert.deepEqual(over.contact, full.contact, 'the band caps — a 140 wu/s rock reads like 80');
  const ratio = full.star.life / full.contact.life;
  assert.ok(ratio >= 2.2 && ratio <= 4, `the star outlives the scrape near 3:1 (got ${ratio.toFixed(2)})`);
  const noBearing = mineStrikePlan(46, mineStrikeHue('wreck'), null);
  assert.equal(noBearing.scrape, null, 'no bearing, no scrape streak — the bead still plays');
});

test('turn: the claim beat is quieter than any strike and stays on the claim cyan', () => {
  const turn = mineTurnPlan();
  const strike = mineStrikePlan(46, mineStrikeHue('throw'), 0.5);
  assert.ok(turn.light.peak < strike.light.peak, 'nothing exploded yet — the claim is a whisper');
  assert.ok(turn.claim.life > 0.5 && turn.claim.life < 1.2, 'a readable beat, not a lamp');
  const rgb = mineStrikeColorCss([0.5, 0.83, 1.0]);
  assert.equal(turn.claim.color, rgb, 'the claim wears the same pilot-cyan family');
});

test('priority: the read admits in the same band as the other event reads', () => {
  assert.ok(MINE_STRIKE_PRIORITY > 0 && MINE_STRIKE_PRIORITY <= 1);
});
