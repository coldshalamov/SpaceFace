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
// own velocity by 3.05 WU/s in the tick of the hit. The concussion cannon is the ONE weapon that
// authors `npcCounterthrustDelayS`, so its hit silences that thrust and its raw tick delta happens
// to equal the pure impulse (26.25 = 420/16); the starter pulse authors no beat, so its raw tick
// delta reads 3.053 WU/s — 1.5 % of cruise for a gun that imparts 0.015 %, a 100x lie that would
// have gone into the BEFORE table and that PQ-137.05 would then have tuned against. Proof, seed
// 4242: same 0.5 impulse tagged `concussion_slug` reads 0.03125; tagged `starter_pulse_plink`
// reads 3.0527. So every delta-V a bar consumes here is (velocity WITH the hit) minus (velocity
// WITHOUT it) at the same tick of an otherwise identical control run: the change the hit caused.
// NOTE FOR PQ-137.04: when the one hitstun law retires the one-weapon beat, the raw tick delta of
// EVERY source picks up that same thrust term. A shift there is the instrument, not the law.
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
import { bootRealPath } from '../realPath.mjs';
import {
  GUN_PROVENANCE_TAG,
  GUN_WEAPON_ID,
  SCREEN_DEPTH_WU,
  SHOVE_SYSTEMS,
  deliverGunHit,
  driveNotAnswering,
  emptyIntent,
  readCruiseSpeed,
  subscribeHelmEvents,
} from './feel.hitstun_curve.mjs';

const FLY_TICKS = 60;
const POST_TICKS = 120;
const SPIN_WINDOW_TICKS = 10;
const HOSTILE_POS = Object.freeze({ x: -400, z: 0 });
const PULSE_WEAPON_ID = 'wpn_pulse_laser_s';

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
    });

    const control = await runShoveArm(seed, {
      weaponId: null,
      direction: 'perp',
      tag: 'control',
      eventTrace,
    });

    // The change the HIT caused: (velocity with the hit) - (velocity without it), same tick, same
    // seed, otherwise identical run. See the header note - the raw tick delta is the victim's own
    // thrust plus the shove, and only the concussion cannon's authored beat silences that thrust.
    const mainHit = causalDeltaV(main, control, notes, 'shove weapon');
    const starterHit = causalDeltaV(starter, control, notes, 'starter gun');
    const cruiseSpeed = main && Number.isFinite(main.cruiseSpeed) ? main.cruiseSpeed : 0;
    const mainFraction = cruiseSpeed > 0 && Number.isFinite(mainHit) ? mainHit / cruiseSpeed : 0;
    const starterFraction = starter && Number.isFinite(starter.cruiseSpeed) && starter.cruiseSpeed > 0
      && Number.isFinite(starterHit)
      ? starterHit / starter.cruiseSpeed
      : 0;

    const bars = [];
    if (starter && starter.measured && Number.isFinite(starterHit)) {
      bars.push({
        bar: 'B4',
        label: 'starter gun delta-V, fraction of light-hostile cruise',
        value: starterFraction,
        unit: 'fraction',
        met: starterFraction >= 0.05,
        note: `caused by the hit; raw one-tick delta was ${round6(starter.rawTickDeltaV)} WU/s, of which ${round6(control && control.rawTickDeltaV)} WU/s is the victim's own thrust`,
      });
    }
    if (along && along.measured && Number.isFinite(along.speedRatio)) {
      bars.push({
        bar: 'B4',
        label: 'light hostile at cruise shoved ALONG its motion gets faster (speed after / speed before)',
        value: along.speedRatio,
        unit: 'ratio',
        met: along.speedRatio > 1.0,
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

    return {
      eventTrace,
      metrics: {
        schema: 'spaceface.feel.shoveMagnitude.v1',
        realPathProof: main && main.realPathProof,
        cruiseField: main && main.cruiseField,
        cruiseSpeed: main ? main.cruiseSpeed : 0,
        deltaV: Number.isFinite(mainHit) ? mainHit : 0,
        deltaVFractionOfCruise: mainFraction,
        starterDeltaV: Number.isFinite(starterHit) ? starterHit : 0,
        starterDeltaVFractionOfCruise: starterFraction,
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

async function runShoveArm(seed, { weaponId, direction, tag, eventTrace }) {
  const host = await bootRealPath({
    seed,
    systems: [...SHOVE_SYSTEMS],
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
    victim.vel.x = cruise.cruiseSpeed;
    victim.vel.z = 0;

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

    host.step(FLY_TICKS + POST_TICKS, {
      before: ({ state }) => {
        if (pendingEvent || eventTick != null) return;
        if (state.tick < FLY_TICKS) return;
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
          deliverGunHit(victim, {
            attackerId: player ? player.id : null,
            tick: state.tick,
            nx,
            nz,
            magnitude: impulseMagnitude,
            weaponId,
            tag: (resolved && resolved.provenance) || (def && def.impulseProvenance) || GUN_PROVENANCE_TAG,
          });
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
    };
  } finally {
    host.dispose();
  }
}

/**
 * The delta-V the hit CAUSED: |v_after(arm) - v_after(control)| at the same tick of an otherwise
 * identical run. Returns null (and notes it) if the two arms did not share a pre-event state, which
 * would make the subtraction meaningless.
 */
function causalDeltaV(arm, control, notes, label) {
  if (!arm || arm.measured !== true || !arm.vAfter) return null;
  if (!control || control.measured !== true || !control.vAfter) {
    notes.push(`${label} delta-V is the raw one-tick change: the no-weapon control arm did not measure, so the victim's own thrust could not be subtracted.`);
    return arm.rawTickDeltaV;
  }
  const driftBefore = Math.hypot(
    finite(arm.vBefore && arm.vBefore.x) - finite(control.vBefore && control.vBefore.x),
    finite(arm.vBefore && arm.vBefore.z) - finite(control.vBefore && control.vBefore.z),
  );
  if (!(driftBefore <= 1e-6)) {
    notes.push(`${label} delta-V is the raw one-tick change: the control arm's pre-hit velocity drifted by ${round6(driftBefore)} WU/s, so the runs are not comparable.`);
    return arm.rawTickDeltaV;
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
