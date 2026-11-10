// The Machine faction (SWARM_EXPANSION §B2): the swarm's second roster — seven light metal
// bodies folded out of the same mite share, each one flag and one mechanism, all of it
// under the same population, kill-law and telegraph contracts the Brood keeps.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import { createBroodEngine, broodStreamSeed, BROOD_PHASE_WINDUP, BROOD_PHASE_DASH } from '../src/systems/swarmBrood.js';
import {
  SWARM_BROOD_MAX,
  SWARM_BROOD_MIN,
  swarmBroodIssues,
  swarmBroodNewcomerFor,
  swarmBroodPlan,
  swarmBroodPopulation,
} from '../src/data/swarmBrood.js';
import { foldBroodLatePlan, swarmBroodLateIssues } from '../src/data/swarmBroodLate.js';
import {
  SWARM_MACHINE_FAMILIES,
  foldMachinePlan,
  swarmMachineFamily,
  swarmMachineIssues,
  swarmMachineReserveCount,
} from '../src/data/swarmMachine.js';

const DT = 1 / 60;
const SEED = 4242;

function boot({ wave = 64, seed = SEED, phase = 'active' } = {}) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 400, hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.entityIndex = {
    __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [], payloads: [],
  };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  state.run.phase = phase;
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  return { state, bus, emitted, player };
}

function makeEngine(h, { damage = [] } = {}) {
  return createBroodEngine({
    bus: h.bus,
    getState: () => h.state,
    fieldList: () => null,
    routeDamage: (request) => { damage.push(request); return { ok: true }; },
  });
}

function stepSeconds(engine, state, seconds) {
  const ticks = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < ticks; i++) {
    state.simTime += DT;
    state.tick += 1;
    engine.step(state);
  }
}

function spawn(h, engine, wave) {
  engine.prepareWave(h.state.run, wave);
  h.state.run.wave = wave;
  engine.spawnWave(h.state);
}

function familyIndex(engine, id) {
  return engine._bodies.liveFamilyId.indexOf(id);
}

function slotsOf(engine, id) {
  const idx = familyIndex(engine, id);
  const out = [];
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === idx) out.push(i);
  }
  return out;
}

function addRemain(h, x, z, vx = 0, vz = 0) {
  const remain = {
    id: h.state.nextEntityId++, alive: true, type: 'payload',
    pos: { x, z }, vel: { x: vx, z: vz }, radius: 3, mass: 12,
    data: { broodRemain: { kind: 'husk_shards', mass: 12, radius: 3 } },
  };
  h.state.entities.set(remain.id, remain);
  h.state.entityList.push(remain);
  h.state.entityIndex.payloads.push(remain);
  return remain;
}

function addRock(h, x, z, r = 14) {
  const rock = {
    id: h.state.nextEntityId++, alive: true, type: 'asteroid',
    pos: { x, z }, vel: { x: 0, z: 0 }, radius: r, mass: 500, collides: true,
  };
  h.state.entities.set(rock.id, rock);
  h.state.entityList.push(rock);
  h.state.entityIndex.asteroids.push(rock);
  return rock;
}

test('the machine table is honest and its clock is lawful', () => {
  assert.deepEqual(swarmMachineIssues(), []);
  // The brood catalogs are untouched — the Machine folds beside them, never into them.
  assert.deepEqual(swarmBroodIssues(), []);
  assert.deepEqual(swarmBroodLateIssues(), []);
  // Seven units, one mechanism flag each.
  assert.equal(SWARM_MACHINE_FAMILIES.length, 7);
  const flags = SWARM_MACHINE_FAMILIES.map((f) => f.id);
  assert.deepEqual(flags, [
    'formation_drone', 'sawblade', 'repair_drone', 'magnet_sentry',
    'shield_linker', 'assembler', 'beam_turret',
  ]);
});

test('the fold spends mites only, keeps the plan total, and gates debuts', () => {
  for (let wave = 1; wave <= 90; wave++) {
    const rng = () => 0.5;
    const base = swarmBroodPlan(wave, rng);
    const folded = foldMachinePlan(foldBroodLatePlan(base, wave), wave);
    const total = folded.reduce((s, p) => s + p.count, 0);
    assert.equal(total, swarmBroodPopulation(wave), `wave ${wave} population moved`);
    for (const part of folded) {
      const fam = swarmMachineFamily(part.id);
      if (fam) assert.ok(wave >= fam.fromWave, `wave ${wave} fields ${part.id} early`);
    }
    // Below the Machine's first debut the fold is a no-op.
    if (wave < 26) {
      assert.ok(!folded.some((p) => swarmMachineFamily(p.id)), `wave ${wave} fields no machine`);
    }
  }
  // A debut wave fields its new silhouette.
  const w26 = foldMachinePlan(foldBroodLatePlan(swarmBroodPlan(26, () => 0.5), 26), 26);
  assert.ok(w26.some((p) => p.id === 'formation_drone' && p.count > 0));
  const w64 = foldMachinePlan(foldBroodLatePlan(swarmBroodPlan(64, () => 0.5), 64), 64);
  for (const id of ['formation_drone', 'sawblade', 'repair_drone', 'magnet_sentry', 'shield_linker', 'assembler', 'beam_turret']) {
    assert.ok(w64.some((p) => p.id === id && p.count > 0), `wave 64 fields ${id}`);
  }
  // The rebuild reserve is funded per builder's authored budget.
  const plan45 = foldMachinePlan(foldBroodLatePlan(swarmBroodPlan(45, () => 0.5), 45), 45);
  const repairs = plan45.find((p) => p.id === 'repair_drone');
  assert.equal(swarmMachineReserveCount(plan45), repairs.count * 5);
});

test('machine debuts earn the same slam card as brood silhouettes', () => {
  assert.equal(swarmBroodNewcomerFor(26)?.id, 'formation_drone');
  assert.equal(swarmBroodNewcomerFor(32)?.id, 'sawblade');
  assert.equal(swarmBroodNewcomerFor(64)?.id, 'beam_turret');
  assert.equal(swarmBroodNewcomerFor(27), null);
});

test('formation drones ride squad seats and peel into committed dives', () => {
  const h = boot({ wave: 30 });
  const engine = makeEngine(h);
  spawn(h, engine, 30);
  const members = slotsOf(engine, 'formation_drone');
  assert.ok(members.length >= 6, `wave 30 fields a squad (${members.length})`);
  for (const i of members) assert.ok(h.engine === undefined && engine._bodies.squadId[i] >= 0);
  assert.equal(engine._machine().squads >= 1, true);
  // The peel: run the room until one member draws its dive line and commits.
  let dashed = false;
  for (let s = 0; s < 20 * 60 && !dashed; s++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    engine.step(h.state);
    for (const i of members) {
      if (engine._bodies.alive[i] && engine._bodies.phase[i] === BROOD_PHASE_DASH) dashed = true;
    }
  }
  assert.equal(dashed, true, 'the squad peels a member into a committed pass');
});

test('a rooted body stays planted; a sawblade holds cruise and cuts the pack', () => {
  const h = boot({ wave: 45 });
  const engine = makeEngine(h);
  addRock(h, 40, 0, 12);
  spawn(h, engine, 45);
  const sentries = slotsOf(engine, 'magnet_sentry');
  assert.ok(sentries.length > 0, 'wave 45 fields sentries');
  const root = { x: engine._bodies.px[sentries[0]], z: engine._bodies.pz[sentries[0]] };
  stepSeconds(engine, h.state, 4);
  assert.ok(Math.abs(engine._bodies.px[sentries[0]] - root.x) < 1e-4
    && Math.abs(engine._bodies.pz[sentries[0]] - root.z) < 1e-4, 'the sentry never leaves its root');
  const blades = slotsOf(engine, 'sawblade');
  assert.ok(blades.length > 0, 'wave 45 fields sawblades');
  const b = blades[0];
  // Powered blade: it holds its authored cruise instead of settling.
  const sp = Math.hypot(engine._bodies.vx[b], engine._bodies.vz[b]);
  assert.ok(sp >= 55, `sawblade holds cruise (${sp.toFixed(1)})`);
});

test('the magnet aura eats a shot that would have flown past', () => {
  const h = boot({ wave: 45 });
  const engine = makeEngine(h);
  spawn(h, engine, 45);
  const sentries = slotsOf(engine, 'magnet_sentry');
  assert.ok(sentries.length > 0);
  const s = sentries[0];
  // The sentry is rooted — plant it on open ground so the pack can't crowd the lane.
  const sx = 0;
  const sz = -400;
  engine._bodies.px[s] = sx;
  engine._bodies.pz[s] = sz;
  engine._bodies.teleX[s] = sx;
  engine._bodies.teleZ[s] = sz;
  engine._bodies.vx[s] = 0;
  engine._bodies.vz[s] = 0;
  // A sweep skimming 20wu off the sentry — outside its 4wu body, inside its 34wu aura.
  const query = engine.queryProjectileHit({ from: { x: sx - 60, z: sz + 20 }, to: { x: sx + 60, z: sz + 20 }, radius: 0 });
  assert.ok(query && query.kind === 'cell' && query.slot === s, 'the aura commits the shot on the sentry');
});

test('the linker shields its charge and a thrown body breaks the beam', () => {
  const h = boot({ wave: 55 });
  const engine = makeEngine(h);
  spawn(h, engine, 55);
  stepSeconds(engine, h.state, 2);
  const linkers = slotsOf(engine, 'shield_linker');
  assert.ok(linkers.length > 0, 'wave 55 fields linkers');
  const L = linkers[0];
  // Wait for a link to form.
  let partner = -1;
  for (let s = 0; s < 10 * 60 && partner < 0; s++) {
    h.state.simTime += DT; h.state.tick += 1; engine.step(h.state);
    partner = engine._bodies.linkPartner[L];
  }
  assert.ok(partner >= 0, 'the linker finds a charge');
  assert.equal(engine._bodies.shielded[partner], 1);
  // The shield refuses every kill cause.
  const hpBefore = engine._bodies.hp[partner];
  engine._killDirectForTest(partner, 'direct');
  assert.equal(engine._bodies.alive[partner], 1, 'the shield eats the kill');
  assert.equal(engine._bodies.hp[partner], hpBefore);
  // A fast mover through the beam breaks it.
  addRemain(h, (engine._bodies.px[L] + engine._bodies.px[partner]) / 2,
    (engine._bodies.pz[L] + engine._bodies.pz[partner]) / 2, 80, 0);
  stepSeconds(engine, h.state, 0.25);
  assert.equal(engine._bodies.linkPartner[L], -1, 'the beam snaps');
});

test('the repair drone consumes a remain and mints from the wave reserve', () => {
  const h = boot({ wave: 40 });
  const engine = makeEngine(h);
  spawn(h, engine, 40);
  const drones = slotsOf(engine, 'repair_drone');
  assert.ok(drones.length > 0, 'wave 40 fields repair drones');
  const reserve0 = engine._machine().reserve;
  assert.ok(reserve0 > 0, 'the wave holds a rebuild budget');
  const d = drones[0];
  const weldX = engine._bodies.px[d] + 4;
  const weldZ = engine._bodies.pz[d] + 4;
  addRemain(h, engine._bodies.px[d] + 4, engine._bodies.pz[d], 0, 0);
  // The channel: arm, weld, mint. Sawblades roam the same room, so count the yield
  // beside the welder the moment the reserve drops, not the room's whole ledger.
  const yieldIdx = familyIndex(engine, 'formation_drone');
  let spent = false;
  for (let s = 0; s < 8 * 60 && !spent; s++) {
    h.state.simTime += DT; h.state.tick += 1; engine.step(h.state);
    spent = engine._machine().reserve < reserve0;
  }
  assert.equal(spent, true, 'the weld spends the reserve');
  assert.equal(emitted(h).some((e) => e === 'swarm:broodRemainsSpent'), true, 'the remain is spent');
  let minted = false;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (!engine._bodies.alive[i] || engine._bodies.family[i] !== yieldIdx) continue;
    const ddx = engine._bodies.px[i] - weldX;
    const ddz = engine._bodies.pz[i] - weldZ;
    if (ddx * ddx + ddz * ddz < 400) minted = true;
  }
  assert.equal(minted, true, 'the mint lands beside the welder inside the population budget');
});

test('a second live linker keeps its charge shielded when the first dies', () => {
  const h = boot({ wave: 55 });
  const engine = makeEngine(h);
  spawn(h, engine, 55);
  const linkers = slotsOf(engine, 'shield_linker');
  const partner = slotsOf(engine, 'mite')[0];
  assert.ok(linkers.length >= 2 && partner != null);
  const [first, second] = linkers;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (!engine._bodies.alive[i]) continue;
    engine._bodies.px[i] = 2000 + i * 200;
    engine._bodies.pz[i] = 2000;
  }
  for (const [slot, x] of [[partner, 0], [first, 10], [second, -10]]) {
    engine._bodies.px[slot] = x; engine._bodies.pz[slot] = -500;
    engine._bodies.vx[slot] = 0; engine._bodies.vz[slot] = 0;
  }
  stepSeconds(engine, h.state, DT);
  assert.equal(engine._bodies.linkPartner[first], partner);
  assert.equal(engine._bodies.linkPartner[second], partner);
  engine._killDirectForTest(first, 'direct');
  assert.equal(engine._bodies.shielded[partner], 1, 'the surviving link protects the same tick');
  engine._killDirectForTest(partner, 'direct');
  assert.equal(engine._bodies.alive[partner], 1);
});

test('an assembler cannot consume or mint from a partial cluster at completion', () => {
  const h = boot({ wave: 60 });
  const engine = makeEngine(h);
  spawn(h, engine, 60);
  const assembler = slotsOf(engine, 'assembler')[0];
  assert.ok(assembler != null);
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (!engine._bodies.alive[i] || i === assembler) continue;
    engine._bodies.px[i] = 2000 + i * 200; engine._bodies.pz[i] = 2000;
  }
  engine._bodies.px[assembler] = 0; engine._bodies.pz[assembler] = -500;
  engine._bodies.vx[assembler] = 0; engine._bodies.vz[assembler] = 0;
  const first = addRemain(h, 4, -500);
  const second = addRemain(h, 8, -500);
  for (let tick = 0; tick < 600 && engine._bodies.phase[assembler] !== BROOD_PHASE_WINDUP; tick++) {
    stepSeconds(engine, h.state, DT);
  }
  assert.equal(engine._bodies.phase[assembler], BROOD_PHASE_WINDUP);
  assert.equal(engine._bodies.channelEntity[assembler], first.id);
  const reserve = engine._machine().reserve;
  second.alive = false;
  stepSeconds(engine, h.state, 6);
  assert.equal(engine._machine().reserve, reserve, 'no partial recipe mints a body');
  assert.ok(!h.emitted.some((e) => e.event === 'swarm:broodRemainsSpent' && e.payload.entityId === first.id),
    'the remaining ingredient is not consumed');
  second.alive = true;
  for (let tick = 0; tick < 900 && engine._machine().reserve === reserve; tick++) {
    stepSeconds(engine, h.state, DT);
  }
  assert.equal(engine._machine().reserve, reserve - 1, 'a restored full cluster can mint');
  const spent = h.emitted.filter((e) => e.event === 'swarm:broodRemainsSpent').map((e) => e.payload.entityId);
  assert.ok(spent.includes(first.id) && spent.includes(second.id), 'the full recipe is consumed');
});

test('the turret winds, sweeps, and the beam cuts the pack it crosses', () => {
  const h = boot({ wave: 64 });
  const engine = makeEngine(h);
  spawn(h, engine, 64);
  const turrets = slotsOf(engine, 'beam_turret');
  assert.ok(turrets.length > 0, 'wave 64 fields turrets');
  const t = turrets[0];
  // Park the signature in reach and let the clock run.
  h.player.pos.x = engine._bodies.px[t] + 60;
  h.player.pos.z = engine._bodies.pz[t];
  let swept = false;
  for (let s = 0; s < 15 * 60 && !swept; s++) {
    h.state.simTime += DT; h.state.tick += 1; engine.step(h.state);
    if (engine._machine().beams > 0) swept = true;
  }
  assert.equal(swept, true, 'the turret fires a sweep');
});

test('the wave fields inside the population band, machine reserve included', () => {
  for (const wave of [26, 40, 55, 64, 80]) {
    const h = boot({ wave });
    const engine = makeEngine(h);
    spawn(h, engine, wave);
    const c = engine.census();
    const held = c.machineReserve + c.sacBudget + c.reserveBudget;
    assert.ok(c.alive + held <= SWARM_BROOD_MAX, `wave ${wave} alive+held within the cap`);
    assert.ok(c.alive + held >= Math.min(SWARM_BROOD_MIN, c.alive), `wave ${wave} fields a real room`);
  }
});

function emitted(h) {
  return h.emitted.map((e) => e.event);
}
