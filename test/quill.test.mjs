// test/quill.test.mjs — QUILL / AR-3 / row 506 member 9 (03 §4.3).
// The deserter page-drone copies scanned wrecks parked in its read ring: the
// copy stamp rides the hull, one sealed page opens per new log, in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUILL } from '../src/data/quill.js';
import { quillCopyable, quillNextSecret, quillSecretAt, quillDriftHome } from '../src/characters/quillRules.js';
import { createQuill, quillSpec } from '../src/systems/quill.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

function fixture({ sector = 'sector_triton_wake', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const player = { id: 7, alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    tick: 60,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const helpers = {
    spawnEntity(spec) {
      const e = { id: 900 + state.entityList.length, alive: true, ...spec };
      state.entityList.push(e); state.entities.set(e.id, e); return e;
    },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createQuill();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, sys, player };
}

const robot = (state) => state.entityList.find((e) => e.alive && e.data?.quill);
const says = (popups, prefix) => popups.filter((p) => String(p.id).startsWith(prefix));
const impulses = (entity) => {
  const cmds = consumePhysicsCommand(entity);
  return cmds && cmds.impulses ? cmds.impulses.splice(0) : [];
};
let wreckSeq = 0;
const put = (state, e) => { state.entityList.push(e); state.entities.set(e.id, e); return e; };
const scannedWreck = (state, { at = QUILL.post, speed = 0 } = {}) => put(state, {
  id: 500 + (wreckSeq++), alive: true, type: 'wreck',
  pos: { x: at.x + 12, z: at.z - 8 },
  vel: { x: speed, z: 0 },
  radius: 16, mass: 80, hull: 0, hullMax: 200,
  data: { scanRevealed: { discovery: 'hulk' }, markerId: `wreck_${wreckSeq}` },
});

test('spec + spawn: the drone on the tithe rim, in sector only, one hail per visit', () => {
  const s = quillSpec();
  assert.equal(s.data.quill, true);
  assert.equal(s.data.authoredCharacter, 'quill');
  assert.equal(s.data.homeSectorId, 'sector_triton_wake');
  assert.equal(s.data.scannerSignalKind, 'archive');
  const { state, popups } = fixture();
  assert.ok(robot(state));
  const hail = says(popups, 'quill_announce');
  assert.equal(hail.length, 1);
  assert.match(hail[0].text, /scanner has read/);
  assert.equal(fixture({ runKind: 'survival' }).state.entityList.filter((e) => e.data?.quill).length, 0);
  assert.equal(fixture({ sector: 'sector_io_reach' }).state.entityList.filter((e) => e.data?.quill).length, 0);
});

test('a scanned wreck settled in the ring is copied — stamp rides the hull, a page opens', () => {
  const { state, popups, sys } = fixture();
  const w = scannedWreck(state);
  sys.update(0.5, state);
  assert.equal(w.data.quillCopied, true, 'the copy travels with the body');
  assert.equal(state.story.flags.quill_copied, 1);
  assert.equal(says(popups, 'quill_secret_0').length, 1);
  assert.match(says(popups, 'quill_secret_0')[0].text, /SEALED PAGE 1/);
  assert.equal(w.alive, true, 'the drone reads — it never keeps the hull');
});

test('an unread wreck is not a log; a screaming pass is not a delivery', () => {
  const { state, sys } = fixture();
  const unread = put(state, {
    id: 610, alive: true, type: 'wreck',
    pos: { x: QUILL.post.x + 10, z: QUILL.post.z }, vel: { x: 0, z: 0 },
    radius: 16, mass: 80, hull: 0, hullMax: 200, data: {},
  });
  const flyby = scannedWreck(state, { speed: 300 });
  sys.update(0.5, state);
  assert.equal(state.story.flags.quill_copied == null, true, 'nothing counted');
  assert.equal(unread.data.quillCopied == null, true);
  assert.equal(flyby.data.quillCopied == null, true, 'a flyby never gets read');
});

test('a copied wreck can never be copied twice — the stamp is the ledger', () => {
  const { state, sys } = fixture();
  const w = scannedWreck(state);
  sys.update(0.5, state);
  assert.equal(state.story.flags.quill_copied, 1);
  sys.update(0.5, state);
  sys.update(0.5, state);
  assert.equal(state.story.flags.quill_copied, 1, 'quiet passes never re-copy');
  const w2 = scannedWreck(state);
  sys.update(0.5, state);
  assert.equal(state.story.flags.quill_copied, 2, 'a NEW log opens the next page');
  assert.equal(w2.data.quillCopied, true);
});

test('the Archive runs out in order — the last page speaks the mastery line', () => {
  const { state, popups, sys } = fixture();
  for (let i = 0; i < QUILL.secrets.length; i += 1) scannedWreck(state);
  for (let i = 0; i < QUILL.secrets.length; i += 1) sys.update(0.5, state);
  assert.equal(state.story.flags.quill_copied, QUILL.secrets.length);
  assert.equal(says(popups, 'quill_mastery').length, 1);
  assert.match(says(popups, 'quill_mastery')[0].text, /SMALLER THAN THE DARK/);
  // Pages in order: page i's text is secrets[i].
  for (let i = 0; i < QUILL.secrets.length; i += 1) {
    assert.match(says(popups, `quill_secret_${i}`)[0].text, new RegExp(`SEALED PAGE ${i + 1}`));
  }
  // The Archive is empty: a fresh log gets a copy stamp but opens nothing.
  const extra = scannedWreck(state);
  sys.update(0.5, state);
  assert.equal(extra.data.quillCopied == null, true, 'no pages left — nothing to copy for');
});

test('kill the drone: the copies stay copied, the ring goes quiet', () => {
  const { state, bus, popups, sys } = fixture();
  const w = scannedWreck(state);
  sys.update(0.5, state);
  const r = robot(state);
  r.alive = false;
  bus.emit('entity:killed', { id: r.id, killerId: 7 });
  bus.emit('entity:killed', { id: r.id, killerId: 7 });
  assert.equal(state.story.flags.quill_gone, true);
  assert.equal(says(popups, 'quill_gone').length, 1, 'the last line fires once');
  bus.emit('sector:enter', { sectorId: QUILL.sectorId });
  assert.equal(robot(state), undefined, 'the deserter never comes back twice');
  assert.equal(w.data.quillCopied, true, 'the copy outlives the copier');
  const fresh = scannedWreck(state);
  sys.update(0.5, state);
  assert.equal(fresh.data.quillCopied == null, true, 'no drone, no reader');
});

test('sector leave removes the drone; a re-visit hails again', () => {
  const { state, bus, popups } = fixture();
  assert.equal(says(popups, 'quill_announce').length, 1);
  state.world.currentSectorId = 'sector_io_reach';
  bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  assert.equal(robot(state), undefined);
  state.world.currentSectorId = QUILL.sectorId;
  bus.emit('sector:enter', { sectorId: QUILL.sectorId });
  assert.ok(robot(state));
  assert.equal(says(popups, 'quill_announce').length, 2, 'a returning pilot hears the ask again');
});

test('drift-home: a shoved drone walks back through the impulse membrane', () => {
  const { state, sys } = fixture();
  const r = robot(state);
  r.pos = { x: QUILL.post.x + 400, z: QUILL.post.z };
  r.vel = { x: 0, z: 0 };
  sys.update(0.5, state);
  const go = impulses(r);
  assert.equal(go.length, 1, 'station-keeping is a queued impulse');
  assert.ok(go[0].x < 0, 'the impulse points home');
});

test('pure rules: copyable gate, page index, drift-home', () => {
  const logged = { alive: true, type: 'wreck', pos: { ...QUILL.post }, vel: { x: 0, z: 0 }, data: { scanRevealed: { discovery: 'hulk' }, markerId: 'm1' } };
  assert.equal(quillCopyable(logged), true);
  assert.equal(quillCopyable({ ...logged, data: { markerId: 'm1' } }), false,
    'a birth-stamped aftermath marker is not a scanner read');
  assert.equal(quillCopyable({ ...logged, data: { quillCopied: true } }), false);
  assert.equal(quillCopyable({ ...logged, type: 'debris' }), false, 'only wrecks are logs');
  assert.equal(quillCopyable({ ...logged, data: {} }), false, 'unscanned is not a log');
  assert.equal(quillNextSecret(0), 0);
  assert.equal(quillNextSecret(QUILL.secrets.length), -1);
  assert.equal(quillSecretAt(0), QUILL.secrets[0]);
  assert.equal(quillSecretAt(-1), null);
  const dv = quillDriftHome({ pos: { x: QUILL.post.x + 200, z: QUILL.post.z }, vel: { x: 0, z: 0 } });
  assert.ok(dv && dv.x < 0);
  assert.equal(quillDriftHome({ pos: { ...QUILL.post }, vel: { x: 0, z: 0 } }), null);
});

test('destroy + re-init: provider and the drone hull clean', () => {
  const { state, helpers, sys } = fixture();
  assert.equal(helpers.sectorCookProviders.length, 1);
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, 0);
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.quill).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(helpers.sectorCookProviders.length, 1);
  assert.ok(robot(state));
});
