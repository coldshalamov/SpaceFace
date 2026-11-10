// Mira reads the existing delivery and scale books. No cargo, payment or mission writer.
import { COMMODITIES } from '../../data/commodities.js';
import { sellableCargoQuantity, releasableContractUnits } from '../../systems/cargo.js';
import { kesslerPadPosition } from '../../systems/kesslerScaleWorksite.js';
import { KESSLER_SCALE } from '../../data/kessler.js';

const STATION = 'station_tethys';
const ALLOYS = 'campaign47a:b1:alloy_run';
const PREFIX = 'tethys_scale:';
const finite = n => Number.isFinite(n) && n > 0;
const sample = r => finite(r?.plate) && finite(r?.stamp) && r.plate < r.stamp
  && Number.isSafeInteger(r.count) && r.count > 0;

export function tethysScaleRead(state, stationId) {
  if (stationId !== STATION || state?.ui?.docked !== true || state.ui.dockedStationId !== STATION
    || state.world?.currentSectorId !== KESSLER_SCALE.sectorId || state.save?.restoring
    || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))
    || state.story?.beatIndex !== 1 || !Array.isArray(state.missions?.active)) return null;
  const progress = state.story.campaign47a?.stepProgress?.['1']?.completed;
  const completed = Array.isArray(progress) ? progress : [];
  const jobs = state.missions.active.filter(m => m?.status === 'active' && m.storyTag === ALLOYS);
  if (jobs.length > 1) return null;
  if (!completed.includes('alloy_run')) {
    const m = jobs[0];
    if (!m || typeof m.id !== 'string' || !m.id || state.missions.active.filter(row => row?.id === m.id).length !== 1
      || m.type !== 'cargo_delivery' || m.destStationId !== STATION
      || m.params?.cmdtyId !== 'cmdty_alloys' || !Number.isSafeInteger(m.params.qty) || m.params.qty <= 0) return null;
    return { phase: 'unsettled', missionId: m.id, need: m.params.qty, held: releasableContractUnits(state, m) };
  }
  if (jobs.length || completed.includes('infested')) return null;
  const watch = state.story.flags?.kessler_comparison_watch;
  const first = watch?.version === 1 && sample(watch.first) ? { ...watch.first } : null;
  const second = first && sample(watch.second) && watch.second.count > first.count
    && Math.round(watch.second.stamp * 10) !== Math.round(first.stamp * 10) ? { ...watch.second } : null;
  const free = COMMODITIES.map(c => ({ id: c.id, name: c.name, qty: sellableCargoQuantity(state, c.id) }))
    .filter(c => c.qty > 0).sort((a, b) => a.id.localeCompare(b.id));
  const pods = (state.entityList || []).filter(e => e?.alive && e.type === 'payload'
    && e.data?.jettisonedCargo === true && !e.data.physicalCustodyOnly
    && state.entities?.get(e.id) === e && e.data.playerJettisonOrigin?.version === 1
    && (!e.homeSectorId || e.homeSectorId === KESSLER_SCALE.sectorId))
    .map(e => ({ id: e.id, generation: e.occupantGeneration, commodity: e.data.commodityId,
      qty: Number.isFinite(e.data.salvagePool?.[e.data.commodityId])
        ? e.data.salvagePool[e.data.commodityId] : e.data.amount,
      read: e.data.kesslerRead === true }))
    .filter(e => finite(e.qty)).sort((a, b) => a.id - b.id);
  const furnaceJobs = state.missions.active.filter(m => m?.status === 'active' && m.storyTag === 'campaign47a:b1:infested');
  if (furnaceJobs.length > 1 || furnaceJobs.some(m => typeof m.id !== 'string' || !m.id
    || m.type !== 'patrol_clear' || m.destStationId !== 'station_ceres'
    || state.missions.active.filter(row => row?.id === m.id).length !== 1)) return null;
  const furnace = furnaceJobs.length === 1 ? { id: furnaceJobs[0].id, title: furnaceJobs[0].title,
    acceptedAt: furnaceJobs[0].acceptedAt_s ?? null } : null;
  return { phase: completed.includes('scale_4') ? 'return' : 'weigh', first, second, free, pods, furnace };
}

// A detached choice cannot silently reuse new stock, a replacement contract or another slip.
function choiceId(state, read, action) {
  return PREFIX + action + ':' + encodeURIComponent(JSON.stringify([state.meta?.seed ?? null, read]));
}
export function tethysScaleChoices(state, stationId) {
  const r = tethysScaleRead(state, stationId);
  if (!r) return [];
  const choices = [{ id: choiceId(state, r, 'read'), label: r.phase === 'return'
    ? 'Show Mira the scale readings.' : 'Compare the alloy receiving manifest.' }];
  if (r.phase !== 'unsettled') choices.push({ id: choiceId(state, r, 'course'), label: 'Mark Scale 4. I keep the freight.' });
  if (r.phase === 'return') choices.push({ id: choiceId(state, r, 'next'), label: r.furnace ? 'Track my Furnace Detail in Mission Log.' : 'Open Mission Log for the next leg.' });
  return choices;
}
export function isTethysScaleChoice(id) { return typeof id === 'string' && id.startsWith(PREFIX); }
export function tethysScaleReply(ctx, stationId, id) {
  if (!isTethysScaleChoice(id)) return null;
  const state = ctx?.state, r = tethysScaleRead(state, stationId);
  if (!r || !tethysScaleChoices(state, stationId).some(c => c.id === id)) {
    return { text: 'Mira turns the old slip face down. “That is not the current load. Ask me again.”', tethysScaleAnswer: true };
  }
  const action = id.slice(PREFIX.length).split(':')[0];
  if (action === 'course') {
    ctx.bus?.emit('ui:setCourse', { pos: kesslerPadPosition(), sectorId: KESSLER_SCALE.sectorId,
      label: 'Scale 4 · weigh your own freight', reason: 'Release your own unreserved cargo, settle the pod inside the open ring, compare plate and stamp, then recover it.',
      autopilot: false, source: 'station-bar:mira' });
    return { text: '“Marked: the open ring between the freight apron and inspection desk. Launch, then use the Cargo panel to choose an unreserved lot and Jettison it. Catch the pod with your Line. Tow slowly through the open station-side approach and brake the pod inside the ring, at 8 WU/s or below. The plate reads the physical pod, not the number of units. Cut its Line and approach to collect when finished. Nothing is sold here.”', tethysScaleAnswer: true };
  }
  if (action === 'next') {
    if (r.furnace) ctx.bus?.emit('ui:trackMission', { missionId: r.furnace.id });
    ctx.bus?.emit('ui:pushScreen', { id: 'missionLog', source: 'station-bar:mira' });
    return { text: r.furnace ? '“Your Furnace Detail is already signed. I have asked the Mission Log to track it. Read its armament and cargo requirements before leaving for Ceres. The weighing slip does not release 47-A’s withheld payment.”' : '“The next posting is Furnace Detail on this station’s Contracts board. Read its armament and cargo requirements before leaving for Ceres. This slip neither accepts that job nor releases 47-A’s withheld payment.”', tethysScaleAnswer: true };
  }
  let text;
  if (r.phase === 'unsettled') {
    text = `“This alloy contract is still open: ${r.held} of ${r.need} reserved units available to its receiving desk. A partial load does not settle this job. Keep the seal intact. Check the Mission Log and re-dock with the required load; my conversation cannot sign for missing freight.”`;
  } else if (r.phase === 'weigh') {
    const cargo = r.free.length ? `You still have ${r.free.map(c => `${c.qty}u ${c.name}`).join(', ')} free aboard. Choose your own lot; do not buy the delivered alloys back.`
      : r.pods.length ? 'Your hold has no free lot, but loose freight remains in this sector. Recover or weigh your existing pod; I will not issue another.'
        : 'Your hold has no free lot. Mine your own cargo or review a Market purchase before launch. I have no replacement crate to give you.';
    text = `Mira lays the receiving copy beside the old seal. “The alloy delivery is recorded. The receiving manifest calls it HOUSEHOLD MINERALS. That is a changed description, not a weight measurement. ${cargo} One unreserved unit is enough to release a fresh pod. Scale 4 will measure that body, and your cargo stays yours. Bring its plate reading back; I want a number the seal did not choose.”`;
  } else {
    const measured = r.first ? `“Your retained slip: ${r.first.stamp.toFixed(1)}t on the body stamp, ${r.first.plate.toFixed(1)}t on the plate.${r.second ? ` The second load: ${r.second.stamp.toFixed(1)}t stamped, ${r.second.plate.toFixed(1)}t on the plate.` : ' One reading; not yet a different-load comparison.'} Those are measured body weights, not cargo units.`
      : '“The scale step is recorded, but this copy has no paired figures. I will not fill them in.';
    const loose = r.pods.filter(p => p.read).reduce((n, p) => n + p.qty, 0);
    text = `${measured} ${loose > 0 ? `${loose}u still remain in weighed pods here. Release their Lines and collect them as cargo space allows.` : 'No live weighed freight is listed here. The slip proves a past reading, not that you recovered the load.'} Keep the original. ${r.furnace ? 'Your Furnace Detail is already signed; track that job before leaving for Ceres.' : 'Furnace Detail is now the next job on Tethys’s board.'} The withheld 47-A payment stays withheld.”`;
  }
  return { text, tethysScaleAnswer: true };
}
