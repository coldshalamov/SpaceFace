import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ships, getDerivedStats } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { crucibleSetupFor, crucibleHullSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { applyWeaponsColdLoadout } from '../src/systems/survivalMutators.js';
import { swarmPreviewLoadout } from '../src/ui/ship/swarmHangarModel.js';
import { requestSandboxGame, installSandboxGameStartedHook, applySandboxSetup,
  applyCombatLabSetup } from '../src/ui/sandbox/sandboxSetup.js';

function preparation() {
  const state = createGameState(4242), bus = createBus();
  const world = { enterSector() {}, relocatePlayerInSector() { return true; } };
  const registry = { get: name => ({ ships, economy, runSession, world })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  economy.init(ctx); ships.init(ctx); ships.newGame(); runSession.init(ctx);
  return { state, ctx, active: () => state.player.ownedShips[state.player.activeShipIndex] };
}

test('opening equipment exactly matches the selected fit, including Hitch and deliberately empty fits', () => {
  for (const [starterId, cold = false] of [
    ['energy_baseline'], ['veil_step'], ['ricochet_runner'],
    ['hull:ship_kestrel'], ['hull:ship_hornet'],
    ['energy_baseline', true], ['veil_step', true], ['ricochet_runner', true],
  ]) {
    const h = preparation();
    const adventure = structuredClone(h.active().fittings);
    const setup = starterId.startsWith('hull:')
      ? crucibleHullSetupFor({ hullId: starterId.slice(5), seed: 4242 }).value
      : crucibleSetupFor({ starterId, seed: 4242 }).value;
    if (cold) setup.loadout = applyWeaponsColdLoadout(setup.loadout);
    const preview = swarmPreviewLoadout(starterId, cold ? 'weapons_cold' : null);
    const receipt = applySandboxSetup(h.ctx, crucibleLaunchConfig(setup));
    assert.equal(receipt.ok, true, starterId);
    assert.equal(h.active().defId, preview.hull.id);
    assert.deepEqual(h.active().fittings, preview.fittings, `${starterId}${cold ? ' / Weapons Cold' : ''}`);
    assert.deepEqual(h.state.player.moduleInventory, [], 'discarded Adventure defaults must not become free spares');
    if (starterId === 'energy_baseline') {
      assert.deepEqual(h.active().fittings, [cold ? null : 'wpn_pulse_laser_s', null, null, null, null, null, null]);
    }
    ships.newGame();
    assert.deepEqual(h.active().fittings, adventure, 'the next Adventure still receives its normal equipment');
    runSession.destroy();
  }
});

test('exact setup preserves matching fitted identities and existing spares while consuming unwanted defaults', () => {
  const h = preparation();
  ships.takeFittedModuleInstance(0, 0);
  ships.grantModule({ defId: 'wpn_pulse_laser_s' });
  const weapon = h.state.player.moduleInventory.at(-1);
  assert.equal(ships.fitModule({ slotIndex: 0, instanceId: weapon.instanceId }), true);
  ships.grantModule({ defId: 'mod_mining_laser_s' });
  const spares = structuredClone(h.state.player.moduleInventory);
  const setup = crucibleSetupFor({ starterId: 'energy_baseline', seed: 4242 }).value;
  const first = applyCombatLabSetup(h.ctx, setup);
  assert.equal(first.hullApplied, true); assert.deepEqual(first.notFitted, []);
  assert.equal(h.active().fittedInstances[0].instanceId, weapon.instanceId);
  assert.deepEqual(h.active().fittings, ['wpn_pulse_laser_s', null, null, null, null, null, null]);
  assert.deepEqual(h.state.player.moduleInventory, spares);
  const repeated = applyCombatLabSetup(h.ctx, setup);
  assert.deepEqual(repeated, first);
  assert.equal(h.active().fittedInstances[0].instanceId, weapon.instanceId);
  assert.deepEqual(h.state.player.moduleInventory, spares, 'repeating the same exact setup creates no copies');
  runSession.destroy();
});

test('invalid requested equipment is rejected before a current ship or its inventory is changed', () => {
  const h = preparation();
  const setup = crucibleSetupFor({ starterId: 'energy_baseline', seed: 4242 }).value;
  const before = structuredClone(h.state.player);
  for (const loadout of [
    [{ slotIndex: 0, defId: 'missing_weapon' }],
    [{ slotIndex: 1, defId: 'wpn_pulse_laser_s' }],
    [{ slotIndex: 0, defId: 'wpn_pulse_laser_s' }, { slotIndex: 0, defId: 'wpn_pulse_laser_s' }],
  ]) {
    const result = applyCombatLabSetup(h.ctx, { ...setup, loadout });
    assert.equal(result.hullApplied, false);
    assert.deepEqual(h.state.player, before);
  }
  runSession.destroy();
});

test('Crucible fits its real selected hull before GPU admission and consumes setup only once', () => {
  const state = createGameState(4242);
  const bus = createBus();
  const world = { enterSector() {}, relocatePlayerInSector() { return true; } };
  const registry = { get: name => ({ ships, economy, runSession, world })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  economy.init(ctx);
  ships.init(ctx);
  ships.newGame();
  runSession.init(ctx);
  installSandboxGameStartedHook(bus, ctx);
  const setup = crucibleSetupFor({ starterId: 'web_weaver', seed: 4242 }).value;
  let ready = 0;
  bus.on('run:loadoutReady', () => ready++);
  requestSandboxGame(bus, crucibleLaunchConfig(setup));
  assert.equal(ready, 0);
  bus.emit('game:scenePrepared', {});
  const active = state.player.ownedShips[state.player.activeShipIndex];
  assert.equal(active.defId, setup.hullId);
  for (const item of setup.loadout) assert.equal(active.fittings[item.slotIndex], item.defId);
  assert.equal(state.run.kind, 'survival');
  assert.equal(state.player.combatProfile, 'crucible');
  const stats = getDerivedStats(active.defId, active.fittings, state.player);
  assert.equal(stats.shieldMax, SHIPS.find(ship => ship.id === active.defId).shield);
  assert.equal(ready, 1);
  bus.emit('game:started', {});
  bus.emit('game:scenePrepared', {});
  assert.equal(ready, 1, 'late start notifications cannot reset the fitted build');
  ships.newGame();
  assert.equal(state.player.combatProfile, undefined, 'the next Adventure restores its own profile');
});
