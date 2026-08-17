import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  activePlayerShipRegistryName,
  normalizeShipRegistryName,
  shipRegistryIdentity,
} from '../src/data/shipRegistry.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { WANTED_NOTICE_GRACE_S } from '../src/systems/heat.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { customsPrompt } from '../src/ui/customsPrompt.js';

test('ordinary unnamed hulls keep the authored yard identity and filed names are bounded', () => {
  assert.deepEqual(shipRegistryIdentity({ defId: 'ship_kestrel' }), {
    defId: 'ship_kestrel',
    hullName: 'Hitch',
    registryName: null,
    displayName: 'Hitch',
    isNamed: false,
  });
  assert.equal(normalizeShipRegistryName('  Borrowed   Ghost  '), 'Borrowed Ghost');
  assert.equal(normalizeShipRegistryName('<>\n\t'), null);
  assert.equal(Array.from(normalizeShipRegistryName('A'.repeat(80))).length, 24);
});

test('the real Ships owner files one persistent name used by hails, berth logs, bounties, and Continue', () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 0x44a12 });
  let prompt = null;
  try {
    const { state, bus } = runtime;
    const shipOwner = runtime.getSystem('ships');
    shipOwner.newGame();
    const owned = state.player.ownedShips[0];
    const player = runtime.spawn(makeShipEntitySpec(owned.defId, {
      isPlayer: true,
      team: 0,
      factionId: 'faction_free',
      fittings: owned.fittings,
      appearance: owned.appearance,
      livingHull: owned.livingHull,
      player: state.player,
      pos: { x: 0, z: 0 },
    }));
    player.flags = { ...(player.flags || {}), persistent: true };
    state.playerId = player.id;

    const filed = [];
    const toasts = [];
    const bounties = [];
    bus.on('ship:registryFiled', (payload) => filed.push(structuredClone(payload)));
    bus.on('law:bountyPosted', (payload) => bounties.push(structuredClone(payload)));
    bus.on('toast', (payload) => toasts.push(structuredClone(payload)));

    state.mode = 'flight';
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    bus.emit('ui:setShipRegistryName', { shipIndex: 0, name: 'Borrowed Ghost', source: 'forged' });
    assert.equal(owned.registryName, undefined, 'an off-berth UI event cannot file a registry change');

    state.mode = 'station';
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    bus.emit('ui:setShipRegistryName', {
      shipIndex: 0,
      name: '  Borrowed   Ghost  ',
      source: 'shipworks_registry',
    });
    assert.equal(owned.registryName, 'Borrowed Ghost');
    assert.equal(player.data.registryName, 'Borrowed Ghost');
    assert.equal(player.data.shipName, 'Borrowed Ghost');
    assert.equal(filed.length, 1, 'one canonical event feeds the berth session log');
    assert.equal(filed[0].displayName, 'Borrowed Ghost');
    assert.equal(filed[0].hullName, 'Hitch');

    const hailBus = createBus();
    const hails = [];
    prompt = Object.create(customsPrompt);
    prompt.init({
      state: {
        simTime: 50,
        player: { ownedShips: [{ defId: 'ship_kestrel', registryName: 'Borrowed Ghost' }], activeShipIndex: 0 },
        ui: {},
      },
      bus: hailBus,
      helpers: { voice: { say(packet) { hails.push(structuredClone(packet)); return true; } } },
      registry: {
        get() {
          return {
            illicitCargo() {
              return [{ commodityId: 'cmdty_narcotics', qty: 1,
                def: { name: 'Narcotics', basePrice: 220, legality: 'contraband' } }];
            },
            scanningFaction() { return 'faction_scn'; },
          };
        },
      },
    });
    hailBus.emit('player:scannedByPatrol', { hasContraband: true, factionId: 'faction_scn' });
    assert.equal(hails.length, 1);
    assert.match(hails[0].text, /Borrowed Ghost: scanning your hold/i,
      'the real customs hail consumes the filed registry name');

    state.mode = 'flight';
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    state.world.currentSectorId = 'sector_helios_prime';
    bus.emit('entity:killed', {
      killerId: player.id,
      victimClass: 'station',
      targetHostileToPlayer: false,
    });
    runtime.getSystem('heat').update(WANTED_NOTICE_GRACE_S, state);
    assert.equal(bounties.length, 1);
    assert.equal(bounties[0].shipName, 'Borrowed Ghost');
    assert.ok(toasts.some((entry) => /BOUNTY POSTED ON BORROWED GHOST/.test(entry.text || '')),
      'the public bounty notice names the registered ship');

    const save = runtime.getSystem('save');
    const envelope = save.serialize('plan44-ship-registry');
    assert.equal(save.loadEnvelope(structuredClone(envelope), 'plan44-ship-registry'), true);
    assert.equal(state.player.ownedShips[state.player.activeShipIndex].registryName, 'Borrowed Ghost');
    assert.equal(activePlayerShipRegistryName(state), 'Borrowed Ghost');
    assert.equal(state.entities.get(state.playerId).data.shipName, 'Borrowed Ghost');

    state.mode = 'station';
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    bus.emit('ui:setShipRegistryName', { shipIndex: 0, name: '', source: 'shipworks_registry' });
    assert.equal(state.player.ownedShips[0].registryName, undefined);
    assert.equal(activePlayerShipRegistryName(state), 'Hitch', 'blank restores the ordinary authored fallback');
    assert.equal(state.entities.get(state.playerId).data.shipName, undefined,
      'ordinary unnamed runs do not gain a redundant entity/save field');
  } finally {
    if (prompt) prompt.destroy();
    runtime.dispose();
  }
});
