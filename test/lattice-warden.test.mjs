// LATTICE-WARDEN — the mid-game capital hunt contract: the lattice cell (three breakable
// mission-owned stakes around the TARGET), the telegraphed collapse, the hold-fire survey,
// the node-break stagger, determinism, normal-route placement, and save/restore round-trip.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import {
  CAPITAL_BOSS_ENCOUNTERS,
  CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER,
  CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER_ID,
  requireCapitalBossEncounter,
} from '../src/data/encounters/capital-boss.js';
import { assertCapitalBossEncounter } from '../src/data/encounters/capital-boss/validate.js';
import { STATUS_DEFS, WING_COMPOSITION_GRAMMAR, TWIST_CLAUSES } from '../src/data/combatDefs.js';
import {
  CAPITAL_BOSSES,
  CAPITAL_HUNTS,
  CAPITAL_BOSS_SOURCE,
  CAPITAL_BOSS_TYPE,
  LATTICE_WARDEN_HUNT,
  capitalBossById,
} from '../src/data/missions.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  createLatticeState,
  latticeDeployPlan,
  latticeIntact,
  latticeSpent,
  markLatticeNodeKilled,
  pointInTriangle,
  targetInsideLattice,
} from '../src/combat/latticeWarden.js';
import { restoreCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { SECTORS } from '../src/data/sectors.js';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

const DT = 1 / 60;
const SEED = 9117;

const VOCABULARY = Object.freeze({
  statusIds: new Set(STATUS_DEFS.map((d) => d.id)),
  grammarIds: new Set(WING_COMPOSITION_GRAMMAR.map((g) => g.id)),
  twistIds: new Set(Object.keys(TWIST_CLAUSES)),
  enemyIds: new Set(ENEMY_TYPES.map((e) => e.id)),
});

// ── data registration ─────────────────────────────────────────────────────────
test('the Lattice Warden registers on every catalog seam but never joins the pull list', () => {
  assertCapitalBossEncounter(CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER, VOCABULARY);
  assert.equal(CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.id, CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER_ID);
  assert.ok(CAPITAL_BOSS_ENCOUNTERS[CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER_ID]);
  // The exact-three pull invariant stays untouched: hunts are a separate list.
  assert.equal(CAPITAL_BOSSES.length, 3);
  assert.ok(!CAPITAL_BOSSES.some((row) => row.id === LATTICE_WARDEN_HUNT.id));
  assert.ok(CAPITAL_HUNTS.includes(LATTICE_WARDEN_HUNT));
  assert.equal(capitalBossById(LATTICE_WARDEN_HUNT.id), LATTICE_WARDEN_HUNT);
  assert.equal(LATTICE_WARDEN_HUNT.encounterId, CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER_ID);
  assert.equal(LATTICE_WARDEN_HUNT.endgame, false);
  assert.equal(LATTICE_WARDEN_HUNT.startStationId, 'station_drift');
  assert.equal(LATTICE_WARDEN_HUNT.destSectorId, 'sector_pallas_drift');
  assert.equal(LATTICE_WARDEN_HUNT.factionId, 'faction_mts');
  assert.equal(LATTICE_WARDEN_HUNT.riskTier, 2);
  assert.deepEqual([...LATTICE_WARDEN_HUNT.methods], ['throw_the_capital', 'outgun_the_capital']);
  // The boss row itself: real enemy def, lattice wiring lives on the score, assetRef on actor.
  const def = ENEMY_TYPES.find((e) => e.id === 'lattice_warden');
  assert.ok(def, 'lattice_warden enemy def exists');
  assert.equal(def.combatDoctrineId, 'capital_broadside_lattice_warden');
  const hullActor = CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.actors.find((a) => a.role === 'capital_hull');
  assert.equal(hullActor.assetRef, 'asset.slice.lattice_warden');
});

// ── pure lattice geometry ─────────────────────────────────────────────────────
test('latticeDeployPlan stakes exactly three nodes around the target, deterministic per salt', () => {
  const a = latticeDeployPlan({ x: 40, z: -12 }, 150, 3);
  const b = latticeDeployPlan({ x: 40, z: -12 }, 150, 3);
  const c = latticeDeployPlan({ x: 40, z: -12 }, 150, 4);
  assert.equal(a.length, 3);
  assert.deepEqual(a, b, 'same salt, same stakes — no RNG in the plan');
  assert.notDeepEqual(a, c, 'salt rotates the triangle');
  for (const p of a) {
    const d = Math.hypot(p.x - 40, p.z + 12);
    assert.ok(Math.abs(d - 150) < 1e-9, 'every stake lands on the deploy ring');
  }
  assert.ok(pointInTriangle({ x: 40, z: -12 }, a[0], a[1], a[2]), 'the surveyed target starts inside its own cell');
  const far = { x: 40 + 150 * 3, z: -12 };
  assert.equal(pointInTriangle(far, a[0], a[1], a[2]), false, 'a body outside the ring is outside the cell');
});

// ── production-factory fight harness ─────────────────────────────────────────
function bootLatticeFight({ targetPos = { x: 0, z: 0 } } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const spawned = [];
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage(packet) { emitted.push({ event: 'damage', payload: packet }); return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    getCombatCapabilities() { return null; },
  };
  const player = {
    id: state.nextEntityId++, alive: true, pos: { ...targetPos }, type: 'ship', team: 0,
    hull: 400, hullMax: 400, radius: 8,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const boss = {
    id: state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0,
    hull: 560, hullMax: 560, radius: 26, type: 'ship', team: 1,
  };
  state.entities.set(boss.id, boss);
  state.entityList.push(boss);
  const fightId = `contract:${CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER_ID}`;
  state.missions.active.push({ id: fightId, status: 'active', destSectorId: 'contract_room' });
  state.world.currentSectorId = 'contract_room';
  const capSys = createProductionCapitalBossEncounters();
  // The production port resolves the mission spawn owner through the registry; the harness
  // stands in a minimal owner so lattice stakes use the same owned-spawn boundary.
  const owner = {
    spawnOwnedCapitalBossActor(_mission, spec) {
      const ent = helpers.spawnEntity(spec);
      return ent;
    },
  };
  capSys.init({ state, bus, helpers, registry: { get: () => owner } });
  bus.emit('capitalBoss:start', {
    encounterId: CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER_ID,
    fightId, bossId: boss.id, targetId: player.id,
  });
  return { state, bus, emitted, spawned, capSys, fightId, boss, player };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    h.capSys.update(DT);
  }
}

function fight(h) {
  return h.state.capitalBossEncounters.fights[h.fightId];
}

test('act I opens by staking a triangle of three breakable mission-owned nodes around the target', () => {
  const h = bootLatticeFight();
  const score = CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score;
  // intro + transition, then the deploy telegraph lives and completes.
  tick(h, score.introTicks + score.transitionTicks + 60);
  const r = fight(h);
  assert.ok(r.lattice, 'lattice state rides inside the fight record');
  assert.equal(r.lattice.deploys, 1, 'the opening beat spent one deploy');
  const nodes = h.spawned.filter((e) => e.data && e.data.latticeNode === true);
  assert.equal(nodes.length, 3, 'exactly three stakes land');
  for (const n of nodes) {
    assert.equal(n.data.physicalRole, 'lattice_node');
    assert.ok(String(n.data.capitalBossActorKey).startsWith(`${h.fightId}/`), 'durable key under the fight');
    assert.equal(n.flags.persistent, true, 'stakes persist across save/sector seams');
    assert.equal(n.data.missionTag, h.fightId, 'mission-owned, not stray AI');
  }
  assert.deepEqual(r.lattice.nodeIds.map(String).sort(), nodes.map((n) => String(n.id)).sort(),
    'the fight record binds the receipt ids');
  assert.equal(latticeIntact(r.lattice), true);
  assert.ok(targetInsideLattice(r.lattice, h.player.pos), 'stakes land around the target');
  h.capSys.destroy();
});

test('hold-fire: inside the intact cell the Warden holds position and does not cast', () => {
  const h = bootLatticeFight();
  const score = CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score;
  // Run well past the first deploy so the survey branch is what paces the fight.
  tick(h, score.introTicks + score.transitionTicks + 200);
  const r = fight(h);
  assert.equal(r.phase, 'hold', 'the survey holds while the target sits inside the intact cell');
  const holds = h.emitted.filter((e) => e.event === 'capitalBoss:order' && e.payload.phase === 'hold');
  assert.ok(holds.length > 0, 'the hold order reaches the fire gate');
  const tellsAfterDeploy = h.emitted.filter((e) => e.event === 'capitalBoss:telegraph');
  assert.equal(tellsAfterDeploy.length, 1, 'no second cast inside the survey — geometry paces it');
  h.capSys.destroy();
});

test('leaving the cell hands the pattern back: a telegraph precedes every phase lance', () => {
  const h = bootLatticeFight();
  const score = CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score;
  tick(h, score.introTicks + score.transitionTicks + 200);
  // Walk the target just outside the cell — still inside the engage envelope, outside the
  // triangle and well under the range-response floor, so the survey releases and the
  // pattern (not the picket) resumes.
  h.player.pos.x = 250;
  const lances = [];
  for (let i = 0; i < 4000 && lances.length === 0; i++) {
    tick(h);
    for (const e of h.emitted) {
      if (e.event === 'capitalBoss:damage' && e.payload.origin && e.payload.origin.kind === 'capital_score') {
        const cast = fight(h).cast;
        if (cast) lances.push(e);
      }
    }
  }
  const lanceTells = h.emitted.filter((e) => (
    e.event === 'capitalBoss:telegraph'
    && /phase_lance|collapse_lance|lane_punish/.test(String(e.payload.beatId))
  ));
  assert.ok(lanceTells.length > 0, 'a telegraphed damaging beat eventually follows the release');
  const first = lanceTells[0].payload;
  assert.ok(first.fireAt > first.startedAt, 'the lance telegraphs before it lands');
  const beat = CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score.beats.find((b) => b.id === first.beatId);
  assert.ok(beat.tellTicks >= 90, 'the warning window keeps the authored floor');
  h.capSys.destroy();
});

test('breaking any stake cancels the armed lance and staggers the Warden >= 90 ticks', () => {
  const h = bootLatticeFight();
  const score = CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score;
  tick(h, score.introTicks + score.transitionTicks + 200);
  const r = fight(h);
  const nodeId = r.lattice.nodeIds[0];
  // Stand the target just outside the cell so a lance tell can arm.
  h.player.pos.x = 250;
  let telegraphed = null;
  for (let i = 0; i < 4000 && !telegraphed; i++) {
    tick(h);
    const t = h.emitted.find((e) => (
      e.event === 'capitalBoss:telegraph' && /lance/.test(String(e.payload.beatId))
    ));
    if (t) telegraphed = t;
  }
  assert.ok(telegraphed, 'a lance telegraph armed for the counter test');
  assert.ok(fight(h).cast, 'the lance cast is live');
  // Break the stake mid-tell — the same kill channel every body uses.
  h.state.entities.get(nodeId).alive = false;
  h.bus.emit('entity:killed', { id: nodeId, killerId: h.player.id });
  tick(h);
  const end = h.emitted.find((e) => (
    e.event === 'capitalBoss:telegraphEnd' && e.payload.reason === 'lattice_broken'
  ));
  assert.ok(end, 'the armed lance cancels on the stake kill');
  const recovery = h.emitted.filter((e) => e.event === 'capitalBoss:recovery')
    .map((e) => e.payload.durationTicks);
  assert.ok(recovery.some((d) => d >= 90), `stagger >= 90 ticks (got ${recovery.join(',')})`);
  const voice = h.emitted.find((e) => (
    e.event === 'capitalBoss:voice' && /Stake lost/i.test(String(e.payload.text))
  ));
  assert.ok(voice, 'the break carries the survey-void voice line');
  assert.equal(fight(h).lattice.intact, false);
  h.capSys.destroy();
});

test('the collapse lands as real score damage on a target caught inside the intact cell', () => {
  const h = bootLatticeFight();
  const score = CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score;
  tick(h, score.introTicks + score.transitionTicks + 200);
  const r = fight(h);
  assert.ok(targetInsideLattice(r.lattice, h.player.pos), 'survey starts inside its own cell');
  // Walk out to arm a lance, then walk back inside during the telegraph: the collapse is the
  // authored punish for sitting inside an intact cell when the lance lands.
  h.player.pos.x = 250;
  let tell = null;
  for (let i = 0; i < 6000 && !tell; i++) {
    tick(h);
    tell = h.emitted.find((e) => (
      e.event === 'capitalBoss:telegraph' && /lance/.test(String(e.payload.beatId))
    ));
  }
  assert.ok(tell, 'a lance telegraph armed once the target left the cell');
  // Re-stake positions around the target's CURRENT spot — the plan helper is deterministic, so
  // re-seating nodePos is the same picture a fresh deploy would draw.
  const plan = latticeDeployPlan(h.player.pos, score.lattice.deployRadius, r.lattice.deploys);
  r.lattice.nodePos = plan.map((p) => ({ x: p.x, z: p.z }));
  assert.ok(targetInsideLattice(r.lattice, h.player.pos));
  let collapse = null;
  for (let i = 0; i < 600 && !collapse; i++) {
    tick(h);
    collapse = h.emitted.find((e) => e.event === 'capitalBoss:latticeCollapse');
  }
  assert.ok(collapse, 'a lance landing inside an intact cell emits the collapse');
  const collapseDamage = h.emitted.find((e) => (
    e.event === 'damage' && e.payload.targetId === h.player.id
    && e.payload.origin && e.payload.origin.kind === 'capital_lattice_collapse'
  ));
  assert.ok(collapseDamage, 'the collapse is damage through routeCombatDamage, not a hull write');
  h.capSys.destroy();
});

test('the whole lattice fight is deterministic for a fixed seed', () => {
  const run = () => {
    const h = bootLatticeFight();
    tick(h, CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score.introTicks
      + CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score.transitionTicks + 400);
    const lines = h.emitted.map((e) => JSON.stringify([e.event, e.payload]));
    h.capSys.destroy();
    return lines;
  };
  assert.deepEqual(run(), run(), 'identical seeds emit identical command streams');
});

test('lattice state survives a JSON save/restore round-trip in the fight record', () => {
  const h = bootLatticeFight();
  const score = CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER.score;
  tick(h, score.introTicks + score.transitionTicks + 200);
  const before = fight(h);
  const saved = JSON.parse(JSON.stringify(before));
  const restored = restoreCapitalBossFight(saved);
  assert.equal(restored.lattice.intact, before.lattice.intact);
  assert.equal(restored.lattice.deploys, before.lattice.deploys);
  assert.deepEqual(restored.lattice.nodeIds, before.lattice.nodeIds);
  assert.deepEqual(restored.lattice.nodePos, before.lattice.nodePos);
  // A killed stake stays killed across the seam; a fresh spawn never remints it.
  markLatticeNodeKilled(before.lattice, before.lattice.nodeIds[1], before.clock);
  const again = restoreCapitalBossFight(JSON.parse(JSON.stringify(before)));
  assert.equal(again.lattice.intact, false);
  assert.equal(again.lattice.nodeIds[1], null);
  assert.equal(latticeSpent(again.lattice, 3), false);
  h.capSys.destroy();
});

// ── normal-route placement ────────────────────────────────────────────────────
function stationInfo(id) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === id);
    if (station) return { ...station, sectorId: sector.id };
  }
  return null;
}

test('the hunt posts on the normal route at The Drift and spawns its staked hull', () => {
  const sim = createSimulation({ seed: SEED, systems: [missions, combat, tumbleStates], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8 });
  state.playerId = player.id;
  const missionsSys = sim.registry.get('missions');
  const origin = stationInfo(LATTICE_WARDEN_HUNT.startStationId);
  const dest = stationInfo(LATTICE_WARDEN_HUNT.destStationId);
  assert.ok(origin && dest, 'Drift station rows exist');
  state.world.currentSectorId = dest.sectorId;
  const board = missionsSys.ensureBoard(origin.id);
  const offer = (board.slots || []).find((row) => (
    row && row.source === CAPITAL_BOSS_SOURCE && row.params && row.params.capitalBossId === LATTICE_WARDEN_HUNT.id
  ));
  assert.ok(offer, 'the Lattice Warden hunt posts on station_drift without endgame unlock');
  offer.collateral_cr = 0;
  assert.equal(missionsSys.acceptMission(offer.id), true, 'the hunt accepts like a contract');
  const mission = state.missions.active.find((row) => (
    row.type === CAPITAL_BOSS_TYPE && row.params && row.params.capitalBossId === LATTICE_WARDEN_HUNT.id
  ));
  assert.ok(mission, 'the hunt sits in active missions');
  missionsSys._ensureMissionTargets(mission);
  const hull = (mission.targetEntityIds || [])
    .map((id) => state.entities.get(id))
    .find((e) => e && e.data && e.data.physicalRole === 'capital_hull');
  assert.ok(hull, 'the capital hull spawned');
  assert.equal(hull.data.assetRef, 'asset.slice.lattice_warden', 'the forge body overrides the stat donor');
  assert.equal(hull.data.capitalBossEncounterId, CAPITAL_BOSS_LATTICE_WARDEN_ENCOUNTER_ID);
  assert.equal(hull.data.ai.combatDoctrineId, 'capital_broadside_lattice_warden');
  const ballast = (mission.targetEntityIds || [])
    .map((id) => state.entities.get(id))
    .filter((e) => e && e.data && e.data.physicalRole === 'throw_mass');
  assert.ok(ballast.length >= 1, 'the survey ballast spawned as the mission-owned counter body');
});
