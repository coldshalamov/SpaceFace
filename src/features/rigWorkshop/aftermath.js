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

/** Receiving crews connect the work already witnessed to the next actual order.
 * This is advice, not a new unlock, contract, reward, or promise of installation. */
export function workshopNextWork(w) {
  const active = w.jobs?.[w.activeJobId];
  if (active && !active.settled) return { kind: 'active', id: active.id,
    title: 'Continue the open work order',
    detail: `You already have ${active.title} open. Its remaining originals and receiving gantry are the next work; this conversation does not replace that agreement. Read the current destinations before taking another load.` };
  const next = RIG_JOB_DEFS.find(d => !w.jobs?.[d.id] && rigJobAvailability(w, d.id).ok);
  if (next) {
    const reasons = {
      needle: 'The survey crew still needs three separate cores from the Needle Orchard. Their freight throat asks for a narrow rig, not another heavy-lift solution. The collector and bumpers can be changed at the bench; no new rig is issued.',
      kiln: 'The coolant tender still needs the kiln’s two thermal stores. Survey work was about fitting through a throat; this job is about mass, balance and braking. The workshop’s powered sled was built for that kind of load. Check its surviving parts and fit at the bench before deciding to accept.',
      relay: 'Both receiving crews have an original on record and their orders are settled. That earns the Quiet Relay offer: a delicate signal coil and a heavier protective housing for the night shift. Take them one at a time if needed. Returning to the bench only lets you read the terms; it does not accept the order.',
    };
    return { kind: 'offer', id: next.id, title: `Next work · ${next.title}`, detail: reasons[next.id] };
  }
  if (!w.jobs?.relay && !rigJobAvailability(w, 'relay').ok) return { kind: 'closed', id: 'relay',
    title: 'The missing receipt stays missing',
    detail: 'The local orders are closed, but at least one receiving crew has no delivered original on record. The night shift will not offer the Quiet Relay on an empty receipt. Those closed contracts cannot be paid or reopened. Your machine remains yours to change and use elsewhere; nothing here respawns the lost work.' };
  return { kind: 'finished', id: null, title: 'No further order on this board',
    detail: 'These three work orders are settled. Keep the rig you built: you can bring it back to the bench, change it, repair its surviving parts or take it elsewhere. The crews keep the delivery receipts; those records do not guarantee that every original still survives here. There is no repeat contract or second completion payment.' };
}
