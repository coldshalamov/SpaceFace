// CR situation 1202 — THE KICK START. A dead-drive tug coasts (no drag) at a Reach picket; its
// berth is off to the side. Real SG-02 Rapier bodies: a hull push steers it home, its own fuel rack
// slammed into its flank (the ordinary lootShards explosive slam) kicks it off the line, and doing
// nothing lets momentum deliver it to the picket.
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
import { KICK, driftFrame } from '../src/data/encounters/1202-the-kick-start.js';

const SEED = 4242;
const SECTOR = 'sector_tethys_junction';
const ANCHOR = Object.freeze({ x: 500, z: 1500 });
const SHAPE = 'the_kick_start';

async function boot() {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, lootShards, 'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 140, z: ANCHOR.z - 140 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of ['encounter:resolved', 'economy:grantCredits', 'cargo:volatileSlam', 'news:publish']) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const res = host.runtime.getSystem('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_kick', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'trade_lane', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const k = live.data.kick;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  host.assertBodies([k.tugId, k.picketId, k.rackId].map(ent), 'kick start bodies');
  return { host, state, k, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const kick = (h, e, v, kind = 'contact') => h.host.withFeatures(() => queuePhysicsImpulse(e,
  { x: v.x * e.mass, y: 0, z: v.z * e.mass }, { provenance: 'test_contact', tick: h.state.tick, kind }));
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });

test('the kick start is registered on ordinary lanes outside Helios', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.ok(enc.gates.sectorIds.includes(SECTOR));
  assert.ok(!enc.gates.sectorIds.some((id) => /helios/.test(id)));
});

test('one look: the tug really coasts at the picket, and the line can take it', async () => {
  const h = await boot();
  try {
    const tug = h.ent(h.k.tugId);
    assert.ok(isAttachable(tug, h.state.playerId, h.state));
    const a0 = driftFrame(h.k, tug.pos).along;
    h.host.step(180);
    const a1 = driftFrame(h.k, tug.pos).along;
    assert.ok(a1 - a0 > KICK.driftSpeed * 2, `coasting on momentum (${a0.toFixed(1)} -> ${a1.toFixed(1)})`);
    assert.deepEqual(outcomes(h), []);
  } finally { h.host.dispose(); }
});

test('a hull push on the flank steers the tug into its berth', async () => {
  const h = await boot();
  try {
    const tug = h.ent(h.k.tugId);
    const berth = h.ent(h.k.berthId);
    const dx = berth.pos.x - tug.pos.x, dz = berth.pos.z - tug.pos.z, l = Math.hypot(dx, dz);
    // Cancel the coast and send it at the buoy: one shove, the rest is momentum.
    kick(h, tug, { x: dx / l * 20 - tug.vel.x, z: dz / l * 20 - tug.vel.z });
    runUntilResolved(h, 30 * 60);
    assert.deepEqual(outcomes(h), ['berthed']);
    assert.deepEqual(grants(h), [KICK.pay]);
    assert.equal(memory(h).facts.via, 'hull');
  } finally { h.host.dispose(); }
});

test('its own fuel rack slammed into its flank kicks it off the picket line', async () => {
  const h = await boot();
  try {
    const tug = h.ent(h.k.tugId);
    const rack = h.ent(h.k.rackId);
    const dx = tug.pos.x - rack.pos.x, dz = tug.pos.z - rack.pos.z, l = Math.hypot(dx, dz);
    kick(h, rack, { x: dx / l * 40, z: dz / l * 40 }, 'throw');
    runUntilResolved(h, 90 * 60);
    assert.ok(h.events.some((e) => e.name === 'cargo:volatileSlam' && e.p.podId === rack.id), 'the rack cooked off on the tug');
    assert.ok(['berthed', 'diverted'].includes(outcomes(h)[0]), `got ${outcomes(h)} ${JSON.stringify(memory(h) && memory(h).facts)}`);
    assert.equal(memory(h).facts.via, 'blast');
    assert.ok(Math.abs(memory(h).facts.across) >= KICK.divertedAcrossWu || outcomes(h)[0] === 'berthed');
  } finally { h.host.dispose(); }
});

test('flying on: momentum delivers the tug to the picket and it changes flag', async () => {
  const h = await boot();
  try {
    runUntilResolved(h, 70 * 60);
    assert.deepEqual(outcomes(h), ['claimed']);
    assert.equal(h.ent(h.k.tugId).factionId, 'faction_reach');
    assert.deepEqual(grants(h), []);
    assert.ok(h.events.some((e) => e.name === 'news:publish'));
  } finally { h.host.dispose(); }
});
