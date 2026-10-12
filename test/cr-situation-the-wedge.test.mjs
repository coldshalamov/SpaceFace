// CR situation 1200 — THE WEDGE. Spilled ore pods jam a refinery feed lane with three haulers
// waiting behind. Bodies move only through the real SG-02 Rapier authority (bootRealPath): pods
// shoved out the side, one fuel rack slammed into the pile (the ordinary lootShards explosive
// blast), and the pile shoved down the lane into the queue each resolve from the world's reading.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lootShards } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { WEDGE, podBlocksLane } from '../src/data/encounters/1200-the-wedge.js';

const SEED = 4242;
const SECTOR = 'sector_vesta_forge';
const ANCHOR = Object.freeze({ x: 7000, z: -6000 });
const SHAPE = 'the_wedge';

async function boot() {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, lootShards, 'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 150, z: ANCHOR.z + 150 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of ['encounter:resolved', 'economy:grantCredits', 'faction:repDelta', 'cargo:volatileSlam', 'news:publish']) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_wedge', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'refinery_approach', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const w = live.data.wedge;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  host.assertBodies([...w.podIds, ...w.rackIds, ...w.haulerIds].map(ent), 'wedge bodies');
  return { host, state, director, live, w, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const kick = (h, e, dir, speed, kind = 'contact') => h.host.withFeatures(() => queuePhysicsImpulse(e,
  { x: dir.x * e.mass * speed, y: 0, z: dir.z * e.mass * speed }, { provenance: 'test_contact', tick: h.state.tick, kind }));
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });

test('the wedge is registered for ordinary refinery approaches outside Helios', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.deepEqual([...enc.zoneTypes], ['refinery_approach']);
  assert.ok(enc.gates.sectorIds.includes(SECTOR));
  assert.ok(!enc.gates.sectorIds.some((id) => /helios/.test(id)));
});

test('one look: a jam of latchable ore pods, a waiting queue, loose fuel racks', async () => {
  const h = await boot();
  try {
    assert.equal(h.w.podIds.length, WEDGE.pods);
    for (const id of h.w.podIds) {
      const pod = h.ent(id);
      assert.ok(podBlocksLane(h.w, pod), 'every pod starts in the throat');
      assert.ok(isAttachable(pod, h.state.playerId, h.state), 'the Massline can take each pod');
    }
    for (const id of h.w.rackIds) assert.equal(h.ent(id).data.commodityId, 'cmdty_fuel_cells');
    assert.equal(h.w.haulerIds.length, 3);
    h.host.step(120);
    assert.deepEqual(outcomes(h), [], 'nothing resolves on its own');
  } finally { h.host.dispose(); }
});

test('shoving the pods out the side of the lane opens it and pays', async () => {
  const h = await boot();
  try {
    const side = { x: -h.w.lane.z, z: h.w.lane.x };
    for (const id of h.w.podIds) {
      const pod = h.ent(id);
      const s = Math.sign((pod.pos.x - h.w.throat.x) * side.x + (pod.pos.z - h.w.throat.z) * side.z) || 1;
      kick(h, pod, { x: side.x * s, z: side.z * s }, 30);
    }
    runUntilResolved(h, 20 * 60);
    assert.deepEqual(outcomes(h), ['cleared']);
    assert.deepEqual(grants(h), [WEDGE.pay]);
    assert.equal(memory(h).facts.via, 'shove');
  } finally { h.host.dispose(); }
});

test('one fuel rack slammed into the pile cooks off and blows the whole lane clear', async () => {
  const h = await boot();
  try {
    // The rack on the -side is thrown across the lane into the pile; the blast pushes away from it.
    const rack = h.ent(h.w.rackIds[1]);
    const pile = h.w.podIds.map(h.ent).reduce((best, p) => (!best || Math.hypot(p.pos.x - rack.pos.x, p.pos.z - rack.pos.z) < Math.hypot(best.pos.x - rack.pos.x, best.pos.z - rack.pos.z) ? p : best), null);
    const dx = pile.pos.x - rack.pos.x, dz = pile.pos.z - rack.pos.z, len = Math.hypot(dx, dz);
    kick(h, rack, { x: dx / len, z: dz / len }, 40, 'throw');
    runUntilResolved(h, 40 * 60);
    assert.ok(h.events.some((e) => e.name === 'cargo:volatileSlam' && e.p.podId === rack.id), 'the rack detonated on contact');
    assert.deepEqual(outcomes(h), ['blown_clear']);
    assert.deepEqual(grants(h), [WEDGE.pay + WEDGE.blastBonus]);
    assert.equal(memory(h).facts.via, 'blast');
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the sector keeps the story');
  } finally { h.host.dispose(); }
});

test('shoving the pile down the lane ploughs the queue: open, unpaid, remembered', async () => {
  const h = await boot();
  try {
    const back = { x: -h.w.lane.x, z: -h.w.lane.z };
    for (const id of h.w.podIds) kick(h, h.ent(id), back, 45);
    h.host.step(15 * 60, { after: () => !h.w.ploughed });
    assert.equal(h.w.ploughed, true, 'a queued hauler was knocked off its station');
    // Then the pile is pushed out the side; the lane opens but the yard remembers the queue.
    const side = { x: -h.w.lane.z, z: h.w.lane.x };
    for (const id of h.w.podIds) { const pod = h.ent(id); if (pod && podBlocksLane(h.w, pod)) kick(h, pod, side, 35); }
    runUntilResolved(h, 25 * 60);
    assert.deepEqual(outcomes(h), ['cleared_hurt']);
    assert.deepEqual(grants(h), []);
    assert.equal(memory(h).facts.ploughed, true);
  } finally { h.host.dispose(); }
});

test('flying on leaves the jam; the next jam meets a different yard after a strip', async () => {
  const h = await boot();
  try {
    h.state.simTime += WEDGE.windowS + 1;
    h.host.step(2);
    assert.deepEqual(outcomes(h), ['jammed']);
    assert.equal(memory(h).outcome, 'jammed');
    memory(h).outcome = 'stripped';            // a prior visit's record, as a save would carry it
    h.state.encounterDirector.cooldowns[SHAPE] = 0;
    const res = h.director.requestAuthoredEncounter({
      shapeId: SHAPE, encounterId: 'test_wedge_2', sectorId: SECTOR, anchor: { x: ANCHOR.x + 200, z: ANCHOR.z - 200 },
      zoneType: 'refinery_approach', zoneRadius: 600, force: true,
    });
    assert.equal(res.ok, true, JSON.stringify(res));
    const live = Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE && l.phase !== 'done');
    assert.equal(live.data.wedge.prior, 'stripped');
  } finally { h.host.dispose(); }
});
