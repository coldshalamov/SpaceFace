// S7 task 1 — the character sheet as data. Pins the plan's contract: every roster ship and
// every Brood family has a row on the wave it debuts; no two ships share a hue + silhouette
// pair (the whole point is name-by-shape-and-colour); a heavy hull is heavy enough to be
// terrain; AUDIT C4 layers stay honest (fodder hull only, supports carry the shield).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SWARM_ROSTER } from '../src/data/swarmMode.js';
import { SWARM_BROOD_FAMILIES } from '../src/data/swarmBrood.js';
import { HEAVY_AS_TERRAIN_MASS } from '../src/combat/impulseKernel.js';
import {
  SWARM_BROOD_CHARACTER,
  SWARM_CHARACTER_SHEET,
  SWARM_PROTECTION_LAYERS,
  swarmBroodCharacterFor,
  swarmCharacterFor,
} from '../src/data/swarmCharacter.js';
import { SWARM_FEEL_PROFILE } from '../src/data/swarmFeelProfile.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { applySwarmFeelSpec } from '../src/systems/waveMaterialization.js';
import {
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
  SWARM_TELL_FLOOR_TICKS,
} from '../src/ai/combatDoctrine.js';
import { swarmDoctrineStamp } from '../src/data/swarmMode.js';
import { SWARM_SPECIALIST_TUNING } from '../src/data/swarmSpecialists.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

test('every roster ship has a row, on the wave the roster clock debuts it', () => {
  assert.equal(SWARM_CHARACTER_SHEET.length, SWARM_ROSTER.length, 'one row per roster ship');
  const seen = new Set();
  for (const roster of SWARM_ROSTER) {
    const row = swarmCharacterFor(roster.enemyId);
    assert.ok(row, `no sheet row for ${roster.enemyId}`);
    assert.equal(row.debutWave, roster.fromWave, `${roster.enemyId} debut wave matches the roster`);
    assert.equal(row.name, roster.name, `${roster.enemyId} display name matches`);
    seen.add(row.enemyId);
  }
  assert.equal(seen.size, SWARM_CHARACTER_SHEET.length, 'no stray or duplicate enemyId rows');
});

test('no two ships share a hue + silhouette pair — each archetype names itself by look', () => {
  const pairs = new Set();
  const hues = new Set();
  const silhouettes = new Set();
  for (const row of SWARM_CHARACTER_SHEET) {
    const pair = `${row.silhouette}|${row.hue}`;
    assert.ok(!pairs.has(pair), `duplicate look: ${row.enemyId} shares ${pair}`);
    pairs.add(pair);
    // Stronger than the letter of the plan: each archetype gets its own hue (PLANS line 362)
    // and its own silhouette key, so the lineup test is winnable by shape or colour alone.
    assert.ok(!hues.has(row.hue), `${row.enemyId} reuses hue ${row.hue.toString(16)}`);
    hues.add(row.hue);
    assert.ok(!silhouettes.has(row.silhouette), `${row.enemyId} reuses silhouette ${row.silhouette}`);
    silhouettes.add(row.silhouette);
  }
});

test('heavy ids are heavy enough to be terrain; every body number is a real positive', () => {
  for (const row of SWARM_CHARACTER_SHEET) {
    assert.ok(row.radius > 0 && row.mass > 0 && row.speed > 0 && row.scale > 0,
      `${row.enemyId} has a live body`);
    if (row.tier === 'heavy') {
      assert.ok(row.mass >= HEAVY_AS_TERRAIN_MASS,
        `${row.enemyId} is heavy but only ${row.mass}t (< ${HEAVY_AS_TERRAIN_MASS}t terrain)`);
    } else {
      assert.ok(row.mass < HEAVY_AS_TERRAIN_MASS,
        `${row.enemyId} tier ${row.tier} but mass ${row.mass}t is already terrain`);
    }
  }
});

test('C4 protection: fodder is hull only, supports carry the shield, layers are known', () => {
  const known = new Set(SWARM_PROTECTION_LAYERS);
  for (const row of SWARM_CHARACTER_SHEET) {
    assert.ok(row.protection.length >= 1, `${row.enemyId} has no layer at all`);
    for (const layer of row.protection) assert.ok(known.has(layer), `${row.enemyId}: unknown layer ${layer}`);
    assert.equal(row.protection[0], 'hull', `${row.enemyId}: hull is always the base layer`);
    assert.equal(new Set(row.protection).size, row.protection.length, `${row.enemyId}: repeated layer`);
    if (row.tier === 'fodder') {
      assert.deepEqual([...row.protection], ['hull'], `${row.enemyId}: fodder is hull only`);
    }
    if (row.enemyId === 'warden_escort' || row.enemyId === 'pd_screen_escort') {
      assert.ok(row.protection.includes('shield'), `${row.enemyId}: a support shows its shield layer`);
    }
  }
});

test('the S1 fodder band and the sheet agree — fodder rows are exactly the profile list', () => {
  const sheetFodder = SWARM_CHARACTER_SHEET.filter((r) => r.tier === 'fodder').map((r) => r.enemyId).sort();
  assert.deepEqual(sheetFodder, [...SWARM_FEEL_PROFILE.fodder.ids].sort());
});

test('every threatened ability row carries a tell; only fodder and the duelist stand silent', () => {
  const silent = SWARM_CHARACTER_SHEET.filter((r) => r.tellId == null).map((r) => r.enemyId).sort();
  assert.deepEqual(silent, ['patrol_lawman', 'wasp_swarmer'].sort(),
    'a dangerous ability without a tell is the plan\'s named failure mode');
  for (const row of SWARM_CHARACTER_SHEET) {
    if (row.abilityId == null) continue;
    assert.equal(typeof row.counter, 'string', `${row.enemyId} has an ability but no counter line`);
  }
});

test('every Brood family has a surface row on its unlock wave', () => {
  assert.equal(SWARM_BROOD_CHARACTER.length, SWARM_BROOD_FAMILIES.length, 'one row per family');
  for (const family of SWARM_BROOD_FAMILIES) {
    const row = swarmBroodCharacterFor(family.id);
    assert.ok(row, `no surface row for brood ${family.id}`);
    assert.equal(row.debutWave, family.fromWave, `${family.id} surface wave matches the brood clock`);
    assert.ok(row.drawScale >= 1.5, `${family.id}: E1 says the horde reads at 1.5x draw scale`);
    assert.equal(typeof row.signature, 'string', `${family.id} has no attack-language line`);
  }
});

test('S7 task 2 — materialisation stamps the sheet onto the spec, def numbers overridden', () => {
  for (const row of SWARM_CHARACTER_SHEET) {
    const spec = makeEnemySpawnSpec(row.enemyId, 1, { x: 0, z: 0 });
    assert.ok(spec, `${row.enemyId} builds a spec`);
    applySwarmFeelSpec(spec, row.enemyId, SWARM_FEEL_PROFILE);
    assert.equal(spec.radius, row.radius, `${row.enemyId} takes the sheet radius`);
    assert.equal(spec.mass, row.mass, `${row.enemyId} takes the sheet mass`);
    assert.equal(spec.maxSpeed, row.speed, `${row.enemyId} cruises at the sheet speed`);
    // The authored combat envelope never lets the doctrine chase above the sheet's intent.
    if (Number.isFinite(spec.combatSpeed)) {
      assert.ok(spec.combatSpeed <= row.speed,
        `${row.enemyId} combatSpeed ${spec.combatSpeed} runs above the sheet's ${row.speed}`);
    }
    const stamp = spec.data && spec.data.swarmCharacter;
    assert.ok(stamp, `${row.enemyId} carries the sheet stamp for Lane S`);
    assert.equal(stamp.silhouette, row.silhouette);
    assert.equal(stamp.hue, row.hue);
    assert.equal(stamp.scale, row.scale);
    assert.equal(stamp.tier, row.tier);
    assert.equal(stamp.abilityId, row.abilityId);
    assert.equal(stamp.tellId, row.tellId);
    // S7 task 3 — every sheet row rides the 0.6 s tell floor through its doctrine stamp.
    assert.equal(spec.data.ai && spec.data.ai.swarmTellFloor, true,
      `${row.enemyId} carries the tell-floor marker`);
  }
  // And the stamp stays Swarm-gated: a spec that never sees the profile is untouched.
  const plain = makeEnemySpawnSpec('bruiser_brawler', 1, { x: 0, z: 0 });
  assert.ok(plain && !(plain.data && plain.data.swarmCharacter),
    'an Adventure def keeps its own body numbers');
  assert.ok(!(plain.data && plain.data.ai && plain.data.ai.swarmTellFloor),
    'an Adventure def keeps its own telegraph beat');
});

// S7 task 3 — the tell floor is a real phase length, not a stamped promise: a cohort hull's
// cue beat is the sheet's 0.6 s (36 ticks) while an unmarked hull keeps the adventure 30.
test('a swarm-stamped hull holds every dangerous cue at the 0.6 s floor', () => {
  const contact = (x = 400) => ({
    id: 1, kind: 'ship', alive: true, valid: true, visible: true, ageTicks: 0,
    hostile: true, confidence: 1, threat: 0.7, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    tethered: false, operationalMassBand: 'medium', mobilityBand: 'medium',
    cargoBand: 'empty', tetherabilityBand: 'good', tags: [],
  });
  const perceive = (floor) => ({
    self: {
      id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      combatDoctrineId: 'interceptor_flyby',
      swarmTellFloor: floor,
      activity: { kind: 'attack_run', reason: 'test', anchor: { x: 0, z: 0 }, leashRadius: 2600, preferredRange: 180, startedTick: 0 },
      roe: 'weapons_free',
    },
    contacts: [contact()],
    events: [],
  });
  const directive = Object.freeze({
    tick: 0, squadId: 's', memberId: 2, role: 'striker', tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: 'focus', targetId: 1, reason: 'test' }),
    formation: null, order: null, authority: null, roe: 'weapons_free',
  });
  // The same hull, one flag apart: the swarm beat lasts the floor, the adventure beat 30.
  const adventure = new CombatDoctrineRuntime({ seed: 5 });
  const cohort = new CombatDoctrineRuntime({ seed: 5 });
  const a0 = adventure.update({ tick: 0, entityId: 'adv', doctrineId: 'interceptor_flyby', perception: perceive(false), directive });
  const s0 = cohort.update({ tick: 0, entityId: 'swm', doctrineId: 'interceptor_flyby', perception: perceive(true), directive });
  assert.equal(a0.phase, 'engine_flare');
  assert.equal(s0.phase, 'engine_flare');
  assert.equal(a0.telegraph.durationTicks, DOCTRINE_TELEGRAPH_TICKS,
    'an unmarked hull keeps the adventure cue beat');
  assert.ok(s0.telegraph.durationTicks >= SWARM_TELL_FLOOR_TICKS,
    `a cohort hull's cue records the floor (got ${s0.telegraph.durationTicks})`);
  // The phase itself stretches: the cohort hull is still flaring at tick 30 and
  // only commits at the floor, so the tell actually precedes the pass by 0.6 s.
  const s30 = cohort.update({ tick: 30, entityId: 'swm', doctrineId: 'interceptor_flyby', perception: perceive(true), directive });
  assert.equal(s30.phase, 'engine_flare', 'the cohort cue is still up at the adventure beat');
  const s36 = cohort.update({ tick: 36, entityId: 'swm', doctrineId: 'interceptor_flyby', perception: perceive(true), directive });
  assert.equal(s36.phase, 'strike', 'the cohort pass commits exactly at the floor');
  // And the specialist windups stand at the same floor, not under it.
  for (const kind of ['warden', 'jackal', 'anchor']) {
    assert.ok(SWARM_SPECIALIST_TUNING[kind].windupTicks >= SWARM_TELL_FLOOR_TICKS,
      `${kind} specialist windup ${SWARM_SPECIALIST_TUNING[kind].windupTicks} holds the floor`);
  }
});

// S7 task 3 — the choir's sheet promise (ward_screen) ships through its authored escort
// doctrine: in a pack the ward is the nearest packmate, so it is not folded into pursuit.
test('the choir keeps escort_screen in a swarm — the guardian, not another pursuer', () => {
  assert.equal(swarmDoctrineStamp('choir_zealot', { swarm: true }), null,
    'the choir keeps its authored doctrine under the swarm stamp');
  const spec = makeEnemySpawnSpec('choir_zealot', 1, { x: 0, z: 0 });
  assert.equal(spec.data.ai.combatDoctrineId, 'escort_screen',
    'the choir screens its packmate in a swarm round');
  assert.equal(swarmCharacterFor('choir_zealot').abilityId, 'ward_screen');
});

// S7 task 3 — the reaver's pack call is read by the wave owner (the live-route single
// writer): the caller announces once below its authored threshold, the pack rides the
// ordinary stream, and killing the caller scatters it through the authored flee egress.
test('the reaver pack call announces, lands, and scatters on the caller\'s death', () => {
  const state = createGameState(7);
  state.run = Object.assign(
    createRunState({ kind: 'survival', ruleset: 'swarm', seed: 7 }),
    { wave: 2, phase: 'active' },
  );
  state.mode = 'flight';
  const bus = createBus();
  const events = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload }); emit(event, payload); };
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 400, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const budget = makeBudgetApi(state);
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p.id, p.entity));
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const e = { ...spec, id: state.nextEntityId++, alive: true,
        pos: { ...spec.pos }, vel: { ...(spec.vel || { x: 0, z: 0 }) } };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return;
      entity.alive = false;
      state.entities.delete(id);
      state.entityList = state.entityList.filter((e) => e !== entity);
      bus.emit('entity:destroyed', { id, entity });
    },
  };
  const sys = Object.create(survivalWave);
  sys.init({ state, bus, helpers });
  const plan = planWave({ seed: 7, arenaId: 'helios_core', wave: 2, ruleset: 'swarm' });
  bus.emit('run:wavePlanned', { wave: 2, plan });
  bus.emit('run:waveStarted', { wave: 2 });
  // The caller: an admitted cohort reaver carrying its authored reinforcement contract.
  const reaver = helpers.spawnEntity({
    type: 'ship', pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, radius: 18, mass: 60,
    hull: 40, hullMax: 200, team: 2,
    data: {
      ai: { archetype: 'pirate', combatDoctrineId: 'interceptor_flyby' },
      runCohort: 'survival',
      reinforcements: { type: 'wasp_swarmer', count: [2, 2], hullThreshold: 0.5 },
    },
  });
  sys._cohort.set(reaver.id, { role: 'striker', entity: reaver });
  sys.update(); // the wound is already below threshold — the call fires this tick
  const telegraph = events.find((e) => e.event === 'ai:telegraph' && e.payload.entityId === reaver.id);
  assert.ok(telegraph, 'the caller telegraphs the pack call');
  assert.equal(telegraph.payload.kind, 'pack_call');
  assert.ok(telegraph.payload.durationTicks >= SWARM_TELL_FLOOR_TICKS,
    'the call tell holds the 0.6 s floor');
  assert.equal(reaver.data.swarmPackCalled, true, 'the call latches once');
  // Tick through the call beat — the pack lands as ordinary stream bodies.
  for (let i = 0; i < 60; i++) {
    state.simTime += 1 / 60;
    state.tick += 1;
    sys.update();
  }
  const called = state.entityList.filter((e) => e.data && e.data.calledBy === reaver.id);
  assert.equal(called.length, 2, 'the authored count lands through the stream');
  for (const wasp of called) {
    // A wasp materialised by the ordinary swarm path carries the sheet stamp.
    assert.ok(wasp.data.swarmCharacter, 'a called body lands as a sheet archetype');
    assert.equal(wasp.data.swarmCharacter.tier, 'fodder');
  }
  // The counter ships: kill the caller and its Wasps scatter through forceFlee.
  reaver.alive = false;
  bus.emit('entity:killed', { id: reaver.id, tick: state.tick });
  for (const wasp of called) {
    assert.equal(wasp.data.ai.forceFlee, true, 'a called wasp reads the rout and flees');
    assert.equal(wasp.data.ai.swarmPanicked, true);
  }
});
