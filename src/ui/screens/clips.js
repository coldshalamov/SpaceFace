// Clips surface (PQ-160.01) — the player-facing end of the auto-clip moment detector.
//
// The sim is deterministic, so a rated moment (a named stunt trick, or an attributed kill) can be
// marked as a bounded window in the last thirty seconds and replayed from the input tape. This
// module owns only the surface: it lists the clips the detector recorded, presents each window, and
// offers the export action. It never records video and never mutates gameplay state.
//
// Export writes a real GIF (or MP4 container) when RGBA frames exist, or rasterizes a software
// title card from the clip window when they do not. A clip with no window and no frames fails
// closed with `gpu-export-unavailable`. Electron saves through the packaged host; the browser
// downloads the file. This module never records live video — the sim is deterministic.

import { el, words, settle, cue } from '../kit/index.js';
import { attachClipDirectorToBus, createClipDirector } from '../../core/simSnapshot.js';
import {
  CLIP_EXPORT_FORMATS,
  CLIP_EXPORT_UNAVAILABLE,
  deliverClipFile,
  detectClipExportHost,
  encodeClipBytes,
  resolveClipFrames,
} from './clipExport.js';

export const CLIPS_LABEL = 'Clips';
export const CLIPS_SCREEN_ID = 'clips';
/** The pause photo-mode presentation class (HUD hidden, world visible). */
export const CLIPS_PRESENTATION_CLASS = 'k-photo';

let clipDirector = null;
let clipUnsub = null;
let openState = null;

/** Publish the live clip director (from createClipDirector) to the Clips surface. */
export function setClipDirector(director) {
  clipDirector = director || null;
}

export function getClipDirector() {
  return clipDirector;
}

/**
 * Bind a clip director to the production bus so Pause → Clips lists rated moments.
 * Safe to call twice: the previous subscription is dropped first.
 */
export function installLiveClipDirector(bus, options = {}) {
  if (!clipDirector) clipDirector = createClipDirector();
  if (clipUnsub) {
    try { clipUnsub(); } catch { /* best-effort */ }
    clipUnsub = null;
  }
  if (bus) clipUnsub = attachClipDirectorToBus(bus, clipDirector, options);
  return clipDirector;
}

/** Drop the live subscription. Does not clear recorded clips. */
export function uninstallLiveClipDirector() {
  if (clipUnsub) {
    try { clipUnsub(); } catch { /* best-effort */ }
    clipUnsub = null;
  }
}

/** Resolve the director from the in-memory store or a transient field on state. */
export function resolveClipDirector(ctx) {
  if (clipDirector) return clipDirector;
  const state = ctx && ctx.state;
  return (state && state.clips && state.clips.director) || null;
}

/** Pure summary used by the surface and tests. */
export function clipListSummary(director) {
  const list = director && typeof director.list === 'function' ? director.list() : [];
  const items = Array.isArray(list)
    ? list.map((clip) => ({
      id: clip.id,
      kind: clip.kind,
      trickId: clip.trickId || null,
      label: clip.label,
      rarity: clip.rarity || null,
      momentTick: clip.momentTick,
      startTick: clip.startTick,
      endTick: clip.endTick,
      seconds: clip.seconds,
    }))
    : [];
  return {
    available: items.length > 0,
    count: items.length,
    items,
    label: items.length === 1 ? '1 clip' : items.length + ' clips',
    detail: items.length
      ? 'Auto-clipped rated moments from the last window.'
      : 'Land a named stunt or a kill, then open Clips.',
  };
}

/**
 * Export a clip as GIF/MP4. Recorded RGBA frames encode as-is; a marked window without GPU
 * frames rasterizes a software title card (headless, no GPU). A bare id with no window fails
 * closed as `gpu-export-unavailable`.
 */
export function exportClip(clip, options = {}) {
  const clipId = clip && clip.id ? clip.id : null;
  const format = options.format === 'mp4' ? 'mp4' : 'gif';
  const resolved = resolveClipFrames(clip, options);
  if (!resolved || !resolved.frames.length) {
    return {
      ok: false,
      status: 'not-done',
      reason: CLIP_EXPORT_UNAVAILABLE,
      clipId,
      formats: CLIP_EXPORT_FORMATS.slice(),
    };
  }
  const bytes = encodeClipBytes(resolved.frames, resolved, format);
  if (!bytes || !bytes.length) {
    return {
      ok: false,
      status: 'not-done',
      reason: CLIP_EXPORT_UNAVAILABLE,
      clipId,
      formats: CLIP_EXPORT_FORMATS.slice(),
    };
  }
  const filename = options.filename
    || ('spaceface-clip-' + (clipId || 'moment') + '.' + format);
  const mime = format === 'mp4' ? 'video/mp4' : 'image/gif';
  const host = options.host || detectClipExportHost();
  const delivery = deliverClipFile({ bytes, filename, mime, host });
  return {
    ok: true,
    status: 'exported',
    clipId,
    format,
    filename,
    mime,
    bytes,
    bytesLength: bytes.length,
    source: resolved.source,
    via: delivery.via,
    hostResult: delivery.hostResult || null,
    formats: CLIP_EXPORT_FORMATS.slice(),
  };
}

function stopPlayback() {
  if (!openState) return;
  if (openState.raf != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(openState.raf);
  }
  openState.raf = null;
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

function closeClips() {
  if (!openState) return;
  stopPlayback();
  const { overlay, rootEl, onKey } = openState;
  window.removeEventListener('keydown', onKey, true);
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  suppressPauseRoot(rootEl, false);
  document.body.classList.remove(CLIPS_PRESENTATION_CLASS);
  openState = null;
  cue('close');
}

/** Safe to call when Clips is not open (Pause onHide, stack pop). */
export function forceCloseClips() {
  closeClips();
}

function clipRow(clip) {
  const row = el('li', 'k-fine');
  row.dataset.clipId = clip.id;
  const name = clip.kind === 'trick' && clip.trickId
    ? clip.label
    : (clip.label || 'Kill');
  row.textContent = name
    + (clip.rarity ? ' · ' + clip.rarity : '')
    + ' · tick ' + clip.momentTick
    + ' · ' + (Math.round((clip.seconds || 0) * 10) / 10) + ' s';
  return row;
}

function buildContent(container, ctx) {
  const director = resolveClipDirector(ctx);
  const summary = clipListSummary(director);

  const header = el('header', 'k-title');
  header.append(el('h1', 'k-display k-t-title', CLIPS_LABEL));
  header.append(el('p', 'k-t-emph k-62', summary.label));
  header.append(el('p', 'k-fine', summary.detail));
  container.append(header);

  const readout = el('p', 'k-fine');
  readout.dataset.role = 'clips-readout';
  readout.textContent = summary.available ? summary.label : summary.detail;
  container.append(readout);

  const list = el('ul', 'k-stage');
  list.dataset.role = 'clip-list';
  list.style.listStyle = 'none';
  for (const clip of summary.items) list.append(clipRow(clip));
  container.append(list);

  const stage = el('section', 'k-stage');
  const items = [];
  const handlers = new Map();
  const mk = (label, fn, opts = {}) => {
    const action = CLIPS_SCREEN_ID + '-' + items.length;
    items.push({ label, action, primary: !!opts.primary });
    handlers.set(action, fn);
    return action;
  };

  if (summary.available) {
    mk('Export GIF/MP4', () => {
      const outcome = exportClip(summary.items[0]);
      readout.textContent = outcome.ok
        ? 'Exported ' + outcome.filename + ' (' + outcome.source + ')'
        : 'Export unavailable: ' + outcome.reason;
      cue('confirm');
    }, { primary: true });
  }
  mk('Exit', () => { cue('confirm'); closeClips(); }, { primary: !summary.available });

  const buttons = words(items, {
    size: 'emph',
    ariaLabel: CLIPS_LABEL,
    onPick: (action) => { const fn = handlers.get(action); if (fn) fn(); },
  });
  stage.append(buttons);
  container.append(stage);
}

/**
 * Open the clips surface over the current pause sheet (the pause "Clips" action).
 * The pause root is hidden and the photo-mode presentation is applied; Esc or Exit returns.
 */
export function openClips(rootEl, ctx) {
  if (openState) { closeClips(); return; }
  const container = el('section', 'k-screen k-screen--stage');
  container.dataset.role = CLIPS_SCREEN_ID;
  container.setAttribute('aria-label', CLIPS_LABEL);
  container.style.position = 'fixed';
  container.style.inset = '0';
  container.style.zIndex = '120';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';
  container.style.padding = '24px';
  container.style.overflow = 'auto';
  buildContent(container, ctx);

  const parent = (rootEl && rootEl.parentElement) || document.body;
  parent.appendChild(container);
  suppressPauseRoot(rootEl, true);
  document.body.classList.add(CLIPS_PRESENTATION_CLASS);

  const onKey = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    closeClips();
  };
  window.addEventListener('keydown', onKey, true);

  openState = { overlay: container, rootEl, onKey, raf: null };
  settle(container, { from: 'bottom', state: 'clips-open' });
  focusFirstOverlayControl(container);
  cue('open');
}

export const clipsScreen = {
  id: CLIPS_SCREEN_ID,

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage');
    buildContent(rootEl, ctx);
  },

  onShow(ctx) {
    if (ctx && ctx.state && ctx.state.mode === 'flight') ctx.state.mode = 'paused';
    cue('open');
  },

  onHide() {
    stopPlayback();
  },
};
