/**
 * THE WORLD ANSWERS — C7 (pods x pirate hunt) + T10 half (rescue decays heat).
 *
 * A crewed hull dies and ejects a survivor pod. A wounded pirate breaks off the fight to take the
 * pod for ransom (aggro drops while it is on the errand), so a player can shed a pursuer by
 * sacrificing a pod. A pirate that reaches the pod captures it (one receipt + one plain-words bark).
 * Rescuing a lawful pod, on the other hand, cools the WANTED ledger one bounded step, once per pod.
 *
 * Drives the real systems (survivorPod, heat) with the real bus on createGameState(seed).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  heat,
  RESCUE_COOL_MAX_PER_WINDOW,
  RESCUE_COOL_PER_POD,
  RESCUE_COOL_WINDOW_S,
} from '../src/systems/heat.js';
import { POD_HUNT } from '../src/ai/podHunt.js';
import { POD_HUNT_BARKS, podHuntBarkFor } from '../src/data/barks.js';
import {
  ADDITIONAL_ACTION_VFX_RECIPES,
  SURVIVOR_POD_RETIRE,
  resolveAdditionalActionVfxReceipt,
} from '../src/render/vfx/actionEventRecipes.js';
import { isCausalSurvivorPod, survivorPod } from '../src/systems/survivorPod.js';

const DT = 1 / 60;
const SEEDS = [4242, 8008];

function boot(seed, { voice = null } = {}) {
  const bus = createBus();
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_tethys_junction';
  state.playerId = 1;
  state.nextEntityId = 500;
  const log = [];
  for (const name of [
    'survivorPod:ejected', 'survivorPod:huntDispatched', 'survivorPod:huntEnded',
    'survivorPod:captured', 'survivorPod:resolved', 'survivorPod:rescued', 'survivorPod:heatCooled',
    'heat:changed', 'toast',
  ]) bus.on(name, (payload) => log.push({ name, payload }));

  const barks = [];
  const helpers = voice ? { voice: { say: (row) => barks.push(row) } } : {};

  function add(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }
  const player = add({
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 100,
    hull: 200, hullMax: 200, data: {}, flags: {},
  });
  state.player.tether = { active: false, targetId: null };

  survivorPod.init({ state, bus, helpers });
  heat.init({ state, bus });

  function pirate({ id, x, z, hull, hullMax = 100, factionId = 'faction_reach', extraAi = {} }) {
    return add({
      id, type: 'ship', team: 1, factionId, alive: true,
      pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 80,
      hull, hullMax, data: {
        ai: {
          archetype: 'pirate_raider',
          roe: 'weapons_free',
          forcePlayerTarget: true,
          activity: { kind: 'attack_run', reason: 'raid:attack:raider', targetId: player.id },
          ...extraAi,
        },
        combat: { targetId: player.id, lockTarget: player.id },
        intent: { moveX: 0, moveZ: 0, fire: true, fireGroup: 0 },
      },
      flags: {},
    });
  }

  function victim(id, { x = 400, z = 0, factionId = 'faction_mts' } = {}) {
    return add({
      id, type: 'ship', team: 2, factionId, alive: true,
      pos: { x, z }, vel: { x: 2, z: 1 }, rot: 0, radius: 14, mass: 160,
      hull: 0, hullMax: 100,
      data: { trafficRole: 'hauler', role: 'hauler', ai: { archetype: 'mule_trader', passive: true } },
      flags: {},
    });
  }

  /** Force an eject (roll-independent) the way _onEntityKilled would. */
  function eject(victimEntity) {
    return survivorPod._spawnCausalPod(state, victimEntity, { pos: victimEntity.pos, vel: victimEntity.vel });
  }

  function step(n = 1) {
    for (let i = 0; i < n; i++) {
      state.tick += 1;
      state.simTime += DT;
      survivorPod.update(DT, state);
    }
  }

  const count = (name) => log.filter((row) => row.name === name).length;
  const rows = (name) => log.filter((row) => row.name === name).map((row) => row.payload);
  return { state, bus, player, add, pirate, victim, eject, step, log, barks, count, rows, helpers };
}

function teardown(h) {
  survivorPod.destroy();
}

// ── C7 ────────────────────────────────────────────────────────────────────────────────────────

for (const seed of SEEDS) {
  test(`C7 [${seed}] a damaged pirate breaks off the player to go after the ejected pod`, () => {
    const h = boot(seed);
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      const pod = h.eject(h.victim(30));
      assert.ok(isCausalSurvivorPod(pod), 'a causal pod ejected');

      const dispatched = h.rows('survivorPod:huntDispatched');
      assert.equal(dispatched.length, 1);
      assert.equal(dispatched[0].hunterId, raider.id);
      assert.equal(dispatched[0].entityId, pod.id);

      const ai = raider.data.ai;
      assert.equal(ai.activity.kind, 'transit', 'steers onto the pod');
      assert.equal(ai.activity.reason, 'pod_hunt:capture');
      assert.equal(ai.activity.targetId, pod.id);
      assert.equal(ai.roe, 'hold_fire', 'holds fire for the errand');
      assert.equal(ai.forcePlayerTarget, false, 'aggro on the player drops');
      assert.equal(raider.data.combat.targetId, null);
      assert.equal(raider.data.combat.lockTarget, null);
      assert.equal(raider.data.intent.fire, false);
      assert.ok(ai.podHunt && ai.podHunt.podId === pod.id);
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] a healthy pirate keeps pressing the player`, () => {
    const h = boot(seed);
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, hull: 90 });
      const before = JSON.stringify(raider.data);
      h.eject(h.victim(30));
      h.step(120);
      assert.equal(h.count('survivorPod:huntDispatched'), 0);
      assert.equal(JSON.stringify(raider.data), before, 'untouched');
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] a pirate never ransoms its own crew's pod, and a far pirate ignores any pod`, () => {
    const h = boot(seed);
    try {
      h.pirate({ id: 21, x: 260, z: 40, hull: 30, factionId: 'faction_reach' });   // own crew's pod
      h.pirate({ id: 22, x: 4000, z: 0, hull: 30 });                              // out of reach
      h.eject(h.victim(30, { factionId: 'faction_reach' }));
      h.step(60);
      assert.equal(h.count('survivorPod:huntDispatched'), 0);
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] capture: one receipt, pod gone, one plain-words bark, then the pirate leaves and resumes`, () => {
    const h = boot(seed, { voice: true });
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      const pod = h.eject(h.victim(30));
      h.barks.length = 0;

      // Bring the hull to the pod (steering is the AI stack's job; the rule owns the contact).
      raider.pos = { x: pod.pos.x + 8, z: pod.pos.z };
      h.step(2);

      const captured = h.rows('survivorPod:captured');
      assert.equal(captured.length, 1, 'exactly one capture receipt');
      assert.equal(captured[0].outcome, 'captured');
      assert.equal(captured[0].reason, 'pirate_capture');
      assert.equal(captured[0].captorId, raider.id);
      assert.equal(captured[0].entityId, pod.id);
      assert.equal(h.count('survivorPod:resolved'), 1);
      assert.equal(pod.alive, false, 'pod removed');
      assert.equal(h.state.entities.has(pod.id), false);

      assert.equal(h.barks.length, 1, 'one bark through the voice channel');
      assert.equal(h.barks[0].channel, 'bark');
      assert.equal(h.barks[0].key, 'pirate_pod_hunt_capture');
      assert.ok(POD_HUNT_BARKS.pirate_pod_hunt_capture.faction_reach.includes(h.barks[0].text),
        'the line comes from the bark catalogue, in the hunter\'s faction voice');
      assert.equal(h.barks[0].factionId, 'faction_reach');
      assert.equal(h.barks[0].id, `podHunt:took:${pod.id}`);

      // Remembered as a seizure — a distinct cause from leaving the pod to drift.
      const debts = Object.values(h.state.story.moralMemory.debts);
      assert.equal(debts.length, 1);
      assert.equal(debts[0].cause, 'captured_survivors');
      assert.equal(debts[0].source, 'survivorPod:captured');

      // Seen as a seizure: the receipt paints a grapple latch from the captor to the pod's point.
      const painted = resolveAdditionalActionVfxReceipt('survivorPod:resolved', h.rows('survivorPod:resolved')[0], h.state);
      assert.ok(painted, 'captured paints');
      assert.equal(painted.kind, 'captured');
      assert.equal(painted.sourceId, raider.id);
      assert.equal(painted.targetId, null);
      assert.equal(painted.attachToTarget, false);
      assert.ok(painted.direction && Number.isFinite(painted.direction.x));
      const recipe = ADDITIONAL_ACTION_VFX_RECIPES['survivorPod:resolved'].variants.captured;
      assert.equal(recipe.verb, 'latch');
      assert.equal(recipe.primitive, 'connection');
      assert.notEqual(recipe.color, SURVIVOR_POD_RETIRE.abandoned.color);
      assert.notEqual(recipe.color, SURVIVOR_POD_RETIRE.ransomed.color);

      // Leaves with its prize: flee posture, still not pressing the player.
      assert.equal(raider.data.ai.activity.kind, 'flee');
      assert.equal(raider.data.ai.roe, 'hold_fire');
      assert.equal(raider.data.ai.forcePlayerTarget, false);

      // More ticks never re-capture, re-bark, or re-receipt.
      h.step(30);
      assert.equal(h.count('survivorPod:captured'), 1);
      assert.equal(h.barks.length, 1);

      // After the leave window the old posture comes back (resumes).
      h.state.simTime += POD_HUNT.leaveS + 1;
      h.step(1);
      assert.equal(raider.data.ai.activity.kind, 'attack_run');
      assert.equal(raider.data.ai.roe, 'weapons_free');
      assert.equal(raider.data.ai.forcePlayerTarget, true);
      assert.equal(raider.data.ai.podHunt, undefined);
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] without a voice mount the capture line surfaces as a toast`, () => {
    const h = boot(seed);
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      const pod = h.eject(h.victim(30));
      raider.pos = { x: pod.pos.x + 8, z: pod.pos.z };
      h.step(2);
      const toasts = h.rows('toast').filter((t) => t.kind === 'podHunt');
      assert.equal(toasts.length, 2, 'dispatch line + capture line');
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] duplicate survivorPod:ejected events never double-dispatch`, () => {
    const h = boot(seed);
    try {
      h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      h.pirate({ id: 22, x: 300, z: -40, hull: 25 });
      const pod = h.eject(h.victim(30));
      assert.equal(h.count('survivorPod:huntDispatched'), 1);
      const payload = h.rows('survivorPod:ejected')[0];
      for (let i = 0; i < 4; i++) h.bus.emit('survivorPod:ejected', { ...payload });
      h.step(120); // the catch-up scan finds the pod already claimed too
      assert.equal(h.count('survivorPod:huntDispatched'), 1);
      assert.equal(Object.keys(h.state.survivorPod.hunt.errands).length, 1);
      assert.equal(h.state.survivorPod.hunt.byPod[pod.id] != null, true);
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] the player's own wreck pod is never hunted`, () => {
    const h = boot(seed);
    try {
      h.pirate({ id: 21, x: 60, z: 40, hull: 30 });
      h.bus.emit('player:death', { pos: { x: 0, z: 0 } });
      h.step(60);
      assert.equal(h.count('survivorPod:huntDispatched'), 0);
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] sacrifice: a towed pod holds the pirate off capture; releasing it lets the pirate take it`, () => {
    const h = boot(seed);
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      const pod = h.eject(h.victim(30));
      raider.pos = { x: pod.pos.x + 8, z: pod.pos.z };
      h.state.player.tether = { active: true, targetId: pod.id };
      h.step(30);
      assert.equal(h.count('survivorPod:captured'), 0, 'cannot cut the player\'s tow');
      assert.equal(raider.data.ai.forcePlayerTarget, false, 'and it is still not pressing the player');
      assert.equal(raider.data.ai.roe, 'hold_fire');

      h.state.player.tether = { active: false, targetId: null }; // release the tow
      h.step(2);
      assert.equal(h.count('survivorPod:captured'), 1);
      assert.equal(raider.data.ai.activity.kind, 'flee');
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] a pirate that takes damage on the errand fights back; rescue before capture ends the errand`, () => {
    const h = boot(seed);
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      h.eject(h.victim(30));
      raider.hull -= 5; // the player shot it
      h.step(1);
      assert.equal(raider.data.ai.roe, 'weapons_free');
      assert.equal(raider.data.ai.forcePlayerTarget, true);
      assert.equal(raider.data.ai.activity.kind, 'attack_run');
      assert.equal(raider.data.ai.podHunt, undefined);
      assert.equal(h.rows('survivorPod:huntEnded')[0].reason, 'hunter_hit');
      // Cooldown: no instant re-peel.
      h.step(60);
      assert.equal(h.count('survivorPod:huntDispatched'), 1);

      // A second hull on a fresh pod; the pod is rescued out from under it.
      const raider2 = h.pirate({ id: 23, x: -260, z: 40, hull: 30 });
      const pod2 = h.eject(h.victim(31, { x: -400 }));
      assert.equal(raider2.data.ai.podHunt.podId, pod2.id);
      const own = h.state.survivorPod;
      survivorPod._resolveCausal(h.state, own, own.causal.byEntityId[pod2.id], pod2, 'rescued', {
        reason: 'station_delivery', stationId: 'x', authorityFactionId: 'faction_scn',
      });
      h.step(1);
      assert.equal(raider2.data.ai.podHunt, undefined);
      assert.equal(raider2.data.ai.roe, 'weapons_free');
      assert.equal(h.count('survivorPod:captured'), 0);
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] a wounded pirate that was healthy at eject is dispatched by the catch-up scan`, () => {
    const h = boot(seed);
    try {
      const raider = h.pirate({ id: 21, x: 260, z: 40, hull: 90 });
      h.eject(h.victim(30));
      assert.equal(h.count('survivorPod:huntDispatched'), 0);
      raider.hull = 35;
      h.step(POD_HUNT.scanEveryTicks * 2);
      assert.equal(h.count('survivorPod:huntDispatched'), 1);
      assert.equal(raider.data.ai.activity.reason, 'pod_hunt:capture');
    } finally { teardown(h); }
  });

  test(`C7 [${seed}] scenario-gated runs never hunt`, () => {
    const h = boot(seed);
    try {
      h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      const pod = h.eject(h.victim(30)); // pod exists (spawned before the gate flips)
      h.state.survivorPod.hunt = undefined;
      h.state.scenario = { active: { id: '47a' } };
      const before = h.count('survivorPod:huntDispatched');
      h.bus.emit('survivorPod:ejected', { entityId: pod.id, victimId: 30, factionId: 'faction_mts', source: 'causal_eject' });
      h.step(60);
      assert.equal(h.count('survivorPod:huntDispatched'), before);
    } finally { teardown(h); }
  });
}

test('C7 the hunt barks are catalogued and faction-voiced: one at dispatch, one at capture', () => {
  for (const key of ['pirate_pod_hunt_break', 'pirate_pod_hunt_capture']) {
    for (const [factionId, lines] of Object.entries(POD_HUNT_BARKS[key])) {
      assert.ok(lines.length >= 3, `${key}/${factionId} has variants`);
      for (const line of lines) assert.ok(line.length > 0 && !line.includes('!'), `${key}/${factionId}: ${line}`);
      assert.equal(podHuntBarkFor(key, factionId, 0), lines[0]);
    }
    assert.equal(podHuntBarkFor(key, 'faction_unknown', 0), POD_HUNT_BARKS[key].faction_reach[0]);
  }
  assert.equal(podHuntBarkFor('nope', 'faction_reach', 0), null);

  const h = boot(4242, { voice: true });
  try {
    const quiet = h.pirate({ id: 21, x: 260, z: 40, hull: 30, factionId: 'faction_quiet' });
    const pod = h.eject(h.victim(30));
    const hunt = () => h.barks.filter((b) => b.kind === 'podHunt');
    assert.equal(hunt().length, 1, 'one bark at dispatch');
    assert.equal(hunt()[0].key, 'pirate_pod_hunt_break');
    assert.equal(hunt()[0].factionId, 'faction_quiet');
    assert.ok(POD_HUNT_BARKS.pirate_pod_hunt_break.faction_quiet.includes(hunt()[0].text));
    quiet.pos = { x: pod.pos.x + 8, z: pod.pos.z };
    h.step(2);
    assert.equal(hunt().length, 2, 'one more at capture');
    assert.ok(POD_HUNT_BARKS.pirate_pod_hunt_capture.faction_quiet.includes(hunt()[1].text));
  } finally { teardown(h); }
});

test('C7 the dispatch is deterministic: same seed, same hunter, same line', () => {
  const run = (seed) => {
    const h = boot(seed, { voice: true });
    try {
      h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
      h.pirate({ id: 22, x: 330, z: 40, hull: 30 });
      h.pirate({ id: 23, x: 330, z: 40, hull: 30 });
      h.eject(h.victim(30));
      return { hunters: h.rows('survivorPod:huntDispatched').map((r) => r.hunterId), barks: h.barks.map((b) => b.text) };
    } finally { teardown(h); }
  };
  assert.deepEqual(run(4242), run(4242));
  assert.deepEqual(run(8008), run(8008));
  assert.equal(run(4242).hunters[0], 22, 'nearest hull wins, stable id breaks ties');
});

test('C7 a stale pod-hunt stamp riding a save is released on save:loaded', () => {
  const h = boot(4242);
  try {
    const raider = h.pirate({ id: 21, x: 260, z: 40, hull: 30 });
    raider.data.ai.podHunt = { podId: 999, phase: 'seek' };
    raider.data.ai.activity = { kind: 'transit', reason: 'pod_hunt:capture', targetId: 999 };
    raider.data.ai.roe = 'hold_fire';
    h.bus.emit('save:loaded', {});
    assert.equal(raider.data.ai.podHunt, undefined);
    assert.notEqual(raider.data.ai.roe, 'hold_fire');
    assert.equal(raider.data.ai.activity, undefined);
  } finally { teardown(h); }
});

// ── T10 half ──────────────────────────────────────────────────────────────────────────────────

function receipt(id, overrides = {}) {
  return {
    id: `survivor:${id}`,
    outcome: 'rescued',
    entityId: id,
    victimId: 9000 + id,
    factionId: 'faction_mts',
    reason: 'station_delivery',
    playerAnswered: true,
    t: 0,
    ...overrides,
  };
}

for (const seed of SEEDS) {
  test(`T10 [${seed}] rescuing a lawful pod cools heat one clear step, once per pod`, () => {
    const h = boot(seed);
    try {
      h.state.player.heat = 0.5;
      h.bus.emit('survivorPod:rescued', receipt(1));
      assert.ok(Math.abs(h.state.player.heat - (0.5 - RESCUE_COOL_PER_POD)) < 1e-9);
      assert.equal(h.count('survivorPod:heatCooled'), 1);
      const changed = h.rows('heat:changed').pop();
      assert.equal(changed.reason, 'rescued survivors');

      h.bus.emit('survivorPod:rescued', receipt(1)); // duplicate delivery of the same pod
      h.bus.emit('survivorPod:rescued', receipt(1, { t: 5 }));
      assert.ok(Math.abs(h.state.player.heat - (0.5 - RESCUE_COOL_PER_POD)) < 1e-9, 'never twice for one pod');
      assert.equal(h.count('survivorPod:heatCooled'), 1);
    } finally { teardown(h); }
  });

  test(`T10 [${seed}] never for a pirate-faction pod, the player's own pod, or an unattended rescue`, () => {
    const h = boot(seed);
    try {
      h.state.player.heat = 0.5;
      h.bus.emit('survivorPod:rescued', receipt(2, { factionId: 'faction_reach' }));
      h.bus.emit('survivorPod:rescued', receipt(3, { factionId: 'neutral' }));
      h.bus.emit('survivorPod:rescued', receipt(4, { playerWreck: true }));
      h.bus.emit('survivorPod:rescued', receipt(5, { victimId: h.state.playerId }));
      h.bus.emit('survivorPod:rescued', receipt(6, { playerAnswered: false, reason: 'rescue_hull' }));
      h.bus.emit('survivorPod:rescued', receipt(7, { playerAnswered: undefined }));
      h.bus.emit('survivorPod:rescued', receipt(8, { outcome: 'ransomed' }));
      assert.equal(h.state.player.heat, 0.5);
      assert.equal(h.count('survivorPod:heatCooled'), 0);
      // A refused pod is not "spent": the real rescue of the same pod id still counts.
      h.bus.emit('survivorPod:rescued', receipt(2));
      assert.ok(h.state.player.heat < 0.5);
    } finally { teardown(h); }
  });

  test(`T10 [${seed}] bounded per minute, floored at zero, no cooling when already clean`, () => {
    const h = boot(seed);
    try {
      h.state.player.heat = 0.9;
      h.state.simTime = 100;
      for (let id = 10; id < 16; id++) h.bus.emit('survivorPod:rescued', receipt(id));
      const cooledNow = 0.9 - h.state.player.heat;
      assert.ok(cooledNow <= RESCUE_COOL_MAX_PER_WINDOW + 1e-9, `cap holds (${cooledNow})`);
      assert.ok(cooledNow >= RESCUE_COOL_MAX_PER_WINDOW - 1e-9, 'and the cap is reached');

      h.state.simTime += RESCUE_COOL_WINDOW_S + 1; // the window rolls
      const before = h.state.player.heat;
      h.bus.emit('survivorPod:rescued', receipt(20));
      assert.ok(Math.abs(before - h.state.player.heat - RESCUE_COOL_PER_POD) < 1e-9);

      h.state.player.heat = 0.03;
      h.state.simTime += RESCUE_COOL_WINDOW_S + 1;
      h.bus.emit('survivorPod:rescued', receipt(21));
      assert.equal(h.state.player.heat, 0, 'never below zero');

      h.state.player.heat = 0;
      const emitted = h.count('heat:changed');
      h.state.simTime += RESCUE_COOL_WINDOW_S + 1;
      h.bus.emit('survivorPod:rescued', receipt(22));
      assert.equal(h.state.player.heat, 0);
      assert.equal(h.count('heat:changed'), emitted, 'no phantom heat change at zero');
    } finally { teardown(h); }
  });

  test(`T10 [${seed}] end to end: a player-towed rescue of a lawful pod signs the receipt heat reads`, () => {
    const h = boot(seed);
    try {
      h.state.player.heat = 0.4;
      const pod = h.eject(h.victim(30, { factionId: 'faction_mts' }));
      const own = h.state.survivorPod;
      const ok = survivorPod._resolveCausal(h.state, own, own.causal.byEntityId[pod.id], pod, 'rescued', {
        reason: 'station_delivery', stationId: 'st', authorityFactionId: 'faction_scn',
      });
      assert.equal(ok, true);
      const signed = h.rows('survivorPod:rescued')[0];
      assert.equal(signed.factionId, 'faction_mts');
      assert.equal(signed.playerAnswered, true);
      assert.ok(Math.abs(h.state.player.heat - (0.4 - RESCUE_COOL_PER_POD)) < 1e-9);
    } finally { teardown(h); }
  });

  test(`T10 [${seed}] an unattended rescue-hull claim of a lawful pod does not cool the player`, () => {
    const h = boot(seed);
    try {
      h.state.player.heat = 0.4;
      const pod = h.eject(h.victim(30, { factionId: 'faction_mts' }));
      const own = h.state.survivorPod;
      survivorPod._resolveCausal(h.state, own, own.causal.byEntityId[pod.id], pod, 'rescued', {
        reason: 'rescue_hull', rescueHullId: 77,
      });
      assert.equal(h.rows('survivorPod:rescued')[0].playerAnswered, undefined);
      assert.equal(h.state.player.heat, 0.4);
    } finally { teardown(h); }
  });
}
