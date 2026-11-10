import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createBus } from '../src/core/eventBus.js';
import { crucibleSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame, applyPreparedCrucibleSetup } from '../src/ui/sandbox/sandboxSetup.js';
import { SHIPS } from '../src/data/ships.js';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';

function bootCommands(id, opts) {
  const ring = createSimCommandRing();
  pushLaneCommand(ring, { kind: 'mode', mode: 'loading' });
  pushLaneCommand(ring, { kind: 'rpc', id, op: 'newGameBoot', args: { opts } });
  return structuredClone(ring.drain());
}

test('public Swarm preparation settles the selected native hull and kit before boot acknowledgement', async () => {
  const bus = createBus(); let opts;
  bus.on('game:new', value => { opts = structuredClone(value); });
  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', seed: 4242, ruleset: 'swarm' }).value;
  requestSandboxGame(bus, crucibleLaunchConfig(setup, 'swarm'));
  assert.equal(opts.crucibleSetup.survivalSetup.hullId, 'ship_hornet');
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const state = lane.host.state;
    let ready = 0; const readySnapshots = [];
    lane.host.bus.on('run:loadoutReady', () => {
      ready++;
      const owned = state.player.ownedShips[state.player.activeShipIndex];
      readySnapshots.push({ defId: owned.defId, fittings: [...owned.fittings] });
    });
    const reply = await lane.tick({ tick: 1, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
      commands: bootCommands('prepared-arena', opts) });
    const ack = reply.rpcAcks.find(row => row.id === 'prepared-arena');
    assert.equal(ack.ok, true, JSON.stringify(ack));
    const result = ack.result;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.crucible.hullId, setup.hullId);
    assert.equal(result.crucible.fitted.length, setup.loadout.length);
    assert.equal(ready, 1);
    const owned = state.player.ownedShips[state.player.activeShipIndex];
    assert.equal(readySnapshots[0].defId, setup.hullId);
    for (const fit of setup.loadout) {
      assert.equal(owned.fittings[fit.slotIndex], fit.defId);
      assert.equal(readySnapshots[0].fittings[fit.slotIndex], fit.defId,
        'native fitting settlement precedes loadoutReady');
    }
    const player = state.entities.get(state.playerId);
    const def = SHIPS.find(row => row.id === setup.hullId);
    assert.equal(player.data.defId, setup.hullId);
    assert.equal(player.hullMax, def.hull);
    assert.equal(player.shieldMax, def.shield);
    assert.ok(player.data.weapons.length >= 2, 'real selected weapon mounts are ready');
    assert.equal(state.player.combatProfile, 'crucible');
    assert.equal(state.run.ruleset, 'swarm');
    assert.equal(state.run.arenaId, setup.arenaId);
    assert.ok(state.run.phase !== 'inactive');
    assert.equal(lane.host.pendingGameStarted.crucibleLaunch, true);
    state.mode = 'flight';
    const fired = [];
    lane.host.bus.on('combat:fire', row => { if (row.ownerId === player.id) fired.push(row); });
    state.input.fire = true;
    state.input.mouseWorld = { x: player.pos.x + 600, z: player.pos.z };
    lane.host.registry.get('weapons').update(1 / 60, state);
    assert.ok(fired.length > 0, 'the selected native battery produces real firing receipts');
    const before = JSON.stringify(state.player.ownedShips);
    assert.equal(applyPreparedCrucibleSetup({ state }, opts.crucibleSetup).ok, false);
    assert.equal(JSON.stringify(state.player.ownedShips), before, 'flight cannot grant a new prepared kit');
  } finally { lane.shutdown(); }
});

test('invalid native preparation cannot emit loadoutReady', () => {
  const bus = createBus(); let ready = 0;
  bus.on('run:loadoutReady', () => ready++);
  const result = applyPreparedCrucibleSetup({ state: { mode: 'loading', run: { phase: 'inactive' } }, bus },
    { survivalSetup: { hullId: 'missing' } });
  assert.equal(result.ok, false);
  assert.equal(ready, 0);
});

test('a refused preparation rejects the production boot RPC and cannot admit flight', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    let ready = 0; lane.host.bus.on('run:loadoutReady', () => ready++);
    const reply = await lane.tick({ tick: 1, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
      commands: bootCommands('refused-arena',
        { crucibleLaunch: true, crucibleSetup: { survivalSetup: { hullId: 'missing' } } }) });
    const ack = reply.rpcAcks.find(row => row.id === 'refused-arena');
    assert.equal(ack.ok, false);
    assert.match(ack.reason, /invalid-crucible-setup/);
    assert.equal(ready, 0);
    assert.equal(lane.host.pendingGameStarted, null);
    assert.equal(lane.host.state.mode, 'loading');
  } finally { lane.shutdown(); }
});
