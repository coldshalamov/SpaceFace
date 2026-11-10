// Row 390 / AL-HF-08 — production rock obstruction for Massline ADMISSION.
//
// A Wasp behind a rock cannot be latched; moving 30 WU sideways opens a real line. These tests
// exercise the real tetherGameplay system and the real attachment authority against a recording
// physics port. They prove admission geometry only: no wrapping, no swing radius, no whip speed,
// no unwrapping. A recording port is not wrap-physics verification and is not presented as it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { mulberry32 } from '../src/core/rng.js';
import {
  collectMasslineObstructionRocks,
  insertAsteroidFieldRock,
  isMasslineObstructed,
} from '../src/world/asteroidField.js';
import {
  contextualAttachmentWorlds,
  tetherGameplay,
  TWIN_BRIDLE_DEF_ID,
  TWIN_BRIDLE_HEAD_ID,
  validateTwinBridlePair,
} from '../src/systems/tetherGameplay.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { denialNextAction, resolveMasslineBracketRead } from '../src/ui/masslineHud.js';

const DT = 1 / 60;
const SEED = 4242;
const ROCK_ID_BASE = 500;
const BRIDLE_DEF = ATTACHMENT_DEFS.find((def) => def.id === TWIN_BRIDLE_DEF_ID);

// ── harness ────────────────────────────────────────────────────────────────────────────────────

function player(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    collides: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 16,
    maxSpeed: 218,
    flags: {},
    data: {},
    ...overrides,
  };
}

function hostileShip(id, overrides = {}) {
  return {
    id,
    type: 'ship',
    team: 1,
    alive: true,
    collides: true,
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    mass: 500,
    maxSpeed: 210,
    data: { ai: { archetype: 'pirate' }, combat: {} },
    ...overrides,
    pos: { x: 120, z: 0, ...(overrides.pos || {}) },
  };
}

function recordingPhysics() {
  const creates = [];
  const joints = new Map();
  return {
    creates,
    createAttachment(input) {
      creates.push(structuredClone(input));
      const handle = {
        id: input.attachmentId,
        attachmentId: input.attachmentId,
        ownerId: input.ownerId,
        targetId: input.targetId,
      };
      joints.set(input.attachmentId, handle);
      return handle;
    },
    cutAttachment(input) {
      joints.delete(input.attachmentId);
      return true;
    },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return null; },
  };
}

function spawnEntity(state, spec) {
  const id = spec.id != null ? spec.id : (state.nextEntityId || 100) + 1;
  const entity = {
    alive: true,
    collides: true,
    rot: 0,
    ...spec,
    id,
    pos: { x: spec.pos?.x || 0, z: spec.pos?.z || 0 },
    vel: { x: spec.vel?.x || 0, z: spec.vel?.z || 0 },
  };
  state.entities.set(id, entity);
  state.entityList.push(entity);
  return entity;
}

function buildHarness(options = {}) {
  const p = options.player || player();
  const contacts = options.contacts || [];
  const entities = new Map([p, ...contacts].map((entity) => [entity.id, entity]));
  const entityList = [...entities.values()];
  const state = {
    mode: 'flight',
    simTime: options.simTime ?? 5,
    tick: 100,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    nextEntityId: 100,
    playerId: p.id,
    player: {
      heat: 0,
      targetId: null,
      tether: { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' },
    },
    entities,
    entityList,
    input: {
      aimWorld: { x: 120, z: 0 },
      aimIntentActive: true,
      aimAngle: 0,
      turnIntent: 0,
      moveX: 0,
      moveZ: 0,
      tetherMode: null,
      actions: { tetherFire: false, tetherCut: false, reelDelta: 0, massline: null },
    },
    combat: null,
    ...(options.runtime ? { runtime: options.runtime } : {}),
  };
  ensureCombatState(state);

  const bus = createBus();
  const events = { latched: [], denied: [], cut: [], released: [], broke: [], controlDenied: [] };
  bus.on('tether:latched', (payload) => events.latched.push(structuredClone(payload)));
  bus.on('tether:latchDenied', (payload) => events.denied.push(structuredClone(payload)));
  bus.on('tether:cut', (payload) => events.cut.push(structuredClone(payload)));
  bus.on('tether:released', (payload) => events.released.push(structuredClone(payload)));
  bus.on('tether:broke', (payload) => events.broke.push(structuredClone(payload)));
  bus.on('tether:lineControlDenied', (payload) => events.controlDenied.push(structuredClone(payload)));

  const catalog = createCombatCatalog();
  const physics = recordingPhysics();
  const helpers = {
    combatPhysics: physics,
    spawnEntity: (spec) => spawnEntity(state, spec),
  };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const registry = {
    get(name) {
      if (name === 'actions' || name === 'combat') return { kernel };
      return null;
    },
  };
  const system = Object.assign({}, tetherGameplay);
  system.init({ state, bus, helpers, registry });
  return { state, p, bus, events, system, attachments, kernel, helpers, physics, catalog };
}

function step(h, { latch = false, cut = false, aim = null, cursor = null, tetherMode = null, dt = DT } = {}) {
  h.state.tick += 1;
  h.state.simTime += dt;
  h.state.input.tetherMode = tetherMode;
  if (aim) {
    h.state.input.aimWorld.x = aim.x;
    h.state.input.aimWorld.z = aim.z;
  }
  if (cursor != null) h.state.input.aimIntentActive = cursor;
  h.state.input.actions = {
    tetherFire: latch,
    tetherCut: cut,
    reelDelta: 0,
    massline: latch || cut ? { latch, cut, lineControl: false, lineLength: 0 } : null,
  };
  h.system.update(dt, h.state);
}

// The physical endpoints the latch itself will use. Ships are center-of-mass endpoints, so the
// target argument here is ignored for them; passing it keeps the helper honest for surface bodies.
function latchEndpoints(h, target) {
  return contextualAttachmentWorlds(h.p, target, { x: target.pos.x, y: 0, z: target.pos.z });
}

function obstructedAt(h, target, endpoints = null) {
  return isMasslineObstructed({
    state: h.state,
    player: h.p,
    target,
    sourceWorld: (endpoints || latchEndpoints(h, target)).sourceWorld,
    targetWorld: (endpoints || latchEndpoints(h, target)).targetWorld,
  });
}

function dormantRock(h, spec = {}) {
  const record = insertAsteroidFieldRock(h.state, {
    id: spec.id,
    pos: spec.pos || { x: 45, z: 0 },
    vel: spec.vel || { x: 0, z: 0 },
    radius: spec.radius ?? 12,
    mass: spec.mass ?? 640,
    lastExactT: spec.lastExactT,
    data: {
      typeId: 'ast_common_rock',
      oreHP: 80,
      oreHPMax: 80,
      ...(spec.data || {}),
    },
  });
  return record;
}

function liveRock(id, pos, overrides = {}) {
  return {
    id,
    type: 'asteroid',
    team: null,
    alive: true,
    collides: true,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    mass: 640,
    data: {},
    ...overrides,
    pos: { x: pos.x, z: pos.z, ...(overrides.pos || {}) },
  };
}

// ── §1 blocked Wasp, then the 30 WU sidestep ───────────────────────────────────────────────────

test('AL-HF-08 §1: a rock between the ship and the Wasp blocks the latch; a 30 WU sidestep opens it', () => {
  const wasp = hostileShip(2);
  const h = buildHarness({ contacts: [wasp] });
  const rock = dormantRock(h); // (45,0), visual radius 12 — dead on the line to the wasp

  assert.equal(h.helpers.isMasslineObstructed, undefined,
    'the production provider must answer with no injected helper');
  assert.equal(obstructedAt(h, wasp), true,
    'the open ship→Wasp segment passes through the rock');

  // The Wasp is not a latchable candidate; the foreground rock may legitimately stand as the
  // selected target instead (selection semantics are unchanged by admission).
  step(h, { cursor: true, aim: wasp.pos });
  assert.notEqual(h.state.masslineAcquisition?.selected?.targetId, wasp.id,
    'a blocked Wasp cannot be the selected candidate');

  // Move ONLY the player sideways. Aim precisely at the Wasp and press.
  h.p.pos.x = 0;
  h.p.pos.z = 30;
  assert.equal(obstructedAt(h, wasp), false,
    '30 WU sideways clears the rock\'s disc');
  step(h, { cursor: true, aim: wasp.pos, latch: true });

  assert.equal(h.events.denied.length, 0, `unexpected denial: ${JSON.stringify(h.events.denied)}`);
  assert.equal(h.events.latched.at(-1)?.targetId, wasp.id, 'the Wasp attachment succeeds');

  // The obstruction query that admitted the latch used the same physical endpoints the
  // attachment authority was handed.
  const created = h.physics.creates.at(-1);
  assert.equal(created.targetId, wasp.id);
  const endpoints = latchEndpoints(h, wasp);
  assert.equal(created.sourceWorld.x, endpoints.sourceWorld.x);
  assert.equal(created.sourceWorld.z, endpoints.sourceWorld.z);
  assert.equal(created.targetWorld.x, endpoints.targetWorld.x);
  assert.equal(created.targetWorld.z, endpoints.targetWorld.z);
  assert.equal(isMasslineObstructed({
    state: h.state,
    player: h.p,
    target: wasp,
    sourceWorld: created.sourceWorld,
    targetWorld: created.targetWorld,
  }), false, 'the created attachment endpoints are a clear line');
  assert.equal(rock.liveEntityId, null, 'the untouched rock was never promoted by querying');
});

// ── §2 default-route admission and feedback ───────────────────────────────────────────────────

test('AL-HF-08 §2: a collidable but non-tetherable rock denies the Wasp on the default route with readable feedback', () => {
  const wasp = hostileShip(2);
  const h = buildHarness({ contacts: [wasp] });
  dormantRock(h, { data: { masslineTetherable: false } });

  step(h, { cursor: true, aim: wasp.pos });
  const receipt = h.state.masslineAcquisition;
  assert.equal(receipt?.selected?.targetId, wasp.id,
    'the blocked Wasp is still the body the preview names, so the denial is explainable');
  assert.equal(receipt?.selected?.status, 'blocked');
  assert.equal(receipt?.selected?.reason, 'blocked');

  step(h, { cursor: true, aim: wasp.pos, latch: true });
  assert.equal(h.physics.creates.length, 0, 'no attachment is created through the rock');
  assert.equal(h.events.denied.at(-1)?.reason, 'blocked');
  assert.equal(h.events.denied.at(-1)?.reason, 'blocked', 'tether:latchDenied carries reason blocked');
  assert.equal(h.system._active, null);

  assert.equal(denialNextAction('blocked', 'blocked'), 'REPOSITION FOR A CLEAR LINE',
    'the HUD names the next action for a blocked line');
  assert.deepEqual(resolveMasslineBracketRead('blocked', 'blocked'),
    { state: 'DENIED', text: 'DENIED', reason: 'LINE IS BLOCKED' },
    'the bracket reads a blocked line as a denial with its own reason');
});

// ── §3 normal foreground selection ───────────────────────────────────────────────────────────

test('AL-HF-08 §3: a tetherable foreground rock stands as the pick while the Wasp stays blocked', () => {
  const wasp = hostileShip(2);
  const h = buildHarness({ contacts: [wasp] });
  const rock = dormantRock(h);

  step(h, { cursor: true, aim: wasp.pos });
  assert.equal(h.state.masslineAcquisition?.selected?.targetId, rock.id,
    'the existing picker keeps the foreground rock as the valid selected target');
  assert.equal(obstructedAt(h, wasp), true, 'the Wasp remains a blocked target');

  h.p.pos.z = 30;
  step(h, { cursor: true, aim: wasp.pos, latch: true });
  assert.equal(h.events.latched.at(-1)?.targetId, wasp.id,
    'after the sidestep and a precise Wasp aim, Wasp acquisition succeeds');
});

// ── §4 dormant/live parity, and querying mutates nothing ─────────────────────────────────────

test('AL-HF-08 §4: dormant records and live asteroids answer identically and querying mutates neither', () => {
  const wasp = hostileShip(2);
  const dormant = buildHarness({ contacts: [wasp] });
  const rec = dormantRock(dormant);
  const live = buildHarness({ contacts: [wasp, liveRock(77, { x: 45, z: 0 }, {
    radius: 12,
    physicsBody: { radius: 12 * 1.16 },
  })] });

  const field = dormant.state.world.asteroidField;
  const versionBefore = field.version;
  const storedBefore = { ...rec.pos };
  const lastExactBefore = rec.lastExactT;
  const entityCountBefore = dormant.state.entities.size;

  const cleared = { x: 0, z: 30 };
  for (const [label, source] of [['blocked line', { x: 0, z: 0 }], ['cleared line', cleared]]) {
    const endpoints = {
      sourceWorld: { x: source.x, y: 0, z: source.z },
      targetWorld: { x: 120, y: 0, z: 0 },
    };
    const answerDormant = isMasslineObstructed({
      state: dormant.state, player: dormant.p, target: wasp, ...endpoints,
    });
    const answerLive = isMasslineObstructed({
      state: live.state, player: live.p, target: wasp, ...endpoints,
    });
    assert.equal(answerDormant, answerLive, `${label}: dormant and live rocks agree`);
    assert.equal(answerDormant, label === 'blocked line');
  }

  assert.equal(field.version, versionBefore, 'querying never bumps the field version');
  assert.deepEqual(rec.pos, storedBefore, 'querying never advances a dormant record in place');
  assert.equal(rec.lastExactT, lastExactBefore);
  assert.equal(rec.liveEntityId, null, 'querying never promotes');
  assert.equal(dormant.state.entities.size, entityCountBefore, 'querying never mints an entity');
  assert.ok(field.rocks.includes(rec), 'the dormant row is still field-resident');
});

test('AL-HF-08 §4: dormant drift is read at sim time without mutating the record', () => {
  const wasp = hostileShip(2);
  const h = buildHarness({ contacts: [wasp], simTime: 5 });

  // Drifted INTO the line: stored at z=40, two seconds of -20 WU/s puts it dead on the segment.
  const incoming = dormantRock(h, {
    id: ROCK_ID_BASE + 1,
    pos: { x: 45, z: 40 },
    vel: { x: 0, z: -20 },
    lastExactT: 3,
  });
  assert.equal(obstructedAt(h, wasp), true,
    'a dormant rock that drifted onto the line blocks it');
  assert.deepEqual(incoming.pos, { x: 45, z: 40 }, 'the stored pose is untouched');
  assert.equal(incoming.lastExactT, 3);

  // Same rock, drifted AWAY from the line: the stored pose would still block, the live pose does not.
  // A separate field, because the incoming rock above still sits across the line in this one.
  const wasp2 = hostileShip(2);
  const leavingHarness = buildHarness({ contacts: [wasp2], simTime: 5 });
  const leaving = dormantRock(leavingHarness, {
    id: ROCK_ID_BASE + 2,
    pos: { x: 45, z: 0 },
    vel: { x: 0, z: 20 },
    lastExactT: 3,
  });
  assert.equal(obstructedAt(leavingHarness, wasp2), false,
    'a rock that drifted clear of the line no longer blocks it');
  assert.deepEqual(leaving.pos, { x: 45, z: 0 }, 'and it is still not advanced by the query');
});

// ── §5 geometry boundaries ────────────────────────────────────────────────────────────────────

test('AL-HF-08 §5: segment-vs-disc boundaries, exclusions and collider-radius rules', () => {
  const state = { simTime: 0 };
  const segment = (obstacles, extra = {}) => isMasslineObstructed({
    state,
    player: extra.player || null,
    target: extra.target || null,
    sourceWorld: extra.sourceWorld || { x: 0, y: 0, z: 0 },
    targetWorld: extra.targetWorld || { x: 120, y: 0, z: 0 },
    obstacles,
  });
  const rockAt = (x, z, radius, overrides = {}) => ({
    id: 900,
    type: 'asteroid',
    alive: true,
    collides: true,
    pos: { x, z },
    radius,
    physicsBody: { radius },
    data: {},
    ...overrides,
  });

  // Interior tangent lands on the segment: distance == radius is a block (<=, not <).
  assert.equal(segment([rockAt(60, 14, 14)]), true, 'a tangent inside the segment blocks');
  assert.equal(segment([rockAt(60, 13.9, 14)]), true, 'an interior intersection blocks');
  // Wholly before / wholly after an endpoint is clear.
  assert.equal(segment([rockAt(135, 0, 12)]), false, 'a rock beyond the target endpoint does not block');
  assert.equal(segment([rockAt(-15, 0, 12)]), false, 'a rock beyond the source endpoint does not block');
  // The segment is OPEN at both ends. A disc that only touches the endpoint itself sits inside that
  // body's own skin, not on the line between the two bodies, so it is not an obstruction.
  assert.equal(segment([rockAt(-12, 0, 12)]), false,
    'a rock that only touches the source endpoint does not block');
  assert.equal(segment([rockAt(132, 0, 12)]), false,
    'a rock that only touches the target endpoint does not block');
  assert.equal(segment([rockAt(0, 14, 14)]), false,
    'a tangent exactly at the source endpoint is outside the open span');
  assert.equal(segment([rockAt(120, 14, 14)]), false,
    'a tangent exactly at the target endpoint is outside the open span');
  // A disc that reaches past the endpoint tangency into the open span still blocks.
  assert.equal(segment([rockAt(-6, 0, 12)]), true,
    'a disc overlapping the interior from behind the source endpoint blocks');
  assert.equal(segment([rockAt(126, 0, 12)]), true,
    'a disc overlapping the interior from past the target endpoint blocks');

  // Ineligible bodies never block.
  assert.equal(segment([rockAt(60, 0, 12, { alive: false })]), false, 'dead rows do not block');
  assert.equal(segment([rockAt(60, 0, 12, { collides: false })]), false, 'non-colliding bodies do not block');
  assert.equal(segment([rockAt(60, 0, 12, { physicsBody: false })]), false, 'scripted rocks do not block');

  // Endpoints are never their own obstacles.
  const latchedRock = rockAt(60, 0, 14);
  assert.equal(segment([latchedRock], { target: latchedRock }), false,
    'the latched rock itself is excluded');
  const asteroidEndpoint = rockAt(60, 0, 14, { id: 901 });
  assert.equal(segment([asteroidEndpoint], { player: { id: 901 } }), false,
    'the source endpoint is excluded');
  // A dormant endpoint's corresponding live identity is excluded too.
  const dormantEndpoint = {
    id: 902,
    type: 'asteroid',
    alive: true,
    fieldResident: true,
    liveEntityId: 901,
    pos: { x: 0, z: 0 },
    radius: 12,
    data: {},
  };
  assert.equal(segment([asteroidEndpoint], { target: dormantEndpoint }), false,
    'a dormant endpoint excludes the live body it was promoted to');

  // Zero-length finite segments are clear; malformed geometry fails closed.
  assert.equal(segment([rockAt(0, 0, 40)], { targetWorld: { x: 0, y: 0, z: 0 } }), false,
    'a finite zero-length segment returns false');
  assert.equal(isMasslineObstructed({ state, sourceWorld: null, targetWorld: { x: 1, z: 0 }, obstacles: [] }), true,
    'missing endpoints fail closed');
  assert.equal(isMasslineObstructed({
    state,
    sourceWorld: { x: Number.NaN, z: 0 },
    targetWorld: { x: 1, z: 0 },
    obstacles: [],
  }), true, 'non-finite endpoints fail closed');

  // Ordinary vs optic collider radius on a dormant record (promotion's own rules).
  const ordinary = {
    id: 903,
    type: 'asteroid',
    alive: true,
    fieldResident: true,
    pos: { x: 60, z: 13 },
    radius: 12,
    data: { typeId: 'ast_common_rock' },
  };
  assert.equal(segment([ordinary]), true,
    'an ordinary rock uses the promotion collider radius (12 × 1.16 > 13)');
  assert.equal(segment([{ ...ordinary, pos: { x: 60, z: 11 }, data: {
    opticStructureId: 'scatter:test:1',
    opticMaterial: 'stone',
    opticLatticeSpacing: 20,
  } }]), false,
  'an optic stone uses the optic collider radius (min(12, 10) < 11)');

  // Omitted obstacles: collect for the segment's own bounds, and never retain the batch.
  const h = buildHarness({ contacts: [hostileShip(2)] });
  dormantRock(h);
  assert.equal(obstructedAt(h, hostileShip(2, { pos: { x: 120, z: 0 } })), true,
    'omitting the batch collects live+dormant candidates for that segment');
  const scratch = [];
  const collected = collectMasslineObstructionRocks(
    h.state,
    { minX: 0, minZ: -5, maxX: 120, maxZ: 5 },
    scratch,
  );
  assert.equal(collected, scratch, 'the collector reuses the caller\'s array');
  assert.equal(collected.length, 1);
  assert.equal(collectMasslineObstructionRocks(h.state, null, scratch).length, 0,
    'malformed bounds collect nothing');
});

// ── §6 fresh press validation against a rock that arrived after publication ───────────────────

test('AL-HF-08 §6: a rock entering the line after the preview publishes blocks the press', () => {
  const wasp = hostileShip(2);
  const h = buildHarness({ contacts: [wasp] });

  step(h, { cursor: true, aim: wasp.pos });
  assert.equal(h.state.masslineAcquisition?.selected?.targetId, wasp.id);
  assert.equal(h.state.masslineAcquisition?.selected?.status, 'ready');

  dormantRock(h); // arrives between publication and the press

  step(h, { cursor: false, aim: wasp.pos, latch: true });
  assert.equal(h.physics.creates.filter((entry) => entry.targetId === wasp.id).length, 0,
    'zero Wasp attachments are created');
  assert.equal(h.events.denied.at(-1)?.reason, 'blocked',
    'the fresh single-target revalidation denies the latch as blocked');
});

// ── §7 an existing line is never severed by obstruction ──────────────────────────────────────

test('AL-HF-08 §7: a rock crossing an active line does not cut it', () => {
  const wasp = hostileShip(2);
  const h = buildHarness({ contacts: [wasp] });

  step(h, { cursor: true, aim: wasp.pos, latch: true });
  assert.equal(h.events.latched.length, 1);
  const attachmentId = h.system._active.attachmentId;

  dormantRock(h, { pos: { x: 60, z: 0 } }); // now sits across the active line

  for (let i = 0; i < 120; i++) step(h);

  assert.equal(h.attachments.get(attachmentId).state, 'active',
    'the original attachment stays active');
  assert.deepEqual([h.system._active.attachmentId, h.system._active.targetId], [attachmentId, wasp.id]);
  assert.equal(h.events.cut.length, 0, 'no cut event is caused by obstruction');
  assert.equal(h.events.released.length, 0, 'no release event is caused by obstruction');
  assert.equal(h.events.broke.length, 0, 'no break event is caused by obstruction');
});

// ── §8 alternate acquisition paths ───────────────────────────────────────────────────────────

test('AL-HF-08 §8: Ctrl-nearest cannot bypass the rock, and the Twin Bridle checks its remote pair', () => {
  // Ctrl-nearest with a tetherable blocking rock: the pick is the rock, never the shielded Wasp.
  // (Ctrl-nearest is pure entity geometry, so the blocking body must be a live asteroid; a dormant
  // field record is not an entity candidate. The default press can still pick one — see §3.)
  {
    const wasp = hostileShip(2);
    const rock = liveRock(77, { x: 45, z: 0 }, { radius: 12, physicsBody: { radius: 12 * 1.16 } });
    const h = buildHarness({ contacts: [wasp, rock] });
    step(h, { tetherMode: 'nearest', latch: true });
    assert.equal(h.events.latched.at(-1)?.targetId, rock.id,
      'nearest-first geometry skips the blocked Wasp and takes the rock');
  }
  // Ctrl-nearest with a non-tetherable blocking rock: no attachment, and the Wasp is never welded.
  {
    const wasp = hostileShip(2);
    const h = buildHarness({ contacts: [wasp] });
    dormantRock(h, { data: { masslineTetherable: false } });
    step(h, { tetherMode: 'nearest', latch: true });
    assert.equal(h.physics.creates.length, 0, 'Ctrl-nearest cannot bypass rock obstruction');
    assert.equal(h.events.denied.at(-1)?.reason, 'no-target');
  }
  // Control: with the rock gone, Ctrl-nearest latches the Wasp normally.
  {
    const wasp = hostileShip(2);
    const h = buildHarness({ contacts: [wasp] });
    step(h, { tetherMode: 'nearest', latch: true });
    assert.equal(h.events.latched.at(-1)?.targetId, wasp.id);
  }

  // Twin Bridle: the admission segment is the remote A→B pair, and neither endpoint obstructs it.
  {
    const source = hostileShip(3, { pos: { x: 30, z: 0 }, radius: 8, mass: 60, team: 1 });
    const target = liveRock(4, { x: 150, z: 0 }, { radius: 8, mass: 60 });
    const h = buildHarness({ contacts: [source, target] });

    assert.equal(validateTwinBridlePair(h.system, h.state, h.p, source, target, BRIDLE_DEF), null,
      'the asteroid endpoint does not obstruct its own bridle');

    dormantRock(h, { pos: { x: 90, z: 0 } });
    assert.equal(validateTwinBridlePair(h.system, h.state, h.p, source, target, BRIDLE_DEF), 'blocked',
      'a rock on the remote segment blocks the pair');

    // A rock that would block a player→target line but sits off the remote segment changes nothing:
    // the controller ship is never an endpoint of the bridle.
    const offPair = buildHarness({ contacts: [source, target] });
    dormantRock(offPair, { pos: { x: 15, z: 0 }, radius: 5 });
    assert.equal(validateTwinBridlePair(offPair.system, offPair.state, offPair.p, source, target, BRIDLE_DEF), null,
      'the remote pair is checked, not the controller ship');
  }
});

// ── §8 the Twin Bridle's second press admits the remote pair ─────────────────────────────────

test('AL-HF-08 §8: the Twin Bridle second press admits the remote A→B pair, not the controller line', () => {
  const setup = (blocker) => {
    const source = hostileShip(3, { pos: { x: 30, z: 30 }, radius: 8, mass: 55 });
    const target = hostileShip(4, { pos: { x: 120, z: 30 }, radius: 8, mass: 55 });
    const h = buildHarness({
      player: player({ data: { derived: { masslineHeadId: TWIN_BRIDLE_HEAD_ID } } }),
      contacts: blocker ? [source, target, blocker] : [source, target],
      runtime: { features: PRODUCTION_FEATURES },
    });
    const bridleEvents = [];
    h.bus.on('massline:bridleSetupEnded', (payload) => bridleEvents.push(structuredClone(payload)));
    return { h, source, target, bridleEvents };
  };
  const selectEndpointA = (h, source) => {
    step(h, { aim: source.pos });
    step(h, { aim: source.pos, latch: true });
    assert.equal(h.state.masslineBridle?.sourceId, source.id, 'the first press selects endpoint A');
  };
  const activeRopes = (h) => Object.values(h.state.combat.attachments.byId)
    .filter((entry) => entry.state === 'active');

  // The controller→B chord runs through the rock at (60,15); the bridle's own A→B chord is clear.
  // The second press must admit the pair it will actually span, not the controller's line.
  {
    const rock = liveRock(77, { x: 60, z: 15 }, { radius: 6, physicsBody: { radius: 6 } });
    const { h, source, target, bridleEvents } = setup(rock);
    selectEndpointA(h, source);

    assert.equal(isMasslineObstructed({
      state: h.state,
      player: h.p,
      target,
      sourceWorld: { x: h.p.pos.x, z: h.p.pos.z },
      targetWorld: { x: target.pos.x, z: target.pos.z },
    }), true, 'the controller→B chord is genuinely blocked, so only the pair rule can admit it');
    assert.equal(validateTwinBridlePair(h.system, h.state, h.p, source, target, BRIDLE_DEF), null,
      'the remote A→B pair the rope will span is clear');

    step(h, { aim: target.pos, dt: 0.1 });
    assert.equal(h.state.masslineAcquisition?.selected?.targetId, target.id,
      'the second press preview names B even though the controller→B line is blocked');
    assert.equal(h.state.masslineAcquisition?.selected?.status, 'ready');
    step(h, { aim: target.pos, latch: true });

    assert.equal(bridleEvents.length, 0,
      `the second press must not cancel the setup: ${JSON.stringify(bridleEvents)}`);
    const ropes = activeRopes(h);
    assert.equal(ropes.length, 1, 'the two presses create exactly one rope');
    assert.deepEqual([ropes[0].ownerId, ropes[0].targetId], [source.id, target.id],
      'the rope spans the remote A→B pair');
    const created = h.physics.creates.at(-1);
    assert.deepEqual([created.ownerId, created.targetId], [source.id, target.id]);
  }

  // Control: with the rock gone, the same inputs create the same one rope.
  {
    const { h, source, target, bridleEvents } = setup(null);
    selectEndpointA(h, source);
    step(h, { aim: target.pos, dt: 0.1 });
    assert.equal(h.state.masslineAcquisition?.selected?.targetId, target.id);
    step(h, { aim: target.pos, latch: true });
    assert.equal(bridleEvents.length, 0);
    const ropes = activeRopes(h);
    assert.equal(ropes.length, 1);
    assert.deepEqual([ropes[0].ownerId, ropes[0].targetId], [source.id, target.id]);
  }

  // A rock on the remote pair that is clear of the controller line denies B: the press never
  // falls back to welding the controller's own line just because that line is unobstructed.
  {
    const pairRock = liveRock(78, { x: 75, z: 30 }, {
      radius: 6,
      physicsBody: { radius: 6 },
      data: { masslineTetherable: false },
    });
    const { h, source, target } = setup(pairRock);
    selectEndpointA(h, source);
    step(h, { aim: target.pos, dt: 0.1 });
    assert.notEqual(h.state.masslineAcquisition?.selected?.targetId, target.id,
      'a blocked remote pair cannot be previewed as a ready B');
    step(h, { aim: target.pos, latch: true });
    assert.equal(activeRopes(h).filter((entry) => entry.targetId === target.id).length, 0,
      'no rope is welded to the blocked endpoint');
  }
});

// ── §9 deterministic replay ────────────────────────────────────────────────────────────────

test('AL-HF-08 §9: the seed-4242 obstruction sequence replays identically', () => {
  const runOnce = () => {
    const rng = mulberry32(SEED);
    const wasp = hostileShip(2);
    const h = buildHarness({ contacts: [wasp] });
    const receipts = [];
    const record = () => receipts.push({
      tick: h.state.tick,
      selected: h.state.masslineAcquisition?.selected
        ? {
          targetId: h.state.masslineAcquisition.selected.targetId,
          status: h.state.masslineAcquisition.selected.status,
          reason: h.state.masslineAcquisition.selected.reason,
        }
        : null,
      reason: h.state.masslineAcquisition?.reason ?? null,
    });

    const rockRadius = 10 + Math.round(rng() * 4); // 10..14
    // A non-tetherable rock is a pure obstacle: the scored pick still names the Wasp so the press
    // can be denied as blocked (a tetherable one would simply be taken as the pick — see §3).
    dormantRock(h, {
      pos: { x: 40 + Math.round(rng() * 10), z: 0 },
      radius: rockRadius,
      data: { masslineTetherable: false },
    });

    step(h, { cursor: true, aim: wasp.pos });
    record();
    step(h, { cursor: true, aim: wasp.pos, latch: true });
    record();
    h.p.pos.z = 30;
    step(h, { cursor: true, aim: wasp.pos });
    record();
    step(h, { cursor: true, aim: wasp.pos, latch: true });
    record();
    for (let i = 0; i < 30; i++) step(h);
    step(h, { cut: true });
    record();

    return {
      receipts,
      created: h.physics.creates.map((entry) => ({
        targetId: entry.targetId,
        sourceWorld: entry.sourceWorld,
        targetWorld: entry.targetWorld,
      })),
      attachments: Object.values(h.state.combat.attachments.byId).map((entry) => ({
        id: entry.id,
        ownerId: entry.ownerId,
        targetId: entry.targetId,
        state: entry.state,
      })),
      latched: h.events.latched.map((entry) => ({
        targetId: entry.targetId,
        type: entry.type,
        previewMatched: entry.previewMatched,
      })),
      denied: h.events.denied,
      cut: h.events.cut,
      released: h.events.released,
      broke: h.events.broke,
    };
  };

  const first = runOnce();
  const second = runOnce();
  assert.deepEqual(second, first, 'both runs produce the same receipts, attachments and events');
  assert.ok(first.denied.some((entry) => entry.reason === 'blocked'),
    'the scripted sequence exercises a blocked press');
  assert.equal(first.latched.at(-1)?.targetId, 2, 'and ends on a real Wasp latch after the sidestep');
  assert.ok(first.attachments.some((entry) => entry.state === 'broken'),
    'the scripted cut is part of the replayed stream');
});
