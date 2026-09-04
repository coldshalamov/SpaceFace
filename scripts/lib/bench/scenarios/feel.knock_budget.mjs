// scripts/lib/bench/scenarios/feel.knock_budget.mjs — B13 player knock budget, on the REAL path.
//
// THE REAL-PATH LAW: "A scenario that integrates its own physics is not a measurement."
// This module integrates no impulse, schedules no contacts, and writes no body motion. It boots
// the live `rapier-dynamic` authority, flies a straight cruise route through a seeded corridor of
// rock and slower in-lane traffic, and asks the physics authority itself what it did to the hull.
//
// Vision: "The owner's own ship is never knocked around." Bar B13.
// This step MEASURES. It does not fix. `barMet` may be false — that is the result.
//
// ONE KNOCK DEFINITION, shared with the Crucible bench (master's ruling, 2026-09-03): a knock is a
// `physics:impact` receipt with `playerInvolved`; its magnitude is the receipt's own
// `playerDeltaV` (= dp / player mass, `src/core/physics.js` `emitPhysicsImpact`). Consecutive
// receipt ticks are one EVENT — B13 counts events, not solver ticks. The independently measured
// velocity discontinuity is carried alongside as a CROSS-CHECK, never as the bar's number; if the
// two disagree the gap is published (`receiptVsMeasuredMaxGapFractionOfCruise`) rather than
// silently reconciled, because a receipt that misstates what the player feels is itself a finding.

import { readPhysicsTelemetry } from '../../../../src/core/physicsAuthority.js';
import { bootRealPath, writeRealPathInput, REAL_PATH_DT } from '../realPath.mjs';

// An event below this is not a knock the player could feel; it is solver settle. 0.5 % of cruise
// on the Kestrel is 0.98 WU/s.
const KNOCK_FLOOR_FRACTION = 0.005;
// Measured 2026-09-04 on this boot: `moveZ = 1` with no turn settles at EXACTLY combatSpeed
// (195.0 WU/s for the Kestrel) within 10 s and holds it. The counted window starts after that, so
// every number is taken at cruise and never during the spin-up.
const RAMP_IN_SECONDS = 12;
const JITTER_WINDOW_TICKS = 15;
// Rapier answers one graze over a run of consecutive ticks (measured 2026-09-03: one rock produced
// 8 ticks of response). A gap of up to this many receipt-free ticks stays inside the same event.
const EVENT_BRIDGE_TICKS = 6;
// The `physics:impact` receipt is stamped with the POST-step tick while the step hook reports the
// PRE-step tick. Measured: receiptTick === sampleTick + 1 in every case. Comparing them raw makes
// every knock look receipt-less and every receipt look knock-less.
const RECEIPT_TICK_OFFSET = 1;

// No `aiPorts` / `tacticalAI`: ordinary traffic must not decide to fight the player, or the run
// stops being ordinary flight and becomes a deliberate engagement. Traffic is driven through the
// same `data.intent` actuator the AI itself writes, so flight and contact stay entirely real.
const SYSTEMS = ['actions', 'flightV3', 'collisionConsequences', 'physics'];

const PLAYER_HULL = 'ship_kestrel';
const PLAYER_RADIUS_FALLBACK = 10;

// ---- THE ARENA -----------------------------------------------------------------------------
// A ROLLING corridor: rock is seeded ahead of the hull along the direction it is actually moving,
// so the field can never be out-run and the hull can never be knocked out of its own arena into
// empty space (both of which the first version of this instrument did, silently, and printed a
// clean pass for it).
//
// Every planned contact is a GRAZE — the shoulder of the hull brushing rock — never a head-on.
// That is deliberate and it is what B13's ordinary clause is about. Measured 2026-09-04 on this
// same boot: a rock taken HEAD-ON at cruise removes 98.4 % of the hull's velocity in 0.2 s and
// turns its course 63 degrees. That is a wall, and hitting a wall is allowed to hurt; it is the
// "deliberate big event" B13 exempts, and it is reported separately as `headOnEvents`, never
// counted against the ordinary-bump budget.
//
// Density is a SETUP number and is reported, because the knock RATE is a property of how much rock
// a route passes and how the pilot steers — it is not a property of the game alone. One planned
// graze every GRAZE_PERIOD_S seconds is the "ordinary flight" density this instrument declares.
// The per-event magnitude (B13's "never more than 10 % of cruise in one event") is the
// density-independent clause and is the real bar.
const ROCK_SPACING_WU = 300;
const ROCK_LEAD_WU = 460;
const ROCK_RADIUS_MIN = 14;
const ROCK_RADIUS_SPAN = 20;
const ROCK_MASS_MIN = 250;
const ROCK_MASS_SPAN = 550;
const GRAZE_PERIOD_S = 30;
// A graze places the rock so the hull overlaps it by 10 %–45 % of the combined radius — a shoulder
// brushing rock. Anything past HEAD_ON_OVERLAP_FRACTION would be a wall, and is never planned here.
const GRAZE_OFFSET_MIN = 0.55;
const GRAZE_OFFSET_SPAN = 0.35;
// A clean miss is still a real body the solver has to carry; it just is not on the line.
const MISS_OFFSET_MIN = 1.40;
const MISS_OFFSET_SPAN = 4.60;
// Anything that overlaps by more than this fraction of the combined radius is a head-on, not a
// scrape, and is reported apart from the ordinary budget.
const HEAD_ON_OVERLAP_FRACTION = 0.55;

// In-lane traffic the player overtakes — that is what ordinary traffic contact looks like. Parked
// off-lane traffic can never be met: SG-02 gives it a body only inside ~600 WU of the player
// (measured 2026-09-04: 600 WU → body, 900 WU → S4_AGGREGATE, no body, dV = 0 forever), which is
// one to three seconds of overlap at cruise.
const TRAFFIC_HULLS = Object.freeze(['ship_hornet', 'ship_mule', 'ship_hornet']);
const TRAFFIC_PERIOD_S = 40;
const TRAFFIC_LEAD_WU = 420;
const TRAFFIC_THROTTLE = 0.55;
const TRAFFIC_RADIUS_FALLBACK = 12;

function finite(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function wrapAngle(a) {
  let x = finite(a) % (Math.PI * 2);
  if (x <= -Math.PI) x += Math.PI * 2;
  if (x > Math.PI) x -= Math.PI * 2;
  return x;
}

function percentile(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

function signFlips(values) {
  let flips = 0;
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    const s = Math.sign(values[i]);
    if (s === 0) continue;
    if (prev !== 0 && s !== prev) flips += 1;
    prev = s;
  }
  return flips;
}

/**
 * The commanded (thrust-only) velocity change for this tick, read off the authority's own
 * telemetry. Subtracting it from the measured change isolates what CONTACT did — the same
 * separation `sg02DynamicBodyOwner._applyStructuralGive` performs internally.
 */
function commandedDeltaV(telemetry, dt) {
  const mass = finite(telemetry && telemetry.mass, 0);
  const force = telemetry && telemetry.force;
  if (!(mass > 0) || !force) return { x: 0, z: 0, dw: 0 };
  const inertiaY = finite(telemetry.inertiaY, 0);
  const torqueY = finite(telemetry.torque && telemetry.torque.y, finite(telemetry.torque, 0));
  return {
    x: finite(force.x) / mass * dt,
    z: finite(force.z) / mass * dt,
    dw: inertiaY > 0 ? torqueY / inertiaY * dt : 0,
  };
}

/**
 * The route runs straight down +X at rot 0 (measured 2026-09-04: rot 0 + moveZ 1 accelerates along
 * +X). Straight is not a convenience: the assisted governor caps only LOCAL FORWARD velocity, so a
 * hull that turns while thrusting accumulates unbounded lateral speed — a gentle weave measured
 * 2.8x cruise in 30 s. A weaving route would measure knocks at 546 WU/s and call it "ordinary".
 *
 * The heading the corridor is laid along is the hull's ACTUAL direction of travel, so a knock that
 * deflects the hull takes the arena with it.
 */
function travelDirection(player) {
  const vx = finite(player.vel && player.vel.x);
  const vz = finite(player.vel && player.vel.z);
  const speed = Math.hypot(vx, vz);
  if (speed > 50) return { x: vx / speed, z: vz / speed };
  const rot = finite(player.rot);
  return { x: Math.cos(rot), z: Math.sin(rot) };
}

/** Places one rock ahead of the hull at a planned lateral offset. Returns its plan record. */
function seedRock(host, player, playerRadius, graze) {
  const rng = host.state.rng;
  const dir = travelDirection(player);
  const nx = -dir.z;
  const nz = dir.x;
  const radius = ROCK_RADIUS_MIN + rng() * ROCK_RADIUS_SPAN;
  const combined = radius + playerRadius;
  const factor = graze
    ? GRAZE_OFFSET_MIN + rng() * GRAZE_OFFSET_SPAN
    : MISS_OFFSET_MIN + rng() * MISS_OFFSET_SPAN;
  const side = rng() < 0.5 ? -1 : 1;
  const offset = side * factor * combined;
  const px = finite(player.pos && player.pos.x);
  const pz = finite(player.pos && player.pos.z);
  const entity = host.spawnObstacle({
    pos: { x: px + dir.x * ROCK_LEAD_WU + nx * offset, z: pz + dir.z * ROCK_LEAD_WU + nz * offset },
    radius,
    mass: ROCK_MASS_MIN + rng() * ROCK_MASS_SPAN,
  });
  return {
    id: entity.id,
    graze,
    radius,
    offsetFactor: factor,
    // 0 = edges just touching, 1 = dead centre.
    overlapFraction: Math.max(0, 1 - factor),
    headOn: Math.max(0, 1 - factor) > HEAD_ON_OVERLAP_FRACTION,
  };
}

/** Places one slower ship in the lane ahead, for the player to overtake. */
function seedTraffic(host, player, playerRadius, index) {
  const rng = host.state.rng;
  const dir = travelDirection(player);
  const nx = -dir.z;
  const nz = dir.x;
  const combined = TRAFFIC_RADIUS_FALLBACK + playerRadius;
  const factor = GRAZE_OFFSET_MIN + rng() * GRAZE_OFFSET_SPAN;
  const side = rng() < 0.5 ? -1 : 1;
  const offset = side * factor * combined;
  const px = finite(player.pos && player.pos.x);
  const pz = finite(player.pos && player.pos.z);
  const ship = host.spawnShip({
    hullId: TRAFFIC_HULLS[index % TRAFFIC_HULLS.length],
    pos: { x: px + dir.x * TRAFFIC_LEAD_WU + nx * offset, z: pz + dir.z * TRAFFIC_LEAD_WU + nz * offset },
    // Facing the way the player is going, moving slower, so the player overtakes it.
    rot: Math.atan2(dir.z, dir.x),
    isPlayer: false,
    team: 1,
    factionId: 'faction_free',
  });
  return { ship, throttle: TRAFFIC_THROTTLE, offsetFactor: factor, overlapFraction: Math.max(0, 1 - factor) };
}

function writeTrafficIntent(traffic) {
  for (const entry of traffic) {
    const ship = entry.ship;
    if (!ship || ship.alive === false) continue;
    const data = ship.data || (ship.data = {});
    const intent = data.intent || (data.intent = {});
    intent.moveX = 0;
    intent.moveZ = entry.throttle;
    intent.turnIntent = 0;
    intent.boost = false;
    intent.brake = false;
    intent.fire = false;
    intent.fireGroup = null;
  }
}

/**
 * Measure B13 on the live Rapier path.
 *
 * @param {number} seed
 * @param {{ simSeconds:number, emptyField?:boolean }} options `emptyField` spawns nothing to hit;
 *   it exists to measure this instrument's own noise floor, and it disables the arena guards.
 */
export async function runKnockBudget(seed, { simSeconds, emptyField = false } = {}) {
  if (!Number.isFinite(simSeconds) || simSeconds <= 0) {
    throw new Error('feel.knock_budget: simSeconds must be a positive finite number');
  }
  const dt = REAL_PATH_DT;
  const rampTicks = Math.round(RAMP_IN_SECONDS / dt);
  const countedTicks = Math.round(simSeconds / dt);
  const totalTicks = rampTicks + countedTicks;

  const host = await bootRealPath({
    seed,
    systems: SYSTEMS,
    hulls: [{
      hullId: PLAYER_HULL,
      pos: { x: 0, z: 0 },
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });

  try {
    const player = host.player;
    if (!player) throw new Error('feel.knock_budget: bootRealPath returned no player hull');
    // FEEL_CONTRACT section B: "Cruise = the hull's governed combatSpeed." Read it off the hull.
    // Never the measured mean: a hull pinned against a rock has a low mean speed, which would
    // shrink the denominator and flatter the bar exactly when the game is behaving worst.
    const derived = player.data && player.data.derived;
    const governed = derived && derived.propulsion && Number(derived.propulsion.combatSpeed);
    if (!(Number.isFinite(governed) && governed > 0)) {
      throw new Error('feel.knock_budget: the hull has no governed combatSpeed — cruise is undefined');
    }
    const cruiseSpeed = governed;
    const knockFloor = KNOCK_FLOOR_FRACTION * cruiseSpeed;
    const playerRadius = finite(player.radius, PLAYER_RADIUS_FALLBACK);

    // The rolling corridor's book-keeping. Everything here is a plan the arena WROTE DOWN before
    // the solver ran, so the rate this instrument reports can be audited against the geometry that
    // produced it rather than being a number only this scenario can vouch for.
    const rockPlans = [];
    const traffic = [];
    let travelSinceRock = 0;
    let travelSinceGraze = 0;
    let travelSinceTraffic = 0;
    let plannedGrazes = 0;
    let plannedHeadOns = 0;
    const grazeIds = new Set();
    const headOnIds = new Set();

    const receipts = [];
    host.bus.on('physics:impact', (payload) => {
      if (!payload || !payload.playerInvolved) return;
      receipts.push({
        tick: finite(payload.tick, host.state.tick | 0),
        playerDeltaV: Math.abs(finite(payload.playerDeltaV)),
        dp: finite(payload.dp),
        otherId: payload.aId === player.id ? payload.bId : payload.aId,
      });
    });

    const samples = [];
    const eventTrace = [{
      tick: host.state.tick | 0,
      type: 'scenario:start',
      data: { simSeconds, grazePeriodS: GRAZE_PERIOD_S, trafficPeriodS: TRAFFIC_PERIOD_S },
    }];
    let countWindowMarked = false;
    let minBodiesDuringWindow = Infinity;
    let assertedBodies = 0;
    let assertError = null;
    let lastPos = { x: finite(player.pos && player.pos.x), z: finite(player.pos && player.pos.z) };

    const vBefore = { x: 0, z: 0, rot: 0, wy: 0 };

    host.step(totalTicks, {
      before: ({ index, state }) => {
        writeRealPathInput(state, { moveZ: 1 });
        writeTrafficIntent(traffic);

        // ---- roll the corridor forward ------------------------------------------------------
        // Seeded from `state.rng`, cadenced in DISTANCE TRAVELLED (not wall ticks), and laid along
        // the hull's actual direction of travel, so the arena is deterministic, cannot be out-run,
        // and follows the hull if a knock deflects it.
        if (!emptyField) {
          const px = finite(player.pos && player.pos.x);
          const pz = finite(player.pos && player.pos.z);
          const moved = Math.hypot(px - lastPos.x, pz - lastPos.z);
          lastPos = { x: px, z: pz };
          travelSinceRock += moved;
          travelSinceGraze += moved;
          travelSinceTraffic += moved;
          if (travelSinceRock >= ROCK_SPACING_WU) {
            travelSinceRock = 0;
            const graze = travelSinceGraze >= cruiseSpeed * GRAZE_PERIOD_S;
            if (graze) travelSinceGraze = 0;
            const plan = host.withFeatures(() => seedRock(host, player, playerRadius, graze));
            rockPlans.push(plan);
            if (plan.headOn) { plannedHeadOns += 1; headOnIds.add(plan.id); }
            else if (plan.overlapFraction > 0) { plannedGrazes += 1; grazeIds.add(plan.id); }
          }
          if (travelSinceTraffic >= cruiseSpeed * TRAFFIC_PERIOD_S) {
            travelSinceTraffic = 0;
            const entry = host.withFeatures(() => seedTraffic(host, player, playerRadius, traffic.length));
            traffic.push(entry);
            if (entry.overlapFraction > HEAD_ON_OVERLAP_FRACTION) { plannedHeadOns += 1; headOnIds.add(entry.ship.id); }
            else if (entry.overlapFraction > 0) { plannedGrazes += 1; grazeIds.add(entry.ship.id); }
          }
        }

        vBefore.x = finite(player.vel && player.vel.x);
        vBefore.z = finite(player.vel && player.vel.z);
        vBefore.rot = finite(player.rot);
        vBefore.wy = finite(player.angVel);
      },
      after: ({ tick, index }) => {
        if (index === rampTicks && !countWindowMarked) {
          countWindowMarked = true;
          eventTrace.push({ tick, type: 'scenario:countWindowStart', data: {} });
        }
        if (index < rampTicks) return;

        // The bodiless-entity trap, asserted where it can actually be true: SG-02 admits traffic
        // only within ~600 WU of the player (measured 2026-09-04: 600 WU body, 900 WU none), so
        // this must be checked at OVERTAKING RANGE, not at spawn — at spawn every traffic ship is
        // thousands of WU down-route and correctly bodiless. Rocks are STATIC bodies and
        // `readPhysicsTelemetry` returns null for them by design, so they are never asserted here;
        // their presence in the world is proved by the receipts they generate.
        if (!assertedBodies && !assertError) {
          const px = finite(player.pos && player.pos.x);
          const near = traffic
            .filter((t) => t.ship && t.ship.alive !== false
              && Math.abs(finite(t.ship.pos && t.ship.pos.x) - px) < 400)
            .map((t) => t.ship);
          if (near.length) {
            try {
              assertedBodies = host.assertBodies(near, 'feel.knock_budget traffic at overtaking range');
            } catch (err) {
              assertError = err;
              return false;
            }
          }
        }

        // `host.proof()` is the only honest source for this — `state.physicsRuntime` does not carry
        // `sg02Bodies`, and reading it there silently yields NaN, which makes the "alone in space"
        // guard below unable to fire. That is how the first version of this instrument printed a
        // clean pass for a run whose hull had out-flown every body in the world.
        const bodies = host.proof().sg02Bodies;
        if (Number.isFinite(bodies) && bodies < minBodiesDuringWindow) minBodiesDuringWindow = bodies;

        const telemetry = readPhysicsTelemetry(player);
        const cmd = commandedDeltaV(telemetry, dt);
        const vx = finite(player.vel && player.vel.x);
        const vz = finite(player.vel && player.vel.z);
        const rot = finite(player.rot);
        const contactDvx = (vx - vBefore.x) - cmd.x;
        const contactDvz = (vz - vBefore.z) - cmd.z;
        const expectedRot = wrapAngle(vBefore.rot + (vBefore.wy + cmd.dw) * dt);
        samples.push({
          tick,
          speed: Math.hypot(vx, vz),
          contactDvx,
          contactDvz,
          contactDV: Math.hypot(contactDvx, contactDvz),
          rotResidual: wrapAngle(rot - expectedRot),
          rotAbs: rot,
          angVel: finite(player.angVel),
          velX: vx,
          velZ: vz,
          rot: vBefore.rot,
          posX: finite(player.pos && player.pos.x),
        });
      },
    });

    if (assertError) throw assertError;

    const proof = host.proof();
    if (proof.sg02Ready !== true || proof.backend !== 'rapier-dynamic') {
      throw new Error(`feel.knock_budget: not the real path (sg02Ready=${proof.sg02Ready}, backend=${proof.backend}) — a stand-in must never print a number`);
    }
    if (proof.contactCaptureEnabled !== true) {
      throw new Error('feel.knock_budget: SG-02 contact capture is OFF — the run would produce real contact physics and zero receipts');
    }

    const ticks = samples.length;
    if (ticks !== countedTicks) {
      throw new Error(`feel.knock_budget: counted ${ticks} ticks, expected ${countedTicks}`);
    }

    // ---- ARENA GUARDS: a zero must never be able to mean "the hull was alone in space" ---------
    const endX = samples[ticks - 1].posX;
    if (!emptyField) {
      if (minBodiesDuringWindow <= 1) {
        throw new Error(`feel.knock_budget: SG-02 held only ${minBodiesDuringWindow} body at some point in the counted window — the hull was alone in space, which is not a measurement`);
      }
      if (!assertedBodies) {
        throw new Error('feel.knock_budget: no traffic ever reached overtaking range with a physics body — the arena did not build');
      }
      const expectedGrazes = Math.floor(simSeconds / GRAZE_PERIOD_S);
      if (plannedGrazes + plannedHeadOns < expectedGrazes) {
        throw new Error(`feel.knock_budget: the arena laid ${plannedGrazes + plannedHeadOns} planned contacts, expected at least ${expectedGrazes} — the rolling corridor stalled`);
      }
    }

    let speedSum = 0;
    for (let i = 0; i < ticks; i++) speedSum += samples[i].speed;
    const meanSpeed = ticks > 0 ? speedSum / ticks : 0;

    // ---- receipts -> EVENTS (the one shared knock definition) ---------------------------------
    const countStartTick = samples[0].tick;
    const countEndTick = samples[ticks - 1].tick;
    const indexByTick = new Map();
    for (let i = 0; i < ticks; i++) indexByTick.set(samples[i].tick, i);

    const windowReceipts = receipts
      .filter((r) => r.tick >= countStartTick + RECEIPT_TICK_OFFSET && r.tick <= countEndTick + RECEIPT_TICK_OFFSET)
      .map((r) => ({ ...r, sampleTick: r.tick - RECEIPT_TICK_OFFSET }))
      .sort((a, b) => a.sampleTick - b.sampleTick);

    const receiptTicks = new Set(windowReceipts.map((r) => r.sampleTick));
    const events = [];
    let open = null;
    for (const r of windowReceipts) {
      if (open && r.sampleTick - open.lastTick <= EVENT_BRIDGE_TICKS) {
        open.lastTick = r.sampleTick;
        open.receiptDeltaV += r.playerDeltaV;
        open.dp += r.dp;
        open.receiptCount += 1;
        if (r.otherId != null) open.others.add(r.otherId);
      } else {
        if (open) events.push(open);
        open = {
          firstTick: r.sampleTick,
          lastTick: r.sampleTick,
          receiptDeltaV: r.playerDeltaV,
          dp: r.dp,
          receiptCount: 1,
          others: new Set(r.otherId == null ? [] : [r.otherId]),
        };
      }
    }
    if (open) events.push(open);

    // ---- this instrument's own noise floor, measured in this run ------------------------------
    // Ticks with no receipt anywhere near them are, by the authority's own account, contact-free;
    // whatever residual they show is the resolution limit of the commanded-thrust reconstruction.
    const quietResiduals = [];
    const quietRotResiduals = [];
    const quietRotSteps = [];
    for (let i = 0; i < ticks; i++) {
      let nearReceipt = false;
      for (let d = -EVENT_BRIDGE_TICKS; d <= EVENT_BRIDGE_TICKS && !nearReceipt; d++) {
        if (receiptTicks.has(samples[i].tick + d)) nearReceipt = true;
      }
      if (nearReceipt) continue;
      quietResiduals.push(samples[i].contactDV);
      quietRotResiduals.push(Math.abs(samples[i].rotResidual));
      if (i > 0) quietRotSteps.push(Math.abs(wrapAngle(samples[i].rotAbs - samples[i - 1].rotAbs)));
    }
    quietResiduals.sort((a, b) => a - b);
    quietRotResiduals.sort((a, b) => a - b);
    quietRotSteps.sort((a, b) => a - b);
    const residualFloor = percentile(quietResiduals, 0.995);
    const residualMax = quietResiduals.length ? quietResiduals[quietResiduals.length - 1] : 0;
    const rotResidualFloor = percentile(quietRotResiduals, 0.995);
    // THE HEADING CLAUSE IS MEASURED ON THE HULL'S ACTUAL ROTATION, NOT ON A RESIDUAL.
    // The first version of this clause summed `rot - (rotBefore + (angVelBefore + commandedTorque/
    // inertia * dt) * dt)` across an event and reported 1.6 degrees of "heading change" — while the
    // hull's measured angular velocity through and after the same contact was 6.8e-6 deg/s, i.e.
    // the hull did not turn at all. The residual was the COMMANDED-TORQUE reconstruction being
    // imperfect (flight commands a torque the solver does not need to apply once the hull is
    // already on heading), not the game turning the player. Reporting that as a B13 failure would
    // have manufactured a defect out of this instrument's own arithmetic. The pilot's `turnIntent`
    // is 0 for the whole run, so any real rotation is contact-sourced and shows up directly in
    // `rot` and in `angVel`.
    const quietRotStepMax = quietRotSteps.length ? quietRotSteps[quietRotSteps.length - 1] : 0;

    // ---- per-event player-unit measures --------------------------------------------------------
    let maxKnockDeltaV = 0;
    let maxMeasuredDeltaV = 0;
    let maxReceiptVsMeasuredGap = 0;
    let knockDvSum = 0;
    let headingChangeEvents = 0;
    let maxHeadingChangeDeg = 0;
    let velocityHeadingChangeMaxDeg = 0;
    let jitterMaxSignFlips = 0;
    let jitterEvents = 0;
    let maxEventTicks = 0;
    let knockCount = 0;
    let maxDp = 0;
    let headOnEvents = 0;
    let headOnMaxDeltaV = 0;
    let maxAngVelAfterKnock = 0;
    let maxCommandedRotResidualDeg = 0;
    const knockFractions = [];

    for (const ev of events) {
      const startIdx = indexByTick.get(ev.firstTick);
      const endIdx = indexByTick.get(ev.lastTick);
      if (startIdx == null || endIdx == null) continue;
      let dvx = 0;
      let dvz = 0;
      let rotDrift = 0;
      for (let i = startIdx; i <= endIdx; i++) {
        dvx += samples[i].contactDvx;
        dvz += samples[i].contactDvz;
        rotDrift += samples[i].rotResidual;
      }
      const measuredDeltaV = Math.hypot(dvx, dvz);
      ev.measuredDeltaV = measuredDeltaV;
      ev.rotDriftRad = rotDrift;

      if (!(ev.receiptDeltaV >= knockFloor)) continue;

      // B13 exempts "a deliberate big event (a slam the player chose, a well flown into)". The
      // arena knows which bodies it put ON the hull's line rather than beside it, so a head-on is
      // identified by the PLAN that placed it, not by how hard it turned out to hit — that would be
      // circular, and would let the bar excuse whatever it could not meet.
      let isHeadOn = false;
      for (const id of ev.others) if (headOnIds.has(id)) isHeadOn = true;
      if (isHeadOn) {
        headOnEvents += 1;
        if (ev.receiptDeltaV > headOnMaxDeltaV) headOnMaxDeltaV = ev.receiptDeltaV;
        eventTrace.push({
          tick: samples[startIdx].tick,
          type: 'collision:playerHeadOn',
          data: {
            deltaV: ev.receiptDeltaV,
            deltaVFractionOfCruise: ev.receiptDeltaV / cruiseSpeed,
            eventTicks: endIdx - startIdx + 1,
          },
        });
        continue;
      }

      knockCount += 1;
      const evTicks = endIdx - startIdx + 1;
      if (evTicks > maxEventTicks) maxEventTicks = evTicks;
      if (ev.dp > maxDp) maxDp = ev.dp;
      knockDvSum += ev.receiptDeltaV;
      if (ev.receiptDeltaV > maxKnockDeltaV) maxKnockDeltaV = ev.receiptDeltaV;
      if (measuredDeltaV > maxMeasuredDeltaV) maxMeasuredDeltaV = measuredDeltaV;
      const gap = Math.abs(ev.receiptDeltaV - measuredDeltaV);
      if (gap > maxReceiptVsMeasuredGap) maxReceiptVsMeasuredGap = gap;

      // What the hull's facing actually did across the contact, pilot input held at zero turn.
      const evTicks2 = endIdx - startIdx + 1;
      const rotBeforeEvent = (startIdx > 0 ? samples[startIdx - 1] : samples[startIdx]).rotAbs;
      const rotAfterEvent = samples[Math.min(ticks - 1, endIdx + JITTER_WINDOW_TICKS)].rotAbs;
      const rotChange = Math.abs(wrapAngle(rotAfterEvent - rotBeforeEvent));
      const headingThreshold = Math.max(quietRotStepMax * (evTicks2 + JITTER_WINDOW_TICKS) * 4, 1e-4);
      const headingDeg = rotChange * (180 / Math.PI);
      if (rotChange > headingThreshold) headingChangeEvents += 1;
      if (headingDeg > maxHeadingChangeDeg) maxHeadingChangeDeg = headingDeg;
      if (Math.abs(rotDrift) * (180 / Math.PI) > maxCommandedRotResidualDeg) {
        maxCommandedRotResidualDeg = Math.abs(rotDrift) * (180 / Math.PI);
      }
      // The hull's own spin through and just after the contact. A rot residual could in principle
      // be an artefact of reconstructing commanded rotation; a non-zero angular velocity on a hull
      // whose pilot is not turning cannot be. Both are reported.
      const spinEnd = Math.min(ticks, endIdx + 1 + JITTER_WINDOW_TICKS);
      for (let j = startIdx; j < spinEnd; j++) {
        const w = Math.abs(samples[j].angVel);
        if (w > maxAngVelAfterKnock) maxAngVelAfterKnock = w;
      }

      const pre = startIdx > 0 ? samples[startIdx - 1] : samples[startIdx];
      const post = samples[endIdx];
      const velDeg = Math.abs(wrapAngle(
        Math.atan2(post.velX, post.velZ) - Math.atan2(pre.velX, pre.velZ),
      )) * (180 / Math.PI);
      if (velDeg > velocityHeadingChangeMaxDeg) velocityHeadingChangeMaxDeg = velDeg;

      // Jitter: does the hull wobble after the bump? Lateral velocity in the pre-contact hull
      // frame, sign flips inside 0.25 s.
      const laterals = [];
      const jitterEnd = Math.min(ticks, endIdx + 1 + JITTER_WINDOW_TICKS);
      for (let j = endIdx + 1; j < jitterEnd; j++) {
        laterals.push(samples[j].velX * Math.cos(pre.rot) - samples[j].velZ * Math.sin(pre.rot));
      }
      knockFractions.push(Number((ev.receiptDeltaV / cruiseSpeed).toFixed(6)));
      const flips = signFlips(laterals);
      if (flips > jitterMaxSignFlips) jitterMaxSignFlips = flips;
      if (flips >= 2) jitterEvents += 1;

      eventTrace.push({
        tick: samples[startIdx].tick,
        type: 'collision:playerKnock',
        data: {
          deltaV: ev.receiptDeltaV,
          deltaVFractionOfCruise: ev.receiptDeltaV / cruiseSpeed,
          measuredDeltaV,
          headingChangeDeg: headingDeg,
          eventTicks: evTicks,
          receiptCount: ev.receiptCount,
          dp: ev.dp,
        },
      });
    }

    const minutes = simSeconds / 60;
    const knockEventsPerMinute = minutes > 0 ? knockCount / minutes : 0;
    const maxKnockDeltaVFractionOfCruise = maxKnockDeltaV / cruiseSpeed;
    const barMet = knockEventsPerMinute <= 2
      && maxKnockDeltaVFractionOfCruise <= 0.10
      && headingChangeEvents === 0;

    eventTrace.push({
      tick: host.state.tick | 0,
      type: 'scenario:end',
      data: { knockCount, contactEvents: events.length },
    });

    return {
      eventTrace,
      metrics: {
        // --- the bar ---------------------------------------------------------------------------
        knockEventsPerMinute,
        maxKnockDeltaVFractionOfCruise,
        headingChangeEvents,
        barMet,
        // --- what the bar is measured against ---------------------------------------------------
        cruiseSpeed,
        meanSpeed,
        playerMass: finite(player.mass, 0),
        simSeconds,
        ticks,
        knockSource: 'physics:impact(playerInvolved).playerDeltaV',
        knockFloorFractionOfCruise: KNOCK_FLOOR_FRACTION,
        // --- the events ------------------------------------------------------------------------
        contactEvents: events.length,
        knockEvents: knockCount,
        receiptCount: windowReceipts.length,
        maxEventTicks,
        maxKnockDeltaV,
        meanKnockDeltaV: knockCount > 0 ? knockDvSum / knockCount : 0,
        maxDp,
        maxHeadingChangeDeg,
        maxAngVelAfterKnockDegPerS: maxAngVelAfterKnock * (180 / Math.PI),
        velocityHeadingChangeMaxDeg,
        knockFractionsOfCruise: knockFractions,
        jitterMaxSignFlips,
        jitterEvents,
        // --- cross-check: does the receipt agree with what the hull actually did? ---------------
        measuredMaxKnockDeltaVFractionOfCruise: maxMeasuredDeltaV / cruiseSpeed,
        receiptVsMeasuredMaxGapFractionOfCruise: maxReceiptVsMeasuredGap / cruiseSpeed,
        // --- this instrument's own resolution ----------------------------------------------------
        residualFloorP995: residualFloor,
        residualMax,
        residualFloorFractionOfCruise: residualFloor / cruiseSpeed,
        rotResidualFloorP995: rotResidualFloor,
        quietRotStepMaxRad: quietRotStepMax,
        // Kept only so the discarded reconstruction can be seen next to the real number.
        maxCommandedRotResidualDeg,
        // --- the arena, so the RATE is auditable against the geometry that produced it ----------
        // The arena WROTE THESE DOWN before the solver ran. `plannedGrazes` is how many contacts the
        // corridor laid on the hull's line; `knockEvents` is how many the physics authority actually
        // reported. The RATE clause of B13 is a property of this density and of a pilot who never
        // steers, so it is reported with its arena, never on its own.
        rockCount: rockPlans.length,
        trafficCount: traffic.length,
        rockSpacingWU: ROCK_SPACING_WU,
        grazePeriodS: GRAZE_PERIOD_S,
        trafficPeriodS: TRAFFIC_PERIOD_S,
        plannedGrazes,
        plannedHeadOns,
        headOnEvents,
        headOnMaxDeltaVFractionOfCruise: headOnMaxDeltaV / cruiseSpeed,
        knocksPerPlannedGraze: plannedGrazes > 0 ? knockCount / plannedGrazes : 0,
        minBodiesDuringWindow: Number.isFinite(minBodiesDuringWindow) ? minBodiesDuringWindow : 0,
        assertedTrafficBodies: assertedBodies,
        routeEndX: endX,
        realPath: proof,
      },
    };
  } finally {
    host.dispose();
  }
}

export const scenario = {
  id: 'feel.knock_budget',
  label: 'B13 Player Knock Budget — contact-sourced velocity changes on the player hull (REAL PATH)',
  async run(seed) {
    return runKnockBudget(seed, { simSeconds: 120 });
  },
};
