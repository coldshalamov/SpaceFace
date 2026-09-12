// Replay surface (PQ-160.00) — the player-facing end of the deterministic replay ring buffer.
//
// The sim is deterministic, so the last thirty seconds can be replayed from the recorded input tape
// with the photo-mode presentation (HUD hidden, the world held). This module owns only the surface:
// it resolves the recording captured by the ring buffers, presents its timeline, and plays the tape
// back. It never records video and never mutates gameplay state.
//
// Building the visual picture of a replay still uses the existing chase camera; the pause "Photo"
// entry already owns the HUD-hidden presentation, and this screen reuses that contract.

import { el, words, settle, cue } from '../kit/index.js';

export const REPLAY_LABEL = 'Replay';
export const REPLAY_SCREEN_ID = 'replay';
/** The pause photo-mode presentation class (HUD hidden, world visible). */
export const PHOTO_PRESENTATION_CLASS = 'k-photo';

let activeRecording = null;
let openState = null;

/** Publish a completed ring-buffer recording for the replay surface to present. */
export function setReplayRecording(recording) {
  activeRecording = recording || null;
}

export function getReplayRecording() {
  return activeRecording;
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
  if (!recording) {
    return {
      available: false,
      label: 'No replay recorded yet',
      detail: 'Fly for a while, then pause and open Replay.',
    };
  }
  const ticks = Math.max(0, recording.ticks | 0);
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

function stopPlayback() {
  if (!openState) return;
  if (openState.raf != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(openState.raf);
  }
  openState.raf = null;
  openState.playing = false;
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
  const first = overlay.querySelector('button');
  if (!first || typeof first.focus !== 'function') return;
  try { first.focus({ preventScroll: true }); } catch (_) {
    try { first.focus(); } catch (_) { /* pointer still reaches the overlay */ }
  }
}

function closeReplay() {
  if (!openState) return;
  stopPlayback();
  const { overlay, rootEl, onKey } = openState;
  window.removeEventListener('keydown', onKey, true);
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  suppressPauseRoot(rootEl, false);
  document.body.classList.remove(PHOTO_PRESENTATION_CLASS);
  openState = null;
  cue('close');
}

/** Safe to call when Replay is not open (Pause onHide, stack pop). */
export function forceCloseReplay() {
  closeReplay();
}

function buildContent(container, recording, ctx) {
  const header = el('header', 'k-title');
  header.append(el('h1', 'k-display k-t-title', REPLAY_LABEL));
  const summary = replaySummary(recording);
  header.append(el('p', 'k-t-emph k-62', summary.label));
  header.append(el('p', 'k-fine', summary.detail));
  container.append(header);

  const readout = el('p', 'k-fine');
  readout.dataset.role = 'replay-readout';
  readout.textContent = summary.available ? 'Ready' : summary.detail;
  container.append(readout);

  const stage = el('section', 'k-stage');
  const items = [];
  const handlers = new Map();
  const mk = (label, fn, opts = {}) => {
    const action = REPLAY_SCREEN_ID + '-' + items.length;
    items.push({ label, action, primary: !!opts.primary });
    handlers.set(action, fn);
    return action;
  };

  if (summary.available) {
    mk('Play', () => {
      if (!openState) return;
      openState.playing = true;
      openState.elapsed = 0;
      openState.startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      cue('confirm');
      tickPlayback();
    }, { primary: true });
    mk('Exit', () => { cue('confirm'); closeReplay(); });
  } else {
    mk('Exit', () => { cue('confirm'); closeReplay(); }, { primary: true });
  }

  const list = words(items, {
    size: 'emph',
    ariaLabel: REPLAY_LABEL,
    onPick: (action) => { const fn = handlers.get(action); if (fn) fn(); },
  });
  stage.append(list);
  container.append(stage);

  function tickPlayback() {
    if (!openState || !openState.playing) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    openState.elapsed = (now - openState.startedAt) / 1000;
    const index = replayFrameIndex(recording, openState.elapsed);
    if (index >= (recording.ticks | 0) - 1) {
      openState.playing = false;
      readout.textContent = 'End · ' + replaySummary(recording).detail;
      cue('close');
      return;
    }
    readout.textContent = 'Tick ' + index + ' / ' + (recording.ticks | 0);
    if (typeof requestAnimationFrame === 'function') openState.raf = requestAnimationFrame(tickPlayback);
  }
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
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';
  container.style.padding = '24px';
  container.style.overflow = 'auto';
  buildContent(container, recording, ctx);

  const parent = (rootEl && rootEl.parentElement) || document.body;
  parent.appendChild(container);
  suppressPauseRoot(rootEl, true);
  document.body.classList.add(PHOTO_PRESENTATION_CLASS);

  const onKey = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    closeReplay();
  };
  window.addEventListener('keydown', onKey, true);

  openState = { overlay: container, rootEl, onKey, playing: false, raf: null, elapsed: 0, startedAt: 0 };
  settle(container, { from: 'bottom', state: 'replay-open' });
  focusFirstOverlayControl(container);
  cue('open');
}

export const replayScreen = {
  id: REPLAY_SCREEN_ID,

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage');
    buildContent(rootEl, resolveReplayRecording(ctx), ctx);
  },

  onShow(ctx) {
    if (ctx && ctx.state && ctx.state.mode === 'flight') ctx.state.mode = 'paused';
    cue('open');
  },

  onHide() {
    stopPlayback();
  },
};
