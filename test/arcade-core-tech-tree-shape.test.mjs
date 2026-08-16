import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  TECH_BRANCH_IDS,
  TECH_CAPSTONES,
  TECH_FEATS,
  branchFeatStatus,
  initialTechProgression,
  reduceTechProgression,
  techEconomyAudit,
  techNodeVisible,
  techRespecPlan,
} from '../src/data/techProgression.js';
import { fields, PAIRED_WELL_ARM_S, PAIRED_WELL_TECH_ID } from '../src/systems/fields.js';
import { ships } from '../src/systems/ships.js';
import { describeTechNodeReadiness } from '../src/ui/screens/techTree.js';

const STABLE_TECH_IDS = Object.freeze([
  'tech_combat_basics', 'tech_beam_focusing', 'tech_kinetic_drivers', 'tech_guided_ordnance',
  'tech_plasma_dynamics', 'tech_deflector_theory', 'tech_hardened_deflectors', 'tech_strike_craft',
  'tech_fire_control', 'tech_warship_license', 'tech_capital_weapons', 'tech_capital_hulls',
  'tech_flagship_command', 'tech_industrial_mining', 'tech_focused_extraction',
  'tech_deep_core_mining', 'tech_bulk_logistics', 'tech_matter_compression', 'tech_drive_tuning',
  'tech_impulse_ballistics', 'tech_graviton_drives', 'tech_long_range_survey',
  'tech_tractor_systems', 'tech_drone_control', 'tech_drone_swarm', 'tech_autonomous_fleets',
  'tech_nanofabrication', 'tech_outpost_charter',
]);

function node(id) {
  const found = TECH_NODES.find((entry) => entry.id === id);
  assert.ok(found, `missing tech node ${id}`);
  return found;
}

test('the stable 28-node catalog becomes four fantasies with one genuine verb capstone each', () => {
  assert.deepEqual(TECH_NODES.map((entry) => entry.id), STABLE_TECH_IDS);
  assert.deepEqual([...new Set(TECH_NODES.map((entry) => entry.branch))].sort(), [...TECH_BRANCH_IDS].sort());

  const capstones = TECH_NODES.filter((entry) => entry.capstone);
  assert.equal(capstones.length, 4);
  for (const branch of TECH_BRANCH_IDS) {
    const capstone = node(TECH_CAPSTONES[branch]);
    assert.equal(capstone.branch, branch);
    assert.equal(capstone.featGate.length, 3);
    assert.equal(capstone.unlocks.verbs.includes(capstone.capstone.verb), true);
  }
  assert.ok(node('tech_fire_control').unlocks.modules.includes('mod_twin_bridle_m'));
  assert.ok(node('tech_outpost_charter').unlocks.outpostConstruction);
  assert.ok(node('tech_long_range_survey').unlocks.modules.includes('mod_sensor_post'));
  assert.equal(node('tech_flagship_command').capstone.verb, 'paired_wells');
});

test('feat gates stay absent until canonical field records complete, then reveal once', () => {
  const player = { researchedNodes: [], techProgression: initialTechProgression() };
  const capstone = node('tech_flagship_command');
  assert.equal(techNodeVisible(capstone, player), false);
  assert.equal(describeTechNodeReadiness(capstone, { player }).state, 'hidden');

  let progression = player.techProgression;
  let tick = 1;
  const reduce = (event, payload, context = {}) => {
    const result = reduceTechProgression(progression, event, payload, { playerId: 1, tick: tick++, ...context });
    progression = result.progression;
    return result;
  };
  for (let id = 10; id < 13; id += 1) {
    reduce('entity:killed', { id, killerId: 1, presentation: { style: { id: 'terrain_smash', chainDepth: 0 } } });
  }
  for (let id = 20; id < 22; id += 1) {
    reduce('entity:killed', { id, killerId: 1, presentation: { style: { id: 'well_collapse', chainDepth: 0 } } });
  }
  const reveal = reduce('entity:killed', {
    id: 30,
    killerId: 1,
    presentation: { style: { id: 'chain', chainDepth: 3 } },
  });
  player.techProgression = progression;
  assert.deepEqual(reveal.newlyRevealedBranches, ['kinesis']);
  assert.equal(branchFeatStatus('kinesis', player).revealed, true);
  assert.equal(techNodeVisible(capstone, player), true);
  assert.equal(describeTechNodeReadiness(capstone, { player }).state, 'locked',
    'revealed capstone still honors its ordinary prerequisite graph');

  const duplicate = reduceTechProgression(progression, 'entity:killed', {
    id: 30,
    killerId: 1,
    presentation: { style: { id: 'chain', chainDepth: 3 } },
  }, { playerId: 1, tick: 999 });
  assert.equal(duplicate.changed, false, 'one canonical kill receipt cannot count twice');
});

test('every authored feat consumes the matching production-owner payload shape', () => {
  let progression = initialTechProgression();
  let tick = 100;
  const apply = (event, payload, context = {}) => {
    progression = reduceTechProgression(progression, event, payload, {
      playerId: 1,
      tick: tick++,
      ...context,
    }).progression;
  };

  for (let id = 1; id <= 3; id += 1) apply('entity:killed', {
    id: `terrain-${id}`, killerId: 1, presentation: { style: { id: 'terrain_smash' } },
  });
  for (let id = 1; id <= 2; id += 1) apply('entity:killed', {
    id: `well-${id}`, killerId: 1, presentation: { style: { id: 'well_collapse' } },
  });
  apply('entity:killed', { id: 'chain', killerId: 1, presentation: { style: { id: 'chain', chainDepth: 3 } } });

  for (let id = 1; id <= 3; id += 1) apply('entity:killed', {
    id: `tether-${id}`, killerId: 1, presentation: { style: { id: 'ordinary' } },
  }, { tetherTargetId: `tether-${id}` });
  apply('capital:resolved', { entityId: 50, actorId: 1, outcome: 'towed' });
  for (let id = 1; id <= 3; id += 1) apply('tether:cut', { targetId: id, slingshot: true });

  apply('mining:resonanceResolved', { asteroidId: 60, cycleId: 1, minerId: 1, grade: 'perfect' });
  for (let id = 1; id <= 3; id += 1) apply('asteroid:chunked', { chunkId: id, minerId: 1, bulkCore: true });
  apply('claim:raidRepelled', { bodyId: 'claim-a', defenseId: 'defense-a', outcome: 'defended' });

  for (let id = 1; id <= 12; id += 1) apply('scan:completed', { signalCount: 1, sectorId: `scan-${id}` });
  apply('encounter:resolved', { encounterId: 'ambush-a', shape: 'ambush_snare', outcome: 'cleared' });
  apply('encounter:resolved', { encounterId: 'ambush-b', shape: 'ghost_on_the_bearing', outcome: 'escaped' });
  apply('scanner:ghostRevealed', { entityId: 'quiet-ghost', stage: 3 });

  assert.deepEqual(Object.keys(progression.feats).sort(), TECH_FEATS.map((entry) => entry.id).sort());
  assert.equal(TECH_BRANCH_IDS.every((branch) => branchFeatStatus(branch, { techProgression: progression }).revealed), true);
});

test('the generic player save owner round-trips earned feat records without changing an empty run', () => {
  const saveSystem = Object.create(save);
  saveSystem.state = { player: { credits: 5, cargo: { items: {} } } };
  assert.equal(Object.hasOwn(saveSystem._serializePlayer(), 'techProgression'), false);

  const earned = reduceTechProgression(undefined, 'capital:resolved', {
    entityId: 81, actorId: 1, outcome: 'towed',
  }, { playerId: 1, tick: 40 }).progression;
  saveSystem.state.player.techProgression = earned;
  const serialized = saveSystem._serializePlayer();
  delete saveSystem.state.player.techProgression;
  saveSystem._restorePlayer(structuredClone(serialized));
  assert.deepEqual(saveSystem.state.player.techProgression, earned);
  assert.deepEqual(saveSystem.state.player.cargo, { items: {} }, 'cargo remains under its own save key');
});

test('RP envelopes cap one complete branch by midgame and two by endgame for both playstyles', () => {
  const audit = techEconomyAudit(TECH_NODES);
  assert.deepEqual(audit.branchTotals, { kinesis: 212, bond: 210, industry: 235, ghost: 215 });
  assert.equal(audit.playstyles.combat.midgameCapsOne, true);
  assert.equal(audit.playstyles.combat.endgameCapsTwo, true);
  assert.equal(audit.playstyles.industry.midgameCapsOne, true);
  assert.equal(audit.playstyles.industry.endgameCapsTwo, true);
});

test('Paired-Well Command gives the live field owner two aimed Wells that move a bot', async () => {
  const flagBefore = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  let physicsSystem = null;
  try {
    const sim = createSimulation({ seed: 460046, bus: createBus(), systems: [fields, physics] });
    const { state } = sim;
    state.mode = 'flight';
    state.input.actions = {};
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: -250 }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 12, hull: 200, hullMax: 200, collides: true, flags: {}, flightModel: { inertia: 88 },
      physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
      data: { combatProfileId: 'combat_profile_standard_ship' },
    });
    const bot = sim.spawn({
      type: 'ship', team: 2, pos: { x: 20, z: 20 }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 10, hull: 120, hullMax: 120, collides: true, flags: {}, flightModel: { inertia: 80 },
      physicsBody: { schemaVersion: 1, radius: 10, mass: 80, inertiaY: 80, dynamic: true, ccd: true, material: 'ship', revision: 0 },
      data: { ai: true, combatProfileId: 'combat_profile_standard_ship' },
    });
    state.playerId = player.id;
    state.player.researchedNodes = [];
    physicsSystem = sim.registry.get('physics');
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await physicsSystem.prepareBackend(state), true);

    const denied = [];
    sim.bus.on('fields:deployDenied', (payload) => denied.push(payload));
    const deploy = (aim) => {
      state.input.aimWorld = aim;
      state.input.actions.deployWell = true;
      sim.step();
      assert.equal(state.input.actions.deployWell, false);
    };

    deploy({ x: 120, z: 20 });
    for (let i = 0; i < Math.ceil(PAIRED_WELL_ARM_S / SIM_DT) + 1; i += 1) sim.step();
    deploy({ x: -120, z: 20 });
    assert.equal(Object.keys(state.fields.deployed).length, 1, 'ordinary authority cannot overlap two Wells');
    assert.equal(denied.at(-1)?.reason, 'cooldown');

    state.player.researchedNodes.push(PAIRED_WELL_TECH_ID);
    deploy({ x: -120, z: 20 });
    const pair = Object.values(state.fields.deployed);
    assert.equal(pair.length, 2, 'capstone creates two simultaneous physical emitters');
    const centers = pair.map((rec) => state.entities.get(rec.emitterId)?.pos).filter(Boolean);
    assert.equal(centers.length, 2);
    assert.ok(centers[0].x * centers[1].x < 0, 'the two live owners preserve separately aimed placements');
    assert.ok(centers.every((center) => Math.hypot(bot.pos.x - center.x, bot.pos.z - center.z) < 190),
      'the bot begins inside both live field radii');

    const before = { x: bot.pos.x, z: bot.pos.z };
    for (let i = 0; i < 45; i += 1) sim.step();
    assert.ok(Math.hypot(bot.pos.x - before.x, bot.pos.z - before.z) > 0.1,
      'the production field and physics owners move the bot');
    assert.ok(state.fields.telemetry.affected >= 1);
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    FIELD_FLAGS.enabled = flagBefore;
  }
});

test('station respec uses the writers, closes dependents, unfits verbs, and removes exact efficiency deltas', () => {
  const state = {
    tick: 400,
    simTime: 20,
    playerId: 1,
    entities: new Map(),
    player: {
      credits: 50_000,
      researchPoints: 0,
      researchedNodes: ['tech_tractor_systems', 'tech_bulk_logistics', 'tech_fire_control', 'tech_capital_weapons'],
      techProgression: initialTechProgression(),
      ownedShips: [{ defId: 'ship_drifter', fittings: ['mod_twin_bridle_m'] }],
      activeShipIndex: 0,
      moduleInventory: [],
      cargo: { usedVolume: 0 },
      efficiencyMods: { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, tradeFeeMult: 1 },
      droneTierCap: 0,
    },
    ui: { docked: true, dockedStationId: 'station_helios' },
  };
  const bus = createBus();
  const charged = [];
  const granted = [];
  bus.on('economy:chargeCredits', ({ amount }) => { state.player.credits -= amount; charged.push(amount); });
  bus.on('research:grant', ({ amount }) => { state.player.researchPoints += amount; granted.push(amount); });
  const system = Object.create(ships);
  system.init({ state, bus, helpers: {} });

  const plan = techRespecPlan(state.player.researchedNodes, 'bond', TECH_NODES);
  assert.deepEqual(plan.removed.sort(), ['tech_bulk_logistics', 'tech_fire_control', 'tech_tractor_systems']);
  assert.equal(system.respecTech('bond'), true);
  assert.deepEqual(charged, [8000]);
  assert.deepEqual(granted, [210]);
  assert.deepEqual(state.player.researchedNodes, ['tech_capital_weapons']);
  assert.equal(state.player.ownedShips[0].fittings[0], null);
  assert.equal(state.player.moduleInventory[0].defId, 'mod_twin_bridle_m');

  state.player.researchedNodes = ['tech_drive_tuning', 'tech_long_range_survey'];
  state.player.efficiencyMods.jumpRangeMult = 1.35; // 1 + 0.20 tech + 0.15 unrelated bonus
  state.player.efficiencyMods.jumpCooldownMult = 0.75; // 1 - 0.15 tech - 0.10 unrelated bonus
  assert.equal(system.respecTech('ghost'), true);
  assert.deepEqual(charged, [8000, 6500]);
  assert.deepEqual(granted, [210, 130]);
  assert.ok(Math.abs(state.player.efficiencyMods.jumpRangeMult - 1.15) < 1e-9);
  assert.ok(Math.abs(state.player.efficiencyMods.jumpCooldownMult - 0.9) < 1e-9);
});
