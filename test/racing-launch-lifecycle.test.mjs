import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { raceLevelById, racingOfferFor, startLineFor } from '../src/data/raceLevels.js';
import { armRacingContract, completeRacingLaunch, stageRacingLaunch, noteRacingNewGame } from '../src/ui/racingLaunch.js';

function harness({ jumpState = 'IDLE', throwing = false, relocate = true, currentSectorId = 'sector_helios_prime' } = {}) {
  const state = createGameState(239), bus = createBus(), saveHost = { ...save }, events = [];
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.playerId = 1; state.entities.set(1, player); state.mode = 'flight';
  state.world.currentSectorId = currentSectorId; state.jump.state = jumpState;
  const relocations = [], enteredSectors = [], acceptedOffers = [];
  const world = {
    relocatePlayerInSector: (position, options) => { relocations.push({ position, options }); return relocate; },
    enterSector: (sectorId) => { enteredSectors.push(sectorId); state.world.currentSectorId = sectorId; },
  };
  const missions = { postAndAcceptAuthoredOffer: (offer) => {
    acceptedOffers.push(offer);
    if (throwing) throw new Error('accept failed');
    return { ok: true, missionId: 'circuit' };
  } };
  const registry = { get: name => ({ save: saveHost, world, missions })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  saveHost.init(ctx);
  let exitSuppressed = null, result;
  bus.on('game:new', noteRacingNewGame);
  bus.on('game:started', () => { result = completeRacingLaunch(ctx); });
  // Mirrors main's listener ordering: save receives the exit before main changes mode.
  bus.on('game:exitToMenu', () => { exitSuppressed = saveHost._campaignSaveSuppressed(); state.mode = 'menu'; });
  for (const event of ['race:armed', 'race:launchFailed', 'mission:abandon', 'save:started']) {
    bus.on(event, payload => events.push({ event, payload }));
  }
  return { state, bus, saveHost, ctx, events, player, world, relocations, enteredSectors, acceptedOffers,
    get result() { return result; }, get exitSuppressed() { return exitSuppressed; } };
}

function start(h) {
  const staged = stageRacingLaunch('contract_textile_qual');
  h.bus.emit('game:new', { seed: staged.seed, racingSession: true });
  h.bus.emit('game:started', {});
}

test('the game:started route accepts canonical IDLE and retains temporary save protection', () => {
  const h = harness(); start(h);
  assert.equal(h.result.ok, true);
  assert.equal(h.state.mode, 'flight');
  assert.equal(h.saveHost._campaignSaveSuppressed(), true);
  assert.ok(h.events.some(e => e.event === 'race:armed'));
  assert.equal(h.events.some(e => e.event === 'race:launchFailed'), false);
  assert.equal(completeRacingLaunch(h.ctx), null, 'a staged request is consumed once');
});

test('section missions arm in-sector without relocation or ship motion changes', () => {
  const level = raceLevelById('level_junction_return');
  const h = harness({ currentSectorId: level.sectorId });
  h.player.pos = { x: 311, z: -220 };
  h.player.vel = { x: 21, z: -9 };
  const pos = { ...h.player.pos }, vel = { ...h.player.vel };
  h.world.relocatePlayerInSector = undefined;

  const result = armRacingContract(h.ctx, 'contract_junction_jam');

  assert.equal(result.ok, true);
  assert.equal(h.relocations.length, 0);
  assert.deepEqual(h.player.pos, pos);
  assert.deepEqual(h.player.vel, vel);
  assert.equal(h.acceptedOffers[0].params.phase, 'approach');
});

test('a temporary section launch stages behind the start line and retains save protection', () => {
  const h = harness();
  const staged = stageRacingLaunch('contract_junction_jam');
  h.bus.emit('game:new', { seed: staged.seed, racingSession: true });
  h.bus.emit('game:started', {});

  assert.equal(h.result.ok, true);
  assert.deepEqual(h.enteredSectors, [raceLevelById('level_junction_return').sectorId]);
  assert.equal(h.relocations.length, 1);
  const line = startLineFor(racingOfferFor('contract_junction_jam').params);
  assert.deepEqual(h.relocations[0].position, {
    ...line,
    x: line.x - Math.cos(line.heading) * 220,
    z: line.z - Math.sin(line.heading) * 220,
  });
  assert.deepEqual(h.relocations[0].options, { reason: 'race_grid' });
  assert.equal(h.saveHost._campaignSaveSuppressed(), true);
});

test('rejected or thrown temporary arming exits under quarantine and invalidates pending saves', () => {
  for (const options of [{ jumpState: 'CHARGING' }, { throwing: true }, { relocate: false }]) {
    const h = harness(options);
    const staged = stageRacingLaunch('contract_textile_qual');
    h.bus.emit('game:new', { seed: staged.seed, racingSession: true });
    const epoch = h.saveHost._runEpoch;
    h.saveHost._autosavePending = { token: 'discarded' };
    h.bus.emit('game:started', {});
    assert.equal(h.result.ok, false);
    assert.equal(h.exitSuppressed, true, 'exit autosave sees temporary suppression');
    assert.equal(h.state.mode, 'menu');
    assert.equal(h.saveHost._autosavePending, null);
    assert.ok(h.saveHost._runEpoch > epoch);
    assert.equal(h.saveHost._campaignSaveSuppressed(), true, 'discarded menu state remains unsaveable');
    assert.equal(h.saveHost.save('quick'), false);
    h.bus.emit('game:save', { slot: 'quick' });
    assert.equal(h.events.some(e => e.event === 'save:started'), false);
    assert.ok(h.events.some(e => e.event === 'race:launchFailed'));
    h.bus.emit('game:new', {});
    assert.equal(h.saveHost._campaignSaveSuppressed(), false, 'ordinary New Game releases quarantine');
    if (options.relocate === false) assert.ok(h.events.some(e => e.event === 'mission:abandon'));
  }
});

test('rejected in-sector campaign arming does not exit or change the save epoch', async () => {
  const { armRacingContract } = await import('../src/ui/racingLaunch.js');
  const h = harness(); h.state.player.tether = { active: true, targetId: 9 };
  const epoch = h.saveHost._runEpoch;
  assert.equal(armRacingContract(h.ctx, 'contract_textile_qual').reason, 'tether_active');
  assert.equal(h.state.mode, 'flight');
  assert.equal(h.saveHost._runEpoch, epoch);
  assert.equal(h.saveHost._campaignSaveSuppressed(), false);
  assert.equal(h.events.some(e => e.event === 'race:launchFailed'), false);
});
