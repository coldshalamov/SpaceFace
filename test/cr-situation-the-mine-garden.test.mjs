// CR situation 1204 — THE MINE GARDEN. A holed freighter's cargo pods drift inside a field of real,
// armed Reach mines (the ordinary mines owner). Bodies move only through the real SG-02 Rapier
// authority (bootRealPath). The gravity Well is deployed through the production input packet
// (actions.deployWell + aimWorld) and its pull crosses the ordinary fields → physics membrane; a mine
// snaps on a hull flown into it by ordinary throttle input. No completion event is emitted by a test.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { combat } from '../src/systems/combat.js';
import { mines } from '../src/systems/mines.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { GARDEN, podsAboard } from '../src/data/encounters/1204-the-mine-garden.js';

const SEED = 4242;
const SECTOR = 'sector_pallas_drift';
const ANCHOR = Object.freeze({ x: 6000, z: -5200 });
const SHAPE = 'the_mine_garden';

async function boot({ playerAt = null } = {}) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, mines, fields, 'flightV3', 'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: playerAt || { x: ANCHOR.x, z: ANCHOR.z + 420 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of ['encounter:resolved', 'economy:grantCredits', 'faction:repDelta', 'news:publish', 'mines:triggered', 'fields:deployed']) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_garden', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'ambush_lane', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const g = live.data.garden;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  host.assertBodies([...g.podIds, g.freighterId, g.layerId].map(ent), 'garden bodies');
  const at = (along, across) => ({
    x: g.edge.x + g.dir.x * along - g.dir.z * across,
    z: g.edge.z + g.dir.z * along + g.dir.x * across,
  });
  return { host, state, director, live, g, events, ent, at };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const record = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];

function withFields(fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;   // shipped ON by the runtime profile; node leaves the Tier-B gate off
  return Promise.resolve().then(fn).finally(() => { FIELD_FLAGS.enabled = prev; });
}

test('registered: a non-Helios minor situation with four engagements', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'the_mine_garden is in the catalog');
  assert.deepEqual([...enc.zoneTypes].sort(), ['ambush_lane', 'derelict_field']);
  assert.ok(enc.gates.sectorIds.length >= 3 && enc.gates.sectorIds.every((s) => !/helios/.test(s)));
  assert.deepEqual(enc.choices.map((c) => c.verb), ['latch', 'field', 'throw', 'fly_on']);
});

test('ordinary director roll books it in each gated sector on a permitted zone (seed 4242)', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS[SHAPE];
  for (const sectorId of enc.gates.sectorIds) {
    const zones = zonesForSector(sectorId);
    const byId = new Map(zones.map((z) => [z.id, z]));
    let booked = null;
    for (let day = 0; day < 365 && !booked; day++) {
      booked = planEncounters(4242, sectorId, day, zones).find((item) => item.shapeId === SHAPE) || null;
    }
    assert.ok(booked, `${sectorId}: planner never books it in 365 days`);
    const zone = byId.get(booked.zoneId);
    assert.ok(zone && enc.zoneTypes.includes(zone.type), `${sectorId}: booked on ${booked.zoneId}`);
  }
});

test('premise: real armed mines owned by the layer, pods inside the field, nothing aboard yet', async () => {
  const h = await boot();
  try {
    assert.equal(h.g.mineIds.length, GARDEN.mines.length);
    for (const id of h.g.mineIds) {
      const m = h.ent(id);
      assert.equal(m.type, 'mine');
      assert.equal(m.data.ownerId, h.g.layerId);
      assert.equal(m.data.armed, true);
      assert.ok(h.live.ids.includes(id), 'mines belong to the encounter for cleanup');
    }
    assert.equal(h.g.podIds.length, 4);
    assert.equal(podsAboard(h.g, h.state), 0);
    assert.equal(h.live.phase, 'sown');
    assert.deepEqual(outcomes(h), []);
  } finally { h.host.dispose(); }
});

test('gravity Well through the input packet sweeps the pods (and the near mines) out to the freighter', () => withFields(async () => {
  const h = await boot();
  try {
    const target = h.at(-40, 0);
    const podStart = h.g.podIds.map((id) => ({ ...h.ent(id).pos }));
    writeRealPathInput(h.state, {});
    h.state.input.aimWorld = { ...target };
    h.state.input.actions.deployWell = true;
    h.host.step(1);
    const deployed = h.events.find((e) => e.name === 'fields:deployed' && e.p.kind === 'well');
    assert.ok(deployed, 'the production fields owner deployed a Well');
    assert.ok(Math.hypot(deployed.p.center.x - target.x, deployed.p.center.z - target.z) < 30, 'thrown to the aim point');
    h.host.step(9 * 60, { before: () => writeRealPathInput(h.state, {}), until: () => outcomes(h).length > 0 });
    const moved = h.g.podIds.map((id, i) => Math.hypot(h.ent(id).pos.x - podStart[i].x, h.ent(id).pos.z - podStart[i].z));
    assert.ok(moved.every((m) => m > 40), `every pod was pulled by the Well: ${moved.map((m) => m.toFixed(0))}`);
    assert.deepEqual(outcomes(h), ['gleaned']);
    assert.equal(record(h).facts.via, 'well');
    assert.ok(record(h).facts.aboard >= GARDEN.recoverNeed);
    assert.ok(h.events.some((e) => e.name === 'economy:grantCredits' && e.p.amount === GARDEN.pay * record(h).facts.aboard));
    assert.ok(h.events.some((e) => e.name === 'news:publish' && /GRAVITY WELL/.test(e.p.text)));
  } finally { h.host.dispose(); }
}));

test('a hull flown into the field by throttle input snaps a real mine; flying on abandons the cargo and the next garden remembers', async () => {
  const h = await boot();
  try {
    const mine = h.ent(h.g.mineIds[0]);
    const steer = () => {
      const p = h.ent(h.state.playerId);
      const want = Math.atan2(mine.pos.z - p.pos.z, mine.pos.x - p.pos.x);
      const err = Math.atan2(Math.sin(want - p.rot), Math.cos(want - p.rot));
      writeRealPathInput(h.state, { turnIntent: Math.max(-1, Math.min(1, err * 3)), moveZ: Math.abs(err) < 0.4 ? 1 : 0 });
    };
    h.host.step(30 * 60, { before: steer, until: () => h.events.some((e) => e.name === 'mines:triggered') });
    const snap = h.events.find((e) => e.name === 'mines:triggered');
    assert.ok(snap, 'the ordinary mines owner snapped on the intruding hull');
    assert.equal(snap.p.targetId, h.state.playerId);
    h.host.step(60, { before: () => writeRealPathInput(h.state, { brake: true }) });
    // Fly on: the window lapses with the cargo still in the field.
    h.host.step((GARDEN.windowS + 2) * 60, { before: () => writeRealPathInput(h.state, { brake: true }), until: () => outcomes(h).length > 0 });
    assert.deepEqual(outcomes(h), ['abandoned']);
    assert.ok(record(h).facts.minesSpent >= 1);
    assert.ok(h.events.some((e) => e.name === 'news:publish' && /LEFT IN A REACH MINEFIELD/.test(e.p.text)));
    // The world keeps it: the next garden's crew opens with the memory.
    const res = h.director.requestAuthoredEncounter({
      shapeId: SHAPE, encounterId: 'test_garden_2', sectorId: SECTOR, anchor: { x: ANCHOR.x + 50, z: ANCHOR.z },
      zoneType: 'ambush_lane', zoneRadius: 600, force: true,
    });
    assert.equal(res.ok, true, JSON.stringify(res));
    const again = Object.values(h.state.encounterDirector.live).find((l) => l.id !== h.live.id && l.shapeId === SHAPE);
    assert.equal(again.data.garden.prior, 'abandoned');
  } finally { h.host.dispose(); }
});
