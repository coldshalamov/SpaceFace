// Pure readers for the ordinary Tethys Contracts/contact owner. Reading a row
// never opens an offer; its action asks the simulation owner to do that.
import {
  CINDERGLASS_JOB_SECTOR_ID, CINDERGLASS_JOB_STATION_ID,
  CINDERGLASS_JOB_TALA_CONTACT_ID, CINDERGLASS_JOB_TEXT as T,
  CINDERGLASS_JOB_PHASES as P, CINDERGLASS_JOB_OUTCOMES as O,
} from './definition.js';

export function cinderglassJobFirstDeliveryComplete(state) {
  const own = state?.story?.campaign47a;
  // The canonical step owner accepts only the authored alloy_run completion.
  // A generic mission counter or beat cursor does not establish that delivery.
  if (own?.stepProgress?.['1']?.completed?.includes('alloy_run')) return true;
  return Array.isArray(own?.receipts) && own.receipts.some(row => row?.kind === 'step_progress'
    && row.beatIndex === 1 && row.stepId === 'alloy_run' && row.signal === 'mission:completed');
}

export function cinderglassJobRevisit(st, actor = 'tala') {
  const outcome = typeof st?.outcome === 'string' ? st.outcome : st?.outcome?.id;
  const dask = st?.actors?.dask || {};
  if (actor === 'dask') {
    if (dask.alive === false) return { title: 'Oren Dask · no answer', line: 'Dask died on the route. His surviving crew retain their own account.' };
    if ([O.RETURNED_TALA, O.RETURNED_DAMAGED].includes(outcome)) return {
      title: 'Oren Dask · consignment settled',
      line: dask.dealAccepted ? 'The paid release is filed. Tala’s receipt closes the dispute.'
        : 'The controller left my rack without agreement. Returning it does not erase how it was taken.',
    };
    if (dask.knowsTheft) return { title: 'Oren Dask · disputed loss', line: 'My manifest still records the missing CG-7 pod. The ordinary law applies to what happened out there.' };
    if (dask.dealAccepted) return { title: 'Oren Dask · release agreed', line: 'Your inspection deposit is posted. Bring the original to Tala; only her accepted return refunds it.' };
    if (dask.dealRefused) return { title: 'Oren Dask · proposal refused', line: 'Paid consignment. I will not release it on those terms. No inspection deposit was accepted.' };
    return { title: 'Oren Dask · paid consignment', line: 'Read the marked pod and its latch first. I can hear the title claim at the inspection layby.' };
  }
  if (actor === 'broker') {
    if (outcome === O.SOLD_BROKER) return { title: 'Vesi Khand · sale filed', line: 'The original is on my receiving clamp. Three hundred paid once; the unlawful transfer remains on the record.' };
    if (outcome && outcome !== O.DECLINED) return { title: 'Vesi Khand · closed business', line: 'That original is no longer offered here. There is no second consignment.' };
    return { title: 'Vesi Khand · unlawful alternative', line: 'Three hundred for the intact original on my receiving clamp. Damaged freight is refused. The sale costs your standing with the manifest holder.' };
  }
  if (outcome === O.RETURNED_TALA || outcome === O.RETURNED_DAMAGED) return {
    title: 'Tala Rook · controller returned',
    line: outcome === O.RETURNED_DAMAGED ? 'The damaged original is in my cradle. The accepted condition set the payment; the account is settled.'
      : 'The original controller is in my cradle. The title dispute is settled. The payment will not repeat.',
  };
  if (outcome === O.SOLD_BROKER) return { title: 'Tala Rook · controller fenced', line: 'Khand has the original. My return terms were not met; no payment or deposit refund is due from me.' };
  if ([O.DESTROYED, O.LOST].includes(outcome)) return { title: 'Tala Rook · recovery closed', line: 'The original controller is gone. No replacement is being dispatched, and there is nothing I can accept or pay for.' };
  if (outcome === O.CONSIGNMENT_DELIVERED) return { title: 'Tala Rook · consignment delivered', line: 'Dask completed his route with the original still aboard. This recovery is closed for this campaign.' };
  if (st?.phase === P.RECOVERY || st?.phase === P.HANDOFF) return { title: 'Tala Rook · original still outstanding', line: 'Bring the same CG-7 pod slowly to my exterior cradle. I quote its actual condition before accepting custody. Keeping it leaves the terms open and unpaid.' };
  if (st?.phase === P.RECON || st?.phase === P.DECIDE) return { title: 'Tala Rook · recovery in progress', line: 'Read CG-7 and scan its actual latch. Dask can negotiate at inspection; quiet service and ordinary force remain physical choices. Force carries ordinary legal consequences.' };
  return { title: T.offerTitle, line: T.offerLine, detail: T.offerDetail };
}

export function cinderglassJobContactRows(state, view = state?.cinderglassJobView) {
  if (state?.world?.currentSectorId !== CINDERGLASS_JOB_SECTOR_ID || !cinderglassJobFirstDeliveryComplete(state)) return [];
  const st = state.world?.cinderglassJob;
  const token = view?.token || state.cinderglassJobToken;
  if (!token) return [];
  const base = { featureId: 'cinderglassJob', sectorId: CINDERGLASS_JOB_SECTOR_ID,
    stationId: CINDERGLASS_JOB_STATION_ID, token, operationId: st?.operationId || null,
    revision: st?.promptRevision || 0 };
  const actorNames = st && st.phase !== P.OFFER && st.outcome !== O.DECLINED
    ? ['tala', ...(st.scanDone ? ['dask', 'broker'] : [])] : ['tala'];
  return actorNames.map(actor => ({ ...base, id: actor === 'tala' ? CINDERGLASS_JOB_TALA_CONTACT_ID : `cinderglassJob:${actor}`,
    actor, ...cinderglassJobRevisit(st, actor), actions: [
      { id: actor === 'tala' && (!st || st.phase === P.OFFER || st.outcome === O.DECLINED) ? 'contact' : 'revisit',
        label: actor === 'tala' && (!st || st.phase === P.OFFER || st.outcome === O.DECLINED) ? 'Read recovery terms' : 'Review remembered work', actor },
    ] }));
}
