import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRubricFixture } from '../tools/rubric/labRuntime.js';
import { rubricEntitySpec, RUBRIC_GLOBAL_ANCHOR as O, WHEEL } from '../src/systems/rubric.js';
import { RUBRIC as C, RUBRIC_LINES, RUBRIC_QUIET, RUBRIC_TRUTH, RUBRIC_TOLD, RUBRIC_AUDIO_RECIPES,
  freshRubricMemory, normalizeRubricMemory } from '../src/data/rubric.js';
import { violatesRegister, truthFacts, truthLine, markStyle, stillness, poolLines, scoreTarget } from '../src/characters/rubricRules.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, TABLE_CLOCK_IDS } from '../src/runtime/authoritativeSystemManifest.js';

const read = file => fs.readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const comms = f => f.events.filter(e => e[0] === 'comms').map(e => e[1]);
const said = (f, needle) => comms(f).some(p => p.text.includes(needle));
const alive = (f, part) => f.state.entityList.filter(e => e.alive && e.data?.rubricPart === part);
const speed = e => Math.hypot(e.vel.x, e.vel.z);
/** The attachment kernel is the authority for "the player holds a line"; fake one without moving anything. */
function fakeLine(f, e) {
  f.state.combat ||= {}; f.state.combat.attachments ||= { byId: {} };
  f.state.combat.attachments.byId.fixture = { state: 'active', ownerId: f.player.id, targetId: e.id,
    ownerGeneration: f.player.occupantGeneration, targetGeneration: e.occupantGeneration };
}
const dropLine = f => { delete f.state.combat.attachments.byId.fixture; };
/** A memory that has already corrected F-41 so the sector's other hulls are in play. */
const afterF41 = (extra = {}) => ({ ...freshRubricMemory(), met: true, f41: true, witness: 1, told: ['hello', 'brief', 'f41'],
  marks: [{ k: 'f41', c: 'l', s: 1, x: 'Hull F-41. Marked NOT CLEARED.', t: 1 }], ...extra });

test('both production paths contain exactly one RUBRIC, simulation before physics, with a declared clock', () => {
  for (const list of [PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER]) assert.equal(list.filter(x => x === 'rubric').length, 1);
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('rubric') < PRODUCTION_UPDATE_ORDER.indexOf('physics'));
  assert.ok(TABLE_CLOCK_IDS.includes('rubric'));
});

test('registry, node factory table, save, audio and chart agree on one marker in Tethys Junction', async () => {
  for (const file of ['src/core/registry.js', 'src/runtime/nodeSystemFactoryTable.js']) assert.match(await read(file), /\['rubric', rubric\]/);
  const save = await read('src/save/saveSystem.js');
  assert.match(save, /_callSerialize\('rubric'\)/); assert.match(save, /_callDeserialize\('rubric', data\.rubric\)/);
  assert.equal((save.match(/'rubric'/g) || []).length >= 3, true);
  const sector = SECTORS.find(s => s.id === C.sectorId), poi = sector.pois.find(p => p.runtimeOwner === 'rubric');
  assert.ok(poi, 'the chart carries the marker');
  assert.deepEqual(poi.pos, { ...C.anchor });
  assert.deepEqual(sectorLocalToGlobalForSector(poi.pos, sector.id), { ...O });
  assert.ok(poi.discoveryPlate.title && poi.discoveryPlate.body);
  for (const r of RUBRIC_AUDIO_RECIPES) assert.ok(RECIPES.some(x => x.id === r.id), r.id);
  assert.equal(new Set(RUBRIC_AUDIO_RECIPES.map(r => r.id)).size, RUBRIC_AUDIO_RECIPES.length);
});

test('the voice law: every line the marker can say passes the register lint, and the lint has teeth', () => {
  for (const [key, line] of Object.entries(RUBRIC_LINES)) assert.deepEqual(violatesRegister(line), [], `line ${key}`);
  for (const q of RUBRIC_QUIET) assert.deepEqual(violatesRegister(q.text), [], q.text);
  const frags = [];
  const walk = v => { if (typeof v === 'string') frags.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(RUBRIC_TRUTH);
  for (const frag of frags) assert.deepEqual(violatesRegister(frag.replace(/\{killer\}/g, 'Reaver Pirate').replace(/\{freight\}/g, 'ore').replace(/\{n\}/g, '3').replace(/\{unit\}/g, 'days')), [], frag);
  for (const bad of ['I feel sad.', 'Hello!', 'Why was it moving?', 'Hmm... a hull.', 'I am sorry about that.', 'Nothing hurts but I hope so.', 'Lovely, a joke.', '']) {
    assert.ok(violatesRegister(bad).length > 0, `lint must reject: ${bad}`);
  }
  assert.ok(violatesRegister('x'.repeat(300)).includes('too-long'));
  // The composer's output across many invented wrecks stays inside the law and the length bound.
  const causes = ['p', 'o', 'l', 'u', 'y'];
  for (let i = 0; i < 400; i++) {
    const facts = { key: `aft_${i}`, cause: causes[i % 5], killerLabel: i % 3 ? 'Reaver Pirate' : '', freight: i % 4 ? 'medical courier' : '',
      label: ['MTS Hauler', 'Wasp Swarmer', 'Pilot hull', 'Hull'][i % 4], wreckClass: ['fresh', 'military', 'ancient', 'debris', 'battlefield'][i % 5],
      restricted: i % 7 === 0, pool: i % 2 ? [{ label: 'scrap metal', n: 3 }] : [], ageSeconds: [null, 5, 190, 5000][i % 4], isPlayerHull: i % 5 === 4, byPlayer: i % 5 === 0 };
    const text = truthLine(facts, i + 1);
    assert.deepEqual(violatesRegister(text), [], text); assert.ok(text.length <= C.markTextMax, text);
  }
});

test('bounded memory rejects unsupported versions, forged keys, control text, impossible numbers and overlong rings', () => {
  assert.deepEqual(normalizeRubricMemory({ version: 99 }), freshRubricMemory());
  assert.deepEqual(normalizeRubricMemory(null), freshRubricMemory());
  assert.deepEqual(normalizeRubricMemory('x'), freshRubricMemory());
  const marks = Array.from({ length: 80 }, (_, i) => ({ k: `aft_${i}`, c: 'p', s: 2, x: `Hull ${i}.`, t: i }));
  const m = normalizeRubricMemory({ version: 1, met: true, hull: Infinity, wronged: 1e9, paint: 7, visits: -5, last: 'whatever',
    told: ['hello', 'hello', 'forged', 42, 'f41'], marks: [...marks, null, 5, { k: '', c: 'p' }, { k: 'x', c: 'Z' }, { k: 'aft_3', c: 'o' }] });
  assert.equal(m.hull, C.hull); assert.equal(m.wronged, 99); assert.equal(m.paint, 1); assert.equal(m.visits, 0); assert.equal(m.last, '');
  assert.deepEqual(m.told, ['hello', 'f41']);
  assert.equal(m.marks.length, C.maxMarks); assert.equal(m.marks.at(-1).k, 'aft_79');
  assert.equal(new Set(m.marks.map(x => x.k)).size, m.marks.length);
  const dirty = normalizeRubricMemory({ version: 1, marks: [{ k: 'a\u0000b\n', c: 'l', s: 9, x: `Hull\u0007 ok ${'z'.repeat(400)}`, t: NaN }] });
  assert.equal(dirty.marks[0].k, 'ab'); assert.equal(dirty.marks[0].s, 1); assert.ok(dirty.marks[0].x.length <= C.markTextMax); assert.ok(!/[\u0000-\u001f]/.test(dirty.marks[0].x));
  assert.equal(dirty.marks[0].t, 0);
  const dead = normalizeRubricMemory({ version: 1, hull: -3, last: 'done' });
  assert.equal(dead.destroyed, true); assert.equal(dead.hull, 0); assert.equal(dead.last, '');
  assert.equal(normalizeRubricMemory({ version: 1, marks: [{ k: 'f41', c: 'l', s: 1, x: 'y', t: 1 }] }).f41, true);
  assert.deepEqual(normalizeRubricMemory(JSON.parse(JSON.stringify(m))), m, 'normalization is idempotent through JSON');
  for (const k of RUBRIC_TOLD) assert.ok(RUBRIC_LINES[k], `told key ${k} names a real line`);
});

test('bodies: marker and filing are neutral, passive and Massline-legal; marks are inert and untouchable', () => {
  const f = createRubricFixture();
  f.run(2);
  assert.equal(alive(f, 'body').length, 1); assert.equal(alive(f, 'hull').length, 1); assert.equal(alive(f, 'mark').length, 1);
  const body = alive(f, 'body')[0], hull = alive(f, 'hull')[0], mark = alive(f, 'mark')[0];
  for (const e of [body, hull]) { assert.equal(isHostileToPlayer(e, 0, f.state), false); assert.equal(isAttachable(e, f.player.id, f.state), true); assert.equal(resolvePhysicsBodySpec(e).dynamic, true); }
  assert.equal(body.data.ai.passive, true); assert.equal(body.factionId, null); assert.equal(body.type, 'drone');
  assert.equal(hull.type, 'wreck'); assert.equal(hull.data.hulkOfDefId, 'ship_mule'); assert.deepEqual(hull.data.salvagePool, {}); assert.equal(hull.data.rubricLocked, true);
  assert.equal(mark.type, 'fx'); assert.equal(mark.physicsBody, false); assert.equal(mark.collides, false); assert.equal(mark.data.masslineTetherable, false);
  assert.equal(isAttachable(mark, f.player.id, f.state), false);
  assert.equal(mark.data.rubricMark.filed, true); assert.equal(mark.data.rubricMark.progress, 0);
  assert.deepEqual({ x: body.pos.x, z: body.pos.z }, { x: O.x - 26, z: O.z + 6 }); assert.equal(body.data.rubricPose.wheel, WHEEL.calm);
  f.destroy();
});

test('one cohort; never in the arcade, the lab or another sector; leaving clears every part', () => {
  const f = createRubricFixture();
  f.run(3); assert.equal(f.state.entityList.filter(e => e.alive && e.data?.rubricPart).length, 3);
  for (const [kind, sector] of [['survival', C.sectorId], ['lab', C.sectorId], ['adventure', 'sector_helios_prime']]) {
    f.state.run.kind = kind; f.state.world.currentSectorId = sector; f.bus.emit('sector:enter', {});
    assert.equal(f.state.entityList.filter(e => e.alive && e.data?.rubricPart).length, 0, `${kind}/${sector}`);
  }
  f.state.run.kind = 'adventure'; f.state.world.currentSectorId = C.sectorId; f.bus.emit('sector:enter', {}); f.run(2);
  assert.equal(f.state.entityList.filter(e => e.alive && e.data?.rubricPart).length, 3, 're-entry re-adopts without duplicating');
  f.system._sync(); f.system._sync();
  assert.equal(f.state.entityList.filter(e => e.alive && e.data?.rubricPart).length, 3);
  f.destroy();
});

test('scan consent: authenticated nearby pulse meets once; forged, foreign, distant, paused and docked pulses do nothing', () => {
  for (const extra of [{ source: 'npc' }, { scannerId: 99 }, { seq: NaN }, { seq: 0 }, { pos: { x: 0, z: 0 } }, { radius: NaN }, { radius: 1 }, { radius: -4 }]) {
    const f = createRubricFixture(); f.scan(extra); assert.equal(f.state.rubric.met, false, JSON.stringify(extra)); f.destroy();
  }
  for (const how of ['pause', 'dock', 'distant']) {
    const f = createRubricFixture();
    if (how === 'pause') f.state.timeScale = 0; else if (how === 'dock') f.player.flags.docked = true; else f.player.pos.x += 600;
    f.scan(); assert.equal(f.state.rubric.met, false, how); f.destroy();
  }
  const f = createRubricFixture();
  f.scan(); f.scan({ seq: 1 });
  assert.equal(f.state.rubric.met, true); assert.equal(comms(f).filter(p => p.text.startsWith('RUBRIC: HM-11.')).length, 1, 'hello once');
  f.run(8); assert.ok(said(f, 'I do not mark a moving hull'), 'the brief follows the hello');
  assert.equal(f.events.filter(e => e[0] === 'audio:cue' && e[1].id === 'sfx_rubric_wake').length, 1);
  f.scan(); assert.ok(comms(f).at(-1).text.includes('Marks on file: 0'), 'a later scan reads out the inventory');
  f.destroy();
});

test('the truth is read from the wreck: caused-by-you, your own hull, ledger loss, military salvage; deterministic per seed', () => {
  const st = { playerId: 1, simTime: 1000, entities: new Map() };
  const wreck = (d) => ({ data: { wreckClass: 'battlefield', salvagePool: { cmdty_scrap_metal: 3 }, ...d } });
  const yours = truthFacts(wreck({ markerId: 'aft_a', aftermath: { markerId: 'aft_a', killerId: 1, victimLabel: 'Reaver Pirate', t: 810 } }), st);
  assert.equal(yours.cause, 'p'); assert.equal(markStyle(yours), 2); assert.match(truthLine(yours, 9), /Reaver Pirate\..*you|Cause on file: you|Hand on file: yours|Killed by you/);
  const hull = truthFacts(wreck({ markerId: 'pw', playerWreck: true, aftermath: { killerId: 7, victimLabel: 'Your Hull', t: 990 } }), st);
  assert.equal(hull.cause, 'y'); assert.equal(hull.label, 'Pilot hull'); assert.equal(markStyle(hull), 2); assert.match(truthLine(hull, 9), /Yours\./); assert.match(truthLine(hull, 9), /scoured/);
  const ledger = truthFacts(wreck({ markerId: 'L', provenance: { lossId: 'x', kind: 'trader', cargoHint: 'ore' }, wreckClass: 'debris' }), st);
  assert.equal(ledger.cause, 'l'); assert.equal(markStyle(ledger), 1); assert.match(truthLine(ledger, 3), /ledger/);
  const mil = truthFacts(wreck({ markerId: 'm', parentType: 'military', aftermath: { killerId: 4, victimLabel: 'Patrol Cutter', t: 0 } }), st);
  assert.equal(mil.restricted, true); assert.match(truthLine(mil, 3), /permit required/);
  const unknown = truthFacts(wreck({ markerId: 'u' }), st);
  assert.equal(unknown.cause, 'u'); assert.equal(markStyle(unknown), 3);
  assert.equal(truthLine(yours, 9), truthLine(yours, 9), 'same wreck, same words');
  assert.notEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(s => truthLine(yours, s))).size, 1, 'the seed varies the phrasing');
  assert.deepEqual(poolLines({ cmdty_scrap_metal: 3, cmdty_x: 0, cmdty_b: 9, bad: 'x' }), [{ label: 'b', n: 9 }, { label: 'scrap metal', n: 3 }]);
});

test('stillness is a physical fact: speed and spin both under the line', () => {
  assert.equal(stillness({ vel: { x: 2, z: 1 }, angVel: 0.1 }).still, true);
  assert.equal(stillness({ vel: { x: 5, z: 0 }, angVel: 0.1 }).still, false);
  assert.equal(stillness({ vel: { x: 0, z: 0 }, angVel: 0.8 }).still, false);
  assert.equal(stillness({ vel: { x: NaN, z: 0 }, angVel: 0 }).still, false);
  assert.equal(stillness({}).still, false);
  assert.ok(C.swingRadius * C.swingRate > C.stillSpeed * 2, 'unattended, the filing always swings faster than still');
});

test('left alone the marker waits: the swinging filing is never marked without a hand on a line (real Rapier)', async () => {
  const f = createRubricFixture(); await f.enablePhysics();
  f.scan(); f.run(40);
  const hull = f.system._hull(), body = f.system._body();
  assert.equal(f.state.rubric.f41, false); assert.equal(f.state.rubric.marks.length, 0);
  assert.equal(f.system._mode, 'work', 'it has come beside the filing');
  assert.ok(Math.hypot(body.pos.x - hull.pos.x, body.pos.z - hull.pos.z) < hull.radius + C.reach + 6, 'matching the hull\'s drift beside it');
  let slow = 0; for (let i = 0; i < 600; i++) { f.step(); if (speed(hull) <= C.stillSpeed) slow++; }
  assert.equal(slow, 0, 'the filing never held still on its own');
  assert.equal(f.state.rubric.f41, false); assert.equal(f.system._paintT, 0);
  f.destroy();
});

test('the first encounter, end to end on real Rapier: line on the filing, brake it to rest, the mark takes', async () => {
  const f = createRubricFixture(); await f.enablePhysics();
  f.run(1); f.scan(); f.run(20);
  const hull = () => f.system._hull();
  let lined = false;
  for (let i = 0; i < 60 * 14 && !lined; i++) {
    const dx = hull().pos.x - f.player.pos.x, dz = hull().pos.z - f.player.pos.z, d = Math.hypot(dx, dz);
    if (d > 40) f.thrust(dx, dz); else f.brake();
    f.step();
    if (d < 45) { assert.equal(f.grip(hull()).ok, true); lined = true; }
  }
  assert.equal(lined, true, 'the pilot reached the hull and put a line on it');
  const startedAt = f.state.simTime; let still = false;
  for (let i = 0; i < 60 * 70 && !f.state.rubric.f41; i++) {
    f.brake(); f.step();
    if (!still && f.system._paintT > 0) { still = true; assert.ok(speed(hull()) <= C.stillSpeed + 0.5, 'painting only began once the hull was at rest'); }
  }
  assert.equal(f.state.rubric.f41, true, `corrected within ${Math.round(f.state.simTime - startedAt)} s`);
  assert.ok(f.state.simTime - startedAt < 60);
  const m = f.state.rubric;
  assert.equal(m.witness, 1); assert.equal(m.marks.length, 1); assert.equal(m.marks[0].k, 'f41'); assert.match(m.marks[0].x, /NOT CLEARED/);
  assert.equal(m.paint, 1 - C.paintPerMark);
  assert.equal(hull().data.scanLabel, 'Hull F-41 · NOT CLEARED');
  const mark = f.system._marks.get('f41'); assert.equal(mark.data.rubricMark.progress, 1);
  const spoken = comms(f).map(p => p.text);
  for (const key of ['hello', 'brief', 'lineOn', 'still', 'f41']) assert.ok(spoken.includes(RUBRIC_LINES[key]), `spoke ${key}`);
  assert.ok(f.events.some(e => e[0] === 'comms' && e[1].channel === 'news'), 'the Gate story reaches the news channel');
  assert.equal(f.events.filter(e => e[0] === 'rubric:marked').length, 1);
  for (const p of comms(f)) assert.deepEqual(violatesRegister(p.text), [], p.text);
  f.run(30); assert.ok(speed(hull()) < 8, 'once corrected the filing settles instead of swinging');
  f.destroy();
});

test('wet paint: shake the hull and the mark smears and loses ground; hold it still and it takes. Marks name the hand.', () => {
  const f = createRubricFixture(afterF41());
  f.run(2);
  const body = f.system._body();
  const w = f.addWreck({ x: body.pos.x + 24, z: body.pos.z, markerId: 'aft_yours', killerId: f.player.id, label: 'Reaver Pirate', t: -100 });
  f.run(3);
  assert.equal(f.system._target?.key, 'aft_yours'); assert.equal(f.system._mode, 'work');
  for (let i = 0; i < 60 * 8 && f.system._paintT < 2.5; i++) f.step();
  assert.ok(f.system._paintT > 2 && f.system._paintT < C.paintSeconds, 'a hull at rest takes paint');
  const before = f.system._paintT;
  w.vel.x = 20; for (let i = 0; i < 90; i++) f.step();
  assert.ok(f.system._smear > 0.5, 'moving paint smears'); assert.ok(f.system._paintT < before, 'and loses ground');
  assert.ok(f.system._workMark.data.rubricMark.smear > 0);
  assert.equal(f.state.rubric.marks.length, 1, 'nothing was marked while it moved');
  w.vel.x = 0; f.run(12);
  assert.equal(f.state.rubric.marks.length, 2); const rec = f.state.rubric.marks[1];
  assert.equal(rec.k, 'aft_yours'); assert.equal(rec.c, 'p'); assert.equal(rec.s, 2); assert.match(rec.x, /you|yours/i);
  assert.match(w.data.scanLabel, /marked: yours/); assert.equal(w.data.rubricTruth, rec.x);
  assert.ok(said(f, rec.x), 'the truth is spoken'); f.run(8); assert.ok(said(f, 'Two lines mean the hand is known'));
  f.destroy();
});

test('spin keeps a hull a guess even at zero speed; a spinning hull is not marked until it turns slowly', () => {
  const f = createRubricFixture(afterF41()); f.run(2);
  const body = f.system._body();
  const w = f.addWreck({ x: body.pos.x + 24, z: body.pos.z, markerId: 'aft_spin', spin: 1.5, killerId: 7, t: -100 });
  f.run(10); assert.equal(f.system._paintT, 0); assert.ok(said(f, 'Still turning'));
  w.angVel = 0.2; f.run(8); assert.ok(f.state.rubric.marks.some(m => m.k === 'aft_spin'));
  f.destroy();
});

test('priorities: F-41 first; then your own hull, then your own kills, then the rest; tagged hulls are never re-marked', () => {
  const f = createRubricFixture({ ...freshRubricMemory(), met: true });
  f.run(2);
  const body = f.system._body();
  f.addWreck({ x: body.pos.x + 40, z: body.pos.z, markerId: 'aft_near', killerId: 7, t: -50 });
  f.addWreck({ x: body.pos.x - 200, z: body.pos.z + 100, markerId: 'aft_mine', killerId: f.player.id, t: -50 });
  f.run(3); assert.equal(f.system._target.key, 'f41', 'the filing comes before every other hull');
  f.state.rubric.f41 = true; f.state.rubric.marks.push({ k: 'f41', c: 'l', s: 1, x: 'F-41 done.', t: 1 }); f.system._tagged.add('f41'); f.system._retargetAt = 0; f.run(3);
  assert.equal(f.system._target.key, 'aft_mine', 'what you made outranks a nearer hull');
  f.addWreck({ x: body.pos.x + 150, z: body.pos.z - 150, markerId: 'pw_you', playerWreck: true, killerId: 7, label: 'Your Hull', t: -10 });
  f.system._retargetAt = 0; f.run(3);
  assert.equal(f.system._target.key, 'pw_you', 'your own hull outranks everything');
  f.system._tagged.add('pw_you'); f.system._tagged.add('aft_mine'); f.system._retargetAt = 0; f.run(3);
  assert.equal(f.system._target.key, 'aft_near');
  f.system._tagged.add('aft_near'); f.system._retargetAt = 0; f.run(3); assert.equal(f.system._target, null);
  const far = f.addWreck({ x: O.x + C.workRadius + 400, z: O.z, markerId: 'aft_far', killerId: 7, t: -1 });
  f.system._retargetAt = 0; f.run(3); assert.equal(f.system._target, null, 'out of the marker\'s range is out of its work');
  assert.equal(scoreTarget(far, { isPlayerHull: false, byPlayer: false, ageSeconds: 0 }, O, false, false), -Infinity);
  f.destroy();
});

test('your own hull: marked deliberately with the deliberate line, in your colour and your shape', () => {
  const f = createRubricFixture(afterF41()); f.run(2);
  const body = f.system._body();
  const w = f.addWreck({ x: body.pos.x + 24, z: body.pos.z, markerId: 'pw_1', playerWreck: true, killerId: 7, label: 'Your Hull', pool: {}, t: -20 });
  f.run(14);
  const rec = f.state.rubric.marks.find(m => m.k === 'pw_1');
  assert.ok(rec); assert.equal(rec.c, 'y'); assert.equal(rec.s, 2); assert.match(rec.x, /^Pilot hull\. Yours\./);
  f.run(8); assert.ok(said(f, RUBRIC_LINES.playerHull));
  assert.equal(w.data.scanLabel, 'Battle-scarred Hulk', 'the player-wreck label is never overwritten');
  f.destroy();
});

test('marks follow their wreck, and a wreck that comes back with the same marker id gets its mark back', () => {
  const f = createRubricFixture(afterF41({ witness: 2, marks: [afterF41().marks[0], { k: 'aft_old', c: 'o', s: 1, x: 'MTS Hauler. Killed by another hull.', t: 5 }] }));
  const w1 = f.addWreck({ x: O.x + 100, z: O.z + 100, vx: 5, markerId: 'aft_old', killerId: 7 });
  f.run(3);
  let mark = f.system._marks.get('aft_old'); assert.ok(mark, 'the saved mark materialized on its hull');
  assert.match(w1.data.scanLabel, /marked/); assert.equal(w1.data.rubricTruth, 'MTS Hauler. Killed by another hull.');
  f.run(2); assert.ok(Math.abs(mark.pos.x - w1.pos.x) < 3 && Math.abs(mark.pos.z - w1.pos.z) < 3, 'glued to the hull as it drifts');
  f.helpers.removeEntity(w1.id); f.run(2);
  assert.equal(f.system._marks.has('aft_old'), false, 'no hull, no mark entity');
  const w2 = f.addWreck({ x: O.x - 300, z: O.z + 50, markerId: 'aft_old', killerId: 7 }); f.run(3);
  mark = f.system._marks.get('aft_old'); assert.ok(mark); assert.ok(Math.abs(mark.pos.x - w2.pos.x) < 3);
  assert.match(w2.data.scanLabel, /marked/);
  f.destroy();
});

test('live mark entities are capped; the saved ring is the record', () => {
  const marks = [afterF41().marks[0], ...Array.from({ length: 14 }, (_, i) => ({ k: `aft_${i}`, c: 'l', s: 1, x: `Hull ${i}.`, t: i }))];
  const f = createRubricFixture(afterF41({ witness: 15, marks }));
  for (let i = 0; i < 14; i++) f.addWreck({ x: O.x + 60 + i * 30, z: O.z + 200, markerId: `aft_${i}` });
  f.run(3);
  assert.ok(alive(f, 'mark').length <= C.maxLiveMarks);
  assert.equal(f.state.rubric.marks.length, 15);
  f.destroy();
});

test('a foreign system relabelling the filing is undone by the next census; the hull cannot be stripped', () => {
  const f = createRubricFixture(); f.run(2);
  const hull = f.system._hull();
  hull.data.scanLabel = 'Wreck Debris'; hull.data.wreckClass = 'debris'; f.run(2);
  assert.equal(hull.data.scanLabel, 'Hull F-41 · filed CLEARED'); assert.equal(hull.data.wreckClass, 'battlefield');
  f.helpers.removeEntity(hull.id); f.run(C.recallSeconds + 3);
  assert.equal(alive(f, 'hull').length, 1, 'a filing does not close because the hull is gone');
  f.destroy();
});

test('danger: a hostile hull in range sends the marker home; it resumes when the contact leaves; shooting it is remembered', () => {
  const f = createRubricFixture(afterF41()); f.run(2);
  const body = f.system._body();
  const raider = f.helpers.spawnEntity({ type: 'ship', team: 1, pos: { x: body.pos.x + 150, z: body.pos.z }, vel: { x: 0, z: 0 }, radius: 5, mass: 30, hull: 80, hullMax: 80, data: { ai: { huntPlayer: true } } });
  assert.equal(isHostileToPlayer(raider, 0, f.state), true);
  f.run(1); assert.equal(f.system._mode, 'flee'); assert.ok(said(f, RUBRIC_LINES.flee)); assert.equal(f.state.rubric.wronged, 0, 'a raider is not the player');
  assert.equal(f.system._body().data.rubricPose.wheel, WHEEL.alarm);
  f.helpers.removeEntity(raider.id); f.run(C.fleeSeconds + 2);
  assert.notEqual(f.system._mode, 'flee'); assert.ok(said(f, RUBRIC_LINES.safe));
  f.damage(f.system._body(), 20);
  assert.equal(f.state.rubric.wronged, 1); assert.ok(said(f, RUBRIC_LINES.hit)); f.run(0.2); assert.equal(f.system._mode, 'flee');
  f.run(6); assert.ok(said(f, RUBRIC_LINES.wronged)); f.run(1);
  assert.equal(f.system._body().data.rubricPose.wheel, WHEEL.struck, 'the face strikes its own eyes after the player hurt it');
  assert.equal(f.state.rubric.hull, f.system._body().hull);
  f.destroy();
});

test('killing the marker is permanent, spoken once, saved, and leaves its marks standing', () => {
  const f = createRubricFixture(afterF41({ witness: 2, marks: [afterF41().marks[0], { k: 'aft_k', c: 'p', s: 2, x: 'Hull. Killed by you.', t: 4 }] }));
  const w = f.addWreck({ x: O.x + 60, z: O.z + 80, markerId: 'aft_k', killerId: f.player.id }); f.run(3);
  const body = f.system._body(); body.hull = 0; body.alive = false;
  f.bus.emit('entity:killed', { id: body.id }); f.run(2);
  assert.equal(f.state.rubric.destroyed, true); assert.equal(f.state.rubric.hull, 0);
  assert.ok(said(f, RUBRIC_LINES.dead)); assert.equal(f.events.filter(e => e[0] === 'rubric:destroyed').length, 1);
  f.system._sync(); f.run(3); assert.equal(alive(f, 'body').length, 0, 'it does not respawn');
  assert.equal(alive(f, 'hull').length, 1); assert.ok(f.system._marks.has('aft_k'), 'its marks outlive it'); assert.ok(w.alive);
  const saved = JSON.parse(JSON.stringify(f.system.serialize()));
  assert.equal(saved.destroyed, true);
  const g = createRubricFixture(saved); g.run(3); assert.equal(alive(g, 'body').length, 0); g.destroy(); f.destroy();
});

test('save: serialize and deserialize round-trip the marks, the paint, the told lines and the scar', () => {
  const f = createRubricFixture(afterF41({ wronged: 2, paint: 0.4, witness: 3, told: ['hello', 'f41', 'yours'], visits: 4,
    marks: [afterF41().marks[0], { k: 'aft_1', c: 'p', s: 2, x: 'A. Killed by you.', t: 9 }, { k: 'aft_2', c: 'u', s: 3, x: 'B. Cause not on file.', t: 10 }] }));
  f.run(2);
  const saved = JSON.parse(JSON.stringify(f.system.serialize()));
  assert.equal(saved.wronged, 2); assert.equal(saved.marks.length, 3); assert.deepEqual([...saved.told].sort(), ['f41', 'hello', 'yours']);
  const g = createRubricFixture(); g.system.deserialize(saved);
  assert.deepEqual(g.system.serialize(), saved, 'a loaded save serializes back to itself');
  g.run(2);
  assert.equal(g.system._body().data.rubricPose.wronged, 2);
  assert.ok(g.system._tagged.has('aft_2'));
  g.destroy(); f.destroy();
  const h = createRubricFixture(); h.system.newGame(); assert.deepEqual(h.state.rubric, freshRubricMemory()); h.destroy();
});

test('the last layer: after six corrections the marker asks to be held still itself; held, it marks HM-11 and goes dark for good', () => {
  const marks = [afterF41().marks[0], ...Array.from({ length: 5 }, (_, i) => ({ k: `aft_${i}`, c: 'l', s: 1, x: `Hull ${i}.`, t: i }))];
  const f = createRubricFixture(afterF41({ witness: C.lastAfter, marks, paint: 0.9 }));
  f.run(3);
  assert.equal(f.state.rubric.last, 'offered'); assert.equal(f.system._mode, 'offer'); assert.ok(said(f, RUBRIC_LINES.lastOffer));
  assert.ok(f.state.rubric.paint <= 0.2, 'the tank is nearly dry');
  f.run(60); assert.equal(f.events.filter(e => e[0] === 'comms' && e[1].text === RUBRIC_LINES.lastOffer).length, 1, 'asked once');
  assert.equal(f.state.rubric.last, 'offered', 'nobody is forced to hold it');
  fakeLine(f, f.system._body());
  f.run(C.paintSeconds + 2);
  const m = f.state.rubric;
  assert.equal(m.last, 'done'); assert.equal(f.system._mode, 'dark'); assert.ok(said(f, RUBRIC_LINES.lastStill)); assert.ok(said(f, RUBRIC_LINES.last));
  assert.ok(m.marks.some(x => x.k === 'self')); assert.equal(f.events.filter(e => e[0] === 'rubric:last').length, 1);
  assert.equal(f.system._body().data.rubricPose.wheel, WHEEL.blank); assert.equal(f.system._body().data.rubricPose.memorial, true);
  dropLine(f);
  f.scan(); assert.ok(said(f, RUBRIC_LINES.memorialScan));
  f.addWreck({ x: f.system._body().pos.x + 24, z: f.system._body().pos.z, markerId: 'aft_after', killerId: 7 }); f.run(15);
  assert.equal(f.state.rubric.marks.some(x => x.k === 'aft_after'), false, 'finished is finished');
  const g = createRubricFixture(JSON.parse(JSON.stringify(f.system.serialize()))); g.run(2);
  assert.equal(g.system._mode, 'dark'); assert.equal(g.state.rubric.last, 'done');
  g.destroy(); f.destroy();
});

test('a line on the marker with the hull still not at rest does not finish the last layer', () => {
  const marks = [afterF41().marks[0], ...Array.from({ length: 5 }, (_, i) => ({ k: `aft_${i}`, c: 'l', s: 1, x: `Hull ${i}.`, t: i }))];
  const f = createRubricFixture(afterF41({ witness: C.lastAfter, marks })); f.run(3);
  const body = f.system._body(); fakeLine(f, body); body.vel.x = 15;
  f.run(C.paintSeconds + 3); assert.equal(f.state.rubric.last, 'offered');
  f.destroy();
});

test('ambient testimony waits for a quiet pilot, never fires at the start, and never talks over a hint', () => {
  const f = createRubricFixture(afterF41()); f.run(C.quietSeconds - 5);
  assert.equal(comms(f).length, 0, 'nothing said before the pilot has been quiet for the whole wait');
  f.run(10); assert.equal(comms(f).length, 1); const first = comms(f)[0].text; assert.deepEqual(violatesRegister(first), []);
  f.run(C.quietSeconds * 0.8); assert.equal(comms(f).length, 1, 'one line per wait');
  f.player.vel.x = 80; f.run(C.quietSeconds * 2); assert.equal(comms(f).length, 1, 'a pilot at speed hears nothing');
  f.player.vel.x = 0; f.player.pos.x += 900; f.run(C.quietSeconds * 2); assert.equal(comms(f).length, 1, 'out of earshot hears nothing');
  f.destroy();
});

const parts = f => f.state.entityList.filter(e => e.alive && e.data?.rubricPart).length;

test('streaming: nothing is minted for a pilot outside the far-actor zone; it streams in and out with hysteresis and never flaps', () => {
  const f = createRubricFixture(); const exit = f.system._exitRadius();
  assert.ok(exit > 400);
  f.player.pos.x = O.x + exit + 400; f.player.pos.z = O.z; f.run(3);
  assert.equal(parts(f), 0, 'a far pilot costs nothing: no body, hull or mark is minted');
  let spawned = 0; f.bus.on('entity:spawned', () => spawned++);
  f.player.pos.x = O.x + exit - C.streamInMargin - 60; f.run(2); assert.equal(parts(f), 3, 'inside the stream-in radius the encounter appears');
  const afterIn = spawned;
  f.player.pos.x = O.x + exit - C.streamOutMargin - 40; f.run(3); assert.equal(parts(f), 3, 'inside the hysteresis band it stays');
  f.player.pos.x = O.x + exit - C.streamInMargin + 20; f.run(3); assert.equal(parts(f), 3, 'between the two radii it neither appears nor vanishes');
  assert.equal(spawned, afterIn, 'and nothing is re-minted while it stays');
  f.player.pos.x = O.x + exit - C.streamOutMargin + 40; f.run(2); assert.equal(parts(f), 0, 'past the stream-out radius it is withdrawn whole');
  f.player.pos.x = O.x + 200; f.run(2); assert.equal(parts(f), 3, 'and returns as one of each');
  f.destroy();
});

test('the marker only works hulls the far-actor table would also leave alone', () => {
  const f = createRubricFixture(afterF41()); const exit = f.system._exitRadius();
  f.player.pos.x = O.x + exit - C.streamInMargin - 20; f.player.pos.z = O.z; f.run(2);
  const out = f.addWreck({ x: O.x - 250, z: O.z, markerId: 'aft_out', killerId: f.player.id, t: -5 });
  f.system._retargetAt = 0; f.run(3);
  assert.equal(f.system._target, null, 'a hull beyond the far-actor radius of the pilot is out of its work');
  f.helpers.removeEntity(out.id);
  f.addWreck({ x: O.x + 150, z: O.z, markerId: 'aft_in', killerId: f.player.id, t: -5 });
  f.system._retargetAt = 0; f.run(3); assert.equal(f.system._target?.key, 'aft_in');
  f.destroy();
});

test('an anonymous shell promoted from a shelved far-actor row is removed by its owner stamp; the real parts stay singular', () => {
  const f = createRubricFixture(); f.run(2);
  const twin = f.helpers.spawnEntity({ type: 'drone', team: 2, pos: { x: O.x, z: O.z }, radius: 5, mass: 5, hull: 5, hullMax: 5, data: { persistenceOwner: 'rubric', homeSectorId: C.sectorId } });
  const stranger = f.helpers.spawnEntity({ type: 'drone', team: 2, pos: { x: O.x + 9, z: O.z }, radius: 5, mass: 5, hull: 5, hullMax: 5, data: { persistenceOwner: 'aftermathWrecks' } });
  f.run(2);
  assert.equal(twin.alive, false, 'our twin is cleaned up'); assert.equal(stranger.alive, true, 'and nobody else\'s entity is touched');
  assert.equal(parts(f), 3);
  f.destroy();
});

test('determinism: no ambient randomness, wall time or shared rng stream in any RUBRIC source', async () => {
  for (const file of ['src/systems/rubric.js', 'src/characters/rubricRules.js', 'src/data/rubric.js']) {
    const src = (await read(file)).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /Math\.random|Date\.now|performance\.now|state\.rng|new Date\(/, file);
  }
});

test('rubric update stays cheap with a crowded wreck field', () => {
  const f = createRubricFixture(afterF41()); f.run(2);
  for (let i = 0; i < 40; i++) f.addWreck({ x: O.x + (i % 8) * 80 - 300, z: O.z + Math.floor(i / 8) * 80 + 200, markerId: `aft_c${i}`, killerId: i % 2 ? 7 : f.player.id, vx: i % 5 });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 600; i++) f.system.update(1 / 60);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1500, `600 ticks with 40 wrecks took ${ms.toFixed(0)} ms`);
  f.destroy();
});
