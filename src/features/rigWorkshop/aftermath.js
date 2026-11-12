import { RIG_JOB_DEFS } from './jobs.js';
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
    needle: { complete: 'The survey crew’s receipt records all three cores. “Three separate bearings were brought home. That was the survey’s missing comparison, not another single reading.”',
      partial: 'The survey crew keeps the recovered cores separate. “We can read these. The gaps in the survey stay gaps; we are not filling them in from memory.”',
      empty: 'The survey tray is empty. “We closed the ticket, not the missing survey. Whatever survived out there is still where you left it.”' },
    kiln: { complete: 'The coolant crew’s receipts record both thermal stores. “Two heavy loads, two separate receipts. You brought the stores, not the whole kiln.”',
      partial: 'One space on the coolant crew’s receiving list is still blank. “We work with the store that arrived. Closing the order did not bring the other one home.”',
      empty: 'The coolant crew has no delivered store to inspect. “No receipt, no new stock. The order is closed; the work did not happen.”' },
    relay: { complete: 'The night-shift crew lays the two receipts side by side. “Coil and housing. Both were received. Receiving them did not certify a working relay. These are delivery receipts, not an installation record.”',
      partial: 'The night-shift crew marks the pair incomplete. “The piece that arrived matters. But one half is not a working relay, and we will not call it one.”',
      empty: 'The night-shift list has no received relay part. “An empty ticket does not carry a signal. Nothing has been installed.”' },
  };
  const detail = `${stories[id][outcome]} ${n}/${total} originals recorded; ${job.paid} cr already paid. No new payment or transfer is offered.`
    + (originals.length < n ? ' Some received originals are no longer here intact. The old receipts remain history, not proof of their current condition.' : '')
    + (originals.some(o => o.integrity < 90) ? ' The pieces still here show wear; the crew has not repaired or replaced them.' : '');
  return { job, receiver: receiverLive ? receiver : null, nearby, originals, detail, title: def.title, outcome };
}
