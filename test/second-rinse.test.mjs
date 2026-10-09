import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateEncounterShape } from '../src/data/encounters/shape.js';
import encounter, { encounterOrder, trigger } from '../src/data/encounters/567-second-rinse.js';
import { sectorMembershipAtGlobal } from '../src/data/sectorCoordinates.js';
import {
  SECOND_RINSE as C,
  blueSheetLocal,
  circleHitsPoly,
  localsToWorld,
  normalizeSecondRinse,
  pinCordLocal,
  secondRinsePocket,
  secondRinseResolve,
  segmentsCross,
} from '../src/data/secondRinse.js';
import { buildLaneGeometry, LANE_HELIOS_CERES, LANE_CORRIDOR_RADIUS_WU } from '../src/data/travelLaneRoutes.js';
import { secondRinse } from '../src/systems/secondRinse.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { localToWorld } from '../src/data/secondRinse.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import * as THREE from 'three';
import { createSecondRinseVisualDriver } from '../src/render/secondRinseVisuals.js';

function fixture() {
  const bus = createBus(), voices = [];
  const state = { mode: 'flight', timeScale: 1, simTime: 0, tick: 0, run: { kind: 'adventure' },
    world: { currentSectorId: C.sectorId }, playerId: 1, entities: new Map(), entityList: [] };
  let nextId = 1;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: nextId++ }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(id) { const e = state.entities.get(id); if (e) { e.alive = false; state.entities.delete(id); } },
    voice: { say(p) { voices.push(p); return true; } },
  };
  const player = helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8 });
  const system = Object.create(secondRinse);
  system.init({ state, bus, helpers });
  const skiff = system.place();
  const at = (x, z) => { Object.assign(player.pos, localToWorld(skiff.pos, skiff.rot, { x, z })); };
  const step = () => { state.simTime += 1 / 60; state.tick++; system.update(1 / 60, state); };
  return { state, bus, player, skiff, system, voices, at, step };
}

test('second rinse encounter shape is a civilian yard on the Helios lane', () => {
  validateEncounterShape(encounter.shape, encounter.id);
  assert.equal(encounterOrder, 567);
  assert.equal(trigger.id, 'second_rinse');
  assert.equal(encounter.id, 'second_rinse');
  assert.equal(encounter.noCombat, true);
  assert.equal(encounter.noCredits, true);
  assert.equal(encounter.shape.actor, 'faction_free');
  assert.equal(encounter.shape.situation, 'yard');
  assert.deepEqual([...encounter.shape.place], ['trade_lane']);
  assert.equal(encounter.squad, undefined);
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

test('the blue sheet never enters the kettle radius', () => {
  for (const t of [0, 0.4, 0.9, 1.4, 2.1]) {
    for (const corner of blueSheetLocal(t, 'open')) {
      assert.ok(Math.hypot(corner.x, corner.z) > C.hullRadius, `corner inside hull at t=${t}`);
    }
  }
  const pin = pinCordLocal();
  assert.ok(Math.hypot(pin.b.x, pin.b.z) - Math.hypot(pin.a.x, pin.a.z) > 3);
});

test('only a fresh overlap of the blue sheet seats it', () => {
  const pocket = secondRinsePocket();
  const corners = localsToWorld(pocket, pocket.rot, blueSheetLocal(0.2, 'open'));
  const hit = corners[1];
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: false, cordCut: false,
  }), 'crooked');
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: true, cordCut: false,
  }), null);
  assert.equal(circleHitsPoly(hit.x, hit.z, 1, corners), true);
  assert.equal(secondRinseResolve('crooked', { overlapsBlue: true, wasOnBlue: false }), null);
});

test('crossing the pin-cord cuts, and the cord wins over a clap', () => {
  const pin = pinCordLocal();
  const worldA = { x: pin.a.x, z: pin.a.z };
  const worldB = { x: pin.b.x, z: pin.b.z };
  assert.equal(segmentsCross(
    { x: -1, z: pin.a.z + 2 },
    { x: 1, z: pin.a.z + 2 },
    worldA,
    worldB,
  ), true);
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: true, wasOnBlue: false, cordCut: true,
  }), 'cut');
  assert.equal(secondRinseResolve('open', {
    overlapsBlue: false, wasOnBlue: false, cordCut: false, overlapsWhite: true, wasOnWhite: false,
  }), 'white');
});

test('the save flag only keeps open, crooked, or cut', () => {
  assert.equal(normalizeSecondRinse({ flag: 'crooked', introduced: true }).flag, 'crooked');
  assert.equal(normalizeSecondRinse({ flag: 'cut' }).flag, 'cut');
  assert.equal(normalizeSecondRinse({ flag: 'salvage' }).flag, 'open');
  assert.equal(normalizeSecondRinse(null).flag, 'open');
  assert.equal(normalizeSecondRinse({ flag: 'open' }).introduced, false);
});

test('sim modules do not import three', () => {
  const data = readFileSync(new URL('../src/data/secondRinse.js', import.meta.url), 'utf8');
  const system = readFileSync(new URL('../src/systems/secondRinse.js', import.meta.url), 'utf8');
  const imported = /from ['"]three['"]/;
  assert.equal(imported.test(data), false);
  assert.equal(imported.test(system), false);
});

test('the actual wash gives guidance before either reachable physical choice', () => {
  const f = fixture();
  f.at(-90, 26); f.step();
  assert.match(f.voices[0].text, /Catch the far end/);
  for (let x = -89; x <= 0 && f.state.secondRinse.flag === 'open'; x++) { f.at(x, 26); f.step(); }
  assert.equal(f.state.secondRinse.flag, 'cut', 'slow flight through the accessible mast cord cuts');
  assert.equal(f.skiff.flags.invuln, true);
  assert.equal(resolvePhysicsBodySpec(f.skiff).dynamic, false);
  const blue = fixture();
  blue.at(0, 110); blue.step();
  blue.at(0, 70); blue.step();
  assert.equal(blue.state.secondRinse.flag, 'crooked', 'the loose end can be caught without cutting');
  assert.match(blue.skiff.data.scanLabel, /upside down/);
});

test('white wash is separate, guidance is paced, and fast passes do not tunnel through blue', () => {
  const white = fixture();
  white.at(-90, 40); white.step();
  white.at(-48, 40); white.step();
  assert.equal(white.state.secondRinse.flag, 'open');
  assert.ok(white.voices.some(p => /White\. It stays clipped/.test(p.text)));
  white.at(-90, 26);
  for (let i = 0; i < 800; i++) white.step();
  assert.ok(white.voices.some(p => p.id === 'second-rinse:boat'));
  assert.ok(white.voices.some(p => p.id === 'second-rinse:hover'));
  const fast = fixture();
  fast.at(0, 100); fast.step();
  fast.at(0, 40); fast.step();
  assert.equal(fast.state.secondRinse.flag, 'crooked');
});

test('load, dock and sector placements never sweep an old path through the cord', () => {
  for (const reset of ['load', 'sector', 'dock', 'new', 'relocate']) {
    const f = fixture();
    f.at(-90, 26); f.step();
    if (reset === 'load') f.system.deserialize({ flag: 'open' });
    if (reset === 'sector') f.bus.emit('sector:enter', {});
    if (reset === 'relocate') f.bus.emit('world:playerRelocated', {});
    if (reset === 'dock') { f.state.ui = { docked: true }; f.step(); f.state.ui.docked = false; }
    if (reset === 'new') f.system.newGame();
    f.at(90, 26); f.step();
    assert.equal(f.state.secondRinse.flag, 'open', reset);
  }
  const f = fixture();
  f.system.deserialize({ flag: 'cut', introduced: true });
  f.system.afterContinue(); f.step();
  assert.equal(f.system.serialize().flag, 'cut');
  f.state.run.kind = 'survival'; f.step();
  assert.equal(f.state.entityList.filter(e => e.alive && e.data?.secondRinseId).length, 0);
});

test('laundry keeps the admitted Forge hull visible and resets after a saved cut', () => {
  const f = fixture(), root = new THREE.Group(), hull = new THREE.Group();
  hull.name = 'admitted-forge-hull'; root.add(hull);
  const driver = createSecondRinseVisualDriver(root, f.skiff);
  const blue = root.getObjectByName('second-rinse-blue-sheet');
  f.system.deserialize({ flag: 'cut' });
  driver.update(f.skiff, 0, {}, f.state);
  assert.equal(blue.visible, false);
  assert.equal(hull.visible, true);
  f.system.deserialize({ flag: 'open' });
  driver.update(f.skiff, 0, { reducedMotion: true }, f.state);
  assert.equal(blue.visible, true);
  assert.equal(blue.position.z, C.sheetLead + C.sheetAlong / 2);
  assert.equal(hull.visible, true);
  driver.dispose();
  assert.deepEqual(root.children, [hull]);
});
