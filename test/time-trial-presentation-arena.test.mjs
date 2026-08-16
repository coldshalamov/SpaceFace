import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { physics } from '../src/core/physics.js';
import { makeEntity } from '../src/core/entity.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { VESTA_STATION_ARENA, timeTrialLocalBoard } from '../src/data/timeTrialCourses.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { ContrailTrail } from '../src/render/thruster/ribbon/contrailTrail.js';
import { actions } from '../src/systems/actions.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { lootShards } from '../src/systems/lootShards.js';
import { mining } from '../src/systems/mining.js';
import { missions } from '../src/systems/missions.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { timeTrials } from '../src/systems/timeTrials.js';
import { solveLeadAngle, weapons } from '../src/systems/weapons.js';

const PLAYER_WEAPON_ID = 'wpn_siege_lance_l';

function canvasStub() {
  const context = {
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => canvasStub() };
globalThis.__SF_VISUAL_FACTORY_THROW__ = true;

async function bootArena(t, seed = 50_500) {
  const priorLootFlags = {
    enabled: MASSLINE2_FLAGS.enabled,
    lootShards: MASSLINE2_FLAGS.lootShards,
  };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  t.after(() => Object.assign(MASSLINE2_FLAGS, priorLootFlags));
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  const sim = createSimulation({
    seed,
    systems: [missions, aftermathWrecks, lootShards, mining, tactical, physics, aiPorts,
      actions, flightV3, weapons, combat, economy, timeTrials],
    updateOrder: [tactical, actions, flightV3, aiPorts, weapons, physics, combat,
      economy, timeTrials, aftermathWrecks, lootShards, mining, missions],
  });
  t.after(() => {
    sim.registry.get('physics')._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = VESTA_STATION_ARENA.sectorId;
  state.world.activeSector = { id: VESTA_STATION_ARENA.sectorId, pois: [] };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.difficulty = 'standard';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  const player = sim.spawn(makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    player: state.player,
    pos: { x: 0, z: 0 },
    fittings: fittingsFromDefaultModules('ship_bastion', Array(4).fill(PLAYER_WEAPON_ID)),
  }));
  state.playerId = player.id;
  state.player.targetId = null;
  const events = [];
  for (const name of [
    'timeTrial:arenaQueued', 'timeTrial:arenaStarted', 'timeTrial:arenaWaveStarted',
    'timeTrial:arenaWaveCleared', 'timeTrial:arenaCompleted', 'timeTrial:arenaAborted',
    'timeTrial:arenaRejected', 'economy:grantCredits', 'entity:killed', 'combat:fire',
    'projectile:hit', 'loot:drop', 'research:grant', 'research:pointsChanged',
  ]) bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  bus.emit('sector:enter', { sectorId: VESTA_STATION_ARENA.sectorId });
  return { sim, state, bus, player, events, tactical, runtime: sim.registry.get('timeTrials') };
}

function eventsOf(route, name) { return route.events.filter((event) => event.name === name); }

function requestArena(route, tierId) {
  route.bus.emit('dock:docked', { stationId: VESTA_STATION_ARENA.stationId });
  route.bus.emit('timeTrial:arenaRequest', { tierId });
  assert.equal(eventsOf(route, 'timeTrial:arenaQueued').at(-1)?.payload?.tierId, tierId);
  route.bus.emit('dock:undocked', { committed: true, source: 'test-arena' });
  route.sim.step(SIM_DT);
}

function clearPlayerFire(route) {
  route.state.input.fire = false;
  route.state.input.fireGroup = null;
  route.state.input.autoAim = null;
  route.state.player.targetId = null;
  route.state.input.turnIntent = 0;
}

function playerVitals(player) {
  return (player.hull || 0) + (player.armorHp || 0) + (player.shield || 0);
}

function wrapAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function awaitHostileReturnFire(route) {
  const vitalsBefore = playerVitals(route.player);
  for (let guard = 0; guard < 360; guard++) {
    route.sim.step(SIM_DT);
    const liveIds = new Set(route.runtime.getRuntimeState().arenaRun?.enemyIds || []);
    const hostileFire = eventsOf(route, 'combat:fire').find((event) => liveIds.has(event.payload.ownerId));
    if (hostileFire) {
      assert.ok(route.tactical.stack?.lastResult?.decisions?.some((decision) => liveIds.has(decision.entityId)),
        'the firing arena actor is owned by the live Tactical decision stack');
      return { hostileFire, vitalsBefore, vitalsAfter: playerVitals(route.player) };
    }
  }
  assert.fail(`arena Tactical never returned fire: ${JSON.stringify(route.tactical.stack?.lastResult?.decisions || [])}`);
}

function shootArenaEnemy(route, enemy) {
  route.state.player.targetId = enemy.id;
  route.state.input.autoAim = { targetId: enemy.id };
  try {
    for (let guard = 0; guard < 360 && enemy.alive !== false; guard++) {
      const projectileSpeed = route.player.data.weapons
        .find((weapon) => Number.isFinite(weapon.projSpeed))?.projSpeed || 600;
      const aimAngle = solveLeadAngle(route.player, enemy, projectileSpeed);
      route.state.input.aimAngle = aimAngle;
      route.state.input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(aimAngle - route.player.rot) / 0.42));
      route.state.input.fire = true;
      route.state.input.fireGroup = 1;
      route.sim.step(SIM_DT);
    }
  } finally {
    clearPlayerFire(route);
  }
  assert.equal(enemy.alive, false, `production player fire did not defeat arena actor ${enemy.id}: ${JSON.stringify({
    player: route.player.pos,
    enemy: enemy.pos,
    hits: eventsOf(route, 'projectile:hit').filter((event) => event.payload.ownerId === route.player.id).slice(-8),
  })}`);
  assert.ok(eventsOf(route, 'projectile:hit').some((event) => (
    event.payload.ownerId === route.player.id && event.payload.targetId === enemy.id
  )), `arena actor ${enemy.id} must receive a real player projectile`);
}

function clearLiveArena(route) {
  for (let guard = 0; guard < 900 && route.runtime.getRuntimeState().arenaRun; guard++) {
    const run = route.runtime.getRuntimeState().arenaRun;
    if (run.enemyIds.length === 0) {
      route.sim.step(SIM_DT);
      continue;
    }
    for (const id of run.enemyIds) {
      const enemy = route.state.entities.get(id);
      assert.equal(enemy?.type, 'ship');
      assert.ok(enemy?.data?.weapons?.length > 0, 'arena combatants retain their production weapons');
      assert.equal(enemy?.data?.noOrdinaryRewards, true);
      shootArenaEnemy(route, enemy);
    }
    route.sim.step(SIM_DT);
  }
  return eventsOf(route, 'timeTrial:arenaCompleted').at(-1)?.payload || null;
}

test('Plan 50: Forgeyard arena runs real zero-bounty combat waves, advances its ladder, and pays once', async (t) => {
  const route = await bootArena(t);
  const startingCredits = route.state.player.credits;
  const startingResearch = route.state.player.researchPoints;
  requestArena(route, 'spar');
  route.sim.step(SIM_DT);
  const firstWave = route.runtime.getRuntimeState().arenaRun;
  assert.equal(firstWave.tierId, 'spar');
  assert.ok(firstWave.enemyIds.every((id) => route.state.entities.get(id)?.physicsBody),
    'the wave is made of live Rapier-backed combat ships');
  for (const id of firstWave.enemyIds) {
    const actor = route.state.entities.get(id);
    assert.equal(actor?.data?.bountyCr, 0);
    assert.equal(actor?.data?.loot, null);
    assert.equal(actor?.data?.lootTableId, null);
  }
  const returnFire = awaitHostileReturnFire(route);
  assert.ok(returnFire.hostileFire.payload.weaponId,
    'a live arena Tactical actor returns fire through the production Weapons owner');
  // The suppression marker is the production authority even if later authored metadata is present.
  // This adversarial mutation proves the generic Combat reward path stays closed independently of
  // the arena spawner's explicit zero values.
  const rewardProbe = route.state.entities.get(firstWave.enemyIds[0]);
  rewardProbe.data.bountyCr = 999;
  rewardProbe.data.lootTableId = 'arena_reward_probe';
  rewardProbe.data.loot = { credits: [40, 40], items: [{ id: 'ore_iron', qty: [1, 1], chance: 1 }] };
  const first = clearLiveArena(route);
  assert.equal(first?.tierId, 'spar');
  assert.ok(first?.score > 0);
  assert.equal(first?.creditDelta, VESTA_STATION_ARENA.tiers[0].creditReward);
  assert.equal(route.state.player.credits - startingCredits, VESTA_STATION_ARENA.tiers[0].creditReward);
  assert.deepEqual(eventsOf(route, 'economy:grantCredits').map((event) => event.payload.reason),
    ['time_trial_arena:spar'], 'ordinary bounties and loot never pay inside the arena');
  assert.equal(eventsOf(route, 'loot:drop').length, 0,
    'no generic loot receipt is materialized for an arena combatant');
  assert.equal([...route.state.entities.values()].filter((entity) => entity.type === 'pickup').length, 0,
    'no generic physical pickup is materialized for an arena combatant');
  assert.equal([...route.state.entities.values()].filter((entity) => entity.type === 'wreck').length, 0,
    'no generic or durable salvage wreck is materialized for an arena combatant');
  assert.equal(eventsOf(route, 'research:grant').length, 0);
  assert.equal(route.state.player.researchPoints, startingResearch,
    'sanctioned arena kills cannot advance ordinary hostile-kill research');
  assert.ok(eventsOf(route, 'entity:killed').filter((event) => event.payload.killerId === route.player.id)
    .every((event) => event.payload.bountyCr === 0 && event.payload.lootTableId == null
      && event.payload.ordinaryRewardsSuppressed === true));

  const board = timeTrialLocalBoard(route.state);
  assert.equal(board.locality, 'device');
  assert.equal(board.arena.find((tier) => tier.id === 'spar')?.bestScore, first.score);
  assert.equal(board.arena.find((tier) => tier.id === 'circuit')?.unlocked, true);
  assert.equal(Object.hasOwn(board, 'onlineLeaderboard'), false);

  requestArena(route, 'circuit');
  const circuit = clearLiveArena(route);
  assert.equal(circuit?.tierId, 'circuit');
  assert.equal(circuit?.creditDelta, VESTA_STATION_ARENA.tiers[1].creditReward);
  assert.equal(timeTrialLocalBoard(route.state).arena.find((tier) => tier.id === 'crown')?.unlocked, true);

  requestArena(route, 'crown');
  const crown = clearLiveArena(route);
  assert.equal(crown?.tierId, 'crown');
  assert.equal(crown?.creditDelta, VESTA_STATION_ARENA.tiers[2].creditReward);
  assert.equal(crown?.trailTintUnlocked, VESTA_STATION_ARENA.rewardTint.id);
  assert.equal(route.state.player.timeTrials.unlockedTrailTints[VESTA_STATION_ARENA.rewardTint.id], true);
  const crownHeavyWave = eventsOf(route, 'timeTrial:arenaWaveStarted')
    .find((event) => event.payload.tierId === 'crown' && event.payload.waveIndex === 2);
  assert.equal(crownHeavyWave?.payload?.enemyIds?.length, 1);
  assert.ok(eventsOf(route, 'entity:killed').some((event) => (
    event.payload.id === crownHeavyWave.payload.enemyIds[0]
      && event.payload.killerId === route.player.id
      && event.payload.ordinaryRewardsSuppressed === true
  )), 'the Crown heavy dies through the player-owned production route with rewards suppressed');

  requestArena(route, 'spar');
  const second = clearLiveArena(route);
  assert.equal(second?.creditDelta, 0, 'the station ladder cannot be farmed after first clear');
  assert.equal(route.state.player.credits - startingCredits,
    VESTA_STATION_ARENA.tiers.reduce((sum, tier) => sum + tier.creditReward, 0));
  const residualRewards = [...route.state.entities.values()].filter((entity) => (
    entity.type === 'pickup' || entity.type === 'wreck'
      && Object.values(entity.data?.salvagePool || {}).some((amount) => Number(amount) > 0)
  ));
  assert.equal(residualRewards.length, 0,
    `all three tiers, including the Crown heavy, leave no generic salvage value: ${JSON.stringify(
      residualRewards.map((entity) => ({ id: entity.id, type: entity.type, data: entity.data })),
    )}`);
  assert.equal(route.state.player.researchPoints, startingResearch);
});

test('Plan 50: non-player arena kills abort without advancing or paying the ladder', async (t) => {
  const route = await bootArena(t, 50_501);
  const startingCredits = route.state.player.credits;
  requestArena(route, 'spar');
  const enemyId = route.runtime.getRuntimeState().arenaRun.enemyIds[0];
  const enemy = route.state.entities.get(enemyId);
  route.sim.registry.get('combat').kill(enemy, 'npc_crossfire', { targetHostileToPlayer: true });
  assert.equal(route.runtime.getRuntimeState().arenaRun, null);
  assert.equal(eventsOf(route, 'timeTrial:arenaAborted').at(-1)?.payload?.reason,
    'combatant_killed_by_non_player');
  assert.equal(eventsOf(route, 'timeTrial:arenaCompleted').length, 0);
  assert.equal(route.state.player.credits, startingCredits);
  assert.equal(route.state.player.timeTrials.arena.cleared.spar, undefined);
});

test('Plan 50: own-best presentation is a non-colliding 3D hull copy, never a card or physics actor', () => {
  const ship = makeEntity(makeShipEntitySpec('ship_kestrel', {
    team: 0, pos: { x: 0, z: 0 }, fittings: fittingsFromDefaultModules('ship_kestrel'),
  }));
  ship.type = 'fx';
  ship.collides = false;
  ship.collisionMask = 0;
  ship.data.timeTrialGhost = true;
  const root = createVisualFactory().build(ship);
  assert.ok(root?.isObject3D);
  assert.equal(root.userData.kind, 'timeTrialGhost');
  let meshes = 0;
  let flatCards = 0;
  let rimMeshes = 0;
  let edgeSegments = 0;
  root.traverse((node) => {
    if (node.isSprite || node.isPoints) flatCards += 1;
    if (node.isLineSegments && node.userData?.timeTrialGhostEdges) {
      edgeSegments += 1;
      assert.equal(node.material?.isLineBasicMaterial, true);
      assert.ok(node.material.opacity > 0.4 && node.material.opacity < 0.7,
        'the bounded component edges carry the spectral read without a glow card');
    }
    if (!node.isMesh) return;
    meshes += 1;
    if (node.userData?.timeTrialGhostRim) rimMeshes += 1;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      assert.equal(material.isMeshBasicMaterial, true,
        'the local replay stays cyan-readable without scene lighting');
      assert.equal(material.transparent, true);
      if (node.userData?.timeTrialGhostRim) {
        assert.ok(material.opacity > 0.4 && material.opacity < 0.6);
      } else {
        assert.ok(material.opacity > 0 && material.opacity <= 0.12,
          'the recorded hull is negative-space-first rather than a solid cyan toy');
      }
      assert.equal(material.depthWrite, node.userData?.timeTrialGhostRim !== true,
        'the surface resolves overlapping real hull pieces while the expanded rim remains translucent');
      assert.equal(material.depthTest, true);
      assert.equal(material.blending, THREE.NormalBlending,
        'overlapping hull pieces stay cyan instead of adding up to a white opaque mass');
    }
  });
  assert.ok(meshes > 3, 'the ghost reuses the recorded hull construction, not one primitive');
  assert.ok(rimMeshes > 3, 'the real hull carries a restrained hard backface rim');
  assert.ok(edgeSegments > 3, 'component edges are derived from the same recorded hull geometry');
  assert.equal(flatCards, 0);
  assert.equal(ship.physicsBody, undefined);
});

test('Plan 50: an earned selection retints only the existing world-history contrail color ramp', () => {
  const trail = new ContrailTrail(THREE);
  const uniforms = trail.material.uniforms;
  const stockMid = uniforms.uMidColor.value.getHexString();
  assert.equal(trail.setTint('#ff8b45'), true);
  assert.notEqual(uniforms.uMidColor.value.getHexString(), stockMid);
  assert.equal(trail.material.fragmentShader.includes('uMidColor'), true);
  assert.equal(trail.material.vertexShader.includes('uPathTex'), true,
    'tint remains on the existing flown-path geometry rather than a replacement card');
  assert.equal(trail.setTint('#ff8b45'), false, 'unchanged render selection does no per-frame material work');
  assert.equal(trail.setTint(null), true);
  assert.equal(uniforms.uMidColor.value.getHexString(), stockMid);
  trail.dispose();
});
