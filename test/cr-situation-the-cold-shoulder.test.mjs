// CR situation 1201 — THE COLD SHOULDER. Two Reach boarders clamped to an ice hauler in the fog;
// the hauler's vented ice pods drift in the gap. Real SG-02 Rapier bodies throughout: an ice pod
// slung into a boarder fires the ordinary lootShards cryo flash, the frozen clamp lets go and the
// crew's kick goes through the published impulse authority; a hull shove drives them off; flying on
// lets the boarding clock (live unfrozen boarders on the hull) run out and the hauler changes flag.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lootShards } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { COLD, hullGap } from '../src/data/encounters/1201-the-cold-shoulder.js';

const SEED = 4242;
const SECTOR = 'sector_veil_nebula';
const ANCHOR = Object.freeze({ x: -280, z: 640 });
const SHAPE = 'the_cold_shoulder';

async function boot() {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, lootShards, 'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 160, z: ANCHOR.z + 160 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of ['encounter:resolved', 'economy:grantCredits', 'faction:repDelta', 'cargo:volatileCryo', 'news:publish']) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const res = host.runtime.getSystem('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_cold', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'nebula_fog', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const c = live.data.cold;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  host.assertBodies([c.haulerId, ...c.raiderIds, ...c.podIds].map(ent), 'cold shoulder bodies');
  return { host, state, live, c, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const toward = (from, to) => { const dx = to.pos.x - from.pos.x, dz = to.pos.z - from.pos.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; };
const kick = (h, e, dir, speed, kind = 'contact') => h.host.withFeatures(() => queuePhysicsImpulse(e,
  { x: dir.x * e.mass * speed, y: 0, z: dir.z * e.mass * speed }, { provenance: 'test_contact', tick: h.state.tick, kind }));
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });

test('the cold shoulder is registered for the Veil fog and the Charon seams', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.ok(enc.gates.sectorIds.includes(SECTOR));
  assert.ok(!enc.gates.sectorIds.some((id) => /helios/.test(id)));
});

test('one look: two boarders clamped on the hauler, cryogenic pods in the gap', async () => {
  const h = await boot();
  try {
    const hauler = h.ent(h.c.haulerId);
    assert.equal(h.c.raiderIds.length, 2);
    for (const id of h.c.raiderIds) assert.ok(hullGap(hauler, h.ent(id)) <= COLD.clampGapWu, `boarder ${id} clamped (gap ${hullGap(hauler, h.ent(id)).toFixed(1)})`);
    for (const id of h.c.podIds) assert.equal(h.ent(id).data.commodityId, 'cmdty_ice_water');
    const before = h.c.boardedS;
    h.host.step(300);
    assert.ok(h.c.boardedS > before + 1, `the boarding clock runs while they sit on the hull (${before} -> ${h.c.boardedS})`);
    assert.deepEqual(outcomes(h), []);
  } finally { h.host.dispose(); }
});

test('ice pods slung into the boarders freeze the clamps and the crew kicks them loose', async () => {
  const h = await boot();
  try {
    const [r1, r2] = h.c.raiderIds.map(h.ent);
    const [p1, p2] = h.c.podIds.map(h.ent);
    kick(h, p1, toward(p1, r1), 40, 'throw');
    kick(h, p2, toward(p2, r2), 40, 'throw');
    runUntilResolved(h, 30 * 60);
    assert.ok(h.events.filter((e) => e.name === 'cargo:volatileCryo').length >= 1, 'a real cryo flash fired');
    assert.deepEqual(outcomes(h), ['iced']);
    assert.deepEqual(grants(h), [COLD.pay + COLD.icedBonus]);
    assert.ok(memory(h).facts.iced >= 1);
    assert.ok(h.events.some((e) => e.name === 'news:publish'));
  } finally { h.host.dispose(); }
});

test('shoving both boarders off the hull drives them off without the ice', async () => {
  const h = await boot();
  try {
    const hauler = h.ent(h.c.haulerId);
    for (const r of h.c.raiderIds.map(h.ent)) kick(h, r, toward(hauler, r), 30);
    runUntilResolved(h, 20 * 60);
    assert.deepEqual(outcomes(h), ['driven_off']);
    assert.deepEqual(grants(h), [COLD.pay]);
  } finally { h.host.dispose(); }
});

test('flying on lets the boarders finish: the hauler flies a Reach flag and the lane remembers', async () => {
  const h = await boot();
  try {
    h.state.simTime += COLD.boardS;
    h.host.step(2);
    assert.deepEqual(outcomes(h), ['taken']);
    assert.equal(h.ent(h.c.haulerId).factionId, 'faction_reach');
    assert.equal(memory(h).outcome, 'taken');
    assert.deepEqual(grants(h), []);
  } finally { h.host.dispose(); }
});

test('ordinary director roll: the seed-4242 planner books it in every gated sector on its own zones', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS['the_cold_shoulder'];
  for (const sectorId of enc.gates.sectorIds) {
    const zones = zonesForSector(sectorId);
    const byId = new Map(zones.map((z) => [z.id, z]));
    let booked = null;
    for (let day = 0; day < 60 && !booked; day++) {
      booked = planEncounters(4242, sectorId, day, zones).find((item) => item.shapeId === 'the_cold_shoulder') || null;
    }
    assert.ok(booked, `${sectorId}: planner never books it in 60 days`);
    const zone = byId.get(booked.zoneId);
    assert.ok(zone && enc.zoneTypes.includes(zone.type), `${sectorId}: booked on ${booked.zoneId}`);
    assert.ok(!/helios/.test(sectorId));
  }
});
