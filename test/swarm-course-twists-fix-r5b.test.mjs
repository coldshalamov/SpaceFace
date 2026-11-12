// FIX-R5b — fifth-review regressions for the C01-05 round mechanics, one focused check
// per finding, each driven through the real producer payloads: physics:impact aId/bId,
// run:waveStarted, the wave owner's own spawn seam (entity:spawned), and a refusing
// attachments service — never a fake interface.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { swarmDrops } from '../src/systems/swarmDrops.js';
import { swarmCourseTwists } from '../src/systems/swarmCourseTwists.js';
import { FOUNDRY_ARENA_ID } from '../src/systems/swarmArena.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const DT = 1 / 60;
const ARENA = FOUNDRY_ARENA_ID;
const SEED = 4242;

function makeFields() {
  const live = new Map();
  return {
    registerEnvironmental(spec) { live.set(spec.id, spec); return spec; },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(id); },
    updateExternal(id, patch) { const row = live.get(id); if (row) Object.assign(row, patch); return row || null; },
    hasExternal(id) { return live.has(id); },
  };
}

/** Full sim-side boot: arena (freight+floor directors), wave owner, twist owner, kernel. */
function boot(wave, { ruleset = SWARM_RULESET, startTick = 0 } = {}) {
  const state = createGameState(SEED);
  const rawBus = createBus();
  const emitted = [];
  const bus = {
    on: rawBus.on.bind(rawBus),
    off: rawBus.off.bind(rawBus),
    once: rawBus.once.bind(rawBus),
    emit(event, payload) {
      emitted.push({ event, payload });
      rawBus.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const entity = {
        ...spec, id: spec.id ?? state.nextEntityId++, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        vel: spec.vel ? { x: spec.vel.x, z: spec.vel.z } : { x: 0, z: 0 },
        data: spec.data ? { ...spec.data } : {},
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, type: entity.type, entity });
      return entity;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e) { e.alive = false; bus.emit('entity:destroyed', { id, entity: e }); }
    },
  };
  // The pilot is a real entity — cohort spawn law reads it for anchors and targets.
  const player = { id: state.nextEntityId++, alive: true, type: 'ship', team: 1,
    pos: { x: 0, z: -120 }, vel: { x: 0, z: 0 }, radius: 10, mass: 60, hull: 200, hullMax: 200, data: {} };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  rawBus.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  const fields = makeFields();
  const registry = { get: (name) => name === 'fields' ? fields : null };
  const ctx = { state, bus, helpers, registry };
  runSession.init(ctx);
  survivalArena.init(ctx);
  survivalWave.init(ctx);
  survivalRewards.init(ctx);
  swarmDrops.init(ctx);
  swarmCourseTwists.init(ctx);
  const run = createRunState({ kind: 'survival', ruleset, seed: SEED });
  run.arenaId = ARENA;
  run.wave = wave;
  run.phase = 'active';
  state.run = run;
  state.simTime = startTick / 60;
  state.tick = startTick;
  const kernel = getCombatKernel(ctx);

  const events = { warnings: [], departures: [], clears: [], released: [], retired: [], killed: [], riders: [] };
  bus.on('freight:warning', (p) => events.warnings.push({ ...p }));
  bus.on('freight:departed', (p) => events.departures.push(p));
  bus.on('freight:clear', (p) => events.clears.push({ ...p }));
  bus.on('freight:released', (p) => events.released.push({ ...p }));
  bus.on('entity:retired', (p) => events.retired.push({ ...p }));
  bus.on('entity:killed', (p) => events.killed.push({ ...p }));
  bus.on('swarm:freightRiders', (p) => events.riders.push(p));

  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset });
  assert.ok(plan && !plan.error && plan.swarm, `wave ${wave} plans a swarm block`);
  bus.emit('run:wavePlanned', { wave, plan });
  bus.emit('run:waveStarted', { wave, tick: startTick });

  function tick() {
    state.tick += 1;
    state.simTime = state.tick / 60;
    kernel.prePhysics(DT);
    survivalArena.update(DT, state);
    survivalWave.update(DT, state);
    swarmCourseTwists.update(DT, state);
    kernel.postPhysics(DT);
    // Headless integrator — same stand-in the freight tests use: apply the mirrored
    // servo force and integrate the driven bodies.
    for (const e of state.entityList) {
      const cmd = consumePhysicsCommand(e);
      if (e && e.alive !== false && cmd && cmd.control && e.data && e.data.freightString != null) {
        const m = Math.max(1, e.mass || 1);
        e.vel.x += (cmd.control.force.x / m) * DT;
        e.vel.z += (cmd.control.force.z / m) * DT;
      }
      if (e && e.alive !== false && e.data && e.data.freightString != null) {
        e.pos.x += (e.vel && e.vel.x || 0) * DT;
        e.pos.z += (e.vel && e.vel.z || 0) * DT;
      }
      if (cmd && cmd.impulses && cmd.impulses.length && e && e.alive !== false) {
        const mass = Math.max(1, e.mass || (e.physicsBody && e.physicsBody.mass) || 1);
        for (const imp of cmd.impulses) {
          if (e.vel) { e.vel.x += imp.x / mass; e.vel.z += imp.z / mass; }
        }
      }
    }
    // The real loop flushes the deferred queue at end of sim step — entity:spawned is a
    // queued event, so a headless tick owes the same drain or queued listeners never see it.
    rawBus.flush();
  }

  function tickN(n) { for (let i = 0; i < n; i++) tick(); }
  function tickUntil(simTime, maxTicks = 30000) {
    let n = 0;
    while (state.simTime < simTime && n++ < maxTicks) tick();
    assert.ok(n < maxTicks, `tickUntil(${simTime}) exceeded ${maxTicks} ticks`);
  }
  function entities() { return state.entityList.filter((e) => e && e.alive !== false); }
  function freightMembers() {
    return entities().filter((e) => e.data && e.data.freightString != null);
  }
  function attachments() {
    return Object.values((state.combat && state.combat.attachments.byId) || {})
      .filter((a) => a && a.state === 'active');
  }
  return {
    state, ctx, bus, kernel, plan, events, emitted, helpers, tick, tickN, tickUntil,
    entities, freightMembers, attachments,
    destroy() {
      survivalArena.destroy(); survivalWave.destroy();
      survivalRewards.destroy(); swarmDrops.destroy(); swarmCourseTwists.destroy();
      runSession.destroy(); kernel.dispose();
    },
  };
}

/** The physics authority stub the chain-gang tests use: the real create() path runs —
 *  def lookup, socket select, endpoint validation — only the Rapier handle is faked. */
function workingTetherStub() {
  return {
    createAttachment: (input) => `ph_${input.attachmentId}`,
    cutAttachment: () => true,
    setAttachmentReel: () => true,
    getAttachmentTelemetry: () => null,
  };
}

/** A cohort hull the way the wave owner really materializes one (waveMaterialization):
 *  cohort stamp, loot table id, pursuit doctrine, the works. */
function cohortShipSpec(h, lootTableId, pos, wave) {
  return {
    type: 'ship', team: 2,
    pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
    rot: 0, radius: 10, mass: 60, hull: 90, hullMax: 90, collides: true,
    data: {
      runCohort: 'survival', runWave: wave, runRole: 'wave',
      lootTableId,
      ai: {
        spawnContext: 'encounter',
        forcePlayerTarget: true, huntPlayer: true, moraleImmune: true, surrenderImmune: true,
        lawful: false, roe: 'weapons_free', motive: 'arena_contract',
        engagementTrigger: 'authorized_hostile_spawn',
        activity: { kind: 'attack_run', reason: 'survival_pursuit', targetId: h.state.playerId, anchor: null },
      },
      combat: { targetId: h.state.playerId },
    },
  };
}

// ── FIX-R5b #1 (HIGH): Highway Robbery must need a player endpoint ─────────────────────

test('Highway Robbery: a Reaver-Reaver collision never debits the purse', () => {
  const h = boot(18);
  try {
    h.state.run.credits = 1000;
    h.tickUntil(3); // the opening package lands at tick 0 — a few ticks seats it
    const reavers = h.entities().filter((e) => e.data && e.data.lootTableId === 'reaver_pirate');
    assert.ok(reavers.length >= 2, `the Reaver package spawned (${reavers.length})`);
    const [a, b] = reavers;
    // The real physics producer publishes aId/bId for every body contact — two stamped
    // Reavers clipping each other is an ordinary mid-room impact, no player involved.
    h.bus.emit('physics:impact', {
      aId: a.id, bId: b.id, playerInvolved: false,
      pos: { x: a.pos.x, z: a.pos.z }, normal: { x: 1, z: 0 },
      preSolveClosingSpeed: 60, tick: h.state.tick,
    });
    assert.equal(h.emitted.filter((e) => e.event === 'run:spendRequested').length, 0,
      'no player endpoint — nothing leaves the purse');
    assert.equal(h.state.run.credits, 1000, 'the purse is untouched');
    assert.equal(a.data.swarmThief.done, false, 'the first Reaver did not spend its robbery');
    assert.equal(b.data.swarmThief.done, false, 'the second Reaver did not spend its robbery');
    // The same round still robs on a real touch — the guard is the endpoint, not the event.
    h.bus.emit('physics:impact', {
      aId: h.state.playerId, bId: a.id, playerInvolved: true,
      pos: { x: a.pos.x, z: a.pos.z }, normal: { x: 1, z: 0 },
      preSolveClosingSpeed: 80, tick: h.state.tick,
    });
    assert.equal(h.emitted.filter((e) => e.event === 'run:spendRequested').length, 1,
      'a real player touch still robs');
    assert.equal(h.state.run.credits, 850);
  } finally { h.destroy(); }
});

// ── FIX-R5b #2 (MED): The Yardmaster counts round ticks, not global ticks ───────────────

test('The Yardmaster: both throws count from the round\'s own start, not the run clock', () => {
  // Round 20 deep into a real run: the global sim tick passed both authored thresholds
  // long ago. The authored mid-fight throws are owed at 25 s and 65 s of ROUND time.
  const h = boot(20, { startTick: 3900 });
  try {
    h.tickN(30); // half a second of round time
    assert.equal(h.emitted.filter((e) => e.event === 'freight:reverseRequested').length, 0,
      'no lane throw inside the round\'s first second');
    h.tickUntil(65 + 26); // 26 s of round time — the first throw is owed at 25
    const first = h.emitted.filter((e) => e.event === 'freight:reverseRequested');
    assert.equal(first.length, 1, 'the first throw lands at its authored second');
    assert.equal(first[0].payload.reversal, 1);
    const rev1 = h.events.warnings.filter((w) => w.reversal === true);
    assert.equal(rev1.length, 1);
    assert.equal(rev1[0].dir, -1, 'the next string runs west');
    h.tickUntil(65 + 64);
    assert.equal(h.emitted.filter((e) => e.event === 'freight:reverseRequested').length, 1,
      'the second throw waits for its authored second');
    h.tickUntil(65 + 66); // the second throw is owed at 65 s of round time
    const second = h.emitted.filter((e) => e.event === 'freight:reverseRequested');
    assert.equal(second.length, 2, 'the Yardmaster threw the lane twice');
    const rev2 = h.events.warnings.filter((w) => w.reversal === true);
    assert.equal(rev2.length, 2);
    assert.equal(rev2[1].dir, 1, 'the lane runs east again');
  } finally { h.destroy(); }
});

// ── FIX-R5b #3 (MED): Law reinforcements observe an already-active warning ──────────────

test('The Law: a hull materializing under amber holds at the corridor edge until clear', () => {
  const h = boot(19);
  try {
    h.tickUntil(18); // first warning lands ~3 s before the 20 s departure
    assert.ok(h.events.warnings.length >= 1, 'the freight owner warned the room');
    const zLane = h.events.warnings[0].z0;
    const heldBefore = h.entities().filter((e) => e.data && e.data.ai
      && e.data.ai.activity && e.data.ai.activity.kind === 'hail_hold');
    assert.ok(heldBefore.length >= 3, `the opening cohort is already holding (${heldBefore.length})`);
    // The real reinforcement path: the wave owner tops up the cohort through the same
    // helpers.spawnEntity seam it used all round — entity:spawned carries the live entity.
    const newcomer = h.helpers.spawnEntity(cohortShipSpec(h, 'patrol_lawman', { x: 60, z: zLane }, 19));
    h.tick(); // entity:spawned is queued — one tick drains it through the real dispatch
    const act = newcomer.data.ai && newcomer.data.ai.activity;
    assert.equal(act && act.kind, 'hail_hold', 'the reinforcement observes the lights');
    assert.equal(newcomer.data.ai.roe, 'weapons_free', 'held, not harmless');
    assert.ok(act.anchor && Math.abs(act.anchor.z - zLane) >= 70 - 1e-9,
      `the hold anchor sits outside the corridor (|${act.anchor && act.anchor.z - zLane}|)`);
    // And it releases with the rest of The Law when the string passes.
    h.tickUntil(30);
    assert.equal(newcomer.data.ai.activity.kind, 'attack_run', 'released with the rest of The Law');
  } finally { h.destroy(); }
});

// ── FIX-R5b #4 (LOW): a refused odd-member bind is not discarded ─────────────────────────

test('Chain Gang: a refused odd-member bind chains once the service answers again', () => {
  const h = boot(22);
  try {
    // The opening cast pairs off through the live attachments service first.
    h.helpers.combatPhysics = workingTetherStub();
    h.tickUntil(4);
    assert.ok(h.attachments().filter((a) => a.defId === 'attachment_snarl').length >= 7,
      'the gang is chained — a previous tail exists for the odd man');
    // The physics port goes down — the real refusal the service returns while Rapier
    // is unavailable ({ ok: false, reason: 'physics_port_unavailable' }).
    h.helpers.combatPhysics = null;
    const odd = h.helpers.spawnEntity(cohortShipSpec(h, 'wasp_swarmer', { x: 30, z: 40 }, 22));
    h.tickN(40); // past the odd man's grace window — the bind is asked and refused
    assert.equal(odd.data.swarmGangPartner == null, true, 'no chain while the service refuses');
    assert.equal(h.attachments().filter((a) => a.ownerId === odd.id || a.targetId === odd.id).length, 0,
      'no snarl record survives a refused bind');
    // The service answers again — the odd man is still queued and takes its link.
    h.helpers.combatPhysics = workingTetherStub();
    h.tickN(2);
    assert.equal(odd.data.swarmGangPartner != null, true,
      'the odd man chains to the previous tail once the service returns');
    const link = h.attachments().find((a) => a.defId === 'attachment_snarl'
      && a.ownerId === odd.id && a.targetId === odd.data.swarmGangPartner);
    assert.ok(link, 'one real snarl binds the odd hull');
  } finally { h.destroy(); }
});
