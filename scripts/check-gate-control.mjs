// BP-11 packet A8 acceptance check: Gate Traffic-Control (seeded director).
//
// Contract (src/data/gateControl.js + src/systems/gateControlDirector.js):
//   - PURE planner: same (seed, sectorId, gateTo, dayIndex, {factionId,security,wanted}) → same
//     scene; per-faction/security scene selection; toll banded to <= 0.6 (no stack with world's fee).
//   - Director fires on jump:chargeStart (via:'gate' only). Toll routes ONLY through
//     economy:chargeCredits {reason:'gate:toll'} — never a direct credit write. A ≤2 scan wing is a
//     balanced spawnBudget client (released on jump / abort / timeout / per entity:destroyed). A
//     wanted player gets the hostile path via scanner.isHostileToPlayer (not factionId). Every scene
//     resolves (timed fallback) so a jump never deadlocks. Exactly one 'comms' line per scene.
import assert from 'node:assert/strict';

import { gateControlDirector as DIR, ensureState } from '../src/systems/gateControlDirector.js';
import { planGateScene, MTS_TOLL_MAX_SEC, WING_MAX } from '../src/data/gateControl.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

testPlannerDeterminism();
testSceneMatrix();
testEndToEndTollViaEconomyEmit();
testViaGuard();
testWingBudgetBalance();
testAbortReleasesAndDespawns();
testTimeoutFallback();
testMidSceneKill();
testHostilePathViaScanner();
testRepeatCooldown();
testAmbushNoStack();

console.log('Gate control checks OK');

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, payload) { emitLog.push({ evt, payload }); for (const fn of (handlers.get(evt) || []).slice()) fn(payload); },
  };
}

function makeCtx({ factionId = 'faction_scn', security = 0.85, heat = 0, seed = 42, gatePos = { x: 800, z: 0 } } = {}) {
  const bus = makeBus();
  const voiceCalls = [];
  const player = { id: 1, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 } };
  const state = {
    mode: 'flight', simTime: 500, playerId: 1, meta: { seed },
    world: {
      currentSectorId: 'sec_a',
      activeSector: { id: 'sec_a', factionId, security, gates: [{ id: 9, to: 'sec_b', pos: gatePos }] },
      sectors: { sec_a: { id: 'sec_a', factionId, security } },
    },
    entities: new Map([[1, player]]),
    entityList: [player],
    player: { credits: 5000, heat },
  };
  const real = makeBudgetApi(state);
  const spy = { requests: [], releases: [] };
  const spawns = [];
  let spawnN = 0;
  const ctl = { spawnReturnsNull: false };
  const helpers = {
    voice: { say(m) { voiceCalls.push(m); return true; } },
    spawnBudget: {
      request(n, id) { spy.requests.push([n, id]); return real.request(n, id); },
      releaseSome(id, n) { spy.releases.push([id, n]); return real.releaseSome(id, n); },
      release(id) { spy.releases.push([id, 'all']); return real.release(id); },
      current: () => real.current(), available: () => real.available(), max: () => real.max(), reset: () => real.reset(),
    },
    spawnEntity(spec) {
      spawns.push(spec);
      if (ctl.spawnReturnsNull) return null;
      const id = 'w' + (++spawnN);
      const ent = { id, type: 'ship', alive: true, team: spec.team, pos: spec.pos, data: spec.data || {} };
      state.entities.set(id, ent);
      state.entityList.push(ent);
      return ent;
    },
  };
  return { ctx: { bus, state, helpers }, bus, state, player, voiceCalls, spy, spawns, ctl, real };
}

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in sim path'); };
  Date.now = () => { throw new Error('Date.now in sim path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

function freshDir() { return { ...DIR }; }

function tollEmits(bus) { return bus.emitLog.filter((e) => e.evt === 'economy:chargeCredits'); }

// ── 1. planner determinism ──────────────────────────────────────────────────────────────────────
function testPlannerDeterminism() {
  guarded(() => {
    const a = planGateScene(99, 'sec', 'to', 5, { factionId: 'faction_mts', security: 0.5, wanted: false });
    const b = planGateScene(99, 'sec', 'to', 5, { factionId: 'faction_mts', security: 0.5, wanted: false });
    assert.deepStrictEqual(a, b, 'same gate-day → identical scene');
    assert.deepStrictEqual(planGateScene(1, null, 'to', 0, {}), { type: 'silent', comms: null, tollAmount: 0, scanWing: 0 });
  });
}

// ── 2. scene matrix ─────────────────────────────────────────────────────────────────────────────
function testSceneMatrix() {
  guarded(() => {
    const mts = planGateScene(3, 'sec', 'to', 1, { factionId: 'faction_mts', security: 0.5, wanted: false });
    assert.equal(mts.type, 'mts_toll');
    assert.ok(Number.isInteger(mts.tollAmount) && mts.tollAmount >= 40 && mts.tollAmount <= 85, `toll in [40,85], got ${mts.tollAmount}`);
    assert.ok(mts.comms && mts.scanWing === 0, 'toll scene has comms + no wing');

    const scn = planGateScene(3, 'sec', 'to', 1, { factionId: 'faction_scn', security: 0.85, wanted: false });
    assert.equal(scn.type, 'scn_scan');
    assert.ok(scn.scanWing >= 1 && scn.scanWing <= WING_MAX, `scan wing in {1,2}, got ${scn.scanWing}`);
    assert.equal(scn.tollAmount, 0, 'a scan carries no toll');

    assert.equal(planGateScene(3, 'sec', 'to', 1, { factionId: 'faction_free', security: 0.6, wanted: false }).type, 'queue');
    assert.equal(planGateScene(3, 'sec', 'to', 1, { factionId: 'faction_free', security: 0.2, wanted: false }).type, 'silent');

    // Wanted overrides everything — even an MTS toll gate.
    const hostile = planGateScene(3, 'sec', 'to', 1, { factionId: 'faction_mts', security: 0.5, wanted: true });
    assert.equal(hostile.type, 'hostile');
    assert.equal(hostile.tollAmount, 0, 'a wanted player is not billed a polite toll');

    // No-stack banding: high-sec Meridian gate is NOT a toll (world.js already charges > 0.6).
    const hiMts = planGateScene(3, 'sec', 'to', 1, { factionId: 'faction_mts', security: 0.9, wanted: false });
    assert.notEqual(hiMts.type, 'mts_toll', `high-sec Meridian must not stack a scene toll (MTS_TOLL_MAX_SEC=${MTS_TOLL_MAX_SEC})`);
    assert.equal(hiMts.tollAmount, 0);
  });
}

// ── 3. end-to-end toll via the economy emit (single-writer) ─────────────────────────────────────
function testEndToEndTollViaEconomyEmit() {
  guarded(() => {
    const { ctx, bus, state, voiceCalls } = makeCtx({ factionId: 'faction_mts', security: 0.5 });
    const sys = freshDir(); sys.init(ctx);
    const creditsBefore = state.player.credits;
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    const tolls = tollEmits(bus);
    assert.equal(tolls.length, 1, 'exactly one toll charge emitted');
    assert.strictEqual(tolls[0].payload.reason, 'gate:toll', "reason is 'gate:toll' (distinct from world's 'gate_toll')");
    assert.ok(tolls[0].payload.amount > 0, 'toll amount is positive');
    assert.equal(state.player.credits, creditsBefore, 'director NEVER writes credits directly (single-writer)');
    assert.equal(voiceCalls.length, 1, 'one comms line');
    assert.equal(voiceCalls[0].channel, 'comms', 'toll line is on the comms channel');
  });
}

// ── 4. via guard: only gate jumps get a scene ───────────────────────────────────────────────────
function testViaGuard() {
  guarded(() => {
    const { ctx, bus, voiceCalls, spy } = makeCtx({ factionId: 'faction_mts', security: 0.5 });
    const sys = freshDir(); sys.init(ctx);
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'drive', chargeNeeded: 6 });
    assert.equal(tollEmits(bus).length, 0, 'drive jump → no toll');
    assert.equal(voiceCalls.length, 0, 'drive jump → no comms');
    assert.equal(spy.requests.length, 0, 'drive jump → no wing');
  });
}

// ── 5. scan-wing budget balance ─────────────────────────────────────────────────────────────────
function testWingBudgetBalance() {
  guarded(() => {
    const { ctx, bus, spy, real, spawns } = makeCtx({ factionId: 'faction_scn', security: 0.85 });
    const sys = freshDir(); sys.init(ctx);
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    assert.equal(spy.requests.length, 1, 'requested a wing');
    const grant = real.current();
    assert.ok(grant >= 1 && grant <= WING_MAX, `held ${grant} slots (≤${WING_MAX})`);
    assert.equal(spawns.length, grant, 'spawned exactly the granted count');
    assert.ok(spawns.every((s) => s.team === 2), 'wing ships are team 2 (never hostile)');
    bus.emit('jump:start', { from: 'sec_a', to: 'sec_b' });
    assert.equal(real.current(), 0, 'wing budget released on jump — Σreleased === Σgranted');
  });
}

// ── 6. abort releases + schedules despawn ───────────────────────────────────────────────────────
function testAbortReleasesAndDespawns() {
  guarded(() => {
    const { ctx, bus, state, real } = makeCtx({ factionId: 'faction_scn', security: 0.85 });
    const sys = freshDir(); sys.init(ctx);
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    const wingIds = ensureState(state).scene.entityIds.slice();
    assert.ok(wingIds.length >= 1, 'a wing spawned');
    bus.emit('jump:chargeAbort', { reason: 'combat_lock' });
    assert.equal(real.current(), 0, 'abort frees the wing budget');
    for (const id of wingIds) {
      const ent = state.entities.get(id);
      assert.ok(ent && Number.isFinite(ent.data.despawnAt) && ent.data.despawnAt <= state.simTime, 'wing ship scheduled to despawn on abort');
    }
    assert.equal(ensureState(state).scene, null, 'scene cleared on abort');
  });
}

// ── 7. timeout fallback (the "wait then proceed" never-deadlock guarantee) ───────────────────────
function testTimeoutFallback() {
  guarded(() => {
    const { ctx, bus, state, real } = makeCtx({ factionId: 'faction_scn', security: 0.85 });
    const sys = freshDir(); sys.init(ctx);
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    assert.ok(real.current() >= 1, 'wing up');
    // No jump event ever arrives — the 1 Hz janitor must still free the slot.
    for (let i = 0; i < 60; i++) { state.simTime += 1; sys.update(1, state); }
    assert.equal(real.current(), 0, 'timeout sweep freed the wing (jump never deadlocks on budget)');
    assert.equal(ensureState(state).scene, null, 'scene resolved by timeout');
  });
}

// ── 8. mid-scene kill releases one, jump releases the rest ───────────────────────────────────────
function testMidSceneKill() {
  guarded(() => {
    const { ctx, bus, state, real, spy } = makeCtx({ factionId: 'faction_scn', security: 0.85 });
    const sys = freshDir(); sys.init(ctx);
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    const held = real.current();
    if (held < 2) return; // only meaningful with a 2-ship wing
    const firstId = ensureState(state).scene.entityIds[0];
    bus.emit('entity:destroyed', { id: firstId });
    assert.equal(real.current(), held - 1, 'one kill frees exactly one slot');
    bus.emit('jump:start', { from: 'sec_a', to: 'sec_b' });
    assert.equal(real.current(), 0, 'the rest release on jump');
    const totalReleased = spy.releases.reduce((n, [, k]) => n + (typeof k === 'number' ? k : 0), 0);
    assert.equal(totalReleased, held, 'Σreleased === Σgranted across the kill + jump');
  });
}

// ── 9. hostile path via scanner (not factionId) ─────────────────────────────────────────────────
function testHostilePathViaScanner() {
  guarded(() => {
    // Sanity: the real scanner read the director uses flips on player heat.
    const probe = { team: 3, data: { ai: { lawful: true } } };
    assert.equal(isHostileToPlayer(probe, 1, { player: { heat: 0.5 }, playerId: 1 }), true, 'wanted player → probe hostile');
    assert.equal(isHostileToPlayer(probe, 1, { player: { heat: 0 }, playerId: 1 }), false, 'clean player → probe not hostile');

    const { ctx, bus, voiceCalls } = makeCtx({ factionId: 'faction_mts', security: 0.5, heat: 0.5 });
    const sys = freshDir(); sys.init(ctx);
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    assert.equal(tollEmits(bus).length, 0, 'a wanted player is not billed a polite toll (hostile path)');
    assert.equal(voiceCalls.length, 1, 'the hostile line still speaks once');
    assert.ok(/flagged|stand down/i.test(voiceCalls[0].text), 'the line is the hostile one');
  });
}

// ── 10. per-gate cooldown blocks respam double-charge ────────────────────────────────────────────
function testRepeatCooldown() {
  guarded(() => {
    const { ctx, bus, state, voiceCalls } = makeCtx({ factionId: 'faction_mts', security: 0.5 });
    const sys = freshDir(); sys.init(ctx);
    state.simTime = 500;
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    assert.equal(tollEmits(bus).length, 1, 'first jump charges the toll');
    assert.equal(voiceCalls.length, 1, 'first jump speaks');
    state.simTime = 530; // 30s later, same gate — inside the 120s cooldown
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    assert.equal(tollEmits(bus).length, 1, 'no second toll inside the cooldown (no double-charge)');
    assert.equal(voiceCalls.length, 1, 'no second comms inside the cooldown');
  });
}

// ── 11. ambush no-stack: a hostile on the gate suppresses the scan wing (comms still fires) ──────
function testAmbushNoStack() {
  guarded(() => {
    const { ctx, bus, state, spy, voiceCalls } = makeCtx({ factionId: 'faction_scn', security: 0.85 });
    // A live raider sitting on the gate.
    const raider = { id: 77, type: 'ship', alive: true, team: 3, pos: { x: 800, z: 0 }, data: { ai: { hostileTeams: [1] } } };
    state.entities.set(77, raider); state.entityList.push(raider);
    const sys = freshDir(); sys.init(ctx);
    bus.emit('jump:chargeStart', { targetSectorId: 'sec_b', via: 'gate', chargeNeeded: 6 });
    assert.equal(spy.requests.length, 0, 'no scan wing spawns onto a gate that already has a hostile');
    assert.equal(voiceCalls.length, 1, 'the checkpoint comms still fires');
  });
}
