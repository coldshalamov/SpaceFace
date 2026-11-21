// WORLD slice 3 — rocks regrow at logical times, never in front of the player, and the galaxy never
// depopulates. Table: src/data/rockRegrowth.js (quiet 20 min → heal over 2 h; spent → core, slot
// restocks at 4 h; a field never sits below 40 % of its stock; built-in rocks never change).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROCK_REGROWTH } from '../src/data/rockRegrowth.js';
import { advanceResourceBody } from '../src/world/worldCatchup.js';
import { regrowthVerdict, resourceBodyPinned, normalizeResourceBodyRecord } from '../src/world/resourceBodyRecords.js';
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { fieldDepletion } from '../src/systems/fieldDepletion.js';
import { world } from '../src/systems/world.js';

const R = ROCK_REGROWTH;
const worn = (over = {}) => normalizeResourceBodyRecord({
  recordId: 'rb_test', sectorId: 'sector_helios_prime', fieldId: 'f_helios_starter', slotId: '7',
  pos: { x: 0, z: 0 }, oreHp: 50, oreHpMax: 100, yieldRemainingU: 5, yieldMaxU: 10, pctEjected: 0.5,
  lastMinedT: 0, lastObservedT: 0, outcome: 'active', playerModified: true, ...over,
});

test('a worked rock rests 20 minutes, then heals linearly over 2 hours — any read cadence agrees', () => {
  const ctx = { regrowth: R };
  const quiet = advanceResourceBody(worn(), 0, R.quietS - 1, ctx);
  assert.equal(quiet.oreHp, 50, 'nothing heals inside the quiet window');
  const half = advanceResourceBody(worn(), 0, R.quietS + R.recoverS / 4, ctx);
  assert.equal(Math.round(half.oreHp), 75, 'a quarter of the recover time restores a quarter of the stock body');
  const stepped = advanceResourceBody(advanceResourceBody(worn(), 0, R.quietS + 900, ctx), R.quietS + 900, R.quietS + R.recoverS / 4, ctx);
  assert.equal(Math.round(stepped.oreHp), Math.round(half.oreHp), 'two short reads land where one long read does');
  const full = advanceResourceBody(worn(), 0, R.quietS + R.recoverS, ctx);
  assert.equal(full.oreHp, 100);
  assert.equal(regrowthVerdict(full, R.quietS + R.recoverS, R), 'stock');
});

test('a mined-out rock is a spent core until 4 hours of play pass, then its slot restocks', () => {
  const spent = worn({ outcome: 'depleted', depletedAtT: 100, oreHp: 0 });
  assert.equal(regrowthVerdict(spent, 100 + 60, R), 'core', 'leaving and coming back a minute later changes nothing');
  assert.equal(regrowthVerdict(spent, 100 + R.restockS - 1, R), 'core');
  assert.equal(regrowthVerdict(spent, 100 + R.restockS, R), 'restock');
});

test('rocks the player built in, is towing or moved are pinned forever', () => {
  for (const over of [{ extra: { siteId: 'site_1' } }, { tethered: true }, { displaced: true }, { missionOwned: true }]) {
    const rec = worn({ ...over, outcome: 'depleted', depletedAtT: 0 });
    assert.ok(resourceBodyPinned(rec));
    assert.equal(regrowthVerdict(rec, 1e7, R), 'pinned');
  }
});

// ---- in the world -------------------------------------------------------------------------------
function boot() {
  const sim = createSimulation({ seed: 4747, systems: [spawnBudget, fieldDepletion, world] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 140, hullMax: 140, radius: 6 });
  state.playerId = player.id;
  return { sim, state, w: sim.registry.get('world') };
}
const rowsFor = (state, slot) => [...state.world.asteroidField.byId.values()]
  .filter((r) => r.data && r.data.fieldId === 'f_helios_starter' && String(r.data.asteroidSlotId) === String(slot));

function fromHeadSave(hoursLater) {
  const envelope = JSON.parse(readFileSync(new URL('./fixtures/saves/world-head-v23.json', import.meta.url), 'utf8'));
  const t = boot();
  t.w.deserialize(JSON.parse(JSON.stringify(envelope.data.world)));
  t.state.simTime = (envelope.data.entities.simTime || 0) + hoursLater * 3600;
  t.w.enterSector('sector_helios_prime');
  t.sim.runTicks(2);
  return { ...t, fx: envelope._fixture, bag: t.state.world.resourceBodies };
}

test('checkpoint save, reloaded at once: the half-mined rock is still half-mined and the spent slot is a drawn core', () => {
  const t = fromHeadSave(0);
  const [half] = rowsFor(t.state, t.fx.halfRockSlot);
  assert.ok(half && half.alive !== false, 'the half-mined rock stands');
  assert.ok(half.data.oreHP < half.data.oreHPMax, 'still worked');
  const [core] = rowsFor(t.state, t.fx.spentRockSlot);
  assert.ok(core, 'the spent slot has a body');
  assert.equal(core.alive, true, 'drawn, not an invisible collider');
  assert.equal(core.data.spentCore, true);
  assert.ok(core.data.respawnAt != null, 'not ore-bearing: every beam filter reads it as mined out');
  assert.ok(core.radius < core.data.stockRadius * 0.5, 'visibly shrunk to a worked-out core');
  t.sim.dispose();
});

test('checkpoint save, three hours of play later: the worked rock has healed back to its stock body', () => {
  const t = fromHeadSave(3);
  const [half] = rowsFor(t.state, t.fx.halfRockSlot);
  assert.ok(half && half.alive !== false);
  assert.equal(half.data.oreHP, half.data.oreHPMax, 'fully healed');
  assert.ok(!Object.values(t.bag.byId).some((r) => r.slotId === String(t.fx.halfRockSlot) && r.fieldId === t.fx.fieldId),
    'the ledger row retired: the stock world is the record again');
  const [core] = rowsFor(t.state, t.fx.spentRockSlot);
  assert.equal(core.data.spentCore, true, 'the spent slot is still a core at 3 h');
  t.sim.dispose();
});

test('checkpoint save, five hours later: the spent slot has restocked to its exact stock rock', () => {
  const fresh = boot();
  fresh.w.enterSector('sector_helios_prime');
  fresh.sim.runTicks(2);
  const envelope = JSON.parse(readFileSync(new URL('./fixtures/saves/world-head-v23.json', import.meta.url), 'utf8'));
  const [stock] = rowsFor(fresh.state, envelope._fixture.spentRockSlot);
  const stockRadius = stock.radius;
  fresh.sim.dispose();
  const t = fromHeadSave(5);
  const [rock] = rowsFor(t.state, t.fx.spentRockSlot);
  assert.ok(rock && rock.alive !== false);
  assert.ok(!rock.data.spentCore && rock.data.respawnAt == null, 'ore-bearing again');
  assert.equal(rock.radius, stockRadius, 'the same rock the generator always puts in that slot');
  t.sim.dispose();
});

test('mining a rock out leaves a drawn core at its slot; four hours later it restocks — only while the pilot is far away', async () => {
  const { mining } = await import('../src/systems/mining.js');
  const { cargo } = await import('../src/systems/cargo.js');
  const { promoteAsteroidFieldRock } = await import('../src/world/asteroidField.js');
  const sim = createSimulation({ seed: 4747, systems: [spawnBudget, cargo, fieldDepletion, mining, world] });
  const { state } = sim;
  state.mode = 'flight';
  const w = sim.registry.get('world');
  w.enterSector('sector_helios_prime');
  const row = [...state.world.asteroidField.byId.values()]
    .find((r) => r.data && r.data.fieldId === 'f_helios_starter' && !r.data.authoredBoulderId && r.alive !== false);
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: row.pos.x + 40, z: row.pos.z }, vel: { x: 0, z: 0 }, hull: 140, hullMax: 140, radius: 6 });
  state.playerId = player.id;
  const slot = row.data.asteroidSlotId;
  const stockRadius = row.radius;
  const rock = promoteAsteroidFieldRock(state, row.id, sim.helpers || w.helpers, 'test');
  for (let i = 0; i < 600 && rock.alive !== false; i++) sim.registry.get('mining').applyMining(rock.id, 400, 1 / 60, player.id);
  assert.equal(rock.alive, false, 'mined out');
  const [core] = rowsFor(state, slot).filter((r) => r.alive !== false);
  assert.ok(core && core.data.spentCore, 'a spent core stands at the slot');
  assert.ok(core.radius < stockRadius * 0.5);

  state.simTime += R.restockS + 10;
  sim.runTicks(310);
  assert.equal(core.data.spentCore, true, 'the pilot is right there: nothing restocks in view');

  player.pos.x += R.offscreenWu + 500;
  sim.runTicks(310);
  assert.ok(!core.data.spentCore, 'out of sight, the slot restocked');
  assert.equal(core.radius, stockRadius, 'to its stock body');
  sim.dispose();
});

test('belt floor: a field mined below 40 % of its stock restocks its oldest spent slots early', () => {
  const t = boot();
  t.w.enterSector('sector_helios_prime');
  t.sim.runTicks(2);
  const sector = t.state.world.sectors.sector_helios_prime;
  const stockCount = sector.fields.find((f) => f.id === 'f_helios_starter').count;
  const bag = t.state.world.resourceBodies;
  const spentCount = stockCount; // every rock mined out, one per minute
  for (let i = 0; i < spentCount; i++) {
    const rec = normalizeResourceBodyRecord({ recordId: `rb_floor_${i}`, sectorId: 'sector_helios_prime',
      fieldId: 'f_helios_starter', slotId: `floor:${i}`, pos: { x: i, z: 0 }, oreHp: 0, oreHpMax: 100,
      outcome: 'depleted', depletedAtT: i * 60, lastMinedT: i * 60, playerModified: true });
    bag.byId[rec.recordId] = rec;
  }
  const now = spentCount * 60 + 5;
  const early = Object.values(bag.byId).filter((r) => r.recordId.startsWith('rb_floor_') && t.w._beltFloorEarly(bag, r, now));
  const allowed = Math.floor(stockCount * (1 - R.beltFloor));
  assert.equal(early.length, spentCount - allowed, `${spentCount - allowed} of ${spentCount} spent slots restock early`);
  assert.ok(early.every((r) => Number(r.recordId.split('_').pop()) < spentCount - allowed), 'the oldest ones');
  t.sim.dispose();
});
