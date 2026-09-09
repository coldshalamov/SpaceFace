// PQ-137.09 "Chains go off" — one player action, counted consequences, on the REAL path.
//
// THE REAL-PATH LAW: "A scenario that integrates its own physics is not a measurement."
// Nothing here spawns the reaction it claims to observe. The plate is THROWN by the player's own
// verb through `impulseCharges._handleThrow` and has to fly and stick on its own; the sling is one
// production concussion-cannon damage packet through `combat.routeDamage`; every slam, every
// detonation, every helm loss and every prime after that is the game's own systems answering, read
// off the bus. If the chain does not happen, this module prints a small number — that is the
// result, not a bug in the bench.
//
// Vision: "Combat should be physical." "Consequences or it is thin."
//
// THE ONE PLAYER ACTION is the shove. Priming the ship is setup (the throw), and the count starts
// at the tick the shove lands: every consequence below is downstream of a single trigger pull.
//
// WHY A SHOVE AND NOT A ROPE RELEASE. The leaf allows either. The shove puts the fewest systems
// between the player's finger and the slam (no acquisition receipt, no attachment authority, no
// telemetry mirror), so a small consequence count can only mean the CHAIN is thin — it can never
// mean the harness lost the verb on the way in. The tether half of the leaf (a taut pair sharing
// helm loss and inertia) is proved by `test/chain-tether-share.test.mjs` against the live
// attachment records.

import { FIELD_DEFS, FIELD_FLAGS } from '../../../../src/data/fields.js';
import { CHAIN_REACTION } from '../../../../src/data/impulseCharges.js';
import { WEAPONS } from '../../../../src/data/weapons.js';
import { COLLISION_CONSEQUENCE_LIMITS, resolveWeaponImpulseForHit } from '../../../../src/combat/impulseKernel.js';
import { addCargo } from '../../../../src/systems/cargo.js';
import { bootRealPath, writeRealPathInput, REAL_PATH_DT } from '../realPath.mjs';
import { CURVE_SYSTEMS, GUN_WEAPON_ID, deliverProductionGunHit, readCruiseSpeed } from './feel.hitstun_curve.mjs';

const PLAYER_HULL_ID = 'ship_kestrel';
const LIGHT_HULL_ID = 'ship_wasp';
const CHARGE_COMMODITY = 'cmdty_impulse_charge';

// The site. The player sits astern of the ship it is about to prime; the cluster is a tight
// picket line ahead of it, spaced so hulls touch after a few world-units of travel — a cluster,
// not a firing range.
const PLAYER_POS = Object.freeze({ x: 0, z: -140 });
const CARRIER_POS = Object.freeze({ x: 0, z: 0 });
const CLUSTER_POS = Object.freeze([
  { x: 0, z: 60 },     // B — the hull the primed carrier slams
  { x: 5, z: 92 },     // C — the hull B slams when it cooks off
  { x: -5, z: 124 },   // D — the hull C reaches if the chain still has momentum
  { x: 30, z: 45 },    // E — a bystander inside the blast but (as the law decides) not stunned
]);

const THROW_TICKS = 240;   // the plate has to fly ~140 WU and stick on its own
const CHAIN_TICKS = 300;   // 5 s of consequences after the shove
const WELL_TICKS = 480;    // 8 s, inside the well's 9 s authored lifetime

// The well arm's geometry. The two hulls fall in SIDE BY SIDE rather than head-on: a well pulls
// everything to one point, and two hulls arriving from opposite sides meet at twice the
// convergence speed and kill each other before anything can be called a grind (measured — they
// did). Side by side is the same law, read where it produces a clump instead of a wreck.
const WELL_CENTER = Object.freeze({ x: 0, z: 0 });
const WELL_PLAYER_POS = Object.freeze({ x: 0, z: -260 });
const WELL_BODY_POS = Object.freeze([{ x: -70, z: -18 }, { x: -70, z: 18 }]);
// Where the convergence speed is read: inside the well, but off the singular centre where the
// clump has arrived and the geometry — not the law — is what holds the speed down.
const WELL_SAMPLE_BAND = Object.freeze({ lo: 0.05, hi: 0.9 });
// The leaf's band. The reading is the PEAK speed a body reaches while the well is acting on it:
// the law's fixed point is strength/damping and a body approaches it from below, so the peak IS
// the equilibrium the body actually got to. Without the velocity term the same run peaks at
// 81 WU/s and climbs — a runaway fall, not a convergence.
const WELL_BAND = Object.freeze({ lo: 30, hi: 60 });

// The id this scenario's clauses are filed under. PQ-137.09 has NO FEEL_CONTRACT §B bar — its
// done-when is the consequence count itself — so the clauses must not be tagged with someone
// else's. `feelBars.mergeRunProvidedBars` matches an entry only when `item.bar` equals a bar's id
// or key, so an id that names no bar is simply not merged; tagging these `B11` would instead feed
// four `count` and `WU/s` clauses straight into "Hitstun law is universal", which
// `feel.hitstun_curve` owns. The numbers a reader needs are in `metrics` above.
const BAR_ID = 'PQ-137.09';

export const scenario = {
  id: 'feel.chain_reaction',
  label: 'PQ-137.09 Chains go off — secondary consequences from ONE player action (REAL PATH)',

  async run(seed) {
    const eventTrace = [];

    const chain = await runChainArm(seed, { eventTrace });
    const well = await runWellArm(seed, { eventTrace });

    const consequences = chain.consequences;
    const distinctKinds = chain.distinctKinds;
    const barMet = chain.measured === true
      && consequences >= 3
      && well.measured === true
      && well.convergenceMet === true
      && well.grindPrimes >= 2;

    return {
      eventTrace,
      metrics: {
        // THE DONE-WHEN. "The scenario produces >= 3 secondary consequences from one player
        // action, deterministically."
        secondaryConsequences: consequences,
        distinctConsequenceKinds: distinctKinds,
        causalList: chain.causalList,
        barMet,

        // The one action, and the proof it was one.
        playerActions: chain.playerActions,
        slingWeaponId: GUN_WEAPON_ID,
        slingImpulse: chain.slingImpulse,
        slingDeltaV: chain.slingDeltaV,
        slingTick: chain.slingTick,
        carrierCruise: chain.carrierCruise,
        slingFractionOfCruise: chain.carrierCruise > 0 ? chain.slingDeltaV / chain.carrierCruise : null,

        // The setup, proved rather than assumed: a plate that never stuck is not a primed ship.
        primedBeforeSling: chain.primedBeforeSling,
        stuckHostId: chain.stuckHostId,
        carrierId: chain.carrierId,

        // Each link, so a reader can see which rule fired and not just how many did.
        slamDetonations: chain.slamDetonations,
        sympatheticDetonations: chain.sympatheticDetonations,
        primes: chain.primes,
        tumbles: chain.tumbles,
        kills: chain.kills,
        slamThresholdDeltaV: COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV,
        primeWindowS: CHAIN_REACTION.primeWindowS,
        maxSlamDeltaV: chain.maxSlamDeltaV,

        // The well half of the leaf.
        wellConvergenceSpeed: well.convergenceSpeed,
        wellConvergenceMean: well.meanSpeed,
        wellConvergenceSamples: well.samples,
        wellConvergenceMet: well.convergenceMet,
        wellEquilibriumSpeed: FIELD_DEFS.well.damping > 0
          ? FIELD_DEFS.well.strength / FIELD_DEFS.well.damping
          : null,
        wellGrinds: well.grinds,
        wellGrindPrimes: well.grindPrimes,
        wellDeployed: well.deployed,
        wellMeasured: well.measured,

        ticks: chain.ticks + well.ticks,
        dt: REAL_PATH_DT,
        realPath: chain.realPath,
        wellRealPath: well.realPath,

        bars: [
          clause(
            'secondary consequences from ONE player action',
            consequences,
            'count',
            chain.measured === true && consequences >= 3,
            chain.measured === true,
            'the shove never landed on a primed carrier — nothing downstream is attributable',
          ),
          clause(
            'distinct kinds of consequence (detonation / helm loss / prime / cook-off / kill)',
            distinctKinds,
            'count',
            chain.measured === true && distinctKinds >= 2,
            chain.measured === true,
            'the shove never landed on a primed carrier',
          ),
          clause(
            'well convergence speed, relative to the well',
            well.convergenceSpeed,
            'WU/s',
            well.measured === true && well.convergenceMet === true,
            well.measured === true,
            'no body ever fell through the sample band inside the well',
          ),
          clause(
            'well primes a clump it ground together',
            well.grindPrimes,
            'count',
            well.measured === true && well.grindPrimes >= 2,
            well.measured === true,
            'the well never held two hulls in contact long enough to read a grind',
          ),
        ],
      },
    };
  },
};

// ── the chain arm ────────────────────────────────────────────────────────────────────────────

async function runChainArm(seed, { eventTrace }) {
  const host = await bootRealPath({
    seed,
    systems: [...CURVE_SYSTEMS],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: { x: PLAYER_POS.x, z: PLAYER_POS.z },
      rot: Math.PI / 2,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });

  try {
    const state = host.state;
    const player = host.player;
    const carrier = host.spawnShip({ hullId: LIGHT_HULL_ID, pos: { ...CARRIER_POS }, rot: Math.PI / 2, team: 1 });
    const cluster = CLUSTER_POS.map((pos) => host.spawnShip({
      hullId: LIGHT_HULL_ID, pos: { ...pos }, rot: Math.PI / 2, team: 1,
    }));
    const clusterIds = new Set(cluster.map((e) => e.id));

    // Nobody in the cluster is flying: every metre any of them moves after the shove was given to
    // them by the room. Zero intent is written explicitly, not left to chance.
    const parkAll = () => {
      for (const e of [carrier, ...cluster]) {
        const data = e.data || (e.data = {});
        const intent = data.intent || (data.intent = {});
        intent.moveX = 0; intent.moveZ = 0; intent.turnIntent = 0;
        intent.boost = false; intent.brake = false; intent.fire = false; intent.fireGroup = null;
      }
    };
    parkAll();

    const bus = host.bus;
    const rec = {
      stuck: [], detonations: [], chainDetonations: [], primed: [], tumbled: [], killed: [], slams: [],
    };
    bus.on('charge:stuck', (p) => rec.stuck.push({ tick: state.tick | 0, chargeId: p && p.chargeId, hostId: p && p.hostId }));
    bus.on('charge:detonated', (p) => rec.detonations.push({
      tick: state.tick | 0, trigger: (p && p.trigger) || 'manual', hostId: p && p.hostId,
      hits: Array.isArray(p && p.hits) ? p.hits.length : 0,
    }));
    bus.on('chain:detonated', (p) => rec.chainDetonations.push({ tick: state.tick | 0, sourceId: p && p.sourceId, link: p && p.link }));
    bus.on('chain:primed', (p) => rec.primed.push({ tick: state.tick | 0, victimId: p && p.victimId, byId: p && p.byId, reason: p && p.reason }));
    bus.on('chain:slam', (p) => rec.slams.push({ tick: state.tick | 0, victimId: p && p.victimId, deltaV: p && p.deltaV, kind: p && p.kind }));
    bus.on('combat:tumbled', (p) => rec.tumbled.push({ tick: state.tick | 0, victimId: p && p.victimId, source: p && p.source, durationS: p && p.durationS }));
    bus.on('entity:killed', (p) => rec.killed.push({ tick: state.tick | 0, id: p && p.id }));

    // ── setup: the player throws a plate and it sticks. Cargo through the cargo writer.
    host.withFeatures(() => addCargo(state, CHARGE_COMMODITY, 2));
    let ticks = host.step(1, { before: () => { writeRealPathInput(state, {}); parkAll(); } });
    host.assertBodies([player, carrier, ...cluster], 'chain reaction cast');
    const proof = host.proof();
    if (proof.sg02Ready !== true || proof.backend !== 'rapier-dynamic') {
      throw new Error(`feel.chain_reaction: real path is not ready (sg02Ready=${proof.sg02Ready}, backend=${proof.backend})`);
    }
    if (proof.contactCaptureEnabled !== true) {
      throw new Error('feel.chain_reaction: SG-02 contact capture is OFF — every slam would be real physics with no receipt at all');
    }

    let thrown = false;
    ticks += host.step(THROW_TICKS, {
      before: () => {
        writeRealPathInput(state, {});
        parkAll();
        state.input.aimWorld = { x: carrier.pos.x, z: carrier.pos.z };
        if (!thrown) {
          state.input.actions.chargeThrow = true;
          thrown = true;
        }
      },
      after: () => {
        if (rec.stuck.length > 0) return false;
        return undefined;
      },
    });

    const stuck = rec.stuck.find((s) => s.hostId === carrier.id) || null;
    if (!stuck) {
      throw new Error(`feel.chain_reaction: the thrown plate never stuck to the carrier after ${THROW_TICKS} ticks — the "primed ship" premise was never established, and a chain counted from here would be counted from nothing`);
    }
    eventTrace.push({
      tick: stuck.tick,
      type: 'chain:primed_carrier',
      data: { carrierId: carrier.id, hostId: stuck.hostId },
    });

    // ── the ONE player action: a production concussion-cannon hit, aimed down the picket line.
    const weapon = WEAPONS.find((w) => w.id === GUN_WEAPON_ID) || null;
    const impulse = weapon ? resolveWeaponImpulseForHit(weapon, weapon.dmg) : null;
    const magnitude = impulse ? impulse.magnitude : 0;
    const cruise = readCruiseSpeed(carrier).cruiseSpeed;
    const carrierMass = massOf(carrier);
    const beforeSpeed = speedOf(carrier);
    const slingTick = state.tick | 0;
    const shot = deliverProductionGunHit(host, carrier, {
      attackerId: player.id,
      nx: 0,
      nz: 1,
      magnitude,
      weaponId: GUN_WEAPON_ID,
    });
    if (shot && shot.ok === false) {
      throw new Error(`feel.chain_reaction: the shove never routed (${shot.reason}) — there was no player action to count consequences from`);
    }
    eventTrace.push({
      tick: slingTick,
      type: 'chain:sling',
      data: { targetId: carrier.id, weaponId: GUN_WEAPON_ID, magnitude, mass: carrierMass },
    });

    // ── everything after this tick is the room answering.
    ticks += host.step(CHAIN_TICKS, { before: () => { writeRealPathInput(state, {}); } });
    const afterSlingSpeed = speedOf(carrier);

    const after = (row) => row.tick >= slingTick;
    const slamDetonations = rec.detonations.filter((d) => after(d) && d.trigger === 'slam');
    const sympathetic = rec.detonations.filter((d) => after(d) && d.trigger === 'sympathetic');
    const primes = rec.primed.filter(after);
    // A helm loss on a hull OTHER than the one the player shot. The carrier's own tumble is the
    // direct result of the shove, not a secondary consequence of it.
    const tumbles = rec.tumbled.filter((t) => after(t) && t.victimId !== carrier.id && clusterIds.has(t.victimId));
    const kills = rec.killed.filter((k) => after(k) && k.id !== player.id);
    const slams = rec.slams.filter(after);

    // THE CAUSAL LIST. Each entry is one distinct thing the room did that the player did not do.
    const causal = [];
    for (const d of slamDetonations) causal.push({ tick: d.tick, kind: 'slam_detonation', detail: `plate on #${d.hostId} went off on impact` });
    for (const p of primes) causal.push({ tick: p.tick, kind: 'primed', detail: `#${p.victimId} cooked by #${p.byId} (${p.reason})` });
    for (const t of tumbles) causal.push({ tick: t.tick, kind: 'helm_lost', detail: `#${t.victimId} lost the helm (${t.source})` });
    for (const d of sympathetic) causal.push({ tick: d.tick, kind: 'cook_off', detail: `#${d.hostId} cooked off` });
    for (const k of kills) causal.push({ tick: k.tick, kind: 'killed', detail: `#${k.id} destroyed` });
    causal.sort((a, b) => (a.tick - b.tick) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

    const distinctKinds = new Set(causal.map((c) => c.kind)).size;
    for (const c of causal) {
      eventTrace.push({ tick: c.tick, type: `chain:${c.kind}`, data: { detail: c.detail } });
    }

    return {
      measured: true,
      ticks,
      realPath: proof,
      carrierId: carrier.id,
      carrierCruise: cruise,
      primedBeforeSling: true,
      stuckHostId: stuck.hostId,
      playerActions: 1,
      slingImpulse: magnitude,
      slingDeltaV: carrierMass > 0 ? magnitude / carrierMass : 0,
      slingTick,
      slingSpeedBefore: beforeSpeed,
      slingSpeedAfter: afterSlingSpeed,
      consequences: causal.length,
      distinctKinds,
      causalList: causal.map((c) => `${c.kind}@t${c.tick}: ${c.detail}`),
      slamDetonations: slamDetonations.length,
      sympatheticDetonations: sympathetic.length,
      primes: primes.length,
      tumbles: tumbles.length,
      kills: kills.length,
      maxSlamDeltaV: slams.reduce((m, s) => Math.max(m, Number(s.deltaV) || 0), 0),
    };
  } finally {
    host.dispose();
  }
}

// ── the well arm ─────────────────────────────────────────────────────────────────────────────

async function runWellArm(seed, { eventTrace }) {
  // The fields system is a strict no-op under node unless this is opted in (src/data/fields.js
  // documents the headless opt-in). Without it the whole arm prints a clean table of zeros.
  // THE OPT-IN AND THE BOOT ARE BOTH INSIDE THE try: verbBench runs every scenario in ONE process,
  // so a boot that throws after the flag was raised would leave field forces switched on for every
  // lane that runs after this one — the exact golden-safety gate the flag exists to hold.
  const previousFieldsFlag = FIELD_FLAGS.enabled;
  let host = null;
  try {
    FIELD_FLAGS.enabled = true;
    host = await bootRealPath({
      seed,
      systems: [...CURVE_SYSTEMS],
      hulls: [{
        hullId: PLAYER_HULL_ID,
        pos: { x: WELL_PLAYER_POS.x, z: WELL_PLAYER_POS.z },
        rot: Math.PI / 2,
        isPlayer: true,
        factionId: 'faction_free',
      }],
    });
    const state = host.state;
    const a = host.spawnShip({ hullId: LIGHT_HULL_ID, pos: { ...WELL_BODY_POS[0] }, rot: 0, team: 1 });
    const b = host.spawnShip({ hullId: LIGHT_HULL_ID, pos: { ...WELL_BODY_POS[1] }, rot: 0, team: 1 });
    const park = () => {
      for (const e of [a, b]) {
        const data = e.data || (e.data = {});
        const intent = data.intent || (data.intent = {});
        intent.moveX = 0; intent.moveZ = 0; intent.turnIntent = 0;
        intent.boost = false; intent.brake = false; intent.fire = false; intent.fireGroup = null;
      }
    };
    park();

    const grinds = [];
    const grindPrimes = [];
    host.bus.on('well:grind', (p) => grinds.push({ tick: state.tick | 0, aId: p && p.aId, bId: p && p.bId, ticks: p && p.ticks }));
    host.bus.on('chain:primed', (p) => {
      if (p && p.reason === 'well_grind') grindPrimes.push({ tick: state.tick | 0, victimId: p.victimId });
    });

    let ticks = host.step(1, { before: () => { writeRealPathInput(state, {}); park(); } });
    host.assertBodies([a, b], 'chain reaction well arm');
    const proof = host.proof();

    // Deploy the Well at the site with the player's own verb, at the aim point.
    let deployed = false;
    const samples = [];
    const radius = FIELD_DEFS.well.radius;
    ticks += host.step(WELL_TICKS, {
      before: () => {
        writeRealPathInput(state, {});
        park();
        state.input.aimWorld = { x: WELL_CENTER.x, z: WELL_CENTER.z };
        if (!deployed) {
          state.input.actions.deployWell = true;
          deployed = true;
        }
      },
      after: () => {
        // Speed RELATIVE TO THE WELL (the emitter is static, so this is the body's own speed),
        // sampled only in the band where the field is unambiguously acting and the body has had
        // room to reach the law's equilibrium.
        for (const e of [a, b]) {
          if (!e.alive) continue;
          const r = Math.hypot(e.pos.x - WELL_CENTER.x, e.pos.z - WELL_CENTER.z);
          const frac = r / radius;
          if (frac < WELL_SAMPLE_BAND.lo || frac > WELL_SAMPLE_BAND.hi) continue;
          samples.push(speedOf(e));
        }
        return undefined;
      },
    });

    const fieldsRuntime = state.fields || {};
    const everRegistered = deployed && (grinds.length > 0 || samples.length > 0
      || (Array.isArray(fieldsRuntime.snapshot) && fieldsRuntime.snapshot.length > 0));
    const convergenceSpeed = samples.length > 0 ? Math.max(...samples) : null;
    const meanSpeed = samples.length > 0
      ? samples.reduce((s, v) => s + v, 0) / samples.length
      : null;
    const convergenceMet = convergenceSpeed != null
      && convergenceSpeed >= WELL_BAND.lo && convergenceSpeed <= WELL_BAND.hi;

    eventTrace.push({
      tick: ticks,
      type: 'chain:well',
      data: {
        deployed,
        samples: samples.length,
        convergenceSpeed,
        grinds: grinds.length,
        grindPrimes: grindPrimes.length,
      },
    });

    return {
      measured: samples.length > 0,
      deployed: everRegistered,
      ticks,
      realPath: proof,
      samples: samples.length,
      convergenceSpeed,
      meanSpeed,
      convergenceMet,
      grinds: grinds.length,
      grindPrimes: grindPrimes.length,
    };
  } finally {
    if (host) host.dispose();
    FIELD_FLAGS.enabled = previousFieldsFlag;
  }
}

// ── shared ───────────────────────────────────────────────────────────────────────────────────

function massOf(entity) {
  const body = entity && entity.physicsBody;
  const m = body && Number(body.mass) > 0 ? Number(body.mass) : Number(entity && entity.mass);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

function speedOf(entity) {
  const v = entity && entity.vel;
  return Math.hypot(Number(v && v.x) || 0, Number(v && v.z) || 0);
}

function clause(label, value, unit, met, proof, reason) {
  if (!proof) {
    return { bar: BAR_ID, label, value: null, unit, met: false, unmeasured: true, note: `UNMEASURED — ${reason}` };
  }
  return { bar: BAR_ID, label, value, unit, met: met === true };
}
