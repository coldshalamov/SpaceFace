import { stationLifeProfile, stationLifeElapsed, stationBayCalls, stationPALine } from '../../data/stationLife.js';
import { bindStationLifeClock } from '../../presentation/stationLifeClock.js';

/** Docked presentation keeps breathing while the canonical simulation is paused. */
export function createStationLifePresenter(ctx, options = {}) {
  const { state, bus } = ctx;
  const now = options.now || (() => performance.now());
  const setTimer = options.setTimeout || globalThis.setTimeout;
  const clearTimer = options.clearTimeout || globalThis.clearTimeout;
  const receiptVisible = options.receiptVisible || (() => false);
  const receipt = options.showReceipt || (() => {});
  let timer = null, visible = false, disposed = false, visit = null;
  let competingUntil = 0, emitting = false;
  const offs = [];
  const current = () => state.ui?.docked ? state.ui.dockedStationId : null;
  const on = (event, fn) => { bus.on(event, fn); offs.push(() => bus.off(event, fn)); };
  const compete = () => { if (!emitting) competingUntil = now() + 7000; };
  on('barkDirector:voice', compete);
  on('tutorial:say', compete);
  on('presentation:caption', compete);
  const cue = (id, gain = 1, extra = {}) => bus.emit('audio:cue', { id, gain, ...extra });
  function speak(text, profile, label = 'Public address') {
    emitting = true;
    try {
      // The ordinary station receipt is the always-available caption, including muted play.
      receipt(label, text, profile.shift.name);
      bus.emit('barkDirector:voice', { text, factionId: profile.factionId,
        speakerName: `${profile.stationName} · PA`, situation: 'patrol-greeting', importance: .15 });
    } finally { emitting = false; }
  }
  function bindStage() {
    const request = state.ui?.stageRequest;
    if (request?.scene === 'berth' && visit) bindStationLifeClock(request, visit.clock);
  }
  function cancel() { if (timer !== null) clearTimer(timer); timer = null; }
  function tick() {
    timer = null;
    if (!visible || disposed || !visit || current() !== visit.stationId) return;
    const t = now();
    const seconds = stationLifeElapsed(visit.clock, t);
    const profile = stationLifeProfile(state, visit.stationId);
    if (!profile) return;
    bindStage();
    if (seconds >= visit.crowdAt) {
      cue('ambient_station_crowd', profile.crowdGain, { rate: profile.crowdHz / 680 });
      cue('ambient_station_murmur', profile.crowdGain * .65,
        { rate: (profile.crowdHz / 680) * (.9 + profile.shift.index * .08) });
      visit.crowdAt = seconds + 5;
    }
    // Entry identifies the current watch; subsequent bells require a real calendar boundary.
    const shiftKey = `${profile.shift.watchDay}:${profile.shift.index}`;
    if (seconds >= 8 && shiftKey !== visit.shiftKey && t >= competingUntil && !receiptVisible()) {
      cue('ambient_station_shift_bell', .6, { rate: 1 + profile.shift.index * .122 });
      visit.shiftKey = shiftKey;
      speak(stationPALine(profile), profile, 'Watch bell');
      visit.paAt = seconds + 24;
    }
    const calls = stationBayCalls(visit.lastS, seconds, profile);
    if (t >= competingUntil && !receiptVisible()) {
      if (calls.length) speak(calls[0].text, profile, 'Berth control');
      else if (seconds >= visit.paAt) {
        speak(stationPALine(profile, ++visit.paIndex), profile);
        visit.paAt = seconds + 32;
      }
    }
    visit.lastS = seconds;
    timer = setTimer(tick, 500);
  }
  function invalidate() { cancel(); visit = null; }
  for (const event of ['dock:undocked', 'save:restoring', 'game:new', 'game:newGame']) on(event, invalidate);
  return {
    show() {
      if (disposed) return;
      visible = true;
      const stationId = current();
      if (!stationId || !stationLifeProfile(state, stationId)) return;
      if (visit?.stationId !== stationId) visit = { stationId,
        clock: { elapsedS: 0, updatedAt: now(), running: true },
        lastS: 0, crowdAt: 1, paAt: 20, paIndex: 0, shiftKey: null };
      else { visit.clock.updatedAt = now(); visit.clock.running = true; }
      bindStage(); cancel(); timer = setTimer(tick, 500);
    },
    hide() {
      visible = false; cancel();
      if (visit) { visit.clock.elapsedS = stationLifeElapsed(visit.clock, now()); visit.clock.running = false; }
    },
    dispose() { disposed = true; visible = false; invalidate(); offs.splice(0).forEach(off => off()); },
  };
}
