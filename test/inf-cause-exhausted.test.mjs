// INF-7 (WF-16): when the sector gives up on a wound, it says so once and the record keeps it.
// Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { aftermathWrecks, ensureAftermathState } from '../src/systems/aftermathWrecks.js';
import { chronicler } from '../src/systems/chronicler.js';

const FP = 'efp_helios_exhaust_1';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [aftermathWrecks, chronicler] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_helios_prime';
  const log = [];
  for (const name of ['aftermath:causeExhausted', 'aftermath:remedied', 'news:headline', 'news:publish']) {
    sim.bus.on(name, (payload) => log.push({ name, payload: structuredClone(payload) }));
  }
  const cause = {
    fingerprint: FP, causeId: `cause_${FP}`, status: 'open', sectorId: 'sector_helios_prime', zoneName: 'Helios Lane',
    consequenceKind: 'security', remedyType: 'patrol_clear', remedy: 'Clear the toll crew from the recorded lane.',
    evidence: 'toll crew', attempts: 0, createdTick: 1,
  };
  ensureAftermathState(sim.state).causes[FP] = cause;
  sim.bus.emit('aftermath:causeRecorded', structuredClone(cause));
  sim.step();
  return { sim, state: sim.state, bus: sim.bus, log, cause };
}
const mission = { source: 'encounterAftermath', causeFingerprint: FP, missionId: 'm_x' };
const facts = (state) => state.chronicler.stories.flatMap((s) => s.nodes);
const count = (log, name) => log.filter((e) => e.name === name).length;

test('three failed settles give exactly one causeExhausted, one headline, and one chronicler fact on the cause\'s story', () => {
  const { sim, state, bus, log } = boot();
  bus.emit('mission:failed', mission);
  bus.emit('mission:failed', mission);
  assert.equal(count(log, 'aftermath:causeExhausted'), 0, 'two failures do not give up');
  assert.equal(count(log, 'news:headline'), 0);
  bus.emit('mission:failed', mission);
  sim.step();
  assert.equal(count(log, 'aftermath:causeExhausted'), 1);
  assert.equal(count(log, 'news:headline'), 1, 'one plain headline');
  assert.equal(count(log, 'news:publish'), 1, 'and one line on the player news surface');
  const headline = log.find((e) => e.name === 'news:headline').payload.headline;
  assert.equal(headline, 'Helios Prime: the board stopped posting the patrol job. Whatever broke here stays broken.');
  const exhausted = facts(state).filter((f) => f.stage === 'exhausted');
  assert.equal(exhausted.length, 1, 'one exhausted fact');
  const causeFact = facts(state).find((f) => f.stage === 'cause');
  const story = state.chronicler.stories.find((s) => s.nodes.includes(exhausted[0]) || s.nodes.some((n) => n.id === exhausted[0].id));
  assert.ok(story.nodes.some((n) => n.id === causeFact.id), 'on the same story as the cause');
  assert.equal(facts(state).filter((f) => f.event === 'news:headline').length, 0,
    'the record-channel headline is not filed a second time as a story fact');
});

test('a remedied cause produces none of it', () => {
  const { sim, state, bus, log } = boot();
  bus.emit('mission:failed', mission);
  bus.emit('mission:completed', mission);
  sim.step();
  assert.equal(count(log, 'aftermath:causeExhausted'), 0);
  assert.equal(count(log, 'news:headline'), 0);
  assert.equal(facts(state).filter((f) => f.stage === 'exhausted').length, 0);
});

test('replaying the third failure does not duplicate anything', () => {
  const { sim, state, bus, log } = boot();
  for (let i = 0; i < 3; i++) bus.emit('mission:failed', mission);
  for (let i = 0; i < 3; i++) bus.emit('mission:failed', mission);
  sim.step();
  assert.equal(count(log, 'aftermath:causeExhausted'), 1);
  assert.equal(count(log, 'news:headline'), 1);
  assert.equal(count(log, 'news:publish'), 1);
  assert.equal(facts(state).filter((f) => f.stage === 'exhausted').length, 1);
  assert.equal(ensureAftermathState(state).causes[FP].attempts, 3, 'the replay does not count again');
});

test('the exhausted fact survives serialize/deserialize', () => {
  const { sim, state, bus } = boot();
  for (let i = 0; i < 3; i++) bus.emit('mission:failed', mission);
  sim.step();
  const chron = sim.registry.get('chronicler');
  const snapshot = JSON.parse(JSON.stringify(chron.serialize()));
  assert.doesNotThrow(() => chron.deserialize(snapshot));
  assert.equal(facts(state).filter((f) => f.stage === 'exhausted').length, 1);
});
