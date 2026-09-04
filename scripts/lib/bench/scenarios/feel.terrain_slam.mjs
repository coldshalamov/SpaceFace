// B6 terrain slam — lethality and helm loss on the REAL path.
//
// THE REAL-PATH LAW: "A scenario that integrates its own physics is not a measurement."
// This module boots the live rapier-dynamic authority and FLIES a real NPC into a real rock: the
// hostile is given a throttle intent through the same `data.intent` actuator the AI writes, its own
// assisted governor brings it to `throttle x combatSpeed`, and the closing speed is then MEASURED
// off the hull, not scripted onto it. Nothing here integrates kinetic energy, scales an impulse, or
// writes hull or velocity.
//
// (History, kept because it is the trap: the first version teleported the hostile to a standoff and
// wrote `vel.x = cruise * fraction` with flight switched to `newtonian`. Kimi K3 named it in review
// -- "the measurement of consequences is real; the flight is not". A scripted velocity is a
// generator number even when everything downstream of it is honest.)
//
// Vision: "Slam them into asteroids." "Discover an asteroid at several hundred meters per second."
// This step MEASURES. It does not fix. barMet may be false — that is the result.

import { bootRealPath, writeRealPathInput, REAL_PATH_DT } from '../realPath.mjs';

const LIGHT_HULL_ID = 'ship_wasp';
const HEAVY_HULL_ID = 'ship_atlas';
const PLAYER_HULL_ID = 'ship_kestrel';

const ROCK_POS = Object.freeze({ x: 0, z: 0 });
const PLAYER_POS = Object.freeze({ x: 0, z: 120 });

const SETTLE_TICKS = 90;
// Long enough for the hostile to accelerate under its own drive, let the governor settle it at
// `throttle x combatSpeed`, and then cross the runway to the rock.
const MAX_APPROACH_TICKS = 900;
// The runway the hostile flies down before it meets rock. Long enough for the drive to reach the
// commanded speed, short enough to stay inside SG-02's body-admission ring the whole way in.
const RUNWAY_WU = 520;

const SYSTEMS = Object.freeze(['actions', 'flightV3', 'collisionConsequences', 'physics']);

export const scenario = {
  id: 'feel.terrain_slam',
  label: 'B6 Terrain Slam Lethality & Helm Loss (REAL PATH)',

  async run(seed) {
    const eventTrace = [];
    let tickCursor = 0;
    let lightCruise = 0;
    let cruiseField = 'unresolved';

    const light50 = await runSlam(seed, {
      caseId: 'light_50',
      hullId: LIGHT_HULL_ID,
      cruiseFrac: 0.5,
      eventTrace,
      tickCursor,
    });
    tickCursor = light50.tickCursor;
    if (light50.cruiseSpeed > 0) {
      lightCruise = light50.cruiseSpeed;
      cruiseField = light50.cruiseField;
    }

    const light75 = await runSlam(seed, {
      caseId: 'light_75',
      hullId: LIGHT_HULL_ID,
      cruiseFrac: 0.76,
      eventTrace,
      tickCursor,
    });
    tickCursor = light75.tickCursor;
    if (!lightCruise && light75.cruiseSpeed > 0) {
      lightCruise = light75.cruiseSpeed;
      cruiseField = light75.cruiseField;
    }

    // Same ABSOLUTE speed as the light 76 % case, not 0.76 of Atlas cruise.
    const lightAbsoluteSpeed = light75.flownSpeed > 0
      ? light75.flownSpeed
      : light75.commandedSpeed;
    const heavy75 = await runSlam(seed, {
      caseId: 'heavy_75',
      hullId: HEAVY_HULL_ID,
      matchAbsoluteSpeed: lightAbsoluteSpeed,
      eventTrace,
      tickCursor,
    });

    const cruiseSpeed = light75.cruiseSpeed || lightCruise;
    const closingSpeed = light75.closingSpeed;
    const closingRatio = cruiseSpeed > 0 ? closingSpeed / cruiseSpeed : 0;
    const hullLost = light75.hullLost;
    const hullLostFraction = light75.hullLostFraction;
    const lostHelm = light75.lostHelm;
    const isLethal = light75.isLethal;

    const light50HullLostFraction = light50.hullLostFraction;
    const light50LostHelm = light50.lostHelm;
    const light50ClosingRatio = light50.cruiseSpeed > 0
      ? light50.closingSpeed / light50.cruiseSpeed
      : 0;

    const heavy75HullLostFraction = heavy75.hullLostFraction;
    const heavy75LostHelm = heavy75.lostHelm;
    // The HEAVY's own cruise. The Atlas is flown at the light case's absolute speed; this ratio
    // is that speed as a fraction of Atlas cruise, not a second 0.76 throttle.
    const heavy75ClosingRatio = heavy75.cruiseSpeed > 0
      ? heavy75.closingSpeed / heavy75.cruiseSpeed
      : 0;
    const heavy75OwnCruiseFraction = heavy75.cruiseSpeed > 0 && Number.isFinite(heavy75.flownSpeed)
      ? heavy75.flownSpeed / heavy75.cruiseSpeed
      : null;
    const heavy75Survived = heavy75.damageProof === true && heavy75.isLethal !== true;
    const heavy75KeptHelm = heavy75.helmProof === true && heavy75.lostHelm === false;

    // B6 in full, not just its light half: "A light hostile meeting rock at >= 50 % of cruise loses
    // >= 60 % of hull and its helm; at >= 75 % it dies. A heavy at the same speed loses <= 15 % and
    // keeps its helm." Missing contact/damage/helm proof never fills zero and passes.
    const barMet = light50.damageProof === true
      && light50.helmProof === true
      && light75.damageProof === true
      && light75.helmProof === true
      && heavy75.damageProof === true
      && heavy75.helmProof === true
      && isLethal === true
      && lostHelm === true
      && light50HullLostFraction >= 0.6
      && light50LostHelm === true
      && Number.isFinite(heavy75HullLostFraction)
      && heavy75HullLostFraction <= 0.15
      && heavy75KeptHelm === true;

    return {
      eventTrace,
      metrics: {
        closingSpeed,
        closingRatio,
        hullLost,
        hullLostFraction,
        lostHelm,
        isLethal,
        barMet,
        // WHERE THE DAMAGE WENT. `hullLost` is a hull delta; on every case measured so far the
        // consequence kernel produced real damage and the SHIELD absorbed all of it, which a hull
        // delta alone reports as an indistinguishable zero.
        consequenceImpactDamage: light75.consequenceImpactDamage,
        shieldAbsorbed: light75.shieldAbsorbed,
        shieldBefore: light75.shieldBefore,
        shieldAfter: light75.shieldAfter,
        light50ConsequenceImpactDamage: light50.consequenceImpactDamage,
        light50ShieldAbsorbed: light50.shieldAbsorbed,
        heavy75ConsequenceImpactDamage: heavy75.consequenceImpactDamage,
        heavy75ShieldAbsorbed: heavy75.shieldAbsorbed,
        // THE SATURATION. `contactImpulse / mass` is the deltaV the consequence kernel is handed.
        // It reads 40 - MAX_CONTACT_DV - at every closing speed above about 137 WU/s, so the speed
        // variable B6 is written in is erased before damage is computed.
        contactDeltaV: light75.contactImpulseOverMass,
        light50ContactDeltaV: light50.contactImpulseOverMass,
        heavy75ContactDeltaV: heavy75.contactImpulseOverMass,
        // FLOWN vs COMMANDED. The hostile is flown by its own drive; these two agreeing is what
        // entitles the case labels to say "50 % of cruise" and "76 % of cruise".
        flownSpeed: light75.flownSpeed,
        commandedSpeed: light75.commandedSpeed,
        light50FlownSpeed: light50.flownSpeed,
        light50CommandedSpeed: light50.commandedSpeed,
        heavy75FlownSpeed: heavy75.flownSpeed,
        heavy75CommandedSpeed: heavy75.commandedSpeed,
        heavy75KeptHelm,
        heavy75HelmProof: heavy75.helmProof === true,
        heavy75DamageProof: heavy75.damageProof === true,
        heavy75OwnCruise: heavy75.cruiseSpeed,
        heavy75OwnCruiseFraction,
        light75AbsoluteSpeed: lightAbsoluteSpeed,
        sameAbsoluteSpeed: Number.isFinite(lightAbsoluteSpeed)
          && Number.isFinite(heavy75.commandedSpeed)
          && Math.abs(heavy75.commandedSpeed - lightAbsoluteSpeed) <= 0.05
          && Number.isFinite(heavy75.flownSpeed)
          && Math.abs(heavy75.flownSpeed - lightAbsoluteSpeed) <= Math.max(2, 0.08 * lightAbsoluteSpeed),
        cruiseSpeed,
        cruiseField,
        lightHullId: LIGHT_HULL_ID,
        lightMass: light75.mass || light50.mass,
        lightHullMax: light75.hullMax || light50.hullMax,
        heavyHullId: HEAVY_HULL_ID,
        heavyMass: heavy75.mass,
        heavyHullMax: heavy75.hullMax,
        light50ClosingRatio,
        light50HullLostFraction,
        light50LostHelm,
        heavy75ClosingRatio,
        heavy75HullLostFraction,
        heavy75LostHelm,
        heavy75Survived,
        contactImpulse: light75.contactImpulse,
        contactReceipts: light75.contactReceipts,
        light50ContactReceipts: light50.contactReceipts,
        heavy75ContactReceipts: heavy75.contactReceipts,
        light50DamageProof: light50.damageProof === true,
        light50HelmProof: light50.helmProof === true,
        light75DamageProof: light75.damageProof === true,
        light75HelmProof: light75.helmProof === true,
        ticks: light50.ticks + light75.ticks + heavy75.ticks,
        dt: REAL_PATH_DT,
        realPath: light75.realPath,
        bars: [
          b6Clause(
            'light hostile hull lost at 50 % of cruise closing',
            light50HullLostFraction,
            'fraction',
            light50.damageProof === true && light50HullLostFraction >= 0.6,
            light50.damageProof === true,
            'missing collision consequence/damage receipt',
          ),
          b6Clause(
            'light hostile loses the helm at 50 % of cruise closing',
            light50LostHelm == null ? null : (light50LostHelm ? 1 : 0),
            'bool',
            light50.helmProof === true && light50LostHelm === true,
            light50.helmProof === true,
            'missing helm-taking/tumble receipt',
          ),
          b6Clause(
            'light hostile dies at 76 % of cruise closing',
            isLethal == null ? null : (isLethal ? 1 : 0),
            'bool',
            light75.damageProof === true && isLethal === true,
            light75.damageProof === true,
            'missing collision consequence/damage receipt',
          ),
          b6Clause(
            'heavy hull lost at the same closing speed',
            heavy75HullLostFraction,
            'fraction',
            heavy75.damageProof === true
              && Number.isFinite(heavy75HullLostFraction)
              && heavy75HullLostFraction <= 0.15,
            heavy75.damageProof === true,
            'missing collision consequence/damage receipt',
          ),
          b6Clause(
            'heavy keeps its helm at the same closing speed',
            heavy75LostHelm == null ? null : (heavy75KeptHelm ? 1 : 0),
            'bool',
            heavy75KeptHelm === true,
            heavy75.helmProof === true,
            'missing helm receipt — keep-helm cannot pass without proof',
          ),
        ],
      },
    };
  },
};

async function runSlam(seed, { caseId, hullId, cruiseFrac = null, matchAbsoluteSpeed = null, eventTrace, tickCursor }) {
  const host = await bootRealPath({
    seed,
    systems: [...SYSTEMS],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: { x: PLAYER_POS.x, z: PLAYER_POS.z },
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });

  try {
    const rock = host.spawnObstacle({ pos: { x: ROCK_POS.x, z: ROCK_POS.z } });
    const hostile = host.spawnShip({
      hullId,
      pos: { x: -40, z: 0 },
      rot: 0,
      team: 1,
    });

    const cruise = readCruiseSpeed(hostile);
    const ownCruise = cruise.cruiseSpeed;
    const commandedSpeed = Number.isFinite(matchAbsoluteSpeed) && matchAbsoluteSpeed > 0
      ? matchAbsoluteSpeed
      : ownCruise * (Number.isFinite(cruiseFrac) ? cruiseFrac : 0);
    const throttle = ownCruise > 0 ? commandedSpeed / ownCruise : 0;
    const setupSpeed = commandedSpeed;

    const rockRadius = finite(rock.radius, 22);
    const shipRadius = finite(hostile.radius, 14);
    const standoff = rockRadius + shipRadius + RUNWAY_WU;
    // Placed at the START of a runway, facing the rock. Where a ship is spawned is setup;
    // everything after this is the drive, the governor and the solver.
    hostile.pos.x = ROCK_POS.x - standoff;
    hostile.pos.z = ROCK_POS.z;
    if (hostile.prevPos) {
      hostile.prevPos.x = hostile.pos.x;
      hostile.prevPos.z = hostile.pos.z;
    }
    hostile.data = hostile.data || {};
    const intent = hostile.data.intent || (hostile.data.intent = {});
    // The throttle IS the experiment. The assisted governor commands `throttle x combatSpeed`
    // (propulsionKernel.applySpeedGovernor). Light cases use 0.50 / 0.76 of their own cruise.
    // The heavy case uses the throttle that yields the light case's absolute WU/s.
    const writeHostileIntent = () => {
      intent.moveX = 0;
      intent.moveZ = throttle;
      intent.turnIntent = 0;
      intent.boost = false;
      intent.brake = false;
      intent.fire = false;
      intent.fireGroup = null;
    };
    writeHostileIntent();

    const hullMax = finite(hostile.hullMax, finite(hostile.hull, 0));
    const hullBefore = finite(hostile.hull, hullMax);
    const shieldBefore = finite(hostile.shield, 0);
    const mass = finite(hostile.mass, 0);

    const impacts = [];
    host.bus.on('physics:impact', (payload) => {
      if (!payload) return;
      if (payload.aId !== hostile.id && payload.bId !== hostile.id) return;
      impacts.push({
        tick: Number.isFinite(payload.tick) ? payload.tick : (host.state.tick | 0),
        aId: payload.aId,
        bId: payload.bId,
        impulse: finite(payload.impulse),
        dp: finite(payload.dp),
        playerInvolved: payload.playerInvolved === true,
      });
    });

    // Every collision-consequence receipt, not only helm-taking ones. The first receipt proves
    // consequence/damage; a later find(stagger/tumble) decides helm loss independently.
    const consequenceReceipts = [];
    host.bus.on('combat:collisionConsequence', (payload) => {
      if (!payload || payload.targetId !== hostile.id) return;
      consequenceReceipts.push({
        tick: Number.isFinite(payload.tick) ? payload.tick : (host.state.tick | 0),
        control: payload.control,
        staggerTicks: finite(payload.staggerTicks),
        impactDamage: finite(payload.impactDamage),
        deltaV: finite(payload.deltaV),
      });
    });

    eventTrace.push({
      tick: tickCursor,
      type: 'terrain_slam:spawn',
      data: {
        case: caseId,
        hullId,
        mass,
        hullMax,
        hullBefore,
        shieldBefore,
        cruiseSpeed: cruise.cruiseSpeed,
        cruiseField: cruise.cruiseField,
        ownCruise,
        throttle,
        matchAbsoluteSpeed: Number.isFinite(matchAbsoluteSpeed) ? matchAbsoluteSpeed : null,
        setupSpeed,
        standoff,
        rockId: rock.id,
        hostileId: hostile.id,
      },
    });

    let preVel = { x: finite(hostile.vel && hostile.vel.x), z: finite(hostile.vel && hostile.vel.z) };
    let closingSpeed = closingAlong(preVel, hostile.pos, rock.pos);
    let contactTick = null;

    const sampleBefore = () => {
      writeRealPathInput(host.state, { moveX: 0, moveZ: 0 });
      writeHostileIntent();
      preVel = {
        x: finite(hostile.vel && hostile.vel.x),
        z: finite(hostile.vel && hostile.vel.z),
      };
    };

    let flownAtContact = 0;
    const noteContact = (tick) => {
      if (contactTick != null) return;
      contactTick = tick;
      closingSpeed = closingAlong(preVel, hostile.pos, rock.pos);
      // The hull's own speed the tick before the solver answered. Sampling it after the settle
      // would report how fast the wreck was drifting, not how fast it arrived.
      flownAtContact = Math.hypot(finite(preVel.x), finite(preVel.z));
    };

    let ticks = host.step(1, {
      before: sampleBefore,
      after: ({ tick }) => {
        if (impacts.length) noteContact(tick);
      },
    });

    host.assertBodies([hostile], `terrain slam ${caseId}`);
    const proof = host.proof();
    if (proof.sg02Ready !== true || proof.backend !== 'rapier-dynamic') {
      throw new Error(`feel.terrain_slam ${caseId}: real path is not ready (sg02Ready=${proof.sg02Ready}, backend=${proof.backend})`);
    }
    // Without this the boot has real contact physics and emits ZERO receipts, and every case
    // prints a clean, plausible table of nothing (realPath.mjs documents the trap).
    if (proof.contactCaptureEnabled !== true) {
      throw new Error(`feel.terrain_slam ${caseId}: SG-02 contact capture is OFF - the run would have real contact physics and no receipts at all`);
    }

    const settledSpeed = () => Math.hypot(
      finite(hostile.vel && hostile.vel.x), finite(hostile.vel && hostile.vel.z),
    );
    ticks += host.step(MAX_APPROACH_TICKS + SETTLE_TICKS, {
      before: sampleBefore,
      after: ({ tick }) => {
        if (impacts.length) noteContact(tick);
        if (contactTick != null && tick >= contactTick + SETTLE_TICKS) return false;
      },
    });

    const namedImpacts = impacts.filter((p) => p.aId === hostile.id || p.bId === hostile.id);
    const rockImpacts = namedImpacts.filter((p) => p.aId === rock.id || p.bId === rock.id);
    // THE ROCK, or nothing. Falling back to "any body the hostile touched" would quietly measure a
    // different collision and print it under this case name.
    const firstImpact = rockImpacts[0] || null;
    const contactImpulse = firstImpact ? firstImpact.impulse : 0;
    const flownSpeed = flownAtContact;
    if (!firstImpact) {
      throw new Error(`feel.terrain_slam ${caseId}: the hostile never contacted the rock (${namedImpacts.length} unrelated receipt(s), hull speed ${settledSpeed().toFixed(1)} WU/s) - a table of zeros from a missed approach is not a measurement`);
    }

    if (firstImpact) {
      eventTrace.push({
        tick: tickCursor + (firstImpact.tick | 0),
        type: 'terrain_slam:contact',
        data: {
          case: caseId,
          closingSpeed,
          impulse: contactImpulse,
          dp: firstImpact.dp,
          receipts: namedImpacts.length,
          rockNamed: rockImpacts.length > 0,
        },
      });
    } else {
      eventTrace.push({
        tick: tickCursor + ticks,
        type: 'terrain_slam:contact',
        data: {
          case: caseId,
          closingSpeed,
          impulse: 0,
          dp: 0,
          receipts: 0,
          rockNamed: false,
        },
      });
    }

    const still = host.state.entities && typeof host.state.entities.get === 'function'
      ? host.state.entities.get(hostile.id)
      : hostile;
    const alive = !!(still && still.alive !== false);
    const hullAfter = still ? finite(still.hull, 0) : 0;
    const shieldAfter = still ? finite(still.shield, 0) : 0;
    const hullDelta = Math.max(0, hullBefore - hullAfter);
    const isLethal = alive === false || hullAfter <= 0;

    // Damage and helm are independent evaluations of the same consequence collection.
    // First combat:collisionConsequence proves consequence/damage; stagger/tumble decides helm
    // loss. A heavy that takes damage while keeping helm must still be measured. Missing either
    // consequence proof or a helm-outcome proof fails closed — never fill zero and pass.
    const damageReceipt = consequenceReceipts[0] || null;
    const helmHit = consequenceReceipts.find((r) => r.control === 'stagger' || r.control === 'tumble') || null;
    const damageProof = damageReceipt != null
      && Number.isFinite(hullBefore)
      && Number.isFinite(shieldBefore);
    const helmProof = consequenceReceipts.length > 0;
    const hullLostFraction = damageProof && hullMax > 0 ? hullDelta / hullMax : (damageProof ? 0 : null);
    const lostHelm = helmProof ? helmHit != null : null;

    const tumbleLive = host.withFeatures(() => readCollisionTumble(host.state, hostile));

    eventTrace.push({
      tick: tickCursor + ticks,
      type: 'terrain_slam:outcome',
      data: {
        case: caseId,
        hullAfter,
        shieldAfter,
        impactDamage: damageProof ? hullDelta : null,
        consequenceImpactDamage: damageProof ? finite(damageReceipt.impactDamage) : null,
        hullLostFraction,
        lostHelm,
        isLethal,
        alive,
        helmControl: helmHit ? helmHit.control : (damageReceipt ? damageReceipt.control : null),
        damageProof,
        helmProof,
        tumbleLive: tumbleLive === true,
        contactReceipts: namedImpacts.length,
        consequenceReceipts: consequenceReceipts.length,
      },
    });

    return {
      caseId,
      ticks,
      tickCursor: tickCursor + ticks,
      cruiseSpeed: cruise.cruiseSpeed,
      cruiseField: cruise.cruiseField,
      mass,
      hullMax,
      closingSpeed,
      // What the ship actually flew, and what its throttle commanded. If these disagree the
      // "50 % of cruise" and "76 % of cruise" labels are fiction and the reader can see it.
      flownSpeed,
      commandedSpeed,
      throttle,
      hullLost: damageProof ? hullDelta : null,
      hullLostFraction,
      // The damage the consequence kernel actually produced, and where it went. Reporting only
      // the hull delta — or coupling it to the first helm-taking receipt — makes "the shield
      // ate 54 points while helm was kept" print as an indistinguishable zero.
      consequenceImpactDamage: damageProof ? finite(damageReceipt.impactDamage) : null,
      shieldBefore,
      shieldAfter,
      shieldAbsorbed: damageProof ? Math.max(0, shieldBefore - shieldAfter) : null,
      lostHelm,
      helmControl: helmHit ? helmHit.control : (damageReceipt ? damageReceipt.control : null),
      damageProof,
      helmProof,
      isLethal,
      contactImpulse,
      contactImpulseOverMass: mass > 0 ? contactImpulse / mass : 0,
      contactReceipts: namedImpacts.length,
      rockReceipts: rockImpacts.length,
      realPath: proof,
    };
  } finally {
    host.dispose();
  }
}

function readCruiseSpeed(entity) {
  const derived = entity && entity.data && entity.data.derived;
  const fromDerived = derived && derived.propulsion && derived.propulsion.combatSpeed;
  if (Number.isFinite(fromDerived) && fromDerived > 0) {
    return { cruiseSpeed: fromDerived, cruiseField: 'data.derived.propulsion.combatSpeed' };
  }
  const fromEntity = entity && entity.propulsion && entity.propulsion.combatSpeed;
  if (Number.isFinite(fromEntity) && fromEntity > 0) {
    return { cruiseSpeed: fromEntity, cruiseField: 'propulsion.combatSpeed' };
  }
  return { cruiseSpeed: 0, cruiseField: 'unresolved' };
}

function readCollisionTumble(state, entity) {
  if (!state || !entity) return false;
  const runtime = state.combat && state.combat.entities
    ? state.combat.entities[String(entity.id)]
    : null;
  if (!runtime) return false;
  const active = runtime.statuses && runtime.statuses.status_tumbling;
  if (active && active.data && active.data.kind === 'collision_tumble') return true;
  const pending = Array.isArray(runtime.pendingStatuses) ? runtime.pendingStatuses : [];
  for (const row of pending) {
    if (row && row.id === 'status_tumbling' && row.data && row.data.kind === 'collision_tumble') {
      return true;
    }
  }
  return false;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hypot2(x, z) {
  return Math.hypot(finite(x), finite(z));
}

function closingAlong(vel, from, to) {
  const dx = finite(to && to.x) - finite(from && from.x);
  const dz = finite(to && to.z) - finite(from && from.z);
  const dist = hypot2(dx, dz);
  if (!(dist > 1e-9)) return hypot2(vel && vel.x, vel && vel.z);
  return (finite(vel && vel.x) * dx + finite(vel && vel.z) * dz) / dist;
}

function b6Clause(label, value, unit, met, proof, reason) {
  if (!proof) {
    return {
      bar: 'B6',
      label,
      value: null,
      unit,
      met: false,
      unmeasured: true,
      note: `UNMEASURED — ${reason}`,
    };
  }
  return { bar: 'B6', label, value, unit, met: met === true };
}
