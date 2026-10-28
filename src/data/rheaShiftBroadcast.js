// Read-only local radio memory. Rescue, physical identity and work remain with their owners.
const SECTOR = 'sector_rhea_cinder';
const STATION = 'station_rhea_cinder';
const MARKS = ['rhea_miner_yard_face', 'rhea_miner_slag_face'];
const eventTime = (value, now) => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && value <= now;
const seamRoute = route => Array.isArray(route) && route.length === MARKS.length
  && route.every((mark, i) => mark?.id === MARKS[i]
    && Number.isFinite(mark.pos?.x) && Number.isFinite(mark.pos?.z));
const sameRoute = (a, b) => seamRoute(b) && a.every((mark, i) =>
  mark.pos.x === b[i].pos.x && mark.pos.z === b[i].pos.z
  && mark.targetRef === b[i].targetRef);

/** No event replay or clock here: project one current fact from existing authoritative state. */
export function rheaShiftBroadcast(state, stationId) {
  if (stationId !== STATION || state?.world?.currentSectorId !== SECTOR) return null;
  const now = state.simTime;
  if (!Number.isFinite(now) || now < 0) return null;
  const people = state.player?.uniqueWrecks?.rescuedWorkers?.people;
  if (!people || typeof people !== 'object') return null;
  const facts = [];
  for (const [key, rec] of Object.entries(people)) {
    if (!rec || rec.personKey !== key || typeof rec.worldRecordId !== 'string' || !rec.worldRecordId
      || rec.role !== 'miner' || rec.workplace?.kind !== 'miner'
      || rec.workplace.sectorId !== SECTOR || !seamRoute(rec.workplace.route)
      || !eventTime(rec.rescuedAtS, now) || !eventTime(rec.returnedAtS, now)
      || rec.returnedAtS < rec.rescuedAtS) continue;
    let at, text;
    if (rec.outcome === 'lost') {
      if (!eventTime(rec.lostAtS, now) || rec.lostAtS < rec.returnedAtS) continue;
      at = rec.lostAtS;
      text = 'Cinder Claim shift desk: the seam miner who came back from rescue has been lost.';
    } else if (rec.outcome === 'returned' && rec.lostAtS == null) {
      // Numeric entity ids are not identity and may change across Continue.
      const worldRecord = state.world.records?.byId?.[rec.worldRecordId];
      if (worldRecord && (worldRecord.alive === false
        || ['destroyed', 'defeated'].includes(worldRecord.outcome)
        || (worldRecord.sectorId && worldRecord.sectorId !== SECTOR))) continue;
      const index = state.entityIndex;
      const indexed = index?.__spacefaceEntityIndexV1 && index.ready === true
        ? index.byWorldRecordId?.get?.(rec.worldRecordId) : null;
      const candidates = [indexed, state.entities?.get?.(rec.returnedEntityId),
        state.entities?.get?.(worldRecord?.liveEntityId)];
      let working = false;
      for (const hull of candidates) {
        const data = hull?.data;
        if (hull?.alive !== true || state.entities?.get?.(hull.id) !== hull || hull.type !== 'ship' || data?.worldRecordId !== rec.worldRecordId
          || data.rescuedWorkerPerson !== key || data.sectorId !== SECTOR) continue;
        const entry = state.npcJobs?.byId?.[data.jobId];
        if (entry?.entityId !== hull.id || entry.worldRecordId !== rec.worldRecordId
          || entry.sectorId !== SECTOR || entry.job?.corrupt === true
          || entry.job?.kind !== 'miner' || !sameRoute(rec.workplace.route, entry.job.route)) continue;
        working = true;
        break;
      }
      if (!working) continue;
      at = rec.returnedAtS;
      text = 'Cinder Claim shift desk: the rescued seam miner is back on the yard-to-slag run.';
    } else continue;
    facts.push({id: `rhea:shift:${key}:${rec.outcome}:${at}`, text, at});
  }
  // Stable selection when an older lost shift and a later return coexist; no extra saved latch.
  facts.sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return facts.length ? {id: facts[0].id, text: facts[0].text} : null;
}
