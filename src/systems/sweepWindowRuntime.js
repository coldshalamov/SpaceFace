// Eris's existing Sweep Window: one scene adapter, not another mission/clock owner.
// Live references deliberately do not survive Continue: the director owns durable
// started/seen/receipts and drops interrupted encounters without paying them.
import { compileVignette } from './vignetteInterpreter.js';
import { fieldsFlag } from '../data/fields.js';
import {
  METRONOME_FIELD, METRONOME_GLOBAL_POS, METRONOME_PERIOD_S,
  pointInsideMetronomeBeam, metronomeBeamEtaAt,
} from '../data/environmentalMachinery.js';

export const SWEEP_WINDOW_ID = 'scene_sweep_window';
export const SWEEP_WINDOW_LANE = Object.freeze({
  // Count from just outside the actual560-WU beam. Counting inside the sweep
  // could shove the waiting runner off its mark once per cycle and prevent work.
  start: Object.freeze({ x: METRONOME_GLOBAL_POS.x + METRONOME_FIELD.radius + 60, z: METRONOME_GLOBAL_POS.z - 120 }),
  end: Object.freeze({ x: METRONOME_GLOBAL_POS.x + 400, z: METRONOME_GLOBAL_POS.z + 120 }),
  middle: Object.freeze({ x: METRONOME_GLOBAL_POS.x + (METRONOME_FIELD.radius + 460) / 2, z: METRONOME_GLOBAL_POS.z }),
  admissionRadius: 1000, observationRadius: 240, abandonRadius: 1200,
  deadlineS: 120, releaseEtaS: 4, arrivalRadius: 40, progress: 180,
});
const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a, b) => finite(a) && finite(b) ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;

export function sweepWindowFieldReady(registry) {
  const fields = registry?.get?.('fields');
  return fieldsFlag('enabled') && fields?.hasExternal?.(METRONOME_FIELD.id) === true;
}
export function sweepWindowAdmission(state, registry, player) {
  return state?.world?.currentSectorId === 'sector_eris_margin'
    && state.mode === 'flight' && state.timeScale > 0
    && player?.alive !== false && finite(player?.pos)
    && distance(player.pos, SWEEP_WINDOW_LANE.start) <= SWEEP_WINDOW_LANE.admissionRadius
    && sweepWindowFieldReady(registry);
}
export function sweepWindowGapOpen(now) {
  return Number.isFinite(now) && [SWEEP_WINDOW_LANE.start, SWEEP_WINDOW_LANE.middle, SWEEP_WINDOW_LANE.end]
    .every((p) => !pointInsideMetronomeBeam(p, now)
      && metronomeBeamEtaAt(p, now) >= SWEEP_WINDOW_LANE.releaseEtaS);
}
function say(d, live, text) { d.say(live, 'info', text, null, { literal: true }); }
function offerGap(d, live, deadline) {
  // _onChoose consumes one offer, not the whole scene. This is a NEW explicit
  // timing offer after observation (or after a refused unsafe call), never a
  // second dispatch of the original agreement.
  live.offerConsumed = false;
  d.offerChoices(live, ['a', 'c'], 'c', deadline);
}
function navigate(e, target, moving = false) {
  const data = e.data || (e.data = {});
  const ai = data.ai || (data.ai = {});
  ai.passive = true; ai.allowPassiveManeuver = true; ai.roe = 'hold_fire';
  ai.activity = { ...ai.activity, kind: moving ? 'transit' : 'loiter',
    reason: 'vignette_motion:sweep_window', anchor: { ...target },
    anchorVelocity: null, targetId: null, preferredRange: 0 };
  // Existing tactical navigation/aiPorts owns thrust and the physics body.
  const intent = data.intent || (data.intent = {});
  intent.tx = target.x; intent.tz = target.z; intent.fire = false;
}
function role(state, live, name) {
  const id = live.ids?.find((id) => live.roles?.[id] === name);
  return id == null ? null : state.entities?.get?.(id);
}
function valid(state, e) {
  return e && e.alive !== false && finite(e.pos) && state.entities?.get?.(e.id) === e;
}

export function createSweepWindowRuntime(spec) {
  // Keep the authored cast, prop, opening offer, tip/decline receipts, and sole writers.
  // The original free-success branch is unreachable through this adapter.
  const prelude = compileVignette({ ...spec, phases: spec.phases.map((p) =>
    p.id === 'run' || p.id === 'offer' ? { ...p, motion: 'hold' } : p) });
  const abort = (d, live, reason, text) => {
    const work = live.vars?.sweepWindow;
    if (work) work.finished = true;
    if (text) say(d, live, text);
    d.abort(live, reason);
  };
  const usable = (d, live, state) => {
    const work = live.vars?.sweepWindow, player = d.player?.();
    if (!work || work.finished || live.phase === 'done') return false;
    if (!sweepWindowFieldReady(d.registry)) {
      abort(d, live, 'sweep_unavailable', 'LOOKOUT: No live sweep. No count to sell.'); return false;
    }
    if (state.world?.currentSectorId !== 'sector_eris_margin'
      || !valid(state, work.runner) || !valid(state, work.cutter)
      || !valid(state, player) || distance(player.pos, SWEEP_WINDOW_LANE.start) > SWEEP_WINDOW_LANE.abandonRadius) {
      abort(d, live, 'sweep_subject_gone', 'LOOKOUT: Crossing called off. No arrival filed.'); return false;
    }
    if (d.now() >= work.deadline) {
      abort(d, live, 'sweep_timeout', 'LOOKOUT: Missed the working window. No crossing filed.'); return false;
    }
    return true;
  };
  return Object.freeze({
    fire(d, live, state) {
      if (!sweepWindowAdmission(state, d.registry, d.player?.())) {
        d.abort(live, 'sweep_unavailable'); return;
      }
      live.anchor = { ...SWEEP_WINDOW_LANE.start };
      prelude.fire(d, live, state);
      if (live.phase === 'done') return;
      const runner = role(state, live, 'runner'), cutter = role(state, live, 'ship_1');
      live.vars.sweepWindow = { runner, cutter, cutterPost: finite(cutter?.pos) ? { ...cutter.pos } : null,
        stage: 'offer', deadline: d.now() + SWEEP_WINDOW_LANE.deadlineS,
        observingSince: null, finished: false };
      if (!usable(d, live, state)) return;
      navigate(runner, SWEEP_WINDOW_LANE.start);
    },
    choose(d, live, state, choice) {
      if (state.mode !== 'flight' || !(state.timeScale > 0)) {
        // The director consumes before dispatch, even while simulation is paused.
        // Preserve only an outstanding offer; never restart counting or its deadline.
        const pending = live.vars?.sweepWindow;
        if (pending && !pending.finished && (live.phase === 'offer' || live.phase === 'sweep_gap')) {
          live.offerConsumed = false;
          // The UI already removed its card before emitting the choice. Restore
          // that explicit offer too, with the original (never extended) deadline.
          if (live.phase === 'sweep_gap') offerGap(d, live, pending.deadline);
          else d.offerChoices(live, ['a', 'b', 'c'], spec.timeoutChoice, live.deadlineAt);
        }
        return;
      }
      if (!usable(d, live, state)) return;
      const work = live.vars.sweepWindow;
      if (work.stage === 'offer') {
        if (live.phase !== 'offer') return;
        if (choice !== 'a') {
          if (choice !== 'b' && choice !== 'c') return;
          work.finished = true; prelude.choose(d, live, state, choice); return;
        }
        work.stage = 'observe'; live.phase = 'sweep_observe';
        live.vars.motion = null;
        say(d, live, 'LOOKOUT: Hold near the runner for one full eight-second sweep. Then call the gap. The runner still has to reach the far marker.');
      } else if (work.stage === 'gap') {
        if (choice === 'c') {
          work.finished = true;
          const stats = state.encounterDirector?.stats;
          if (stats) (stats.livedSeen || (stats.livedSeen = {}))[SWEEP_WINDOW_ID] = 'c';
          d.resolve(live, 'c', { speak: true }); return;
        }
        if (choice !== 'a') return;
        if (distance(work.runner.pos, SWEEP_WINDOW_LANE.start) > SWEEP_WINDOW_LANE.arrivalRadius
          || distance(d.player().pos, work.runner.pos) > SWEEP_WINDOW_LANE.observationRadius) {
          say(d, live, 'LOOKOUT: Back to the near marker. Call from beside the runner.');
          offerGap(d, live, work.deadline); return;
        }
        if (!sweepWindowGapOpen(state.simTime)) {
          say(d, live, 'LOOKOUT: Not yet. Let the beam pass the crossing, then call again.');
          offerGap(d, live, work.deadline); return;
        }
        work.stage = 'cross'; live.phase = 'sweep_cross';
        work.departure = { ...work.runner.pos };
        navigate(work.runner, SWEEP_WINDOW_LANE.end, true);
        say(d, live, 'LOOKOUT: Gap called. Stay with the runner until the far marker.');
      }
    },
    tick(d, live, state, now) {
      if (state.mode !== 'flight' || !(state.timeScale > 0) || !usable(d, live, state)) return;
      const work = live.vars.sweepWindow, player = d.player();
      navigate(work.cutter, work.cutterPost);
      if (work.stage === 'offer') {
        prelude.tick(d, live, state, now);
        if (live.phase !== 'done') {
          navigate(work.runner, SWEEP_WINDOW_LANE.start);
          navigate(work.cutter, work.cutterPost);
        }
        return;
      }
      if (work.stage === 'observe') {
        navigate(work.runner, SWEEP_WINDOW_LANE.start);
        if (distance(player.pos, work.runner.pos) > SWEEP_WINDOW_LANE.observationRadius
          || distance(work.runner.pos, SWEEP_WINDOW_LANE.start) > SWEEP_WINDOW_LANE.arrivalRadius) {
          work.observingSince = null; return;
        }
        if (work.observingSince == null) work.observingSince = now;
        if (now - work.observingSince < METRONOME_PERIOD_S) return;
        work.stage = 'gap'; live.phase = 'sweep_gap';
        say(d, live, 'LOOKOUT: Full sweep counted. Call the gap after the beam passes this crossing. Keep clear of the beam.');
        offerGap(d, live, work.deadline);
      } else if (work.stage === 'gap') {
        navigate(work.runner, SWEEP_WINDOW_LANE.start);
      } else if (work.stage === 'cross') {
        const separation = distance(player.pos, work.runner.pos);
        if (separation > 600) {
          abort(d, live, 'sweep_escort_lost', 'LOOKOUT: Lost your count. No escorted crossing filed.'); return;
        }
        if (!work.holdAnchor && separation > SWEEP_WINDOW_LANE.observationRadius) {
          work.holdAnchor = { ...work.runner.pos };
          say(d, live, 'LOOKOUT: Lost sight of your count. Runner holding. Close back alongside; the sweep and working window are still running.');
        }
        if (work.holdAnchor) {
          // Ordinary AI brakes toward the held mark; the beam, contacts and deadline
          // keep their authority. Rejoin well inside the ring to avoid boundary chatter.
          if (separation > SWEEP_WINDOW_LANE.observationRadius * 0.75) {
            navigate(work.runner, work.holdAnchor); return;
          }
          work.holdAnchor = null;
          say(d, live, 'LOOKOUT: Count reacquired. Runner moving for the far marker. Stay alongside.');
        }
        navigate(work.runner, SWEEP_WINDOW_LANE.end, true);
        if (distance(work.runner.pos, work.departure) < SWEEP_WINDOW_LANE.progress
          || distance(work.runner.pos, SWEEP_WINDOW_LANE.end) > SWEEP_WINDOW_LANE.arrivalRadius) return;
        // Reserve before synchronous owner intents: duplicate ticks/clicks cannot pay twice.
        work.finished = true;
        const stats = state.encounterDirector?.stats;
        if (stats) (stats.livedSeen || (stats.livedSeen = {}))[SWEEP_WINDOW_ID] = 'a';
        navigate(work.runner, SWEEP_WINDOW_LANE.end);
        d.grant(30, SWEEP_WINDOW_ID); d.rep('faction_quiet', 2, SWEEP_WINDOW_ID);
        // The director stores its bounded durable receipt only on the speaking path.
        // The owned scene receipt says actual arrival, never an unobserved empty beam.
        d.resolve(live, 'a', { speak: true });
      }
    },
  });
}

