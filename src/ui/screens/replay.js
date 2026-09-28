// Replay surface (PQ-160.00) — the player-facing end of the deterministic replay ring buffer.
//
// The sim is deterministic, so the last thirty seconds can be replayed from the recorded input tape
// with the photo-mode presentation (HUD hidden, the world held). This module owns only the surface:
// it resolves the recording captured by the ring buffers, presents its timeline, and plays the tape
// back. It never records video and never mutates gameplay state.
//
// ORRERY Wave 2: the instrument is the TAPE — a 30s tracing-beam timeline across the lower third.
// Scale with 5s major / 1s minor ticks, event ticks (stunts, kills red, damage, boost windows),
// and a playhead that IS the amber Hand arm (spring overshoot). Signature: "ride the tape".

import { el, words, settle, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectOrrery } from '../orrery/tokens.js';
import { svg } from '../orrery/svg.js';
import { createSpring, reducedMotion } from '../orrery/motion.js';
import { createCounter, decrypt } from '../orrery/text.js';
import { dressLampKey } from '../orrery/lampKey.js';

export const REPLAY_LABEL = 'Replay';
export const REPLAY_SCREEN_ID = 'replay';
/** The pause photo-mode presentation class (HUD hidden, world visible). */
export const PHOTO_PRESENTATION_CLASS = 'k-photo';
/** Dormant tape span: the instrument asleep still rules thirty seconds. */
export const REPLAY_TAPE_SECONDS = 30;

const TAPE_PAD = 10;

let activeRecording = null;
let openState = null;
/** A tick the tape should open at (the Clips PLAY-IN-REPLAY cross-link). Consumed on build. */
let pendingSeekTick = null;

/** Publish a completed ring-buffer recording for the replay surface to present. */
export function setReplayRecording(recording) {
  activeRecording = recording || null;
}

export function getReplayRecording() {
  return activeRecording;
}

/** The Clips PLAY-IN-REPLAY cross-link: the next tape opens with its playhead here. */
export function requestReplaySeek(tick) {
  const t = Math.floor(Number(tick));
  pendingSeekTick = Number.isFinite(t) && t >= 0 ? t : null;
}

/** Resolve the recording from the in-memory store or a transient presentation field on state. */
export function resolveReplayRecording(ctx) {
  if (activeRecording) return activeRecording;
  const state = ctx && ctx.state;
  const fromState = state && state.replay && state.replay.recording;
  return fromState || null;
}

/** Pure summary used by the surface and tests. */
export function replaySummary(recording) {
  const ticks = recording ? Math.max(0, recording.ticks | 0) : 0;
  if (!recording || !(ticks > 0)) {
    return {
      available: false,
      label: 'No replay recorded yet',
      detail: 'Fly for a while, then pause and open Replay.',
    };
  }
  const tickRate = Math.max(1, recording.tickRate | 0 || 60);
  const seconds = Number.isFinite(recording.seconds) && recording.seconds > 0
    ? recording.seconds
    : ticks / tickRate;
  return {
    available: true,
    seed: recording.seed,
    ticks,
    tickRate,
    seconds,
    label: 'Last ' + Math.round(seconds) + ' s',
    detail: ticks + ' ticks · seed ' + recording.seed,
  };
}

/** Clamp elapsed wall seconds to a recorded tick index. */
export function replayFrameIndex(recording, elapsedSeconds) {
  if (!recording) return -1;
  const ticks = Math.max(1, recording.ticks | 0);
  const tickRate = Math.max(1, recording.tickRate | 0 || 60);
  const index = Math.floor(Math.max(0, Number(elapsedSeconds) || 0) * tickRate);
  return Math.max(0, Math.min(ticks - 1, index));
}

/** The recorded snapshot slot for a given elapsed time (null when the ring no longer holds it). */
export function replayFrameAt(recording, elapsedSeconds) {
  const index = replayFrameIndex(recording, elapsedSeconds);
  if (index < 0 || !recording.snapshotRing) return null;
  return recording.snapshotRing.get(index) || null;
}

function fmtTapeTime(seconds) {
  return (Math.max(0, Number(seconds) || 0)).toFixed(1);
}

/**
 * Event ticks for the tape, newest-source order preserved, sorted by tick.
 * Sources (all real): the clip director's rated moments (stunt/kill), and a recording's own
 * `events` list when its producer attached one (damage, and any future tape marks). Each event
 * is { tick, type: 'stunt'|'kill'|'damage'|'boost', label }.
 */
export function replayTapeEvents(recording, director) {
  const out = [];
  const seen = new Set();
  const push = (tick, type, label) => {
    const t = Math.floor(Number(tick));
    if (!Number.isFinite(t) || t < 0) return;
    const kind = type === 'kill' ? 'kill'
      : type === 'damage' || type === 'death' ? 'damage'
      : type === 'boost' ? 'boost' : 'stunt';
    const key = t + '|' + kind + '|' + String(label || '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ tick: t, type: kind, label: label ? String(label) : (kind === 'kill' ? 'Kill' : kind === 'damage' ? 'Damage' : kind === 'boost' ? 'Boost' : 'Stunt') });
  };
  if (director && typeof director.list === 'function') {
    let clips = [];
    try { clips = director.list() || []; } catch (_) { clips = []; }
    for (const clip of clips) {
      if (!clip || typeof clip !== 'object') continue;
      const tick = Number.isFinite(Number(clip.momentTick)) ? Number(clip.momentTick) : Number(clip.startTick);
      if (clip.kind === 'kill') push(tick, 'kill', clip.label || 'Kill');
      else if (clip.kind === 'death') push(tick, 'damage', clip.label || 'Death');
      else push(tick, 'stunt', clip.label || clip.trickId || 'Stunt');
    }
  }
  const list = recording && Array.isArray(recording.events) ? recording.events : [];
  const tickRate = recording && Number.isFinite(Number(recording.tickRate)) && Number(recording.tickRate) > 0
    ? Number(recording.tickRate) : 60;
  for (const ev of list) {
    if (!ev || typeof ev !== 'object') continue;
    const tick = Number.isFinite(Number(ev.tick)) ? Number(ev.tick)
      : Number.isFinite(Number(ev.t)) ? Number(ev.t)
      : Number.isFinite(Number(ev.second)) ? Number(ev.second) * tickRate
      : Number.isFinite(Number(ev.s)) ? Number(ev.s) * tickRate : NaN;
    push(tick, ev.type || ev.kind, ev.label || ev.name);
  }
  const cap = recording ? Math.max(0, recording.ticks | 0) : 0;
  const trimmed = cap > 0 ? out.filter((e) => e.tick < cap) : out;
  trimmed.sort((a, b) => a.tick - b.tick);
  return trimmed;
}

/**
 * Boost windows read off the real input tape: runs of ticks where the recorded command holds
 * boost. Returns [{ startTick, endTick }] merged (runs under 0.1 s are flicker, gaps under
 * 0.2 s are one burn). Empty when the recording carries no input ring.
 */
export function replayBoostWindows(recording) {
  const ring = recording && recording.inputRing;
  if (!ring || typeof ring !== 'object') return [];
  const ticks = Math.max(0, recording.ticks | 0);
  if (!(ticks > 0)) return [];
  const tickRate = Math.max(1, recording.tickRate | 0 || 60);
  const minRun = Math.max(2, Math.round(tickRate * 0.1));
  const maxGap = Math.max(1, Math.round(tickRate * 0.2));
  const boosted = new Array(ticks).fill(false);
  const mark = (tick, slot) => {
    const t = Math.floor(Number(tick));
    if (!Number.isFinite(t) || t < 0 || t >= ticks || !slot) return;
    const data = slot.data || slot.input || slot;
    if (data && data.boost === true) boosted[t] = true;
  };
  try {
    if (typeof ring.forEach === 'function') {
      ring.forEach((slot, tick) => mark(tick == null ? slot && slot.tick : tick, slot));
    } else if (typeof ring.read === 'function') {
      for (let t = 0; t < ticks; t += 1) mark(t, ring.read(t));
    } else {
      return [];
    }
  } catch (_) {
    return [];
  }
  const runs = [];
  let start = -1;
  for (let t = 0; t <= ticks; t += 1) {
    const on = t < ticks && boosted[t];
    if (on && start < 0) start = t;
    if (!on && start >= 0) {
      if (t - start >= minRun) runs.push({ startTick: start, endTick: t - 1 });
      start = -1;
    }
  }
  const merged = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run.startTick - prev.endTick <= maxGap) prev.endTick = run.endTick;
    else merged.push({ ...run });
  }
  return merged;
}

function stopPlayback() {
  if (!openState) return;
  if (openState.view) disposeTapeView(openState.view);
  openState.view = null;
  openState.playing = false;
}

function disposeTapeView(view) {
  if (!view || view.disposed) return;
  view.disposed = true;
  if (view.raf != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(view.raf);
  }
  view.raf = null;
  if (view.ro && typeof view.ro.disconnect === 'function') view.ro.disconnect();
  if (view.playheadSpring) view.playheadSpring.stop();
  if (view.keyHandler && typeof window !== 'undefined') {
    window.removeEventListener('keydown', view.keyHandler, true);
  }
}

function suppressPauseRoot(rootEl, on) {
  if (!rootEl) return;
  if (on) {
    rootEl.style.visibility = 'hidden';
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.inert = true;
  } else {
    rootEl.style.removeProperty('visibility');
    rootEl.removeAttribute('aria-hidden');
    rootEl.inert = false;
  }
  // Gamepad focus walks stop before the screen root, so children must be inert too.
  const kids = rootEl.children;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) kids[i].inert = !!on;
}

function focusFirstOverlayControl(overlay) {
  if (!overlay || typeof overlay.querySelector !== 'function') return;
  const first = overlay.querySelector('.orr-replay__transport button, .orr-replay__exit button');
  if (!first || typeof first.focus !== 'function') return;
  try { first.focus({ preventScroll: true }); } catch (_) {
    try { first.focus(); } catch (_) { /* pointer still reaches the overlay */ }
  }
}

function closeReplay() {
  if (!openState) return;
  stopPlayback();
  const { overlay, rootEl, onKey } = openState;
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true);
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  suppressPauseRoot(rootEl, false);
  if (typeof document !== 'undefined') document.body.classList.remove(PHOTO_PRESENTATION_CLASS);
  openState = null;
  cue('close');
}

/** Safe to call when Replay is not open (Pause onHide, stack pop). */
export function forceCloseReplay() {
  closeReplay();
}

function exitTape(view) {
  if (openState && openState.view === view) {
    closeReplay();
    return;
  }
  // Mount path: the view stays alive under mount()/onHide ownership; popping never orphans it.
  const ctx = view.ctx;
  const mgr = ctx && (ctx.screenManager
    || (ctx.screens && ctx.screens.pushScreen ? ctx.screens : null)
    || (ctx.registry && ctx.registry.get && ctx.registry.get('ui') && ctx.registry.get('ui').screenManager));
  if (mgr && typeof mgr.popScreen === 'function') {
    try { mgr.popScreen(); } catch (_) { /* staying put is honest too */ }
  }
}

/** FLY TO RECORD: close the instrument and unpause into flight (pause's own resume path). */
function flyToRecord(ctx) {
  closeReplay();
  if (ctx && ctx.state && ctx.state.mode === 'paused') ctx.state.mode = 'flight';
  const mgr = ctx && (ctx.screenManager
    || (ctx.screens && ctx.screens.pushScreen ? ctx.screens : null)
    || (ctx.registry && ctx.registry.get && ctx.registry.get('ui') && ctx.registry.get('ui').screenManager));
  if (mgr && typeof mgr.popScreen === 'function') {
    try { mgr.popScreen(); } catch (_) { /* the mode change already resumes flight */ }
  } else if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
    try { ctx.bus.emit('ui:popScreen', {}); } catch (_) { /* mode change stands */ }
  }
}

function tapeXToTick(px, width, ticks) {
  const span = Math.max(1, width - TAPE_PAD * 2);
  const f = Math.max(0, Math.min(1, (px - TAPE_PAD) / span));
  return Math.max(0, Math.min(ticks - 1, Math.round(f * (ticks - 1))));
}

function tapeTickToX(tick, width, ticks) {
  const span = Math.max(1, width - TAPE_PAD * 2);
  const f = ticks > 1 ? Math.max(0, Math.min(1, tick / (ticks - 1))) : 0;
  return TAPE_PAD + f * span;
}

/**
 * The event-label solver: one greedy pass, two rows. A label takes the first row whose last label
 * ends far enough left (width estimated from the word, never measured mid-frame). Labels never
 * touch each other; they may cross the playhead arm, which is light, not type.
 */
function solveEventRows(events, width, ticks) {
  const lastEnd = [-1e9, -1e9];
  return events.map((ev) => {
    const x = tapeTickToX(ev.tick, width, ticks);
    // Uppercase Archivo 600 at 12px + .1em tracking runs ~8.2px a glyph; underestimating
    // this stacked two labels on the populated still (REAVER CORSAIR / ARMOR CRACKED).
    const half = Math.min(170, String(ev.label || '').length * 8.2 + 16) / 2;
    let row = 0;
    if (x - half > lastEnd[0] + 10) row = 0;
    else if (x - half > lastEnd[1] + 10) row = 1;
    else row = lastEnd[0] < lastEnd[1] ? 0 : 1;
    lastEnd[row] = Math.max(lastEnd[row], x + half);
    return { ev, x, row };
  });
}

const TAPE_H = 172;
const TAPE_SCALE_Y = 106;
const TAPE_LABEL_TOPS = [30, 52];
const TAPE_SEC_TOP = 128;

function buildTapeSvg(view, width) {
  const { summary, events, boosts } = view;
  const available = summary.available;
  const ticks = available ? summary.ticks : REPLAY_TAPE_SECONDS * 60;
  const tickRate = available ? summary.tickRate : 60;
  const seconds = available ? summary.seconds : REPLAY_TAPE_SECONDS;
  const NS = 'http://www.w3.org/2000/svg';
  while (view.svg.firstChild) view.svg.firstChild.remove();
  view.svg.setAttribute('width', String(Math.max(1, Math.round(width))));
  view.svg.setAttribute('height', String(TAPE_H));
  view.svg.setAttribute('viewBox', `0 0 ${Math.max(1, Math.round(width))} ${TAPE_H}`);
  const x0 = TAPE_PAD;
  const x1 = Math.max(x0 + 1, width - TAPE_PAD);
  const line = `M ${x0} ${TAPE_SCALE_Y} L ${x1} ${TAPE_SCALE_Y}`;
  const band = svg('path', { d: line, class: 'orr-band' });
  band.style.setProperty('--orr-band-a', available ? '0.24' : '0.18');
  if (!available) band.setAttribute('opacity', '0.85');
  view.svg.appendChild(band);
  const edge = svg('path', { d: line, class: 'orr-edge' });
  if (!available) edge.setAttribute('opacity', '0.7');
  view.svg.appendChild(edge);
  // The played beam: lit bone at rest, never ice (ice is the travelling pulse, motion only).
  view.fillBloom = svg('path', { d: line, class: 'orr-lit-bloom', pathLength: 1, 'stroke-dasharray': '0 1' });
  view.fill = svg('path', { d: line, class: 'orr-lit', pathLength: 1, 'stroke-dasharray': '0 1' });
  view.svg.appendChild(view.fillBloom);
  view.svg.appendChild(view.fill);
  // The ruled scale: 5 s majors, 1 s minors.
  const minor = [];
  const major = [];
  const whole = Math.floor(seconds);
  for (let s = 0; s <= whole; s += 1) {
    const x = tapeTickToX(Math.min(ticks - 1, Math.round((s / seconds) * (ticks - 1))), width, ticks);
    if (s % 5 === 0) major.push(`M ${x} ${TAPE_SCALE_Y - 8} L ${x} ${TAPE_SCALE_Y + 14}`);
    else minor.push(`M ${x} ${TAPE_SCALE_Y - 4} L ${x} ${TAPE_SCALE_Y + 8}`);
  }
  if (minor.length) {
    const p = svg('path', { d: minor.join(' '), class: 'orr-tick' });
    if (!available) p.setAttribute('opacity', '0.65');
    view.svg.appendChild(p);
  }
  if (major.length) {
    const p = svg('path', { d: major.join(' '), class: 'orr-tick orr-tick--major' });
    if (!available) p.setAttribute('opacity', '0.8');
    view.svg.appendChild(p);
  }
  // Boost burns ride above the band as lit beam segments.
  for (const win of boosts) {
    const bx0 = tapeTickToX(win.startTick, width, ticks);
    const bx1 = tapeTickToX(win.endTick, width, ticks);
    if (bx1 - bx0 < 3) continue;
    view.svg.appendChild(svg('path', {
      d: `M ${bx0} ${TAPE_SCALE_Y - 17} L ${bx1} ${TAPE_SCALE_Y - 17}`,
      class: 'orr-lit', opacity: '0.85',
    }));
  }
  // Event ticks: stunts bone, kills and damage red (the threat channel's only other use).
  for (const ev of events) {
    const x = tapeTickToX(ev.tick, width, ticks);
    const g = svg('g', {});
    if (ev.type === 'kill' || ev.type === 'damage') {
      const red = document.createElementNS(NS, 'path');
      red.setAttribute('d', `M ${x} ${TAPE_SCALE_Y - 14} L ${x} ${TAPE_SCALE_Y + 14}`);
      red.setAttribute('class', 'orr-bloom orr-threat');
      red.setAttribute('stroke-width', '8');
      g.appendChild(red);
      const core = document.createElementNS(NS, 'path');
      core.setAttribute('d', `M ${x} ${TAPE_SCALE_Y - 14} L ${x} ${TAPE_SCALE_Y + 14}`);
      core.setAttribute('class', 'orr-core orr-threat');
      core.setAttribute('stroke-width', '3');
      g.appendChild(core);
    } else {
      const y = TAPE_SCALE_Y - 26;
      const diamond = document.createElementNS(NS, 'path');
      diamond.setAttribute('d', `M ${x} ${y - 5} L ${x + 5} ${y} L ${x} ${y + 5} L ${x - 5} ${y} Z`);
      diamond.setAttribute('fill', 'none');
      diamond.setAttribute('class', 'orr-core orr-hi');
      diamond.setAttribute('stroke-width', '1.5');
      g.appendChild(diamond);
      g.appendChild(svg('path', { d: `M ${x} ${y + 5} L ${x} ${TAPE_SCALE_Y - 4}`, class: 'orr-core orr-hi', 'stroke-width': 1 }));
    }
    view.svg.appendChild(g);
  }
  // The playhead IS the Hand: one amber arm riding the scale.
  const arm = svg('g', {});
  arm.appendChild(svg('path', {
    d: `M 0 ${TAPE_SCALE_Y - 40} L 0 ${TAPE_SCALE_Y + 18}`, class: 'orr-bloom orr-hand', 'stroke-width': 7,
  }));
  arm.appendChild(svg('path', {
    d: `M 0 ${TAPE_SCALE_Y - 40} L 0 ${TAPE_SCALE_Y + 18}`, class: 'orr-core orr-hand', 'stroke-width': 2,
  }));
  arm.appendChild(svg('path', {
    d: `M -6 ${TAPE_SCALE_Y - 32} L 0 ${TAPE_SCALE_Y - 42} L 6 ${TAPE_SCALE_Y - 32}`,
    class: 'orr-core orr-hand', 'stroke-width': 2, fill: 'none',
  }));
  const beadBloom = svg('circle', { cx: 0, cy: TAPE_SCALE_Y, r: 7, class: 'orr-bead-bloom' });
  const bead = svg('circle', { cx: 0, cy: TAPE_SCALE_Y, r: 3.5, class: 'orr-bead', style: 'fill:var(--dp-hand,#f2b950)' });
  arm.appendChild(beadBloom);
  arm.appendChild(bead);
  view.svg.appendChild(arm);
  view.playhead = arm;
  // The playback pulse: ice, visible only while the tape runs.
  const pulse = svg('g', { class: 'orr-replay__pulse' });
  pulse.appendChild(svg('circle', { cx: 0, cy: TAPE_SCALE_Y, r: 7, class: 'orr-bloom orr-ice', opacity: '0.35', fill: 'none' }));
  pulse.appendChild(svg('circle', { cx: 0, cy: TAPE_SCALE_Y, r: 2.5, fill: 'var(--dp-ice,#8fcbff)' }));
  view.svg.appendChild(pulse);
  view.pulse = pulse;
  // HTML labels: seconds under the majors, event names above (solved rows).
  for (const node of [...view.tapeHost.querySelectorAll('.orr-replay__ev, .orr-replay__sec')]) node.remove();
  for (let s = 0; s <= whole; s += 5) {
    const x = tapeTickToX(Math.min(ticks - 1, Math.round((s / seconds) * (ticks - 1))), width, ticks);
    const lab = el('p', 'orr-replay__sec', s === 0 ? '0' : (s === Math.floor(whole / 5) * 5 ? s + ' S' : String(s)));
    lab.style.left = x + 'px';
    lab.style.top = TAPE_SEC_TOP + 'px';
    lab.setAttribute('aria-hidden', 'true');
    view.tapeHost.appendChild(lab);
  }
  for (const { ev, x, row } of solveEventRows(events, width, ticks)) {
    const lab = el('p', 'orr-replay__ev', ev.label);
    lab.style.left = Math.max(60, Math.min(width - 60, x)) + 'px';
    lab.style.top = TAPE_LABEL_TOPS[row] + 'px';
    lab.setAttribute('aria-hidden', 'true');
    view.tapeHost.appendChild(lab);
  }
}

function legendFor(view) {
  const { summary, events, boosts } = view;
  if (!summary.available) return 'NO TAPE YET — FLY AND THE LAST 30 SECONDS LAND HERE';
  const marks = [];
  if (events.length) marks.push(events.length + (events.length === 1 ? ' MARK' : ' MARKS'));
  if (boosts.length) marks.push(boosts.length + (boosts.length === 1 ? ' BURN' : ' BURNS'));
  if (!marks.length) return 'A CLEAN RUN — NO MOMENTS MARKED ON THIS TAPE';
  return marks.join(' · ') + ' ON THE TAPE — DRAG OR ARROW KEYS TO RIDE IT · SHOULDERS STEP EVENTS';
}

function paintTapeFrame(view) {
  if (view.disposed) return;
  const { summary } = view;
  const ticks = summary.available ? summary.ticks : REPLAY_TAPE_SECONDS * 60;
  const tickRate = summary.available ? summary.tickRate : 60;
  const tick = Math.max(0, Math.min(ticks - 1, Math.floor(view.elapsed * tickRate)));
  const p = summary.seconds > 0 ? Math.max(0, Math.min(1, view.elapsed / summary.seconds)) : 0;
  if (view.fill && view.fillBloom) {
    const dash = p.toFixed(4) + ' 1';
    view.fill.setAttribute('stroke-dasharray', summary.available ? dash : '0 1');
    view.fillBloom.setAttribute('stroke-dasharray', summary.available ? dash : '0 1');
  }
  const width = view.width || 1;
  const x = tapeTickToX(summary.available ? tick : 0, width, ticks);
  if (view.playheadSpring) view.playheadSpring.set(x, { instant: reducedMotion() });
  const deci = Math.floor(view.elapsed * 10);
  if (deci !== view.lastDeci) {
    view.lastDeci = deci;
    const sec = Math.floor(view.elapsed);
    if (sec !== view.lastSec) {
      view.lastSec = sec;
      if (view.counter) view.counter.set(sec);
    }
    if (view.elapsedTenth) view.elapsedTenth.textContent = '.' + (deci % 10);
    if (view.elapsedEl) view.elapsedEl.setAttribute('aria-label', fmtTapeTime(view.elapsed));
    if (view.codes) {
      view.codes.textContent = summary.available
        ? 'SEED ' + (summary.seed == null ? '—' : summary.seed) + ' · TICK ' + tick + ' / ' + ticks
        : 'SEED — · NO TAPE';
    }
    if (view.tapeHost) view.tapeHost.setAttribute('aria-valuenow', String(tick));
  }
  if (view.pulse) {
    const run = view.playing && summary.available && !reducedMotion();
    view.pulse.style.display = run ? '' : 'none';
    if (run) {
      const phase = (view.pulseT % 1.4) / 1.4;
      view.pulse.setAttribute('transform', `translate(${(x * phase).toFixed(1)} 0)`);
    }
  }
}

function seekTape(view, tick, { announce = false } = {}) {
  const { summary } = view;
  if (!summary.available) return;
  const clamped = Math.max(0, Math.min(summary.ticks - 1, Math.floor(Number(tick) || 0)));
  view.elapsed = clamped / summary.tickRate;
  view.ended = false;
  if (view.readout && !announce) view.readout.textContent = legendFor(view);
  // A seek always repaints: a single frame-step stays inside its decisecond, and the frame
  // painter otherwise skips it as unchanged — the step would land invisibly.
  view.lastDeci = -1;
  paintTapeFrame(view);
}

function stepTapeEvent(view, dir) {
  const { summary, events } = view;
  if (!summary.available || !events.length) return;
  const tickRate = summary.tickRate;
  const now = Math.floor(view.elapsed * tickRate);
  let target = null;
  if (dir > 0) {
    for (const ev of events) {
      if (ev.tick > now + 1) { target = ev.tick; break; }
    }
    if (target == null) target = events[0].tick;
  } else {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i].tick < now - 1) { target = events[i].tick; break; }
    }
    if (target == null) target = events[events.length - 1].tick;
  }
  cue('move');
  seekTape(view, target);
  if (view.playheadSpring && !reducedMotion()) view.playheadSpring.kick(dir * 90);
}

function setTapePlaying(view, playing) {
  if (!view.summary.available) return;
  if (playing && view.elapsed >= view.summary.seconds - 1e-6) view.elapsed = 0;
  view.playing = playing;
  view.ended = false;
  if (view.lampWord) view.lampWord.textContent = playing ? 'PAUSE' : 'PLAY';
  if (view.lamp) view.lamp.setAttribute('aria-label', playing ? 'Pause replay' : 'Play replay');
  if (view.readout) view.readout.textContent = legendFor(view);
  cue('confirm');
}

function pollTapeGamepad(view) {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
  let pads = null;
  try { pads = navigator.getGamepads(); } catch (_) { return; }
  if (!pads) return;
  let lb = false;
  let rb = false;
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const buttons = pad.buttons || [];
    if (buttons[4] && buttons[4].pressed) lb = true;
    if (buttons[5] && buttons[5].pressed) rb = true;
  }
  if (lb && !view.padLB) stepTapeEvent(view, -1);
  if (rb && !view.padRB) stepTapeEvent(view, 1);
  view.padLB = lb;
  view.padRB = rb;
}

function buildContent(container, recording, ctx) {
  injectDeckplate();
  // This screen's own placement lives in styles/ui.css (migrated screens own no CSS);
  // the orrery tokens below are library material, owned by src/ui/orrery/tokens.js.
  injectOrrery();
  const director = ctx && ctx.state && ctx.state.clips ? ctx.state.clips.director : null;
  const summary = replaySummary(recording);
  const events = summary.available ? replayTapeEvents(recording, director) : [];
  const boosts = summary.available ? replayBoostWindows(recording) : [];
  container.innerHTML = '';
  container.classList.add('k-screen', 'k-screen--stage', 'orr-replay');
  container.dataset.role = REPLAY_SCREEN_ID;
  container.setAttribute('aria-label', REPLAY_LABEL);

  const view = {
    container, recording, ctx, summary, events, boosts,
    elapsed: 0, playing: false, ended: false, speed: 1,
    disposed: false, raf: null, ro: null, width: 0, lastDeci: -1, lastSec: -1,
    padLB: false, padRB: false, pulseT: 0, lastNow: 0,
    svg: null, tapeHost: null, playhead: null, playheadSpring: null,
    fill: null, fillBloom: null, pulse: null,
    counter: null, codes: null, readout: null, lamp: null, lampWord: null,
    speedButton: null, keyHandler: null,
  };

  const veilTop = el('div', 'orr-replay__veil-top');
  veilTop.setAttribute('aria-hidden', 'true');
  const veilFoot = el('div', 'orr-replay__veil-foot');
  veilFoot.setAttribute('aria-hidden', 'true');
  container.append(veilTop, veilFoot);

  const exitWrap = el('div', 'orr-replay__exit');
  const exitList = words([{ label: 'Exit', action: 'exit' }], {
    ariaLabel: REPLAY_LABEL,
    system: 'light',
    onPick: () => exitTape(view),
  });
  exitWrap.append(exitList);
  container.append(exitWrap);

  const read = el('div', 'orr-replay__read');
  const count = el('div', 'orr-replay__count');
  // The elapsed numeral rolls its whole seconds (1 Hz lands mechanically) and ticks its
  // tenths statically: a rolling column fed ten times a second never settles and reads broken.
  const elapsedEl = el('span', 'orr-replay__elapsed');
  const elapsedSec = el('span', 'orr-replay__elapsed-sec', '0');
  const elapsedTenth = el('span', 'orr-replay__elapsed-tenth', '.0');
  elapsedEl.append(elapsedSec, elapsedTenth);
  elapsedEl.setAttribute('aria-label', '0.0');
  const sep = el('span', 'orr-replay__sep', '/');
  sep.setAttribute('aria-hidden', 'true');
  const totalEl = el('span', 'orr-replay__total', fmtTapeTime(summary.available ? summary.seconds : REPLAY_TAPE_SECONDS));
  count.append(elapsedEl, sep, totalEl);
  const codes = el('div', 'orr-replay__codes', summary.available
    ? 'SEED ' + (summary.seed == null ? '—' : summary.seed) + ' · TICK 0 / ' + summary.ticks
    : 'SEED — · NO TAPE');
  read.append(count, codes);
  container.append(read);
  view.counter = createCounter(elapsedSec, { format: (n) => String(Math.max(0, Math.floor(Number(n) || 0))) });
  view.counter.set(0);
  view.elapsedEl = elapsedEl;
  view.elapsedTenth = elapsedTenth;
  view.codes = codes;

  const tapeHost = el('div', 'orr-replay__tape');
  tapeHost.setAttribute('role', 'slider');
  tapeHost.setAttribute('aria-label', 'Replay tape. Arrow keys scrub, E steps events.');
  tapeHost.setAttribute('aria-valuemin', '0');
  tapeHost.setAttribute('aria-valuemax', String(summary.available ? summary.ticks - 1 : 0));
  tapeHost.setAttribute('aria-valuenow', '0');
  tapeHost.tabIndex = 0;
  const svgNode = svg('svg', { class: 'orr-svg', 'aria-hidden': 'true' });
  tapeHost.append(svgNode);
  const readout = el('p', 'orr-replay__readout', legendFor(view));
  readout.dataset.role = 'replay-readout';
  tapeHost.append(readout);
  container.append(tapeHost);
  view.svg = svgNode;
  view.tapeHost = tapeHost;
  view.readout = readout;

  const transport = el('div', 'orr-replay__transport');
  const lamp = document.createElement('button');
  lamp.type = 'button';
  lamp.textContent = summary.available ? 'PLAY' : 'FLY TO RECORD';
  lamp.setAttribute('aria-label', summary.available ? 'Play replay' : 'Fly to record a replay');
  transport.append(lamp);
  if (summary.available) {
    const left = words([
      { label: 'STEP −1', action: 'step-back', bank: true },
      { label: 'SPEED 1×', action: 'speed', bank: true },
    ], {
      row: true, ariaLabel: 'Step and speed', system: 'light',
      onPick: (action) => {
        if (action === 'step-back') {
          if (view.playing) setTapePlaying(view, false);
          seekTape(view, Math.floor(view.elapsed * summary.tickRate) - 1);
          cue('move');
        } else if (action === 'speed') {
          view.speed = view.speed === 1 ? 0.25 : 1;
          if (view.speedButton) view.speedButton.textContent = view.speed === 1 ? 'SPEED 1×' : 'SPEED ¼×';
        }
      },
    });
    const right = words([
      { label: 'STEP +1', action: 'step-fwd', bank: true },
      { label: 'EVENT »', action: 'next-event', bank: true },
    ], {
      row: true, ariaLabel: 'Step and events', system: 'light',
      onPick: (action) => {
        if (action === 'step-fwd') {
          if (view.playing) setTapePlaying(view, false);
          seekTape(view, Math.floor(view.elapsed * summary.tickRate) + 1);
          cue('move');
        } else if (action === 'next-event') {
          stepTapeEvent(view, 1);
        }
      },
    });
    transport.prepend(left);
    transport.append(right);
    view.speedButton = left.querySelector('[data-action="speed"]');
  }
  container.append(transport);
  dressLampKey(lamp);
  view.lamp = lamp;
  view.lampWord = lamp.querySelector('.orr-lampkey__word') || lamp;
  lamp.addEventListener('click', () => {
    if (!summary.available) { cue('confirm'); flyToRecord(ctx); return; }
    setTapePlaying(view, !view.playing);
  });

  // Measure, then draw the scale in real pixels (bands are measured, not eyeballed).
  const measure = () => {
    if (view.disposed) return;
    const w = Math.max(240, Math.floor(tapeHost.clientWidth || container.clientWidth * 0.88 || 800));
    if (Math.abs(w - view.width) < 2 && view.playhead) return;
    const first = !view.playhead;
    view.width = w;
    buildTapeSvg(view, w);
    if (view.playheadSpring) view.playheadSpring.stop();
    const startX = tapeTickToX(0, w, summary.available ? summary.ticks : REPLAY_TAPE_SECONDS * 60);
    view.playheadSpring = createSpring({ value: startX, preset: 'swing', onUpdate: (x) => {
      if (!view.disposed && view.playhead) view.playhead.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
    }});
    view.playhead.setAttribute('transform', `translate(${startX.toFixed(2)} 0)`);
    if (!first) paintTapeFrame(view);
    if (first && view._seekAfterMeasure != null) {
      seekTape(view, view._seekAfterMeasure);
      view._seekAfterMeasure = null;
    }
  };
  if (pendingSeekTick != null && summary.available) {
    view._seekAfterMeasure = Math.max(0, Math.min(summary.ticks - 1, pendingSeekTick));
    pendingSeekTick = null;
  } else {
    pendingSeekTick = null;
  }
  measure();
  if (typeof ResizeObserver === 'function') {
    view.ro = new ResizeObserver(() => measure());
    try { view.ro.observe(tapeHost); } catch (_) { /* measured once is enough */ }
  }
  paintTapeFrame(view);

  // The live director lives in the clips module (boot binds it there); the tape reads it
  // lazily so this module keeps no static cycle with clips.js. A static import would also
  // work (both sides only call hoisted functions), but the lazy read keeps the dependency
  // one-directional and costs nothing when the tape already has its moments.
  view.director = director;
  if (typeof window !== 'undefined' && summary.available) {
    import('./clips.js').then((m) => {
      if (view.disposed) return;
      const live = m && typeof m.getClipDirector === 'function' ? m.getClipDirector() : null;
      if (!live || live === view.director) return;
      const found = replayTapeEvents(recording, live);
      const sig = (list) => list.length + ':' + list.map((e) => e.tick + e.type).join(',');
      if (sig(found) === sig(view.events)) {
        view.director = live;
        return;
      }
      view.events = found;
      view.director = live;
      buildTapeSvg(view, view.width || 800);
      if (view.playheadSpring && view.playhead) {
        view.playhead.setAttribute('transform', `translate(${view.playheadSpring.value.toFixed(2)} 0)`);
      }
      if (view.readout) view.readout.textContent = legendFor(view);
    }).catch(() => { /* the tape stands without live moments */ });
  }

  // Scrub: drag the playhead along the scale.
  let scrubbing = false;
  const seekFromPointer = (clientX) => {
    const rect = tapeHost.getBoundingClientRect();
    seekTape(view, tapeXToTick(clientX - rect.left, rect.width, summary.available ? summary.ticks : 1));
  };
  tapeHost.addEventListener('pointerdown', (ev) => {
    if (!summary.available || ev.button !== 0) return;
    scrubbing = true;
    try { tapeHost.setPointerCapture(ev.pointerId); } catch (_) { /* drag still tracks */ }
    seekFromPointer(ev.clientX);
    ev.preventDefault();
  });
  tapeHost.addEventListener('pointermove', (ev) => {
    if (!scrubbing) return;
    seekFromPointer(ev.clientX);
  });
  const endScrub = () => { scrubbing = false; };
  tapeHost.addEventListener('pointerup', endScrub);
  tapeHost.addEventListener('pointercancel', endScrub);

  const onKey = (ev) => {
    if (view.disposed) return;
    const inOverlay = openState && openState.view === view;
    if (ev.key === 'Escape' && inOverlay) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      closeReplay();
      return;
    }
    if (!summary.available) return;
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const inTransport = ev.target && ev.target.closest && ev.target.closest('.orr-replay__transport');
    const tickRate = summary.tickRate;
    const now = Math.floor(view.elapsed * tickRate);
    if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !inTransport) {
      const dir = ev.key === 'ArrowLeft' ? -1 : 1;
      const step = (ev.shiftKey ? 5 : 1) * tickRate;
      ev.preventDefault();
      seekTape(view, now + dir * step);
    } else if (ev.key === 'Home' && !inTransport) {
      ev.preventDefault();
      seekTape(view, 0);
    } else if (ev.key === 'End' && !inTransport) {
      ev.preventDefault();
      seekTape(view, summary.ticks - 1);
    } else if ((ev.key === 'e' || ev.key === 'E') && !inTransport) {
      ev.preventDefault();
      stepTapeEvent(view, ev.shiftKey ? -1 : 1);
    } else if (ev.key === ' ' && !(ev.target && ev.target.closest && ev.target.closest('button'))) {
      ev.preventDefault();
      setTapePlaying(view, !view.playing);
    }
  };
  view.keyHandler = onKey;
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true);

  const loop = (now) => {
    if (view.disposed) return;
    const dt = view.lastNow ? Math.min(0.1, Math.max(0, (now - view.lastNow) / 1000)) : 0;
    view.lastNow = now;
    pollTapeGamepad(view);
    if (view.playing && summary.available) {
      view.pulseT += dt;
      const before = Math.floor(view.elapsed * summary.tickRate);
      view.elapsed += dt * view.speed;
      if (view.elapsed >= summary.seconds) {
        view.elapsed = summary.seconds;
        view.playing = false;
        view.ended = true;
        if (view.lampWord) view.lampWord.textContent = 'PLAY';
        if (view.lamp) view.lamp.setAttribute('aria-label', 'Play replay');
        if (view.readout) view.readout.textContent = 'END OF TAPE · ' + legendFor(view);
        cue('close');
      } else {
        // Crossing an event kicks the Hand so the moment lands visibly.
        const after = Math.floor(view.elapsed * summary.tickRate);
        for (const ev of events) {
          if (ev.tick > before && ev.tick <= after && view.playheadSpring && !reducedMotion()) {
            view.playheadSpring.kick(46);
            break;
          }
        }
      }
      paintTapeFrame(view);
    } else if (view.pulse && view.pulse.style.display !== 'none') {
      paintTapeFrame(view);
    }
    if (typeof requestAnimationFrame === 'function') view.raf = requestAnimationFrame(loop);
  };
  if (typeof requestAnimationFrame === 'function' && summary.available) {
    view.raf = requestAnimationFrame(loop);
  } else if (typeof requestAnimationFrame === 'function') {
    // Dormant tape still watches the shoulders (they simply find no events).
    const idle = () => {
      if (view.disposed) return;
      pollTapeGamepad(view);
      view.raf = requestAnimationFrame(idle);
    };
    view.raf = requestAnimationFrame(idle);
  }

  // Arrival: the scale ticks in, the word decrypts, the Hand is already parked.
  try {
    settle(tapeHost, { from: 'bottom', state: 'replay-tape' });
    settle(read, { from: 'right', delay: 60, state: 'replay-read' });
    settle(transport, { from: 'bottom', delay: 120, state: 'replay-transport' });
    decrypt(readout, readout.textContent, { duration: 260, delay: 180 });
  } catch (_) { /* motion is cosmetic */ }

  return view;
}

/**
 * Open the replay surface over the current pause sheet (the pause "Replay" action).
 * The pause root is hidden and the photo-mode presentation is applied; Esc or Exit returns.
 */
export function openReplay(rootEl, ctx) {
  if (openState) { closeReplay(); return; }
  const recording = resolveReplayRecording(ctx);
  const container = el('section', 'k-screen k-screen--stage');
  container.dataset.role = REPLAY_SCREEN_ID;
  container.setAttribute('aria-label', REPLAY_LABEL);
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.zIndex = '120';
  const view = buildContent(container, recording, ctx);

  const parent = (rootEl && rootEl.parentElement) || document.body;
  parent.appendChild(container);
  suppressPauseRoot(rootEl, true);
  document.body.classList.add(PHOTO_PRESENTATION_CLASS);

  openState = { overlay: container, rootEl, ctx, onKey: view.keyHandler, view, playing: false };
  settle(container, { from: 'bottom', state: 'replay-open' });
  focusFirstOverlayControl(container);
  cue('open');
}

export const replayScreen = {
  id: REPLAY_SCREEN_ID,
  _view: null,

  mount(rootEl, ctx) {
    if (this._view) {
      disposeTapeView(this._view);
      this._view = null;
    }
    this._view = buildContent(rootEl, resolveReplayRecording(ctx), ctx);
  },

  onShow(ctx) {
    if (ctx && ctx.state && ctx.state.mode === 'flight') ctx.state.mode = 'paused';
    cue('open');
  },

  onHide() {
    if (this._view) {
      disposeTapeView(this._view);
      this._view = null;
    }
    stopPlayback();
  },

  /** Resolves once the arrival choreography has come to rest (the bench shoots at rest). */
  settled() {
    const still = typeof document !== 'undefined' && document.documentElement
      && document.documentElement.classList.contains('sf-reduce-motion');
    return new Promise((resolve) => setTimeout(resolve, still ? 0 : 1100));
  },
};
