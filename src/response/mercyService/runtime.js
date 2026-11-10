// Mercy Service runtime. One fixed 60 Hz step. No second clock, no credit writes,
// no player-hull knockback. Mission/world/job wiring is described in ADAPTER.md
// and is not performed here.

import { mulberry32, mulberry32FromContinuation } from '../../core/rng.js';
import {
  CLEANUP_TICKS, DELIVER_ROLES, DISCOVER_RADIUS, MAX_ACTIVE, MAX_CHAIN_DEPTH,
  MERCY_DT, MERCY_SCHEMA, PLAYER_MASS, PLAYER_RADIUS, clamp,
} from './constants.js';
import { createEquipment, secureCapability } from './equipment.js';
import { accrue, advanceLatches, freshLatches, freshMeters, notePhase, phaseOf } from './gates.js';
import { boardIncidents, incidentById, validateCatalog } from './incidents.js';
import { deepestOverlap, refreshModel } from './models.js';
import {
  finishIncident, horizonKill, integratePlayer, integrateWorld, noteImpact, prepareIncident,
} from './physics.js';
import { commandFor } from './pilot.js';
import { emitRivalCapture, settleDelivery, settleLeave, settleLost } from './settlement.js';
import { createLiveMercyServiceSystem } from './live.js';
const CATALOG_ERRORS = validateCatalog();

function emptyStats() {
  return { bodySteps: 0, deferredBodies: 0, maxBodiesThisTick: 0, lastBodies: 0, cascades: 0, ticks: 0 };
}

export function createMercyRuntime(opts = {}) {
  if (CATALOG_ERRORS.length) {
    throw new Error(`mercy catalog: ${CATALOG_ERRORS.join('; ')}`);
  }
  if (opts.seed != null && (typeof opts.seed !== 'number' || !Number.isFinite(opts.seed))) {
    throw new TypeError('mercyService seed must be a finite number');
  }
  const seed = ((opts.seed ?? 1) >>> 0) || 1;
  const rt = {
    schema: MERCY_SCHEMA,
    seed,
    simTime: opts.simTime || 0,
    tick: 0,
    rng: opts.rng || mulberry32(seed),
    state: opts.state || null,
    bus: opts.bus || null,
    delegatePlayer: !!opts.delegatePlayer,
    destroyed: false,
    shelved: false,
    sectorId: opts.sectorId || null,
    player: {
      alive: true,
      hull: 120,
      hullMax: 120,
      mass: PLAYER_MASS,
      radius: PLAYER_RADIUS,
      pos: { x: 0, z: 0 },
      prev: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
    },
    tether: { attached: false, targetId: null, rest: 14, reel: 0, snapped: false },
    equipment: createEquipment(),
    bodies: {},
    incidents: {},
    activeIds: [],
    queue: [],
    known: [],
    dormant: [],
    intentLog: [],
    serial: 1,
    focus: null,
    stats: emptyStats(),
  };
  return rt;
}

export function syncFocus(rt) {
  rt.focus = null;
  for (let i = rt.activeIds.length - 1; i >= 0; i--) {
    const inc = rt.incidents[rt.activeIds[i]];
    if (inc && !inc.latches.settled && !inc.failedForward) {
      rt.focus = inc;
      return inc;
    }
  }
  return null;
}

function simulatingCount(rt) {
  let n = 0;
  for (let i = 0; i < rt.activeIds.length; i++) {
    const inc = rt.incidents[rt.activeIds[i]];
    if (inc && !inc.latches.settled && !inc.failedForward) n += 1;
  }
  return n;
}

function isOpen(rt, defId) {
  for (let i = 0; i < rt.activeIds.length; i++) {
    const inc = rt.incidents[rt.activeIds[i]];
    if (inc && inc.defId === defId && !inc.latches.settled && !inc.failedForward) return true;
  }
  return rt.queue.some((job) => job.id === defId);
}

function spawnBody(rt, inc, spec, origin) {
  const hull = spec.hull;
  const frac = spec.startHullFrac > 0 ? spec.startHullFrac : 1;
  const hullMax = frac < 1 ? hull / frac : hull;
  let jx = 0;
  if (spec.jitterAmp) jx = (rt.rng() - 0.5) * 2 * spec.jitterAmp;
  const body = {
    id: `${inc.uid}:${spec.localId}`,
    localId: spec.localId,
    incidentUid: inc.uid,
    model: spec.model,
    role: spec.role,
    pos: { x: spec.pos.x + origin.x + jx, z: spec.pos.z + origin.z },
    prev: { x: spec.pos.x + origin.x + jx, z: spec.pos.z + origin.z },
    vel: { x: spec.vel.x, z: spec.vel.z },
    angVel: spec.angVel || 0,
    rot: spec.rot || 0,
    mass: spec.mass,
    radius: spec.radius,
    toolR: spec.toolR || spec.radius,
    hull,
    hullMax,
    alive: true,
    kinematic: !!spec.kinematic,
    survivors: spec.survivors || 0,
    cargoCr: spec.cargoCr || 0,
    evidence: spec.evidence || 0,
    volatile: !!spec.volatile,
    ventPerS: spec.ventPerS || 0,
    spread: 0,
    rigAttached: false,
    clampAttached: false,
    driveHeld: false,
    driven: !!spec.driven,
    driveVel: spec.driveVel ? { x: spec.driveVel.x, z: spec.driveVel.z } : null,
    angVelDrive: spec.angVelDrive,
    field: spec.field || 0,
    horizon: spec.horizon || 0,
    strength: spec.strength || 0,
    recoveryRadius: spec.recoveryRadius || 0,
    damagePerS: spec.damagePerS || 0,
    pursue: spec.pursue || null,
    speed: spec.speed || 0,
    captureR: spec.captureR || 0,
    modelLock: spec.modelLock || null,
    modelState: 'intact',
    emits: false,
    wasOutside: true,
    crossHold: 0,
    crossMax: 0,
    delivered: false,
    deliveredTo: null,
    killedBy: null,
    owner: null,
  };
  refreshModel(body);
  const zone = spec.recoveryRadius
    && (body.pos.x - origin.x) * (body.pos.x - origin.x) + (body.pos.z - origin.z) * (body.pos.z - origin.z) < 1;
  body.wasOutside = !zone;
  rt.bodies[body.id] = body;
  inc.bodyList.push(body);
  return body;
}

export function beginIncident(rt, id, opts = {}) {
  if (!rt || rt.destroyed) return { ok: false, reason: 'destroyed' };
  const def = incidentById(id);
  if (!def) return { ok: false, reason: 'unknown' };
  if (!opts.cause && isOpen(rt, id)) return { ok: false, reason: 'duplicate' };
  if (simulatingCount(rt) >= MAX_ACTIVE && !opts.force) {
    rt.queue.push({
      id,
      origin: opts.origin || { x: 0, z: 0 },
      keepPlayer: !!opts.keepPlayer,
      depth: opts.depth || 0,
      cause: opts.cause || null,
      inheritVel: opts.inheritVel || null,
    });
    return { ok: true, queued: true };
  }
  const uid = `${rt.liveNamespace ? `${rt.liveNamespace}:` : ''}${id}#${rt.serial}`;
  rt.serial += 1;
  const origin = opts.origin || { x: 0, z: 0 };
  const inc = {
    uid,
    defId: id,
    def,
    depth: opts.depth || 0,
    parentUid: opts.cause || null,
    childUid: null,
    childDefId: null,
    intentOrder: def.defaultOrder,
    latches: freshLatches(),
    meters: freshMeters(),
    reading: null,
    arrest: 0,
    stabWork: 0,
    peakTension: 0,
    tensionNow: 0,
    snapCount: 0,
    trace: [],
    toolsSeen: [],
    phase: 'distress',
    outcome: null,
    failedForward: false,
    stabilizedId: null,
    securedId: null,
    deliveredTo: null,
    deliveredBodyId: null,
    resolvedOrder: null,
    settlementReceipt: null,
    wreck: null,
    cleanupAt: null,
    bornTick: -1,
    bodyList: [],
    well: null,
  };
  for (let i = 0; i < def.bodies.length; i++) spawnBody(rt, inc, def.bodies[i], origin);
  if (opts.inheritVel) {
    const subject = inc.bodyList.find((body) => body.localId === def.failure.subject);
    if (subject && !subject.kinematic) {
      subject.vel.x = opts.inheritVel.x;
      subject.vel.z = opts.inheritVel.z;
    }
  }
  inc.well = inc.bodyList.find((body) => body.role === 'well') || null;
  for (const body of inc.bodyList) {
    if (!body.recoveryRadius) body.wasOutside = true;
  }
  rt.incidents[uid] = inc;
  rt.activeIds.push(uid);
  if (!opts.keepPlayer) {
    const start = def.playerStart || { x: 0, z: 0 };
    rt.player.pos.x = origin.x + start.x;
    rt.player.pos.z = origin.z + start.z;
    rt.player.prev.x = rt.player.pos.x;
    rt.player.prev.z = rt.player.pos.z;
    rt.player.vel.x = 0;
    rt.player.vel.z = 0;
    rt.player.alive = true;
    rt.player.hull = rt.player.hullMax;
    rt.tether.attached = false;
    rt.tether.targetId = null;
  }
  notePhase(inc);
  syncFocus(rt);
  return { ok: true, queued: false, uid, incidentId: id };
}

export function acceptContract(rt, id) {
  const def = incidentById(id);
  if (!def || !def.board) return { ok: false, reason: 'unknown' };
  return beginIncident(rt, id, { origin: { x: def.boardOrigin.x, z: def.boardOrigin.z } });
}

export function seedSector(rt, sectorId) {
  rt.sectorId = sectorId || rt.sectorId;
  rt.dormant = boardIncidents().map((def) => {
    const mark = def.bodies.find((body) => body.localId === 'beacon');
    return {
      id: def.id,
      x: def.boardOrigin.x + mark.pos.x,
      z: def.boardOrigin.z + mark.pos.z,
    };
  });
  return rt.dormant;
}

export function damagePlayer(rt, amount) {
  rt.player.hull -= amount;
  if (rt.player.hull <= 0) {
    rt.player.hull = 0;
    rt.player.alive = false;
    rt.tether.attached = false;
    rt.tether.targetId = null;
  }
  return rt.player;
}

export function destroyRescueBody(rt, id) {
  const body = rt.bodies[id];
  if (!body) return { ok: false, reason: 'missing' };
  noteImpact(body, body.hull + 1);
  body.killedBy = body.killedBy || 'destroyed';
  return { ok: true, id };
}

export function shelveMercy(rt) {
  rt.shelved = true;
  return rt;
}

export function unshelveMercy(rt) {
  rt.shelved = false;
  return rt;
}

export function destroyMercyRuntime(rt) {
  rt.bodies = {};
  rt.incidents = {};
  rt.activeIds = [];
  rt.queue = [];
  rt.focus = null;
  rt.destroyed = true;
  rt.tether.attached = false;
  return rt;
}

function normalizeCommand(cmd) {
  const c = cmd || {};
  const tether = c.tether && typeof c.tether.targetLocal === 'string' ? c.tether : null;
  return {
    policy: typeof c.policy === 'string' ? c.policy : null,
    thrustX: clamp(c.thrustX || 0, -1, 1),
    thrustZ: clamp(c.thrustZ || 0, -1, 1),
    cut: c.cut === true,
    tether: tether ? { targetLocal: tether.targetLocal, reel: clamp(tether.reel || 0, -1, 1) } : null,
    clamp: c.clamp === true,
    clampTarget: typeof c.clampTarget === 'string' ? c.clampTarget : null,
    stabilizer: c.stabilizer === true,
    stabilizerTarget: typeof c.stabilizerTarget === 'string' ? c.stabilizerTarget : null,
    containment: c.containment === true,
    containmentTarget: typeof c.containmentTarget === 'string' ? c.containmentTarget : null,
  };
}

function discover(rt) {
  const r2 = DISCOVER_RADIUS * DISCOVER_RADIUS;
  for (let i = 0; i < rt.dormant.length; i++) {
    const mark = rt.dormant[i];
    if (rt.known.includes(mark.id)) continue;
    const dx = mark.x - rt.player.pos.x;
    const dz = mark.z - rt.player.pos.z;
    if (dx * dx + dz * dz <= r2) rt.known.push(mark.id);
  }
}

function promote(rt) {
  while (simulatingCount(rt) < MAX_ACTIVE && rt.queue.length > 0) {
    const job = rt.queue.shift();
    const begun = beginIncident(rt, job.id, {
      origin: job.origin,
      keepPlayer: job.keepPlayer,
      depth: job.depth,
      cause: job.cause,
      inheritVel: job.inheritVel,
      force: true,
    });
    if (!begun.ok) break;
  }
}

function dropBodies(rt, inc) {
  for (let i = inc.bodyList.length - 1; i >= 0; i--) {
    const body = inc.bodyList[i];
    delete rt.bodies[body.id];
  }
  inc.bodyList.length = 0;
}

function scheduleCleanup(rt, inc) {
  if (inc.cleanupAt == null) inc.cleanupAt = rt.tick + CLEANUP_TICKS;
}

function cleanup(rt) {
  const ids = Object.keys(rt.incidents);
  for (let i = 0; i < ids.length; i++) {
    const inc = rt.incidents[ids[i]];
    if (inc.cleanupAt != null && rt.tick >= inc.cleanupAt) dropBodies(rt, inc);
  }
}

function beaconOk(inc) {
  const beacon = inc.bodyList.find((body) => body.role === 'beacon');
  return !!(beacon && beacon.alive && beacon.emits);
}

function orderOf(inc) {
  return inc.def.orders[inc.intentOrder] || inc.def.orders[inc.def.defaultOrder];
}

function measure(rt, inc) {
  const order = orderOf(inc);
  const subject = order ? inc.bodyList.find((body) => body.localId === order.subject) : null;
  const player = rt.player;
  let dist = Infinity;
  let relSpeed = Infinity;
  let ke = 0;
  let spin = 0;
  if (subject && player.alive) {
    dist = Math.hypot(subject.pos.x - player.pos.x, subject.pos.z - player.pos.z);
    relSpeed = Math.hypot(subject.vel.x - player.vel.x, subject.vel.z - player.vel.z);
    const speed = Math.hypot(subject.vel.x, subject.vel.z);
    ke = 0.5 * subject.mass * speed * speed;
    spin = Math.abs(subject.angVel);
  }
  const near = dist <= inc.def.assessR;
  return {
    beaconEmits: beaconOk(inc),
    dist,
    relSpeed,
    ke,
    spin,
    subjectId: subject ? subject.id : null,
    secureOk: secureCapability(subject, inc.def, inc.tensionNow),
    reading: subject && near ? {
      hull: subject.hull,
      survivors: subject.survivors,
      volatile: subject.volatile,
      cargoCr: subject.cargoCr,
      evidence: subject.evidence,
    } : null,
    delivered: !!(subject && subject.delivered),
    deliveredId: subject && subject.delivered ? subject.id : null,
    deliveredTo: subject && subject.delivered ? subject.deliveredTo : null,
    resolvedOrder: subject && subject.delivered ? subject.resolvedOrder : null,
  };
}

export function failMercyIncident(rt, inc, subject, kind) {
  if (!inc || inc.failedForward || inc.latches.settled || inc.latches.extracted) return;
  const spawn = inc.def.failure && inc.def.failure.spawn;
  const wreckPos = subject ? { x: subject.pos.x, z: subject.pos.z } : { x: 0, z: 0 };
  inc.wreck = {
    x: wreckPos.x,
    z: wreckPos.z,
    model: subject ? subject.model : null,
    modelState: subject ? subject.modelState : 'destroyed',
    cause: kind,
    at: rt.simTime,
  };
  if (kind === 'capture') emitRivalCapture(rt, inc);
  const depthBlocked = (inc.depth || 0) >= MAX_CHAIN_DEPTH;
  if (!spawn || depthBlocked || !incidentById(spawn)) {
    settleLost(rt, inc, rt.player.alive ? 'lost' : 'ship_loss');
    scheduleCleanup(rt, inc);
    notePhase(inc);
    return;
  }
  inc.failedForward = true;
  const inherit = subject ? { x: subject.vel.x, z: subject.vel.z } : null;
  dropBodies(rt, inc);
  rt.activeIds = rt.activeIds.filter((id) => id !== inc.uid);
  const child = beginIncident(rt, spawn, {
    origin: wreckPos,
    keepPlayer: true,
    depth: (inc.depth || 0) + 1,
    cause: inc.uid,
    inheritVel: inherit,
    force: true,
  });
  if (child.ok && child.uid) {
    inc.childUid = child.uid;
    inc.childDefId = spawn;
    rt.stats.cascades += 1;
  }
  notePhase(inc);
}

const failIncident = failMercyIncident;

function checkFailure(rt, inc) {
  const fail = inc.def.failure;
  if (!fail || inc.latches.extracted || inc.latches.settled || inc.failedForward) return false;
  const subject = inc.bodyList.find((body) => body.localId === fail.subject);
  const hazard = fail.hazard ? inc.bodyList.find((body) => body.localId === fail.hazard) : null;
  if (fail.kind === 'horizon') {
    const killed = horizonKill(inc);
    if (killed && !killed.alive) {
      failIncident(rt, inc, killed, 'horizon');
      return true;
    }
  }
  if (fail.kind === 'spread' && subject && subject.spread >= 1) {
    subject.alive = false;
    subject.hull = 0;
    subject.killedBy = 'spread';
    refreshModel(subject);
    failIncident(rt, inc, subject, 'spread');
    return true;
  }
  if (fail.kind === 'capture' && subject && hazard && !inc.latches.secured) {
    const dist = Math.hypot(subject.pos.x - hazard.pos.x, subject.pos.z - hazard.pos.z);
    if (dist <= (hazard.captureR || 7)) {
      subject.owner = 'rival';
      subject.alive = false;
      subject.killedBy = hazard.localId;
      refreshModel(subject);
      failIncident(rt, inc, subject, 'capture');
      return true;
    }
  }
  if (fail.kind === 'contact' && subject && hazard) {
    const overlapping = subject.alive && hazard.alive && deepestOverlap(subject, hazard);
    const struck = !subject.alive && (subject.killedBy === hazard.localId || subject.killedBy === fail.hazard);
    if (overlapping || struck) {
      if (subject.alive) {
        subject.alive = false;
        subject.hull = 0;
        subject.killedBy = hazard.localId;
        refreshModel(subject);
      }
      failIncident(rt, inc, subject, 'contact');
      return true;
    }
  }
  if (subject && !subject.alive && !inc.latches.extracted && DELIVER_ROLES.includes(subject.role)) {
    failIncident(rt, inc, subject, subject.killedBy || 'lost');
    return true;
  }
  return false;
}

function checkLeave(rt, inc, dt) {
  if (inc.latches.secured || inc.latches.extracted || inc.latches.settled || inc.failedForward) return;
  const order = orderOf(inc);
  const subject = order && inc.bodyList.find((body) => body.localId === order.subject);
  if (!subject) return;
  const dist = Math.hypot(subject.pos.x - rt.player.pos.x, subject.pos.z - rt.player.pos.z);
  if (!(dist > inc.def.abandonR)) {
    inc.meters.abandon = 0;
    inc.meters.abandonMax = 0;
    return;
  }
  const value = accrue(inc.meters, 'abandon', dt, true);
  if (value >= inc.def.abandonHold) {
    settleLeave(rt, inc);
    scheduleCleanup(rt, inc);
    notePhase(inc);
  }
}

function copyPlayerFromState(rt) {
  const state = rt.state;
  const entities = state && state.entities;
  const entity = entities && typeof entities.get === 'function' ? entities.get(state.playerId) : null;
  // A delegated ship we cannot read is not alive. Leaving the previous true
  // lets the step extract and pay.
  if (!entity || !entity.pos) {
    rt.player.alive = false;
    return;
  }
  rt.player.pos.x = entity.pos.x || 0;
  rt.player.pos.z = entity.pos.z || 0;
  rt.player.vel.x = entity.vel ? entity.vel.x || 0 : 0;
  rt.player.vel.z = entity.vel ? entity.vel.z || 0 : 0;
  rt.player.alive = entity.alive !== false;
  rt.player.prev.x = rt.player.pos.x;
  rt.player.prev.z = rt.player.pos.z;
}

export function stepMercy(rt, dt, command) {
  if (!rt || rt.destroyed) return { ok: false, reason: 'destroyed' };
  if (dt !== MERCY_DT) return { ok: false, reason: 'fixed-dt' };
  if (rt.shelved) return { ok: true, reason: 'shelved', phase: rt.focus ? phaseOf(rt.focus) : null };
  if (rt.state && Number.isFinite(rt.state.simTime)) rt.simTime = rt.state.simTime;
  promote(rt);
  syncFocus(rt);
  let cmd = normalizeCommand(command);
  if (rt.delegatePlayer) copyPlayerFromState(rt);
  if (!rt.player.alive) {
    // A lost ship does not settle or abandon the rescue. The incident stays open.
    if (!rt.state) rt.simTime += dt;
    rt.tick += 1;
    rt.stats.ticks += 1;
    return { ok: true, phase: rt.focus ? phaseOf(rt.focus) : null, held: 'ship-loss' };
  }
  if (!rt.delegatePlayer) integratePlayer(rt, cmd, dt);

  if (rt.focus && cmd.policy && rt.focus.def.orders[cmd.policy]) rt.focus.intentOrder = cmd.policy;

  const active = rt.activeIds.map((id) => rt.incidents[id]).filter((inc) => {
    if (!inc || inc.failedForward) return false;
    if (inc.latches.settled && inc.settlementReceipt) return false;
    return true;
  });
  for (let i = 0; i < active.length; i++) {
    const inc = active[i];
    prepareIncident(rt, inc, inc === rt.focus ? cmd : normalizeCommand(null), dt, inc === rt.focus);
  }
  integrateWorld(rt, dt);
  for (let i = 0; i < active.length; i++) finishIncident(rt, active[i], dt);

  for (let i = 0; i < active.length; i++) {
    const inc = active[i];
    if (inc.latches.settled && !inc.settlementReceipt) inc.latches.settled = false;
    if (checkFailure(rt, inc)) continue;
    checkLeave(rt, inc, dt);
    if (inc.failedForward || inc.latches.settled) continue;
    const sample = measure(rt, inc);
    advanceLatches(inc, sample, dt);
    notePhase(inc);
    if (inc.latches.extracted && !inc.latches.settled) {
      const body = inc.bodyList.find((row) => row.id === inc.securedId) || inc.bodyList.find((row) => row.delivered);
      settleDelivery(rt, inc, body, beaconOk(inc));
      scheduleCleanup(rt, inc);
      notePhase(inc);
    }
  }

  cleanup(rt);
  discover(rt);
  if (!rt.state) rt.simTime += dt;
  rt.tick += 1;
  rt.stats.ticks += 1;
  syncFocus(rt);
  return { ok: true, phase: rt.focus ? phaseOf(rt.focus) : (active[0] ? phaseOf(active[0]) : null) };
}

export function runIncident(opts = {}) {
  const rt = opts.runtime || createMercyRuntime({ seed: opts.seed ?? 1 });
  if (!opts.runtime) {
    const begun = beginIncident(rt, opts.id, opts.begin || {});
    if (!begun.ok) return { ok: false, reason: begun.reason, rt };
  }
  const policy = opts.policy || (rt.focus && rt.focus.def.defaultOrder);
  const max = opts.ticks ?? 2200;
  const stopOnFail = opts.stopOnFail !== false;
  for (let i = 0; i < max; i++) {
    syncFocus(rt);
    const inc = rt.focus;
    if (!inc) break;
    if (inc.latches.settled) break;
    if (stopOnFail && inc.failedForward) break;
    const cmd = opts.command ? opts.command(rt, i) : commandFor(rt, policy);
    const stepped = stepMercy(rt, MERCY_DT, cmd);
    if (!stepped.ok) return { ok: false, reason: stepped.reason, rt };
  }
  return { ok: true, rt, report: report(rt) };
}

export function report(rt) {
  const inc = rt.focus || latestIncident(rt);
  const subject = inc && inc.securedId ? rt.bodies[inc.securedId] : null;
  return {
    id: inc ? inc.defId : null,
    uid: inc ? inc.uid : null,
    phase: inc ? inc.phase : null,
    outcome: inc ? inc.outcome : null,
    simTime: rt.simTime,
    tick: rt.tick,
    latches: inc ? { ...inc.latches } : null,
    arrest: inc ? inc.arrest : 0,
    peakTension: inc ? inc.peakTension : 0,
    snapCount: inc ? inc.snapCount : 0,
    resolvedOrder: inc ? inc.resolvedOrder : null,
    deliveredTo: inc ? inc.deliveredTo : null,
    childDefId: inc ? inc.childDefId : null,
    toolsSeen: inc ? inc.toolsSeen.slice() : [],
    trace: inc ? inc.trace.slice() : [],
    intents: rt.intentLog.map((row) => ({ type: row.type, amount: row.amount, key: row.key, fact: row.fact })),
    wreck: inc ? inc.wreck : null,
    subject: subject ? { x: subject.pos.x, z: subject.pos.z } : null,
    player: { x: rt.player.pos.x, z: rt.player.pos.z, alive: rt.player.alive },
    stats: { ...rt.stats },
  };
}

function latestIncident(rt) {
  const ids = Object.keys(rt.incidents);
  return ids.length ? rt.incidents[ids[ids.length - 1]] : null;
}

export function worldDigest(rt) {
  const ids = Object.keys(rt.bodies).sort();
  return JSON.stringify({
    t: rt.simTime,
    tick: rt.tick,
    bodies: ids.map((id) => {
      const body = rt.bodies[id];
      return [id, round(body.pos.x), round(body.pos.z), round(body.vel.x), round(body.vel.z), round(body.rot), body.alive ? 1 : 0, round(body.hull)];
    }),
    intents: rt.intentLog.map((row) => row.key),
  });
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

export function snapshotMercy(rt) {
  return {
    schema: MERCY_SCHEMA,
    seed: rt.seed,
    simTime: rt.simTime,
    tick: rt.tick,
    rng: rt.rng.getState(),
    shelved: rt.shelved,
    sectorId: rt.sectorId,
    liveNamespace: rt.liveNamespace || null,
    serial: rt.serial,
    player: {
      alive: rt.player.alive,
      hull: rt.player.hull,
      hullMax: rt.player.hullMax,
      pos: { ...rt.player.pos },
      prev: { ...rt.player.prev },
      vel: { ...rt.player.vel },
    },
    tether: { ...rt.tether },
    activeIds: rt.activeIds.slice(),
    queue: rt.queue.map((job) => ({ ...job, origin: job.origin ? { ...job.origin } : null, inheritVel: job.inheritVel ? { ...job.inheritVel } : null })),
    known: rt.known.slice(),
    dormant: rt.dormant.map((mark) => ({ ...mark })),
    intentLog: rt.intentLog.map((row) => ({ ...row })),
    appliedGrants: { ...(rt.appliedGrants || {}) },
    stats: { ...rt.stats },
    bodies: Object.keys(rt.bodies).sort().map((id) => ({ ...rt.bodies[id], pos: { ...rt.bodies[id].pos }, prev: { ...rt.bodies[id].prev }, vel: { ...rt.bodies[id].vel } })),
    incidents: Object.keys(rt.incidents).sort().map((uid) => slimIncident(rt.incidents[uid])),
  };
}

function slimIncident(inc) {
  return {
    uid: inc.uid,
    defId: inc.defId,
    depth: inc.depth,
    parentUid: inc.parentUid,
    childUid: inc.childUid,
    childDefId: inc.childDefId,
    intentOrder: inc.intentOrder,
    latches: { ...inc.latches },
    meters: { ...inc.meters },
    reading: inc.reading ? { ...inc.reading } : null,
    arrest: inc.arrest,
    stabWork: inc.stabWork,
    peakTension: inc.peakTension,
    tensionNow: inc.tensionNow,
    snapCount: inc.snapCount,
    trace: inc.trace.slice(),
    toolsSeen: inc.toolsSeen.slice(),
    phase: inc.phase,
    outcome: inc.outcome,
    failedForward: inc.failedForward,
    stabilizedId: inc.stabilizedId,
    securedId: inc.securedId,
    deliveredTo: inc.deliveredTo,
    deliveredBodyId: inc.deliveredBodyId,
    resolvedOrder: inc.resolvedOrder,
    settlementReceipt: inc.settlementReceipt ? JSON.parse(JSON.stringify(inc.settlementReceipt)) : null,
    wreck: inc.wreck ? { ...inc.wreck } : null,
    cleanupAt: inc.cleanupAt,
    bornTick: inc.bornTick,
    offerId: inc.offerId ?? null,
    scanUntil: inc.scanUntil || 0,
  };
}

export function restoreMercy(rt, snap) {
  if (!snap || snap.schema !== MERCY_SCHEMA) return { ok: false, reason: 'schema' };
  if (!Array.isArray(snap.bodies) || !Array.isArray(snap.incidents)) return { ok: false, reason: 'shape' };
  rt.seed = snap.seed;
  rt.simTime = snap.simTime;
  rt.tick = snap.tick;
  rt.rng = mulberry32FromContinuation(snap.rng);
  rt.shelved = !!snap.shelved;
  rt.sectorId = snap.sectorId;
  rt.liveNamespace = snap.liveNamespace || null;
  rt.serial = snap.serial;
  rt.player = {
    ...rt.player,
    alive: snap.player.alive,
    hull: snap.player.hull,
    hullMax: snap.player.hullMax,
    pos: { ...snap.player.pos },
    prev: { ...snap.player.prev },
    vel: { ...snap.player.vel },
  };
  rt.tether = { ...snap.tether };
  rt.intentLog = snap.intentLog.map((row) => ({ ...row, applied: true }));
  rt.appliedGrants = { ...(snap.appliedGrants || {}) };
  for (const row of rt.intentLog) if (row.key) rt.appliedGrants[row.key] = true;
  rt.stats = { ...snap.stats };
  rt.known = snap.known.slice();
  rt.dormant = snap.dormant.map((mark) => ({ ...mark }));
  rt.queue = snap.queue.map((job) => ({
    ...job,
    origin: job.origin ? { ...job.origin } : { x: 0, z: 0 },
    inheritVel: job.inheritVel ? { ...job.inheritVel } : null,
  }));
  rt.bodies = {};
  for (let i = 0; i < snap.bodies.length; i++) {
    const body = snap.bodies[i];
    rt.bodies[body.id] = {
      ...body,
      pos: { ...body.pos },
      prev: { ...body.prev },
      vel: { ...body.vel },
      driveVel: body.driveVel ? { ...body.driveVel } : null,
    };
  }
  rt.incidents = {};
  rt.activeIds = [];
  for (let i = 0; i < snap.incidents.length; i++) {
    const slim = snap.incidents[i];
    const def = incidentById(slim.defId);
    if (!def) return { ok: false, reason: 'unknown-incident' };
    const inc = {
      ...slim,
      def,
      latches: { ...slim.latches },
      meters: { ...slim.meters },
      reading: slim.reading ? { ...slim.reading } : null,
      trace: slim.trace.slice(),
      toolsSeen: slim.toolsSeen.slice(),
      settlementReceipt: slim.settlementReceipt ? JSON.parse(JSON.stringify(slim.settlementReceipt)) : null,
      wreck: slim.wreck ? { ...slim.wreck } : null,
      bodyList: [],
      well: null,
    };
    for (const id of Object.keys(rt.bodies)) {
      if (rt.bodies[id].incidentUid === inc.uid) inc.bodyList.push(rt.bodies[id]);
    }
    inc.well = inc.bodyList.find((body) => body.role === 'well') || null;
    rt.incidents[inc.uid] = inc;
  }
  rt.activeIds = snap.activeIds.filter((id) => rt.incidents[id]);
  syncFocus(rt);
  return { ok: true };
}

export function commandFromGameState(state) {
  const input = (state && state.input) || {};
  const actions = input.actions || {};
  const reel = (actions.reelOut ? 1 : 0) - (actions.reelIn ? 1 : 0);
  const tetherOn = !!(actions.tether || actions.tetherFire);
  return normalizeCommand({
    thrustX: input.moveX || 0,
    thrustZ: input.moveZ || 0,
    cut: !!actions.tetherCut,
    tether: tetherOn ? { targetLocal: actions.mercyTarget || 'hull', reel } : null,
    clamp: !!actions.mercyClamp,
    clampTarget: actions.mercyClampTarget || null,
    stabilizer: !!actions.mercyStabilizer,
    stabilizerTarget: actions.mercyStabilizerTarget || null,
    containment: !!actions.mercyContainment,
    containmentTarget: actions.mercyContainmentTarget || null,
  });
}

export function createMercyServiceSystem() {
  return createLiveMercyServiceSystem();
}

export function createMercyFixtureSystem() {
  return {
    name: 'mercyService',
    rt: null,
    init(ctx) {
      const state = ctx.state;
      this.rt = createMercyRuntime({
        seed: state && state.meta ? state.meta.seed : 1,
        rng: state ? state.rng : null,
        state,
        bus: ctx.bus,
        delegatePlayer: true,
      });
      if (state && state.mercyService) restoreMercy(this.rt, state.mercyService);
      ctx.mercyService = this.rt;
    },
    update(dt, state) {
      if (!this.rt || this.rt.destroyed) return { ok: false, reason: 'destroyed' };
      if (state) this.rt.state = state;
      return stepMercy(this.rt, dt, commandFromGameState(state));
    },
  };
}

export { noteImpact };
export { measure as measureMercyIncident };
