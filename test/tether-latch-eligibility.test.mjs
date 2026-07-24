// Packet T04 — latch eligibility, readable denial reasons, duplicate attach, save/load, determinism.
// Pure node harness (no Rapier). Exercises tetherGameplay + real attachment authority with a
// stub combatPhysics port. Does not edit forbidden physics owners.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { rankMasslineTargets } from '../src/combat/masslineTargetScoring.js';
import { isAttachable, tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;
const TETHER_DEF = { maxLength: 390, minLength: 18, reelRate: 69 };

function player(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 16,
    maxSpeed: 218,
    flags: {},
    ...overrides,
  };
}

function hostileShip(id, overrides = {}) {
  const base = {
    id,
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 200, z: 0 },
    vel: { x: 0, z: 60 },
    radius: 12,
    mass: 500,
    data: {
      ai: { archetype: 'pirate' },
      combat: { targetId: null, lockTarget: null },
    },
  };
  return mergeEntity(base, overrides);
}

function allyShip(id, overrides = {}) {
  return mergeEntity({
    id,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 180, z: 20 },
    vel: { x: 0, z: 40 },
    radius: 12,
    mass: 500,
    data: { ai: { passive: true }, combat: {} },
  }, overrides);
}

function wingmanShip(id, overrides = {}) {
  return mergeEntity({
    id,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 160, z: -10 },
    vel: { x: 0, z: 0 },
    radius: 10,
    mass: 80,
    data: { isWingman: true, ai: { passive: true }, combat: {} },
  }, overrides);
}

function station(id, overrides = {}) {
  return mergeEntity({
    id,
    type: 'station',
    team: 0,
    alive: true,
    pos: { x: 150, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 40,
    mass: 5000,
    data: {},
  }, overrides);
}

function asteroid(id, overrides = {}) {
  return mergeEntity({
    id,
    type: 'asteroid',
    team: null,
    alive: true,
    pos: { x: 220, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 14,
    mass: 640,
    collides: true,
    data: {},
  }, overrides);
}

function mergeEntity(base, overrides) {
  return {
    ...base,
    ...overrides,
    pos: { ...base.pos, ...(overrides.pos || {}) },
    vel: { ...base.vel, ...(overrides.vel || {}) },
    data: {
      ...(base.data || {}),
      ...(overrides.data || {}),
      ai: { ...(base.data?.ai || {}), ...(overrides.data?.ai || {}) },
      combat: { ...(base.data?.combat || {}), ...(overrides.data?.combat || {}) },
    },
  };
}

function makeSpatialHash(entityList) {
  return {
    diagnostics: { activeBuckets: 1 },
    queryRadius(x, z, radius, out) {
      for (const e of entityList) {
        if (!e || !e.pos || e.alive === false) continue;
        const d = Math.hypot(e.pos.x - x, e.pos.z - z);
        if (d <= radius + (e.radius || 0)) out.push(e);
      }
    },
  };
}

function stubCombatPhysics() {
  const joints = new Map();
  return {
    createAttachment(input) {
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
    _joints: joints,
  };
}

function buildHarness(contacts, options = {}) {
  const p = options.player || player();
  const entityList = [p, ...contacts];
  const entities = new Map(entityList.map((e) => [e.id, e]));
  const state = {
    mode: 'flight',
    simTime: options.simTime ?? 1,
    tick: options.tick ?? 60,
    playerId: p.id,
    player: {
      heat: 0,
      targetId: options.targetId ?? null,
      tether: { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' },
      ...(options.playerState || {}),
    },
    entities,
    entityList,
    spatialHash: makeSpatialHash(entityList),
    input: {
      aimWorld: options.aimWorld || { x: 200, z: 0 },
      aimAngle: options.aimAngle ?? 0,
      tetherMode: options.tetherMode || null,
      actions: {
        tetherFire: false,
        tetherCut: false,
        reelDelta: 0,
        ...(options.actions || {}),
      },
    },
    combat: null,
  };
  ensureCombatState(state);

  const bus = createBus();
  const events = {
    latched: [],
    denied: [],
    cut: [],
    released: [],
    broke: [],
    reel: [],
    lineControlDenied: [],
    toasts: [],
  };
  bus.on('tether:latched', (payload) => events.latched.push(clone(payload)));
  bus.on('tether:latchDenied', (payload) => events.denied.push(clone(payload)));
  bus.on('tether:cut', (payload) => events.cut.push(clone(payload)));
  bus.on('tether:released', (payload) => events.released.push(clone(payload)));
  bus.on('tether:broke', (payload) => events.broke.push(clone(payload)));
  bus.on('tether:reel', (payload) => events.reel.push(clone(payload)));
  bus.on('tether:lineControlDenied', (payload) => events.lineControlDenied.push(clone(payload)));
  bus.on('toast', (payload) => events.toasts.push(clone(payload)));

  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics() };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const registry = {
    get(name) {
      if (name === 'actions') return { kernel };
      if (name === 'combat') return { kernel };
      return null;
    },
  };

  const system = Object.assign({}, tetherGameplay);
  system.init({ state, bus, helpers, registry });

  return { state, p, bus, events, system, attachments, kernel, helpers, catalog };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function fireLatch(h, actions = {}) {
  h.state.input.actions = {
    tetherFire: true,
    tetherCut: false,
    reelDelta: 0,
    ...actions,
  };
  h.system.update(DT, h.state);
  h.state.input.actions.tetherFire = false;
  h.state.input.actions.tetherCut = false;
}

function tapCut(h) {
  // F-toggle while attached: input sets tetherCut on the same edge; cut needs a non-held reel
  // and a later tick so the tap window can release.
  h.state.input.actions = { tetherFire: false, tetherCut: true, reelDelta: 0 };
  h.system.update(DT, h.state);
  h.state.tick += 1;
  h.state.simTime += DT;
  h.state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
  h.system.update(DT, h.state);
}

// ── §1 eligibility matrix ──────────────────────────────────────────────────────────────────────

test('T04 §1: scoring stays explainable while direct Massline attachment accepts physical objects', () => {
  // Pure scorer matrix (mirrors what tetherGameplay ownershipOf feeds).
  const p = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const h = { id: 'h', pos: { x: 200, z: 0 }, vel: { x: 0, z: 60 }, mass: 500, radius: 12 };
  const a = { id: 'a', pos: { x: 200, z: 0 }, vel: { x: 0, z: 60 }, mass: 500, radius: 12 };
  const own = { id: 'own', pos: { x: 200, z: 0 }, vel: { x: 0, z: 60 }, mass: 500, radius: 12 };
  const st = { id: 'st', pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, mass: 5000, radius: 40 };

  const ranked = rankMasslineTargets(p, [a, h, own, st], {
    maxRange: 390,
    ownershipOf: (t) => {
      if (t.id === 'own') return 'own';
      if (t.id === 'st') return 'station';
      if (t.id === 'h') return 'hostile';
      if (t.id === 'a') return 'ally';
      return 'neutral';
    },
    isHostile: (t) => t.id === 'h',
  });
  assert.equal(ranked[0].id, 'h', 'hostile outranks comparable ally/neutral');
  const allyRec = ranked.find((r) => r.id === 'a');
  assert.ok(allyRec.score > 0, 'ally remains eligible');
  assert.ok(allyRec.score < ranked[0].score, 'ally is damped below hostile');
  assert.equal(ranked.find((r) => r.id === 'own').rating, 'protected');
  assert.equal(ranked.find((r) => r.id === 'st').rating, 'protected');

  // Runtime attachment is physical, not ownership/category policy.
  {
    const stn = station(10, { pos: { x: 150, z: 0 } });
    const harness = buildHarness([stn], { aimWorld: { x: 150, z: 0 } });
    fireLatch(harness);
    assert.equal(harness.events.latched[0]?.targetId, stn.id, 'station must latch');
    assert.equal(harness.events.denied.length, 0);
  }

  // The player can deliberately move even an owned/wingman physical body.
  {
    const wing = wingmanShip(11, { pos: { x: 140, z: 0 } });
    const harness = buildHarness([wing], { aimWorld: { x: 140, z: 0 } });
    fireLatch(harness);
    assert.equal(harness.events.latched[0]?.targetId, wing.id);
    assert.equal(harness.events.denied.length, 0);
  }

  // Runtime: ally alone is eligible and latches.
  {
    const ally = allyShip(12, { pos: { x: 170, z: 0 }, vel: { x: 0, z: 50 } });
    const harness = buildHarness([ally], { aimWorld: { x: 170, z: 0 } });
    fireLatch(harness);
    assert.equal(harness.events.denied.length, 0, `ally should not deny: ${JSON.stringify(harness.events.denied)}`);
    assert.equal(harness.events.latched.length, 1);
    assert.equal(harness.events.latched[0].targetId, ally.id);
  }

  // Nearby fallback is deterministic: equal geometry resolves by entity id, not combat category.
  {
    const foe = hostileShip(1002, { pos: { x: 200, z: 0 }, vel: { x: 0, z: 60 } });
    const friend = allyShip(1001, { pos: { x: 200, z: 0 }, vel: { x: 0, z: 60 } });
    const harness = buildHarness([friend, foe], { aimWorld: { x: 200, z: 0 } });
    fireLatch(harness);
    assert.equal(harness.events.latched.length, 1);
    assert.equal(harness.events.latched[0].targetId, friend.id, 'equal-distance peers resolve by stable id');
  }

  // Surface-reach contract (pre-T04): center <= maxLength + radius. maxLength=390, radius=20.
  // Independent hard-coded bounds: center-at-390 latches; surface-within-390 (center 410) latches;
  // surface-beyond (center 410.001) fails out-of-range.
  {
    const rockAt = asteroid(15, { pos: { x: 390, z: 0 }, radius: 20, mass: 640 });
    const h = buildHarness([rockAt], { aimWorld: { x: 390, z: 0 } });
    fireLatch(h);
    assert.equal(h.events.latched.length, 1, 'center exactly at maxLength latches');
    assert.equal(h.events.latched[0].targetId, rockAt.id);
  }
  {
    const rockSurf = asteroid(16, { pos: { x: 410, z: 0 }, radius: 20, mass: 640 });
    const h = buildHarness([rockSurf], { aimWorld: { x: 410, z: 0 } });
    fireLatch(h);
    assert.equal(h.events.denied.length, 0, `surface-within must latch: ${JSON.stringify(h.events.denied)}`);
    assert.equal(h.events.latched.length, 1, 'surface exactly at maxLength remains latchable');
    assert.equal(h.events.latched[0].targetId, rockSurf.id);
  }
  {
    // Surface beyond maxLength: exclusive Focus lease keeps the denial as out-of-range
    // (ordinary pool pre-filter would drop it as no-target; Focus is exclusive past reach).
    const foeBeyond = hostileShip(17, { pos: { x: 410.001, z: 0 }, radius: 20, mass: 500 });
    const h = buildHarness([foeBeyond], {
      aimWorld: { x: 410.001, z: 0 },
      targetId: foeBeyond.id,
      playerState: {
        flybyFocus: { active: true, targetId: foeBeyond.id, until: 99, latchScale: 1 },
      },
    });
    fireLatch(h);
    assert.equal(h.events.latched.length, 0);
    assert.equal(h.events.denied[0]?.reason, 'out-of-range');
    assert.equal(h.events.denied[0]?.targetId, foeBeyond.id);
  }

  // Nearest-mode remains the same physical fallback and does not add policy gates.
  {
    const stn = station(18, { pos: { x: 150, z: 0 } });
    const h = buildHarness([stn], { aimWorld: { x: 150, z: 0 }, tetherMode: 'nearest' });
    fireLatch(h);
    assert.equal(h.events.latched[0]?.targetId, stn.id);
    assert.equal(h.events.denied.length, 0);
  }
  {
    const wing = wingmanShip(19, { pos: { x: 140, z: 0 } });
    const h = buildHarness([wing], { aimWorld: { x: 140, z: 0 }, tetherMode: 'nearest' });
    fireLatch(h);
    assert.equal(h.events.latched[0]?.targetId, wing.id);
    assert.equal(h.events.denied.length, 0);
  }
  {
    const ally = allyShip(22, { pos: { x: 160, z: 0 }, vel: { x: 0, z: 50 } });
    const h = buildHarness([ally], { aimWorld: { x: 160, z: 0 }, tetherMode: 'nearest' });
    fireLatch(h);
    assert.equal(h.events.denied.length, 0, `ally-nearest should latch: ${JSON.stringify(h.events.denied)}`);
    assert.equal(h.events.latched.length, 1);
    assert.equal(h.events.latched[0].targetId, ally.id);
  }

  // A deliberate scanner selection of a released World Site payload outranks stale navigation
  // state, so the public Tab + Space delivery path does not need an internal entity-id fixture.
  {
    const payload = {
      id: 23,
      type: 'payload',
      alive: true,
      pos: { x: 145, z: 30 },
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 180,
      collides: false,
      data: {
        role: 'world_site_payload',
        worldSiteTargetable: true,
        worldRecordId: 'world_site_test/payload/coil',
      },
    };
    const nearerRock = asteroid(24, { pos: { x: 70, z: 0 } });
    const staleRoute = asteroid(25, { pos: { x: 90, z: 0 } });
    const h = buildHarness([nearerRock, staleRoute, payload], {
      targetId: payload.id,
      aimWorld: { x: nearerRock.pos.x, z: nearerRock.pos.z },
    });
    h.state.nav = { waypoint: { targetEntityId: staleRoute.id } };
    fireLatch(h);
    assert.equal(h.events.denied.length, 0);
    assert.equal(h.events.latched[0]?.targetId, payload.id);
  }
});

test('transient projectiles and effects are not Massline targets unless explicitly opted in', () => {
  const base = {
    alive: true,
    pos: { x: 40, z: 0 },
  };
  assert.equal(isAttachable({ ...base, id: 31, type: 'projectile' }, 1), false);
  assert.equal(isAttachable({ ...base, id: 32, type: 'fx' }, 1), false);
  assert.equal(isAttachable({
    ...base,
    id: 33,
    type: 'projectile',
    data: { masslineTetherable: true },
  }, 1), true, 'an authored physical projectile may opt in explicitly');
  assert.equal(isAttachable({ ...base, id: 34, type: 'unregistered-world-object' }, 1), true,
    'durable world objects must not require a central eligibility-list edit');
});

test('Ctrl-nearest bypasses a farther selected target and attaches the nearest physical object', () => {
  const selected = asteroid(41, { pos: { x: 280, z: 0 } });
  const nearest = station(42, { pos: { x: 75, z: 0 }, radius: 10 });
  const h = buildHarness([selected, nearest], {
    targetId: selected.id,
    tetherMode: 'nearest',
    aimWorld: { x: selected.pos.x, z: selected.pos.z },
  });

  fireLatch(h);

  assert.equal(h.events.denied.length, 0);
  assert.equal(h.events.latched[0]?.targetId, nearest.id);
});

test('released World Site payload selection is resolved directly on the latch tick', () => {
  const relayCore = asteroid(26, {
    pos: { x: 100, z: 0 },
    data: {
      worldSiteId: 'world_site_test',
      worldSiteComponentId: 'relay_core',
      worldRecordId: 'world_site_test/component/relay_core',
    },
  });
  const payload = {
    id: 27,
    type: 'payload',
    alive: true,
    pos: { x: 145, z: 30 },
    vel: { x: 0, z: 0 },
    radius: 6,
    mass: 180,
    collides: false,
    data: {
      role: 'world_site_payload',
      worldSiteTargetable: true,
      worldRecordId: 'world_site_test/payload/coil',
    },
  };
  const h = buildHarness([relayCore, payload], {
    aimWorld: { x: relayCore.pos.x, z: relayCore.pos.z },
  });

  h.system.update(DT, h.state);
  assert.equal(h.state.masslineAcquisition, null,
    'idle flight must not create an automatic Massline receipt');

  h.state.player.targetId = payload.id;
  fireLatch(h);

  assert.equal(h.events.denied.length, 0);
  assert.equal(h.events.latched.length, 1);
  assert.equal(h.events.latched[0]?.targetId, payload.id);
  assert.equal(h.events.latched[0]?.previewMatched, false);
});

// ── §2 duplicate attach / F-toggle cut ─────────────────────────────────────────────────────────

test('T04 §2: F while attached cuts (toggle); second create hits owner_attachment_limit', () => {
  const rock = asteroid(20, { pos: { x: 120, z: 0 } });
  const harness = buildHarness([rock], { aimWorld: { x: 120, z: 0 } });
  fireLatch(harness);
  assert.equal(harness.events.latched.length, 1);
  assert.ok(harness.system._active, 'mirror tracks active attachment');
  const firstId = harness.system._active.attachmentId;

  // While attached, the free→latch branch is not taken; F-toggle is cut.
  harness.state.simTime += 1;
  harness.state.tick += 60;
  // Clear latch-release grace so tap-cut is accepted.
  harness.system._ignoreReleaseCutUntilReelIdle = false;
  harness.system._latchGraceUntil = 0;
  tapCut(harness);
  assert.equal(harness.events.released.length, 1, 'F while attached cuts the line');
  assert.equal(harness.system._active, null);

  // Authority maxPerOwner: inject an active owned line that does NOT occupy the player spool
  // socket, so create reaches the maxPerOwner gate (spool maxAttachments would otherwise fire first).
  const rock2 = asteroid(21, { pos: { x: 100, z: 0 } });
  harness.state.entities.set(rock2.id, rock2);
  harness.state.entityList.push(rock2);
  harness.state.combat.attachments.byId.att_injected = {
    id: 'att_injected',
    defId: 'tether_standard',
    ownerId: harness.p.id,
    targetId: rock.id,
    sourceSocketId: 'socket_not_spool',
    targetSocketId: 'socket_tether_anchor',
    state: 'active',
    restLength: 100,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
    createdTick: harness.state.tick,
    brokenTick: null,
    breakReason: null,
  };
  const blocked = harness.attachments.create({
    defId: 'tether_standard',
    ownerId: harness.p.id,
    targetId: rock2.id,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'owner_attachment_limit', 'pin maxPerOwner=1');

  // Gameplay passthrough of the authority reason (stub create so adoptExisting cannot re-bind).
  const passthrough = buildHarness([rock2], { aimWorld: { x: 100, z: 0 } });
  passthrough.kernel.attachments = {
    get: () => null,
    listForEntity: () => [],
    create: () => ({ ok: false, reason: 'owner_attachment_limit' }),
    cut: () => ({ ok: false, reason: 'attachment_missing' }),
    breakPolicy: () => null,
    reelPolicy: () => null,
  };
  fireLatch(passthrough);
  assert.equal(passthrough.events.latched.length, 0);
  assert.equal(passthrough.events.denied[0]?.reason, 'owner_attachment_limit');
  assert.equal(passthrough.events.denied[0]?.targetId, rock2.id);
  assert.equal(firstId.startsWith('att_'), true);
});

// ── §3 denial-reason events ────────────────────────────────────────────────────────────────────

test('T04 §3: denial reasons for cooldown, no-target, out-of-range, and create passthrough', () => {
  // cooldown
  {
    const rock = asteroid(30, { pos: { x: 100, z: 0 } });
    const h = buildHarness([rock], { aimWorld: { x: 100, z: 0 }, simTime: 10 });
    h.system._noRelatchUntil = 99;
    fireLatch(h);
    assert.deepEqual(h.events.denied[0], { reason: 'cooldown' });
    assert.equal(h.events.latched.length, 0);
  }

  // no-target (empty space)
  {
    const h = buildHarness([], { aimWorld: { x: 200, z: 0 } });
    fireLatch(h);
    assert.equal(h.events.denied[0]?.reason, 'no-target');
  }

  // Ownership is not a denial: stations are physical anchors.
  {
    const stn = station(31, { pos: { x: 140, z: 0 } });
    const h = buildHarness([stn], { aimWorld: { x: 140, z: 0 } });
    fireLatch(h);
    assert.equal(h.events.denied.length, 0);
    assert.equal(h.events.latched[0]?.targetId, stn.id);
  }

  // out-of-range via exclusive Focus lease beyond tether reach
  {
    const foe = hostileShip(32, { pos: { x: 500, z: 0 } });
    const h = buildHarness([foe], {
      aimWorld: { x: 500, z: 0 },
      targetId: foe.id,
      playerState: {
        flybyFocus: { active: true, targetId: foe.id, until: 99, latchScale: 2.4 },
      },
    });
    fireLatch(h);
    assert.equal(h.events.denied[0]?.reason, 'out-of-range');
    assert.equal(h.events.denied[0]?.targetId, foe.id);
    assert.equal(h.events.latched.length, 0);
  }

  // create passthrough: physics_port_unavailable
  {
    const rock = asteroid(33, { pos: { x: 110, z: 0 } });
    const h = buildHarness([rock], { aimWorld: { x: 110, z: 0 } });
    h.helpers.combatPhysics.createAttachment = null;
    // Rebuild attachments service without createAttachment.
    const attachments = createAttachmentService({
      state: h.state,
      catalog: h.catalog,
      helpers: { combatPhysics: {} },
      bus: h.bus,
    });
    h.kernel.attachments = attachments;
    // Re-init system kernel pointer via registry already returns kernel.
    h.system._active = null;
    fireLatch(h);
    assert.equal(h.events.denied[0]?.reason, 'physics_port_unavailable');
    assert.equal(h.events.denied[0]?.targetId, rock.id);
  }

  // Silent-path repair: missing attachment authority emits attachment_authority_unavailable.
  {
    const rock = asteroid(34, { pos: { x: 100, z: 0 } });
    const h = buildHarness([rock], { aimWorld: { x: 100, z: 0 } });
    h.system.registry = { get: () => null };
    fireLatch(h);
    assert.equal(h.events.latched.length, 0);
    assert.equal(h.events.denied[0]?.reason, 'attachment_authority_unavailable');
  }

  // Silent-path repair: missing tether def emits authority's unknown_attachment_def.
  {
    const rock = asteroid(35, { pos: { x: 100, z: 0 } });
    const h = buildHarness([rock], { aimWorld: { x: 100, z: 0 } });
    h.kernel.catalog.attachments.delete('tether_standard');
    fireLatch(h);
    assert.equal(h.events.latched.length, 0);
    assert.equal(h.events.denied[0]?.reason, 'unknown_attachment_def');
  }

  // Overlapping physical geometry remains a valid direct latch.
  {
    const rock = asteroid(36, { pos: { x: 0, z: 0 }, radius: 14 });
    const h = buildHarness([rock], { aimWorld: { x: 0, z: 0 } });
    fireLatch(h);
    assert.equal(h.events.denied.length, 0);
    assert.equal(h.events.latched[0]?.targetId, rock.id);
  }
});

// ── §4 save/load round-trip ────────────────────────────────────────────────────────────────────

test('T04 §4: active attachment survives serializeCombatState/restoreCombatState; cut works after adopt', () => {
  const rock = asteroid(40, {
    pos: { x: 130, z: 0 },
    flags: { persistent: true },
  });
  const h = buildHarness([rock], { aimWorld: { x: 130, z: 0 } });
  fireLatch(h);
  assert.equal(h.events.latched.length, 1);
  const attachmentId = h.system._active.attachmentId;
  const before = h.attachments.get(attachmentId);
  assert.equal(before.state, 'active');
  assert.equal(before.targetId, rock.id);

  const payload = serializeCombatState(h.state);
  assert.ok(payload.attachments.byId[attachmentId], 'attachment present in combat blob');

  // Simulate reload: clear runtime combat + gameplay mirror, restore blob, re-init system.
  const entities = h.state.entities;
  const entityList = h.state.entityList;
  const playerId = h.state.playerId;
  h.state.combat = null;
  ensureCombatState(h.state);
  const summary = restoreCombatState(h.state, payload, (ref) => {
    if (!ref) return null;
    if (ref.kind === 'player') return playerId;
    if (ref.kind === 'persistent') {
      const id = Number(ref.saveId);
      return entities.has(id) ? id : null;
    }
    return null;
  });
  assert.equal(summary.restoredAttachments, 1, 'one attachment restored');
  assert.equal(h.state.combat.attachments.byId[attachmentId].state, 'active');
  assert.equal(h.state.combat.attachments.byId[attachmentId].physicsHandle, null);

  // Fresh tetherGameplay instance adopts the restored line.
  const bus2 = createBus();
  const events2 = { released: [], cut: [], latched: [], denied: [] };
  bus2.on('tether:released', (p) => events2.released.push(p));
  bus2.on('tether:cut', (p) => events2.cut.push(p));
  bus2.on('tether:latched', (p) => events2.latched.push(p));
  bus2.on('tether:latchDenied', (p) => events2.denied.push(p));
  const helpers2 = { combatPhysics: stubCombatPhysics() };
  const attachments2 = createAttachmentService({
    state: h.state,
    catalog: h.catalog,
    helpers: helpers2,
    bus: bus2,
  });
  // Seed the restored records into the service-backed combat map (already on state.combat).
  const kernel2 = { attachments: attachments2, catalog: { attachments: h.catalog.attachments } };
  const system2 = Object.assign({}, tetherGameplay);
  system2.init({
    state: h.state,
    bus: bus2,
    helpers: helpers2,
    registry: { get: (n) => (n === 'actions' || n === 'combat' ? { kernel: kernel2 } : null) },
  });
  h.state.entities = entities;
  h.state.entityList = entityList;
  h.state.mode = 'flight';
  h.state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
  system2.update(DT, h.state);
  assert.ok(system2._active, 'adoptExisting recovers active tether after restore');
  assert.equal(system2._active.attachmentId, attachmentId);
  assert.equal(h.state.player.tether.active, true);
  assert.equal(h.state.player.tether.targetId, rock.id);

  system2._ignoreReleaseCutUntilReelIdle = false;
  system2._latchGraceUntil = 0;
  h.state.input.actions = { tetherFire: false, tetherCut: true, reelDelta: 0 };
  system2.update(DT, h.state);
  h.state.tick += 1;
  h.state.simTime += DT;
  h.state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
  system2.update(DT, h.state);
  assert.equal(events2.released.length, 1, 'cut-after-restore works');
  assert.equal(system2._active, null);
  assert.equal(attachments2.get(attachmentId).state, 'broken');
});

// ── §5 determinism ─────────────────────────────────────────────────────────────────────────────

test('T04 §5: two identical runs produce byte-equal observed event streams', () => {
  function runOnce() {
    const foe = hostileShip(50, { pos: { x: 190, z: 0 }, vel: { x: 0, z: 55 } });
    const rock = asteroid(51, { pos: { x: 200, z: 10 } });
    const stn = station(52, { pos: { x: 180, z: -5 } });
    const h = buildHarness([stn, rock, foe], { aimWorld: { x: 190, z: 0 }, simTime: 2, tick: 120 });
    fireLatch(h);
    assert.equal(h.events.latched.length, 1, 'run should latch once');

    // Break authority + mirror so adoptExisting cannot re-bind, then press under cooldown.
    const attId = h.system._active.attachmentId;
    h.attachments.cut(attId, h.p.id, 'tether_cut');
    h.system._active = null;
    h.state.player.tether.active = false;
    h.state.player.tether.targetId = null;
    h.system._noRelatchUntil = h.state.simTime + 10;
    h.events.released.length = 0;
    h.events.cut.length = 0;
    fireLatch(h);
    return {
      latched: h.events.latched,
      denied: h.events.denied,
      stream: JSON.stringify({ latched: h.events.latched, denied: h.events.denied }),
    };
  }
  const a = runOnce();
  const b = runOnce();
  assert.equal(a.stream, b.stream, 'byte-equal event streams');
  assert.equal(a.latched[0].targetId, 52);
  assert.equal(a.denied.length, 1);
  assert.equal(a.denied[0].reason, 'cooldown');
});

// Sanity: TETHER_DEF still matches catalog maxLength used by harness kernel.
test('T04 fixture: tether_standard maxLength matches TETHER_DEF', () => {
  const catalog = createCombatCatalog();
  assert.equal(catalog.attachments.get('tether_standard').maxLength, TETHER_DEF.maxLength);
});

test('PQ-003 normalized pay-out reaches attachment authority, respects max length, and reports the boundary', () => {
  const h = buildHarness([asteroid(701, { pos: { x: 120, z: 0 } })], { aimWorld: { x: 120, z: 0 } });
  fireLatch(h);
  const attachment = h.attachments.get(h.system._active.attachmentId);
  const before = attachment.restLength;

  h.state.input.actions = {
    tetherFire: false, tetherCut: false, reelDelta: 0,
    massline: { lineControl: true, lineLength: 1, payOut: 1, reelIn: 0, orbitDirection: 0, pump: false },
  };
  h.system.update(DT, h.state);
  assert.ok(attachment.restLength > before, 'positive normalized line rate pays out authoritative rest length');
  assert.equal(h.events.reel.length, 1);
  assert.ok(h.events.reel[0].after > h.events.reel[0].before);

  attachment.restLength = TETHER_DEF.maxLength;
  h.system.update(DT, h.state);
  assert.equal(attachment.restLength, TETHER_DEF.maxLength, 'pay-out cannot exceed authored max length');
  assert.equal(h.events.lineControlDenied.at(-1)?.reason, 'maximum_length');
});

test('PQ-003 ordinary high-load reel-in remains available without a fictitious load-limit denial', () => {
  const h = buildHarness([asteroid(702, { pos: { x: 120, z: 0 } })], { aimWorld: { x: 120, z: 0 } });
  fireLatch(h);
  const attachment = h.attachments.get(h.system._active.attachmentId);
  const breakPolicy = h.attachments.breakPolicy(attachment.id);
  attachment.lastTension = breakPolicy.maxTension * 0.95;
  const before = attachment.restLength;

  h.state.input.actions = {
    tetherFire: false, tetherCut: false, reelDelta: 0,
    massline: { lineControl: true, lineLength: -1, payOut: 0, reelIn: 1, orbitDirection: 0, pump: false },
  };
  h.system.update(DT, h.state);
  assert.ok(attachment.restLength < before,
    'ordinary load telemetry cannot block the normal Massline winch');
  assert.equal(h.events.lineControlDenied.length, 0);
  assert.equal(h.events.toasts.length, 0);
});

test('PQ-003 explicit extreme-load endpoint denies dangerous reel-in while pay-out remains available', () => {
  const extremeTarget = asteroid(704, {
    pos: { x: 120, z: 0 },
    data: { masslineBreakPolicy: 'extreme_overload' },
  });
  const h = buildHarness([extremeTarget], { aimWorld: { x: 120, z: 0 } });
  fireLatch(h);
  const attachment = h.attachments.get(h.system._active.attachmentId);
  const breakPolicy = h.attachments.breakPolicy(attachment.id);
  attachment.lastTension = breakPolicy.maxTension * 0.95;
  const before = attachment.restLength;

  h.state.input.actions = {
    tetherFire: false, tetherCut: false, reelDelta: 0,
    massline: { lineControl: true, lineLength: -1, payOut: 0, reelIn: 1, orbitDirection: 0, pump: false },
  };
  h.system.update(DT, h.state);
  assert.equal(attachment.restLength, before);
  assert.equal(h.events.lineControlDenied.at(-1)?.reason, 'load_limit');
  assert.equal(h.events.toasts.at(-1)?.text, 'Massline reel-in blocked: line load too high');
  h.system.update(DT, h.state);
  assert.equal(h.events.toasts.length, 1, 'a held blocked command produces one feedback pulse');

  h.state.input.actions.massline.lineLength = 1;
  h.state.input.actions.massline.reelIn = 0;
  h.state.input.actions.massline.payOut = 1;
  h.system.update(DT, h.state);
  assert.ok(attachment.restLength > before, 'pay-out can unload a highly strained line');
});

test('PQ-003 normalized quick cut executes in the same tether tick', () => {
  const h = buildHarness([asteroid(703, { pos: { x: 120, z: 0 } })], { aimWorld: { x: 120, z: 0 } });
  fireLatch(h);
  h.state.input.actions = {
    tetherFire: false, tetherCut: false, reelDelta: 0,
    massline: { cut: true, lineControl: false, lineLength: 0, payOut: 0, reelIn: 0, orbitDirection: 0, pump: false },
  };

  h.system.update(DT, h.state);
  assert.equal(h.events.released.length, 1);
  assert.equal(h.state.player.tether.active, false);
});
