import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { applyDomainPathUpdate, applySpawnInfos, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { PLANET_SITE } from '../src/data/planets.js';
import { planetHud } from '../src/ui/planetHud.js';
import { resolveRigTarget } from '../src/systems/powerVerbs.js';
import { describeComponent } from '../src/systems/interactionDescriptors.js';
import { orchardLotId } from '../src/data/anvilOrchard.js';

function applyReply(state, reply) {
  for (const update of reply.domainUpdates || []) {
    const segs = update.segs.length === 1 && update.segs[0].includes('.')
      ? update.segs[0].split('.') : update.segs;
    const holder = new Map([[segs[0], state[segs[0]]]]);
    applyDomainPathUpdate(holder, { ...update, segs }, new Set());
    state[segs[0]] = holder.get(segs[0]);
  }
}

test('production worker carries the Anvil player band and heat to the flight HUD', async () => {
  const host = createSimHost();
  const oldDocument = globalThis.document;
  try {
    const main = createGameState(4242);
    const init = await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    applyReply(main, structuredClone(init));
    const { state, registry, runtime } = host.host;
    state.mode = 'flight';
    state.ui.docked = false;
    state.world.currentSectorId = PLANET_SITE.sectorId;
    const planet = registry.get('planetRuntime');
    planet.update(0, state);
    assert.equal(state.planet.active, true);
    const center = state.planet.center;
    const player = runtime.spawn({ type: 'ship', team: 0, isPlayer: true, radius: 8, mass: 100,
      hull: 100, hullMax: 100, pos: { x: center.x, z: center.z + 950 }, vel: { x: 0, z: 0 },
      data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
    state.playerId = player.id;
    planet.update(1, state);
    assert.equal(state.planet.player.region, 'skim');
    assert.equal(state.planet.player.heat, PLANET_SITE.heat.skimRate);

    const reply = structuredClone(await host.tick({ tick: 1, steps: 0, commands: [],
      ackEnd: init.initRebuild?.end ?? 0 }));
    assert.ok(reply.events.some(event => event.t === 'planet:bandFirst'),
      'the ordinary capture-all bridge ships the band receipt');
    applyReply(main, reply);
    applySpawnInfos({ entities: main.entities }, reply.spawnInfos);
    assert.equal(main.mode, 'flight');
    assert.equal(main.ui.docked, false);
    assert.deepEqual(main.planet.center, { x: center.x, z: center.z });
    const pill = { style: {}, classList: { toggle() {} }, setAttribute() {} };
    const dom = { pill, pillText: { textContent: '' }, pillHeat: { textContent: '' } };
    globalThis.document = {};
    const hud = Object.create(planetHud);
    hud.init({ state: main });
    hud._ensureDom = () => dom;
    hud.update(0, state);
    assert.match(dom.pillText.textContent, /WORKING BAND.*HEAT 5%/,
      'the real reader displays the authoritative state when supplied');
    dom.pillText.textContent = '';
    hud._lastText = '';
    hud.update(0, main);
    assert.match(dom.pillText.textContent, /WORKING BAND.*HEAT 5%/,
      'the visible HUD should present the sim-owned band and heat after the actual worker reply');
    assert.equal(resolveRigTarget(main), 'skim', 'the same mirrored band selects the scoop');
    const frame = state.entities.get(state.planet.orchardFrameId);
    const mirroredFrame = main.entities.get(frame.id);
    assert.ok(mirroredFrame, 'the actual journal includes the authored orchard frame');
    main.playerId = player.id;
    assert.equal(describeComponent(main, mirroredFrame, 'orchard_socket_0').feedReason, 'open-scoop',
      'the real socket reader can resolve the mirrored planet center');
    // This is a valid normalized, already-created player lot; the native player-feed
    // owner exercises creation separately. The worker must preserve its public identity.
    const row = state.sites.anvilOrchard, lotId = orchardLotId(0, 1);
    row.sourceRemaining--; row.lots.push({ id: lotId, socket: 0, cycle: 1, units: 1, outcome: 'retained', contributor: 'player' });
    Object.assign(row.sockets[0], { cycle: 1, lotId, status: 'stowed' });
    const lotReply = structuredClone(await host.tick({ tick: 2, steps: 0, commands: [] }));
    applyReply(main, lotReply);
    assert.equal(describeComponent(main, mirroredFrame, 'orchard_socket_0').contributor, 'player');
    state.world.currentSectorId = 'sector_helios_prime';
    planet.update(0, state);
    const exit = structuredClone(await host.tick({ tick: 3, steps: 0, commands: [],
      ackEnd: reply.initRebuild?.end ?? 0 }));
    applyReply(main, exit);
    assert.equal(main.planet.active, false);
    assert.equal(main.planet.center, null, 'exiting clears the old physical center');
    assert.equal(resolveRigTarget(main), 'cone', 'leaving Anvil clears stale scoop state');
  } finally {
    globalThis.document = oldDocument;
    host.shutdown();
  }
});
