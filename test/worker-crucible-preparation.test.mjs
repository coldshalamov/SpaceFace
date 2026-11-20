import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createBus } from '../src/core/eventBus.js';
import { installGameStartRecovery } from '../src/core/gameStartRecovery.js';
import { runNewGameStartTransition } from '../src/core/newGameStartTransition.js';
import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';
import { buildCrucibleRetryRequest, crucibleHullSetupFor, crucibleSetupFor, crucibleLaunchConfig, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';
import { crucibleResultsScreen } from '../src/ui/screens/crucible.js';
import { applyRunShareCode, doorRunShareCode } from '../src/ui/screens/shareCode.js';
import { requestSandboxGame, applyPreparedCrucibleSetup } from '../src/ui/sandbox/sandboxSetup.js';
import { SHIPS } from '../src/data/ships.js';
import { migrateHangar } from '../src/data/swarmHangar.js';
import { swarmSellPrice } from '../src/data/survivalDraft.js';
import { emptyCrucibleProfile, saveCrucibleMeta } from '../src/systems/survivalRecords.js';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { mountScreen } from './helpers/fake-dom.mjs';

function bootCommands(id, opts, ring = createSimCommandRing()) {
  pushLaneCommand(ring, { kind: 'mode', mode: 'loading' });
  pushLaneCommand(ring, { kind: 'rpc', id, op: 'newGameBoot', args: { opts } });
  return structuredClone(ring.drain());
}

function warChestStorage() {
  const keys = {};
  const profile = emptyCrucibleProfile();
  profile.hangar = migrateHangar({ ranks: { war_chest: 2 } });
  assert.equal(saveCrucibleMeta(profile, { setItem(key, value) { keys[key] = value; } }), true);
  return keys;
}

test('public Swarm preparation settles the selected native hull and kit before boot acknowledgement', async () => {
  const bus = createBus(); let opts;
  bus.on('game:new', value => { opts = structuredClone(value); });
  const setup = crucibleSetupFor({ starterId: 'ricochet_runner', seed: 4242, ruleset: 'swarm' }).value;
  requestSandboxGame(bus, crucibleLaunchConfig(setup, 'swarm'));
  assert.equal(opts.crucibleSetup.survivalSetup.hullId, 'ship_hornet');
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242, initialSharedStoreKeys: warChestStorage(),
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const state = lane.host.state;
    const legacyAwards = [];
    lane.host.bus.on('run:awarded', award => legacyAwards.push(award.reason));
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
    assert.equal(state.run.credits, 950, 'a legacy preset retains Standard stake funding plus its 200-credit War Chest');
    assert.deepEqual(legacyAwards, ['hangar_war_chest', 'swarm:stake:contender']);
    assert.equal(state.run.telemetry.zeroScrapOpening, undefined);
    const result = ack.result;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.crucible.hullId, setup.hullId);
    assert.equal(result.crucible.fitted.length, setup.loadout.length);
    assert.equal(ready, 1);
    const owned = state.player.ownedShips[state.player.activeShipIndex];
    assert.equal(state.player.ownedShips.length, 1, 'the explicit kit has no second Adventure ship');
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
    assert.ok(!lane.host.registry.get('survivalDraft').currentOffers().some(item => item.startingEquipment),
      'an explicit prepared kit does not qualify for a second free opening fitting');
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

test('ordinary Swarm, including a shared v2 opening, offers one permanent gun or a manual bare launch', async () => {
  for (const hullId of ['ship_kestrel', 'ship_hornet']) {
    const bus = createBus(); let opts;
    bus.on('game:new', value => { opts = structuredClone(value); });
    const prepareGun = hullId === 'ship_hornet';
    const shared = prepareGun ? applyRunShareCode(doorRunShareCode({ starterId: `hull:${hullId}`, seed: 4242,
      ruleset: 'swarm', arenaId: 'helios_core', stake: 'exhibition', zeroScrapOpening: true,
      openingLesson: true, swarmThreats: ['thick_pack'] }).code) : null;
    if (prepareGun) assert.equal(shared?.ok, true);
    const setup = crucibleHullSetupFor({ hullId: shared?.hullId ?? hullId,
      seed: shared?.seed ?? 4242, ruleset: shared?.ruleset ?? 'swarm', arenaId: shared?.arenaId,
      swarmStake: shared?.stake ?? 'exhibition', swarmThreats: shared?.swarmThreats ?? ['thin_purse', 'thick_pack'] }).value;
    setup.zeroScrapOpening = shared?.zeroScrapOpening ?? true;
    setup.openingLesson = shared?.openingLesson ?? false;
    assert.equal(requestCrucibleRun(bus, setup, 'swarm'), true);
    assert.equal(opts.crucibleSetup.zeroScrapOpening, true);
    const lane = createSimHost();
    try {
      const init = await lane.init({ profile: 'production', bridgeAll: true, seed: 4242, initialSharedStoreKeys: warChestStorage(),
        scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
      const { state } = lane.host;
      const ring = createSimCommandRing();
      let tick = 0;
      let ackEnd = init.initRebuild?.end ?? 0;
      async function send(steps, commands) {
        const reply = await lane.tick({ tick: ++tick, steps, ackEnd, commands });
        ackEnd = reply.journal?.end ?? reply.rebuild?.end ?? ackEnd;
        return reply;
      }
      async function command(steps, ...descriptors) {
        for (const descriptor of descriptors) pushLaneCommand(ring, descriptor);
        return send(steps, structuredClone(ring.drain()));
      }
      const reply = await send(0, bootCommands('bare-arena', opts, ring));
      const ack = reply.rpcAcks.find(row => row.id === 'bare-arena');
      assert.equal(ack.ok, true, JSON.stringify(ack));
      assert.equal(state.run.phase, 'draft');
      assert.equal(state.run.credits, 0);
      assert.equal(state.run.telemetry.zeroScrapOpening, true);
      assert.equal(state.run.telemetry.hangar.ranks.war_chest, 2);
      assert.equal(state.run.telemetry.swarmStake, 'exhibition');
      assert.deepEqual(state.run.telemetry.threats, ['thick_pack']);
      assert.ok(reply.events.some(event => event.t === 'run:started' && event.p.openingLesson === prepareGun));
      assert.ok(!reply.events.some(event => event.t === 'run:awarded'
        && (event.p.reason === 'hangar_war_chest' || event.p.reason?.startsWith('swarm:stake:'))));
      assert.equal(state.mode, 'loading');
      assert.equal(state.timeScale, 0);
      assert.equal(state.world.currentSectorId, opts.crucibleSetup.sectorId, 'arena keeps its authored backdrop sector');
      assert.equal(state.entityList.some(entity => entity.type === 'station' && entity.alive !== false), false,
        'Swarm does not bootstrap the campaign station and gate bodies');
      assert.equal(reply.events.some(event => event.t === 'sector:discovered'), false,
        'using an arena backdrop cannot create a campaign discovery');
      assert.deepEqual(state.player.ownedShips.map(ship => ship.defId), [hullId]);
      const owned = state.player.ownedShips[state.player.activeShipIndex];
      assert.equal(owned.fittings.some(Boolean), false);
      assert.deepEqual(state.player.moduleInventory, []);
      assert.equal(state.entities.get(state.playerId).data.weapons.length, 0);
      assert.ok(reply.events.some(event => event.t === 'ui:pushScreen' && event.p.id === 'crucibleDraft'));
      const choices = state.survivalDraftPublic.offers.filter(item => item.startingEquipment && item.available);
      assert.ok(choices.length >= 2);
      for (const item of choices) {
        assert.equal(item.price, 0);
        assert.equal(item.replaces, null);
        assert.ok(Number.isInteger(item.slotIndex));
      }
      const [offer, stale] = choices;
      const before = state.run.credits;
      const draftPick = payload => ({ kind: 'busEmit', emit: 'run:draftPickRequested', payload });
      const select = item => draftPick({ offerId: item.id,
        quote: { price: item.price, slotIndex: item.slotIndex, replaces: null, replacesTrial: false } });
      let instanceId = null;
      if (prepareGun) {
        const purchase = await command(0, select(offer));
        assert.ok(purchase.events.some(event => event.t === 'run:shopPurchased' && event.p.price === 0));
        assert.ok(!purchase.events.some(event => event.t === 'run:spent'));
        assert.equal(state.survivalDraftPublic.preparation.outcome, 'accepted');
        assert.equal(state.survivalDraftPublic.preparation.charged, false);
        assert.equal(owned.fittings[offer.slotIndex], offer.defId);
        instanceId = owned.fittedInstances[offer.slotIndex].instanceId;
        assert.ok(instanceId);
        assert.equal(state.run.modifiers.filter(row => row.startingEquipment && row.instanceId === instanceId).length, 1);
        assert.ok(!state.survivalDraftPublic.offers.some(item => item.startingEquipment && item.available));
        const repeat = await command(0, select(stale), draftPick({ offerId: stale.id, demo: true }));
        assert.ok(!repeat.events.some(event => ['run:spent', 'run:shopPurchased'].includes(event.t)));
        assert.equal(owned.fittings.filter(Boolean).length, 1);
      }
      assert.equal(state.run.credits, before);

      const launch = await command(0, draftPick({ offerId: null }));
      assert.ok(launch.events.some(event => event.t === 'run:draftResolved' && event.p.reason === 'skipped'));
      assert.ok(!launch.events.some(event => event.t === 'game:started'));
      assert.equal(state.run.phase, 'draft');
      assert.equal(state.simTime, 0);

      const guard = createRunTransitionGuard();
      let entered = false;
      const admitRoom = ({ retry, resourcesReady }) => runNewGameStartTransition({
        guard, token: guard.begin('new-game'),
        prepareRun: async () => {
          if (!retry) return;
          const ready = await command(0, { kind: 'mode', mode: 'loading' },
            { kind: 'rpc', id: 'retry-physics', op: 'physicsPrep' });
          assert.ok(ready.rpcAcks.find(row => row.id === 'retry-physics')?.ok);
        },
        waitForLibrary: async () => true,
        waitForVisuals: async () => true,
        waitForGpuResources: async () => resourcesReady,
        enterFlight: () => { entered = true; },
      });
      // A graphics refusal leaves the canonical run held. An explicit Retry runs
      // only admission again, then the existing mode command starts Round 1.
      await assert.rejects(admitRoom({ retry: false, resourcesReady: false }), { stage: 'gpu-resources' });
      assert.equal(entered, false);
      await command(0, { kind: 'mode', mode: 'menu' });
      let retry;
      const stop = installGameStartRecovery(bus, {
        retryPreparedRun() {
          retry = admitRoom({ retry: true, resourcesReady: true });
          return true;
        },
      });
      bus.emit('game:new', opts);
      bus.emit('game:startFailed', { stage: 'gpu-resources' });
      bus.emit('game:retryStart');
      assert.equal((await retry).enteredFlight, true);
      stop();
      assert.equal(state.run.credits, before);
      assert.equal(state.player.ownedShips[state.player.activeShipIndex].fittedInstances?.[offer.slotIndex]?.instanceId ?? null, instanceId);
      assert.equal(state.simTime, 0);
      const flight = await command(1, { kind: 'mode', mode: 'flight' });
      assert.ok(flight.events.some(event => event.t === 'game:started'));
      assert.equal(state.run.phase, 'wave_intro');
      assert.equal(state.run.wave, 1);
      for (let i = 0; i < 4 && state.run.phase !== 'active'; i++) await command(60);
      assert.equal(state.run.phase, 'active');
      const stations = state.entityList.filter(entity => entity.type === 'station' && entity.alive !== false);
      assert.equal(stations.length, 17, 'the arena still installs its five fixtures and twelve rim solids');
      assert.ok(stations.every(entity => entity.data?.roomOwner && entity.collides && entity.physicsBody),
        'every station-typed arena solid retains its physics owner');
      assert.ok(state.entityList.some(entity => entity.data?.swarmArenaDebris === true));
      assert.ok(state.entityList.some(entity => entity.data?.runCohort === 'survival'));
      assert.equal(state.player.ownedShips[state.player.activeShipIndex].fittedInstances?.[offer.slotIndex]?.instanceId ?? null, instanceId);
      assert.equal(state.entities.get(state.playerId).data.weapons.length, prepareGun ? 1 : 0);

      if (prepareGun) {
        const transition = (expectedPhase, nextPhase) => ({ kind: 'busEmit', emit: 'run:transitionRequested',
          payload: { expectedPhase, nextPhase } });
        await command(0, transition('active', 'cleanup'), transition('cleanup', 'draft'));
        assert.equal(state.run.phase, 'draft');
        assert.equal(state.player.ownedShips[state.player.activeShipIndex].fittedInstances[offer.slotIndex].instanceId,
          instanceId, 'the next Equipment visit must not retire a real starting fit as a trial');
        assert.ok(!state.survivalDraftPublic.offers.some(item => item.startingEquipment && item.available));
        const ships = lane.host.registry.get('ships');
        const sell = (requestId, target) => ({ kind: 'busEmit', emit: 'run:refitSellRequested',
          payload: { requestId, ...target } });
        const assertFreeSaleRefused = (reply, requestId) => {
          assert.ok(reply.events.some(event => event.t === 'run:refitChanged' && event.p.requestId === requestId
            && event.p.ok === false && /no resale value/.test(event.p.reason)));
          assert.ok(!reply.events.some(event => event.t === 'run:awarded' && event.p.reason === 'swarm:sellBack'));
        };
        const preSalePurse = state.run.credits;
        assert.ok(state.survivalDraftPublic.refitRows.some(row => row.slotIndex === offer.slotIndex && row.startingEquipment));
        assertFreeSaleRefused(await command(0, sell('mounted-starter', { slotIndex: offer.slotIndex })), 'mounted-starter');
        assert.equal(state.player.ownedShips[state.player.activeShipIndex].fittedInstances[offer.slotIndex].instanceId, instanceId);
        assert.equal(ships.fitModule({ slotIndex: offer.slotIndex, defId: stale.defId }), true);
        assert.ok(state.player.moduleInventory.some(item => item.instanceId === instanceId && item.defId === offer.defId),
          'ordinary replacement retains the exact free fit in spares');
        assertFreeSaleRefused(await command(0, sell('spare-starter', { instanceId })), 'spare-starter');
        assert.ok(state.player.moduleInventory.some(item => item.instanceId === instanceId));
        assert.equal(state.run.credits, preSalePurse);
        assert.equal(ships.grantModule({ defId: offer.defId, reason: 'test:ordinary-acquisition' }), true);
        const second = state.player.moduleInventory.find(item => item.instanceId !== instanceId && item.defId === offer.defId);
        assert.ok(second);
        const sale = await command(0, sell('ordinary-copy', { instanceId: second.instanceId }));
        assert.ok(sale.events.some(event => event.t === 'run:refitChanged' && event.p.requestId === 'ordinary-copy' && event.p.ok));
        assert.equal(state.run.credits, preSalePurse + swarmSellPrice(offer.defId));
        assert.ok(state.player.moduleInventory.some(item => item.instanceId === instanceId));
        await command(1, draftPick({ offerId: null }));
        for (let i = 0; i < 4 && state.run.phase !== 'active'; i++) await command(60);
        assert.equal(state.run.phase, 'active');
        assert.equal(state.run.wave, 2);
        assert.equal(state.player.ownedShips[state.player.activeShipIndex].fittings[offer.slotIndex], stale.defId);
      }

      // A new run from the real recap must remember the approved Round 1 fit, including an
      // intentional bare launch. The fits and awards earned after that launch belong to the old run.
      lane.host.registry.get('combat').kill(state.entities.get(state.playerId), null, { context: 'collision_terrain' });
      const lost = await command(0);
      assert.ok(lost.events.some(event => event.t === 'run:resultsReady' && event.p.outcome === 'defeat'));
      const result = state.survivalResultsPublic.result;
      assert.equal(result.stopReason, 'player_death');
      const results = { ...crucibleResultsScreen };
      let restartOptions;
      try {
        const plate = mountScreen(results, { ctx: { state }, registryGet: name => name === 'survivalResults'
          ? { lastResult: () => result } : null });
        const again = plate.buttons.find(button => button.textContent === 'Run it again — same seed');
        assert.ok(again, 'the settled defeat offers a visible Retry');
        again.click();
        const requests = plate.emitted.filter(row => row.event === 'game:new');
        assert.equal(requests.length, 1);
        restartOptions = requests[0].payload;
      } finally { results.dispose(); }
      assert.deepEqual(restartOptions.crucibleSetup.retryOpeningEquipment, { hullId,
        gun: prepareGun ? { offerId: offer.id, defId: offer.defId, slotIndex: offer.slotIndex } : null });
      const retryRun = await send(0, bootCommands('defeat-retry', restartOptions, ring));
      assert.equal(retryRun.rpcAcks.find(row => row.id === 'defeat-retry')?.result.ok, true);
      assert.equal(state.run.phase, 'active');
      assert.equal(state.run.wave, 1);
      assert.equal(state.run.seed, 4242);
      assert.equal(state.run.credits, 0);
      assert.equal(state.run.telemetry.zeroScrapOpening, true);
      assert.ok(!retryRun.events.some(event => event.t === 'ui:pushScreen' && event.p.id === 'crucibleDraft'));
      const retryFlight = await command(1, { kind: 'mode', mode: 'flight' });
      assert.ok(retryFlight.events.some(event => event.t === 'game:started'));
      assert.equal(state.mode, 'flight');
      assert.equal(state.run.phase, 'active');
      const retryHull = state.player.ownedShips[state.player.activeShipIndex];
      assert.equal(retryHull.defId, hullId);
      assert.deepEqual(retryHull.fittings.filter(Boolean), prepareGun ? [offer.defId] : []);
      assert.deepEqual(state.player.moduleInventory, []);
      assert.equal(state.entities.get(state.playerId).data.weapons.length, prepareGun ? 1 : 0);
      if (prepareGun) {
        const grant = state.run.modifiers.find(row => row.startingEquipment);
        assert.equal(grant.slotIndex, offer.slotIndex);
        assert.equal(grant.instanceId, retryHull.fittedInstances[grant.slotIndex].instanceId);
        const staleApproval = buildCrucibleRetryRequest(setup, 'swarm', { ...result, seed: result.seed + 1 });
        assert.equal(staleApproval.setup.retryOpeningEquipment, undefined);
      }

      await command(0, { kind: 'busEmit', emit: 'game:exitToMenu', payload: {} }, { kind: 'mode', mode: 'menu' });
      if (prepareGun) {
        const fresh = buildCrucibleRetryRequest();
        assert.deepEqual(fresh.setup.loadout, []);
        assert.equal(requestCrucibleRun(bus, fresh.setup, fresh.ruleset), true);
        assert.equal(opts.crucibleSetup.retryOpeningEquipment, undefined);
        const restart = await send(0, bootCommands('fresh-from-hangar', opts, ring));
        assert.equal(restart.rpcAcks.find(row => row.id === 'fresh-from-hangar')?.result.ok, true);
        assert.equal(state.run.credits, 0);
        assert.deepEqual(state.survivalDraftPublic.offers.filter(item => item.startingEquipment && item.available)
          .map(item => [item.id, item.slotIndex]), choices.map(item => [item.id, item.slotIndex]));
        assert.equal(state.player.ownedShips[state.player.activeShipIndex].fittings.some(Boolean), false);
        await command(0, { kind: 'busEmit', emit: 'game:exitToMenu', payload: {} }, { kind: 'mode', mode: 'menu' });

        const incompatible = structuredClone(restartOptions);
        incompatible.crucibleSetup.retryOpeningEquipment.gun.slotIndex = 999;
        const fallback = await send(0, bootCommands('invalid-retry-gun', incompatible, ring));
        assert.equal(fallback.rpcAcks.find(row => row.id === 'invalid-retry-gun')?.result.ok, true);
        assert.equal(state.run.phase, 'draft', 'a refused mount leaves the free choices available');
        assert.equal(state.run.credits, 0);
        assert.ok(state.survivalDraftPublic.offers.some(row => row.startingEquipment && row.available));
        assert.deepEqual(state.run.modifiers, []);
        assert.deepEqual(state.player.moduleInventory, []);
        await command(0, { kind: 'busEmit', emit: 'game:exitToMenu', payload: {} }, { kind: 'mode', mode: 'menu' });
      }
      const adventure = await send(0, bootCommands('adventure-return', { seed: 4242 }, ring));
      assert.equal(adventure.rpcAcks.find(row => row.id === 'adventure-return')?.result.ok, true);
      assert.equal(state.run.phase, 'inactive');
      assert.ok(state.entityList.some(entity => entity.data?.stationId === 'station_helios'),
        'Adventure still materializes Helios Trade Hub after leaving Swarm');
      assert.equal(state.entityList.some(entity => entity.data?.roomOwner), false);
    } finally { lane.shutdown(); }
  }
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
