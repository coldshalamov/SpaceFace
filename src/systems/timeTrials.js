// Plan 50 physical flight-skill courses.
//
// Flight V3 and physics remain the only motion owners. This system authors fixed physical buoy
// bodies, observes the player's real post-Rapier segment, records a bounded input tape, and submits
// reward intents to economy. Durable best/replay records live in the existing serialized player bag.

import { Masks } from '../core/entity.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import {
  TIME_TRIAL_SCHEMA_VERSION,
  TIME_TRIAL_TICK_RATE,
  VESTA_STATION_ARENA,
  cumulativeTimeTrialCredits,
  medalForTimeTrialTicks,
  timeTrialArenaTierById,
  timeTrialCourseById,
  timeTrialCourseForSector,
  timeTrialLocalBoard,
  timeTrialMedalRank,
  timeTrialTrailTintById,
} from '../data/timeTrialCourses.js';
import { makeEnemySpawnSpec } from './combat.js';

const REPLAY_SCHEMA = 'spaceface.time-trial-replay.v1';
const GHOST_SCHEMA = 'spaceface.time-trial-ghost.v1';
const PHYSICAL_RING_MASK = Masks.SHIP | Masks.DRONE | Masks.ASTEROID | Masks.STATION;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(value) {
  let angle = finite(value);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function copyPlain(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function quantize(value, scale) {
  return Math.round(finite(value) * scale);
}

function quantizedPose(player, scale) {
  return {
    pos: [quantize(player.pos?.x, scale), quantize(player.pos?.z, scale)],
    vel: [quantize(player.vel?.x, scale), quantize(player.vel?.z, scale)],
    rot: quantize(player.rot, scale),
    angVel: quantize(player.angVel, scale),
    bank: quantize(player.bank, scale),
    pitch: quantize(player.pitch, scale),
  };
}

function applyQuantizedPose(entity, pose, scale) {
  if (!entity || !pose || !Array.isArray(pose.pos)) return false;
  const divisor = Number.isFinite(scale) && scale > 0 ? scale : 1000;
  entity.prevPos?.copy?.(entity.pos);
  entity.prevRot = finite(entity.rot);
  entity.pos.set(pose.pos[0] / divisor, 0, pose.pos[1] / divisor);
  if (Array.isArray(pose.vel)) entity.vel.set(pose.vel[0] / divisor, 0, pose.vel[1] / divisor);
  entity.rot = finite(pose.rot) / divisor;
  entity.angVel = finite(pose.angVel) / divisor;
  entity.bank = finite(pose.bank) / divisor;
  entity.pitch = finite(pose.pitch) / divisor;
  return true;
}

function quantizedInput(input, scale) {
  const actions = input?.actions;
  const massline = actions?.massline;
  const aim = input?.aimWorld;
  return [
    quantize(clamp(finite(input?.moveX), -1, 1), scale),
    quantize(clamp(finite(input?.moveZ), -1, 1), scale),
    quantize(clamp(finite(input?.turnIntent), -1, 1), scale),
    input?.boost ? 1 : 0,
    input?.brake ? 1 : 0,
    actions?.tetherFire ? 1 : 0,
    massline?.cut || actions?.tetherCut ? 1 : 0,
    quantize(clamp(finite(massline?.lineLength, actions?.reelDelta), -1, 1), scale),
    quantize(clamp(finite(massline?.orbitDirection), -1, 1), scale),
    massline?.pump ? 1 : 0,
    Number.isFinite(aim?.x) ? quantize(aim.x, scale) : null,
    Number.isFinite(aim?.z) ? quantize(aim.z, scale) : null,
    input?.aimIntentActive ? 1 : 0,
  ];
}

export function decodeTimeTrialInputFrame(frame, quantization = 1000) {
  const scale = Number.isFinite(quantization) && quantization > 0 ? quantization : 1000;
  const brake = frame?.[4] === 1;
  const decoded = {
    moveX: finite(frame?.[0]) / scale,
    moveZ: finite(frame?.[1]) / scale,
    turnIntent: finite(frame?.[2]) / scale,
    boost: frame?.[3] === 1,
    brake,
    actions: { brake },
  };
  if (frame?.length > 5) {
    const lineLength = finite(frame?.[7]) / scale;
    const orbitDirection = finite(frame?.[8]) / scale;
    decoded.actions.tetherFire = frame?.[5] === 1;
    decoded.actions.tetherCut = frame?.[6] === 1;
    decoded.actions.reelDelta = lineLength;
    decoded.actions.massline = {
      latch: frame?.[5] === 1,
      cut: frame?.[6] === 1,
      lineControl: lineLength !== 0 || orbitDirection !== 0,
      lineLength,
      reelIn: Math.max(0, -lineLength),
      payOut: Math.max(0, lineLength),
      orbitDirection,
      pump: frame?.[9] === 1,
      source: 'time-trial-ghost',
    };
    if (Number.isFinite(frame?.[10]) && Number.isFinite(frame?.[11])) {
      decoded.aimWorld = { x: frame[10] / scale, z: frame[11] / scale };
    }
    decoded.aimIntentActive = frame?.[12] === 1;
  }
  return decoded;
}

export function resolveTimeTrialPoint(course, point, state = null) {
  if (!course || !point) return null;
  if (Number.isFinite(point.planetRadiusWU) && Number.isFinite(point.planetAngleRad)) {
    const planet = state?.planet;
    if (!planet?.active || planet.siteId !== course.planetSiteId
      || !Number.isFinite(planet.center?.x) || !Number.isFinite(planet.center?.z)) return null;
    return {
      x: planet.center.x + Math.cos(point.planetAngleRad) * point.planetRadiusWU,
      z: planet.center.z + Math.sin(point.planetAngleRad) * point.planetRadiusWU,
    };
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return sectorLocalToGlobalForSector(point, course.sectorId);
}

export function referenceTimeTrialInput(course, player, expectedGateIndex, state = null, runtime = null) {
  const gate = course?.gates?.[expectedGateIndex];
  if (!gate || !player?.pos) return { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: true };
  if (course.kind === 'slingshot' && runtime?.run && !runtime.run.slingshotRelease) {
    const anchor = state?.entities?.get?.(runtime.anchorId);
    if (anchor?.alive !== false && anchor?.pos) return referenceSlingshotInput(course, player, state, anchor);
  }
  const center = resolveTimeTrialPoint(course, gate.center, state);
  const frame = gateFrame(course, expectedGateIndex, state);
  if (!center || !frame) return { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: true };
  const lateral = (player.pos.x - center.x) * frame.tx + (player.pos.z - center.z) * frame.tz;
  const lateralSpeed = finite(player.vel?.x) * frame.tx + finite(player.vel?.z) * frame.tz;
  const correction = clamp(lateral * 0.72 + lateralSpeed * 1.6, -110, 110);
  // Aim through the aperture, not at a point that disappears under the nose. The lateral term
  // recovers honestly from belt-rock deflections while the look-through keeps momentum aligned.
  const target = {
    x: center.x + frame.nx * 105 - frame.tx * correction,
    z: center.z + frame.nz * 105 - frame.tz * correction,
  };
  if (course.kind === 'skim' && state?.planet?.active) {
    const px = player.pos.x - state.planet.center.x;
    const pz = player.pos.z - state.planet.center.z;
    const radius = Math.hypot(px, pz) || 1;
    const radialSpeed = (finite(player.vel?.x) * px + finite(player.vel?.z) * pz) / radius;
    const desiredRadius = finite(gate.center?.planetRadiusWU, 965);
    const radialCorrection = clamp((radius - desiredRadius) * 2.2 + radialSpeed * 1.4, -150, 150);
    target.x -= (px / radius) * radialCorrection;
    target.z -= (pz / radius) * radialCorrection;
  }
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const distance = Math.hypot(dx, dz);
  const desired = Math.atan2(dz, dx);
  const error = wrapAngle(desired - finite(player.rot));
  const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
  const slalom = course.kind === 'slalom';
  const skim = course.kind === 'skim';
  const sharpTurn = Math.abs(error) > (slalom ? 0.34 : 1.15);
  const brake = sharpTurn && speed > (slalom ? 25 : 55);
  return {
    moveX: 0,
    moveZ: brake ? (slalom ? -0.6 : -0.25)
      : (Math.abs(error) < (slalom ? 0.34 : 0.85) ? (slalom ? 0.4 : skim ? 0.62 : 0.82) : (slalom ? 0.08 : skim ? 0.18 : 0.28)),
    turnIntent: clamp(error / 0.56, -1, 1),
    boost: false,
    brake,
    distance,
  };
}

function referenceSlingshotInput(course, player, state, anchor) {
  const tether = state?.player?.tether;
  const dx = player.pos.x - anchor.pos.x;
  const dz = player.pos.z - anchor.pos.z;
  const radius = Math.hypot(dx, dz);
  const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
  const releaseReady = speed >= finite(player.maxSpeed, 120) * 1.405
    && dx < -Math.max(85, radius * 0.62)
    && finite(player.vel?.z) < -80;
  if (!tether?.active) {
    return {
      moveX: 0, moveZ: 0.12, turnIntent: 0, boost: false, brake: false,
      aimWorld: { x: anchor.pos.x, z: anchor.pos.z },
      aimIntentActive: true,
      actions: {
        tetherFire: true,
        massline: idleMasslineCommand({ latch: true }),
      },
    };
  }
  const lineLength = radius > 170 ? -0.48 : radius > 125 ? -0.18 : 0;
  return {
    moveX: 0,
    moveZ: 1,
    turnIntent: 1,
    boost: false,
    brake: false,
    aimWorld: { x: anchor.pos.x, z: anchor.pos.z },
    aimIntentActive: true,
    actions: {
      tetherFire: false,
      reelDelta: lineLength,
      massline: idleMasslineCommand({
        cut: releaseReady,
        lineControl: !releaseReady,
        lineLength: releaseReady ? 0 : lineLength,
        orbitDirection: releaseReady ? 0 : 1,
        pump: !releaseReady,
      }),
    },
  };
}

function idleMasslineCommand(overrides = {}) {
  const lineLength = finite(overrides.lineLength);
  return {
    latch: false,
    cut: false,
    lineControl: false,
    lineLength,
    reelIn: Math.max(0, -lineLength),
    payOut: Math.max(0, lineLength),
    orbitDirection: 0,
    pump: false,
    source: 'time-trial-reference',
    ...overrides,
  };
}

function ensureLedger(state) {
  const player = state.player || (state.player = {});
  const source = player.timeTrials;
  const ledger = source && typeof source === 'object' && !Array.isArray(source)
    ? source
    : (player.timeTrials = {});
  ledger.schemaVersion = TIME_TRIAL_SCHEMA_VERSION;
  if (!ledger.courses || typeof ledger.courses !== 'object' || Array.isArray(ledger.courses)) {
    ledger.courses = {};
  }
  if (!ledger.unlockedTrailTints || typeof ledger.unlockedTrailTints !== 'object'
    || Array.isArray(ledger.unlockedTrailTints)) ledger.unlockedTrailTints = {};
  if (ledger.selectedTrailTint != null
    && (ledger.unlockedTrailTints[ledger.selectedTrailTint] !== true
      || !timeTrialTrailTintById(ledger.selectedTrailTint))) ledger.selectedTrailTint = null;
  if (!ledger.ghostEnabled || typeof ledger.ghostEnabled !== 'object'
    || Array.isArray(ledger.ghostEnabled)) ledger.ghostEnabled = {};
  if (!ledger.arena || typeof ledger.arena !== 'object' || Array.isArray(ledger.arena)) ledger.arena = {};
  if (!ledger.arena.scores || typeof ledger.arena.scores !== 'object'
    || Array.isArray(ledger.arena.scores)) ledger.arena.scores = {};
  if (!ledger.arena.cleared || typeof ledger.arena.cleared !== 'object'
    || Array.isArray(ledger.arena.cleared)) ledger.arena.cleared = {};
  if (!ledger.arena.rewarded || typeof ledger.arena.rewarded !== 'object'
    || Array.isArray(ledger.arena.rewarded)) ledger.arena.rewarded = {};
  return ledger;
}

function normalizeCourseRecord(ledger, course) {
  const source = ledger.courses[course.id];
  const record = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  record.bestTicks = Number.isFinite(record.bestTicks) ? Math.max(0, Math.trunc(record.bestTicks)) : null;
  record.bestMedal = ['gold', 'silver', 'bronze'].includes(record.bestMedal) ? record.bestMedal : null;
  record.rewardedRank = clamp(Math.trunc(finite(record.rewardedRank)), 0, 3);
  if (!record.bestReplay || record.bestReplay.schema !== REPLAY_SCHEMA
    || record.bestReplay.courseId !== course.id || !Array.isArray(record.bestReplay.frames)) {
    record.bestReplay = null;
  } else if (record.bestReplay.frames.length > course.replay.maxFrames) {
    record.bestReplay.frames = record.bestReplay.frames.slice(0, course.replay.maxFrames);
  }
  if (record.bestReplay && Array.isArray(record.bestReplay.poses)
    && record.bestReplay.poses.length > course.replay.maxFrames) {
    record.bestReplay.poses = record.bestReplay.poses.slice(0, course.replay.maxFrames);
  }
  ledger.courses[course.id] = record;
  return record;
}

function gateFrame(course, gateIndex, state = null) {
  const current = resolveTimeTrialPoint(course, course.gates[gateIndex].center, state);
  const previous = resolveTimeTrialPoint(
    course,
    gateIndex === 0 ? course.staging : course.gates[gateIndex - 1].center,
    state,
  );
  if (!current || !previous) return null;
  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return { nx: dx / length, nz: dz / length, tx: -dz / length, tz: dx / length };
}

function gateCrossing(course, gateIndex, from, to, playerRadiusWU = 0, state = null) {
  const gate = course.gates[gateIndex];
  if (!gate || !from || !to) return null;
  const center = resolveTimeTrialPoint(course, gate.center, state);
  const frame = gateFrame(course, gateIndex, state);
  if (!center || !frame) return null;
  const fromPlane = (from.x - center.x) * frame.nx + (from.z - center.z) * frame.nz;
  const toPlane = (to.x - center.x) * frame.nx + (to.z - center.z) * frame.nz;
  if (!(fromPlane < 0 && toPlane >= 0)) return null;
  const denom = fromPlane - toPlane;
  if (Math.abs(denom) < 1e-9) return null;
  const t = clamp(fromPlane / denom, 0, 1);
  const ix = from.x + (to.x - from.x) * t;
  const iz = from.z + (to.z - from.z) * t;
  const lateral = Math.abs((ix - center.x) * frame.tx + (iz - center.z) * frame.tz);
  const playerRadius = Math.max(0, finite(playerRadiusWU));
  const aperture = Math.max(1, course.ring.radiusWU - course.ring.buoyRadiusWU - playerRadius);
  if (lateral > aperture) return null;
  return { x: ix, z: iz, lateral, aperture };
}

function coursePostingText(course) {
  const seconds = (ticks) => Math.round(ticks / TIME_TRIAL_TICK_RATE);
  const rule = typeof course.postingRule === 'string' ? ` ${course.postingRule}` : '';
  const entryFeeCr = Math.max(0, Math.trunc(finite(course.entryFeeCr)));
  return `${course.postingLabel}: ${entryFeeCr} cr entry. ${seconds(course.medals.goldTicks)}s gold / ${seconds(course.medals.silverTicks)}s silver / ${seconds(course.medals.bronzeTicks)}s bronze.${rule} Cross Ring 1 outbound to start.`;
}

export const timeTrials = {
  name: 'timeTrials',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._course = null;
    this._buoyIds = new Set();
    this._courseBodyIds = new Set();
    this._obstacleIds = new Set();
    this._anchorId = null;
    this._ghostEntityId = null;
    this._lastSlingshotCutCheck = null;
    this._run = null;
    this._dockedStationId = null;
    this._arenaPending = null;
    this._arenaRun = null;
    this._lastBuoyContactTick = -1;
    ensureLedger(this.state);
    this._unsubs = [
      this.bus.on('sector:enter', ({ sectorId } = {}) => this._enterSector(sectorId)),
      this.bus.on('sector:exit', () => this._leaveSector('sector_exit')),
      this.bus.on('physics:impact', (payload) => this._onImpact(payload || {})),
      this.bus.on('tether:cut', (payload) => this._onTetherCut(payload || {})),
      this.bus.on('planet:plungeStage', (payload) => this._onPlanetPlungeStage(payload || {})),
      this.bus.on('dock:docked', (payload) => this._onDocked(payload || {})),
      this.bus.on('dock:undocked', () => this._onUndocked()),
      this.bus.on('entity:killed', (payload) => this._onArenaEntityKilled(payload || {})),
      this.bus.on('entity:destroyed', (payload) => this._onArenaEntityDestroyed(payload || {})),
      this.bus.on('player:death', () => this._abortArena('player_defeated')),
      this.bus.on('timeTrial:selectGhost', (payload) => this._selectGhost(payload || {})),
      this.bus.on('timeTrial:selectTrailTint', (payload) => this._selectTrailTint(payload || {})),
      this.bus.on('timeTrial:arenaRequest', (payload) => this._requestArena(payload || {})),
      this.bus.on('save:restoring', () => this._leaveSector('save_restoring')),
      this.bus.on('save:loaded', () => {
        ensureLedger(this.state);
        this._enterSector(this.state.world?.currentSectorId);
      }),
      this.bus.on('game:new', () => this._resetForNewGame()),
      this.bus.on('game:newGame', () => this._resetForNewGame()),
    ];
    if (this.state.world?.currentSectorId) this._enterSector(this.state.world.currentSectorId);
  },

  newGame() {
    this._resetForNewGame();
  },

  update(_dt, state) {
    const course = timeTrialCourseForSector(state.world?.currentSectorId);
    if (!course) {
      if (this._course) this._leaveSector('route_unavailable');
      return;
    }
    if (!this._course || this._course.id !== course.id || this._buoyIds.size === 0) {
      this._enterSector(course.sectorId);
    }
    if (state.mode !== 'flight') return;
    const player = state.entities?.get?.(state.playerId);
    if (!player || player.alive === false || !player.prevPos || !player.pos) {
      if (this._run) this._invalidate('player_unavailable');
      return;
    }

    if (this._arenaPending && !this._arenaRun) this._startArena(player);
    if (this._arenaRun) {
      this._updateArena(player);
      return;
    }

    if (!this._run) {
      const crossing = gateCrossing(course, 0, player.prevPos, player.pos, player.radius, state);
      if (crossing) this._tryStartRun(course, player, crossing);
      return;
    }
    if (this._run.invalidated) return;

    if (!this._validateCourseEnvironment(course, player)) return;

    if (this._run.frames.length >= course.replay.maxFrames) {
      this._invalidate('time_expired', { expectedGateIndex: this._run.expectedGateIndex });
      return;
    }
    this._run.frames.push(quantizedInput(state.input, course.replay.inputQuantization));
    this._run.poses.push(quantizedPose(player, course.replay.inputQuantization));
    this._updateGhostPlayback(course);

    const expected = this._run.expectedGateIndex;
    for (let index = expected + 1; index < course.gates.length; index++) {
      if (gateCrossing(course, index, player.prevPos, player.pos, player.radius, state)) {
        this._invalidate('missed_gate', { expectedGateIndex: expected, crossedGateIndex: index });
        return;
      }
    }
    const crossing = gateCrossing(course, expected, player.prevPos, player.pos, player.radius, state);
    if (!crossing) return;
    if (course.kind === 'slingshot' && expected === course.qualification?.gateIndex) {
      const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
      if (!this._run.slingshotRelease || speed < finite(course.qualification.minCheckpointSpeedWU, Infinity)) {
        this._invalidate('slingshot_release_required', { speed, anchorId: this._anchorId });
        return;
      }
    }
    this._run.expectedGateIndex += 1;
    this.bus.emit('timeTrial:gatePassed', {
      courseId: course.id,
      gateIndex: expected,
      gateCount: course.gates.length,
      elapsedTicks: Math.max(0, state.tick - this._run.startedTick),
      crossing,
    });
    if (this._run.expectedGateIndex >= course.gates.length) this._complete(course, player);
  },

  prepareGhostReplay(courseId) {
    const course = timeTrialCourseById(courseId);
    if (!course) return null;
    const record = normalizeCourseRecord(ensureLedger(this.state), course);
    if (!record.bestReplay) return null;
    return {
      schema: GHOST_SCHEMA,
      courseId,
      cursor: 0,
      replay: copyPlain(record.bestReplay),
    };
  },

  localBoard() {
    return timeTrialLocalBoard(this.state);
  },

  readGhostInput(ghost) {
    if (!ghost || ghost.schema !== GHOST_SCHEMA || !ghost.replay || !Array.isArray(ghost.replay.frames)) return null;
    const index = Math.max(0, Math.trunc(finite(ghost.cursor)));
    const frame = ghost.replay.frames[index];
    if (!frame) return null;
    ghost.cursor = index + 1;
    return decodeTimeTrialInputFrame(frame, ghost.replay.quantization);
  },

  getRuntimeState() {
    return {
      courseId: this._course?.id || null,
      buoyIds: [...this._buoyIds],
      obstacleIds: [...this._obstacleIds],
      courseBodyIds: [...this._courseBodyIds],
      anchorId: this._anchorId,
      ghostEntityId: this._ghostEntityId,
      slingshotCutCheck: this._lastSlingshotCutCheck ? copyPlain(this._lastSlingshotCutCheck) : null,
      run: this._run ? copyPlain(this._run) : null,
      arenaPending: this._arenaPending ? copyPlain(this._arenaPending) : null,
      arenaRun: this._arenaRun ? copyPlain({ ...this._arenaRun, enemyIds: [...this._arenaRun.enemyIds] }) : null,
    };
  },

  /** Explicit owner seam for another live activity taking over the player mid-run. */
  cancelActiveRun(reason = 'cancelled') {
    if (!this._run) return false;
    this._invalidate(String(reason || 'cancelled'));
    return true;
  },

  _enterSector(sectorId) {
    const course = timeTrialCourseForSector(sectorId);
    if (!course) {
      this._leaveSector('route_unavailable');
      return;
    }
    if (this._course?.id === course.id && this._buoyIds.size > 0) return;
    this._leaveSector('course_rebuild');
    this._course = course;
    this._spawnCourse(course);
    normalizeCourseRecord(ensureLedger(this.state), course);
    this._syncGhostForCourse(course);
    this.bus.emit('timeTrial:courseAvailable', {
      courseId: course.id,
      name: course.name,
      sectorId: course.sectorId,
      postingStationId: course.postingStationId,
      gateCount: course.gates.length,
    });
  },

  _spawnCourse(course) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function') return;
    const centers = course.gates.map((gate) => resolveTimeTrialPoint(course, gate.center, this.state));
    if (centers.some((center) => !center)) return;
    for (let gateIndex = 0; gateIndex < course.gates.length; gateIndex++) {
      const gate = course.gates[gateIndex];
      const center = centers[gateIndex];
      const frame = gateFrame(course, gateIndex, this.state);
      for (let nodeIndex = 0; nodeIndex < course.ring.nodeCount; nodeIndex++) {
        const side = nodeIndex < course.ring.nodeCount * 0.5 ? -1 : 1;
        const stagger = nodeIndex % 2 === 0 ? -0.28 : 0.28;
        const offsetTangent = side * course.ring.radiusWU;
        const offsetNormal = stagger * course.ring.radiusWU;
        const entity = spawn({
          type: 'fx',
          team: 2,
          factionId: 'faction_dmc',
          pos: {
            x: center.x + frame.tx * offsetTangent + frame.nx * offsetNormal,
            z: center.z + frame.tz * offsetTangent + frame.nz * offsetNormal,
          },
          vel: { x: 0, z: 0 },
          rot: Math.atan2(frame.nz, frame.nx) + Math.PI * 0.5,
          radius: course.ring.buoyRadiusWU,
          mass: course.ring.buoyMass,
          collides: true,
          collisionMask: PHYSICAL_RING_MASK,
          ttl: Infinity,
          flags: { noInterp: true },
          physicsBody: {
            dynamic: false,
            ccd: false,
            radius: course.ring.buoyRadiusWU,
            mass: course.ring.buoyMass,
            material: 'station',
            shape: 'ball',
          },
          data: {
            placeId: course.placeId,
            placeScale: course.ring.placeScale,
            name: `${course.name} / Ring ${gateIndex + 1}`,
            scanLabel: gateIndex === 0
              ? `${course.name} start / ${Math.max(0, Math.trunc(finite(course.entryFeeCr)))} cr entry`
              : `${course.name} checkpoint ${gateIndex + 1}`,
            sectorId: course.sectorId,
            homeSectorId: course.sectorId,
            timeTrialCourseId: course.id,
            timeTrialGateIndex: gateIndex,
            timeTrialNodeIndex: nodeIndex,
            visualRadius: 12,
          },
        });
        if (!entity) continue;
        this._buoyIds.add(entity.id);
        this._courseBodyIds.add(entity.id);
      }
    }
    this._spawnObstacles(course, spawn);
    this._spawnAnchor(course, spawn);
  },

  _spawnObstacles(course, spawn) {
    if (!Array.isArray(course.obstacles) || !course.obstacle) return;
    for (let index = 0; index < course.obstacles.length; index++) {
      const pos = resolveTimeTrialPoint(course, course.obstacles[index], this.state);
      if (!pos) continue;
      const radius = finite(course.obstacle.radiusWU, 18);
      const mass = finite(course.obstacle.mass, 1_000_000);
      const entity = spawn({
        type: 'fx', team: 2, factionId: 'faction_dmc', pos, vel: { x: 0, z: 0 },
        rot: index * 0.73, radius, mass, collides: true, collisionMask: PHYSICAL_RING_MASK,
        hull: 1_000_000, hullMax: 1_000_000, flags: { noInterp: true },
        physicsBody: { dynamic: false, ccd: false, radius, mass, material: 'rock', shape: 'ball' },
        data: {
          placeId: 'place_asteroid_rock_a', typeId: 'ast_common_rock',
          name: `${course.name} / Tooth ${index + 1}`,
          sectorId: course.sectorId, homeSectorId: course.sectorId,
          timeTrialCourseId: course.id, timeTrialObstacleIndex: index,
          placeScale: finite(course.obstacle.placeScale, 1), visualRadius: radius,
        },
      });
      if (!entity) continue;
      this._obstacleIds.add(entity.id);
      this._courseBodyIds.add(entity.id);
    }
  },

  _spawnAnchor(course, spawn) {
    if (!course.anchor) return;
    const pos = resolveTimeTrialPoint(course, course.anchor.center, this.state);
    if (!pos) return;
    const radius = finite(course.anchor.radiusWU, 36);
    const mass = finite(course.anchor.mass, 1_000_000_000);
    const entity = spawn({
      type: 'asteroid', team: 2, factionId: 'faction_free', pos, vel: { x: 0, z: 0 },
      rot: 0, radius, mass, collides: true, collisionMask: PHYSICAL_RING_MASK,
      hull: 1_000_000_000, hullMax: 1_000_000_000, flags: { noInterp: true },
      physicsBody: { dynamic: false, ccd: false, radius, mass, material: 'rock', shape: 'ball' },
      data: {
        typeId: course.anchor.typeId || 'ast_common_rock', name: `${course.name} / Massline Anchor`,
        sectorId: course.sectorId, homeSectorId: course.sectorId,
        timeTrialCourseId: course.id, timeTrialAnchor: true,
        placeScale: finite(course.anchor.placeScale, 1), visualRadius: radius,
      },
    });
    if (!entity) return;
    this._anchorId = entity.id;
    this._courseBodyIds.add(entity.id);
  },

  _syncGhostForCourse(course) {
    this._removeGhost();
    if (!course) return;
    const ledger = ensureLedger(this.state);
    if (ledger.ghostEnabled[course.id] !== true) return;
    const record = normalizeCourseRecord(ledger, course);
    const replay = record.bestReplay;
    if (!replay || !Array.isArray(replay.poses) || replay.poses.length === 0 || !replay.startPose) return;
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function') return;
    const entity = spawn({
      type: 'fx', team: 0, factionId: null,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 9, collides: false, collisionMask: 0, ttl: Infinity,
      flags: { forceRender: true, neverCull: true },
      data: {
        timeTrialGhost: true,
        timeTrialCourseId: course.id,
        defId: replay.shipDefId || 'ship_kestrel',
        name: `${course.name} / Your best`,
        scanLabel: 'YOUR BEST / LOCAL GHOST',
        sectorId: course.sectorId,
        homeSectorId: course.sectorId,
      },
    });
    if (!entity) return;
    this._ghostEntityId = entity.id;
    applyQuantizedPose(entity, replay.startPose, replay.quantization);
    this.bus.emit('timeTrial:ghostSpawned', {
      courseId: course.id, ghostId: entity.id, bestTicks: record.bestTicks,
    });
  },

  _updateGhostPlayback(course) {
    if (!this._run || !this._ghostEntityId) return;
    const ghost = this.state.entities?.get?.(this._ghostEntityId);
    const record = normalizeCourseRecord(ensureLedger(this.state), course);
    const replay = record.bestReplay;
    if (!ghost || !replay || !Array.isArray(replay.poses) || replay.poses.length === 0) return;
    const index = Math.min(replay.poses.length - 1, Math.max(0, this._run.frames.length - 1));
    applyQuantizedPose(ghost, replay.poses[index], replay.quantization);
  },

  _resetGhostPlayback(course) {
    if (!course || !this._ghostEntityId) return;
    const ghost = this.state.entities?.get?.(this._ghostEntityId);
    const replay = normalizeCourseRecord(ensureLedger(this.state), course).bestReplay;
    if (ghost && replay?.startPose) applyQuantizedPose(ghost, replay.startPose, replay.quantization);
  },

  _removeGhost() {
    if (this._ghostEntityId == null) return;
    const id = this._ghostEntityId;
    this._ghostEntityId = null;
    this.helpers?.removeEntity?.(id);
    this.bus?.emit?.('timeTrial:ghostRemoved', { ghostId: id });
  },

  _tryStartRun(course, player, crossing) {
    const entryFeeCr = Math.max(0, Math.trunc(finite(course?.entryFeeCr)));
    const availableCr = Math.max(0, Math.trunc(finite(this.state.player?.credits)));
    if (availableCr < entryFeeCr) {
      this.bus.emit('timeTrial:startRejected', {
        courseId: course.id,
        reason: 'insufficient_credits',
        entryFeeCr,
        availableCr,
      });
      this.bus.emit('toast', {
        text: `${course.name}: ${entryFeeCr} cr entry; ${availableCr} cr available.`,
        kind: 'warn',
        ttl: 5,
      });
      return false;
    }
    if (entryFeeCr > 0) {
      this.bus.emit('economy:chargeCredits', {
        amount: entryFeeCr,
        reason: `time_trial_entry:${course.id}`,
      });
    }
    this._startRun(course, player, crossing, { entryFeeCr });
    return true;
  },

  // Explicit callers (for example a no-fee invitational event) retain the legacy free start seam.
  _startRun(course, player, crossing, { entryFeeCr = 0 } = {}) {
    this._run = {
      courseId: course.id,
      startedTick: this.state.tick,
      expectedGateIndex: 1,
      invalidated: false,
      reason: null,
      startPose: quantizedPose(player, course.replay.inputQuantization),
      frames: [],
      poses: [],
      slingshotRelease: null,
    };
    this._resetGhostPlayback(course);
    this.bus.emit('timeTrial:started', {
      courseId: course.id,
      playerId: player.id,
      startedTick: this._run.startedTick,
      entryFeeCr,
      crossing,
    });
    this.bus.emit('timeTrial:gatePassed', {
      courseId: course.id,
      gateIndex: 0,
      gateCount: course.gates.length,
      elapsedTicks: 0,
      crossing,
    });
    if (this._lastBuoyContactTick === this.state.tick) this._invalidate('touched_buoy');
  },

  _complete(course, player) {
    const elapsedTicks = Math.max(0, Math.trunc(this.state.tick - this._run.startedTick));
    const medal = medalForTimeTrialTicks(course, elapsedTicks);
    const rank = timeTrialMedalRank(medal);
    const ledger = ensureLedger(this.state);
    const record = normalizeCourseRecord(ledger, course);
    const replay = {
      schema: REPLAY_SCHEMA,
      schemaVersion: TIME_TRIAL_SCHEMA_VERSION,
      courseId: course.id,
      seed: this.state.meta?.seed >>> 0,
      tickRate: TIME_TRIAL_TICK_RATE,
      quantization: course.replay.inputQuantization,
      startPose: this._run.startPose,
      shipDefId: player.data?.defId || 'ship_kestrel',
      elapsedTicks,
      medal,
      frames: this._run.frames,
      poses: this._run.poses,
    };
    const improved = record.bestTicks == null || elapsedTicks < record.bestTicks;
    if (improved) {
      record.bestTicks = elapsedTicks;
      record.bestMedal = medal;
      record.bestReplay = replay;
    }
    const previousReward = cumulativeRewardForRank(course, record.rewardedRank);
    const nextReward = cumulativeTimeTrialCredits(course, medal);
    const creditDelta = rank > record.rewardedRank ? Math.max(0, nextReward - previousReward) : 0;
    if (rank > record.rewardedRank) record.rewardedRank = rank;
    if (creditDelta > 0) {
      this.bus.emit('economy:grantCredits', {
        amount: creditDelta,
        reason: `time_trial:${course.id}:${medal}`,
      });
    }
    let trailTintUnlocked = null;
    if (medal === 'gold') {
      const tint = course.rewards.goldTrailTint;
      const newlyUnlocked = ledger.unlockedTrailTints[tint.id] !== true;
      ledger.unlockedTrailTints[tint.id] = true;
      trailTintUnlocked = tint.id;
      if (newlyUnlocked) this.bus.emit('timeTrial:trailTintUnlocked', {
        courseId: course.id,
        tintId: tint.id,
        color: tint.color,
      });
    }
    this.bus.emit('timeTrial:completed', {
      courseId: course.id,
      playerId: player.id,
      elapsedTicks,
      medal,
      improved,
      creditDelta,
      trailTintUnlocked,
      replayFrames: replay.frames.length,
    });
    this._run = null;
    this._syncGhostForCourse(course);
  },

  _invalidate(reason, extra = {}) {
    if (!this._run || this._run.invalidated) return;
    this._run.invalidated = true;
    this._run.reason = reason;
    this.bus.emit('timeTrial:invalidated', {
      courseId: this._run.courseId,
      reason,
      elapsedTicks: Math.max(0, this.state.tick - this._run.startedTick),
      ...extra,
    });
    this._run = null;
    if (this._course) this._resetGhostPlayback(this._course);
  },

  _requestArena(payload) {
    const tier = timeTrialArenaTierById(payload.tierId);
    const ledger = ensureLedger(this.state);
    const unlocked = tier && (tier.unlockAfter == null || ledger.arena.cleared[tier.unlockAfter] === true);
    if (!tier || !unlocked || this._dockedStationId !== VESTA_STATION_ARENA.stationId
      || this.state.world?.currentSectorId !== VESTA_STATION_ARENA.sectorId
      || this._arenaRun || this._arenaPending) {
      this.bus.emit('timeTrial:arenaRejected', {
        tierId: payload.tierId || null,
        reason: !tier ? 'unknown_tier' : !unlocked ? 'tier_locked'
          : this._dockedStationId !== VESTA_STATION_ARENA.stationId ? 'wrong_station'
            : this._arenaRun || this._arenaPending ? 'arena_busy' : 'wrong_sector',
      });
      return false;
    }
    this._arenaPending = { tierId: tier.id, requestedTick: this.state.tick };
    this.bus.emit('timeTrial:arenaQueued', {
      arenaId: VESTA_STATION_ARENA.id, tierId: tier.id, stationId: VESTA_STATION_ARENA.stationId,
    });
    return true;
  },

  _onUndocked() {
    this._dockedStationId = null;
  },

  _startArena(player) {
    const tier = timeTrialArenaTierById(this._arenaPending?.tierId);
    if (!tier || this.state.world?.currentSectorId !== VESTA_STATION_ARENA.sectorId) {
      this._arenaPending = null;
      return false;
    }
    if (this._run) this._invalidate('arena_started');
    this._arenaRun = {
      arenaId: VESTA_STATION_ARENA.id,
      tierId: tier.id,
      startedTick: this.state.tick,
      waveIndex: 0,
      nextWaveTick: null,
      kills: 0,
      enemyIds: new Set(),
      origin: { x: finite(player.pos?.x), z: finite(player.pos?.z) },
    };
    this._arenaPending = null;
    this._spawnArenaWave(tier);
    this.bus.emit('timeTrial:arenaStarted', {
      arenaId: VESTA_STATION_ARENA.id, tierId: tier.id, waveCount: tier.waves.length,
    });
    return true;
  },

  _spawnArenaWave(tier) {
    const run = this._arenaRun;
    const wave = tier?.waves?.[run?.waveIndex];
    const spawn = this.helpers?.spawnEntity;
    if (!run || !Array.isArray(wave) || typeof spawn !== 'function') return false;
    run.nextWaveTick = null;
    for (let index = 0; index < wave.length; index++) {
      const angle = run.waveIndex * 1.17 + index * (Math.PI * 2 / Math.max(1, wave.length));
      const distance = 360 + index * 55 + run.waveIndex * 40;
      const pos = {
        x: run.origin.x + Math.cos(angle) * distance,
        z: run.origin.z + Math.sin(angle) * distance,
      };
      const spec = makeEnemySpawnSpec(wave[index], 1 + run.waveIndex, pos, {
        identityKey: `arena:${run.tierId}:${run.waveIndex}:${index}`,
        identitySeed: this.state.meta?.seed,
        motive: 'sanctioned_arena_match',
        engagementTrigger: 'arena_ladder_start',
        zoneId: VESTA_STATION_ARENA.id,
        noFireResponseWindowS: 0.35,
      });
      spec.factionId = null;
      spec.data = spec.data || {};
      spec.data.bountyCr = 0;
      spec.data.loot = null;
      spec.data.lootTableId = null;
      spec.data.noOrdinaryRewards = true;
      spec.data.encounter = true;
      spec.data.timeTrialArena = {
        arenaId: VESTA_STATION_ARENA.id,
        tierId: run.tierId,
        waveIndex: run.waveIndex,
        slotIndex: index,
      };
      const enemy = spawn(spec);
      if (enemy) run.enemyIds.add(enemy.id);
    }
    this.bus.emit('timeTrial:arenaWaveStarted', {
      arenaId: VESTA_STATION_ARENA.id,
      tierId: run.tierId,
      waveIndex: run.waveIndex,
      enemyIds: [...run.enemyIds],
    });
    return run.enemyIds.size > 0;
  },

  _updateArena(player) {
    const run = this._arenaRun;
    if (!run) return;
    if (!player || player.alive === false) {
      this._abortArena('player_unavailable');
      return;
    }
    if (run.nextWaveTick != null && this.state.tick >= run.nextWaveTick) {
      const tier = timeTrialArenaTierById(run.tierId);
      if (!this._spawnArenaWave(tier)) this._abortArena('wave_spawn_failed');
    }
  },

  _onArenaEntityKilled(payload) {
    const run = this._arenaRun;
    if (!run || !run.enemyIds.has(payload.id)) return;
    if (payload.killerId !== this.state.playerId) {
      this._abortArena('combatant_killed_by_non_player');
      return;
    }
    run.enemyIds.delete(payload.id);
    run.kills += 1;
    if (run.enemyIds.size > 0) return;
    const tier = timeTrialArenaTierById(run.tierId);
    this.bus.emit('timeTrial:arenaWaveCleared', {
      arenaId: VESTA_STATION_ARENA.id, tierId: run.tierId, waveIndex: run.waveIndex,
    });
    if (!tier || run.waveIndex + 1 >= tier.waves.length) {
      this._completeArena(tier);
      return;
    }
    run.waveIndex += 1;
    run.nextWaveTick = this.state.tick + 45;
  },

  _onArenaEntityDestroyed(payload) {
    const run = this._arenaRun;
    if (!run || !run.enemyIds.has(payload.id)) return;
    this._abortArena('combatant_lost_without_kill');
  },

  _completeArena(tier) {
    const run = this._arenaRun;
    if (!run || !tier) return;
    const elapsedTicks = Math.max(0, this.state.tick - run.startedTick);
    const player = this.state.entities?.get?.(this.state.playerId);
    const hullFraction = player?.hullMax > 0 ? clamp(player.hull / player.hullMax, 0, 1) : 0;
    const score = Math.max(0, Math.round(run.kills * 100 + hullFraction * 400
      + Math.max(0, 1800 - elapsedTicks / 3)));
    const ledger = ensureLedger(this.state);
    const prior = ledger.arena.scores[tier.id] || {};
    const improved = !Number.isFinite(prior.bestScore) || score > prior.bestScore;
    if (improved) ledger.arena.scores[tier.id] = { bestScore: score, bestTicks: elapsedTicks };
    ledger.arena.cleared[tier.id] = true;
    const creditDelta = ledger.arena.rewarded[tier.id] === true ? 0 : tier.creditReward;
    if (creditDelta > 0) {
      ledger.arena.rewarded[tier.id] = true;
      this.bus.emit('economy:grantCredits', {
        amount: creditDelta,
        reason: `time_trial_arena:${tier.id}`,
      });
    }
    let trailTintUnlocked = null;
    if (tier.id === 'crown') {
      const tint = VESTA_STATION_ARENA.rewardTint;
      const newlyUnlocked = ledger.unlockedTrailTints[tint.id] !== true;
      ledger.unlockedTrailTints[tint.id] = true;
      trailTintUnlocked = tint.id;
      if (newlyUnlocked) this.bus.emit('timeTrial:trailTintUnlocked', {
        arenaId: VESTA_STATION_ARENA.id, tintId: tint.id, color: tint.color,
      });
    }
    this._arenaRun = null;
    this.bus.emit('timeTrial:arenaCompleted', {
      arenaId: VESTA_STATION_ARENA.id,
      tierId: tier.id,
      score,
      elapsedTicks,
      improved,
      creditDelta,
      trailTintUnlocked,
    });
  },

  _abortArena(reason) {
    const run = this._arenaRun;
    if (!run) {
      if (reason !== 'dock_transition') this._arenaPending = null;
      return;
    }
    this._arenaRun = null;
    for (const id of run.enemyIds) this.helpers?.removeEntity?.(id);
    this.bus.emit('timeTrial:arenaAborted', {
      arenaId: VESTA_STATION_ARENA.id, tierId: run.tierId, reason,
    });
  },

  _onImpact(payload) {
    const playerId = this.state.playerId;
    if (payload.aId !== playerId && payload.bId !== playerId) return;
    const otherId = payload.aId === playerId ? payload.bId : payload.aId;
    if (this._obstacleIds.has(otherId)) {
      if (this._run) this._invalidate('touched_obstacle', {
        obstacleId: otherId,
        obstacleIndex: this.state.entities?.get?.(otherId)?.data?.timeTrialObstacleIndex ?? null,
      });
      return;
    }
    if (!this._buoyIds.has(otherId)) return;
    this._lastBuoyContactTick = Math.max(0, Math.trunc(finite(payload.tick, this.state.tick)));
    if (this._run) this._invalidate('touched_buoy', { buoyId: otherId, gateIndex: this.state.entities?.get?.(otherId)?.data?.timeTrialGateIndex ?? null });
  },

  _onTetherCut(payload) {
    if (!this._run || this._course?.kind !== 'slingshot' || this._run.slingshotRelease) return;
    if (payload.targetId !== this._anchorId || payload.slingshot !== true) {
      this._lastSlingshotCutCheck = { accepted: false, reason: 'wrong_anchor_or_speed_class' };
      return;
    }
    const player = this.state.entities?.get?.(this.state.playerId);
    const tether = this.state.player?.tether;
    if (!player || tether?.active !== true || tether.targetId !== this._anchorId) {
      this._lastSlingshotCutCheck = {
        accepted: false, reason: 'no_live_course_attachment',
        tetherActive: tether?.active === true, tetherTargetId: tether?.targetId ?? null,
      };
      return;
    }
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const payloadSpeed = finite(payload.speed, -1);
    const threshold = finite(player.maxSpeed, 120) * 1.4;
    if (speed < threshold || Math.abs(speed - payloadSpeed) > 0.05) {
      this._lastSlingshotCutCheck = {
        accepted: false, reason: 'physical_speed_mismatch', speed, payloadSpeed, threshold,
      };
      return;
    }
    this._run.slingshotRelease = {
      tick: this.state.tick,
      anchorId: this._anchorId,
      speed: payloadSpeed,
      velocity: { x: finite(payload.velocity?.x), z: finite(payload.velocity?.z) },
      position: { x: finite(player.pos?.x), z: finite(player.pos?.z) },
    };
    this._lastSlingshotCutCheck = {
      accepted: true, speed: payloadSpeed, anchorId: this._anchorId,
      position: { x: finite(player.pos?.x), z: finite(player.pos?.z) },
      velocity: { x: finite(payload.velocity?.x), z: finite(payload.velocity?.z) },
    };
    this.bus.emit('timeTrial:slingshotQualified', {
      courseId: this._course.id, anchorId: this._anchorId, speed: payloadSpeed,
    });
  },

  _onPlanetPlungeStage(payload) {
    if (!this._run || this._course?.kind !== 'skim') return;
    if (payload.siteId !== this._course.planetSiteId || payload.id !== this.state.playerId) return;
    if (payload.stage === 'aftermath') this._invalidate('burn_up');
  },

  _validateCourseEnvironment(course, player) {
    if (course.kind !== 'skim') return true;
    const planet = this.state.planet;
    if (!planet?.active || planet.siteId !== course.planetSiteId) {
      this._invalidate('planet_unavailable');
      return false;
    }
    const dx = finite(player.pos?.x) - finite(planet.center?.x);
    const dz = finite(player.pos?.z) - finite(planet.center?.z);
    const radius = Math.hypot(dx, dz);
    const region = planet.player?.region;
    const belowAuthoredFloor = radius < finite(course.safety?.minRadiusWU) && region !== 'skim';
    if (belowAuthoredFloor || region === 'danger' || region === 'reentry') {
      this._invalidate('unsafe_depth', { radius, region });
      return false;
    }
    const aboveAuthoredCeiling = radius > finite(course.safety?.maxRadiusWU, Infinity) && region !== 'skim';
    if (aboveAuthoredCeiling || region === 'sling' || region === 'influence' || region === 'outside') {
      this._invalidate('escaped_skim', { radius, region });
      return false;
    }
    return true;
  },

  _onDocked(payload) {
    this._dockedStationId = payload.stationId || null;
    if (this._arenaRun) this._abortArena('docked');
    if (payload.stationId === VESTA_STATION_ARENA.stationId) {
      this.bus.emit('timeTrial:arenaAvailable', {
        arenaId: VESTA_STATION_ARENA.id,
        stationId: VESTA_STATION_ARENA.stationId,
        tiers: timeTrialLocalBoard(this.state).arena,
      });
    }
    const course = timeTrialCourseForSector(this.state.world?.currentSectorId);
    if (!course || payload.stationId !== course.postingStationId) return;
    this.bus.emit('toast', { text: coursePostingText(course), kind: 'info', ttl: 9 });
    this.bus.emit('timeTrial:postingRead', {
      courseId: course.id,
      stationId: course.postingStationId,
      text: coursePostingText(course),
    });
  },

  _selectGhost(payload) {
    const course = timeTrialCourseById(payload.courseId);
    if (!course) return false;
    const ledger = ensureLedger(this.state);
    const record = normalizeCourseRecord(ledger, course);
    const enabled = payload.enabled !== false;
    if (enabled && (!record.bestReplay || !Array.isArray(record.bestReplay.poses)
      || record.bestReplay.poses.length === 0)) {
      this.bus.emit('timeTrial:ghostSelectionRejected', {
        courseId: course.id, reason: 'no_renderable_best',
      });
      return false;
    }
    ledger.ghostEnabled[course.id] = enabled;
    if (this._course?.id === course.id) this._syncGhostForCourse(course);
    this.bus.emit('timeTrial:ghostSelected', { courseId: course.id, enabled });
    return true;
  },

  _selectTrailTint(payload) {
    const tintId = payload.tintId == null || payload.tintId === 'stock' ? null : String(payload.tintId);
    const ledger = ensureLedger(this.state);
    if (tintId != null
      && (ledger.unlockedTrailTints[tintId] !== true || !timeTrialTrailTintById(tintId))) {
      this.bus.emit('timeTrial:trailTintSelectionRejected', { tintId, reason: 'not_earned' });
      return false;
    }
    ledger.selectedTrailTint = tintId;
    this.bus.emit('timeTrial:trailTintSelected', {
      tintId,
      color: timeTrialTrailTintById(tintId)?.color || null,
    });
    return true;
  },

  _leaveSector(reason) {
    if (this._run) this._invalidate(reason);
    this._abortArena(reason);
    this._removeGhost();
    const remove = this.helpers?.removeEntity;
    if (typeof remove === 'function') {
      for (const id of this._courseBodyIds || []) remove(id);
    }
    this._buoyIds?.clear?.();
    this._obstacleIds?.clear?.();
    this._courseBodyIds?.clear?.();
    this._anchorId = null;
    this._arenaPending = null;
    this._dockedStationId = null;
    this._lastSlingshotCutCheck = null;
    this._course = null;
  },

  _resetForNewGame() {
    this._leaveSector('new_game');
    if (this.state.player) delete this.state.player.timeTrials;
    ensureLedger(this.state);
  },

  destroy() {
    for (const unsub of this._unsubs || []) unsub?.();
    this._unsubs = [];
    this._leaveSector('destroy');
  },
};

function cumulativeRewardForRank(course, rank) {
  if (rank >= 3) return course.rewards.goldCredits;
  if (rank === 2) return course.rewards.silverCredits;
  if (rank === 1) return course.rewards.bronzeCredits;
  return 0;
}

export default timeTrials;
