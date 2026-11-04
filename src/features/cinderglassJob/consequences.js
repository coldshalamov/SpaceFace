import { CINDERGLASS_JOB_OUTCOMES as O, CINDERGLASS_JOB_CARRIER_FACTION } from './definition.js';
import { rememberFact } from './operation.js';
import { podEntity } from './custody.js';

// Payment is exclusively settleCinderglassResult on the canonical economy owner.
export function cinderglassJobApplyClosingMemory(sys, state) {
  const st = sys._cg, out = st.outcome?.id;
  if (!out) return;
  if (!st.actors.dask.alive) rememberFact(st, state.simTime, 'dask_dead', 'Oren Dask died on his route. Meridian remembers its lost captain.');
  if (out === O.SOLD_BROKER) rememberFact(st, state.simTime, 'brokered', 'Khand has custody of the sealed original. Dask’s manifest still claims it; this was an unlawful sale.');
  if ([O.RETURNED_TALA, O.RETURNED_DAMAGED].includes(out)) rememberFact(st, state.simTime, 'returned', 'Tala accepted the original controller at her exterior cradle. The agreed recovery is settled.');
  if ([O.DESTROYED, O.LOST].includes(out)) rememberFact(st, state.simTime, 'lost', 'The original controller is lost. No replacement consignment will be sent.');
}

export function cinderglassJobApplyConsequences(sys, state) {
  const st = sys._cg;
  if (st.settlement?.recipient !== 'broker') return;
  st.effectsApplied ||= {};
  const factions = sys.registry?.get('factions');
  for (const [key, faction, delta] of [['manifestLoss', CINDERGLASS_JOB_CARRIER_FACTION, -6], ['fenceStanding', 'faction_quiet', 4]]) {
    if (st.effectsApplied[key] || typeof factions?.applyRep !== 'function') continue;
    st.effectsApplied[key] = true;
    factions.applyRep(faction, delta, 'cinderglass:unlawful_sale', `${st.operationId}:sale`);
    if (sys._cg !== st) return;
  }
  const law = sys.registry?.get('lawSecurity'), pod = podEntity(sys, state);
  if (!st.lawReceipt && pod && typeof law?.reportIncident === 'function') {
    st.lawReceipt = law.reportIncident({ reportId: `${st.operationId}:unlawful-sale`,
      kind: 'payload_theft', offenderStableId: 'player', offenderEntityId: state.playerId,
      payloadStableId: pod.data.originalId, causalTick: state.tick, pos: { x: pod.pos.x, z: pod.pos.z },
      victim: pod, victimEntityId: sys._cg.entities.carrierId });
    // The existing law owner may deny an unwitnessed/out-of-jurisdiction report; no invented heat.
    rememberFact(st, state.simTime, 'sale_law', st.lawReceipt?.accepted
      ? 'Authorities recorded the witnessed consignment theft.'
      : 'The sale remains unlawful. No authority has accepted a witnessed charge here.');
  }
}
