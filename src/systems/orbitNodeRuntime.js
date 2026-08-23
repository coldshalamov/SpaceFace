// Live orbit-node runtime (PQ-133.06b).
// Consumes the fields system's kernel. Does not fork a second field. Identity is
// type + index + counter on the node records and on state.fields.orbit.

import { compileFittedAttackSpec } from './adventureMigration.js';
import { createLineage } from '../combat/attackLineage.js';
import { ensureCombatant } from '../combat/runtime.js';
import {
  CRYO_LOCK_DURATION_TICKS,
  CRYO_LOCK_STATUS_ID,
} from '../combat/cryoLock.js';
import {
  ORBIT_NODE_TYPE,
  countOrbitNodes,
  createOrbitWorld,
  listOrbitNodeIdentities,
  removeOrbitNodesForHost,
  stepOrbitWorld,
  trySpawnOrbitNodes,
} from '../combat/orbitNodes.js';

const HOST_TYPES = new Set(['ship', 'drone']);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function nowOf(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : (state && state.tick ? state.tick / 60 : 0);
}

function hostPose(entity) {
  const pos = entity && entity.pos ? entity.pos : {};
  const vel = entity && entity.vel ? entity.vel : {};
  return {
    id: entity && entity.id,
    x: finite(pos.x),
    z: finite(pos.z),
    vx: finite(vel.x),
    vz: finite(vel.z),
  };
}

function firstWeaponId(entity) {
  const weapons = entity && entity.data && entity.data.weapons;
  if (Array.isArray(weapons) && weapons.length) {
    const row = weapons[0];
    if (typeof row === 'string') return row;
    if (row && (row.defId || row.id)) return row.defId || row.id;
  }
  return 'wpn_pulse_laser_s';
}

function orbitSpecForHost(state, entity) {
  const compiled = compileFittedAttackSpec(state, entity, firstWeaponId(entity));
  if (!compiled || !compiled.ok || !compiled.spec) return null;
  const orbit = compiled.spec.propagation && compiled.spec.propagation.orbit;
  if (!orbit || !(orbit.count > 0)) return null;
  return compiled.spec;
}

function entityById(state, id) {
  if (id == null) return null;
  if (state.entities && typeof state.entities.get === 'function') {
    const found = state.entities.get(id);
    if (found) return found;
  }
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === id) return list[i];
  }
  return null;
}

function statusIdsOf(state, entity) {
  const table = state && state.combat && state.combat.entities;
  if (!table || entity == null || entity.id == null) return [];
  const runtime = table[String(entity.id)];
  const bag = runtime && runtime.statuses;
  if (!bag || typeof bag !== 'object') return [];
  return Object.keys(bag);
}

function orbitTargets(state, host) {
  const list = state && state.entityList ? state.entityList : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    if (host && entity.id === host.id) continue;
    if (!HOST_TYPES.has(entity.type)) continue;
    const pos = entity.pos || {};
    const vel = entity.vel || {};
    out.push({
      id: entity.id,
      pos: { x: finite(pos.x), z: finite(pos.z) },
      x: finite(pos.x),
      z: finite(pos.z),
      vx: finite(vel.x),
      vz: finite(vel.z),
      score: 0,
      statuses: statusIdsOf(state, entity),
    });
  }
  return out;
}

function collectLiveHosts(state) {
  const list = state && state.entityList ? state.entityList : [];
  const hosts = [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    if (!HOST_TYPES.has(entity.type)) continue;
    const spec = orbitSpecForHost(state, entity);
    if (!spec) continue;
    hosts.push({ entity, spec });
  }
  return hosts;
}

function hostHasNodes(world, hostId) {
  for (let i = 0; i < world.nodes.length; i++) {
    if (world.nodes[i] && world.nodes[i].hostId === hostId) return true;
  }
  return false;
}

function scheduleCryoFromEvents(state, combatKernel, events, host) {
  if (!combatKernel || !combatKernel.statuses || !events || !events.length) return;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const target = entityById(state, event && event.targetId);
    if (!target) continue;
    const runtime = ensureCombatant(state, target, combatKernel.catalog);
    if (!runtime) continue;
    combatKernel.statuses.schedule(target, runtime, {
      id: CRYO_LOCK_STATUS_ID,
      stacks: 1,
      durationTicks: CRYO_LOCK_DURATION_TICKS,
    }, {
      attackerId: host && host.id != null ? host.id : null,
      actionId: event.nodeId || null,
    });
  }
}

export function attachOrbitWorld(kernel) {
  return createOrbitWorld({ kernel });
}

export function resetOrbitWorld(world) {
  if (!world) return world;
  if (Array.isArray(world.nodes)) {
    if (world.kernel && typeof world.kernel.unregister === 'function') {
      for (let i = 0; i < world.nodes.length; i++) {
        const node = world.nodes[i];
        if (node && node.id != null) world.kernel.unregister(node.id);
      }
    }
    world.nodes.length = 0;
  }
  world.contacts = [];
  return world;
}

export function publishOrbitRuntime(state, world) {
  const rt = state && state.fields;
  if (!rt) return { count: 0, nodes: [] };
  const nodes = listOrbitNodeIdentities(world);
  const count = countOrbitNodes(world);
  rt.orbit = { count, nodes };
  if (!rt.telemetry || typeof rt.telemetry !== 'object') rt.telemetry = {};
  rt.telemetry.orbitNodes = count;
  return rt.orbit;
}

export function countLiveOrbitNodes(state) {
  const rt = state && state.fields && state.fields.orbit;
  if (rt && Number.isInteger(rt.count)) return rt.count;
  return 0;
}

/**
 * Keep orbit nodes on the live field kernel for every host whose fitted spec has an orbit ring.
 * Spawn once per host (lineage budget), step poses from sim time + index, schedule Cryo Lock
 * through the combat catalog. Never writes translational velocity.
 */
export function syncOrbitRuntime(fieldsSys, state) {
  const world = fieldsSys && fieldsSys._orbitWorld;
  if (!world || !state) return { count: 0, nodes: [], events: [] };
  const hosts = collectLiveHosts(state);
  const liveIds = new Set();
  for (let i = 0; i < hosts.length; i++) liveIds.add(hosts[i].entity.id);

  const stale = [];
  const seenHost = {};
  for (let i = 0; i < world.nodes.length; i++) {
    const hostId = world.nodes[i] && world.nodes[i].hostId;
    if (hostId == null || liveIds.has(hostId) || seenHost[hostId]) continue;
    seenHost[hostId] = true;
    stale.push(hostId);
  }
  for (let i = 0; i < stale.length; i++) removeOrbitNodesForHost(world, stale[i]);

  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  const simTime = nowOf(state);
  const combatKernel = fieldsSys._combatKernel || null;
  const allEvents = [];

  for (let i = 0; i < hosts.length; i++) {
    const hostEntity = hosts[i].entity;
    const spec = hosts[i].spec;
    const pose = hostPose(hostEntity);
    if (!hostHasNodes(world, hostEntity.id)) {
      const parent = createLineage({
        spec,
        createdTick: tick,
        sourceEntityId: hostEntity.id,
      });
      trySpawnOrbitNodes(world, parent, spec, pose, { tick, simTime });
    }
    const targets = orbitTargets(state, hostEntity);
    const stepped = stepOrbitWorld(world, pose, simTime, targets);
    const events = stepped && Array.isArray(stepped.events) ? stepped.events : [];
    for (let e = 0; e < events.length; e++) allEvents.push(events[e]);
    scheduleCryoFromEvents(state, combatKernel, events, hostEntity);
  }

  world.contacts = allEvents;
  const published = publishOrbitRuntime(state, world);
  return { count: published.count, nodes: published.nodes, events: allEvents };
}

export { ORBIT_NODE_TYPE };
