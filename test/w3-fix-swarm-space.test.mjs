// W3-fix — the four blockers an adversarial review found in "a Swarm run lives in its own
// space", plus the two worthwhile non-blockers:
//   1. a Swarm launch no longer fails closed merely because no `world` system is installed;
//   2. every worker-lane boot (and every sector/arena enter) publishes world membership and
//      discovery, and an arena enter resolves its sky from the authored catalog when the
//      throttled mirror has not shipped the arena's sector yet;
//   3. campaign story plants stand down inside a Swarm arena;
//   4. the wanted impound derives the lock pad from the admitted yard seat, removes the yard
//      when the lock cannot stand, and stores the admitted seats;
//   5. sector audio theme/radar boundary state resets on swarm:arenaEntered;
//   6. spawn admission never mints a physics body on a dormant field rock.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { applyPreparedCrucibleSetup, applySandboxSetup } from '../src/ui/sandbox/sandboxSetup.js';
import { crucibleLaunchConfig, crucibleSetupFor } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createPl195FixedX } from '../src/systems/plants/pl195FixedX.js';
import { createPl264LaneLight } from '../src/systems/plants/pl264LaneLight.js';
import { plantsRuntime } from '../src/systems/plants/plantsRuntime.js';
import {
  lawSecurity,
  WANTED_IMPOUND_PAD_RADIUS,
  WANTED_IMPOUND_YARD_RADIUS,
} from '../src/systems/lawSecurity.js';
import { spawnClearanceRadius, spawnPointIsClear } from '../src/systems/spawnClearance.js';
import { audio } from '../src/audio/audioSystem.js';
import { createRadar } from '../src/ui/radar.js';
import { arenaSectorForEntry } from '../src/render/renderer.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));

function survivalSetup(arenaId = 'helios_core', seed = 73311) {
  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', arenaId, ruleset: SWARM_RULESET, seed });
  assert.equal(setup.ok, true, 'the focused fixture names a schema-valid Swarm setup');
  return setup.value;
}

// The launch-gating tests isolate the world gate; an empty loadout keeps the ships writer
// stub to its hull check instead of re-testing the fitting contract.
function bareSurvivalSetup(arenaId = 'helios_core', seed = 73311) {
  return {
    schema: 'spaceface.combatLabSetup.v1',
    hullId: 'ship_hornet',
    loadout: [],
    enemyPackageId: 'wasp_flight',
    arenaId,
    seed,
    wave: 1,
  };
}

// ---------------------------------------------------------------------------
// 1. Swarm launch without a world system
// ---------------------------------------------------------------------------

function launchState() {
  const player = {
    credits: 0,
    researchedNodes: [],
    researchPoints: 0,
    moduleInventory: [],
    ownedShips: [{ defId: 'ship_hornet', fittings: [] }],
    activeShipIndex: 0,
  };
  return {
    mode: 'loading',
    player,
    run: {},
    entities: new Map(),
    entityList: [],
    world: {},
  };
}

function launchCtx(world = null) {
  const bus = createBus();
  const events = [];
  bus.on('run:loadoutReady', payload => events.push({ type: 'run:loadoutReady', payload }));
  bus.on('run:openingPrepareRequested', payload => events.push({ type: 'run:openingPrepareRequested', payload }));
  const ships = { buyShip: () => true, unlockTech: () => true, researchable: () => true };
  const registry = {
    get: name => (name === 'ships' ? ships : name === 'world' ? world : null),
  };
  return { ctx: { state: launchState(), bus, helpers: {}, registry }, events };
}

test('W3-fix: a Swarm launch proceeds when no world system is installed', () => {
  const { ctx, events } = launchCtx(null);
  const result = applySandboxSetup(ctx, {
    survivalRuleset: SWARM_RULESET,
    survivalSetup: bareSurvivalSetup(),
  });
  assert.equal(result?.ok, true, JSON.stringify(result));
  assert.equal(events.filter(e => e.type === 'run:loadoutReady').length, 1,
    'the loadout receipt still reaches the run owner');
  assert.equal(events.filter(e => e.type === 'run:openingPrepareRequested').length, 1);
});

test('W3-fix: an installed world still fails the Swarm launch closed when it refuses the arena', () => {
  const world = { enterSector: () => null };
  const { ctx, events } = launchCtx(world);
  const result = applySandboxSetup(ctx, {
    survivalRuleset: SWARM_RULESET,
    survivalSetup: bareSurvivalSetup(),
  });
  assert.equal(result?.ok, false);
  assert.equal(result?.reason, 'swarm-arena-entry-unavailable');
  assert.equal(events.filter(e => e.type === 'run:loadoutReady').length, 0,
    'a refused arena entry must not publish a ready loadout');
});

test('W3-fix: the prepared Crucible path still requires a world system', () => {
  const bus = createBus();
  const result = applyPreparedCrucibleSetup(
    { state: { mode: 'loading', run: { phase: 'inactive' } }, bus },
    { survivalRuleset: SWARM_RULESET, survivalSetup: bareSurvivalSetup() },
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'swarm-arena-entry-unavailable');
});

// ---------------------------------------------------------------------------
// 2. Worker-lane arena switch and the mirrored sector
// ---------------------------------------------------------------------------

test('W3-fix: a worker-lane Swarm boot publishes the new arena membership and discovery', async () => {
  const lane = createSimHost();
  try {
    const ready = await lane.init({ profile: 'production', seed: 73311, bridgeAll: true, scenarioContract });
    const ring = createSimCommandRing();
    let ackEnd = ready.initRebuild?.end ?? 0;
    let tick = 0;
    async function send(steps, ...commands) {
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps, ackEnd, commands: structuredClone(ring.drain()) });
      ackEnd = reply.journal?.end ?? reply.rebuild?.end ?? ackEnd;
      return reply;
    }
    const adventure = await send(0, { kind: 'mode', mode: 'loading' },
      { kind: 'rpc', id: 'boot-adventure', op: 'newGameBoot', args: { opts: { seed: 73311 } } });
    assert.equal(adventure.rpcAcks.find(a => a.id === 'boot-adventure')?.result?.ok, true);

    const bus = createBus();
    let swarmOpts = null;
    bus.on('game:new', payload => { swarmOpts = structuredClone(payload); });
    requestSandboxGame(bus, crucibleLaunchConfig(survivalSetup('ceres_belt'), SWARM_RULESET));
    assert.ok(swarmOpts?.crucibleLaunch);
    assert.equal(swarmOpts?.crucibleSetup?.survivalRuleset, SWARM_RULESET);

    const reply = await send(0, { kind: 'mode', mode: 'loading' },
      { kind: 'rpc', id: 'boot-swarm', op: 'newGameBoot', args: { opts: swarmOpts } });
    const ack = reply.rpcAcks.find(a => a.id === 'boot-swarm');
    assert.equal(ack?.result?.ok, true, JSON.stringify(ack));
    assert.equal(lane.host.state.world.currentSectorId, 'sector_ceres_belt');
    assert.equal(lane.host.state.world.swarmArenaOnly, true);
    const paths = new Set((reply.domainUpdates || []).map(update => update.segs.join('.')));
    assert.ok(paths.has('world.sectors'),
      'the arena boot must publish world.sectors in the same reply as its acknowledgement');
    assert.ok(paths.has('world.discovery'),
      'the arena boot must publish world.discovery in the same reply as its acknowledgement');
  } finally {
    lane.shutdown();
  }
});

test('W3-fix: an arena enter resolves its sky from the authored catalog when the mirror is absent', () => {
  const mirrored = { id: 'sector_helios_prime', name: 'Mirrored Helios' };
  assert.equal(arenaSectorForEntry({ world: { sectors: { sector_helios_prime: mirrored } } }, 'sector_helios_prime'),
    mirrored, 'a shipped mirror entry still wins');
  const authored = arenaSectorForEntry({ world: { sectors: {} } }, 'sector_vesta_forge');
  assert.equal(authored?.id, 'sector_vesta_forge', 'the authored sector fills the missing mirror leaf');
  assert.ok(authored?.name, 'the authored record carries the sky/palette identity');
  assert.equal(arenaSectorForEntry({ world: { sectors: {} } }, 'sector_does_not_exist'), null);
});

// ---------------------------------------------------------------------------
// 3. Campaign plants inside a Swarm arena
// ---------------------------------------------------------------------------

function plantState({ swarmArenaOnly = true } = {}) {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  return {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: 1,
    entities: new Map([[1, player]]),
    entityList: [player],
    world: { currentSectorId: 'sector_helios_prime', swarmArenaOnly },
  };
}

test('W3-fix: PL-195 and PL-264 spawn nothing while a Swarm arena owns the space', () => {
  const state = plantState();
  const spawned = [];
  const removed = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: 100 + spawned.length, alive: true };
      state.entities.set(entity.id, entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) { removed.push(id); state.entities.delete(id); },
  };
  const bus = createBus();
  const fixedX = createPl195FixedX();
  fixedX.init({ state, bus, helpers });
  fixedX.update(1 / 60, state);
  const laneLight = createPl264LaneLight();
  laneLight.init({ state, bus, helpers });
  laneLight.update(1 / 60, state);
  assert.equal(spawned.length, 0, 'neither Adventure plant plants a prop in the arena');
  assert.equal(removed.length, 0, 'nothing was owned to remove');

  // A plant that still owns a prop leaves with it if the arena state appears mid-session.
  state.entities.set(42, { id: 42, alive: true });
  fixedX._xId = 42;
  fixedX.update(1 / 60, state);
  laneLight.init({ state, bus, helpers });
  laneLight._lightId = 42;
  state.entities.set(42, { id: 42, alive: true });
  laneLight.update(1 / 60, state);
  assert.ok(removed.includes(42), 'an owned campaign prop is removed on the arena guard');
});

test('W3-fix: plantsRuntime keeps ticking inside a Swarm arena — the Pit plants live there', () => {
  // The runtime hosts the 26 Swarm/Pit plants (crowd coin, medic mule, loaner gun, free forge, ...)
  // as well as the Adventure plants, so a blanket arena guard switched shipped Swarm features off
  // (agy2 delta review). Adventure plants stand down on their own (PL-195, PL-264 above) and the
  // round-3 census proves nothing else leaks in.
  const runtime = Object.create(plantsRuntime);
  const state = plantState();
  let calls = 0;
  runtime._ctx = { state };
  runtime._boundPlants = [{ name: 'probe', update() { calls += 1; } }];
  runtime.update(1 / 60, state);
  assert.equal(calls, 1, 'a Swarm arena still ticks the runtime\'s plants');
});

// ---------------------------------------------------------------------------
// 4. Wanted impound yard/lock seats
// ---------------------------------------------------------------------------

function lawHarness() {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 2,
    meta: { seed: 7 },
    rng: mulberry32(7),
    entities: new Map(),
    entityList: [],
    playerId: 1,
    player: {
      credits: 0,
      heat: 9,
      heatZone: { active: true, center: { x: 4000, z: 0 }, radius: 3700 },
    },
    world: { currentSectorId: 'sector_helios_prime', sectors: {}, asteroidField: { rocks: [] } },
    nextEntityId: 10,
  };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 10 };
  state.entities.set(1, player);
  state.entityList.push(player);
  const spawned = [];
  const harness = { state, bus, spawned, failLockSpawn: false };
  const helpers = {
    spawnBudget: { request: () => 0 },
    spawnEntity(spec) {
      if (harness.failLockSpawn && spec?.data?.wantedImpoundLock) return null;
      const entity = {
        ...spec,
        id: state.nextEntityId++,
        alive: true,
        pos: { x: spec.pos.x, z: spec.pos.z },
        vel: { x: 0, z: 0 },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return;
      entity.alive = false;
      state.entities.delete(id);
      const index = state.entityList.indexOf(entity);
      if (index >= 0) state.entityList.splice(index, 1);
    },
  };
  lawSecurity.init({ state, bus, helpers, registry: null });
  harness.destroy = () => { try { lawSecurity.destroy(); } catch (_) { /* best effort */ } };
  return harness;
}

test('W3-fix: the wanted impound lock stands beside the admitted yard, clear of its own berth', t => {
  const h = lawHarness();
  t.after(() => h.destroy());
  lawSecurity._postWantedImpound(h.state);
  const pound = h.state.lawSecurity.wantedImpound;
  assert.ok(pound, 'the pound posts');
  const yard = h.state.entities.get(pound.yardId);
  const lock = h.state.entities.get(pound.lockId);
  assert.ok(yard && lock);
  assert.deepEqual(pound.yard, { x: yard.pos.x, z: yard.pos.z }, 'the stored yard is the admitted seat');
  assert.deepEqual(pound.lock, { x: lock.pos.x, z: lock.pos.z }, 'the stored lock is the admitted seat');
  assert.deepEqual(pound.work, pound.yard, 'the work yard addresses the standing yard');
  const d = Math.hypot(lock.pos.x - yard.pos.x, lock.pos.z - yard.pos.z);
  const standoff = WANTED_IMPOUND_YARD_RADIUS + spawnClearanceRadius(WANTED_IMPOUND_PAD_RADIUS) + 1;
  assert.ok(Math.abs(d - standoff) < 1e-6,
    `lock centre sits at ${standoff} WU from the yard, got ${d}`);
});

test('W3-fix: a blocked first lock seat walks the ring and never lands inside the yard', t => {
  // Learn where attempt 0 puts the lock, then block just beyond it so the yard's own seat stays
  // clear but the lock's first seat does not (agy2 delta review: with the yard ignored, a retry
  // ring could seat the solid pad inside the solid yard).
  const probe = lawHarness();
  lawSecurity._postWantedImpound(probe.state);
  const first = probe.state.lawSecurity.wantedImpound;
  const firstYard = { ...first.yard };
  const firstLock = { ...first.lock };
  probe.destroy();

  const h = lawHarness();
  t.after(() => h.destroy());
  const ux = (firstLock.x - firstYard.x) / Math.hypot(firstLock.x - firstYard.x, firstLock.z - firstYard.z);
  const uz = (firstLock.z - firstYard.z) / Math.hypot(firstLock.x - firstYard.x, firstLock.z - firstYard.z);
  const blocker = {
    id: 99, type: 'asteroid', alive: true, collides: true, radius: 1,
    pos: { x: firstLock.x + ux * 60, z: firstLock.z + uz * 60 }, vel: { x: 0, z: 0 },
  };
  h.state.entities.set(blocker.id, blocker);
  h.state.entityList.push(blocker);
  lawSecurity._postWantedImpound(h.state);
  const pound = h.state.lawSecurity.wantedImpound;
  assert.ok(pound, 'the pound still posts');
  assert.deepEqual(pound.yard, firstYard, 'the yard kept its clear first seat');
  assert.notDeepEqual(pound.lock, firstLock, 'the blocked first lock seat was not used');
  const yard = h.state.entities.get(pound.yardId);
  const lock = h.state.entities.get(pound.lockId);
  const reach = WANTED_IMPOUND_YARD_RADIUS + spawnClearanceRadius(WANTED_IMPOUND_PAD_RADIUS);
  const d = Math.hypot(lock.pos.x - yard.pos.x, lock.pos.z - yard.pos.z);
  assert.ok(d >= reach - 1e-6, `the lock pad clears the yard's disc: ${d} >= ${reach}`);
});

test('W3-fix: a failed lock spawn removes the yard and the retry leaves exactly one pound standing', t => {
  const h = lawHarness();
  t.after(() => h.destroy());
  h.failLockSpawn = true;
  lawSecurity._postWantedImpound(h.state);
  assert.equal(h.state.lawSecurity.wantedImpound, null, 'the post did not complete');
  assert.equal(h.state.entityList.filter(e => e.data?.wantedImpoundYard).length, 0,
    'the already-spawned yard hull was removed, not leaked');
  assert.ok(h.spawned.some(e => e.data?.wantedImpoundYard), 'the fixture did spawn the yard before the lock failed');

  h.failLockSpawn = false;
  lawSecurity._postWantedImpound(h.state);
  assert.ok(h.state.lawSecurity.wantedImpound?.open, 'the retry posts the pound');
  assert.equal(h.state.entityList.filter(e => e.data?.wantedImpoundYard).length, 1);
  assert.equal(h.state.entityList.filter(e => e.data?.wantedImpoundLock).length, 1);
});

// ---------------------------------------------------------------------------
// 5. Audio and radar sector-enter resets
// ---------------------------------------------------------------------------

test('W3-fix: a Swarm arena enter resets the sector audio theme and encounter memory', t => {
  try { audio.destroy(); } catch (_) { /* a previous test may not have initialised it */ }
  t.after(() => { try { audio.destroy(); } catch (_) { /* best effort */ } });
  const state = {
    playerId: 1,
    simTime: 0,
    tick: 0,
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, flags: {} }]]),
    player: { credits: 0, cargo: { items: {} } },
    world: { currentSectorId: 'sector_helios_prime', sectors: {}, activeSector: { stations: [] } },
    settings: {
      audio: { muted: false, master: 0.5, sfx: 0.5, music: 0.5, engine: 0.5, ambient: 0.5, combat: 0.5, ui: 0.5 },
      video: { motionReduce: true },
      accessibility: { audioCues: true, captions: false },
    },
    ui: { docked: false, screenStack: [] },
  };
  const bus = createBus();
  audio.init({ state, bus, helpers: {} });
  const rt = state.audioRuntime;
  rt._activeCombatEncounters.add('old-fight');
  rt._doctrineThreatUntil = 5;
  bus.emit('swarm:arenaEntered', { sectorId: 'sector_vesta_forge', enterEpoch: 1 });
  assert.equal(rt._themeSectorId, 'sector_vesta_forge', 'the arena theme replaces the departed sector theme');
  assert.equal(rt._activeCombatEncounters.size, 0, 'departed encounter memory is cleared');
  assert.equal(rt._doctrineThreatUntil, -1e9, 'departed doctrine threat is cleared');
});

test('W3-fix: the radar resets its boundary state on a Swarm arena enter too', () => {
  // createRadar needs a real canvas/DOM; the subscription surface is the contract here.
  assert.match(createRadar.toString(), /swarm:arenaEntered/);
});

// ---------------------------------------------------------------------------
// 6. Spawn admission never mints a body on a dormant rock
// ---------------------------------------------------------------------------

function fieldState(rocks = []) {
  return {
    entities: new Map(),
    entityList: [],
    world: {
      currentSectorId: 'sector_helios_prime',
      asteroidField: { schema: 'spaceface.asteroidField.v1', rocks },
    },
    rng: mulberry32(11),
    simTime: 0,
    tick: 0,
  };
}

test('W3-fix: a dormant field rock is measured with the promo collider and never given a physicsBody', () => {
  const rock = {
    id: 9001, type: 'asteroid', fieldResident: true, alive: true, liveEntityId: null,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 30, mass: 36000,
    data: { typeId: 'ast_crystalline' },
  };
  const state = fieldState([rock]);
  // Request radius 10 → clearance 60. Authored radius 30 would reach 90 and admit the
  // point; the crystalline collider is 30 × 1.55 = 46.5, so the honest disc reaches 106.5.
  assert.equal(spawnPointIsClear(state, { x: 0, z: 0, radius: 10 }), false,
    'the dormant rock measures with the collider promotion will mint');
  assert.equal(Object.hasOwn(rock, 'physicsBody'), false,
    'admission never writes a normalized physicsBody onto a dormant record');

  const far = { ...rock, id: 9002, pos: { x: 4000, z: 4000 } };
  const clearState = fieldState([far]);
  assert.equal(spawnPointIsClear(clearState, { x: 0, z: 0, radius: 10 }), true);
  assert.equal(Object.hasOwn(far, 'physicsBody'), false,
    'the cheap distance reject leaves far shelf records untouched');
});
