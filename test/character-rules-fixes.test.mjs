// Wave-3 src-characters-m01 fixes: character rules that painted raw ids, wrong counts,
// or never fired. Each test names the player-visible lie it closes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUILL } from '../src/data/quill.js';
import { quillCopyable } from '../src/characters/quillRules.js';
import { quillBlank, quillOverprintable } from '../src/systems/quill.js';
import { RUBRIC as RC, RUBRIC_TRUTH as RT } from '../src/data/rubric.js';
import { truthFacts, truthLine } from '../src/characters/rubricRules.js';
import { slateColumnLine } from '../src/characters/slateRules.js';
import { BRACKET as BC } from '../src/data/bracket.js';
import { goalCrossing } from '../src/characters/bracketRules.js';
import { bracketEntitySpec } from '../src/systems/bracket.js';
import { redKiteGateFrame, redKiteGateCrossing } from '../src/characters/redKiteRules.js';
import { playerHoldsLine, violatesRegister } from '../src/characters/docketRules.js';
import { shepherd12HomeLine } from '../src/characters/shepherd12Rules.js';

test('quill: a birth-stamped aftermath hulk is not a scanned log; a scanner read is', () => {
  const hulk = { alive: true, type: 'wreck', pos: { ...QUILL.post }, vel: { x: 0, z: 0 },
    data: { markerId: 'aftermath:sector:1', provenance: { markerId: 'aftermath:sector:1' } } };
  assert.equal(quillCopyable(hulk), false, 'parking a kill-hulk does not open a sealed page');
  assert.equal(quillOverprintable(hulk, QUILL.post), false);
  assert.equal(quillBlank(hulk, QUILL.post), true, 'an unread hulk is a blank page for the press');
  hulk.data.scanRevealed = { discovery: 'hulk' };
  assert.equal(quillCopyable(hulk), true);
  assert.equal(quillBlank(hulk, QUILL.post), false);
});

test('rubric: an undated max-length restricted mark keeps its legal sentence', () => {
  const facts = { key: 'm_long', cause: 'o', killerLabel: 'raider skiff',
    freight: 'sealed reactor coolant cassettes x40 bonded', label: 'Hull of the long registry name here',
    wreckClass: 'military', restricted: true, pool: [], ageSeconds: null, isPlayerHull: false, byPlayer: false };
  for (let seed = 1; seed <= 40; seed++) {
    const text = truthLine({ ...facts, key: `m_long_${seed}`, label: `${facts.label} ${'X'.repeat(seed % 30)}` }, seed);
    assert.ok(text.length <= RC.markTextMax, `≤ ${RC.markTextMax}: ${text.length}`);
    assert.ok(text.endsWith(RT.legalRestricted), `legal sentence survives: ${text}`);
  }
  // A dated over-length mark drops its age first, still keeping the legal sentence.
  const dated = truthLine({ ...facts, ageSeconds: 3 * 600, label: `${facts.label} ${'Y'.repeat(60)}` }, 7);
  assert.ok(dated.endsWith(RT.legalRestricted) && dated.length <= RC.markTextMax, dated);
});

test('rubric: a killer with no name or callsign is humanized, never a raw def id', () => {
  const killer = { id: 5, alive: true, data: { defId: 'enemy_raider_skiff' } };
  const state = { playerId: 1, simTime: 100, entities: new Map([[5, killer]]) };
  const wreck = { alive: true, type: 'wreck', data: { markerId: 'm9', aftermath: { killerId: 5, t: 90 } } };
  const facts = truthFacts(wreck, state, 100);
  assert.equal(facts.killerLabel, 'raider skiff');
  assert.ok(!/_/.test(truthLine(facts, 3)), 'no underscores reach the mark');
  killer.name = 'Kestrel Vane';
  assert.equal(truthFacts(wreck, state, 100).killerLabel, 'Kestrel Vane', 'a real name still wins');
});

test('slate: zero is plural; welds alone never claim the seam went', () => {
  assert.match(slateColumnLine(0), /Column reads 0 weld-spikes on this hull/);
  assert.match(slateColumnLine(1), /1 weld-spike on/);
  assert.doesNotMatch(slateColumnLine(5), /went at four/);
  assert.match(slateColumnLine(2, { seamWent: true }), /went at four/);
});

test('bracket: a ball that clears both posts\' inner faces scores; one that clips a post does not', () => {
  const plane = BC.goalZ - BC.ballRadius;
  const shot = (x) => goalCrossing({ x, z: plane + 2 }, { x, z: plane - 2 }, BC.ballRadius, 1 / 60);
  assert.ok(shot(44), 'centered 44 — between the old 43.5 cap and the post face');
  assert.ok(shot(-45.5), 'touching neither post');
  assert.equal(shot(46), null, 'a ball overlapping the post face is the post\'s, not the goal\'s');
  const post = bracketEntitySpec('post-right');
  assert.equal(post.radius, BC.postRadius, 'the rule and the physical post share one radius');
  assert.equal(BC.postX - BC.postRadius, BC.aperture);
});

test('red kite: a slow forward crossing scores the gate', () => {
  const g = redKiteGateFrame(0);
  const at = (s) => ({ x: g.pos.x + g.nx * s, z: g.pos.z + g.nz * s });
  assert.equal(redKiteGateCrossing(at(-0.004), at(0.004), 0, 70), true, '0.48 WU/s still crosses');
  assert.equal(redKiteGateCrossing(at(0.004), at(-0.004), 0, 70), false, 'backwards never scores');
  assert.equal(redKiteGateCrossing(at(0.004), at(0.01), 0, 70), false, 'already past: no double score');
});

test('docket: a recycled id does not inherit the player\'s line; the emoji lint spares non-emoji', () => {
  const player = { id: 1, alive: true, occupantGeneration: 'p1' };
  const body = { id: 2, alive: true, occupantGeneration: 'b2' };
  const state = { playerId: 1, entities: new Map([[1, player], [2, body]]),
    combat: { attachments: { byId: { a: { state: 'active', ownerId: 1, targetId: 2,
      ownerGeneration: 'p1', targetGeneration: 'b1' } } } } };
  assert.equal(playerHoldsLine(state, body), false, 'the line was on the previous occupant of id 2');
  state.combat.attachments.byId.a.targetGeneration = 'b2';
  assert.equal(playerHoldsLine(state, body), true);
  delete state.combat.attachments.byId.a.targetGeneration;
  assert.equal(playerHoldsLine(state, body), true, 'unstamped fixture rows still resolve by id');
  assert.deepEqual(violatesRegister('Parcel 4-C. Ｓｅｃｔｏｒ stamp. Logged.'), [], 'full-width is not emoji');
  assert.deepEqual(violatesRegister('Delivered \u{1F4E6}'), ['emoji']);
  assert.deepEqual(violatesRegister('Delivered \u2705'), ['emoji']);
});

test('shepherd-12: two strays home on one census announce two', () => {
  assert.equal(shepherd12HomeLine(3), 'ONE HOME. 3 STILL OUT.');
  assert.equal(shepherd12HomeLine(3, 1), 'ONE HOME. 3 STILL OUT.');
  assert.equal(shepherd12HomeLine(1, 2), 'TWO HOME. 1 STILL OUT.');
  assert.equal(shepherd12HomeLine(0, 14), '14 HOME. 0 STILL OUT.');
});
