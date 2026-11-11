// The existing two-ring market is the physical choice. This adapter speaks before its
// census consumes proof; it never moves, holds, sells or replaces a hull.
import { cinderPlayerTow, authoredCinderRoute, cinderTowHandling } from './cinderRoute.js';
import { ROOK_BOOTH } from '../data/rook.js';
import { rookPadPosition } from '../characters/rookRules.js';
import { isPlayerWanted } from '../systems/heat.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function syncCinderReceivingScene(state, bus, quietStand) {
  if (typeof bus?.emit !== 'function' || state?.mode !== 'flight' || state.ui?.docked || state.save?.restoring
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
  const markerId = hull.data.markerId;
  const current = flags.cinder_receiving_scene;
  const record = current?.version === 1 && current.missionId === job.id
    ? current : { version: 1, missionId: job.id, heard: {} };
  const heard = record.heard && typeof record.heard === 'object' && !Array.isArray(record.heard) ? record.heard : {};
  const handling = cinderTowHandling(state, hull);
  // Speak before a fast tow reaches the crowded apron. A later swing deserves its
  // own warning even when this hull already heard the stand's ordinary terms.
  // The existing saved contact memory prevents chatter after Continue.
  const nearMarket = Math.min(distance(hull.pos, rookPadPosition()),
    quiet ? distance(hull.pos, quiet) : Infinity) <= 1000;
  const handlingKey = handling && `${markerId}:handling_${handling.kind}`;
  if (!kind || heard[`${markerId}:${kind}`] === true) {
    if (!nearMarket || !handling || heard[handlingKey] === true) return;
    kind = `handling_${handling.kind}`; sender = ROOK_BOOTH.sender;
    text = handling.text + (isPlayerWanted(state)
      ? ' My pad still refuses WANTED pilots. Quiet Line buys the hull without my contract proof.'
      : ' Neither ring buys speed. The hull must be at 8 WU/s or slower; the cockpit speed is not the scale.');
  } else if (handling && heard[handlingKey] !== true) {
    text += ' ' + handling.text;
    heard[handlingKey] = true;
  }
  const key = `${markerId}:${kind}`;
  heard[key] = true;
  record.heard = heard;
  flags.cinder_receiving_scene = record;
  // Adventure keeps narrative prose off the flight glass. Its existing durable
  // receipt path retains the full explanation in LOG; one short mechanical cue
  // uses the normal objective receipt lane instead of an invisible story popup.
  const cue = kind === 'quiet' ? 'Quiet Line pays for the hull without Rook contract credit'
    : isPlayerWanted(state) ? 'Rook refuses WANTED pilots; preserve the marked hull'
    : kind === 'handling_swing' ? 'Intake cannot accept this swing: slow the load outside the rings'
    : kind === 'handling_approach' ? 'Intake cannot accept this speed: slow the tow outside the ring'
    : 'Rook pays the hull price; Cinder contract credit is separate';
  bus.emit('comms:popup', { id: `cinder_receiving_${job.id}_${kind}`, sender, category: 'story',
    storyReceipt: true, ttl: 14, persist: true, text });
  bus.emit('toast', { text: cue, kind: 'warn', channel: 'objective', ttl: 7 });
}
