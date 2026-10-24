import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { physics } from '../src/core/physics.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { ALIEN_SITES, planFaunaCast } from '../src/data/alienEcology.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { materializeAlienEcology, tickAlienEcology, handleAlienEcologyEvent,
  serializeAlienEcologyState, deserializeAlienEcologyState, setRevelation,
  relocateAlienEcologySite } from '../src/systems/alienEcology.js';
import { veilNurseryMemory, tickVeilNursery } from '../src/world/veilRayNursery.js';
import { nurseryHabitatOffset, nurseryInitialHabitatOffset, nurseryHabitatGoal,
  nurseryShelterQualified, NURSERY_ADULT_PLANAR_RADIUS } from '../src/world/veilRayHabitat.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { buildNurseryMineralRib } from '../src/render/veilRayNurseryVisuals.js';

const site = ALIEN_SITES.veil_ray_nursery, DT = 1 / 60;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(seed = 1, saved = null) {
  const sim = createSimulation({ seed, systems: [spawnBudget, world, physics] });
  const state = sim.state, owner = sim.registry.get('world');
  state.mode = 'flight'; state.world.currentSectorId = site.sectorId;
  state.world.activeSector = { dressing: [], pois: [] }; setRevelation(state, 2);
  if (saved) deserializeAlienEcologyState(state, copy(saved));
  const center = owner._toGlobal(site.center, site.sectorId);
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', { isPlayer: true,
    player: state.player, pos: { x: center.x + 220, z: center.z }, fittings: [] }));
  state.playerId = player.id;
  const all = () => state.entityList.filter(e => e.alive !== false && e.data?.ecology?.siteId === site.siteId);
  const adults = () => all().filter(e => !e.data.ecology.aggregate && e.hull > 0);
  const n = () => veilNurseryMemory(state);
  const step = () => { state.tick++; state.simTime = state.tick / 60; tickAlienEcology(owner, DT); };
  const tick = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) step(); };
  const materialize = () => materializeAlienEcology(owner, { id: site.sectorId }, state.world.activeSector, [site]);
  const pulse = () => handleAlienEcologyEvent(owner, 'scan:pulse', {
    source: 'player-scanner', scannerId: player.id, pos: player.pos, radius: 700 });
  materialize();
  return { sim, state, owner, center, player, all, adults, n, step, tick, materialize, pulse };
}
function qualified(f) { return nurseryShelterQualified(f.adults(), f.center, f.n()); }
function currentMaximum(f) { return Math.max(...f.adults().map(e => distance(e.pos, f.center) + NURSERY_ADULT_PLANAR_RADIUS)); }

test('seed1 planner counterexample remains unchanged for the global cast; Nursery uses a bounded initial habitat', t => {
  const cast = planFaunaCast(site, mulberry32(hash32(1, site.sectorId, 0, 'alien-ecology', site.siteId)));
  assert.deepEqual(cast.map(e => Math.round(Math.hypot(e.dx, e.dz) * 1000)), [140303, 161075, 103762]);
  assert.ok(cast.every(e => Math.hypot(e.dx, e.dz) - 30 > 60), 'all old recovery target circles miss shelter');
  const f = fixture(); t.after(() => f.sim.dispose());
  assert.equal(f.adults().length, 3); assert.equal(f.all().length, 4);
  assert.equal(f.state.entityList.filter(e => Number.isInteger(e.data?.veilNurseryRib)).length, 7);
  assert.ok(qualified(f)); assert.ok(currentMaximum(f) < 54.02);
  for (const e of f.adults()) { assert.equal(e.collides, false); assert.equal(e.physicsBody, false); }
  const flock = f.all().find(e => e.data.ecology.aggregate);
  assert.equal(flock.physicsBody, false); assert.equal(flock.data.ecology.driveT, undefined);
});

test('real procedural tail and articulated membrane bounds clear real mineral ribs in settled layout', t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  const adult = f.adults()[0], mesh = buildFaunaMesh(adult), point = new THREE.Vector3();
  let actualRadius = 0;
  for (const mode of ['QUIET', 'RECOVERING', 'DISTURBED']) {
    adult.data.ecology.nurseryMode = mode;
    for (const now of [0, .25, .7, 1, 3]) {
      mesh.userData.updateAuthoredMotion(adult, now, {}, f.state); mesh.updateMatrixWorld(true);
      mesh.traverse(node => { const pos = node.geometry?.getAttribute('position'); if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
          point.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
          actualRadius = Math.max(actualRadius, Math.hypot(point.x, point.z));
        }
      });
    }
  }
  assert.ok(actualRadius > 23.4 && actualRadius <= NURSERY_ADULT_PLANAR_RADIUS);
  t.diagnostic(JSON.stringify({ measuredAdultPlanarRadius: actualRadius, conservativeRadius: NURSERY_ADULT_PLANAR_RADIUS }));
  for (const rib of f.state.entityList.filter(e => Number.isInteger(e.data?.veilNurseryRib))) {
    const root = buildNurseryMineralRib(rib);
    root.traverse(node => { const pos = node.geometry?.getAttribute('position'); if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        assert.ok(Math.abs(pos.getX(i)) <= 11.00001);
        assert.ok(Math.abs(pos.getZ(i)) <= 3.00001);
      }
    });
  }
  assert.ok(60 - 3 > currentMaximum(f), 'all-yaw animal geometry stays inside the real rib inner edge');
});

test('ordinary quiet steering remains sheltered over120 seconds with unchanged identities and no teleport', t => {
  for (const seed of [1, 1515, 4242]) {
    const f = fixture(seed); t.after(() => f.sim.dispose());
    const ids = f.adults().map(e => e.id), anchors = f.adults().map(e => copy(e.data.ecology.anchor));
    let maxEnvelope = 0, minSeparation = Infinity;
    for (let k = 0; k < 7200; k++) {
      const before = f.adults().map(e => ({ ...e.pos })); f.step();
      f.adults().forEach((e, i) => assert.ok(distance(before[i], e.pos) <= 34 * DT + 1e-8));
      maxEnvelope = Math.max(maxEnvelope, currentMaximum(f));
      const adults = f.adults();
      for (let i = 0; i < adults.length; i++) for (let j = i + 1; j < adults.length; j++)
        minSeparation = Math.min(minSeparation, distance(adults[i].pos, adults[j].pos));
    }
    t.diagnostic(JSON.stringify({ seed, seconds: 120, maxEnvelope, minSeparation }));
    assert.ok(maxEnvelope < 56, JSON.stringify({ seed, maxEnvelope }));
    assert.ok(minSeparation > 2 * NURSERY_ADULT_PLANAR_RADIUS, JSON.stringify({ seed, minSeparation }));
    assert.deepEqual(f.adults().map(e => e.id), ids);
    assert.deepEqual(f.adults().map(e => e.data.ecology.anchor), anchors);
    assert.equal(f.n().surveyed, true); assert.equal(f.all().length, 4);
  }
});

test('legacy off-shelter adult positions converge through the actual owner without anchor migration', t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  const cast = planFaunaCast(site, mulberry32(hash32(1, site.sectorId, 0, 'alien-ecology', site.siteId)));
  f.adults().forEach((e, i) => {
    e.pos.x = f.center.x + cast[i].dx; e.pos.z = f.center.z + cast[i].dz;
    e.data.ecology.anchor = { ...e.pos }; e.rot = cast[i].phase;
  });
  const anchors = f.adults().map(e => copy(e.data.ecology.anchor));
  assert.equal(qualified(f), false);
  f.tick(12.1); assert.equal(f.n().surveyed, false, 'old false shelter receipt is rejected');
  for (let k = 0; k < 7200; k++) {
    const before = f.adults().map(e => ({ ...e.pos })); f.step();
    f.adults().forEach((e, i) => assert.ok(distance(before[i], e.pos) <= 34 * DT + 1e-8));
  }
  assert.ok(qualified(f)); assert.equal(f.n().surveyed, true);
  assert.deepEqual(f.adults().map(e => e.data.ecology.anchor), anchors);
});

test('scan escape and recovery require twelve physically qualified quiet seconds, not the mode timer', t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  f.pulse(); f.tick(8); assert.equal(f.n().mode, 'RECOVERING');
  assert.ok(f.adults().some(e => distance(e.pos, f.center) > 300));
  f.tick(18); assert.equal(f.n().mode, 'QUIET'); assert.equal(f.n().surveyed, false);
  assert.equal(qualified(f), false); assert.equal(f.n().watchSeconds, 0);
  let qualifiedSeconds = 0, firstQualified = null, surveyedAt = null;
  for (let k = 0; k < 7200; k++) {
    const before = f.adults().map(e => ({ ...e.pos })), wasQualified = qualified(f);
    qualifiedSeconds = wasQualified ? qualifiedSeconds + DT : 0;
    if (wasQualified && firstQualified === null) firstQualified = f.state.simTime;
    f.step();
    f.adults().forEach((e, i) => assert.ok(distance(before[i], e.pos) <= 34 * DT + 1e-8));
    assert.ok(Math.abs(f.n().watchSeconds - Math.min(12, qualifiedSeconds)) < 1e-7);
    if (f.n().surveyed) { surveyedAt = f.state.simTime; break; }
  }
  t.diagnostic(JSON.stringify({ firstQualified, surveyedAt }));
  assert.ok(firstQualified !== null && surveyedAt !== null);
  assert.ok(surveyedAt - firstQualified >= 12 - 1e-7);
  assert.ok(qualified(f));
});

test('goal gates retain effective panic/capture and persistent relocation outcomes; other biomes are unchanged', t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  const e = f.adults()[0], rec = f.state.world.alienEcology.sites[site.siteId];
  f.n(); e.data.ecology.driveState = 'forage';
  assert.ok(nurseryHabitatGoal(site, rec, e, f.center, 0));
  for (const drive of ['flee', 'captured', 'feed', 'shadow']) {
    e.data.ecology.driveState = drive; assert.equal(nurseryHabitatGoal(site, rec, e, f.center, 0), null);
  }
  e.data.ecology.driveState = 'forage';
  for (const relocation of [{ scattered: true }, { move: {} }, { tow: {} }, { status: 'settling' }]) {
    rec.nursery.relocation = relocation;
    assert.equal(nurseryHabitatGoal(site, rec, e, f.center, 0), null);
    if (relocation.status !== 'settling') assert.equal(qualified(f), false);
  }
  rec.nursery.relocation = { status: 'rehomed' };
  assert.ok(nurseryHabitatGoal(site, rec, e, f.center, 0));
  delete rec.nursery.relocation;
  assert.equal(nurseryHabitatGoal({ ...site, siteId: 'cinder_nursery' }, rec, e, f.center, 0), null);
  assert.equal(nurseryInitialHabitatOffset({ ...site, siteId: 'cinder_nursery' }, rec,
    { speciesId: 'veil_ray', faunaKey: e.data.ecology.faunaKey }, 0), null);
  assert.equal(nurseryHabitatOffset('veil_ray_nursery:veil_ray:3'), null);
});

test('death, active recovery and scattered ecology restore preserve outcomes rather than reset into formation', t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  f.pulse(); f.tick(10);
  const saved = serializeAlienEcologyState(f.state);
  const restored = fixture(1, saved); t.after(() => restored.sim.dispose());
  assert.deepEqual(restored.n(), f.n());
  assert.equal(qualified(restored), false, 'active recovery reentry retains ordinary planner positions');
  const before = restored.adults().map(e => copy(e.pos)), ids = restored.adults().map(e => e.id);
  restored.materialize();
  assert.deepEqual(restored.adults().map(e => copy(e.pos)), before);
  assert.deepEqual(restored.adults().map(e => e.id), ids);
  const victim = restored.adults()[0]; victim.hull = 0; victim.alive = false;
  handleAlienEcologyEvent(restored.owner, 'entity:killed', { id: victim.id });
  const deadSaved = serializeAlienEcologyState(restored.state), deadKey = victim.data.ecology.faunaKey;
  const deadRestored = fixture(1, deadSaved); t.after(() => deadRestored.sim.dispose());
  assert.equal(deadRestored.adults().length, 2);
  assert.equal(deadRestored.adults().some(e => e.data.ecology.faunaKey === deadKey), false);
  deadRestored.tick(120); assert.equal(deadRestored.adults().length, 2); assert.ok(qualified(deadRestored));
  const scattered = fixture(); t.after(() => scattered.sim.dispose());
  relocateAlienEcologySite(scattered.owner, { siteId: site.siteId, center: { x: site.center.x + 1500, z: site.center.z }, duration: 1 });
  scattered.tick(90); assert.equal(scattered.n().relocation.scattered, true); assert.equal(scattered.n().surveyed, false);
  const homes = copy(scattered.n().relocation.scatterAnchors);
  const after = fixture(1, serializeAlienEcologyState(scattered.state)); t.after(() => after.sim.dispose());
  after.tick(40); assert.equal(after.n().relocation.scattered, true);
  assert.deepEqual(after.n().relocation.scatterAnchors, homes); assert.equal(after.n().surveyed, false);
});

test('survey predicate counts actual positive-hull survivors and resets when one leaves the shelter', t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  f.tick(6); assert.ok(f.n().watchSeconds >= 5.9 && !f.n().surveyed);
  const adult = f.adults()[0]; adult.pos.x = f.center.x + 100; f.step();
  assert.equal(f.n().watchSeconds, 0); assert.equal(f.n().surveyed, false);
  adult.hull = 0; f.step();
  assert.ok(f.n().watchSeconds > 0, 'the two living sheltered animals qualify, not a doomed body');
  const flock = f.all().find(e => e.data.ecology.aggregate);
  assert.ok(distance(flock.pos, f.center) < 15, 'juveniles follow a living adult');
  for (const e of f.adults()) e.hull = 0; f.step();
  assert.equal(f.n().watchSeconds, 0); assert.equal(f.n().surveyed, false);
  assert.equal(flock.data.ecology.visibleMembers, 0);
});
