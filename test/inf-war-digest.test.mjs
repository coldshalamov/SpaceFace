// inf-war-digest — the weekly digest can cite the galaxy's war, not only your deeds.
//
// The chronicler's fact pool remembered kills, rescues, trades and missions, but the two
// events that make the world's biggest story — a front boiling over into war, and a front
// resolving — reached no archive. Now factions' own emissions (conflict:warDeclared,
// conflict:flip) land as war facts in one story per front pair, the weekly digest ranks them
// with the day's biggest deeds, and a save round trip keeps the war citable. A corrupted
// declaration or a self-flipping front is filtered noise, not a fact.
//
// Seed 4242, sim-time only. Focused owners: src/chronicler/{schema,normalize,narrative}.js,
// src/systems/chronicler.js, src/systems/factions.js (payload names only).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { chronicler } from '../src/systems/chronicler.js';
import { FACT_EVENTS, STAGES } from '../src/chronicler/schema.js';
import { selectWeeklyDigest } from '../src/systems/chronicler.js';

const SEED = 4242;
const WEEK_S = 4200;
const PAIR = 'faction_vael:faction_meridian';

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [chronicler] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  return { sim, state: sim.state, bus: sim.bus };
}

function setTime(state, t) {
  state.simTime = t;
  state.tick = Math.round(t * 60);
}

function step(t, ticks = 2) {
  for (let i = 0; i < ticks; i++) t.sim.step();
}

function warFacts(state) {
  return state.chronicler.stories.flatMap((s) => s.nodes).filter((n) => n.stage === 'war');
}

function declareWar(bus, at) {
  bus.emit('conflict:warDeclared', {
    pairKey: PAIR,
    sides: ['faction_vael', 'faction_meridian'],
    sideNames: ['Vael', 'Meridian'],
    sectorId: 'sector_vael_reach',
    sectorName: 'Vael Reach',
  });
  void at;
}

test('the war contract is registered: events, stage, and the digest pool', () => {
  assert.ok(FACT_EVENTS.includes('conflict:warDeclared'), 'warDeclared is a fact event');
  assert.ok(FACT_EVENTS.includes('conflict:flip'), 'flip is a fact event');
  assert.ok(STAGES.includes('war'), 'the war stage is durable vocabulary');
});

test('a declaration lands as a war fact and the week digest names the war', () => {
  const t = boot();
  setTime(t.state, WEEK_S + 100);
  const declaredAt = t.state.simTime;
  declareWar(t.bus);
  step(t);

  const facts = warFacts(t.state);
  assert.equal(facts.length, 1, 'exactly one war fact recorded');
  assert.equal(facts[0].details.kind, 'war_declared');
  assert.equal(facts[0].details.pairName, 'Vael and Meridian', 'authored names ride the fact');
  assert.equal(facts[0].sectorName, 'Vael Reach', 'the contested ground is named');
  assert.equal(facts[0].dedupe, `warDeclared:${PAIR}:${declaredAt}`);

  const selection = selectWeeklyDigest(t.state);
  assert.ok(selection, 'the war week has a digest');
  assert.equal(selection.factId, facts[0].id, 'the digest cites the war fact');
  assert.match(selection.summary, /went to war/, `the summary names the war: ${selection.summary}`);
  assert.ok(selection.summary.includes('Vael'), `the summary names the house: ${selection.summary}`);
  assert.ok(selection.summary.includes('Vael Reach'), `the summary names the ground: ${selection.summary}`);
});

test('a resolved front cites the turn, and one story carries the whole arc', () => {
  const t = boot();
  setTime(t.state, WEEK_S + 100);
  declareWar(t.bus);
  step(t);

  setTime(t.state, 2 * WEEK_S + 100);
  t.bus.emit('conflict:flip', {
    pairKey: PAIR, sectorId: 'sector_vael_reach',
    previousOwner: 'faction_vael', newOwner: 'faction_meridian',
    t: t.state.simTime, flipId: `front:${PAIR}:1`, playerLeanMag: 0.4,
    winnerName: 'Meridian', loserName: 'Vael', sectorName: 'Vael Reach',
  });
  step(t);

  const arc = t.state.chronicler.stories.find((s) => s.groups.includes(`front:${PAIR}`));
  assert.ok(arc, 'one story carries the front pair');
  assert.equal(arc.nodes.length, 2, 'declaration and turn share the story');

  const selection = selectWeeklyDigest(t.state);
  assert.ok(selection, 'the turn week has a digest');
  assert.match(selection.summary, /took Vael Reach from Vael/, `the digest names the turn: ${selection.summary}`);
  assert.match(selection.summary, /went to war over Vael Reach/, 'the arc names the declaration too');
});

test('the war outranks an ordinary deed in the same week', () => {
  const t = boot();
  setTime(t.state, WEEK_S + 100);
  // A solid player rescue (story score 48) against a war declaration (55).
  t.bus.emit('distress:rescued', { distressId: 'pod_same_week', targetId: 'ship_same_week', name: 'Sameweek Hauler' });
  declareWar(t.bus);
  step(t);

  const selection = selectWeeklyDigest(t.state);
  assert.ok(selection, 'the week has a digest');
  assert.match(selection.summary, /went to war/, `the war is the week's biggest fact: ${selection.summary}`);
});

test('a save round trip keeps the war citable — the new stage is durable', () => {
  const t = boot();
  setTime(t.state, WEEK_S + 100);
  declareWar(t.bus);
  step(t);
  // The sim owns its own system instance; the saved envelope shape is the live memory cloned,
  // exactly what the save owner's serialize lane carries for this saveSnapshotOwned system.
  const saved = JSON.parse(JSON.stringify(t.state.chronicler));
  assert.ok(saved && Array.isArray(saved.stories), 'the archive serializes');

  const second = createSimulation({ seed: SEED, systems: [chronicler] });
  second.state.mode = 'flight';
  second.state.chronicler = saved;
  setTime(second.state, WEEK_S + 400);
  second.step();
  second.step();

  const selection = selectWeeklyDigest(second.state);
  assert.ok(selection, 'the restored archive still offers the war');
  assert.match(selection.summary, /went to war/, `the restored digest names the war: ${selection.summary}`);
});

test('corrupted declarations and self-flips are noise, not facts', () => {
  const t = boot();
  setTime(t.state, WEEK_S + 100);
  t.bus.emit('conflict:warDeclared', { pairKey: PAIR }); // no sides
  t.bus.emit('conflict:warDeclared', {
    pairKey: PAIR, sides: ['faction_vael', 'faction_vael'], sideNames: ['Vael', 'Vael'],
  });
  t.bus.emit('conflict:flip', {
    pairKey: PAIR, flipId: 'front:x:1',
    previousOwner: 'faction_vael', newOwner: 'faction_vael',
  });
  step(t);
  assert.equal(warFacts(t.state).length, 0, 'malformed fronts never become facts');
  assert.equal(selectWeeklyDigest(t.state), null, 'a week of noise stays silent');
});

test('factions stamps its own emissions with the names the archive speaks', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/systems/factions.js', import.meta.url), 'utf8');
  assert.match(src, /conflict:warDeclared[\s\S]{0,400}sideNames:\s*sides\.map\(factionName\)/,
    'the declaration payload carries authored display names');
  assert.match(src, /conflict:flip[\s\S]{0,300}winnerName:\s*factionName\(winner\)/,
    'the flip payload names the winner and loser');
});
