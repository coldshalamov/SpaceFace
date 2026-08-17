// Render-only craft pitch lean over CoreSystem's maintained ship/drone domain.
// Every craft remains updated while far-culled so returning to presentation cannot reveal stale lean.
//
// Massline UVP: when combat reports status_tumbling or drive-disabled, bank/pitch are driven by
// pure tumble body language (multi-axis thrash) instead of thrust lean. Physics is not written here.
import {
  readControlLossPresentation,
  resolveThrownBodyTrailPlan,
  resolveTumbleBodyLanguage,
  resolveTumbleRecoverPose,
} from './masslinePresentation.js';
import { shipDriftTell } from './driftTell.js';

const THROWN_TRAIL_INPUT = {
  mode: 'idle',
  cause: null,
  playerCaused: false,
  isPlayer: false,
  alive: false,
  velocityX: 0,
  velocityZ: 0,
  radius: 0,
  reduced: false,
  targetRelevant: false,
};

export function shipPitchCandidates(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  return state && Array.isArray(state.entityList) ? state.entityList : [];
}

// Approximate engine drive for a ship/drone for VFX/feel purposes. Mirrors the logic in vfx.js
// without importing it, keeping this render-only presentation owner decoupled from VFX internals.
export function shipEngineDrive(entity) {
  if (!entity.vel) return 0;
  const speed = Math.hypot(entity.vel.x, entity.vel.z);
  const maxSpd = Math.max(1, entity.maxSpeed || 1);
  const hx = Math.cos(entity.rot), hz = Math.sin(entity.rot);
  const align = speed > 1 ? (entity.vel.x * hx + entity.vel.z * hz) / speed : 0;
  return Math.max(0, Math.min(1, (speed / maxSpd) * Math.max(0, align)));
}

function flightPitchTarget(entity) {
  const boosting = !!(entity.flags && entity.flags.boosting);
  const drive = shipEngineDrive(entity);
  let target = 0;
  if (boosting) target = -0.13;
  else if (drive > 0.75) target = -0.055;
  else if (drive > 0.35) target = -0.025;
  if (!boosting && drive > 0.3 && entity.vel) {
    const vx = entity.vel.x, vz = entity.vel.z;
    const speed = Math.hypot(vx, vz);
    if (speed > 8) {
      const hx = Math.cos(entity.rot), hz = Math.sin(entity.rot);
      const align = (vx * hx + vz * hz) / Math.max(1, speed);
      if (align < -0.35) target = 0.07;
    }
  }
  return target;
}

function writeDriftPresentation(pres, tell) {
  let drift = pres.drift;
  if (!drift) {
    drift = pres.drift = {
      active: false,
      intensity: 0,
      trailX: 0,
      trailZ: 0,
      heading: 0,
    };
  }
  drift.active = !!(tell && tell.active);
  drift.intensity = tell && Number.isFinite(tell.intensity) ? tell.intensity : 0;
  drift.trailX = tell && Number.isFinite(tell.trailX) ? tell.trailX : 0;
  drift.trailZ = tell && Number.isFinite(tell.trailZ) ? tell.trailZ : 0;
  drift.heading = tell && Number.isFinite(tell.heading) ? tell.heading : 0;
  return drift;
}

const DRIFT_TELL_SCRATCH = {
  active: false,
  intensity: 0,
  trailX: 0,
  trailZ: 0,
  heading: 0,
};

function ensurePresentation(entity) {
  if (!entity.presentation || typeof entity.presentation !== 'object') {
    entity.presentation = {};
  }
  return entity.presentation;
}

/**
 * Update cosmetic pitch/bank. Thrust lean for normal flight; multi-axis thrash for tumble/drift.
 * Attaches entity.presentation.tumble intent for VFX consumers (RCS thrash, dead thruster, ribbons).
 */
export function updateShipPitchPresentation(state, frameDt) {
  const dt = Math.min(0.05, Math.max(0, frameDt));
  const rate = 6.0;
  let updated = 0;
  const now = Number.isFinite(state && state.simTime)
    ? state.simTime
    : (Number.isFinite(state && state.tick) ? state.tick / 60 : 0);
  const motionReduce = !!(state && state.settings && state.settings.video && state.settings.video.motionReduce);
  const video = state && state.settings && state.settings.video;
  const accessibility = state && state.settings && state.settings.accessibility;
  const reduced = !!((video && (video.motionReduce || video.flashReduce))
    || (accessibility && accessibility.flashReduce));

  for (const entity of shipPitchCandidates(state)) {
    if (!entity || (entity.type !== 'ship' && entity.type !== 'drone')) continue;
    if (!entity.alive || (entity.flags && entity.flags.docked)) {
      const staleTrail = entity.presentation && entity.presentation.thrownTrail;
      if (staleTrail) resolveThrownBodyTrailPlan(null, staleTrail);
      continue;
    }

    const flightPitch = flightPitchTarget(entity);
    if (entity.pitch == null) entity.pitch = 0;
    if (entity.bank == null) entity.bank = 0;

    const loss = readControlLossPresentation(state, entity);
    const pres = ensurePresentation(entity);
    const recover = pres.tumbleRecover;
    const existingThrownTrail = pres.thrownTrail;
    const thrownCandidate = loss.mode === 'tumbling'
      && loss.cause === 'thrown'
      && loss.playerCaused === true;
    if (existingThrownTrail || thrownCandidate) {
      const vel = entity.vel;
      THROWN_TRAIL_INPUT.mode = loss.mode;
      THROWN_TRAIL_INPUT.cause = loss.cause;
      THROWN_TRAIL_INPUT.playerCaused = loss.playerCaused;
      THROWN_TRAIL_INPUT.isPlayer = entity.id === state.playerId;
      THROWN_TRAIL_INPUT.alive = entity.alive === true;
      THROWN_TRAIL_INPUT.velocityX = vel && vel.x;
      THROWN_TRAIL_INPUT.velocityZ = vel && vel.z;
      THROWN_TRAIL_INPUT.radius = entity.radius;
      THROWN_TRAIL_INPUT.reduced = reduced;
      THROWN_TRAIL_INPUT.targetRelevant = !!(state.player
        && state.player.targetId === entity.id);
      pres.thrownTrail = resolveThrownBodyTrailPlan(
        THROWN_TRAIL_INPUT,
        existingThrownTrail || {},
      );
    }

    if (recover && Number.isFinite(recover.until) && now < recover.until) {
      const ageS = Math.max(0, now - finite(recover.startedAt, now));
      const body = resolveTumbleRecoverPose({
        ageS,
        windowS: Math.max(0.05, finite(recover.until, now) - finite(recover.startedAt, now)),
        fromBank: finite(recover.fromBank, entity.bank),
        fromPitch: finite(recover.fromPitch, entity.pitch),
        flightBank: 0,
        flightPitch,
      });
      entity.bank = body.bank;
      entity.pitch = body.pitch;
      pres.tumble = body;
      if (!body.recovering) delete pres.tumbleRecover;
      writeDriftPresentation(pres, shipDriftTell(entity, DRIFT_TELL_SCRATCH));
      updated++;
      continue;
    }

    if (loss.mode === 'tumbling' || loss.mode === 'drifting') {
      const body = resolveTumbleBodyLanguage({
        mode: loss.mode,
        cause: loss.cause,
        attackerId: loss.attackerId,
        playerCaused: loss.playerCaused,
        angVel: entity.angVel,
        spin: loss.spin,
        simTime: now,
        elapsedS: loss.elapsedS,
        remainS: loss.remainS,
        motionReduce,
        phaseBias: Number(entity.id) % 17,
        flightBank: entity.bank,
        flightPitch,
      });
      // Own bank/pitch for the thrash window (last presentation writer before mesh pose apply).
      entity.bank = body.bank;
      entity.pitch = body.pitch;
      // Remember thrash pose so recover can ease out when status clears next frames.
      pres._lastTumbleBank = body.bank;
      pres._lastTumblePitch = body.pitch;
      pres.tumble = body;
      if (loss.mode === 'tumbling') {
        pres.wasTumbling = true;
        writeDriftPresentation(pres, null);
      } else {
        writeDriftPresentation(pres, shipDriftTell(entity, DRIFT_TELL_SCRATCH));
      }
      updated++;
      continue;
    }

    // Transition: was tumbling last frames, status cleared → start recover settle.
    if (pres.wasTumbling) {
      pres.wasTumbling = false;
      pres.tumbleRecover = {
        startedAt: now,
        until: now + 0.35,
        fromBank: finite(pres._lastTumbleBank, entity.bank),
        fromPitch: finite(pres._lastTumblePitch, entity.pitch),
      };
      const body = resolveTumbleRecoverPose({
        ageS: 0,
        windowS: 0.35,
        fromBank: pres.tumbleRecover.fromBank,
        fromPitch: pres.tumbleRecover.fromPitch,
        flightBank: 0,
        flightPitch,
      });
      entity.bank = body.bank;
      entity.pitch = body.pitch;
      pres.tumble = body;
      writeDriftPresentation(pres, shipDriftTell(entity, DRIFT_TELL_SCRATCH));
      updated++;
      continue;
    }

    // Normal thrust lean (pitch only; bank remains flight-owned).
    entity.pitch += (flightPitch - entity.pitch) * (1 - Math.exp(-rate * dt));
    if (Math.abs(entity.pitch) < 0.0005 && Math.abs(flightPitch) < 0.0005) entity.pitch = 0;
    if (pres.tumble) {
      pres.tumble = resolveTumbleBodyLanguage({ mode: 'idle', flightBank: entity.bank, flightPitch: entity.pitch });
    }
    writeDriftPresentation(pres, shipDriftTell(entity, DRIFT_TELL_SCRATCH));
    updated++;
  }

  return updated;
}

function finite(v, fb = 0) {
  return Number.isFinite(v) ? v : fb;
}
