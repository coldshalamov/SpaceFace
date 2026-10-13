import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { normalizeMemory } from '../src/systems/warrantHunterWaves.js';
import { WARRANT_HUNTERS, WARRANT_WAVE_ARRIVAL_DELAY_S } from '../src/data/warrantHunters.js';

const WRIT = 'wh_ines_garrow';

function boot(t) {
  const sim = createSimulation({ seed: 4242, systems: [economy, lawSecurity, spawnBudget] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.world.sectors.sector_helios_prime = { id: 'sector_helios_prime', factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0.5;
  state.player.bounty = 1200;
  state.player.credits = 5000;
  state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8 }).id;
  sim.helpers.voice = { say: () => true };
  const hunters = Object.fromEntries(WARRANT_HUNTERS.map((hunter) => [hunter.id,
    hunter.id === WRIT ? {} : { recoverUntilT: 1e9 }]));
  state.lawSecurity.warrantHunters = normalizeMemory({ arrivalCount: 0, lastWaveArrival: 0,
    lastWaveT: null, bolder: 0, hunters });
  const law = sim.registry.get('lawSecurity');
  const waves = law._warrantWaves;
  t.after(() => waves.destroy());
  for (let index = 0; index < 4 && !waves._view().pending; index += 1) bus.emit('jump:arrive', {});
  state.simTime += WARRANT_WAVE_ARRIVAL_DELAY_S + 1;
  sim.step(); sim.step();
  const bossEntry = [...waves._view().live.values()].find((entry) => entry.role === 'boss');
  assert.ok(bossEntry, 'the native wanted arrival spawns Writ');
  const boss = bossEntry.entity;
  boss.pos = { x: 400, z: 0 };
  sim.step();
  assert.equal(waves._view().offer.hunterId, WRIT, 'the actual nearby hailer opens her offer');
  const paid = [], requested = [], refused = [];
  bus.on('warrant:hunterPaid', (event) => paid.push(event));
  bus.on('economy:payBounty', (event) => requested.push(event));
  bus.on('warrant:hunterOfferRefused', (event) => refused.push(event));
  const accept = (hunterId = WRIT) => {
    const intent = { hunterId, source: 'warrantOfferPrompt' };
    bus.emit('warrant:acceptPayment', intent);
    return intent.result;
  };
  return { sim, state, bus, boss, waves, paid, requested, refused, accept };
}

test('a payment after the hail deadline is refused before an upkeep tick can close it', (t) => {
  const h = boot(t);
  h.state.simTime = h.waves._view().offer.untilT;
  assert.deepEqual(h.accept(), { ok: false, reason: 'expired' });
  assert.equal(h.requested.length, 0);
  assert.equal(h.state.player.credits, 5000);
  assert.equal(h.state.player.bounty, 1200);
  assert.equal(h.paid.length, 0);
  assert.equal(h.waves._view().offer, null);
});

test('a dead or recycled hailer never forwards payment for an unavailable captain', (t) => {
  const h = boot(t);
  const id = h.boss.id;
  h.sim.helpers.removeEntity(id, { immediate: true, reason: 'test-captain-retired' });
  const other = h.sim.spawn({ type: 'ship', pos: { x: 400, z: 0 }, hull: 80, hullMax: 80,
    data: { name: 'Civilian occupying the recycled slot' } });
  assert.equal(other.id, id, 'canonical entity lifecycle reuses the retired numeric slot');
  assert.deepEqual(h.accept(), { ok: false, reason: 'gone' });
  assert.equal(h.requested.length, 0);
  assert.equal(h.state.player.credits, 5000);
  assert.equal(h.state.player.bounty, 1200);
});

test('a reply naming another hunter is refused while the actual offer remains answerable', (t) => {
  const h = boot(t);
  assert.deepEqual(h.accept('wh_stale_captain'), { ok: false, reason: 'different_hunter' });
  assert.equal(h.requested.length, 0);
  assert.equal(h.waves._view().offer.hunterId, WRIT);
  assert.equal(h.accept().ok, true);
  assert.equal(h.state.player.credits, 3800);
  assert.equal(h.state.player.bounty, 0);
  assert.equal(h.paid.length, 1);
  h.accept();
  assert.equal(h.paid.length, 1);
  assert.equal(h.requested.length, 1, 'a replay cannot charge after the native bounty owner settles');
});
