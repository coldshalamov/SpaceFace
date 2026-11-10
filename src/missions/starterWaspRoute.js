import { STARTER_JOBS, starterRamSentence } from '../data/starterJobs.js';

// A route readout for all three existing starter writs, not a new site or target owner.
// Keep the original exported name for the mission waypoint reader and older consumers.
// The ordinary bounty spawner, durable slots and kill receipt still own the job.
export function firstWaspRouteFocus(m, state) {
  const job = STARTER_JOBS.find(row => row.id === 'starter_wasp');
  const step = job.steps.find(row => row.step === m?.params?.starterStep);
  if (!step || m?.status !== 'active' || m.source !== 'starterJob' || m.type !== step.type
    || m.destSectorId !== 'sector_helios_prime' || m.destStationId !== 'station_helios'
    || m.params?.starterJobId !== job.id || m.params.starterStep !== step.step
    || m.params.requiredModule !== job.requiredModule || m.params.markName !== step.runnerName
    || m.storyTarget?.role !== 'board_writ' || m.storyTarget.name !== step.runnerName) return null;

  const base = { label: `${step.runnerName} — gate runner`, stationId: null,
    sectorId: m.destSectorId };
  if (state?.world?.currentSectorId !== m.destSectorId) {
    return { ...base, reason: `Return to Helios Prime to find ${step.runnerName}. ${starterRamSentence(m.params)}.` };
  }
  for (const id of m.targetEntityIds || []) {
    const e = state.entities?.get(id);
    const d = e?.data;
    // Continue's ordinary mission-target record keeps the exact durable slot, not
    // storyTargetId. The existing spawner re-dresses slot zero as the named mark.
    const namedMark = d?.storyTargetId != null
      ? !!m.storyTarget.id && d.storyTargetId === m.storyTarget.id
      : d?.missionId === m.id && d.missionTargetSlot === 0
        && d.identityKey === `mission:${m.id}:0` && !!d.worldRecordId;
    // IDs can be recycled. A stale id must never put a runner's name on another hull.
    if (!e || e.alive !== true || e.data?.missionTag !== m.id
      || !namedMark
      || !Number.isFinite(e.pos?.x) || !Number.isFinite(e.pos?.z)
      || [e.sectorId, e.homeSectorId, e.data.sectorId, e.data.homeSectorId]
        .some(sector => sector && sector !== m.destSectorId)) continue;
    return { ...base, targetEntityId: e.id, pos: { x: e.pos.x, z: e.pos.z },
      reason: starterRamSentence(m.params) };
  }
  return { ...base, reason: `No live ${step.runnerName} contact located. Keep this writ tracked; a missing contact is not a completed job.` };
}
