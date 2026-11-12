// C01-05 — the room does the twist: one focused check per course mechanic, each driven
// through the real producer payloads (planWave → run:wavePlanned/Started, freightLane's
// freight:* receipts, the attachments service, the purse seam) — never a fake interface.
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
import { swarmCourseTwists } from '../src/systems/swarmCourseTwists.js';
import { FOUNDRY_ARENA_ID } from '../src/systems/swarmArena.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { FREIGHT_STRING_COUNT, FREIGHT_LANE_HALF_LENGTH } from '../src/systems/freightLane.js';
import {
  attachSectorDimmer,
  applySectorDimmer,
  resetSectorDimmerForTest,
  sectorDimmerStatus,
} from '../src/render/sectorDimmer.js';

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
function boot(wave, { ruleset = SWARM_RULESET } = {}) {
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
  swarmCourseTwists.init(ctx);
  const run = createRunState({ kind: 'survival', ruleset, seed: SEED });
  run.arenaId = ARENA;
  run.wave = wave;
  run.phase = 'active';
  state.run = run;
  state.simTime = 0;
  state.tick = 0;
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
  bus.emit('run:waveStarted', { wave, tick: 0 });

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
      survivalRewards.destroy(); swarmCourseTwists.destroy();
      runSession.destroy(); kernel.dispose();
    },
  };
}

// ── Round 12 — Delivery ────────────────────────────────────────────────────────────────

test('Delivery: the Reaver package rides the first string in — spawned on the containers', () => {
  const h = boot(12);
  try {
    // The plan carries the rideFreight flag on the Reaver package and nothing dispatches
    // it through a gate.
    const riderEntries = h.plan.schedule.filter((e) => e.rideFreight === true);
    assert.equal(riderEntries.length, 1, 'exactly one schedule entry rides the freight');
    assert.equal(riderEntries[0].enemyId, 'reaver_pirate');
    h.tickUntil(21); // first string departs at t≈20
    assert.equal(h.events.riders.length, 1, 'the wave owner receipted the riders once');
    assert.equal(h.events.riders[0].riders.length, 3, 'three Reavers board the string');
    for (const pair of h.events.riders[0].riders) {
      const rider = h.state.entities.get(pair.id);
      const member = h.state.entities.get(pair.memberId);
      assert.equal(rider.data.runCohort, 'survival', 'the rider is a real cohort hostile');
      assert.equal(rider.data.swarmFreightRider.memberId, member.id, 'the ride stamp names its box');
      assert.equal(member.data.freightString, h.events.riders[0].stringId, 'the seat is a string member');
    }
    // The riders move WITH the string, seated at their containers.
    for (const pair of h.events.riders[0].riders) {
      const rider = h.state.entities.get(pair.id);
      const member = h.state.entities.get(pair.memberId);
      assert.ok(Math.abs(rider.pos.x - member.pos.x) < 60,
        `rider ${pair.id} stays seated (gap ${Math.abs(rider.pos.x - member.pos.x)})`);
    }
  } finally { h.destroy(); }
});

test('Delivery: riders detach at the lane midpoint and join the fight', () => {
  const h = boot(12);
  try {
    // First departure t≈20; lead container crosses x=0 at t≈20 + 400/140 ≈ 22.9 s.
    h.tickUntil(26);
    assert.ok(h.events.riders.length >= 1, 'riders boarded');
    for (const pair of h.events.riders[0].riders) {
      const rider = h.state.entities.get(pair.id);
      assert.equal(rider.data.swarmFreightRider, null, 'the ride stamp cleared');
      assert.equal(rider.data.ai.activity.kind, 'attack_run', 'the rider fights on foot');
      // And it is no longer welded to its box — the seat writes stopped.
      const member = h.state.entities.get(pair.memberId);
      if (member && member.alive !== false) {
        const gapBefore = Math.abs(rider.pos.x - member.pos.x);
        h.tickN(30);
        const gapAfter = Math.abs(rider.pos.x - member.pos.x);
        assert.ok(gapAfter >= gapBefore, 'a detached rider stops tracking the box');
      }
    }
  } finally { h.destroy(); }
});

test('Delivery: a container cut loose before the midpoint carries its rider out of the fight', () => {
  const h = boot(12);
  try {
    h.tickUntil(21);
    assert.equal(h.events.riders.length, 1);
    const { riders } = h.events.riders[0];
    const member = h.freightMembers().find((m) => m.id === riders[0].memberId);
    assert.ok(member, 'the rider\'s container is live');
    // Cut before x=0 (the lane midpoint): the container is still west of centre.
    assert.ok(member.pos.x < 0, 'the cut lands before the midpoint');
    // The real release seam: sustained line tension over the hold envelope, exactly
    // like the freight-lane latch tests drive it.
    const attId = 'att_cut_test';
    h.state.combat.attachments.byId[attId] = {
      id: attId, defId: 'attachment_massline', ownerId: h.state.playerId ?? 1,
      targetId: member.id, controllerId: 1, state: 'active',
      createdTick: h.state.tick, lastTension: 1e9, lastImpulse: 0, lastYank: 0,
      lastReelTick: h.state.tick,
    };
    const att = h.state.combat.attachments.byId[attId];
    for (let i = 0; i < 40; i++) { att.lastReelTick = h.state.tick; h.tick(); }
    assert.equal(h.events.released.some((r) => r.entityId === member.id && r.reason === 'line_tension'),
      true, 'the real freight owner cut the container loose');
    const rider = h.state.entities.get(riders[0].id);
    // Carried: the rider keeps its seat and tracks the ballistic box.
    assert.equal(rider.data.swarmFreightRider.memberId, member.id, 'the rider stays seated on the loose container');
    member.vel.x = 120;
    h.tick();
    assert.ok(Math.abs(rider.pos.x - member.pos.x) < 60, 'the seat follows the box as it sails');
    // The box sails; once it leaves the room the rider is routed, not a fight blocker.
    for (let i = 0; i < 60 * 12 && !rider.data.forceFlee; i++) {
      member.vel.x = 120; // ballistic carry — the loose box keeps its momentum
      member.pos.x += member.vel.x * DT;
      h.tick();
    }
    assert.ok(rider.data.forceFlee != null || rider.data.ai.activity.kind === 'flee',
      'a carried-away rider is routed out of the fight');
  } finally { h.destroy(); }
});

// ── Round 13 — Lights Out ──────────────────────────────────────────────────────────────

function fakeRig() {
  const mk = (intensity) => ({ intensity });
  return { _sectorPaletteRig: { lights: { ambient: mk(0.85), key: mk(1.7), rim: mk(0.7), fill: mk(0.35) } } };
}

test('Lights Out: the round asks the room for a quarter light, restored at the boundary', () => {
  const h = boot(13);
  try {
    const asks = h.emitted.filter((e) => e.event === 'swarm:arenaLights');
    assert.equal(asks.length, 1, 'wave start issues one light request');
    assert.equal(asks[0].payload.level, 0.25);
    assert.equal(asks[0].payload.fadeS, 2);
    assert.equal(asks[0].payload.wave, 13);
    // Round end restores authored light — same teardown path run:ended/save:loaded ride.
    h.bus.emit('run:waveCleared', { wave: 13 });
    const restore = h.emitted.filter((e) => e.event === 'swarm:arenaLights');
    assert.equal(restore.length, 2);
    assert.equal(restore[1].payload.level, 1);
    assert.equal(restore[1].payload.reason, 'swarm_lights_restore');
  } finally { h.destroy(); }
});

test('Lights Out: the dimmer scales only the sector rig — and survives a palette rewrite', () => {
  resetSectorDimmerForTest();
  const raw = createBus();
  attachSectorDimmer(raw);
  const render = fakeRig();
  raw.emit('swarm:arenaLights', { level: 0.25, fadeS: 2, reason: 'swarm_lights_out', wave: 13 });
  // Two-second wall-paced fade: halfway through the room is dimming, not yet dark.
  applySectorDimmer(render, 1);
  assert.ok(sectorDimmerStatus().level > 0.25, 'mid-fade the room is still falling');
  applySectorDimmer(render, 1.2);
  assert.equal(sectorDimmerStatus().level, 0.25, 'the fade lands on the authored quarter');
  const lights = render._sectorPaletteRig.lights;
  assert.ok(Math.abs(lights.ambient.intensity - 0.85 * 0.25) < 1e-9);
  assert.ok(Math.abs(lights.key.intensity - 1.7 * 0.25) < 1e-9);
  // A palette transition rewriting the rig mid-dim re-bases the gain — never compounds.
  lights.key.intensity = 2.2; // e.g. a sector palette lerp landed a new authored value
  applySectorDimmer(render, 0.016);
  assert.ok(Math.abs(lights.key.intensity - 2.2 * 0.25) < 1e-9, 'the rig rewrite becomes the new base');
  applySectorDimmer(render, 0.016);
  assert.ok(Math.abs(lights.key.intensity - 2.2 * 0.25) < 1e-9, 'and the scale never stacks on itself');
  // Restore returns every light to its authored number.
  raw.emit('swarm:arenaLights', { level: 1, fadeS: 0.5, reason: 'swarm_lights_restore' });
  applySectorDimmer(render, 0.5);
  assert.equal(sectorDimmerStatus().level, 1);
  assert.equal(lights.ambient.intensity, 0.85);
  assert.equal(lights.key.intensity, 2.2);
  assert.equal(lights.rim.intensity, 0.7);
  assert.equal(lights.fill.intensity, 0.35);
  resetSectorDimmerForTest();
});

// ── Round 18 — Highway Robbery ─────────────────────────────────────────────────────────

test('Highway Robbery: a touching Reaver takes 15% of the purse through the debit seam and runs', () => {
  const h = boot(18);
  try {
    h.state.run.credits = 1000;
    h.tickUntil(3); // the opening package lands at tick 0 — a few ticks seats it
    const reavers = h.entities().filter((e) => e.data && e.data.lootTableId === 'reaver_pirate');
    assert.ok(reavers.length >= 4, `the Reaver package spawned (${reavers.length})`);
    const thief = reavers[0];
    assert.equal(thief.data.swarmThief.stolen, 0, 'the robber carries the thief stamp');
    // No dealt card rides this round — the robbery IS the event.
    const playerId = h.state.playerId;
    h.bus.emit('physics:impact', {
      aId: playerId, bId: thief.id, pos: { x: thief.pos.x, z: thief.pos.z },
      normal: { x: 1, z: 0 }, preSolveClosingSpeed: 80, tick: h.state.tick,
    });
    const spends = h.emitted.filter((e) => e.event === 'run:spendRequested');
    assert.equal(spends.length, 1, 'exactly one debit request left the purse');
    assert.equal(spends[0].payload.credits, 150, '15% of 1000');
    assert.equal(spends[0].payload.reason, 'swarm:theft');
    const spent = h.emitted.filter((e) => e.event === 'run:spent');
    assert.equal(spent.length, 1, 'the purse owner answered the debit');
    assert.equal(h.state.run.credits, 850, 'the run purse is 15% lighter');
    assert.equal(thief.data.swarmThief.stolen, 150);
    assert.equal(thief.data.ai.forceFlee, true, 'the thief runs the authored egress for the gate');
    // A second touch never steals twice.
    h.bus.emit('physics:impact', {
      aId: playerId, bId: thief.id, pos: { x: thief.pos.x, z: thief.pos.z },
      normal: { x: 1, z: 0 }, tick: h.state.tick,
    });
    assert.equal(h.emitted.filter((e) => e.event === 'run:spendRequested').length, 1);
    assert.equal(h.state.run.credits, 850);
  } finally { h.destroy(); }
});

test('Highway Robbery: killing a loaded thief drops exactly the take through the chip pipeline', () => {
  const h = boot(18);
  try {
    h.state.run.credits = 1000;
    h.tickUntil(3);
    const thief = h.entities().find((e) => e.data && e.data.lootTableId === 'reaver_pirate');
    h.bus.emit('physics:impact', {
      aId: h.state.playerId, bId: thief.id,
      pos: { x: thief.pos.x, z: thief.pos.z }, normal: { x: 1, z: 0 }, tick: h.state.tick,
    });
    assert.equal(h.state.run.credits, 850);
    // Kill the fleeing robber — the corpse drops what it took as a real entitled chip.
    h.bus.emit('entity:killed', { id: thief.id, tick: h.state.tick, cause: 'player_gun' });
    const bonus = h.emitted.filter((e) => e.event === 'swarm:bonusChip');
    assert.equal(bonus.length, 1);
    assert.equal(bonus[0].payload.credits, 150);
    assert.equal(bonus[0].payload.reason, 'swarm:theft');
    const drops = h.emitted.filter((e) => e.event === 'loot:drop');
    assert.equal(drops.length, 1, 'the reward owner minted the recovery chip at the corpse');
    const item = drops[0].payload.items && drops[0].payload.items[0];
    assert.equal(item.credits, 150);
    assert.equal(item.grantReason, 'swarm:theft');
  } finally { h.destroy(); }
});

test('Highway Robbery: an untouched purse lets the thief run empty-handed', () => {
  const h = boot(18);
  try {
    h.state.run.credits = 0;
    h.tickUntil(3);
    const thief = h.entities().find((e) => e.data && e.data.lootTableId === 'reaver_pirate');
    h.bus.emit('physics:impact', {
      aId: h.state.playerId, bId: thief.id,
      pos: { x: thief.pos.x, z: thief.pos.z }, normal: { x: 1, z: 0 }, tick: h.state.tick,
    });
    assert.equal(h.emitted.filter((e) => e.event === 'run:spendRequested').length, 0,
      'nothing in the purse, nothing debited');
    assert.equal(thief.data.ai.forceFlee, true, 'but the robber still runs for the gate');
  } finally { h.destroy(); }
});
