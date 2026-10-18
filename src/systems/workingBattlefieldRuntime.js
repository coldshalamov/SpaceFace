// M17 composes the existing demolition owner, crusher fields and combat deaths.
// Actor snapshots live inside mission params, alongside the ordinary durable target slots.
import { KILL_MACHINE_BY_ID } from '../data/environmentalMachinery.js';
import { MISSION_TUNING } from '../data/missions.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../data/wreckClasses.js';
import { makeEnemySpawnSpec } from './combat.js';

const MACHINE = KILL_MACHINE_BY_ID.excavator_jaws;
const OFFER_ID = 'working_battlefield:excavator_jaws';
const ALLOTMENT = 2;
const OUTPUT_DEDUCTION = 180;
const CAST = Object.freeze([
  { role: 'demolition_tower', label: 'Crusher control tower', along: 60, across: -30,
    radius: 26, mass: 180, hull: 160 },
  { role: 'crusher_workpiece', label: 'Crusher workpiece', along: 60, across: 70,
    radius: 12, mass: 240, hull: 1000 },
  { role: 'crusher_output', label: 'Finished ore pallet', along: -95, across: -110,
    radius: 14, mass: 35, hull: 100 },
  { role: 'rescue_escort', label: 'Tower picket', along: -110, across: 170 },
  { role: 'rescue_escort', label: 'Tower picket', along: 180, across: -160 },
]);

function at(along, across) {
  return { x: MACHINE.globalPos.x + MACHINE.dir.x * along + MACHINE.perp.x * across,
    z: MACHINE.globalPos.z + MACHINE.dir.z * along + MACHINE.perp.z * across };
}

function castOf(owner, mission, slot) {
  return owner.state.entityList.find(e => e.alive !== false && e.data?.missionTag === mission.id
    && e.data?.battlefieldSlot === slot) || null;
}

function announce(owner, text) {
  owner.bus.emit('toast', { text, kind: 'info', ttl: 6 });
}

export function workingBattlefieldObjective(mission) {
  const job = mission.params.workingBattlefield;
  return job.towerBroken
    ? 'Tower down. Cut the crusher plate to contain it, or leave the yard'
    : job.workpieceLost
      ? 'Workpiece lost. Cut the crusher plate, then shoot the marked tower'
      : 'Swing the crusher workpiece into the tower; repeat, or cut the plate and use guns';
}

export function workingBattlefieldFocus(owner, mission) {
  const target = mission.params.workingBattlefield.towerBroken
    ? owner.state.entityList.find(e => e.alive !== false && e.data?.killMachineAnvilId === MACHINE.anvil.id)
    : castOf(owner, mission, 0);
  return { targetEntityId: target?.id || null,
    pos: target ? { x: target.pos.x, z: target.pos.z } : { ...MACHINE.globalPos },
    reason: workingBattlefieldObjective(mission) };
}

export function workingBattlefieldPreflight(state) {
  const pilot = state.entities.get(state.playerId);
  if (!pilot?.data?.miningBeam || !pilot.data.weapons?.length) {
    return { ok: false, reason: 'Fit a mining beam and a gun at the Helios shipyard before taking this job.' };
  }
  if (!state.story?.flags?.workingBattlefieldPolymers) {
    const hold = state.player.cargo;
    if (hold.capVolume - hold.usedVolume < ALLOTMENT * 1.2) {
      return { ok: false, reason: 'Make 2.4u of cargo room for the two job polymers before accepting.' };
    }
  }
  return { ok: true };
}

export function grantWorkingBattlefieldPolymers(owner, mission, addCargo) {
  mission.chainNextSeed = null;
  const flags = owner.state.story.flags || (owner.state.story.flags = {});
  if (flags.workingBattlefieldPolymers) return;
  const granted = addCargo(owner.state, 'cmdty_polymers', ALLOTMENT);
  flags.workingBattlefieldPolymers = true;
  mission.params.workingBattlefield.polymerGranted = granted;
  announce(owner, 'Two job polymers loaded for the contact sprayer. No refills; guns and the mining beam need none.');
}

export function snapshotWorkingBattlefield(owner, mission) {
  const job = mission.params.workingBattlefield;
  job.bodies ||= {};
  for (let slot = 0; slot < CAST.length; slot++) {
    const entity = castOf(owner, mission, slot);
    if (!entity) continue;
    job.bodies[slot] = { pos: { ...entity.pos }, vel: { ...entity.vel }, rot: entity.rot,
      angVel: entity.angVel, hull: entity.hull, shield: entity.shield, armorHp: entity.armorHp };
  }
}

export function spawnWorkingBattlefield(owner, mission) {
  const job = mission.params.workingBattlefield;
  job.bodies ||= {};
  for (let slot = 0; slot < CAST.length; slot++) {
    const saved = job.bodies[slot];
    if (saved?.destroyed) continue;
    const adopted = castOf(owner, mission, slot);
    if (adopted) {
      if (!mission.targetEntityIds.includes(adopted.id)) mission.targetEntityIds.push(adopted.id);
      continue;
    }
    const row = CAST[slot];
    const pos = saved?.pos || at(row.along, row.across);
    const spec = slot >= 3
      ? makeEnemySpawnSpec('wasp_swarmer', 2, pos, { startedTick: owner.state.tick })
      : { type: slot === 1 ? 'asteroid' : 'wreck', team: 2, pos, vel: { x: 0, z: 0 }, rot: MACHINE.rot,
        radius: row.radius, mass: row.mass, hull: row.hull, hullMax: row.hull,
        collides: true, physicsBody: { schemaVersion: 1, mass: row.mass,
          radius: row.radius, dynamic: true, material: slot === 1 ? 'asteroid' : 'debris',
          ...(slot === 0 ? { shape: 'capsule' } : {}) },
        data: { proportions: WRECK_COLLIDER_PROPORTIONS, tetherable: true,
          ...(slot === 1 ? { typeId: 'ast_common_rock' } : {}) } };
    if (saved) {
      spec.vel = { ...saved.vel };
      for (const key of ['rot', 'angVel', 'hull', 'shield', 'armorHp']) {
        if (Number.isFinite(saved[key])) spec[key] = saved[key];
      }
    }
    spec.data ||= {};
    Object.assign(spec.data, { missionTag: mission.id, physicalRole: row.role,
      battlefieldSlot: slot, scanLabel: row.label });
    const entity = owner.helpers.spawnEntity(spec);
    if (!entity) continue;
    owner._stampMissionTargetIdentity(entity, mission, slot);
    mission.targetEntityIds.push(entity.id);
  }
}

export function workingBattlefieldKilled(owner, mission, receipt, victim) {
  const slot = victim?.data?.battlefieldSlot;
  if (!Number.isInteger(slot) || victim.hull > 0) return;
  const job = mission.params.workingBattlefield;
  job.bodies ||= {};
  job.bodies[slot] = { destroyed: true };
  if (slot === 0 && !job.towerBroken) {
    job.towerBroken = true;
    job.destructionCause = receipt.presentation?.cause || 'generic';
    job.method = receipt.presentation?.impact ? 'wrecking_ball' : 'cut_down';
    mission.needsTargets = false;
    announce(owner, workingBattlefieldObjective(mission));
  } else if (slot === 1 && !job.workpieceLost) {
    job.workpieceLost = true;
    if (!job.towerBroken) announce(owner, workingBattlefieldObjective(mission));
  } else if (slot === 2 && !job.outputLost) {
    job.outputLost = true;
    announce(owner, 'Finished output lost. The yard will deduct 180 cr; contain the crusher or escape after demolition.');
  }
  owner._refreshTrackedMissionNav(mission);
  owner.bus.emit('mission:updated', { missionId: mission.id });
}

export function driveWorkingBattlefield(owner, mission, index) {
  const job = mission.params.workingBattlefield;
  if (!job.towerBroken) return;
  const state = owner.state;
  const stopped = !!state.world.discovery[MACHINE.sectorId]?.machineShutdowns?.[MACHINE.id];
  const pilot = state.entities.get(state.playerId);
  const escaped = state.world.currentSectorId !== MACHINE.sectorId || (pilot?.pos
    && Math.hypot(pilot.pos.x - MACHINE.globalPos.x, pilot.pos.z - MACHINE.globalPos.z) > 330);
  if (!stopped && !escaped) return;
  job.aftermath = stopped ? 'contained' : 'escaped';
  if (job.outputLost) mission.reward_cr = Math.max(0, mission.reward_cr - OUTPUT_DEDUCTION);
  announce(owner, `Tower demolished; ${stopped ? 'crusher contained' : 'pilot clear of the working crusher'}. `
    + `${job.outputLost ? 'Output lost; 180 cr deducted. ' : 'Finished output preserved. '}${mission.reward_cr} cr paid.`);
  owner._completePhysical(mission, index, job.method);
}

export const WORKING_BATTLEFIELD_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const active = state.missions?.active || [];
    const receipts = state.missions?.receipts || [];
    if (active.some(m => m.params?.workingBattlefield)
      || state.story?.flags?.workingBattlefieldCompleted
      || receipts.some(r => r.sourceOfferId === OFFER_ID && r.outcome === 'completed')) {
      return d.abort(live, 'job_already_taken');
    }
    live.phase = 'offer';
    live.deadlineAt = d.now() + 90;
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
    d.offerChoices(live, ['accept', 'decline'], 'decline', live.deadlineAt);
  },
  tick(d, live, state, now) {
    if (live.phase === 'offer' && now >= live.deadlineAt) d.resolve(live, 'declined', { speak: true });
  },
  choose(d, live, state, choice) {
    if (live.phase !== 'offer') return;
    if (choice !== 'accept') return d.resolve(live, 'declined', { speak: true });
    const owner = d.registry?.get('missions');
    if (!owner) return d.abort(live, 'mission_owner_missing');
    const result = owner.postAndAcceptAuthoredOffer({
      id: OFFER_ID, type: 'demolition', stationId: 'station_ceres',
      destStationId: 'station_ceres', destSectorId: MACHINE.sectorId,
      factionId: 'faction_mts', minRep: -149, riskTier: 0,
      title: 'The Working Battlefield', storyTag: 'working_battlefield',
      reward_cr: MISSION_TUNING.BASE.demolition, collateral_cr: 0,
      brief: 'Time the crusher into the tower, or cut its plate and use guns. Then contain it or leave.',
      summary: 'No fee. Bring a mining beam and a gun; both are available at the Helios shipyard. '
        + 'Two job polymers need 2.4u free hold space, once only. Lost output deducts 180 cr. Abandon from the Mission Log.',
      params: { workingBattlefield: { machineId: MACHINE.id }, physicalVerb: 'knock_down',
        completionMethods: ['wrecking_ball', 'cut_down'] },
    });
    d.resolve(live, result.ok ? 'accepted' : 'not_ready', { speak: true });
  },
});
