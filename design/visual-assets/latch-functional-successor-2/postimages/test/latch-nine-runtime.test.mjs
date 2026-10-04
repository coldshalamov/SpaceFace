import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createDockIntent, dockIntentStatus } from '../src/core/dockIntent.js';
import { createBus } from '../src/core/eventBus.js';
import { resetFreshRunSystems, FRESH_RUN_SYSTEMS } from '../src/core/runReset.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';
import { createLatchNineRuntime } from '../src/systems/latchNine.js';
import { resolveLatchNinePresence, latchNinePresenceForAsset, LATCH_NINE_PLACE_ID } from '../src/data/latchNine.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, TABLE_CLOCK_IDS, validateSystemClockDeclarations } from '../src/runtime/authoritativeSystemManifest.js';
import { save } from '../src/save/saveSystem.js';

// Observer/admission fixture only. This fabricated census row is NEVER added to production
// census, does not load or stand in for a GLB, and cannot prove authored-model acceptance.
const acceptedFixtureRow = { id: LATCH_NINE_PLACE_ID, source: 'glb', status: 'green' };
function fixture({ promoted = true } = {}) {
  const player = { id: 1, occupantGeneration: 1, type: 'ship', alive: true, radius: 10,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const station = { id: 2, occupantGeneration: 1, type: 'station', alive: true, radius: 90,
    pos: { x: 0, z: 0 }, data: { stationId: 'station_tethys', dockRadius: 90 } };
  const tender = { id: 3, occupantGeneration: 1, type: 'ship', alive: true, hull: 100,
    pos: { x: 200, z: 80 }, vel: { x: 0, z: 0 }, mass: 140, collides: true,
    physicsBody: { dynamic: true, mass: 140, sensor: false }, data: { role: 'latch_nine', placeId: LATCH_NINE_PLACE_ID,
      latchNineService: { stationId: 'station_tethys', sectorId: 'sector_tethys_junction',
        box: { minX: 190, maxX: 210, minZ: 70, maxZ: 90 } } } };
  const state = { mode: 'flight', playerId: 1, simTime: 10, ui: { docked: false },
    world: { currentSectorId: 'sector_tethys_junction', enterSerial: 1 }, factions: {},
    entities: new Map([[1, player], [2, station], [3, tender]]), entityList: [player, station, tender],
    entityIndex: { stations: [station] } };
  const bus = createBus();
  const runtime = createLatchNineRuntime(promoted
    ? { presenceResolver: state => latchNinePresenceForAsset(state, acceptedFixtureRow) } : {});
  runtime.init({ state, bus });
  return { state, bus, player, station, tender, runtime };
}

test('missing real authored model keeps production service unpromoted without a fallback', () => {
  const f = fixture({ promoted: false });
  assert.equal(resolveLatchNinePresence(f.state), null);
  assert.equal(f.state.latchNine.phase, 'OFF_DUTY');
  assert.equal(f.runtime.serialize().met, false);
  assert.equal(f.state.entityList.length, 3);
  f.runtime.destroy();
});

test('admission rejects red/foreign art, static or sensor bodies, stale identity and duplicate tenders', () => {
  const f = fixture();
  assert.equal(latchNinePresenceForAsset(f.state, { ...acceptedFixtureRow, status: 'red' }), null);
  assert.equal(latchNinePresenceForAsset(f.state, { ...acceptedFixtureRow, id: 'placeholder' }), null);
  for (const bad of [{ dynamic: false }, { sensor: true }, { mass: 0 }, { mass: Infinity }]) {
    const before = { ...f.tender.physicsBody };
    Object.assign(f.tender.physicsBody, bad);
    assert.equal(latchNinePresenceForAsset(f.state, acceptedFixtureRow), null);
    f.tender.physicsBody = before;
  }
  const copy = structuredClone(f.tender); copy.id = 4;
  f.state.entities.set(4, copy); f.state.entityList.push(copy);
  assert.equal(latchNinePresenceForAsset(f.state, acceptedFixtureRow), null);
  f.state.entityList.pop(); f.state.entities.delete(4); f.state.entities.delete(3);
  assert.equal(latchNinePresenceForAsset(f.state, acceptedFixtureRow), null);
  f.runtime.destroy();
});

test('post-commit event observes both UI fields, even when service initialized before uiRoot', () => {
  const f = fixture();
  assert.equal(f.state.latchNine.phase, 'GUIDE');
  const observed = [];
  f.bus.on('dock:committed', p => observed.push([p, f.state.ui.docked, f.state.ui.dockedStationId]));
  // This is the exact helper now called by uiRoot's original dock:docked callback.
  f.bus.on('dock:docked', payload => {
    commitDockedUiState(f.state, payload, f.bus);
    assert.equal(f.state.latchNine.phase, 'ACKNOWLEDGE', 'settled before visibility pauses simulation');
  });
  f.bus.emit('dock:attempt', { stationId: 'station_tethys' });
  assert.equal(observed.length, 0);
  f.bus.emit('dock:docked', createDockIntent(f.state, { stationId: 'station_tethys' }));
  assert.deepEqual(observed, [[{ stationId: 'station_tethys', shipId: 1, shipGeneration: 1 }, true, 'station_tethys']]);
  f.runtime.destroy();
});

test('paused keepalive finishes one ACK without advancing sim time or moving a body', () => {
  const f = fixture();
  let committed = 0;
  f.bus.on('dock:committed', () => committed++);
  const physical = structuredClone([f.player, f.station, f.tender]);
  commitDockedUiState(f.state, createDockIntent(f.state, { stationId: 'station_tethys' }), f.bus);
  assert.equal(f.state.latchNine.phase, 'ACKNOWLEDGE');
  f.runtime.keepalive(0.4);
  assert.equal(f.state.latchNine.phase, 'ACKNOWLEDGE');
  commitDockedUiState(f.state, createDockIntent(f.state, { stationId: 'station_tethys' }), f.bus);
  assert.equal(committed, 1);
  f.runtime.keepalive(0.5);
  assert.equal(f.state.latchNine.phase, 'HOLD');
  f.runtime.keepalive(100);
  assert.equal(f.state.latchNine.phase, 'HOLD');
  assert.equal(f.state.simTime, 10);
  assert.deepEqual([f.player, f.station, f.tender], physical);
  f.runtime.destroy();
});

test('raw or wrong-identity post-commit messages cannot manufacture an ACK', () => {
  const f = fixture();
  f.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(f.state.latchNine.phase, 'GUIDE');
  f.bus.emit('dock:committed', { stationId: 'station_tethys', shipId: 1 });
  assert.equal(f.state.latchNine.phase, 'GUIDE');
  f.state.ui.docked = true; f.state.ui.dockedStationId = 'station_tethys';
  f.bus.emit('dock:committed', { stationId: 'station_tethys', shipId: 999 });
  assert.equal(f.state.latchNine.phase, 'HOLD');
  f.runtime.destroy();
});

test('denial during docked pause cancels acknowledgement immediately', () => {
  const f = fixture();
  commitDockedUiState(f.state, createDockIntent(f.state, { stationId: 'station_tethys' }), f.bus);
  f.station.data.quarantine = true;
  f.bus.emit('dock:denied', { stationId: 'station_tethys', reason: 'quarantine' });
  assert.equal(f.state.latchNine.phase, 'HOLD');
  assert.equal(f.state.latchNine.guidance, null);
  assert.equal(f.runtime._ackRemaining, 0);
  f.runtime.destroy();
});

test('new tender or player lifetime cannot inherit an armed arrival even when the object is reused', () => {
  for (const actor of ['player', 'tender', 'station']) {
    const f = fixture();
    f[actor].occupantGeneration++;
    commitDockedUiState(f.state, createDockIntent(f.state, { stationId: 'station_tethys' }), f.bus);
    assert.equal(f.state.latchNine.phase, 'HOLD', actor);
    f.runtime.destroy();
  }
});

test('physical service-box displacement exposes recovery while leaving bodies untouched', () => {
  const f = fixture();
  f.tender.pos.x = 230;
  const before = structuredClone(f.tender);
  f.runtime.update();
  assert.equal(f.state.latchNine.phase, 'RECOVER');
  assert.equal(f.state.latchNine.dockReady, true);
  assert.deepEqual(f.tender, before);
  f.runtime.destroy();
});

test('canonical killed body persists destroyed, but a stale/unrelated kill does not', () => {
  const f = fixture();
  f.bus.emit('entity:killed', { id: 99 });
  assert.equal(f.runtime.serialize().destroyed, false);
  f.bus.emit('entity:killed', { id: 3 });
  assert.equal(f.runtime.serialize().destroyed, false, 'payload alone is not death truth');
  f.tender.alive = false; f.tender.hull = 0;
  f.bus.emit('entity:killed', { id: 3 });
  assert.equal(f.runtime.serialize().destroyed, true);
  assert.equal(f.state.latchNine.phase, 'OFF_DUTY');
  const out = f.state.latchNine;
  f.runtime.keepalive(1);
  assert.equal(f.state.latchNine, out, 'repeated death observation does not reset every frame');
  f.runtime.destroy();
});

test('real Save capture plan and sync/async section generator save only semantic fields', () => {
  const f = fixture();
  const registry = { get: name => name === 'latchNine' ? f.runtime : null };
  const context = new Proxy({ state: f.state, registry, _callSerialize: save._callSerialize },
    { get: (target, key) => key in target ? target[key] : () => ({}) });
  const planned = save._saveCapturePlan.call(context).find(([key]) => key === 'latchNine')[1]();
  const it = save._serializeDataSteps.call(context);
  let result; do { result = it.next(); } while (!result.done);
  assert.deepEqual(result.value.latchNine, planned);
  assert.deepEqual(Object.keys(planned).sort(), ['cleanArrivals', 'destroyed', 'incidentIds', 'met']);
  assert.equal('phase' in planned, false);
  f.runtime.destroy();
});

test('real restore prefix calls the owner before sector entry and completed arrival never replays', () => {
  const f = fixture();
  commitDockedUiState(f.state, createDockIntent(f.state, { stationId: 'station_tethys' }), f.bus);
  const saved = JSON.parse(JSON.stringify(f.runtime.serialize()));
  const calls = [];
  const context = new Proxy({ state: f.state, registry: { get: name => name === 'latchNine' ? f.runtime : null },
    _clearEntitiesChunked: function* () {},
    _callDeserializeChunked: save._callDeserializeChunked,
    _callDeserialize(name, data) { calls.push(name); return save._callDeserialize.call(this, name, data); } },
    { get: (target, key) => key in target ? target[key] : () => ({}) });
  const session = { data: { latchNine: saved, entities: { player: {} } }, state: f.state, entityIdRemap: new Map(), options: {} };
  const it = save._restoreChunks.call(context, session);
  let result;
  do { result = it.next(); } while (!result.done && result.value !== 'deserialized-band-radio');
  assert.equal(session.chunkError, undefined);
  assert.ok(calls.includes('latchNine'));
  it.return();
  f.bus.emit('save:loaded', {});
  assert.equal(f.state.latchNine.phase, 'HOLD');
  f.runtime.keepalive(1);
  assert.equal(f.state.latchNine.phase, 'HOLD');
  assert.deepEqual(f.runtime.serialize(), saved);
  f.runtime.destroy();
});

test('fresh-run owner list resets destroyed/met without rediscovering a stale old-world body', () => {
  const f = fixture();
  f.runtime.deserialize({ met: true, destroyed: true, cleanArrivals: 4 });
  assert.ok(FRESH_RUN_SYSTEMS.includes('latchNine'));
  resetFreshRunSystems({ get: name => name === 'latchNine' ? f.runtime : null });
  assert.deepEqual(f.runtime.serialize(), { met: false, cleanArrivals: 0, incidentIds: [], destroyed: false });
  assert.equal(f.state.latchNine.phase, 'OFF_DUTY');
  f.runtime.destroy();
});

test('sector lifecycle and teardown discard active/stale observers without duplicate listeners', () => {
  const f = fixture();
  f.bus.emit('sector:exit', {}); assert.equal(f.state.latchNine.phase, 'OFF_DUTY');
  f.bus.emit('sector:enter', { sectorId: 'sector_elsewhere' }); assert.equal(f.state.latchNine.phase, 'OFF_DUTY');
  f.bus.emit('sector:enter', { sectorId: 'sector_tethys_junction', enterEpoch: 0 }); assert.equal(f.state.latchNine.phase, 'OFF_DUTY');
  f.bus.emit('sector:enter', { sectorId: 'sector_tethys_junction', enterEpoch: 1 }); assert.equal(f.state.latchNine.phase, 'GUIDE');
  f.runtime.destroy();
  commitDockedUiState(f.state, createDockIntent(f.state, { stationId: 'station_tethys' }), f.bus);
  assert.equal('latchNine' in f.state, false);
  f.runtime.init({ state: f.state, bus: f.bus });
  assert.equal(f.state.latchNine.phase, 'HOLD');
  f.runtime.destroy();
});

test('production order, reset, browser and Node lookup and docked keepalive seams are wired', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('latchNine'));
  assert.equal(PRODUCTION_UPDATE_ORDER.indexOf('latchNine'), PRODUCTION_UPDATE_ORDER.indexOf('physics') + 1);
  assert.ok(TABLE_CLOCK_IDS.includes('latchNine'));
  assert.deepEqual(validateSystemClockDeclarations(), []);
  for (const path of ['core/registry.js', 'runtime/nodeSystemFactoryTable.js']) {
    const code = readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
    assert.match(code, /\['latchNine', latchNine\]/);
  }
  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /latch\.keepalive\(wallDt\)/);
  const ui = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  const commit = ui.indexOf('commitDockedUiState(this.state, payload, this.bus)');
  assert.ok(commit > 0 && commit < ui.indexOf('this.screenManager.syncVisibility()', commit));
});


test('old-player dock:docked through the real commit helper cannot dock or acknowledge the new player', () => {
  const f = fixture();
  const old = createDockIntent(f.state, { stationId: 'station_tethys' });
  const replacement = { ...f.player, id: 10, occupantGeneration: 20 };
  f.state.entities.delete(1); f.state.entities.set(10, replacement); f.state.playerId = 10;
  f.runtime.update();
  let screenTransitions = 0;
  f.bus.on('dock:docked', payload => {
    if (!commitDockedUiState(f.state, payload, f.bus)) return;
    screenTransitions++;
  });
  f.bus.emit('dock:docked', old);
  assert.equal(screenTransitions, 0);
  assert.equal(f.state.ui.docked, false);
  assert.equal(f.state.latchNine.phase, 'GUIDE');
  const sameIdStaleLife = { stationId: 'station_tethys', shipId: 10, shipGeneration: 1 };
  f.bus.emit('dock:docked', sameIdStaleLife);
  assert.equal(screenTransitions, 0);
  f.bus.emit('dock:docked', createDockIntent(f.state, { stationId: 'station_tethys' }));
  assert.equal(screenTransitions, 1);
  assert.equal(f.state.latchNine.phase, 'ACKNOWLEDGE');
  f.runtime.destroy();
});

test('legacy untagged docking remains usable but cannot gain Latch ACK on a later keepalive', () => {
  const f = fixture();
  assert.equal(commitDockedUiState(f.state, { stationId: 'station_tethys' }, f.bus), true);
  assert.equal(f.state.ui.docked, true);
  assert.equal(f.state.latchNine.phase, 'HOLD');
  f.runtime.keepalive(0.1);
  assert.equal(f.state.latchNine.phase, 'HOLD');
  f.runtime.destroy();
});


test('same ID and generation on a fresh restored object cannot authenticate an old dock intent', () => {
  const f = fixture();
  const old = createDockIntent(f.state, { stationId: 'station_tethys' });
  const replacement = structuredClone(f.player);
  assert.equal(replacement.id, f.player.id);
  assert.equal(replacement.occupantGeneration, f.player.occupantGeneration);
  f.state.entities.set(replacement.id, replacement);
  f.runtime.update();
  let transitions = 0;
  f.bus.on('dock:docked', payload => {
    if (!commitDockedUiState(f.state, payload, f.bus)) return;
    transitions++;
  });
  assert.equal(dockIntentStatus(f.state, old), 'stale');
  f.bus.emit('dock:docked', old);
  assert.equal(transitions, 0);
  assert.equal(f.state.ui.docked, false);
  assert.equal(f.state.latchNine.phase, 'GUIDE');
  const current = createDockIntent(f.state, { stationId: 'station_tethys' });
  f.bus.emit('dock:docked', current);
  assert.equal(transitions, 1);
  assert.equal(f.state.latchNine.phase, 'ACKNOWLEDGE');
  f.runtime.destroy();
});

test('cloning/serializing a receipt preserves ordinary compatibility but cannot forge recognition', () => {
  const f = fixture();
  const original = createDockIntent(f.state, { stationId: 'station_tethys' });
  const clone = JSON.parse(JSON.stringify(original));
  assert.equal(dockIntentStatus(f.state, original), 'current');
  assert.equal(dockIntentStatus(f.state, clone), 'unbound');
  assert.equal(commitDockedUiState(f.state, clone, f.bus), true);
  assert.equal(f.state.latchNine.phase, 'HOLD');
  f.runtime.keepalive(0.1);
  assert.equal(f.state.latchNine.phase, 'HOLD');
  assert.deepEqual(Object.keys(original).sort(), ['shipGeneration', 'shipId', 'stationId']);
  f.runtime.destroy();
});


test('same actor cannot reuse a dock receipt across sector entry or target object replacement', () => {
  for (const change of ['entry', 'station']) {
    const f = fixture();
    const receipt = createDockIntent(f.state, { stationId: 'station_tethys' });
    if (change === 'entry') f.state.world.enterSerial++;
    else f.state.entities.set(2, structuredClone(f.station));
    assert.equal(dockIntentStatus(f.state, receipt), 'stale');
    assert.equal(commitDockedUiState(f.state, receipt, f.bus), false);
    assert.equal(f.state.ui.docked, false);
    f.runtime.destroy();
  }
});
