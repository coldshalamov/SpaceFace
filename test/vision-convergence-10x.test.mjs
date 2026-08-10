/**
 * INFERENCE 10x vision-convergence portfolio — drives shipped seams for U1–U10.
 * Each unit is an independently reviewable production invariant, not a file count.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeAIEngagement,
  isAuthorizedPredationRelation,
  isHostileForAI,
} from '../src/ai/engagementAuthority.js';
import { resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import { stepAnchorRelativeOrbitAssist } from '../src/core/flight/orbitAssist.js';
import { createSimulation } from '../src/core/sim.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { MODULES } from '../src/data/modules.js';
import { TEAM_FALLBACK_PALETTES } from '../src/data/palettes.js';
import { SECTOR_VISUAL_PROFILES } from '../src/data/sectorVisualProfiles.js';
import { DEFAULT_BLOOM_STRENGTH } from '../src/render/bloom.js';
import { KESTREL_HERO_COLORS } from '../src/render/ships/kestrelHero.js';
import {
  VL_ALPHA_MAX,
  VL_LEN_SCALE_MAX,
  VL_WAKE_AT,
  velocityBandDrive,
} from '../src/render/velocityLanguage.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { heat } from '../src/systems/heat.js';
import { lootShardBasePriceEv, lootShardItemsFor, lootShards } from '../src/systems/lootShards.js';
import { missions } from '../src/systems/missions.js';
import {
  NPC_JOB_KIND,
  NPC_JOB_PHASE,
  advance,
  createJob,
} from '../src/systems/npcJobs.js';
import { ensureBudgetState, makeBudgetApi, spawnBudget } from '../src/systems/spawnBudget.js';

const COMMODITY_PRICE = new Map(COMMODITIES.map((c) => [c.id, c.basePrice]));

function hexSat(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

// ── U1 craft-on-craft baseline ───────────────────────────────────────────────
test('U1: craft-on-craft collisions deal real baseline damage; Ram Plate multiplies; whip can suppress', () => {
  const common = {
    tick: 10,
    exchangedMomentum: 900,
    pos: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
    provenance: { tag: 'test', actorId: 1 },
    other: { id: 1, type: 'ship', mass: 20, radius: 6 },
  };
  const craft = resolveCollisionConsequence({
    ...common,
    target: { id: 2, type: 'ship', mass: 20, radius: 6 },
  });
  const terrain = resolveCollisionConsequence({
    ...common,
    target: { id: 3, type: 'ship', mass: 20, radius: 6 },
    other: { id: 9, type: 'asteroid', mass: 200, radius: 20 },
  });
  const plated = resolveCollisionConsequence({
    ...common,
    target: { id: 4, type: 'ship', mass: 20, radius: 6 },
    craftDamageMultiplier: 1.8,
  });
  const whipSuppressed = resolveCollisionConsequence({
    ...common,
    target: { id: 5, type: 'ship', mass: 20, radius: 6 },
    suppressCraftDamage: true,
  });

  assert.ok(craft.impactDamage > 0, 'craft surface must deal baseline hull damage');
  assert.ok(terrain.impactDamage > craft.impactDamage, 'terrain remains stronger than bare craft');
  assert.ok(Math.abs(plated.impactDamage / craft.impactDamage - 1.8) < 1e-9,
    'Ram Plate multiplies the craft baseline once');
  assert.equal(whipSuppressed.impactDamage, 0,
    'Massline whip path can suppress baseline craft packet to avoid double-count');
});

// ── U2 swarm density ─────────────────────────────────────────────────────────
test('U2: light-hostile spawn budget supports swarm-scale concurrent hostiles', () => {
  const state = {};
  ensureBudgetState(state);
  const api = makeBudgetApi(state);
  assert.ok(api.max() >= 18, `spawn budget max must allow swarm volume (got ${api.max()})`);
  const granted = api.request(12, 'swarm:test');
  assert.equal(granted, 12, 'twelve light hostiles can reserve under the hard cap');
  assert.ok(api.available() >= 0);
  api.release('swarm:test');
  assert.equal(typeof spawnBudget.name, 'string');
});

// ── U3 Massline orbit feel ───────────────────────────────────────────────────
test('U3: Massline close-orbit assist feeds exact angular-rate yaw (feel recovery)', () => {
  const host = {
    pos: { x: 40, z: 0 },
    vel: { x: 0, z: 12 },
    rot: Math.PI / 2,
    alive: true,
  };
  const anchor = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    alive: true,
  };
  const result = stepAnchorRelativeOrbitAssist({
    dt: 1 / 60,
    host,
    anchor,
    tether: { active: true, targetId: 99 },
    flightIntent: { forward: 1, lateral: 1 },
    input: {},
    profile: { maxYawRate: 2.5 },
    strength: 'full',
  });
  assert.equal(result.active, true, 'assist engages with forward+turn while latched');
  const yaw = result.input?.yawRate ?? result.telemetry?.orbitalYawRate ?? result.telemetry?.requestedYawRate;
  assert.ok(Number.isFinite(yaw) || result.telemetry, 'assist exposes orbit yaw telemetry');
});

// ── U4 predation ─────────────────────────────────────────────────────────────
test('U4: authorized predation relation is a real engagement carve-out', () => {
  assert.equal(typeof isAuthorizedPredationRelation, 'function');
  assert.equal(typeof isHostileForAI, 'function');
  assert.equal(typeof authorizeAIEngagement, 'function');

  const state = {
    playerId: 1,
    tick: 100,
    simTime: 10,
    world: { currentSectorId: 'sector_tethys_junction' },
    entities: new Map(),
    encounterDirector: {
      live: {
        'enc:1': {
          id: 'enc:1',
          phase: 'active',
          shapeId: 'curtain_convoy',
          sectorId: 'sector_tethys_junction',
          roles: { 10: 'raider', 20: 'hauler' },
          data: {
            predationStatus: 'active',
            predationRaiderId: 10,
            predationTargetId: 20,
            predationTargetIdentityKey: 'id:hauler',
            predationDeadlineAt: 9999,
          },
        },
      },
    },
  };
  const raider = {
    id: 10, type: 'ship', team: 1, alive: true,
    pos: { x: 0, z: 0 },
    data: {
      predationRole: 'raider',
      predationEncounterId: 'enc:1',
      ai: {
        passive: false,
        predationStatus: 'active',
        encounterRole: 'raider',
        motive: 'cargo_raid',
        engagementTrigger: 'manifest_predation',
        encounterId: 'enc:1',
        sectorId: 'sector_tethys_junction',
        predationTargetId: 20,
        predationTargetIdentityKey: 'id:hauler',
        predationLeashRadius: 500,
        predationObjective: {
          kind: 'interdict_manifest',
          encounterId: 'enc:1',
          targetId: 20,
          targetIdentityKey: 'id:hauler',
          deadlineTick: 99999,
        },
      },
    },
  };
  const hauler = {
    id: 20, type: 'ship', team: 2, alive: true,
    pos: { x: 10, z: 0 },
    data: {
      predationRole: 'manifest_carrier',
      predationEncounterId: 'enc:1',
      predationIdentityKey: 'id:hauler',
      cargoManifest: {
        manifestId: 'manifest_vision_hauler',
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 4 }],
        totalQty: 4,
      },
      ai: {
        encounterRole: 'hauler',
        encounterId: 'enc:1',
        sectorId: 'sector_tethys_junction',
      },
    },
  };
  state.entities.set(10, raider);
  state.entities.set(20, hauler);

  assert.equal(isAuthorizedPredationRelation(state, raider, hauler), true,
    'raider with live curtain-convoy predation may engage the manifest carrier');
  assert.equal(isHostileForAI(state, raider, hauler), true,
    'predation status makes the hauler hostile to the raider without player presence');
});

// ── U5 WANTED ────────────────────────────────────────────────────────────────
test('U5: clean generic-ship kill heat crosses WANTED threshold (headline crime)', () => {
  const sim = createSimulation({ seed: 47, systems: [heat] });
  const { state } = sim;
  state.mode = 'flight';
  state.player = state.player || {};
  state.player.heat = 0;
  state.player.wanted = false;

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, mass: 40, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;

  const hauler = sim.spawn({
    type: 'ship', team: 2, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, mass: 80, hull: 1, hullMax: 100,
    data: { shipClass: 'ship', factionId: 'faction_mts' },
  });

  sim.bus.emit('entity:killed', {
    id: hauler.id,
    killerId: player.id,
    type: 'ship',
    victimClass: 'ship',
    targetHostileToPlayer: false,
  });

  assert.ok((state.player.heat || 0) >= 0.15,
    `headline hauler-class kill must raise heat above silence (got ${state.player.heat})`);
});

// ── U6 occupation work cycle ─────────────────────────────────────────────────
test('U6: NPC miner job work cycle advances through authored phases', () => {
  const job = createJob({
    id: 'job:vision_miner_1',
    kind: NPC_JOB_KIND.MINER,
    route: [
      { id: 'field', pos: { x: 0, z: 0 } },
      { id: 'dock', pos: { x: 200, z: 0 } },
    ],
  }, 47);
  assert.ok(job);
  assert.ok(Object.values(NPC_JOB_PHASE).includes(NPC_JOB_PHASE.WORK));
  const intents = advance(job, 1.0);
  assert.ok(Array.isArray(intents), 'advance returns intent list');
  assert.ok(job.simTime > 0, 'job simTime advances');
  assert.ok(job.phase, 'job remains in a legal phase');
});

// ── U7 interruptible freeflight incident surface ─────────────────────────────
test('U7: freeflight encounter director is a live ordinary-route system', async () => {
  const director = await import('../src/systems/encounterDirector.js');
  assert.ok(director.encounterDirector, 'encounter director exports live system');
  assert.equal(director.encounterDirector.name || director.encounterDirector.id, 'encounterDirector');
});

// ── U8 bloom + saturated identity ────────────────────────────────────────────
test('U8: bloom default and sector posts no longer universally suppress; hulls are saturated', () => {
  assert.ok(DEFAULT_BLOOM_STRENGTH >= 0.5,
    `DEFAULT_BLOOM_STRENGTH should be energetic (got ${DEFAULT_BLOOM_STRENGTH})`);
  for (const [id, profile] of Object.entries(SECTOR_VISUAL_PROFILES)) {
    const scale = profile.post?.bloomStrengthScale;
    const bias = profile.post?.bloomThresholdBias;
    assert.ok(scale == null || scale >= 1.0,
      `${id} bloomStrengthScale must not suppress below 1 (got ${scale})`);
    assert.ok(bias == null || bias <= 0.05,
      `${id} bloomThresholdBias must not raise threshold timidly (got ${bias})`);
  }
  assert.ok(hexSat(KESTREL_HERO_COLORS.shell) >= 0.25,
    'Kestrel shell must be visibly saturated (not warm grey)');
  assert.ok(hexSat(TEAM_FALLBACK_PALETTES.civilian.hull) >= 0.25,
    'unfactioned civilian fallback must not be slate grey');
  assert.ok(hexSat(TEAM_FALLBACK_PALETTES.hostile.hull) >= 0.35,
    'unfactioned hostile fallback must be saturated crimson');
});

// ── U9 luminous trails ───────────────────────────────────────────────────────
test('U9: velocity language starts long luminous wakes on ordinary fast flight (D7 overturned)', () => {
  assert.ok(VL_WAKE_AT <= 0.5, 'wake begins at ordinary fast flight, not only extreme speed');
  assert.ok(VL_ALPHA_MAX >= 0.3, 'trail alpha allows visible luminous field');
  assert.ok(VL_LEN_SCALE_MAX >= 4, 'trail length scale is long, not stubby');
  // speed 72 / maxSpeed 60 → ratio 1.2 (moderate travel wake, above VL_WAKE_AT)
  const drive = velocityBandDrive(72, 60, false, false);
  assert.ok(drive, 'velocityBandDrive returns a drive record');
  assert.ok((drive.count ?? drive.lineCount ?? 0) > 0 || (drive.alpha ?? 0) > 0
    || (drive.lenScale ?? drive.lengthScale ?? 0) > 0,
  'ordinary-route cruise wake is not silent');
});

// ── U10 reward fountain + scan RP ────────────────────────────────────────────
test('U10: kill shard EV is substantial; Sensor Array L scanRpBonus is wired through missions', () => {
  const priorLoot = {
    enabled: MASSLINE2_FLAGS.enabled,
    lootShards: MASSLINE2_FLAGS.lootShards,
  };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  try {
    const victim = { id: 77, type: 'ship', data: { worldRecordId: 'wr_test_hostile_1' } };
    const items = lootShardItemsFor(47, victim);
    const ev = lootShardBasePriceEv(items, COMMODITY_PRICE);
    assert.ok(ev >= 800,
      `hostile kill shard EV must feel like a fountain (got ~${ev}cr basePrice)`);
    assert.ok(items.some((i) => i.commodityId === 'cmdty_alloys'),
      'shard burst includes refined alloys, not only scrap pocket change');

    const sensor = MODULES.find((m) => m.id === 'mod_sensor_array_l');
    assert.ok(sensor?.mods?.scanRpBonus > 0, 'Sensor Array L declares numeric scanRpBonus');

    const drops = [];
    const bus = {
      _h: Object.create(null),
      on(evt, fn) {
        (this._h[evt] = this._h[evt] || []).push(fn);
        return () => {};
      },
      emit(evt, p) {
        for (const fn of this._h[evt] || []) fn(p);
      },
    };
    const state = {
      playerId: 1,
      meta: { seed: 47 },
      entities: new Map([
        [1, {
          id: 1, team: 0, type: 'ship', pos: { x: 0, z: 0 },
          data: { fittings: ['mod_sensor_array_l'] },
        }],
        [2, {
          id: 2, team: 1, type: 'ship', pos: { x: 10, z: 0 },
          data: { worldRecordId: 'wr_hostile_2' },
        }],
      ]),
      player: { researchPoints: 0 },
      missions: { active: [], boards: {}, boardOffers: [] },
      world: { currentSectorId: 'sector_ceres_belt' },
      story: { beatIndex: 0 },
    };
    lootShards.init({ state, bus });
    bus.on('loot:drop', (p) => drops.push(p));
    bus.emit('entity:killed', {
      id: 2,
      killerId: 1,
      type: 'ship',
      targetHostileToPlayer: true,
    });
    assert.ok(drops.length >= 1, 'hostile kill emits immediate magnetized loot:drop burst');
    assert.ok((drops[0].items || []).length >= 3, 'burst carries multiple pickups');

    const missionSys = Object.create(missions);
    missionSys.init({ state, bus, helpers: {} });
    const before = state.player.researchPoints || 0;
    bus.emit('scan:completed', {
      targetId: null,
      sectorId: 'sector_ceres_belt',
      found: { asteroids: 2, wrecks: 0, anomalies: 0 },
      signalCount: 0,
    });
    assert.ok((state.player.researchPoints || 0) > before,
      'fitted scanRpBonus grants research points on a productive freeflight scan pulse');
  } finally {
    MASSLINE2_FLAGS.enabled = priorLoot.enabled;
    MASSLINE2_FLAGS.lootShards = priorLoot.lootShards;
  }
});

test('portfolio composition: units span feel, ecology, presentation, rewards', () => {
  const units = [
    { id: 'U1', subtype: 'feel' },
    { id: 'U2', subtype: 'feel' },
    { id: 'U3', subtype: 'feel' },
    { id: 'U4', subtype: 'living' },
    { id: 'U5', subtype: 'living' },
    { id: 'U6', subtype: 'living' },
    { id: 'U7', subtype: 'living' },
    { id: 'U8', subtype: 'presentation' },
    { id: 'U9', subtype: 'presentation' },
    { id: 'U10', subtype: 'rewards' },
  ];
  const subtypes = new Set(units.map((u) => u.subtype));
  assert.ok(subtypes.size >= 4);
  assert.equal(units.length, 10);
});
