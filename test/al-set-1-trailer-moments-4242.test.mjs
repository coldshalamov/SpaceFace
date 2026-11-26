import assert from 'node:assert/strict';
import test from 'node:test';
import { TRAILER_MOMENTS } from '../src/data/trailerMoments.js';
import { createTrailerStaging } from '../src/render/trailerStaging.js';
import { tickEarlyTrailerEncounters } from '../src/systems/trailerEncounterStaging.js';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { SECTORS } from '../src/data/sectors.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { resolveAudioCueRecipeId, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';

test('ten existing sources have camera/music/30s Theater staging and early reachable sectors', () => {
  assert.equal(TRAILER_MOMENTS.length, 10);
  const distances = new Map([['sector_helios_prime', 0]]), pending = ['sector_helios_prime'];
  for (const id of pending) for (const next of SECTORS.find(s => s.id === id).neighbors) {
    if (!distances.has(next)) { distances.set(next, distances.get(id) + 1); pending.push(next); }
  }
  for (const row of TRAILER_MOMENTS) {
    // Even at a deliberately slow 20 minutes per gate and 30 minutes in-sector, every
    // destination is reachable before three hours. No story/fit/time lock is added.
    assert.ok(distances.get(row.sectorId) * 1200 + 1800 < 3 * 3600, row.id);
    assert.ok(row.camera.zoom > 0 && row.camera.zoom <= 0.2);
    assert.equal(row.clip.seconds, 30); assert.equal(row.clip.hideUI, true);
    assert.ok(AUDIO_RECIPE_BY_ID[resolveAudioCueRecipeId(row.music.cue)]);
    if (row.source.oneOffId) assert.ok(WORLD_ONE_OFFS.some(s => s.id === row.source.oneOffId));
    if (row.source.siteId) assert.ok(worldSiteManifestById(row.source.siteId));
  }
});

test('all ten real source identities stage one controlled camera/music beat without taking input', () => {
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const state = { meta: { seed: 4242 }, mode: 'flight', simTime: 0, tick: 0,
    playerId: 1, entities: new Map([[1, player]]), entityList: [player],
    world: {}, settings: { video: {} }, input: { actions: { thrust: true }, moveX: 1 } };
  const events = [], zooms = [];
  const stage = createTrailerStaging(state, { emit: (name, data) => events.push({ name, data }) });
  const camera = { pushZoom: (...args) => zooms.push(args) };
  const input = JSON.stringify(state.input);
  for (const row of TRAILER_MOMENTS) {
    state.world.currentSectorId = row.sectorId;
    const data = row.source.siteId ? { worldSiteId: row.source.siteId }
      : row.source.storyPropKind ? { storyPropKind: row.source.storyPropKind }
        : { oneOffId: row.source.oneOffId, worldOneOff: true, name: row.source.name };
    const pos = row.source.position || { x: 0, z: 0 };
    player.pos = { ...pos };
    state.entityList = [player, { id: 20, alive: true, pos, data }];
    state.simTime += 20; state.tick += 1200;
    stage.step(camera); stage.step(camera);
    assert.ok(stage.seen.has(row.id), row.id);
  }
  assert.equal(zooms.length, 10);
  assert.equal(events.filter(e => e.name === 'audio:cue').length, 10);
  assert.equal(events.filter(e => e.name === 'setPiece:staged').length, 10);
  assert.equal(JSON.stringify(state.input), input);
  state.simTime += 20; stage.step(camera);
  assert.equal(zooms.length, 10, 'a lingering pilot never restarts the beat');
});

test('reduced motion preserves music while skipping camera motion; distant props do not stage', () => {
  const row = TRAILER_MOMENTS[4], player = { id: 1, pos: { x: 0, z: 0 } };
  const source = { id: 2, pos: { x: 10000, z: 0 }, data: { oneOffId: row.id } };
  const state = { mode: 'flight', simTime: 1, playerId: 1, entities: new Map([[1, player]]),
    entityList: [player, source], world: { currentSectorId: row.sectorId }, settings: { video: { motionReduce: true } } };
  const sounds = [], camera = { pushZoom() { assert.fail('reduced motion'); } };
  const stage = createTrailerStaging(state, { emit: (name, cue) => { if (name === 'audio:cue') sounds.push(cue); } });
  stage.step(camera); assert.equal(sounds.length, 0);
  source.pos.x = 50; state.simTime = 2; stage.step(camera);
  assert.equal(sounds.length, 1);
});

test('ordinary early Forge approach requests the two existing physical scripts through real director gates', () => {
  const sim = createSimulation({ seed: 4242, systems: [encounterDirector] });
  const zone = zonesForSector('sector_vesta_forge').find(z => z.type === 'refinery_approach');
  const anchor = sectorLocalToGlobalForSector(zone.center, 'sector_vesta_forge');
  const player = sim.spawn({ type: 'ship', team: 0, pos: anchor, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100, data: { intent: {}, ai: {} } });
  const state = sim.state;
  state.mode = 'flight'; state.playerId = player.id; state.world.currentSectorId = 'sector_vesta_forge';
  state.world.activeSector = { stations: [{ id: 'station_depot3', name: 'Refuel Depot', pos: { x: anchor.x + 700, z: anchor.z + 900 } }], pois: [] };
  const director = sim.registry.get('encounterDirector');
  const dir = state.encounterDirector;
  const requests = [];
  const request = director.requestAuthoredEncounter.bind(director);
  director.requestAuthoredEncounter = payload => { const result = request(payload); requests.push({ ...payload, result }); return result; };
  state.simTime = 120;
  director._accrue(dir, state, 120);
  tickEarlyTrailerEncounters(director, dir, state, state.simTime);
  assert.equal(dir.stats.trailerVisits.the_eighth_bell, true, JSON.stringify(requests));
  assert.ok(state.entityList.some(e => e.alive && e.data?.storyPropKind === 'eighth_bell'));
  state.simTime = 300;
  director._accrue(dir, state, 180);
  tickEarlyTrailerEncounters(director, dir, state, state.simTime);
  assert.equal(dir.stats.trailerVisits.the_runaway_kiln, true);
  assert.ok(state.entityList.some(e => e.alive && e.data?.storyPropKind === 'runaway_kiln'));
  assert.ok(requests.every(r => r.respectPacing && !r.force));
  const count = requests.length;
  tickEarlyTrailerEncounters(director, dir, state, 301);
  assert.equal(requests.length, count, 'a completed introduction does not duplicate');
});

test('HARMONY-FIX 8: the establishing zoom goes through the gate as `establishing`, never fires while a hostile is engaged, and its caption renders', async () => {
  const { createCameraGate } = await import('../src/render/shakeAdmission.js');
  const { createBus } = await import('../src/core/eventBus.js');
  const { createDiscoveryPlate } = await import('../src/ui/discoveryPlate.js');
  const row = TRAILER_MOMENTS[4];
  const player = { id: 1, alive: true, team: 1, pos: { x: 0, z: 0 } };
  const source = { id: 2, alive: true, pos: { x: 50, z: 0 }, data: { oneOffId: row.id } };
  const hostile = { id: 3, alive: true, hull: 40, team: 3, pos: { x: 300, z: 0 }, data: { combat: { targetId: 1 } } };
  const gate = createCameraGate();
  const state = { meta: { seed: 1 }, mode: 'flight', simTime: 20, tick: 0, playerId: 1,
    entities: new Map([[1, player]]), entityList: [player, source, hostile],
    world: { currentSectorId: row.sectorId, sectors: { [row.sectorId]: { name: 'Test Sector' } } },
    settings: { video: {} }, render: { cameraGate: gate } };
  const bus = createBus();
  const zooms = [], staged = [];
  bus.on('setPiece:staged', p => staged.push(p));
  const stage = createTrailerStaging(state, bus);
  const camera = { pushZoom: (...a) => zooms.push(a) };

  stage.step(camera);
  assert.equal(zooms.length, 0, 'an engaged hostile holds the whole beat');
  assert.equal(staged.length, 0);
  assert.ok(!stage.seen.has(row.id), 'the held beat is not spent, it fires later');
  assert.ok(gate.counts().refused.establishing >= 1, 'the refusal is counted under its cause');

  hostile.alive = false; state.simTime += 1;
  stage.step(camera);
  assert.equal(zooms.length, 1, 'the zoom fires once the fight is over');
  assert.ok(gate.counts().admitted.establishing >= 1, 'and it went through the gate as `establishing`');
  assert.equal(staged.length, 1);

  // The caption: the plate listens for the staged event and draws the authored title.
  const shown = [];
  const plateBus = createBus();
  const plate = createDiscoveryPlate({ bus: plateBus, state });
  const realShow = plate.show;
  const prevDoc = globalThis.document;
  const made = [];
  const el = () => ({ className: '', textContent: '', children: [], appendChild(c) { this.children.push(c); }, setAttribute() {}, classList: { add() {}, remove() {} }, style: {} });
  globalThis.document = { createElement: () => { const e = el(); made.push(e); return e; }, getElementById: () => ({ appendChild(c) { shown.push(c); } }), body: { appendChild(c) { shown.push(c); } } };
  try {
    plateBus.emit('setPiece:staged', staged[0]);
    assert.equal(shown.length, 1, 'the caption plate is mounted');
    assert.ok(made.some(e => e.textContent === staged[0].title), 'it carries the place title');
  } finally { globalThis.document = prevDoc; plate.destroy(); void realShow; }
});
