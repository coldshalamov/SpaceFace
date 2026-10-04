import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { resolveDockRange } from '../src/core/dockRange.js';
import { resolveDockDeny } from '../src/core/dockAccess.js';
import { resolveDockDeny as bannerDeny } from '../src/ui/dockDenyBanner.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../src/data/collisionProxyManifests.js';
import { createLatchNineService, normalizeLatchNineSave } from '../src/systems/latchNineService.js';

function fixture({ manifest = false } = {}) {
  const player = { id: 1, alive: true, type: 'ship', radius: 10, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const station = { id: 2, alive: true, type: 'station', radius: 90, pos: { x: 0, z: 0 },
    data: { stationId: 'station_tethys', dockRadius: 90, factionId: 'faction_scn',
      ...(manifest ? { collisionProxy: 'helios_trade_hub' } : {}) } };
  const state = { playerId: 1, entities: new Map([[1, player], [2, station]]), entityList: [player, station],
    entityIndex: { stations: [station] }, world: { currentSectorId: 'sector_tethys_junction' },
    mode: 'flight', simTime: 0, ui: { docked: false }, factions: { faction_scn: { rep: 0 } } };
  if (manifest) {
    const anchor = resolveDockAnchor(station, resolveCollisionProxyManifest(station), player);
    player.pos = { x: anchor.x, z: anchor.z };
  }
  const service = createLatchNineService();
  return { state, player, station, service, step: (opts) => { state.simTime += 1 / 60; return service.update(state, opts); } };
}

function dockingOwner(state) {
  const bus = createBus(), events = [];
  bus.on('dock:range', p => events.push(['dock', { ...p }]));
  bus.on('gate:range', p => events.push(['gate', { ...p }]));
  return { owner: { ...physics, bus, _dockStationId: null, _gateEntityId: null }, events };
}

test('range extraction drives the real physics owner with unchanged enter/leave events', () => {
  const { state, player, station } = fixture();
  const { owner, events } = dockingOwner(state);
  owner.updateDockRange(state);
  assert.deepEqual(events, [['dock', { stationId: 'station_tethys', shipId: 1, inRange: true }]]);
  owner.updateDockRange(state);
  assert.equal(events.length, 1);
  player.pos.x = 1000;
  owner.updateDockRange(state);
  assert.deepEqual(events[1], ['dock', { stationId: 'station_tethys', shipId: 1, inRange: false }]);
  assert.equal(resolveDockRange(state).station, null);
  player.pos.x = station.pos.x;
  assert.equal(resolveDockRange(state).station, station);
});

test('manifest berth and large-hull standoff keep the actual range/speed gate', () => {
  const f = fixture({ manifest: true });
  const { owner, events } = dockingOwner(f.state);
  owner.updateDockRange(f.state);
  assert.equal(events.at(-1)[1].inRange, true);
  assert.equal(f.step().phase, 'GUIDE');
  f.player.vel.x = 100;
  owner.updateDockRange(f.state);
  assert.equal(events.at(-1)[1].inRange, false);
  assert.equal(f.step().phase, 'APPROACH');
  assert.equal(f.service.readout.guidance.hint, 'slow_and_align');
  f.player.vel.x = 0;
  f.player.radius = 100;
  const anchor = resolveDockAnchor(f.station, resolveCollisionProxyManifest(f.station), f.player);
  f.player.pos = { x: anchor.x, z: anchor.z };
  assert.equal(resolveDockRange(f.state).station, f.station);
});

test('nearest station and jump gate selection are preserved', () => {
  const f = fixture();
  const other = { ...f.station, id: 3, pos: { x: 10, z: 0 }, data: { stationId: 'station_other', dockRadius: 90 } };
  const gate = { ...f.station, id: 4, data: { isGate: true, gateTo: 'elsewhere', name: 'Gate' } };
  f.state.entities.set(3, other); f.state.entities.set(4, gate);
  f.state.entityIndex.stations.push(other, gate);
  f.player.pos.x = 10;
  assert.equal(resolveDockRange(f.state).station, other);
  assert.equal(resolveDockRange(f.state).gate, gate);
  assert.equal(f.step().phase, 'APPROACH');
});

test('denial banner and command route keep the exact same pure refusal selector', () => {
  assert.equal(bannerDeny, resolveDockDeny);
  const f = fixture();
  for (const reason of ['abandoned', 'private', 'military_only', 'under_construction', 'quarantine', 'hostile_rep']) {
    f.station.data.dockDeny = reason;
    assert.equal(resolveDockDeny(f.state, 'station_tethys').reason, reason);
    assert.equal(f.step().phase, 'HOLD');
    assert.equal(f.step().reason, reason);
  }
  delete f.station.data.dockDeny;
  f.station.data.minRep = 10;
  assert.equal(f.step().reason, 'hostile_rep');
  f.state.factions.faction_scn.rep = 10;
  assert.equal(f.step().phase, 'GUIDE');
});

test('requests, UI prompt repaints and corridor geometry never manufacture GUIDE', () => {
  const f = fixture();
  f.player.pos.x = 400;
  f.state.dockingCorridor = { stationId: 'station_tethys', phase: 'berthed', berthed: true };
  f.state.ui.dockInRange = true;
  f.state.dockAttempt = { stationId: 'station_tethys' };
  assert.equal(f.step().phase, 'APPROACH');
  assert.equal(f.step().clearance, 'NOT_READY');
  assert.equal(f.step().dockReady, false);
  assert.equal(f.step().hailAvailable, false);
});

test('revocation interrupts GUIDE next tick, inside the 10 Hz readout interval', () => {
  const f = fixture();
  assert.equal(f.step().phase, 'GUIDE');
  f.station.data.quarantine = true;
  assert.equal(f.step().phase, 'HOLD');
  delete f.station.data.quarantine;
  assert.equal(f.step().phase, 'GUIDE');
  f.service.revoke('station_other');
  assert.equal(f.step().phase, 'GUIDE');
  f.service.revoke('station_tethys');
  assert.equal(f.step().reason, 'revoked');
  assert.equal(f.step().phase, 'GUIDE');
});

test('fresh exact entity identity defeats stale station indexes and stale denial indexes', () => {
  const f = fixture();
  assert.equal(f.step().phase, 'GUIDE');
  const replacement = { ...f.station, data: { ...f.station.data, quarantine: true } };
  f.state.entities.set(2, replacement);
  assert.equal(f.step().phase, 'OFF_DUTY');
  f.state.entityIndex.stations = [replacement];
  f.state.entityIndex.byStationId = new Map([['station_tethys', f.station]]);
  assert.equal(f.step().reason, 'quarantine');
  f.state.world.currentSectorId = 'sector_helios_prime';
  assert.equal(f.step().phase, 'OFF_DUTY');
});

test('transition, jump, dead player and nonflight fences close guidance', () => {
  const f = fixture();
  assert.equal(f.step().phase, 'GUIDE');
  f.state.jump = { state: 'CHARGING' }; assert.equal(f.step().phase, 'HOLD');
  f.state.jump.state = 'JUMPING'; assert.equal(f.step().phase, 'HOLD');
  f.state.jump.state = 'IDLE'; f.state.ui.fulfillmentBlackoutActive = true;
  assert.equal(f.step().phase, 'HOLD');
  f.state.ui.fulfillmentBlackoutActive = false; f.state.mode = 'menu';
  assert.equal(f.step().phase, 'HOLD');
  f.state.mode = 'flight'; f.player.alive = false;
  assert.equal(f.step().phase, 'OFF_DUTY');
});

test('only a confirmed docked-state edge after an eligible approach acknowledges, once', () => {
  const f = fixture();
  assert.equal(f.step().phase, 'GUIDE');
  // A request/receipt without the uiRoot-owned state transition is still only a request.
  assert.equal(f.step().phase, 'GUIDE');
  f.state.ui.docked = true; f.state.ui.dockedStationId = 'station_tethys';
  assert.equal(f.step().phase, 'ACKNOWLEDGE');
  f.state.simTime += 1;
  assert.equal(f.step().phase, 'HOLD');
  f.state.ui.docked = true; // duplicate accepted receipt has no new state edge
  assert.equal(f.step().phase, 'HOLD');
  assert.equal(f.service.serialize().cleanArrivals, 0, 'no unverified clean-arrival claim');
});

test('Save/Continue during GUIDE recomputes permission and after arrival never replays ACK', () => {
  const f = fixture();
  assert.equal(f.step().phase, 'GUIDE');
  const guideSave = JSON.parse(JSON.stringify(f.service.serialize()));
  assert.deepEqual(Object.keys(guideSave).sort(), ['cleanArrivals', 'destroyed', 'incidentIds', 'met']);
  f.station.data.quarantine = true;
  f.service.deserialize(guideSave);
  assert.equal(f.step().phase, 'HOLD');
  delete f.station.data.quarantine;
  assert.equal(f.step().phase, 'GUIDE');
  f.state.ui.docked = true; f.state.ui.dockedStationId = 'station_tethys';
  assert.equal(f.step().phase, 'ACKNOWLEDGE');
  const dockedSave = f.service.serialize();
  f.service.deserialize(dockedSave);
  assert.equal(f.step().phase, 'HOLD');
  const cold = createLatchNineService(dockedSave);
  assert.equal(cold.update(f.state).phase, 'HOLD');
});

test('save restore and replaced ship cannot inherit an armed arrival', () => {
  const f = fixture();
  assert.equal(f.step().phase, 'GUIDE');
  const replacement = { ...f.player };
  f.state.entities.set(1, replacement);
  f.state.ui.docked = true; f.state.ui.dockedStationId = 'station_tethys';
  assert.equal(f.step().phase, 'HOLD');
});

test('recovery reports the physical owner state without moving or freezing either vessel', () => {
  const f = fixture();
  const before = structuredClone({ player: f.player, station: f.station });
  assert.equal(f.step({ recovering: true }).phase, 'RECOVER');
  assert.equal(f.service.readout.clearance, 'CLEAR');
  assert.deepEqual({ player: f.player, station: f.station }, before);
  assert.equal(f.step({ recovering: false }).phase, 'GUIDE');
  f.station.data.quarantine = true;
  assert.equal(f.step({ recovering: true }).phase, 'HOLD', 'actual refusal takes precedence');
});

test('disabled, dismissed and destroyed character never changes ordinary docking', () => {
  const f = fixture();
  const { owner, events } = dockingOwner(f.state);
  assert.equal(f.step({ enabled: false }).phase, 'OFF_DUTY');
  owner.updateDockRange(f.state);
  assert.equal(events.at(-1)[1].inRange, true);
  assert.equal(resolveDockDeny(f.state, 'station_tethys'), null);
  f.service.dismiss();
  assert.equal(f.step().phase, 'OFF_DUTY');
  f.service.deserialize(f.service.serialize());
  assert.equal(f.step().phase, 'OFF_DUTY', 'Continue does not undo session dismissal');
  f.service.resetSession(); assert.equal(f.step().phase, 'GUIDE');
  f.service.deserialize({ destroyed: true });
  assert.equal(f.step().phase, 'OFF_DUTY');
  assert.equal(resolveDockRange(f.state).station, f.station);
  assert.equal(resolveDockDeny(f.state, 'station_tethys'), null);
});

test('bounded save normalization rejects transient fields and returns independent data', () => {
  const raw = { met: true, cleanArrivals: 100001.5, incidentIds: [null, '', ...Array.from({ length: 30 }, (_, i) => `i${i}`)],
    destroyed: false, phase: 'ACKNOWLEDGE', stationId: 2, animation: {} };
  const save = normalizeLatchNineSave(raw);
  assert.equal(save.cleanArrivals, 100000); assert.equal(save.incidentIds.length, 16);
  assert.equal(save.incidentIds[0], 'i14'); assert.equal('phase' in save, false);
  const service = createLatchNineService(save);
  service.serialize().incidentIds.push('foreign');
  assert.equal(service.serialize().incidentIds.includes('foreign'), false);
  assert.equal(normalizeLatchNineSave({ cleanArrivals: -5 }).cleanArrivals, 0);
});


test('manual approach gives mouth/alignment cues before permission, then READY only at the actual berth', () => {
  const f = fixture({ manifest: true });
  f.player.pos = { x: 350, z: -350 };
  let out = f.step();
  assert.equal(out.phase, 'APPROACH');
  assert.equal(out.clearance, 'NOT_READY');
  assert.equal(out.guidance.stage, 'corridor-mouth');
  assert.equal(out.dockReady, false);
  const mouth = out.guidance.target;
  f.player.pos = { ...mouth };
  f.state.simTime += 0.1;
  out = f.step();
  assert.equal(out.phase, 'APPROACH');
  assert.equal(out.guidance.stage, 'berth');
  assert.equal(out.clearance, 'NOT_READY');
  const berth = out.guidance.target;
  f.player.pos = { ...berth };
  f.player.vel.x = 20;
  f.state.simTime += 0.1;
  out = f.step();
  assert.equal(out.phase, 'APPROACH');
  assert.equal(out.guidance.hint, 'slow_and_align');
  assert.equal(out.dockReady, false);
  f.player.vel.x = 0;
  out = f.step();
  assert.equal(out.phase, 'GUIDE');
  assert.equal(out.clearance, 'CLEAR');
  assert.equal(out.dockReady, true);
  f.station.data.private = true;
  out = f.step();
  assert.equal(out.phase, 'HOLD');
  assert.equal(out.guidance, null, 'refusal removes the stale approach cue immediately');
  assert.equal(out.dockReady, false);
});


test('approach target reads do not engage autopilot or write player input, and revocation clears them', () => {
  const f = fixture({ manifest: true });
  f.player.pos = { x: 350, z: -350 };
  f.state.input = { moveX: 0.7, moveZ: -0.4, turnIntent: 1, actions: { dock: false } };
  f.state.player = { autopilot: { active: false, targetEntityId: null } };
  const before = structuredClone({ player: f.player, input: f.state.input, pilot: f.state.player });
  assert.equal(f.step().phase, 'APPROACH');
  assert.deepEqual({ player: f.player, input: f.state.input, pilot: f.state.player }, before);
  f.service.revoke('station_tethys');
  const held = f.step();
  assert.equal(held.phase, 'HOLD');
  assert.equal(held.guidance, null);
  assert.equal(held.dockReady, false);
});

test('off-duty service stays quiet instead of republishing every tick in another sector', () => {
  const f = fixture();
  f.state.world.currentSectorId = 'sector_elsewhere';
  const first = f.step();
  f.state.simTime += 1;
  assert.equal(f.step(), first);
});


test('a menu or administrative transition cannot manufacture the first voluntary encounter', () => {
  const f = fixture();
  f.state.mode = 'menu';
  f.step(); assert.equal(f.service.serialize().met, false);
  f.state.mode = 'flight'; f.state.ui.fulfillmentBlackoutActive = true;
  f.step(); assert.equal(f.service.serialize().met, false);
  f.state.ui.fulfillmentBlackoutActive = false;
  f.step(); assert.equal(f.service.serialize().met, true);
});
