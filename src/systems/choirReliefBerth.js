// The Choir-Tender's surviving crew. uniqueWrecks owns the two durable outcomes;
// npcJobs flies the ships and combat owns every damaged/repaired component.
import { makeShipEntitySpec } from './ships.js';
import { SUBSYSTEM_DEFS } from '../data/combatDefs.js';
import { isSurvivalRunLive } from './adventureMigration.js';
import { indexedWorldRecordEntity } from '../world/livingWorldViews.js';

const WRECK = 'wreck_choir_tender';
const SECTOR = 'sector_helios_prime';
const ROLES = ['attendant', 'patient'];
const DRIVE = 'subsystem_drive';

// PB-JOBS-B (SF-085 + SF-077): the Helios medical berth is one real bed with a human rhythm.
// Mercy holds the bed from the moment her drive turns over until her treatment stay ends;
// relief runners arrive on a state.rng-jittered gap, hold at the ring while the bed is spoken
// for, are waved in when it frees, dwell a real service stay, then fly home. The cast is
// bounded — the rhythm sends at most RUNNER_MAX runners over the site's whole life and then
// goes quiet, so consequences stay meaningful and no patient is ever respawned to refill.
const BERTH_CAPACITY = 1;
const RUNNER_MAX = 2;
const RUNNER_ARRIVAL_MIN_S = 40;
const RUNNER_ARRIVAL_SPREAD_S = 30;
const RUNNER_SERVICE_S = 45;
const RUNNER_ADMIT_RANGE = 240;
const MERCY_BED_STAY_S = 90;
const RUNNER_LABELS = { 1: 'CHOIR RELIEF RUNNER · VESPER', 2: 'CHOIR RELIEF RUNNER · COMPLINE' };
const RUNNER_BIT = (k) => 1 << (k - 1);
const simNowOf = (state) => Math.max(0, Number(state.simTime) || 0);
// Null means "unset" for the berth's nullable timestamps and must survive the save
// round-trip as null: Number(null) is 0, which would make a restored nextArrivalAtS: 0
// read as "already due" and collapse the rhythm's first-beat jitter.
const nonNegOr = (value, fallback = null) => {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function normalizeChoirRelief(value) {
  const runnersSent = nonNegOr(value?.runnersSent, 0);
  return {
    attendantLost: value?.attendantLost === true,
    patientLost: value?.patientLost === true,
    driveRestored: value?.driveRestored === true,
    evacuated: value?.evacuated === true,
    ropeRepairPaid: value?.ropeRepairPaid === true,
    // Berth bookkeeping. Additive with defaults, so pre-berth saves normalize clean.
    // runnerBedOrdinal: which runner ordinal (1-based) currently holds the bed, 0 = none.
    // The ordinal, not a bare flag — a departed runner must never be re-admitted, and a
    // fresh runner must never inherit a previous runner's service clock.
    evacuatedAtS: nonNegOr(value?.evacuatedAtS),
    nextArrivalAtS: nonNegOr(value?.nextArrivalAtS),
    runnersSent,
    runnersDeparted: nonNegOr(value?.runnersDeparted, 0),
    runnersLostMask: nonNegOr(value?.runnersLostMask, 0),
    // An ordinal above the real sent-count can only be stale corruption — it must not hold
    // the bed: no runner of that ordinal was ever sent, so its admission would never be
    // examined and the bed would deadlock.
    runnerBedOrdinal: Math.min(nonNegOr(value?.runnerBedOrdinal, 0),
      Math.min(RUNNER_MAX, runnersSent)),
    runnerAdmittedAtS: nonNegOr(value?.runnerAdmittedAtS),
  };
}

export function createChoirReliefBerth(owner) {
  const { state, helpers, bus } = owner;
  const actors = new Map();
  const own = () => {
    const wrecks = owner._ensureState();
    return wrecks.choirRelief || (wrecks.choirRelief = normalizeChoirRelief());
  };
  const recordId = (role) => `choir-relief:${state.meta?.seed || 1}:${role}`;
  const actor = (role) => {
    const cached = actors.get(role);
    if (cached?.alive && state.entities.get(cached.id) === cached) return cached;
    const found = indexedWorldRecordEntity(state, recordId(role));
    if (found) actors.set(role, found);
    return found || null;
  };
  const kernel = () => {
    const combat = owner.registry?.get('combat');
    return combat?.ensureKernel?.() || combat?.kernel;
  };
  const component = (entity, id) => kernel()?.inspect({ entityId: entity.id })?.entity?.combat?.subsystems?.[id];
  const release = (entity) => {
    if (entity?.data?.jobId) helpers.npcJobs?.release(entity.data.jobId);
  };
  const wound = (entity, id, fraction) => {
    const part = component(entity, id);
    const def = SUBSYSTEM_DEFS.find((entry) => entry.id === id);
    if (!part || !def) return false;
    // Ion routing leaves hull untouched; this is the same component damage path as a shot.
    const result = kernel().routeDamage({ attackerId: null, targetId: entity.id,
      packet: { channels: { ion: def.armor.flat + part.health * fraction / def.armor.multipliers.ion },
        penetration: 0, shieldBypass: 1, subsystemShare: 1, hit: { subsystemId: id },
        source: { kind: 'choir_relief', id: WRECK } },
      origin: { kind: 'choir_relief', id: WRECK },
    });
    return result?.ok === true;
  };
  const station = () => {
    const index = state.entityIndex;
    const indexed = index && index.__spacefaceEntityIndexV1 && index.ready === true
      && index.byStationId instanceof Map
      ? index.byStationId.get('station_helios')
      : null;
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
    return (state.entityList || []).find((e) => e.alive && e.type === 'station'
      && e.data?.stationId === 'station_helios');
  };
  const spawn = (role, pos) => {
    const existing = actor(role);
    if (existing || own()[`${role}Lost`] || own().evacuated) return existing;
    // A world-resident copy can be temporarily absent from the near entity table.
    if (state.world?.records?.byId?.[recordId(role)]) return null;
    const spec = makeShipEntitySpec(role === 'attendant' ? 'ship_drifter' : 'ship_mule', {
      team: 2, factionId: 'faction_choir', pos,
      ai: { archetype: 'passive', passive: true, spawnContext: 'convoy_civilian' },
    });
    spec.flags = { persistent: true };
    Object.assign(spec.data, { worldRecordId: recordId(role), persistenceOwner: 'uniqueWrecks:choirRelief',
      choirReliefRole: role, sectorId: SECTOR,
      activityActorSlotId: `choir_relief_${role}`,
      trafficRole: role === 'attendant' ? 'tender' : 'shuttle',
      scanLabel: role === 'attendant' ? 'CHOIR ATTENDANT · LAST LIGHT' : 'CHOIR MEDICAL SHUTTLE · MERCY',
    });
    const entity = helpers.spawnEntity(spec);
    if (entity) actors.set(role, entity);
    return entity;
  };
  const sendHome = (entity, target) => {
    if (!entity || !target || (entity.data.choirReliefReturning && entity.data.jobId)) return;
    release(entity);
    const clearance = (target.radius || 50) + entity.radius + 30;
    const dx = entity.pos.x - target.pos.x, dz = entity.pos.z - target.pos.z;
    const length = Math.hypot(dx, dz) || 1;
    const jobId = helpers.npcJobs.assign(entity, { kind: 'hauler', sectorId: SECTOR, speed: 40,
      route: [{ id: 'relief-site', pos: { ...entity.pos } },
        { id: 'dest:station_helios', pos: { x: target.pos.x + dx / length * clearance,
          z: target.pos.z + dz / length * clearance }, label: 'Helios medical berth' }],
      payload: { choirRelief: true },
    });
    if (jobId) entity.data.choirReliefReturning = true;
  };

  // ── the relief berth itself ─────────────────────────────────────────────────────────────
  // Mercy's bed is derived, never a counter that can drift: she holds it from driveRestored
  // until her treatment stay ends after the handover (or death releases it early).
  const mercyHoldsBed = (relief, now) => {
    if (!relief.driveRestored || relief.patientLost) return false;
    if (!relief.evacuated) return true;
    return relief.evacuatedAtS != null && now < relief.evacuatedAtS + MERCY_BED_STAY_S;
  };
  const bedLoad = (relief, now) =>
    (mercyHoldsBed(relief, now) ? 1 : 0) + (relief.runnerBedOrdinal > 0 ? 1 : 0);
  // One beat of the rhythm: the next runner leaves on a state.rng-jittered gap. Scheduled at
  // a real transition only (first restore, a runner's departure, a runner's loss) — never
  // re-armed by the tick, so a mid-cycle null can't accelerate the queue.
  const scheduleArrival = (relief, now) => {
    if (relief.nextArrivalAtS != null || relief.runnersSent >= RUNNER_MAX) return;
    relief.nextArrivalAtS = now + RUNNER_ARRIVAL_MIN_S + state.rng() * RUNNER_ARRIVAL_SPREAD_S;
  };
  const stationPoint = (home, distance) => ({ x: home.pos.x + distance, z: home.pos.z });
  const assignRunnerJob = (runner, home, leg) => {
    if (!runner || (runner.data.choirReliefLeg === leg && runner.data.jobId)) return;
    release(runner);
    delete runner.data.jobId;
    const clear = (home.radius || 50) + 140;
    const legRoute = {
      hold: () => [{ id: 'relief-site', pos: { ...runner.pos } },
        { id: 'berth-hold', pos: stationPoint(home, clear + 80), label: 'Helios relief berth — holding' }],
      service: () => [{ id: 'berth-hold', pos: stationPoint(home, clear + 80) },
        { id: 'dest:station_helios', pos: stationPoint(home, clear * 0.5), label: 'Helios medical berth' }],
      outbound: () => [{ id: 'berth-service', pos: stationPoint(home, clear * 0.5) },
        { id: 'relief-outbound', pos: stationPoint(home, -(clear + 720)), label: 'Home to the congregation' }],
    }[leg];
    if (!legRoute) return;
    const jobId = helpers.npcJobs.assign(runner, { kind: 'hauler', sectorId: SECTOR, speed: 42,
      route: legRoute(), payload: { choirRelief: true } });
    if (jobId) runner.data.choirReliefLeg = leg;
  };
  // Same identity law as the named pair: one durable world record per runner, found again
  // through the record when the near table loses it, never duplicated, never respawned dead.
  const spawnRunner = (k) => {
    const role = `runner${k}`;
    if ((own().runnersLostMask & RUNNER_BIT(k)) !== 0) return { status: 'lost' };
    const existing = actor(role);
    if (existing) return { status: 'resident', entity: existing };
    // A world-resident copy can be temporarily absent from the near entity table.
    if (state.world?.records?.byId?.[recordId(role)]) return { status: 'resident' };
    const bearing = owner._ensureState().bearings[WRECK];
    const pos = bearing?.fixedPos || bearing?.exactPos || { x: 0, z: 0 };
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: 'faction_choir',
      pos: { x: pos.x - 260 - k * 30, z: pos.z + 150 + k * 20 },
      ai: { archetype: 'passive', passive: true, spawnContext: 'convoy_civilian' },
    });
    spec.flags = { persistent: true };
    Object.assign(spec.data, { worldRecordId: recordId(role), persistenceOwner: 'uniqueWrecks:choirRelief',
      choirReliefRole: role, choirReliefRunner: k, sectorId: SECTOR,
      activityActorSlotId: `choir_relief_${role}`, trafficRole: 'shuttle',
      scanLabel: RUNNER_LABELS[k] || `CHOIR RELIEF RUNNER ${k}` });
    const entity = helpers.spawnEntity(spec);
    if (entity) actors.set(role, entity);
    return { status: entity ? 'spawned' : 'failed', entity };
  };
  const syncReliefTraffic = (relief) => {
    const home = station();
    if (!home) return;
    const now = simNowOf(state);
    // First beat: a repair that turns Mercy's drive over opens the rhythm (backfill covers a
    // save taken between restore and schedule; gated to before any runner and any evacuation).
    if (relief.driveRestored && !relief.evacuated && relief.runnersSent === 0
      && relief.nextArrivalAtS == null) scheduleArrival(relief, now);
    if (relief.nextArrivalAtS != null && now >= relief.nextArrivalAtS
      && relief.runnersSent < RUNNER_MAX) {
      const k = relief.runnersSent + 1;
      const outcome = spawnRunner(k);
      if (outcome.status !== 'failed') {
        relief.runnersSent = k;
        relief.nextArrivalAtS = null;
        if (outcome.entity) assignRunnerJob(outcome.entity, home, 'hold');
      }
    }
    // One admitted runner at a time: the bed names its holder, the bed gates admission,
    // the clock gates departure. A runner who already flew her cycle is never re-admitted.
    const k = relief.runnersSent;
    if (k < 1) return;
    const runner = actor(`runner${k}`);
    if (!runner || runner.alive === false || (relief.runnersLostMask & RUNNER_BIT(k)) !== 0) return;
    if (relief.runnerBedOrdinal === k) {
      if (now - (relief.runnerAdmittedAtS ?? now) < RUNNER_SERVICE_S) return;
      // Service done: the bed frees, she flies home, and the rhythm may still send one more.
      relief.runnerBedOrdinal = 0;
      relief.runnerAdmittedAtS = null;
      relief.runnersDeparted = k;
      assignRunnerJob(runner, home, 'outbound');
      scheduleArrival(relief, now);
      return;
    }
    if (relief.runnerBedOrdinal !== 0 || relief.runnersDeparted >= k) return;
    if (bedLoad(relief, now) >= BERTH_CAPACITY) return; // the bed is spoken for — hold at the ring
    const reach = (home.radius || 50) + RUNNER_ADMIT_RANGE;
    if (Math.hypot(runner.pos.x - home.pos.x, runner.pos.z - home.pos.z) > reach) return;
    relief.runnerBedOrdinal = k;
    relief.runnerAdmittedAtS = now;
    assignRunnerJob(runner, home, 'service');
  };

  function sync() {
    if (isSurvivalRunLive(state.run)) return;
    const bearing = owner._ensureState().bearings[WRECK];
    if (!bearing || state.world?.currentSectorId !== SECTOR || !helpers.npcJobs || !kernel()) return;
    const relief = own();
    if (relief.evacuated) {
      // The mercy run is over, but the berth's bounded rhythm is not erased by it: a runner
      // already in flight finishes its cycle, and the departure/loss beats keep arming while
      // the cast lasts (runnersSent < RUNNER_MAX). Only the first-beat backfill is gated on
      // !evacuated — an evacuation with no runner ever sent opens no rhythm.
      syncReliefTraffic(relief);
      return;
    }
    const pos = bearing.fixedPos || bearing.exactPos;
    const patient = spawn('patient', { x: pos.x + 115, z: pos.z + 40 });
    const attendant = spawn('attendant', { x: pos.x + 200, z: pos.z + 40 });
    if (patient && !patient.data.choirReliefInitialized) {
      if (!relief.driveRestored && !wound(patient, DRIVE, 1)) return;
      wound(patient, 'subsystem_power', 0.75);
      // Mercy took the same hit her drive did. Hull below max means a taut line on her does
      // seconds of real repair work (latchRepair frees the drive once the plating is whole),
      // not a one-tick flag flip.
      if (Number.isFinite(patient.hull) && Number.isFinite(patient.hullMax)
          && patient.hull > patient.hullMax * 0.6) patient.hull = patient.hullMax * 0.6;
      patient.data.choirReliefInitialized = true;
    }
    if (relief.driveRestored) {
      const home = station();
      if (patient?.data.choirReliefReturning && !patient.data.jobId) {
        complete({ jobId: `job:${recordId('patient')}` });
      }
      if (!relief.evacuated) {
        sendHome(patient, home);
        sendHome(attendant, home);
      }
    } else if (!patient || !attendant) {
      // A world-resident copy can be temporarily absent from the near entity table; the
      // transient lookup must not stall the berth's own traffic below.
      release(attendant);
    } else {
      // Route to the actual patient, with clearance for both hulls. A towed patient gets no
      // remote repairs: the arrival/work range check below is against the live body.
      const existingJob = helpers.npcJobs.get(attendant.data.jobId)?.job;
      if (existingJob?.kind === 'tender' && existingJob.route[1].id !== `prey:${patient.id}`) {
        // A restored numeric target is not a new patient. Recommission through the job owner
        // rather than editing its saved route in place.
        release(attendant);
      }
      if (!attendant.data.jobId) {
        helpers.npcJobs.assign(attendant, { kind: 'tender', sectorId: SECTOR, speed: 35, workS: 18,
          route: [{ id: 'relief-tools', pos: { x: pos.x + 200, z: pos.z + 40 } },
            { id: `prey:${patient.id}`,
              pos: { x: patient.pos.x + patient.radius + attendant.radius + 14, z: patient.pos.z },
              label: 'Mercy drive repair' }],
        });
      }
    }
    // SF-141 — rescue-by-tow: Mercy does not need her drive back to live. A patient hull that
    // arrives inside the Helios berth slow enough to hold (the player's tether did the flying)
    // is a delivered survivor: the berth takes her, the attendant stands down, and the site
    // keeps the outcome. Nothing repairs the drive here — the hulk stays wounded, and the
    // same durable `evacuated` flag the swarm path sets records which mercy actually happened.
    if (!relief.evacuated && !relief.driveRestored && patient) {
      const home = station();
      if (home
        && Math.hypot(patient.pos.x - home.pos.x, patient.pos.z - home.pos.z)
          <= (home.radius || 50) + 240
        && Math.hypot(patient.vel?.x || 0, patient.vel?.z || 0) <= 8) {
        relief.evacuated = true;
        relief.evacuatedAtS = simNowOf(state);
        patient.data.scanLabel = 'CHOIR MEDICAL SHUTTLE · MERCY — TOWED HOME';
        sendHome(attendant, home);
        bus.emit('news:publish', {
          text: 'CHOIR-TENDER SURVIVORS REACH HELIOS — MERCY BROUGHT IN UNDER TOW.',
          kind: 'wreck_recovery', sourceRef: 'followup.choir_relief_evacuated', sectorId: SECTOR,
        });
      }
    }
    syncReliefTraffic(relief);
  }

  function work(payload) {
    const attendant = actor('attendant'), patient = actor('patient');
    if (!payload?.completed || !attendant?.data.jobId || payload.jobId !== attendant.data.jobId || !patient
      || state.world?.currentSectorId !== SECTOR || own().patientLost || own().attendantLost
      || own().driveRestored || Math.hypot(attendant.pos.x - patient.pos.x, attendant.pos.z - patient.pos.z)
        > attendant.radius + patient.radius + 55) return;
    const combat = kernel();
    if (!combat) return;
    // Hand tools restore the power plant while the drive waits for the recovered swarm.
    combat.repair(patient.id, 'subsystem_power', 12, 'choir_relief_stabilization');
    if (owner._ensureState().bearings[WRECK]?.outcome !== 'handed_over') return;
    const repaired = combat.repair(patient.id, DRIVE, 1e9, 'choir_returned_knitbots');
    const drive = component(patient, DRIVE);
    if (!repaired.ok && !(drive?.health > 0 && !drive.destroyed)) return;
    own().driveRestored = true;
    bus.emit('toast', { kind: 'info', ttl: 5,
      text: 'CHOIR · LAST LIGHT: Mercy has a drive again. Your swarm carries the survivors home.' });
    // npcJobs rechecks entry identity after delivering an intent, so this producer can
    // replace its finished service job immediately without waiting for the economy clock.
    sync();
  }

  function complete(payload) {
    if (own().evacuated || payload?.jobId !== `job:${recordId('patient')}` || !own().driveRestored) return;
    const patient = actor('patient'), home = station();
    if (!patient?.data.choirReliefReturning || !home
      || Math.hypot(patient.pos.x - home.pos.x, patient.pos.z - home.pos.z) > (home.radius || 50) + 160
      || Math.hypot(patient.vel?.x || 0, patient.vel?.z || 0) > 8) return;
    own().evacuated = true;
    // Her treatment stay keeps the medical bed hers for a while after the handover news.
    own().evacuatedAtS = simNowOf(state);
    bus.emit('news:publish', { text: 'CHOIR-TENDER SURVIVORS REACH HELIOS. MERCY FLIES AGAIN.',
      kind: 'wreck_recovery', sourceRef: 'followup.choir_relief_evacuated', sectorId: SECTOR });
  }

  // A taut-line repair restores the same drive component the returned swarm does. The berth
  // reads the shared subsystemEnabled event so a player who knits Mercy with their own rope is
  // credited the same as one who hands the knitbots back.
  function enabled(payload) {
    if (!payload || payload.subsystemId !== DRIVE) return;
    const relief = own();
    if (relief.driveRestored || relief.evacuated || relief.patientLost) return;
    const patient = actor('patient');
    if (!patient || payload.targetId !== patient.id) return;
    relief.driveRestored = true;
    if (state.playerId != null && payload.repairedBy === state.playerId) {
      // Gratitude once per site: a re-disabled then re-knitted Mercy is still the same mercy.
      if (!relief.ropeRepairPaid) {
        relief.ropeRepairPaid = true;
        bus.emit('faction:repDelta', { factionId: 'faction_choir', delta: 6,
          reason: 'choir_relief:mercy_hand_repair' });
      }
      bus.emit('toast', { kind: 'info', ttl: 5,
        text: 'CHOIR · LAST LIGHT: Mercy thrusts. Your line did what their hands could not.' });
    }
    sync();
  }

  // driveRestored is not a point of no return: raider fire or a finally-dead power plant can
  // re-disable Mercy on the way home. Revert to the tending state so a second repair (rope or
  // tools) is what actually gets her home — not a stale flag on a dead drive.
  function disabled(payload) {
    if (!payload || payload.subsystemId !== DRIVE) return;
    const relief = own();
    if (!relief.driveRestored || relief.evacuated || relief.patientLost) return;
    const patient = actor('patient');
    if (!patient || payload.targetId !== patient.id) return;
    relief.driveRestored = false;
    release(patient);
    delete patient.data.jobId;
    delete patient.data.choirReliefReturning;
  }

  function killed(payload) {
    for (const role of ROLES) {
      // Numeric entity ids recycle; a stale cached actor must not re-charge the ledger.
      if (own()[`${role}Lost`]) continue;
      const entity = actors.get(role) || actor(role);
      if (!entity || payload?.id !== entity.id) continue;
      own()[`${role}Lost`] = true;
      release(entity);
      // Their dead cost more than a barkeep line: the congregation's standing drops on record.
      if (state.playerId != null && payload.killerId === state.playerId) {
        bus.emit('faction:repDelta', { factionId: 'faction_choir', delta: -8,
          reason: `choir_relief:${role}_killed` });
      }
    }
    // Relief runners answer to the same law: one loss, one charge, one durable record —
    // an admitted runner's death frees the bed, and the congregation sends the next runner
    // only while the bounded cast lasts.
    const relief = own();
    const now = simNowOf(state);
    for (let k = 1; k <= Math.min(relief.runnersSent, RUNNER_MAX); k++) {
      if ((relief.runnersLostMask & RUNNER_BIT(k)) !== 0) continue;
      const role = `runner${k}`;
      const entity = actors.get(role) || actor(role);
      if (!entity || payload?.id !== entity.id) continue;
      relief.runnersLostMask |= RUNNER_BIT(k);
      release(entity);
      if (relief.runnerBedOrdinal === k) {
        relief.runnerBedOrdinal = 0;
        relief.runnerAdmittedAtS = null;
      }
      if (state.playerId != null && payload.killerId === state.playerId) {
        bus.emit('faction:repDelta', { factionId: 'faction_choir', delta: -6,
          reason: `choir_relief:${role}_killed` });
      }
      scheduleArrival(relief, now);
    }
  }

  // Read-only detached-scalar projection of the berth's capacity state (HUD/debug/tests),
  // matching the npcJobsRuntime berthStatus precedent. Callers cannot mutate the record.
  function berthStatus() {
    const relief = own();
    const now = simNowOf(state);
    return {
      capacity: BERTH_CAPACITY,
      mercyBed: mercyHoldsBed(relief, now),
      runnerBed: relief.runnerBedOrdinal > 0,
      load: bedLoad(relief, now),
      runnersSent: relief.runnersSent,
      runnersDeparted: relief.runnersDeparted,
      nextArrivalAtS: relief.nextArrivalAtS,
    };
  }

  return { sync, work, complete, killed, enabled, disabled,
    clear: () => actors.clear(), berthStatus };
}
