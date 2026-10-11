// Family-aware material step. One fixed tick, XZ plane, seeded rng.
// Does not integrate positions and does not import Three.js.
//
// Order (REACTIVE_STEP_ORDER):
//   sanitize dt → clock → heat → ferromagnetic → elastic → volatile → brittle
//   → deferred → reap → cues
//
// Momentum:
//   ferro / elastic pairs are equal-opposite (anchor recoil if the other side cannot move).
//   brittle shards inherit the parent velocity and split its mass.
//   volatile debris relative velocities are 120 degrees apart and sum to zero.
//   volatile neighbor impulses are a capped chemical injection, logged, not conserved.

import { cueStyle } from '../../data/reactiveMatter/markers.js';
import {
  BRITTLE_HEAT_THRESHOLD,
  REACTIVE_BUDGETS,
  REACTIVE_DT,
  REACTIVE_STEP_ORDER,
  VOLATILE_HEAT_THRESHOLD,
} from '../../data/reactiveMatter/budgets.js';
import {
  addMachine,
  byId,
  claimReactiveSalvage,
  debrisCount,
  finite,
  markTerminal,
  mintSalvage,
  pushReaction,
  reapReactiveWorld,
  spawnReactiveBody,
  worldHasLaws,
} from './world.js';

const BUDGET = REACTIVE_BUDGETS;

export function sanitizeDt(dt) {
  if (!(dt > 0) || !Number.isFinite(dt)) return { dt: REACTIVE_DT, clamped: true };
  if (dt < BUDGET.dtMin) return { dt: BUDGET.dtMin, clamped: true };
  if (dt > BUDGET.dtMax) return { dt: BUDGET.dtMax, clamped: true };
  return { dt, clamped: false };
}

function sortedBodies(world) {
  return [...world.bodies.values()].sort(byId);
}

function sortedMachines(world) {
  return [...world.machines.values()].sort(byId);
}

function emptyResult(world, dt, clamped) {
  return {
    tick: world.tick,
    simTime: world.simTime,
    dt,
    dtClamped: clamped,
    order: REACTIVE_STEP_ORDER,
    impulses: [],
    anchorRecoil: [],
    reactions: [],
    spawned: [],
    retargets: [],
    towClears: [],
    cues: [],
    lawEvals: 0,
    chemicalInjected: 0,
    dissipatedImpulse: 0,
    droppedContacts: 0,
  };
}

function pushCue(out, world, cue) {
  if (out.cues.length >= BUDGET.maxCuesPerTick) return;
  const style = cueStyle(cue.kind);
  out.cues.push({
    id: `${cue.kind}:${cue.bodyId}:${world.tick}`,
    tick: world.tick,
    kind: cue.kind,
    bodyId: cue.bodyId,
    x: cue.x,
    z: cue.z,
    y: 0,
    tint: style.tint,
    signature: style.signature,
    worldRadius: Math.max(style.minWorldRadius, finite(cue.worldRadius, style.minWorldRadius)),
    magnitude: finite(cue.magnitude),
  });
}

function maxClosing(contacts, id) {
  let best = 0;
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    if (contact.aId !== id && contact.bId !== id) continue;
    const closing = Math.min(BUDGET.speedCap, Math.max(0, finite(contact.closingSpeed)));
    if (closing > best) best = closing;
  }
  return best;
}

function contactNormal(contacts, id) {
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    if (contact.aId !== id && contact.bId !== id) continue;
    if (contact.aId === id) return { nx: contact.nx, nz: contact.nz };
    return { nx: -contact.nx, nz: -contact.nz };
  }
  return { nx: 1, nz: 0 };
}

function applyHeat(world, bodies, contacts, dt) {
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (body.phase === 'fractured') continue;
    let add = 0;
    for (let f = 0; f < world.fields.length; f++) {
      const field = world.fields[f];
      if (field.kind !== 'thermal') continue;
      const dx = body.x - field.x;
      const dz = body.z - field.z;
      if (dx * dx + dz * dz <= field.radius * field.radius) add += finite(field.heatPerSec) * dt;
    }
    for (let c = 0; c < contacts.length; c++) {
      const contact = contacts[c];
      if (contact.aId !== body.id && contact.bId !== body.id) continue;
      const closing = Math.min(BUDGET.speedCap, Math.max(0, finite(contact.closingSpeed)));
      add += Math.min(BUDGET.impactHeatCap, closing * BUDGET.impactHeatScale);
    }
    if (add > 0) body.heat = Math.min(BUDGET.heatCap, body.heat + add);
  }
}

function planFerro(world, bodies, dt, out) {
  const machines = sortedMachines(world).filter((machine) => machine.enabled);
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (!body.laws.ferromagnetic || body.phase !== 'intact' || body.anchored || body.isPlayer) continue;
    if (!(body.mass > 0)) continue;
    for (let m = 0; m < machines.length; m++) {
      const machine = machines[m];
      out.lawEvals += 1;
      const dx = machine.x - body.x;
      const dz = machine.z - body.z;
      const dist = Math.hypot(dx, dz);
      const reach = machine.fieldRadius * BUDGET.ferroFieldMul;
      if (dist > reach) continue;
      const nx = dist > 1e-6 ? dx / dist : 1;
      const nz = dist > 1e-6 ? dz / dist : 0;
      const fall = 1 / (1 + (dist / machine.fieldRadius) ** 2);
      let force = machine.strength * (body.susceptibility || 1) * machine.polarity * fall;
      if (force > BUDGET.ferroMaxForce) force = BUDGET.ferroMaxForce;
      if (force < -BUDGET.ferroMaxForce) force = -BUDGET.ferroMaxForce;
      const j = force * dt;
      if (!(Math.abs(j) > 1e-8)) continue;
      out.impulses.push({
        bodyId: body.id,
        otherId: machine.bodyId,
        anchorId: machine.anchored ? machine.id : null,
        jx: nx * j,
        jz: nz * j,
        source: 'ferro',
        externalEffect: false,
        continuous: true,
        storeId: null,
        storeJ: 0,
      });
      if (machine.anchored || !machine.bodyId) {
        out.anchorRecoil.push({ machineId: machine.id, jx: -nx * j, jz: -nz * j });
      }
      if (world.tick % 30 === 1) {
        pushCue(out, world, {
          kind: 'ferro-couple',
          bodyId: body.id,
          x: body.x,
          z: body.z,
          worldRadius: Math.max(2.6, body.radius),
          magnitude: Math.abs(j),
        });
      }
    }
  }
}

function planElastic(world, bodies, contacts, dt, out) {
  const map = world.bodies;
  const compressed = new Set();
  const ordered = [...contacts].sort((a, b) => {
    const ak = `${a.aId}\0${a.bId}`;
    const bk = `${b.aId}\0${b.bId}`;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
  for (let i = 0; i < ordered.length; i++) {
    const contact = ordered[i];
    const a = map.get(contact.aId);
    const b = map.get(contact.bId);
    if (!a || !b) continue;
    const elasticSide = [a, b]
      .filter((body) => body.laws.elastic && (body.phase === 'intact' || body.phase === 'shard'))
      .sort(byId);
    if (elasticSide.length === 0) continue;
    out.lawEvals += 1;
    const elastic = elasticSide[0];
    const other = elastic === a ? b : a;
    const closing = Math.min(BUDGET.speedCap, Math.max(0, finite(contact.closingSpeed)));
    if (!(closing > 0.05)) continue;
    const dx = elastic.x - other.x;
    const dz = elastic.z - other.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;
    const reduced = other.anchored || !(other.mass > 0)
      ? elastic.mass
      : 1 / (1 / elastic.mass + 1 / other.mass);
    const jMax = closing * reduced;
    const jWant = Math.min(BUDGET.elasticK * closing * dt, jMax);
    if (!(jWant > 1e-8)) continue;
    const room = Math.max(0, BUDGET.elasticMaxStored - elastic.stored);
    const jStore = Math.min(room, jWant);
    elastic.stored += jStore;
    elastic.pressNx = nx;
    elastic.pressNz = nz;
    elastic.partnerId = other.id;
    compressed.add(elastic.id);
    if (jWant - jStore > 0) out.dissipatedImpulse += jWant - jStore;
    out.impulses.push({
      bodyId: elastic.id,
      otherId: other.anchored ? null : other.id,
      anchorId: other.anchored ? other.id : null,
      jx: nx * jWant,
      jz: nz * jWant,
      source: 'elastic-absorb',
      externalEffect: elastic.isPlayer || other.isPlayer,
      continuous: true,
      storeId: elastic.id,
      storeJ: jStore,
    });
  }
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (!body.laws.elastic || compressed.has(body.id)) continue;
    if (!(body.stored > BUDGET.elasticReleaseMin)) continue;
    out.lawEvals += 1;
    const stored = Math.min(body.stored, BUDGET.elasticMaxStored);
    const jRel = stored * BUDGET.elasticRelease;
    const lost = stored - jRel;
    body.stored = 0;
    out.dissipatedImpulse += lost;
    const partner = body.partnerId ? map.get(body.partnerId) : null;
    const partnerLive = partner && partner.phase !== 'fractured' && partner.mass > 0;
    if (!partnerLive) {
      out.dissipatedImpulse += jRel;
      continue;
    }
    out.impulses.push({
      bodyId: body.id,
      otherId: partner.anchored ? null : partner.id,
      anchorId: partner.anchored ? partner.id : null,
      jx: body.pressNx * jRel,
      jz: body.pressNz * jRel,
      source: 'elastic-release',
      externalEffect: body.isPlayer || partner.isPlayer,
      continuous: false,
      storeId: null,
      storeJ: 0,
    });
    pushCue(out, world, {
      kind: 'elastic-release',
      bodyId: body.id,
      x: body.x,
      z: body.z,
      worldRadius: Math.max(2.5, body.radius),
      magnitude: jRel,
    });
  }
}

function rollbackSpawn(world, spawned) {
  for (let i = 0; i < spawned.length; i++) {
    const child = spawned[i];
    if (child.salvageId) world.salvage.delete(child.salvageId);
    world.bodies.delete(child.id);
  }
}

function canSpawn(world, count, out) {
  if (out.spawnedThisTick + count > BUDGET.maxSpawnsPerTick) return false;
  if (world.bodies.size + count > BUDGET.maxBodies) return false;
  if (debrisCount(world) + count > BUDGET.maxDebrisAlive) return false;
  return true;
}

function detonateVolatile(world, body, depth, out) {
  const radius = body.radius;
  const parentMass = body.mass;
  const parentVx = body.vx;
  const parentVz = body.vz;
  const n = BUDGET.volatileDebris;
  const spawned = [];
  if (canSpawn(world, n, out) && world.rng) {
    const piece = parentMass * BUDGET.volatileDebrisMassFraction;
    const shell = parentMass - piece * n;
    const spin = world.rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const angle = spin + (i * Math.PI * 2) / n;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const id = `${body.id}:debris:${i}`;
      const child = spawnReactiveBody(world, {
        id,
        modelId: 'reactive_debris',
        x: body.x + dx * (radius + 1.2),
        z: body.z + dz * (radius + 1.2),
        vx: parentVx + dx * BUDGET.volatileDebrisSpeed,
        vz: parentVz + dz * BUDGET.volatileDebrisSpeed,
        mass: piece,
        radius: 1.05,
        runtime: true,
        parentId: body.id,
        generation: depth,
        role: 'debris',
      });
      if (!child) break;
      mintSalvage(world, `${id}:salvage`, child.id);
      spawned.push(child);
    }
    if (spawned.length !== n) {
      rollbackSpawn(world, spawned);
    } else {
      body.mass = shell;
      body.radius = Math.max(0.8, radius * 0.45);
      for (let i = 0; i < spawned.length; i++) {
        out.spawned.push(spawned[i].id);
        out.spawnedThisTick += 1;
      }
    }
  }
  body.phase = 'spent';
  body.integrity = 0;
  body.heat = Math.max(body.heat, VOLATILE_HEAT_THRESHOLD);
  body.laws = { ferromagnetic: body.laws.ferromagnetic, volatile: false, brittle: false, elastic: false };
  markTerminal(world, body.id, 'spent');
  pushReaction(world, { tick: world.tick, id: body.id, kind: 'volatile-spent', depth });
  out.reactions.push({ id: body.id, family: 'volatile', kind: 'spent', depth });

  const neighbors = [];
  for (const other of world.bodies.values()) {
    if (other.id === body.id || other.parentId === body.id || other.phase === 'fractured' || !(other.mass > 0)) continue;
    const dx = other.x - body.x;
    const dz = other.z - body.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= BUDGET.volatileBlastRadius + other.radius) neighbors.push(other);
  }
  neighbors.sort(byId);
  let used = 0;
  const share = neighbors.length > 0 ? BUDGET.volatileImpulseCap / neighbors.length : 0;
  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    const dx = other.x - body.x;
    const dz = other.z - body.z;
    const dist = Math.hypot(dx, dz) || 1;
    const fall = 1 / (1 + (dist / BUDGET.volatileBlastRadius) ** 2);
    const room = BUDGET.volatileImpulseCap - used;
    const j = Math.min(share, room) * fall;
    if (!(j > 0)) continue;
    used += j;
    out.impulses.push({
      bodyId: other.id,
      otherId: null,
      anchorId: other.anchored ? other.id : null,
      jx: (dx / dist) * j,
      jz: (dz / dist) * j,
      source: 'volatile-chemical',
      externalEffect: other.isPlayer === true,
      continuous: false,
      storeId: null,
      storeJ: 0,
    });
    if (other.laws.volatile && other.phase === 'intact' && depth + 1 <= BUDGET.maxChainDepth) {
      other.heat = Math.min(BUDGET.heatCap, other.heat + BUDGET.volatileNeighborHeat);
      out.chain.push({ id: other.id, depth: depth + 1, cause: 'chain' });
    }
  }
  out.chemicalInjected += used;
  world.chemicalInjected += used;
  pushCue(out, world, {
    kind: 'volatile-blast',
    bodyId: body.id,
    x: body.x,
    z: body.z,
    worldRadius: Math.max(2.5, BUDGET.volatileBlastRadius * 0.15),
    magnitude: used,
  });
}

function fractureBrittle(world, body, nx, nz, out) {
  const radius = body.radius > 0 ? body.radius : body.spawnRadius;
  const spread = body.shardSpread > 0 ? body.shardSpread : BUDGET.brittleOffsetFraction;
  const offset = radius * spread;
  const shardRadius = Math.max(0.8, radius * BUDGET.brittleShardRadiusFraction);
  const shardMass = body.mass * 0.5;
  if (!canSpawn(world, 2, out)) return false;
  const shards = [];
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? 1 : -1;
    const id = `${body.id}:shard:${i}`;
    const child = spawnReactiveBody(world, {
      id,
      modelId: 'reactive_shard',
      x: body.x + nx * offset * sign,
      z: body.z + nz * offset * sign,
      vx: body.vx,
      vz: body.vz,
      mass: shardMass,
      radius: shardRadius,
      runtime: true,
      parentId: body.id,
      generation: (body.generation | 0) + 1,
      role: 'shard',
    });
    if (!child) {
      rollbackSpawn(world, shards);
      return false;
    }
    shards.push(child);
  }
  for (let i = 0; i < shards.length; i++) {
    out.spawned.push(shards[i].id);
    out.spawnedThisTick += 1;
    mintSalvage(world, `${shards[i].id}:salvage`, shards[i].id);
  }
  const lugReach = shardRadius + BUDGET.brittleLugReachPad;
  for (const hitch of world.hitches.values()) {
    if (!hitch.alive || hitch.targetId !== body.id) continue;
    const lugX = body.x + hitch.lugLocalX;
    const lugZ = body.z + hitch.lugLocalZ;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < shards.length; i++) {
      const d = Math.hypot(shards[i].x - lugX, shards[i].z - lugZ);
      if (d < bestD) {
        bestD = d;
        best = shards[i];
      }
    }
    if (best && bestD <= lugReach) {
      hitch.targetId = best.id;
      hitch.lugLocalX = lugX - best.x;
      hitch.lugLocalZ = lugZ - best.z;
      out.retargets.push({ hitchId: hitch.id, fromId: body.id, toId: best.id });
      pushCue(out, world, {
        kind: 'tow-retarget',
        bodyId: best.id,
        x: best.x,
        z: best.z,
        worldRadius: Math.max(2.8, best.radius),
        magnitude: bestD,
      });
    } else {
      hitch.alive = false;
      hitch.broken = 'fracture';
      out.towClears.push({ hitchId: hitch.id, reason: 'fracture' });
      pushCue(out, world, {
        kind: 'tow-break',
        bodyId: body.id,
        x: body.x,
        z: body.z,
        worldRadius: 4,
        magnitude: bestD,
      });
    }
  }
  body.phase = 'fractured';
  body.radius = 0;
  body.mass = 0;
  body.vx = 0;
  body.vz = 0;
  body.collides = false;
  body.solid = false;
  body.hitchable = false;
  body.integrity = 0;
  body.laws = { ferromagnetic: false, volatile: false, brittle: false, elastic: false };
  markTerminal(world, body.id, 'fractured');
  pushReaction(world, { tick: world.tick, id: body.id, kind: 'brittle-fractured' });
  out.reactions.push({ id: body.id, family: 'brittle', kind: 'fractured' });
  pushCue(out, world, {
    kind: 'brittle-fracture',
    bodyId: body.id,
    x: body.x,
    z: body.z,
    worldRadius: Math.max(2.8, radius),
    magnitude: radius,
  });
  return true;
}

function considerVolatile(world, bodies, contacts, out) {
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (!body.laws.volatile || body.phase !== 'intact') continue;
    out.lawEvals += 1;
    const impact = maxClosing(contacts, body.id);
    if (body.heat >= VOLATILE_HEAT_THRESHOLD || impact >= BUDGET.volatileImpactSpeed) {
      out.chain.push({ id: body.id, depth: 1, cause: impact >= BUDGET.volatileImpactSpeed ? 'impact' : 'heat' });
    }
  }
}

function considerBrittle(world, bodies, contacts, out) {
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (!body.laws.brittle || body.phase !== 'intact') continue;
    out.lawEvals += 1;
    const impact = maxClosing(contacts, body.id);
    if (body.heat >= BRITTLE_HEAT_THRESHOLD || impact >= BUDGET.brittleImpactSpeed) {
      if (body.laws.volatile && body.phase === 'intact' && (body.heat >= VOLATILE_HEAT_THRESHOLD || impact >= BUDGET.volatileImpactSpeed)) {
        continue;
      }
      out.brittle.push({ id: body.id, ...contactNormal(contacts, body.id) });
    }
  }
}

function drainQueue(world, out) {
  const reacted = new Set();
  let guard = 0;
  while (out.chain.length > 0 && guard < 64) {
    guard += 1;
    const item = out.chain.shift();
    if (!item || reacted.has(item.id)) continue;
    const body = world.bodies.get(item.id);
    if (!body || body.phase !== 'intact' || !body.laws.volatile) continue;
    if (out.reactionsThisTick >= BUDGET.maxReactionsPerTick) {
      if (world.deferred.length < BUDGET.maxDeferred) world.deferred.push(item);
      else out.droppedReactions += 1;
      continue;
    }
    if (item.cause === 'chain' && item.depth > BUDGET.maxChainDepth) continue;
    detonateVolatile(world, body, item.depth, out);
    reacted.add(item.id);
    out.reactionsThisTick += 1;
  }
  let brittleGuard = 0;
  while (out.brittle.length > 0 && brittleGuard < 32) {
    brittleGuard += 1;
    const item = out.brittle.shift();
    const body = world.bodies.get(item.id);
    if (!body || body.phase !== 'intact' || !body.laws.brittle) continue;
    if (out.reactionsThisTick >= BUDGET.maxReactionsPerTick) {
      if (world.deferred.length < BUDGET.maxDeferred) world.deferred.push({ ...item, law: 'brittle' });
      else out.droppedReactions += 1;
      continue;
    }
    const broke = fractureBrittle(world, body, item.nx || 1, item.nz || 0, out);
    if (broke) out.reactionsThisTick += 1;
    else if (world.deferred.length < BUDGET.maxDeferred) world.deferred.push({ ...item, law: 'brittle' });
  }
}

/**
 * Advance material state by one fixed step. Positions and velocities are inputs;
 * impulses are outputs.
 * @param {object} world
 * @param {{ dt?: number, contacts?: object[] }} [input]
 */
export function stepReactiveMatter(world, input = {}) {
  if (!world || world.destroyed) throw new Error('reactive world is destroyed');
  const sanitized = sanitizeDt(input.dt == null ? REACTIVE_DT : input.dt);
  const dt = sanitized.dt;
  const contactsIn = Array.isArray(input.contacts) ? input.contacts : [];
  const contacts = contactsIn.length > BUDGET.maxContactsPerTick
    ? contactsIn.slice(0, BUDGET.maxContactsPerTick)
    : contactsIn;
  world.tick += 1;
  world.simTime += dt;
  for (const machine of world.machines.values()) {
    if (machine.flipEvery > 0 && world.tick % machine.flipEvery === 0) machine.polarity *= -1;
  }
  for (const body of world.bodies.values()) body.age += 1;

  const out = emptyResult(world, dt, sanitized.clamped);
  out.droppedContacts = Math.max(0, contactsIn.length - contacts.length);
  out.spawnedThisTick = 0;
  out.reactionsThisTick = 0;
  out.droppedReactions = 0;
  out.chain = [];
  out.brittle = [];

  if (!worldHasLaws(world)) {
    reapReactiveWorld(world);
    return out;
  }

  const bodies = sortedBodies(world);
  applyHeat(world, bodies, contacts, dt);
  planFerro(world, bodies, dt, out);
  planElastic(world, bodies, contacts, dt, out);

  for (let i = 0; i < world.deferred.length; i++) {
    const item = world.deferred[i];
    if (item.law === 'brittle') out.brittle.push(item);
    else out.chain.push(item);
  }
  world.deferred = [];
  considerVolatile(world, sortedBodies(world), contacts, out);
  considerBrittle(world, sortedBodies(world), contacts, out);
  drainQueue(world, out);
  world.dissipatedImpulse += out.dissipatedImpulse;

  const reaped = reapReactiveWorld(world);
  out.reaped = reaped;
  return out;
}

export { REACTIVE_STEP_ORDER, addMachine, claimReactiveSalvage };
