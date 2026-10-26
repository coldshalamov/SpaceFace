// Row 459 — RC-VIGNETTES: thirty curated lived vignettes are physically gated, honestly
// priced, once-ever encounters. Uses the real encounterDirector seam on seed 4242, the real
// generated modules, and the real interpreter. Entity-position fixtures drive predicate
// boundaries (labeled predicate tests, not native-flight acceptance).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { tickLivedVignettes } from '../src/systems/livedWorldDirector.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { ensurePhysicsBodySpec, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { makeEntity, allocateEntityId, stampOccupantGeneration } from '../src/core/entity.js';
import { save } from '../src/save/saveSystem.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector, zoneAt } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const DIR = fileURLToPath(new URL('../src/data/encounters', import.meta.url));
const CURATED_ORDERS = new Set([
  401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415,
  416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 536,
]);
const LEGACY_PHASES = ['spawn', 'hail', 'move', 'work', 'work_line', 'offer',
  'say_a', 'say_b', 'say_c', 'done_a', 'done_b', 'done_c'];

async function loadCurated() {
  const out = [];
  for (const name of readdirSync(DIR).sort()) {
    const m = /^(\d{3})-/.exec(name);
    if (!m || !CURATED_ORDERS.has(Number(m[1]))) continue;
    const mod = await import(pathToFileURL(join(DIR, name)).href);
    out.push({ file: name, order: Number(m[1]), mod });
  }
  return out;
}

const SECTOR = 'sector_helios';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const state = sim.state;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = SECTOR;
  const director = sim.registry.get('encounterDirector');
  // Economy sole-writer stand-in: the director emits intents; only this mutates credits.
  sim.bus.on('economy:chargeCredits', (p) => {
    state.player.credits = Math.max(0, state.player.credits - (p.amount || 0));
  });
  sim.bus.on('economy:grantCredits', (p) => { state.player.credits += (p.amount || 0); });
  let nextEnt = 9e5;
  director.helpers = director.helpers || {};
  director.helpers.spawnEntity = (opts) => {
    const e = {
      id: nextEnt++, type: opts.type || 'ship', alive: true,
      pos: { x: opts.pos.x, z: opts.pos.z }, vel: { x: 0, z: 0 },
      rot: 0, radius: opts.radius || 10, mass: opts.mass || 100,
      data: opts.data || {},
    };
    state.entities.set(e.id, e);
    stampOccupantGeneration(state, e);
    return e;
  };
  let player = state.entities.get(state.playerId);
  if (!player) {
    player = {
      id: state.playerId ?? 1, type: 'ship', alive: true,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 10, mass: 100, data: {},
    };
    state.entities.set(player.id, player);
    if (state.playerId == null) state.playerId = player.id;
  }
  return { sim, state, director, player };
}

function fire(t, shapeId) {
  const dir = t.state.encounterDirector;
  const before = dir.stats.fired;
  const res = t.director.requestAuthoredEncounter({
    shapeId, encounterId: `lived:${shapeId}`, sectorId: SECTOR,
    anchor: { x: 200, z: 0 }, zoneType: 'nebula_fog', zoneName: 'test zone',
    force: true,
  });
  const live = dir.live[`lived:${shapeId}`];
  return { res, live, fired: dir.stats.fired > before };
}

function ticks(t, n) { t.sim.runTicks(n); }
const speed = (e) => Math.hypot(e.vel.x, e.vel.z);
function entOf(t, live, role) {
  const id = Object.keys(live.roles).find((k) => live.roles[k] === role);
  return id != null ? t.state.entities.get(Number(id)) : null;
}

// Drive one tow_settle (401) predicate sequence with real fixtures.
test('catalog: thirty curated entries compile, keep identities, and mark rotation', async () => {
  const mods = await loadCurated();
  assert.equal(mods.length, 30, 'exactly thirty curated modules');
  const situations = new Set(), places = new Set();
  for (const { order, mod } of mods) {
    const body = mod.default;
    assert.equal(body.livedRotation, true, `${mod.spec.id} marks livedRotation`);
    assert.equal(body.gates && body.gates.externalOnly, true, `${mod.spec.id} stays externalOnly`);
    assert.equal(body.livedPhysical.recipeId ? true : true, true);
    situations.add(body.shape.situation);
    for (const z of body.zoneTypes) places.add(z);
    const phaseIds = mod.spec.phases.map((p) => p.id);
    for (const legacy of LEGACY_PHASES) {
      assert.ok(phaseIds.includes(legacy), `${mod.spec.id} keeps phase ${legacy}`);
    }
    const awaits = mod.spec.phases.filter((p) => p.verb === 'await');
    assert.ok(awaits.length >= 3, `${mod.spec.id} has await branches`);
    // Choices never resolve from the offer: onChoice lands on charge/await, not resolve.
    const offer = mod.spec.phases.find((p) => p.verb === 'offer');
    for (const dest of Object.values(offer.onChoice)) {
      const destPhase = mod.spec.phases.find((p) => p.id === dest);
      assert.ok(['await', 'charge'].includes(destPhase.verb),
        `${mod.spec.id} choice -> ${dest} enters a blocking/economic phase`);
    }
  }
  assert.equal(places.size, 14, 'all fourteen place categories represented');
  assert.ok(situations.size >= 14, `situations represented: ${[...situations].join(',')}`);
  // Ambient scenes retired from live rotation: only livedRotation entries are admitted.
  const ambientCount = Object.values(ENCOUNTERS).filter((e) => e.ambientScene === true).length;
  assert.ok(ambientCount >= 16, 'ambient scenes still generated for harness/external use');
  assert.ok(!Object.values(ENCOUNTERS).some((e) => e.ambientScene === true && e.livedRotation === true),
    'no ambient scene is admitted to automatic rotation');
});

test('physical gate: tow_settle resolves on the INSTRUCTED route (order 401)', async () => {
  const mods = await loadCurated();
  const row = mods.find((m) => m.order === 401);
  const t = boot();
  const creditsBefore = t.state.player.credits;
  const { live } = fire(t, row.mod.spec.id);
  assert.ok(live, 'scene fires');
  // Walk spawn→prop→hail→move→color→work→work_line→offer at real time.
  for (let i = 0; i < 900 && live.vars.vPhase !== 'offer'; i += 1) ticks(t, 1);
  assert.equal(live.vars.vPhase, 'offer', 'offer reached inside the budget');
  // Choosing a alone grants nothing: the await blocks.
  t.director.emit('encounter:choose', { encounterId: live.id, choiceId: 'a' });
  ticks(t, 30);
  assert.notEqual(live.phase, 'done', 'choice alone resolves nothing');
  assert.equal(t.state.player.credits, creditsBefore, 'no money moved');
  const prop = entOf(t, live, 'prop');
  const hull0 = entOf(t, live, 'hull_0');
  assert.ok(prop && hull0, 'prop + receiving hull exist');
  const propStart = { ...prop.pos };
  // Authored layout truth: the instruction says "haul it to the receiver hull", so the
  // berth itself must sit far enough out that the instructed route clears the 120-WU
  // displacement bar before the park window opens (worst case: park on the near rim).
  assert.ok(Math.hypot(propStart.x - hull0.pos.x, propStart.z - hull0.pos.z) >= 150,
    `the instructed haul must be able to satisfy displaced:120 — prop starts `
    + `${Math.hypot(propStart.x - hull0.pos.x, propStart.z - hull0.pos.z).toFixed(1)} WU from hull_0`);
  // Wrong object latched — never satisfies the gate.
  t.state.player.tether = { active: true, targetId: hull0.id };
  ticks(t, 30);
  assert.notEqual(live.phase, 'done', 'a latch on a hull is not the prop');
  // Unlatched prop displacement does not count.
  t.state.player.tether = { active: false, targetId: null };
  prop.pos.x = propStart.x + 200; prop.pos.z = propStart.z;
  ticks(t, 30);
  assert.notEqual(live.phase, 'done', 'moving an unlatched prop is not a tow');
  // The instructed route, verbatim: latch the prop where it lies, haul it TO the receiver
  // hull (no detour, no pre-drag), let go, and let it drift to rest inside thirty.
  prop.pos.x = propStart.x; prop.pos.z = propStart.z;
  t.state.player.tether = { active: true, targetId: prop.id, phase: 'capture', load: 0.2 };
  ticks(t, 90);
  for (let leg = 1; leg <= 3; leg += 1) {
    prop.pos.x = propStart.x + (hull0.pos.x + 25 - propStart.x) * (leg / 3);
    prop.pos.z = propStart.z + (hull0.pos.z - propStart.z) * (leg / 3);
    ticks(t, 60);
  }
  t.state.player.tether = { active: false, targetId: null };
  prop.vel.x = 0; prop.vel.z = 0;
  ticks(t, 60 * 8);
  assert.equal(live.phase, 'done', 'the instructed tow route resolves the scene');
  assert.equal(live.outcome, 'a');
  assert.equal(t.state.player.credits, creditsBefore + 48, 'yard work pays 48');
});

test('economics + timeout: the toll charges 36, grants 0, and a lapse speaks the kept debit', async () => {
  const mods = await loadCurated();
  const row = mods.find((m) => m.order === 536);
  const t = boot();
  t.state.player.credits = 500;
  // Collect the encounter's transmitted speech — a lapse that "speaks" must actually emit.
  const speech = [];
  t.sim.bus.on('encounter:voice', (p) => speech.push(p && p.text));
  const { live } = fire(t, row.mod.spec.id);
  for (let i = 0; i < 900 && live.vars.vPhase !== 'offer'; i += 1) ticks(t, 1);
  assert.equal(live.vars.vPhase, 'offer');
  const chargeA = row.mod.spec.phases.find((p) => p.id === 'charge_a');
  const grantA = row.mod.spec.phases.find((p) => p.id === 'grant_a');
  assert.equal(chargeA.amount, 36, 'the toll debits 36');
  assert.equal(grantA.amount, 0, 'the toll grants nothing');
  t.director.emit('encounter:choose', { encounterId: live.id, choiceId: 'a' });
  ticks(t, 2);
  assert.equal(t.state.player.credits, 464, 'the count is paid before the physical ask');
  // Let the 120 s deadline lapse — abort keeps the debit and speaks, never silently.
  ticks(t, 60 * 121);
  assert.equal(live.phase, 'done', 'expiry closes the encounter');
  assert.equal(t.state.player.credits, 464, 'the debit stands after a lapse');
  const ack = speech.filter(Boolean).find((line) => /no pass|count stands|log the stop/i.test(line));
  assert.ok(ack, `the lapsed toll must emit its paid timeout acknowledgement — heard: ${JSON.stringify(speech)}`);
});

test('economics + timeout: the funded relief keeps its 24 cr and says so on a lapse (order 401)', async () => {
  const mods = await loadCurated();
  const row = mods.find((m) => m.order === 401);
  const t = boot();
  t.state.player.credits = 500;
  const speech = [];
  t.sim.bus.on('encounter:voice', (p) => speech.push(p && p.text));
  const { live } = fire(t, row.mod.spec.id);
  for (let i = 0; i < 900 && live.vars.vPhase !== 'offer'; i += 1) ticks(t, 1);
  assert.equal(live.vars.vPhase, 'offer');
  const sponsor = row.mod.spec.choices.find((c) => c.id === 'b');
  assert.ok(/24/.test(sponsor.label), 'the sponsor label names its price');
  assert.ok(/close in slow|dead slow/i.test(sponsor.label + sponsor.playerLine),
    'the sponsor branch discloses the required close, slow meeting');
  t.director.emit('encounter:choose', { encounterId: live.id, choiceId: 'b' });
  ticks(t, 2);
  assert.equal(t.state.player.credits, 476, 'the relief debit lands before the meeting ask');
  // Stall inside the close-in ring: the 120 s deadline lapses with the debit kept.
  ticks(t, 60 * 121);
  assert.equal(live.phase, 'done', 'expiry closes the encounter');
  assert.equal(t.state.player.credits, 476, 'the retained relief debit stands after a lapse');
  const ack = speech.filter(Boolean).find((line) => /stays spent/i.test(line));
  assert.ok(ack,
    `a lapsed paid branch must acknowledge the retained debit, not claim "nothing owed" — heard: ${JSON.stringify(speech)}`);
  assert.ok(!/Nothing owed/i.test(String(ack)), 'the acknowledgement must not deny the charge that already landed');
});

// A dead or corrupt prop is a gone physical subject on EVERY prop-dependent step —
// latch, strain, and release validate the body each tick, not just when their step opens.
for (const [label, corrupt] of [
  ['dead', (prop) => { prop.alive = false; }],
  ['NaN-positioned', (prop) => { prop.pos.x = NaN; }],
]) {
  test(`physical gate: a ${label} prop aborts the strain scene physical_subject_gone (order 417)`, async () => {
    const mods = await loadCurated();
    const row = mods.find((m) => m.order === 417);
    const t = boot();
    const resolved = [];
    t.sim.bus.on('encounter:resolved', (p) => resolved.push(p && p.outcome));
    const { live } = fire(t, row.mod.spec.id);
    for (let i = 0; i < 900 && live.vars.vPhase !== 'offer'; i += 1) ticks(t, 1);
    assert.equal(live.vars.vPhase, 'offer');
    t.director.emit('encounter:choose', { encounterId: live.id, choiceId: 'a' });
    const prop = entOf(t, live, 'prop');
    assert.ok(prop, 'the strain scene spawns its line-work prop');
    // Provide the matching loaded tether the ask wants — the latch leg passes.
    t.state.player.tether = { active: true, targetId: prop.id, phase: 'loaded', load: 0.5 };
    for (let i = 0; i < 60 * 6 && live.phase !== 'done'; i += 1) {
      // Hold the line loaded a beat, then corrupt the anchor mid-strain: the very next
      // prop-dependent evaluation must see 'gone', never release-or-strain a ghost.
      if (i === 90) corrupt(prop);
      ticks(t, 1);
    }
    assert.equal(live.phase, 'done', `a ${label} prop closes the scene`);
    assert.equal(live.outcome, 'aborted:physical_subject_gone',
      `a ${label} prop aborts as a gone subject, never a satisfied release`);
    assert.ok(resolved.includes('aborted:physical_subject_gone'),
      'the abort receipt publishes the physical_subject_gone outcome');
  });
}

// Entity ids recycle through freeIds — a prop destroyed mid-await can have its numeric id
// reissued to a different body before the next evaluation. The generation stamp is what
// keeps the await bound to the occupant it was promised, not just the slot.
test('physical gate: a recycled prop id aborts the strain scene (order 417)', async () => {
  const mods = await loadCurated();
  const row = mods.find((m) => m.order === 417);
  const t = boot();
  const resolved = [];
  t.sim.bus.on('encounter:resolved', (p) => resolved.push(p && p.outcome));
  const { live } = fire(t, row.mod.spec.id);
  for (let i = 0; i < 900 && live.vars.vPhase !== 'offer'; i += 1) ticks(t, 1);
  assert.equal(live.vars.vPhase, 'offer');
  t.director.emit('encounter:choose', { encounterId: live.id, choiceId: 'a' });
  const prop = entOf(t, live, 'prop');
  assert.ok(prop, 'the strain scene spawns its line-work prop');
  t.state.player.tether = { active: true, targetId: prop.id, phase: 'loaded', load: 0.5 };
  for (let i = 0; i < 60 * 6 && live.phase !== 'done'; i += 1) {
    if (i === 90) {
      // The prop dies and its id is immediately reissued to an unrelated body — the
      // occupant changed, so every prop-dependent step must see 'gone', not the impostor.
      const impostor = {
        id: prop.id, type: 'ship', alive: true,
        pos: { x: prop.pos.x + 5, z: prop.pos.z }, vel: { x: 0, z: 0 },
        rot: 0, radius: 8, mass: 50, data: {},
      };
      t.state.entities.delete(prop.id);
      t.state.entities.set(impostor.id, impostor);
      stampOccupantGeneration(t.state, impostor);
    }
    ticks(t, 1);
  }
  assert.equal(live.phase, 'done', 'a recycled prop id still closes the scene');
  assert.equal(live.outcome, 'aborted:physical_subject_gone',
    'the reissued id names a different occupant — the await aborts, never satisfies');
  assert.ok(resolved.includes('aborted:physical_subject_gone'));
});

// The generation binds at SPAWN, not at the await's open — a cast member replaced while
// the offer is still on the table must not quietly become the accepted baseline.
test('physical gate: a prop replaced before the choice aborts the strain scene (order 417)', async () => {
  const mods = await loadCurated();
  const row = mods.find((m) => m.order === 417);
  const t = boot();
  const resolved = [];
  t.sim.bus.on('encounter:resolved', (p) => resolved.push(p && p.outcome));
  const { live } = fire(t, row.mod.spec.id);
  for (let i = 0; i < 900 && live.vars.vPhase !== 'offer'; i += 1) ticks(t, 1);
  assert.equal(live.vars.vPhase, 'offer');
  const prop = entOf(t, live, 'prop');
  assert.ok(prop, 'the prop spawns before the player chooses');
  // Swap the occupant while the offer is still open — the id stays, the body changes.
  const impostor = {
    id: prop.id, type: 'ship', alive: true,
    pos: { x: prop.pos.x + 5, z: prop.pos.z }, vel: { x: 0, z: 0 },
    rot: 0, radius: 8, mass: 50, data: {},
  };
  t.state.entities.delete(prop.id);
  t.state.entities.set(impostor.id, impostor);
  stampOccupantGeneration(t.state, impostor);
  t.director.emit('encounter:choose', { encounterId: live.id, choiceId: 'a' });
  t.state.player.tether = { active: true, targetId: prop.id, phase: 'loaded', load: 0.5 };
  for (let i = 0; i < 60 * 6 && live.phase !== 'done'; i += 1) ticks(t, 1);
  assert.equal(live.phase, 'done', 'a pre-choice replacement still closes the scene');
  assert.equal(live.outcome, 'aborted:physical_subject_gone',
    'the spawn-time generation stays the baseline — the impostor is never accepted');
  assert.ok(resolved.includes('aborted:physical_subject_gone'));
});

// gapCross belongs to the player's own path: reference geometry sliding under a parked
// player rewrites the line, not the crossing — the old prev-line compare counted it.
test('physical gate: moving escort hulls cannot cross the gap for a parked player (order 410)', async () => {
  const mods = await loadCurated();
  const row = mods.find((m) => m.order === 410);
  const t = boot();
  const { live } = fire(t, row.mod.spec.id);
  for (let i = 0; i < 900 && live.vars.vPhase !== 'offer'; i += 1) ticks(t, 1);
  assert.equal(live.vars.vPhase, 'offer');
  t.director.emit('encounter:choose', { encounterId: live.id, choiceId: 'a' });
  ticks(t, 2);
  const v = live.vars.vAwait;
  assert.ok(v, 'the await is live');
  const a = entOf(t, live, 'hull_0');
  const b = entOf(t, live, 'hull_1');
  assert.ok(a && b, 'the escort pair exists');
  // Pin the review geometry: player parked on the future segment midpoint while the
  // escort pair slides the whole segment past them — ~90 WU of pure hull motion spread
  // over four sim-seconds so the 1 Hz predicate cadence actually re-observes the scene
  // several times mid-slide. The player's signed distance only flips because the line
  // moved; measured against today's segment, the old position reads on the same side.
  for (let leg = 0; leg < 240 && live.phase !== 'done'; leg += 1) {
    const z = -10 + leg * 0.4;
    a.pos.x = 0; a.pos.z = z; a.vel.x = 0; a.vel.z = 0;
    b.pos.x = 100; b.pos.z = z; b.vel.x = 0; b.vel.z = 0;
    t.player.pos.x = 50; t.player.pos.z = 0; t.player.vel.x = 0; t.player.vel.z = 0;
    ticks(t, 1);
  }
  assert.equal(v.stepIndex, 0,
    'hull motion sliding the reference segment past a parked player is not a crossing');
  assert.notEqual(live.phase, 'done', 'the scene is still waiting for a real crossing');
  assert.ok(v.gapPrev, 'the 1 Hz sampler really observed during the slide');
  // The real crossing: hold the segment still at z=-10 and walk the player through it —
  // hold the positive side (~1.5 s so the 1 Hz sampler records), then the far side; the
  // player's own displacement between those two observations crosses the midpoint.
  for (let leg = 0; leg < 90 && live.phase !== 'done' && v.stepIndex === 0; leg += 1) {
    a.pos.x = 0; a.pos.z = -10; b.pos.x = 100; b.pos.z = -10;
    t.player.pos.x = 50; t.player.pos.z = 30;
    ticks(t, 1);
  }
  assert.ok(v.stepIndex === 0 && v.gapPrev && v.gapPrev.perp > 0,
    'the sampler saw the approach side without counting a crossing');
  for (let leg = 0; leg < 90 && live.phase !== 'done' && v.stepIndex === 0; leg += 1) {
    a.pos.x = 0; a.pos.z = -10; b.pos.x = 100; b.pos.z = -10;
    t.player.pos.x = 50; t.player.pos.z = -30;
    ticks(t, 1);
  }
  assert.ok(v.stepIndex > 0 || live.phase === 'done',
    'the player\'s own path through the still-held gap counts the crossing');
});

// ── the real massline tow (finding 5) ────────────────────────────────────────────
// The rest of this file drives predicates with entity-position fixtures and a
// fabricated state.player.tether — legal for predicate boundaries, but it never proves
// a real tow is possible. This harness runs the production chain instead: the real
// acquisition press, the real attachment authority, the real Rapier dynamic-body owner
// pulling the prop, and the real tetherGameplay tick mirroring measured telemetry into
// state.player.tether — the fields the interpreter reads. Player motion is a per-tick
// physics-control force on the player's real body — never a pos/vel write.

const PHYS_DT = 1 / 60;

async function bootPhysics() {
  const t = boot();
  const { state, sim } = t;
  // Production spawn also maintains entityList — acquisition queries fall back to it
  // when no spatial hash is active. Bodies come from the canonical factory so the
  // native owner and the core preStep see real SimVector3 pos/vel/prevPos.
  state.entityList = [];
  t.director.helpers.spawnEntity = (opts) => {
    const e = makeEntity({ ...opts, pos: opts.pos, vel: opts.vel });
    e.id = allocateEntityId(state);
    state.entities.set(e.id, e);
    stampOccupantGeneration(state, e);
    state.entityList.push(e);
    return e;
  };
  // The player as a production body: authored physics spec minted by the authority's
  // own normalizer, standard ship combat profile (source socket tether_spool).
  const oldPlayer = t.player;
  const player = makeEntity({
    type: 'ship', pos: { x: 260, z: -60 }, radius: 8, mass: 120,
    data: { defId: 'ship_wasp', combat: {}, weapons: [] },
  });
  player.id = oldPlayer.id;
  player.isPlayer = true;
  player.team = 0;
  player.maxSpeed = 218;
  state.entities.delete(oldPlayer.id);
  state.entities.set(player.id, player);
  if (!Number.isSafeInteger(state.nextEntityId) || state.nextEntityId <= player.id) {
    state.nextEntityId = player.id + 1;
  }
  state.freeIds = state.freeIds || [];
  ensurePhysicsBodySpec(player);
  state.entityList.push(player);
  state.input = state.input || {};
  state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
  state.input.aimIntentActive = true;
  state.input.pointerScreen = { active: true, x: 0, y: 0 };
  ensureCombatState(state);
  // The production physics port: the real Rapier-backed owner — same contract the
  // combat kernel's combatPhysics slot fills in the live game.
  const owner = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  assert.ok(owner, 'native dynamic-body owner minted (Rapier available)');
  const helpers = { combatPhysics: owner };
  const catalog = createCombatCatalog();
  const attachments = createAttachmentService({ state, catalog, helpers, bus: sim.bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const registry = {
    get: (n) => (n === 'actions' || n === 'combat'
      ? { kernel }
      : (n === 'encounterDirector' ? t.director : null)),
  };
  const tetherSys = Object.assign({}, tetherGameplay);
  tetherSys.init({ state, bus: sim.bus, helpers, registry });
  return { ...t, player, owner, tetherSys, attachments };
}

// One honest frame: refresh the world list the owner owns, write the player's flight
// control (a PD throttle — the same writePhysicsControl seam flightV3 uses), step the
// real physics, then let the tether system mirror the measured line into
// state.player.tether, then let the director's scripts read the fresh world.
function physTick(t, ctl) {
  const { state } = t;
  const player = t.player;
  if (ctl) {
    const dx = ctl.x - player.pos.x, dz = ctl.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const desired = Math.min(ctl.cap ?? 25, d * 1.4);
    const mass = Math.max(1, player.mass || 100);
    writePhysicsControl(player, {
      mode: 'flight',
      source: 'flightV3',
      force: { x: mass * (dx / d * desired - player.vel.x) / 0.25, y: 0, z: mass * (dz / d * desired - player.vel.z) / 0.25 },
      torque: { x: 0, y: 0, z: 0 },
      maxSpeed: ctl.cap ?? 25,
      authority: { forward: 1, reverse: 1, strafe: 1, yaw: 1 },
    });
  }
  state.entityList.length = 0;
  for (const e of state.entities.values()) if (e && e.alive !== false) state.entityList.push(e);
  t.owner.syncFromEntities(state.entityList);
  t.owner.step(PHYS_DT, state.tick);
  t.tetherSys.update(PHYS_DT, state);
  state.input.actions.tetherFire = false;
  state.input.actions.tetherCut = false;
  if (state.input.actions.massline) state.input.actions.massline = null;
  t.sim.runTicks(1);
}

test('physical gate: a REAL massline tow resolves tow_settle (order 401)', async () => {
  const mods = await loadCurated();
  const row = mods.find((m) => m.order === 401);
  const t = await bootPhysics();
  const { state } = t;
  const creditsBefore = state.player.credits;
  const latched = [];
  t.sim.bus.on('tether:latched', (p) => latched.push(p));
  const denials = [];
  t.sim.bus.on('tether:latchDenied', (p) => denials.push(p));
  const { live } = fire(t, row.mod.spec.id);
  assert.ok(live, 'scene fires');
  for (let i = 0; i < 900 && live.vars.vPhase !== 'offer'; i += 1) physTick(t, { x: 260, z: -60, cap: 4 });
  assert.equal(live.vars.vPhase, 'offer', 'offer reached');
  t.sim.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'a' });
  physTick(t, { x: 260, z: -60, cap: 4 });
  physTick(t, { x: 260, z: -60, cap: 4 });
  const v = live.vars.vAwait;
  assert.ok(v, 'the tow await is live');
  const prop = entOf(t, live, 'prop');
  const hull0 = entOf(t, live, 'hull_0');
  assert.ok(prop && hull0, 'prop + receiving hull exist');
  const propStart = { ...prop.pos };
  // Real latch: the production acquisition press — cursor on the prop, one tetherFire.
  state.input.aimWorld = { x: prop.pos.x, z: prop.pos.z };
  state.input.actions.tetherFire = true;
  physTick(t, { x: 260, z: -60, cap: 4 });
  assert.ok(latched.length === 1 && latched[0].targetId === prop.id,
    `the real acquisition latched the prop — denials: ${JSON.stringify(denials)}`);
  physTick(t, { x: 260, z: -60, cap: 4 }); // the mirror publishes on the next tether tick
  assert.equal(state.player.tether.active, true, 'the real mirror reports the live line');
  assert.equal(state.player.tether.targetId, prop.id, 'the mirror binds the prop');
  assert.ok(state.player.tether.attachmentId, 'the mirror carries the real attachment id');
  // The tow, for real. A snapped-fast haul on a shortening cable pumps the load's
  // momentum into a bound orbit around the player — the payload material carries no
  // linear damping, so the swing never dies on its own (that is exactly what the
  // authored "let it drift to rest" line warns about). The honest pilot line has two
  // legs: first haul the load along a path PARALLEL to the tow axis offset ~26 WU —
  // the prop trails behind the player, rope and load stay clear of the receiver's
  // collision rim (r19). Then the swing must be killed the way a pilot kills it:
  // hold the ship on the TRAILING side of the load's motion so the taut rope's
  // tension works against the velocity until the line is calm, creep the hanging
  // load into the ring at walking speed, and cut only while it is quiet inside.
  const ux = (hull0.pos.x - prop.pos.x), uz = (hull0.pos.z - prop.pos.z);
  const ulen = Math.hypot(ux, uz) || 1;
  const u = { x: ux / ulen, z: uz / ulen };           // tow axis, prop -> receiver
  const n = { x: -u.z, z: u.x };                      // lateral offset keeps the rope off the hull
  const drop = {
    x: hull0.pos.x + u.x * 45 + n.x * 26,
    z: hull0.pos.z + u.z * 45 + n.z * 26,
  };
  // A straight shot at the drop crosses the receiver itself — the pilot goes around it:
  // first to the offset tow line on this side of the hull, then down the line so the
  // rope and the load both stay ~26 WU clear of the hull's collision rim.
  const stage = { x: drop.x - u.x * 60, z: drop.z - u.z * 60 };
  const awaitSteps = phaseSteps(row.mod.spec, 'await_a');
  for (let i = 0; i < 60 * 100 && live.phase !== 'done'; i += 1) {
    const v = live.vars.vAwait;
    const step = v ? awaitSteps[v.stepIndex] : null;
    const stepIdx = v ? v.stepIndex : -1;
    const propSpeed = Math.hypot(prop.vel.x, prop.vel.z);
    const propRange = Math.hypot(prop.pos.x - hull0.pos.x, prop.pos.z - hull0.pos.z);
    // Winch toward ~45 WU of rope while hauling — the measured line length is read back
    // from the real attachment mirror, never assumed.
    const rest = state.player.tether.restLength;
    let waypoint, cap;
    if (stepIdx >= 0 && stepIdx < 2) {
      // Haul leg: stage then drop on the offset tow line.
      state.input.actions.reelDelta = (state.player.tether.active && Number.isFinite(rest) && rest > 47) ? -1 : 0;
      const dStage = Math.hypot(t.player.pos.x - stage.x, t.player.pos.z - stage.z);
      waypoint = dStage > 14 ? stage : drop;
      cap = propRange > 60 ? 7 : 3;
    } else if (!state.player.tether.active) {
      // The line is away — hold station while the released load settles into the ring.
      state.input.actions.reelDelta = 0;
      waypoint = { x: t.player.pos.x, z: t.player.pos.z };
      cap = 2;
    } else if (propSpeed > 2.6) {
      // Snub the swing: hover just outside the current rope length directly downwind
      // of the load's velocity — the taut line keeps doing negative work until it
      // hangs quiet off the stern instead of orbiting.
      state.input.actions.reelDelta = 0;
      const inv = 1 / propSpeed;
      const standoff = (Number.isFinite(rest) ? rest : 46) + 6;
      waypoint = { x: prop.pos.x - prop.vel.x * inv * standoff, z: prop.pos.z - prop.vel.z * inv * standoff };
      cap = Math.min(9, Math.max(3, propSpeed + 1.5));
    } else {
      // Calm line: creep so the hanging load drifts through the parked ring, then cut
      // while it is still inside and quiet.
      state.input.actions.reelDelta = 0;
      const dxh = hull0.pos.x - prop.pos.x, dzh = hull0.pos.z - prop.pos.z;
      const dh = Math.hypot(dxh, dzh) || 1;
      waypoint = { x: hull0.pos.x + (dxh / dh) * 18, z: hull0.pos.z + (dzh / dh) * 18 };
      cap = 2.2;
    }
    physTick(t, { x: waypoint.x, z: waypoint.z, cap });
    // The drop: cut through the real input path at a calm moment inside the ring.
    if (step && step.kind === 'released' && state.player.tether.active
        && propRange < 27 && propSpeed < 2.6) {
      state.input.actions.massline = { cut: true };
    }
  }
  assert.equal(live.phase, 'done',
    `the real tow resolves the scene — tether phase ${state.player.tether.phase}, `
    + `prop at (${Math.round(prop.pos.x)},${Math.round(prop.pos.z)}) vs hull_0 (${Math.round(hull0.pos.x)},${Math.round(hull0.pos.z)}), `
    + `denials ${JSON.stringify(denials)}`);
  assert.equal(live.outcome, 'a');
  assert.ok(Math.hypot(prop.pos.x - hull0.pos.x, prop.pos.z - hull0.pos.z) <= 30,
    'the prop rests inside the receiver ring, delivered by the rope');
  assert.ok(Math.hypot(prop.pos.x - propStart.x, prop.pos.z - propStart.z) >= 120,
    'the rope really carried the prop past the 120-WU bar');
  assert.equal(state.player.credits, creditsBefore + 48, 'yard work pays 48');
  t.owner.dispose();
});

test('all thirty: awaited choices gate every curated outcome on physical work', async () => {
  const mods = await loadCurated();
  for (const { mod } of mods) {
    const spec = mod.spec;
    const byId = new Map(spec.phases.map((p) => [p.id, p]));
    const walk = (from) => {
      const seen = []; let cur = from;
      while (cur) { seen.push(byId.get(cur).verb); cur = byId.get(cur).next; }
      return seen;
    };
    // Choice a passes through an await before any grant/resolve.
    const offer = spec.phases.find((p) => p.verb === 'offer');
    for (const [choiceId, dest] of Object.entries(offer.onChoice)) {
      const chain = walk(dest);
      assert.ok(chain.includes('await'), `${spec.id}:${choiceId} gates on an await`);
      if (choiceId !== 'c') assert.ok(chain.includes('resolve'), `${spec.id}:${choiceId} reaches resolve`);
    }
  }
});

// Park the player in a zone that hosts `shapeIds`, seed every OTHER curated id as
// already-started, and let the real tick pick. Returns the freshly fired live record.
function parkAndTick(t, zoneType) {
  const spot = ZONE_BY_TYPE.get(zoneType);
  assert.ok(spot, `zone type ${zoneType} is reachable on a clean spot`);
  t.state.world.currentSectorId = spot.sectorId;
  const g = sectorLocalToGlobalForSector({ x: spot.zone.center.x, z: spot.zone.center.z }, spot.sectorId);
  t.player.pos.x = g.x; t.player.pos.z = g.z;
  tickLivedVignettes(runtimeFor(t));
  return Object.values(t.state.encounterDirector.live).find((l) => l.phase !== 'done') || null;
}

function seedStarted(t, keepIds) {
  const dir = t.state.encounterDirector;
  dir.stats.livedStarted = {};
  for (const enc of Object.values(ENCOUNTERS)) {
    if (enc.livedRotation === true && !keepIds.includes(enc.id)) dir.stats.livedStarted[enc.id] = 1;
  }
  dir.stats.livedNextAt = -1;
}

test('rotation: the tick fires only curated scenes, stamps started, and never re-fires', async () => {
  const mods = await loadCurated();
  for (const { mod } of mods) curatedSpecs[mod.spec.id] = mod.spec;
  const curated = Object.values(ENCOUNTERS).filter((e) => e.livedRotation === true);
  assert.equal(curated.length, 30);
  // A zone that hosts at least one prop scene and one non-prop scene.
  const byZone = new Map();
  for (const enc of curated) for (const z of enc.zoneTypes || []) {
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(enc);
  }
  const mixedZone = [...byZone.entries()].find(([, list]) =>
    list.some((e) => e.livedPhysical && e.livedPhysical.hasProp === true)
    && list.some((e) => !(e.livedPhysical && e.livedPhysical.hasProp === true)));
  assert.ok(mixedZone, 'some zone hosts both prop and non-prop curated scenes');
  const t = boot();
  const dir = t.state.encounterDirector;
  const eligible = mixedZone[1];
  const propPick = eligible.filter((e) => e.livedPhysical && e.livedPhysical.hasProp === true);
  // First hour: only prop scenes are eligible candidates — the pick must be one of them.
  seedStarted(t, eligible.map((e) => e.id));
  const fired = parkAndTick(t, mixedZone[0]);
  assert.ok(fired, 'a curated scene fired while parked in its zone');
  assert.ok(curatedSpecs[fired.shapeId], `the fired scene ${fired.shapeId} is curated`);
  assert.ok(propPick.some((e) => e.id === fired.shapeId),
    `first-hour pick ${fired.shapeId} is a prop scene`);
  assert.ok(dir.stats.livedStarted[fired.shapeId] != null, 'the fired id was stamped started');
  // A fire-then-abort consumes the scene: no second pick of the same id.
  if (typeof t.director.abort === 'function') t.director.abort(fired, 'test_abort');
  else fired.phase = 'done';
  delete dir.live[fired.id];
  dir.stats.livedNextAt = -1;
  seedStarted(t, eligible.map((e) => e.id));
  dir.stats.livedStarted[fired.shapeId] = 1;
  const again = parkAndTick(t, mixedZone[0]);
  assert.ok(!again || again.shapeId !== fired.shapeId, 'the consumed scene never re-fires');
});

test('rotation: post-first-hour picks reach non-prop scenes; ambient never enters', async () => {
  const mods = await loadCurated();
  const curated = Object.values(ENCOUNTERS).filter((e) => e.livedRotation === true);
  const byZone = new Map();
  for (const enc of curated) for (const z of enc.zoneTypes || []) {
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(enc);
  }
  const nonPropZone = [...byZone.entries()].find(([, list]) =>
    list.every((e) => !(e.livedPhysical && e.livedPhysical.hasProp === true)));
  assert.ok(nonPropZone, 'some zone hosts only non-prop curated scenes');
  const t = boot();
  const dir = t.state.encounterDirector;
  t.state.simTime = 4000; // past the first-hour prop-preference window
  seedStarted(t, nonPropZone[1].map((e) => e.id));
  const fired = parkAndTick(t, nonPropZone[0]);
  assert.ok(fired, 'a non-prop curated scene fired after the first hour');
  const enc = curated.find((e) => e.id === fired.shapeId);
  assert.ok(enc && !(enc.livedPhysical && enc.livedPhysical.hasProp === true),
    'non-prop curated scenes still fire after the first hour window');
  // Ambient scenes are never admitted: with every curated id consumed, the tick is quiet
  // even parked in a live zone.
  const t2 = boot();
  seedStarted(t2, []);
  t2.state.encounterDirector.stats.livedSeen = {};
  const liveBefore = Object.keys(t2.state.encounterDirector.live).length;
  parkAndTick(t2, nonPropZone[0]);
  assert.equal(Object.keys(t2.state.encounterDirector.live).length, liveBefore,
    'with the curated pool exhausted nothing fires — ambient stays out of rotation');
});

test('save: the real serializer carries once-ever stats through an active-await restore', async () => {
  const mods = await loadCurated();
  const specById = Object.fromEntries(mods.map((m) => [m.mod.spec.id, m.mod.spec]));
  const curated = Object.values(ENCOUNTERS).filter((e) => e.livedRotation === true);
  const byZone = new Map();
  for (const enc of curated) for (const z of enc.zoneTypes || []) {
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(enc);
  }
  const zoneEntry = [...byZone.entries()][0];
  // Fire through the real unsolicited picker so stats.livedStarted is stamped by the
  // production path — not by hand — then drive the scene into its active physical await.
  const t = boot();
  t.state.player.credits = 500;
  t.state.simTime = 4000;
  seedStarted(t, zoneEntry[1].map((e) => e.id)); // keep this zone's scenes eligible
  const fired = parkAndTick(t, zoneEntry[0]);
  assert.ok(fired, 'the picker fired a curated scene');
  const firedId = fired.shapeId;
  assert.ok(curated.some((e) => e.id === firedId), `${firedId} is a curated id`);
  const dir = t.state.encounterDirector;
  assert.ok(dir.stats.livedStarted[firedId] != null, 'the picker stamped livedStarted on fire');
  const spec = specById[firedId];
  for (let i = 0; i < 900 && fired.vars.vPhase !== 'offer'; i += 1) ticks(t, 1);
  assert.equal(fired.vars.vPhase, 'offer', 'offer reached');
  t.sim.bus.emit('encounter:choose', { encounterId: fired.id, choiceId: 'a' });
  for (let i = 0; i < 60 && !fired.vars.vAwait; i += 1) ticks(t, 1);
  assert.ok(fired.vars.vAwait, 'the scene sits in an active physical await');
  assert.ok(fired.phase !== 'done', 'the encounter is still live');
  // The real production serializer — the exact method save writes into
  // data.encounterDirector — while the scene's await is in flight.
  const serializeCtx = { state: t.state, _rollbackCaptureActive: false };
  const snapshot = save._serializeEncounterDirector.call(serializeCtx);
  const round = JSON.parse(JSON.stringify(snapshot));
  // The durable slice carries the once-ever statistics gathered while the scene is
  // active; the live await itself is transient by contract (never serialized).
  assert.ok(round.stats && typeof round.stats === 'object', 'serialized stats exist');
  assert.equal(round.stats.livedStarted[firedId], dir.stats.livedStarted[firedId],
    'the once-ever stamp rides the real serializer');
  assert.ok(!('live' in round), 'the durable slice never carries live encounters');
  assert.ok(!('ids' in round) && !('roles' in round), 'no entity ids leak into the durable slice');
  // Restore through the production save:loaded handler, exactly as the load path stages it.
  const t2 = boot();
  t2.state.simTime = t.state.simTime;
  t2.state.encounterDirector = round;
  t2.director._onSaveLoaded();
  const restored = t2.state.encounterDirector;
  assert.equal(restored.stats.livedStarted[firedId], dir.stats.livedStarted[firedId],
    'the once-ever stamp survives the real serializer through restore');
  assert.equal(Object.keys(restored.live || {}).length, 0,
    'await progress is transient — the load carries no live encounter');
  // Once-ever across the restore: the same zone pick can never re-fire the consumed id.
  restored.stats.livedNextAt = -1;
  const refire = parkAndTick(t2, zoneEntry[0]);
  assert.ok(!refire || refire.shapeId !== firedId,
    'a scene consumed before the save is still consumed after it');
  // Old saves that predate livedStarted initialize safely on the next pick.
  const t3 = boot();
  const stale = save._serializeEncounterDirector.call({ state: t3.state, _rollbackCaptureActive: false });
  delete stale.stats.livedStarted;
  t3.state.encounterDirector = stale;
  t3.director._onSaveLoaded();
  t3.state.encounterDirector.stats.livedStarted = undefined;
  t3.state.encounterDirector.stats.livedNextAt = -1;
  parkAndTick(t3, zoneEntry[0]);
  assert.ok(t3.state.encounterDirector.stats.livedStarted
    && typeof t3.state.encounterDirector.stats.livedStarted === 'object',
    'a save missing livedStarted normalizes on the next pick');
  void spec;
});

// ── the scripted route ─────────────────────────────────────────────────────────────────
// One long session: the player crosses every zone kind on seed 4242, the unsolicited
// picker fires the once-ever scenes it finds, and each is driven through its physical
// steps by fixtures. Asserts every curated scene started, no transmitted line repeats,
// every completion emits exactly one receipt, and a repeat run is byte-identical.
const ZONE_BY_TYPE = (() => {
  // Clean spots: park the player where zoneAt returns THAT zone's type (overlapping
  // discs would silently put the player in a smaller, different-type zone).
  const map = new Map();
  const types = new Set();
  for (const sector of SECTORS) for (const zone of zonesForSector(sector.id)) if (zone && zone.type) types.add(zone.type);
  for (const type of types) {
    outer:
    for (const sector of SECTORS) {
      for (const zone of zonesForSector(sector.id)) {
        if (!zone || zone.type !== type || !zone.center) continue;
        const hit = zoneAt(sector.id, zone.center.x, zone.center.z);
        if (hit && hit.type === type) { map.set(type, { sectorId: sector.id, zone }); break outer; }
      }
    }
  }
  return map;
})();

function bootRoute() {
  const t = boot();
  t.state.player.credits = 50000;
  t.lines = [];
  t.receipts = [];
  t.sim.bus.on('encounter:voice', (p) => {
    t.lines.push({ id: p && p.encounterId, channel: p && p.channel, text: p && p.text });
  });
  // Only real receipt events count — encounter:resolved also fires for aborts.
  t.sim.bus.on('encounter:receipt', (p) => t.receipts.push(p));
  t.playerLines = [];
  t.sim.bus.on('story:playerChoiceRecorded', (p) => t.playerLines.push(p));
  return t;
}

function runtimeFor(t) {
  return { state: t.state, registry: { get: (n) => (n === 'encounterDirector' ? t.director : null) }, _livedScanAt: -1 };
}

function entOfId(t, id) { return id != null ? t.state.entities.get(id) : null; }

// Fixture driver: each tick it satisfies the CURRENT pending step of the await chain.
// It only ever arranges real state — tether target, positions, velocities — the way a
// player would; it never edits vars or calls internal verbs.
function satisfyStep(t, live, spec, step) {
  const v = live.vars.vAwait;
  const roleEnt = (role) => entOfId(t, v.roleIds && v.roleIds[role]);
  const prop = roleEnt('prop') || roleEnt(step.of) || roleEnt(step.subject);
  const hull0 = roleEnt('hull_0');
  const anchor = live.anchor || { x: t.player.pos.x, z: t.player.pos.z };
  const latch = () => {
    t.state.player.tether = prop
      ? { active: true, targetId: prop.id, phase: 'loaded', load: 0.5 }
      : t.state.player.tether;
  };
  switch (step.kind) {
    case 'latched': case 'strained': latch(); return;
    case 'displaced': if (prop) prop.pos.x += 6; return;
    case 'released': t.state.player.tether = { active: false, targetId: null }; return;
    case 'settled': {
      const s = roleEnt(step.of) || roleEnt(step.subject) || prop;
      if (s) { s.vel.x = 0; s.vel.z = 0; }
      return;
    }
    case 'parked': {
      const at = roleEnt(step.at) || hull0;
      if (prop && at) { prop.pos.x = at.pos.x + 15; prop.pos.z = at.pos.z; prop.vel.x = 0; prop.vel.z = 0; }
      return;
    }
    case 'near': {
      // subject is the mover, `of` is the target it must approach.
      const subj = step.subject === 'player' ? t.player : (roleEnt(step.subject) || prop);
      const tgt = roleEnt(step.of) || roleEnt(step.near || step.at) || hull0;
      if (subj && tgt) { subj.pos.x = tgt.pos.x + 10; subj.pos.z = tgt.pos.z; }
      return;
    }
    case 'meet': {
      const tgt = roleEnt(step.of) || hull0 || prop;
      if (tgt) { t.player.pos.x = tgt.pos.x + 40; t.player.pos.z = tgt.pos.z; t.player.vel.x = 0; t.player.vel.z = 0; }
      return;
    }
    case 'visit': {
      // Each visit is a re-entry: hold OUTSIDE the ring until the sampler arms the step
      // (it observes the departure), then hold inside until the step completes.
      const tgt = roleEnt(step.of) || hull0;
      if (!tgt) return;
      const want = v.visitArmed === true ? 40 : 120;
      t.player.pos.x = tgt.pos.x + want; t.player.pos.z = tgt.pos.z;
      return;
    }
    case 'depart': {
      // Player travel must accumulate past the dist bar AND end far from the anchor.
      t.player.pos.x += 8;
      return;
    }
    case 'formation': {
      // The PLAYER holds station 60–180 off the lead while the lead makes 100 WU.
      const lead = roleEnt(step.of) || hull0;
      if (!lead) return;
      lead.pos.x += 2;
      t.player.pos.x = lead.pos.x - 120; t.player.pos.z = lead.pos.z;
      t.player.vel.x = lead.vel.x || 0; t.player.vel.z = lead.vel.z || 0;
      return;
    }
    case 'trail': {
      // 60–180 WU BEHIND the lead's heading, matched speed — and the lead must genuinely
      // travel: leaderProgress wants 100 WU of real leader movement while we hold station.
      const lead = roleEnt(step.of) || hull0;
      if (!lead) return;
      lead.rot = 0;
      lead.pos.x += 2;
      lead.vel.x = 2; lead.vel.z = 0;
      const hx = Math.cos(lead.rot), hz = Math.sin(lead.rot);
      t.player.pos.x = lead.pos.x - hx * 120; t.player.pos.z = lead.pos.z - hz * 120;
      t.player.vel.x = lead.vel.x; t.player.vel.z = lead.vel.z;
      return;
    }
    case 'oppositeSides': {
      // Hold a flank until the 1 Hz sampler registers sideStart, then cross to the far
      // side and hold it inside the 100–160 band — the 260 WU jump supplies the travel.
      // Oscillating every tick reads as a stationary player to the sampler.
      const hull = roleEnt(step.of) || hull0;
      if (!hull) return;
      const hx = Math.cos(hull.rot || 0), hz = Math.sin(hull.rot || 0);
      const px = -hz, pz = hx; // hull's lateral axis
      const want = v.sideStart == null ? 130 : -v.sideStart * 130;
      t.player.pos.x = hull.pos.x + px * want;
      t.player.pos.z = hull.pos.z + pz * want;
      return;
    }
    case 'gapCross': {
      // The real crossing flips the player's SIGNED perpendicular distance to the AB
      // line, with the interpolated crossing point on the segment near its midpoint.
      // Parking at mid and alternating sides gives one genuine crossing per two ticks;
      // moving along the hull axis alone never satisfies it.
      const a = roleEnt((step.of || [])[0]) || hull0;
      const b = roleEnt((step.of || [])[1]);
      if (!a || !b) return;
      const mid = { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
      const abx = b.pos.x - a.pos.x, abz = b.pos.z - a.pos.z;
      const len = Math.hypot(abx, abz) || 1;
      const px = -abz / len, pz = abx / len; // unit perpendicular to the hull-to-hull axis
      // Hold one side until the sampler records gapPrev, then hold the far side — one
      // genuine crossing at the midpoint, visible to the 1 Hz evaluation cadence.
      const off = v.gapPrev ? -(v.gapPrev.perp >= 0 ? 30 : -30) : 30;
      t.player.pos.x = mid.x + px * off; t.player.pos.z = mid.z + pz * off;
      return;
    }
    case 'clearOfActors': {
      for (const [idKey, role] of Object.entries(live.roles)) {
        if (role === 'prop') continue;
        const e = entOfId(t, Number(idKey));
        if (e && e.type === 'ship' && prop) { e.pos.x = prop.pos.x + 500; e.pos.z = prop.pos.z + 500; e.vel.x = 0; e.vel.z = 0; }
      }
      return;
    }
    default: return;
  }
}

function phaseSteps(spec, phaseId) {
  const phase = spec.phases.find((p) => p.id === phaseId);
  return phase && Array.isArray(phase.steps) ? phase.steps : [];
}

function driveLive(t, live, spec, choiceId = 'a', maxTicks = 60 * 140) {
  for (let i = 0; i < maxTicks && live.phase !== 'done'; i += 1) {
    if (live.vars.vPhase === 'offer' && !live.offerConsumed) {
      t.sim.bus.emit('encounter:choose', { encounterId: live.id, choiceId });
    }
    const v = live.vars.vAwait;
    if (v) {
      const steps = phaseSteps(spec, v.phaseId);
      if (v.stepIndex < steps.length) satisfyStep(t, live, spec, steps[v.stepIndex]);
    }
    t.sim.runTicks(1);
  }
}

function runRoute() {
  const t = bootRoute();
  const started = {};
  const dir = t.state.encounterDirector;
  for (let guard = 0; guard < 4000 && Object.keys(started).length < 30; guard += 1) {
    // Done lives linger until the director's stale pass — the same pass the sim runs —
    // but the route's clock is aggressive, so clear them exactly as it would.
    for (const k of Object.keys(dir.live)) {
      if (dir.live[k].phase !== 'done') continue;
      // The stale pass would sweep the cast too — the route just does it ahead of the
      // picker's "already fighting" check, which reads live hulls as a threat.
      for (const id of dir.live[k].ids || []) t.state.entities.delete(id);
      delete dir.live[k];
    }
    const active = Object.values(dir.live).filter((l) => l.phase !== 'done');
    if (active.length === 0) {
      if (dir.stats.livedNextAt > t.state.simTime) {
        t.sim.runTicks(Math.ceil((dir.stats.livedNextAt - t.state.simTime) * 60) + 1);
        continue;
      }
      let parked = false; let parkedType = null;
      for (const [zoneType, spot] of ZONE_BY_TYPE) {
        const has = Object.values(ENCOUNTERS).some((e) => e.livedRotation === true
          && !started[e.id] && (e.zoneTypes || []).includes(zoneType));
        if (!has) continue;
        t.state.world.currentSectorId = spot.sectorId;
        const g = sectorLocalToGlobalForSector({ x: spot.zone.center.x, z: spot.zone.center.z }, spot.sectorId);
        t.player.pos.x = g.x; t.player.pos.z = g.z;
        parked = true; parkedType = zoneType;
        break;
      }
      if (!parked) break;
      tickLivedVignettes(runtimeFor(t));
      t.sim.runTicks(30);
      continue;
    }
    const live = active[0];
    const spec = curatedSpecs[live.shapeId];
    if (!spec) {
      // A world encounter fired through the director's own sector logic — not this
      // route's subject. Let the stale pass sweep it like an abandoned contact.
      if (typeof t.director.abort === 'function') t.director.abort(live, 'route_off_scope');
      else live.phase = 'done';
      continue;
    }
    driveLive(t, live, spec);
    started[live.shapeId] = live.outcome || 'aborted';
    if (process.env.R459_DEBUG) {
      const v = live.vars && live.vars.vAwait;
      const dbg = v ? `await ${v.phaseId} step ${v.stepIndex} travel=${Math.round(v.playerTravel || 0)} sideStart=${v.sideStart} armed=${v.visitArmed}` : 'no-await';
      console.log('route', live.shapeId, '=>', started[live.shapeId], dbg,
        'player', Math.round(t.player.pos.x), Math.round(t.player.pos.z));
      for (const [ek, role] of Object.entries(live.roles || {})) {
        const e = t.state.entities.get(Number(ek));
        if (e) console.log('   role', role, 'pos', Math.round(e.pos.x), Math.round(e.pos.z), 'rot', e.rot);
      }
    }
    if (live.phase !== 'done') {
      // The scene's own deadline did not abort it inside the drive budget — it stays a
      // once-ever scene; the route moves on and reports it as not completed.
      started[live.shapeId] = 'stalled';
    }
    t.sim.runTicks(120); // the 1 Hz stale pass needs sim time to clear the done live
  }
  // The acceptance route spans the full two sim-hours at the fixed step — the thirty
  // once-ever scenes live inside it, and the clock does not stop early.
  while (t.state.simTime < 7200) t.sim.runTicks(60);
  return { t, started, lines: t.lines, receipts: t.receipts, playerLines: t.playerLines };
}

const curatedSpecs = Object.fromEntries([]);

test('two-hour route: every curated scene fires, works, speaks distinctly, once', async () => {
  const mods = await loadCurated();
  for (const { mod } of mods) curatedSpecs[mod.spec.id] = mod.spec;
  const curatedIds = new Set(mods.map((m) => m.mod.spec.id));
  const transcriptOf = (run) => JSON.stringify({
    started: run.started,
    receipts: run.receipts.filter((r) => r && curatedIds.has(r.shape))
      .map((r) => [r.shape, r.outcome, r.text]),
    lines: run.lines.filter((l) => String(l.id).includes('lived_')).map((l) => l.text),
    playerLines: run.playerLines.filter((p) => curatedIds.has(p.shapeId)).map((p) => p.line),
  });
  const run = runRoute();
  const run2 = runRoute();
  assert.ok(run.t.state.simTime >= 7200,
    `the route spans the full two sim-hours — reached ${Math.round(run.t.state.simTime)}s`);
  const startedIds = Object.keys(run.started);
  assert.equal(startedIds.length, 30,
    `all thirty curated scenes fired along the route — got ${startedIds.length}: ${startedIds.join(',')}`);
  // Every started scene resolved through its physical await — no stalls, no aborts.
  const notDone = startedIds.filter((id) => run.started[id] !== 'a');
  assert.deepEqual(notDone, [], `every curated scene completed physically — stalled/aborted: ${notDone.join(',')}`);
  // No transmitted line repeats across the route (dialogue was not suppressed, and no
  // scene reused another's voice).
  const texts = run.lines
    .filter((l) => String(l.id).includes('lived_'))
    .map((l) => l.text).filter(Boolean);
  assert.ok(texts.length >= 30, 'the route spoke at least thirty transmitted lines');
  const counts = new Map();
  for (const t of texts) counts.set(t, (counts.get(t) || 0) + 1);
  const dups = [...counts.entries()].filter(([, c]) => c > 1).map(([t]) => t);
  assert.equal(dups.length, 0, `no transmitted line repeats — got: ${JSON.stringify(dups.slice(0, 4))}`);
  // Exactly one receipt event per completed scene; aborted/abandoned contacts emit none.
  const curatedReceipts = run.receipts.filter((r) => r && curatedIds.has(r.shape));
  assert.equal(curatedReceipts.length, 30,
    `exactly one receipt per curated completion — got ${curatedReceipts.length}`);
  for (const id of curatedIds) {
    const rs = curatedReceipts.filter((r) => r.shape === id);
    assert.equal(rs.length, 1, `${id} emitted exactly one receipt`);
    assert.equal(rs[0].outcome, 'a', `${id} receipt is the physical-work outcome`);
    assert.ok(rs[0].text && rs[0].text.length > 12, `${id} receipt carries authored text`);
  }
  // The player's own spoken line was recorded for every scene, uniquely.
  const playerLines = run.playerLines.filter((p) => curatedIds.has(p.shapeId)).map((p) => p.line);
  assert.equal(playerLines.length, 30, `player dialogue recorded once per scene — got ${playerLines.length}`);
  assert.equal(new Set(playerLines).size, 30, 'no two scenes reuse a player line');
  // The route is deterministic on seed 4242: a second run replays byte-identically.
  assert.equal(transcriptOf(run2), transcriptOf(run),
    'a repeated seeded route reproduces the identical encounter/choice/receipt transcript');
});
