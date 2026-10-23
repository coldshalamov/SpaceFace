import { BLACKBOX_RUNS_SITE, getExpeditionSiteLayout } from './site.js';
import { isExpeditionTerminal } from './model.js';

const OFFER_S = 90;

/**
 * Exact selfRegistered fire/choose/tick contract used by encounterDirector.
 * This invitation owns zero entities. The registered expedition owner owns
 * every body, custody record, physics command, reward and save boundary.
 */
export const BLACKBOX_RUNS_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const api = d.helpers?.derelictExpedition;
    if (!api?.start || !api?.getStatus) { d.abort(live, 'expedition_owner_unavailable'); return; }
    if (state.world?.currentSectorId !== BLACKBOX_RUNS_SITE.sectorId) { d.abort(live, 'wrong_sector'); return; }
    const prior = api.getStatus(BLACKBOX_RUNS_SITE.id);
    if (prior && isExpeditionTerminal(prior.record)) { d.resolve(live, 'spent'); return; }
    const player = d.player();
    const layout = prior?.layout || getExpeditionSiteLayout(state.meta?.seed ?? 0);
    if (!player?.pos || Math.hypot(player.pos.x - layout.entry.x, player.pos.z - layout.entry.z) > BLACKBOX_RUNS_SITE.invitationRadius) {
      d.abort(live, 'approach_derelict'); return;
    }
    live.phase = 'offer';
    live.deadlineAt = d.now() + OFFER_S;
    d.say(live, 'info', prior
      ? 'Morrowglass is still here. Your cleared holds, cargo and reactor pressure are unchanged. Return to the same run?'
      : live.shape.primaryLine, null, { literal: true, primary: true });
    d.offerChoices(live, ['enter', 'decline'], 'decline', live.deadlineAt);
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer' || !['enter', 'decline'].includes(choiceId)) return;
    if (choiceId === 'decline') { d.resolve(live, 'declined'); return; }
    const result = d.helpers?.derelictExpedition?.start(BLACKBOX_RUNS_SITE.id);
    if (!result?.ok) {
      if (result?.reason === 'clear_spawn_area') d.say(live, 'info',
        'Move clear of the broken hull before the recovery rig comes online.', null, { literal: true });
      d.abort(live, result?.reason || 'expedition_owner_unavailable');
      return;
    }
    // resolve() schedules only live.ids for despawn. This invitation never
    // claims the feature-owned bodies, so its receipt cannot erase an expedition.
    d.resolve(live, result.resumed ? 'resumed' : 'accepted');
  },

  tick(d, live, state, now) {
    if (live.phase === 'offer' && now >= live.deadlineAt) d.resolve(live, 'declined');
  },
});

export default BLACKBOX_RUNS_RUNTIME;
