// CPU/component evidence only. Viewer positions and legacy slot shapes below
// are explicit fixtures, not an ordinary flight or GPU-visibility claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneRpc } from '../src/core/simLaneCommands.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { installRealmFs } from '../scripts/lib/simRealm.mjs';
import { createReadModel, applySpawnInfos } from '../scripts/lib/simReadModel.mjs';
import { world as worldPrototype } from '../src/systems/world.js';
import { insertDressingRow, dropDressingRow } from '../src/world/dressingTable.js';
import { VX_FREE_DRIVE_POI, VX_FREE_DRIVE_SECTOR_ID as SID,
  VX_FREE_DRIVE_ENTRY_GUIDANCE, VX_FREE_DRIVE_STRUCTURES } from '../src/data/vxFreeDriveRing.js';
import { buildSystemModel, resolveGalaxyMapPrimaryAction, emitGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';
import { crackerRunEntryGuidance } from '../src/ui/crackerRunGuidance.js';
import { resolveFlightObjectiveCommand, flightDestinationSurface,
  objectiveBearingGlyph, objectiveTravelReadout } from '../src/ui/hud.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

function browserWorker() {
  const entry = new URL('../src/core/wholeSimBrowserWorker.js', import.meta.url).href;
  return new Worker(new URL(`data:text/javascript,${encodeURIComponent(`
    import { parentPort } from 'node:worker_threads';
    const pending = [];
    globalThis.self = globalThis;
    globalThis.postMessage = (message, transfer) => {
      parentPort.postMessage(message, Array.isArray(transfer) ? transfer : []);
      if (message.kind === 'bye') parentPort.close();
    };
    parentPort.on('message', data => typeof self.onmessage === 'function'
      ? self.onmessage({ data }) : pending.push(data));
    await import(${JSON.stringify(entry)});
    for (const data of pending.splice(0)) self.onmessage({ data });
  `)}`), { type: 'module' });
}

test('default worker publishes original Mouth identity into the real selected-course HUD reader', async () => {
  const state = createGameState(4242), bus = createBus(), worker = browserWorker();
  state.timeScale = 0;
  let receive, lane;
  const exited = new Promise((done, reject) => {
    worker.once('exit', code => code === 0 ? done() : reject(new Error(`worker exit ${code}`)));
    worker.once('error', reject);
  });
  try {
    worker.on('message', message => receive?.(message));
    lane = createSimLaneRuntime({ state, bus, registry: {},
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: { scenarioContract },
      channelFactory: () => ({ post: message => worker.postMessage(message),
        onMessage: handler => { receive = handler; }, terminate() {} }),
    });
    await lane.readyPromise;
    assert.equal((await laneRpc('newGameBoot', { opts: { seed: 4242 } })).ok, true);
    const target = buildSystemModel(state, SID).points.find(row => row.id === VX_FREE_DRIVE_POI.id);
    assert.ok(target, 'the canonical published POI reaches the public chart model');
    const action = resolveGalaxyMapPrimaryAction(state, target);
    assert.equal(action.kind, 'waypoint');
    action.coursePayload.autopilot = false;
    assert.equal(emitGalaxyMapPrimaryAction(bus, action), true);
    await laneRpc('journalRebuild');
    assert.equal(state.nav.waypoint.label, VX_FREE_DRIVE_POI.name);
    const rows = [...state.entities.values()].filter(row => row.data?.vxFreeDrivePoiId === VX_FREE_DRIVE_POI.id);
    assert.equal(rows.length, 32, 'semantic metadata uses the existing spawn-info channel');
    const mouth = rows.find(row => row.data.vxFreeDriveId === VX_FREE_DRIVE_ENTRY_GUIDANCE.mouthId);
    assert.ok(mouth);
    // Viewer-only arrival staging after the actual worker reply. No body in the
    // worker is relocated and no simulation step or native-work claim is made.
    state.mode = 'flight';
    const player = state.entities.get(state.playerId);
    player.pos = { x: target.x + 30, z: target.z + 10 };
    const beforeNav = structuredClone(state.nav);
    const command = resolveFlightObjectiveCommand(state);
    assert.equal(command.owner, 'navigation');
    const shown = flightDestinationSurface(state, command);
    assert.match(shown.line, /Cracker Run.*unscored/);
    assert.match(shown.line, /No start.*Buoys lead north.*solid berth ribs/);
    assert.ok(shown.line.includes(objectiveBearingGlyph(state, { pos: mouth.pos })));
    assert.ok(shown.line.includes(objectiveTravelReadout(state, { pos: mouth.pos }).distanceText));
    assert.deepEqual(state.nav, beforeNav, 'guidance never rewrites or advances navigation');
    state.world.frameOrigin = { x: 100000, z: -200000 };
    assert.equal(flightDestinationSurface(state, command).line, shown.line,
      'already-global folded poses are never offset twice');
    mouth.pos = { x: mouth.pos.x + 20, z: mouth.pos.z - 10 };
    const updated = flightDestinationSurface(state, command);
    assert.ok(updated.line.includes(objectiveTravelReadout(state, { pos: mouth.pos }).distanceText));
    assert.notEqual(updated.line, shown.line, 'the reader uses the current folded body, not an authored/stale pose');

    const originalWaypoint = state.nav.waypoint;
    for (const wrong of [
      { ...originalWaypoint, pos: { x: target.x + 1, z: target.z } },
      { ...originalWaypoint, kind: 'mission' },
      { ...originalWaypoint, targetEntityId: mouth.id },
      { ...originalWaypoint, sectorId: 'sector_ceres_belt' },
    ]) {
      state.nav.waypoint = wrong;
      assert.equal(crackerRunEntryGuidance(state, wrong), null);
      assert.doesNotMatch(flightDestinationSurface(state, { owner: 'navigation', waypoint: wrong }).line, /No start/);
    }
    state.nav.waypoint = originalWaypoint;
    for (const mode of ['paused', 'loading', 'menu']) {
      state.mode = mode; assert.equal(crackerRunEntryGuidance(state, originalWaypoint), null);
    }
    state.mode = 'flight'; state.ui.docked = true;
    assert.equal(crackerRunEntryGuidance(state, originalWaypoint), null);
    state.ui.docked = false; player.alive = false;
    assert.equal(crackerRunEntryGuidance(state, originalWaypoint), null);
    player.alive = true; mouth.alive = false;
    assert.equal(crackerRunEntryGuidance(state, originalWaypoint), null);
    mouth.alive = true; state.entities.delete(mouth.id);
    assert.equal(crackerRunEntryGuidance(state, originalWaypoint), null);
    state.entities.set(mouth.id, { ...mouth, data: { placeId: mouth.data.placeId, name: mouth.data.name } });
    assert.equal(crackerRunEntryGuidance(state, originalWaypoint), null, 'recycled display descriptors do not establish venue identity');
  } finally { lane?.close(); await exited; }
});

function worldFixture() {
  const state = createGameState(4242), bus = createBus(), rebuilds = [];
  const spawnEntity = spec => {
    const row = { ...spec, id: state.nextEntityId++, alive: true,
      pos: { ...spec.pos }, vel: { x: 0, z: 0 }, data: { ...spec.data }, flags: { ...spec.flags } };
    state.entities.set(row.id, row); state.entityList.push(row); return row;
  };
  const world = Object.create(worldPrototype);
  world.init({ state, bus, helpers: { hash32, mulberry32, spawnEntity,
    requestPresentationRebuild: reason => rebuilds.push(reason) }, registry: { get: () => null } });
  world.newGame(); state.mode = 'flight'; state.world.currentSectorId = SID;
  return { world, state, rebuilds };
}

test('actual cached-FULL return stamps legacy originals once without remint, motion or RNG', () => {
  const h = worldFixture(), sector = h.state.world.sectors[SID], active = h.world._emptySectorBag();
  h.world._spawnFreeDriveRing(sector, active);
  const originals = h.state.world.dressing.rows.slice(), originalData = originals.map(row => row.data);
  // Recreate precisely the legacy owner-slot shape; original physical/table
  // rows remain untouched except for removing the new optional presentation tags.
  active.dressing = active.dressing.map(({ id, placeId, pos, paletteClass }) => ({ id, placeId, pos, paletteClass }));
  for (const row of originals) { delete row.data.vxFreeDriveId; delete row.data.vxFreeDrivePoiId; }
  active.fullExtrasBuilt = true; h.state.world.sectorContents[SID] = active;
  const rng = h.state.rng.getState(), allocator = h.state.nextEntityId;
  const poses = originals.map(row => ({ pos: { ...row.pos }, rot: row.rot, radius: row.radius, collides: row.collides }));
  h.world._promoteSectorToFull(SID);
  assert.deepEqual(h.state.world.dressing.rows, originals);
  for (let i = 0; i < originals.length; i++) {
    assert.equal(h.state.world.dressing.byId.get(originals[i].id), originals[i]);
    assert.equal(originals[i].data, originalData[i]);
    assert.equal(originals[i].data.vxFreeDrivePoiId, VX_FREE_DRIVE_POI.id);
    assert.deepEqual({ pos: originals[i].pos, rot: originals[i].rot,
      radius: originals[i].radius, collides: originals[i].collides }, poses[i]);
  }
  assert.equal(originals.length, 32);
  assert.equal(new Set(originals.map(row => row.data.vxFreeDriveId)).size, 32);
  assert.equal(h.state.nextEntityId, allocator); assert.deepEqual(h.state.rng.getState(), rng);
  assert.deepEqual(h.rebuilds, ['cracker-run-guidance']);
  h.world._promoteSectorToFull(SID);
  assert.deepEqual(h.rebuilds, ['cracker-run-guidance'], 'already stamped cached returns do not republish');

  const mouth = originals.find(row => row.data.vxFreeDriveId === VX_FREE_DRIVE_ENTRY_GUIDANCE.mouthId);
  const slot = active.dressing.find(row => row.id === mouth.id), originalSlotId = slot.id;
  dropDressingRow(h.state, mouth.id);
  const foreign = insertDressingRow(h.state, { id: mouth.id, pos: mouth.pos, radius: mouth.radius,
    homeSectorId: SID, data: { worldDressing: true, worldOneOff: true, placeId: 'place_nav_buoy',
      name: 'Foreign marker', homeSectorId: SID, sectorId: SID } });
  h.world._promoteSectorToFull(SID);
  assert.equal(slot.id, originalSlotId);
  assert.equal(h.state.world.dressing.byId.get(mouth.id), foreign);
  assert.equal(foreign.data.vxFreeDriveId, undefined);
  assert.equal(h.state.world.dressing.rows.length, 32);
  assert.deepEqual(h.rebuilds, ['cracker-run-guidance']);
  const dead = originals.find(row => row.radius === 10 && row.alive !== false);
  dead.alive = false; delete dead.data.vxFreeDriveId;
  const missing = originals.find(row => row.radius === 10 && row !== dead);
  dropDressingRow(h.state, missing.id);
  const retainedIds = active.dressing.map(row => row.id), nextId = h.state.nextEntityId;
  h.world._promoteSectorToFull(SID);
  assert.equal(dead.data.vxFreeDriveId, undefined, 'dead originals are not restamped');
  assert.equal(h.state.world.dressing.byId.has(missing.id), false);
  assert.deepEqual(active.dressing.map(row => row.id), retainedIds);
  assert.equal(h.state.nextEntityId, nextId, 'missing/dead originals never remint during metadata reconciliation');
});

test('legacy warm stamps reach main on the actual next host rebuild, preserving original rows', async () => {
  installRealmFs({ readFileSync, resolve });
  const lane = createSimHost(), model = createReadModel();
  try {
    const initial = await lane.init({ profile: 'production', seed: 4242 });
    applySpawnInfos(model, structuredClone(initial).spawnInfos);
    const boot = await lane.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1, p: {
      id: 'boot', op: 'newGameBoot', payload: { opts: { seed: 4242 } },
    } }] });
    applySpawnInfos(model, structuredClone(boot).spawnInfos);
    const state = lane.host.state, world = lane.host.registry.get('world');
    const active = state.world.sectorContents[SID];
    const originals = state.world.dressing.rows.filter(row => row.data?.vxFreeDrivePoiId === VX_FREE_DRIVE_POI.id);
    active.dressing = active.dressing.map(slot => slot.vxFreeDriveId
      ? { id: slot.id, placeId: slot.placeId, pos: slot.pos, paletteClass: slot.paletteClass } : slot);
    for (const row of originals) {
      delete row.data.vxFreeDriveId; delete row.data.vxFreeDrivePoiId;
      const facade = model.entities.get(row.id);
      delete facade.data.vxFreeDriveId; delete facade.data.vxFreeDrivePoiId;
    }
    const beforeId = state.nextEntityId, rng = state.rng.getState();
    world._promoteSectorToFull(SID);
    const reply = structuredClone(await lane.tick({ steps: 0, commands: [] }));
    assert.equal(reply.journalFullRebuild, true);
    applySpawnInfos(model, reply.spawnInfos);
    for (const row of originals) {
      assert.equal(state.world.dressing.byId.get(row.id), row);
      assert.equal(model.entities.get(row.id).data.vxFreeDrivePoiId, VX_FREE_DRIVE_POI.id);
      assert.equal(model.entities.get(row.id).data.vxFreeDriveId, row.data.vxFreeDriveId);
    }
    assert.equal(originals.length, 32);
    assert.equal(state.nextEntityId, beforeId); assert.deepEqual(state.rng.getState(), rng);
    world._promoteSectorToFull(SID);
    const settled = await lane.tick({ steps: 0, commands: [] });
    assert.equal(settled.journalFullRebuild, false, 'hot correct metadata does not request repeated rebuilds');
  } finally { lane.shutdown(); }
});

test('cold world restore and re-entry derive stamps on their own current originals', () => {
  const source = worldFixture(), saved = JSON.parse(JSON.stringify(source.world.serialize()));
  const h = worldFixture(); h.world.deserialize(saved); h.world.enterSector(SID);
  const rows = h.state.world.dressing.rows.filter(row => row.data?.vxFreeDrivePoiId === VX_FREE_DRIVE_POI.id);
  assert.equal(rows.length, 32);
  const mouth = rows.find(row => row.data.vxFreeDriveId === VX_FREE_DRIVE_ENTRY_GUIDANCE.mouthId);
  assert.equal(mouth.data.placeId, VX_FREE_DRIVE_STRUCTURES[0].placeId);
  const active = h.state.world.sectorContents[SID], allocator = h.state.nextEntityId;
  h.world._promoteSectorToFull(SID);
  assert.equal(h.state.world.dressing.byId.get(mouth.id), mouth);
  assert.equal(h.state.nextEntityId, allocator);
  assert.equal(active.dressing.filter(row => row.vxFreeDriveId).length, 32);
});
