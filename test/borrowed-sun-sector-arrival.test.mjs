import assert from 'node:assert/strict';
import test from 'node:test';

import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { BORROWED_SUN as C } from '../src/data/borrowedSun.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const DT = 1 / 60;

test('Borrowed Sun opens after an ordinary Helios-to-Tethys gate jump with native physics already running',
  { timeout: 240_000 }, async (t) => {
    const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 7332 });
    t.after(() => runtime.dispose());

    const { state, bus } = runtime;
    state.mode = 'flight';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3';
    state.settings.gameplay.aiBackend = 'sg06-tactical';
    state.player.credits = NEW_GAME.credits;
    const ships = runtime.getSystem('ships');
    ships.newGame();
    const player = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0,
      factionId: 'faction_free',
      isPlayer: true,
      player: state.player,
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
      pos: { x: 0, z: 0 },
    }));
    state.playerId = player.id;
    ships.recomputeActiveShip();
    const world = runtime.getSystem('world');
    world.newGame();
    runtime.getSystem('economy').newGame();
    world.enterSector(HELIOS, {});
    bus.emit('game:started', {});

    const physics = runtime.getSystem('physics');
    await physics.prepareBackend(state, { reset: true });
    await runtime.runTicks(60, DT);
    const owner = runtime.getSystem('borrowedSun');
    assert.equal(state.world.currentSectorId, HELIOS);
    assert.equal(owner._find(), null, 'the visiting carrier is not materialized in Helios');

    bus.emit('world:requestJump', { targetSectorId: TETHYS, via: 'gate' });
    assert.equal(state.jump.state, 'CHARGING', 'the ordinary gate request enters the world jump state machine');
    for (let i = 0; i < 1800 && state.world.currentSectorId !== TETHYS; i++) {
      await runtime.runTicks(1, DT);
    }
    assert.equal(state.world.currentSectorId, TETHYS, 'the canonical jump arrives at Tethys');

    const phaseTickLimit = C.deployTicks + 1200;
    for (let i = 0; i < phaseTickLimit && owner.readout().phase !== 'open'; i++) {
      await runtime.runTicks(1, DT);
    }

    const carrier = owner._find();
    assert.ok(carrier, 'the owner materializes the carrier after sector arrival');
    assert.equal(owner.readout().phase, 'open',
      'the sector-owned visit clock should naturally progress arrive → deploy → open at distance');
    assert.equal(owner._native(carrier), null,
      `the distant carrier should remain outside local native physics residency; ${JSON.stringify(nativeEvidence(owner, physics, state, carrier))}`);
    assert.equal(owner.serviceStatus().ok, false,
      'the remote open phase must not grant service without its native berth');

    await runtime.runTicks(1, DT);
    const sailIds = state.entityList.filter(e => e.alive !== false && e.data?.sunMirror === true)
      .map(e => e.id).sort((a, b) => a - b);
    assert.equal(sailIds.length, 4, 'the distant carrier deploys exactly four owned reflectors');
    await runtime.runTicks(180, DT);
    assert.deepEqual(state.entityList.filter(e => e.alive !== false && e.data?.sunMirror === true)
      .map(e => e.id).sort((a, b) => a - b), sailIds,
    'ordinary world shelving must not make the owner reprint its four distant reflectors');
    assert.equal((state.world.farActors?.rows || []).filter(row =>
      row.data?.persistenceOwner === C.owner).length, 0,
    'the carrier cohort cannot accumulate anonymous durable NPC rows');

    const berth = owner._pos();
    assert.equal(world.relocatePlayerInSector({ x: berth.x + 229, z: berth.z, heading: Math.PI },
      { reason: 'borrowed-sun-native-service-test' }), true,
    'the canonical same-sector relocation seam places the player in the close physical approach');
    for (let i = 0; i < 30 && !owner._native(carrier); i++) await runtime.runTicks(1, DT);
    assert.ok(owner._native(carrier),
      `the ordinary physics owner should admit the nearby fixed station; ${JSON.stringify(nativeEvidence(owner, physics, state, carrier))}`);
    assert.equal(owner.serviceStatus().ok, true, 'the opened visit exposes its live berth service');

    state.player.targetId = carrier.id;
    const offers = [];
    bus.on('borrowedSun:offer', (row) => offers.push(row));
    bus.emit('scan:pulse', { source: 'player-scanner', scannerId: state.playerId });
    assert.equal(offers.length, 1, 'the ordinary hail offer resolves at close range');
    assert.equal(offers[0].ledger.canBuyLease, true, 'the owner exposes its existing lease offer');
    const beforeCredits = state.player.credits;
    bus.emit('borrowedSun:leaseBuy', { visitId: owner.readout().visitId });
    assert.equal(state.player.credits, beforeCredits - 650,
      'the canonical economy owner settles the exact 650-credit paper lease');
    assert.equal(owner._book().leases.filter((row) => row.state === 'open').length, 1,
      'the real owner records one open lease after payment');
  });

function nativeEvidence(owner, physics, state, entity) {
  const node = physics._sg02;
  const record = node?.records.get(entity.id);
  return {
    tick: state.tick,
    simTick: node?._simTick,
    age: state.tick - (node?._simTick ?? NaN),
    restorePending: physics._nativeRestorePending,
    restoreDeferred: physics._nativeRestoreDeferred,
    backend: physics._diag?.backend,
    sg02Ready: physics._diag?.sg02Ready,
    entityIndexPhysicsBody: state.entityIndex?.physicsBodies?.includes(entity),
    entityIndexPhysicsStatic: state.entityIndex?.physicsStatics?.includes(entity),
    entityIndexStaticVersion: state.entityIndex?.physicsStaticVersion,
    activityStaticVersion: state.activityRuntime?.physicsStaticVersion,
    activityStaticCount: state.activityRuntime?.physicsStaticCount,
    activityClassifiedTick: state.activityRuntime?.classifiedTick,
    activityPhysicsCount: state.activityRuntime?.counts?.physics,
    physicsBody: entity.physicsBody,
    alive: entity.alive,
    entityPos: entity.pos,
    anchor: owner._pos(),
    frameOrigin: node?._frameOrigin,
    hasRecord: node?.records.has(entity.id),
    recordEntityMatches: record?.entity === entity,
    recordHasBody: !!record?.body,
    dynamic: record?.spec?.dynamic,
    colliders: record?.colliders?.length,
    proxyId: record?.proxyId,
    revision: record?.revision,
    bodyRevision: entity.physicsBody?.revision,
    kinematics: record?.kinematics,
  };
}
