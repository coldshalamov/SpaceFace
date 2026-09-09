// B11 hitstun curve — helm-loss and entry spin per source and mass, on the REAL path.
//
// THE REAL-PATH LAW: "A scenario that integrates its own physics is not a measurement."
// Every number here comes out of runtime.step() on bootRealPath (rapier-dynamic). This module
// does not integrate velocity, write a spring, or peek at private helm-owner fields.
//
// Vision this serves: "Shoot weapons where it'd blast enemies away and into things."
// "Light ships are ammunition." "He becomes a projectile."
//
// This is an instrument, not a fix. Unmet bars are the finding.

import { resolveFlightProfile } from '../../../../src/core/flightDynamics.js';
import {
  measureThrusterAuthority,
  queuePhysicsImpulse,
  readPhysicsTelemetry,
} from '../../../../src/core/physicsAuthority.js';
import { HITSTUN_IMPULSE_EVENT, hitstunMassFactor, recordImpulseProvenance } from '../../../../src/combat/impulseKernel.js';
import { readTumbleStatus } from '../../../../src/combat/tumbleStatus.js';
import { combat } from '../../../../src/systems/combat.js';
import { impulseCharges } from '../../../../src/systems/impulseCharges.js';
import { tumbleStates } from '../../../../src/systems/tumbleStates.js';
import { fields } from '../../../../src/systems/fields.js';
import { FIELD_DEFS, FIELD_FLAGS, FIELD_KINDS } from '../../../../src/data/fields.js';
import { bootRealPath } from '../realPath.mjs';

export const SCREEN_DEPTH_WU = 115;
export const GUN_WEAPON_ID = 'wpn_concussion_cannon_m';
export const GUN_PROVENANCE_TAG = 'concussion_slug';

const SETTLE_TICKS = 30;
// FEEL_CONTRACT §C hitstun cap is 3.5 s; production massline tumble clamps at 6 s. Observe
// through the longer of those plus the 1.5 s NPC-recovery floor, then stop. A shorter window
// reported rope recovery torque as 0 when helm-loss simply outlasted the tape.
const LAW_CAP_S = 3.5;
const PRODUCTION_TUMBLE_MAX_S = 6;
const RECOVERY_OBSERVE_S = 1.5;
const POST_TICKS = Math.ceil((Math.max(LAW_CAP_S, PRODUCTION_TUMBLE_MAX_S) + RECOVERY_OBSERVE_S) * 60);
const RECOVERY_OBSERVE_TICKS = Math.ceil(RECOVERY_OBSERVE_S * 60);
const SPIN_WINDOW_TICKS = 10;
const COLLISION_SETTLE_AFTER_IMPACT_TICKS = 6;
const VICTIM_POS = Object.freeze({ x: -400, z: 0 });
const SHOVE_NX = 1;
const SHOVE_NZ = 0;
const MF_MIN = 0.5;
const MF_MAX = 2.2;
const TORQUE_RECOVERY_MIN = 0.1;

export const HITSTUN_HULLS = Object.freeze(['ship_wasp', 'ship_drifter', 'ship_atlas']);
export const HITSTUN_LEVELS = Object.freeze([0.05, 0.15, 0.30, 0.60, 1.30]);
export const HITSTUN_SOURCES = Object.freeze(['gun', 'rope_throw', 'well_fling', 'collision']);

export function hitstunSourceTag(source) {
  if (source === 'well_fling') return 'well';
  if (source === 'gun') return 'gun';
  if (source === 'collision') return 'collision';
  if (source === 'weapon') return 'weapon';
  return null;
}

export function selectCausalHitstunEvent(events, { victimId, source } = {}) {
  const tag = hitstunSourceTag(source);
  if (!tag || victimId == null || !Array.isArray(events)) return null;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev || ev.victimId !== victimId) continue;
    if (ev.source === tag) return ev;
  }
  return null;
}

// B11's governing quantity is measured k = ΔV/cruise, never kIntended. Lights-lose-helm uses
// k >= 0.30. Cross-source / cross-mass clauses require measured k inside this band around 0.30.
export const LIGHT_HELM_K = 0.30;
export const HEAVY_GUN_SCALE_K = 0.06;
export const MATCHED_K_BAND = Object.freeze({ target: 0.30, lo: 0.24, hi: 0.36 });
export const MATCHED_U_BAND = Object.freeze({ target: 0.3182, lo: 0.25, hi: 0.40 });
export const MEASURABLE_SPIN_RAD_PER_S = 0.25;

export const CURVE_SYSTEMS = Object.freeze([
  'actions',
  'flightV3',
  'aiPorts',
  tumbleStates,
  'collisionConsequences',
  'weapons',
  impulseCharges,
  fields,
  'physics',
  combat,
]);

export const SHOVE_SYSTEMS = Object.freeze([
  'tacticalAI',
  'actions',
  'flightV3',
  'aiPorts',
  tumbleStates,
  'collisionConsequences',
  'weapons',
  impulseCharges,
  fields,
  'physics',
  combat,
]);

export const scenario = {
  id: 'feel.hitstun_curve',
  label: 'B11 Hitstun curve - helm-loss and entry spin per source and mass, real path',
  async run(seed) {
    const result = await runHitstunCells({ seed });
    return {
      eventTrace: result.eventTrace,
      metrics: {
        schema: 'spaceface.feel.hitstunCurve.v1',
        realPathProof: result.realPathProof,
        cruiseField: result.cruiseField,
        notes: result.notes,
        cells: result.cells,
        bars: buildB11Bars(result.cells, result.notes),
      },
    };
  },
};

/**
 * Run a (source × hull × kIntended) grid. One bootRealPath host per cell: SG-02 only admits
 * bodies near the player, so a parked grid of far victims reports fake zeros.
 *
 * @param {{ seed: number, sources?: string[], hulls?: string[], levels?: number[] }} opts
 */
export async function runHitstunCells({
  seed,
  sources = HITSTUN_SOURCES,
  hulls = HITSTUN_HULLS,
  levels = HITSTUN_LEVELS,
  beforeCell = null,
} = {}) {
  if (!Number.isFinite(seed)) throw new Error('feel.hitstun_curve: seed must be a finite number');
  const eventTrace = [];
  const cells = [];
  const notes = [];
  let realPathProof = null;
  let cruiseField = null;
  let flagsChecked = false;

  for (const source of sources) {
    for (const hullId of hulls) {
      for (const kIntended of levels) {
        const cell = await measureOneCell({
          seed,
          source,
          hullId,
          kIntended,
          eventTrace,
          beforeCell,
        });
        if (!flagsChecked) {
          flagsChecked = true;
          if (cell.flagsOff) {
            notes.push(cell.flagsOff);
            return {
              cells: [cell],
              eventTrace,
              realPathProof: cell.realPathProof || null,
              cruiseField: cell.cruiseField || null,
              notes,
            };
          }
        }
        if (cell.cruiseField && !cruiseField) cruiseField = cell.cruiseField;
        if (cell.realPathProof && isReferenceCell(source, hullId, kIntended)) {
          realPathProof = cell.realPathProof;
        } else if (cell.realPathProof && !realPathProof) {
          realPathProof = cell.realPathProof;
        }
        cells.push(cell);
      }
    }
  }

  return { cells, eventTrace, realPathProof, cruiseField, notes };
}

function isReferenceCell(source, hullId, kIntended) {
  return source === 'gun' && hullId === 'ship_wasp' && Math.abs(kIntended - 0.30) < 1e-9;
}

async function measureOneCell({ seed, source, hullId, kIntended, eventTrace, beforeCell }) {
  const host = await bootRealPath({
    seed,
    systems: [...CURVE_SYSTEMS],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, rot: 0, isPlayer: true }],
  });

  const prevFieldEnabled = FIELD_FLAGS.enabled;
  if (source === 'well_fling') FIELD_FLAGS.enabled = true;
  try {
    const flagsOff = readFlagsOff(host.runtime);
    if (flagsOff) {
      host.step(1);
      return {
        source,
        hullId,
        hullMass: 0,
        cruiseSpeed: 0,
        kIntended,
        k: NaN,
        massRatio: 0,
        mF: 0,
        helmLossDurationS: NaN,
        entrySpinRadPerS: NaN,
        helmModes: [],
        helmOwner: 'none',
        recoveredAtTick: null,
        recoveryObserved: false,
        peakTorqueHelmLoss: NaN,
        peakTorqueRecovery: NaN,
        peakTorque: NaN,
        zeroTorqueDurationS: NaN,
        zeroTorqueRecoveryS: NaN,
        measured: false,
        flagsOff,
        realPathProof: host.proof(),
      };
    }

    const player = host.player;
    const victim = host.spawnShip({
      hullId,
      pos: { x: VICTIM_POS.x, z: VICTIM_POS.z },
      rot: 0,
      team: 1,
    });
    writeNpcIntent(victim, source === 'gun' || source === 'rope_throw' ? { moveZ: 1 } : emptyIntent());

    const cruise = readCruiseSpeed(victim);
    const hullMass = finite(victim.mass, 0);
    const attackerMass = finite(player && player.mass, 1);
    const massRatio = hullMass > 0 ? attackerMass / hullMass : 0;
    const mF = clamp(Math.sqrt(Math.max(0.1, massRatio)), MF_MIN, MF_MAX);

    let asteroid = null;
    if (source === 'collision') {
      const approachSpeed = kIntended * cruise.cruiseSpeed * 1.15;
      victim.vel = { x: approachSpeed, z: 0 };
      const gap = (victim.radius || 14) + 22 + 12;
      asteroid = host.spawnObstacle({
        pos: { x: VICTIM_POS.x + gap, z: 0 },
        radius: 22,
        mass: attackerMass,
        dynamic: false,
      });
    }

    const helmEvents = [];
    subscribeHelmEvents(host.bus, victim.id, helmEvents, () => host.state.tick | 0);

    const impacts = [];
    host.bus.on('physics:impact', (payload) => {
      if (!payload) return;
      if (payload.aId === victim.id || payload.bId === victim.id) impacts.push(payload);
    });
    const hitstunEvents = [];
    host.bus.on(HITSTUN_IMPULSE_EVENT, (payload) => {
      if (!payload || payload.victimId !== victim.id) return;
      hitstunEvents.push(payload);
    });
    if (typeof beforeCell === 'function') beforeCell({ host, victim, player, source });

    const cellBase = {
      source,
      hullId,
      hullMass,
      cruiseSpeed: cruise.cruiseSpeed,
      cruiseField: cruise.cruiseField,
      kIntended,
      massRatio,
      mF,
    };

    host.step(1);
    const proof = host.proof();
    try {
      // Only the victim: readPhysicsTelemetry answers for driven ship bodies, so a STATIC rock
      // reads null even though SG-02 gave it a real collider (measured 2026-09-04: asserting the
      // asteroid marked all 15 collision cells unmeasured while they were producing real contacts).
      // A rock that never got a body is caught honestly further down as 'no contact in the window'.
      host.assertBodies([victim], 'feel.hitstun_curve');
    } catch (err) {
      return unmeasuredCell(cellBase, proof, String((err && err.message) || err));
    }

    if (source === 'well_fling') {
      const fieldsSys = host.runtime.getSystem('fields');
      if (!fieldsSys || !fieldsSys._kernel || typeof fieldsSys._kernel.register !== 'function') {
        return unmeasuredCell(cellBase, proof, 'well_fling has no production fields kernel on the real path');
      }
    }

    let eventTick = null;
    let deliveryError = null;
    let angularProduction = false;
    let authoredDeltaV = 0;
    let vBefore = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
    let vAfter = null;
    let peakSpin = 0;
    let helmLossTicks = 0;
    let helmRecovered = false;
    let recoveredAtTick = null;
    let peakTorqueHelmLoss = 0;
    let peakTorqueRecovery = 0;
    let recoveryTorqueObserved = false;
    let recoveryOpposesSpin = false;
    let zeroTorqueHelmLossTicks = 0;
    let zeroTorqueRecoveryTicks = 0;
    let recoveryObserveTicks = 0;
    const helmModesSeen = [];

    const totalTicks = SETTLE_TICKS + POST_TICKS + 8;
    host.step(totalTicks, {
      before: ({ state }) => {
        const awaitingEvent = eventTick == null || eventTick === 'pending';
        const keepEmpty = (source === 'collision' && awaitingEvent)
          || (source === 'well_fling' && awaitingEvent);
        writeNpcIntent(victim, keepEmpty ? emptyIntent() : { moveZ: 1 });
        if (source === 'collision') return;
        if (eventTick != null) return;
        if (state.tick < SETTLE_TICKS) return;
        vBefore = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
        const mag = hullMass * kIntended * cruise.cruiseSpeed;
        if (source === 'gun') {
          const result = deliverProductionGunHit(host, victim, {
            attackerId: player ? player.id : null,
            nx: SHOVE_NX,
            nz: SHOVE_NZ,
            magnitude: mag,
          });
          if (result && result.reason === 'gun has no production combat.routeDamage') {
            deliveryError = result.reason;
            return false;
          }
          angularProduction = !!(result && result.impulseApplied);
          if (!angularProduction) {
            deliveryError = 'gun production damage.applyImpulse did not apply the authored impulse';
            return false;
          }
        } else if (source === 'rope_throw') {
          deliverLinearImpulse(victim, SHOVE_NX, SHOVE_NZ, mag);
          const deltaV = hullMass > 0 ? mag / hullMass : 0;
          authoredDeltaV = deltaV;
          host.withFeatures(() => {
            host.bus.emit('massline:throw', { payloadId: victim.id, payloadSpeed: deltaV });
          });
        } else if (source === 'well_fling') {
          const fieldsSys = host.runtime.getSystem('fields');
          if (!fieldsSys || !fieldsSys._kernel || typeof fieldsSys._kernel.register !== 'function') {
            deliveryError = 'well_fling has no production fields kernel on the real path';
            return false;
          }
          const durationS = Math.max(2 / 60, (kIntended * cruise.cruiseSpeed) / 105);
          const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
          const def = FIELD_DEFS.well;
          fieldsSys._kernel.register({
            id: `hitstun_well_${victim.id}`,
            kind: FIELD_KINDS.WELL,
            center: { x: VICTIM_POS.x + 50, z: VICTIM_POS.z },
            radius: def.radius,
            strength: def.strength,
            falloff: def.falloff,
            durationS,
            createdAt: now,
            ownerId: player ? player.id : null,
          });
        } else {
          deliveryError = `${source} has no production delivery in this instrument`;
          return false;
        }
        eventTick = 'pending';
      },
      after: ({ state }) => {
        const tick = state.tick | 0;
        const tel = readPhysicsTelemetry(victim);
        const torqueMag = tel && tel.torque
          ? Math.hypot(finite(tel.torque.x), finite(tel.torque.y), finite(tel.torque.z))
          : 0;

        if (source === 'collision' && eventTick == null && impacts.length === 0) {
          vBefore = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
        } else if (source === 'collision' && eventTick == null && impacts.length > 0) {
          eventTick = tick;
          if (asteroid && asteroid.pos) {
            asteroid.collides = false;
            asteroid.pos.x = VICTIM_POS.x + 8000;
            asteroid.pos.z = VICTIM_POS.z + 8000;
          }
        } else if (source === 'well_fling' && eventTick === 'pending') {
          if (selectCausalHitstunEvent(hitstunEvents, { victimId: victim.id, source })) {
            eventTick = tick;
            vAfter = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
          }
        } else if (eventTick === 'pending') {
          eventTick = tick;
          vAfter = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
        }

        if (source === 'collision' && eventTick != null && vAfter == null) {
          if (tick >= eventTick + COLLISION_SETTLE_AFTER_IMPACT_TICKS) {
            vAfter = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
          }
        }

        if (eventTick != null && eventTick !== 'pending') {
          const sinceEvent = tick - eventTick;
          if (sinceEvent >= 1 && sinceEvent <= SPIN_WINDOW_TICKS) {
            const spin = Math.abs(finite(victim.angVel, 0));
            if (spin > peakSpin) peakSpin = spin;
          }
          if (sinceEvent >= 0) {
            const tumbling = readTumbleStatus(host.state, victim) != null;
            if (!helmRecovered) {
              if (tumbling) {
                helmLossTicks += 1;
                recordHelmModeNames(helmEvents, helmModesSeen);
                if (torqueMag > peakTorqueHelmLoss) peakTorqueHelmLoss = torqueMag;
                if (torqueMag <= 1e-4) zeroTorqueHelmLossTicks += 1;
                if (sinceEvent >= 1) {
                  const spinSigned = finite(victim.angVel, 0);
                  const ty = tel && tel.torque ? finite(tel.torque.y) : 0;
                  if (Math.abs(spinSigned) >= 1e-4 && ty * spinSigned < 0) {
                    recoveryOpposesSpin = true;
                    recoveryTorqueObserved = true;
                    const mag = Math.abs(ty);
                    if (mag > peakTorqueRecovery) peakTorqueRecovery = mag;
                  }
                }
              } else if (sinceEvent > 0) {
                helmRecovered = true;
                recoveredAtTick = tick;
              }
            } else {
              recoveryObserveTicks += 1;
            }
          }

          const collisionNeedsSettle = source === 'collision' && vAfter == null;
          if (
            !collisionNeedsSettle
            && helmRecovered
            && recoveryObserveTicks >= RECOVERY_OBSERVE_TICKS
            && sinceEvent >= SPIN_WINDOW_TICKS
          ) {
            return false;
          }
        }
      },
    });

    const telEnd = readPhysicsTelemetry(victim);
    if (telEnd == null) {
      return unmeasuredCell(cellBase, proof, 'bodyless at end of run');
    }

    if (deliveryError) {
      return unmeasuredCell(cellBase, proof, deliveryError);
    }

    if (eventTick == null || eventTick === 'pending') {
      return unmeasuredCell(cellBase, proof, source === 'collision' ? 'no contact in the window' : 'event did not fire');
    }

    if (!vAfter) {
      vAfter = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
    }

    const dVx = vAfter.x - vBefore.x;
    const dVz = vAfter.z - vBefore.z;
    const observedDeltaV = Math.hypot(dVx, dVz);
    const published = selectCausalHitstunEvent(hitstunEvents, { victimId: victim.id, source });
    const deltaV = published && Number.isFinite(published.deltaV) && published.deltaV > 0
      ? published.deltaV
      : (authoredDeltaV > 0 ? authoredDeltaV : observedDeltaV);
    const attackerMassForU = published && Number.isFinite(published.attackerMass) && published.attackerMass > 0
      ? published.attackerMass
      : finite(player && player.mass, 1);
    const worldBody = !!(published && published.worldBody);
    const mFMeasured = worldBody
      ? hitstunMassFactor(attackerMassForU, hullMass, { min: 0 })
      : clamp(Math.sqrt(Math.max(0.1, hullMass > 0 ? attackerMassForU / hullMass : 0)), MF_MIN, MF_MAX);
    const k = cruise.cruiseSpeed > 0 ? deltaV / cruise.cruiseSpeed : 0;
    const u = k * mFMeasured;
    const windowEvents = eventsInHelmWindow(helmEvents, eventTick, helmLossTicks);
    const helmOwner = resolveHelmOwner(windowEvents);
    helmModesSeen.length = 0;
    recordHelmModeNames(windowEvents, helmModesSeen);

    if (eventTrace.length < 400) {
      eventTrace.push({
        tick: eventTick,
        simTime: eventTick / 60,
        type: 'hitstun:event',
        source,
        hullId,
        kIntended,
        k,
        helmLossDurationS: helmLossTicks / 60,
        helmOwner,
        entrySpinRadPerS: peakSpin,
        peakTorque: recoveryTorqueObserved ? peakTorqueRecovery : peakTorqueHelmLoss,
      });
    }

    return {
      ...cellBase,
      mF: mFMeasured,
      massRatio: hullMass > 0 ? attackerMassForU / hullMass : 0,
      k,
      u,
      deltaV,
      helmLossDurationS: helmLossTicks / 60,
      entrySpinRadPerS: peakSpin,
      helmModes: helmModesSeen.slice(),
      helmOwner,
      recoveredAtTick,
      recoveryObserved: helmRecovered,
      recoveryTorqueObserved,
      recoveryOpposesSpin,
      angularProduction,
      peakTorqueHelmLoss,
      peakTorqueRecovery: recoveryTorqueObserved ? peakTorqueRecovery : null,
      peakTorque: recoveryTorqueObserved ? peakTorqueRecovery : peakTorqueHelmLoss,
      zeroTorqueDurationS: zeroTorqueHelmLossTicks / 60,
      zeroTorqueRecoveryS: helmRecovered ? zeroTorqueRecoveryTicks / 60 : null,
      measured: true,
      realPathProof: proof,
    };
  } finally {
    FIELD_FLAGS.enabled = prevFieldEnabled;
    host.dispose();
  }
}

function unmeasuredCell(base, proof, reason) {
  return {
    ...base,
    k: NaN,
    deltaV: NaN,
    helmLossDurationS: NaN,
    entrySpinRadPerS: NaN,
    helmModes: [],
    helmOwner: 'none',
    recoveredAtTick: null,
    recoveryObserved: false,
    angularProduction: false,
    peakTorqueHelmLoss: NaN,
    peakTorqueRecovery: NaN,
    peakTorque: NaN,
    zeroTorqueDurationS: NaN,
    zeroTorqueRecoveryS: NaN,
    measured: false,
    unmeasured: true,
    unmeasuredReason: reason,
    realPathProof: proof,
  };
}

function readFlagsOff(runtime) {
  const features = runtime && runtime.config && runtime.config.features;
  const impulse = !!(features && features.combat && features.combat.weaponImpulseConsequences);
  if (impulse) return null;
  return 'STOP: production feel flags off at run time (combat.weaponImpulseConsequences). This is a headline finding, not something to patch.';
}

export function readCruiseSpeed(entity) {
  const derived = entity && entity.data && entity.data.derived;
  const combatSpeed = derived && derived.propulsion && derived.propulsion.combatSpeed;
  if (Number.isFinite(combatSpeed) && combatSpeed > 0) {
    return { cruiseSpeed: combatSpeed, cruiseField: 'data.derived.propulsion.combatSpeed' };
  }
  const profile = resolveFlightProfile(entity);
  const fallback = profile && Number.isFinite(profile.maxSpeed) ? profile.maxSpeed : 0;
  return { cruiseSpeed: fallback, cruiseField: 'resolveFlightProfile.maxSpeed' };
}

export function emptyIntent() {
  return { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, fire: false };
}

export function writeNpcIntent(entity, input = {}) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  const intent = data.intent || (data.intent = emptyIntent());
  intent.moveX = axis(input.moveX);
  intent.moveZ = axis(input.moveZ);
  intent.turnIntent = axis(input.turnIntent);
  intent.boost = !!input.boost;
  intent.brake = !!input.brake;
  intent.fire = !!input.fire;
}

export function deliverLinearImpulse(entity, nx, nz, magnitude) {
  return queuePhysicsImpulse(entity, { x: nx * magnitude, y: 0, z: nz * magnitude });
}

export function deliverGunHit(victim, {
  attackerId,
  tick,
  nx,
  nz,
  magnitude,
  weaponId = GUN_WEAPON_ID,
  tag = GUN_PROVENANCE_TAG,
} = {}) {
  deliverLinearImpulse(victim, nx, nz, magnitude);
  return recordImpulseProvenance(victim, {
    actorId: attackerId == null ? null : attackerId,
    weaponId,
    tag,
    appliedTick: tick,
    magnitude,
  });
}

export function deliverProductionGunHit(host, victim, {
  attackerId = null,
  nx = SHOVE_NX,
  nz = SHOVE_NZ,
  magnitude,
  weaponId = GUN_WEAPON_ID,
  tag = GUN_PROVENANCE_TAG,
} = {}) {
  const combatSys = host && host.runtime && host.runtime.getSystem
    ? host.runtime.getSystem('combat')
    : null;
  const kernel = combatSys && combatSys.kernel;
  if (!kernel || typeof kernel.routeDamage !== 'function') {
    return { ok: false, reason: 'gun has no production combat.routeDamage', impulseApplied: false };
  }
  const mag = finite(magnitude);
  const vx = finite(victim && victim.pos && victim.pos.x);
  const vz = finite(victim && victim.pos && victim.pos.z);
  const apply = () => kernel.routeDamage({
    attackerId,
    targetId: victim.id,
    packet: {
      channels: { kinetic: 1 },
      impulse: { x: nx * mag, z: nz * mag },
      tumbleTorque: 0,
      hit: {
        pos: {
          x: vx,
          z: vz + Math.max(4, (victim.radius || 8) * 0.75),
        },
        approach: { x: nx, z: nz },
      },
      source: {
        kind: 'weapon',
        weaponId,
        impulseProvenance: tag,
      },
    },
    origin: { kind: 'weapon', id: weaponId, weaponId },
  });
  return typeof host.withFeatures === 'function' ? host.withFeatures(apply) : apply();
}

export function driveNotAnswering(entity, telemetry) {
  const tel = telemetry || readPhysicsTelemetry(entity);
  if (!tel || !tel.force) return true;
  const forceMag = Math.hypot(finite(tel.force.x), finite(tel.force.z));
  const auth = tel.authority || measureThrusterAuthority(entity);
  const authScale = auth && Number.isFinite(auth.forward) ? Math.max(auth.forward, 1e-9) : 1;
  return forceMag < 0.02 * authScale || forceMag < 1e-3;
}

export function subscribeHelmEvents(bus, victimId, out, getTick) {
  if (!bus || typeof bus.on !== 'function') return out;
  const now = () => (typeof getTick === 'function' ? getTick() : 0);
  bus.on('combat:tumbled', (payload) => {
    if (!payload || payload.victimId !== victimId) return;
    out.push({
      type: 'combat:tumbled',
      tick: Number.isFinite(payload.tick) ? payload.tick : now(),
      control: payload.cause || payload.source,
      spin: payload.spin,
    });
  });
  bus.on('massline:tumbled', (payload) => {
    if (!payload || payload.victimId !== victimId) return;
    out.push({
      type: 'massline:tumbled',
      tick: Number.isFinite(payload.tick) ? payload.tick : now(),
      control: payload.cause,
      spin: payload.spin,
    });
  });
  bus.on('massline:tumbleEnd', (payload) => {
    if (!payload || payload.victimId !== victimId) return;
    out.push({ type: 'massline:tumbleEnd', tick: now(), durationS: payload.durationS });
  });
  bus.on('combat:collisionConsequence', (payload) => {
    if (!payload || payload.targetId !== victimId) return;
    out.push({
      type: 'combat:collisionConsequence',
      tick: Number.isFinite(payload.tick) ? payload.tick : now(),
      control: payload.control,
      staggerTicks: payload.staggerTicks,
      deltaV: payload.deltaV,
    });
  });
  return out;
}

function eventsInHelmWindow(events, eventTick, helmLossTicks) {
  if (eventTick == null || eventTick === 'pending') return [];
  const start = eventTick - 1;
  const end = eventTick + Math.max(1, helmLossTicks) + 1;
  return events.filter((ev) => {
    const t = Number(ev && ev.tick);
    if (!Number.isFinite(t)) return true;
    return t >= start && t <= end;
  });
}

function resolveHelmOwner(events) {
  for (const ev of events) {
    if (ev.type === 'combat:tumbled' || ev.type === 'massline:tumbled' || ev.type === 'combat:collisionConsequence') {
      return ev.type;
    }
  }
  return 'none';
}

function recordHelmModeNames(events, into) {
  for (const ev of events) {
    if (!into.includes(ev.type)) into.push(ev.type);
  }
}

function unmeasuredBar(label, unit, note) {
  const text = String(note || '');
  return {
    bar: 'B11',
    label,
    value: null,
    unit,
    met: false,
    unmeasured: true,
    note: text.startsWith('UNMEASURED') ? text : `UNMEASURED — ${text}`,
  };
}

function inMatchedKBand(k) {
  return Number.isFinite(k) && k >= MATCHED_K_BAND.lo && k <= MATCHED_K_BAND.hi;
}

function recoveryTorqueMeasured(cell) {
  return !!(cell && cell.recoveryTorqueObserved === true
    && Number.isFinite(cell.peakTorqueRecovery)
    && cell.peakTorqueRecovery > TORQUE_RECOVERY_MIN);
}

/**
 * Public bar-builder seam. Missing sources/hulls/recovery/spin fail closed as unmeasured;
 * notes come from the cells, never from hardcoded claims about unrun sources.
 */
export function buildB11Bars(cells, notes) {
  const bars = [];
  const measured = (cells || []).filter((c) => c && c.measured === true && Number.isFinite(c.k));
  const extraNotes = Array.isArray(notes) ? notes.slice() : [];

  for (const source of HITSTUN_SOURCES) {
    const light = measured.filter((c) => c.source === source && c.hullId === 'ship_wasp' && c.k >= LIGHT_HELM_K);
    const label = `light hull loses the helm >= 1 s at measured k >= ${LIGHT_HELM_K} - ${source}`;
    if (!light.length) {
      bars.push(unmeasuredBar(label, 's', `no light-hull ${source} cell at measured k >= ${LIGHT_HELM_K}`));
      continue;
    }
    let worst = Infinity;
    for (const c of light) if (c.helmLossDurationS < worst) worst = c.helmLossDurationS;
    bars.push({
      bar: 'B11',
      label,
      value: worst,
      unit: 's',
      met: worst >= 1.0,
    });
  }

  const heavyLabel = `heavy hull at gun-scale delta-V never loses the helm (measured k <= ${HEAVY_GUN_SCALE_K}, all sources)`;
  const missingHeavySources = [];
  const heavyGunScale = [];
  for (const source of HITSTUN_SOURCES) {
    const picks = measured.filter((c) => c.source === source && c.hullId === 'ship_atlas' && c.k <= HEAVY_GUN_SCALE_K);
    if (!picks.length) {
      missingHeavySources.push(source);
      continue;
    }
    for (const c of picks) heavyGunScale.push(c);
  }
  if (missingHeavySources.length) {
    bars.push(unmeasuredBar(
      heavyLabel,
      's',
      `missing heavy-hull low-k cells for ${missingHeavySources.join(', ')} (need one measured ship_atlas cell at k <= ${HEAVY_GUN_SCALE_K} per source)`,
    ));
  } else {
    let worst = -Infinity;
    for (const c of heavyGunScale) if (c.helmLossDurationS > worst) worst = c.helmLossDurationS;
    bars.push({
      bar: 'B11',
      label: heavyLabel,
      value: worst,
      unit: 's',
      met: worst === 0,
    });
  }

  const oneLawLabel = `one law: relative spread of helm-loss across ${HITSTUN_SOURCES.join(', ')} (light hull, measured u in [${MATCHED_U_BAND.lo}, ${MATCHED_U_BAND.hi}])`;
  const matched = [];
  const missingMatched = [];
  for (const source of HITSTUN_SOURCES) {
    const pick = pickMatchedLightCell(measured, source);
    if (pick) matched.push(pick);
    else missingMatched.push(source);
  }
  if (missingMatched.length) {
    bars.push(unmeasuredBar(
      oneLawLabel,
      'fraction',
      `missing matched-u light cells for ${missingMatched.join(', ')} (measured u must lie in [${MATCHED_U_BAND.lo}, ${MATCHED_U_BAND.hi}])`,
    ));
  } else {
    let minS = Infinity;
    let maxS = -Infinity;
    for (const c of matched) {
      if (c.helmLossDurationS < minS) minS = c.helmLossDurationS;
      if (c.helmLossDurationS > maxS) maxS = c.helmLossDurationS;
    }
    const spread = maxS > 0 ? (maxS - minS) / maxS : 0;
    const reality = matched.map((c) => `${c.source} u=${round4(cellU(c))} ${round4(c.helmLossDurationS)}s`).join(', ');
    bars.push({
      bar: 'B11',
      label: oneLawLabel,
      value: spread,
      unit: 'fraction',
      met: spread <= 0.10,
      note: reality,
    });
  }

  const monotoneLabel = 'helm-loss is monotone non-decreasing in k (light hull, gun source)';
  const gunLight = measured
    .filter((c) => c.source === 'gun' && c.hullId === 'ship_wasp')
    .slice()
    .sort((a, b) => a.k - b.k);
  if (gunLight.length < 2) {
    bars.push(unmeasuredBar(monotoneLabel, 'bool', 'need at least two measured light-hull gun cells'));
  } else {
    let monotone = 1;
    for (let i = 1; i < gunLight.length; i++) {
      if (gunLight[i].helmLossDurationS + 1e-9 < gunLight[i - 1].helmLossDurationS) {
        monotone = 0;
        break;
      }
    }
    bars.push({
      bar: 'B11',
      label: monotoneLabel,
      value: monotone,
      unit: 'bool',
      met: monotone === 1,
    });
  }

  const massLabel = 'mass-ratio scaling: helm-loss strictly ordered by mass at matched measured k (gun source: wasp > drifter > atlas)';
  const gunInBand = measured.filter((c) => c.source === 'gun' && inMatchedKBand(c.k));
  const waspGun = pickClosestToTargetK(gunInBand.filter((c) => c.hullId === 'ship_wasp'));
  const drifterGun = pickClosestToTargetK(gunInBand.filter((c) => c.hullId === 'ship_drifter'));
  const atlasGun = pickClosestToTargetK(gunInBand.filter((c) => c.hullId === 'ship_atlas'));
  const missingHulls = HITSTUN_HULLS.filter((hullId) => {
    if (hullId === 'ship_wasp') return !waspGun;
    if (hullId === 'ship_drifter') return !drifterGun;
    return !atlasGun;
  });
  if (missingHulls.length) {
    bars.push(unmeasuredBar(
      massLabel,
      's',
      `need all three hulls in measured-k band [${MATCHED_K_BAND.lo}, ${MATCHED_K_BAND.hi}]; missing ${missingHulls.join(', ')}`,
    ));
  } else {
    const diffS = waspGun.helmLossDurationS - atlasGun.helmLossDurationS;
    const ordered = waspGun.helmLossDurationS > drifterGun.helmLossDurationS
      && drifterGun.helmLossDurationS > atlasGun.helmLossDurationS;
    const reality = `${waspGun.hullId} k=${round4(waspGun.k)} (${waspGun.hullMass}) ${round4(waspGun.helmLossDurationS)}s, `
      + `${drifterGun.hullId} k=${round4(drifterGun.k)} (${drifterGun.hullMass}) ${round4(drifterGun.helmLossDurationS)}s, `
      + `${atlasGun.hullId} k=${round4(atlasGun.k)} (${atlasGun.hullMass}) ${round4(atlasGun.helmLossDurationS)}s`;
    bars.push({
      bar: 'B11',
      label: massLabel,
      value: round4(diffS),
      unit: 's',
      met: ordered && diffS > 0,
      note: reality,
    });
  }

  const gyroLabel = `never a hidden gyro: ${HITSTUN_SOURCES.join(', ')} recover with commanded thruster torque when entry spin is measurable (light hull, measured u in [${MATCHED_U_BAND.lo}, ${MATCHED_U_BAND.hi}])`;
  const gyroNotes = [];
  let gyroUnmeasured = false;
  let gyroFail = false;
  let spinningJudged = 0;
  let spinningWithTorque = 0;
  for (const source of HITSTUN_SOURCES) {
    const pick = pickMatchedLightCell(measured, source);
    if (!pick) {
      gyroUnmeasured = true;
      gyroNotes.push(`${source} missing matched-u light cell`);
      continue;
    }
    if (source === 'gun' && pick.angularProduction !== true) {
      gyroUnmeasured = true;
      gyroNotes.push('gun angular consequence did not traverse the production damage/impulse path with real hit geometry and damage-fraction scaling');
      continue;
    }
    const spin = finite(pick.entrySpinRadPerS, 0);
    if (spin < MEASURABLE_SPIN_RAD_PER_S) {
      gyroNotes.push(`${source} entrySpin ${round4(spin)} rad/s below ${MEASURABLE_SPIN_RAD_PER_S} (zero recovery torque is not a hidden gyro)`);
      continue;
    }
    if (!recoveryTorqueMeasured(pick)) {
      gyroUnmeasured = true;
      gyroNotes.push(`${source} recovery torque unmeasured (entry torque is not recovery; helm loss outlasted the window or recovery was never observed)`);
      continue;
    }
    const torque = finite(pick.peakTorqueRecovery, 0);
    spinningJudged += 1;
    if (pick.recoveryOpposesSpin === false) {
      gyroFail = true;
      gyroNotes.push(`${source} spin ${round4(spin)} rad/s recovery ${round4(torque)} Nm did not oppose angular velocity`);
    } else if (torque > TORQUE_RECOVERY_MIN) {
      spinningWithTorque += 1;
      gyroNotes.push(`${source} spin ${round4(spin)} rad/s recovery ${round4(torque)} Nm opposing spin`);
    } else {
      gyroFail = true;
      gyroNotes.push(`${source} spin ${round4(spin)} rad/s recovery ${round4(torque)} Nm (no commanded recovery torque after entry)`);
    }
  }
  const gyroNote = gyroNotes.join('; ') || 'gyro clause could not be asked';
  if (gyroUnmeasured || spinningJudged === 0) {
    bars.push(unmeasuredBar(gyroLabel, 'fraction', gyroNote));
  } else {
    bars.push({
      bar: 'B11',
      label: gyroLabel,
      value: round4(spinningWithTorque / spinningJudged),
      unit: 'fraction',
      met: !gyroFail && spinningWithTorque === spinningJudged,
      note: gyroNote,
    });
  }

  if (extraNotes.length && bars[0]) {
    bars[0].note = [bars[0].note, ...extraNotes].filter(Boolean).join(' | ');
  }
  return bars;
}

function pickClosestToTargetK(cells) {
  const list = Array.isArray(cells) ? cells : [];
  if (!list.length) return null;
  let best = list[0];
  let bestDist = Math.abs(list[0].k - MATCHED_K_BAND.target);
  for (let i = 1; i < list.length; i++) {
    const dist = Math.abs(list[i].k - MATCHED_K_BAND.target);
    if (dist < bestDist) {
      best = list[i];
      bestDist = dist;
    }
  }
  return best;
}

function pickClosestToTargetU(cells) {
  const list = Array.isArray(cells) ? cells : [];
  if (!list.length) return null;
  let best = list[0];
  let bestDist = Math.abs(cellU(list[0]) - MATCHED_U_BAND.target);
  for (let i = 1; i < list.length; i++) {
    const dist = Math.abs(cellU(list[i]) - MATCHED_U_BAND.target);
    if (dist < bestDist) {
      best = list[i];
      bestDist = dist;
    }
  }
  return best;
}

function pickMatchedLightCell(measured, source) {
  return pickClosestToTargetU(
    measured.filter((c) => c.source === source && c.hullId === 'ship_wasp' && inMatchedUBand(cellU(c))),
  );
}

function cellU(cell) {
  if (cell && Number.isFinite(cell.u)) return cell.u;
  if (cell && Number.isFinite(cell.k) && Number.isFinite(cell.mF) && cell.mF > 0) return cell.k * cell.mF;
  return cell && Number.isFinite(cell.k) ? cell.k : NaN;
}

function inMatchedUBand(u) {
  return Number.isFinite(u) && u >= MATCHED_U_BAND.lo && u <= MATCHED_U_BAND.hi;
}

function axis(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round4(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 1e4) / 1e4;
}
