import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { heliosCuttingCrossing, heliosCuttingCourtesyRead } from '../src/systems/heliosCuttingCourtesy.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
import { modelTruthPlanarRadius } from '../src/data/modelTruth.js';

const SECTOR = 'sector_helios_prime', DT = 1 / 60;
function prepare(s, jobs, spawn, p) {
  s.mode = 'flight'; s.world.currentSectorId = SECTOR; s.run.kind = 'adventure';
  s.onboarding = { active: false, finished: true }; s.simTime = 300; s.playerId = p.id;
  const worker = spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, radius: 12,
    mass: 30, hull: 100, hullMax: 100, homeSectorId: SECTOR,
    data: { worldRecordId: 'tow-cutter', activityActorSlotId: 'helios_seam_miner', ai: { passive: true }, trafficRole: 'miner' } });
  const rock = spawn({ type: 'asteroid', pos: { x: 200, z: 0 }, radius: 25, mass: 400,
    hull: 600, hullMax: 600, physicsBody: { dynamic: false, radius: 25 }, homeSectorId: SECTOR,
    data: { typeId: 'ast_common_rock', fieldId: 'f_helios_starter', oreHP: 600, oreHPMax: 600, yieldU: 30 } });
  const id = jobs.assign(worker, { kind: 'miner', sectorId: SECTOR,
    route: [{ id: 'home:station_helios', pos: { x: 0, z: -300 } }, { id: `field:${rock.id}`, pos: { ...rock.pos } }] });
  assert.ok(id); const entry = s.npcJobs.byId[id];
  Object.assign(entry.job, { phase: 'work', routeIndex: 1, progress: 0 });
  worker.data.minerShiftRockId = rock.id;
  jobs._heliosStarterMinerRecordId = worker.data.worldRecordId; jobs._heliosStarterRockId = rock.id;
  const load = spawn({ type: 'payload', pos: { x: 100, z: -80 }, radius: 4, mass: 8,
    hull: 40, hullMax: 40, physicsBody: { shape: 'ball', radius: 4, mass: 8, dynamic: true },
    homeSectorId: SECTOR, data: { tetherable: true, masslineTetherable: true } });
  return { worker, rock, entry, load };
}
function fixture({ voice = false } = {}) {
  const sim = createSimulation({ seed: 73319, systems: [npcJobsRuntime, mining, ...(voice ? [voiceArbiter] : [])] });
  const s = sim.state, p = sim.spawn({ type: 'ship', team: 0, isPlayer: true,
    pos: { x: 100, z: 100 }, radius: 12, mass: 30, hull: 100, hullMax: 100 });
  const jobs = sim.registry.get('npcJobsRuntime'), scene = prepare(s, jobs, spec => sim.spawn(spec), p);
  ensureCombatState(s);
  const attachments = createAttachmentService({ state: s, bus: sim.bus, catalog: createCombatCatalog(),
    helpers: { combatPhysics: { createAttachment: () => 1, cutAttachment: () => true } } });
  const made = attachments.create({ defId: 'tether_standard', ownerId: p.id, targetId: scene.load.id });
  assert.ok(made.ok, made.reason);
  const a = made.attachment; s.player.tether = { active: true, targetId: scene.load.id, attachmentId: a.id };
  return { sim, s, p, jobs, a, ...scene, tick(n = 1) { for (let i = 0; i < n; i++) sim.step(DT); },
    cut() { attachments.cut(a.id, p.id, 'tether_cut'); s.player.tether.active = false; },
    close() { jobs._cuttingCourtesyCleanup?.(); sim.dispose(); } };
}

test('the real canonical tow alone holds the cutter clock, beam, material and payment owners', () => {
  const f = fixture({ voice: true }); try {
    const before = JSON.stringify([f.worker.pos, f.p.pos, f.load.pos, f.s.player.cargo, f.s.player.credits]);
    const spoken = [], grants = [];
    f.sim.bus.on('voice:surface', e => { if (e.id?.startsWith('helios_cutting_courtesy:')) spoken.push(e); });
    f.sim.bus.on('economy:grantCredits', e => grants.push(e));
    f.tick(180);
    assert.ok(heliosCuttingCourtesyRead(f.s, f.worker)); assert.equal(f.worker.data.minerShiftActive, false);
    assert.equal(f.rock.data.oreHP, 600); assert.equal(f.entry.job.progress, 0);
    assert.equal(f.worker.data.minerShiftBeamS, undefined); assert.equal(f.a.state, 'active');
    assert.equal(JSON.stringify([f.worker.pos, f.p.pos, f.load.pos, f.s.player.cargo, f.s.player.credits]), before);
    assert.equal(grants.length, 0); assert.equal(spoken.length, 1); assert.match(spoken[0].text, /tow.*whole load.*line and the tail/);
    f.load.pos.z = 100; f.tick(29); assert.equal(f.rock.data.oreHP, 600);
    f.load.pos.z = -80; f.tick(); f.load.pos.z = 100; f.tick(29); assert.equal(f.rock.data.oreHP, 600);
    f.tick(3); assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null); assert.ok(f.rock.data.oreHP < 600);
    assert.equal(f.worker.data.minerShiftRockId, f.rock.id); assert.equal(f.a.state, 'active');
  } finally { f.close(); }
});

test('a just-released original load keeps the beam down until its measured body clears', () => {
  const f = fixture(); try {
    f.tick(); f.cut(); f.load.pos.z = 0; f.tick(180);
    assert.ok(heliosCuttingCourtesyRead(f.s, f.worker)); assert.equal(f.rock.data.oreHP, 600);
    f.load.pos.z = 100; f.tick(32); assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null);
    const ore = f.rock.data.oreHP; f.load.pos.z = 0; f.tick();
    assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null, 'an unrelated loose body cannot start a new tow hold');
    assert.ok(f.rock.data.oreHP < ore);
  } finally { f.close(); }
});

test('changing and releasing a second tow cannot hide either observed original during one hold', () => {
  const f = fixture(); try {
    f.tick(); f.cut(); f.load.pos.z = 0; f.tick();
    const second = f.sim.spawn({ type: 'payload', pos: { x: 120, z: -70 }, radius: 4, mass: 8,
      hull: 40, hullMax: 40, physicsBody: { shape: 'ball', radius: 4, mass: 8, dynamic: true },
      homeSectorId: SECTOR, data: { tetherable: true, masslineTetherable: true } });
    const service = createAttachmentService({ state: f.s, bus: f.sim.bus, catalog: createCombatCatalog(),
      helpers: { combatPhysics: { createAttachment: () => 2, cutAttachment: () => true } } });
    const made = service.create({ defId: 'tether_standard', ownerId: f.p.id, targetId: second.id });
    assert.ok(made.ok, made.reason);
    f.s.player.tether = { active: true, targetId: second.id, attachmentId: made.attachment.id };
    f.tick(); second.pos.z = 100; f.tick(40);
    assert.equal(f.rock.data.oreHP, 600, 'clear new tow does not replace the blocked original');
    second.pos.z = 0; f.tick(); service.cut(made.attachment.id, f.p.id, 'tether_cut'); f.s.player.tether.active = false;
    f.load.pos.z = 100; f.tick(40);
    assert.equal(f.rock.data.oreHP, 600, 'clear old tow does not hide the second released original');
    second.pos.z = 100; f.tick(29); f.load.pos.z = 0; f.tick(); f.load.pos.z = 100; f.tick(29);
    assert.equal(f.rock.data.oreHP, 600, 'either original can re-enter during the same clearance grace');
    f.tick(3); assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null); assert.ok(f.rock.data.oreHP < 600);
  } finally { f.close(); }
});

test('rotated physical attachment anchors decide line-only crossing, not the hull-center chord', () => {
  for (const crosses of [false, true]) {
    const f = fixture(); try {
      f.p.pos.x = f.load.pos.x = crosses ? 250 : 100; f.p.rot = f.load.rot = Math.PI / 2;
      f.a.sourceAnchorLocal = f.a.targetAnchorLocal = { x: 0, z: crosses ? 150 : -150 };
      assert.equal(heliosCuttingCrossing(f.s, f.entry, f.worker, f.rock), crosses);
    } finally { f.close(); }
  }
});

test('the measured towed hull skin, not only its smaller gameplay radius, requests clearance', () => {
  const f = fixture(); try {
    f.load.type = 'ship'; f.load.data.defId = 'ship_wasp'; f.load.radius = 12;
    const measured = modelTruthPlanarRadius(f.load); assert.ok(measured > f.load.radius);
    f.load.pos.z = 8 + (measured + f.load.radius) / 2;
    assert.ok(heliosCuttingCrossing(f.s, f.entry, f.worker, f.rock));
    delete f.load.data.defId;
    assert.equal(heliosCuttingCrossing(f.s, f.entry, f.worker, f.rock), false);
  } finally { f.close(); }
});

test('unowned, stale, nonphysical, remote and invalid attachments cannot interrupt the cut', () => {
  for (const change of [f => f.s.player.tether.active = false, f => f.a.state = 'broken',
    f => f.a.ownerId = f.worker.id, f => f.a.ownerGeneration++, f => f.a.targetGeneration++,
    f => f.a.targetId = f.rock.id, f => f.a.id = 'wrong', f => f.a.defId = 'other',
    f => f.a.sourceAnchorLocal.x = NaN, f => f.a.targetAnchorLocal.z = NaN,
    f => f.p.rot = NaN, f => f.load.rot = NaN, f => f.load.pos.z = NaN,
    f => f.load.occupantGeneration = 0, f => f.load.alive = false, f => f.load.collides = false,
    f => f.load.physicsBody = false, f => f.load.type = 'beacon', f => f.load.homeSectorId = 'sector_ceres_belt',
    f => f.s.entities.delete(f.load.id), f => f.load.pos = { x: 100, z: 150 },
    f => f.p.pos.x = f.load.pos.x = 300, f => f.rock.pos.x = 1000]) {
    const f = fixture(); try { change(f); assert.equal(heliosCuttingCrossing(f.s, f.entry, f.worker, f.rock), false, String(change)); }
    finally { f.close(); }
  }
});

test('old load identity cannot extend a release hold after removal, replacement or a new life', () => {
  for (const change of [f => f.load.occupantGeneration++, f => f.load.alive = false,
    f => f.s.entities.delete(f.load.id), f => f.s.entities.set(f.load.id, { ...f.load }),
    f => f.load.homeSectorId = 'sector_ceres_belt']) {
    const f = fixture(); try {
      f.tick(); f.cut(); f.load.pos.z = 0; f.tick(); change(f); f.tick(32);
      assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null); assert.ok(f.rock.data.oreHP < 600);
    } finally { f.close(); }
  }
});

test('ordinary pause preserves observed loose loads but load/sector boundaries and new lives discard them', () => {
  for (const boundary of ['pause', 'save', 'sector', 'new-life', 'new-job']) {
    const f = fixture(); try {
      f.tick(); f.cut(); f.load.pos.z = 0; f.tick(60);
      f.sim.bus.emit('sim:pause'); f.sim.bus.emit('sim:pause');
      assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null, 'paused observation and voice are not live');
      if (boundary === 'save') f.sim.bus.emit('save:loaded');
      if (boundary === 'sector') f.sim.bus.emit('sector:exit');
      if (boundary === 'new-life') f.load.occupantGeneration++;
      if (boundary === 'new-job') f.entry.job = structuredClone(f.entry.job);
      f.tick(60);
      if (boundary === 'pause') {
        assert.ok(heliosCuttingCourtesyRead(f.s, f.worker)); assert.equal(f.rock.data.oreHP, 600);
        f.load.pos.z = 100; f.tick(32); assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null);
      } else {
        assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null); assert.ok(f.rock.data.oreHP < 600, boundary);
      }
    } finally { f.close(); }
  }
});

test('a new tow is checked afresh, and a stale voice is cancelled without spending its heard cooldown', () => {
  const f = fixture({ voice: true }); try {
    const spoken = []; f.sim.bus.on('voice:surface', e => { if (e.id?.startsWith('helios_cutting_courtesy:')) spoken.push(e); });
    f.sim.helpers.voice.say({ id: 'danger', channel: 'alert', text: 'Danger', ttl: 30 });
    f.tick(60); assert.equal(spoken.length, 0);
    f.load.pos.z = 100; f.tick(32); f.sim.helpers.voice.cancel('danger'); f.tick(); assert.equal(spoken.length, 0);
    f.load.pos.z = -80; f.tick(); assert.equal(spoken.length, 1);
    f.load.pos.z = 100; f.tick(32); f.load.pos.z = -80; f.tick(60); assert.equal(spoken.length, 1);
    f.sim.bus.emit('save:loaded'); assert.equal(heliosCuttingCourtesyRead(f.s, f.worker), null);
    f.tick(); assert.ok(heliosCuttingCourtesyRead(f.s, f.worker), 'current valid line geometry is observed again');
    const saved = JSON.stringify(f.jobs.serialize()); assert.doesNotMatch(saved, /"(?:tows|clearS|voiceId|generation)":/);
  } finally { f.close(); }
});

for (const release of [false, true]) test(`native Hitch latches with F, ${release ? 'releases the coasting' : 'tows the original'} load across the cut, and resumes the same finite face`, { timeout: 120000 }, async () => {
  const { bootRealPath, writeRealPathInput } = await import('../scripts/lib/bench/realPath.mjs');
  const { combat } = await import('../src/systems/combat.js');
  const { tetherGameplay } = await import('../src/systems/tetherGameplay.js');
  const { lineProgression } = await import('../src/systems/lineProgression.js');
  const h = await bootRealPath({ seed: 73319,
    systems: [npcJobsRuntime, mining, combat, tetherGameplay, lineProgression, 'aiPorts', 'flightV3', 'physics'],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 100, z: 100 }, rot: Math.PI / 2 }] });
  try {
    const s = h.state, p = h.player, jobs = h.runtime.getSystem('npcJobsRuntime');
    const { worker, rock, entry, load } = prepare(s, jobs, spec => h.runtime.spawn(spec), p);
    await h.runtime.getSystem('physics').prepareBackend(s);
    s.input.tetherMode = 'cursor'; s.input.aimIntentActive = true; s.input.aimWorld = { ...load.pos };
    s.input.actions.tetherFire = true; h.step(2); s.input.actions.tetherFire = false; h.step(2);
    assert.equal(s.player.tether.active, true); assert.equal(s.player.tether.targetId, load.id);
    const lineId = s.player.tether.attachmentId, start = { ...p.pos }, original = load, before = rock.data.oreHP;
    const impacts = [], grants = [];
    h.bus.on('physics:impact', e => { if ([e.aId, e.bId].some(id => [p.id, load.id, worker.id].includes(id))) impacts.push(e); });
    h.bus.on('economy:grantCredits', e => grants.push(e));
    let heldTicks = 0, lineOnlyTicks = 0, releasedTicks = 0, releasedAt = null, resumed = false;
    for (let i = 0; i < 60 * 90; i++) {
      const dx = 100 - p.pos.x, dz = 300 - p.pos.z, scale = Math.min(.5, 9 / Math.max(1, Math.hypot(dx, dz)));
      const ax = (dx * scale - p.vel.x) * .12, az = (dz * scale - p.vel.z) * .12, c = Math.cos(p.rot), sn = Math.sin(p.rot);
      writeRealPathInput(s, { moveZ: ax * c + az * sn, moveX: -ax * sn + az * c });
      if (release && releasedAt === null && load.pos.z > -8) {
        releasedAt = s.simTime; s.input.actions.massline = { cut: true };
      } else if (s.input.actions.massline) s.input.actions.massline.cut = false;
      const ore = rock.data.oreHP, progress = entry.job.progress; h.step(1);
      if (heliosCuttingCourtesyRead(s, worker)) {
        heldTicks++; if (Math.abs(p.pos.z) > 60 && Math.abs(load.pos.z) > 30) lineOnlyTicks++;
        if (releasedAt !== null && !s.player.tether.active) releasedTicks++;
        assert.equal(worker.data.minerShiftActive, false); assert.equal(rock.data.oreHP, ore); assert.equal(entry.job.progress, progress);
      } else if (heldTicks && worker.data.minerShiftActive) resumed = true;
      if (resumed && worker.data.minerShiftBeamS >= 5.95) break;
    }
    assert.ok(heldTicks > 60); assert.ok(lineOnlyTicks > 60); assert.equal(resumed, true);
    assert.equal(s.entities.get(load.id), original); assert.equal(load.alive, true);
    assert.equal(s.player.tether.active, !release);
    if (release) {
      assert.ok(releasedTicks > 60, 'real released body keeps its courtesy until clear');
      assert.equal(s.combat.attachments.byId[lineId].breakReason, 'tether_cut');
    } else assert.equal(s.player.tether.attachmentId, lineId);
    assert.ok(p.pos.z - start.z > 100); assert.ok(load.pos.z > 30);
    assert.ok(rock.data.oreHP < before); assert.equal(worker.data.minerShiftRockId, rock.id);
    assert.ok(worker.data.minerShiftBeamS <= 6.05); assert.equal(impacts.length, 0); assert.equal(grants.length, 0);
    assert.equal(h.proof().backend, 'rapier-dynamic');
    console.log('CUTTING_TOW_NATIVE', JSON.stringify({ release, heldTicks, lineOnlyTicks, releasedTicks, releasedAt, beamS: worker.data.minerShiftBeamS,
      playerTravel: p.pos.z - start.z, loadZ: load.pos.z, duration: s.simTime - 300, impacts: impacts.length, grants: grants.length }));
  } finally { h.runtime.getSystem('npcJobsRuntime')._cuttingCourtesyCleanup?.(); h.dispose(); }
});
