import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const ACE_ID = 'ace_maw_rake_veyra';
const SECTOR_ID = 'sector_sker_haven';

async function boot(suffix) {
  const tacticalAI = createTacticalAISystem();
  const sim = createSimulation({
    seed: 0xace16,
    systems: [spawnBudget, aceMemory, encounterDirector, aiPorts, tacticalAI, physics],
    updateOrder: [encounterDirector, tacticalAI, aiPorts, physics, aceMemory],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 300, hullMax: 300, cap: 100, capMax: 100,
    radius: 10, mass: 100,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;

  const physicsSystem = sim.registry.get('physics');
  assert.equal(await physicsSystem.prepareBackend(state), true,
    'the route proof requires the production Rapier movement owner');

  const resolved = [];
  const receipts = [];
  const transitions = [];
  bus.on('encounter:resolved', (payload) => resolved.push(structuredClone(payload)));
  bus.on('encounter:receipt', (payload) => receipts.push(structuredClone(payload)));
  bus.on('aceMemory:transition', (payload) => transitions.push(structuredClone(payload)));

  const encounterId = `test:named-ace-escape:${suffix}`;
  const requested = sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'named_hunter',
    encounterId,
    sectorId: SECTOR_ID,
    zoneId: 'zone_sker_gatecamp',
    anchor: { x: 0, z: 0 },
    zoneRadius: 520,
    data: { aceId: ACE_ID },
    force: true,
  });
  assert.deepEqual(requested, { ok: true, encounterId });
  const live = state.encounterDirector.live[encounterId];
  assert.ok(live);
  const boss = live.ids
    .filter((id) => live.roles[id] === 'boss')
    .map((id) => state.entities.get(id))[0];
  assert.ok(boss, 'the real named_hunter route must spawn one boss actor');

  state.simTime = live.data.engageAt;
  state.encounterDirector._accum = 1;
  sim.step();
  assert.equal(live.phase, 'conflict');

  return {
    sim, state, bus, player, boss, live, encounterId,
    physicsSystem, resolved, receipts, transitions,
  };
}

function beginRetreat(harness) {
  const { sim, boss, live, resolved } = harness;
  boss.hull = boss.hullMax * 0.26;
  harness.state.encounterDirector._accum = 1;
  sim.step();
  assert.equal(live.phase, 'retreat');
  assert.equal(live.data.aceRetreat.threshold, 0.27,
    'the Maw Ace uses its authored culture retreat fraction rather than the fallback');
  assert.equal(boss.data.ai.forceFlee, true);
  assert.equal(boss.data.ai.fsm, 'flee');
  assert.equal(resolved.length, 0, 'crossing the hull threshold is not itself an escape');
  return { ...live.data.aceRetreat.origin };
}

function travelFrom(origin, entity) {
  return Math.hypot(entity.pos.x - origin.x, entity.pos.z - origin.z);
}

test('named Ace physically flees across its zone-scaled boundary before escape and schedules one return', async (t) => {
  const h = await boot('alive');
  t.after(() => {
    h.physicsSystem._disableSg02DynamicAuthority();
    h.sim.dispose();
  });
  const origin = beginRetreat(h);
  const boundaryRadius = h.live.data.aceRetreat.boundaryRadius;
  assert.equal(boundaryRadius, 520);

  h.player.pos.x = origin.x + 10_000;
  h.player.pos.z = origin.z + 10_000;
  h.state.simTime = h.live.deadlineAt + 100;
  h.state.encounterDirector._accum = 1;
  h.sim.step();
  assert.equal(h.resolved.length, 0,
    'player distance and encounter timeout cannot fake the Ace crossing its retreat boundary');
  h.player.pos.x = 0;
  h.player.pos.z = 0;

  const start = { ...h.boss.pos };
  let ticks = 0;
  while (h.resolved.length === 0 && ticks < 1_800) {
    h.sim.step(SIM_DT);
    ticks++;
  }
  assert.ok(Math.hypot(h.boss.pos.x - start.x, h.boss.pos.z - start.z) > 20,
    'the existing forceFlee route must produce real world-space motion');
  assert.equal(h.resolved.length, 1, 'one physical boundary crossing resolves one encounter');
  assert.equal(h.resolved[0].outcome, 'escaped');
  assert.ok(travelFrom(origin, h.boss) >= boundaryRadius,
    'the living boss must actually cross the recorded boundary before resolution');
  assert.equal(h.boss.alive, true);
  assert.equal(h.receipts.filter((row) => row.outcome === 'escaped').length, 1);
  assert.equal(h.transitions.filter((row) => row.transition === 'fled').length, 1);
  assert.equal(h.state.aceMemory[ACE_ID].returnScheduled, true,
    'the existing aceMemory receipt seam schedules the capped return');
  const returnAt = h.state.aceMemory[ACE_ID].returnAt;
  h.state.simTime = returnAt;
  h.sim.registry.get('aceMemory')._returnAccum = 1;
  h.sim.step();
  const returnId = h.state.aceMemory[ACE_ID].returnEncounterId;
  const returnLive = h.state.encounterDirector.live[returnId];
  assert.ok(returnLive && returnLive.shapeId === 'named_hunter',
    `recurrence re-enters through the same encounter owner rather than a private spawn shortcut: ${JSON.stringify({
      returnId,
      record: h.state.aceMemory[ACE_ID],
      liveIds: Object.keys(h.state.encounterDirector.live || {}),
    })}`);
  assert.equal(returnLive.data.aceId, ACE_ID);
  assert.equal(returnLive.data.recurrence, true);
  const returnBoss = returnLive.ids.filter((id) => returnLive.roles[id] === 'boss')
    .map((id) => h.state.entities.get(id))[0];
  assert.ok(returnBoss);
  assert.equal(returnBoss.data.namedAceId, ACE_ID);
  assert.equal(returnBoss.data.appearance.hullColor, '#7e0f16');
  assert.equal(h.state.aceMemory[ACE_ID].returnScheduled, false);

  h.state.simTime = returnLive.data.engageAt;
  h.state.encounterDirector._accum = 1;
  h.sim.step();
  returnBoss.hull = returnBoss.hullMax * 0.26;
  h.state.encounterDirector._accum = 1;
  h.sim.step();
  assert.equal(returnLive.phase, 'retreat',
    'the returning Ace retains the physical flee-and-intercept route');
  assert.equal(returnBoss.data.ai.forceFlee, true);
  assert.equal(h.resolved.length, 1, 'the recurrence does not mutate the first encounter receipt');
});

test('killing the fleeing Ace before the boundary wins and suppresses escape recurrence', async (t) => {
  const h = await boot('killed');
  t.after(() => {
    h.physicsSystem._disableSg02DynamicAuthority();
    h.sim.dispose();
  });
  const origin = beginRetreat(h);

  h.sim.runTicks(30);
  assert.ok(travelFrom(origin, h.boss) > 0,
    'the doomed Ace still enters the real physical flee before the intercepting kill');
  assert.ok(travelFrom(origin, h.boss) < h.live.data.aceRetreat.boundaryRadius,
    'the kill fixture occurs inside the recorded escape boundary');

  h.boss.hull = 0;
  h.boss.alive = false;
  h.bus.emit('entity:killed', {
    id: h.boss.id,
    killerId: h.player.id,
    pos: { ...h.boss.pos },
  });
  assert.equal(h.resolved.length, 1);
  assert.equal(h.resolved[0].outcome, 'killed');
  assert.equal(h.receipts.filter((row) => row.outcome === 'killed').length, 1);
  assert.equal(h.transitions.filter((row) => row.transition === 'defeated').length, 1);
  assert.equal(h.state.aceMemory[ACE_ID].returnScheduled, false);

  h.boss.pos.x = origin.x + h.live.data.aceRetreat.boundaryRadius + 1;
  h.sim.runTicks(3);
  h.bus.emit('entity:killed', { id: h.boss.id, killerId: h.player.id, pos: { ...h.boss.pos } });
  assert.deepEqual(h.resolved.map((row) => row.outcome), ['killed'],
    'a post-kill boundary position and duplicate death event remain inert');
});
