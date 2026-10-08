import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTORS } from '../src/data/sectors.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { BOLUS_FORCES as F } from '../src/data/bolusForces.js';
import {
  BOLUS_PALETTE,
  BOLUS_SECTOR_ID,
  planBolusLayout,
  bolusIrisOpenAmount,
} from '../src/data/theBolus.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { tickBolus } from '../src/systems/theBolus.js';
import { bolusCableStyle } from '../src/render/bolusCable.js';
import {
  acidNormal,
  acidScroll,
  auditCough,
  auditFarBank,
  auditMouth,
  auditNearBank,
  baleenPitch,
  bboxOf,
  boundaryLoopCount,
  buildBolusCanal,
  ciliaCards,
  ciliaLean,
  coughLips,
  farBankCrest,
  flatnessRatio,
  irisBlades,
  irisHoleAcross,
  lumenGrid,
  mouthLip,
  nearBankCrest,
  ribRadial,
  spherePart,
  BOLUS_LANTERN_SHAFTS,
  BOLUS_CANAL_COLORS,
} from '../src/render/bolusCanal.js';
import {
  bolusSilhouette,
  bolusSilhouetteIds,
  colorChannelMax,
  partCentroid,
} from '../src/render/bolusSilhouettes.js';

test('canal crest, lip, and cough are not a tube and not a sphere', () => {
  const near = nearBankCrest(4);
  const far = farBankCrest(4);
  const mouth = mouthLip();
  const cough = coughLips();
  assert.equal(auditNearBank(near).ok, true, auditNearBank(near).issues.join(','));
  assert.equal(auditFarBank(far, near).ok, true, auditFarBank(far, near).issues.join(','));
  assert.equal(auditMouth(mouth).ok, true, auditMouth(mouth).issues.join(','));
  assert.equal(auditCough(cough.flaps).ok, true, auditCough(cough.flaps).issues.join(','));
  assert.equal(near.color, BOLUS_CANAL_COLORS.bank);
  assert.equal(mouth.color, BOLUS_CANAL_COLORS.mouth);
  assert.equal(cough.flaps[0].color, BOLUS_CANAL_COLORS.coughCrease);
  assert.equal(cough.flaps[1].color, BOLUS_CANAL_COLORS.coughLip);
  assert.equal(boundaryLoopCount(mouth.indices), 2);
  const sphere = spherePart();
  assert.equal(auditNearBank(sphere).ok, false);
  assert.equal(auditMouth(sphere).ok, false);
  assert.equal(auditCough([sphere, sphere]).ok, false);
});

test('seeds move ribs, not the gates', () => {
  const a = buildBolusCanal(3);
  const b = buildBolusCanal(9);
  const rib = (canal) => canal.parts.find((row) => row.id === 'rib_0').positions;
  assert.notDeepEqual(rib(a), rib(b));
  const zOf = (canal) => canal.parts.find((row) => row.id === 'mouth_lip').positions.filter((_, i) => i % 3 === 2);
  assert.deepEqual(zOf(a), zOf(b));
  assert.ok(zOf(a).every((z) => z === -2624));
  const cough = coughLips();
  assert.equal(cough.anchor.x, 2347);
  assert.equal(cough.anchor.z, 1173);
});

test('iris, acid, lumen, shafts, and pose hooks', () => {
  assert.equal(bolusIrisOpenAmount(0), 0);
  assert.equal(bolusIrisOpenAmount(3), 1);
  assert.equal(bolusIrisOpenAmount(8), 0);
  assert.equal(irisBlades(0).length, 12);
  assert.ok(irisHoleAcross(0) <= 40);
  assert.ok(irisHoleAcross(1) > 200);
  const lumen = lumenGrid();
  for (let i = 0; i < lumen.positions.length; i += 3) {
    assert.ok(lumen.positions[i] >= 200 && lumen.positions[i] <= 700);
  }
  const n = acidNormal();
  assert.ok(Math.abs(Math.atan2(n.z, n.y) - (12 * Math.PI) / 180) < 1e-6);
  assert.equal(acidScroll(2, true, 5), 5);
  assert.notEqual(acidScroll(2, false, 5), 5);
  assert.equal(ciliaLean(0, false), 0);
  assert.ok(Math.abs(ciliaLean(1 / 6, true) - (18 * Math.PI) / 180) < 1e-6);
  assert.equal(baleenPitch(false), 0);
  assert.ok(Math.abs(baleenPitch(true) + (25 * Math.PI) / 180) < 1e-6);
  assert.equal(ribRadial(true, true), 0);
  assert.equal(ribRadial(true, false), 48);
  assert.equal(ribRadial(false, false), 0);
  assert.equal(BOLUS_LANTERN_SHAFTS.length, 5);
  assert.ok(ciliaCards().length >= 20);
  const canal = buildBolusCanal(1);
  assert.ok(canal.parts.some((row) => row.id === 'shelf' && row.color === BOLUS_CANAL_COLORS.shelf));
  assert.ok(canal.parts.some((row) => row.id === 'acid' && row.color === BOLUS_CANAL_COLORS.acid));
  assert.ok(canal.parts.some((row) => row.id === 'station_collar'));
  assert.ok(canal.parts.some((row) => row.id === 'buoy_cage'));
  assert.ok(flatnessRatio(coughLips().flaps[0].positions) < 0.2);
});

test('silhouettes are a family, not one ball', () => {
  const ids = bolusSilhouetteIds();
  for (const id of Object.keys(FAUNA_SPECIES)) {
    if (!id.startsWith('bolus_')) continue;
    assert.ok(ids.includes(id), id);
    const recipe = bolusSilhouette(id);
    assert.ok(recipe.parts.length > 0);
    assert.ok(recipe.parts.some((part) => part.tissue));
    const box = bboxOf(recipe.parts.flatMap((part) => part.positions));
    const dims = [box.dx, box.dy, box.dz].sort((a, b) => a - b);
    assert.ok(dims[2] / Math.max(dims[0], 1e-4) > 1.6, id);
  }
  const knob = bolusSilhouette('bolus_knob');
  const tendon = bolusSilhouette('bolus_tendon');
  const tooth = bolusSilhouette('bolus_tooth');
  const suture = bolusSilhouette('bolus_suture');
  assert.notDeepEqual(knob, tendon);
  assert.notDeepEqual(knob, tooth);
  assert.notDeepEqual(tendon, suture);
  assert.ok(knob.parts.some((part) => part.id.includes('bulb')));
  assert.ok(tendon.parts.every((part) => !part.id.includes('bulb')));
  assert.equal(tendon.parts.length, 1);
  const barb = tooth.parts.find((part) => part.id.includes('barb'));
  assert.ok(partCentroid(barb).x > 0);
  assert.ok(colorChannelMax(tendon.parts[0].color) <= 0.45);
  assert.equal(suture.parts[0].color, 0xf4f1ea);
  assert.ok(colorChannelMax(suture.parts[0].color) >= 0.9);
  assert.ok(suture.parts.every((part) => part.tissue));
  const forks = bolusSilhouette('bolus_tendril').parts.filter((part) => part.id.startsWith('fork_'));
  assert.equal(forks.length, 2);
  const gap = Math.hypot(
    partCentroid(forks[0]).x - partCentroid(forks[1]).x,
    partCentroid(forks[0]).y - partCentroid(forks[1]).y,
    partCentroid(forks[0]).z - partCentroid(forks[1]).z,
  );
  assert.ok(gap > 0.5);
  const louse = bboxOf(bolusSilhouette('bolus_louse').parts[0].positions);
  const mite = bboxOf(bolusSilhouette('bolus_mite').parts[0].positions);
  assert.ok(Math.hypot(mite.dx, mite.dy, mite.dz) < Math.hypot(louse.dx, louse.dy, louse.dz));
  assert.ok(louse.dy < louse.dx * 0.3);
  const sliver = bboxOf(bolusSilhouette('bolus_fingerling').parts[0].positions);
  assert.ok(sliver.dx > sliver.dy * 3);
  const ring = bolusSilhouette('bolus_ring').parts[0];
  let minR = Infinity;
  for (let i = 0; i < ring.positions.length; i += 3) {
    minR = Math.min(minR, Math.hypot(ring.positions[i], ring.positions[i + 1], ring.positions[i + 2]));
  }
  assert.ok(minR > 0.4);
  const plates = bolusSilhouette('bolus_hauler').parts.filter((part) => part.id.startsWith('plate_'));
  const angles = plates.map((part) => Math.atan2(partCentroid(part).z, partCentroid(part).x)).sort((a, b) => a - b);
  const gaps = angles.map((angle, i) => {
    const next = angles[(i + 1) % angles.length] + (i + 1 === angles.length ? Math.PI * 2 : 0);
    return next - angle;
  });
  assert.ok(Math.max(...gaps) > Math.min(...gaps) * 2);
  const base = bolusSilhouette('bolus_louse');
  const stopped = bolusSilhouette('bolus_louse', { stopped: true });
  assert.equal(stopped.parts.length, base.parts.length + 2);
  assert.equal(bolusSilhouette('bolus_fingerling', { stopped: true }).parts.length, bolusSilhouette('bolus_fingerling').parts.length + 2);
  assert.equal(bolusSilhouette('bolus_mite', { stopped: true }).parts.length, bolusSilhouette('bolus_mite').parts.length + 2);
  assert.equal(bolusSilhouette('bolus_knob', { stopped: true }).parts.length, knob.parts.length);
  const lanternIds = new Set(bolusSilhouette('bolus_lantern').parts.map((part) => part.id));
  const blister = bolusSilhouette('bolus_blister');
  for (const id of lanternIds) assert.ok(blister.parts.some((part) => part.id === id));
  assert.equal(blister.parts.length, lanternIds.size + 1);
  const floaterIds = new Set(bolusSilhouette('bolus_floater').parts.map((part) => part.id));
  const cyst = bolusSilhouette('bolus_cyst');
  assert.equal(cyst.parts.length, floaterIds.size + 1);
  const bezoarIds = new Set(bolusSilhouette('bolus_bezoar').parts.map((part) => part.id));
  assert.equal(bolusSilhouette('bolus_concretion').parts.length, bezoarIds.size + 1);
});

test('cable style is the existing line', () => {
  const slack = bolusCableStyle({ playerId: 'p', player: { tether: { phase: 'loaded' } }, combat: { attachments: { byId: {} } }, entityList: [] });
  assert.equal(slack.sag, 42);
  assert.equal(slack.width, 0.8);
  const held = cableState(0.2);
  assert.equal(bolusCableStyle(held).sag, 18);
  assert.equal(bolusCableStyle(held).width, 1.2);
  held.entityList[0].data.bolus.hold = 0.4;
  const taut = bolusCableStyle(held);
  assert.equal(taut.sag, 0);
  assert.equal(taut.width, 2.4);
  assert.equal(taut.tint, 0xf7f4ee);
});

function cableState(hold) {
  return {
    playerId: 'p',
    player: { tether: { phase: 'loaded' } },
    combat: { attachments: { byId: { a: { state: 'active', ownerId: 'p', targetId: 'u' } } } },
    entityList: [{ id: 'u', data: { bolus: { role: 'uvula', hold } } }],
  };
}

function worldFor(player, fauna, simTime = 0) {
  const state = {
    simTime,
    playerId: 'p',
    player: { tether: { phase: 'idle' }, cargo: { items: {}, capVolume: 100, usedVolume: 0, usedMass: 0 } },
    world: { currentSectorId: BOLUS_SECTOR_ID },
    entities: new Map([['p', player]]),
    entityList: fauna.slice(),
    combat: { attachments: { byId: {} } },
  };
  player.id = 'p';
  ensureAlienEcologyState(state);
  const events = [];
  return {
    state,
    events,
    world: {
      state,
      bus: { emit(name, payload) { events.push({ name, payload }); } },
      _sectorOrigin() { return { x: 0, z: 0 }; },
    },
  };
}

function pilot(x, z, vx = 0, vz = 0) {
  return {
    pos: { x, y: 0, z },
    vel: { x: vx, y: 0, z: vz },
    rot: 0,
    alive: true,
    hull: 80,
    hullMax: 80,
    shield: 0,
    flags: {},
  };
}

function fauna(role, key, x, z, extra) {
  return {
    id: key,
    alive: true,
    pos: { x, y: 0, z },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
    homeSectorId: BOLUS_SECTOR_ID,
    physicsBody: { dynamic: true, mass: 40, radius: 8 },
    data: {
      bolus: { role, key, anchorX: x, anchorZ: z, phase: 0, hold: 0, spent: false, ...(extra || {}) },
      ecology: { speciesId: `bolus_${role}` },
    },
  };
}

function hold(bag, ent) {
  bag.state.player.tether.phase = 'loaded';
  bag.state.combat.attachments.byId.line = { state: 'active', ownerId: 'p', targetId: ent.id };
}

function step(bag, dt = 0.1) {
  tickBolus(bag.world, dt);
  const vel = bag.state.entities.get('p').vel;
  const pos = bag.state.entities.get('p').pos;
  pos.x += vel.x * dt;
  pos.z += vel.z * dt;
}

test('tooth, iris, crest, baleen, glove, uvula, pleat', () => {
  const tooth = fauna('tooth', 'bolus_tooth', -180, -220);
  const bag = worldFor(pilot(-180, -220), [tooth]);
  hold(bag, tooth);
  for (let n = 0; n < 24; n++) {
    bag.state.simTime = n * 0.1;
    step(bag);
  }
  assert.ok(bag.state.entities.get('p').pos.x >= 200, `tooth reach ${bag.state.entities.get('p').pos.x}`);

  const sour = fauna('tooth', 'bolus_tooth', -180, -220);
  const papilla = worldFor(pilot(-180, -220), [sour]);
  hold(papilla, sour);
  ensureAlienEcologyState(papilla.state).sectorFlags['bolus:papilla'] = true;
  for (let n = 0; n < 30; n++) {
    papilla.state.simTime = n * 0.1;
    step(papilla);
  }
  assert.ok(papilla.state.entities.get('p').pos.x < 200);

  const iris = worldFor(pilot(0, 400), []);
  tickBolus(iris.world, 0.1);
  assert.equal(iris.state.entities.get('p').vel.z, -48);
  tickBolus(iris.world, 0.1);
  assert.equal(iris.state.entities.get('p').vel.z, -48);
  assert.ok(iris.events.some((event) => event.payload && event.payload.id === 'bolus_iris'));

  const hush = worldFor(pilot(0, 400), []);
  ensureAlienEcologyState(hush.state).sectorFlags['bolus:hushUntil'] = 100;
  tickBolus(hush.world, 0.1);
  assert.equal(hush.state.entities.get('p').vel.z, 0);

  const open = worldFor(pilot(0, 400), []);
  open.state.simTime = 3;
  tickBolus(open.world, 0.1);
  assert.equal(open.state.entities.get('p').vel.z, 0);

  const crest = worldFor(pilot(0, 0), []);
  tickBolus(crest.world, 0.1);
  assert.equal(crest.state.entities.get('p').vel.z, 0);
  crest.state.simTime = 12;
  tickBolus(crest.world, 0.1);
  assert.equal(crest.state.entities.get('p').vel.z, 46);
  assert.ok(crest.events.some((event) => event.payload && event.payload.id === 'bolus_crest'));

  const tendon = fauna('tendon', 'bolus_tendon', -700, -40);
  const stall = worldFor(pilot(0, 0), [tendon]);
  tickBolus(stall.world, 0.1);
  stall.state.simTime = 11;
  hold(stall, tendon);
  tickBolus(stall.world, 0.1);
  stall.state.simTime = 12;
  tickBolus(stall.world, 0.1);
  assert.equal(stall.state.entities.get('p').vel.z, 0);
  stall.state.player.tether.phase = 'idle';
  stall.state.simTime = 24;
  tickBolus(stall.world, 0.1);
  assert.equal(stall.state.entities.get('p').vel.z, 46);
  stall.state.simTime = 25;
  hold(stall, tendon);
  tickBolus(stall.world, 0.1);
  stall.state.simTime = 36;
  tickBolus(stall.world, 0.1);
  assert.equal(stall.state.entities.get('p').vel.z, 46);

  const baleen = fauna('baleen', 'bolus_baleen', -700, -1600);
  const fast = worldFor(pilot(-700, -1600, 0, 55), [baleen]);
  fast.state.entities.get('p').flags.boosting = true;
  tickBolus(fast.world, 0.1);
  assert.ok(Math.hypot(fast.state.entities.get('p').vel.x, fast.state.entities.get('p').vel.z) < F.limp);
  const after = fast.state.entities.get('p').vel.z;
  tickBolus(fast.world, 0.1);
  assert.equal(fast.state.entities.get('p').vel.z, after);

  const limp = worldFor(pilot(-700, -1600, 0, 10), [fauna('baleen', 'bolus_baleen', -700, -1600)]);
  tickBolus(limp.world, 0.1);
  assert.equal(limp.state.entities.get('p').vel.z, 10);

  const glove = fauna('glove', 'bolus_glove', -200, -2400);
  const nudge = worldFor(pilot(-200, -2300, 0, 4), [glove]);
  tickBolus(nudge.world, 0.1);
  const once = Math.hypot(nudge.state.entities.get('p').vel.x, nudge.state.entities.get('p').vel.z);
  tickBolus(nudge.world, 0.1);
  assert.ok(Math.abs(once - Math.hypot(nudge.state.entities.get('p').vel.x, nudge.state.entities.get('p').vel.z)) < 1e-6);
  assert.ok(once > 20);
  assert.equal(glove.data.bolus.gloveHot, true);
  assert.equal(ensureAlienEcologyState(nudge.state).sectorFlags['bolus:gloveHot'], undefined);

  const dead = worldFor(pilot(-200, -2300, 30, 0), [fauna('glove', 'bolus_glove', -200, -2400)]);
  tickBolus(dead.world, 0.1);
  assert.equal(dead.state.entities.get('p').vel.x, 30);
  assert.equal(dead.state.entities.get('p').vel.z, 0);

  const frenum = worldFor(pilot(-200, -2200, 55, 0), [fauna('glove', 'bolus_glove', -200, -2400)]);
  ensureAlienEcologyState(frenum.state).sectorFlags['bolus:frenumUntil'] = 100;
  tickBolus(frenum.world, 0.1);
  assert.equal(frenum.state.entities.get('p').vel.z, 0);

  const yank = worldFor(pilot(-200, -2200, 55, 0), [fauna('glove', 'bolus_glove', -200, -2400)]);
  tickBolus(yank.world, 0.1);
  assert.ok(yank.state.entities.get('p').vel.z < -40);

  const uvula = fauna('uvula', 'bolus_uvula', -40, 880);
  const seek = worldFor(pilot(0, 880), [uvula]);
  hold(seek, uvula);
  for (let n = 0; n < 4; n++) tickBolus(seek.world, 0.1);
  assert.equal(seek.state.entities.get('p').vel.x, -180);
  seek.state.player.tether.phase = 'idle';
  tickBolus(seek.world, 0.1);
  assert.equal(seek.state.entities.get('p').vel.x, 0);

  const pleat = fauna('pleat', 'bolus_pleat', -240, 1280);
  const cough = worldFor(pilot(0, 0), [pleat]);
  hold(cough, pleat);
  for (let n = 0; n < 5; n++) tickBolus(cough.world, 0.1);
  assert.equal(cough.state.entities.get('p').vel.z, 64);
  tickBolus(cough.world, 0.1);
  assert.equal(cough.state.entities.get('p').vel.z, 64);
});

test('loose throw, cone freeze, drum delay, unlatched lane', () => {
  const drum = fauna('drum', 'bolus_drum_0', 300, -800);
  const loose = worldFor(pilot(0, 0), [drum]);
  hold(loose, drum);
  tickBolus(loose.world, 0.1);
  loose.state.player.tether.phase = 'idle';
  drum.vel.x = 9;
  drum.vel.z = 4;
  tickBolus(loose.world, 0.1);
  assert.equal(drum.vel.x, 9);
  assert.equal(drum.vel.z, 4);
  assert.ok(ensureAlienEcologyState(loose.state).sectorFlags['bolus:loose:bolus_drum_0'] > loose.state.simTime);

  const louse = fauna('louse', 'bolus_louse_0', 100, 0);
  const cone = worldFor(pilot(0, 0), [louse]);
  tickBolus(cone.world, 0.1);
  assert.equal(louse.vel.x, 0);
  assert.equal(louse.vel.z, 0);
  assert.equal(louse.physicsBody.dynamic, true);
  assert.ok(cone.events.some((event) => event.payload && event.payload.id === 'bolus_freeze'));

  const drum2 = fauna('drum', 'bolus_drum_1', 300, -700);
  const chase = worldFor(pilot(300, -600, 60, 0), [drum2]);
  for (let n = 0; n < 19; n++) {
    chase.state.simTime = n * 0.1;
    tickBolus(chase.world, 0.1);
    assert.ok(Math.abs(Math.hypot(drum2.vel.x, drum2.vel.z) - 28) < 1e-6);
  }
  chase.state.simTime = 1.9;
  tickBolus(chase.world, 0.1);
  assert.ok(Math.abs(Math.hypot(drum2.vel.x, drum2.vel.z) - 62) < 1e-6);

  const lane = worldFor(pilot(-960, -2624), []);
  const player = lane.state.entities.get('p');
  let open = false;
  let shut = false;
  let acid = 0;
  let guard = 0;
  while (player.pos.z < 1173 && guard < 4000) {
    lane.state.simTime = guard * 0.1;
    const before = player.hull;
    tickBolus(lane.world, 0.1);
    if (player.hull < before) acid += 1;
    player.pos.x += player.vel.x * 0.1;
    player.pos.z += player.vel.z * 0.1;
    assert.ok(player.pos.x >= -1100 && player.pos.x <= -820, `lane x ${player.pos.x}`);
    const m = lane.state.simTime % 20;
    if (m >= 2 && m < 8) open = true;
    else shut = true;
    guard += 1;
  }
  assert.ok(player.pos.z >= 1173);
  assert.equal(acid, 0);
  assert.equal(open, true);
  assert.equal(shut, true);
  assert.equal(player.flags.boosting, undefined);
});

test('the cut keeps the doc 16 room', () => {
  assert.equal(F.acidDps, 2);
  assert.equal(BOLUS_PALETTE.fogDensity, 0.0022);
  assert.equal(BOLUS_PALETTE.fog, 0x14060a);
  assert.equal(planBolusLayout(1).length, 89);
  const bolus = SECTORS.find((sector) => sector.id === BOLUS_SECTOR_ID);
  assert.equal(bolus.interiorHost, true);
  for (const id of ['bolus_latch', 'bolus_freeze', 'bolus_iris', 'bolus_crest']) {
    assert.ok(RECIPES.some((recipe) => recipe.id === id), id);
  }
  const files = [
    'src/render/bolusCanal.js',
    'src/render/bolusSilhouettes.js',
    'src/render/bolusView.js',
    'src/render/bolusCable.js',
    'src/data/bolusForces.js',
    'src/data/bolusAudio.js',
    'src/systems/theBolus.js',
    'src/data/theBolus.js',
  ];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(/\bMath\.random\s*\(/.test(text), false, file);
  }
  const view = readFileSync(new URL('../src/render/bolusView.js', import.meta.url), 'utf8');
  assert.equal(/\bcamera\s*\./.test(view), false);
  assert.equal(view.includes('cam.position'), false);
  assert.equal(view.includes('THREE.Line'), false);
});
