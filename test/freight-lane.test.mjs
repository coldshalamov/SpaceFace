import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { FOUNDRY_ARENA_ID } from '../src/systems/swarmArena.js';
import {
  FREIGHT_FIRST_DEPART_S,
  FREIGHT_PERIOD_S,
  FREIGHT_WARN_LEAD_S,
  FREIGHT_STRING_COUNT,
  FREIGHT_SPACING_WU,
  FREIGHT_SPEED_WU_S,
  FREIGHT_CONTAINER_MASS_T,
  FREIGHT_HEAVY_HULL_FRACTION,
  FREIGHT_PLAYER_HULL_FRACTION,
  FREIGHT_SHOVE_WU_S,
  FREIGHT_HOLD_TICKS,
} from '../src/systems/freightLane.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;

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

function boot() {
  const state = createGameState(7);
  const rawBus = createBus();
  const bus = {
    on: rawBus.on.bind(rawBus),
    off: rawBus.off.bind(rawBus),
    once: rawBus.once.bind(rawBus),
    emit: rawBus.emit.bind(rawBus),
  };
  let nextId = 1;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec, id: spec.id ?? nextId++, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        vel: spec.vel ? { x: spec.vel.x, z: spec.vel.z } : { x: 0, z: 0 },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const fields = makeFields();
  const ctx = { state, bus, helpers, registry: { get: (name) => name === 'fields' ? fields : null } };
  survivalArena.init(ctx);
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed: 7 });
  run.arenaId = FOUNDRY_ARENA_ID;
  run.wave = 1;
  run.phase = 'wave_intro';
  state.run = run;
  state.simTime = 0;
  state.tick = 0;
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: 7, arenaId: FOUNDRY_ARENA_ID, wave: 1 }) });
  const kernel = getCombatKernel(ctx);
  const events = { warnings: [], departures: [], clears: [], contacts: [], released: [], retired: [], kills: [], horn: [] };
  bus.on('freight:warning', (p) => events.warnings.push({ ...p }));
  bus.on('freight:departed', (p) => events.departures.push({ ...p }));
  bus.on('freight:clear', (p) => events.clears.push({ ...p }));
  bus.on('freight:contact', (p) => events.contacts.push({ ...p }));
  bus.on('freight:released', (p) => events.released.push({ ...p }));
  bus.on('entity:retired', (p) => events.retired.push({ ...p }));
  bus.on('entity:killed', (p) => events.kills.push({ ...p }));
  bus.on('audio:cue', (p) => { if (p && p.id === 'sfx_hauler_foghorn') events.horn.push({ ...p }); });

  const impulses = new Map();
  function tick() {
    state.tick += 1;
    state.simTime = state.tick / 60;
    kernel.prePhysics(DT);
    survivalArena.update(DT, state);
    // Headless integrator: the SG-02 owner would apply the mirrored velocity and the
    // queued impulses; here we do both and keep receipts for the assertions.
    for (const e of state.entityList) {
      if (e && e.alive !== false && e.data && e.data.freightString != null) {
        e.pos.x += (e.vel && e.vel.x || 0) * DT;
        e.pos.z += (e.vel && e.vel.z || 0) * DT;
      }
      const cmd = consumePhysicsCommand(e);
      if (cmd && cmd.impulses && cmd.impulses.length) {
        const mass = Math.max(1, e.mass || (e.physicsBody && e.physicsBody.mass) || 1);
        for (const imp of cmd.impulses) {
          (impulses.get(e.id) || impulses.set(e.id, []).get(e.id)).push({ x: imp.x, z: imp.z });
          if (e.vel) { e.vel.x += imp.x / mass; e.vel.z += imp.z / mass; }
        }
      }
    }
  }

  function tickUntil(simTime, maxTicks = 20000) {
    let n = 0;
    while (state.simTime < simTime && n++ < maxTicks) tick();
    assert.ok(n < maxTicks, `tickUntil(${simTime}) exceeded ${maxTicks} ticks`);
  }

  function tickN(n) { for (let i = 0; i < n; i++) tick(); }

  function spawn(spec) {
    return helpers.spawnEntity({ type: 'ship', team: 2, ...spec });
  }

  function freightMembers() {
    return state.entityList.filter((e) => e && e.alive !== false && e.data && e.data.freightString != null);
  }

  return { state, ctx, bus, kernel, events, helpers, tick, tickN, tickUntil, spawn, freightMembers, impulses,
    destroy() { survivalArena.destroy(); kernel.dispose(); } };
}

test('freight timetable: warning exactly 3 s before departure, first string at 20 s, then every 40 s', () => {
  const h = boot();
  try {
    h.tickUntil(62);
    assert.equal(h.events.warnings.length, 2, 'two warnings inside 62 s of installed room');
    assert.equal(h.events.departures.length, 2, 'two strings departed');
    const w0 = h.events.warnings[0];
    assert.ok(Math.abs(w0.departAt - w0.t - FREIGHT_WARN_LEAD_S) < 0.05,
      `warning leads departure by ${FREIGHT_WARN_LEAD_S} s (got ${w0.departAt - w0.t})`);
    assert.ok(Math.abs(w0.departAt - FREIGHT_FIRST_DEPART_S) < 0.05, 'first departure at +20 s');
    assert.ok(Math.abs(h.events.departures[1].t - h.events.departures[0].t - FREIGHT_PERIOD_S) < 0.05,
      'second string 40 s after the first');
    assert.equal(w0.blinkHz, 2, 'warning carries the authored 2 Hz blink truth');
    assert.equal(w0.x0, -400); assert.equal(w0.x1, 400);
    assert.equal(h.events.horn.length, 2, 'the foghorn plays at each warning');
    assert.ok(Math.abs(h.events.horn[0].position.x - w0.x0) < 1e-9, 'the horn sounds at the west end');
    // Five containers, 30 WU apart, at 140 WU/s on the rail.
    const members = h.freightMembers().sort((a, b) => a.data.freightIndex - b.data.freightIndex);
    assert.equal(members.length, FREIGHT_STRING_COUNT);
    for (let i = 1; i < members.length; i++) {
      const gap = members[i - 1].pos.x - members[i].pos.x;
      assert.ok(Math.abs(gap - FREIGHT_SPACING_WU) < 2, `member ${i} spacing ~30 WU (got ${gap})`);
    }
    for (const m of members) {
      assert.ok(Math.abs(m.vel.x - FREIGHT_SPEED_WU_S) < 5, `member speed ~140 (got ${m.vel.x})`);
      assert.equal(m.mass, FREIGHT_CONTAINER_MASS_T);
      assert.equal(m.data.freightString != null, true);
      assert.equal(isAttachable(m, 999), true, 'a string container is latchable with the Line');
    }
  } finally { h.destroy(); }
});

test('light enemy dies on contact; kill is an environment kill without provenance', () => {
  const h = boot();
  try {
    const wasp = h.spawn({ mass: 24, radius: 8, hull: 40, hullMax: 40, pos: { x: -200, z: 0 } });
    h.tickUntil(23);
    assert.equal(wasp.alive, false, 'a 24 t hull standing in the lane is dead');
    const contact = h.events.contacts.find((c) => c.targetId === wasp.id);
    assert.ok(contact, 'freight:contact receipt exists');
    assert.equal(contact.killed, true);
    assert.equal(contact.player, false);
    assert.equal(contact.creditActorId, FOUNDRY_ARENA_ID, 'no throw provenance → the arena takes the kill');
    const kill = h.events.kills.find((k) => k.id === wasp.id);
    assert.ok(kill, 'kernel published a kill receipt');
    assert.notEqual(kill.killerId, h.state.playerId, 'the arena kill is not credited to the player');
  } finally { h.destroy(); }
});

test('thrown provenance inside the 4 s window credits the crushing kill to the thrower', () => {
  const h = boot();
  try {
    const pilot = h.spawn({ mass: 20, radius: 10, hull: 100, hullMax: 100, pos: { x: -700, z: -700 } });
    h.state.playerId = pilot.id;
    const wasp = h.spawn({ mass: 24, radius: 8, hull: 40, hullMax: 40, pos: { x: -200, z: 0 } });
    // The pilot threw the wasp into the lane one second ago (inside thrownProvenanceS).
    h.tickUntil(21);
    recordImpulseProvenance(wasp, { tag: 'tether_release', actorId: pilot.id, appliedTick: h.state.tick });
    h.tickUntil(24);
    assert.equal(wasp.alive, false);
    const contact = h.events.contacts.find((c) => c.targetId === wasp.id);
    assert.equal(contact.creditActorId, pilot.id, 'the thrown hull is the pilot\'s kill');
  } finally { h.destroy(); }
});

test('heavy enemy loses 60% of max hull and is shoved perpendicular out of the lane', () => {
  const h = boot();
  try {
    const heavy = h.spawn({ mass: 200, radius: 14, hull: 100, hullMax: 100, pos: { x: -150, z: 3 } });
    h.tickUntil(24);
    const contact = h.events.contacts.find((c) => c.targetId === heavy.id);
    assert.ok(contact, 'the string touched the heavy hull');
    assert.ok(heavy.alive !== false && heavy.hull > 0, 'a heavy hull survives');
    assert.ok(heavy.hull <= 100 - FREIGHT_HEAVY_HULL_FRACTION * 100 + 1,
      `hull lost ~60% of max (hull now ${heavy.hull})`);
    const shoves = h.impulses.get(heavy.id) || [];
    assert.ok(shoves.length > 0, 'a shove impulse was queued');
    const imp = shoves[shoves.length - 1];
    // Lane runs +x; the exit impulse is perpendicular (z), ~120 WU/s * mass.
    assert.ok(Math.abs(imp.x) < Math.abs(imp.z) * 0.05, 'the shove is perpendicular to the lane');
    assert.ok(Math.abs(Math.abs(imp.z) / 200 - FREIGHT_SHOVE_WU_S) < 40,
      `exit speed ~120 WU/s (got ${Math.abs(imp.z) / 200})`);
  } finally { h.destroy(); }
});

test('the player loses 40% of max hull and is shoved out of the lane', () => {
  const h = boot();
  try {
    const pilot = h.spawn({ mass: 60, radius: 10, hull: 200, hullMax: 200, pos: { x: -100, z: -2 } });
    h.state.playerId = pilot.id;
    h.tickUntil(24);
    const contact = h.events.contacts.find((c) => c.targetId === pilot.id);
    assert.ok(contact && contact.player === true, 'the string touched the pilot');
    assert.ok(pilot.hull <= 200 - FREIGHT_PLAYER_HULL_FRACTION * 200 + 1,
      `hull lost ~40% of max (hull now ${pilot.hull})`);
    const shoves = h.impulses.get(pilot.id) || [];
    assert.ok(shoves.length > 0, 'a shove impulse was queued for the pilot');
  } finally { h.destroy(); }
});

test('a latched container cuts loose after 0.5 s above the hold threshold', () => {
  const h = boot();
  try {
    const pilot = h.spawn({ mass: 60, radius: 10, hull: 200, hullMax: 200, pos: { x: -700, z: -700 } });
    h.state.playerId = pilot.id;
    h.tickUntil(21);
    const members = h.freightMembers().sort((a, b) => a.data.freightIndex - b.data.freightIndex);
    assert.equal(members.length, FREIGHT_STRING_COUNT);
    const target = members[2];
    const attId = 'att_freight_test';
    h.state.combat.attachments.byId[attId] = {
      id: attId, defId: 'attachment_massline', ownerId: pilot.id, targetId: target.id,
      controllerId: pilot.id, state: 'active', createdTick: h.state.tick,
      lastTension: 0, lastImpulse: 0, lastYank: 0,
    };
    const att = h.state.combat.attachments.byId[attId];
    // Riding the string must NOT cut it loose: tension under the hold threshold.
    att.lastTension = 100;
    h.tickN(FREIGHT_HOLD_TICKS + 10);
    assert.equal(target.data.freightString != null, true, 'a slack ride stays on the string');
    assert.equal(h.events.released.length, 0);
    // Now haul on it — sustained tension over the envelope.
    att.lastTension = 1e9;
    h.tickN(FREIGHT_HOLD_TICKS + 2);
    assert.equal(target.data.freightString, null, 'the container cut loose from the string');
    assert.equal(target.data.freightReleased, true);
    const rel = h.events.released.find((r) => r.entityId === target.id);
    assert.ok(rel, 'freight:released receipt exists');
    assert.equal(rel.reason, 'line_tension');
    // The released body is still an ordinary, alive, tetherable heavy body.
    assert.equal(target.alive, true);
    assert.equal(target.mass, FREIGHT_CONTAINER_MASS_T);
    assert.equal(isAttachable(target, pilot.id), true, 'the loose container stays Line-eligible');
    // The rest of the string keeps moving and reaches the east end.
    const before = h.freightMembers().length;
    assert.equal(before, FREIGHT_STRING_COUNT - 1, 'the other four containers are still on the rail');
    h.tickUntil(30);
    assert.equal(h.freightMembers().length, 0, 'the remaining string despawns at the east end');
  } finally { h.destroy(); }
});

test('the string despawns at the east end and the lane clears', () => {
  const h = boot();
  try {
    h.tickUntil(28);
    assert.ok(h.events.departures.length >= 1);
    const clear = h.events.clears.find((c) => c.stringId === h.events.departures[0].stringId);
    assert.ok(clear, 'freight:clear fired when the last container passed');
    assert.equal(h.freightMembers().length, 0, 'no freight bodies linger east of the exit');
    const retired = h.events.retired.filter((r) => r.reason === 'freight-east-exit');
    assert.equal(retired.length, FREIGHT_STRING_COUNT, 'all five containers retired at the east exit');
  } finally { h.destroy(); }
});

test('the same seed produces identical freight outcomes', () => {
  // survivalArena is a singleton host — run the two boots sequentially and compare.
  const run1 = boot();
  for (let i = 0; i < 2400; i++) run1.tick();
  const w1 = run1.events.warnings.map((w) => [w.t, w.departAt, w.x0, w.x1]);
  const d1 = run1.events.departures.map((d) => [d.t, d.stringId, d.count]);
  const p1 = run1.freightMembers().map((m) => Math.round(m.pos.x * 100));
  run1.destroy();
  const run2 = boot();
  for (let i = 0; i < 2400; i++) run2.tick();
  const w2 = run2.events.warnings.map((w) => [w.t, w.departAt, w.x0, w.x1]);
  const d2 = run2.events.departures.map((d) => [d.t, d.stringId, d.count]);
  const p2 = run2.freightMembers().map((m) => Math.round(m.pos.x * 100));
  run2.destroy();
  assert.deepEqual(w1, w2, 'warning timetable is identical for the same seed');
  assert.deepEqual(d1, d2, 'departures are identical for the same seed');
  assert.deepEqual(p1, p2, 'container positions are bit-identical for the same seed');
});
