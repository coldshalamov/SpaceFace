// The existing two-ring market is the physical choice. This adapter speaks before its
// census consumes proof; it never moves, holds, sells or replaces a hull.
import { cinderPlayerTow, authoredCinderRoute } from './cinderRoute.js';
import { ROOK_BOOTH } from '../data/rook.js';
import { rookPadPosition } from '../characters/rookRules.js';
import { isPlayerWanted } from '../systems/heat.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function syncCinderReceivingScene(state, bus, quietStand) {
  if (state?.mode !== 'flight' || state.ui?.docked || state.save?.restoring
    || state.world?.currentSectorId !== ROOK_BOOTH.sectorId
    || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))) return;
  const player = state.entities?.get(state.playerId), flags = state.story?.flags;
  if (!flags || !player?.alive || !finite(player.pos)) return;
  const jobs = (state.missions?.active || []).filter(m => m?.status === 'active' && authoredCinderRoute(m));
  if (jobs.length !== 1) return;
  const job = jobs[0], hull = cinderPlayerTow(job, state);
  if (!hull || !finite(hull.pos) || distance(player.pos, hull.pos) > 450) return;
  const quiet = finite(quietStand?.pad) ? sectorLocalToGlobalForSector(quietStand.pad, ROOK_BOOTH.sectorId) : null;
  let kind, text, sender;
  if (quiet && distance(hull.pos, quiet) <= quietStand.padRadius + 260) {
    kind = 'quiet'; sender = 'THE QUIET LINE';
    text = `We buy the hull, not Rook’s contract. Bring it inside our ${quietStand.padRadius}-WU ring at ${quietStand.restSpeed} WU/s or slower and it is ours. You get our price, no Rook delivery slip. Keep this marked hull for his larger ring if you still need his proof.`;
  } else if (distance(hull.pos, rookPadPosition()) <= ROOK_BOOTH.padRadius + 400) {
    kind = isPlayerWanted(state) ? 'wanted' : 'rook'; sender = ROOK_BOOTH.sender;
    text = kind === 'wanted'
      ? 'That is the marked hull, but the pad stays dark while you are WANTED. Keep it outside the other ring; Quiet Line will buy away this proof. Resolve your status through the law’s choices, then bring the same hull back. My desk cannot clear your fines.'
      : `The marked hull, not your ship: inside my ${ROOK_BOOTH.padRadius}-WU ring at ${ROOK_BOOTH.restSpeed} WU/s or slower. My booth pays its hull price once. The Cinder contract pays separately only after three clearances and a matching delivery. The book may say it twice; your account does not.`;
  }
  if (!kind) return;
  const markerId = hull.data.markerId;
  const current = flags.cinder_receiving_scene;
  const record = current?.version === 1 && current.missionId === job.id
    ? current : { version: 1, missionId: job.id, heard: {} };
  const key = `${markerId}:${kind}`;
  if (record.heard?.[key] === true) return;
  record.heard = record.heard && typeof record.heard === 'object' && !Array.isArray(record.heard) ? record.heard : {};
  record.heard[key] = true;
  flags.cinder_receiving_scene = record;
  bus?.emit('comms:popup', { id: `cinder_receiving_${job.id}_${kind}`, sender, category: 'story', ttl: 14, persist: true, text });
}
