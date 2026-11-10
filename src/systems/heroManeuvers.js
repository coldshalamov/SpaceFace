// M-02 Boomerang Bomb Run. The system owns only the temporary flight-control lease and
// choreography clock. V3/Rapier move the hull; bombs creates ordnance; phaseBlink adopts return.
import { BOOMERANG_BOMB_RUN as T, PINBALL_RUSH as P } from '../data/heroManeuvers.js';
import { BOMB_DEFS, BOMB_DRIFT } from '../data/bombs.js';
import { PHASE_BLINK, phaseBlinkCommitCost } from '../data/phaseBlink.js';
import {
  certifyPhaseBlinkLanding,
  commitReservedPhaseBlink,
  releasePhaseBlinkReservation,
  reservePhaseBlinkEnergy,
} from './phaseBlink.js';
import { targetIdentityGeneration } from '../ai/perception.js';
import { isHostileToPlayer } from './scanner.js';

const FLIGHT_PHASES = new Set(['active']);
const START_CUE = 'sfx_massline_release';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function wrapAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function playerFittings(state) {
  const p = state && state.player;
  const index = Number(p && p.activeShipIndex) || 0;
  const row = Array.isArray(p && p.ownedShips) ? p.ownedShips[index] : null;
  const entity = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  return { fittings: row?.fittings || entity?.data?.fittings || [], entity, row };
}

function loadedBombId(state) {
  const bay = state && state.bombs;
  const cells = bay?.rack?.cells;
  if (!Array.isArray(cells)) return null;
  const loaded = cells.find(cell => cell && typeof cell.id === 'string' && Number(cell.count) > 0);
  if (!loaded) return null;
  const selected = cells.find(cell => cell && cell.id === bay.selectedId && Number(cell.count) > 0);
  return selected ? selected.id : loaded.id;
}

function bombReleaseUnavailable(state, player, payloadId) {
  const bay = state?.bombs;
  const now = finite(state?.simTime);
  if (now < finite(bay?.cooldownUntil)) return 'bomb_bay_cycling';
  if (now < finite(bay?.cooldowns?.[payloadId])) return 'bomb_payload_cycling';
  let owned = 0, total = 0;
  const index = state?.entityIndex;
  const source = index?.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.bombs)
    ? index.bombs : (Array.isArray(state?.entityList) ? state.entityList : []);
  for (const entity of source) {
    if (!entity?.alive || entity.type !== 'bomb') continue;
    total += 1;
    if (entity.data?.ownerId === player.id) owned += 1;
  }
  if (owned >= BOMB_DRIFT.maxActive) return 'bomb_bay_full';
  if (total >= BOMB_DRIFT.maxWorldActive) return 'ordnance_field_full';
  const def = BOMB_DEFS[payloadId];
  if (!def) return 'bomb_unavailable';
  return null;
}

function liveTarget(state, player) {
  const id = state?.player?.targetId;
  if (id == null || !state.entities?.get) return null;
  const target = state.entities.get(id);
  if (!target || target.alive === false || !(finite(target.hull, 1) > 0)
    || !isHostileToPlayer(target, player.team, state)) return null;
  return target;
}

function lineOfApproachClear(state, player, target) {
  const px = finite(player.pos?.x), pz = finite(player.pos?.z);
  const dx = finite(target.pos?.x) - px, dz = finite(target.pos?.z) - pz;
  const length2 = dx * dx + dz * dz;
  if (!(length2 > 1)) return false;
  const bodies = Array.isArray(state.entityList)
    ? state.entityList
    : (state.entities && typeof state.entities.values === 'function' ? state.entities.values() : []);
  for (const body of bodies) {
    if (!body || body === player || body === target || body.alive === false || body.collides === false) continue;
    if (body.type !== 'asteroid' && body.type !== 'station' && body.type !== 'wreck' && body.type !== 'planet') continue;
    const ox = finite(body.pos?.x) - px, oz = finite(body.pos?.z) - pz;
    const t = (ox * dx + oz * dz) / length2;
    if (t <= 0.04 || t >= 0.96) continue;
    const qx = px + dx * t, qz = pz + dz * t;
    const radius = Math.max(0, finite(body.radius, body.type === 'station' ? 70 : 16))
      + Math.max(4, finite(player.radius, 14) * 0.42);
    if ((finite(body.pos?.x) - qx) ** 2 + (finite(body.pos?.z) - qz) ** 2 < radius * radius) return false;
  }
  return true;
}

function predictedReturnEnvelope(player, target, distance) {
  const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
  if (speed > T.maxStartSpeedWuS) return Infinity;
  const startAngle = Math.atan2(finite(player.pos?.z) - finite(target.pos?.z), finite(player.pos?.x) - finite(target.pos?.x));
  const rearDelta = signedAngleDelta(startAngle, finite(target.rot) + Math.PI);
  const direction = rearDelta < 0 ? -1 : 1;
  const arcRadians = Math.max(Math.PI, Math.abs(rearDelta)) + 0.3;
  const startRadius = clamp(distance, T.endOrbitRadiusWu, T.startOrbitRadiusWu);
  let max = 0;
  for (let i = 0; i <= 12; i++) {
    const p = i / 12;
    const ease = p * p * (3 - 2 * p);
    const radius = startRadius + (T.endOrbitRadiusWu - startRadius) * ease;
    const angle = startAngle + direction * arcRadians * p;
    const x = finite(target.pos?.x) + Math.cos(angle) * radius;
    const z = finite(target.pos?.z) + Math.sin(angle) * radius;
    max = Math.max(max, Math.hypot(x - finite(player.pos?.x), z - finite(player.pos?.z)));
  }
  // Reserve room for momentum while V3 follows the bounded geometric arc.
  // V3 owns the braking and tracking forces during the bank. Budget the first 0.75 s of
  // inherited drift plus the sampled authored route; charging the entire duration as free
  // ballistic travel rejects ordinary combat momentum even when the physical route is bounded.
  return max + speed * 0.75;
}

function attackRegionReached(player, target) {
  const dx = finite(player?.pos?.x) - finite(target?.pos?.x);
  const dz = finite(player?.pos?.z) - finite(target?.pos?.z);
  const distance = Math.hypot(dx, dz);
  if (distance < 52 || distance > 132) return false;
  const vx = finite(target?.vel?.x), vz = finite(target?.vel?.z);
  const speed = Math.hypot(vx, vz);
  // Pursuit craft turn to face the locked pilot throughout the maneuver. Their nose therefore
  // tracks the player and cannot define a stable bank/release rail. For a moving target use its
  // measured physical travel axis; a stationary target still uses its authored facing.
  const forwardX = speed >= 12 ? vx / speed : Math.cos(finite(target?.rot));
  const forwardZ = speed >= 12 ? vz / speed : Math.sin(finite(target?.rot));
  const rearDot = (dx / distance) * -forwardX + (dz / distance) * -forwardZ;
  return rearDot >= 0.65;
}

function signedAngleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function reasonFor(state) {
  const { fittings, entity: player } = playerFittings(state);
  if (!fittings.includes(T.moduleId)) return { status: 'hidden', reason: 'not_fitted', player };
  if (fittings.includes(P.moduleId) || fittings.includes('mod_veil_step')) {
    return { status: 'blocked', reason: 'fit_one_hero_maneuver', player };
  }
  if (!player || player.alive === false || !(finite(player.hull, 1) > 0)) return { status: 'blocked', reason: 'pilot_unavailable', player };
  if (state.mode !== 'flight' || state.run?.kind !== 'survival' || !FLIGHT_PHASES.has(state.run.phase)) {
    return { status: 'blocked', reason: 'available_during_wave', player };
  }
  if (state.ui?.screenStack?.length || state.input?.blocked) return { status: 'blocked', reason: 'close_the_open_panel', player };
  if (state.nav?.autopilot?.active || state.player?.tether?.active === true) return { status: 'blocked', reason: 'release_autopilot_or_massline', player };
  const target = liveTarget(state, player);
  if (!target) return { status: 'blocked', reason: 'lock_a_live_hostile', player };
  if (targetIdentityGeneration(player) === 0 || targetIdentityGeneration(target) === 0) {
    return { status: 'blocked', reason: 'life_token_unavailable', player, target };
  }
  const dx = finite(target.pos?.x) - finite(player.pos?.x);
  const dz = finite(target.pos?.z) - finite(player.pos?.z);
  const distance = Math.hypot(dx, dz);
  if (distance < T.minTargetRangeWu || distance > T.maxTargetRangeWu) return { status: 'blocked', reason: 'hostile_out_of_range', player, target };
  if (predictedReturnEnvelope(player, target, distance) > T.returnMaxDistanceWu) {
    return { status: 'blocked', reason: 'slow_before_banking', player, target };
  }
  if (finite(state.simTime) < finite(player._phaseBlink?.readyAt)) {
    return { status: 'blocked', reason: 'phase_recharging', player, target };
  }
  const approach = (Math.cos(finite(player.rot)) * dx + Math.sin(finite(player.rot)) * dz) / Math.max(1, distance);
  if (approach < T.minApproachDot || !lineOfApproachClear(state, player, target)) {
    return { status: 'blocked', reason: 'face_clear_approach', player, target };
  }
  const bombId = loadedBombId(state);
  if (!bombId) return { status: 'blocked', reason: 'load_one_drift_bomb', player, target };
  const bombBlock = bombReleaseUnavailable(state, player, bombId);
  if (bombBlock) return { status: 'blocked', reason: bombBlock, player, target, bombId };
  if (!(finite(player.boost?.dashImpulse) > 0)) return { status: 'blocked', reason: 'dash_drive_unavailable', player, target, bombId };
  if (finite(player.boost?.dashCdT) > 0) return { status: 'blocked', reason: 'dash_recharging', player, target, bombId };
  const cost = phaseBlinkCommitCost(T.returnMaxDistanceWu);
  const bankBoostCost = Math.max(0, finite(player.boost?.dashCost, 28))
    + Math.max(0, finite(player.boost?.drainRate, 38)) * T.bankBoostDurationS;
  const energyRequired = cost + bankBoostCost;
  if (finite(player.boost?.energy, -1) < energyRequired) return { status: 'blocked', reason: `needs_${Math.ceil(energyRequired)}_total_energy`, player, target, bombId, cost, bankBoostCost, energyRequired };
  if (!certifyPhaseBlinkLanding(state, player, player.pos, T.returnMaxDistanceWu)) {
    return { status: 'blocked', reason: 'no_clear_return_anchor', player, target, bombId, cost, energyRequired };
  }
  return { status: 'armed', reason: 'ready', player, target, bombId, cost, bankBoostCost, energyRequired, distance };
}

export function pinballRushReadiness(state) {
  const { fittings, entity: player } = playerFittings(state);
  if (!fittings.includes(P.moduleId)) return { status: 'hidden', reason: 'not_fitted', player };
  if (fittings.includes(T.moduleId) || fittings.includes('mod_veil_step')) {
    return { status: 'blocked', reason: 'fit_one_hero_maneuver', player };
  }
  if (!player || player.alive === false || !(finite(player.hull, 1) > 0)) return { status: 'blocked', reason: 'pilot_unavailable', player };
  if (state.mode !== 'flight' || state.run?.kind !== 'survival' || !FLIGHT_PHASES.has(state.run.phase)) {
    return { status: 'blocked', reason: 'available_during_wave', player };
  }
  if (state.ui?.screenStack?.length || state.input?.blocked) return { status: 'blocked', reason: 'close_the_open_panel', player };
  if (state.nav?.autopilot?.active || state.player?.tether?.active === true) return { status: 'blocked', reason: 'release_autopilot_or_massline', player };
  const target = liveTarget(state, player);
  if (!target) return { status: 'blocked', reason: 'lock_a_live_hostile', player };
  if (targetIdentityGeneration(player) === 0 || targetIdentityGeneration(target) === 0) {
    return { status: 'blocked', reason: 'life_token_unavailable', player, target };
  }
  const dx = finite(target.pos?.x) - finite(player.pos?.x);
  const dz = finite(target.pos?.z) - finite(player.pos?.z);
  const distance = Math.hypot(dx, dz);
  if (distance < P.minTargetRangeWu || distance > P.maxTargetRangeWu) return { status: 'blocked', reason: 'hostile_out_of_range', player, target, distance };
  const approach = (Math.cos(finite(player.rot)) * dx + Math.sin(finite(player.rot)) * dz) / Math.max(1, distance);
  if (approach < P.minApproachDot || !lineOfApproachClear(state, player, target)) {
    return { status: 'blocked', reason: 'face_clear_approach', player, target, distance };
  }
  const boost = player.boost || {};
  const energyCost = Math.max(0, finite(boost.dashCost, 28));
  if (!(finite(boost.dashImpulse) > 0)) return { status: 'blocked', reason: 'dash_drive_unavailable', player, target, distance };
  if (finite(boost.dashCdT) > 0) return { status: 'blocked', reason: 'dash_recharging', player, target, distance };
  if (finite(boost.energy) < energyCost) return { status: 'blocked', reason: 'needs_dash_energy', player, target, distance, energyCost };
  return { status: 'armed', reason: 'ready', player, target, distance, energyCost,
    targetName: target.name || target.data?.displayName || `Hostile ${target.id}` };
}

function veilStepReadiness(state) {
  const { fittings, entity } = playerFittings(state);
  if (!fittings.includes('mod_veil_step')) return null;
  const rt = entity?._phaseBlink || {};
  const energy = Math.max(0, finite(entity?.boost?.energy));
  const readyAt = Math.max(0, finite(rt.readyAt));
  const cooling = finite(state?.simTime) < readyAt;
  const aiming = rt.aiming === true;
  const distance = aiming ? Math.max(0, finite(rt.dist)) : 0;
  const cost = aiming ? phaseBlinkCommitCost(distance) : 0;
  const validLanding = aiming && rt.active === true && distance >= PHASE_BLINK.minCommit;
  const reason = aiming
    ? !validLanding ? 'no_clear_landing'
      : energy < cost ? `needs_${Math.ceil(cost - energy)}_energy` : 'release_to_step'
    : cooling ? 'phase_recharging'
      : energy < PHASE_BLINK.minEnergy ? `needs_${PHASE_BLINK.minEnergy}_energy` : 'ready';
  const status = aiming ? (validLanding && energy >= cost ? 'armed' : 'blocked')
    : (!cooling && energy >= PHASE_BLINK.minEnergy ? 'armed' : 'blocked');
  const text = aiming
    ? `${Math.round(distance)} WU · ${reason.replaceAll('_', ' ')}`
    : reason === 'ready' ? `ready · ${Math.floor(energy)} energy` : reason.replaceAll('_', ' ');
  return { mode: 'veil_step', phase: aiming ? 'aiming' : 'ready', status, reason,
    text, distance, validLanding, energy, cost, readyAt, updatedTick: Math.max(0, Math.trunc(finite(state?.tick))) };
}

export function heroManeuverReadiness(state) {
  const result = reasonFor(state);
  const target = result.target;
  const targetName = target && (target.name || target.data?.displayName || `Hostile ${target.id}`);
  const reason = result.reason === 'ready' ? `ready · ${targetName} · ${result.bombId} · ${Math.ceil(result.energyRequired)} cap`
    : result.reason === 'not_fitted' ? ''
      : result.reason.startsWith('needs_') ? `needs ${result.reason.slice(6).replace(/_(?:phase|total)_energy$/, '')} cap`
        : result.reason.replaceAll('_', ' ');
  return { ...result, targetName, text: reason };
}

function refreshReadModel(state, force = false) {
  const tick = Math.max(0, Math.trunc(finite(state?.tick)));
  if (!state || (!force && tick % 6 !== 0)) return;
  const active = state.flightRuntime?.heroManeuverStatus;
  const fittings = playerFittings(state).fittings;
  const veilReadiness = veilStepReadiness(state);
  const selectedMode = fittings.includes(P.moduleId) ? 'pinball'
    : fittings.includes(T.moduleId) ? 'boomerang' : veilReadiness ? 'veil_step' : null;
  const activeMode = active?.mode || 'boomerang';
  const activePhase = selectedMode === activeMode && active && (
    activeMode === 'boomerang'
      ? active.phase === 'bank' || active.phase === 'return'
        || (tick - finite(active.updatedTick ?? active.tick) < 180)
      : active.phase === 'pinball_charge' || active.phase === 'pinball_pending' || active.phase === 'pinball_dash'
        || (tick - finite(active.updatedTick) < 180));
  const readiness = activePhase ? null : selectedMode === 'pinball'
    ? pinballRushReadiness(state) : selectedMode === 'veil_step'
      ? veilReadiness : heroManeuverReadiness(state);
  const source = activePhase ? active : readiness;
  const model = state.heroManeuverReadModel || (state.heroManeuverReadModel = {});
  Object.assign(model, {
    phase: source?.phase || 'ready',
    mode: source?.mode || selectedMode || 'boomerang',
    status: source?.status || 'blocked',
    reason: source?.reason || null,
    text: source?.text || '',
    targetId: source?.targetId ?? source?.target?.id ?? null,
    targetName: source?.targetName || source?.target?.name || source?.target?.data?.displayName || null,
    bombId: source?.bombId || null,
    cost: Number.isFinite(source?.cost) ? source.cost : null,
    bankBoostCost: Number.isFinite(source?.bankBoostCost) ? source.bankBoostCost : null,
    energyRequired: Number.isFinite(source?.energyRequired) ? source.energyRequired : null,
    elapsed: Number.isFinite(source?.elapsed) ? source.elapsed : 0,
    charge: Number.isFinite(source?.charge) ? source.charge : 0,
    contactCount: Number.isFinite(source?.contactCount) ? source.contactCount : 0,
    distance: Number.isFinite(source?.distance) ? source.distance : 0,
    validLanding: source?.validLanding === true,
    energy: Number.isFinite(source?.energy) ? source.energy : null,
    veil: veilReadiness ? { phase: veilReadiness.phase, status: veilReadiness.status,
      reason: veilReadiness.reason, text: veilReadiness.text, distance: veilReadiness.distance,
      validLanding: veilReadiness.validLanding, energy: veilReadiness.energy,
      cost: veilReadiness.cost, readyAt: veilReadiness.readyAt, updatedTick: veilReadiness.updatedTick } : null,
    attackCommitted: source?.attackCommitted === true,
    updatedTick: tick,
  });
}

function actionsFor(state) {
  return state?.input?.actions;
}

function suppressBombCommand(state) {
  const actions = actionsFor(state);
  if (!actions) return;
  if (actions.bomb && typeof actions.bomb === 'object') actions.bomb.pressed = false;
  actions.dropBomb = false;
  actions.chargeThrow = false;
  actions.swarmBombThrow = false;
}

function manualOverride(state) {
  const input = state?.input;
  if (!input) return false;
  return Math.abs(finite(input.moveZ ?? input.throttle)) > 0.2
    || Math.abs(finite(input.moveX ?? input.strafe)) > 0.2
    || Math.abs(finite(input.turnIntent ?? input.turn)) > 0.2
    || input.brake === true || input.boost === true || input.drawFlight?.active === true;
}

function publishIntent(state, run, dt, target) {
  const player = run.player;
  const elapsed = run.elapsed;
  // The locked target can travel a full wave-sized distance during the bank. Keep the same
  // authored arc around its live position, and inherit its measured velocity in the V3 tracking
  // request so the hull follows the moving rail instead of orbiting an abandoned spawn point.
  const centerX = finite(target?.pos?.x, run.targetX);
  const centerZ = finite(target?.pos?.z, run.targetZ);
  const targetVX = finite(target?.vel?.x);
  const targetVZ = finite(target?.vel?.z);
  const progress = clamp(elapsed / T.bankDurationS, 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  const radius = run.startRadius + (T.endOrbitRadiusWu - run.startRadius) * eased;
  const angle = run.startAngle + run.direction * run.arcRadians * progress;
  const radialX = Math.cos(angle), radialZ = Math.sin(angle);
  const tangentX = -radialZ * run.direction, tangentZ = radialX * run.direction;
  const desiredX = centerX + radialX * radius;
  const desiredZ = centerZ + radialZ * radius;
  const angularRate = run.arcRadians / T.bankDurationS;
  const radialRate = (T.endOrbitRadiusWu - run.startRadius) * 6 * progress * (1 - progress) / T.bankDurationS;
  const desiredVX = targetVX + tangentX * radius * angularRate + radialX * radialRate;
  const desiredVZ = targetVZ + tangentZ * radius * angularRate + radialZ * radialRate;
  const worldX = clamp((desiredX - finite(player.pos?.x)) * T.positionGain
    + (desiredVX - finite(player.vel?.x)) * T.velocityGain, -1, 1);
  const worldZ = clamp((desiredZ - finite(player.pos?.z)) * T.positionGain
    + (desiredVZ - finite(player.vel?.z)) * T.velocityGain, -1, 1);
  const rot = finite(player.rot);
  const noseX = Math.cos(rot), noseZ = Math.sin(rot);
  const rightX = -noseZ, rightZ = noseX;
  const tangentHeading = Math.atan2(tangentZ, tangentX);
  const turn = clamp(wrapAngle(tangentHeading - rot) / 0.72, -1, 1);
  const runtime = state.flightRuntime || (state.flightRuntime = {});
  runtime.heroManeuverIntent = {
    version: 1,
    tick: state.tick,
    playerId: player.id,
    occupantGeneration: player.occupantGeneration,
    throttle: clamp(worldX * noseX + worldZ * noseZ, -T.maxFlightControl, T.maxFlightControl),
    strafe: clamp(worldX * rightX + worldZ * rightZ, -T.maxFlightControl, T.maxFlightControl),
    turn,
    phase: 'bank',
    boost: elapsed >= T.bankBoostStartS
      && elapsed <= T.bankBoostStartS + T.bankBoostDurationS,
  };
  const status = runtime.heroManeuverStatus || (runtime.heroManeuverStatus = {});
  Object.assign(status, {
    mode: 'boomerang', phase: 'bank', targetName: run.targetName, targetId: run.targetId,
    bombId: run.bombId, cost: run.reservationCost, bankBoostCost: run.bankBoostCost,
    energyRequired: run.energyRequired,
    attackCommitted: run.attackCommitted, elapsed: run.elapsed,
  });
  if (run.justStarted) {
    run.justStarted = false;
    refreshReadModel(state, true);
  }
}

export const heroManeuvers = {
  name: 'heroManeuvers',
  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry;
    this._run = null;
    this._pinball = null;
    this._pinballBoostHeld = false;
    this._pinballRefusedHold = false;
    this._offs = [];
    refreshReadModel(this.state, true);
    const on = (name, handler) => {
      if (this.bus?.on) this._offs.push(this.bus.on(name, handler));
    };
    const interrupt = reason => {
      this._finish('interrupted', reason);
      this._finishPinball('pinball_interrupted', reason);
    };
    for (const event of ['game:new', 'game:newGame', 'run:ended', 'player:death', 'player:respawn', 'save:loaded']) {
      on(event, () => interrupt(event));
    }
    on('ship:controlChanging', () => interrupt('ship_control_changed'));
    on('physics:impact', payload => this._recordPinballImpact(payload || {}));
  },
  destroy() {
    this._finish('interrupted', 'destroy');
    this._finishPinball('pinball_interrupted', 'destroy');
    for (const off of this._offs || []) if (typeof off === 'function') off();
    this._offs = [];
    this.state = this.bus = this.registry = null;
  },
  newGame() {
    this._finish('interrupted', 'new_game');
    this._finishPinball('pinball_interrupted', 'new_game');
    refreshReadModel(this.state, true);
  },
  update(dt, state) {
    const flightRuntime = state.flightRuntime || (state.flightRuntime = {});
    flightRuntime.heroManeuverIntent = null;
    flightRuntime.heroManeuverBoost = null;
    refreshReadModel(state);
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (!this._run && this._updatePinball(dt, state)) return;
    const actions = actionsFor(state);
    const pressed = actions?.bomb?.pressed === true;
    if (!this._run && pressed) {
      const readiness = reasonFor(state);
      if (readiness.status === 'hidden') return;
      suppressBombCommand(state);
      if (readiness.status !== 'armed') {
        this.bus?.emit('toast', { text: `Boomerang Run: ${readiness.reason.replaceAll('_', ' ')}`, kind: 'warn', ttl: 1.8 });
        this.bus?.emit('audio:cue', { id: 'ui_deny' });
        return;
      }
      const landing = certifyPhaseBlinkLanding(state, readiness.player, readiness.player.pos, T.returnMaxDistanceWu);
      const reservation = reservePhaseBlinkEnergy(readiness.player, T.returnMaxDistanceWu, finite(state.simTime));
      if (!landing || !reservation) {
        if (reservation) releasePhaseBlinkReservation(reservation);
        this.bus?.emit('toast', { text: 'Boomerang Run: return anchor or phase reserve unavailable', kind: 'warn', ttl: 1.8 });
        return;
      }
      this._run = {
        player: readiness.player,
        playerId: readiness.player.id,
        playerLife: targetIdentityGeneration(readiness.player),
        target: readiness.target,
        targetId: readiness.target.id,
        targetName: readiness.target.name || readiness.target.data?.displayName || `Hostile ${readiness.target.id}`,
        targetLife: targetIdentityGeneration(readiness.target),
        bombId: readiness.bombId,
        anchor: { x: finite(readiness.player.pos?.x), z: finite(readiness.player.pos?.z) },
        landing,
        reservation,
        reservationCost: readiness.cost,
        bankBoostCost: readiness.bankBoostCost,
        energyRequired: readiness.energyRequired,
        startRadius: clamp(readiness.distance, T.endOrbitRadiusWu, T.startOrbitRadiusWu),
        startAngle: Math.atan2(finite(readiness.player.pos?.z) - finite(readiness.target.pos?.z), finite(readiness.player.pos?.x) - finite(readiness.target.pos?.x)),
        targetX: finite(readiness.target.pos?.x),
        targetZ: finite(readiness.target.pos?.z),
        direction: 1,
        arcRadians: T.arcRadians,
        elapsed: 0,
        justStarted: true,
        attackCommitted: false,
      };
      const desiredRearAngle = finite(readiness.target.rot) + Math.PI;
      const rearDelta = signedAngleDelta(this._run.startAngle, desiredRearAngle);
      this._run.direction = rearDelta < 0 ? -1 : 1;
      this._run.arcRadians = Math.max(Math.PI, Math.abs(rearDelta)) + 0.3;
      suppressBombCommand(state);
      this.bus?.emit('audio:cue', { id: START_CUE, gain: 0.85 });
    this.bus?.emit('toast', { text: `Boomerang Run · ${this._run.targetName} locked · banking`, kind: 'info', ttl: 1.2, silent: true });
    }
    const run = this._run;
    if (!run) return;
    if (pressed || actions?.dropBomb) suppressBombCommand(state);
    const player = state.entities?.get?.(run.playerId);
    const target = state.entities?.get?.(run.targetId);
    if (state.mode !== 'flight' || state.run?.kind !== 'survival' || !FLIGHT_PHASES.has(state.run.phase)
      || state.ui?.screenStack?.length || state.input?.blocked) {
      this._finish('interrupted', 'controls_blocked');
      return;
    }
    if (state.playerId !== run.playerId || player !== run.player || player?.alive === false
      || targetIdentityGeneration(player) !== run.playerLife
      || !(finite(player.hull, 1) > 0)) {
      this._finish('interrupted', 'pilot_life_changed');
      return;
    }
    if (!playerFittings(state).fittings.includes(T.moduleId)
      || state.nav?.autopilot?.active === true || state.player?.tether?.active === true) {
      this._finish('interrupted', 'control_authority_changed');
      return;
    }
    if (manualOverride(state)) {
      this._finish('interrupted', 'pilot_override');
      return;
    }
    if (Math.hypot(finite(player.pos?.x) - run.anchor.x, finite(player.pos?.z) - run.anchor.z) > T.returnMaxDistanceWu) {
      this._finish('return_blocked', 'outside_reserved_return_envelope');
      return;
    }
    const targetLive = target === run.target && target?.alive !== false && finite(target?.hull, 1) > 0
      && targetIdentityGeneration(target) === run.targetLife
      && isHostileToPlayer(target, player.team, state);
    if (!targetLive) {
      if (!run.attackCommitted) {
        run.abortOutcome = 'target_lost';
        run.abortReason = 'locked_target_lost_before_release';
        run.elapsed = T.bankDurationS;
      } else {
        run.elapsed = T.bankDurationS;
      }
    }
    run.elapsed += dt;
    if (!run.attackCommitted && !run.abortOutcome
      && run.elapsed / T.bankDurationS >= T.attackRegionStartProgress
      && attackRegionReached(player, target)) {
      const bombs = this.registry?.get?.('bombs');
      const dropped = bombs && typeof bombs.drop === 'function'
        ? bombs.drop(run.player, run.bombId, state)
        : null;
      if (!dropped) {
        this._finish('ordnance_refused', 'bomb_release_refused');
        return;
      }
      run.attackCommitted = true;
      run.bombEntityId = dropped.id;
      this.bus?.emit('toast', { text: 'Boomerang Run · bomb away · return next', kind: 'info', ttl: 1.2, silent: true });
    }
    if (run.elapsed < T.bankDurationS) {
      publishIntent(state, run, dt, target);
      return;
    }
    if (!run.attackCommitted && !run.abortOutcome) {
      run.abortOutcome = 'attack_region_missed';
      run.abortReason = 'rear_attack_region_not_reached';
    }
    const runStatus = flightRuntime.heroManeuverStatus || (flightRuntime.heroManeuverStatus = {});
    Object.assign(runStatus, {
      mode: 'boomerang', phase: 'return', targetName: run.targetName, targetId: run.targetId,
      bombId: run.bombId, cost: run.reservationCost, bankBoostCost: run.bankBoostCost,
      energyRequired: run.energyRequired,
      attackCommitted: run.attackCommitted, elapsed: run.elapsed,
    });
    const returnPoint = certifyPhaseBlinkLanding(state, player, run.anchor, T.returnMaxDistanceWu);
    if (!returnPoint) {
      this._finish('return_blocked', 'return_anchor_blocked');
      return;
    }
    const result = commitReservedPhaseBlink(run.reservation, {
      entity: player, state, landing: returnPoint, bus: this.bus,
      now: finite(state.simTime), source: T.id,
    });
    run.reservation = null;
    if (!result.ok) {
      this._finish('return_blocked', result.reason);
      return;
    }
    this._finish(run.abortOutcome || 'complete', run.abortReason || 'phase_returned', {
      distance: result.distance, bombId: run.attackCommitted ? run.bombId : null,
    });
  },
  _finish(outcome, reason, details = null) {
    const run = this._run;
    if (!run) return false;
    if (run.reservation) releasePhaseBlinkReservation(run.reservation);
    this._run = null;
    const runtime = this.state && this.state.flightRuntime;
    if (runtime) {
      runtime.heroManeuverIntent = null;
      const status = runtime.heroManeuverStatus || (runtime.heroManeuverStatus = {});
      Object.assign(status, {
        mode: 'boomerang', phase: outcome, targetName: run.targetName, targetId: run.targetId,
        status: outcome === 'complete' ? 'complete' : 'blocked',
        text: outcome === 'complete'
          ? 'complete · bomb committed · phase returned'
          : `${outcome.replaceAll('_', ' ')} · ${run.attackCommitted ? 'bomb committed' : 'no bomb released'}`,
        bombId: run.bombId, attackCommitted: run.attackCommitted, reason, cost: run.reservationCost,
        bankBoostCost: run.bankBoostCost, energyRequired: run.energyRequired,
        tick: this.state?.tick ?? null, updatedTick: this.state?.tick ?? 0,
      });
    }
    refreshReadModel(this.state, true);
    if (outcome === 'complete') {
      this.bus?.emit('toast', { text: 'Boomerang Run complete · one bomb committed · control returned', kind: 'info', ttl: 1.8 });
    } else {
      const suffix = run.attackCommitted ? 'bomb remains live' : 'no bomb released';
      this.bus?.emit('toast', { text: `Boomerang Run ${outcome.replaceAll('_', ' ')} · ${suffix} · control returned`, kind: 'warn', ttl: 1.8 });
    }
    this._lastResult = { outcome, reason, details, tick: this.state?.tick ?? null };
    return true;
  },
  _updatePinball(dt, state) {
    const runtime = state.flightRuntime || (state.flightRuntime = {});
    const actions = actionsFor(state);
    const boostAction = actions?.boost;
    const held = state.input?.boost === true || boostAction?.held === true;
    const pressed = boostAction?.pressed === true || (held && !this._pinballBoostHeld);
    const released = !held && this._pinballBoostHeld;
    this._pinballBoostHeld = held;
    const { fittings } = playerFittings(state);
    const fitted = fittings.includes(P.moduleId);

    const suppressBoost = () => {
      const player = state.entities?.get?.(state.playerId);
      if (!player) return;
      runtime.heroManeuverBoost = { version: 1, tick: state.tick, playerId: player.id,
        occupantGeneration: player.occupantGeneration, suppressBoost: true };
    };
    const setStatus = (phase, run, extra = {}) => {
      const status = runtime.heroManeuverStatus || (runtime.heroManeuverStatus = {});
      Object.assign(status, { mode: 'pinball', phase, targetId: run?.targetId ?? null,
        targetName: run?.targetName ?? null, contactCount: run?.contacts?.length || 0,
        charge: run?.chargeElapsed || 0, updatedTick: state.tick, ...extra });
      refreshReadModel(state, true);
    };

    if (this._pinball) {
      const run = this._pinball;
      if (!fitted || fittings.includes(T.moduleId)) {
        this._finishPinball('pinball_interrupted', 'hero_maneuver_fit_changed');
        return true;
      }
      const player = state.entities?.get?.(run.playerId);
      const target = state.entities?.get?.(run.targetId);
      if (state.mode !== 'flight' || state.run?.kind !== 'survival' || !FLIGHT_PHASES.has(state.run.phase)
        || state.ui?.screenStack?.length || state.input?.blocked) {
        this._finishPinball('pinball_interrupted', 'controls_blocked');
        return true;
      }
      if (player !== run.player || player?.alive === false || !(finite(player?.hull, 1) > 0)
        || targetIdentityGeneration(player) !== run.playerLife) {
        this._finishPinball('pinball_interrupted', 'pilot_life_changed');
        return true;
      }
      if (target !== run.target || target?.alive === false || !(finite(target?.hull, 1) > 0)
        || targetIdentityGeneration(target) !== run.targetLife || !isHostileToPlayer(target, player.team, state)) {
        this._finishPinball('pinball_target_lost', 'locked_target_lost');
        return true;
      }
      suppressBoost();
      if (run.phase === 'charge') {
        if (!held || released) {
          const readiness = pinballRushReadiness(state);
          if (run.chargeElapsed < P.minChargeS) {
            this._finishPinball('pinball_cancelled', 'charge_too_short');
            return true;
          }
          if (readiness.status !== 'armed' || readiness.target !== run.target) {
            this._finishPinball('pinball_refused', readiness.reason || 'target_lane_changed');
            return true;
          }
          run.phase = 'pending';
          run.releaseTick = state.tick;
          run.requestId = `pinball:${run.playerId}:${run.playerLife}:${state.tick}`;
          run.dashScale = 1 + 0.5 * clamp(run.chargeElapsed / P.maxChargeS, 0, 1);
          runtime.heroManeuverBoost = { version: 1, tick: state.tick, playerId: player.id,
            occupantGeneration: player.occupantGeneration, suppressBoost: true,
            dashRequestId: run.requestId, dashScale: run.dashScale };
          setStatus('pinball_pending', run, { charge: run.chargeElapsed });
          return true;
        }
        run.chargeElapsed = Math.min(P.maxChargeS, run.chargeElapsed + dt);
        setStatus('pinball_charge', run);
        return true;
      }
      if (run.phase === 'pending') {
        const receipt = runtime.heroManeuverDashReceipt;
        if (receipt?.requestId === run.requestId && receipt.tick === run.releaseTick) {
          if (!receipt.accepted) {
            this._finishPinball('pinball_refused', receipt.reason || 'dash_unavailable');
            return true;
          }
          run.phase = 'dash';
          run.dashStartedAt = finite(state.simTime);
          run.dashStartTick = state.tick;
          setStatus('pinball_dash', run, { charge: run.chargeElapsed, contactCount: run.contacts.length });
          return true;
        }
        if (state.tick > run.releaseTick + 1) {
          this._finishPinball('pinball_refused', 'dash_owner_did_not_accept');
          return true;
        }
        return true;
      }
      if (run.phase === 'dash') {
        if (run.contacts.length >= P.maxContactBodies) {
          this._finishPinball('pinball_success', 'five_physical_contacts');
          return true;
        }
        if (finite(state.simTime) - run.dashStartedAt >= P.maxDashDurationS) {
          this._finishPinball(run.contacts.length ? 'pinball_complete' : 'pinball_missed',
            run.contacts.length ? 'dash_window_elapsed' : 'no_physical_contact');
          return true;
        }
        setStatus('pinball_dash', run, { charge: run.chargeElapsed, contactCount: run.contacts.length });
        return true;
      }
      this._finishPinball('pinball_interrupted', 'invalid_maneuver_phase');
      return true;
    }

    if (this._pinballRefusedHold) {
      if (held) suppressBoost();
      else this._pinballRefusedHold = false;
      return true;
    }
    if (!fitted) return false;
    if (!held && !pressed) return false;
    if (!pressed) return false;
    const readiness = pinballRushReadiness(state);
    if (readiness.status !== 'armed') {
      this._pinballRefusedHold = held;
      suppressBoost();
      this.bus?.emit('toast', { text: `Pinball Rush: ${readiness.reason.replaceAll('_', ' ')}`, kind: 'warn', ttl: 1.8 });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      setStatus('pinball_refused', null, { reason: readiness.reason, updatedTick: state.tick });
      return true;
    }
    this._pinball = { phase: 'charge', player: readiness.player, playerId: readiness.player.id,
      playerLife: targetIdentityGeneration(readiness.player), target: readiness.target, targetId: readiness.target.id,
      targetLife: targetIdentityGeneration(readiness.target), targetName: readiness.targetName,
      chargeElapsed: 0, contacts: [], startedAt: finite(state.simTime) };
    suppressBoost();
    setStatus('pinball_charge', this._pinball);
    this.bus?.emit('audio:cue', { id: 'sfx_accel_transition', gain: 0.55 });
    this.bus?.emit('toast', { text: `Pinball Rush · ${readiness.targetName} lined · hold, aim, release`, kind: 'info', ttl: 1.3, silent: true });
    return true;
  },
  _recordPinballImpact(payload) {
    const run = this._pinball;
    if (!run || run.phase !== 'dash') return;
    if (payload.causalActorId !== run.playerId) return;
    const playerId = payload.aId === run.playerId ? payload.aId : payload.bId === run.playerId ? payload.bId : null;
    if (playerId == null || (Number.isFinite(payload.tick) && payload.tick < run.dashStartTick)) return;
    const otherId = payload.aId === playerId ? payload.bId : payload.aId;
    if (otherId == null || otherId === playerId) return;
    const body = this.state?.entities?.get?.(otherId);
    if (!body || body.alive === false || body.collides === false) return;
    const generation = targetIdentityGeneration(body);
    const key = `${String(otherId)}:${generation}`;
    if (run.contacts.some(contact => contact.key === key) || run.contacts.length >= P.maxContactBodies) return;
    run.contacts.push({ key, id: otherId, generation });
  },
  _finishPinball(outcome, reason) {
    const run = this._pinball;
    const runtime = this.state?.flightRuntime;
    if (!run) {
      if (runtime) runtime.heroManeuverBoost = null;
      this._pinballRefusedHold = false;
      this._pinballBoostHeld = false;
      return false;
    }
    this._pinball = null;
    if (runtime) runtime.heroManeuverBoost = null;
    this._pinballRefusedHold = false;
    const status = runtime?.heroManeuverStatus || (runtime && (runtime.heroManeuverStatus = {}));
    if (status) Object.assign(status, { mode: 'pinball', phase: outcome, targetId: run.targetId,
      targetName: run.targetName, contactCount: run.contacts.length, reason,
      updatedTick: this.state?.tick ?? null });
    refreshReadModel(this.state, true);
    this._lastResult = { outcome, reason, contactCount: run.contacts.length, tick: this.state?.tick ?? null };
    const text = run.contacts.length
      ? `Pinball Rush ${outcome.replaceAll('_', ' ')} · ${run.contacts.length} physical contact${run.contacts.length === 1 ? '' : 's'} · control returned`
      : `Pinball Rush ${outcome.replaceAll('_', ' ')} · no committed contact · control returned`;
    this.bus?.emit('toast', { text, kind: outcome === 'pinball_success' || outcome === 'pinball_complete' ? 'info' : 'warn', ttl: 1.8 });
    return true;
  },
};
