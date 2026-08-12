import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';

const FORGE_ID = 'station_forge';
const SCRAP_ID = 'cmdty_scrap_metal';

function boot(seed = 0x4808) {
  const sim = createSimulation({ seed, systems: [economy], updateOrder: [] });
  const state = sim.state;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_vesta_forge';
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
  state.player.credits = 5_000;
  state.player.stats = {};
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100,
  };
  const econ = sim.registry.get('economy');
  econ.ensureMarket(FORGE_ID);
  return { sim, state, econ };
}

function unload({
  intakeId = 'salvage-intake:forge:1:fm_01',
  yardId = FORGE_ID,
  manifestId = 'fm_01',
  lotId = 'lot_01',
  lines = [
    { commodityId: SCRAP_ID, qty: 7 },
    { commodityId: 'cmdty_salvage_electronics', qty: 2 },
  ],
} = {}) {
  return {
    intakeId,
    yardId,
    manifestId,
    lotId,
    lines: lines.map((line) => ({ ...line })),
  };
}

function dispose(sim) {
  sim.dispose();
  economy._instance = null;
}

test('no-intake games omit salvage receipt state from newGame and serialize', () => {
  const { sim, state, econ } = boot(0x4807);
  try {
    assert.equal(Object.hasOwn(state.economy, 'appliedSalvageIntakeReceipts'), false);
    assert.equal(Object.hasOwn(state.economy, 'blockedSalvageIntakeIds'), false);
    const initialSave = econ.serialize();
    assert.equal(Object.hasOwn(initialSave, 'appliedSalvageIntakeReceipts'), false);
    assert.equal(Object.hasOwn(initialSave, 'blockedSalvageIntakeIds'), false);

    econ.newGame();
    assert.equal(Object.hasOwn(state.economy, 'appliedSalvageIntakeReceipts'), false);
    assert.equal(Object.hasOwn(state.economy, 'blockedSalvageIntakeIds'), false);
    const newGameSave = econ.serialize();
    assert.equal(Object.hasOwn(newGameSave, 'appliedSalvageIntakeReceipts'), false);
    assert.equal(Object.hasOwn(newGameSave, 'blockedSalvageIntakeIds'), false);
  } finally {
    dispose(sim);
  }
});

test('Forge accepts one conserved NPC scrap lot and player sale moves the same listing', () => {
  const { sim, state, econ } = boot();
  try {
    const market = state.economy.markets[FORGE_ID];
    const scrap = market[SCRAP_ID];
    const electronics = market.cmdty_salvage_electronics;
    const stockBefore = scrap.stock;
    const electronicsBefore = electronics.stock;
    const creditsBefore = state.player.credits;
    const receipt = unload();
    const playerOfferBefore = econ.quote(FORGE_ID, SCRAP_ID, 'sell', 3);

    assert.equal(scrap.role, 'consume', 'Forge is the existing sourced buyer for scrap metal');
    sim.bus.emit('salvage:npcUnload', receipt);

    assert.deepEqual(receipt.intakeResult, {
      ok: true,
      intakeId: receipt.intakeId,
      yardId: FORGE_ID,
      manifestId: receipt.manifestId,
      lotId: receipt.lotId,
      commodityId: SCRAP_ID,
      qty: 7,
      ignoredCommodityIds: ['cmdty_salvage_electronics'],
    });
    assert.equal(scrap.stock, stockBefore + 7, 'NPC receipt adds only its conserved scrap quantity');
    assert.equal(electronics.stock, electronicsBefore, 'the bounded intake does not create a generic salvage market');
    assert.equal(state.player.credits, creditsBefore, 'NPC unload never pays the player');
    assert.deepEqual(state.economy.appliedSalvageIntakeReceipts, [{
      intakeId: receipt.intakeId,
      yardId: FORGE_ID,
      manifestId: receipt.manifestId,
      lotId: receipt.lotId,
      scrapQty: 7,
      lines: [
        { commodityId: 'cmdty_salvage_electronics', qty: 2 },
        { commodityId: SCRAP_ID, qty: 7 },
      ],
    }]);
    assert.equal(
      state.economy.marketIntel[FORGE_ID].snapshot[SCRAP_ID].stock,
      scrap.stock,
      'the existing market/route readout receives the changed stock immediately',
    );
    const playerOfferAfter = econ.quote(FORGE_ID, SCRAP_ID, 'sell', 3);
    assert.ok(
      playerOfferAfter.unitAvg < playerOfferBefore.unitAvg,
      'the existing player sale offer reacts to the NPC delivery on the same listing',
    );

    const stockAfterFirstReceipt = scrap.stock;
    sim.bus.emit('salvage:npcUnload', receipt);
    assert.equal(receipt.intakeResult.duplicate, true, 'replayed delivery is acknowledged but never reapplied');
    assert.equal(scrap.stock, stockAfterFirstReceipt);

    state.player.cargo = {
      items: { [SCRAP_ID]: 3 }, usedVolume: 3, usedMass: 2.7, capVolume: 100, capMass: 100,
    };
    const playerSale = econ.execute(FORGE_ID, SCRAP_ID, 'sell', 3);
    assert.equal(playerSale.ok, true);
    assert.equal(scrap.stock, stockAfterFirstReceipt + 3, 'player sale uses the exact same Forge scrap listing');
    assert.equal(state.player.credits, creditsBefore + playerSale.total);
    assert.equal(state.player.cargo.items[SCRAP_ID], undefined);
  } finally {
    dispose(sim);
  }
});

test('unsupported yards or non-scrap receipts reject without creating receipt state', () => {
  const { sim, state } = boot(0x4809);
  try {
    const scrap = state.economy.markets[FORGE_ID][SCRAP_ID];
    const before = scrap.stock;
    const wrongYard = unload({ intakeId: 'salvage-intake:wrong-yard', yardId: 'station_beltout' });
    sim.bus.emit('salvage:npcUnload', wrongYard);
    assert.deepEqual(wrongYard.intakeResult, { ok: false, reason: 'unsupported_salvage_yard' });

    const noScrap = unload({
      intakeId: 'salvage-intake:no-scrap',
      lines: [{ commodityId: 'cmdty_salvage_electronics', qty: 2 }],
    });
    sim.bus.emit('salvage:npcUnload', noScrap);
    assert.deepEqual(noScrap.intakeResult, { ok: false, reason: 'invalid_salvage_intake' });
    assert.equal(scrap.stock, before);
    assert.equal(Object.hasOwn(state.economy, 'appliedSalvageIntakeReceipts'), false);
    assert.equal(Object.hasOwn(state.economy, 'blockedSalvageIntakeIds'), false);
  } finally {
    dispose(sim);
  }
});

test('saved intake receipt accepts only an exact replay after Continue', () => {
  const first = boot(0x4810);
  const receipt = unload({ intakeId: 'salvage-intake:save-roundtrip', manifestId: 'fm_save', lotId: 'lot_save' });
  let saved;
  let stockAfterFirstReceipt;
  try {
    first.sim.bus.emit('salvage:npcUnload', receipt);
    assert.equal(receipt.intakeResult.ok, true);
    stockAfterFirstReceipt = first.state.economy.markets[FORGE_ID][SCRAP_ID].stock;
    saved = structuredClone(first.econ.serialize());
    assert.deepEqual(saved.appliedSalvageIntakeReceipts, [{
      intakeId: receipt.intakeId,
      yardId: FORGE_ID,
      manifestId: 'fm_save',
      lotId: 'lot_save',
      scrapQty: 7,
      lines: [
        { commodityId: 'cmdty_salvage_electronics', qty: 2 },
        { commodityId: SCRAP_ID, qty: 7 },
      ],
    }]);
    assert.equal(Object.hasOwn(saved, 'blockedSalvageIntakeIds'), false);
  } finally {
    dispose(first.sim);
  }

  const restored = boot(0x4810);
  try {
    restored.econ.deserialize(saved);
    const scrap = restored.state.economy.markets[FORGE_ID][SCRAP_ID];
    assert.equal(scrap.stock, stockAfterFirstReceipt);
    restored.sim.bus.emit('salvage:npcUnload', receipt);
    assert.equal(receipt.intakeResult.ok, true);
    assert.equal(receipt.intakeResult.duplicate, true);
    assert.equal(scrap.stock, stockAfterFirstReceipt, 'saved applied identity prevents duplicate stock');

    const conflicts = [
      unload({ intakeId: receipt.intakeId, yardId: 'station_ceres', manifestId: 'fm_save', lotId: 'lot_save' }),
      unload({ intakeId: receipt.intakeId, manifestId: 'fm_conflict', lotId: 'lot_save' }),
      unload({ intakeId: receipt.intakeId, manifestId: 'fm_save', lotId: 'lot_conflict' }),
      unload({
        intakeId: receipt.intakeId,
        manifestId: 'fm_save',
        lotId: 'lot_save',
        lines: [
          { commodityId: SCRAP_ID, qty: 7 },
          { commodityId: 'cmdty_salvage_avionics', qty: 2 },
        ],
      }),
      unload({
        intakeId: receipt.intakeId,
        manifestId: 'fm_save',
        lotId: 'lot_save',
        lines: [
          { commodityId: SCRAP_ID, qty: 7 },
          { commodityId: 'cmdty_salvage_electronics', qty: 3 },
        ],
      }),
      unload({
        intakeId: receipt.intakeId,
        manifestId: 'fm_save',
        lotId: 'lot_save',
        lines: [{ commodityId: SCRAP_ID, qty: 8 }],
      }),
    ];
    for (const conflict of conflicts) {
      restored.sim.bus.emit('salvage:npcUnload', conflict);
      assert.deepEqual(conflict.intakeResult, {
        ok: false,
        reason: 'salvage_intake_identity_conflict',
        intakeId: receipt.intakeId,
      });
      assert.equal(scrap.stock, stockAfterFirstReceipt, 'same-ID conflict never reapplies stock');
    }
  } finally {
    dispose(restored.sim);
  }
});

test('legacy incomplete intake receipts and bare IDs fail closed after Continue', () => {
  const restored = boot(0x4811);
  try {
    const saved = structuredClone(restored.econ.serialize());
    const incompleteId = 'salvage-intake:legacy-incomplete-receipt';
    const bareId = 'salvage-intake:legacy-bare-id';
    saved.appliedSalvageIntakeReceipts = [{
      intakeId: incompleteId,
      yardId: FORGE_ID,
      manifestId: 'legacy_manifest',
      lotId: 'legacy_lot',
      scrapQty: 7,
    }];
    delete saved.blockedSalvageIntakeIds;
    saved.appliedSalvageIntakeIds = [bareId];
    restored.econ.deserialize(saved);

    const scrap = restored.state.economy.markets[FORGE_ID][SCRAP_ID];
    const stockBefore = scrap.stock;
    for (const intakeId of [incompleteId, bareId]) {
      const receipt = unload({ intakeId });
      restored.sim.bus.emit('salvage:npcUnload', receipt);
      assert.deepEqual(receipt.intakeResult, {
        ok: false,
        reason: 'salvage_intake_identity_conflict',
        intakeId,
      });
    }
    assert.equal(scrap.stock, stockBefore);
    assert.equal(Object.hasOwn(restored.state.economy, 'appliedSalvageIntakeReceipts'), false);
    assert.deepEqual(restored.state.economy.blockedSalvageIntakeIds, [bareId, incompleteId]);
    const normalized = restored.econ.serialize();
    assert.equal('appliedSalvageIntakeIds' in normalized, false);
    assert.deepEqual(normalized.blockedSalvageIntakeIds, [bareId, incompleteId]);
  } finally {
    dispose(restored.sim);
  }
});

test('saved salvage intake receipts retain only the newest 256 identities', () => {
  const { sim, econ } = boot(0x4812);
  try {
    const saved = structuredClone(econ.serialize());
    saved.appliedSalvageIntakeReceipts = Array.from({ length: 257 }, (_, index) => ({
      intakeId: `salvage-intake:bounded:${index}`,
      yardId: FORGE_ID,
      manifestId: `manifest:${index}`,
      lotId: `lot:${index}`,
      scrapQty: 1,
      lines: [{ commodityId: SCRAP_ID, qty: 1 }],
    }));
    econ.deserialize(saved);

    const retained = econ.serialize().appliedSalvageIntakeReceipts;
    assert.equal(retained.length, 256);
    assert.equal(retained[0].intakeId, 'salvage-intake:bounded:1');
    assert.equal(retained.at(-1).intakeId, 'salvage-intake:bounded:256');
  } finally {
    dispose(sim);
  }
});
