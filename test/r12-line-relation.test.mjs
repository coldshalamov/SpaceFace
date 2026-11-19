// Ruling R12 (design/overhaul/00_RULINGS.md, owner 2026-11-18): the rope never refuses — the aim tag names
// who moves. "When you're small the tether makes you swing around THEM like a little mosquito… when you play
// a huge ship… YOU PULL THEM." One owner (src/ui/lineRelation.js) for every presenter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineRelationWord, lineBodyMassT, lineBodyFixed, LINE_RELATION_ANCHOR_RATIO } from '../src/ui/lineRelation.js';

const hull = (mass) => ({ mass });

test('R12: a body no heavier than you TOWs — a Wasp on a Hitch is a throw, not a tug', () => {
  assert.equal(lineRelationWord(hull(16), 18), 'TOW', 'Wasp 16 t on a Hitch 18 t');
  assert.equal(lineRelationWord(hull(18), 18), 'TOW', 'an equal mass still swings round you');
  assert.equal(lineRelationWord(hull(16), 200), 'TOW', 'the crane: an Atlas drags a Wasp');
});

test('R12: up to (not including) three times your mass is a TUG', () => {
  assert.equal(lineRelationWord(hull(18.01), 18), 'TUG');
  assert.equal(lineRelationWord(hull(53.99), 18), 'TUG');
});

test('R12: three times your mass or more is an ANCHOR — the mosquito swings round it', () => {
  assert.equal(LINE_RELATION_ANCHOR_RATIO, 3);
  assert.equal(lineRelationWord(hull(54), 18), 'ANCHOR', 'exactly 3x is an anchor');
  assert.equal(lineRelationWord(hull(80), 18), 'ANCHOR', 'a Swarm boulder on a Hitch');
  assert.equal(lineRelationWord(hull(150), 24), 'ANCHOR', 'a Bruiser on a Hornet');
});

test('R12: a bolted body is an ANCHOR whatever its mass, on the main lane and from the worker mirror', () => {
  assert.equal(lineRelationWord({ mass: 8, physicsBody: { mass: 8, dynamic: false } }, 18), 'ANCHOR');
  assert.equal(lineRelationWord({ mass: 8, fixedBody: true }, 18), 'ANCHOR', 'worker-mirrored fixed flag');
  assert.equal(lineBodyFixed({ mass: 8 }), false);
});

test('R12: the physics body mass wins over the nominal mass, including the worker-mirrored figure', () => {
  assert.equal(lineBodyMassT({ mass: 12, physicsBody: { mass: 80 } }), 80);
  assert.equal(lineBodyMassT({ mass: 12, bodyMassT: 80 }), 80, 'worker-mirrored body mass');
  assert.equal(lineBodyMassT({ mass: 12 }), 12);
  assert.equal(lineRelationWord({ mass: 12, bodyMassT: 80 }, 18), 'ANCHOR');
});

test('R12: unknown masses say nothing rather than guess', () => {
  assert.equal(lineRelationWord({}, 18), '');
  assert.equal(lineRelationWord(hull(16), 0), '');
  assert.equal(lineRelationWord(null, 18), '');
});

test('R12: handling advice and the player mass come from the relation, not from line class', async () => {
  const { lineHandlingAdvice, linePlayerMassT } = await import('../src/ui/lineRelation.js');
  assert.match(lineHandlingAdvice('TOW'), /trails you/);
  assert.match(lineHandlingAdvice('TUG'), /drags you as much as you drag it/);
  assert.match(lineHandlingAdvice('ANCHOR'), /moves slowly.*swing round it/, 'a heavy loose load moves, slowly');
  assert.match(lineHandlingAdvice('ANCHOR', { fixedBody: true }), /will not move/, 'only a fixed body never moves');
  assert.equal(lineHandlingAdvice(''), '');
  for (const word of ['TOW', 'TUG', 'ANCHOR']) assert.doesNotMatch(lineHandlingAdvice(word), /class|strain|snap|heat|cool/i);
  const player = { id: 1, mass: 18, bodyMassT: 24 };
  assert.equal(linePlayerMassT({ playerId: 1, entities: new Map([[1, player]]) }), 24);
  assert.equal(linePlayerMassT({ player: { mass: 18 } }), 18);
  assert.equal(linePlayerMassT({}), 0);
});

test('R12: the hover rope verb follows the acquisition verdict the latch uses, not the mining / inspect branch', async () => {
  const { ropeVerdictWord } = await import('../src/ui/worldObjectInteraction.js');
  const player = { id: 1, mass: 18 };
  const rock = { id: 50, mass: 80, occupantGeneration: 4 };
  const receipt = (over = {}) => ({ validUntil: 10, selected: { targetId: 50, occupantGeneration: 4, status: 'ready', ...over } });
  const state = (r) => ({ simTime: 1, masslineAcquisition: r });
  assert.equal(ropeVerdictWord(state(receipt()), rock, player), 'ANCHOR');
  assert.equal(ropeVerdictWord(state(null), rock, player), '', 'no verdict, no rope verb (a bolted frame the latch excludes)');
  assert.equal(ropeVerdictWord(state(receipt({ status: 'denied' })), rock, player), '');
  assert.equal(ropeVerdictWord(state(receipt({ targetId: 51 })), rock, player), '', 'another body is selected');
  assert.equal(ropeVerdictWord(state(receipt({ occupantGeneration: 3 })), rock, player), '', 'recycled id');
  assert.equal(ropeVerdictWord({ simTime: 11, masslineAcquisition: receipt() }, rock, player), '', 'expired receipt');
  assert.equal(ropeVerdictWord(state(receipt()), { ...rock, mass: 10 }, player), 'TOW');
  assert.equal(ropeVerdictWord(state(receipt()), { ...rock, mass: 0 }, { id: 1 }), 'LATCH', 'unknown masses still name the verb');
});
