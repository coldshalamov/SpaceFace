import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLD,
  foldPhase,
  foldRisingEdge,
  foldAttackKind,
  projectTesseract,
  reflectAcrossChord,
  chordSide,
  crossedChord,
  invertRadial,
  dampSpeed,
  chordClearOf,
  TESSERACT_EDGES,
} from '../src/data/foldAberrant.js';
import { MACHINE_KINDS } from '../src/data/precursorMachines.js';
import { VERB_TYPE_MEMBERSHIP } from '../src/data/interactionDescriptorCatalog.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { Masks } from '../src/core/entity.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { isHostileToPlayer, contactStateWord } from '../src/systems/scanner.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import {
  materializeFoldAberrant,
  tickFoldAberrant,
  noteFoldAberrantKilled,
} from '../src/systems/foldAberrant.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { lootShards } from '../src/systems/lootShards.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

function makeState(simTime = 0) {
  return {
    meta: { seed: 7 },
    simTime,
    tick: 1,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: {
      currentSectorId: FOLD.sectorId,
      sectorContents: { [FOLD.sectorId]: { dressing: [] } },
    },
  };
}

function makeWorld(state, emitLog = []) {
  const world = {
    state,
    helpers: {
      spawnEntity: (spec) => {
        const e = {
          ...spec,
          alive: true,
          pos: { x: spec.pos.x, y: 0, z: spec.pos.z },
          vel: { x: spec.vel && spec.vel.x || 0, y: 0, z: spec.vel && spec.vel.z || 0 },
          data: spec.data,
        };
        e.id = state.entities.size + 10;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity: (id) => {
        const e = state.entities.get(id);
        if (e) e.alive = false;
      },
    },
    _toGlobal: (local) => {
      world._lastLocal = { x: local.x, z: local.z };
      return { x: local.x + 10000, z: local.z + 20000 };
    },
    active: state.world.sectorContents[FOLD.sectorId],
    bus: { emit: (type, p) => emitLog.push({ type, p }) },
  };
  return world;
}

function addPlayer(state, x, z, vx = 0, vz = 0) {
  const p = {
    id: state.playerId,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x, z },
    vel: { x: vx, z: vz },
    mass: 80,
    hull: 280,
    hullMax: 280,
    radius: 8,
    data: {},
  };
  state.entities.set(p.id, p);
  state.entityList.push(p);
  return p;
}

function bodies(state) {
  return state.entityList.filter((e) => e.data && e.data.foldAberrant && e.data.foldAberrant.role === 'body' && e.alive !== false);
}

function meanRadius(verts, bitOn) {
  let n = 0;
  let s = 0;
  for (let i = 0; i < verts.length; i += 1) {
    const on = (i & 8) !== 0;
    if (on !== bitOn) continue;
    s += Math.hypot(verts[i][0], verts[i][2]);
    n += 1;
  }
  return s / n;
}

test('mid-fold shells stay nested squares, not sheared quads', () => {
  const verts = projectTesseract(0.25);
  const radii = [];
  for (let i = 0; i < 16; i += 1) {
    if ((i & 8) === 0) continue;
    if ((i & 2) !== 0) continue;
    radii.push(Math.hypot(verts[i][0], verts[i][2]));
  }
  assert.equal(radii.length, 4);
  for (const r of radii) assert.ok(Math.abs(r - radii[0]) < 1e-6);
});

test('tesseract projection swaps outer and inner shells across half a turn', () => {
  const a = projectTesseract(0);
  const b = projectTesseract(0.5);
  const aOuter = meanRadius(a, true) > meanRadius(a, false);
  const bOuter = meanRadius(b, true) > meanRadius(b, false);
  assert.notEqual(aOuter, bOuter);
  assert.equal(TESSERACT_EDGES.length, 32);
});

test('fold rising edge fires once across the pass and not on a short wrap', () => {
  assert.equal(foldRisingEdge(0.4, 0.62), true);
  assert.equal(foldRisingEdge(0.62, 0.7), false);
  assert.equal(foldRisingEdge(0.9, 0.1), false);
  assert.equal(foldRisingEdge(0.4, 0.1), true);
  assert.equal(foldAttackKind(0), 'shear');
  assert.equal(foldAttackKind(1), 'corner');
  assert.equal(foldAttackKind(2), 'inside');
  assert.equal(foldAttackKind(3), 'misrepair');
});

test('chord reflection keeps the tangent and only flips the normal', () => {
  const ax = 0;
  const az = 0;
  const bx = 10;
  const bz = 0;
  const reflected = reflectAcrossChord(3, 4, ax, az, bx, bz);
  assert.ok(Math.abs(reflected.x - 3) < 1e-6);
  assert.ok(Math.abs(reflected.z + 4) < 1e-6);
  assert.equal(chordSide(1, 2, ax, az, bx, bz) > 0, true);
  assert.equal(chordSide(-4, 2, ax, az, bx, bz), 0);
  assert.equal(crossedChord(2, -3), true);
  assert.equal(crossedChord(0, -3), false);
  assert.equal(crossedChord(2, 4), false);
});

test('invertRadial flips radial speed and keeps tangential speed', () => {
  const next = invertRadial(30, 20, 40, 0, 0, 0);
  assert.ok(Math.abs(next.x + 30) < 1e-6);
  assert.ok(Math.abs(next.z - 20) < 1e-6);
});

test('dampSpeed does not pin a slower ship and does not zero a vector', () => {
  const slow = dampSpeed(3, 4, 18, 0.5);
  assert.equal(slow.x, 3);
  assert.equal(slow.z, 4);
  const fast = dampSpeed(30, 0, 18, 0.5);
  assert.ok(fast.x < 30 && fast.x >= 18);
  assert.notEqual(fast.x, 0);
});

test('chordClearOf does not lay the chord across the player', () => {
  const chord = chordClearOf(0, 0, 0.4, 160, 40, 10);
  const side = chordSide(40, 10, chord.ax, chord.az, chord.bx, chord.bz);
  assert.ok(side === 0 || Math.abs(side) > 28);
});

test('ashfall anchor is authored local and materialized galactic', () => {
  const g = sectorLocalToGlobalForSector(FOLD.anchor, FOLD.sectorId);
  assert.notEqual(g.x, FOLD.anchor.x);
  assert.notEqual(g.z, FOLD.anchor.z);
});

test('materialize passes the local slot through _toGlobal and does not double-spawn', () => {
  const state = makeState(0.2);
  const world = makeWorld(state);
  const sector = { id: FOLD.sectorId };
  const active = state.world.sectorContents[FOLD.sectorId];
  materializeFoldAberrant(world, sector, active);
  materializeFoldAberrant(world, sector, active);
  assert.equal(world._lastLocal.x, FOLD.anchor.x);
  assert.equal(world._lastLocal.z, FOLD.anchor.z);
  assert.equal(bodies(state).length, 1);
  const body = bodies(state)[0];
  assert.equal(body.pos.x, FOLD.anchor.x + 10000);
  assert.equal(body.pos.z, FOLD.anchor.z + 20000);
  assert.equal(body.physicsBody, false);
  assert.equal(body.team, 1);
  assert.equal(body.factionId, null);
  assert.equal(body.hull, FOLD.hull);
  assert.equal(body.hullMax, FOLD.hull);
  assert.equal(body.data.ai, undefined);
  assert.equal(body.data.machine, undefined);
  assert.equal(body.data.encounter, undefined);
});

test('a cleared fold rematerializes the scar, never the body', () => {
  const state = makeState(1);
  const world = makeWorld(state);
  const rec = ensureAlienEcologyState(state).machineSites;
  rec[FOLD.siteId] = { foldCleared: true, splinterSpawned: true };
  const active = state.world.sectorContents[FOLD.sectorId];
  materializeFoldAberrant(world, { id: FOLD.sectorId }, active);
  materializeFoldAberrant(world, { id: FOLD.sectorId }, active);
  assert.equal(bodies(state).length, 0);
  const scars = state.entityList.filter((e) => e.data && e.data.foldAberrant && e.data.foldAberrant.role === 'scar');
  assert.equal(scars.length, 1);
  assert.equal(scars[0].collides, false);
  const pickups = state.entityList.filter((e) => e.type === 'pickup');
  assert.equal(pickups.length, 0);
});

test('only a body kill completes the fold', () => {
  const state = makeState(1);
  const world = makeWorld(state);
  materializeFoldAberrant(world, { id: FOLD.sectorId }, state.world.sectorContents[FOLD.sectorId]);
  const body = bodies(state)[0];
  const corner = {
    id: 90,
    alive: true,
    type: 'payload',
    data: { foldAberrant: { role: 'corner', siteId: FOLD.siteId, parentId: body.id } },
  };
  state.entities.set(corner.id, corner);
  noteFoldAberrantKilled(world, { id: corner.id });
  assert.notEqual(ensureAlienEcologyState(state).machineSites[FOLD.siteId].foldCleared, true);
  noteFoldAberrantKilled(world, { id: 999 });
  assert.notEqual(ensureAlienEcologyState(state).machineSites[FOLD.siteId].foldCleared, true);
  noteFoldAberrantKilled(world, { id: body.id });
  const rec = ensureAlienEcologyState(state).machineSites[FOLD.siteId];
  assert.equal(rec.foldCleared, true);
  assert.equal(rec.splinterSpawned, true);
  const scar = state.entityList.find((e) => e.data && e.data.foldAberrant && e.data.foldAberrant.role === 'scar');
  assert.ok(scar);
  const splinter = state.entityList.find((e) => e.type === 'pickup');
  assert.equal(splinter.data.commodityId, 'cmdty_inertial_datum');
  assert.equal(splinter.data.amount, 1);
  assert.equal(splinter.flags, undefined);
});

test('corner payload is shootable and tetherable', () => {
  const state = makeState(12.2);
  const emit = [];
  const world = makeWorld(state, emit);
  const anchor = { x: FOLD.anchor.x + 10000, z: FOLD.anchor.z + 20000 };
  addPlayer(state, anchor.x + 30, anchor.z, 20, 0);
  materializeFoldAberrant(world, { id: FOLD.sectorId }, state.world.sectorContents[FOLD.sectorId]);
  tickFoldAberrant(world, 1 / 30);
  const corner = state.entityList.find((e) => e.data && e.data.foldAberrant && e.data.foldAberrant.role === 'corner');
  assert.ok(corner);
  assert.equal(corner.physicsBody === false, false);
  assert.equal(corner.physicsBody.dynamic, true);
  assert.equal((corner.collisionMask & Masks.PROJECTILE) !== 0, true);
  assert.equal(corner.mass, FOLD.cornerMass);
});

test('shear hardens once, as kinetic, and mirrors velocity', () => {
  const state = makeState(0.2);
  const emit = [];
  const world = makeWorld(state, emit);
  const anchor = { x: FOLD.anchor.x + 10000, z: FOLD.anchor.z + 20000 };
  const player = addPlayer(state, anchor.x + 70, anchor.z + 20, 36, 8);
  materializeFoldAberrant(world, { id: FOLD.sectorId }, state.world.sectorContents[FOLD.sectorId]);
  tickFoldAberrant(world, 1 / 30);
  const body = bodies(state)[0];
  const chord = body.data.foldAberrant.chord;
  const side0 = body.data.foldAberrant.chordSide0;
  assert.ok(chord);
  assert.ok(Math.abs(side0) > 28, `expected a real side, got ${side0}`);
  const abx = chord.bx - chord.ax;
  const abz = chord.bz - chord.az;
  const len = Math.hypot(abx, abz) || 1;
  const nx = -abz / len;
  const nz = abx / len;
  const midX = (chord.ax + chord.bx) / 2;
  const midZ = (chord.az + chord.bz) / 2;
  const sign = side0 > 0 ? -1 : 1;
  player.pos.x = midX + nx * sign * 36;
  player.pos.z = midZ + nz * sign * 36;
  player.vel.x = 0;
  player.vel.z = side0 > 0 ? -40 : 40;
  const expected = reflectAcrossChord(player.vel.x, player.vel.z, chord.ax, chord.az, chord.bx, chord.bz);
  state.simTime = 6.1;
  tickFoldAberrant(world, 1 / 30);
  const hit = emit.find((e) => e.type === 'combat:routeDamage');
  assert.ok(hit, 'shear should route a damage packet');
  assert.equal(hit.p.packet.channels.kinetic, FOLD.shearDamage);
  assert.equal(hit.p.packet.damage, undefined);
  assert.ok(Math.abs(player.vel.x - expected.x) < 1e-6);
  assert.ok(Math.abs(player.vel.z - expected.z) < 1e-6);
});

test('inside-out flips the player radial and does not deal damage', () => {
  const state = makeState(24.2);
  const emit = [];
  const world = makeWorld(state, emit);
  const anchor = { x: FOLD.anchor.x + 10000, z: FOLD.anchor.z + 20000 };
  const player = addPlayer(state, anchor.x + 40, anchor.z, 30, 20);
  materializeFoldAberrant(world, { id: FOLD.sectorId }, state.world.sectorContents[FOLD.sectorId]);
  tickFoldAberrant(world, 1 / 30);
  state.simTime = 30.1;
  const fold = bodies(state)[0].data.foldAberrant;
  const offset = FOLD.slide;
  const bx = fold.anchorX + Math.cos(fold.heading) * offset;
  const bz = fold.anchorZ + Math.sin(fold.heading) * offset;
  player.pos.x = bx + 40;
  player.pos.z = bz;
  player.vel.x = 30;
  player.vel.z = 20;
  tickFoldAberrant(world, 1 / 30);
  assert.ok(player.vel.x < 0, `radial should flip, vel ${player.vel.x},${player.vel.z}`);
  assert.ok(player.vel.z > 10);
  assert.equal(emit.some((e) => e.type === 'combat:routeDamage'), false);
  const body = bodies(state)[0];
  assert.equal(body.data.foldAberrant.telegraph.disk === true || body.data.foldAberrant.phase >= FOLD.passPhase, true);
});

test('an unearned misrepair is a shear, and a plate sheds above 40', () => {
  const far = makeState(36.2);
  const world = makeWorld(far);
  const anchor = { x: FOLD.anchor.x + 10000, z: FOLD.anchor.z + 20000 };
  addPlayer(far, anchor.x + 400, anchor.z, 30, 0);
  materializeFoldAberrant(world, { id: FOLD.sectorId }, far.world.sectorContents[FOLD.sectorId]);
  tickFoldAberrant(world, 1 / 30);
  const farBody = bodies(far)[0];
  assert.equal(farBody.data.foldAberrant.shownKind, 'shear');
  assert.equal(far.entityList.some((e) => e.data && e.data.foldAberrant && e.data.foldAberrant.role === 'plate'), false);

  const near = makeState(36.2);
  const nearWorld = makeWorld(near);
  const player = addPlayer(near, anchor.x + 20, anchor.z, 16, 0);
  materializeFoldAberrant(nearWorld, { id: FOLD.sectorId }, near.world.sectorContents[FOLD.sectorId]);
  tickFoldAberrant(nearWorld, 1 / 30);
  const plate = near.entityList.find((e) => e.data && e.data.foldAberrant && e.data.foldAberrant.role === 'plate');
  assert.ok(plate);
  assert.equal((plate.collisionMask & Masks.PROJECTILE) !== 0, true);
  assert.equal(plate.physicsBody.dynamic, true);
  plate.vel.x = 55;
  plate.vel.z = 0;
  tickFoldAberrant(nearWorld, 1 / 30);
  assert.equal(bodies(near)[0].data.foldAberrant.plateShed, true);
  assert.equal(player.alive !== false, true);
});

test('fold hostility is the player category only', () => {
  const state = {
    playerId: 1,
    entities: new Map([[1, { id: 1, team: 0, pos: { x: 0, z: 0 }, data: {} }]]),
    world: {
      currentSectorId: 's',
      sectors: { s: { tier: 3, security: 1 } },
      activeSector: { hazards: [{ center: { x: 0, z: 0 }, radius: 80 }], gates: [] },
    },
  };
  const quiet = { id: 2, team: 1, data: { foldAberrant: { role: 'body' } } };
  const ordinary = { id: 4, team: 1, data: {} };
  assert.equal(isHostileToPlayer(ordinary, 0, state), true);
  assert.equal(isHostileToPlayer(quiet, 0, state), false);
  assert.equal(contactStateWord(quiet, 0, state), 'QUIET');
  quiet.data.combat = { targetId: 1 };
  assert.equal(isHostileToPlayer(quiet, 0, state), true);
  assert.equal(contactStateWord(quiet, 0, state), 'FOLD');
  assert.equal(contactStateWord({ id: 9, team: 2, data: { foldAberrant: { role: 'scar' } } }, 0, state), 'SCAR');
  assert.equal(contactStateWord({ id: 10, team: 2, data: { foldAberrant: { role: 'plate' } } }, 0, state), 'PLATE');
  assert.equal(contactStateWord({ id: 11, team: 2, data: { foldAberrant: { role: 'corner' } } }, 0, state), 'CORNER');
  const wing = { id: 3, team: 0, data: {} };
  const player = state.entities.get(1);
  assert.equal(isHostileForAI(state, wing, quiet), false);
  assert.equal(isHostileForAI(state, player, quiet), true);
});

test('a fold kill is not scrap and not a loot burst', () => {
  const state = makeState(1);
  state.player = { cargo: { items: {} } };
  const body = {
    id: 8,
    type: 'drone',
    team: 1,
    alive: false,
    pos: { x: 1, z: 2 },
    vel: { x: 0, z: 0 },
    data: { name: 'The Unclosed', foldAberrant: { role: 'body' }, combat: { targetId: 1 } },
  };
  state.entities.set(1, { id: 1, type: 'ship', team: 0, pos: { x: 0, z: 0 }, data: {} });
  state.entities.set(body.id, body);
  aftermathWrecks.state = state;
  aftermathWrecks.bus = { emit() {} };
  aftermathWrecks._recordKill({ id: body.id, type: 'drone', pos: body.pos, killerId: 1 });
  const own = state.aftermathWrecks;
  const markers = own && own.bySector && own.bySector[FOLD.sectorId];
  assert.equal(!markers || markers.length === 0, true);

  const drops = [];
  const prevEnabled = MASSLINE2_FLAGS.enabled;
  const prevLoot = MASSLINE2_FLAGS.lootShards;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  try {
    lootShards.init({
      state,
      bus: { on() { return () => {}; }, emit(type) { drops.push(type); } },
      helpers: {},
    });
    lootShards._onKilled({ id: body.id, type: 'drone', killerId: 1, targetHostileToPlayer: true, pos: body.pos });
    assert.equal(drops.includes('loot:drop'), false);
  } finally {
    MASSLINE2_FLAGS.enabled = prevEnabled;
    MASSLINE2_FLAGS.lootShards = prevLoot;
  }
});

test('catalog pins are untouched', () => {
  assert.equal(MACHINE_KINDS[FOLD.siteId], undefined);
  assert.equal(VERB_TYPE_MEMBERSHIP.damage.has('payload'), true);
  assert.equal(VERB_TYPE_MEMBERSHIP.target.has('drone'), true);
  assert.equal(VERB_TYPE_MEMBERSHIP.contact.has('drone'), true);
  assert.equal(COMMODITIES.some((c) => c.id === 'cmdty_inertial_datum'), true);
  assert.equal(foldPhase(0), 0);
});
