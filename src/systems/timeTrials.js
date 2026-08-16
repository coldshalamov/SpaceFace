// Plan 50 gate-ring time trial foundation.
//
// Flight V3 and physics remain the only motion owners. This system authors fixed physical buoy
// bodies, observes the player's real post-Rapier segment, records a bounded input tape, and submits
// reward intents to economy. Durable best/replay records live in the existing serialized player bag.

import { Masks } from '../core/entity.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import {
  TIME_TRIAL_SCHEMA_VERSION,
  TIME_TRIAL_TICK_RATE,
  cumulativeTimeTrialCredits,
  medalForTimeTrialTicks,
  timeTrialCourseById,
  timeTrialCourseForSector,
  timeTrialMedalRank,
} from '../data/timeTrialCourses.js';

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
  };
}

function quantizedInput(input, scale) {
  return [
    quantize(clamp(finite(input?.moveX), -1, 1), scale),
    quantize(clamp(finite(input?.moveZ), -1, 1), scale),
    quantize(clamp(finite(input?.turnIntent), -1, 1), scale),
    input?.boost ? 1 : 0,
    input?.brake ? 1 : 0,
  ];
}

export function decodeTimeTrialInputFrame(frame, quantization = 1000) {
  const scale = Number.isFinite(quantization) && quantization > 0 ? quantization : 1000;
  const brake = frame?.[4] === 1;
  return {
    moveX: finite(frame?.[0]) / scale,
    moveZ: finite(frame?.[1]) / scale,
    turnIntent: finite(frame?.[2]) / scale,
    boost: frame?.[3] === 1,
    brake,
    actions: { brake },
  };
}

export function referenceTimeTrialInput(course, player, expectedGateIndex) {
  const gate = course?.gates?.[expectedGateIndex];
  if (!gate || !player?.pos) return { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: true };
  const center = sectorLocalToGlobalForSector(gate.center, course.sectorId);
  const frame = gateFrame(course, expectedGateIndex);
  const lateral = (player.pos.x - center.x) * frame.tx + (player.pos.z - center.z) * frame.tz;
  const lateralSpeed = finite(player.vel?.x) * frame.tx + finite(player.vel?.z) * frame.tz;
  const correction = clamp(lateral * 0.72 + lateralSpeed * 1.6, -110, 110);
  // Aim through the aperture, not at a point that disappears under the nose. The lateral term
  // recovers honestly from belt-rock deflections while the look-through keeps momentum aligned.
  const target = {
    x: center.x + frame.nx * 105 - frame.tx * correction,
    z: center.z + frame.nz * 105 - frame.tz * correction,
  };
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const distance = Math.hypot(dx, dz);
  const desired = Math.atan2(dz, dx);
  const error = wrapAngle(desired - finite(player.rot));
  const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
  const sharpTurn = Math.abs(error) > 1.15;
  const brake = sharpTurn && speed > 55;
  return {
    moveX: 0,
    moveZ: brake ? -0.25 : (Math.abs(error) < 0.85 ? 0.82 : 0.28),
    turnIntent: clamp(error / 0.56, -1, 1),
    boost: false,
    brake,
    distance,
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
  ledger.courses[course.id] = record;
  return record;
}

function gateFrame(course, gateIndex) {
  const current = course.gates[gateIndex].center;
  const previous = gateIndex === 0 ? course.staging : course.gates[gateIndex - 1].center;
  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return { nx: dx / length, nz: dz / length, tx: -dz / length, tz: dx / length };
}

function gateCrossing(course, gateIndex, from, to, playerRadiusWU = 0) {
  const gate = course.gates[gateIndex];
  if (!gate || !from || !to) return null;
  const center = sectorLocalToGlobalForSector(gate.center, course.sectorId);
  const frame = gateFrame(course, gateIndex);
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
  return `${course.postingLabel}: ${seconds(course.medals.goldTicks)}s gold / ${seconds(course.medals.silverTicks)}s silver / ${seconds(course.medals.bronzeTicks)}s bronze. Cross Ring 1 outbound to start.`;
}

export const timeTrials = {
  name: 'timeTrials',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._course = null;
    this._buoyIds = new Set();
    this._run = null;
    this._lastBuoyContactTick = -1;
    ensureLedger(this.state);
    this._unsubs = [
      this.bus.on('sector:enter', ({ sectorId } = {}) => this._enterSector(sectorId)),
      this.bus.on('sector:exit', () => this._leaveSector('sector_exit')),
      this.bus.on('physics:impact', (payload) => this._onImpact(payload || {})),
      this.bus.on('dock:docked', (payload) => this._onDocked(payload || {})),
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

    if (!this._run) {
      const crossing = gateCrossing(course, 0, player.prevPos, player.pos, player.radius);
      if (crossing) this._startRun(course, player, crossing);
      return;
    }
    if (this._run.invalidated) return;

    if (this._run.frames.length >= course.replay.maxFrames) {
      this._invalidate('time_expired');
      return;
    }
    this._run.frames.push(quantizedInput(state.input, course.replay.inputQuantization));

    const expected = this._run.expectedGateIndex;
    for (let index = expected + 1; index < course.gates.length; index++) {
      if (gateCrossing(course, index, player.prevPos, player.pos, player.radius)) {
        this._invalidate('missed_gate', { expectedGateIndex: expected, crossedGateIndex: index });
        return;
      }
    }
    const crossing = gateCrossing(course, expected, player.prevPos, player.pos, player.radius);
    if (!crossing) return;
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
      run: this._run ? copyPlain(this._run) : null,
    };
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
    for (let gateIndex = 0; gateIndex < course.gates.length; gateIndex++) {
      const gate = course.gates[gateIndex];
      const center = sectorLocalToGlobalForSector(gate.center, course.sectorId);
      const frame = gateFrame(course, gateIndex);
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
            scanLabel: `${course.name} checkpoint ${gateIndex + 1}`,
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
      }
    }
  },

  _startRun(course, player, crossing) {
    this._run = {
      courseId: course.id,
      startedTick: this.state.tick,
      expectedGateIndex: 1,
      invalidated: false,
      reason: null,
      startPose: quantizedPose(player, course.replay.inputQuantization),
      frames: [],
    };
    this.bus.emit('timeTrial:started', {
      courseId: course.id,
      playerId: player.id,
      startedTick: this._run.startedTick,
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
      elapsedTicks,
      medal,
      frames: this._run.frames,
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
  },

  _onImpact(payload) {
    const playerId = this.state.playerId;
    if (payload.aId !== playerId && payload.bId !== playerId) return;
    const otherId = payload.aId === playerId ? payload.bId : payload.aId;
    if (!this._buoyIds.has(otherId)) return;
    this._lastBuoyContactTick = Math.max(0, Math.trunc(finite(payload.tick, this.state.tick)));
    if (this._run) this._invalidate('touched_buoy', { buoyId: otherId, gateIndex: this.state.entities?.get?.(otherId)?.data?.timeTrialGateIndex ?? null });
  },

  _onDocked(payload) {
    const course = timeTrialCourseForSector(this.state.world?.currentSectorId);
    if (!course || payload.stationId !== course.postingStationId) return;
    this.bus.emit('toast', { text: coursePostingText(course), kind: 'info', ttl: 9 });
    this.bus.emit('timeTrial:postingRead', {
      courseId: course.id,
      stationId: course.postingStationId,
      text: coursePostingText(course),
    });
  },

  _leaveSector(reason) {
    if (this._run) this._invalidate(reason);
    const remove = this.helpers?.removeEntity;
    if (typeof remove === 'function') {
      for (const id of this._buoyIds || []) remove(id);
    }
    this._buoyIds?.clear?.();
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
