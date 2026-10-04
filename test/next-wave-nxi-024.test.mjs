// NXI-024 — a recovered miss remains eligible for the next cycle, proven on the REAL owner
// (src/systems/masslineThrow.js), not on a downstream receiver.
//
// THE CASE. The player throws a latched load at a target and MISSES (the release read honestly
// reports off-solution; the cut still happens — a manual throw is a legal cut, never a swallowed
// input). The player then recovers the same load: the line drops, the body keeps its lot, its
// provenance and its material damage, and a fresh latch re-arms the throw. The second entry —
// aimed at a target the payload's actual exit vector genuinely reaches — succeeds exactly once.
//
// THE CLAIM UNDER TEST. A miss writes no gate or lockout: no latch-scoped state that survives the
// recovery may veto the next valid release, and the retry must not reset damage or provenance
// (the packet's explicit do-not). masslineThrow writes ONLY its own state.massline2.throw
// subtree, so the payload record must come back byte-identical.
//
// Harness shape follows test/massline-throw-destination.test.mjs (the nearest focused
// masslineThrow test): the real createGameState, the real masslineThrow system on the real bus
// contract, with a recorded attachment-service double at the one seam the throw cuts through.
// Seed 4242 throughout; the release geometry is closed-form, so every number is deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';

applyFeatureConfigToMaps(PRODUCTION_FEATURES); // massline2.throw is ON in production

const SEED = 4242;
const PLAYER_ID = 8;
const PAYLOAD_ID = 2;
const RECEIVER_ID = 3;
const DT = 1 / 60;

function harness() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.tick = 4242;
  state.simTime = 4242 / 60;
  state.playerId = PLAYER_ID;
  state.entities.clear();
  state.entityList = state.entityList || [];
  state.entityList.length = 0;

  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, maxSpeed: 120, radius: 8, mass: 200,
    flags: {}, cap: 100,
    data: { weapons: [], combat: {}, derived: { cap: 100 } },
  };
  // The towed load: provenance (worldRecordId), the lot (salvagePool) and material damage
  // (volatileExposure) ride its record. The retry must leave every field untouched.
  const payload = {
    id: PAYLOAD_ID, type: 'payload', alive: true, team: 2,
    pos: { x: 90, z: 0 }, vel: { x: 60, z: 0 }, rot: 0, angVel: 0, maxSpeed: 120, radius: 6, mass: 16,
    hull: 100, hullMax: 100,
    data: {
      name: 'Raid Spill Crate',
      worldRecordId: 'spill:4242:1',
      salvagePool: { cmdty_scrap_metal: 12 },
      volatileExposure: {
        schemaVersion: 1, load: 0.2, vents: 0, ventedUnits: 0, shocks: 1, stage: 'warming',
      },
    },
  };
  // A stationary receiver sitting exactly on the payload's exit ray: the valid second entry.
  const receiver = {
    id: RECEIVER_ID, type: 'station', alive: true, team: 0,
    pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 10, mass: 1e9,
    data: { name: 'Ceres Receiver' },
  };
  for (const e of [player, payload, receiver]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  state.player.tether = { active: false, targetId: null, phase: 'slack', restLength: 0 };
  state.player.targetId = RECEIVER_ID; // the deliberate destination (selection-seeded aim)
  state.input.aimWorld = { x: 0, z: 0 };
  state.input.actions = state.input.actions || {};

  // The one seam masslineThrow cuts through, recorded per call.
  const cuts = [];
  const attachments = {
    cut(attachmentId, actorId, reason) {
      cuts.push({ attachmentId, actorId, reason });
      return { ok: true, attachmentId, reason };
    },
  };

  const events = [];
  const listeners = new Map();
  const bus = {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload_) {
      events.push({ type, payload: payload_ });
      for (const fn of listeners.get(type) || []) fn(payload_);
    },
  };
  const registry = { get(id) { return id === 'actions' ? { kernel: { attachments } } : null; } };

  const system = Object.create(masslineThrow);
  system.init({ state, bus, helpers: {}, registry });

  const h = {
    state, player, payload, receiver, cuts, events, system,
    latch(attachmentId) {
      state.player.tether = {
        active: true, targetId: PAYLOAD_ID, attachmentId,
        phase: 'loaded', restLength: 100, strain: 0.2,
      };
    },
    drop() {
      state.player.tether = { active: false, targetId: null, phase: 'slack', restLength: 0 };
    },
    step({ armed = false, aim = null } = {}) {
      state.tick += 1;
      state.simTime += DT;
      state.input.actions.throwArm = armed;
      state.input.aimIntentActive = aim != null;
      if (aim) state.input.aimWorld = { x: aim.x, z: aim.z };
      system.update(DT, state);
    },
  };
  return h;
}

const throwsOf = (h) => h.events.filter((e) => e.type === 'massline:throw').map((e) => e.payload);

test('NXI-024: a missed release writes no gate — the recovered load is a valid second entry that succeeds once', () => {
  const h = harness();
  h.latch('att_000001');
  h.step({ armed: false }); // latch settles; release read seeded from the selection

  // ENTRY 1 — the miss. Aim at a point well off the payload's exit ray.
  h.step({ armed: true, aim: { x: 90, z: 220 } });
  const first = throwsOf(h);
  assert.equal(first.length, 1, 'the missed press is still one legal cut, not a swallowed input');
  assert.equal(first[0].mode, 'snap-manual', 'an off-solution release goes out as an honest manual throw');
  assert.equal(first[0].aimSynthetic, true, 'the miss aimed at a bare point');
  assert.ok(Math.abs(first[0].errorRad) > 0.5, 'the receipt reports the real divergence');
  assert.equal(first[0].prediction.onSolution, false, 'the first entry never reads as a hit');
  assert.equal(h.cuts.length, 1);
  assert.equal(h.cuts[0].attachmentId, 'att_000001');

  // RECOVERY — the line drops, the player regains the latch on the same body.
  h.step({ armed: false }); // release the arm: a held input across the boundary is not a press
  h.drop();
  h.step({ armed: false }); // an inactive tick; cadence state resets with the line
  h.latch('att_000002'); // fresh attachment, same physical load
  h.step({ armed: false }); // the new latch re-seeds the release read
  assert.equal(h.state.massline2.throw.lastThrow.releaseId, first[0].releaseId,
    'the first attempt survives only as a receipt — it gates nothing');

  // ENTRY 2 — the valid second entry at the receiver on the exit ray. Same press, same rules.
  h.step({ armed: true, aim: { x: 400, z: 0 } });
  const all = throwsOf(h);
  assert.equal(all.length, 2, 'the recovered miss is eligible: the second entry releases');
  assert.equal(all[1].mode, 'snap', 'the second entry resolves on the solution itself');
  assert.equal(all[1].aimTargetId, RECEIVER_ID, 'aimed at the real receiver');
  assert.equal(all[1].prediction.onSolution, true, 'the second entry reads as a genuine hit');
  assert.notEqual(all[1].releaseId, all[0].releaseId, 'a distinct attempt, not a replay');
  assert.equal(h.cuts.length, 2, 'one cut per entry, through the same service seam');
  assert.equal(h.cuts[1].attachmentId, 'att_000002', 'the recovered latch owns the second cut');
  assert.equal(h.events.filter((e) => e.type === 'massline:releaseCancelled').length, 0,
    'no stale attempt marker cancels or redirects the retried release');

  // EXACTLY ONCE — with the line down after the second cut, a further press mints nothing.
  h.step({ armed: false, aim: { x: 400, z: 0 } });
  h.drop();
  h.step({ armed: true, aim: { x: 400, z: 0 } });
  assert.equal(throwsOf(h).length, 2, 'no third release: the line state, not a marker, ends the sequence');
});

test('NXI-024: the retry resets neither material damage nor provenance', () => {
  const h = harness();
  const provenanceBefore = JSON.stringify({
    data: h.payload.data, hull: h.payload.hull, alive: h.payload.alive,
  });

  h.latch('att_000001');
  h.step({ armed: false });
  h.step({ armed: true, aim: { x: 90, z: 220 } }); // the miss
  h.step({ armed: false });
  h.drop();
  h.step({ armed: false });
  h.latch('att_000002');
  h.step({ armed: false });
  h.step({ armed: true, aim: { x: 400, z: 0 } }); // the valid second entry
  assert.equal(throwsOf(h).length, 2, 'both entries ran');

  const provenanceAfter = JSON.stringify({
    data: h.payload.data, hull: h.payload.hull, alive: h.payload.alive,
  });
  assert.equal(provenanceAfter, provenanceBefore,
    'worldRecordId, lot, volatileExposure record and hull are byte-identical across the retry');
  assert.equal(h.payload.alive, true, 'the load survived both releases');
});
