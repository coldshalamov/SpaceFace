// Real selfRegistered director contract, matching glueMeetMassRuntime: only
// fire/choose/tick plus the director's existing say/offerChoices/resolve ports.
// Physics does NOT run here: encounterDirector is a 1 Hz calendar owner.
import { createTowjawRuntime, getActiveTowjawRuntime, isTowjawClockInstalled } from './runtime.js';
import { TOWJAW } from './catalog.js';
import { validPoint } from './geometry.js';

const OFFER_S = 60;

function fieldCandidates(d, live) {
  if (!validPoint(live.anchor)) return [];
  const player = d.player();
  if (!player?.pos) return [];
  const rng = d.stream(live, 'towjaw-field');
  const base = Math.atan2(live.anchor.z - player.pos.z, live.anchor.x - player.pos.x);
  const radius = Math.min(320, Math.max(220, Number(live.zoneRadius) * 0.65 || 260));
  const points = [{ ...live.anchor }];
  for (let i = 0; i < 8; i++) {
    const angle = base + i * Math.PI / 4 + (rng() - 0.5) * 0.1;
    points.push({ x: live.anchor.x + Math.cos(angle) * radius,
      z: live.anchor.z + Math.sin(angle) * radius });
  }
  return points;
}

export const TOWJAW_ENCOUNTER_RUNTIME = Object.freeze({
  fire(d, live, state) {
    if (live.sectorId !== TOWJAW.sectorId || state.world?.currentSectorId !== TOWJAW.sectorId) {
      d.abort(live, 'wrong_sector'); return;
    }
    if (state.story?.flags?.towjawIssued) { d.resolve(live, 'already_settled', { speak: false }); return; }
    if (!validPoint(live.anchor)) { d.abort(live, 'missing_field_anchor'); return; }
    live.phase = 'offer'; live.deadlineAt = d.now() + OFFER_S;
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
    d.offerChoices(live, ['investigate', 'decline'], 'decline', live.deadlineAt);
  },
  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    if (choiceId !== 'investigate') { d.resolve(live, 'declined'); return; }
    if (!isTowjawClockInstalled(state)) { d.abort(live, 'towjaw_fixed_clock_missing'); return; }
    const runtime = createTowjawRuntime({ state, bus: d.bus, helpers: d.helpers, registry: d.registry });
    let result = null;
    for (const origin of fieldCandidates(d, live)) {
      const player = d.player();
      result = runtime.start({ encounterId: live.id, sectorId: live.sectorId,
        seed: state.meta?.seed, origin,
        heading: Math.atan2(player.pos.z - origin.z, player.pos.x - origin.x) });
      if (result.ok || result.reason === 'spawn_failed' || result.reason === 'already_issued') break;
    }
    if (!result?.ok) { runtime.dispose('admission_failed'); d.abort(live, result?.reason || 'no_safe_field'); return; }
    live.phase = 'towjaw'; live.vars.towjawBossId = result.bossId;
    live.vars.towjawStartedAt = d.now(); live.vars.towjawFinished = false;
    const saved = runtime.snapshot();
    live.ids.push(...result.ids);
    for (const row of saved.bindings) live.roles[row.id] = row.role;
    d.say(live, 'info', 'The cage is loose wreckage. Pull plates clear, pin the jaw, or throw scrap into an exposed winch. Every mechanism can also be shot. Leave the field to disengage.', null, { literal: true });
  },
  tick(d, live, state, now) {
    if (live.phase === 'offer') {
      if (now >= live.deadlineAt) d.resolve(live, 'declined');
      return;
    }
    if (live.phase !== 'towjaw' || live.vars.towjawFinished) return;
    const runtime = getActiveTowjawRuntime(state);
    if (runtime?.getView()?.encounterId === live.id) return;
    live.vars.towjawFinished = true;
    const outcome = state.story?.flags?.towjawOutcome;
    d.resolve(live, outcome === 'defeat' ? 'defeated' : 'retreated');
  },
});

export default TOWJAW_ENCOUNTER_RUNTIME;
