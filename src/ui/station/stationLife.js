import { stationLifeProfile, stationLifeElapsed, stationBayCalls, stationPALine, stationMarketLine } from '../../data/stationLife.js';
import { bindStationLifeClock } from '../../presentation/stationLifeClock.js';
import { laneRpc, laneCommandSink } from '../../core/simLaneCommands.js';

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
  let requestGeneration = 0;
  const request = options.request || laneRpc;
  const offs = [];
  const current = () => state.ui?.docked ? state.ui.dockedStationId : null;
  // Bus-optional construction: the lifecycle suite drives a bare `{ state: {} }` presenter
  // inertly, so a missing bus subscribes to nothing and emits nothing (pinned-suite repair).
  const hasBus = !!(bus && typeof bus.on === 'function' && typeof bus.off === 'function');
  const canEmit = !!(bus && typeof bus.emit === 'function');
  const on = (event, fn) => {
    if (!hasBus) return;
    bus.on(event, fn);
    offs.push(() => bus.off(event, fn));
  };
  const compete = () => { if (!emitting) competingUntil = now() + 7000; };
  on('barkDirector:voice', compete);
  on('tutorial:say', compete);
  on('presentation:caption', compete);
  const cue = (id, gain = 1, extra = {}) => {
    if (canEmit) bus.emit('audio:cue', { id, gain, ...extra });
  };
  function speak(text, profile, label = 'Public address') {
    emitting = true;
    try {
      // The ordinary station receipt is the always-available caption, including muted play.
      receipt(label, text, profile.shift.name);
      if (canEmit) {
        bus.emit('barkDirector:voice', { text, factionId: profile.factionId,
          speakerName: `${profile.stationName} · PA`, situation: 'patrol-greeting', importance: .15 });
      }
    } finally { emitting = false; }
  }
  function bindStage() {
    const request = state.ui?.stageRequest;
    if (request?.scene === 'berth' && visit) bindStationLifeClock(request, visit.clock);
  }
  function cancel() { if (timer !== null) clearTimer(timer); timer = null; }
  function requestMarket() {
    if (!visible || disposed || !visit || visit.marketPending || current() !== visit.stationId) return;
    const owner = visit, token = ++requestGeneration, sink = laneCommandSink();
    owner.marketPending = true;
    Promise.resolve().then(() => request('marketHistory', { stationId: owner.stationId, includeObservedComparisons: true }))
      .then((ack) => {
        if (disposed || !visible || visit !== owner || token !== requestGeneration
          || laneCommandSink() !== sink || current() !== owner.stationId) return;
        let result = ack;
        for (let i = 0; i < 3 && result && !result.observedComparisons; i++) {
          if (result.ok === false) return;
          result = result.result;
        }
        const summary = result?.observedComparisons;
        if (summary?.stationId === owner.stationId) owner.marketObserved = summary;
      }).catch(() => {}).finally(() => { if (visit === owner && token === requestGeneration) owner.marketPending = false; });
  }
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
        // The market desk takes the free PA slot once per watch (inf-pa-market-desk): the
        // desk chime answers first, then the line reads what this station's own market
        // just did. No news, no move — the ordinary rotation keeps the floor.
        const market = stationMarketLine(state, visit.stationId, visit.marketObserved);
        requestMarket();
        const watchKey = `${profile.shift.watchDay}:${profile.shift.index}`;
        if (market && visit.marketKey !== watchKey) {
          visit.marketKey = watchKey;
          cue('ambient_station_market_chime', .5);
          speak(market.text, profile, 'Market desk');
        } else {
          speak(stationPALine(profile, ++visit.paIndex), profile);
        }
        visit.paAt = seconds + 32;
      }
    }
    visit.lastS = seconds;
    timer = setTimer(tick, 500);
  }
  function invalidate() { requestGeneration++; cancel(); visit = null; }
  for (const event of ['dock:undocked', 'save:restoring', 'game:new', 'game:newGame']) on(event, invalidate);
  return {
    // The lifecycle suite pins this read; the module flag was never exposed before
    // inf-pa-market-desk touched the owner (pinned-suite repair, same lane).
    get visible() { return visible; },
    show() {
      if (disposed) return;
      visible = true;
      const stationId = current();
      if (!stationId || !stationLifeProfile(state, stationId)) return;
      if (visit?.stationId !== stationId) visit = { stationId,
        clock: { elapsedS: 0, updatedAt: now(), running: true },
        lastS: 0, crowdAt: 1, paAt: 20, paIndex: 0, shiftKey: null, marketKey: null };
      else { visit.clock.updatedAt = now(); visit.clock.running = true; }
      bindStage(); cancel(); requestMarket(); timer = setTimer(tick, 500);
    },
    hide() {
      visible = false; requestGeneration++; if (visit) visit.marketPending = false; cancel();
      if (visit) { visit.clock.elapsedS = stationLifeElapsed(visit.clock, now()); visit.clock.running = false; }
    },
    dispose() { disposed = true; visible = false; invalidate(); offs.splice(0).forEach(off => off()); },
  };
}
