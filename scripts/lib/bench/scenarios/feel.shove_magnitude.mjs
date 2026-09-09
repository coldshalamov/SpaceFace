// B4 / B5 / B11 shove magnitude — the real-path replacement for the inline stand-in.
//
// THE REAL-PATH LAW: "A scenario that integrates its own physics is not a measurement."
// The old inline feel.shove_magnitude divided a hard-coded 420 by mass 14, hard-coded cruise
// 195 and helmLossDurationS 1.5, and integrated a straight line. This module boots the live
// rapier-dynamic authority and measures the concussion-cannon hit the player actually fires.
//
// Vision: "Shoot weapons where it'd blast enemies away and into things."
// "Light ships are ammunition." "He becomes a projectile."
//
// WHY delta-V IS DIFFERENCED AGAINST A CONTROL ARM (FORCE lane, 2026-09-04, measured):
// the raw one-tick velocity change of the victim is NOT the shove. A wasp under thrust changes its
// own velocity by ~3 WU/s in the tick of the hit. The old concussion-only recovery beat made that
// weapon's raw tick delta accidentally equal the impulse; every other gun's raw tick included the
// victim's own thrust. PQ-137.04 retired the beat into the universal law, so the raw tick of every
// source now includes thrust. Every delta-V a bar consumes here is (velocity WITH the hit) minus
// (velocity WITHOUT it) at the same tick of an otherwise identical control run: the change the hit
// caused. The Vector Mine centre-hit and the two-second held-Pulse arms use the same subtraction.
// Held-Pulse accuracy counts only shipped fire/projectile/damage hits — never a scripted impulse.
//
// REVIEWER'S OBJECTION (agy Gemini 3.8, 2026-09-04) AND WHY THE DIFFERENCE STANDS. The objection:
// for the concussion cannon the beat already zeroed the victim's thrust, so its raw tick delta was
// ALREADY the exact impulse (26.25 = 420/16), and differencing a thrusting control arm out of a
// non-thrusting shove arm turns an exact number into 26.232. True as arithmetic - and it is exactly
// why the raw number cannot be the bar. The raw delta equals the impulse for ONE weapon, by the
// accident that that weapon authors a beat; retire the beat in PQ-137.04 and the same raw delta
// becomes 26.43 (impulse + thrust), a 0.7 % move caused by the law, not by the weapon. The causal
// difference reads 26.232 today and 26.25 after the beat is retired - a 0.07 % move - because when
// both arms thrust equally the thrust cancels exactly. The stable, weapon-attributable number is
// the differenced one. Both are published: `deltaV` is causal, `impulseDeltaV` is impulse/mass,
// `deltaVRawTick` is the uncorrected tick delta. Nothing is hidden.

import { resolveWeaponImpulseForHit } from '../../../../src/combat/impulseKernel.js';
import { readPhysicsTelemetry } from '../../../../src/core/physicsAuthority.js';
import { WEAPONS } from '../../../../src/data/weapons.js';
import { makeEnemySpawnSpec } from '../../../../src/systems/combat.js';
import { fittingsFromDefaultModules } from '../../../../src/systems/ships.js';
import { bootRealPath, writeRealPathInput } from '../realPath.mjs';
import {
  CURVE_SYSTEMS,
  GUN_PROVENANCE_TAG,
  GUN_WEAPON_ID,
  SCREEN_DEPTH_WU,
  SHOVE_SYSTEMS,
  deliverProductionGunHit,
  driveNotAnswering,
  emptyIntent,
  readCruiseSpeed,
  subscribeHelmEvents,
  writeNpcIntent,
} from './feel.hitstun_curve.mjs';

const FLY_TICKS = 60;
const POST_TICKS = 120;
// B4's third clause is about a hostile ALREADY AT CRUISE. Spawning one at cruise does not establish
// that premise: measured 2026-09-04, an AI hostile flying an attack run is down to 49.6 WU/s - 24 %
// of a wasp's 210 - by the time the hit lands 60 ticks later, and the governor that the clause
// exists to interrogate is nowhere near being in play. The along-motion arm therefore flies STRAIGHT
// (no tacticalAI) under its own thrust and does not take the hit until it has actually reached
// cruise. If it never does, the clause reports unmet with the fraction it reached, rather than
// scoring a pass on a premise it never set up.
const SPINUP_TICK_CAP = 900;
const AT_CRUISE_FRACTION = 0.9;
const SPIN_WINDOW_TICKS = 10;
const HOSTILE_POS = Object.freeze({ x: -400, z: 0 });
const PULSE_WEAPON_ID = 'wpn_pulse_laser_s';
const MINE_WEAPON_ID = 'wpn_vector_mine_m';
const PULSE_HOLD_TICKS = 120;
const PULSE_FLIGHT_TICKS = 36;
const PULSE_STANDOFF = 150;
// Rapier velocity integration is Float32; retain raw numbers and tolerate only its boundary noise.
const IMPULSE_FRACTION_EPSILON = 1e-7;

export const scenario = {
  id: 'feel.shove_magnitude',
  label: 'B4/B5 Shove Weapon Impulse & Displacement',
  async run(seed) {
    const notes = [];
    const eventTrace = [];

    const main = await runShoveArm(seed, {
      weaponId: GUN_WEAPON_ID,
      direction: 'perp',
      tag: 'main',
      eventTrace,
    });

    const starter = await runShoveArm(seed, {
      weaponId: PULSE_WEAPON_ID,
      direction: 'perp',
      tag: 'starter',
      eventTrace,
    });

    const along = await runShoveArm(seed, {
      weaponId: GUN_WEAPON_ID,
      direction: 'along',
      tag: 'along',
      eventTrace,
      straightFlight: true,
    });

    const control = await runShoveArm(seed, {
      weaponId: null,
      direction: 'perp',
      tag: 'control',
      eventTrace,
    });

    const mine = await runMineArm(seed, { fire: true, tag: 'mine', eventTrace });
    const mineControl = await runMineArm(seed, { fire: false, tag: 'mineControl', eventTrace, sampleTick: mine.eventTick });
    const pulse = await runPulseArm(seed, { fire: true, tag: 'pulseHeld', eventTrace });
    const pulseControl = await runPulseArm(seed, { fire: false, tag: 'pulseControl', eventTrace });

    // The change the HIT caused: (velocity with the hit) - (velocity without it), same tick, same
    // seed, otherwise identical run. See the header note - the raw tick delta is the victim's own
    // thrust plus the shove, and the universal law no longer silences that thrust for one weapon.
    const mainHit = causalDeltaV(main, control, notes, 'shove weapon');
    const starterHit = causalDeltaV(starter, control, notes, 'starter gun');
    const mineHit = causalDeltaV(mine, mineControl, notes, 'vector mine');
    const pulseHit = causalDeltaV(pulse, pulseControl, notes, 'held pulse');
    const cruiseSpeed = main && Number.isFinite(main.cruiseSpeed) ? main.cruiseSpeed : 0;
    const mainFraction = cruiseSpeed > 0 && Number.isFinite(mainHit) ? mainHit / cruiseSpeed : null;
    const starterFraction = starter && Number.isFinite(starter.cruiseSpeed) && starter.cruiseSpeed > 0
      && Number.isFinite(starterHit)
      ? starterHit / starter.cruiseSpeed
      : null;
    const mineCruise = mine && Number.isFinite(mine.cruiseSpeed) ? mine.cruiseSpeed : 0;
    const mineFraction = mineCruise > 0 && Number.isFinite(mineHit) ? mineHit / mineCruise : null;
    const pulseCruise = pulse && Number.isFinite(pulse.cruiseSpeed) ? pulse.cruiseSpeed : 0;
    const pulseFraction = pulseCruise > 0 && Number.isFinite(pulseHit) ? pulseHit / pulseCruise : null;

    const bars = [];
    if (starter && starter.measured && Number.isFinite(starterHit)) {
      bars.push({
        bar: 'B4',
        label: 'starter gun delta-V, fraction of light-hostile cruise',
        value: starterFraction,
        unit: 'fraction',
        met: starterFraction >= 0.05 - IMPULSE_FRACTION_EPSILON,
        note: `caused by the hit; raw one-tick delta was ${round6(starter.rawTickDeltaV)} WU/s, of which ${round6(control && control.rawTickDeltaV)} WU/s is the victim's own thrust`,
      });
    }
    if (along && along.measured && Number.isFinite(along.speedRatio)) {
      // The premise is half the clause: a ratio above 1 proves nothing about the governor if the
      // victim was not at cruise when it was hit.
      const atCruise = along.speedBeforeFractionOfCruise >= AT_CRUISE_FRACTION;
      if (!atCruise) {
        notes.push(`the at-cruise clause of B4 is NOT tested: the victim was at ${round6(along.speedBeforeFractionOfCruise)} of cruise (${round6(along.speedBefore)} WU/s) when the shove landed.`);
      }
      bars.push({
        bar: 'B4',
        label: 'light hostile AT CRUISE shoved ALONG its motion gets faster (speed after / speed before)',
        value: along.speedRatio,
        unit: 'ratio',
        met: atCruise && along.speedRatio > 1.0,
        note: `victim was at ${round6(along.speedBeforeFractionOfCruise)} of cruise when hit${atCruise ? '' : ' - premise not established, so this clause cannot pass'}`,
      });
    }

    if (main && main.measured && Number.isFinite(mainHit) && Number.isFinite(main.screenDepths)) {
      bars.push({
        bar: 'B4',
        label: 'shove weapon delta-V, fraction of light-hostile cruise',
        value: mainFraction,
        unit: 'fraction',
        met: mainFraction >= 0.30 - IMPULSE_FRACTION_EPSILON,
      });
      bars.push({
        bar: 'B5',
        label: 'displacement 2 s after the shove-weapon hit, screen depths',
        value: main.screenDepths,
        unit: 'screen depths',
        met: main.screenDepths >= 1.0,
      });
    }
    if (mine && mine.measured && Number.isFinite(mineHit) && Number.isFinite(mineFraction)) {
      bars.push({
        bar: 'B4',
        label: 'vector mine centre-hit delta-V, fraction of light-hostile cruise',
        value: mineFraction,
        unit: 'fraction',
        met: mineFraction >= 0.45 - IMPULSE_FRACTION_EPSILON,
      });
    }

    const controlShots = control && Number.isFinite(control.victimShots) ? control.victimShots : 0;
    if (controlShots < 1) {
      notes.push('the has-not-fired clause is uninstrumented: the hostile does not fire in the control arm either.');
    } else if (main && main.measured) {
      const silent = main.victimShots === 0 ? 1 : 0;
      bars.push({
        bar: 'B5',
        label: 'victim has not fired within 2 s of the shove-weapon hit',
        value: silent,
        unit: 'bool',
        met: silent === 1,
      });
    }

    if (main && main.flagsOff) notes.push(main.flagsOff);
    if (main && main.unmeasuredReason) notes.push(main.unmeasuredReason);
    if (mine && mine.unmeasuredReason) notes.push(`vector mine: ${mine.unmeasuredReason}`);
    if (pulse && pulse.unmeasuredReason) notes.push(`held pulse: ${pulse.unmeasuredReason}`);
    if (pulse && pulse.measured) {
      notes.push(
        `held pulse 2 s: attempted ${pulse.attemptedShots} shots, landed ${pulse.landedHits} hits`
        + ` (${round6(pulse.hitFraction)}), causal ΔV ${round6(pulseHit)} WU/s`
        + ` (${round6(pulseFraction)} of cruise), firing solution viable=${pulse.firingSolutionViable === true}`,
      );
    }

    const pulseHitFraction = pulse && pulse.measured && Number.isFinite(pulse.hitFraction)
      ? pulse.hitFraction
      : null;

    return {
      eventTrace,
      metrics: {
        schema: 'spaceface.feel.shoveMagnitude.v1',
        realPathProof: main && main.realPathProof,
        cruiseField: main && main.cruiseField,
        cruiseSpeed: main ? main.cruiseSpeed : 0,
        deltaV: Number.isFinite(mainHit) ? mainHit : 0,
        deltaVFractionOfCruise: Number.isFinite(mainFraction) ? mainFraction : null,
        starterDeltaV: Number.isFinite(starterHit) ? starterHit : 0,
        starterDeltaVFractionOfCruise: Number.isFinite(starterFraction) ? starterFraction : null,
        mineDeltaV: Number.isFinite(mineHit) ? mineHit : null,
        mineDeltaVFractionOfCruise: Number.isFinite(mineFraction) ? mineFraction : null,
        mineDeltaVRawTick: mine ? mine.rawTickDeltaV : null,
        mineDetonationDistance: mine.measured ? mine.detonationDist : null,
        mineHasSolverBody: mine.measured ? mine.hasSolverBody : null,
        alongSpeedBeforeFractionOfCruise: along && along.measured ? along.speedBeforeFractionOfCruise : null,
        alongSpeedRatio: along && along.measured ? along.speedRatio : null,
        pulseDeltaV: Number.isFinite(pulseHit) ? pulseHit : null,
        pulseDeltaVFractionOfCruise: Number.isFinite(pulseFraction) ? pulseFraction : null,
        pulseAttemptedShots: pulse && pulse.measured ? pulse.attemptedShots : null,
        pulseLandedHits: pulse && pulse.measured ? pulse.landedHits : null,
        pulseHitFraction,
        pulseFiringSolutionViable: pulse && pulse.measured ? pulse.firingSolutionViable === true : null,
        pulseDeltaVRawTick: pulse ? pulse.rawTickDeltaV : null,
        // The momentum the slug carries, divided by the victim's mass: the other honest reading of
        // B4, published beside the causal one so the two can never be confused for each other.
        impulseDeltaV: main && main.victimMass > 0 ? main.impulseMagnitude / main.victimMass : 0,
        impulseDeltaVFractionOfCruise: main && main.victimMass > 0 && cruiseSpeed > 0
          ? main.impulseMagnitude / main.victimMass / cruiseSpeed
          : 0,
        // Raw one-tick deltas, kept so the thrust term stays visible and this correction is auditable.
        deltaVRawTick: main ? main.rawTickDeltaV : 0,
        starterDeltaVRawTick: starter ? starter.rawTickDeltaV : 0,
        controlTickDeltaV: control ? control.rawTickDeltaV : 0,
        screenDepths: main ? main.screenDepths : 0,
        helmLossDurationS: main ? main.helmLossDurationS : 0,
        victimMass: main ? main.victimMass : 0,
        impulseMagnitude: main ? main.impulseMagnitude : 0,
        helmOwner: main ? main.helmOwner : 'none',
        helmModes: main ? main.helmModes : [],
        // NOT entry spin. The victim here is a live AI hostile flying an attack run, so its yaw
        // after the hit is its own steering: measured 2026-09-04 the un-shot control arm peaked
        // HIGHER (6.00 rad/s) than the shot arm (4.27). A central linear impulse imparts no torque.
        // `feel.hitstun_curve`, whose victim flies straight, is the authoritative entry-spin number.
        peakYawRadPerS: main ? main.entrySpinRadPerS : 0,
        controlPeakYawRadPerS: control ? control.entrySpinRadPerS : 0,
        victimShots: main ? main.victimShots : 0,
        controlArmShots: controlShots,
        fireEvent: 'combat:fire',
        notes,
        bars,
      },
    };
  },
};

async function runShoveArm(seed, { weaponId, direction, tag, eventTrace, straightFlight = false }) {
  const host = await bootRealPath({
    seed,
    systems: straightFlight ? [...CURVE_SYSTEMS] : [...SHOVE_SYSTEMS],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, rot: 0, isPlayer: true }],
  });

  try {
    const features = host.runtime && host.runtime.config && host.runtime.config.features;
    const impulseOn = !!(features && features.combat && features.combat.weaponImpulseConsequences);
    const tumbleOn = !!(features && features.massline2 && features.massline2.enabled && features.massline2.tumble);
    if (!impulseOn || !tumbleOn) {
      host.step(1);
      return {
        measured: false,
        flagsOff: `STOP: production feel flags off (${[!impulseOn && 'weaponImpulseConsequences', !tumbleOn && 'massline2.tumble'].filter(Boolean).join(', ')})`,
        realPathProof: host.proof(),
      };
    }

    const player = host.player;
    const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: HOSTILE_POS.x, z: HOSTILE_POS.z }, {
      motive: 'motion_lab',
      engagementTrigger: 'authorized_hostile_spawn',
      zoneId: 'motion_lab',
    });
    spec.rot = 0;
    spec.data = spec.data || {};
    spec.data.ai = spec.data.ai || {};
    spec.data.ai.activity = {
      ...(spec.data.ai.activity || {}),
      kind: 'attack_run',
      reason: 'motion_lab',
      anchor: { x: HOSTILE_POS.x, z: HOSTILE_POS.z },
      leashRadius: 4000,
    };
    spec.data.ai.roe = 'weapons_free';
    spec.data.ai.passive = false;
    spec.data.ai.huntPlayer = true;
    spec.data.ai.forcePlayerTarget = true;
    spec.data.ai.spawnContext = 'zone_hostile';
    spec.data.intent = emptyIntent();
    spec.data.combat = spec.data.combat || {};
    if (host.state.playerId) spec.data.combat.targetId = host.state.playerId;
    const victim = host.runtime.spawn(spec);

    const cruise = readCruiseSpeed(victim);
    victim.vel = victim.vel || { x: 0, z: 0 };
    if (straightFlight) {
      // Earn the speed on the real path instead of asserting it.
      victim.vel.x = 0;
      victim.vel.z = 0;
      writeNpcIntent(victim, { moveZ: 1 });
    } else {
      victim.vel.x = cruise.cruiseSpeed;
      victim.vel.z = 0;
    }

    const helmEvents = [];
    subscribeHelmEvents(host.bus, victim.id, helmEvents, () => host.state.tick | 0);
    let victimShots = 0;
    host.bus.on('combat:fire', (payload) => {
      if (payload && payload.ownerId === victim.id) victimShots += 1;
    });

    host.step(1);
    const proof = host.proof();
    try {
      // SG-02 admits bodies only near the player; a bodiless victim reads dV = 0 forever, which
      // looks exactly like a finding. Report the reason instead of throwing: this module runs
      // inside the shared verb bench and a throw would take all six lanes' run down with it.
      host.assertBodies([victim, host.player], 'feel.shove_magnitude');
    } catch (err) {
      return {
        measured: false,
        unmeasuredReason: String((err && err.message) || err),
        realPathProof: proof,
        cruiseField: cruise.cruiseField,
        cruiseSpeed: cruise.cruiseSpeed,
        victimShots: 0,
      };
    }

    let eventTick = null;
    let pendingEvent = false;
    let deliveryError = null;
    let vBefore = { x: 0, z: 0 };
    let speedBefore = 0;
    let vAfter = null;
    let linePoint = { x: HOSTILE_POS.x, z: HOSTILE_POS.z };
    let lineDir = { x: 1, z: 0 };
    let helmLossTicks = 0;
    let helmRecovered = false;
    let peakSpin = 0;
    let impulseMagnitude = 0;
    let windowShots = 0;
    let shotsAtEvent = 0;
    let endPos = { x: finite(victim.pos && victim.pos.x), z: finite(victim.pos && victim.pos.z) };

    host.step((straightFlight ? SPINUP_TICK_CAP : FLY_TICKS) + POST_TICKS, {
      before: ({ state }) => {
        if (straightFlight) writeNpcIntent(victim, { moveZ: 1 });
        if (pendingEvent || eventTick != null) return;
        if (straightFlight) {
          const speedNow = Math.hypot(finite(victim.vel && victim.vel.x), finite(victim.vel && victim.vel.z));
          const atCruise = cruise.cruiseSpeed > 0 && speedNow >= AT_CRUISE_FRACTION * cruise.cruiseSpeed;
          if (!atCruise && state.tick < SPINUP_TICK_CAP) return;
        } else if (state.tick < FLY_TICKS) return;
        vBefore = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
        speedBefore = Math.hypot(vBefore.x, vBefore.z);
        linePoint = { x: finite(victim.pos && victim.pos.x), z: finite(victim.pos && victim.pos.z) };
        lineDir = speedBefore > 1e-6
          ? { x: vBefore.x / speedBefore, z: vBefore.z / speedBefore }
          : { x: 1, z: 0 };
        if (weaponId) {
          const def = WEAPONS.find((w) => w.id === weaponId);
          const resolved = def ? resolveWeaponImpulseForHit(def, def.dmg) : null;
          impulseMagnitude = resolved && Number.isFinite(resolved.magnitude) ? resolved.magnitude : 0;
          const nx = direction === 'along' ? lineDir.x : -lineDir.z;
          const nz = direction === 'along' ? lineDir.z : lineDir.x;
          const result = deliverProductionGunHit(host, victim, {
            attackerId: player ? player.id : null,
            nx,
            nz,
            magnitude: impulseMagnitude,
            weaponId,
            tag: (resolved && resolved.provenance) || (def && def.impulseProvenance) || GUN_PROVENANCE_TAG,
          });
          if (!result || result.impulseApplied !== true) {
            deliveryError = (result && result.reason) || 'shove production damage.applyImpulse did not apply the authored impulse';
          }
        }
        pendingEvent = true;
        shotsAtEvent = victimShots;
      },
      after: ({ state }) => {
        const tick = state.tick | 0;
        const tel = readPhysicsTelemetry(victim);

        if (pendingEvent && eventTick == null) {
          eventTick = tick;
          vAfter = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
          if (eventTrace.length < 400) {
            eventTrace.push({
              tick,
              simTime: tick / 60,
              type: weaponId ? 'shove:hit' : 'shove:control',
              tag,
              weaponId,
              direction,
            });
          }
        }

        if (eventTick != null) {
          const since = tick - eventTick;
          if (since >= 1 && since <= SPIN_WINDOW_TICKS) {
            const spin = Math.abs(finite(victim.angVel, 0));
            if (spin > peakSpin) peakSpin = spin;
          }
          if (weaponId && since >= 1 && !helmRecovered) {
            if (driveNotAnswering(victim, tel)) helmLossTicks += 1;
            else helmRecovered = true;
          }
          if (since >= POST_TICKS) {
            endPos = { x: finite(victim.pos && victim.pos.x), z: finite(victim.pos && victim.pos.z) };
            windowShots = Math.max(0, victimShots - shotsAtEvent);
          }
        }
      },
    });

    if (readPhysicsTelemetry(victim) == null) {
      return {
        measured: false,
        unmeasuredReason: 'bodyless at end of run',
        realPathProof: proof,
        cruiseField: cruise.cruiseField,
        cruiseSpeed: cruise.cruiseSpeed,
        victimShots: 0,
      };
    }

    if (deliveryError) {
      return {
        measured: false,
        unmeasuredReason: deliveryError,
        realPathProof: proof,
        cruiseField: cruise.cruiseField,
        cruiseSpeed: cruise.cruiseSpeed,
        victimShots: 0,
      };
    }

    if (!vAfter) vAfter = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
    endPos = { x: finite(victim.pos && victim.pos.x), z: finite(victim.pos && victim.pos.z) };
    windowShots = Math.max(0, victimShots - shotsAtEvent);
    const rawTickDeltaV = Math.hypot(vAfter.x - vBefore.x, vAfter.z - vBefore.z);
    const speedAfter = Math.hypot(vAfter.x, vAfter.z);
    const perp = perpendicularDistance(endPos, linePoint, lineDir);
    const windowEnd = (eventTick || 0) + Math.max(1, helmLossTicks) + 1;
    const windowEvents = helmEvents.filter((ev) => {
      const t = Number(ev && ev.tick);
      if (!Number.isFinite(t) || eventTick == null) return false;
      return t >= eventTick && t <= windowEnd;
    });
    const helmModes = uniqueNames(windowEvents);
    const helmOwner = helmOwnerOf(windowEvents);

    return {
      measured: true,
      realPathProof: proof,
      cruiseField: cruise.cruiseField,
      cruiseSpeed: cruise.cruiseSpeed,
      vBefore,
      vAfter,
      rawTickDeltaV,
      screenDepths: perp / SCREEN_DEPTH_WU,
      helmLossDurationS: helmLossTicks / 60,
      victimMass: finite(victim.mass, 0),
      impulseMagnitude,
      helmOwner,
      helmModes,
      entrySpinRadPerS: peakSpin,
      victimShots: windowShots,
      speedRatio: speedBefore > 1e-6 ? speedAfter / speedBefore : NaN,
      speedBefore,
      speedBeforeFractionOfCruise: cruise.cruiseSpeed > 0 ? speedBefore / cruise.cruiseSpeed : 0,
    };
  } finally {
    host.dispose();
  }
}

async function runMineArm(seed, { fire, tag, eventTrace, sampleTick = null }) {
  const host = await bootRealPath({
    seed, systems: CURVE_SYSTEMS.filter((entry) => entry !== 'aiPorts'),
    hulls: [{ hullId: 'ship_hornet', pos: { x: 0, z: 80 }, rot: 0, isPlayer: true,
      fittings: fittingsFromDefaultModules('ship_hornet', [MINE_WEAPON_ID]) }],
  });
  try {
    const flagsOff = readFeelFlagsOff(host);
    if (flagsOff) return unmeasuredArm(host.proof(), flagsOff);
    host.step(1);
    const player = host.player;
    const dropSpot = predictedMinePos(player);
    let mineId = null;
    let receipt = null;
    let victim = null;
    let detonationDist = null;
    host.bus.on('weapons:mineDeployed', (e) => { if (e.ownerId === player.id) mineId = e.mineId; });
    host.bus.on('weapons:mineDetonated', (e) => {
      if (e.mineId !== mineId) return;
      receipt = e;
      if (victim) detonationDist = Math.hypot(victim.pos.x - e.pos.x, victim.pos.z - e.pos.z);
    });
    host.step(1, { before: ({ state }) => writeRealPathInput(state, { fire }) });
    if (fire && mineId == null) return unmeasuredArm(host.proof(), 'shipped fire did not deploy a mine');
    // The mine drops inside the combined radii of Hornet and Wasp. Spawn the stationary target
    // only after the owner has flown clear; never let collision separation launch the fixture.
    host.step(60, { before: ({ state }) => writeRealPathInput(state, { moveZ: 1 }) });
    const mine = mineId == null ? null : host.state.entities.get(mineId);
    const hasSolverBody = fire && host.runtime.getSystem('physics')._sg02.records.has(mineId);
    if (hasSolverBody) return unmeasuredArm(host.proof(), 'proximity mine incorrectly entered the Rapier solver');
    const center = mine ? { x: mine.pos.x, z: mine.pos.z } : dropSpot;
    victim = spawnSittingWasp(host, center);
    const cruise = readCruiseSpeed(victim);
    let vBefore = null;
    let vAfter = null;
    let eventTick = null;
    host.step(100, {
      before: ({ state }) => {
        writeRealPathInput(state, { moveZ: 1 });
        writeNpcIntent(victim, emptyIntent());
        if (eventTick == null) vBefore = { x: victim.vel.x, z: victim.vel.z };
      },
      after: ({ state }) => {
        if (fire ? !!receipt : state.tick === sampleTick) {
          eventTick = state.tick;
          vAfter = { x: victim.vel.x, z: victim.vel.z };
          return false;
        }
      },
    });
    host.assertBodies([victim, player], 'feel.shove_magnitude.mine');
    const proof = host.proof();
    if (!vAfter || (fire && (!receipt.hits.includes(victim.id) || !(detonationDist <= 1e-4)))) {
      return unmeasuredArm(proof, `mine centre-hit not observed (tick=${eventTick}, distance=${detonationDist}, victimX=${victim.pos.x}, centerX=${center.x})`, cruise);
    }
    eventTrace.push({ tick: eventTick, type: fire ? 'mine:hit' : 'mine:control', tag, weaponId: MINE_WEAPON_ID, detonationDist });
    return { measured: true, realPathProof: proof, ...cruise, vBefore, vAfter, eventTick,
      rawTickDeltaV: Math.hypot(vAfter.x - vBefore.x, vAfter.z - vBefore.z),
      victimMass: victim.mass, detonationDist, hasSolverBody, deployed: fire && mineId != null, detonated: !!receipt };
  } finally { host.dispose(); }
}
async function runPulseArm(seed, { fire, tag, eventTrace }) {
  const host = await bootRealPath({
    seed,
    systems: [...CURVE_SYSTEMS],
    hulls: [{
      hullId: 'ship_kestrel',
      pos: { x: 0, z: 0 },
      rot: 0,
      isPlayer: true,
      fittings: fittingsFromDefaultModules('ship_kestrel', [PULSE_WEAPON_ID]),
    }],
  });

  try {
    const flagsOff = readFeelFlagsOff(host);
    if (flagsOff) {
      host.step(1);
      return { measured: false, flagsOff, realPathProof: host.proof() };
    }

    const player = host.player;
    const victim = spawnSittingWasp(host, { x: PULSE_STANDOFF, z: 0 });
    host.step(1);
    const proof = host.proof();
    try {
      host.assertBodies([victim, player], 'feel.shove_magnitude.pulse');
    } catch (err) {
      return unmeasuredArm(proof, String((err && err.message) || err));
    }

    const cruise = readCruiseSpeed(victim);
    writeNpcIntent(victim, emptyIntent());
    victim.vel = victim.vel || { x: 0, z: 0 };
    victim.vel.x = 0;
    victim.vel.z = 0;

    const pulseDef = WEAPONS.find((w) => w.id === PULSE_WEAPON_ID);
    const pulseRange = pulseDef && Number.isFinite(pulseDef.range) ? pulseDef.range : 600;
    const energyCost = pulseDef && Number.isFinite(pulseDef.energyCost) ? pulseDef.energyCost : 2;

    let attemptedShots = 0;
    let landedHits = 0;
    host.bus.on('combat:fire', (payload) => {
      if (payload && payload.ownerId === player.id && payload.weaponId === PULSE_WEAPON_ID) {
        attemptedShots += 1;
      }
    });
    host.bus.on('combat:damage', (payload) => {
      if (
        payload
        && payload.targetId === victim.id
        && payload.attackerId === player.id
        && payload.weaponId === PULSE_WEAPON_ID
      ) {
        landedHits += 1;
      }
    });

    let pendingEvent = false;
    let eventTick = null;
    let vBefore = { x: 0, z: 0 };
    let vAfter = null;
    let firingSolutionViable = true;
    const holdEnd = PULSE_HOLD_TICKS;
    const totalTicks = PULSE_HOLD_TICKS + PULSE_FLIGHT_TICKS;

    host.step(totalTicks, {
      before: ({ index, state }) => {
        writeNpcIntent(victim, emptyIntent());
        const holding = fire && index < holdEnd;
        const aimAngle = Math.atan2(
          finite(victim.pos && victim.pos.z) - finite(player.pos && player.pos.z),
          finite(victim.pos && victim.pos.x) - finite(player.pos && player.pos.x),
        );
        writeRealPathInput(state, { fire: holding, moveZ: 0 });
        state.input.aimAngle = aimAngle;
        if (holding) {
          const dist = Math.hypot(
            finite(victim.pos && victim.pos.x) - finite(player.pos && player.pos.x),
            finite(victim.pos && victim.pos.z) - finite(player.pos && player.pos.z),
          );
          const venting = (state.simTime || 0) < ((player.data && player.data.weaponVentUntil) || 0);
          const cap = typeof player.cap === 'number' ? player.cap : 0;
          if (!victim.alive || dist > pulseRange || venting || cap < energyCost) {
            firingSolutionViable = false;
          }
        }
        if (pendingEvent || eventTick != null) return;
        if (index !== 0) return;
        vBefore = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
        pendingEvent = true;
      },
      after: ({ index, state }) => {
        const tick = state.tick | 0;
        if (pendingEvent && eventTick == null && index === 0) {
          eventTick = tick;
        }
        if (index === totalTicks - 1) {
          vAfter = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
          if (eventTrace.length < 400) {
            eventTrace.push({
              tick,
              simTime: tick / 60,
              type: fire ? 'pulse:held' : 'pulse:control',
              tag,
              weaponId: PULSE_WEAPON_ID,
              attemptedShots,
              landedHits,
            });
          }
        }
      },
    });

    if (readPhysicsTelemetry(victim) == null) {
      return unmeasuredArm(proof, 'bodyless at end of pulse run', cruise);
    }
    if (!vAfter) vAfter = { x: finite(victim.vel && victim.vel.x), z: finite(victim.vel && victim.vel.z) };
    const hitFraction = attemptedShots > 0 ? landedHits / attemptedShots : null;

    return {
      measured: true,
      realPathProof: proof,
      cruiseField: cruise.cruiseField,
      cruiseSpeed: cruise.cruiseSpeed,
      vBefore,
      vAfter,
      rawTickDeltaV: Math.hypot(vAfter.x - vBefore.x, vAfter.z - vBefore.z),
      victimMass: finite(victim.mass, 0),
      attemptedShots: fire ? attemptedShots : 0,
      landedHits: fire ? landedHits : 0,
      hitFraction: fire ? hitFraction : null,
      firingSolutionViable: fire ? firingSolutionViable : null,
    };
  } finally {
    host.dispose();
  }
}

function spawnSittingWasp(host, pos) {
  const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: finite(pos.x), z: finite(pos.z) }, {
    motive: 'motion_lab',
    engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'motion_lab',
  });
  spec.rot = 0;
  spec.data = spec.data || {};
  spec.data.ai = spec.data.ai || {};
  spec.data.ai.activity = {
    ...(spec.data.ai.activity || {}),
    kind: 'hold',
    reason: 'motion_lab',
    anchor: { x: finite(pos.x), z: finite(pos.z) },
    leashRadius: 4000,
  };
  spec.data.ai.roe = 'hold_fire';
  spec.data.ai.passive = true;
  spec.data.ai.huntPlayer = false;
  spec.data.intent = emptyIntent();
  spec.data.combat = spec.data.combat || {};
  return host.runtime.spawn(spec);
}

function predictedMinePos(player) {
  const dir = finite(player && player.rot) + Math.PI;
  const standoff = finite(player && player.radius, 6) + 6;
  return {
    x: finite(player && player.pos && player.pos.x) + Math.cos(dir) * standoff,
    z: finite(player && player.pos && player.pos.z) + Math.sin(dir) * standoff,
  };
}

function findVectorMine(state) {
  const list = (state && state.entityList) || [];
  for (const entity of list) {
    if (entity && entity.alive && entity.type === 'vectormine') return entity;
  }
  return null;
}

function readFeelFlagsOff(host) {
  const features = host.runtime && host.runtime.config && host.runtime.config.features;
  const impulseOn = !!(features && features.combat && features.combat.weaponImpulseConsequences);
  const tumbleOn = !!(features && features.massline2 && features.massline2.enabled && features.massline2.tumble);
  if (impulseOn && tumbleOn) return null;
  return `STOP: production feel flags off (${[!impulseOn && 'weaponImpulseConsequences', !tumbleOn && 'massline2.tumble'].filter(Boolean).join(', ')})`;
}

function unmeasuredArm(proof, reason, cruise) {
  return {
    measured: false,
    unmeasuredReason: reason,
    realPathProof: proof,
    cruiseField: cruise && cruise.cruiseField,
    cruiseSpeed: cruise && cruise.cruiseSpeed,
  };
}

/**
 * The delta-V the hit CAUSED: |v_after(arm) - v_after(control)| at the same tick of an otherwise
 * identical run. Returns null (and notes it) if the two arms did not share a pre-event state, which
 * would make the subtraction meaningless.
 */
function causalDeltaV(arm, control, notes, label) {
  if (!arm || arm.measured !== true || !arm.vAfter) return null;
  if (!control || control.measured !== true || !control.vAfter) {
    notes.push(`${label} causal delta-V fail-closed: the matched no-weapon control arm did not measure.`);
    return null;
  }
  const driftBefore = Math.hypot(
    finite(arm.vBefore && arm.vBefore.x) - finite(control.vBefore && control.vBefore.x),
    finite(arm.vBefore && arm.vBefore.z) - finite(control.vBefore && control.vBefore.z),
  );
  if (!(driftBefore <= 1e-6)) {
    notes.push(`${label} causal delta-V fail-closed: control pre-event velocity drifted by ${round6(driftBefore)} WU/s.`);
    return null;
  }
  return Math.hypot(arm.vAfter.x - control.vAfter.x, arm.vAfter.z - control.vAfter.z);
}

function round6(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : n;
}

function helmOwnerOf(events) {
  for (const ev of events) {
    if (ev.type === 'massline:tumbled' || ev.type === 'combat:collisionConsequence') return ev.type;
  }
  return 'none';
}

function uniqueNames(events) {
  const out = [];
  for (const ev of events) if (ev && ev.type && !out.includes(ev.type)) out.push(ev.type);
  return out;
}

function perpendicularDistance(point, origin, dir) {
  const dx = finite(point.x) - finite(origin.x);
  const dz = finite(point.z) - finite(origin.z);
  return Math.abs(dx * finite(dir.z) - dz * finite(dir.x));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
