import { RIG_JOB_DEFS, rigJobAvailability } from './jobs.js';
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
/** Completed work remains a place and a conversation, not another payable contract. */
export function workshopAftermath(state, w, id) {
  const job = w.jobs?.[id], def = RIG_JOB_DEFS.find(d => d.id === id);
  if (!def || !job?.settled) return null;
  const receiver = state.entities.get(job.receiverId);
  const receiverLive = receiver?.alive !== false && receiver?.hull > 0
    && receiver.data?.rigWorkshopOwner === w.ownerId && receiver.data?.rigWorkshopJob === id
    && receiver.data?.rigWorkshopRole === 'receiver';
  const nearby = receiverLive && state.world?.currentSectorId === job.sectorId
    && distance(state.entities.get(state.playerId)?.pos, receiver.pos) <= 170;
  const originals = job.cargo.filter(c => c.paid && job.delivered.includes(c.id)).flatMap(c => {
    const e = state.entities.get(c.id), tag = e?.data?.rigWorkshopCargo;
    return e?.alive !== false && e?.hull > 0 && tag?.token === c.token && tag.jobId === id
      && tag.ownerId === w.ownerId && tag.delivered === true && e.ownerId === job.receiverId
      && e.data?.rigWorkshopOwner === w.ownerId && receiverLive
      && distance(e.pos, receiver.pos) <= 170
      ? [{ id: e.id, generation: e.occupantGeneration, token: c.token,
          name: e.data.name || 'Delivered original', integrity: Math.round(e.hull / e.hullMax * 100) }] : [];
  });
  const n = job.delivered.length, total = job.cargo.length;
  const outcome = n === 0 ? 'empty' : n === total ? 'complete' : 'partial';
  const stories = {
    needle: { complete: 'Survey crew: “We have our bearings.”',
      partial: 'Survey crew: “The gaps stay gaps.”',
      empty: 'Survey crew: “The survey stays missing.”' },
    kiln: { complete: 'Coolant crew signs for both thermal stores.',
      partial: 'Coolant crew: one line is still blank.',
      empty: 'Coolant crew has no delivered store.' },
    relay: { complete: 'Night shift: “Received, not installed.”',
      partial: 'Night shift: “One half is not a relay.”',
      empty: 'Night shift: “An empty ticket carries no signal.”' },
  };
  const detail = (stories[id]?.[outcome] || 'The crew keeps its records.')
    + (originals.length < n ? ' Some originals are no longer here intact.' : '')
    + (originals.some(o => o.integrity < 90) ? ' The survivors show wear.' : '');
  return { job, receiver: receiverLive ? receiver : null, nearby, originals, detail,
    account: `${n}/${total} originals · ${job.paid} cr already paid`, title: def.title, outcome };
}

/** Receiving crews connect the work already witnessed to the next actual order.
 * This is advice, not a new unlock, contract, reward, or promise of installation. */
export function workshopNextWork(w) {
  const active = w.jobs?.[w.activeJobId];
  if (active && !active.settled) return { kind: 'active', id: w.activeJobId,
    title: 'Continue the open work order',
    detail: `${active.title} is still open.` };
  const next = RIG_JOB_DEFS.find(d => !w.jobs?.[d.id] && rigJobAvailability(w, d.id).ok);
  if (next) {
    const reasons = {
      needle: 'Survey crew needs three cores through a narrow throat.',
      kiln: 'Two thermal stores remain; the sled was built for them.',
      relay: 'Your receipts earn the Quiet Relay; reading does not accept.',
    };
    return { kind: 'offer', id: next.id, title: `Next work · ${next.title}`, detail: reasons[next.id] };
  }
  if (!w.jobs?.relay && !rigJobAvailability(w, 'relay').ok) return { kind: 'closed', id: 'relay',
    title: 'The missing receipt stays missing',
    detail: 'No delivered original; closed orders cannot be paid or reopened.' };
  return { kind: 'finished', id: null, title: 'No further order on this board',
    detail: 'All three orders settled; receipts do not guarantee survival.' };
}
