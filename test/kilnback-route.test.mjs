import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { resolveFlightProfile } from '../src/core/flightDynamics.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { KILNBACK as C, kilnbackCoolant } from '../src/data/kilnback.js';
import { kilnbackPresentation } from '../src/systems/kilnback.js';
import { readTensionSensors } from '../src/systems/tensionDirector.js';
import { TensionDirector } from '../src/ai/tensionDirector.js';
import { witnessLineOfSight } from '../src/combat/lineOfSight.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const external = (runtime, fn) => {
  const previous = snapshotFeatureMaps(); applyFeatureConfigToMaps(runtime.config.features);
  try { return fn(); } finally { restoreFeatureMaps(previous); }
};
const advance = (runtime, until, cap) => {
  let ticks = 0; while (!until() && ticks++ < cap) runtime.step(1 / 60);
  assert.ok(until(), `bounded production window ended after ${ticks} ticks`);
};

function opportunitySnapshot(now) {
  const engine = new TensionDirector({ now: now - 66 });
  const sensors = { eligible: true, suspension: null, hull: 1, shield: 1, nearbyCombat: 0,
    liveCombat: 0, pendingCombat: 0, pendingCivilian: 0, scanTruncated: false,
    profile: 'standard', recoveryStance: false };
  for (let at = now - 65; at <= now; at++) engine.advance(at, sensors);
  assert.equal(engine.state.phase, 'opportunity');
  assert.equal(engine.state.policy.allowCombat, true);
  return engine.snapshot();
}

test('ordinary production Ceres activation, native cask custody and cold repeated Continue preserve one finite furnace', async () => {
  const source = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 83 });
  let target = null;
  try {
    const state = source.state; state.mode = 'flight';
    // Enter Ceres at the player's already-earned clock; do not age a newly seeded sector plan
    // by four minutes in one tick and manufacture an overdue encounter catch-up storm.
    source.getSystem('scissorwake').deserialize({ introduced: true, lineUse: 3 });
    state.story.beatIndex = Math.max(1, state.story.beatIndex);
    state.simTime = C.earliestSeconds; state.tick = C.earliestSeconds * 60;
    // This route fixture begins from a legitimate saved opportunity window at the earned Ceres
    // clock. Generate that snapshot with the canonical controller; the authored request still
    // passes normal pressure, spacing, live-roster, and downstream encounter admission gates.
    source.getSystem('tensionDirector').restore(opportunitySnapshot(state.simTime));
    const player = source.spawn(makeShipEntitySpec('ship_hawser', { isPlayer: true, player: state.player,
      pos: { x: 0, z: 0 }, fittings: [] })); state.playerId = player.id;
    external(source, () => source.getSystem('world').enterSector(C.sectorId, { continuous: false, noTeleport: true, placePlayer: false }));
    const station = state.entityIndex.stations.find(e => e.data?.stationId === 'station_ceres'); assert.ok(station);
    const ambush = sectorLocalToGlobalForSector({ x: -400, z: -2400 }, C.sectorId);
    external(source, () => source.getSystem('world').relocatePlayerInSector({
      x: ambush.x, z: ambush.z, heading: 0 }, { reason: 'kilnback-normal-route' }));
    // A prior cutter introduction and reached Ceres story beat are real persisted prerequisites.
    // No force flag, custom encounter factory, alternate AI, or header bypass is used.
    assert.equal(await source.getSystem('physics').prepareBackend(state, { reset: true }), true);
    const owner = source.getSystem('kilnback'), director = source.getSystem('encounterDirector'), requests = [];
    const request = director.requestAuthoredEncounter;
    director.requestAuthoredEncounter = function(payload) {
      const result = request.call(this, payload); if (payload.shapeId === C.encounterId) requests.push(result); return result;
    };
    for (let tick = 0; tick < 5400 && !owner.serialize().actors.length; tick++) source.step(1 / 60);
    assert.equal(owner.serialize().actors.length, 1, JSON.stringify({ requests, eligible: owner._eligible(),
      simTime: state.simTime, storyBeat: state.story.beatIndex, sector: state.world.currentSectorId,
      playerAlive: player.alive, introduced: owner._introduced,
      director: { pressure: state.encounterDirector?.pressure, live: Object.keys(state.encounterDirector?.live || {}),
        pending: state.encounterDirector?.pending?.length, lastMeaningfulAt: state.encounterDirector?.lastMeaningfulAt },
      tension: { phase: state.tensionDirector?.phase, activeS: state.tensionDirector?.activeS,
        phaseEnteredS: state.tensionDirector?.phaseEnteredS, ageS: state.tensionDirector?.activeS - state.tensionDirector?.phaseEnteredS,
        goal: state.tensionDirector?.phaseGoalS, lastCombatAt: state.tensionDirector?.lastCombatAt,
        fatigue: state.tensionDirector?.fatigue, reentryUntilS: state.tensionDirector?.reentryUntilS,
        metrics: state.tensionDirector?.metrics, sensors: readTensionSensors(state), policy: state.tensionDirector?.policy } }));
    let caster = state.entityList.find(e => e.alive && e.data?.lootTableId === C.enemyId); assert.ok(caster);
    assert.equal(state.entityList.filter(e => e.alive && e.data?.lootTableId === C.enemyId).length, 1);
    let row = owner._actors.get(caster.data.kilnbackKey); const key = row.key;
    external(source, () => source.getSystem('world').relocatePlayerInSector({
      x: caster.pos.x + 90, z: caster.pos.z, heading: Math.PI }, { reason: 'kilnback-warning-approach' }));
    player.hull = player.hullMax = 10000; player.shield = player.shieldMax = 0;
    advance(source, () => row.phase === 'preheat', 300); const preheat = row.phaseStartTick;
    advance(source, () => row.phase === 'burn' && row.pulse === 1, 180);
    assert.ok(row.phaseStartTick - preheat >= C.preheatTicks);
    const heatPresentation = kilnbackPresentation(state, caster);
    const mouth = { x: caster.pos.x + Math.cos(caster.rot || 0) * 14,
      z: caster.pos.z + Math.sin(caster.rot || 0) * 14 };
    const liveTarget = state.entities.get(row.targetId);
    assert.ok(heatPresentation.activeHeatLanes.length > 0, JSON.stringify({
      phase: row.phase, pulse: row.pulse, nativeBodyReady: heatPresentation.nativeBodyReady,
      targetDistance: liveTarget && Math.hypot(caster.pos.x - liveTarget.pos.x, caster.pos.z - liveTarget.pos.z),
      lineOfSight: liveTarget && witnessLineOfSight(state, caster, liveTarget.pos, [liveTarget.id]),
      authority: liveTarget && authorizeAIEngagement({ state, self: caster, target: liveTarget,
        objectiveReason: 'combat_doctrine:brawler_commit:commit' }),
      disengageReason: caster.data?.ai?.activity?.reason,
      nearbyLawfulPatrols: state.entityList.filter(e => e.alive !== false && e.data?.ai?.lawful === true
        && (String(e.data.ai.spawnContext || '').includes('patrol')
          || String(e.data.ai.archetype || '').includes('patrol') || e.data.ai.doctrine === 'official'))
        .filter(e => Math.hypot(e.pos.x - caster.pos.x, e.pos.z - caster.pos.z) <= 900).length,
      cooled: source.getSystem('fields').thermalPointCooled(mouth),
    }));
    assert.equal(owner.sever(key, 'cask_port').ok, true);
    advance(source, () => !!owner._find(key, 'cask_port'), 5);
    let cask = owner._find(key, 'cask_port'); assert.equal(cask.data.authoredPayloadAssetId, 'SF_PROP_KILNBACK_CASK');
    assert.equal(caster.mass + cask.mass, 180); assert.equal(caster.mass, 165);
    const profile = resolveFlightProfile(caster, state);
    assert.equal(profile.maxSpeed, 45, JSON.stringify({ flightModelSpeed: caster.flightModel?.maxSpeed,
      derivedSpeed: caster.data?.derived?.flightModel?.maxSpeed, mass: caster.mass,
      bodyRevision: caster.physicsBody?.revision, ownerRevision: row.bodyRevision }));
    assert.equal(profile.maxYawRate, .55);
    assert.ok(Math.abs(profile.mainAccel * profile.mass - 3240) < 1e-8);
    const kernel = getCombatKernel(owner.ctx), rope = kernel.attachments.create({ defId: 'tether_standard',
      ownerId: player.id, targetId: cask.id, sourceWorld: player.pos, targetWorld: cask.pos });
    assert.equal(rope.ok, true, rope.reason);
    const nativeRope = source.getSystem('physics')._sg02.attachments.get(rope.attachment.id);
    assert.equal(nativeRope?.ownerEntity, player); assert.equal(nativeRope?.targetEntity, cask);
    assert.equal(kilnbackCoolant(row), 3);
    assert.deepEqual(caster.data.weapons, []); assert.equal(caster.data.kilnback, row);
    assert.equal(source.getSystem('physics')._sg02.records.get(caster.id).colliders.length, 2);
    assert.ok(kilnbackPresentation(state, caster)?.nativeBodyReady);
    assert.ok(kilnbackPresentation(state, caster).activeHeatLanes.length > 0);
    let envelope = source.getSystem('save').serialize('kilnback-route'), previousLife = caster.occupantGeneration;
    source.dispose(); // Cold production host; existing capital owner allows one runtime per process.
    target = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 84 });
    for (let pass = 0; pass < 2; pass++) {
      const saver = target.getSystem('save'); assert.equal(await saver.loadEnvelope(structuredClone(envelope), 'kilnback-route'), true);
      const s = target.state, kiln = target.getSystem('kilnback'); s.mode = 'flight';
      caster = s.entityList.find(e => e.alive && e.data?.lootTableId === C.enemyId); assert.ok(caster);
      row = kiln._actors.get(key); assert.ok(row); assert.equal(row.phase, 'burn'); assert.equal(row.pulse, 1);
      assert.notEqual(caster.occupantGeneration, previousLife); previousLife = caster.occupantGeneration;
      assert.equal(s.entityList.filter(e => e.alive && e.data?.lootTableId === C.enemyId).length, 1);
      cask = kiln._find(key, 'cask_port'); assert.ok(cask); assert.equal(cask.mass + caster.mass, 180);
      assert.equal(row.casks.cask_port.status, 'drifting'); assert.equal(kilnbackCoolant(row), 3);
      const ph = target.getSystem('physics'); assert.equal(await ph.prepareBackend(s), true);
      target.step(1 / 60); assert.equal(ph._sg02.records.get(caster.id).colliders.length, 2);
      assert.ok(kilnbackPresentation(s, caster)?.nativeBodyReady);
      assert.equal(kilnbackPresentation(s, caster).activeHeatLanes.every(f => f.ownerLife === caster.occupantGeneration), true);
      assert.equal([...ph._sg02.attachments.values()].filter(a => a.targetEntity === cask).length, 1);
      // Re-serialize the same unfinished clock after its first actual solved Continue tick.
      envelope = saver.serialize('kilnback-route');
    }
    const kiln = target.getSystem('kilnback'), s = target.state;
    const patches = []; target.bus.on('kilnback:coolantReleased', e => patches.push(e));
    const packet = scalarHitToDamagePacket({ damage: 1000, damageType: 'kinetic', pos: { ...cask.pos } });
    external(target, () => getCombatKernel(kiln.ctx).routeDamage({ attackerId: s.playerId, targetId: cask.id, packet }));
    assert.equal(patches.length, 1); assert.equal(row.casks.cask_port.status, 'spent');
    const coolantExpiry = target.getSystem('fields').thermalFieldsForSource(key).find(f => f.kind === 'coolant').expireAt;
    const spent = target.getSystem('save').serialize('kilnback-spent');
    assert.equal(await target.getSystem('save').loadEnvelope(spent, 'kilnback-spent'), true);
    assert.equal(target.getSystem('kilnback')._find(key, 'cask_port'), null);
    assert.equal(target.getSystem('fields').thermalFieldsForSource(key).filter(f => f.kind === 'coolant').length, 1);
    assert.equal(target.getSystem('fields').thermalFieldsForSource(key).find(f => f.kind === 'coolant').expireAt, coolantExpiry);
  } finally { target?.dispose(); source.dispose(); }
});
