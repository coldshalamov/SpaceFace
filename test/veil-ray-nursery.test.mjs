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
import { veilNurseryMemory, tickVeilNursery, handleVeilNurseryEvent, nurseryDisturbance } from '../src/world/veilRayNursery.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { nurseryShelterQualified } from '../src/world/veilRayHabitat.js';

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
  assert.equal(n().surveyed, false, 'QUIET mode alone is not a settled formation');
  // Let the actual fauna owner return the rays, with the observer out of range
  // so physical approach cannot silently prepay the twelve-second survey.
  f.player.pos.x = f.center.x + 900;
  for (let i = 0; i < 180 && !nurseryShelterQualified(f.adults(), f.center, n()); i++) f.tick(1);
  assert.ok(nurseryShelterQualified(f.adults(), f.center, n()));
  assert.equal(n().watchSeconds, 0);
  f.player.pos.x = f.center.x + 220;
  const before = f.state.player.credits;
  f.tick(11.9); assert.equal(n().surveyed, false);
  f.tick(.2); assert.equal(n().surveyed, true); assert.equal(f.state.player.credits, before);
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

function nurseryFeedback(f) {
  const lines = [];
  f.owner.bus.on('toast', row => {
    if (row.text.startsWith('Veil-Ray Nursery:')) lines.push(row);
  });
  return lines;
}
function pulse(f) {
  handleVeilNurseryEvent(f.owner, site, 'scan:pulse', {
    source: 'player-scanner', scannerId: f.player.id, pos: f.player.pos, radius: 700,
  });
}

test('actual nursery stimulus and recovery explain one episode across repeats and Continue', () => {
  const f = fixture(), lines = nurseryFeedback(f);
  const rec = f.state.world.alienEcology.sites[site.siteId];
  rec.beats = { long: true, mid: true, close: true };
  pulse(f);
  assert.equal(lines.length, 1, 'the existing arrival advice cannot explain this actual scan');
  assert.match(lines[0].text, /scan pulse.*disturb/i);
  for (let i = 0; i < 4; i++) pulse(f);
  handleVeilNurseryEvent(f.owner, site, 'combat:fire', { ownerId: f.player.id, origin: f.player.pos });
  assert.equal(lines.length, 1, 'scan/fire bursts share one disturbance episode');
  const saved = serializeAlienEcologyState(f.state);
  deserializeAlienEcologyState(f.state, saved);
  pulse(f);
  assert.equal(lines.length, 1, 'Continue does not replay an episode cue');
  f.tick(8.1);
  for (let i = 0; i < 17 && lines.length < 2; i++) f.tick(1);
  assert.equal(lines.length, 2, JSON.stringify({ mode: veilNurseryMemory(f.state).mode, positions: f.adults().map(e => e.pos), player: f.player.pos }));
  assert.match(lines[1].text, /disturbance.*fading/i);
  assert.doesNotMatch(lines[1].text, /re.?formed|returned|all.*safe/i);
  deserializeAlienEcologyState(f.state, serializeAlienEcologyState(f.state));
  pulse(f); f.tick(8.1);
  assert.equal(lines.length, 2, 'a relapse during recovery does not spam another pair');
  f.tick(48.1); pulse(f);
  assert.equal(lines.length, 3, 'a genuinely new episode can explain its new cause');
  f.sim.dispose();
});

test('nursery feedback requires present revealed adults and the nearby living player', () => {
  for (const setup of [
    f => { f.state.world.alienEcology.revelation = 0; },
    f => { f.state.world.currentSectorId = 'sector_helios'; },
    f => { f.player.pos.x = f.center.x + 900; },
    f => { f.player.alive = false; },
    f => { for (const e of f.adults()) e.alive = false; },
    f => { for (const e of f.adults()) e.hull = 0; },
    f => { for (const e of f.adults()) { e.pos.x += 2000; e.pos.z += 2000; } },
  ]) {
    const f = fixture(), lines = nurseryFeedback(f);
    setup(f); pulse(f);
    assert.equal(lines.length, 0);
    f.sim.dispose();
  }
});

test('loss feedback never blames the player and relocation keeps its existing sole cue', () => {
  const f = fixture(), lines = nurseryFeedback(f), victim = f.adults()[0];
  handleVeilNurseryEvent(f.owner, site, 'combat:fire', { ownerId: f.player.id + 100, origin: f.player.pos });
  assert.equal(lines.length, 0);
  victim.hull = 0; victim.alive = false;
  handleVeilNurseryEvent(f.owner, site, 'entity:killed', { id: victim.id, killerId: 'npc' });
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /adult.*lost/i);
  assert.doesNotMatch(lines[0].text, /you|your/i);
  f.tick(27);
  const before = lines.length;
  nurseryDisturbance(f.owner, site, 'relocation', f.player.pos);
  f.tick(9);
  assert.equal(lines.length, before, 'relocation owner already explains its scatter');
  f.sim.dispose();
});

test('quiet passive observation stays quiet until the existing single survey reward', () => {
  const f = fixture(), lines = nurseryFeedback(f);
  f.tick(13);
  assert.equal(lines.length, 0);
  assert.equal(veilNurseryMemory(f.state).surveyed, true);
  const saved = serializeAlienEcologyState(f.state), before = f.state.player.credits;
  deserializeAlienEcologyState(f.state, saved); f.materialize(); f.tick(13);
  assert.equal(f.state.player.credits, before);
  assert.equal(f.adults().length, 3);
  assert.equal(lines.length, 0);
  f.sim.dispose();
});

test('native consumed drive flare explains itself; stale force and requested input do not', async () => {
  const f = fixture(), lines = nurseryFeedback(f), physicsOwner = f.sim.registry.get('physics');
  const previous = physicsOwner._sg02;
  const native = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  physicsOwner._sg02 = native;
  try {
    native.syncFromEntities([f.player]);
    const rec = f.state.world.alienEcology.sites[site.siteId];
    const tick = () => tickVeilNursery(f.owner, site, rec, f.all(), f.player, 1 / 60);
    for (let i = 0; i < 100; i++) {
      f.state.tick++;
      writePhysicsControl(f.player, { force: { x: f.player.mass * 8, z: 0 }, source: 'nursery-feedback-proof' });
      tick();
    }
    assert.equal(lines.length, 0, 'unconsumed commands are not a drive flare');
    for (let i = 0; i < 200; i++) {
      f.state.tick++;
      writePhysicsControl(f.player, { force: { x: f.player.mass * 8, z: 0 }, source: 'nursery-feedback-proof' });
      native.step(1 / 60, f.state.tick); tick();
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0].text, /drive flare/i);
    assert.equal(admitReceipt(lines[0]).admit, true, 'wording survives the ordinary HUD receipt filter');
    const before = veilNurseryMemory(f.state).disturbedRemaining;
    f.state.tick += 10;
    for (let i = 0; i < 100; i++) tick();
    assert.ok(veilNurseryMemory(f.state).disturbedRemaining < before, 'stale consumed force does not prolong disturbance');
    assert.equal(lines.length, 1);
  } finally {
    physicsOwner._sg02 = previous; native.dispose(); f.sim.dispose();
  }
});

test('biology fitting reveal and text receipts work with silent audio and reduced motion', () => {
  const f = fixture(1), lines = nurseryFeedback(f);
  f.player.data.fittings = ['mod_bio_spectral_pass_s'];
  f.materialize();
  assert.equal(f.adults().length, 3);
  pulse(f);
  assert.equal(lines.length, 1);
  // This fixture has no audio system. Reduced motion removes the adult wing read,
  // while the same causal sentence still enters the ordinary text receipt lane.
  const adult = f.adults()[0], mesh = buildFaunaMesh(adult);
  mesh.userData.updateAuthoredMotion(adult, 1, { reducedMotion: true }, f.state);
  assert.equal(mesh.children[0].rotation.x, 0);
  assert.equal(admitReceipt(lines[0]).admit, true);
  assert.match(lines[0].text, /scan pulse.*disturb/i);
  f.sim.dispose();
});

test('leaving the sector freezes the existing episode rather than running a feedback clock', () => {
  const f = fixture(), lines = nurseryFeedback(f);
  pulse(f);
  const before = JSON.parse(JSON.stringify(veilNurseryMemory(f.state)));
  f.state.world.currentSectorId = 'sector_helios';
  f.tick(40);
  assert.deepEqual(veilNurseryMemory(f.state), before);
  assert.equal(lines.length, 1);
  f.sim.dispose();
});

test('episode latch precedes synchronous repeat-pulse subscribers', () => {
  const f = fixture(), lines = nurseryFeedback(f);
  let nested = false;
  f.owner.bus.on('toast', row => {
    if (row.text.startsWith('Veil-Ray Nursery:') && !nested) { nested = true; pulse(f); }
  });
  pulse(f);
  assert.equal(lines.length, 1);
  assert.equal(veilNurseryMemory(f.state).disturbanceNoted, true);
  f.sim.dispose();
});

test('disturbance Save/Continue subscribers retain the latch before repeating a pulse', () => {
  const f = fixture(), lines = nurseryFeedback(f);
  let restored = false, savedLatch;
  f.owner.bus.on('toast', row => {
    if (!row.text.startsWith('Veil-Ray Nursery:') || restored) return;
    restored = true;
    const saved = serializeAlienEcologyState(f.state);
    savedLatch = saved.sites[site.siteId].nursery.disturbanceNoted;
    deserializeAlienEcologyState(f.state, saved);
    pulse(f);
  });
  pulse(f);
  assert.equal(savedLatch, true, 'Save taken by the receipt already contains the episode latch');
  assert.equal(lines.length, 1);
  assert.equal(veilNurseryMemory(f.state).disturbanceNoted, true);
  f.sim.dispose();
});

test('recovery Save/Continue subscribers retain the latch and retire the old tick record', () => {
  const f = fixture(), lines = nurseryFeedback(f);
  pulse(f);
  const old = veilNurseryMemory(f.state);
  old.disturbedRemaining = 1 / 60;
  old.watchSeconds = 7;
  let savedLatch, oldAtEmit, restored = false;
  f.owner.bus.on('toast', row => {
    if (!row.text.includes('is fading.') || restored) return;
    restored = true;
    oldAtEmit = JSON.parse(JSON.stringify(old));
    const saved = serializeAlienEcologyState(f.state);
    savedLatch = saved.sites[site.siteId].nursery.recoveryNoted;
    deserializeAlienEcologyState(f.state, saved);
    // A restored current episode can advance immediately without replaying the cue.
    const rec = f.state.world.alienEcology.sites[site.siteId];
    tickVeilNursery(f.owner, site, rec, f.all(), f.player, 1 / 60);
  });
  const rec = f.state.world.alienEcology.sites[site.siteId];
  tickVeilNursery(f.owner, site, rec, f.all(), f.player, 1 / 60);
  assert.equal(savedLatch, true);
  assert.equal(lines.length, 2);
  assert.notEqual(veilNurseryMemory(f.state), old);
  assert.deepEqual(old, oldAtEmit, 'outer tick must not write watchSeconds through its retired record');
  f.sim.dispose();
});

test('nursery receipts respect the existing quiet-HUD versus fight/hurt admission boundary', () => {
  for (const kind of ['scan', 'weapons', 'thrust', 'loss']) {
    const f = fixture(), lines = nurseryFeedback(f);
    nurseryDisturbance(f.owner, site, kind, f.player.pos);
    veilNurseryMemory(f.state).disturbedRemaining = 1 / 60;
    tickVeilNursery(f.owner, site, f.state.world.alienEcology.sites[site.siteId], f.all(), f.player, 1 / 60);
    assert.equal(lines.length, 2);
    for (const row of lines) {
      assert.equal(admitReceipt({ ...row, combat: false }).admit, true);
      assert.deepEqual(admitReceipt({ ...row, combat: true }), { admit: false, reason: 'combat-quiet' });
    }
    f.sim.dispose();
  }
});

test('drive receipt Save/Continue cannot carry the consumed burn or mutate its retired record', async () => {
  const f = fixture(), physicsOwner = f.sim.registry.get('physics'), previous = physicsOwner._sg02;
  const native = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  physicsOwner._sg02 = native;
  let retired, atEmit, savedBurn;
  f.owner.bus.on('toast', row => {
    if (!row.text.includes('Drive flare') || retired) return;
    retired = veilNurseryMemory(f.state);
    atEmit = JSON.parse(JSON.stringify(retired));
    const saved = serializeAlienEcologyState(f.state);
    savedBurn = saved.sites[site.siteId].nursery.thrustSeconds;
    deserializeAlienEcologyState(f.state, saved);
  });
  try {
    native.syncFromEntities([f.player]);
    for (let i = 0; i < 100 && !retired; i++) {
      f.state.tick++;
      writePhysicsControl(f.player, { force: { x: f.player.mass * 8, z: 0 }, source: 'nursery-continue-proof' });
      native.step(1 / 60, f.state.tick);
      tickVeilNursery(f.owner, site, f.state.world.alienEcology.sites[site.siteId], f.all(), f.player, 1 / 60);
    }
    assert.ok(retired);
    assert.equal(savedBurn, 0, 'the flare already consumed the sustained burn before its receipt');
    assert.deepEqual(retired, atEmit);
    assert.notEqual(veilNurseryMemory(f.state), retired);
  } finally {
    physicsOwner._sg02 = previous; native.dispose(); f.sim.dispose();
  }
});

test('recovery waits for proximity and fitting reveal to return within the existing recovery window', () => {
  for (const gate of ['range', 'fitting']) {
    const f = fixture(gate === 'fitting' ? 1 : 2), lines = nurseryFeedback(f);
    if (gate === 'fitting') { f.player.data.fittings = ['mod_bio_spectral_pass_s']; f.materialize(); }
    pulse(f);
    const n = veilNurseryMemory(f.state), rec = f.state.world.alienEcology.sites[site.siteId];
    n.disturbedRemaining = 1 / 60;
    if (gate === 'range') f.player.pos.x = f.center.x + 900;
    else f.player.data.fittings = [];
    tickVeilNursery(f.owner, site, rec, f.all(), f.player, 1 / 60);
    assert.equal(n.mode, 'RECOVERING');
    assert.equal(n.recoveryNoted, false);
    assert.equal(lines.length, 1);
    if (gate === 'range') f.player.pos.x = f.center.x + 220;
    else f.player.data.fittings = ['mod_bio_spectral_pass_s'];
    tickVeilNursery(f.owner, site, rec, f.all(), f.player, 1 / 60);
    assert.equal(lines.length, 2);
    assert.match(lines[1].text, /scan pulse.*fading/i);
    tickVeilNursery(f.owner, site, rec, f.all(), f.player, 1 / 60);
    assert.equal(lines.length, 2);
    f.sim.dispose();
  }
});

test('recovery retains the latest actual cause after a combat-suppressed disturbance receipt', () => {
  const f = fixture(), lines = nurseryFeedback(f);
  pulse(f);
  handleVeilNurseryEvent(f.owner, site, 'combat:fire', { ownerId: f.player.id, origin: f.player.pos });
  assert.equal(lines.length, 1);
  const n = veilNurseryMemory(f.state), rec = f.state.world.alienEcology.sites[site.siteId];
  n.disturbedRemaining = 1 / 60;
  tickVeilNursery(f.owner, site, rec, f.all(), f.player, 1 / 60);
  assert.equal(lines.length, 2);
  assert.match(lines[1].text, /weapon fire.*fading/i);
  assert.doesNotMatch(lines[1].text, /scan pulse|you|your/i);
  assert.equal(admitReceipt({ ...lines[0], combat: true }).admit, false);
  assert.equal(admitReceipt({ ...lines[1], combat: false }).admit, true);
  f.sim.dispose();
});
