import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { E1_ENCOUNTER_RUNTIMES } from '../src/systems/e1EncounterRuntime.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { interactionDisplayName } from '../src/data/entityInteractionProfiles.js';
import { story } from '../src/systems/story.js';

const SHAPE = 'depth_h4_love_letter_buoy';
function boot() {
  const sim = createSimulation({ seed: 47141, systems: [encounterDirector] });
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, mass: 100, hull: 100, hullMax: 100, data: { intent: {}, ai: {} } });
  Object.assign(sim.state, { playerId: player.id, mode: 'flight' });
  sim.state.world.currentSectorId = 'sector_io_reach';
  sim.state.story.beatIndex = 7;
  const director = sim.registry.get('encounterDirector');
  const effects = [];
  for (const name of ['graffiti:show', 'ambientComms:toneChanged', 'economy:grantCredits', 'faction:repDelta', 'encounter:receipt'])
    sim.bus.on(name, payload => effects.push({ name, payload }));
  assert.equal(director.requestAuthoredEncounter({ shapeId: SHAPE, encounterId: 'buoy-service',
    sectorId: 'sector_io_reach', anchor: { x: 0, z: 0 }, force: true }).ok, true);
  const live = sim.state.encounterDirector.live['buoy-service'];
  const buoy = [...sim.state.entities.values()].find(e => e.data?.storyPropKind === 'love_letter_buoy');
  assert.ok(buoy);
  return { sim, state: sim.state, director, live, buoy, player, effects };
}
function choose(t, id = 'reseed') { t.sim.bus.emit('encounter:choose', { encounterId: t.live.id, choiceId: id }); }
function advance(t, seconds) { for (let n = 0; n < Math.round(seconds * 60); n++) t.sim.step(1 / 60); }
function receipt(t) { return t.state.story.depthProgramEncounters?.completed?.[SHAPE]; }
function noService(t) {
  assert.notEqual(receipt(t)?.outcome, 'reseeded');
  assert.notEqual(t.state.story.flags.loveLetterReseeded, true);
  assert.equal(t.effects.filter(e => e.name === 'graffiti:show' || e.name === 'ambientComms:toneChanged').length, 0);
}
test('choice starts service, not an instant reward; actual director ticks settle original buoy once', () => {
  const t = boot(), credits = t.state.player.credits, identity = t.buoy;
  choose(t); noService(t); advance(t, 4); noService(t); advance(t, 4);
  assert.equal(receipt(t)?.outcome, 'reseeded');
  assert.equal(t.state.entities.get(identity.id), identity);
  assert.match(identity.data.scanLabel, /old broadcast silenced/);
  assert.match(interactionDisplayName(identity), /old broadcast silenced/);
  assert.equal(t.state.player.credits, credits);
  choose(t); advance(t, 3);
  assert.equal(t.effects.filter(e => e.name === 'graffiti:show').length, 1);
  assert.equal(t.effects.filter(e => e.name === 'ambientComms:toneChanged').length, 1);
  assert.equal(t.effects.filter(e => e.name === 'encounter:receipt').length, 1);
  assert.equal(t.effects.filter(e => e.name === 'economy:grantCredits' || e.name === 'faction:repDelta').length, 0);
});
test('remote choice cannot service the beacon from elsewhere', () => {
  const t = boot(); t.player.pos.x = 900; choose(t); advance(t, 12); noService(t);
  assert.equal(t.buoy.data.scanLabel, 'Love-letter route buoy');
});
test('leaving range resets observed service; returning needs the whole service again', () => {
  const t = boot(); choose(t); advance(t, 3); t.player.pos.x = 900; advance(t, 2);
  t.player.pos.x = 0; advance(t, 3); noService(t); advance(t, 5);
  assert.equal(receipt(t)?.outcome, 'reseeded');
});
for (const mode of ['missing', 'dead', 'replacement', 'foreign']) test(mode + ' original buoy cannot settle', () => {
  const t = boot(); choose(t); advance(t, 2);
  if (mode === 'missing') t.state.entities.delete(t.buoy.id);
  if (mode === 'dead') t.buoy.hull = 0;
  if (mode === 'replacement') t.state.entities.set(t.buoy.id, { ...t.buoy, data: { ...t.buoy.data } });
  if (mode === 'foreign') t.buoy.data.encounterId = 'another-encounter';
  advance(t, 8); noService(t);
});
test('repeat service choice does not reset or accelerate completion', () => {
  const t = boot(); choose(t); advance(t, 3); choose(t); noService(t); advance(t, 5);
  assert.equal(receipt(t)?.outcome, 'reseeded');
});
test('long unobserved clock gap cannot stand in for observed work', () => {
  const t = boot(); choose(t);
  E1_ENCOUNTER_RUNTIMES.h4.tick(t.director, t.live, t.state, 30);
  noService(t);
});
test('docking and wrong sector do not service the buoy', () => {
  for (const change of ['dock', 'sector']) {
    const t = boot(); choose(t);
    if (change === 'dock') t.state.mode = 'docked'; else t.state.world.currentSectorId = 'sector_ceres_belt';
    advance(t, 8); noService(t);
  }
});
test('listen preserves recurring letter and has no service reward', () => {
  const t = boot(); choose(t, 'listen');
  assert.equal(receipt(t)?.outcome, 'heard'); noService(t);
  assert.equal(t.buoy.data.scanLabel, 'Love-letter route buoy');
  assert.equal(t.director.requestAuthoredEncounter({ shapeId: SHAPE, encounterId: 'heard-again',
    sectorId: 'sector_io_reach', anchor: { x: 0, z: 0 } }).ok, true);
});
test('completed story projection and ordinary save-loaded gate retain reseeding without payment', () => {
  const t = boot(); choose(t); advance(t, 8);
  const saved = JSON.parse(JSON.stringify(story.serialize.call({ state: t.state })));
  const after = boot();
  after.state.story = saved.story; after.sim.bus.emit('save:loaded', {});
  assert.equal(after.director.requestAuthoredEncounter({ shapeId: SHAPE, encounterId: 'continued',
    sectorId: 'sector_io_reach', anchor: { x: 0, z: 0 } }).reason, 'gated');
  assert.equal(after.effects.length, 0);
});
test('unfinished service is abandoned by existing save-loaded owner, not completed or resumed', () => {
  const t = boot(); choose(t); advance(t, 2);
  const saved = JSON.parse(JSON.stringify(story.serialize.call({ state: t.state })));
  t.state.story = saved.story; t.sim.bus.emit('save:loaded', {}); advance(t, 8);
  noService(t); assert.equal(t.state.encounterDirector.live[t.live.id], undefined);
  assert.equal(t.state.entities.get(t.buoy.id), t.buoy, 'this fixture does not claim full save-slot body cleanup');
});

test('a second listen choice is rejected by the ordinary single-shot offer owner', () => {
  const t = boot(); choose(t); advance(t, 2); choose(t, 'listen'); noService(t);
  assert.equal(t.live.phase, 'reseed_service'); assert.notEqual(receipt(t)?.outcome, 'heard');
  advance(t, 6); assert.equal(receipt(t)?.outcome, 'reseeded');
});
test('unattended service times out without reseeding or kindness', () => {
  const t = boot(); t.player.pos.x = 900; choose(t); advance(t, 93);
  noService(t); assert.equal(t.live.outcome, 'aborted:buoy_service_unfinished');
});
test('native player reuses heard original buoy then approaches with thrust and brake', { timeout: 120000 }, async () => {
  const { bootRealPath, writeRealPathInput } = await import('../scripts/lib/bench/realPath.mjs');
  const h = await bootRealPath({ seed: 47141, systems: ['flightV3', 'physics', encounterDirector],
    hulls: [{ hullId: 'ship_wasp', isPlayer: true, rot: 0, pos: { x: -110, z: 0 } }] });
  try {
    h.state.world.currentSectorId = 'sector_io_reach';
    const d = h.runtime.getSystem('encounterDirector');
    let id = 'native-buoy';
    assert.equal(d.requestAuthoredEncounter({ shapeId: SHAPE, encounterId: id,
      sectorId: 'sector_io_reach', anchor: { x: 0, z: 0 }, force: true }).ok, true);
    let live = h.state.encounterDirector.live[id];
    const buoy = [...h.state.entities.values()].find(e => e.data?.storyPropKind === 'love_letter_buoy');
    assert.ok(buoy);
    const original = [...h.state.entities.values()], effects = [];
    let impacts = 0;
    for (const name of ['graffiti:show', 'ambientComms:toneChanged', 'economy:grantCredits', 'faction:repDelta', 'encounter:receipt'])
      h.bus.on(name, payload => effects.push({ name, payload }));
    h.bus.on('physics:impact', () => impacts++);
    const credits = h.state.player.credits;
    h.step(1);
    h.assertBodies([h.player, buoy]);
    const nativeHandle = readPhysicsTelemetry(buoy).bodyHandle;
    h.bus.emit('encounter:choose', { encounterId: id, choiceId: 'listen' });
    id = 'native-buoy-return';
    assert.equal(d.requestAuthoredEncounter({ shapeId: SHAPE, encounterId: id,
      sectorId: 'sector_io_reach', anchor: { x: 500, z: 500 }, force: true }).ok, true);
    live = h.state.encounterDirector.live[id];
    assert.equal(live._loveLetterBuoy, buoy);
    assert.equal(h.state.entities.size, 2);
    assert.equal(readPhysicsTelemetry(buoy).bodyHandle, nativeHandle);
    h.bus.emit('encounter:choose', { encounterId: id, choiceId: 'reseed' });
    assert.notEqual(h.state.story.depthProgramEncounters?.completed?.[SHAPE]?.outcome, 'reseeded');
    for (let n = 0; n < 1800 && live.phase !== 'done'; n++) {
      writeRealPathInput(h.state, h.player.pos.x < 0 ? { moveZ: 0.15 } : { brake: true });
      h.step(1);
    }
    h.assertBodies([h.player, buoy]);
    assert.equal(live.outcome, 'reseeded');
    assert.ok(h.player.pos.x > -20, 'ordinary input physically approaches the buoy');
    assert.ok(h.state.simTime >= 6);
    for (const entity of original) assert.equal(h.state.entities.get(entity.id), entity);
    assert.equal(h.state.player.credits, credits);
    assert.equal(effects.filter(e => e.name === 'graffiti:show').length, 1);
    assert.equal(effects.filter(e => e.name === 'ambientComms:toneChanged').length, 1);
    assert.deepEqual(effects.filter(e => e.name === 'encounter:receipt').map(e => e.payload.outcome), ['heard', 'reseeded']);
    assert.equal(effects.filter(e => e.name === 'economy:grantCredits' || e.name === 'faction:repDelta').length, 0);
    h.bus.emit('encounter:choose', { encounterId: id, choiceId: 'reseed' });
    h.step(120);
    assert.deepEqual(effects.filter(e => e.name === 'encounter:receipt').map(e => e.payload.outcome), ['heard', 'reseeded']);
    assert.equal(readPhysicsTelemetry(buoy).bodyHandle, nativeHandle);
    assert.equal(h.state.entities.size, 2);
    assert.equal(h.proof().backend, 'rapier-dynamic');
    if (h.proof().contactCaptureEnabled) assert.equal(impacts, 0);
    console.log('IO_BUOY_NATIVE', JSON.stringify({ time: h.state.simTime, player: h.player.pos,
      buoy: buoy.pos, nativeHandle, receipts: effects.filter(e => e.name === 'encounter:receipt').map(e => e.payload.outcome), identities: original.map(e => e.id), impacts, proof: h.proof() }));
  } finally { h.dispose(); }
});

function admitAgain(t, id) {
  const result = t.director.requestAuthoredEncounter({ shapeId: SHAPE, encounterId: id,
    sectorId: 'sector_io_reach', anchor: { x: 500, z: 500 }, force: true });
  assert.equal(result.ok, true);
  return t.state.encounterDirector.live[id];
}
const buoys = t => [...t.state.entities.values()].filter(e => e.data?.storyPropKind === 'love_letter_buoy');
for (const terminal of ['resolve', 'abort']) test(terminal + ' releases only the original transmitter and is idempotent', () => {
  const t = boot();
  const prop = t.director.spawnProp(t.live, { type: 'beacon', pos: { x: 150, z: 150 }, storyPropKind: 'ordinary' });
  const legacy = t.director.spawnProp(t.live, { type: 'beacon', pos: { x: 160, z: 160 } });
  delete legacy.data.encounterId;
  const end = () => terminal === 'resolve' ? t.director.resolve(t.live, 'heard') : t.director.abort(t.live, 'test');
  end();
  assert.equal(t.buoy.data.despawnAt, undefined);
  assert.ok(Number.isFinite(prop.data.despawnAt));
  assert.ok(Number.isFinite(legacy.data.despawnAt), 'untagged legacy cleanup is unchanged');
  const ttl = prop.data.despawnAt;
  end();
  assert.equal(prop.data.despawnAt, ttl);
  assert.equal(t.buoy.data.despawnAt, undefined);
  assert.equal(admitAgain(t, terminal + '-retry')._loveLetterBuoy, t.buoy);
});
for (const kind of ['missing', 'replacement', 'foreign', 'dead']) test('terminal release rejects ' + kind + ' original identity', () => {
  const t = boot();
  if (kind === 'missing') t.state.entities.delete(t.buoy.id);
  if (kind === 'replacement') t.state.entities.set(t.buoy.id, { ...t.buoy, data: { ...t.buoy.data } });
  if (kind === 'foreign') { t.buoy.data.encounterId = 'foreign'; t.buoy.data.despawnAt = 900; }
  if (kind === 'dead') t.buoy.hull = 0;
  t.director.resolve(t.live, 'heard');
  assert.ok(t.live.propIds.includes(t.buoy.id), 'invalid identity was not released as a surviving original');
  assert.notEqual(admitAgain(t, kind + '-retry')._loveLetterBuoy, t.buoy);
});
for (const terminal of ['resolve', 'abort']) for (const ttl of [-1, 900]) test(terminal + ' preserves authored TTL ' + ttl + ' without making a buoy reusable', () => {
  const t = boot();
  t.buoy.data.despawnAt = ttl;
  if (terminal === 'resolve') t.director.resolve(t.live, 'heard'); else t.director.abort(t.live, 'test');
  assert.equal(t.buoy.data.despawnAt, ttl);
  assert.notEqual(admitAgain(t, 'ttl-retry')._loveLetterBuoy, t.buoy);
});
for (const terminal of ['resolve', 'abort']) test(terminal + ' cannot stamp a foreign prop or protected owner', () => {
  const t = boot();
  const foreign = t.director.spawnProp(t.live, { type: 'beacon', pos: { x: 150, z: 150 } });
  foreign.data.encounterId = 'foreign'; foreign.data.despawnAt = 123;
  t.buoy.data.persistenceOwner = 'world'; t.buoy.data.despawnAt = 456;
  if (terminal === 'resolve') t.director.resolve(t.live, 'heard'); else t.director.abort(t.live, 'test');
  assert.equal(foreign.data.despawnAt, 123);
  assert.equal(t.buoy.data.despawnAt, 456);
  assert.equal(t.buoy.data.persistenceOwner, 'world');
  assert.notEqual(admitAgain(t, 'protected-retry')._loveLetterBuoy, t.buoy);
});
test('heard readmission reuses the original transmitter and its actual location, then services it', () => {
  const t = boot(), original = t.buoy, pos = { ...original.pos };
  choose(t, 'listen'); const next = admitAgain(t, 'second-letter');
  assert.equal(buoys(t).length, 1); assert.equal(next._loveLetterBuoy, original);
  assert.deepEqual({ ...original.pos }, pos); assert.deepEqual(next.anchor, { x: pos.x, z: pos.z });
  assert.equal(original.data.encounterId, next.id);
  t.sim.bus.emit('encounter:choose', { encounterId: next.id, choiceId: 'reseed' });
  advance(t, 8); assert.equal(receipt(t)?.outcome, 'reseeded');
  assert.equal(t.state.entities.get(original.id), original); assert.equal(buoys(t).length, 1);
});
test('timed-out service readmission reuses its original without growing the buoy count', () => {
  const t = boot(); t.player.pos.x = 900; choose(t); advance(t, 93); noService(t);
  const next = admitAgain(t, 'retry-letter'); assert.equal(next._loveLetterBuoy, t.buoy);
  assert.equal(buoys(t).length, 1); t.player.pos.x = 0;
  t.sim.bus.emit('encounter:choose', { encounterId: next.id, choiceId: 'reseed' });
  advance(t, 8); assert.equal(receipt(t)?.outcome, 'reseeded'); assert.equal(buoys(t).length, 1);
});
test('a live encounter retains its own buoy; later eligible reuse selects the smallest original id', () => {
  const t = boot(); const other = admitAgain(t, 'other-live');
  assert.notEqual(other._loveLetterBuoy, t.buoy); assert.equal(buoys(t).length, 2);
  choose(t, 'listen'); t.sim.bus.emit('encounter:choose', { encounterId: other.id, choiceId: 'listen' });
  const next = admitAgain(t, 'third-letter');
  assert.equal(next._loveLetterBuoy.id, Math.min(t.buoy.id, other._loveLetterBuoy.id));
  assert.equal(buoys(t).length, 2);
});
for (const kind of ['legacy', 'other-sector', 'foreign-owner', 'pinned', 'scheduled', 'dead']) test('reuse leaves ' + kind + ' transmitter untouched', () => {
  const t = boot(); choose(t, 'listen');
  if (kind === 'legacy') delete t.buoy.data.loveLetterSectorId;
  if (kind === 'other-sector') t.buoy.data.loveLetterSectorId = 'sector_ceres_belt';
  if (kind === 'foreign-owner') t.buoy.data.persistenceOwner = 'foreign';
  if (kind === 'pinned') t.buoy.flags.missionPinned = true;
  // A schedule with no matching despawnBy is foreign: it did not come from this buoy's own
  // releasing encounter, so the new live must not touch it.
  if (kind === 'scheduled') { t.buoy.data.despawnAt = 900; delete t.buoy.data.despawnBy; }
  if (kind === 'dead') t.buoy.hull = 0;
  const owner = t.buoy.data.encounterId, next = admitAgain(t, 'new-letter');
  assert.notEqual(next._loveLetterBuoy, t.buoy); assert.equal(t.buoy.data.encounterId, owner);
  assert.equal(t.state.entities.get(t.buoy.id), t.buoy);
});

