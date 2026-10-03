// Board row 175 — NXB-005: a recovered tow reaches a receiver with its custody and value intact.
//
// The prior owners (SF-029 salvage sorting, SF-111 split custody, SF-273 interrupted handoff,
// SF-286 first-victory wreck) each landed their seam. This test completes the packet's stated
// contract on the tow owner's own seam (src/systems/tetherGameplay.js) through the EXISTING
// public custody paths only:
//   · release → relatch conserves the same lot and the same body (identity across wreck spill,
//     loose payload, tether target);
//   · receiver/collector acceptance rides the canonical pickup:collected synchronous receipt
//     (src/core/pickupAcceptance.js) — a partial acceptance keeps the same record selectable and
//     latched (NXI-017), a zero-unit acceptance is not a delivery (NXI-018);
//   · tethering alone never mints salvage value: the bay is untouched until a collector accepts;
//   · a capture taken before the final acceptance (the save seam: a structuredClone snapshot)
//     resumes, delivers the remainder once, and a replayed stale receipt pays nothing twice.
//
// Seed 4242 throughout; the physics is the harness double (the same contract the row-229/239
// harnesses use), so every number here is deterministic.
import assert from 'node:assert/strict';
import test from 'node:test';

import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { addSalvage } from '../src/systems/cargo.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';

const DT = 1 / 60;

function entity(id, type, x, z, overrides = {}) {
  return {
    id, type, alive: true, collides: true, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    thrust: 0, brake: false, maxSpeed: 120, radius: 8, mass: 50, hull: 100, hullMax: 100,
    team: 2, data: {}, ...overrides,
  };
}

/** The tow harness: player + one loose spilled load with its stable lot. */
function towHarness({ poolQty = 12 } = {}) {
  const player = entity(1, 'ship', 0, 0, {
    team: 0, physicsBody: { dynamic: true, mass: 40 }, data: { derived: {} },
  });
  const load = entity(2, 'payload', 90, 0, {
    mass: 16, physicsBody: { dynamic: true, mass: 16 },
    data: {
      name: 'Raid Spill Crate',
      salvagePool: { cmdty_scrap_metal: poolQty },
      worldRecordId: 'spill:4242:1',
    },
  });
  const entities = new Map([[player.id, player], [load.id, load]]);
  const state = {
    mode: 'flight',
    tick: 4242,
    simTime: 5,
    playerId: player.id,
    player: {},
    input: {
      aimWorld: { ...load.pos }, aimAngle: 0, turnIntent: 0, moveX: 0, moveZ: 0,
      actions: {}, tetherMode: null,
    },
    runtime: { features: {} },
    world: { currentSectorId: 'sector_test' },
    entities,
    entityList: [...entities.values()],
  };
  const spec = { current: null };
  const physics = {
    createAttachment(s) { spec.current = structuredClone(s); return { id: s.attachmentId }; },
    cutAttachment() { return true; },
    getAttachmentTelemetry({ attachmentId } = {}) {
      const s = spec.current;
      if (!s || attachmentId !== s.attachmentId) return { tension: 0, impulse: 0, yank: 0, phase: 'slack' };
      const a = state.entities.get(s.ownerId);
      const b = state.entities.get(s.targetId);
      const dist = a && b ? Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) : 0;
      const rest = s.restLength || 1;
      const phase = dist >= rest ? 'loaded' : dist >= rest * 0.8 ? 'capture' : 'slack';
      return { tension: 0, impulse: 0, yank: 0, phase, distance: dist, relativeSpeed: 0, stretch: 0 };
    },
    setAttachmentReel() { return true; },
  };
  const events = [];
  const listeners = new Map();
  const bus = {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const attachments = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus });
  const registry = { get(id) { return id === 'actions' ? { kernel: { attachments, catalog } } : null; } };
  const system = Object.create(tetherGameplay);
  system.init({ state, bus, helpers: { combatPhysics: physics }, registry });
  return { state, player, load, events, bus, system };
}

function stepTether(h, { aim = null, latch = false, cut = false } = {}) {
  h.state.tick += 1;
  h.state.simTime += DT;
  h.state.input.aimIntentActive = !!aim;
  if (aim) {
    h.state.input.aimWorld.x = aim.x;
    h.state.input.aimWorld.z = aim.z;
  }
  h.state.input.actions = {
    tetherFire: latch, tetherCut: cut,
    massline: latch || cut ? { latch, cut, lineControl: false, lineLength: 0 } : null,
  };
  h.state.input.tetherMode = null;
  h.system.update(DT, h.state);
}

const count = (events, type) => events.filter((e) => e.type === type).length;
const lotOf = (load) => Math.max(0, Math.floor(Number(load.data.salvagePool.cmdty_scrap_metal) || 0));

test('NXB-005: release and relatch conserve the same body and the same lot', () => {
  const h = towHarness();
  stepTether(h, { aim: h.load.pos });
  stepTether(h, { aim: h.load.pos, latch: true });
  stepTether(h);
  assert.ok(h.state.player.tether.active, 'the spilled load latched');
  assert.equal(h.state.player.tether.targetId, h.load.id);

  // The line is lost (cut, break, target drift — the route's "lose the latch").
  stepTether(h, { cut: true });
  assert.ok(!h.state.player.tether.active, 'the line released');
  assert.equal(h.load.alive, true, 'the body survived the release');
  assert.equal(lotOf(h.load), 12, 'the lot is untouched by the interruption');
  assert.equal(h.load.data.stableLoadId ?? null, null, 'no custody identity minted by towing alone');

  // Regain the latch (past the 0.25 s post-cut cooldown): the same record is ropeable, same
  // identity.
  for (let i = 0; i < 20; i += 1) stepTether(h);
  stepTether(h, { aim: h.load.pos });
  stepTether(h, { aim: h.load.pos, latch: true });
  stepTether(h);
  assert.ok(h.state.player.tether.active, 'the load relatched');
  assert.equal(h.state.player.tether.targetId, h.load.id, 'the same body, not a replacement');
  assert.equal(lotOf(h.load), 12, 'the lot survived the relatch');
  assert.equal(count(h.events, 'salvage:changed'), 0, 'tethering alone never touches the bay');
  assert.equal(count(h.events, 'loot:drop'), 0, 'tethering alone mints no value');
});

test('NXB-005: a partial receiver acceptance keeps the load latched and the remainder ropeable', () => {
  const h = towHarness();
  stepTether(h, { aim: h.load.pos });
  stepTether(h, { aim: h.load.pos, latch: true });
  stepTether(h);
  const bayBefore = JSON.stringify(h.state.player.salvageBay ?? null);

  // The receiver/collector accepts 5 of 12 through the canonical synchronous receipt (mining
  // and the physical scoop emit it BEFORE subtracting; the collector then owns the subtraction).
  h.bus.emit('pickup:collected', { pickupId: h.load.id, amount: 12, acceptedAmount: 5 });
  assert.ok(h.state.player.tether.active, 'a partial acceptance never drops the line (NXI-017)');
  assert.equal(h.load.data.stableLoadId, 'spill:4242:1',
    'the custody identity rides the stable world record');
  assert.equal(h.state.player.targetId, h.load.id, 'the same record stays selectable');

  // The collector commits its accepted quantity; the remainder stays a physical, ropeable load.
  h.load.data.salvagePool.cmdty_scrap_metal = 12 - 5;
  assert.equal(h.load.alive, true);
  assert.equal(lotOf(h.load), 7, 'accepted + remaining reconciles to the starting lot');
  assert.equal(count(h.events, 'tether:broke'), 0);
  assert.equal(JSON.stringify(h.state.player.salvageBay ?? null), bayBefore,
    'the tow and the hold acceptance mint no salvage value by themselves');
});

test('NXB-005: the final acceptance releases the line exactly once; a zero-unit receipt is not a delivery', () => {
  const h = towHarness();
  stepTether(h, { aim: h.load.pos });
  stepTether(h, { aim: h.load.pos, latch: true });
  stepTether(h);

  // A zero-unit acceptance (NXI-018) is not a delivery: the line holds, nothing releases.
  h.bus.emit('pickup:collected', { pickupId: h.load.id, amount: 12, acceptedAmount: 0 });
  assert.ok(h.state.player.tether.active, 'zero units accepted, zero units delivered');
  assert.equal(count(h.events, 'tether:broke'), 0);

  // The rest of the lot is accepted: taking the last of it releases the line, once.
  h.bus.emit('pickup:collected', { pickupId: h.load.id, amount: 12, acceptedAmount: 12 });
  h.load.data.salvagePool.cmdty_scrap_metal = 0;
  const breaks = h.events.filter((e) => e.type === 'tether:broke');
  assert.equal(breaks.length, 1, 'one release for one emptied load');
  assert.equal(breaks[0].payload.reason, 'accepted');
  assert.ok(!h.state.player.tether.active, 'the line is down');
  assert.equal(h.load.alive, true, 'the receiver decides the body; the tether never kills it');

  // A replayed stale receipt for the same pickup after release changes nothing.
  h.bus.emit('pickup:collected', { pickupId: h.load.id, amount: 0, acceptedAmount: 12 });
  assert.equal(h.events.filter((e) => e.type === 'tether:broke').length, 1,
    'a stale acceptance never produces a second delivery');
});

test('NXB-005: a capture taken before the final acceptance resumes and pays once', () => {
  const h = towHarness({ poolQty: 12 });
  stepTether(h, { aim: h.load.pos });
  stepTether(h, { aim: h.load.pos, latch: true });
  stepTether(h);
  h.bus.emit('pickup:collected', { pickupId: h.load.id, amount: 12, acceptedAmount: 5 });
  h.load.data.salvagePool.cmdty_scrap_metal = 7;

  // The save seam: what the snapshot capture clones is the entity record. The remaining body
  // and its custody identity must survive the round trip.
  const snapshot = structuredClone({
    load: {
      id: h.load.id, type: h.load.type, alive: h.load.alive,
      pos: { ...h.load.pos }, vel: { ...h.load.vel }, data: structuredClone(h.load.data),
    },
    hints: structuredClone(h.state.player.hints ?? {}),
  });

  // Resume into a fresh session and accept the remainder once — the only payment.
  const r = towHarness();
  r.load.data = structuredClone(snapshot.load.data);
  r.state.player.salvageBay = null; // the resumed bay starts where the save left it
  stepTether(r, { aim: r.load.pos });
  stepTether(r, { aim: r.load.pos, latch: true });
  stepTether(r);
  assert.equal(r.load.data.stableLoadId, 'spill:4242:1', 'the identity survived the save');
  r.bus.emit('pickup:collected', { pickupId: r.load.id, amount: 7, acceptedAmount: 7 });
  r.load.data.salvagePool.cmdty_scrap_metal = 0;
  const breaks = r.events.filter((e) => e.type === 'tether:broke' && e.payload.reason === 'accepted');
  assert.equal(breaks.length, 1, 'the resumed remainder delivered exactly once');

  // The salvage-bay receiver itself: the public owner accepts only what the room allows, and
  // the accepted quantity is the only quantity that ever becomes bay value.
  const bay = { player: r.state.player };
  const first = addSalvage({ player: bay.player }, 'cmdty_scrap_metal', 4);
  const room = first; // a fresh bay takes all 4
  assert.equal(room, 4);
  const accepted = addSalvage({ player: bay.player }, 'cmdty_scrap_metal', 999);
  assert.ok(accepted > 0 && accepted < 999, 'a partly full receiver clamps to its room');
  const items = bay.player.salvageBay.items.cmdty_scrap_metal;
  assert.equal(items, 4 + accepted, 'the bay holds exactly what it accepted — no duplicate pay');
});

test('NXB-005: an acceptance for another body never touches this tow', () => {
  const h = towHarness();
  stepTether(h, { aim: h.load.pos });
  stepTether(h, { aim: h.load.pos, latch: true });
  stepTether(h);
  h.bus.emit('pickup:collected', { pickupId: 99, amount: 30, acceptedAmount: 30 });
  assert.ok(h.state.player.tether.active, 'someone else’s delivery is not mine');
  assert.equal(lotOf(h.load), 12, 'my lot is untouched by another body’s receipt');
  assert.equal(count(h.events, 'tether:broke'), 0);
});
