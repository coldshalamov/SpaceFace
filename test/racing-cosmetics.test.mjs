import test from 'node:test';
import assert from 'node:assert/strict';
import { CUP_HEATS, abandonRacingCup, stageRacingCupHeat, finishRacingCupHeat,
  readRacingCareer, selectRacingLivery } from '../src/systems/racingCareer.js';
import { racingCosmeticFor, RACING_COSMETICS } from '../src/data/racingCosmetics.js';
import { applyRacingLoadout } from '../src/data/racingLoadouts.js';
import { ships } from '../src/systems/ships.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { paletteWithShipAppearance } from '../src/core/shipAppearance.js';

const store = () => { const data = new Map(); return { getItem: key => data.get(key) || null,
  setItem: (key, value) => data.set(key, value) }; };
function finishCup(storage, positions) {
  abandonRacingCup(storage);
  for (let i = 0; i < 3; i++) {
    const ticket = stageRacingCupHeat(CUP_HEATS[i].contractId,
      { starter: 'starter_wasp', raceDifficulty: 'club' }, storage);
    finishRacingCupHeat({ ...ticket, racingContractId: CUP_HEATS[i].contractId,
      raceElapsedS: 70 + i, racePosition: positions[i] }, storage);
  }
}
test('bronze, silver and gold paint are earned by completed cups and selection survives later awards', () => {
  const s = store(); assert.equal(selectRacingLivery('solar-crown', s), false);
  finishCup(s, [3, 3, 3]);
  assert.equal(selectRacingLivery('copper-current', s), true);
  assert.equal(selectRacingLivery('glacier-line', s), false);
  finishCup(s, [2, 2, 2]);
  assert.equal(readRacingCareer(s).liveryId, 'copper-current');
  assert.equal(selectRacingLivery('glacier-line', s), true);
  finishCup(s, [1, 2, 1]);
  assert.equal(selectRacingLivery('solar-crown', s), true);
  assert.equal(readRacingCareer(s).liveryId, 'solar-crown');
  assert.equal(racingCosmeticFor('unknown', readRacingCareer(s)).id, 'factory');
});
test('locked or malformed selections fail closed and denied writes retain the previous finish', () => {
  const s = store();
  s.setItem('spaceface.racingCareer.v1', JSON.stringify({ version: 1, cups: {}, liveryId: 'solar-crown' }));
  assert.equal(readRacingCareer(s).liveryId, 'factory');
  finishCup(s, [1, 1, 1]); selectRacingLivery('copper-current', s);
  const denied = { getItem: s.getItem, setItem() { throw Error('quota'); } };
  assert.equal(selectRacingLivery('solar-crown', denied), false);
  assert.equal(readRacingCareer(s).liveryId, 'copper-current');
});
test('the temporary loadout applies earned paint through ships before admission and never changes handling', () => {
  const s = store(); finishCup(s, [1, 1, 1]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: s });
  try {
    const state = createGameState(309), bus = createBus(), helpers = {}, registry = { get: () => null };
    const ctx = { state, bus, helpers, registry }; Object.create(core).init(ctx);
    const owner = Object.create(ships); owner.init(ctx); owner.newGame();
    const owned = state.player.ownedShips[0]; owned.defId = 'ship_wasp';
    const player = helpers.spawnEntity(makeShipEntitySpec('ship_wasp', { isPlayer: true }));
    state.playerId = player.id;
    const initialMass = player.mass, initialSpeed = player.maxSpeed;
    let saved = 0; bus.on('ship:appearanceSaved', () => saved++);
    assert.equal(applyRacingLoadout(state, owner, { racingSession: true, starter: 'starter_wasp',
      racingDrive: 'standard', racingLivery: 'solar-crown' }), true);
    const appearance = RACING_COSMETICS[3].appearance;
    assert.equal(owned.appearance.hullColor, appearance.hullColor);
    assert.equal(player.data.appearance.hullColor, appearance.hullColor);
    const palette = paletteWithShipAppearance(player, {});
    assert.equal(palette.hull, appearance.hullColor); assert.equal(palette.appearanceHullOverride, true);
    assert.equal(player.mass, initialMass); assert.equal(player.maxSpeed, initialSpeed); assert.equal(saved, 1);
    const before = JSON.stringify(owned);
    assert.equal(applyRacingLoadout(state, owner, { racingSession: false, racingLivery: 'copper-current' }), false);
    assert.equal(JSON.stringify(owned), before);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  }
});
