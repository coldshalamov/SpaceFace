// faction-verge-expansion — the Verge border-authority layer over the court row.
//
// Proves the expansion's player-facing behavior on the runtime owner
// (src/systems/faction_verge.js), against its public events and the state it
// actually persists — no other system is booted, so every money/standing move
// is asserted at the only legal seam: economy:chargeCredits /
// economy:grantCredits / faction:repDelta.
//
//   · checkpoint rings log, weigh and clear — strict rings demand route
//     authority; repeat challenged crossings escalate incident → scan → pursuit
//   · the manifest read rides the real customs seam (patrol:proximity →
//     player:scannedByPatrol → contraband:scanned) and files border incidents
//   · permit counters write tiered route authority gated on standing/credit/
//     record; windows lapse, bonds return, violations suspend, appeals reinstate
//   · escort demands walk a marked hull out or break into a pursuit
//   · pursuits chase, fine, post law on escape, resume across the boundary
//   · the whole layer is normalized, JSON-safe, bounded, receipt-guarded and
//     generation-checked against entity-id recycling
//
// Run: node --test test/faction-verge-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import vergeCourt, {
  vergeCourt as namedCourt,
  ensureVergeState,
  vergeBorderStatus,
  VERGE_BORDER,
  VERGE_PERMIT_TIERS,
  VERGE_MACHINE_BODIES,
} from '../src/systems/faction_verge.js';

const SEED = 4242;
const FACTION = 'faction_verge_layers';

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [vergeCourt] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_veil_nebula';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

const machine = (sim, kind, x, z, extra = {}) => sim.spawn({
  type: 'machine', team: 1, factionId: FACTION,
  pos: { x, z }, radius: VERGE_MACHINE_BODIES[kind].radius, mass: 400,
  hull: VERGE_MACHINE_BODIES[kind].hull, hullMax: VERGE_MACHINE_BODIES[kind].hull,
  collides: true, data: { machineKind: kind, ...extra },
});

const listen = (bus, event) => {
  const out = [];
  bus.on(event, (p) => out.push(p));
  return out;
};

const leaveRing = (sim, player, r = 2600) => {
  player.pos.x = r; // every default ring is 700 — far outside
  sim.step();
};
const enterRing = (sim, player, x = 0, z = 0) => {
  player.pos.x = x; player.pos.z = z;
  sim.step();
};

function pushViolation(state, machineId = 0) {
  const v = ensureVergeState(state);
  v.violations.push({ directive: 'VACATE', machineId, violatorId: state.playerId, at: state.simTime });
  return v;
}

// createSimulation forks the module singleton — internals live on the instance.
const court = (sim) => sim.registry.get('vergeCourt');

test('a checkpoint ring logs the crossing, weighs the hull, and clears it once per entry', () => {
  const { sim, state, bus, player } = boot();
  try {
    machine(sim, 'surveyor_prism', 0, 0);
    const cleared = listen(bus, 'verge:checkpointCleared');
    const weighed = listen(bus, 'verge:massWeighed');
    const v = ensureVergeState(state);

    sim.step();
    assert.equal(weighed.length, 1, 'the ring weighed the hull on entry');
    assert.equal(weighed[0].entityId, player.id);
    assert.equal(player.data.weighedMass, 24, 'true mass stamped');
    assert.equal(cleared.length, 1, 'the clean crossing closed once');
    assert.equal(v.watch.cleanStreak, 1);
    const key = `cp:m${state.entityList[1].id}`;
    assert.equal(v.checkpoints[key].crossings, 1, 'the ledger counts the crossing');

    sim.runTicks(5);
    assert.equal(cleared.length, 1, 'standing inside the ring never re-fires');

    leaveRing(sim, player);
    enterRing(sim, player);
    assert.equal(cleared.length, 2, 're-entry is a new crossing');
    assert.equal(v.checkpoints[key].crossings, 2);
    assert.equal(v.watch.cleanStreak, 2);
  } finally {
    sim.dispose();
  }
});

test('a streak of clean transits earns standing — receipt-guarded, once per plateau', () => {
  const { sim, state, bus, player } = boot();
  try {
    machine(sim, 'surveyor_prism', 0, 0);
    const rep = listen(bus, 'faction:repDelta');
    // Five crossings — the plateau at 5 notes standing once.
    sim.step(); // crossing 1 — the player boots already inside the ring
    for (let i = 0; i < 4; i++) { leaveRing(sim, player); enterRing(sim, player); }
    const streakReps = rep.filter((p) => p.reason === 'verge:clean_transit');
    assert.equal(streakReps.length, 1, 'the fifth clean transit noted standing once');
    assert.equal(streakReps[0].delta, 1);
    assert.equal(streakReps[0].factionId, FACTION);
    for (let i = 0; i < 5; i++) { leaveRing(sim, player); enterRing(sim, player); }
    assert.equal(rep.filter((p) => p.reason === 'verge:clean_transit').length, 2,
      'the tenth plateau noted standing — again, exactly once');
    assert.equal(ensureVergeState(state).watch.cleanStreak, 10);
  } finally {
    sim.dispose();
  }
});

test('challenged crossings escalate — incident, standing hit, manifest read, then pursuit', () => {
  const { sim, state, bus, player } = boot();
  try {
    const ring = machine(sim, 'auditor', 0, 0);
    pushViolation(state, ring.id); // a marked hull
    const challenged = listen(bus, 'verge:checkpointChallenged');
    const scans = listen(bus, 'verge:checkpointScan');
    const prox = listen(bus, 'patrol:proximity');
    const rep = listen(bus, 'faction:repDelta');
    const opened = listen(bus, 'verge:pursuitOpened');
    const fined = listen(bus, 'economy:chargeCredits');
    const directives = listen(bus, 'verge:directive');
    const incidents = () => ensureVergeState(state).incidents;

    sim.step(); // crossing 1 — challenged, scan ordered
    assert.equal(challenged.length, 1);
    assert.equal(challenged[0].strikes, 1);
    assert.equal(scans.length, 1, 'the manifest read was ordered');
    assert.equal(prox.length, 1, 'the read rides the real customs seam');
    assert.equal(prox[0].patrolId, ring.id);
    assert.equal(prox[0].factionId, FACTION);
    assert.equal(directives.some((d) => d.word === 'HOLD.'), true, 'HOLD. on the glass');
    assert.equal(incidents().some((i) => i.kind === 'unauthorized_crossing'), true);
    assert.equal(rep.filter((p) => p.reason === 'verge:unauthorized_crossing').length, 1);
    assert.equal(rep[0].delta, -4);
    assert.equal(ensureVergeState(state).scans.pendingPatrol, ring.id, 'the read is outstanding');

    // With no economy system booted, nothing answers — later reads stay queued
    // behind the outstanding one, so the seam never double-files.
    leaveRing(sim, player); enterRing(sim, player); // crossing 2
    assert.equal(challenged.length, 2);
    assert.equal(prox.length, 1, 'the outstanding read blocks a second order');

    leaveRing(sim, player); enterRing(sim, player); // crossing 3 — a pursuit posts
    assert.equal(challenged.length, 3);
    assert.equal(opened.length, 1, 'the third challenged crossing posts a pursuit');
    assert.equal(incidents().some((i) => i.kind === 'repeat_offender'), true);

    // The warden is an auditor — immobile, but the hull is standing on it:
    // inside catch radius, the interception closes the pursuit with a fine.
    sim.runTicks(10);
    const fines = fined.filter((p) => p.reason === 'verge:pursuit_fine');
    assert.equal(fines.length, 1, 'the intercept fine moved through the charge seam once');
    assert.ok(fines[0].amount >= VERGE_BORDER.pursuitFineCr);
    assert.equal(ensureVergeState(state).pursuit, null, 'the pursuit closed');
    assert.equal(incidents().some((i) => i.kind === 'intercepted'), true);
  } finally {
    sim.dispose();
  }
});

test('a strict authored ring demands route authority — a live bonded writ clears it', () => {
  const { sim, state, bus, player } = boot();
  try {
    machine(sim, 'witness', 0, 0, { vergeCheckpoint: { radius: 600, tier: 2 } });
    const cleared = listen(bus, 'verge:checkpointCleared');
    const challenged = listen(bus, 'verge:checkpointChallenged');

    sim.step();
    assert.equal(challenged.length, 1, 'no writ — the strict ring challenges');
    assert.equal(cleared.length, 0);

    // Hand the hull a live tier-2 writ and cross again.
    ensureVergeState(state).permit = {
      tier: 2, tierId: 'bonded', issuedAt: state.simTime,
      expiresAt: state.simTime + 600, issuerKey: 'test', suspended: false, receiptId: 'r1',
    };
    leaveRing(sim, player);
    enterRing(sim, player);
    assert.equal(cleared.length, 1, 'the bonded writ answers the ring');
    assert.equal(cleared[0].permitTier, 2);
  } finally {
    sim.dispose();
  }
});

test('an overweight manifest is fined through the charge seam — once per crossing', () => {
  const { sim, state, bus, player } = boot();
  try {
    machine(sim, 'surveyor_prism', 0, 0);
    state.player.cargo.usedMass = state.player.cargo.capMass + 30; // 30 over the cap
    const charges = listen(bus, 'economy:chargeCredits');
    const fined = listen(bus, 'verge:manifestFined');
    const directives = listen(bus, 'verge:directive');

    sim.step();
    const manifestFines = charges.filter((p) => p.reason === 'verge:manifest_fine');
    assert.equal(manifestFines.length, 1, 'one fine for the crossing');
    assert.equal(manifestFines[0].amount, Math.round(30 * VERGE_BORDER.massFinePerUnit));
    assert.equal(fined.length, 1);
    assert.equal(directives.some((d) => d.word === 'ISOLATE.'), true, 'ISOLATE. on the glass');
    assert.equal(ensureVergeState(state).incidents.some((i) => i.kind === 'overweight_manifest'), true);

    leaveRing(sim, player);
    enterRing(sim, player);
    assert.equal(charges.filter((p) => p.reason === 'verge:manifest_fine').length, 2,
      'each crossing files its own fine — the receipt keys the crossing, not the hull');
  } finally {
    sim.dispose();
  }
});

test('a hull whose mass disagrees with the record files a mass_drift incident', () => {
  const { sim, state, player } = boot();
  try {
    machine(sim, 'surveyor_prism', 0, 0);
    sim.step(); // first weigh stamps 24
    assert.equal(player.data.weighedMass, 24);
    leaveRing(sim, player);
    player.mass = 60; // an unlogged refit
    enterRing(sim, player);
    const v = ensureVergeState(state);
    assert.equal(v.incidents.some((i) => i.kind === 'mass_drift'), true,
      'the disagreement is on the record');
    assert.equal(player.data.weighedMass, 60, 'the new read is the record now');
  } finally {
    sim.dispose();
  }
});

test('manifest verdicts resolve the outstanding read — and only their own', () => {
  const { sim, state, bus } = boot();
  try {
    const ring = machine(sim, 'surveyor_prism', 0, 0);
    const v = ensureVergeState(state);
    const logged = listen(bus, 'verge:scanLogged');

    // A foreign scanner's verdict is not ours.
    court(sim)._orderScan(state, v, ring, 'cp:mine', false);
    bus.emit('player:scannedByPatrol', { patrolId: 99999, hasContraband: true, detected: true });
    assert.equal(logged.length, 0, 'a foreign verdict resolves nothing');
    assert.equal(v.scans.pendingPatrol, ring.id, 'our read is still outstanding');

    bus.emit('player:scannedByPatrol', { patrolId: ring.id, hasContraband: false });
    assert.equal(logged.length, 1);
    assert.equal(logged[0].result, 'clean');
    assert.equal(v.scans.clean, 1);
    assert.equal(v.scans.pendingPatrol, null);

    // An evaded read files an incident. (Ordered reads are spaced by a global
    // minimum — the border does not stack sweeps.)
    state.simTime += VERGE_BORDER.scanMinIntervalS + 1;
    court(sim)._orderScan(state, v, ring, 'cp:mine', false);
    bus.emit('player:scannedByPatrol', { patrolId: ring.id, hasContraband: true, detected: false });
    assert.equal(v.scans.evaded, 1);
    assert.equal(v.incidents.some((i) => i.kind === 'scan_evaded'), true);

    // A caught read waits for the contraband tail — filed exactly once.
    state.simTime += VERGE_BORDER.scanMinIntervalS + 1;
    court(sim)._orderScan(state, v, ring, 'cp:mine', false);
    bus.emit('player:scannedByPatrol', { patrolId: ring.id, hasContraband: true, detected: true });
    assert.equal(v.scans.found, 1);
    const before = v.incidents.length;
    bus.emit('contraband:scanned', { patrolId: ring.id, found: true, fine: 500, confiscated: [{ commodityId: 'x', qty: 2 }] });
    assert.equal(v.incidents.length, before + 1, 'the contraband tail files the incident');
    assert.equal(v.incidents[v.incidents.length - 1].kind, 'contraband');
    bus.emit('contraband:scanned', { patrolId: ring.id, found: true, fine: 500, confiscated: [] });
    assert.equal(v.incidents.length, before + 1, 'a second same-verdict packet cannot re-file');
  } finally {
    sim.dispose();
  }
});

test('the permit counter writes the best tier standing and credit can pay', () => {
  const { sim, state, bus, player } = boot();
  try {
    machine(sim, 'appeals_clerk', 0, 0);
    const granted = listen(bus, 'verge:permitGranted');
    const denied = listen(bus, 'verge:permitDenied');
    const charges = listen(bus, 'economy:chargeCredits');
    const clerk = state.entityList[1];

    state.player.credits = 0;
    sim.runTicks(Math.ceil(VERGE_BORDER.permitDwellS * 60) + 10);
    assert.equal(denied.length, 1);
    assert.equal(denied[0].reason, 'credit', 'empty pockets are read as credit');
    assert.equal(granted.length, 0);

    // Cool down the counter, fund the hull, dwell again.
    clerk.data.permitCooldownUntil = 0;
    state.player.credits = 3000;
    sim.runTicks(Math.ceil(VERGE_BORDER.permitDwellS * 60) + 10);
    assert.equal(granted.length, 1, 'a writ was written');
    assert.equal(granted[0].tier, 2, 'standing step 1 + credit buys bonded');
    assert.equal(granted[0].tierId, 'bonded');
    const fee = VERGE_PERMIT_TIERS.find((t) => t.tier === 2).feeCr;
    const permitCharges = charges.filter((p) => p.reason === 'verge:permit');
    assert.equal(permitCharges.length, 1, 'the fee moved through the charge seam once');
    assert.equal(permitCharges[0].amount, fee);
    const v = ensureVergeState(state);
    assert.equal(v.permit.tier, 2);
    assert.equal(v.permit.suspended, false);
    assert.ok(v.permit.expiresAt > v.permit.issuedAt, 'the window is stamped');

    // A violation suspends written authority until the court answers — the
    // suspension rides the violation path, not the bare record.
    const susp = listen(bus, 'verge:permitSuspended');
    court(sim)._recordViolation(state, clerk, player, 'VACATE');
    assert.equal(susp.length, 1, 'the suspension is announced once');
    assert.equal(v.permit.suspended, true, 'the violation suspends the writ');
  } finally {
    sim.dispose();
  }
});

test('permit denials read the real cause — record and standing', () => {
  const { sim, state, bus } = boot();
  try {
    machine(sim, 'appeals_clerk', 0, 0);
    const denied = listen(bus, 'verge:permitDenied');
    const clerk = state.entityList[1];
    const dwell = Math.ceil(VERGE_BORDER.permitDwellS * 60) + 10;

    pushViolation(state);
    state.player.credits = 5000;
    sim.runTicks(dwell);
    assert.equal(denied[0].reason, 'record', 'the court answers before any writ');

    ensureVergeState(state).violations.length = 0;
    state.factions[FACTION] = { rep: -60 }; // below rank step 1
    clerk.data.permitCooldownUntil = 0;
    sim.runTicks(dwell);
    assert.equal(denied[1].reason, 'standing', 'burned standing withholds authority');
  } finally {
    sim.dispose();
  }
});

test('a sealed window lapses cleanly — the bond rides home once', () => {
  const { sim, state, bus } = boot();
  try {
    machine(sim, 'appeals_clerk', 4000, 0); // far — no permit dwell interference
    const lapsed = listen(bus, 'verge:permitLapsed');
    const grants = listen(bus, 'economy:grantCredits');
    const rep = listen(bus, 'faction:repDelta');
    const v = ensureVergeState(state);

    v.permit = {
      tier: 3, tierId: 'sealed', issuedAt: state.simTime,
      expiresAt: state.simTime + 1, issuerKey: 'k', suspended: false, receiptId: 'per_test',
    };
    sim.runTicks(90); // past expiry
    assert.equal(lapsed.length, 1, 'the window closed once');
    const bond = grants.filter((p) => p.reason === 'verge:bond_return');
    assert.equal(bond.length, 1, 'the sealed bond returned through the grant seam once');
    assert.equal(bond[0].amount, VERGE_PERMIT_TIERS.find((t) => t.tier === 3).bondReturnCr);
    assert.equal(rep.filter((p) => p.reason === 'verge:permit_clean').length, 1);
    assert.equal(v.permit, null);
    sim.runTicks(60);
    assert.equal(lapsed.length, 1, 'no replay across ticks');
  } finally {
    sim.dispose();
  }
});

test('an escort demand walked to release expunges the oldest mark', () => {
  const { sim, state, bus, player } = boot();
  try {
    machine(sim, 'auditor', 0, 0); // immobile — a held escort
    pushViolation(state, state.entityList[1].id);
    const demanded = listen(bus, 'verge:escortDemanded');
    const released = listen(bus, 'verge:escortReleased');
    const rep = listen(bus, 'faction:repDelta');
    const v = ensureVergeState(state);

    player.pos.x = 80; // inside holdR
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 10);
    assert.equal(demanded.length, 1, 'the warden posted the escort');
    assert.equal(demanded[0].mode, 'hold', 'an auditor cannot walk — it holds');

    state.simTime += VERGE_BORDER.escortHoldS + 2; // ride the hold out
    sim.runTicks(5);
    assert.equal(released.length, 1, 'supervised passage completed');
    assert.equal(v.escort, null);
    assert.equal(v.violations.length, 0, 'the oldest mark is expunged');
    assert.equal(rep.filter((p) => p.reason === 'verge:escort_complied').length, 1);
    assert.equal(v.incidents.some((i) => i.kind === 'escorted'), true);
  } finally {
    sim.dispose();
  }
});

test('breaking an escort writes a violation and posts a pursuit that intercepts', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0); // mobile — it walks
    pushViolation(state, warden.id);
    const demanded = listen(bus, 'verge:escortDemanded');
    const broken = listen(bus, 'verge:escortBroken');
    const opened = listen(bus, 'verge:pursuitOpened');
    const intercepted = listen(bus, 'verge:pursuitIntercepted');
    const charges = listen(bus, 'economy:chargeCredits');
    const rep = listen(bus, 'faction:repDelta');
    const v = ensureVergeState(state);

    player.pos.x = 60;
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 10);
    assert.equal(demanded.length, 1);
    assert.equal(demanded[0].mode, 'walk', 'an executor walks you out');

    // Stand still: the warden walks away, the escort breaks, the pursuit posts.
    sim.runTicks(20 * 60);
    assert.equal(broken.length, 1, 'leaving the warden\'s radius broke the escort');
    assert.equal(v.escort, null);
    assert.equal(v.violations.some((x) => x.directive === 'ESCORT'), true,
      'the escort break is a directive violation');
    assert.equal(v.incidents.some((i) => i.kind === 'escort_broken'), true);
    assert.equal(rep.filter((p) => p.reason === 'verge:escort_broken').length, 1);
    assert.equal(opened.length, 1, 'the pursuit posted');
    assert.equal(intercepted.length, 1, 'the mobile warden caught the hull');
    const fines = charges.filter((p) => p.reason === 'verge:pursuit_fine');
    assert.equal(fines.length, 1, 'the intercept fine charged once');
    assert.ok(fines[0].amount >= VERGE_BORDER.pursuitFineCr);
    assert.equal(v.pursuit, null);
  } finally {
    sim.dispose();
  }
});

test('a pursuit outrun past the leash posts woken law instead of forgetting', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    const v = ensureVergeState(state);
    const escaped = listen(bus, 'verge:pursuitEscaped');
    const rep = listen(bus, 'faction:repDelta');
    v.pursuit = {
      id: 7, machineId: warden.id, gen: warden.occupantGeneration || 0,
      originX: warden.pos.x, originZ: warden.pos.z,
      openedAt: state.simTime, lastSeenAt: state.simTime, status: 'hot',
      sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };
    player.pos.x = VERGE_BORDER.pursuitEscapeR + 200;
    sim.step();
    assert.equal(escaped.length, 1, 'the crossing was recorded, not forgiven');
    assert.equal(v.pursuit, null);
    assert.equal(v.lawZones.length, 1, 'woken law grew where the flight ended');
    assert.equal(rep.filter((p) => p.reason === 'verge:border_flight').length, 1);
    assert.equal(v.incidents.some((i) => i.kind === 'pursuit_escape'), true);
  } finally {
    sim.dispose();
  }
});

test('a voluntary submission beside a ring settles the fine once', () => {
  const { sim, state, bus, player } = boot();
  try {
    const ring = machine(sim, 'surveyor_prism', 300, 0);
    const v = ensureVergeState(state);
    const submitted = listen(bus, 'verge:pursuitSubmitted');
    const charges = listen(bus, 'economy:chargeCredits');
    v.pursuit = {
      id: 9, machineId: 424242, gen: 0, // no living warden — the offer is to the ring
      originX: 300, originZ: 0, openedAt: state.simTime, lastSeenAt: state.simTime,
      status: 'hot', sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };
    player.pos.x = 300; player.pos.z = 40; // inside submit radius of the ring
    player.vel.x = 0; player.vel.z = 0;
    sim.runTicks(Math.ceil(VERGE_BORDER.pursuitSubmitS * 60) + 30);
    assert.equal(submitted.length, 1, 'the submission was accepted');
    assert.equal(submitted[0].machineId, ring.id);
    const fines = charges.filter((p) => p.reason === 'verge:pursuit_fine');
    assert.equal(fines.length, 1, 'the fine settled once');
    assert.equal(v.pursuit, null);
    assert.equal(v.incidents.some((i) => i.kind === 'submitted'), true);
  } finally {
    sim.dispose();
  }
});

test('jumping with a hot pursuit files boundary flight; re-entering a ring resumes it', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    const v = ensureVergeState(state);
    const crossed = listen(bus, 'verge:pursuitCrossed');
    const resumed = listen(bus, 'verge:pursuitResumed');
    const rep = listen(bus, 'faction:repDelta');
    v.pursuit = {
      id: 11, machineId: warden.id, gen: warden.occupantGeneration || 0,
      originX: warden.pos.x, originZ: warden.pos.z,
      openedAt: state.simTime, lastSeenAt: state.simTime, status: 'hot',
      sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };
    bus.emit('jump:start', {
      from: 'sector_veil_nebula', to: 'sector_ashfall_reach',
      fromPos: { x: 500, z: 0 }, playerId: player.id,
    });
    assert.equal(crossed.length, 1, 'the crossing was filed');
    assert.equal(v.pursuit.status, 'crossed', 'the pursuit waits at the border');
    assert.equal(v.incidents.some((i) => i.kind === 'boundary_flight'), true);
    assert.equal(v.lawZones.length, 1, 'law grew where you crossed');
    assert.equal(rep.filter((p) => p.reason === 'verge:border_flight').length, 1);

    // The file is read by any ring — stepping inside this one re-acquires you.
    // The jump actually moved the world: the resume must stamp the sector the
    // hull is in now, or the next sector:enter would re-file a stale flight.
    state.world.currentSectorId = 'sector_ashfall_reach';
    player.pos.x = 100; player.pos.z = 0;
    sim.step();
    assert.equal(resumed.length, 1, 'the checkpoint resumed the posted pursuit');
    assert.equal(v.pursuit.status, 'hot');
    assert.equal(v.pursuit.machineId, warden.id, 'the ring\'s machine owns the chase now');
    assert.equal(v.pursuit.sectorId, 'sector_ashfall_reach',
      'the resume re-stamps the live sector, not the sector the pursuit was filed in');
  } finally {
    sim.dispose();
  }
});

test('a dead warden cannot hold an escort, run a pursuit, or keep a read — exactly once', () => {
  const { sim, state, bus } = boot();
  try {
    const ring = machine(sim, 'surveyor_prism', 0, 0);
    const warden = machine(sim, 'executor', 5000, 0);
    const v = ensureVergeState(state);
    const logged = listen(bus, 'verge:scanLogged');

    court(sim)._orderScan(state, v, ring, 'cp:x', false);
    assert.equal(v.scans.pendingPatrol, ring.id);
    v.escort = {
      id: 1, machineId: warden.id, gen: warden.occupantGeneration || 0,
      demandedAt: state.simTime, untilAt: state.simTime + 60, holdR: 260,
      originX: warden.pos.x, originZ: warden.pos.z, dirX: 1, dirZ: 0,
      walkedR: 0, graceUsed: 0, mode: 'walk',
    };
    v.pursuit = {
      id: 2, machineId: warden.id, gen: warden.occupantGeneration || 0,
      originX: 0, originZ: 0, openedAt: state.simTime, lastSeenAt: state.simTime,
      status: 'hot', sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };

    warden.alive = false;
    bus.emit('entity:killed', { id: warden.id });
    assert.equal(v.escort, null, 'a dead warden cannot hold an escort');
    assert.equal(v.pursuit, null, 'a dead warden cannot run a pursuit');

    ring.alive = false;
    bus.emit('entity:killed', { id: ring.id });
    assert.equal(logged.length, 1, 'the outstanding read voided once');
    assert.equal(logged[0].result, 'void');
    bus.emit('entity:killed', { id: ring.id });
    assert.equal(logged.length, 1, 'a duplicate kill cannot re-file');
    assert.equal(v.scans.pendingPatrol, null);
  } finally {
    sim.dispose();
  }
});

test('a recycled entity id is never written through a stale generation', () => {
  const { sim, state, bus } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    const v = ensureVergeState(state);
    const cold = listen(bus, 'verge:pursuitCold');
    const intercepted = listen(bus, 'verge:pursuitIntercepted');

    // A stale (id, gen) pair names a dead occupant — the record must not resolve.
    const staleGen = (warden.occupantGeneration || 0) + 50;
    v.escort = {
      id: 3, machineId: warden.id, gen: staleGen,
      demandedAt: state.simTime, untilAt: state.simTime + 60, holdR: 260,
      originX: warden.pos.x, originZ: warden.pos.z, dirX: 1, dirZ: 0,
      walkedR: 0, graceUsed: 0, mode: 'walk',
    };
    sim.step();
    assert.equal(v.escort, null, 'the stale reference closed honest');
    assert.equal(warden.data.escortUntil, undefined, 'nothing was written to the live occupant');
    assert.equal(warden.data.pursuitId, undefined);

    v.pursuit = {
      id: 4, machineId: warden.id, gen: staleGen,
      originX: warden.pos.x, originZ: warden.pos.z,
      openedAt: state.simTime - 200, lastSeenAt: state.simTime - 200,
      status: 'hot', sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };
    const px = warden.pos.x;
    sim.step();
    assert.equal(cold.length, 1, 'the stale pursuit went cold instead of chasing');
    assert.equal(intercepted.length, 0, 'it cannot intercept through a dead id');
    assert.equal(warden.pos.x, px, 'the live body was never moved');
    assert.equal(warden.data.pursuitId, undefined, 'the live body was never marked');
    assert.equal(v.pursuit, null);
  } finally {
    sim.dispose();
  }
});

test('a marked hull draws the marked posture — treatment, watch and the read model agree', () => {
  const { sim, state, bus } = boot();
  try {
    const changes = listen(bus, 'verge:treatmentChanged');
    const v = ensureVergeState(state);

    sim.step();
    const base = vergeBorderStatus(state);
    assert.equal(base.treatment, 1, 'a fresh hull reads watched');
    assert.equal(base.watchLevel, 0);

    for (let i = 0; i < 3; i++) pushViolation(state);
    sim.step();
    assert.equal(v.treatment.level, 0, 'three violations mark the hull');
    assert.equal(changes.some((c) => c.to === 0), true);

    const s = vergeBorderStatus(state);
    assert.equal(s.treatment, 0);
    assert.equal(s.violations, 3);
    assert.equal(typeof s.incidentWeight, 'number');
    assert.equal(typeof s.scans.total, 'number');
    assert.equal(typeof s.checkpoints, 'number');
    assert.equal(s.rank.factionId, FACTION);
  } finally {
    sim.dispose();
  }
});

test('high standing or proven compliance reads Measured — the Line lightens', () => {
  const { sim, state } = boot();
  try {
    state.factions[FACTION] = { rep: 200 }; // rank step 2: Measured
    sim.step();
    const v = ensureVergeState(state);
    assert.equal(v.treatment.level, 2);
    assert.equal(vergeBorderStatus(state).treatment, 2);
    assert.equal(vergeBorderStatus(state).rank.step, 2);
  } finally {
    sim.dispose();
  }
});

test('a granted appeal reinstates suspended route authority', () => {
  const { sim, state, bus, player } = boot();
  try {
    const clerk = machine(sim, 'appeals_clerk', 0, 0);
    const v = ensureVergeState(state);
    v.permit = {
      tier: 1, tierId: 'transit', issuedAt: state.simTime,
      expiresAt: state.simTime + 900, issuerKey: 'k', suspended: false, receiptId: 'per_x',
    };
    const reinstated = listen(bus, 'verge:permitReinstated');
    const susp = listen(bus, 'verge:permitSuspended');

    // Break an order — the violation suspends the writ and convenes the court.
    court(sim)._recordViolation(state, clerk, player, 'VACATE');
    assert.equal(susp.length, 1);
    assert.equal(v.permit.suspended, true);
    assert.ok(v.court && v.court.convened, 'the court sits');

    // Win the appeal at mass — the writ returns with the charge.
    player.pos.x = clerk.pos.x + 60; player.pos.z = 0;
    sim.spawn({
      type: 'payload', team: 0, pos: { x: clerk.pos.x - 40, z: 30 },
      radius: 8, mass: 40, hull: 10, hullMax: 10, collides: true, data: { evidence: true },
    });
    sim.step();
    assert.equal(v.violations.length, 0, 'the charge is struck');
    assert.equal(v.permit.suspended, false, 'route authority reinstated');
    assert.equal(reinstated.length, 1);
    assert.equal(v.incidents.some((i) => i.kind === 'appeal_won'), true);
  } finally {
    sim.dispose();
  }
});

test('malformed and hostile state normalizes to a JSON-safe record — including after save:loaded', () => {
  const { sim, state, bus, player } = boot();
  try {
    state.verge = {
      violations: 'nope', court: 5, lawZones: {}, jurors: [true, true], jurorsAwake: 'x',
      appeals: null, lineClassGrants: NaN,
      seq: -4, checkpoints: [1, 2, 3], incidents: 'bad', receipts: 9, permitLog: {},
      permit: { tier: 99, tierId: 'nope', issuedAt: 'a', expiresAt: 'b' },
      scans: { seq: 'z', pendingPatrol: 'ghost' },
      escort: { machineId: 'alive' }, pursuit: { machineId: 1.5, status: 'weird' },
      watch: 'x', treatment: { level: 99, sinceAt: 'q' },
    };
    const v = ensureVergeState(state);
    assert.ok(Array.isArray(v.violations) && v.violations.length === 0);
    assert.equal(v.court, null, 'a malformed court is dropped — it cannot wedge the docket');
    assert.ok(Array.isArray(v.lawZones));
    assert.equal(v.jurors.length, 12);
    assert.equal(v.jurorsAwake, 0);
    assert.ok(Array.isArray(v.appeals) && Array.isArray(v.permitLog));
    assert.equal(v.seq, 0);
    assert.ok(v.checkpoints && !Array.isArray(v.checkpoints));
    assert.equal(v.permit, null, 'an impossible permit is dropped');
    assert.equal(v.scans.seq, 0);
    assert.equal(v.scans.pendingPatrol, null, 'a ghost patrol cannot hold a read');
    assert.equal(v.escort, null, 'a malformed escort is dropped');
    assert.equal(v.pursuit, null, 'a malformed pursuit is dropped');
    assert.equal(v.treatment.level, 1, 'out-of-band posture clamps');
    const json = JSON.stringify(state.verge);
    assert.ok(json.length > 10, 'the record is plain JSON');
    state.verge = JSON.parse(json); // a save-shaped copy must keep working
    machine(sim, 'surveyor_prism', 0, 0);
    sim.step();
    assert.equal(ensureVergeState(state).checkpoints[`cp:m${state.entityList[1].id}`].crossings, 1);

    // save:loaded re-normalizes hostile input inside the same listener seam.
    state.verge.permit = { tier: 'x' };
    state.verge.incidents = 'bad';
    bus.emit('save:loaded', {});
    const v2 = ensureVergeState(state);
    assert.equal(v2.permit, null);
    assert.ok(Array.isArray(v2.incidents));
    assert.equal(player.data.directiveViolated, undefined, 'normalization touches no runtime flags');

    // A closed pursuit is swept, a forged bench is dropped, and a sitting
    // court survives with its clerk generation healed.
    v2.pursuit = { id: 1, machineId: 3, status: 'closed' };
    v2.court = { convened: true, clerkId: 7 };
    ensureVergeState(state);
    assert.equal(v2.pursuit, null, 'a closed pursuit is swept');
    assert.equal(v2.court && v2.court.convened, true, 'a sitting court survives');
    assert.equal(v2.court.clerkId, 7);
    assert.equal(v2.court.clerkGen, 0, 'a missing generation heals to the slot guard');
    v2.court = { convened: false, clerkId: 7 };
    assert.equal(ensureVergeState(state).court, null, 'an unconvened bench cannot sit');
    v2.court = { convened: true, clerkId: 'ghost' };
    assert.equal(ensureVergeState(state).court, null, 'a string clerk id cannot hold the bench');
  } finally {
    sim.dispose();
  }
});

test('every ledger is bounded — incidents, receipts, checkpoints, permit log, docket', () => {
  const { sim, state } = boot();
  try {
    const v = ensureVergeState(state);
    for (let i = 0; i < VERGE_BORDER.incidentCap + 12; i++) {
      v.incidents.push({ id: `x${i}`, kind: 'contraband', weight: 1, at: 0, sectorId: null, machineId: null, note: '' });
    }
    for (let i = 0; i < VERGE_BORDER.receiptCap + 12; i++) v.receipts.push(`r${i}`);
    for (let i = 0; i < VERGE_BORDER.checkpointCap + 12; i++) {
      v.checkpoints[`k${i}`] = { crossings: 1, unauthorized: 0, strikes: 0, lastAt: i };
    }
    for (let i = 0; i < VERGE_BORDER.permitLogCap + 12; i++) v.permitLog.push({ id: `p${i}`, result: 'denied', at: 0 });
    for (let i = 0; i < VERGE_BORDER.violationCap + 12; i++) {
      v.violations.push({ directive: 'VACATE', machineId: 0, violatorId: 0, at: 0 });
    }
    ensureVergeState(state);
    assert.equal(v.incidents.length, VERGE_BORDER.incidentCap);
    assert.equal(v.receipts.length, VERGE_BORDER.receiptCap);
    assert.equal(Object.keys(v.checkpoints).length, VERGE_BORDER.checkpointCap);
    assert.equal(v.permitLog.length, VERGE_BORDER.permitLogCap);
    assert.equal(v.violations.length, VERGE_BORDER.violationCap + 12,
      'the court docket caps at write time — normalize leaves active records alone');
    assert.equal(v.incidents[0].id, 'x12', 'oldest evicted first');
  } finally {
    sim.dispose();
  }
});

test('the same seed produces the same record — the border runs on procedure, not chance', () => {
  const run = () => {
    const { sim, state, bus, player } = boot();
    try {
      machine(sim, 'auditor', 0, 0);
      pushViolation(state, state.entityList[1].id);
      const events = [];
      for (const ev of ['verge:checkpointChallenged', 'verge:checkpointScan',
        'verge:directive', 'verge:incident', 'faction:repDelta',
        'economy:chargeCredits', 'verge:pursuitOpened', 'verge:pursuitIntercepted']) {
        bus.on(ev, (p) => events.push({ ev, p }));
      }
      for (let i = 0; i < 4; i++) { enterRing(sim, player); leaveRing(sim, player); }
      sim.runTicks(60);
      const v = ensureVergeState(state);
      return { seq: v.seq, events, incidents: v.incidents.map((i) => `${i.id}:${i.kind}`) };
    } finally {
      sim.dispose();
    }
  };
  const a = run();
  const b = run();
  assert.deepEqual(b.seq, a.seq, 'identical id sequence');
  assert.deepEqual(b.incidents, a.incidents, 'identical incident ledger');
  assert.equal(b.events.length, a.events.length, 'identical event stream length');
  for (let i = 0; i < a.events.length; i++) {
    assert.equal(b.events[i].ev, a.events[i].ev);
    const pa = { ...a.events[i].p }, pb = { ...b.events[i].p };
    delete pa.tick; delete pb.tick;
    assert.deepEqual(pb, pa, `event ${a.events[i].ev} payload is reproducible`);
  }
});

test('sector:enter closes the live record without losing the file', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    const ring = machine(sim, 'surveyor_prism', 300, 0);
    const v = ensureVergeState(state);
    const logged = listen(bus, 'verge:scanLogged');

    court(sim)._orderScan(state, v, ring, 'cp:y', false);
    v.escort = {
      id: 5, machineId: warden.id, gen: warden.occupantGeneration || 0,
      demandedAt: state.simTime, untilAt: state.simTime + 60, holdR: 260,
      originX: 0, originZ: 0, dirX: 1, dirZ: 0, walkedR: 0, graceUsed: 0, mode: 'walk',
    };
    v.pursuit = {
      id: 6, machineId: warden.id, gen: warden.occupantGeneration || 0,
      originX: 0, originZ: 0, openedAt: state.simTime, lastSeenAt: state.simTime,
      status: 'hot', sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };

    bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach' });
    state.world.currentSectorId = 'sector_ashfall_reach';
    assert.equal(v.escort, null, 'no warden crosses the boundary');
    assert.equal(v.pursuit.status, 'crossed', 'the pursuit waits at the border');
    assert.equal(logged.length, 1);
    assert.equal(logged[0].result, 'void', 'the outstanding read voided at the crossing');

    player.pos.x = 300; player.pos.z = 0; // inside the ring left behind
    sim.step();
    assert.equal(v.pursuit.status, 'hot', 'a ring re-acquires the filed pursuit');
  } finally {
    sim.dispose();
  }
});

test('a same-sector re-enter does not invent a flight the hull never flew', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    pushViolation(state, warden.id);
    const v = ensureVergeState(state);
    const broken = listen(bus, 'verge:escortBroken');
    const rep = listen(bus, 'faction:repDelta');

    player.pos.x = 60;
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 10);
    assert.equal(v.escort.mode, 'walk');
    assert.equal(v.escort.sectorId, 'sector_veil_nebula', 'the demand stamped its sector');

    // A save restore re-enters the sector the save was in — same id — and the
    // escort record must not read that re-entry as a boundary crossing.
    bus.emit('sector:enter', { sectorId: 'sector_veil_nebula' });
    assert.ok(v.escort, 'the escort stands through a same-sector re-enter');
    assert.equal(broken.length, 0, 'no invented break on the record');
    assert.equal(rep.filter((p) => p.reason === 'verge:escort_broken').length, 0,
      'no invented fine');

    // A genuine cross-sector entry still breaks the escort on the record.
    bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach' });
    assert.equal(v.escort, null);
    assert.equal(broken.length, 1, 'the real crossing broke the escort');
    assert.equal(rep.filter((p) => p.reason === 'verge:escort_broken').length, 1);
  } finally {
    sim.dispose();
  }
});

// Precursor-site machines carry data.machine.kind, not data.machineKind — the
// production contract. The border layer must read kind under either contract:
// a court that only saw flat-contract machines would never convene in the game.
const siteMachine = (sim, kind, x, z, extra = {}) => sim.spawn({
  type: 'machine', team: 1, factionId: FACTION,
  pos: { x, z }, radius: VERGE_MACHINE_BODIES[kind].radius, mass: 400,
  hull: VERGE_MACHINE_BODIES[kind].hull, hullMax: VERGE_MACHINE_BODIES[kind].hull,
  collides: false, physicsBody: false,
  data: { machine: { kind, siteId: 'test_site', phase: 0, t: 0 }, ...extra },
});

test('precursor-contract machines post rings, clerk the court, weigh and wake the jury', () => {
  const { sim, state, bus, player } = boot();
  try {
    const clerk = siteMachine(sim, 'appeals_clerk', 5000, 0);
    const ring = siteMachine(sim, 'auditor', 0, 0);           // data.machine.kind only
    const engine = siteMachine(sim, 'measure', 0, 0);
    const jury = siteMachine(sim, 'sleeping_jury', 4000, 0);
    const challenged = listen(bus, 'verge:checkpointChallenged');
    const weighed = listen(bus, 'verge:massWeighed');
    const woke = listen(bus, 'verge:jurorWoke');
    const v = ensureVergeState(state);

    pushViolation(state, ring.id); // a marked hull — the ring challenges, not clears
    sim.step();
    assert.equal(challenged.length, 1, 'a data.machine.kind ring posts and challenges');
    court(sim)._recordViolation(state, ring, player, 'VACATE');
    assert.equal(v.court && v.court.clerkId, clerk.id,
      'the court convened at the precursor-contract clerk');
    assert.equal(weighed.some((w) => w.entityId === player.id && w.engineId === engine.id), true,
      'a precursor-contract measure engine weighed the hull');

    const testimony = sim.spawn({
      type: 'payload', team: 0, pos: { x: 100, z: 0 }, radius: 8, mass: 30,
      hull: 10, hullMax: 10, collides: true, data: { testimony: true },
    });
    sim.step();
    assert.equal(testimony.data.weighedMass, 30, 'the site engine stamped it');
    testimony.pos.x = jury.pos.x - 100;
    sim.step();
    assert.equal(woke.length, 1, 'a precursor jury woke on the weighed testimony');
    assert.equal(v.jurorsAwake, 1);
  } finally {
    sim.dispose();
  }
});

test('a boundary crossed mid-escort without a jump files the same record a jump does', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    pushViolation(state, warden.id);
    const broken = listen(bus, 'verge:escortBroken');
    const rep = listen(bus, 'faction:repDelta');
    const v = ensureVergeState(state);

    player.pos.x = 60;
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 10);
    assert.equal(v.escort.mode, 'walk');

    // Free flight across a Voronoi edge emits sector:enter with no jump:start —
    // and world.js has already moved currentSectorId to the far side, so the
    // escort must still break on the record, not vanish with the sector.
    state.world.currentSectorId = 'sector_ashfall_reach';
    bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', continuous: true });
    assert.equal(v.escort, null);
    assert.equal(broken.length, 1, 'the crossing broke the escort on the record');
    assert.equal(v.incidents.some((i) => i.kind === 'escort_broken'), true);
    assert.equal(v.violations.some((x) => x.directive === 'ESCORT'), true);
    assert.equal(rep.filter((p) => p.reason === 'verge:escort_broken').length, 1);
    // The warden is still in the cast (contiguous space) — a hot pursuit posts
    // and chases; it is not a boundary flight, nobody left its sector behind.
    assert.equal(v.pursuit && v.pursuit.machineId, warden.id, 'the chase continues');
    assert.equal(v.pursuit.status, 'hot');
    assert.equal(v.incidents.some((i) => i.kind === 'boundary_flight'), false);
  } finally {
    sim.dispose();
  }
});

test('a pursuit crossed without a jump files boundary flight once — and only once', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    const v = ensureVergeState(state);
    const crossed = listen(bus, 'verge:pursuitCrossed');
    const rep = listen(bus, 'faction:repDelta');
    v.pursuit = {
      id: 21, machineId: warden.id, gen: warden.occupantGeneration || 0,
      originX: warden.pos.x, originZ: warden.pos.z,
      openedAt: state.simTime, lastSeenAt: state.simTime, status: 'hot',
      sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };
    bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', continuous: true });
    assert.equal(v.pursuit.status, 'crossed');
    assert.equal(crossed.length, 1, 'the flight was filed');
    assert.equal(v.incidents.some((i) => i.kind === 'boundary_flight'), true);
    assert.equal(v.lawZones.length, 1, 'law grew at the crossing');
    assert.equal(rep.filter((p) => p.reason === 'verge:border_flight').length, 1);

    bus.emit('sector:enter', { sectorId: 'sector_glass_deep', continuous: true });
    assert.equal(crossed.length, 1, 'already crossed — no second filing');
    assert.equal(rep.filter((p) => p.reason === 'verge:border_flight').length, 1);
  } finally {
    sim.dispose();
  }
});

test('a crossed pursuit lets its warden go home — the file waits, not the body', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    const v = ensureVergeState(state);
    warden.data.returnPostX = warden.pos.x; // banked at the chase's open
    warden.data.returnPostZ = warden.pos.z;
    v.pursuit = {
      id: 24, machineId: warden.id, gen: warden.occupantGeneration || 0,
      originX: warden.pos.x, originZ: warden.pos.z,
      openedAt: state.simTime, lastSeenAt: state.simTime, status: 'hot',
      sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };
    warden.data.pursuitId = v.pursuit.id;
    // The chase drove the body this far from home before the hull crossed.
    warden.data.vergeDriven = true;
    warden.pos.x = 800;

    // A contiguous crossing keeps the warden in the cast — and it still must
    // not freeze: a crossed pursuit is carried by the file, not the body.
    state.world.currentSectorId = 'sector_ashfall_reach';
    bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', continuous: true });
    assert.equal(v.pursuit.status, 'crossed');
    assert.equal(warden.data.vergeDriven, undefined, 'the drive claim lifted');
    assert.equal(warden.data.pursuitId, undefined, 'the stale claim lifted');
    assert.equal(warden.data.returnToPost, true, 'the post is owed back');

    player.pos.x = 9000; player.pos.z = 0; // nowhere near any ring
    sim.runTicks(80 * 60);
    assert.ok(Math.abs(warden.pos.x) < 2 && Math.abs(warden.pos.z) < 2,
      `the warden drifted home while the file waited (x=${warden.pos.x.toFixed(1)})`);
    assert.equal(warden.data.returnToPost, undefined);
    assert.equal(warden.data.vergeDriven, undefined, 'the claim rests at the post');
  } finally {
    sim.dispose();
  }
});

test('a pursuit whose warden vanished goes cold as pursuit_cold — never as a submission', () => {
  const { sim, state, bus, player } = boot();
  try {
    const v = ensureVergeState(state);
    const cold = listen(bus, 'verge:pursuitCold');
    v.pursuit = {
      id: 22, machineId: 999999, gen: 0, // no living warden anywhere
      originX: 0, originZ: 0,
      openedAt: state.simTime - 1000, lastSeenAt: state.simTime - 1000,
      status: 'hot', sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };
    player.pos.x = 500; player.pos.z = 0;
    sim.step();
    assert.equal(cold.length, 1);
    const inc = v.incidents[v.incidents.length - 1];
    assert.equal(inc.kind, 'pursuit_cold', 'a cold trail is not a voluntary submission');
    assert.equal(v.pursuit, null);
  } finally {
    sim.dispose();
  }
});

test('a dead clerk adjourns the court — it re-seats or stands down, never wedges', () => {
  const { sim, state, bus, player } = boot();
  try {
    const deadClerk = machine(sim, 'appeals_clerk', 0, 0);
    const liveClerk = machine(sim, 'appeals_clerk', 9000, 0);
    const v = ensureVergeState(state);
    pushViolation(state);
    court(sim)._recordViolation(state, deadClerk, player, 'VACATE');
    assert.equal(v.court.clerkId, deadClerk.id);

    deadClerk.alive = false;
    bus.emit('entity:killed', { id: deadClerk.id });
    sim.step();
    assert.equal(v.court && v.court.clerkId, liveClerk.id,
      'the court re-seated at the living clerk');

    liveClerk.alive = false;
    bus.emit('entity:killed', { id: liveClerk.id });
    sim.step();
    assert.equal(v.court, null, 'no living clerk — the court stands down');
    // And the next violation can still convene — the bench is never locked.
    const clerk3 = machine(sim, 'appeals_clerk', 50, 0);
    court(sim)._recordViolation(state, clerk3, player, 'VACATE');
    assert.equal(v.court && v.court.clerkId, clerk3.id, 'a fresh violation convenes a fresh court');
  } finally {
    sim.dispose();
  }
});

test('an escort demand waits for a warden that can actually hold the hull', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'auditor', 0, 0); // hold-mode kind, ring radius 700
    pushViolation(state, warden.id);
    const demanded = listen(bus, 'verge:escortDemanded');
    const v = ensureVergeState(state);

    // Player lingers inside the ring, but the warden sits 500 off — past the
    // 260 hold radius (a shadowing executor's real standoff). The dwell banks;
    // no demand may fire while the body cannot hold the escort.
    player.pos.x = 500;
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 30);
    assert.equal(v.escort, null, 'no demand while the warden is out of hold range');
    assert.equal(demanded.length, 0);

    // In range at last — the banked dwell lands the demand this tick.
    warden.pos.x = 400; // now 100 from the hull
    sim.step();
    assert.equal(v.escort && v.escort.machineId, warden.id,
      'the demand fires the first tick the warden can hold');
    assert.equal(v.escort.mode, 'hold');
    assert.equal(demanded.length, 1);
  } finally {
    sim.dispose();
  }
});

test('a warden that walked or chased drifts home — the post is owed back', () => {
  const { sim, state, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0);
    const v = ensureVergeState(state);
    pushViolation(state, warden.id);

    player.pos.x = 60;
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 10);
    assert.equal(v.escort.mode, 'walk');
    // Stand still: the warden walks out, the escort breaks, the pursuit posts
    // and intercepts beside the hull — the machine owes its post a return.
    sim.runTicks(30 * 60);
    assert.equal(v.pursuit, null, 'the pursuit resolved');
    assert.equal(v.escort, null);
    player.pos.x = 9000; // step far out of the ring so no fresh escort is owed
    sim.runTicks(80 * 60);
    assert.ok(Math.abs(warden.pos.x) < 2 && Math.abs(warden.pos.z) < 2,
      `the warden returned to its post (x=${warden.pos.x.toFixed(1)})`);
    assert.equal(warden.data.returnToPost, undefined);
    assert.equal(warden.data.returnPostX, undefined);
  } finally {
    sim.dispose();
  }
});

test('a walking escort releases only while the hull is still inside the radius', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = machine(sim, 'executor', 0, 0); // mobile — it walks
    pushViolation(state, warden.id);
    const released = listen(bus, 'verge:escortReleased');
    const broken = listen(bus, 'verge:escortBroken');
    const v = ensureVergeState(state);

    player.pos.x = 60;
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 10);
    assert.equal(v.escort.mode, 'walk');
    assert.equal(warden.data.vergeDriven, true, 'the walk drive claims the body');

    // Ride the escort the whole way out: inside the radius, the walked
    // distance completes and the passage is released — never broken.
    for (let i = 0; i < 60 * 60 && v.escort; i++) {
      player.pos.x = warden.pos.x + 20; player.pos.z = warden.pos.z;
      sim.step();
    }
    assert.equal(released.length, 1, 'a completed walk releases');
    assert.equal(broken.length, 0, 'inside the whole way is nobody\'s break');
    assert.equal(v.incidents.some((i) => i.kind === 'escorted'), true);

    // The body's drive claim passes to the return drift — it rests at the post.
    player.pos.x = 9000; player.pos.z = 0;
    sim.runTicks(80 * 60);
    assert.equal(warden.data.vergeDriven, undefined, 'the claim rests when the body reaches home');
    assert.ok(Math.abs(warden.pos.x) < 2 && Math.abs(warden.pos.z) < 2, 'the warden is home');

    // A second demand, and this time the hull does not ride: the walk
    // distance completes under an absent hull — the record is a break, not a
    // release. Walking the radius does not pardon an absent hull.
    warden.data.escortUntil = 0;
    pushViolation(state, warden.id);
    player.pos.x = warden.pos.x + 20; player.pos.z = warden.pos.z;
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 30);
    assert.equal(v.escort && v.escort.mode, 'walk', 'the second demand posted');
    for (let i = 0; i < 60 * 60 && v.escort; i++) sim.step(); // stand still this time
    assert.equal(broken.length, 1, 'the walk out from under the hull broke');
    assert.equal(released.length, 1, 'no second release was invented');
    assert.equal(v.incidents.some((i) => i.kind === 'escort_broken'), true);
  } finally {
    sim.dispose();
  }
});

test('a precursor-contract warden walks and chases under the driven flag', () => {
  const { sim, state, bus, player } = boot();
  try {
    const warden = siteMachine(sim, 'executor', 0, 0); // data.machine.kind — the production shape
    pushViolation(state, warden.id);
    const demanded = listen(bus, 'verge:escortDemanded');
    const opened = listen(bus, 'verge:pursuitOpened');
    const intercepted = listen(bus, 'verge:pursuitIntercepted');
    const v = ensureVergeState(state);

    player.pos.x = 60;
    sim.runTicks(Math.ceil(VERGE_BORDER.escortDwellS * 60) + 10);
    assert.equal(demanded.length, 1, 'the site-contract warden demanded an escort');
    assert.equal(v.escort.mode, 'walk', 'a mobile precursor body walks');
    assert.equal(warden.data.vergeDriven, true, 'the precursor loop yields the body');
    const walked = warden.pos.x;
    sim.runTicks(30);
    assert.ok(warden.pos.x > walked, 'the warden actually walked');

    // Standing still breaks the escort; the pursuit re-claims the same body.
    sim.runTicks(20 * 60);
    assert.equal(v.escort, null);
    assert.equal(opened.length, 1, 'the site-contract warden posted a pursuit');
    assert.equal(intercepted.length, 1, 'the site executor ran the hull down');
    assert.equal(v.pursuit, null);

    // The claim finally rests when the body reaches its post.
    player.pos.x = 9000;
    sim.runTicks(80 * 60);
    assert.equal(warden.data.vergeDriven, undefined, 'the claim lifts when the record closes');
    assert.ok(Math.abs(warden.pos.x) < 2 && Math.abs(warden.pos.z) < 2,
      `the precursor warden returned to its post (x=${warden.pos.x.toFixed(1)})`);
  } finally {
    sim.dispose();
  }
});

test('a pursuit whose boundary crossing outran the emit still files the flight once', () => {
  const { sim, state, bus, player } = boot();
  try {
    const v = ensureVergeState(state);
    const crossed = listen(bus, 'verge:pursuitCrossed');
    const rep = listen(bus, 'faction:repDelta');
    v.pursuit = {
      id: 31, machineId: 999999, gen: 0, // the warden never crossed — it is gone
      originX: 0, originZ: 0,
      openedAt: state.simTime, lastSeenAt: state.simTime, status: 'hot',
      sectorId: 'sector_veil_nebula', crossedAt: 0, submitS: 0, fine: 900,
    };
    player.pos.x = 500;
    // The world moved first — a recovery hop, or a sector:enter emit that
    // lands after this tick already saw the new sector. The tick files the
    // same crossing the listeners write, receipt-guarded to exactly once.
    state.world.currentSectorId = 'sector_ashfall_reach';
    sim.step();
    assert.equal(v.pursuit.status, 'crossed');
    assert.equal(crossed.length, 1);
    assert.equal(v.incidents.some((i) => i.kind === 'boundary_flight'), true);
    assert.equal(rep.filter((p) => p.reason === 'verge:border_flight').length, 1);
    sim.step();
    assert.equal(crossed.length, 1, 'no second filing on the next tick');
    assert.equal(rep.filter((p) => p.reason === 'verge:border_flight').length, 1);
    assert.equal(v.incidents.some((i) => i.kind === 'pursuit_cold'), false,
      'a crossed hull is not a cold trail');
  } finally {
    sim.dispose();
  }
});

test('the read model weighs the record by the same fade the posture reads', () => {
  const { sim, state } = boot();
  try {
    const v = ensureVergeState(state);
    const now = state.simTime;
    v.incidents.push(
      { id: 'f', kind: 'contraband', weight: 2, at: now, sectorId: null, machineId: null, note: '' },
      { id: 's', kind: 'contraband', weight: 2, at: now - VERGE_BORDER.incidentFreshS - 10, sectorId: null, machineId: null, note: '' },
      { id: 'x', kind: 'contraband', weight: 2, at: now - VERGE_BORDER.incidentStaleS - 10, sectorId: null, machineId: null, note: '' },
      { id: 'u', kind: 'contraband', weight: 2, at: now + 60, sectorId: null, machineId: null, note: '' },
    );
    const s = vergeBorderStatus(state);
    assert.equal(s.incidentWeight, 3,
      'fresh weighs full, stale half — expired and future-dated records read nothing');
    assert.equal(s.freshIncidents, 2, 'the fresh list is the record before the shelf');
  } finally {
    sim.dispose();
  }
});

test('only leave-grammar directives count the honor — stepping out of a HOLD is not compliance', () => {
  const { sim, state, player } = boot();
  try {
    const vacater = machine(sim, 'witness', 0, 0, { vergeDirective: 'VACATE', directiveRadius: 400 });
    const holder = machine(sim, 'witness', 100, 0, { vergeDirective: 'HOLD', directiveRadius: 400 });
    const v = ensureVergeState(state);
    player.pos.x = 50; // inside both windows
    sim.step();
    assert.ok(Number.isFinite(vacater.data.directiveIssuedAt), 'the VACATE window opened');
    assert.ok(Number.isFinite(holder.data.directiveIssuedAt), 'the HOLD window opened');

    player.pos.x = 5000; // step out of both inside their windows
    sim.step();
    assert.equal(v.watch.directivesHonored, 1, 'only the leave-word counted');
    assert.equal(vacater.data.directiveHonored, true);
    assert.equal(holder.data.directiveHonored, undefined, 'a HOLD holds nobody');
  } finally {
    sim.dispose();
  }
});

test('a paid permit and its receipt ledger survive a save boundary — once, not twice', () => {
  const { sim, state, bus } = boot();
  try {
    machine(sim, 'appeals_clerk', 0, 0);
    state.player.credits = 3000;
    const charges = listen(bus, 'economy:chargeCredits');
    sim.runTicks(Math.ceil(VERGE_BORDER.permitDwellS * 60) + 10);
    const v = ensureVergeState(state);
    assert.equal(v.permit.tier, 2, 'the writ was written');
    assert.equal(charges.filter((p) => p.reason === 'verge:permit').length, 1);

    // The serializer's bag crosses a JSON boundary — the envelope's shape.
    const bag = JSON.parse(JSON.stringify(court(sim).serialize()));
    assert.equal(bag.permit.tierId, 'bonded', 'the paid permit rode the save');
    const receiptsInBag = bag.receipts.length;
    assert.ok(receiptsInBag > 0, 'the dedupe ledger rode the save');

    const other = boot();
    try {
      const charges2 = listen(other.bus, 'economy:chargeCredits');
      const restored = court(other.sim).deserialize(bag);
      assert.equal(restored.permit.tierId, 'bonded', 'the paid window restored');
      assert.equal(restored.permit.expiresAt, bag.permit.expiresAt);
      assert.equal(restored.receipts.length, receiptsInBag,
        'the receipt ledger restored intact — a replayed receipt cannot fire twice');
      other.bus.emit('save:loaded', {}); // the restore seam re-normalizes in place
      assert.equal(ensureVergeState(other.state).permit.tierId, 'bonded');
      other.sim.step();
      assert.equal(charges2.length, 0, 'restoration never re-charges the window');
    } finally {
      other.sim.dispose();
    }

    // And a hostile bag heals instead of restoring poison.
    const healed = court(sim).deserialize({ permit: 'no', receipts: 42, court: { convened: true, clerkId: 'ghost' } });
    assert.equal(healed.permit, null);
    assert.equal(healed.court, null);
  } finally {
    sim.dispose();
  }
});

test('default export and named export are the same system — the surface stayed additive', () => {
  assert.equal(vergeCourt, namedCourt);
  assert.equal(typeof vergeCourt.init, 'function');
  assert.equal(typeof vergeCourt.update, 'function');
  assert.equal(typeof vergeCourt.destroy, 'function');
  assert.equal(typeof ensureVergeState, 'function');
  assert.equal(typeof vergeBorderStatus, 'function');
  assert.ok(VERGE_MACHINE_BODIES.executor, 'the re-export stayed');
  assert.ok(Array.isArray(VERGE_PERMIT_TIERS) && VERGE_PERMIT_TIERS.length === 3);
});
