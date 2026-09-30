// PB-SLICE-F boundary reproduction (CHECK-first) — runs against HEAD in a throwaway worktree.
// SF-296 old behavior only: a laden defeat's scoured cargo evaporates; the player wreck keeps
// the generic debris pool; no loss line names cargo aboard. No audio import (that export is new).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { combat } from '../src/systems/combat.js';
import { aftermathWrecks, playerWreckMarker } from '../src/systems/aftermathWrecks.js';
import { addCargo } from '../src/systems/cargo.js';

const SEED = 0x5f296;
const ORE = 'cmdty_ore_iron';
const SCRAP = 'cmdty_scrap_metal';

function makePlayerEntity(state, { x = 500, z = -300 } = {}) {
  const player = {
    id: state.playerId,
    type: 'ship',
    team: 0,
    alive: true,
    flags: {},
    pos: { x, y: 0, z },
    prevPos: { x, y: 0, z },
    vel: { x: 12, y: 0, z: -4 },
    rot: 0,
    hull: 6,
    hullMax: 140,
    armorHp: 0,
    armorMax: 30,
    shield: 0,
    shieldMax: 55,
    cap: 20,
    capMax: 80,
    mass: 60,
    data: { defId: 'ship_kestrel' },
  };
  state.entities.set(player.id, player);
  if (!state.entityList.some((e) => e && e.id === player.id)) state.entityList.push(player);
  return player;
}

test('HEAD boundary: a laden defeat leaves no scoured share aboard the player hull', () => {
  const spawnedSpecs = [];
  const bus = createBus();
  const sim = createSimulation({
    seed: SEED,
    bus,
    systems: [combat, aftermathWrecks],
    helpers: {
      spawnEntity(spec) {
        const entity = {
          id: 100 + spawnedSpecs.length,
          type: spec.type,
          alive: true,
          pos: { x: spec.pos.x, y: 0, z: spec.pos.z },
          data: spec.data || {},
        };
        spawnedSpecs.push({ spec, entity });
        return entity;
      },
    },
  });
  const state = sim.state;
  state.mode = 'flight';
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = 0;
  state.player.ownedShips = [{ defId: 'ship_kestrel' }];
  state.player.activeShipIndex = 0;
  state.player.insurance = { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' };
  const player = makePlayerEntity(state);

  const published = [];
  bus.on('news:publish', (p) => published.push(p));

  assert.equal(addCargo(state, ORE, 20), 20, 'fixture: the hold carries 20 u of ore');

  sim.registry.get('combat')._pendingPlayerRecovery = null;
  sim.registry.get('combat').kill(player, 999, { context: 'combat' });
  const receipt = state.combat.lastPlayerDefeat;
  assert.ok(receipt, 'defeat produces the durable after-action receipt');
  assert.deepEqual(receipt.recovery.cargoLosses, [{ commodityId: ORE, qty: 10 }],
    'the receipt scours exactly floor(50%) of the non-persistent hold (HEAD already files this)');

  const marker = playerWreckMarker(state);
  assert.ok(marker, 'the defeat recorded the player hull as a wreck marker');
  assert.equal(marker.manifestResidue, undefined,
    'HEAD boundary reproduced: no scoured share is placed aboard the player hull');
  assert.deepEqual(marker.salvagePool, { [SCRAP]: 3, cmdty_salvage_electronics: 1 },
    'the wreck keeps only the generic debris pool — the 10 scoured units evaporate');
  const playerLine = published.map((p) => String(p && p.text)).find((t) => t.includes('Your hull'));
  assert.ok(playerLine, 'a loss line still speaks');
  assert.ok(!playerLine || !playerLine.includes('u of your cargo'),
    'HEAD boundary reproduced: the loss line does not name scoured cargo aboard');
});
