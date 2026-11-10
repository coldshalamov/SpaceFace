// D182 — career starters can wear their role kit. The Hitch has one utility slot.
// The generic drill amp occupied it, so hauler/hunter/prospector adjudicated
// unviable_loadout. The kit replaces the amp. Seed is the cohort's own; the
// adjudicator is pure over the authored fit.

import test from 'node:test';
import assert from 'node:assert/strict';

import { assessLoadoutViability } from '../src/balance/careerCohorts.js';
import {
  ORIGIN_ROLE_KITS,
  careerStarterModuleIds,
  CAREER_STARTER_DISPLACED_UTILITY,
} from '../src/careers/origins/careerOriginContracts.js';
import { createCareerOriginsSystem } from '../src/careers/origins/careerOrigins.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ships as shipsPrototype } from '../src/systems/ships.js';

const CAREERS = ['hauler', 'hunter', 'prospector'];

test('D182: each career starter fit replaces the drill amp with that career\'s role kit and adjudicates viable', () => {
  const kits = new Set();
  for (const career of CAREERS) {
    const ids = careerStarterModuleIds(career);
    assert.equal(ids.includes(CAREER_STARTER_DISPLACED_UTILITY), false, `${career} still lists the drill amp`);
    assert.equal(ids.includes(ORIGIN_ROLE_KITS[career].defId), true, `${career} lists its role kit`);
    const viability = assessLoadoutViability(career, 'starter');
    assert.equal(viability.utilityFit, true, `${career} utilityFit ${JSON.stringify(viability)}`);
    assert.equal(viability.viable, true, `${career} viable ${JSON.stringify(viability)}`);
    assert.deepEqual(viability.missing, []);
    kits.add(viability.roleKitId);
  }
  assert.equal(kits.size, 3, 'the three careers still wear three different kits');
});

test('D182: accepting a career origin fits the role kit and returns the drill amp to the hold', () => {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.playerId = 1;
  state.world.currentSectorId = 'sector_helios_prime';
  const bus = createBus();
  const ships = { ...shipsPrototype };
  ships.init({ state, bus, helpers: {} });
  ships.newGame();
  const before = state.player.ownedShips[0].fittings.slice();
  assert.ok(before.includes(CAREER_STARTER_DISPLACED_UTILITY));
  let nextMissionId = 1;
  const origins = createCareerOriginsSystem();
  origins.init({
    state,
    bus,
    registry: {
      get(name) {
        if (name === 'ships') return ships;
        if (name === 'missions') {
          return {
            postAndAcceptAuthoredOffer(offer) {
              return { ok: true, offerId: offer.id, missionId: `m_${nextMissionId++}` };
            },
          };
        }
        return null;
      },
    },
  });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(origins.accept('hunter').ok, true);
  const fittings = state.player.ownedShips[0].fittings;
  assert.equal(fittings.includes(ORIGIN_ROLE_KITS.hunter.defId), true);
  assert.equal(fittings.includes(CAREER_STARTER_DISPLACED_UTILITY), false);
  assert.equal(
    state.player.moduleInventory.some((item) => item.defId === CAREER_STARTER_DISPLACED_UTILITY),
    true,
    'the displaced drill amp is a hold item',
  );
  assert.equal(
    state.player.moduleInventory.some((item) => item.defId === ORIGIN_ROLE_KITS.hunter.defId),
    false,
    'the fitted kit is not also a spare in the hold',
  );
  assert.equal(state.careers.origins.__meta.identityReceipts.hunter.loadout.status, 'fitted');
});
