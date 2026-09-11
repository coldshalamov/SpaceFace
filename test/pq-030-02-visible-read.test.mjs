// PQ-030.02 — blind-reviewer path from live silhouette + taut-sweep behaviour.
// Seed 30000. Imports shipped functions only (Range namer, leftover cutter, threat observer).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { masslineThreats, HOSTILE_SWEEP_THREAT_KIND } from '../src/systems/masslineThreats.js';
import {
  HOSTILE_SWEEP_BEHAVIOUR,
  MONOFILAMENT_CUT_INTEGRITY_COST,
  readTautHostileSweepCrossing,
  tetherGameplay,
} from '../src/systems/tetherGameplay.js';
import {
  TETHER_CUTTER_THREAT_FROM_VISIBLE_READ,
  masslineCutterBestiaryFacts,
  masslineCutterBestiarySubject,
  nameThreatFromVisibleRead,
  visibleReadFromLiveCutter,
} from '../src/ui/screens/range.js';

const SEED = 30000;
const DT = 1 / 60;

function stubCombatPhysics() {
  const joints = new Map();
  return {
    createAttachment(input) {
      const handle = {
        id: input.attachmentId,
        attachmentId: input.attachmentId,
        ownerId: input.ownerId,
        targetId: input.targetId,
      };
      joints.set(input.attachmentId, handle);
      return handle;
    },
    cutAttachment(input) {
      joints.delete(input.attachmentId);
      return true;
    },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return null; },
  };
}

function spawn(id, type, pos, extra = {}) {
  return {
    id,
    type,
    team: extra.team ?? 2,
    alive: true,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: extra.radius ?? 8,
    mass: extra.mass ?? 20,
    collides: true,
    hull: 100,
    hullMax: 100,
    flags: {},
    data: extra.data || {},
  };
}

test(`seed ${SEED}: a live corsair-blade spool + taut sweep names the cutter; a plain corsair does not`, () => {
  const raider = spawn(3, 'ship', { x: 0, z: 0 }, {
    team: 1,
    data: { enemyTypeId: 'tether_control_raider', lootTableId: 'tether_control_raider' },
  });
  const corsair = spawn(9, 'ship', { x: 10, z: 0 }, {
    team: 1,
    data: { enemyTypeId: 'corsair_raider', lootTableId: 'corsair_raider' },
  });
  const hull = ENEMY_TYPES.find((row) => row.id === 'tether_control_raider');
  const other = ENEMY_TYPES.find((row) => row.id === 'corsair_raider');
  assert.equal(hull.silhouette, 'corsair_blade');
  assert.equal(other.silhouette, 'corsair_blade', 'shared blade hull must not steal the sentence');
  assert.equal(other.telegraph, undefined);

  const slack = visibleReadFromLiveCutter(raider, { taut: false });
  assert.equal(nameThreatFromVisibleRead(slack), null, 'hull without taut sweep is not the threat');

  const live = visibleReadFromLiveCutter(raider, { taut: true });
  assert.equal(live.silhouette, 'corsair_blade');
  assert.equal(live.telegraph, 'attach_spool');
  assert.equal(live.verb, 'cut_line');
  assert.equal(live.sweep, HOSTILE_SWEEP_BEHAVIOUR);
  assert.equal('id' in live, false);
  assert.equal('planId' in live, false);
  assert.equal(nameThreatFromVisibleRead(live), TETHER_CUTTER_THREAT_FROM_VISIBLE_READ);

  const stolen = visibleReadFromLiveCutter(corsair, { taut: true });
  assert.equal(nameThreatFromVisibleRead(stolen), null);
  console.log(`SEED=${SEED} LIVE_READ named="${nameThreatFromVisibleRead(live)}" corsair_raider=null`);
});

test(`seed ${SEED}: MASSLINE bestiary subject is the spooling corsair, not a training drone`, () => {
  const subject = masslineCutterBestiarySubject();
  assert.ok(subject);
  assert.equal(subject.name, 'Tether-Control Raider');
  assert.equal(subject.id, 'tether_control_raider');
  assert.match(subject.behavior, /Massline/i);
  const facts = masslineCutterBestiaryFacts();
  const threatRow = facts.find((row) => row[0] === 'Threat');
  assert.ok(threatRow);
  assert.equal(threatRow[1], TETHER_CUTTER_THREAT_FROM_VISIBLE_READ);
  assert.equal(subject.name.includes('Training'), false);
  console.log(`SEED=${SEED} BESTIARY name="${subject.name}" threat="${threatRow[1]}"`);
});

test(`seed ${SEED}: leftover taut sweep cuts the player line and the observer names that behaviour`, () => {
  const player = spawn(1, 'ship', { x: 50, z: -40 }, { team: 0 });
  const rock = spawn(2, 'asteroid', { x: 50, z: 40 }, { mass: 800, radius: 16, team: null });
  const raider = spawn(3, 'ship', { x: 0, z: 0 }, {
    team: 1,
    data: {
      lootTableId: 'tether_control_raider',
      enemyTypeId: 'tether_control_raider',
      ai: { forcePlayerTarget: true },
    },
  });
  const pin = spawn(4, 'asteroid', { x: 100, z: 0 }, { mass: 800, radius: 16, team: null });
  const entityList = [player, rock, raider, pin];
  const entities = new Map(entityList.map((entity) => [entity.id, entity]));
  const state = {
    mode: 'flight',
    simTime: 1,
    tick: 60,
    seed: SEED,
    rng: mulberry32(SEED),
    playerId: player.id,
    player: {
      tether: {
        active: true,
        targetId: rock.id,
        strain: 0.6,
        load: 0.6,
        attachmentId: null,
        restLength: 80,
        phase: 'loaded',
      },
    },
    entities,
    entityList,
    input: { actions: { tetherFire: false, tetherCut: false, reelDelta: 0 } },
    runtime: { profileId: 'production', features: PRODUCTION_FEATURES },
    combat: null,
  };
  ensureCombatState(state);

  const bus = createBus();
  const cuts = [];
  const threats = [];
  bus.on('massline:playerLineCut', (payload) => cuts.push(payload));
  bus.on('massline:threat', (payload) => threats.push(payload));
  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics() };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const cutter = Object.assign({}, tetherGameplay);
  cutter.init({
    state,
    bus,
    helpers,
    registry: {
      get(name) {
        if (name === 'actions' || name === 'combat') return { kernel };
        return null;
      },
    },
  });
  const observer = Object.assign({}, masslineThreats);
  observer.init({
    state,
    bus,
    helpers,
    registry: {
      get(name) {
        if (name === 'actions' || name === 'combat') return { kernel };
        return null;
      },
    },
  });

  const playerLine = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: rock.id,
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld: { x: rock.pos.x, y: 0, z: rock.pos.z },
  });
  assert.equal(playerLine.ok, true);
  state.player.tether.attachmentId = playerLine.attachment.id;
  cutter._active = { attachmentId: playerLine.attachment.id, targetId: rock.id, type: 'tether_standard' };

  const blade = attachments.create({
    defId: 'tether_standard',
    ownerId: raider.id,
    targetId: pin.id,
    controlMode: 'npc_tow',
    sourceWorld: { x: raider.pos.x, y: 0, z: raider.pos.z },
    targetWorld: { x: pin.pos.x, y: 0, z: pin.pos.z },
  });
  assert.equal(blade.ok, true);

  cutter.update(DT, state);
  observer.update(DT, state);

  assert.equal(state.combat.attachments.byId[playerLine.attachment.id].state, 'broken');
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].cutterId, raider.id);
  assert.equal(cuts[0].headId, 'monofilament_sweep');
  assert.equal(cuts[0].integrity, 1 - MONOFILAMENT_CUT_INTEGRITY_COST);

  const crossing = readTautHostileSweepCrossing(state, player);
  assert.ok(crossing);
  assert.equal(crossing.cutterId, raider.id);
  assert.equal(crossing.taut, true);

  const named = nameThreatFromVisibleRead(visibleReadFromLiveCutter(raider, { taut: crossing.taut }));
  assert.equal(named, TETHER_CUTTER_THREAT_FROM_VISIBLE_READ);

  const sweepThreats = threats.filter((row) => row.kind === HOSTILE_SWEEP_THREAT_KIND);
  assert.equal(sweepThreats.length, 1, 'observer emits one hostile-sweep per cutter per latch');
  assert.equal(sweepThreats[0].targetId, raider.id);
  assert.equal(state.player.masslineThreats.latest.kind, HOSTILE_SWEEP_THREAT_KIND);

  observer.update(DT, state);
  assert.equal(threats.filter((row) => row.kind === HOSTILE_SWEEP_THREAT_KIND).length, 1,
    'hostile-sweep throttles per cutter, not per tick');
  console.log(`SEED=${SEED} SWEEP_CUT=1 THREAT=${HOSTILE_SWEEP_THREAT_KIND} named="${named}"`);
});
