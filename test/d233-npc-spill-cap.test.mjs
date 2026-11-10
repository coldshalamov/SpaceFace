// D233 — bounded NPC mining spill (save-growth tail leak).
//
// Crew-cut chips carry flags.persistent so a save/continue keeps the barge's titled lot — which
// makes every live chip a serialized save row. An unblocked starter-shift cutter yields every
// work tick while the ore carrier ferries one lot per round trip, so discrete chips mint rows
// forever (the soak's entities tail channel). The bound: the crew's cut accrues into ONE live
// pile per (miner record, field) — the heap the barge is coming for — and NPC_MINING_SPILL_CAP
// bounds the cross-source working set. Overflow parks on the rock through the existing
// _parkUnreleasedOre path and returns — with its title — when a slot frees.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining, NPC_MINING_SPILL_CAP } from '../src/systems/mining.js';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [world, traffic, npcJobsRuntime, mining] });
  sim.state.mode = 'flight';
  sim.state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    radius: 12, hull: 100, hullMax: 100 }).id;
  sim.registry.get('world').enterSector('sector_helios_prime');
  sim.step(1 / 60);
  const miner = sim.state.entityList.find((e) => e.data?.minerShiftRockId != null);
  const rock = sim.state.entities.get(miner.data.minerShiftRockId);
  return { sim, miner, rock, mining: sim.registry.get('mining') };
}

function liveChips(state) {
  return state.entityList.filter((e) => e.type === 'pickup' && e.alive !== false
    && e.data && e.data.npcMiningSource && e.data.npcMiningSource.minerWorldRecordId != null);
}

const srcFor = (miner, i = 0, field = 'f_helios_starter') => ({
  minerWorldRecordId: i ? `wr_test_${i}` : miner.data.worldRecordId,
  fieldId: field,
});

test('a crew cut accrues into one live pile instead of a chip per bite', () => {
  const { sim, rock, miner, mining: sys } = boot();
  const source = srcFor(miner);
  sys._spawnPickup(rock, 'cmdty_ore_iron', 3, null, { npcMiningSource: source });
  sys._spawnPickup(rock, 'cmdty_ore_iron', 4, null, { npcMiningSource: source });
  const chips = liveChips(sim.state);
  assert.equal(chips.length, 1, 'the same crew on the same field keeps one heap');
  assert.equal(chips[0].data.amount, 7, 'the heap grows in amount, not in rows');
  assert.deepEqual(chips[0].data.npcMiningSource, source, 'the heap keeps the barge title');
  assert.equal(chips[0].flags.persistent, true, 'the heap still rides the persistent save list');

  // A different crew, a different field, or a different grade gets its own heap.
  sys._spawnPickup(rock, 'cmdty_ore_iron', 2, null, { npcMiningSource: srcFor(miner, 9) });
  sys._spawnPickup(rock, 'cmdty_ore_iron', 2, null, { npcMiningSource: srcFor(miner, 0, 'f_other') });
  sys._spawnPickup(rock, 'cmdty_ore_copper', 2, null, { npcMiningSource: source });
  assert.equal(liveChips(sim.state).length, 4, 'distinct claims stay distinct heaps');
  // A rich lot keeps its own body and provenance — it does not vanish into the heap.
  sys._spawnPickup(rock, 'cmdty_ore_iron', 2, { richLotId: 'rl_1' }, { npcMiningSource: source });
  const rich = liveChips(sim.state).find((e) => e.data.richLotSource);
  assert.ok(rich, 'the rich chip keeps its own provenance row');
  assert.equal(liveChips(sim.state).length, 5);
});

test('the working set caps at NPC_MINING_SPILL_CAP and the overflow parks on the rock', () => {
  const { sim, rock, miner, mining: sys } = boot();
  let spilled = 0;
  for (let i = 0; i < NPC_MINING_SPILL_CAP + 6; i++) {
    spilled += sys._spawnPickup(rock, 'cmdty_ore_iron', 3, null, { npcMiningSource: srcFor(miner, i + 1) });
  }
  assert.equal(spilled, NPC_MINING_SPILL_CAP * 3, 'each admitted spill carries its full amount');
  assert.equal(liveChips(sim.state).length, NPC_MINING_SPILL_CAP, 'live heaps never pass the cap');

  // The refused amount lands in the rock's parked ore with its title intact.
  const parked = (rock.data.parkedOre || []);
  assert.equal(parked.reduce((a, l) => a + (l.qty || 0), 0), 0, 'nothing parks until the caller routes it');
  const lateSource = srcFor(miner, 99);
  sys._parkUnreleasedOre(rock.data, 'cmdty_ore_iron', 9, rock, false, lateSource);
  const lots = rock.data.parkedOre;
  assert.equal(lots.length, 1);
  assert.equal(lots[0].qty, 9);
  assert.deepEqual(lots[0].npcMiningSource, lateSource, 'the parked lot keeps the barge claim');
});

test('a parked lot re-spills titled once a slot frees, or back into its own heap', () => {
  const { sim, rock, miner, mining: sys } = boot();
  for (let i = 0; i < NPC_MINING_SPILL_CAP; i++) {
    sys._spawnPickup(rock, 'cmdty_ore_iron', 2, null, { npcMiningSource: srcFor(miner, i + 1) });
  }
  const parkedSource = srcFor(miner, 77);
  sys._parkUnreleasedOre(rock.data, 'cmdty_ore_iron', 7, rock, false, parkedSource);
  assert.equal(liveChips(sim.state).length, NPC_MINING_SPILL_CAP);

  // The barge takes one heap — the parked lot re-materializes with the same title.
  const taken = liveChips(sim.state)[0];
  taken.alive = false;
  sys._deliverParkedLots(rock, rock.data.parkedOre);
  const chips = liveChips(sim.state);
  assert.equal(chips.length, NPC_MINING_SPILL_CAP, 'the freed slot refills from the rock');
  const restored = chips.find((e) => e.data.amount === 7);
  assert.ok(restored, 'the parked 7-unit lot re-spilled');
  assert.deepEqual(restored.data.npcMiningSource, parkedSource, 'the chip is still the barge\'s titled lot');
  assert.equal(restored.flags.persistent, true, 'the chip still rides the persistent save list');
  assert.ok(Number.isFinite(restored.data.despawnAt), 'the chip still carries the 90 s deadline');
});

test('a parked lot whose heap is still live accrues back onto it', () => {
  const { sim, rock, miner, mining: sys } = boot();
  const source = srcFor(miner);
  sys._spawnPickup(rock, 'cmdty_ore_iron', 5, null, { npcMiningSource: source });
  sys._parkUnreleasedOre(rock.data, 'cmdty_ore_iron', 4, rock, false, source);
  sys._deliverParkedLots(rock, rock.data.parkedOre);
  const chips = liveChips(sim.state);
  assert.equal(chips.length, 1, 'parked ore returns to the crew\'s own heap, not a new row');
  assert.equal(chips[0].data.amount, 9, 'the heap absorbs the parked units');
});

test('ordinary pickups are not bound by the crew-cut working set', () => {
  const { sim, rock, miner, mining: sys } = boot();
  for (let i = 0; i < NPC_MINING_SPILL_CAP; i++) {
    sys._spawnPickup(rock, 'cmdty_ore_iron', 1, null, { npcMiningSource: srcFor(miner, i + 1) });
  }
  const ordinary = sys._spawnPickup(rock, 'cmdty_ore_iron', 5, null, { tight: true });
  assert.equal(ordinary, 5, 'a plain spill still lands at the cap');
  assert.equal(liveChips(sim.state).length, NPC_MINING_SPILL_CAP, 'untitled ore does not occupy crew slots');
});

test('the real yield path keeps one row per crew and parks only past the cap', () => {
  const { sim, rock, miner, mining: sys } = boot();
  // Repeated genuine yields: the miner's heaps grow by amount, never by row — one heap per
  // (miner, field, grade) regardless of how many work ticks landed.
  sys.applyMining(rock.id, 1000, 1, miner.id);
  sys.applyMining(rock.id, 1000, 1, miner.id);
  const minerChips = () => liveChips(sim.state).filter(
    (e) => e.data.npcMiningSource.minerWorldRecordId === miner.data.worldRecordId
      && !e.data.richLotSource);
  const rowsBefore = minerChips().length;
  const qtyBefore = minerChips().reduce((a, e) => a + (e.data.amount || 0), 0);
  sys.applyMining(rock.id, 1000, 1, miner.id);
  sys.applyMining(rock.id, 1000, 1, miner.id);
  assert.equal(minerChips().length, rowsBefore, 'more yields mint no new rows');
  assert.ok(minerChips().reduce((a, e) => a + (e.data.amount || 0), 0) >= qtyBefore,
    'the heaps only accrue');
  const chips = minerChips();
  assert.ok(chips.length >= 1);

  // The barge clears the working set, then it saturates with OTHER crews. The next yield —
  // on a fresh face the shift has moved to — finds no matching heap and no free slot, so
  // the overflow parks on the rock.
  for (const e of liveChips(sim.state)) e.alive = false;
  for (let i = 0; i < NPC_MINING_SPILL_CAP; i++) {
    sys._spawnPickup(rock, 'cmdty_ore_iron', 1, null, { npcMiningSource: srcFor(miner, i + 1) });
  }
  assert.equal(liveChips(sim.state).length, NPC_MINING_SPILL_CAP);
  const fresh = sim.state.entityList.find((e) => e !== rock && e.type === 'asteroid'
    && e.alive !== false && e.data && e.data.oreHP > 0);
  assert.ok(fresh, 'another live face exists for the shifted yield');
  miner.data.minerShiftRockId = fresh.id;
  sys.applyMining(fresh.id, 100000, 1, miner.id);
  assert.equal(liveChips(sim.state).length, NPC_MINING_SPILL_CAP, 'no thirteenth row mints');
  const parked = (fresh.data.parkedOre || []).reduce((a, l) => a + (l.qty || 0), 0)
    + (((sys._unreleasedOre) || []).reduce((a, l) => a + (l.qty || 0), 0));
  assert.ok(parked > 0, 'the rejected yield parks on the rock, titled and retriable');
});
