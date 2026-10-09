import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { physics } from '../src/core/physics.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { materializeAlienEcology, tickAlienEcology, handleAlienEcologyEvent,
  serializeAlienEcologyState, deserializeAlienEcologyState, setRevelation } from '../src/systems/alienEcology.js';
import { veilNurseryMemory, tickVeilNursery, handleVeilNurseryEvent } from '../src/world/veilRayNursery.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';

const site = ALIEN_SITES.veil_ray_nursery;
function fixture(tier = 2) {
  const sim = createSimulation({ seed: 1515, systems: [spawnBudget, world, physics] });
  const state = sim.state, owner = sim.registry.get('world');
  state.mode = 'flight'; state.world.currentSectorId = site.sectorId;
  state.world.activeSector = { dressing: [], pois: [] };
  setRevelation(state, tier);
  const center = owner._toGlobal(site.center, site.sectorId);
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', { isPlayer: true,
    player: state.player, pos: { x: center.x + 220, z: center.z }, fittings: [] }));
  state.playerId = player.id;
  const materialize = () => materializeAlienEcology(owner, { id: site.sectorId }, state.world.activeSector, [site]);
  const all = () => state.entityList.filter(e => e.alive !== false && e.data?.ecology?.siteId === site.siteId);
  const adults = () => all().filter(e => !e.data.ecology.aggregate);
  const tick = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) {
    state.tick++; state.simTime = state.tick / 60; tickAlienEcology(owner, 1 / 60);
  } };
  materialize(); return { sim, state, owner, center, player, materialize, all, adults, tick };
}

test('taxonomy gates a bounded satellite; rematerialization preserves three adult identities and one visual flock', () => {
  const f = fixture(0);
  assert.equal(f.all().length, 0);
  setRevelation(f.state, 2); f.materialize();
  assert.equal(f.adults().length, 3); assert.equal(f.all().length, 4);
  const ids = f.adults().map(e => e.id); f.materialize(); f.tick(1);
  assert.deepEqual(f.adults().map(e => e.id), ids);
  assert.equal(f.state.entityList.filter(e => Number.isInteger(e.data?.veilNurseryRib)).length, 7);
  for (const e of f.adults()) assert.equal(f.state.spawnBudget.entityOwners.get(String(e.id)), e.data.ecology.faunaKey);
  const flock = f.all().find(e => e.data.ecology.aggregate);
  assert.equal(flock.physicsBody, false); assert.equal(flock.collides, false);
  assert.equal(flock.data.ecology.visibleMembers, 8);
  assert.equal(flock.data.ecology.driveT, undefined, 'flock receives no fauna drive tick');
  f.sim.dispose();
});

test('actual scan and weapons disturb, quiet recovery and passive survey are finite and once across ecology restore', () => {
  const f = fixture(); const n = () => veilNurseryMemory(f.state);
  f.tick(4); assert.equal(n().mode, 'QUIET'); assert.equal(n().surveyed, false);
  // Merely sitting within the scanner sensitivity band did not invent a pulse.
  handleAlienEcologyEvent(f.owner, 'scan:pulse', { source: 'player-scanner', scannerId: f.player.id,
    pos: f.player.pos, radius: 700 });
  assert.equal(n().mode, 'DISTURBED'); f.tick(8); assert.equal(n().mode, 'RECOVERING');
  f.tick(18.1); assert.equal(n().mode, 'QUIET');
  const before = f.state.player.credits;
  f.tick(12.1); assert.equal(n().surveyed, true); assert.equal(f.state.player.credits, before);
  const saved = serializeAlienEcologyState(f.state); n().surveyed = false;
  deserializeAlienEcologyState(f.state, saved); assert.equal(n().surveyed, true);
  handleVeilNurseryEvent(f.owner, site, 'combat:fire', { ownerId: f.player.id, origin: f.player.pos });
  assert.equal(n().mode, 'DISTURBED'); assert.equal(n().lastCause, 'weapons');
  f.sim.dispose();
});

test('nursery loss remains dead after reload and re-entry; a juvenile flock never replenishes adults', () => {
  const f = fixture(), victim = f.adults()[0], key = victim.data.ecology.faunaKey;
  victim.hull = 0; victim.alive = false;
  handleAlienEcologyEvent(f.owner, 'entity:killed', { id: victim.id });
  const saved = serializeAlienEcologyState(f.state);
  assert.equal(saved.sites[site.siteId].deadFauna[key], true);
  deserializeAlienEcologyState(f.state, saved); f.materialize(); f.tick(130);
  assert.equal(f.adults().length, 2); assert.equal(f.all().length, 3);
  assert.equal(f.state.entityList.filter(e => e.data?.ecology?.siteId === site.siteId && e.data.ecology.juvenile).length, 0);
  f.sim.dispose();
});

test('mineral ribs are seven actual native solids and retain their open mouth', async () => {
  const f = fixture(); const native = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  native.syncFromEntities(f.state.entityList);
  const ribs = f.state.entityList.filter(e => Number.isInteger(e.data?.veilNurseryRib));
  assert.equal(ribs.length, 7);
  for (const e of ribs) {
    const r = native.records.get(e.id); assert.ok(r, 'native rib admitted');
    assert.equal(r.colliders.length, 1); assert.equal(r.colliders[0].isSensor(), false);
    assert.ok(Math.abs(r.colliders[0].halfExtents().x - 11) < .001);
    assert.ok(Math.abs(r.colliders[0].halfExtents().z - 3) < .001);
  }
  const east = { x: f.center.x + 60, y: 0, z: f.center.z };
  assert.equal(ribs.some(e => native.records.get(e.id).colliders[0].containsPoint(east)), false);
  native.dispose(); f.sim.dispose();
});

test('nursery membranes articulate from ecology and one juvenile render batch respects motion/lifetime', () => {
  const f = fixture(), adult = f.adults()[0];
  const mesh = buildFaunaMesh(adult), fn = mesh.userData.updateAuthoredMotion;
  fn(adult, 1, {}, f.state); assert.notEqual(mesh.children[0].rotation.x, 0);
  fn(adult, 1, { reducedMotion: true }, f.state); assert.equal(mesh.children[0].rotation.x, 0);
  const flock = f.all().find(e => e.data.ecology.aggregate), rendered = buildFaunaMesh(flock);
  assert.equal(rendered.children.length, 3); assert.ok(rendered.children.every(e => e.isInstancedMesh && e.count === 8));
  flock.data.ecology.visibleMembers = 0; rendered.userData.updateAuthoredMotion(flock, 1, {}, f.state);
  assert.ok(rendered.children.every(e => e.count === 0));
  fn({ ...adult, occupantGeneration: adult.occupantGeneration + 1 }, 2, {}, f.state);
  assert.equal(mesh.children[0].rotation.x, 0); f.sim.dispose();
});
