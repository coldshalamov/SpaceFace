// CR situation 1200 — THE WEDGE. Spilled ore pods jam a refinery feed lane with three haulers
// waiting behind. Bodies move only through the real SG-02 Rapier authority (bootRealPath): pods
// shoved out the side, one fuel rack slammed into the pile (the ordinary lootShards explosive
// blast), and the pile shoved down the lane into the queue each resolve from the world's reading.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { createMasslineInputGrammar } from '../src/systems/masslineInputGrammar.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lootShards } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable, tetherGameplay } from '../src/systems/tetherGameplay.js';
import { WEDGE, podBlocksLane } from '../src/data/encounters/1200-the-wedge.js';

const SEED = 4242;
const SECTOR = 'sector_vesta_forge';
const ANCHOR = Object.freeze({ x: 7000, z: -6000 });
const SHAPE = 'the_wedge';

async function boot(extraSystems = []) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, lootShards, 'collisionConsequences', 'physics', combat, ...extraSystems],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: ANCHOR.x + 150, z: ANCHOR.z + 150 }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of ['encounter:resolved', 'economy:grantCredits', 'faction:repDelta', 'cargo:volatileSlam', 'news:publish']) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  const director = host.runtime.getSystem('encounterDirector');
  const res = director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_wedge', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'refinery_approach', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  const live = Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  const w = live.data.wedge;
  host.step(4);
  const ent = (id) => state.entities.get(id);
  host.assertBodies([...w.podIds, ...w.rackIds, ...w.haulerIds].map(ent), 'wedge bodies');
  return { host, state, director, live, w, events, ent };
}

// Public Massline tape: the same grammar → actions mapping input.js performs for a held tether key,
// plus throttle/yaw written through the ordinary input packet. No impulse is queued by the test.
function masslineTape(h) {
  const grammar = createMasslineInputGrammar();
  const player = () => h.state.entities.get(h.state.playerId);
  return function frame({ held = false, toward = null, arrive = null, match = null, haul = null, brake = false, throttle = 1 }) {
    const st = h.state, p = player();
    let turnIntent = 0, moveZ = 0;
    if (arrive) {
      // A pilot's arrival: aim the nose at the velocity error, burn while aligned, brake when hot.
      const dx = arrive.x - p.pos.x, dz = arrive.z - p.pos.z, gap = Math.hypot(dx, dz) || 1;
      const want = Math.min(60, gap * 0.6);
      const mv = match ? match.vel : { x: 0, z: 0 };
      const ex = dx / gap * want + mv.x - p.vel.x, ez = dz / gap * want + mv.z - p.vel.z;
      const speed = Math.hypot(p.vel.x - mv.x, p.vel.z - mv.z);
      brake = speed > want + 6;
      if (Math.hypot(ex, ez) > 2) toward = { x: p.pos.x + ex, z: p.pos.z + ez };
      throttle = Math.min(1, Math.hypot(ex, ez) / 20);
    }
    if (toward) {
      const want = Math.atan2(toward.z - p.pos.z, toward.x - p.pos.x);
      const err = Math.atan2(Math.sin(want - p.rot), Math.cos(want - p.rot));
      turnIntent = Math.max(-1, Math.min(1, err * 3));
      moveZ = Math.abs(err) < 0.5 && !brake ? throttle : 0;
    }
    if (haul) {
      // Hauling on a live line: yaw onto the pull with the throttle off, then burn dead straight.
      // Thrust while yawing is the orbit assist's gesture (it swings round the load instead).
      const want = Math.atan2(haul.z - p.pos.z, haul.x - p.pos.x);
      const err = Math.atan2(Math.sin(want - p.rot), Math.cos(want - p.rot));
      turnIntent = Math.abs(err) > 0.12 ? Math.max(-1, Math.min(1, err * 3)) : 0;
      moveZ = turnIntent === 0 ? throttle : 0;
    }
    writeRealPathInput(st, { moveZ, turnIntent, brake });
    st.input.tetherMode = 'nearest';
    const attached = !!(st.player && st.player.tether && st.player.tether.active);
    const cmd = grammar.step(1 / 60, { attached, held, lineLength: 0, orbitDirection: 0, pump: false, source: held ? 'keyboard' : null });
    st.input.actions.massline = { ...cmd };
    st.input.actions.tetherFire = cmd.latch;
    st.input.actions.tetherCut = cmd.cut;
    st.input.actions.reelDelta = 0;
  };
}

const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const grants = (h) => h.events.filter((e) => e.name === 'economy:grantCredits').map((e) => e.p.amount);
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];
const kick = (h, e, dir, speed, kind = 'contact') => h.host.withFeatures(() => queuePhysicsImpulse(e,
  { x: dir.x * e.mass * speed, y: 0, z: dir.z * e.mass * speed }, { provenance: 'test_contact', tick: h.state.tick, kind }));
const runUntilResolved = (h, maxTicks) => h.host.step(maxTicks, { after: () => outcomes(h).length === 0 });

test('the wedge is registered for ordinary refinery approaches outside Helios', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.deepEqual([...enc.zoneTypes], ['refinery_approach']);
  assert.ok(enc.gates.sectorIds.includes(SECTOR));
  assert.ok(!enc.gates.sectorIds.some((id) => /helios/.test(id)));
});

test('one look: a jam of latchable ore pods, a waiting queue, loose fuel racks', async () => {
  const h = await boot();
  try {
    assert.equal(h.w.podIds.length, WEDGE.pods);
    for (const id of h.w.podIds) {
      const pod = h.ent(id);
      assert.ok(podBlocksLane(h.w, pod), 'every pod starts in the throat');
      assert.ok(isAttachable(pod, h.state.playerId, h.state), 'the Massline can take each pod');
    }
    for (const id of h.w.rackIds) assert.equal(h.ent(id).data.commodityId, 'cmdty_fuel_cells');
    assert.equal(h.w.haulerIds.length, 3);
    h.host.step(120);
    assert.deepEqual(outcomes(h), [], 'nothing resolves on its own');
  } finally { h.host.dispose(); }
});

test('shoving the pods out the side of the lane opens it and pays', async () => {
  const h = await boot();
  try {
    const side = { x: -h.w.lane.z, z: h.w.lane.x };
    for (const id of h.w.podIds) {
      const pod = h.ent(id);
      const s = Math.sign((pod.pos.x - h.w.throat.x) * side.x + (pod.pos.z - h.w.throat.z) * side.z) || 1;
      kick(h, pod, { x: side.x * s, z: side.z * s }, 30);
    }
    runUntilResolved(h, 20 * 60);
    assert.deepEqual(outcomes(h), ['cleared']);
    assert.deepEqual(grants(h), [WEDGE.pay]);
    assert.equal(memory(h).facts.via, 'shove');
  } finally { h.host.dispose(); }
});

test('one fuel rack slammed into the pile cooks off and blows the whole lane clear', async () => {
  const h = await boot();
  try {
    // The rack on the -side is thrown across the lane into the pile; the blast pushes away from it.
    const rack = h.ent(h.w.rackIds[1]);
    const pile = h.w.podIds.map(h.ent).reduce((best, p) => (!best || Math.hypot(p.pos.x - rack.pos.x, p.pos.z - rack.pos.z) < Math.hypot(best.pos.x - rack.pos.x, best.pos.z - rack.pos.z) ? p : best), null);
    const dx = pile.pos.x - rack.pos.x, dz = pile.pos.z - rack.pos.z, len = Math.hypot(dx, dz);
    kick(h, rack, { x: dx / len, z: dz / len }, 40, 'throw');
    runUntilResolved(h, 40 * 60);
    assert.ok(h.events.some((e) => e.name === 'cargo:volatileSlam' && e.p.podId === rack.id), 'the rack detonated on contact');
    assert.deepEqual(outcomes(h), ['blown_clear']);
    assert.deepEqual(grants(h), [WEDGE.pay + WEDGE.blastBonus]);
    assert.equal(memory(h).facts.via, 'blast');
    assert.ok(h.events.some((e) => e.name === 'news:publish'), 'the sector keeps the story');
  } finally { h.host.dispose(); }
});

test('shoving the pile down the lane ploughs the queue: open, unpaid, remembered', async () => {
  const h = await boot();
  try {
    const back = { x: -h.w.lane.x, z: -h.w.lane.z };
    for (const id of h.w.podIds) kick(h, h.ent(id), back, 45);
    h.host.step(15 * 60, { after: () => !h.w.ploughed });
    assert.equal(h.w.ploughed, true, 'a queued hauler was knocked off its station');
    // Then the pile is pushed out the side; the lane opens but the yard remembers the queue.
    const side = { x: -h.w.lane.z, z: h.w.lane.x };
    for (const id of h.w.podIds) { const pod = h.ent(id); if (pod && podBlocksLane(h.w, pod)) kick(h, pod, side, 35); }
    runUntilResolved(h, 25 * 60);
    assert.deepEqual(outcomes(h), ['cleared_hurt']);
    assert.deepEqual(grants(h), []);
    assert.equal(memory(h).facts.ploughed, true);
  } finally { h.host.dispose(); }
});

test('flying on leaves the jam; the next jam meets a different yard after a strip', async () => {
  const h = await boot();
  try {
    h.state.simTime += WEDGE.windowS + 1;
    h.host.step(2);
    assert.deepEqual(outcomes(h), ['jammed']);
    assert.equal(memory(h).outcome, 'jammed');
    memory(h).outcome = 'stripped';            // a prior visit's record, as a save would carry it
    h.state.encounterDirector.cooldowns[SHAPE] = 0;
    const res = h.director.requestAuthoredEncounter({
      shapeId: SHAPE, encounterId: 'test_wedge_2', sectorId: SECTOR, anchor: { x: ANCHOR.x + 200, z: ANCHOR.z - 200 },
      zoneType: 'refinery_approach', zoneRadius: 600, force: true,
    });
    assert.equal(res.ok, true, JSON.stringify(res));
    const live = Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE && l.phase !== 'done');
    assert.equal(live.data.wedge.prior, 'stripped');
  } finally { h.host.dispose(); }
});

test('ordinary director roll: the seed-4242 planner books it in every gated sector on its own zones', async () => {
  const { planEncounters } = await import('../src/systems/encounterDirector.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const enc = ENCOUNTERS['the_wedge'];
  for (const sectorId of enc.gates.sectorIds) {
    const zones = zonesForSector(sectorId);
    const byId = new Map(zones.map((z) => [z.id, z]));
    let booked = null;
    for (let day = 0; day < 365 && !booked; day++) {
      booked = planEncounters(4242, sectorId, day, zones).find((item) => item.shapeId === 'the_wedge') || null;
    }
    assert.ok(booked, `${sectorId}: planner never books it in 365 days`);
    const zone = byId.get(booked.zoneId);
    assert.ok(zone && enc.zoneTypes.includes(zone.type), `${sectorId}: booked on ${booked.zoneId}`);
    assert.ok(!/helios/.test(sectorId));
  }
});

test('public Massline tape: fly to each pod, hold the line key, haul it out the side, tap to cut', async () => {
  const h = await boot(['flightV3', tetherGameplay]);
  try {
    const side = { x: -h.w.lane.z, z: h.w.lane.x };
    const across = (p) => (p.pos.x - h.w.throat.x) * side.x + (p.pos.z - h.w.throat.z) * side.z;
    const tape = masslineTape(h);
    const player = () => h.ent(h.state.playerId);
    const blocking = () => h.w.podIds.map(h.ent).filter((p) => podBlocksLane(h.w, p));
    const hauled = [];
    // Nearest latch is pure distance. The dead hauler sits just past the positive lane edge,
    // so the usual 45 wu outward stand of a pod that has slid up against it is the wreck, and
    // the line takes the wreck. Keep that stand while an ore pod is still the close body;
    // otherwise park inboard or along the lane, where the ore is closest, and haul out from there.
    const lane = h.w.lane;
    const standFor = (pod, out) => {
      const ores = h.w.podIds.map(h.ent).filter((e) => e && e.pos && e.alive !== false);
      const threats = [h.w.hulkId, ...h.w.rackIds, ...h.w.haulerIds]
        .map(h.ent).filter((e) => e && e.pos && e.alive !== false);
      const marginAt = (dx, dz) => {
        const x = pod.pos.x + dx, z = pod.pos.z + dz;
        const surf = (e) => Math.max(0, Math.hypot(e.pos.x - x, e.pos.z - z) - Math.max(0, Number(e.radius) || 0));
        const oreS = Math.min(...ores.map(surf));
        const threatS = threats.length ? Math.min(...threats.map(surf)) : Infinity;
        return { dx, dz, margin: threatS - oreS, outward: dx * out.x + dz * out.z };
      };
      const options = [];
      for (const a of [45, 32]) options.push(marginAt(out.x * a, out.z * a));
      for (const a of [28, 36]) options.push(marginAt(-out.x * a, -out.z * a));
      for (const b of [56, -56]) {
        options.push(marginAt(out.x * 28 + lane.x * b, out.z * 28 + lane.z * b));
        options.push(marginAt(-out.x * 28 + lane.x * b, -out.z * 28 + lane.z * b));
      }
      const clear = options.filter((o) => o.margin >= 36);
      const pool = clear.length ? clear : options;
      pool.sort((a, b) => (clear.length ? b.outward - a.outward : b.margin - a.margin));
      return pool[0];
    };
    for (let attempt = 0; attempt < 10 && blocking().length && outcomes(h).length === 0; attempt++) {
      const pod = blocking().reduce((a, b) => (Math.abs(across(b)) > Math.abs(across(a)) ? b : a));
      const s = Math.sign(across(pod)) || 1, out = { x: side.x * s, z: side.z * s };
      const near = () => {
        const stand = standFor(pod, out);
        return { x: pod.pos.x + stand.dx, z: pod.pos.z + stand.dz };
      };
      const flown = h.host.step(30 * 60, { before: () => tape({ arrive: near(), match: pod }),
        after: () => podBlocksLane(h.w, pod) && (Math.hypot(near().x - player().pos.x, near().z - player().pos.z) > 10
          || Math.hypot(player().vel.x - pod.vel.x, player().vel.z - pod.vel.z) > 4) });
      if (!podBlocksLane(h.w, pod)) continue; // knocked clear by the pod already on the line
      assert.ok(flown < 30 * 60, `attempt ${attempt}: the tape flies alongside pod ${pod.id} (gap ${Math.hypot(near().x - player().pos.x, near().z - player().pos.z).toFixed(1)}, speed ${Math.hypot(player().vel.x, player().vel.z).toFixed(1)}, pod v ${Math.hypot(pod.vel.x, pod.vel.z).toFixed(1)}, tether ${JSON.stringify(h.state.player.tether && h.state.player.tether.active)})`);
      h.host.step(30, { before: () => tape({ held: true, brake: true }) });
      const tether = h.state.player.tether;
      assert.ok(tether && tether.active, 'holding the Massline key latched');
      const towed = h.ent(tether.targetId);
      assert.ok(h.w.podIds.includes(towed.id), `the line took an ore pod (got ${towed && towed.data && towed.data.scanLabel})`);
      const ts = Math.sign(across(towed)) || 1, pullDir = { x: side.x * ts, z: side.z * ts };
      const startAcross = Math.abs(across(towed));
      h.host.step(15 * 60, { before: () => tape({ haul: { x: player().pos.x + pullDir.x * 400, z: player().pos.z + pullDir.z * 400 }, throttle: 0.6 }),
        after: () => podBlocksLane(h.w, towed) || Math.abs(across(towed)) < WEDGE.laneHalfWu + 25 });
      assert.equal(podBlocksLane(h.w, towed), false, `hauled out of the lane (|across| ${startAcross.toFixed(0)} → ${Math.abs(across(towed)).toFixed(0)})`);
      hauled.push(towed.id);
      h.host.step(3, { before: () => tape({ held: true }) });
      h.host.step(30, { before: () => tape({ brake: true }) });
      assert.ok(!(h.state.player.tether && h.state.player.tether.active), 'a tap of the same key cut the line');
    }
    runUntilResolved(h, 10 * 60);
    assert.ok(hauled.length >= 1, 'the line hauled ore out by hand');
    assert.deepEqual(outcomes(h), ['cleared']);
    assert.equal(memory(h).facts.via, 'line');
    assert.deepEqual(grants(h), [WEDGE.pay]);
  } finally { h.host.dispose(); }
});
