// SFQ-I035 — splitting a rich lot keeps its legal status on both halves and after the merge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { cargo, addCargo } from '../src/systems/cargo.js';

const IRON = 'cmdty_ore_iron';
const LOT = 'lot-4242';

test('legal status survives a parked split and the merge back into one lot', () => {
  const state = createGameState(4242);
  state.player.ownedShips = [{ defId: 'ship_kestrel' }, { defId: 'ship_pelican' }];
  state.player.activeShipIndex = 0;
  state.player.cargo.capVolume = 100;
  addCargo(state, IRON, 10, {
    lotId: LOT,
    provenanceId: 'claim:yard',
    sourceOwner: 'npc',
    legalStatus: 'restricted',
  });
  const seeded = state.player.cargo.richLots.find((row) => row && row.lotId === LOT);
  assert.ok(seeded);
  seeded.legalStatus = 'restricted';
  state.missions.active = [{
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: IRON, qty: 6, sealAccounted: true, sealedRemaining: 6 },
  }];
  const owner = Object.create(cargo);
  owner.state = state;
  assert.equal(owner._swapParkedHold({ fromIndex: 0, toIndex: 1, cargoCapVolume: 100 }), true);
  const stayed = state.player.cargo.richLots.find((row) => row && row.lotId === LOT);
  const parkedStore = state.player.ownedShips[0].cargo;
  const parked = parkedStore && parkedStore.richLots.find((row) => row && row.lotId === LOT);
  assert.ok(stayed && stayed.qty > 0);
  assert.ok(parked && parked.qty > 0);
  assert.equal(stayed.qty + parked.qty, 10);
  assert.equal(stayed.legalStatus, 'restricted');
  assert.equal(parked.legalStatus, 'restricted');
  assert.equal(owner._swapParkedHold({ fromIndex: 1, toIndex: 0, cargoCapVolume: 100 }), true);
  const merged = state.player.cargo.richLots.find((row) => row && row.lotId === LOT);
  assert.equal(merged.qty, 10);
  assert.equal(merged.legalStatus, 'restricted');
  assert.equal(merged.sourceOwner, 'npc');
});
