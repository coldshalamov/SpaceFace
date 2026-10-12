// CR situation 1203 — THE DECLARATION. A Quiet runner's stolen deck coasts into a Concord customs
// cutter's cone. The scan is the real lawSecurity owner (cone, dwell, hull occlusion); bodies move
// through the real SG-02 Rapier authority. Fly on and customs reads them; haul them home and the
// Quiet pay; a hull parked on the sight line hides them; push them in and you turned them in.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lootShards } from '../src/systems/lootShards.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { combat } from '../src/systems/combat.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { DECL } from '../src/data/encounters/1203-the-declaration.js';

const SEED = 4242;
const SECTOR = 'sector_tethys_junction';
const ANCHOR = Object.freeze({ x: 500, z: 1500 });
const SHAPE = 'the_declaration';

async function boot(playerAt = null) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, lootShards, lawSecurity, 'collisionConsequences', 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x - 150, z: ANCHOR.z + 150 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of ['encounter:resolved', 'economy:grantCredits', 'contraband:scanned', 'news:publish']) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const res = host.runtime.getSystem('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_decl', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'border_checkpoint', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const c = live.data.declaration;
  const ent = (id) => state.entities.get(id);
  if (playerAt) {
    // Setup only: the pilot has already flown to the spot named (travel skipped, nothing else).
    const pl = ent(state.playerId);
    const pos = playerAt(c, ent);
    pl.pos.x = pos.x; pl.pos.z = pos.z;
    pl.vel.x = 0; pl.vel.z = 0;
  }
  host.step(4);
  host.assertBodies([c.cutterId, c.runnerId, ...c.podIds].map(ent), 'declaration bodies');
  return { host, state, c, events, ent };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const scans = (h) => h.events.filter((e) => e.name === 'contraband:scanned');
const kickTo = (h, e, target, speed) => {
  const dx = target.x - e.pos.x, dz = target.z - e.pos.z, l = Math.hypot(dx, dz) || 1;
  const v = { x: dx / l * speed - e.vel.x, z: dz / l * speed - e.vel.z };
  h.host.withFeatures(() => queuePhysicsImpulse(e, { x: v.x * e.mass, y: 0, z: v.z * e.mass },
    { provenance: 'test_contact', tick: h.state.tick, kind: 'contact' }));
};
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });

test('the declaration is registered on the Tethys approach, outside Helios', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.deepEqual([...enc.gates.sectorIds], [SECTOR]);
});

test('flying on: the deck coasts into the cone and the law owner reads every pod', async () => {
  const h = await boot();
  try {
    runUntilResolved(h, 70 * 60);
    assert.equal(scans(h).length, DECL.pods, 'lawSecurity scanned each pod');
    assert.deepEqual(outcomes(h), ['seized']);
    assert.deepEqual(grants(h), []);
    assert.ok(h.events.some((e) => e.name === 'news:publish'));
  } finally { h.host.dispose(); }
});

test('hauling the pods back to the runner before the cutter reads them: the Quiet pay', async () => {
  const h = await boot();
  try {
    const runner = h.ent(h.c.runnerId);
    for (const id of h.c.podIds) kickTo(h, h.ent(id), runner.pos, 15);
    runUntilResolved(h, 30 * 60);
    assert.equal(scans(h).length, 0);
    assert.deepEqual(outcomes(h), ['returned']);
    assert.deepEqual(grants(h), [DECL.returnedPay]);
  } finally { h.host.dispose(); }
});

test('a hull parked on the sight line hides the deck from the cutter', async () => {
  const h = await boot((c, ent) => {
    const cut = ent(c.cutterId);
    return { x: cut.pos.x - c.dir.x * 45, z: cut.pos.z - c.dir.z * 45 };
  });
  try {
    h.host.step(35 * 60);
    const entered = h.c.podIds.filter((id) => h.ent(id).data.customsConeEntered).length;
    assert.ok(entered >= 1, 'pods are inside the cone');
    assert.equal(scans(h).length, 0, 'but the hull blocks the read');
    const runner = h.ent(h.c.runnerId);
    for (const id of h.c.podIds) kickTo(h, h.ent(id), runner.pos, 15);
    runUntilResolved(h, 40 * 60);
    assert.deepEqual(outcomes(h), ['returned']);
  } finally { h.host.dispose(); }
});

test('pushing the deck into the cone turns it in: Concord pays a fee, the Quiet remember', async () => {
  const h = await boot();
  try {
    const cut = h.ent(h.c.cutterId);
    for (const id of h.c.podIds) {
      const pod = h.ent(id);
      kickTo(h, pod, { x: (pod.pos.x + cut.pos.x) / 2, z: (pod.pos.z + cut.pos.z) / 2 }, 14);
    }
    runUntilResolved(h, 30 * 60);
    assert.equal(scans(h).length, DECL.pods);
    assert.deepEqual(outcomes(h), ['turned_in']);
    assert.deepEqual(grants(h), [DECL.turnedInPay]);
    assert.ok(h.state.story.depthProgramEncounters.completed[SHAPE].facts.touchedScanned >= 1);
  } finally { h.host.dispose(); }
});
