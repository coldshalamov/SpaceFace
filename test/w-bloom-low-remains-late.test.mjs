import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { combat } from '../src/systems/combat.js';
import { SWARM_BROOD_FAMILIES, swarmBroodIssues } from '../src/data/swarmBrood.js';
import {
  SWARM_BROOD_LATE_FAMILIES,
  swarmBroodLateFamily,
  swarmBroodLateIssues,
} from '../src/data/swarmBroodLate.js';

// W-BLOOM-LOW late remains — the late table's deathLeaves audit made physical. Every one of
// the eleven late rows either authors a grabbable body, authors an effect the kill already
// delivers, or authors an honest nothing. The audit's verdicts, pinned:
//   REMAINS:    burrower ('a cracked shell'), remora ('a spent charge')
//   EFFECT:     splitter/clutchstone (three mites), brood_mother/poxsac (the unspent tide
//               strands — that IS what her death leaves), gloomcap/mirebulb (a burst that
//               shoves), keelback (a shatter)
//   NOTHING:    ashwisp ('grey ash'), undertow ('a slack eddy' — motion, not a body)
// The engine machinery is the generic kind-blind path the base six already ride; what the
// late rows needed was the spec, the silhouette, and the proof.
const DT = 1 / 60;
const WAVE = 55; // fields every late family through the undertow; no strain marks yet

function fixture({ wave = WAVE } = {}) {
  const state = createGameState(4242);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  state.mode = 'flight';
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    { wave, phase: 'active' });
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    hull: 40, hullMax: 200, radius: 8, mass: 400, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [], payloads: [] };
  const helpers = { spawnEntity(spec) {
    const e = { ...spec, id: state.nextEntityId++, alive: true };
    state.entities.set(e.id, e); state.entityList.push(e);
    if (e.type === 'payload') state.entityIndex.payloads.push(e);
    bus.emit('entity:spawned', { entity: e });
    return e;
  }, removeEntity(id) {
    const e = state.entities.get(id);
    if (e) e.alive = false;
  } };
  const combatSys = Object.create(combat);
  combatSys.init({ state, bus, helpers });
  const engine = createBroodEngine({ getState: () => state, bus, fieldList: () => [] });
  engine.prepareWave(state.run, wave); engine.spawnWave(state);
  const bodies = engine._bodies;
  const remains = () => state.entityList.filter((e) => e.alive && e.data?.payloadType === 'brood_remains');
  const remainsOf = (familyId) => remains().filter((e) => e.data.broodRemain.familyId === familyId);
  const familyOf = (i) => bodies.liveFamilyId[bodies.family[i]];
  const firstAlive = (familyId) => {
    for (let i = 0; i < bodies.alive.length; i++) if (bodies.alive[i] && familyOf(i) === familyId) return i;
    return -1;
  };
  const countFamily = (familyId) => {
    let n = 0;
    for (let i = 0; i < bodies.alive.length; i++) if (bodies.alive[i] && familyOf(i) === familyId) n += 1;
    return n;
  };
  // Kill the cell in isolation: family bursts and shards are real mechanisms and would
  // cascade extra deaths (and extra remains) off-screen of what an assert measures.
  const killIsolated = (i, cause) => {
    bodies.px[i] = 9000; bodies.pz[i] = 9000;
    engine._killDirectForTest(i, cause);
  };
  const tick = (n = 1) => { for (let k = 0; k < n; k++) { engine.step(state); state.simTime += DT; state.tick += 1; } };
  // A remain body placed by hand — the throw-side tests only need the mover/entity shape.
  const placeRemain = (kind, pos, vel, extra = {}) => helpers.spawnEntity({
    type: 'payload', alive: true, collides: true, radius: 4, mass: 12,
    physicsBody: { dynamic: true, mass: 12 },
    pos: { x: pos.x, z: pos.z }, vel: { x: vel.x, z: vel.z },
    hull: 20, hullMax: 20,
    data: { kind: 'payload', payloadType: 'brood_remains', name: kind,
      masslineTetherable: true, physicalCustodyOnly: true, transientSector: true,
      despawnAt: state.simTime + 45, broodRemain: { familyId: 'test', kind, ...extra } },
  });
  return { state, bus, emitted, player, helpers, engine, combatSys, bodies,
    remains, remainsOf, familyOf, firstAlive, countFamily, killIsolated, tick, placeRemain };
}

// The late table's authored disposition — a body, a delivered effect, or an honest nothing.
// Adding an eleventh row forces a classification here, not silence.
const DISPOSITION = Object.freeze({
  burrower: 'remain', splitter: 'effect', brood_mother: 'effect', remora: 'remain',
  gloomcap: 'effect', ashwisp: 'nothing', keelback: 'effect', undertow: 'nothing',
  mirebulb: 'effect', clutchstone: 'effect', poxsac: 'effect',
});

test('the audit table is complete: every late family resolves to remain, effect, or honest nothing', () => {
  assert.deepEqual(swarmBroodLateIssues(), []);
  const ids = SWARM_BROOD_LATE_FAMILIES.map((f) => f.id).sort();
  assert.deepEqual(ids, Object.keys(DISPOSITION).sort(), 'the late table grew — classify the new row');
  for (const fam of SWARM_BROOD_LATE_FAMILIES) {
    const want = DISPOSITION[fam.id];
    // The flags that deliver the authored effect leaves: splits pays mites, births strands
    // the tide, burstRadius shoves, shardRadius shatters.
    const carriesEffect = !!(fam.splits || fam.births || fam.burstRadius > 0 || fam.shardRadius > 0);
    if (want === 'remain') {
      assert.ok(fam.remains && typeof fam.remains.kind === 'string',
        `${fam.id} (${fam.deathLeaves}) promises a body — remains spec missing`);
    } else {
      assert.equal(fam.remains, undefined,
        `${fam.id} leaves "${fam.deathLeaves}" — not a grabbable body, no remains spec`);
      if (want === 'effect') {
        assert.ok(carriesEffect, `${fam.id} leaf "${fam.deathLeaves}" names an effect it does not carry`);
      }
    }
  }
});

test('a late brood death leaves its authored physical body at the death spot, with the victim momentum', () => {
  const h = fixture();
  const want = { burrower: 'cracked_shell', remora: 'spent_charge' };
  for (const [familyId, kind] of Object.entries(want)) {
    const i = h.firstAlive(familyId);
    assert.ok(i >= 0, `wave ${WAVE} fields a ${familyId}`);
    const before = h.remainsOf(familyId).length;
    h.bodies.vx[i] = 30; h.bodies.vz[i] = -10;
    h.killIsolated(i, 'collision');
    const mine = h.remainsOf(familyId);
    assert.equal(mine.length, before + 1, `${familyId} leaves exactly one body`);
    const body = mine[mine.length - 1];
    assert.equal(body.data.broodRemain.familyId, familyId);
    assert.equal(body.data.broodRemain.kind, kind);
    assert.equal(body.pos.x, 9000); assert.equal(body.pos.z, 9000, 'the body appears at the death spot');
    assert.equal(body.vel.x, 30); assert.equal(body.vel.z, -10, 'the body keeps the victim momentum');
    assert.equal(body.type, 'payload');
    assert.equal(body.data.masslineTetherable, true, 'the Line can latch it');
    assert.equal(body.data.physicalCustodyOnly, true);
    assert.equal(body.data.transientSector, true);
    assert.ok(Number.isFinite(body.data.despawnAt), 'bounded lifetime');
    assert.ok(body.data.despawnAt > h.state.simTime, 'the expiry clock is ahead of now');
  }
  const shell = h.remainsOf('burrower')[0];
  assert.equal(shell.data.broodRemain.splashRadius, 26, 'the cracked shell shatters small');
  const charge = h.remainsOf('remora')[0];
  assert.equal(charge.data.broodRemain.splashRadius, 34, 'the spent charge pops weakly');
});

test('the new kinds throw, splash and spend exactly like the six — and the splash honors kill-gates', () => {
  const h = fixture();
  // Cracked shell: the struck cell dies, a neighbor inside the splash dies by explosive law,
  // a massOnly keelback inside the same splash pings off, and the shell body is spent.
  const mites = [];
  for (let i = 0; i < h.bodies.alive.length; i++) {
    if (h.bodies.alive[i] && h.familyOf(i) === 'mite') mites.push(i);
  }
  assert.ok(mites.length >= 3, 'wave 55 fields the fodder');
  const [a, b, c] = mites;
  h.bodies.px[a] = 5000; h.bodies.pz[a] = 5000;
  h.bodies.px[b] = 5010; h.bodies.pz[b] = 5000; // inside splashRadius 26
  h.bodies.px[c] = 5060; h.bodies.pz[c] = 5000; // outside the splash
  const kb = h.firstAlive('keelback');
  assert.ok(kb >= 0, 'wave 55 fields a keelback');
  h.bodies.px[kb] = 5012; h.bodies.pz[kb] = 5000; // inside the splash — armored
  const shell = h.placeRemain('cracked_shell', { x: 5000, z: 5000 }, { x: 100, z: 0 },
    { familyId: 'burrower', splashRadius: 26 });
  const spends = () => h.emitted.filter((e) => e.event === 'swarm:broodRemainsSpent'
    && e.payload.entityId === shell.id);
  h.tick();
  assert.equal(h.bodies.alive[a], 0, 'the shell lands the impact kill');
  assert.equal(h.bodies.alive[b], 0, 'the splash takes the close neighbor');
  assert.equal(h.bodies.alive[c], 1, 'a body outside the splash survives');
  assert.equal(h.bodies.alive[kb], 1, 'the keelback shell pings the explosive splash off');
  assert.equal(shell.alive, false, 'the shell shatters — its body is spent');
  assert.equal(spends().length, 1, 'the spend receipt went out exactly once');

  // Spent charge: same law — a weak pop, spent on impact.
  const mites2 = [];
  for (let i = 0; i < h.bodies.alive.length; i++) {
    if (h.bodies.alive[i] && h.familyOf(i) === 'mite') mites2.push(i);
  }
  assert.ok(mites2.length >= 2);
  const [d, e] = mites2;
  h.bodies.px[d] = -5000; h.bodies.pz[d] = -5000;
  h.bodies.px[e] = -5020; h.bodies.pz[e] = -5000; // inside splashRadius 34
  const charge = h.placeRemain('spent_charge', { x: -5000, z: -5000 }, { x: 100, z: 0 },
    { familyId: 'remora', splashRadius: 34 });
  h.tick();
  assert.equal(h.bodies.alive[d], 0, 'the charge lands the impact kill');
  assert.equal(h.bodies.alive[e], 0, 'the weak pop takes the close neighbor');
  assert.equal(charge.alive, false, 'the spent charge is spent for good');
});

test('a late remain still plows at speed — light mass under the pebble gate is a weapon', () => {
  const h = fixture();
  const mite = h.firstAlive('mite');
  assert.ok(mite >= 0);
  const target = { x: h.bodies.px[mite], z: h.bodies.pz[mite] };
  // Mass 9 (the authored spent-charge figure) is far under BROOD_PLOW_MIN_MASS — a remain
  // is opted in by its stamp, speed alone decides.
  const charge = h.placeRemain('spent_charge', target, { x: 100, z: 0 },
    { familyId: 'remora', splashRadius: 34 });
  h.tick();
  assert.equal(h.bodies.alive[mite], 0, 'the thrown charge kills on contact');
  assert.equal(charge.alive, false, 'its splash spent it');
});

test('the effect leaves deliver: the gloomcap bursts on the pack, the keelback shatters it', () => {
  const h = fixture();
  const fam = swarmBroodLateFamily('gloomcap');
  const gc = h.firstAlive('gloomcap');
  assert.ok(gc >= 0, 'wave 55 fields a gloomcap');
  const neighbor = h.firstAlive('mite');
  assert.ok(neighbor >= 0);
  // Explosive cause bypasses the two-hit swell and detonates the authored burst outright:
  // the pack inside burstRadius is shoved and the receipt carries the authored radius.
  h.bodies.px[gc] = 7000; h.bodies.pz[gc] = 7000;
  h.bodies.px[neighbor] = 7020; h.bodies.pz[neighbor] = 7000;
  h.bodies.vx[neighbor] = 0; h.bodies.vz[neighbor] = 0;
  h.engine._killDirectForTest(gc, 'explosive');
  assert.equal(h.bodies.alive[gc], 0);
  const burst = h.emitted.find((e) => e.event === 'swarm:broodBurst'
    && e.payload.familyId === 'gloomcap');
  assert.ok(burst, 'the gloomcap burst never fired');
  assert.equal(burst.payload.radius, fam.burstRadius, 'the burst keeps its authored radius');
  assert.ok(Math.hypot(h.bodies.vx[neighbor], h.bodies.vz[neighbor]) > 1,
    'the burst on the pack shoves the neighbor');
  assert.equal(h.remainsOf('gloomcap').length, 0, 'a burst leaves no latched body');

  const kb = h.firstAlive('keelback');
  assert.ok(kb >= 0, 'wave 55 fields a keelback');
  // massOnly armor: guns and blasts ping off — only mass cracks it, and the crack pays
  // the authored shatter onto the pack.
  h.engine._killDirectForTest(kb, 'direct');
  assert.equal(h.bodies.alive[kb], 1, 'a gun pings off the keelback shell');
  h.engine._killDirectForTest(kb, 'explosive');
  assert.equal(h.bodies.alive[kb], 1, 'a blast pings off the keelback shell');
  const near = h.firstAlive('mite');
  h.bodies.px[kb] = -7000; h.bodies.pz[kb] = -7000;
  h.bodies.px[near] = -7020; h.bodies.pz[near] = -7000; // inside shardRadius 44
  h.engine._killDirectForTest(kb, 'collision');
  assert.equal(h.bodies.alive[kb], 0, 'mass finally cracks the keelback');
  assert.equal(h.bodies.alive[near], 0, 'the shatter lands on the pack');
  assert.equal(h.remainsOf('keelback').length, 0, 'a shatter leaves no latched body');
});

test('the mother\'s unspent tide dies with her — she spills no bodies at all', () => {
  const h = fixture();
  const i = h.firstAlive('brood_mother');
  assert.ok(i >= 0, 'wave 55 fields a brood mother');
  const reserve0 = h.engine._mother().reserve;
  const left0 = h.bodies.birthLeft[i];
  assert.ok(left0 > 0, 'she was assigned a tide to strand');
  const mitesBefore = h.countFamily('mite');
  h.killIsolated(i, 'direct');
  assert.equal(h.bodies.alive[i], 0);
  assert.equal(h.bodies.birthLeft[i], 0, 'her unspent tide is stranded in the corpse');
  assert.equal(h.engine._mother().reserve, reserve0 - left0,
    'the held share shrinks by exactly her leftover — "unspent", not spilled');
  // The tide she never birthed never appears: stepping her cadence out changes nothing.
  const fam = swarmBroodLateFamily('brood_mother');
  h.tick(Math.ceil(fam.birthEveryS / DT) * 3);
  assert.equal(h.countFamily('mite'), mitesBefore, 'the dead mother births nothing more');
  assert.equal(h.remainsOf('brood_mother').length, 0, 'she leaves no latched body');
});

test('the honest-nothing leaves stay nothing: grey ash and a slack eddy drop no body', () => {
  const h = fixture();
  const wisp = h.firstAlive('ashwisp');
  assert.ok(wisp >= 0, 'wave 55 fields an ash wisp');
  // blastOnly: only a blast takes it — and what it leaves is ash, not ammunition.
  h.engine._killDirectForTest(wisp, 'direct');
  assert.equal(h.bodies.alive[wisp], 1, 'a shot passes through the glow');
  h.killIsolated(wisp, 'explosive');
  assert.equal(h.bodies.alive[wisp], 0);
  assert.equal(h.remainsOf('ashwisp').length, 0, 'grey ash is flavor, not a body');

  const tow = h.firstAlive('undertow');
  assert.ok(tow >= 0, 'wave 55 fields an undertow');
  h.killIsolated(tow, 'collision');
  assert.equal(h.bodies.alive[tow], 0);
  assert.equal(h.remainsOf('undertow').length, 0, 'a slack eddy is motion released — no body');

  // Every no-remains late family in the field drops nothing — the sweep, not just the two.
  for (const fam of SWARM_BROOD_LATE_FAMILIES) {
    if (fam.remains) continue;
    const slot = h.firstAlive(fam.id);
    if (slot < 0) continue; // not fielded at this wave — the disposition table covers it
    // 'explosive' answers the gates that turn a strike into something else — blastOnly
    // outright, swells' two-hit rule (a non-explosive hit only inflates).
    const cause = (fam.blastOnly || fam.swells) ? 'explosive'
      : (fam.massOnly ? 'collision' : 'direct');
    h.killIsolated(slot, cause);
    assert.equal(h.remainsOf(fam.id).length, 0, `${fam.id} left a body it never authored`);
  }
});

test('the earlier families are unchanged: the six kinds, the two validators, the split payout', () => {
  assert.deepEqual(swarmBroodIssues(), []);
  assert.deepEqual(swarmBroodLateIssues(), []);
  const baseKinds = {};
  for (const f of SWARM_BROOD_FAMILIES) if (f.remains) baseKinds[f.id] = f.remains.kind;
  assert.deepEqual(baseKinds, {
    mite: 'husk_shards', spitter: 'acid_sac', charger: 'horn_plate',
    leecher: 'leech_glue', glassback: 'glass_shards', wake_eel: 'eel_body',
  }, 'a base family gained or lost its authored remains');

  // The splitter's leaf is an effect — its death still pays the three held mites.
  const h = fixture();
  const sp = h.firstAlive('splitter');
  assert.ok(sp >= 0, 'wave 55 fields a splitter');
  const splittersBefore = h.countFamily('splitter');
  const mitesBefore = h.countFamily('mite');
  const heldBefore = h.engine._splitter().reserve;
  h.killIsolated(sp, 'direct');
  // The freed slot is lawful reuse: a released mite can hatch straight into it — the
  // observable death is the family count, not the slot byte.
  assert.equal(h.countFamily('splitter'), splittersBefore - 1, 'the splitter died');
  assert.equal(h.countFamily('mite'), mitesBefore + 3, 'the split pays its three mites');
  assert.equal(h.engine._splitter().reserve, heldBefore - 2, 'the held share is spent');
  assert.equal(h.remainsOf('splitter').length, 0, 'the split is bodies, not a latched remain');
});

test('the late validator flags a malformed remains spec and passes the honest one', () => {
  assert.deepEqual(swarmBroodLateIssues(), []);
  const fam = swarmBroodLateFamily('burrower');
  const honest = fam.remains;
  try {
    fam.remains = { mass: 5 };
    const issues = swarmBroodLateIssues();
    assert.ok(issues.some((row) => /burrower remains has no kind/.test(row.message)),
      'a remains spec with no kind slipped the validator');
    fam.remains = { kind: 'cracked_shell', mass: -1, radius: 3 };
    assert.ok(swarmBroodLateIssues().some((row) => /physical size/.test(row.message)),
      'a remains spec with no size slipped the validator');
  } finally {
    fam.remains = honest;
  }
  assert.deepEqual(swarmBroodLateIssues(), [], 'restoring the authored spec keeps the table clean');
});
