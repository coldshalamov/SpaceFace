import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createReadModel, applyEntityVitals, createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createCapitalBossOverlay } from '../src/presentation/capitalBossPresentation.js';
import { collectEntityVitals } from '../scripts/lib/simWorkerHost.mjs';
import { createPalletJackVisualDriver } from '../src/render/palletJackVisuals.js';
import { createKilnbackVisualDriver, KILNBACK_MOTION_NODES } from '../src/render/kilnbackVisuals.js';
import { ironKrakenAnimationPose, createIronKrakenVisual } from '../src/render/ironKrakenVisuals.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';

test('worker boss presentation retains live tell clock and clears retired fight', () => {
  const fight = { fightId: 'f', encounterId: IRON_KRAKEN_PROFILES.heavy.scoreId,
    bossId: 2, targetId: 1, started: true, terminal: null, clock: 110,
    plates: [{ id: 'mantle_port', attached: true }],
    cast: { id: 'c', beatId: 'arm_sweep', startedAt: 100, locked: true,
      shapes: [{ kind: 'lane', a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, radius: 2 }] } };
  const live = { capitalBossEncounters: { fights: { f: fight } } };
  const differ = createDomainDiffer(), domains = new Map(), touched = new Set();
  const publish = tick => {
    for (const update of differ.diff(live, tick).updates) {
      touched.clear(); applyDomainPathUpdate(domains, JSON.parse(JSON.stringify(update)), touched);
    }
  };
  publish(1);
  const mirrored = () => domains.get('capitalBossEncounters').fights;
  assert.equal(mirrored().f.clock, 110);
  const cue = { fightId: 'f', castId: 'c', startedAt: 100, fireAt: 120, endAt: 140,
    locked: true, shapes: fight.cast.shapes };
  const bridged = projectBridgeEvent('capitalBoss:telegraph', cue);
  assert.equal(bridged.dropped, false);
  assert.deepEqual(bridged.flat.shapes, cue.shapes);
  let strokes = 0;
  const ctx = new Proxy({ canvas: { width: 200, height: 100 } }, { get(o, key) {
    if (key in o) return o[key];
    return key === 'stroke' ? () => { strokes++; } : () => {};
  } });
  const bus = createBus();
  const overlay = createCapitalBossOverlay({ canvas: { getContext: () => ctx }, bus,
    worldToScreen: p => ({ x: p.x, y: p.z }), clockForFight: id => mirrored()[id]?.clock ?? 0 });
  bus.emit('capitalBoss:telegraph', bridged.flat); overlay.draw();
  assert.ok(strokes > 0, 'the real overlay draws the worker tell at its live fight clock');
  fight.clock = 111; publish(2); assert.equal(mirrored().f.clock, 111);
  fight.terminal = 'defeated'; publish(3); assert.equal(mirrored().f, undefined);
  overlay.destroy();
});

test('worker Kraken fight frame follows post-spawn start, update and retirement', () => {
  const profile = IRON_KRAKEN_PROFILES.heavy, id = 7311, life = 12;
  const source = { id, type: 'ship', alive: true, occupantGeneration: life,
    data: { lootTableId: profile.enemyId, ironKraken: { variant: profile.variant, fightId: null } } };
  const mirror = { ...source, data: structuredClone(source.data) };
  const model = createReadModel(); model.entities.set(id, mirror);
  const state = { entityList: [source], capitalBossEncounters: { fights: {} } }, shadow = new Map();
  const publish = () => { const rows = collectEntityVitals(state, shadow); applyEntityVitals(model, JSON.parse(JSON.stringify(rows))); return rows; };
  publish(); assert.equal(mirror.ironKrakenMotionFrame, null);
  source.data.ironKraken.fightId = 'fight-1';
  state.capitalBossEncounters.fights['fight-1'] = { bossId: id, encounterId: profile.scoreId,
    phase: 'recovery', clock: 80, nextAt: 98, plates: [{ id: 'mantle_port', attached: false }] };
  assert.equal(publish().length, 1);
  let frame = JSON.parse(mirror.ironKrakenMotionFrame);
  assert.equal(frame.fightId, 'fight-1'); assert.equal(frame.ownerLife, life);
  assert.ok(ironKrakenAnimationPose(frame, 0).mantle > 0);
  assert.notEqual(ironKrakenAnimationPose(frame, 0).missingShellMask, 0);
  const root = createIronKrakenVisual(mirror);
  root.userData.updateAuthoredMotion(mirror, 1, {}, { simTime: 1, render: {} });
  assert.ok(root.userData.ironKrakenRig.pose.mantle > 0, 'actual visual reads the worker frame');
  state.capitalBossEncounters.fights['fight-1'].clock = 90;
  assert.equal(publish().length, 1);
  frame = JSON.parse(mirror.ironKrakenMotionFrame); assert.equal(frame.clock, 90);
  source.data.ironKraken.fightId = null;
  assert.equal(publish().length, 1); assert.equal(mirror.ironKrakenMotionFrame, null);
  root.userData.updateAuthoredMotion(mirror, 2, {}, { simTime: 2, render: {} });
  assert.equal(root.userData.ironKrakenRig.pose.mantle, 0);
  source.data.ironKraken.fightId = 'fight-1'; publish();
  delete source.data.ironKraken;
  assert.equal(publish().length, 1); assert.equal(mirror.ironKrakenMotionFrame, null);
  root.userData.disposeIronKraken?.();
});

function mirrorVitals(source, model, shadow) {
  const rows = collectEntityVitals({ entityList: [source] }, shadow);
  applyEntityVitals(model, JSON.parse(JSON.stringify(rows)));
  return rows.length;
}

function frameScene(root) {
  const scene = new THREE.Group(); scene.add(root);
  const model = createReadModel();
  return { scene, model };
}

function mainState(entity, scene, tick) {
  return { tick, simTime: tick / 60, mode: 'flight', entities: new Map([[entity.id, entity]]),
    render: { scene }, world: { frameOrigin: { x: 0, z: 0 } } };
}

test('worker Pallet Jack render frame drives clamp on main and clears on retired frame', () => {
  const id = 7301, life = 8;
  const source = { id, type: 'ship', alive: true, occupantGeneration: life,
    palletJackMotionFrame: JSON.stringify({ v: 1, phase: 'grab', phaseStartTick: 10, tick: 20,
        actorId: id, ownerLife: life, nativeBodyReady: true, targetCargoId: 'cargo-1', targetEntityId: 91,
        targetLife: 3, grabAttackId: 2, grabStartTick: 10, acceptedAttachmentId: null,
        loaded: false, release: null }),
    data: { lootTableId: 'pallet_jack', authoredAssetId: 'SF_SHIP_PALLET_JACK' } };
  const root = new THREE.Group();
  root.userData.palletJackAuthoredSource = { assetId: 'SF_SHIP_PALLET_JACK',
    file: 'assets/ships/release/parts/wholeships/pallet_jack.glb' };
  const clamp = new THREE.Group(); clamp.name = 'MOTION_PALLET_JACK_CLAMP'; root.add(clamp);
  const { scene, model } = frameScene(root);
  const main = { ...source, data: { ...source.data }, mesh: root };
  delete main.palletJackMotionFrame;
  model.entities.set(id, main);
  const shadow = new Map();
  assert.equal(mirrorVitals(source, model, shadow), 1);
  assert.equal(main.palletJackMotionFrame, source.palletJackMotionFrame);

  const driver = createPalletJackVisualDriver(root, main);
  assert.ok(driver);
  let state = mainState(main, scene, 20);
  driver.update(main, state.simTime, null, state);
  const opened = clamp.position.x;
  assert.ok(opened > 0, 'the mirrored worker grab frame opens the authored clamp');

  source.palletJackMotionFrame = JSON.stringify({ v: 1, phase: 'grab', phaseStartTick: 10, tick: 21,
    actorId: id + 1, ownerLife: life, nativeBodyReady: true, targetCargoId: 'cargo-1', targetEntityId: 91,
    targetLife: 3, grabAttackId: 2, grabStartTick: 10, acceptedAttachmentId: null,
    loaded: false, release: null });
  assert.equal(mirrorVitals(source, model, shadow), 1);
  state = mainState(main, scene, 21);
  driver.update(main, state.simTime, null, state);
  assert.equal(clamp.position.x, 0, 'a frame for another actor is rejected even when life and tick match');

  source.palletJackMotionFrame = JSON.stringify({ v: 1, phase: 'grab', phaseStartTick: 10, tick: 22,
    actorId: id, ownerLife: life, nativeBodyReady: true, targetCargoId: 'cargo-1', targetEntityId: 91,
    targetLife: 3, grabAttackId: 2, grabStartTick: 10, acceptedAttachmentId: null,
    loaded: false, release: null });
  assert.equal(mirrorVitals(source, model, shadow), 1);
  state = mainState(main, scene, 22);
  driver.update(main, state.simTime, null, state);
  const advanced = clamp.position.x;
  assert.ok(advanced > 0, 'a newer valid authoritative tick advances the authored motion');

  source.palletJackMotionFrame = null;
  assert.equal(mirrorVitals(source, model, shadow), 1);
  state = mainState(main, scene, 23);
  driver.update(main, state.simTime, null, state);
  assert.equal(clamp.position.x, 0, 'a retired worker frame returns the clamp to rest');
  driver.dispose();
});

test('worker Kilnback render frame drives slats on main and quiets after lifecycle clear', () => {
  const id = 7302, life = 12;
  const source = { id, type: 'ship', alive: true, occupantGeneration: life,
    kilnbackMotionFrame: JSON.stringify({ v: 1, phase: 'preheat', phaseStartTick: 0, tick: 100,
        actorId: id, ownerLife: life, nativeBodyReady: true, portStatus: 'attached', portCoolant: 3,
        starboardStatus: 'attached', starboardCoolant: 2, lanes: [] }),
    data: { persistenceOwner: 'kilnback', kilnbackKey: 'kilnback:fixture', lootTableId: 'kilnback' } };
  const root = new THREE.Group();
  root.userData.kilnbackAuthoredSource = { assetId: 'SF_SHIP_KILNBACK',
    file: 'assets/ships/release/parts/wholeships/kilnback.glb' };
  for (const name of KILNBACK_MOTION_NODES) { const node = new THREE.Group(); node.name = name; root.add(node); }
  const rests = KILNBACK_MOTION_NODES.slice(0, 6).map(name => root.getObjectByName(name).quaternion.clone());
  const { scene, model } = frameScene(root);
  const main = { ...source, data: { ...source.data }, mesh: root };
  delete main.kilnbackMotionFrame;
  model.entities.set(id, main);
  const shadow = new Map();
  assert.equal(mirrorVitals(source, model, shadow), 1);
  const driver = createKilnbackVisualDriver(root, main);
  assert.ok(driver);
  let state = mainState(main, scene, 100);
  driver.update(main, state.simTime, null, state);
  const slat = root.getObjectByName(KILNBACK_MOTION_NODES[0]);
  assert.ok(slat.quaternion.angleTo(rests[0]) > .1, 'the mirrored preheat frame opens the authored slats');
  assert.equal(root.getObjectByName(KILNBACK_MOTION_NODES[6]).visible, true,
    'the mirrored attached-cask status controls its authored pivot');

  source.kilnbackMotionFrame = null;
  assert.equal(mirrorVitals(source, model, shadow), 1);
  state = mainState(main, scene, 101);
  driver.update(main, state.simTime, null, state);
  assert.ok(slat.quaternion.angleTo(rests[0]) < 1e-8, 'clearing the worker frame restores the slats');
  assert.equal(root.getObjectByName(KILNBACK_MOTION_NODES[6]).visible, false);
  driver.dispose();
});
