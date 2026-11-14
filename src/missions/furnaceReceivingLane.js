// CR-FEED's optional release shoulder. The intake owner calls these on mission/sector
// transitions with the worksite job it already resolved — this module never reads mission
// rows itself, and the guide's live identity stays on the owner, not in entity-list scans.
import { furnaceMouthGlobal } from './furnaceWorksite.js';
import { FURNACE_INTAKE } from '../data/furnace.js';

export function furnaceShoulderSpec(m) {
  const mouth = furnaceMouthGlobal();
  return {
    type: 'beacon', pos: { x: mouth.x + 180, z: mouth.z }, vel: { x: 0, z: 0 },
    radius: 8, mass: 1, hull: 1, hullMax: 1,
    collides: false, physicsBody: false,
    homeSectorId: FURNACE_INTAKE.sectorId,
    data: {
      furnaceReceivingShoulder: true, missionId: m.id, parentType: 'story_prop',
      circuitMark: true, ringRadius: 35, visualRadius: 35,
      scannerSignalKind: 'salvage',
      scanLabel: 'CR-FEED RELEASE · aim the marked pod at the intake',
      tetherable: false, masslineTetherable: false,
    },
  };
}

/** Transition-time lane sync: keeps at most one guide for the job the owner resolved. */
export function syncFurnaceReceivingLane(owner, job) {
  const state = owner.state;
  let guide = owner._laneGuideId != null ? state.entities?.get(owner._laneGuideId) : null;
  if (guide && (!guide.alive || guide.data?.furnaceReceivingShoulder !== true)) {
    guide = null;
    owner._laneGuideId = null;
  }
  if (!job) {
    if (guide) owner.helpers?.removeEntity?.(guide.id);
    owner._laneGuideId = null;
    owner._laneJobId = null;
    return;
  }
  if (!guide) {
    guide = owner.helpers?.spawnEntity?.(furnaceShoulderSpec(job));
    owner._laneGuideId = guide?.id ?? null;
  } else if (guide.data.missionId !== job.id) {
    guide.data.missionId = job.id;
  }
  owner._laneJobId = guide ? job.id : null;
}

/** One-time proximity brief; the heard flag lives with the intake's other announcement
 *  flags so a restored session does not hear it twice. Called from the owner's update —
 *  cheap reads only, no entity scans. */
export function noteFurnaceReceivingBrief(owner) {
  const state = owner.state, flags = state.story?.flags;
  const guide = owner._laneGuideId != null ? state.entities?.get(owner._laneGuideId) : null;
  if (!guide || !guide.alive || !flags || flags.furnace_receiving_brief === owner._laneJobId
      || state.mode !== 'flight' || state.ui?.docked) return;
  const player = state.entities?.get(state.playerId);
  if (!player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos.z)) return;
  if (Math.hypot(player.pos.x - guide.pos.x, player.pos.z - guide.pos.z) > 500) return;
  flags.furnace_receiving_brief = owner._laneJobId;
  owner.bus?.emit('comms:popup', {
    id: 'furnace_receiving_brief', sender: 'CR-FEED', category: 'story', ttl: 10, persist: true,
    text: 'Mites cleared. Marked quarantine lots, not ordinary rock. The small release ring is outside the mouth: bring one load up, aim it at the intake, and let it cross the lip. Tow or fling; we count the pod, not your hull. Keep the other lots out of your swing.',
  });
}
