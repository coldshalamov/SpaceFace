import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { VESTA_DERELICT_SALVAGE_SOURCE as SOURCE } from '../src/data/sectorZones.js';
import { mining } from '../src/systems/mining.js';
import { salvage } from '../src/systems/salvage.js';

const SCRAP = 'cmdty_scrap_metal';
const total = (pool) => Object.values(pool || {}).reduce((sum, qty) => sum + qty, 0);

function boot(t) {
  const sim = createSimulation({ seed: 4242, systems: [salvage, mining] });
  t.after(() => sim.dispose());
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SOURCE.sectorId;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 6,
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100,
  });
  sim.state.playerId = player.id;
  sim.bus.emit('sector:enter', { sectorId: SOURCE.sectorId });
  const wreck = sim.state.entityList.find((entity) => entity.alive !== false
    && entity.data?.salvageSourceKey === SOURCE.sourceKey);
  assert.ok(wreck, 'the real sector-entry route materializes the Vesta source');
  assert.equal(total(wreck.data.salvagePool), 8);

  const spawnEntity = sim.helpers.spawnEntity;
  let allowPickups = true;
  sim.helpers.spawnEntity = (spec) => spec.type === 'pickup' && !allowPickups
    ? null : spawnEntity(spec);
  const mine = sim.registry.get('mining');
  const yields = [];
  const completed = [];
  sim.bus.on('mining:yield', (event) => yields.push(event));
  sim.bus.on('salvage:completed', (event) => completed.push(event));

  return {
    sim, wreck, yields, completed,
    source: () => sim.helpers.salvage.source(SOURCE.sourceKey),
    setAdmission: (allowed) => { allowPickups = allowed; },
    drain({ flush = false } = {}) {
      wreck.data._carry = 1;
      wreck.data.salvageTimeLeft = flush ? 0 : 8;
      mine._drainWreck(player, wreck, 18, 1 / 60);
    },
    pickedUp: () => sim.state.entityList.filter((entity) => entity.type === 'pickup'
      && entity.data?.commodityId === SCRAP).reduce((sum, entity) => sum + entity.data.amount, 0),
    otherMiner(qty) {
      return sim.helpers.salvage.drainSource({
        sourceKey: SOURCE.sourceKey, minerId: 'competing-miner', requested: { [SCRAP]: qty },
      });
    },
  };
}

test('refused first pickup cannot duplicate the remaining Vesta source for a competing miner', (t) => {
  const ctx = boot(t);
  ctx.setAdmission(false);
  ctx.drain();
  const durableBeforeOther = ctx.source().remainingQty;
  const keyAfterRefusal = ctx.wreck.data.salvageSourceKey;
  const other = ctx.otherMiner(8);
  ctx.setAdmission(true);
  ctx.drain({ flush: true });
  const combinedClaimable = total(other.taken) + ctx.pickedUp();
  t.diagnostic(JSON.stringify({ durableBeforeOther, takenByOther: total(other.taken), combinedClaimable }));

  assert.equal(combinedClaimable, 8, 'both miners together can recover only the original eight units');
  assert.equal(durableBeforeOther, 8, 'a refused pickup stays in the authoritative source');
  assert.equal(keyAfterRefusal, SOURCE.sourceKey, 'refusal preserves the source identity');
  assert.equal(ctx.pickedUp(), 0, 'the player cannot re-release stock already taken by the other miner');
  assert.equal(ctx.wreck.alive, false);
});

test('refused full flush stays durable and retries once without premature completion', (t) => {
  const ctx = boot(t);
  ctx.setAdmission(false);
  ctx.drain({ flush: true });
  t.diagnostic(JSON.stringify({ remainingAfterRefusal: ctx.source().remainingQty, extracted: ctx.source().extracted }));
  assert.equal(ctx.source().remainingQty, 8, 'refused final pickups do not extract the durable source');
  assert.equal(ctx.source().extracted, false);
  assert.equal(ctx.wreck.data.salvageSourceKey, SOURCE.sourceKey);
  assert.equal(ctx.wreck.alive, true);
  assert.equal(ctx.yields.length, 0);
  assert.equal(ctx.completed.length, 0);

  const snapshot = ctx.sim.registry.get('salvage').serialize();
  assert.equal(total(snapshot.sources[SOURCE.sourceKey].remainingPool), 8, 'saving retains refused freight');
  ctx.setAdmission(true);
  ctx.drain({ flush: true });
  assert.equal(ctx.pickedUp(), 8);
  assert.equal(ctx.source().remainingQty, 0);
  assert.equal(ctx.source().extracted, true);
  assert.equal(ctx.completed.length, 1);
  assert.equal(ctx.wreck.alive, false);
});

test('accepted and refused releases share one balance across a partial competing drain and retry', (t) => {
  const ctx = boot(t);
  ctx.drain();
  assert.equal(ctx.pickedUp(), 1);
  ctx.setAdmission(false);
  ctx.drain();
  ctx.drain();
  assert.equal(ctx.source().remainingQty, 7, 'repeated refusals leave all seven unspawned units durable');
  assert.equal(ctx.yields.length, 1, 'only admitted releases emit yield');

  const other = ctx.otherMiner(2);
  assert.equal(total(other.taken), 2);
  ctx.setAdmission(true);
  ctx.drain({ flush: true });
  assert.equal(ctx.pickedUp(), 6, 'the player receives the first unit plus the five left by the other miner');
  assert.equal(ctx.pickedUp() + total(other.taken), 8);
  assert.equal(ctx.source().remainingQty, 0);
  assert.equal(ctx.completed.length, 1);
});
