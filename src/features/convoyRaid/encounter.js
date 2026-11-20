/** The real selfRegistered director contract. Physical simulation stays on the fixed clock. */
import { SWITCHBACK, SWITCHBACK_BRIEF } from './catalog.js';
import { getConvoyRaidRuntime, switchbackEntryPoint } from './runtime.js';

export function switchbackOfferReady(state) {
  const player = state?.entities?.get(state.playerId), entry = switchbackEntryPoint();
  const store = state?.convoyRaid;
  return state?.mode === 'flight' && state.world?.currentSectorId === SWITCHBACK.sectorId
    && player?.alive !== false && player?.hull > 0 && !store?.active && !store?.receipts?.length
    && !(state.run?.kind === 'survival' && state.run.phase !== 'inactive') && !state.physicsVenue?.active
    && Math.hypot(player.pos.x - entry.x, player.pos.z - entry.z) <= SWITCHBACK.entryRadius + 80;
}

export const SWITCHBACK_ENCOUNTER_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const owner = getConvoyRaidRuntime(state);
    if (!owner || !switchbackOfferReady(state)) { d.abort(live, 'switchback_lane_unavailable'); return; }
    state.convoyRaid.offered = true;
    live.vars ||= {};
    live.vars.switchbackRunId = live.id;
    live.phase = 'offer';
    live.deadlineAt = d.now() + SWITCHBACK.offerDurationS;
    d.say(live, 'info', SWITCHBACK_BRIEF, null, { literal: true, primary: true });
    d.offerChoices(live, ['escort', 'theft', 'decline'], 'decline', live.deadlineAt);
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    if (choiceId === 'decline') { d.resolve(live, 'declined'); return; }
    if (!['escort', 'theft'].includes(choiceId)) return;
    const owner = getConvoyRaidRuntime(state);
    if (!owner || !switchbackOfferReady(state)) { d.resolve(live, 'unavailable'); return; }
    const result = owner.start({ runId: live.vars.switchbackRunId, encounterId: live.id,
      choice: choiceId, seed: state.meta?.seed });
    if (!result.ok) {
      d.say(live, 'info', result.reason === 'lane_occupied'
        ? 'The freight lane is occupied. The train cannot depart safely.'
        : 'The freight crew cannot release this departure. No contract was opened.', null, { literal: true });
      d.resolve(live, 'unavailable'); return;
    }
    live.phase = 'switchback_running';
    live.deadlineAt = d.now() + SWITCHBACK.durationS + 5;
  },

  tick(d, live, state, now) {
    if (live.phase === 'offer') {
      if (now >= live.deadlineAt) d.resolve(live, 'declined');
      return;
    }
    if (live.phase !== 'switchback_running') return;
    const owner = getConvoyRaidRuntime(state), record = owner?.snapshot();
    if (!record || record.id !== live.vars.switchbackRunId) { d.resolve(live, 'invalid_restore'); return; }
    if (record.raid.phase === 'settled') d.resolve(live, record.raid.outcome);
    // Director runs on a slow calendar cadence. Never integrate the train or deliver rewards here.
  },
});

export default SWITCHBACK_ENCOUNTER_RUNTIME;
