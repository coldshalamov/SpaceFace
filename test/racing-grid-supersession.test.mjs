import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { racingOfferFor, startLineFor } from '../src/data/raceLevels.js';
import { completeRacingLaunch, stageRacingLaunch } from '../src/ui/racingLaunch.js';

const CONTRACT = 'contract_junction_jam';
const OTHER_SECTOR = 'sector_ceres_belt';
const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));

async function runGrid(lane, scenario) {
  const sim = createSimHost();
  try {
    const init = await sim.init({ profile: 'production', seed: 4242, scenarioContract });
    const { state, bus, registry, runtime } = sim.host;
    const world = registry.get('world');
    state.mode = 'flight';
    state.ui.docked = false;
    state.player.credits = 10000;
    state.playerId = runtime.spawn({
      type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100,
    }).id;
    world.enterSector('sector_helios_prime');

    const receipts = { grids: [], armed: [], abandoned: [], exited: [] };
    bus.on('world:playerRelocated', row => { if (row.reason === 'race_grid') receipts.grids.push(row.sectorId); });
    bus.on('race:armed', row => receipts.armed.push(row.missionId));
    bus.on('mission:abandon', row => receipts.abandoned.push(row.missionId));
    bus.on('game:exitToMenu', row => receipts.exited.push(row));
    let attemptedId;
    let replacement;
    const offer = racingOfferFor(CONTRACT);
    const sectorId = offer.params.courseSectorId;
    const rememberAttempt = () => {
      const attempt = state.missions.active.find(row => row.params?.racingContractId === CONTRACT);
      attemptedId = attempt?.id;
      return attempt;
    };
    const replaceAttempt = (attempt) => {
      // Continue can replace the active array with a restored row using the same mission id.
      replacement = { ...attempt, params: { ...attempt.params } };
      state.missions.active = [replacement];
    };
    if (scenario === 'enter' || scenario === 'replace') {
      const off = bus.on('sector:exit', () => {
        off();
        const attempt = rememberAttempt();
        world.enterSector(OTHER_SECTOR);
        if (scenario === 'replace') replaceAttempt(attempt);
      });
    }
    if (scenario === 'entry-throws' || scenario === 'stale-entry-throws') {
      const flush = world._flushPendingSpawns;
      world._flushPendingSpawns = function (id, sector) {
        if (id !== sectorId) return flush.call(this, id, sector);
        rememberAttempt();
        if (scenario === 'stale-entry-throws') this.enterSector(OTHER_SECTOR);
        throw new Error('entry spawn flush failed');
      };
    }
    if (scenario === 'stale-relocation-throws') {
      world.relocatePlayerInSector = function () {
        const attempt = rememberAttempt();
        this.enterSector(sectorId);
        replaceAttempt(attempt);
        throw new Error('stale relocation failed');
      };
    }

    let result;
    if (lane === 'local') {
      assert.ok(stageRacingLaunch(CONTRACT));
      result = completeRacingLaunch({ state, bus, registry });
    } else {
      const start = startLineFor(offer.params);
      start.x -= Math.cos(start.heading) * 220;
      start.z -= Math.sin(start.heading) * 220;
      const ring = createSimCommandRing();
      ring.pushRpc('grid', 'racingArm', { offer, sectorId, start, relocate: true, allowEnterSector: true });
      const reply = await sim.tick({ tick: 1, steps: 0, ackEnd: init.initRebuild?.end ?? 0, commands: ring.drain() });
      const ack = reply.rpcAcks.find(row => row.id === 'grid');
      assert.equal(ack?.ok, true, 'the worker dispatched the circuit RPC');
      result = ack.result;
    }
    return {
      result, receipts, attemptedId, replacement, sectorId,
      active: state.missions.active.filter(row => row.status === 'active' && row.type === 'race'),
      currentSectorId: state.world.currentSectorId,
    };
  } finally {
    sim.shutdown();
  }
}

for (const lane of ['local', 'worker']) {
  test(`${lane}: a regular circuit arms in its authored sector`, async () => {
    const { result, active, receipts, currentSectorId, sectorId } = await runGrid(lane);
    assert.equal(result.ok, true);
    assert.equal(currentSectorId, sectorId);
    assert.equal(active[0].id, result.missionId);
    assert.equal(active[0].params.racingContractId, CONTRACT);
    assert.deepEqual(receipts.grids, [sectorId]);
    assert.deepEqual(receipts.abandoned, []);
    if (lane === 'local') assert.deepEqual(receipts.armed, [result.missionId]);
  });

  test(`${lane}: a newer sector entry cancels relocation and abandons only the accepted circuit`, async () => {
    const { result, active, receipts, currentSectorId, attemptedId } = await runGrid(lane, 'enter');
    assert.ok(attemptedId, 'the real missions owner accepted the circuit before travel');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'superseded');
    assert.equal(currentSectorId, OTHER_SECTOR);
    assert.deepEqual(active, []);
    assert.deepEqual(receipts, { grids: [], armed: [], abandoned: [attemptedId], exited: [] });
  });

  test(`${lane}: superseded grid cleanup preserves a replacement with the same mission id`, async () => {
    const { result, active, receipts, currentSectorId, attemptedId, replacement } = await runGrid(lane, 'replace');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'superseded');
    assert.equal(currentSectorId, OTHER_SECTOR);
    assert.equal(replacement.id, attemptedId);
    assert.equal(active[0], replacement);
    assert.deepEqual(receipts, { grids: [], armed: [], abandoned: [], exited: [] });
  });
}

test('local: an entry error after re-entry rolls back the old race without exiting the newer flight', async () => {
  const { result, active, receipts, currentSectorId, attemptedId } = await runGrid('local', 'stale-entry-throws');
  assert.ok(attemptedId);
  assert.equal(result.reason, 'superseded');
  assert.equal(currentSectorId, OTHER_SECTOR);
  assert.deepEqual(active, []);
  assert.deepEqual(receipts, { grids: [], armed: [], abandoned: [attemptedId], exited: [] });
});

test('local: an owned entry error still rolls back and exits the failed temporary launch', async () => {
  const { result, active, receipts, currentSectorId, sectorId, attemptedId } = await runGrid('local', 'entry-throws');
  assert.ok(attemptedId);
  assert.equal(result.reason, 'grid_failed');
  assert.equal(currentSectorId, sectorId);
  assert.deepEqual(active, []);
  assert.deepEqual(receipts, {
    grids: [], armed: [], abandoned: [attemptedId], exited: [{ source: 'racing-launch-failed' }],
  });
});

test('worker: a stale relocation error preserves a newer entry and its same-id race', async () => {
  const { result, active, receipts, currentSectorId, sectorId, attemptedId, replacement } =
    await runGrid('worker', 'stale-relocation-throws');
  assert.ok(attemptedId);
  assert.equal(result.reason, 'superseded');
  assert.equal(currentSectorId, sectorId);
  assert.equal(replacement.id, attemptedId);
  assert.equal(active[0], replacement);
  assert.deepEqual(receipts, { grids: [], armed: [], abandoned: [], exited: [] });
});
