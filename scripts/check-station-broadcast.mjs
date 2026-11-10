// BP-11 packet A5 acceptance check: Station Broadcast Behavior.
//
// Contract (src/systems/stationBroadcast.js — see design/revamp/detail/A_sector_station.md A5):
//   - Near a typed station, an evaluation tick speaks ONE type-appropriate line on the 'ambient'
//     channel in the station faction's voice, plus the additive `station:broadcastTic` VFX seam.
//   - Rate-capped: ≤1 line per CADENCE_S (~20 s of state.simTime).
//   - Yields to EVERYTHING: (a) emitter-side — skips while the arbiter has any active/queued
//     voice; (b) arbiter-side — AMBIENT_PRIORITY is strictly below every CHANNEL_PRIORITY, so an
//     ambient line can never preempt a floor holder and any other channel preempts it.
//   - Combat-silenced: player-involved `combat:damage` opens a COMBAT_SILENCE_S quiet window.
//   - No visible station → strict no-op. state.mode !== 'flight' → strict no-op.
//   - Headless (no window): init installs NO timer — the system is silent in every sim harness.
import assert from 'node:assert/strict';

import {
  stationBroadcast, STATION_BROADCASTS, nearestVisibleStation,
  AMBIENT_PRIORITY, CADENCE_S, COMBAT_SILENCE_S, NEAR_RANGE,
} from '../src/systems/stationBroadcast.js';
import { VoiceQueue, CHANNEL_PRIORITY } from '../src/ui/voiceArbiter.js';
import { STATION_TYPES } from '../src/data/sectors.js';

assertBroadcastTableTotal();
assertAmbientStrictlyLowestPriority();
assertSpeaksOncePerCadenceNearStation();
assertYieldsWhileVoiceFloorBusy();
assertArbiterNeverLetsAmbientPreempt();
assertCombatSilence();
assertNoStationStrictNoop();
assertNonFlightModeStrictNoop();
assertHeadlessInstallsNoTimer();

console.log('Station broadcast checks OK');

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  return {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) { for (const fn of (handlers.get(evt) || []).slice()) fn(payload); },
  };
}

function makeCtx({ stationTypeId = 'refinery', stationDist = 100 } = {}) {
  const bus = makeBus();
  const sayCalls = [];
  const tics = [];
  bus.on('station:broadcastTic', (p) => tics.push(p));
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const station = {
    id: 2, type: 'station', alive: true, pos: { x: stationDist, z: 0 },
    data: { stationId: 'station_test', stationTypeId, factionId: 'faction_dmc', dockRadius: 72 },
  };
  const state = {
    mode: 'flight', simTime: 100, playerId: 1,
    entities: new Map([[1, player], [2, station]]),
    entityList: [player, station],
  };
  const arbQueue = { active: null, pending: [] };
  const ctx = {
    bus, state,
    helpers: { voice: { say(msg) { sayCalls.push(msg); return true; } } },
    registry: { get(name) { return name === 'voiceArbiter' ? { queue: arbQueue } : null; } },
  };
  return { ctx, bus, state, sayCalls, tics, station, arbQueue };
}

// ── data + priority contracts ──────────────────────────────────────────────────────────────────

function assertBroadcastTableTotal() {
  for (const id of STATION_TYPES) {
    const def = STATION_BROADCASTS[id];
    assert.ok(def && Array.isArray(def.lines) && def.lines.length > 0, `${id}: needs broadcast lines`);
    assert.ok(typeof def.tic === 'string' && def.tic, `${id}: needs a cosmetic tic id`);
  }
}

function assertAmbientStrictlyLowestPriority() {
  for (const [channel, p] of Object.entries(CHANNEL_PRIORITY)) {
    assert.ok(AMBIENT_PRIORITY < p, `AMBIENT_PRIORITY (${AMBIENT_PRIORITY}) must be < '${channel}' (${p})`);
  }
}

// ── cadence ────────────────────────────────────────────────────────────────────────────────────

function assertSpeaksOncePerCadenceNearStation() {
  const { ctx, state, sayCalls, tics } = makeCtx({ stationTypeId: 'refinery' });
  stationBroadcast.init(ctx);
  assert.equal(stationBroadcast._timer, null, 'headless init must not install a wall-clock timer');

  stationBroadcast._tick();
  assert.equal(sayCalls.length, 1, `near a refinery, one ambient line; got ${sayCalls.length}`);
  const call = sayCalls[0];
  assert.equal(call.channel, 'ambient', 'line routes on the ambient channel');
  assert.equal(call.priority, AMBIENT_PRIORITY, 'line carries the explicit lowest priority');
  assert.equal(call.factionId, 'faction_dmc', 'line speaks in the station faction voice');
  assert.ok(STATION_BROADCASTS.refinery.lines.includes(call.text), 'line is type-appropriate (refinery)');
  assert.equal(tics.length, 1, 'cosmetic tic seam emitted with the line');
  assert.equal(tics[0].tic, STATION_BROADCASTS.refinery.tic, 'tic is the refinery vent tic');
  assert.equal(tics[0].stationTypeId, 'refinery');

  // Immediate re-ticks inside the cadence window stay silent (≤1 / ~20 s).
  stationBroadcast._tick();
  state.simTime += CADENCE_S - 1;
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 1, `re-ticks inside ${CADENCE_S}s must not speak; got ${sayCalls.length}`);

  state.simTime += 2; // past the cadence window
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 2, 'after the cadence window a new line may speak');
  stationBroadcast.destroy();
}

// ── one-voice: emitter-side yield ──────────────────────────────────────────────────────────────

function assertYieldsWhileVoiceFloorBusy() {
  const { ctx, state, sayCalls, arbQueue } = makeCtx();
  stationBroadcast.init(ctx);

  // Mock mission comms holding the floor → ambient must not even queue.
  arbQueue.active = { channel: 'story', priority: CHANNEL_PRIORITY.story, text: 'mission line' };
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 0, 'active higher-priority voice suppresses ambient entirely');

  // A queued (pending) line also suppresses — ambient yields to everything.
  arbQueue.active = null;
  arbQueue.pending = [{ channel: 'info', priority: CHANNEL_PRIORITY.info, text: 'queued info' }];
  state.simTime += CADENCE_S + 1;
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 0, 'queued voice suppresses ambient entirely');

  arbQueue.pending = [];
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 1, 'a free floor lets the ambient line through');
  stationBroadcast.destroy();
}

// ── one-voice: arbiter-side (the REAL VoiceQueue) ──────────────────────────────────────────────

function assertArbiterNeverLetsAmbientPreempt() {
  const q = new VoiceQueue();
  // Mission comms takes the floor.
  q.enqueue({ channel: 'story', text: 'mission comm' }, 0);
  const floor = q.step(0);
  assert.ok(floor && floor.channel === 'story', 'story takes the floor');

  // An ambient broadcast (as stationBroadcast sends it) arrives — it must NOT preempt.
  q.enqueue({ channel: 'ambient', text: 'refinery vent', priority: AMBIENT_PRIORITY, ttl: 60 }, 10);
  assert.equal(q.step(10), null, 'ambient never preempts an active floor holder');

  // Floor expires → ambient may surface…
  const surfaced = q.step(4100); // story default ttl 4000ms
  assert.ok(surfaced && surfaced.channel === 'ambient', 'ambient surfaces only on a free floor');

  // …and ANY normal channel preempts a talking ambient line (first to yield).
  q.enqueue({ channel: 'info', text: 'ambient info beats broadcast' }, 4200);
  const preempted = q.step(4200);
  assert.ok(preempted && preempted.channel === 'info',
    `info (10) must preempt ambient (${AMBIENT_PRIORITY}); got ${preempted && preempted.channel}`);
}

// ── combat silence ─────────────────────────────────────────────────────────────────────────────

function assertCombatSilence() {
  const { ctx, bus, state, sayCalls } = makeCtx();
  stationBroadcast.init(ctx);

  bus.emit('combat:damage', { targetId: 1, attackerId: 9 }); // player takes a hit
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 0, 'no broadcast during combat');

  state.simTime += COMBAT_SILENCE_S - 1;
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 0, 'post-combat silence window holds');

  state.simTime += 2;
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 1, 'speaks again once the silence window has passed');

  // Player-as-attacker also counts as combat (fresh hit AFTER the rate-cap window has passed, so
  // only the combat gate can be the suppressor).
  state.simTime += CADENCE_S + 1;
  bus.emit('combat:damage', { targetId: 9, attackerId: 1 });
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 1, 'firing on something also silences the broadcast');
  stationBroadcast.destroy();
}

// ── strict no-ops ──────────────────────────────────────────────────────────────────────────────

function assertNoStationStrictNoop() {
  const { ctx, sayCalls, tics, station, state } = makeCtx({ stationDist: NEAR_RANGE + 500 });
  assert.equal(nearestVisibleStation(state), null, 'fixture: station is out of visible range');
  stationBroadcast.init(ctx);
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 0, 'no visible station → no voice');
  assert.equal(tics.length, 0, 'no visible station → no tic event');
  station.pos.x = 100; // in range but wrong entity type must also no-op
  station.type = 'gate';
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 0, 'non-station entities never broadcast');
  stationBroadcast.destroy();
}

function assertNonFlightModeStrictNoop() {
  const { ctx, state, sayCalls } = makeCtx();
  state.mode = 'docked';
  stationBroadcast.init(ctx);
  stationBroadcast._tick();
  assert.equal(sayCalls.length, 0, 'outside flight mode the broadcaster is a strict no-op');
  stationBroadcast.destroy();
}

// ── headless guard ─────────────────────────────────────────────────────────────────────────────

function assertHeadlessInstallsNoTimer() {
  assert.equal(typeof window, 'undefined', 'this check must run headless');
  const { ctx } = makeCtx();
  stationBroadcast.init(ctx);
  assert.equal(stationBroadcast._timer, null, 'no window → no timer → silent in every sim harness');
  stationBroadcast.destroy();
}
