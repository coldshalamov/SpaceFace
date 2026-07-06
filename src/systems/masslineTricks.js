// Massline trick telemetry — read-only observer for tether latch/cut kinematics.
// SG-02 owns momentum exchange; tetherGameplay owns latch/reel/cut. This system tracks
// line-relative motion per latch and emits player-facing release ratings on cut.
import { SIM_DT } from '../core/sim.js';

const PHASES = Object.freeze(['slack', 'capture', 'loaded', 'overload']);
const CLASS_RANK = Object.freeze({ messy: 0, good: 1, clean: 2, razor: 3 });

export const masslineTricks = {
  id: 'masslineTricks',
  name: 'masslineTricks',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._session = null;
    this._ratedLatch = false;

    this.bus.on('tether:latched', (payload) => this._onLatched(payload));
    this.bus.on('tether:cut', (payload) => this._onCut(payload, 'cut'));
    this.bus.on('tether:released', (payload) => this._onReleased(payload));
    this.bus.on('tether:broke', (payload) => this._onCut(payload, 'broke'));
  },

  update(dt, state) {
    if (state.mode !== 'flight') {
      this._clearRuntime(state);
      return;
    }

    const player = state.entities?.get?.(state.playerId);
    const tether = state.player?.tether;
    if (!player || !player.alive || !tether?.active || !tether.targetId) {
      if (!tether?.active) this._mirrorRuntime(state, null);
      return;
    }

    const target = state.entities.get(tether.targetId);
    if (!target || target.alive === false) return;

    if (!this._session || this._session.targetId !== tether.targetId) {
      this._beginSession(state, tether.targetId);
    }

    const kinematics = computeLineKinematics(player, target, tether.restLength || 0);
    const phase = normalizePhase(tether.phase);
    const strain = finite(tether.strain, 0);
    const step = Math.max(0, finite(dt, SIM_DT));

    this._accumulateSession(phase, strain, kinematics, step, tether.reeling, state);
    this._mirrorRuntime(state, {
      targetId: tether.targetId,
      latchTick: this._session.latchTick,
      latchTime: this._session.latchTime,
      phase,
      previousPhase: this._session.previousPhase,
      timeInPhase: { ...this._session.timeInPhase },
      maxStrain: this._session.maxStrain,
      maxTangentialSpeed: this._session.maxTangentialSpeed,
      maxAngularSpeed: this._session.maxAngularSpeed,
      radialSpeed: kinematics.radialSpeed,
      tangentialSpeed: kinematics.tangentialSpeed,
      angularSpeed: kinematics.angularSpeed,
      distance: kinematics.distance,
      restLength: kinematics.restLength,
      reeling: !!tether.reeling,
      lineUnit: kinematics.lineUnit,
    });
  },

  _onLatched(payload) {
    const targetId = payload && payload.targetId;
    if (targetId == null) return;
    this._beginSession(this.state, targetId);
    this._ratedLatch = false;
  },

  _onCut(payload, kind) {
    if (this._ratedLatch) return;
    const state = this.state;
    const targetId = payload && payload.targetId;
    if (targetId == null) return;

    const player = state.entities?.get?.(state.playerId);
    const target = state.entities?.get?.(targetId);
    const tether = state.player?.tether;
    if (!player || !target) return;

    const restLength = finite(
      tether?.restLength,
      this._session?.restLength,
      distanceBetween(player, target),
    );
    const kinematics = computeLineKinematics(player, target, restLength);
    const session = this._session && this._session.targetId === targetId
      ? this._session
      : this._makeSession(state, targetId, restLength);

    const phase = normalizePhase(tether?.phase || session.phase);
    const strain = finite(tether?.strain, session.maxStrain);
    const rating = classifyRelease({
      session,
      kinematics,
      phase,
      strain,
      kind,
      player,
    });

    this.bus.emit('tether:releaseRated', {
      targetId,
      classification: rating.classification,
      releaseScore: rating.releaseScore,
      radialSpeed: kinematics.radialSpeed,
      tangentialSpeed: kinematics.tangentialSpeed,
      angularSpeed: kinematics.angularSpeed,
      maxStrain: Math.max(session.maxStrain, strain),
      phase,
      distance: kinematics.distance,
      restLength: kinematics.restLength,
      playerSpeed: speed2(player.vel),
      kind,
    });

    this._ratedLatch = true;
    this._setLastRelease(state, rating.classification, rating.releaseScore, targetId);
    this._session = null;
    this._mirrorRuntime(state, null);
  },

  _onReleased(payload) {
    if (this._ratedLatch) return;
    const targetId = payload && payload.targetId;
    if (targetId == null) return;
    // Reconcile-only release path: no tether:cut was emitted this latch.
    this._onCut({ targetId }, 'released');
  },

  _beginSession(state, targetId) {
    const tether = state.player?.tether;
    const restLength = finite(tether?.restLength, 0);
    this._session = this._makeSession(state, targetId, restLength);
    this._ratedLatch = false;
  },

  _makeSession(state, targetId, restLength) {
    const latchTick = state.tick;
    const latchTime = Number.isFinite(state.simTime) ? state.simTime : latchTick * SIM_DT;
    return {
      targetId,
      latchTick,
      latchTime,
      phase: 'slack',
      previousPhase: 'slack',
      timeInPhase: { slack: 0, capture: 0, loaded: 0, overload: 0 },
      maxStrain: 0,
      maxTangentialSpeed: 0,
      maxAngularSpeed: 0,
      restLength: finite(restLength, 0),
      reeling: false,
    };
  },

  _accumulateSession(phase, strain, kinematics, dt, reeling, state) {
    const session = this._session;
    if (!session) return;

    if (phase !== session.phase) {
      session.previousPhase = session.phase;
      session.phase = phase;
    }
    if (PHASES.includes(phase)) {
      session.timeInPhase[phase] += dt;
    }

    session.maxStrain = Math.max(session.maxStrain, strain);
    session.maxTangentialSpeed = Math.max(session.maxTangentialSpeed, kinematics.tangentialSpeed);
    session.maxAngularSpeed = Math.max(session.maxAngularSpeed, Math.abs(kinematics.angularSpeed));
    session.restLength = kinematics.restLength;
    session.reeling = !!reeling;
    session.latchTick = session.latchTick ?? state.tick;
    session.latchTime = session.latchTime ?? (Number.isFinite(state.simTime) ? state.simTime : state.tick * SIM_DT);
  },

  _mirrorRuntime(state, snapshot) {
    const player = state.player || (state.player = {});
    const tricks = player.masslineTricks || (player.masslineTricks = defaultRuntime());
    if (!snapshot) {
      tricks.active = false;
      tricks.targetId = null;
      tricks.phase = 'slack';
      tricks.previousPhase = 'slack';
      tricks.radialSpeed = 0;
      tricks.tangentialSpeed = 0;
      tricks.angularSpeed = 0;
      tricks.distance = 0;
      tricks.restLength = 0;
      tricks.reeling = false;
      tricks.lineUnit = { x: 0, z: 0 };
      return;
    }

    tricks.active = true;
    tricks.targetId = snapshot.targetId;
    tricks.latchTick = snapshot.latchTick;
    tricks.latchTime = snapshot.latchTime;
    tricks.phase = snapshot.phase;
    tricks.previousPhase = snapshot.previousPhase;
    tricks.timeInPhase = snapshot.timeInPhase;
    tricks.maxStrain = snapshot.maxStrain;
    tricks.maxTangentialSpeed = snapshot.maxTangentialSpeed;
    tricks.maxAngularSpeed = snapshot.maxAngularSpeed;
    tricks.radialSpeed = snapshot.radialSpeed;
    tricks.tangentialSpeed = snapshot.tangentialSpeed;
    tricks.angularSpeed = snapshot.angularSpeed;
    tricks.distance = snapshot.distance;
    tricks.restLength = snapshot.restLength;
    tricks.reeling = snapshot.reeling;
    tricks.lineUnit = snapshot.lineUnit;
  },

  _setLastRelease(state, classification, releaseScore, targetId) {
    const player = state.player || (state.player = {});
    const tricks = player.masslineTricks || (player.masslineTricks = defaultRuntime());
    tricks.lastRelease = {
      targetId,
      classification,
      releaseScore,
      tick: state.tick,
    };
  },

  _clearRuntime(state) {
    this._session = null;
    this._ratedLatch = false;
    this._mirrorRuntime(state, null);
  },
};

function defaultRuntime() {
  return {
    active: false,
    targetId: null,
    latchTick: 0,
    latchTime: 0,
    phase: 'slack',
    previousPhase: 'slack',
    timeInPhase: { slack: 0, capture: 0, loaded: 0, overload: 0 },
    maxStrain: 0,
    maxTangentialSpeed: 0,
    maxAngularSpeed: 0,
    radialSpeed: 0,
    tangentialSpeed: 0,
    angularSpeed: 0,
    distance: 0,
    restLength: 0,
    reeling: false,
    lineUnit: { x: 0, z: 0 },
    lastRelease: null,
  };
}

export function computeLineKinematics(player, target, restLength = 0) {
  const dx = finite(target?.pos?.x, 0) - finite(player?.pos?.x, 0);
  const dz = finite(target?.pos?.z, 0) - finite(player?.pos?.z, 0);
  const distance = Math.hypot(dx, dz);
  const lineUnit = distance > 1e-9
    ? { x: dx / distance, z: dz / distance }
    : { x: 1, z: 0 };

  const pvx = finite(player?.vel?.x, 0);
  const pvz = finite(player?.vel?.z, 0);
  const tvx = finite(target?.vel?.x, 0);
  const tvz = finite(target?.vel?.z, 0);
  const rvx = pvx - tvx;
  const rvz = pvz - tvz;

  const radialSpeed = rvx * lineUnit.x + rvz * lineUnit.z;
  const tangentialX = rvx - radialSpeed * lineUnit.x;
  const tangentialZ = rvz - radialSpeed * lineUnit.z;
  const tangentialSpeed = Math.hypot(tangentialX, tangentialZ);
  const tangentialSign = tangentialX * (-lineUnit.z) + tangentialZ * lineUnit.x >= 0 ? 1 : -1;
  const signedTangential = tangentialSpeed * tangentialSign;
  const angularSpeed = distance > 1e-6 ? signedTangential / distance : 0;

  return {
    lineUnit,
    distance,
    restLength: finite(restLength, distance),
    radialSpeed,
    tangentialSpeed,
    signedTangential,
    angularSpeed,
  };
}

export function classifyRelease({ session, kinematics, phase, strain, kind, player }) {
  if (kind === 'broke') {
    return { classification: 'messy', releaseScore: 0.08 };
  }

  const absRadial = Math.abs(kinematics.radialSpeed);
  const tangential = Math.max(0, kinematics.tangentialSpeed);
  const tangentialRatio = tangential / (tangential + absRadial + 0.35);

  const phaseScore = ({
    slack: 0.12,
    capture: 0.58,
    loaded: 1.0,
    overload: 0.08,
  })[normalizePhase(phase)] ?? 0.12;

  const currentStrain = Math.max(finite(strain, 0), session?.maxStrain || 0);
  let strainScore = 0.35;
  if (currentStrain <= 0.05) strainScore = 0.18;
  else if (currentStrain >= 0.88) strainScore = 0.1;
  else if (currentStrain >= 0.3 && currentStrain <= 0.78) strainScore = 1.0;
  else strainScore = 0.55;

  const angular = Math.abs(kinematics.angularSpeed);
  const sessionAngular = session?.maxAngularSpeed || 0;
  const angularScore = Math.min(1, Math.max(angular, sessionAngular) / 1.35);

  const overloadTime = session?.timeInPhase?.overload || 0;
  const overloadPenalty = phase === 'overload' ? 0.28
    : overloadTime >= 0.25 ? 0.22
      : currentStrain >= 0.82 ? 0.18
        : currentStrain >= 0.72 ? 0.1
          : 0;

  const loadedTime = session?.timeInPhase?.loaded || 0;
  const loadedBonus = loadedTime >= 0.35 ? 0.08 : loadedTime >= 0.12 ? 0.04 : 0;

  let releaseScore = clamp01(
    tangentialRatio * 0.4
    + phaseScore * 0.26
    + strainScore * 0.16
    + angularScore * 0.14
    + loadedBonus
    - overloadPenalty,
  );

  // Poor radial cuts bleed score: cutting while diving straight along the line reads messy.
  if (absRadial > tangential * 1.15 && absRadial > 8) {
    releaseScore = Math.min(releaseScore, 0.34);
  }

  let classification = 'messy';
  if (releaseScore >= 0.82 && tangentialRatio >= 0.62 && phase === 'loaded' && overloadPenalty <= 0.12) {
    classification = 'razor';
  } else if (releaseScore >= 0.62) {
    classification = 'clean';
  } else if (releaseScore >= 0.38) {
    classification = 'good';
  }

  // Stationary or near-stationary releases cannot grade above good.
  const playerSpeed = speed2(player?.vel);
  if (playerSpeed < 12 && classification === 'razor') classification = 'clean';
  if (playerSpeed < 6 && (classification === 'razor' || classification === 'clean')) classification = 'good';

  return { classification, releaseScore: round4(releaseScore) };
}

export function compareClassification(a, b) {
  return (CLASS_RANK[a] ?? -1) - (CLASS_RANK[b] ?? -1);
}

function normalizePhase(value) {
  if (value === 'capture' || value === 'loaded' || value === 'overload') return value;
  return 'slack';
}

function distanceBetween(a, b) {
  return Math.hypot(finite(a?.pos?.x, 0) - finite(b?.pos?.x, 0), finite(a?.pos?.z, 0) - finite(b?.pos?.z, 0));
}

function speed2(vel) {
  return Math.hypot(finite(vel?.x, 0), finite(vel?.z, 0));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}