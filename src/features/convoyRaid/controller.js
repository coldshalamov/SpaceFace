import { SWITCHBACK } from './catalog.js';
import { getTrainComponents, getCouplerGeometry } from './train.js';

const FINITE_LIMIT = 1e7;
const TERMINAL = new Set(['lawful_delivery', 'lawful_defense', 'lawful_partial', 'stolen_escape', 'stolen_collateral',
  'failed_theft', 'convoy_lost', 'abandoned', 'declined', 'invalid_restore']);
const finite = (value, fallback = 0) => Number.isFinite(value) ? Math.max(-FINITE_LIMIT, Math.min(FINITE_LIMIT, value)) : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const textId = (id) => (typeof id === 'string' || typeof id === 'number') ? String(id).slice(0, 120) : '';
const distance = (a, b) => a && b ? Math.hypot(finite(a.x) - finite(b.x), finite(a.z) - finite(b.z)) : Infinity;
const liveBody = (body) => !!body && body.lost !== true && body.alive !== false && (!(Number.isFinite(body.hp)) || body.hp > 0);
const bodiesOf = (train) => Array.isArray(train?.bodies) ? train.bodies.slice(0, 6) : [];
const couplersOf = (train) => Array.isArray(train?.couplers) ? train.couplers.slice(0, 5) : [];
const bodyById = (train, id) => bodiesOf(train).find((body) => textId(body.id) === textId(id));
const isGone = (train, id) => !liveBody(bodyById(train, id));
const receiverPoint = (receiver) => receiver?.pos ? { ...receiver.pos, vx: receiver.vel?.x || 0, vz: receiver.vel?.z || 0,
  radius: receiver.radius, alive: receiver.alive } : receiver;

function sideOf(point, gate) {
  return (point.x - gate.x) * gate.nx + (point.z - gate.z) * gate.nz;
}

/** A directed swept gate, so a fast genuine crossing is accepted without relying on overlap. */
export function crossedFork(previous, current, gate, dt = 1 / 60) {
  if (!previous || !current || !gate || ![gate.x, gate.z, gate.nx, gate.nz, gate.halfWidth].every(Number.isFinite)) return false;
  const a = sideOf(previous, gate), b = sideOf(current, gate);
  if (!(a < 0 && b >= 0)) return false;
  // A restored/teleported body must establish a new observed trajectory, not sweep the whole sector.
  const speed = Math.max(Math.hypot(finite(previous.vx), finite(previous.vz)), Math.hypot(finite(current.vx), finite(current.vz)));
  if (distance(previous, current) > Math.max(80, speed * Math.max(0, dt) * 3 + 12)) return false;
  const t = -a / (b - a);
  const x = previous.x + (current.x - previous.x) * t;
  const z = previous.z + (current.z - previous.z) * t;
  return Math.abs((x - gate.x) * -gate.nz + (z - gate.z) * gate.nx) <= gate.halfWidth;
}

/**
 * The controller owns contract decisions only. `train` remains the train solver's plain state;
 * frame observations come from physicsAuthority. No mesh, entity or event-bus reference is retained.
 */
export function createRaid({ runId = 'switchback', seed = 4242, train, simTime = 0, sectorId = SWITCHBACK.sectorId } = {}) {
  if (!train || !bodyById(train, train.targetId)) throw new TypeError('SWITCHBACK requires a train with one target body');
  const target = bodyById(train, train.targetId);
  return {
    schemaVersion: 1,
    runId: textId(runId) || 'switchback',
    seed: (Number.isFinite(seed) ? seed : 4242) >>> 0,
    sectorId: textId(sectorId),
    phase: 'offered',
    mode: null,
    targetId: textId(target.id),
    targetSerial: textId(target.serial) || `SWB-${(seed >>> 0).toString(16).toUpperCase()}-${bodiesOf(train).indexOf(target)}`,
    startedAt: finite(simTime),
    lastSimTime: finite(simTime),
    elapsed: 0,
    crimeCommitted: false,
    crimeReason: null,
    noise: 0,
    defended: false,
    underAttack: false,
    coverS: 0,
    raiderWaveRequested: false,
    collateralIds: [],
    lostIds: [],
    commandReceipts: [],
    forkCrossed: false,
    forkCrossedAt: null,
    receiverHoldS: 0,
    quietLatch: { couplerId: null, heldS: 0, requiredS: SWITCHBACK.latchHoldS },
    braceUntil: 0,
    escortOrders: [],
    nextEscortThinkAt: finite(simTime),
    awayS: 0,
    previousTarget: null,
    outcome: null,
    settlement: null,
    targetEverDetached: false,
    targetHandled: false,
    targetRecovered: false,
    notified: [],
  };
}

function emit(effects, effect) {
  // Reserve a slot for the irreversible settlement intent even on a busy combat tick.
  const capacity = effect.type === 'settlement' ? SWITCHBACK.maxEffectsPerTick : SWITCHBACK.maxEffectsPerTick - 1;
  if (effects.length < capacity) effects.push(effect);
}

function notice(raid, effects, key, message) {
  if (raid.notified.includes(key)) return;
  raid.notified.push(key);
  if (raid.notified.length > 24) raid.notified.shift();
  emit(effects, { type: 'message', key, text: message });
}

function recordCrime(raid, effects, reason, bodyId) {
  if (raid.crimeCommitted) return;
  raid.crimeCommitted = true;
  raid.crimeReason = reason;
  raid.mode = 'theft';
  emit(effects, { type: 'crime', kind: reason, targetId: textId(bodyId || raid.targetId), factionId: SWITCHBACK.factionId,
    receiptId: `${raid.runId}:crime` });
  notice(raid, effects, 'theft', 'The freight crew reported interference. The close escort is protecting the spindle carrier.');
}

function settle(raid, effects, outcome, train) {
  if (raid.phase === 'settled' || raid.settlement) return;
  const target = bodyById(train, raid.targetId);
  const maxHp = Math.max(1, finite(target?.maxHp, finite(target?.hullMax, finite(target?.initialHp, 100))));
  const condition = target ? clamp(finite(target.hp, maxHp) / maxHp, 0.25, 1) : 0;
  const count = raid.lostIds.filter((id) => id !== raid.targetId).length;
  let credits = 0, reputation = 0, consumeTarget = false;
  if (outcome === 'lawful_delivery' || outcome === 'lawful_defense' || outcome === 'lawful_partial') {
    credits = Math.max(0, SWITCHBACK.escortReward + (raid.defended ? SWITCHBACK.defenseBonus : 0) - count * SWITCHBACK.collateralPenalty);
    reputation = outcome === 'lawful_partial' ? 1 : (raid.defended ? 5 : 3);
  } else if (outcome === 'stolen_escape' || outcome === 'stolen_collateral') {
    credits = Math.max(0, Math.floor(SWITCHBACK.theftReward * condition) - raid.collateralIds.length * SWITCHBACK.collateralPenalty);
    reputation = -4 - raid.collateralIds.length * 2;
    consumeTarget = true;
  } else if (raid.crimeCommitted) reputation = -2 - raid.collateralIds.length * 2;
  raid.phase = 'settled';
  raid.outcome = outcome;
  raid.receiverHoldS = 0;
  raid.quietLatch = { couplerId: null, heldS: 0, requiredS: SWITCHBACK.latchHoldS };
  // Written BEFORE exposing the intent. Synchronous owner adapters consume this in the same tick;
  // serializing/reloading a settled raid can never issue it a second time.
  raid.settlement = { id: `${raid.runId}:settlement`, outcome, credits, reputation, factionId: SWITCHBACK.factionId,
    targetId: raid.targetId, consumeTarget, emitted: true, at: raid.lastSimTime };
  emit(effects, { type: 'settlement', ...raid.settlement });
}

function commandIsFresh(raid, command) {
  if (!command || typeof command !== 'object' || typeof command.type !== 'string') return false;
  const id = textId(command.id);
  if (!id) return true; // Repeated unkeyed latch holds are intentional; physics hits should provide IDs.
  if (raid.commandReceipts.includes(id)) return false;
  raid.commandReceipts.push(id);
  if (raid.commandReceipts.length > SWITCHBACK.maxCommandReceipts) raid.commandReceipts.shift();
  return true;
}

function geometryFor(train, couplerId) {
  const geometry = getCouplerGeometry(train, couplerId);
  if (!geometry) return null;
  const a = bodyById(train, couplersOf(train).find((item) => textId(item.id) === textId(couplerId))?.aId);
  const b = bodyById(train, couplersOf(train).find((item) => textId(item.id) === textId(couplerId))?.bId);
  const point = geometry.midpoint || geometry.mid || geometry;
  const x = Number.isFinite(point.x) ? point.x : ((geometry.ax ?? a?.x ?? 0) + (geometry.bx ?? b?.x ?? 0)) / 2;
  const z = Number.isFinite(point.z) ? point.z : ((geometry.az ?? a?.z ?? 0) + (geometry.bz ?? b?.z ?? 0)) / 2;
  return { x, z, vx: ((a?.vx || 0) + (b?.vx || 0)) / 2, vz: ((a?.vz || 0) + (b?.vz || 0)) / 2,
    tension: finite(geometry.tension, finite(geometry.strain)), a, b };
}

function quietRelease(raid, train, player, command, dt, effects) {
  const coupler = couplersOf(train).find((row) => textId(row.id) === textId(command.couplerId));
  const geometry = coupler && !coupler.severed ? geometryFor(train, coupler.id) : null;
  const relativeSpeed = geometry && player ? Math.hypot(finite(player.vx) - geometry.vx, finite(player.vz) - geometry.vz) : Infinity;
  const eligible = geometry && liveBody(geometry.a) && liveBody(geometry.b) && liveBody(player)
    && distance(player, geometry) <= SWITCHBACK.latchRange && relativeSpeed <= SWITCHBACK.latchSpeed
    && geometry.tension <= SWITCHBACK.latchTension
    && finite(coupler.braceUntil) <= raid.lastSimTime && finite(train.braceUntil) <= raid.lastSimTime;
  if (!eligible) {
    raid.quietLatch = { couplerId: null, heldS: 0, requiredS: SWITCHBACK.latchHoldS };
    return;
  }
  if (raid.quietLatch.couplerId !== textId(coupler.id)) raid.quietLatch = { couplerId: textId(coupler.id), heldS: 0, requiredS: SWITCHBACK.latchHoldS };
  raid.quietLatch.heldS = Math.min(SWITCHBACK.latchHoldS, raid.quietLatch.heldS + dt);
  if (raid.quietLatch.heldS + 1e-9 < SWITCHBACK.latchHoldS) return;
  recordCrime(raid, effects, 'theft', raid.targetId);
  emit(effects, { type: 'sever', couplerId: textId(coupler.id), reason: 'service_release', simTime: raid.lastSimTime });
  raid.braceUntil = Math.max(raid.braceUntil, raid.lastSimTime + 2.4);
  emit(effects, { type: 'brace', until: raid.braceUntil, reason: 'coupler_release' });
  notice(raid, effects, `released:${coupler.id}`, 'Latch released. That chain keeps its velocity. The tug is bracing for the missing load.');
  raid.quietLatch = { couplerId: null, heldS: 0, requiredS: SWITCHBACK.latchHoldS };
}

function orderEscorts(raid, frame, train, target, components, now, effects) {
  if (now < raid.nextEscortThinkAt) return;
  raid.nextEscortThinkAt = now + SWITCHBACK.guardThinkS;
  const escorts = (Array.isArray(frame.escorts) ? frame.escorts : []).slice(0, SWITCHBACK.maxEscorts).filter(liveBody);
  const player = frame.player;
  const tug = bodiesOf(train).find((body) => body.role === 'tug') || bodiesOf(train)[0];
  const stranded = components.filter((component) => !component.powered)
    .flatMap((component) => component.bodyIds || []).map((id) => bodyById(train, id)).filter(liveBody);
  const valuableDetached = stranded.some((body) => textId(body.id) === raid.targetId);
  const otherStranded = stranded.find((body) => textId(body.id) !== raid.targetId);
  raid.escortOrders = escorts.map((escort, index) => {
    let mode = 'guard', goal = target || tug, reason = 'protect_spindle';
    if (valuableDetached && index === 0) {
      mode = 'recover'; goal = target; reason = 'valuable_straggler';
    } else if (raid.crimeCommitted && player && distance(player, target || tug) < SWITCHBACK.escortRange && index > 0) {
      mode = 'chase'; goal = player; reason = 'separate_thief_from_freight';
    } else if (otherStranded && (index > 0 || !valuableDetached)) {
      mode = 'recover'; goal = otherStranded; reason = 'recover_straggler';
    } else if (raid.crimeCommitted) {
      mode = 'screen'; goal = target || tug; reason = 'protect_freight_over_chase';
    }
    const order = { escortId: textId(escort.id), mode, targetId: textId(goal?.id), x: finite(goal?.x), z: finite(goal?.z),
      returnX: finite(tug?.x), returnZ: finite(tug?.z), reason };
    emit(effects, { type: 'escortOrder', ...order });
    return order;
  });
}

/**
 * frame = { simTime, dt, train, player:{id,x,z,vx,vz,hp}, escorts:[], sectorId,
 *           receivers?:{lawful,illicit}, spawnRaiders?:boolean }.
 * Commands are validated at the gameplay boundary; runtime alone translates combat/power evidence.
 * This function never changes train body transforms, inventory, credits, reputation or heat.
 */
export function advanceRaid(raid, frame = {}, commands = []) {
  const effects = [];
  if (!raid || raid.phase === 'settled' || raid.settlement) return effects;
  const train = frame.train;
  if (!train || textId(train.targetId) !== raid.targetId) {
    settle(raid, effects, 'invalid_restore', train);
    return effects;
  }
  const simTime = finite(frame.simTime, raid.lastSimTime);
  const elapsed = Math.max(0, simTime - raid.lastSimTime);
  const dt = clamp(finite(frame.dt, elapsed), 0, 0.25);
  // Duplicate same-time updates cannot accumulate service/delivery hold or escort commands.
  const step = simTime > raid.lastSimTime ? Math.min(dt, elapsed) : 0;
  raid.lastSimTime = Math.max(raid.lastSimTime, simTime);
  let latchCommand = false;
  for (const command of (Array.isArray(commands) ? commands : []).slice(0, SWITCHBACK.maxCommandsPerTick)) {
    if (!commandIsFresh(raid, command)) continue;
    if (command.type === 'choose' && raid.phase === 'offered') {
      if (command.choice === 'decline') { settle(raid, effects, 'declined', train); break; }
      if (command.choice !== 'escort' && command.choice !== 'theft') continue;
      raid.mode = command.choice;
      raid.phase = 'running';
      raid.startedAt = raid.lastSimTime;
      notice(raid, effects, 'start', command.choice === 'escort'
        ? 'Keep the double-chevron spindle carrier moving to the freight receiver. The close escort will recover stragglers.'
        : 'Match speed beside a coupler and hold its service latch. Free both sides of the double-chevron carrier, then take the side fork.');
    }
    if (raid.phase !== 'running') continue;
    if (command.type === 'releaseCoupler' && !latchCommand) {
      latchCommand = true;
      const requested = textId(command.couplerId);
      if (requested && requested !== raid.quietLatch.couplerId) {
        raid.quietLatch = { couplerId: requested, heldS: 0, requiredS: SWITCHBACK.latchHoldS };
      }
    } else if (command.type === 'cancelLatch') {
      raid.quietLatch = { couplerId: null, heldS: 0, requiredS: SWITCHBACK.latchHoldS };
    } else if (command.type === 'damageCoupler') {
      const coupler = couplersOf(train).find((row) => textId(row.id) === textId(command.couplerId));
      const amount = clamp(finite(command.amount), 0, 1);
      if (!coupler || coupler.severed || !(amount > 0)) continue;
      if (command.actor === 'player') recordCrime(raid, effects, 'assault', coupler.aId);
      raid.noise = Math.min(100, raid.noise + amount * 25);
      emit(effects, { type: 'damageCoupler', couplerId: textId(coupler.id), amount, reason: command.actor === 'player' ? 'player_attack' : 'impact' });
    } else if (command.type === 'attack') {
      const relevant = bodiesOf(train).some((body) => textId(body.id) === textId(command.targetId))
        || (frame.escorts || []).some((body) => textId(body.id) === textId(command.targetId));
      if (!relevant) continue;
      if (command.actor === 'player') recordCrime(raid, effects, 'assault', command.targetId);
      else raid.underAttack = true;
    } else if (command.type === 'defend') {
      const raider = (Array.isArray(frame.raiders) ? frame.raiders : []).slice(0, SWITCHBACK.maxRaiderCount)
        .find((row) => textId(row.id) === textId(command.raiderId));
      if (command.actor === 'player' && raider && (finite(command.damage) > 0 || command.destroyed === true)
        && distance(raider, bodyById(train, raid.targetId)) <= SWITCHBACK.escortRange) raid.defended = true;
    } else if (command.type === 'bodyLost') {
      const body = bodyById(train, command.bodyId);
      const escort = (frame.escorts || []).find((row) => textId(row.id) === textId(command.bodyId));
      if (!body && !escort) continue;
      const id = textId(command.bodyId);
      if (body && !raid.lostIds.includes(id)) raid.lostIds.push(id);
      if (command.actor === 'player' && !raid.collateralIds.includes(id)) {
        raid.collateralIds.push(id);
        recordCrime(raid, effects, 'destruction', id);
      }
    } else if (command.type === 'interference') {
      // Issued by the adapter only for player-caused massline/Pin/Shove evidence on this train.
      if (bodyById(train, command.bodyId)) {
        const component = getTrainComponents(train).find((row) => row.bodyIds.includes(textId(command.bodyId)));
        if (textId(command.bodyId) === raid.targetId || component?.containsTarget) raid.targetHandled = true;
        const lawfulRecovery = raid.mode === 'escort' && component && !component.powered && command.destructive !== true;
        if (!lawfulRecovery) recordCrime(raid, effects, 'theft', command.bodyId);
      }
    } else if (command.type === 'abandon') {
      settle(raid, effects, raid.crimeCommitted ? 'failed_theft' : 'abandoned', train);
    }
    if (raid.phase === 'settled') break;
  }
  if (raid.phase !== 'running') return effects;
  raid.elapsed = Math.max(0, raid.lastSimTime - raid.startedAt);
  // One existing interaction action arms a latch; physical eligibility must hold continuously.
  // No new key binding or per-render input stream is required. Moving away cancels it.
  if (raid.quietLatch.couplerId) {
    quietRelease(raid, train, frame.player, { couplerId: raid.quietLatch.couplerId }, step, effects);
  }
  for (const body of bodiesOf(train)) if (!liveBody(body) && !raid.lostIds.includes(textId(body.id))) raid.lostIds.push(textId(body.id));
  if (isGone(train, raid.targetId) || raid.lostIds.includes(raid.targetId)) {
    settle(raid, effects, raid.crimeCommitted ? 'failed_theft' : 'convoy_lost', train);
    return effects;
  }
  const target = bodyById(train, raid.targetId);
  if (!raid.crimeCommitted && raid.mode === 'escort' && liveBody(frame.player)
    && distance(frame.player, target) <= SWITCHBACK.escortRange && Math.hypot(finite(target.vx), finite(target.vz)) >= 3) {
    raid.coverS = Math.min(SWITCHBACK.durationS, raid.coverS + step);
  }
  const components = getTrainComponents(train);
  const targetComponent = components.find((component) => (component.bodyIds || []).some((id) => textId(id) === raid.targetId));
  const detached = !!targetComponent && !targetComponent.powered;
  const isolated = detached && targetComponent.bodyIds.length === 1;
  if (detached) {
    raid.targetEverDetached = true;
    notice(raid, effects, 'detached', isolated
      ? 'Spindle carrier free. Its velocity is unchanged; steer the mass through the side-fork gate.'
      : 'The target is in a loose chain. Release the remaining joint to extract the marked carriage alone.');
  }
  if (raid.targetEverDetached && !detached) raid.targetRecovered = true;
  const route = train.route || frame.route;
  const playerExport = raid.crimeCommitted || raid.targetHandled || (raid.mode === 'theft'
    && liveBody(frame.player) && distance(frame.player, target) <= SWITCHBACK.receiverPlayerRange);
  if (detached && playerExport && route?.fork && crossedFork(raid.previousTarget, target, route.fork, step)) {
    recordCrime(raid, effects, 'theft', raid.targetId);
    raid.forkCrossed = true;
    raid.forkCrossedAt = raid.lastSimTime;
    notice(raid, effects, 'fork', 'The marked carrier crossed the side fork. Slow it inside the receiver cradle.');
  }
  raid.previousTarget = { x: finite(target.x), z: finite(target.z), vx: finite(target.vx), vz: finite(target.vz) };
  const receivers = frame.receivers || route?.receivers || {};
  const illicit = receiverPoint(receivers.illicit);
  const lawful = receiverPoint(receivers.lawful);
  const playerNearTarget = liveBody(frame.player) && distance(frame.player, target) <= SWITCHBACK.receiverPlayerRange;
  const targetSpeed = (receiver) => Math.hypot(finite(target.vx) - finite(receiver?.vx), finite(target.vz) - finite(receiver?.vz));
  const inReceiver = (receiver) => receiver && receiver.alive !== false && distance(target, receiver) <= Math.max(1, finite(receiver.radius, 50));
  if (raid.crimeCommitted && isolated && raid.forkCrossed && inReceiver(illicit) && playerNearTarget && targetSpeed(illicit) <= SWITCHBACK.receiverSpeed) {
    raid.receiverHoldS += step;
    if (raid.receiverHoldS + 1e-9 >= SWITCHBACK.receiverHoldS) {
      settle(raid, effects, raid.collateralIds.length ? 'stolen_collateral' : 'stolen_escape', train);
      return effects;
    }
  } else raid.receiverHoldS = 0;
  const tug = bodiesOf(train).find((body) => body.role === 'tug') || bodiesOf(train)[0];
  const lawfulArrival = inReceiver(lawful) && targetSpeed(lawful) <= SWITCHBACK.speed + 8;
  if (lawfulArrival && !raid.crimeCommitted && raid.mode === 'escort' && playerNearTarget && (raid.coverS >= 20 || raid.defended)) {
    settle(raid, effects, raid.lostIds.length ? 'lawful_partial' : raid.defended ? 'lawful_defense' : 'lawful_delivery', train);
    return effects;
  }
  if (lawfulArrival && raid.crimeCommitted && !detached) {
    settle(raid, effects, 'failed_theft', train);
    return effects;
  }
  if (frame.spawnRaiders === true && raid.mode === 'escort' && !raid.raiderWaveRequested && route?.length > 0
    && finite(train.routeDistance) >= route.length * 0.3) {
    raid.raiderWaveRequested = true;
    emit(effects, { type: 'spawnRaiders', count: SWITCHBACK.maxRaiderCount, targetId: raid.targetId,
      x: finite(target.x) + 180, z: finite(target.z) - 130, receiptId: `${raid.runId}:raiders` });
    notice(raid, effects, 'raiders', 'Two raiders are cutting across the freight lane. The carrier, not your kill count, is the contract.');
  }
  orderEscorts(raid, frame, train, target, components, raid.lastSimTime, effects);
  const nearestFreight = Math.min(...bodiesOf(train).filter(liveBody).map((body) => distance(frame.player, body)));
  const away = !liveBody(frame.player) || (frame.sectorId && frame.sectorId !== raid.sectorId) || nearestFreight > SWITCHBACK.abandonRange;
  raid.awayS = away ? raid.awayS + step : 0;
  if (raid.elapsed > SWITCHBACK.durationS || raid.awayS >= SWITCHBACK.abandonGraceS) {
    settle(raid, effects, raid.crimeCommitted ? 'failed_theft' : 'abandoned', train);
  } else if (isGone(train, tug?.id)) {
    notice(raid, effects, 'tug_lost', 'The tug is lost. The surviving freight is still physical; recover the marked carrier to finish the job.');
  }
  return effects;
}

/** Save only contract-owned scalar/ID state. No runtime bindings or pending commands survive. */
export function serializeRaid(raid) {
  if (!raid || typeof raid !== 'object') return null;
  return JSON.parse(JSON.stringify({
    schemaVersion: 1, runId: raid.runId, seed: raid.seed, sectorId: raid.sectorId, phase: raid.phase, mode: raid.mode,
    targetId: raid.targetId, targetSerial: raid.targetSerial, startedAt: raid.startedAt, lastSimTime: raid.lastSimTime,
    elapsed: raid.elapsed, crimeCommitted: raid.crimeCommitted, crimeReason: raid.crimeReason, noise: raid.noise,
    defended: raid.defended, underAttack: raid.underAttack, coverS: raid.coverS, raiderWaveRequested: raid.raiderWaveRequested, collateralIds: raid.collateralIds,
    lostIds: raid.lostIds, commandReceipts: raid.commandReceipts, forkCrossed: raid.forkCrossed,
    forkCrossedAt: raid.forkCrossedAt, braceUntil: raid.braceUntil, awayS: raid.awayS, outcome: raid.outcome,
    settlement: raid.settlement, targetEverDetached: raid.targetEverDetached, targetHandled: raid.targetHandled, targetRecovered: raid.targetRecovered,
    notified: raid.notified,
  }));
}

/**
 * Recovery never creates train bodies. Missing/lost observations remain missing; mismatched identity
 * fails closed. Dwell/crossing samples restart so a stale save cannot manufacture a physical arrival.
 */
export function restoreRaid(saved, { train, simTime = finite(saved?.lastSimTime) } = {}) {
  const fresh = createRaid({ runId: textId(saved?.runId) || 'switchback', seed: saved?.seed, train,
    simTime, sectorId: textId(saved?.sectorId) || SWITCHBACK.sectorId });
  if (!saved || saved.schemaVersion !== 1 || textId(saved.targetId) !== fresh.targetId) {
    fresh.phase = 'settled'; fresh.outcome = 'invalid_restore';
    fresh.settlement = { id: `${fresh.runId}:settlement`, outcome: fresh.outcome, emitted: true, credits: 0, reputation: 0,
      consumeTarget: false, targetId: fresh.targetId, factionId: SWITCHBACK.factionId, at: finite(simTime) };
    return fresh;
  }
  const knownBodies = new Set(bodiesOf(train).map((body) => textId(body.id)));
  const ids = (values, max = 12) => [...new Set((Array.isArray(values) ? values : []).map(textId).filter(Boolean))].slice(0, max);
  fresh.phase = saved.phase === 'running' ? 'running' : saved.phase === 'settled' ? 'settled' : 'offered';
  fresh.mode = saved.mode === 'escort' || saved.mode === 'theft' ? saved.mode : null;
  fresh.startedAt = finite(saved.startedAt, finite(simTime));
  fresh.lastSimTime = finite(simTime, finite(saved.lastSimTime));
  fresh.elapsed = Math.max(0, finite(saved.elapsed));
  fresh.crimeCommitted = saved.crimeCommitted === true;
  fresh.crimeReason = ['theft', 'assault', 'destruction'].includes(saved.crimeReason) ? saved.crimeReason : null;
  fresh.noise = clamp(finite(saved.noise), 0, 100);
  fresh.defended = saved.defended === true;
  fresh.underAttack = saved.underAttack === true;
  fresh.coverS = clamp(finite(saved.coverS), 0, SWITCHBACK.durationS);
  fresh.raiderWaveRequested = saved.raiderWaveRequested === true;
  fresh.collateralIds = ids(saved.collateralIds);
  fresh.lostIds = ids(saved.lostIds, 6).filter((id) => knownBodies.has(id));
  for (const body of bodiesOf(train)) if (!liveBody(body) && !fresh.lostIds.includes(textId(body.id))) fresh.lostIds.push(textId(body.id));
  fresh.commandReceipts = ids(saved.commandReceipts, SWITCHBACK.maxCommandReceipts);
  fresh.forkCrossed = saved.forkCrossed === true;
  fresh.forkCrossedAt = fresh.forkCrossed ? finite(saved.forkCrossedAt) : null;
  fresh.braceUntil = finite(saved.braceUntil);
  fresh.awayS = clamp(finite(saved.awayS), 0, SWITCHBACK.abandonGraceS);
  fresh.targetEverDetached = saved.targetEverDetached === true;
  fresh.targetHandled = saved.targetHandled === true;
  fresh.targetRecovered = saved.targetRecovered === true;
  fresh.notified = ids(saved.notified, 24);
  if (saved.settlement || fresh.phase === 'settled') {
    fresh.phase = 'settled';
    fresh.outcome = TERMINAL.has(saved.outcome) ? saved.outcome : 'invalid_restore';
    // It is a receipt, never a replay queue. A restored receipt cannot emit economy intents.
    fresh.settlement = { id: `${fresh.runId}:settlement`, outcome: fresh.outcome, emitted: true,
      credits: clamp(finite(saved.settlement?.credits), 0, SWITCHBACK.theftReward),
      reputation: clamp(finite(saved.settlement?.reputation), -40, 10),
      consumeTarget: saved.settlement?.consumeTarget === true, targetId: fresh.targetId,
      factionId: SWITCHBACK.factionId, at: finite(saved.settlement?.at, fresh.lastSimTime) };
  }
  return fresh;
}
