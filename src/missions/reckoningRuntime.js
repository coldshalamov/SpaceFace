// Optional B7 pieces use the ordinary mission target and combat attachment owners.
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { makeShipEntitySpec } from '../systems/ships.js';

const live = (owner, m, key) => owner.state.entityList.find(e => e.alive !== false
  && e.data?.missionTag === m.id && e.data?.reckoningKey === key);

export function snapshotReckoning(owner, m) {
  const job = m.params?.reckoning;
  if (!job) return;
  job.bodies ||= {};
  const line = job.crewLineId && owner.registry?.get('combat')?.kernel?.attachments?.get(job.crewLineId);
  if (line) job.crewLineState = line.state;
  for (const e of owner.state.entityList) {
    if (e.data?.missionTag !== m.id || !e.data?.reckoningKey) continue;
    job.bodies[e.data.reckoningKey] = e.alive === false || e.hull <= 0 ? { destroyed: true }
      : { pos: { ...e.pos }, vel: { ...e.vel }, rot: e.rot, angVel: e.angVel, hull: e.hull };
  }
}

export function reckoningKilled(m, victim) {
  const key = victim?.data?.reckoningKey;
  if (!key || !m.params?.reckoning) return false;
  (m.params.reckoning.bodies ||= {})[key] = { destroyed: true };
  return true;
}

export function spawnReckoning(owner, m) {
  const job = m.params?.reckoning;
  if (!job || !String(m.storyTag || '').startsWith('campaign47a:b7:')) return;
  job.bodies ||= {};
  const anchor = sectorLocalToGlobalForSector({ x: -560, z: 480 }, 'sector_ashfall_reach');
  let slot = 100;
  for (const [index, row] of job.rows.entries()) {
    const keys = row.kind === 'crew' ? [row.id, `${row.id}_tug`] : [row.id];
    for (const key of keys) {
      const durableSlot = slot++;
      const saved = job.bodies[key];
      if (saved?.destroyed) continue;
      const adopted = live(owner, m, key);
      if (adopted) {
        if (!m.targetEntityIds.includes(adopted.id)) m.targetEntityIds.push(adopted.id);
        continue;
      }
      const isTug = key.endsWith('_tug');
      const pos = saved?.pos || { x: anchor.x - 180 + index * 85, z: anchor.z + 160 + (isTug ? 105 : 0) };
      const spec = isTug ? makeShipEntitySpec('ship_hawser', { team: 0, pos, ai: { passive: true, roe: 'hold_fire' } })
        : { type: 'wreck', team: 0, pos, vel: { x: 0, z: 0 }, rot: 0,
          radius: row.kind === 'core' ? 16 : 25, mass: row.mass,
          hull: 400, hullMax: 400, collides: true,
          physicsBody: { schemaVersion: 1, mass: row.mass, radius: row.kind === 'core' ? 16 : 25,
            dynamic: row.kind !== 'outpost', material: 'debris', shape: 'capsule' },
          data: { tetherable: row.kind !== 'outpost', proportions: { x: 1.8, y: 0.4, z: 0.7 } } };
      if (saved) for (const field of ['pos', 'vel', 'rot', 'angVel', 'hull']) {
        if (saved[field] != null) spec[field] = typeof saved[field] === 'object' ? { ...saved[field] } : saved[field];
      }
      spec.data ||= {};
      Object.assign(spec.data, { missionTag: m.id, physicalRole: 'reckoning_piece', reckoningKey: key,
        scanLabel: isTug ? 'B2 RESCUED CREW — HOLDING YOUR LINE' : row.label.toUpperCase() });
      const entity = owner.helpers.spawnEntity(spec);
      if (!entity) continue;
      owner._stampMissionTargetIdentity(entity, m, durableSlot);
      m.targetEntityIds.push(entity.id);
    }
    if (row.kind === 'crew') {
      const tug = live(owner, m, `${row.id}_tug`), ballast = live(owner, m, row.id);
      const service = owner.registry?.get('combat')?.kernel?.attachments;
      if (tug && ballast && service) {
        const prior = job.crewLineId && service.get(job.crewLineId);
        if (!job.crewLineId || (!prior && job.crewLineState === 'active')) {
          const result = service.create({ defId: 'tether_standard', ownerId: tug.id, targetId: ballast.id,
            sourceWorld: { ...tug.pos }, targetWorld: { ...ballast.pos }, controlMode: 'reckoning_crew' });
          if (result?.ok) { job.crewLineId = result.attachment.id; job.crewLineState = 'active'; }
          job.crewLineBlockedReason = result?.ok ? null : result?.reason || 'attachment-unavailable';
        } else if (prior?.state === 'active') {
          // The attachment owner remaps saved entity identities on Continue.
          job.crewLineId = prior.id;
        } else if (prior) {
          job.crewLineState = prior.state;
        }
      }
    }
  }
}
