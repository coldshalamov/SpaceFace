// Row 288 PB-WIRE-CUSTODY. Seed 4242. The departure hold chip reads the custody
// projection: 10 iron with 4 sealed says 6 of 10 are yours to sell. An unsealed
// hold does not invent a seal.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { projectCargoCustody } from '../src/ui/sim/custodyProjection.js';
import { departureReadinessChips, sealedHoldLine } from '../src/ui/station/stationDepartureModel.js';

const SEED = 4242;

function holdState(sealed) {
  const state = createGameState(SEED);
  state.player.cargo = {
    capVolume: 40,
    usedVolume: 10,
    items: { cmdty_ore_iron: 10 },
  };
  state.missions = state.missions || {};
  state.missions.active = sealed
    ? [{
      status: 'active',
      preloadedCargo: true,
      params: { cmdtyId: 'cmdty_ore_iron', sealAccounted: true, sealedRemaining: 4 },
    }]
    : [];
  return state;
}

test('seed 4242 departure chip names the sealed split and does not invent one', () => {
  const open = holdState(false);
  assert.equal(open.meta.seed, SEED);
  const openFold = projectCargoCustody(open).byCommodity.cmdty_ore_iron;
  assert.equal(openFold.hold, 10);
  assert.equal(openFold.holdSellable, 10);
  assert.equal(sealedHoldLine(open), '');
  const openChip = departureReadinessChips(open).find((chip) => chip.label === 'Hold');
  assert.ok(openChip);
  assert.equal(openChip.text.includes('yours to sell'), false);

  const sealed = holdState(true);
  const fold = projectCargoCustody(sealed).byCommodity.cmdty_ore_iron;
  assert.equal(fold.hold, 10);
  assert.equal(fold.holdSellable, 6);
  assert.equal(sealedHoldLine(sealed), '6 of 10 Iron Ore yours to sell');
  const chip = departureReadinessChips(sealed).find((row) => row.label === 'Hold');
  assert.ok(chip.text.includes('6 of 10 Iron Ore yours to sell'), chip.text);
});
