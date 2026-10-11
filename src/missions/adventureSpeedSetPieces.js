// Physical/cargo observations for mission-owned speed sections. All motion stays with physics.
import { raceGateGlobals } from '../data/raceLevels.js';
import { gateApproach } from '../systems/racingGeometry.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { getCombatKernel } from '../combat/kernel.js';
import { attachmentBindsOccupant } from '../combat/attachments.js';
import { releasableContractUnits } from '../systems/cargo.js';
import { makeEnemySpawnSpec } from '../systems/combat.js';
import { clearAIFiringIntent } from '../systems/aiFireIntent.js';

const OWNER = 'adventure-speed-rescue';
const HUNTER_OWNER = 'adventure-speed-listener';
const speed = e => Number.isFinite(e?.vel?.x) && Number.isFinite(e?.vel?.z) ? Math.hypot(e.vel.x, e.vel.z) : Infinity;
const owns = (entity, missionId) => (entity?.data?.persistenceOwner === OWNER && entity.data.speedRescueMissionId === missionId)
  || (entity?.data?.persistenceOwner === HUNTER_OWNER && entity.data.speedHunterMissionId === missionId);

/** Radiation travels along direction; the lee side of an actual solid body is a cooling pocket. */
export function thermalShelterFor(state, player, config, nearby = []) {
  if (!player?.pos || !config) return null;
  const dir = config.radiationDirection || { x: 1, z: 0 }, length = Math.hypot(dir.x, dir.z) || 1;
  const nx = dir.x / length, nz = dir.z / length, reach = Math.max(0, Number(config.shelterReachWU) || 180);
  for (const e of queryNearbyEntities(state, player.pos, reach + 500, nearby)) {
    if (!e?.alive || !e.pos || e.collides === false || !['asteroid', 'station', 'wreck'].includes(e.type)) continue;
    const radius = Math.max(0, Math.min(500, Number(e.radius) || 0));
    if (radius < 12) continue;
    const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
    const along = dx * nx + dz * nz, across = Math.abs(dx * -nz + dz * nx);
    if (along >= radius && along <= radius + reach && across <= radius * 0.9) {
      return { id: e.id, name: e.data?.name || (e.type === 'asteroid' ? 'rock shelter' : `${e.type} shelter`) };
    }
  }
  return null;
}

export function createAdventureSpeedSetPieces(ctx) {
  const { state, helpers = {}, bus } = ctx, bindings = new Map(), nearby = [];
  const offs = [];
  const listen = (name, fn) => { const off = bus?.on?.(name, fn); if (typeof off === 'function') offs.push(off); };
  function cleanup(missionOrId, reason = 'speed_section_closed') {
    const id = typeof missionOrId === 'object' ? missionOrId.id : missionOrId;
    bindings.delete(id);
    for (const body of [...(state.entityList || [])]) {
      if (!owns(body, id)) continue;
      const attachments = getCombatKernel(ctx).attachments;
      for (const line of attachments.listForEntity(body.id)) {
        if (line.state === 'active') attachments.cut(line.id, line.controllerId ?? line.ownerId, reason);
      }
      helpers.removeEntity?.(body.id, { immediate: true, reason });
    }
  }
  function clear(reason) {
    const ids = new Set((state.entityList || []).filter(e => [OWNER, HUNTER_OWNER].includes(e.data?.persistenceOwner))
      .map(e => e.data.speedRescueMissionId || e.data.speedHunterMissionId));
    for (const id of ids) cleanup(id, reason);
    bindings.clear();
  }
  function podFor(mission) {
    const p = mission.params, bound = bindings.get(mission.id);
    if (bound) return state.entities?.get(bound.body.id) === bound.body && bound.body.alive
      && bound.body.occupantGeneration === bound.generation ? bound : null;
    const existing = (state.entityList || []).filter(e => owns(e, mission.id) && e.alive
      && e.data.worldRecordId === `speed-rescue:${mission.id}`);
    if (existing.length > 1) return null;
    let body = existing[0];
    if (!body && !p.rescueSpawned) {
      const gates = raceGateGlobals(p), a = gateApproach(gates, 0), c = p.adventureSpeed.rescue;
      if (!a || !helpers.spawnEntity) return null;
      const identity = `speed-rescue:${mission.id}`;
      body = helpers.spawnEntity({ type: 'payload', team: 2,
        pos: { x: gates[0].x - a.nx * 140, z: gates[0].z - a.nz * 140 }, vel: { x: 0, z: 0 },
        radius: c.podRadius, mass: c.podMass, hull: c.podHull, hullMax: c.podHull, collides: true,
        physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: c.podRadius,
          mass: c.podMass, inertiaY: c.podMass * c.podRadius ** 2 * 0.4 },
        flags: { persistent: true, missionPinned: true },
        data: { name: 'Evacuation pod · Lifeline', scanLabel: 'Evacuation pod · attach Massline',
          persistenceOwner: OWNER, speedRescueMissionId: mission.id, missionTag: mission.id,
          worldRecordId: identity, identityKey: identity, sectorId: p.courseSectorId,
          packagedPropFile: 'places/place_47a_rescue_capsule.glb', packagedPropSlot: 'place',
          towable: true, tetherable: true, salvagePool: {} } });
      if (body) p.rescueSpawned = true;
    }
    if (!body) return null;
    const row = { body, generation: body.occupantGeneration, previous: null, previousTime: null, lineId: null };
    bindings.set(mission.id, row);
    p.rescueTargetId = body.id;
    mission.targetEntityIds = [...new Set([...(mission.targetEntityIds || []), body.id])];
    return row;
  }
  function liveLine(player, pod) {
    const service = getCombatKernel(ctx).attachments;
    const line = service.listForEntity(player.id).find(row => row.state === 'active'
      && ['attachment_massline', 'tether_standard'].includes(row.defId)
      && ((row.ownerId === player.id && row.targetId === pod.id) || (row.ownerId === pod.id && row.targetId === player.id))
      && attachmentBindsOccupant(row, player.id, player.occupantGeneration)
      && attachmentBindsOccupant(row, pod.id, pod.occupantGeneration));
    if (!line) return null;
    let telemetry;
    try { telemetry = helpers.combatPhysics?.getAttachmentTelemetry?.({ attachmentId: line.id, physicsHandle: line.physicsHandle, tick: state.tick }); }
    catch { return null; }
    // A serialized tether mirror or a detached native joint cannot carry a rescue gate.
    if (!telemetry) return null;
    return { id: line.id, loaded: Number(telemetry.tension) > 0 || Number(telemetry.stretch) > 0 };
  }
  function prepareListener(mission, sample, player) {
    const p = mission.params, c = p.adventureSpeed.listener, now = Number(state.simTime) || 0;
    const observation = p.listenerState || (p.listenerState = { exposure: 0, mode: 'listening', lastSampleSimS: now,
      lastNoiseSimS: null, lastShotSimS: null });
    if (p.listenerCleared) return { sample, context: { exposure: 0, listenerMode: 'cleared' } };
    let row = bindings.get(mission.id), body = row?.body;
    if (!row) {
      const existing = (state.entityList || []).filter(e => owns(e, mission.id)
        && e.data.worldRecordId === `speed-listener:${mission.id}` && e.alive);
      if (existing.length === 1) body = existing[0];
      else if (!existing.length && !p.listenerSpawned && helpers.spawnEntity) {
        const gates = raceGateGlobals(p), a = gateApproach(gates, 0);
        const spec = makeEnemySpawnSpec(c.enemyTypeId, 4,
          { x: gates[0].x - a.nx * 160 - a.nz * 450, z: gates[0].z - a.nz * 160 + a.nx * 450 },
          { startedTick: state.tick, motive: 'assigned_interdiction', engagementTrigger: 'speed_run_noise',
            approachTelegraph: 'Listening for drive burn and weapons discharge.' });
        spec.flags = { ...spec.flags, persistent: true, missionPinned: true };
        Object.assign(spec.data, { name: 'Veil Listener', scanLabel: 'Veil Listener · boost and gunfire expose you',
          persistenceOwner: HUNTER_OWNER, speedHunterMissionId: mission.id, missionTag: mission.id,
          worldRecordId: `speed-listener:${mission.id}`, identityKey: `speed-listener:${mission.id}`, sectorId: p.courseSectorId });
        Object.assign(spec.data.ai, { passive: true, allowPassiveManeuver: false, roe: 'hold_fire', sensorRange: c.hearingRangeWU });
        body = helpers.spawnEntity(spec); if (body) p.listenerSpawned = true;
      }
      if (body) { row = { body, generation: body.occupantGeneration }; bindings.set(mission.id, row); }
    }
    if (!body || state.entities.get(body.id) !== body || body.occupantGeneration !== row.generation) {
      return { sample, context: { failureReason: 'speed_listener_unavailable' } };
    }
    if (!body.alive || !(body.hull > 0)) {
      p.listenerCleared = true; cleanup(mission, 'listener_disabled');
      return { sample, context: { exposure: 0, listenerMode: 'cleared' } };
    }
    p.listenerTargetId = body.id;
    mission.targetEntityIds = [...new Set([...(mission.targetEntityIds || []), body.id])];
    const dt = Math.max(0, Math.min(1, now - observation.lastSampleSimS)); observation.lastSampleSimS = now;
    const distance = Math.hypot(body.pos.x - player.pos.x, body.pos.z - player.pos.z);
    const burning = !!player.flags?.boosting || state.input?.travelDrive?.state === 'engaged';
    const firing = observation.lastShotSimS != null && now - observation.lastShotSimS < 0.35;
    const hearing = Math.max(0, 1 - distance / c.hearingRangeWU), noise = burning || firing;
    if (p.nextGate > 0) {
      const gain = hearing > 0 && noise ? hearing * ((burning ? c.boostExposurePerS : 0) + (firing ? c.weaponExposurePerS : 0)) : -c.quietDecayPerS;
      observation.exposure = Math.max(0, Math.min(100, observation.exposure + gain * dt));
      if (noise && hearing > 0) observation.lastNoiseSimS = now;
      if (observation.exposure >= 100 && !observation.detected) {
        observation.detected = true;
        const ai = body.data.ai;
        ai.passive = false; ai.roe = 'weapons_free'; ai.forcePlayerTarget = true;
        ai.activity = { ...ai.activity, kind: 'attack_run', targetId: player.id, startedTick: state.tick };
      }
      if (observation.detected && !noise && distance >= c.loseRangeWU
          && now - observation.lastNoiseSimS >= c.quietSearchS && observation.exposure === 0) {
        observation.detected = false;
        body.data.ai.passive = true; body.data.ai.roe = 'hold_fire'; body.data.ai.forcePlayerTarget = false;
        // Passive actors leave the tactical decision list. Retire their last movement command
        // as well as their gun command so losing contact really ends the attack run.
        body.data.intent = { moveX: 0, moveZ: 0, turnIntent: 0, aimAngle: body.rot, boost: false,
          brake: true, fireGroup: null };
        clearAIFiringIntent(body.data.intent, 'listener_lost_contact');
      }
    }
    observation.mode = observation.detected ? (noise ? 'engaged' : 'searching') : 'listening';
    return { sample, context: { exposure: observation.exposure, listenerMode: observation.mode } };
  }
  function prepare(mission, sample) {
    const p = mission?.params, kind = p?.adventureSpeed?.kind;
    if (mission?.status !== 'active' || !['thermal', 'rescue', 'listening'].includes(kind)) return { sample, context: null };
    const player = state.entities?.get(state.playerId);
    if (kind === 'listening') return player?.alive ? prepareListener(mission, sample, player) : { sample, context: null };
    if (kind === 'thermal') {
      const shelter = thermalShelterFor(state, player, p.adventureSpeed.thermal, nearby);
      return { sample, context: { sheltered: !!shelter, shelterName: shelter?.name || null,
        cargoUnits: releasableContractUnits(state, mission),
        burning: !!player?.flags?.boosting || state.input?.travelDrive?.state === 'engaged' } };
    }
    const row = podFor(mission);
    if (!row || !player?.alive || !(row.body.hull > 0)) return { sample: { ...sample, prev: null }, context: { failureReason: 'speed_rescue_pod_lost' } };
    const body = row.body, line = liveLine(player, body);
    const dt = Math.max(0, sample.now - (row.previousTime ?? sample.now));
    const moved = row.previous ? Math.hypot(body.pos.x - row.previous.x, body.pos.z - row.previous.z) : 0;
    const continuous = !!line && line.id === row.lineId && dt > 0 && moved <= Math.max(16, speed(body) * dt * 2 + 4);
    if (continuous && line.loaded) p.rescueTowedWU = Math.min(1e6, (Number(p.rescueTowedWU) || 0) + moved);
    const result = { sample: { ...sample, prev: continuous ? row.previous : null,
      pos: body.pos, vel: body.vel, previousTime: row.previousTime ?? sample.now },
      context: { attached: !!line, loaded: !!line?.loaded, towedWU: Number(p.rescueTowedWU) || 0,
        podSpeed: speed(body), playerSpeed: speed(player), podHull: body.hull, podHullMax: body.hullMax } };
    row.previous = { x: body.pos.x, z: body.pos.z }; row.previousTime = sample.now; row.lineId = line?.id || null;
    return result;
  }
  for (const name of ['mission:completed', 'mission:failed', 'mission:abandoned', 'mission:expired']) {
    listen(name, payload => cleanup(payload?.missionId, name));
  }
  listen('game:new', () => clear('new_game'));
  listen('save:restoring', () => bindings.clear());
  listen('save:loaded', () => bindings.clear());
  listen('combat:fire', payload => {
    if (payload?.ownerId !== state.playerId) return;
    for (const mission of state.missions?.active || []) {
      if (mission.status === 'active' && mission.params?.adventureSpeed?.kind === 'listening'
          && mission.params.nextGate > 0 && mission.params.listenerState) {
        mission.params.listenerState.lastShotSimS = Number(state.simTime) || 0;
      }
    }
  });
  listen('entity:killed', payload => {
    const id = payload?.targetId ?? payload?.id;
    for (const mission of state.missions?.active || []) {
      if (mission.params?.listenerTargetId === id && mission.params?.adventureSpeed?.kind === 'listening') {
        mission.params.listenerCleared = true;
        cleanup(mission, 'listener_disabled');
      }
    }
  });
  return { prepare, cleanup,
    reconcile() {
      for (const id of [...bindings.keys()]) {
        if (!state.missions?.active?.some(m => m.id === id && m.status === 'active')) cleanup(id);
      }
    },
    dispose() { clear('speed_sections_disposed'); for (const off of offs) off(); },
  };
}
