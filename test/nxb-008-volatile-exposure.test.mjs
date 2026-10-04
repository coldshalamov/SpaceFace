// NXB-008 — Recover a volatile load by managing its physical exposure, not a scripted timer.
//
// Board row: build_map §1C H row 199. Packet: design/program/next-wave-2026-09-28/build/NXB-008.md.
//
// Proves, on a fixed seed, that the volatile load's state changes are driven by EXPOSURE FACTS
// reaching the body (mechanical shock, heat) and never by elapsed time alone:
//   1. a carried-steady load stays stable for the whole run (no hidden countdown),
//   2. repeated shocks accumulate exposure and vent a recoverable fraction as a real pod,
//   3. a sheltered (shock-free, heat-free) leg soaks the exposure back down — the cool route,
//   4. burning adjacency heats the lot; heat outside the radius does not,
//   5. the exposure record survives tow snap, deliberate cut, and a save-shaped data roundtrip
//      (relatching/saving never cools or heals for free),
//   6. continued abuse after a vent ruptures the remainder through the ORDINARY damage owner,
//   7. no rupture cue for a rejected damage packet (NXI-030 law),
//   8. inert freight never gains a record; a nearby slam heats a neighbouring lot (chain fact),
//   9. an imperfect recovery still yields usable freight (vent leaves most of the lot).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE, lootShards } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import {
  EXPOSURE_TICKS,
  SHOCK_COOLDOWN_S,
  VENT_KICK_WU_S,
  volatileExposure,
  volatileExposureReadout,
} from '../src/systems/volatileExposure.js';
import { ensureCombatant } from '../src/combat/runtime.js';

const EXPLOSIVE_ID = 'cmdty_fuel_cells';
const INERT_ID = 'cmdty_ore_iron';
const SEED = 80_808;

function shipSpec(extra = {}) {
  return {
    type: 'ship',
    team: extra.team != null ? extra.team : 0,
    pos: extra.pos || { x: 0, z: 0 },
    vel: extra.vel || { x: 0, z: 0 },
    rot: extra.rot || 0,
    angVel: 0,
    radius: extra.radius || 12,
    mass: extra.mass || 16,
    hull: extra.hull != null ? extra.hull : 80,
    hullMax: extra.hullMax != null ? extra.hullMax : 80,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    collides: true,
    flags: extra.flags || {},
    physicsBody: {
      schemaVersion: 1,
      radius: extra.radius || 12,
      mass: extra.mass || 16,
      inertiaY: 40,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: { defId: extra.defId || 'ship_wasp', combatProfileId: 'combat_profile_standard_ship' },
  };
}

function findPods(state, commodityId = null) {
  return (state.entityList || []).filter((e) => e
    && e.alive !== false
    && e.type === 'payload'
    && e.data
    && e.data.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE
    && (commodityId == null || e.data.commodityId === commodityId));
}

function boot(seed = SEED, extraSystems = []) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: [cargo, lootShards, combat, physics, volatileExposure, ...extraSystems] });
  const { state, helpers } = sim;
  state.mode = 'flight';
  const player = sim.spawn(shipSpec({ defId: 'ship_kestrel', hull: 120, hullMax: 120, mass: 18 }));
  state.playerId = player.id;
  state.player.cargo.capVolume = 400;
  state.player.cargo.capMass = 400;
  const events = { vents: [], ruptures: [], exposed: [] };
  bus.on('cargo:volatileVent', (p) => events.vents.push(p));
  bus.on('cargo:volatileRupture', (p) => events.ruptures.push(p));
  bus.on('cargo:volatileExposed', (p) => events.exposed.push(p));
  return {
    sim,
    state,
    helpers,
    bus,
    player,
    events,
    cargoSys: sim.registry.get('cargo'),
    exposureSys: sim.registry.get('volatileExposure'),
    combatSys: sim.registry.get('combat'),
    cleanup() {
      const physicsSys = sim.registry.get('physics');
      if (physicsSys && typeof physicsSys._disableSg02DynamicAuthority === 'function') {
        physicsSys._disableSg02DynamicAuthority();
      }
      sim.dispose();
    },
  };
}

function jettisonPod(t, commodityId, amount = 12) {
  const knownIds = new Set(findPods(t.state).map((p) => p.id));
  assert.equal(addCargo(t.state, commodityId, amount), amount);
  assert.equal(t.cargoSys.jettison(commodityId, amount), amount);
  const fresh = findPods(t.state, commodityId).filter((p) => !knownIds.has(p.id));
  assert.equal(fresh.length, 1, `one new ${commodityId} pod`);
  return fresh[0];
}

/** Sim ticks that clear the same-pod shock cooldown (0.35 s at the 60 Hz fixed step). */
const COOLDOWN_TICKS = Math.ceil(SHOCK_COOLDOWN_S * 60) + 1;

function loadOf(pod) {
  const rec = pod.data.volatileExposure;
  return rec ? rec.load : 0;
}

function ventsOf(t, pod) { return t.events.vents.filter((v) => v.podId === pod.id); }
function rupturesOf(t, pod) { return t.events.ruptures.filter((r) => r.podId === pod.id); }

/** One glancing shock (below lootShards' 12 WU/s slam bar) on the pod, spaced past the cooldown. */
function glancingShock(t, pod, closing = 8) {
  for (let i = 0; i < COOLDOWN_TICKS; i++) t.sim.step();
  t.bus.emit('physics:impact', {
    aId: pod.id,
    bId: t.player.id,
    preSolveClosingSpeed: closing,
    dp: 30,
    pos: { x: pod.pos.x, z: pod.pos.z },
    tick: t.state.tick,
  });
}

/** One slam-bar shock that lootShards cannot cook off (no neighbour in its blast radius). */
function hardShock(t, pod) {
  for (let i = 0; i < COOLDOWN_TICKS; i++) t.sim.step();
  t.bus.emit('physics:impact', {
    aId: pod.id,
    bId: t.player.id,
    preSolveClosingSpeed: 22,
    dp: 240,
    pos: { x: pod.pos.x, z: pod.pos.z },
    tick: t.state.tick,
  });
}

test('carried-steady volatile load stays stable — no hidden countdown', () => {
  const t = boot();
  try {
    const pod = jettisonPod(t, EXPLOSIVE_ID, 12);
    // Ten full seconds of fixed-step sim with zero facts.
    for (let i = 0; i < 600; i++) t.sim.step();
    assert.equal(loadOf(pod), 0, 'time alone never moves the load');
    assert.equal(pod.data.amount, 12, 'time alone never sheds units');
    assert.equal(t.events.vents.length, 0);
    assert.equal(t.events.ruptures.length, 0);
    assert.ok(!pod.data.volatileDetonated);
  } finally { t.cleanup(); }
});

test('glancing shocks accumulate exposure and vent a recoverable fraction as a real pod', () => {
  const t = boot();
  try {
    const pod = jettisonPod(t, EXPLOSIVE_ID, 12);
    const loadAfterOne = (() => { glancingShock(t, pod); return loadOf(pod); })();
    assert.ok(loadAfterOne > 0, 'a real shock raises the exposure');
    assert.ok(loadAfterOne < 0.5, 'a glancing shock alone is not the vent');

    // Keep knocking it about: the record climbs by shocks, not by ticks in between.
    for (let i = 0; i < 8 && ventsOf(t, pod).length === 0; i++) glancingShock(t, pod);
    assert.equal(ventsOf(t, pod).length, 1, 'exposure crossing the threshold vents once');
    assert.equal(rupturesOf(t, pod).length, 0, 'a first vent is not a rupture');

    const vent = t.events.vents[0];
    assert.ok(vent.ventedQty >= 1 && vent.ventedQty < 12, 'a fraction boiled off');
    assert.equal(vent.remainingQty, 12 - vent.ventedQty, 'parent keeps the usable remainder');
    assert.equal(pod.data.amount, 12 - vent.ventedQty, 'the pod body carries the remainder');

    const ventedPods = findPods(t.state, EXPLOSIVE_ID);
    assert.equal(ventedPods.length, 2, 'the vent is a real physical pod, not a ledger write');
    const child = ventedPods.find((p) => p.id !== pod.id);
    assert.ok(child, 'the vented pod exists');
    assert.equal(child.data.amount, vent.ventedQty);
    assert.equal(child.data.commodityId, EXPLOSIVE_ID, 'identity rides the vent');
    assert.equal(child.flags.persistent, true, 'the vented pod is persistent freight');
    const dist = Math.hypot(child.pos.x - pod.pos.x, child.pos.z - pod.pos.z);
    assert.ok(dist > 1, 'the vent physically separates from the parent');
    const childSpeed = Math.hypot(child.vel.x - pod.vel.x, child.vel.z - pod.vel.z);
    assert.ok(childSpeed > 1 && childSpeed <= VENT_KICK_WU_S + 1, 'the vent jets away deterministically');
    assert.ok(loadOf(child) > 0, 'the boiled-off lot inherits part of the destabilization');
    assert.ok(loadOf(child) < 1, 'the vented lot is not itself at the threshold');
    assert.ok(loadOf(pod) < 0.5, 'venting relieves the parent below the threshold');

    const row = volatileExposureReadout(t.state).find((r) => r.podId === pod.id);
    assert.ok(row, 'readout names the carried load');
    assert.equal(row.amount, 12 - vent.ventedQty);
    assert.ok(['stable', 'warming'].includes(row.stage), 'condition words never promise a countdown');
  } finally { t.cleanup(); }
});

test('the sheltered continuation: an untouched leg soaks exposure back down', () => {
  const t = boot();
  try {
    const pod = jettisonPod(t, EXPLOSIVE_ID, 12);
    for (let i = 0; i < 3; i++) glancingShock(t, pod);
    const shaken = loadOf(pod);
    assert.ok(shaken > 0.3, 'three glancing knocks genuinely destabilize');
    assert.equal(t.events.vents.length, 0);

    // The cool route: no shock, no heat — the same fixed step that was harmless in both
    // directions now only ever lowers the load.
    let previous = shaken;
    for (let i = 0; i < 60; i++) {
      for (let j = 0; j < EXPOSURE_TICKS; j++) t.sim.step();
      const now = loadOf(pod);
      assert.ok(now <= previous + 1e-9, 'cooling never reverses while the facts stay absent');
      previous = now;
    }
    assert.ok(previous < shaken * 0.5, 'a sheltered leg walks the load back down');
    assert.equal(t.events.vents.length, 0, 'gentle handling never vents the lot');
    assert.equal(pod.data.amount, 12, 'gentle handling never sheds units');
  } finally { t.cleanup(); }
});

test('burning adjacency heats the lot; a cold body at the same distance does not', () => {
  const t = boot();
  try {
    const kernel = t.combatSys.ensureKernel ? t.combatSys.ensureKernel() : t.combatSys.kernel;
    assert.ok(kernel && kernel.statuses, 'combat kernel with statuses is available');

    const hotPod = jettisonPod(t, EXPLOSIVE_ID, 10);
    const burning = t.sim.spawn(shipSpec({ team: 1, pos: { x: hotPod.pos.x + 40, z: hotPod.pos.z } }));
    // Seed the burning FACT the kernel owns. (The focused harness does not drive the kernel's
    // prePhysics status-advance loop — the physics owner does that in production; this test's
    // question is whether the exposure system reads the fact, which it does read-only.)
    const burningRuntime = ensureCombatant(t.state, burning, kernel.catalog);
    burningRuntime.statuses.status_burning = {
      id: 'status_burning',
      stacks: 2,
      appliedTick: t.state.tick,
      expiresTick: t.state.tick + 1200,
      nextPeriodicTick: null,
      attackerId: null,
      actionId: 'test_fire',
    };
    for (let i = 0; i < 420; i++) t.sim.step();
    assert.equal(ventsOf(t, hotPod).length, 1, 'sustained burning adjacency drives the lot to vent');
    assert.ok(t.events.exposed.some((e) => e.cause === 'fire'), 'the readout names heat as the cause');

    // Contrast: an identical pod beside an UNBURNT hull at the same range never heats. The
    // burning wreck is dragged out of reach first so the cold pod's world is genuinely cold.
    burning.pos.x += 5000;
    burning.pos.z += 5000;
    const coldPod = jettisonPod(t, EXPLOSIVE_ID, 10);
    t.sim.spawn(shipSpec({ team: 1, pos: { x: coldPod.pos.x + 40, z: coldPod.pos.z } }));
    const before = loadOf(coldPod);
    for (let i = 0; i < 420; i++) t.sim.step();
    assert.ok(loadOf(coldPod) <= before + 1e-9, 'a cold body adds nothing');
    assert.equal(loadOf(coldPod), 0, 'proximity alone is not exposure');
  } finally { t.cleanup(); }
});

test('exposure survives a line snap, a deliberate cut, and a save-shaped roundtrip', () => {
  const t = boot();
  try {
    const pod = jettisonPod(t, EXPLOSIVE_ID, 12);
    for (let i = 0; i < 2; i++) glancingShock(t, pod);
    const shaken = loadOf(pod);
    assert.ok(shaken > 0.2);

    // Overload snap ('physics_break') dumps strain into the towed load; a deliberate cut never does.
    for (let i = 0; i < COOLDOWN_TICKS; i++) t.sim.step();
    t.bus.emit('tether:broken', { targetId: pod.id, reason: 'physics_break', tension: 90 });
    const afterSnap = loadOf(pod);
    assert.ok(afterSnap > shaken, 'the snap is a real shock to the load');
    t.sim.step();
    t.bus.emit('tether:broken', { targetId: pod.id, reason: 'tether_cut' });
    assert.equal(loadOf(pod), afterSnap, 'a deliberate cut never punishes the load');
    t.sim.step();
    t.bus.emit('tether:broken', { targetId: pod.id, reason: 'accepted' });
    assert.equal(loadOf(pod), afterSnap, 'a handover release never punishes the load');

    // Save-shaped roundtrip: the record is plain data on the persistent body — a save that
    // serializes pod data must not cool or heal the lot for free.
    const clone = JSON.parse(JSON.stringify(pod.data));
    assert.equal(clone.volatileExposure.load, afterSnap, 'the record serializes');
    pod.data = clone;
    assert.equal(loadOf(pod), afterSnap, 'the restored load is the saved load');

    // Re-latching (cut + re-latch) is data-preserving by construction; the record keeps climbing
    // from where it was, proving no reset happened across the roundtrip.
    glancingShock(t, pod);
    assert.ok(loadOf(pod) > afterSnap, 'exposure continues accumulating after the roundtrip');
  } finally { t.cleanup(); }
});

test('continued abuse after a vent ruptures the remainder through the ordinary damage owner', () => {
  const t = boot();
  try {
    const pod = jettisonPod(t, EXPLOSIVE_ID, 12);
    for (let i = 0; i < 12 && ventsOf(t, pod).length === 0; i++) glancingShock(t, pod);
    assert.equal(ventsOf(t, pod).length, 1, 'first threshold: usable freight survives (acceptance 3)');
    assert.ok(pod.data.amount >= 1, 'the parent still carries usable units after the vent');

    // An imperfect recovery is already a valid outcome — but the player keeps abusing the load.
    for (let i = 0; i < 12 && rupturesOf(t, pod).length === 0; i++) hardShock(t, pod);
    assert.equal(rupturesOf(t, pod).length, 1, 'continued abuse cooks the remainder off');
    assert.equal(pod.alive, false, 'the rupture routes through the damage owner and kills the body');
    assert.equal(pod.data.volatileDetonated, true, 'lootShards\' slam will not double-play');
    const rupture = rupturesOf(t, pod)[0];
    assert.equal(rupture.destroyedQty, pod.data.amount, 'the rupture names the destroyed fraction');
    assert.ok(ventsOf(t, pod).length === 1, 'the earlier vent is not rewritten retroactively');
  } finally { t.cleanup(); }
});

test('a rejected damage packet never emits a rupture cue (NXI-030)', () => {
  const t = boot();
  try {
    const pod = jettisonPod(t, EXPLOSIVE_ID, 12);
    pod.flags.invuln = true; // the router will reject the rupture packet
    for (let i = 0; i < 12; i++) glancingShock(t, pod);
    assert.equal(rupturesOf(t, pod).length, 0, 'no rupture cue for a rejected packet');
    assert.equal(pod.alive !== false, true, 'the rejected packet does not destroy the pod');
    assert.ok(!pod.data.volatileDetonated, 'the body is not marked detonated');
    const rec = pod.data.volatileExposure;
    assert.ok(rec.load < 1, 'the load parks under the bar and stays retryable');

    // Clearing the refusal lets the same accumulated abuse finish the job on the next real shock.
    pod.flags.invuln = false;
    glancingShock(t, pod);
    assert.equal(rupturesOf(t, pod).length, 1, 'the retryable load escalates on the next real shock');
    assert.equal(pod.alive, false, 'the accepted packet kills the body through the damage owner');
  } finally { t.cleanup(); }
});

test('inert freight never gains a record; a nearby slam heats a neighbouring volatile lot', () => {
  const t = boot();
  try {
    const inert = jettisonPod(t, INERT_ID, 12);
    for (let i = 0; i < 6; i++) hardShock(t, inert);
    assert.equal(inert.data.volatileExposure, undefined, 'ordinary freight is not marked volatile');
    assert.equal(inert.data.amount, 12, 'ordinary freight sheds nothing');
    assert.equal(t.events.vents.length, 0);
    assert.ok(volatileExposureReadout(t.state).length === 0, 'the readout lists volatile loads only');

    // Chain fact: one lot cooking off heats its neighbour — event-driven, positional.
    const neighbour = jettisonPod(t, EXPLOSIVE_ID, 6);
    const slamSource = jettisonPod(t, EXPLOSIVE_ID, 8);
    slamSource.pos.x = neighbour.pos.x + 40;
    slamSource.pos.z = neighbour.pos.z;
    const before = loadOf(neighbour);
    t.bus.emit('cargo:volatileSlam', { podId: slamSource.id, appliedImpulse: 500, class: 'explosive' });
    const after = loadOf(neighbour);
    assert.ok(after > before, 'the neighbouring lot is heated by the slam');
    assert.ok(after < 1, 'chain heat alone does not instantly vent the lot');
    const sourceRec = slamSource.data.volatileExposure;
    assert.ok(!sourceRec || sourceRec.load <= before + 1e-9, 'the detonating pod is not self-heated');
  } finally { t.cleanup(); }
});

test('shock cooldown: a sustained crush cannot pump the record every tick', () => {
  const t = boot();
  try {
    const pod = jettisonPod(t, EXPLOSIVE_ID, 30);
    const emit = () => t.bus.emit('physics:impact', {
      aId: pod.id,
      bId: t.player.id,
      preSolveClosingSpeed: 8,
      dp: 30,
      pos: { x: pod.pos.x, z: pod.pos.z },
      tick: t.state.tick,
    });
    emit();
    const first = loadOf(pod);
    emit(); emit(); emit(); // same tick burst: only the first counts
    t.sim.step();
    assert.ok(loadOf(pod) <= first + 1e-9, 'burst contacts inside one cooldown window collapse to one shock');
    assert.ok(loadOf(pod) > 0);
    for (let i = 0; i < Math.ceil(SHOCK_COOLDOWN_S * 60); i++) t.sim.step();
    emit();
    assert.ok(loadOf(pod) > first, 'a contact after the cooldown counts again');
  } finally { t.cleanup(); }
});

test('scooping the vented lot credits exactly the surviving freight — never the pre-vent quantity', () => {
  const t = boot(SEED, [mining]);
  try {
    const teleportAway = (pod) => {
      pod.pos.x += 600;
      pod.pos.z += 600;
      if (pod.prevPos) { pod.prevPos.x = pod.pos.x; pod.prevPos.z = pod.pos.z; }
      if (pod.physicsBody && typeof pod.physicsBody === 'object') {
        pod.physicsBody = { ...pod.physicsBody, revision: (pod.physicsBody.revision || 0) + 1 };
      }
    };
    const pod = jettisonPod(t, EXPLOSIVE_ID, 12);
    // Mining sweeps and collects payloads that overlap the hull — run the exposure phase out of reach.
    teleportAway(pod);
    for (let i = 0; i < 12 && ventsOf(t, pod).length === 0; i++) glancingShock(t, pod);
    assert.equal(ventsOf(t, pod).length, 1, 'the lot vents first');
    const remaining = pod.data.amount;
    assert.equal(remaining, 9, 'the parent keeps the usable remainder (12 - 3 vented)');

    // The scoop path drains data.salvagePool FIRST for payload bodies — the vent must have kept
    // it consistent with the visible load, or scooping the parent would credit the FULL lot.
    assert.equal(pod.data.salvagePool[EXPLOSIVE_ID], remaining, 'pool agrees with the visible load');

    const child = findPods(t.state, EXPLOSIVE_ID).find((p) => p.alive !== false && p.id !== pod.id);
    assert.ok(child, 'the vented child is still claimable freight');
    const mined = t.sim.registry.get('mining');
    const holdBefore = t.state.player.cargo.items[EXPLOSIVE_ID] || 0;
    assert.equal(mined._collectPayload(pod, t.player), true, 'the parent scoops');
    const afterParent = (t.state.player.cargo.items[EXPLOSIVE_ID] || 0) - holdBefore;
    assert.equal(afterParent, remaining, 'the parent credits exactly its remaining load — no duplication');
    assert.equal(pod.alive, false, 'the drained pod leaves the world through the ordinary owner');
    assert.equal(mined._collectPayload(child, t.player), true, 'the child scoops');
    const total = (t.state.player.cargo.items[EXPLOSIVE_ID] || 0) - holdBefore;
    assert.equal(total, 12, 'parent + child total the original lot exactly');
  } finally { t.cleanup(); }
});
