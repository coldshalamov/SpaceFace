// Read-only evidence for the existing Registry Writ mission owner. No settlement here.
import { occupantGenerationOf } from '../core/entity.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';
const TAG = 'campaign47a:b2:elroy';
const SECTOR = 'sector_charon_expanse';
const positioned = e => e?.alive === true && Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.z);

function registryWritTarget(state, mission, targetId) {
  if (mission?.status !== 'active' || mission.storyTag !== TAG || mission.type !== 'bounty_hunt'
    || mission.destSectorId !== SECTOR || mission.storyTarget?.id !== 'npc_elroy'
    || mission.storyTarget?.role !== 'register_mark' || !mission.targetEntityIds?.includes(targetId)) return null;
  const target = state.entities?.get(targetId), d = target?.data, key = `mission:${mission.id}:0`;
  if (!target || target.type !== 'ship' || targetId === state.playerId
    || !d || d.missionId !== mission.id || d.missionTag !== mission.id || d.missionTargetSlot !== 0
    || d.storyTargetId !== 'npc_elroy' || d.storyTargetRole !== 'register_mark'
    || d.identityKey !== key || d.worldRecordId !== stableRecordId(state.meta?.seed || 1, SECTOR, RECORD_KIND.MISSION_TARGET, key)
    || [target.homeSectorId, d.homeSectorId, d.sectorId].some(id => id != null && id !== SECTOR)) return null;
  return target;
}

export function registryWritContact(state, mission, targetId) {
  if (state.world?.currentSectorId !== SECTOR || state.mode !== 'flight' || state.ui?.docked) return null;
  const player = state.entities?.get(state.playerId), target = registryWritTarget(state, mission, targetId);
  if (!positioned(player) || !positioned(target)) return null;
  return { player, target, distance: Math.hypot(target.pos.x-player.pos.x, target.pos.z-player.pos.z) };
}

// Combat marks the actual victim dead before its synchronous entity:killed event.
// An ID-only report must not kill a living replacement or a foreign mission occupant.
export function registryWritForce(state, mission, event) {
  const target = registryWritTarget(state, mission, event?.id);
  return !!(target && target.alive === false && event.killerId === state.playerId);
}

export function registryWritCustody(state, mission, event, maxLength) {
  if (event?.actorId !== state.playerId || event.attachmentId == null
    || !Number.isFinite(event.after) || event.after < 0 || event.after > maxLength
    || !Number.isFinite(event.before) || event.before < event.after) return false;
  const contact = registryWritContact(state, mission, event.targetId);
  if (!contact || contact.distance > maxLength || mission.params?.investigationStage !== 'identified') return false;
  const tether = state.player?.tether;
  const a = state.combat?.attachments?.byId?.[String(event.attachmentId)];
  const pg = occupantGenerationOf(contact.player), tg = occupantGenerationOf(contact.target);
  return !!(tether?.active === true && tether.attachmentId === event.attachmentId && tether.targetId === event.targetId
    && a?.id === event.attachmentId && a.state === 'active' && a.defId === 'tether_standard'
    && a.ownerId === state.playerId && a.targetId === event.targetId && a.physicsHandle != null
    && pg != null && tg != null && a.ownerGeneration === pg && a.targetGeneration === tg
    && Number.isInteger(state.tick) && a.lastReelTick === state.tick && a.reelRevision > 0
    && Number.isFinite(a.restLength) && a.restLength >= 0 && a.restLength <= maxLength
    && a.restLength === event.after);
}
