// Row 547 (W-COLOSSI): the 07 §5 Colossus roster on row 448's plate framework — the six new
// authored colossi plus the existing Iron Maw, Foreman, Regent and Spindle Mother (the spec's
// name for the brood_queen row). The law is §5's own: no health bar — the bar is the parts —
// and every ripped part is ammunition.
//
// Seed 4242, DT = 1/60, no wall-clock, no renderer. The harness is the row-448 one: a
// fabricated ACTIVE mission-row fight on the production factory, stepped on the record's own
// clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import {
  CAPITAL_BOSS_ENCOUNTERS,
  requireCapitalBossEncounter,
} from '../src/data/encounters/capital-boss.js';
import {
  CAPITAL_BOSS_ADJUDICATOR_ENCOUNTER_ID,
  CAPITAL_BOSS_CASKET_WORM_ENCOUNTER_ID,
  CAPITAL_BOSS_FURNACE_MAW_ENCOUNTER_ID,
  CAPITAL_BOSS_HIVE_HULK_ENCOUNTER_ID,
  CAPITAL_BOSS_NEST_CARRIER_ENCOUNTER_ID,
  CAPITAL_BOSS_YARDMASTER_ENCOUNTER_ID,
} from '../src/data/encounters/capital-boss.js';
import { validateCapitalBossEncounter } from '../src/data/encounters/capital-boss/validate.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';
import { CAPITAL_PLATE_FULL_PULL } from '../src/combat/capitalPlates.js';
import { capitalBossReadouts } from '../src/presentation/capitalBossPresentation.js';
import { wreckPackagedFile } from '../src/render/visualFactory.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SWARM_BOSS_ROTATION, swarmCatalogIssues } from '../src/data/swarmMode.js';
import { planArenaInstall } from '../src/systems/survivalArena.js';
import { LAST_ARGUMENT } from '../src/data/lastArgument.js';
import { survivalHud } from '../src/ui/survivalHud.js';

const DT = 1 / 60;
const SEED = 4242;

// The §5 roster: the six new colossi and the four established names the spec keeps — the Iron
// Maw, the Mirrorjaw Foreman, the Forge Regent, and the Spindle Mother (existing brood_queen).
const NEW_COLOSSI = [
  CAPITAL_BOSS_NEST_CARRIER_ENCOUNTER_ID, CAPITAL_BOSS_CASKET_WORM_ENCOUNTER_ID,
  CAPITAL_BOSS_FURNACE_MAW_ENCOUNTER_ID, CAPITAL_BOSS_YARDMASTER_ENCOUNTER_ID,
  CAPITAL_BOSS_ADJUDICATOR_ENCOUNTER_ID, CAPITAL_BOSS_HIVE_HULK_ENCOUNTER_ID,
];
const ESTABLISHED_COLOSSI = [
  'capital_boss_hulk', 'capital_boss_foreman', 'capital_boss_regent', 'capital_boss_brood_queen',
];
const NEW_ENEMY_IDS = [
  'nest_carrier', 'casket_worm', 'furnace_maw', 'yardmaster', 'adjudicator_44c', 'hive_hulk',
];

function bootScoreFight(encounterId, { attachmentService = null, swarm = false } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload, tick: state.tick }); raw.emit(event, payload); },
  };
  const spawned = [];
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage: createDamageRouter({ state, bus: raw, catalog: createCombatCatalog(), helpers: {} }, { schedule() {} }),
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity); state.entityList.push(entity); spawned.push(entity);
      return entity;
    },
    getCombatCapabilities() { return null; },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player); state.entityList.push(player); state.playerId = player.id;
  state.mode = 'flight';
  const boss = {
    id: state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0,
    hull: 1000, hullMax: 1000, radius: 30, type: 'ship', team: 1, data: {},
  };
  state.entities.set(boss.id, boss); state.entityList.push(boss);
  const fightId = swarm ? `swarm:w547:${encounterId}` : `contract:${encounterId}`;
  if (swarm) {
    // A swarm champion has no mission row — the active run is its owner.
    state.run = { kind: 'survival', phase: 'active' };
  } else {
    state.missions.active.push({ id: fightId, status: 'active', destSectorId: 'contract_room' });
    state.world.currentSectorId = 'contract_room';
  }
  const capSys = createProductionCapitalBossEncounters();
  const registry = attachmentService
    ? { get: (name) => (name === 'actions' ? { kernel: { attachments: attachmentService } } : null) }
    : null;
  capSys.init({ state, bus, helpers, registry });
  bus.emit('capitalBoss:start', { encounterId, fightId, bossId: boss.id, targetId: player.id });
  return { state, bus, emitted, spawned, capSys, fightId, boss, player, helpers };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i += 1) { h.state.tick += 1; h.state.simTime += DT; h.capSys.update(DT); }
}

function latchAt(h, anchor, tension = 0.95) {
  if (!h.state.combat.attachments) h.state.combat.attachments = { byId: {}, nextId: 1 };
  const att = {
    id: 'att_colossi_test', defId: 'tether_standard',
    ownerId: h.player.id, targetId: h.boss.id, state: 'active',
    targetAnchorLocal: { x: 0, z: 0 }, lastTension: tension * CAPITAL_PLATE_FULL_PULL,
  };
  h.state.combat.attachments.byId[att.id] = att;
  const len = Math.hypot(anchor.x, anchor.z) || 1;
  h.player.pos.x = h.boss.pos.x + (anchor.x / len) * 120;
  h.player.pos.z = h.boss.pos.z + (anchor.z / len) * 120;
  if (!h.player.tether) h.player.tether = {};
  h.player.tether.tensionEstimate = 0.0005;
  return att;
}
const plateAnchorLocal = (h, plateId) => {
  const spec = requireCapitalBossEncounter(h.state.capitalBossEncounters
    .fights[h.fightId].encounterId).plates.find((p) => p.id === plateId);
  return { x: spec.anchor.x * h.boss.radius, z: spec.anchor.z * h.boss.radius, spec };
};
const fightRec = (h) => h.state.capitalBossEncounters.fights[h.fightId];
const plateRec = (h, id) => fightRec(h).plates.find((p) => p.id === id);
const plateSpawns = (h) => h.spawned.filter((e) => e.data && e.data.capitalPlate);
const bossSubsystemHp = (h, id) => {
  const row = ensureCombatant(h.state, h.boss, createCombatCatalog()).subsystems[id];
  return row ? row.health : NaN;
};

test('the §5 roster is catalogued — six new colossi plus the four established names', () => {
  for (const id of [...NEW_COLOSSI, ...ESTABLISHED_COLOSSI]) {
    const spec = CAPITAL_BOSS_ENCOUNTERS[id];
    assert.ok(spec, `${id} is registered`);
    assert.ok(Array.isArray(spec.plates) && spec.plates.length >= 2 && spec.plates.length <= 4,
      `${id} carries two to four parts`);
    const result = validateCapitalBossEncounter(spec, {});
    assert.equal(result.ok, true, `${id}: ${result.errors.join('; ')}`);
  }
  // The spec's Spindle Mother is the shipped brood_queen row (07 §5 maps the name explicitly).
  assert.equal(requireCapitalBossEncounter('capital_boss_brood_queen').score.name, 'BROOD QUEEN');
  // Every new colossus has a stable enemy hull for the wave owner, and the swarm rotation
  // fields exactly those ids with a room that is never an idle re-skin.
  const enemies = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
  const rotationByEnemy = new Map();
  for (const boss of SWARM_BOSS_ROTATION) if (boss.enemyId) rotationByEnemy.set(boss.enemyId, boss);
  for (const enemyId of NEW_ENEMY_IDS) {
    const def = enemies.get(enemyId);
    assert.ok(def, `${enemyId} is a shipped archetype`);
    assert.equal(def.shipClass, 'capital', `${enemyId} is a capital hull`);
    assert.equal(def.bountyCr, 0, `${enemyId} pays nothing directly — survival champions never do`);
    assert.equal(def.loot, null, `${enemyId} drops no loot directly`);
    const row = rotationByEnemy.get(enemyId);
    assert.ok(row, `${enemyId} rides the boss rotation`);
    assert.equal(NEW_COLOSSI.includes(row.scoreId), true, `${enemyId} names its own score`);
    // The room's authored hint is the install's own note — the field survivalArena:installed
    // carries and the swarm room alert speaks verbatim.
    const roomNote = planArenaInstall({
      arenaPhase: 'boss', arenaId: 'helios_core', wave: 20, seed: SEED,
      anchor: { x: 0, z: 0 }, laneGate: 'front', bossRoom: row.room,
    }).note;
    assert.equal(typeof roomNote, 'string', `${enemyId} room carries a note`);
    assert.ok(roomNote.length > 0, `${enemyId} room note is authored, not empty`);
  }
  assert.deepEqual(swarmCatalogIssues(), [], 'the wave catalogs audit clean');
});

test('every colossus score starts on the production factory and telegraphs its first beat', () => {
  for (const id of NEW_COLOSSI) {
    const h = bootScoreFight(id);
    const score = requireCapitalBossEncounter(id).score;
    tick(h, score.introTicks + score.transitionTicks + 40);
    const rec = fightRec(h);
    assert.ok(rec && rec.started === true, `${id} opens a live record`);
    const telegraphs = h.emitted.filter((e) => e.event === 'capitalBoss:telegraph');
    assert.ok(telegraphs.length > 0, `${id} telegraphs before it lands`);
    assert.ok(score.beats.some((b) => b.id === telegraphs[0].payload.beatId),
      `${id} telegraph is an authored beat`);
    h.capSys.destroy();
  }
});

test('every part on every new colossus tears by rope into a tetherable authored slab', () => {
  for (const id of NEW_COLOSSI) {
    const spec = requireCapitalBossEncounter(id);
    for (const plate of spec.plates) {
      const created = [];
      const svc = {
        cut() {},
        create: (s) => { created.push(s); return { ok: true, attachment: { id: 'att_new' } }; },
      };
      const h = bootScoreFight(id, { attachmentService: svc });
      tick(h, 5);
      latchAt(h, plateAnchorLocal(h, plate.id), plate.holdTension + 0.05);
      tick(h, 35);
      assert.equal(plateRec(h, plate.id).attached, false, `${id}/${plate.id} tears under the hold`);
      const slab = plateSpawns(h).find((e) => e.data.capitalPlate.plateId === plate.id);
      assert.ok(slab, `${id}/${plate.id} leaves a body`);
      assert.equal(slab.type, 'wreck');
      assert.equal(slab.data.masslineTetherable, true, `${id}/${plate.id} is ammunition`);
      // The torn part draws as its own authored aftermath piece when the score names one.
      if (plate.partId) {
        assert.equal(wreckPackagedFile(slab), `places/${plate.partId}.glb`,
          `${id}/${plate.id} draws as ${plate.partId}`);
      }
      assert.equal(created.at(-1).targetId, slab.id, `${id}/${plate.id} re-latches the line`);
      h.capSys.destroy();
    }
  }
});

test('shared cover holds until EVERY covering part is free — the nest doors and the hulk nodes', () => {
  for (const id of ['capital_boss_nest_carrier', 'capital_boss_hive_hulk']) {
    const spec = requireCapitalBossEncounter(id);
    // The encounter's shared-cover plates all name the same subsystem.
    const covers = new Map();
    for (const p of spec.plates) covers.set(p.covers, (covers.get(p.covers) || 0) + 1);
    const shared = [...covers.entries()].find(([, n]) => n > 1);
    assert.ok(shared, `${id} authors a shared-cover subsystem`);
    const [subsystem, count] = shared;
    const covering = spec.plates.filter((p) => p.covers === subsystem);
    assert.equal(covering.length, count);

    const h = bootScoreFight(id);
    tick(h, 5);
    assert.equal((h.boss.data.capitalPlateCover || {})[subsystem], true,
      `${id}: the covered subsystem starts plated`);
    // Tear every covering plate but one — the cover must hold the whole time.
    for (const plate of covering.slice(0, -1)) {
      latchAt(h, plateAnchorLocal(h, plate.id), plate.holdTension + 0.05);
      tick(h, 40);
      assert.equal(plateRec(h, plate.id).attached, false, `${id}/${plate.id} tore`);
      assert.equal((h.boss.data.capitalPlateCover || {})[subsystem], true,
        `${id}: ${subsystem} stays covered while one plate remains`);
      delete h.state.combat.attachments.byId.att_colossi_test;
    }
    latchAt(h, plateAnchorLocal(h, covering.at(-1).id), covering.at(-1).holdTension + 0.05);
    tick(h, 40);
    assert.equal((h.boss.data.capitalPlateCover || {})[subsystem], undefined,
      `${id}: ${subsystem} is bare only when every covering part is off`);
    h.capSys.destroy();
  }
});

test('the act shed guarantees the ladder on the new scores', () => {
  // The Yardmaster sheds its keel chunk at the end of act I (shedOnAct 0).
  const h = bootScoreFight('capital_boss_yardmaster');
  const spec = requireCapitalBossEncounter('capital_boss_yardmaster');
  tick(h, spec.score.introTicks + spec.score.transitionTicks + 10);
  const shedPlate = spec.plates.find((p) => p.shedOnAct === 0);
  assert.ok(shedPlate, 'the score authors an act-0 shed');
  assert.equal(plateRec(h, shedPlate.id).attached, true, 'the plate holds through act I');
  h.boss.hull = spec.score.acts[1].enter.hullAtMost * h.boss.hullMax - 1;
  tick(h, spec.score.transitionTicks + 60);
  assert.equal(fightRec(h).actIndex >= 1, true, 'act II is live');
  assert.equal(plateRec(h, shedPlate.id).attached, false, 'the act end tears the plate');
  const torn = h.emitted.filter((e) => e.event === 'capitalBoss:plateTorn');
  assert.ok(torn.some((e) => e.payload.plateId === shedPlate.id && e.payload.cause === 'actShed'),
    'the shed lands as a slab, not a disappearance');
  h.capSys.destroy();
});

test('a mid-fight save keeps the colossus parts — restore re-spawns nothing', () => {
  const h = bootScoreFight('capital_boss_furnace_maw');
  const spec = requireCapitalBossEncounter('capital_boss_furnace_maw');
  const plate = spec.plates[0];
  tick(h, 5);
  latchAt(h, plateAnchorLocal(h, plate.id), plate.holdTension + 0.05);
  tick(h, 40);
  assert.equal(plateRec(h, plate.id).attached, false);
  const saved = h.capSys.serialize();

  const h2 = bootScoreFight('capital_boss_furnace_maw');
  h2.state.tick = h.state.tick;
  h2.capSys.restore(saved);
  const rec2 = h2.state.capitalBossEncounters.fights[h.fightId];
  assert.ok(rec2, 'the fight restores');
  assert.equal(rec2.plates.find((p) => p.id === plate.id).attached, false,
    'the torn part stays torn');
  assert.equal(rec2.plates.filter((p) => p.attached).length, spec.plates.length - 1,
    'the rest of the ladder survives the save');
  tick(h2, 40);
  assert.equal(h2.spawned.filter((e) => e.data && e.data.capitalPlate).length, 0,
    'restore never re-spawns the torn slab');
  h2.capSys.destroy();
});

test('no HP bar: the readout makes the parts the progress signal', () => {
  const h = bootScoreFight('capital_boss_hive_hulk');
  const spec = requireCapitalBossEncounter('capital_boss_hive_hulk');
  tick(h, 5);
  const readout = () => capitalBossReadouts(h.state, []).find((r) => r && r.fightId === h.fightId);
  let rd = readout();
  assert.ok(rd, 'the fight projects a readout');
  assert.equal(rd.partsLive, true, 'a live colossus reads its parts');
  assert.equal(rd.partsTotal, spec.plates.length);
  assert.equal(rd.partsAttached, spec.plates.length, 'the bar starts full — every part aboard');
  // Tear a part and the read drains by exactly one share.
  const plate = spec.plates[0];
  latchAt(h, plateAnchorLocal(h, plate.id), plate.holdTension + 0.05);
  tick(h, 40);
  rd = readout();
  assert.equal(rd.partsAttached, spec.plates.length - 1, 'the bar drains as parts come off');
  // The Last Argument stays the exception: its plates are data-only, so its readout keeps the
  // hull instrument — the one boss whose bar is not its parts.
  assert.equal(rd.hullFraction != null, true, 'hull data still exists internally — never a bar');
  h.capSys.destroy();
});

test('the swarm boss meter counts parts, never hull, while a colossus carries live plates', () => {
  const h = bootScoreFight('capital_boss_nest_carrier', { swarm: true });
  const spec = requireCapitalBossEncounter('capital_boss_nest_carrier');
  tick(h, 5);
  // The survival HUD reads the marked champion off the entity bag — stamp the mark the wave
  // materializer stamps in production.
  h.boss.data.swarmChampion = true;
  const vitals = survivalHud._bossVitals(h.state);
  assert.ok(vitals && vitals.parts, 'the champion bar reads parts, not hull');
  assert.equal(vitals.parts.total, spec.plates.length);
  assert.equal(vitals.parts.attached, spec.plates.length);
  const plate = spec.plates[0];
  latchAt(h, plateAnchorLocal(h, plate.id), plate.holdTension + 0.05);
  tick(h, 40);
  const after = survivalHud._bossVitals(h.state);
  assert.equal(after.parts.attached, spec.plates.length - 1,
    'the meter drains a share when a part tears');
  // A compositional champion — no score fight — keeps the shipped hull meter.
  const h2 = bootScoreFight('capital_boss_nest_carrier', { swarm: true });
  tick(h2, 1);
  h2.boss.data.swarmChampion = true;
  delete h2.state.capitalBossEncounters.fights[h2.fightId];
  const plain = survivalHud._bossVitals(h2.state);
  assert.ok(plain && plain.parts == null && plain.pct != null,
    'an un-scored champion still reads hull — only colossi go bar-less');
  h.capSys.destroy();
  h2.capSys.destroy();
});

test('every ripped part is ammunition — the torn slab whips damage into the bared subsystem', () => {
  // The Nest Carrier's doors cover the bays; both off and a whip lands the subsystem hit.
  const id = 'capital_boss_nest_carrier';
  const spec = requireCapitalBossEncounter(id);
  const doors = spec.plates.filter((p) => p.covers === 'subsystem_tether_spool');
  const svc = { cut() {}, create: (s) => ({ ok: true, attachment: { id: 'att_slab' } }) };
  const h = bootScoreFight(id, { attachmentService: svc });
  const hp = () => bossSubsystemHp(h, 'subsystem_tether_spool');
  const whipHit = (slabId) => h.helpers.routeCombatDamage({
    attackerId: h.player.id, targetId: h.boss.id,
    packet: { channels: { kinetic: 40 }, hit: { subsystemId: 'subsystem_tether_spool' },
      source: { kind: 'massline_whip', entityId: slabId } },
    origin: { kind: 'massline_whip', impactorId: slabId },
  });
  tick(h, 5);
  const hp0 = hp();
  whipHit(null);
  assert.equal(hp(), hp0, 'both doors bolted shut — the bays take nothing');
  for (const door of doors) {
    latchAt(h, plateAnchorLocal(h, door.id), door.holdTension + 0.05);
    tick(h, 40);
    delete h.state.combat.attachments.byId.att_colossi_test;
  }
  const slab = plateSpawns(h).at(-1);
  assert.ok(slab, 'the second door is a slab in hand');
  const hull0 = h.boss.hull;
  whipHit(slab.id);
  assert.ok(hp() < hp0, 'the torn door slung back lands on the bared bays');
  h.capSys.destroy();
});

test('the tear tick is deterministic on the new scores', () => {
  const tearTick = () => {
    const h = bootScoreFight('capital_boss_casket_worm');
    const spec = requireCapitalBossEncounter('capital_boss_casket_worm');
    const plate = spec.plates.find((p) => p.id === 'fore_segment');
    tick(h, 5);
    latchAt(h, plateAnchorLocal(h, plate.id), plate.holdTension + 0.05);
    for (let t = 0; t < 90; t += 1) {
      tick(h, 1);
      if (!plateRec(h, 'fore_segment').attached) { h.capSys.destroy(); return t; }
    }
    h.capSys.destroy();
    return -1;
  };
  assert.ok(tearTick() > 0, 'the fore segment tears');
  assert.equal(tearTick(), tearTick(), 'same seed, same tick');
});

test('the Last Argument remains the exception — data-only plates, never live bodies', () => {
  const spec = requireCapitalBossEncounter(LAST_ARGUMENT.scoreId);
  assert.ok(spec.plates.length >= 2, 'its plates stay authored');
  // _platesLive's exclusion is the whole claim: a fight record on its id never steps plates.
  const h = bootScoreFight(LAST_ARGUMENT.scoreId);
  const rec = fightRec(h);
  rec.bossId = h.boss.id;
  const plate = spec.plates[0];
  tick(h, 5);
  latchAt(h, plateAnchorLocal(h, plate.id), plate.holdTension + 0.05);
  tick(h, 45);
  assert.equal(plateRec(h, plate.id).attached, true, 'its plates never tear into bodies');
  assert.equal(plateSpawns(h).length, 0, 'no slab spawns');
  assert.equal(h.boss.data.capitalPlateCover || null, null, 'no cover is stamped');
  h.capSys.destroy();
});
