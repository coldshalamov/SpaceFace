// The Choir-Tender's surviving crew. uniqueWrecks owns the two durable outcomes;
// npcJobs flies the ships and combat owns every damaged/repaired component.
import { makeShipEntitySpec } from './ships.js';
import { SUBSYSTEM_DEFS } from '../data/combatDefs.js';
import { isSurvivalRunLive } from './adventureMigration.js';

const WRECK = 'wreck_choir_tender';
const SECTOR = 'sector_helios_prime';
const ROLES = ['attendant', 'patient'];
const DRIVE = 'subsystem_drive';

export function normalizeChoirRelief(value) {
  return {
    attendantLost: value?.attendantLost === true,
    patientLost: value?.patientLost === true,
    driveRestored: value?.driveRestored === true,
    evacuated: value?.evacuated === true,
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
    const found = state.entityList.find((e) => e.alive && e.data?.worldRecordId === recordId(role));
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
  const station = () => state.entityList.find((e) => e.alive && e.type === 'station'
    && e.data?.stationId === 'station_helios');
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

  function sync() {
    if (isSurvivalRunLive(state.run)) return;
    const bearing = owner._ensureState().bearings[WRECK];
    if (!bearing || state.world?.currentSectorId !== SECTOR || !helpers.npcJobs || !kernel()) return;
    const relief = own();
    if (relief.evacuated) return;
    const pos = bearing.fixedPos || bearing.exactPos;
    const patient = spawn('patient', { x: pos.x + 115, z: pos.z + 40 });
    const attendant = spawn('attendant', { x: pos.x + 200, z: pos.z + 40 });
    if (patient && !patient.data.choirReliefInitialized) {
      if (!relief.driveRestored && !wound(patient, DRIVE, 1)) return;
      wound(patient, 'subsystem_power', 0.75);
      patient.data.choirReliefInitialized = true;
    }
    if (relief.driveRestored) {
      const home = station();
      if (patient?.data.choirReliefReturning && !patient.data.jobId) {
        complete({ jobId: `job:${recordId('patient')}` });
        if (relief.evacuated) return;
      }
      sendHome(patient, home);
      sendHome(attendant, home);
      return;
    }
    if (!patient || !attendant) { release(attendant); return; }
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
    bus.emit('news:publish', { text: 'CHOIR-TENDER SURVIVORS REACH HELIOS. MERCY FLIES AGAIN.',
      kind: 'wreck_recovery', sourceRef: 'followup.choir_relief_evacuated', sectorId: SECTOR });
  }

  function killed(payload) {
    for (const role of ROLES) {
      const entity = actors.get(role) || actor(role);
      if (!entity || payload?.id !== entity.id) continue;
      own()[`${role}Lost`] = true;
      release(entity);
    }
  }

  return { sync, work, complete, killed, clear: () => actors.clear() };
}
