import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRuud, ruudEntitySpec, ruudSteering, ruudLink, RUUD_GLOBAL_ANCHOR } from '../src/systems/ruud.js';
import { RUUD as C, RUUD_LINES, freshRuudMemory, normalizeRuudMemory, RUUD_AUDIO_RECIPES, ruudGlobal } from '../src/data/ruud.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { SECTORS } from '../src/data/sectors.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, TABLE_CLOCK_IDS } from '../src/runtime/authoritativeSystemManifest.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { save } from '../src/save/saveSystem.js';
import { buildRuudVisual } from '../src/render/characters/ruudModel.js';

const LINE_KEYS = ['discover', 'hello', 'hours', 'towing', 'ignore', 'spared', 'buoy', 'hatch', 'cut', 'memorial', 'weapon'];

function fixture(memory) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 0, tick: 0, mode: 'flight', timeScale: 1, run: { kind: 'adventure' },
    world: { currentSectorId: C.sectorId }, entities: new Map(), entityList: [],
    player: { tether: { active: false }, cargo: { ore: 2 } },
    cargo: { ore: 2 }, heat: { value: 1 }, factions: { faction_dmc: { rep: 4 } }, moralMemory: { kept: true },
    input: { yaw: 0.2, throttle: 0.5, deadzone: 0.08 },
    ruud: memory,
  };
  let id = 0;
  const helpers = {
    spawnEntity(spec) {
      const e = makeEntity({ ...spec, id: ++id });
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    },
    removeEntity(removeId) { const e = state.entities.get(removeId); if (e) e.alive = false; },
    voice: { say(p) { events.push(['voice', p]); return true; } },
  };
  const suitG = ruudGlobal(C.suit);
  const player = helpers.spawnEntity({
    type: 'ship', team: 0, name: 'Hitch', pos: { x: suitG.x + 40, z: suitG.z }, vel: { x: 0, z: 0 },
    isPlayer: true, radius: 4, mass: 12, hull: 100, hullMax: 100,
    data: { identityKey: 'hull:test-plate' },
    physicsBody: { shape: 'ball', dynamic: true, radius: 4, mass: 12, useMeasuredSkin: false, material: 'ship', contact: { linearDamping: 0 } },
  });
  state.playerId = player.id;
  for (const type of ['ruud:voice', 'ruud:spared', 'ruud:cut', 'audio:cue', 'toast']) bus.on(type, p => events.push([type, p]));
  const system = createRuud();
  system.init({ state, bus, helpers });
  const step = (dt = 1 / 60) => { state.simTime += dt; state.tick++; system.update(dt, state); };
  step();
  let seq = 0;
  const scan = (extra = {}) => bus.emit('scan:pulse', {
    source: 'player-scanner', scannerId: player.id, seq: ++seq, pos: { x: player.pos.x, z: player.pos.z }, radius: 250, ...extra,
  });
  const part = (name) => system._get(system._id[name]);
  const alive = () => state.entityList.filter(e => e.alive && e.data?.ruud);
  const sacred = () => ({
    vel: { x: player.vel.x, z: player.vel.z },
    input: { ...state.input }, cargo: { ...state.cargo }, heat: { ...state.heat },
    factions: structuredClone(state.factions), moral: state.moralMemory.kept, hold: state.player.cargo.ore,
  });
  return { bus, state, player, system, events, step, scan, part, alive, sacred };
}
function impulse(e) {
  const c = consumePhysicsCommand(e);
  return (c?.impulses || []).reduce((v, p) => ({ x: v.x + p.x, z: v.z + p.z }), { x: 0, z: 0 });
}

test('buoy sits 110 past Fin-3 along the forge ray, and the chart owns that fin', () => {
  const rayX = -320, rayZ = 110, len = Math.hypot(rayX, rayZ);
  assert.ok(Math.abs(C.buoy.x - (-800 + 110 * (rayX / len))) < 1e-6);
  assert.ok(Math.abs(C.buoy.z - (830 + 110 * (rayZ / len))) < 1e-6);
  assert.ok(Math.abs(C.buoy.x - (-904.02552592)) < 1e-6);
  assert.ok(Math.abs(C.buoy.z - (865.75877454)) < 1e-6);
  assert.equal(Math.hypot(C.suit.x - C.fin.x, C.suit.z - C.fin.z), 16);
  const poi = SECTORS.find(s => s.id === C.sectorId).pois.find(p => p.id === 'poi_ruud_fin3');
  assert.deepEqual(poi.pos, { x: -800, z: 830 });
  assert.equal(poi.runtimeOwner, 'ruud');
  assert.equal(poi.scannerSignalKind, 'anomaly');
  assert.equal(poi.name, 'HOOK-LEFT · Fin-3');
  assert.equal(RUUD_GLOBAL_ANCHOR.z, ruudGlobal(C.fin).z);
  assert.ok(RUUD_GLOBAL_ANCHOR.z > 16000);
});

test('home sector mints three passive anomaly drones; the bladder waits for the cut', () => {
  const f = fixture();
  assert.equal(f.alive().length, 3);
  for (const e of f.alive()) {
    assert.equal(e.type, 'drone');
    assert.equal(e.team, 2);
    assert.equal(e.factionId, null);
    assert.equal(e.data.ai.passive, true);
    assert.equal(e.data.authoredCharacter, 'character_ruud');
    assert.ok(e.data.ruudPart);
    assert.equal(e.data.scannerSignalKind, 'anomaly');
    assert.equal(isHostileToPlayer(e, 0, f.state), false);
    assert.equal(e.data.scannerSignalKind === 'distress', false);
  }
  assert.equal(isAttachable(f.part('suit'), f.player.id, f.state), true);
  assert.equal(isAttachable(f.part('fin'), f.player.id, f.state), false);
  assert.equal(isAttachable(f.part('buoy'), f.player.id, f.state), false);
  const spec = resolvePhysicsBodySpec(f.part('buoy'));
  assert.equal(spec.mass, C.buoyMass);
  assert.equal(spec.dynamic, true);
  assert.equal(f.part('suit').data.scanLabel, 'HOOK-LEFT · plate Ruud · plumbed to Fin-3');
  assert.equal(f.part('fin').data.scanLabel, 'Fin-3 · cold face · ROTATION COMPLETE 04:10');
  const hung = f.part('suit').data.ruudPose;
  assert.equal(hung.chain, 1);
  assert.ok(hung.linkLen > 5 && hung.linkLen < 7, hung.linkLen);
  assert.ok(hung.linkX < -0.95);
  f.part('suit').pos.x += 40;
  f.step();
  assert.equal(f.part('suit').data.ruudPose.linkLen, 0);
  assert.throws(() => ruudEntitySpec(undefined, 'gantry'), RangeError);
  assert.equal(ruudLink({ x: 0, z: 0 }, { x: 16, z: 0 }, 10.4, 14, 'span').linkLen > 5, true);
  assert.equal(ruudLink({ x: 0, z: 0 }, { x: 40, z: 0 }, 10.4, 14, 'span').linkLen, 0);
});

test('other runs and sectors stay empty', () => {
  for (const [kind, sector] of [['survival', C.sectorId], ['lab', C.sectorId], ['adventure', 'other']]) {
    const f = fixture();
    f.state.run.kind = kind; f.state.world.currentSectorId = sector; f.step();
    assert.equal(f.alive().length, 0);
  }
});

test('a decent release only counts on the buoy and never boards or flies the player', () => {
  const f = fixture();
  const before = f.sacred();
  f.scan();
  const suit = f.part('suit'), buoy = f.part('buoy');
  suit.pos.x = buoy.pos.x + 10; suit.pos.z = buoy.pos.z;
  f.bus.emit('tether:latched', { targetId: suit.id });
  f.bus.emit('tether:released', { targetId: suit.id });
  f.bus.emit('tether:cut', { targetId: suit.id });
  assert.equal(f.state.ruud.disposition, 'spared');
  assert.equal(f.state.ruud.plateId, 'hull:test-plate');
  assert.equal(f.events.filter(e => e[0] === 'ruud:spared').length, 1);
  assert.equal(suit.alive, true);
  assert.equal(suit.type, 'drone');
  assert.notEqual(suit.pos.x, f.player.pos.x);
  assert.equal(f.alive().length, 3);
  assert.equal(suit.data.ruudPose.chain, 0);
  assert.equal(suit.data.ruudPose.clipped, 0);
  assert.equal(buoy.data.ruudPose.plateOpen, 1);
  assert.equal(f.part('fin').data.ruudPose.hatch, 1);
  assert.equal(f.part('fin').data.ruudPose.sheared, 0);
  assert.equal(f.part('suit').data.ruudPose.moored, 1);
  const moorGap = Math.hypot(suit.pos.x - buoy.pos.x, suit.pos.z - buoy.pos.z);
  const hoseEnd = C.hoseStart + suit.data.ruudPose.linkLen;
  assert.ok(Math.abs(hoseEnd - (moorGap - C.buoySkin)) < 1e-6, hoseEnd);
  f.player.pos.x += 800;
  impulse(suit);
  f.step();
  const pull = impulse(suit);
  assert.ok(pull.x < 0, 'suit returns toward the buoy, not the departed hull');
  assert.deepEqual(f.sacred(), before);
  assert.equal(suit.data.scanLabel, 'HOOK-LEFT · plate Ruud · on the lane buoy');
  f.events.length = 0;
  f.state.simTime = 30;
  f.step();
  assert.equal(f.events.some(e => e[0] === 'audio:cue'), false);
  f.bus.emit('combat:damage', { targetId: suit.id, attackerId: f.player.id, applied: 5 });
  const shot = f.events.find(e => e[1]?.key === 'weapon');
  assert.equal(shot[1].text.includes('Cold face'), false);
  assert.equal(shot[1].text.includes('filing is closed'), true);
  assert.equal(f.state.ruud.disposition, 'spared');
  const missed = fixture();
  missed.state.simTime = 20;
  missed.part('suit').pos.x += 10;
  missed.bus.emit('tether:released', { targetId: missed.part('suit').id });
  assert.equal(missed.state.ruud.disposition, 'unchosen');
  assert.ok(missed.events.some(e => e[0] === 'ruud:voice' && e[1].key === 'ignore'));
});

test('ignore keeps the filing unchosen and does not store a drifted pose', () => {
  const f = fixture();
  f.part('suit').pos.x += 200; f.part('suit').vel.x = 30; f.part('fin').pos.z += 40;
  const saved = f.system.serialize();
  assert.equal(saved.disposition, 'unchosen');
  assert.equal(saved.bodies.suit.x, C.suit.x);
  assert.equal(saved.bodies.suit.z, C.suit.z);
  assert.equal(saved.bodies.suit.vx, 0);
  assert.equal(saved.bodies.fin.z, C.fin.z);
  assert.equal(saved.bladder.present, false);
  assert.equal(saved.hours, 19);
  f.player.pos.x += 5000; f.step();
  assert.equal(f.state.ruud.disposition, 'unchosen');
});

test('a player hit or a hard ram parts Fin-3 into serial 14-K without a kill, bounty, or cargo write', () => {
  const f = fixture();
  const before = f.sacred();
  const suit = f.part('suit');
  suit.hull = 0;
  f.bus.emit('combat:damage', { targetId: suit.id, attackerId: f.player.id, applied: 40 });
  assert.equal(f.state.ruud.disposition, 'cut');
  assert.ok(suit.hull >= 1);
  assert.equal(suit.alive, true);
  assert.equal(f.part('fin').data.masslineTetherable, true);
  assert.equal(f.part('fin').data.scanLabel, '14-K · Fin-3 · scrap serial');
  assert.equal(suit.data.scanLabel, 'HOOK-LEFT · backup bladder · no charge filed');
  assert.equal(suit.data.ruudPose.sheared, 1);
  assert.equal(suit.data.ruudPose.seated, 1);
  assert.equal(suit.data.ruudPose.chain, 0);
  assert.equal(isAttachable(f.part('fin'), f.player.id, f.state), true);
  const bladder = f.part('bladder');
  assert.ok(bladder);
  assert.equal(f.alive().length, 4);
  assert.ok(Math.abs((bladder.pos.x - suit.pos.x) - 8) < 1e-6);
  assert.equal(bladder.flags.invuln, true);
  const shove = impulse(f.part('fin'));
  assert.ok(Math.hypot(shove.x, shove.z) > 0);
  assert.deepEqual(f.sacred(), before);
  impulse(suit); impulse(f.part('fin'));
  f.step();
  const toward = impulse(suit);
  assert.ok(toward.x > 0, 'the suit steers onto the bladder');
  assert.deepEqual(impulse(f.part('fin')), { x: 0, z: 0 });

  const ram = fixture();
  ram.bus.emit('physics:impact', { aId: ram.player.id, bId: ram.part('fin').id, impulse: 80, preSolveClosingSpeed: 14 });
  assert.equal(ram.state.ruud.disposition, 'cut');
  const env = fixture();
  env.bus.emit('physics:impact', { aId: env.part('suit').id, bId: 999, impulse: 400, preSolveClosingSpeed: 40 });
  env.bus.emit('physics:impact', { aId: env.player.id, bId: env.part('suit').id, impulse: 400 });
  env.bus.emit('physics:impact', { aId: env.player.id, bId: env.part('suit').id, impulse: 400, preSolveClosingSpeed: 13.9 });
  env.bus.emit('combat:damage', { targetId: env.part('fin').id, attackerId: 999, applied: 20 });
  env.bus.emit('combat:damage', { targetId: env.part('suit').id, attackerId: env.player.id, applied: 0 });
  assert.equal(env.state.ruud.disposition, 'unchosen');
  assert.equal(env.part('fin').hull >= 1, true);
});

test('spared and cut round-trip; a bad version is a fresh hook; hours stay nineteen', () => {
  const f = fixture();
  f.scan();
  const buoy = f.part('buoy');
  f.part('suit').pos.x = buoy.pos.x; f.part('suit').pos.z = buoy.pos.z;
  f.bus.emit('tether:released', { targetId: f.part('suit').id });
  f.part('suit').vel.x = -4;
  const spared = f.system.serialize();
  assert.equal(spared.disposition, 'spared');
  assert.equal(spared.plateId, 'hull:test-plate');
  assert.equal(spared.met, true);
  assert.equal(spared.hours, 19);
  f.system.deserialize(spared);
  f.bus.emit('save:loaded', {});
  assert.equal(f.state.ruud.disposition, 'spared');
  assert.equal(f.part('suit').vel.x, -4);
  const g = fixture();
  g.part('fin').hull = 0;
  g.bus.emit('combat:damage', { targetId: g.part('fin').id, attackerId: g.player.id, applied: 5 });
  const cut = g.system.serialize();
  assert.equal(cut.disposition, 'cut');
  assert.equal(cut.bladder.present, true);
  assert.equal(cut.plateId, '');
  g.system.deserialize(cut);
  g.bus.emit('save:loaded', {});
  assert.equal(g.part('bladder') != null, true);
  assert.equal(g.part('fin').data.scanLabel, '14-K · Fin-3 · scrap serial');
  const junk = normalizeRuudMemory({ version: 1, disposition: 'cut', hours: 400, visits: 1e99, plateId: 'nope', evil: 1, bodies: { suit: { x: 1e99, hull: 0, vx: NaN } } });
  assert.equal(junk.hours, 19);
  assert.equal(junk.visits, 1e6);
  assert.equal(junk.evil, undefined);
  assert.equal(junk.bodies.suit.hull, 1);
  assert.equal(junk.bodies.suit.x, 1e7);
  assert.equal(junk.bladder.present, true);
  assert.deepEqual(normalizeRuudMemory({ version: 9, disposition: 'cut' }), freshRuudMemory());
  const saver = Object.create(save);
  saver._callSerialize = id => id === 'ruud' ? spared : null;
  assert.equal(saver._saveCapturePlan().find(([key]) => key === 'ruud')[1](), spared);
});

test('lines, audio, manifest, and the non-streamed residency row', async () => {
  assert.deepEqual(Object.keys(RUUD_LINES), LINE_KEYS);
  for (const text of Object.values(RUUD_LINES)) {
    assert.equal(text.includes('?'), false);
    assert.equal(text.includes('!'), false);
    assert.equal(text.includes('...'), false);
  }
  assert.deepEqual(RUUD_AUDIO_RECIPES.map(r => r.id), ['sfx_ruud_tick', 'sfx_ruud_hiss']);
  for (const recipe of RUUD_AUDIO_RECIPES) assert.equal(recipe.type, 'oscillator');
  assert.equal(RECIPES.filter(r => r.id.startsWith('sfx_ruud_')).length, 2);
  const f = fixture();
  f.step();
  const cues = f.events.filter(e => e[0] === 'audio:cue').map(e => e[1].id);
  assert.ok(cues.length >= 1);
  assert.ok(cues.every(id => id === 'sfx_ruud_tick' || id === 'sfx_ruud_hiss'));
  assert.equal(PRODUCTION_INIT_ORDER.filter(id => id === 'ruud').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter(id => id === 'ruud').length, 1);
  assert.equal(TABLE_CLOCK_IDS.filter(id => id === 'ruud').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.length, 150);
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('ruud') < PRODUCTION_UPDATE_ORDER.indexOf('physics'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('ruckus') < PRODUCTION_UPDATE_ORDER.indexOf('ruud'));
  const factory = await readFile(new URL('../src/render/visualFactory.js', import.meta.url), 'utf8');
  const arm = factory.indexOf('e.data?.ruudPart');
  const drone = factory.indexOf("case 'drone'");
  assert.ok(arm > 0 && arm < drone);
  const residency = await readFile(new URL('./character-far-actor-residency.test.mjs', import.meta.url), 'utf8');
  assert.match(residency, /name: 'ruud'/);
  assert.equal(/name: 'ruud'[\s\S]{0,160}streamed: true/.test(residency), false);
  const saveSrc = await readFile(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(saveSrc, /data\.ruud = this\._callSerialize\('ruud'\)/);
  assert.match(saveSrc, /_callDeserialize\('ruud', data\.ruud\)/);
  for (const file of ['../src/core/registry.js', '../src/runtime/nodeSystemFactoryTable.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /\['ruud', ruud\]/);
  }
});

test('the suit, fin, buoy, and bladder are authored and the cold face has no features', () => {
  for (const part of ['fin', 'suit', 'buoy', 'bladder']) {
    const spec = ruudEntitySpec(part === 'bladder' ? { ...freshRuudMemory(), disposition: 'cut', bladder: { ...freshRuudMemory().bladder, present: true } } : freshRuudMemory(), part);
    const root = buildRuudVisual(spec);
    assert.equal(typeof root.userData.updateAuthoredMotion, 'function');
    assert.equal(root.userData.authoredAssetState, 'authored');
    assert.equal(root.userData.authoredVisualRoot, 'authored-root');
    const names = [];
    root.traverse(o => { if (o.name) names.push(o.name); });
    assert.equal(names.some(n => /eye|mouth|blood|face_feature/i.test(n)), false);
  }
  const fin = buildRuudVisual(ruudEntitySpec(freshRuudMemory(), 'fin'));
  let heat = 0, otherHeat = 0;
  fin.traverse(o => {
    const mat = o.material;
    if (!mat || !mat.emissive) return;
    if (mat.emissive.getHex() === 0xff7a32 && mat.emissiveIntensity > 0.5) heat++;
    else if (mat.emissive.getHex() === 0xff7a32) otherHeat++;
  });
  assert.equal(heat, 1);
  assert.equal(otherHeat, 0);
  const sign = fin.getObjectByName('bolted_sign');
  const signRot = sign.rotation.z;
  const latch = fin.getObjectByName('ANIM_latch');
  const shear = fin.getObjectByName('ANIM_shear');
  assert.equal(shear.visible, false);
  fin.userData.updateAuthoredMotion({ data: { ruudPose: { hatch: 1, chain: 1, sheared: 0, simTime: 1 } } }, 1, {});
  assert.equal(sign.rotation.z, signRot);
  assert.notEqual(latch.rotation.z, 0);
  assert.equal(shear.visible, false);
  fin.userData.updateAuthoredMotion({ data: { ruudPose: { hatch: 0, sheared: 1, chain: 0, simTime: 2 } } }, 2, { reducedMotion: true });
  assert.equal(sign.rotation.z, signRot);
  assert.equal(shear.visible, true);
  assert.equal(fin.getObjectByName('ANIM_cold_tip').visible, false);
  const cold = fin.getObjectByName('cold_face_out');
  assert.ok(Math.abs(cold.rotation.y - Math.PI) < 1e-6);
  const suitMem = freshRuudMemory();
  const suit = buildRuudVisual(ruudEntitySpec(suitMem, 'suit'));
  const chain = suit.getObjectByName('ANIM_chain');
  suit.userData.updateAuthoredMotion({ data: { ruudPose: { chain: 0, clipped: 0, simTime: 1 } } }, 1, {});
  assert.equal(chain.visible, false);
  suit.userData.updateAuthoredMotion({ data: { ruudPose: { chain: 1, clipped: 1, linkX: -1, linkZ: 0, linkLen: 5.6, simTime: 2 } } }, 2, { reducedMotion: true });
  assert.equal(chain.visible, true);
  const hose = suit.getObjectByName('cooled_hose');
  assert.ok(Math.abs(hose.scale.y - 5.6) < 1e-6);
  assert.ok(hose.position.x < -2);
  suit.userData.updateAuthoredMotion({ data: { ruudPose: { chain: 1, clipped: 1, linkX: -1, linkZ: 0, linkLen: 0, simTime: 3 } } }, 3, {});
  assert.equal(chain.visible, false);
  const breath = suit.getObjectByName('ANIM_breath');
  assert.equal(breath.visible, true);
  const puff = breath.children[0];
  assert.ok(Math.abs(puff.rotation.x + Math.PI / 2) < 1e-6);
  assert.ok(puff.position.x < -0.8);
  const buoy = buildRuudVisual(ruudEntitySpec(freshRuudMemory(), 'buoy'));
  const barL = buoy.getObjectByName('bar_left');
  buoy.userData.updateAuthoredMotion({ data: { ruudPose: { plateOpen: 0, simTime: 0 } } }, 0, { reducedMotion: true });
  const missed = barL.position.y;
  buoy.userData.updateAuthoredMotion({ data: { ruudPose: { plateOpen: 1, simTime: 0 } } }, 0, { reducedMotion: true });
  assert.notEqual(barL.rotation.z, 0);
  assert.notEqual(barL.position.y, missed);
  assert.equal(ruudSteering({ x: NaN, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }), null);
  const bounded = ruudSteering({ x: 1000, z: 1000 }, { x: 0, z: 0 }, { x: 0, z: 0 });
  assert.ok(Math.hypot(bounded.x, bounded.z) <= C.returnAcceleration + 1e-9);
});

test('authenticated scans wake once; a killed body is reminted at hull 1 and still not a bounty', () => {
  const f = fixture();
  for (const extra of [{ source: 'other' }, { scannerId: 999 }, { seq: 1.5 }, { pos: { x: 0, z: 0 } }, { radius: 0 }]) {
    const g = fixture(); g.scan(extra); assert.equal(g.state.ruud.met, false);
  }
  f.scan(); f.scan();
  assert.equal(f.state.ruud.met, true);
  assert.equal(f.events.filter(e => e[1]?.key === 'hello').length, 1);
  const id = f.part('buoy').id;
  f.part('buoy').alive = false;
  f.bus.emit('entity:killed', { id });
  f.step();
  assert.ok(f.part('buoy'));
  assert.ok(f.part('buoy').hull >= 1);
  assert.equal(f.state.ruud.disposition, 'unchosen');
  assert.equal(f.state.heat.value, 1);
});
