import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateEncounterShape } from '../src/data/encounters/shape.js';
import encounter, { encounterOrder, trigger } from '../src/data/encounters/372-second-rinse.js';
import { sectorMembershipAtGlobal } from '../src/data/sectorCoordinates.js';
import {
  SECOND_RINSE as C,
  blueSheetLocal,
  circleHitsPoly,
  localsToWorld,
  localToWorld,
  normalizeSecondRinse,
  pinCordLocal,
  polyGap,
  secondRinseBeat,
  secondRinsePicture,
  secondRinsePocket,
  secondRinseReach,
  secondRinseResolve,
  secondRinseSample,
  segmentsCross,
  whiteSheetLocal,
} from '../src/data/secondRinse.js';
import { secondRinse } from '../src/systems/secondRinse.js';
import { SHIPS } from '../src/data/ships.js';
import { buildLaneGeometry, LANE_HELIOS_CERES, LANE_CORRIDOR_RADIUS_WU } from '../src/data/travelLaneRoutes.js';

const ORIGIN = { x: 0, z: 0 };

function centroid(corners) {
  let x = 0;
  let z = 0;
  for (const p of corners) { x += p.x; z += p.z; }
  return { x: x / corners.length, z: z / corners.length };
}

function pinPoly() {
  const pin = pinCordLocal();
  const dx = pin.b.x - pin.a.x;
  const dz = pin.b.z - pin.a.z;
  const len = Math.hypot(dx, dz) || 1;
  const px = (-dz / len) * 0.05;
  const pz = (dx / len) * 0.05;
  return [
    { x: pin.a.x + px, z: pin.a.z + pz },
    { x: pin.b.x + px, z: pin.b.z + pz },
    { x: pin.b.x - px, z: pin.b.z - pz },
    { x: pin.a.x - px, z: pin.a.z - pz },
  ];
}

function segment(a, b, step) {
  const pts = [{ x: a.x, z: a.z }];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / step));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push({ x: a.x + dx * t, z: a.z + dz * t });
  }
  return pts;
}

function walk(points, radius) {
  const mem = normalizeSecondRinse(null);
  let prev = points[0];
  let wasOnBlue = false;
  let wasOnWhite = false;
  let inHail = Math.hypot(points[0].x, points[0].z) <= C.hailRadius;
  let hoverDwell = 0;
  let againAt = -1e9;
  const lines = [];
  const cues = [];
  for (let i = 1; i < points.length; i++) {
    const pos = points[i];
    const sample = secondRinseSample(ORIGIN, 0, pos, prev, radius, 0, mem.flag, false);
    sample.wasOnBlue = wasOnBlue;
    sample.wasOnWhite = wasOnWhite;
    const next = secondRinseBeat({
      flag: mem.flag, heard: mem.heard, inHail, hoverDwell, againAt,
    }, sample, 1 / 60);
    mem.flag = next.flag;
    inHail = next.inHail;
    hoverDwell = next.hoverDwell;
    againAt = next.againAt;
    if (next.line) lines.push(next.line);
    if (next.cue) cues.push(next.cue);
    wasOnBlue = sample.overlapsBlue;
    wasOnWhite = sample.overlapsWhite;
    prev = pos;
  }
  return { lines, cues, flag: mem.flag };
}

test('second rinse encounter shape is a civilian yard on the Helios lane', () => {
  validateEncounterShape(encounter.shape, encounter.id);
  assert.equal(encounterOrder, 372);
  assert.equal(trigger.id, 'second_rinse');
  assert.equal(encounter.id, 'second_rinse');
  assert.equal(encounter.noCombat, true);
  assert.equal(encounter.noCredits, true);
  assert.equal(encounter.shape.actor, 'faction_free');
  assert.equal(encounter.shape.situation, 'yard');
  assert.deepEqual([...encounter.shape.place], ['trade_lane']);
  assert.equal(encounter.squad, undefined);
  assert.equal(trigger.gates.externalOnly, true);
});

test('fair radius covers every catalog hull', () => {
  const widest = Math.max(...SHIPS.map((ship) => ship.collisionRadius || 0));
  assert.ok(C.fairRadius >= widest, `fair ${C.fairRadius} < widest hull ${widest}`);
});

test('the wash pocket sits off the freight chord, still in Helios', () => {
  const pocket = secondRinsePocket();
  const geometry = buildLaneGeometry(LANE_HELIOS_CERES);
  assert.ok(pocket);
  assert.ok(pocket.along > 1400);
  const alongPoint = {
    x: geometry.from.x + geometry.axis.x * pocket.along,
    z: geometry.from.z + geometry.axis.z * pocket.along,
  };
  const lateral = Math.hypot(pocket.x - alongPoint.x, pocket.z - alongPoint.z);
  assert.ok(lateral > LANE_CORRIDOR_RADIUS_WU);
  assert.equal(sectorMembershipAtGlobal(pocket), 'sector_helios_prime');
});

test('blue, white, and the pin stay more than two fair-radii apart through the whip', () => {
  const span = C.whipPeriod;
  const pin = pinPoly();
  const whites = [0, 1, 2].map((i) => whiteSheetLocal(i));
  for (let i = 0; i <= 12; i++) {
    const blue = blueSheetLocal((i / 12) * span, 'open');
    for (const corner of blue) {
      assert.ok(Math.hypot(corner.x, corner.z) > C.hullRadius + C.fairRadius, 'blue inside a fair hull of the kettle');
    }
    for (const sheet of whites) {
      assert.ok(polyGap(blue, sheet) > C.fairRadius * 2, 'blue meets a white sheet');
      for (const corner of sheet) {
        assert.ok(Math.hypot(corner.x, corner.z) > C.hullRadius + C.fairRadius);
      }
    }
    assert.ok(polyGap(blue, pin) > C.fairRadius * 2, 'blue meets the pin');
    for (const sheet of whites) assert.ok(polyGap(sheet, pin) > C.fairRadius * 2, 'a white meets the pin');
  }
  const cord = pinCordLocal();
  assert.ok(Math.hypot(cord.b.x - cord.a.x, cord.b.z - cord.a.z) > 8);
});

test('a fair hull can hail white, seat the blue sheet, or cut the pin, and only that', () => {
  const blue = centroid(blueSheetLocal(0, 'open'));
  const pin = pinCordLocal();
  const pinMid = { x: (pin.a.x + pin.b.x) / 2, z: (pin.a.z + pin.b.z) / 2 };
  for (const radius of [14, C.fairRadius]) {
    for (let i = 0; i < 3; i++) {
      const white = centroid(whiteSheetLocal(i));
      const hailed = walk(segment({ x: 500, z: white.z }, white, 2), radius);
      assert.deepEqual(hailed.lines, ['tuesday', 'white'], `white ${i} r=${radius} got ${hailed.lines}`);
      assert.equal(hailed.flag, 'open');
      assert.deepEqual(hailed.cues, []);
    }
    const seated = walk(segment({ x: -500, z: blue.z }, blue, 2), radius);
    assert.deepEqual(seated.lines, ['tuesday', 'boat', 'shut'], `blue r=${radius} got ${seated.lines}`);
    assert.equal(seated.flag, 'crooked');
    assert.deepEqual(seated.cues, ['clap']);
    const cut = walk(segment({ x: 500, z: pinMid.z }, pinMid, 2), radius);
    assert.deepEqual(cut.lines, ['tuesday', 'cut'], `pin r=${radius} got ${cut.lines}`);
    assert.equal(cut.flag, 'cut');
    assert.deepEqual(cut.cues, ['pin']);
  }
});

test('only a fresh overlap of the blue sheet seats it, and the cord wins the same tick', () => {
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: false, cordCut: false,
  }), 'crooked');
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: true, cordCut: false,
  }), null);
  assert.equal(secondRinseResolve('crooked', { overlapsBlue: true, wasOnBlue: false, cordCut: true }), null);
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: false, cordCut: true,
  }), 'cut');
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: false, wasOnBlue: false, cordCut: false, overlapsWhite: true, wasOnWhite: false,
  }), 'white');
  const pocket = secondRinsePocket();
  const corners = localsToWorld(pocket, pocket.rot, blueSheetLocal(0.2, 'open'));
  assert.equal(circleHitsPoly(corners[1].x, corners[1].z, 1, corners), true);
  const pin = pinCordLocal();
  const worldA = localsToWorld(pocket, pocket.rot, [pin.a])[0];
  const worldB = localsToWorld(pocket, pocket.rot, [pin.b])[0];
  const mid = { x: (worldA.x + worldB.x) / 2, z: (worldA.z + worldB.z) / 2 };
  const side = { x: -(worldB.z - worldA.z), z: worldB.x - worldA.x };
  const len = Math.hypot(side.x, side.z) || 1;
  assert.equal(segmentsCross(
    { x: mid.x + side.x / len, z: mid.z + side.z / len },
    { x: mid.x - side.x / len, z: mid.z - side.z / len },
    worldA,
    worldB,
  ), true);
});

test('hover is a linger beside the loose sheet, and leaving after a change files it once', () => {
  const heard = normalizeSecondRinse(null).heard;
  heard.tuesday = true;
  const near = {
    overlapsBlue: false, wasOnBlue: false, overlapsWhite: false, wasOnWhite: false,
    cordCut: false, nearBlue: true, inHail: true, simTime: 3,
  };
  let beat = secondRinseBeat({ flag: 'open', heard, inHail: true, hoverDwell: 0, againAt: -1e9 }, near, 0.2);
  assert.equal(beat.line, 'boat');
  assert.equal(beat.flag, 'open');
  beat = secondRinseBeat({ flag: 'open', heard, inHail: true, hoverDwell: beat.hoverDwell, againAt: -1e9 }, near, 0.4);
  assert.equal(beat.line, null);
  beat = secondRinseBeat({ flag: 'open', heard, inHail: true, hoverDwell: beat.hoverDwell, againAt: -1e9 }, near, 1);
  assert.equal(beat.line, 'hover');
  assert.equal(beat.flag, 'open');
  const left = secondRinseBeat({
    flag: 'crooked', heard, inHail: true, hoverDwell: 0, againAt: -1e9,
  }, { ...near, nearBlue: false, inHail: false, simTime: 9 }, 0.1);
  assert.equal(left.line, 'stay');
  const again = secondRinseBeat({
    flag: 'crooked', heard, inHail: false, hoverDwell: 0, againAt: -1e9,
  }, { ...near, nearBlue: false, inHail: true, simTime: 20 }, 0.1);
  assert.equal(again.line, 'crookedAgain');
});

test('reduced motion freezes the whip without moving the pin', () => {
  const pin = pinCordLocal();
  const mid = { x: (pin.a.x + pin.b.x) / 2, z: (pin.a.z + pin.b.z) / 2 };
  const prev = { x: mid.x + 8, z: mid.z };
  const live = secondRinseSample(ORIGIN, 0, mid, prev, 14, C.whipPeriod * 0.25, 'open', false);
  const still = secondRinseSample(ORIGIN, 0, mid, prev, 14, C.whipPeriod * 0.25, 'open', true);
  assert.equal(live.cordCut, true);
  assert.equal(still.cordCut, true);
  assert.equal(still.overlapsBlue, false);
  assert.equal(still.overlapsWhite, false);
  const swung = blueSheetLocal(C.whipPeriod * 0.25, 'open');
  const frozen = blueSheetLocal(0, 'open');
  assert.notEqual(swung[1].z, frozen[1].z);
  assert.deepEqual(blueSheetLocal(C.whipPeriod * 0.25, 'cut')[1], frozen[1]);
});

test('a hull cuts the pin without crossing its center, and the two endings stay different pictures', () => {
  const pin = pinCordLocal();
  const grazed = secondRinseSample(
    ORIGIN, 0,
    { x: pin.a.x + 12, z: pin.b.z + 4 },
    { x: pin.a.x + 12, z: pin.a.z - 4 },
    14, 0, 'open', false,
  );
  assert.equal(grazed.cordCut, true);
  assert.equal(grazed.overlapsBlue, false);
  assert.equal(grazed.overlapsWhite, false);
  const miss = secondRinseSample(
    ORIGIN, 0,
    { x: pin.a.x + 60, z: pin.b.z },
    { x: pin.a.x + 60, z: pin.a.z },
    14, 0, 'open', false,
  );
  assert.equal(miss.cordCut, false);
  const open = secondRinsePicture('open');
  const crooked = secondRinsePicture('crooked');
  const cut = secondRinsePicture('cut');
  assert.equal(open.blue && open.pin && open.whipping && !open.boatInverted, true);
  assert.equal(crooked.blue && crooked.pin && crooked.boatInverted && !crooked.whipping, true);
  assert.equal(cut.blue && !cut.pin && !cut.boatInverted && !cut.whipping, true);
  assert.equal(secondRinsePicture('salvage').flag, 'open');
});

test('the save flag only keeps open, crooked, or cut, plus which lines were heard', () => {
  assert.equal(normalizeSecondRinse({ flag: 'crooked', introduced: true }).flag, 'crooked');
  assert.equal(normalizeSecondRinse({ flag: 'cut' }).flag, 'cut');
  assert.equal(normalizeSecondRinse({ flag: 'salvage' }).flag, 'open');
  assert.equal(normalizeSecondRinse(null).flag, 'open');
  assert.equal(normalizeSecondRinse({ flag: 'open' }).introduced, false);
  const kept = normalizeSecondRinse({ flag: 'cut', heard: { white: true, stay: 1, cargo: true } });
  assert.equal(kept.heard.white, true);
  assert.equal(kept.heard.stay, true);
  assert.equal(kept.heard.tuesday, false);
  assert.equal(kept.heard.cargo, undefined);
  assert.equal(kept.revision, 2);
});

test('the skiff is pinned, unarmed, and the blue sheet seats on contact', () => {
  let nextId = 1;
  const entities = new Map();
  const entityList = [];
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 3,
    playerId: 1,
    entities,
    entityList,
    world: { currentSectorId: 'sector_helios_prime' },
    video: {},
    ui: {},
    run: { kind: 'adventure', phase: 'inactive' },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, radius: 14, type: 'ship' };
  entities.set(1, player);
  entityList.push(player);
  const said = [];
  const toasts = [];
  const cues = [];
  const bus = {
    on() { return () => {}; },
    emit(name, payload) {
      if (name === 'toast') toasts.push(payload.text);
      if (name === 'audio:cue') cues.push(payload.id);
    },
  };
  secondRinse.init({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        const actor = {
          ...spec,
          id: ++nextId,
          alive: true,
          pos: { ...spec.pos },
          vel: { x: 0, z: 0 },
          data: { ...spec.data },
          flags: { ...(spec.flags || {}) },
        };
        entities.set(actor.id, actor);
        entityList.push(actor);
        return actor;
      },
      removeEntity(id) {
        const actor = entities.get(id);
        if (actor) actor.alive = false;
      },
      voice: { say(payload) { said.push(payload); return true; } },
    },
  });
  try {
    const skiff = secondRinse.place();
    assert.ok(skiff);
    assert.equal(skiff.collides, false);
    assert.equal(skiff.physicsBody, false);
    assert.equal(skiff.flags.invuln, true);
    assert.deepEqual(skiff.data.weapons, []);
    assert.equal(skiff.data.callsign, 'HASP');
    assert.equal(skiff.data.visualRadius, secondRinseReach());
    assert.ok(skiff.data.visualRadius > C.fairRadius * 4);
    skiff.pos.x += 40;
    skiff.vel.x = 12;
    secondRinse.place();
    const pocket = secondRinsePocket();
    assert.equal(skiff.pos.x, pocket.x);
    assert.equal(skiff.pos.z, pocket.z);
    assert.equal(skiff.vel.x, 0);
    assert.equal(state.secondRinse.flag, 'open');
    const hit = centroid(localsToWorld(pocket, pocket.rot, blueSheetLocal(0, 'open')));
    player.pos.x = hit.x;
    player.pos.z = hit.z;
    secondRinse.update(1 / 60, state);
    assert.equal(state.secondRinse.flag, 'crooked');
    assert.ok(said.some((line) => line.channel === 'comms' && line.text.includes('upside down')));
    assert.equal(toasts.length, 0);
    secondRinse.helpers.voice.say = () => false;
    secondRinse._speak('stay');
    assert.ok(toasts.some((text) => text.includes('Concord')));
    assert.ok(cues.includes('sfx.secondRinse.clap'));
    assert.equal(cues.includes('sfx.secondRinse.pin'), false);
    const saved = secondRinse.serialize();
    assert.equal(saved.flag, 'crooked');
    assert.equal(saved.introduced, true);
    secondRinse.newGame();
    assert.equal(state.secondRinse.flag, 'open');
    assert.equal(saved.flag, 'crooked');
  } finally {
    secondRinse.destroy();
  }
});

test('reduce motion seats the still sheet, not the swing the picture hides', () => {
  let nextId = 1;
  const entities = new Map();
  const entityList = [];
  const state = {
    mode: 'flight',
    simTime: C.whipPeriod * 0.25,
    tick: 4,
    playerId: 1,
    entities,
    entityList,
    world: { currentSectorId: 'sector_helios_prime' },
    settings: { video: { motionReduce: true } },
    ui: {},
    run: { kind: 'adventure', phase: 'inactive' },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, radius: 14, type: 'ship' };
  entities.set(1, player);
  entityList.push(player);
  secondRinse.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: {
      spawnEntity(spec) {
        const actor = {
          ...spec,
          id: ++nextId,
          alive: true,
          pos: { ...spec.pos },
          vel: { x: 0, z: 0 },
          data: { ...spec.data },
          flags: { ...(spec.flags || {}) },
        };
        entities.set(actor.id, actor);
        entityList.push(actor);
        return actor;
      },
      removeEntity(id) {
        const actor = entities.get(id);
        if (actor) actor.alive = false;
      },
      voice: { say() { return true; } },
    },
  });
  try {
    const skiff = secondRinse.place();
    assert.ok(skiff);
    const pocket = secondRinsePocket();
    const swungCorners = localsToWorld(pocket, pocket.rot, blueSheetLocal(state.simTime, 'open'));
    const stillCorners = localsToWorld(pocket, pocket.rot, blueSheetLocal(0, 'open'));
    const miss = swungCorners.find((p) => !circleHitsPoly(p.x, p.z, 1, stillCorners));
    assert.ok(miss);
    player.radius = 1;
    player.pos.x = miss.x;
    player.pos.z = miss.z;
    secondRinse.update(1 / 60, state);
    assert.equal(state.secondRinse.flag, 'open');
    const still = centroid(stillCorners);
    player.radius = 14;
    player.pos.x = still.x;
    player.pos.z = still.z;
    secondRinse.update(1 / 60, state);
    assert.equal(state.secondRinse.flag, 'crooked');
  } finally {
    secondRinse.destroy();
  }
});

test('the drawn reach covers the buoy, the pin, and the whipping sheet', () => {
  const reach = secondRinseReach();
  assert.ok(reach > Math.hypot(C.buoy.x, C.buoy.z));
  assert.ok(reach > Math.hypot(C.pinA.x, C.pinA.z));
  for (let i = 0; i <= 8; i++) {
    for (const corner of blueSheetLocal((i / 8) * C.whipPeriod, 'open')) {
      assert.ok(Math.hypot(corner.x, corner.z) + 4 <= reach);
    }
  }
  blueSheetLocal(0, 'crooked').forEach((corner, index) => {
    const free = index === 1 || index === 2;
    const z = corner.z + (free ? C.seatSlide : 0);
    assert.ok(Math.hypot(corner.x, z) + 4 <= reach);
  });
});

test('a crossed pair has no gap, and reduced motion still cools the again line', () => {
  assert.equal(polyGap(
    [{ x: 0, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 2 }, { x: 0, z: 2 }],
    [{ x: 1, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 3 }, { x: 1, z: 3 }],
  ), 0);
  const heard = normalizeSecondRinse({ flag: 'crooked' }).heard;
  const first = secondRinseSample(ORIGIN, 0, { x: 80, z: 0 }, { x: 80, z: 0 }, 14, 5, 'crooked', true);
  const later = secondRinseSample(ORIGIN, 0, { x: 80, z: 0 }, { x: 80, z: 0 }, 14, 20, 'crooked', true);
  assert.equal(first.simTime, 0);
  assert.equal(first.clock, 5);
  assert.equal(later.clock, 20);
  let beat = secondRinseBeat({ flag: 'crooked', heard, inHail: false, hoverDwell: 0, againAt: -1e9 }, first, 0.1);
  assert.equal(beat.line, 'crookedAgain');
  beat = secondRinseBeat({
    flag: 'crooked', heard, inHail: false, hoverDwell: 0, againAt: beat.againAt,
  }, later, 0.1);
  assert.equal(beat.line, 'crookedAgain');
});

test('a dock or a teleport does not cut the pin with the chord it skipped', () => {
  let nextId = 1;
  const entities = new Map();
  const entityList = [];
  const state = {
    mode: 'flight',
    simTime: 2,
    tick: 1,
    playerId: 1,
    entities,
    entityList,
    world: { currentSectorId: 'sector_helios_prime' },
    settings: { video: {} },
    ui: {},
    run: { kind: 'adventure', phase: 'inactive' },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, radius: 14, type: 'ship' };
  entities.set(1, player);
  entityList.push(player);
  secondRinse.init({
    state,
    bus: { on() { return () => {}; }, emit() {} },
    helpers: {
      spawnEntity(spec) {
        const actor = {
          ...spec,
          id: ++nextId,
          alive: true,
          pos: { ...spec.pos },
          vel: { x: 0, z: 0 },
          data: { ...spec.data },
          flags: { ...(spec.flags || {}) },
        };
        entities.set(actor.id, actor);
        entityList.push(actor);
        return actor;
      },
      removeEntity(id) {
        const actor = entities.get(id);
        if (actor) actor.alive = false;
      },
      voice: { say() { return true; } },
    },
  });
  try {
    const skiff = secondRinse.place();
    const pocket = secondRinsePocket();
    const pin = pinCordLocal();
    const worldA = localToWorld(pocket, pocket.rot, pin.a);
    const worldB = localToWorld(pocket, pocket.rot, pin.b);
    const mid = { x: (worldA.x + worldB.x) / 2, z: (worldA.z + worldB.z) / 2 };
    const side = { x: -(worldB.z - worldA.z), z: worldB.x - worldA.x };
    const len = Math.hypot(side.x, side.z) || 1;
    player.pos.x = mid.x + (side.x / len) * 80;
    player.pos.z = mid.z + (side.z / len) * 80;
    secondRinse.update(1 / 60, state);
    assert.equal(state.secondRinse.flag, 'open');
    state.ui.docked = true;
    secondRinse.update(1 / 60, state);
    state.ui.docked = false;
    player.pos.x = mid.x - (side.x / len) * 80;
    player.pos.z = mid.z - (side.z / len) * 80;
    secondRinse.update(1 / 60, state);
    assert.equal(state.secondRinse.flag, 'open');
    assert.equal(skiff.alive !== false, true);
  } finally {
    secondRinse.destroy();
  }
});

test('sim modules do not import three', () => {
  const data = readFileSync(new URL('../src/data/secondRinse.js', import.meta.url), 'utf8');
  const system = readFileSync(new URL('../src/systems/secondRinse.js', import.meta.url), 'utf8');
  const imported = /from ['"]three['"]/;
  assert.equal(imported.test(data), false);
  assert.equal(imported.test(system), false);
});
