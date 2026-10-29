import assert from 'node:assert/strict';
import os from 'node:os';
import { Group } from 'three';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import test from 'node:test';

import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { BORROWED_SUN as C, BORROWED_SUN_BERTHS } from '../src/data/borrowedSun.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { resolveRuntimeManifest } from '../src/runtime/resolveRuntimeManifest.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { borrowedSunPrompt } from '../src/ui/borrowedSunPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

test('Borrowed Sun materializes and answers through the production authoritative runtime', { timeout: 240000 }, async () => {
  os.setPriority(os.constants.priority.PRIORITY_LOW);
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 7331 });
  let prompt = null;
  try {
    assert.equal(runtime.manifest.evidenceClass, 'production-manifest');
    const browserManifest = resolveRuntimeManifest({ profileId: 'production' });
    assert.ok(browserManifest.authoritativeSystemIds.includes('borrowedSun'));
    assert.ok(browserManifest.authoritativeSystemIds.includes('borrowedSunPrompt'));
    assert.equal(browserManifest.capabilities.borrowedSunPrompt.nodeSafe, false,
      'the prompt adapter is registered on the browser/main platform side');
    const { state, bus } = runtime;
    state.mode = 'flight';
    runtime.getSystem('ships').newGame();
    runtime.getSystem('world').newGame();
    runtime.getSystem('economy').newGame();
    const berth = BORROWED_SUN_BERTHS[0];
    const anchor = sectorLocalToGlobalForSector(berth.local, berth.sectorId);
    const player = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
      pos: { x: anchor.x + C.radius * 3, z: anchor.z },
    }));
    state.playerId = player.id;
    state.player.credits = 50000;
    runtime.getSystem('world').enterSector(berth.sectorId, {});
    player.pos.x = anchor.x + C.radius * 3;
    player.pos.z = anchor.z;
    player.prevPos.x = player.pos.x;
    player.prevPos.z = player.pos.z;
    bus.emit('game:started', {});
    await runtime.getSystem('physics').prepareBackend(state, { reset: true });

    const owner = runtime.getSystem('borrowedSun');
    assert.ok(owner, 'Borrowed Sun is part of the production manifest');
    for (let i = 0; i < 12 && !owner._native(owner._find()); i++) runtime.runTicks(1, 1 / 60);
    const carrier = owner._find();
    assert.ok(carrier, 'the owner creates a physical station at its authored berth');
    const rec = runtime.getSystem('physics')._sg02?.records.get(carrier.id);
    assert.ok(owner._native(carrier), 'the regular physics owner installs the real static body');
    assert.equal(carrier.data.stationId, C.stationId);
    let authoredStationBuilds = 0;
    const authoredRoot = new Group();
    const factory = installVisualOverrides({ build() {
      throw new Error('The physical carrier must not use the procedural station fallback');
    } }, { authoredStationBuilder(entity) {
      authoredStationBuilds++;
      assert.equal(resolvePlaceFileForEntity(entity), 'places/place_station_trade_hub.glb');
      assert.equal(entity.data.placeTargetRadius, C.radius);
      return authoredRoot;
    } });
    assert.equal(factory.build(carrier), authoredRoot,
      'the actual spawned carrier reaches the shipped authored station path');
    assert.equal(authoredStationBuilds, 1);
    assert.equal(rec.proxyId, resolveCollisionProxyManifest(carrier).id,
      'the live body uses the canonical station silhouette proxy selected by the physics owner');

    const offers = [];
    const courses = [];
    let visible = null;
    prompt = Object.create(borrowedSunPrompt);
    setPromptDeck({
      offerDecision(spec) { visible = spec; return true; },
      resolveDecision(id) { if (id === 'borrowed-sun:berth') visible = null; },
    });
    prompt.init({ bus });
    bus.on('borrowedSun:offer', (row) => offers.push(row));
    bus.on('ui:setCourse', (row) => courses.push(row));
    state.player.targetId = carrier.id;
    const playerBody = state.entities.get(state.playerId);
    playerBody.pos.x = carrier.pos.x;
    playerBody.pos.z = carrier.pos.z + C.hailRange - 10;
    bus.emit('scan:pulse', { source: 'player-scanner', scannerId: state.playerId });
    assert.equal(offers.length, 1, 'a real scanner pulse reaches the normal hail offer');
    assert.equal(offers[0].carrierId, C.carrierId);
    assert.ok(visible?.choices.some((choice) => choice.id === 'route'), 'the normal prompt deck exposes the safe route');
    visible.onChoose('route');
    assert.equal(courses.length, 1, 'the public route choice emits an ordinary course intent');
    assert.equal(courses[0].sectorId, berth.sectorId);

    owner._phase('open', null);
    bus.emit('scan:pulse', { source: 'player-scanner', scannerId: state.playerId });
    assert.ok(visible?.choices.some((choice) => choice.id === 'lease'), 'the open carrier prompt exposes the bounded lease');
    const before = state.player.credits;
    visible.onChoose('lease');
    assert.equal(state.player.credits, before - 650, 'the real economy owner settles the exact lease charge');
    assert.equal(owner._book().leases.filter((row) => row.state === 'open').length, 1);

    const capture = owner.serialize();
    assert.equal(capture.book.leases.filter((row) => row.state === 'open').length, 1,
      'the owner exposes its save-safe ledger envelope to the registered save system');
    delete carrier.data.archetypeGlb;
    delete carrier.data.placeTargetRadius;
    owner.deserialize(JSON.parse(JSON.stringify(capture)));
    owner.afterContinue();
    assert.equal(factory.build(owner._find()), authoredRoot,
      'Continue repairs older carrier visual metadata through the same authored builder');
    assert.equal(authoredStationBuilds, 2);
    assert.equal(owner._book().leases.filter((row) => row.state === 'open').length, 1,
      'the live production owner restores the durable ledger exactly once');
  } finally {
    prompt?.destroy();
    setPromptDeck(null);
    runtime.dispose();
  }
});
