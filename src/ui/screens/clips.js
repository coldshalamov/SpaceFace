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
//
// ORRERY Wave 2: the instrument is the REEL — rated moments riding a curved rail mid-screen.
// Each clip is a Tilt Plate with a rating Arc Gauge and a trimmable window Beam. Signature:
// "pull a moment open" — drag a window's edges along its beam.

import { el, words, settle, cue, attachHoldVerb } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectOrrery } from '../orrery/tokens.js';
import { svg } from '../orrery/svg.js';
import { createSpring, reducedMotion } from '../orrery/motion.js';
import { createCounter, decrypt } from '../orrery/text.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { arcGauge } from '../orrery/instruments.js';
import { attachClipDirectorToBus, createClipDirector } from '../../core/simSnapshot.js';
import { openReplay, requestReplaySeek, resolveReplayRecording } from './replay.js';
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

/** Plates shown around the chosen one (the reel is a window, not a wall). */
const REEL_HALF_WINDOW = 3;
/** A trimmed window is never shorter than half a second. */
const TRIM_MIN_SECONDS = 0.5;

let clipDirector = null;
let clipUnsub = null;
let openState = null;
/** clip+format pairs exported this sitting: exporting again holds to overwrite. */
const exportedKeys = new Set();

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

/** Rating for the plate's corner gauge: rarity maps to arc fill; death alone burns red. */
export function clipRating(clip) {
  const rarity = clip && clip.rarity ? String(clip.rarity).toLowerCase() : '';
  if (clip && clip.kind === 'death') return { fraction: 1, tone: 'threat', label: 'Death' };
  if (rarity === 'legendary') return { fraction: 1, tone: 'hi', label: 'Legendary' };
  if (rarity === 'rare') return { fraction: 0.75, tone: 'hi', label: 'Rare' };
  if (rarity === 'uncommon') return { fraction: 0.5, tone: 'hi', label: 'Uncommon' };
  if (rarity === 'common') return { fraction: 0.25, tone: 'hi', label: 'Common' };
  if (clip && clip.kind === 'kill') return { fraction: 0.6, tone: 'hi', label: 'Kill' };
  if (clip && clip.kind === 'trick') return { fraction: 0.5, tone: 'hi', label: 'Stunt' };
  return { fraction: 0.4, tone: 'hi', label: 'Moment' };
}

/** Stable trim key: a DELETE rebuild re-mints ids, so trims key off the moment, not the id. */
export function clipStableKey(clip) {
  if (!clip || typeof clip !== 'object') return 'none';
  return [clip.momentTick, clip.kind, clip.trickId || '', clip.label || ''].join('|');
}

/** The clip's window with the view's trim applied, clamped to the marked bounds. */
export function trimmedWindow(clip, trims) {
  const start = Number(clip && clip.startTick);
  const end = Number(clip && clip.endTick);
  const rate = clip && Number.isFinite(Number(clip.tickRate)) && Number(clip.tickRate) > 0
    ? Number(clip.tickRate) : 60;
  const minWidth = Math.max(1, Math.round(TRIM_MIN_SECONDS * rate));
  const origStart = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0;
  const origEnd = Number.isFinite(end) ? Math.max(origStart + minWidth, Math.floor(end)) : origStart + minWidth;
  const trim = trims ? trims.get(clipStableKey(clip)) : null;
  if (!trim) return { startTick: origStart, endTick: origEnd, tickRate: rate };
  const s = Math.max(origStart, Math.min(origEnd - minWidth, Math.floor(Number(trim.startTick))));
  const e = Math.min(origEnd, Math.max(s + minWidth, Math.floor(Number(trim.endTick))));
  return {
    startTick: Number.isFinite(s) ? s : origStart,
    endTick: Number.isFinite(e) ? e : origEnd,
    tickRate: rate,
  };
}

function fmtClipSeconds(ticks, tickRate) {
  return (Math.max(0, Number(ticks) || 0) / Math.max(1, tickRate)).toFixed(1);
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
  if (openState.view) disposeReelView(openState.view);
  openState.view = null;
}

function disposeReelView(view) {
  if (!view || view.disposed) return;
  view.disposed = true;
  if (view.raf != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(view.raf);
  }
  view.raf = null;
  if (view.ro && typeof view.ro.disconnect === 'function') view.ro.disconnect();
  if (view.handSpring) view.handSpring.stop();
  if (view.dialSpring) view.dialSpring.stop();
  for (const gauge of view.gauges || []) {
    try { gauge.dispose(); } catch (_) { /* cosmetic */ }
  }
  view.gauges = [];
  for (const hold of view.holds || []) {
    try { hold.dispose(); } catch (_) { /* cosmetic */ }
  }
  view.holds = [];
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
  const first = overlay.querySelector('.orr-clips__actions button, .orr-clips__exit button');
  if (!first || typeof first.focus !== 'function') return;
  try { first.focus({ preventScroll: true }); } catch (_) {
    try { first.focus(); } catch (_) { /* pointer still reaches the overlay */ }
  }
}

function closeClips() {
  if (!openState) return;
  stopPlayback();
  const { overlay, rootEl, onKey } = openState;
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true);
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  suppressPauseRoot(rootEl, false);
  if (typeof document !== 'undefined') document.body.classList.remove(CLIPS_PRESENTATION_CLASS);
  openState = null;
  cue('close');
}

/** Safe to call when Clips is not open (Pause onHide, stack pop). */
export function forceCloseClips() {
  closeClips();
}

/** FLY TO MAKE ONE: close the instrument and unpause into flight (pause's own resume path). */
function flyToMakeOne(ctx) {
  closeClips();
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

/** Deterministic spin for ghost art: a char-code hash, never ambient randomness. */
function hashSpin(key) {
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/**
 * Title art for a plate with no recorded frames: a bone band ring (>=2:1, never a hairline)
 * with the moment's glyph — a diamond for a stunt, a cross for a kill, a ring for a save.
 */
function ghostArt(kind, key, width, height) {
  const art = svg('svg', { class: 'orr-svg', 'aria-hidden': 'true' });
  art.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.32;
  const ring = svg('circle', { cx, cy, r, class: 'orr-band', opacity: '0.95' });
  ring.style.setProperty('--orr-band-a', '0.28');
  art.appendChild(ring);
  const edge = svg('circle', { cx, cy, r, class: 'orr-edge', opacity: '0.9', 'stroke-width': 2.5 });
  art.appendChild(edge);
  const g = svg('g', { transform: `rotate(${hashSpin(key)} ${cx} ${cy})`, opacity: '0.85' });
  if (kind === 'kill') {
    g.appendChild(svg('path', { d: `M ${cx - 9} ${cy - 9} L ${cx + 9} ${cy + 9} M ${cx + 9} ${cy - 9} L ${cx - 9} ${cy + 9}`, class: 'orr-core orr-hi', 'stroke-width': 2.5 }));
  } else if (kind === 'save') {
    g.appendChild(svg('circle', { cx, cy, r: r * 0.45, class: 'orr-core orr-hi', 'stroke-width': 2 }));
  } else {
    g.appendChild(svg('path', { d: `M ${cx} ${cy - 11} L ${cx + 8} ${cy} L ${cx} ${cy + 11} L ${cx - 8} ${cy} Z`, class: 'orr-core orr-hi', 'stroke-width': 2, fill: 'none' }));
  }
  art.appendChild(g);
  return art;
}

/** First-frame raster where frames exist, title art where they do not. */
function plateArt(clip, width, height) {
  const box = el('div', 'orr-clip__art');
  box.style.height = Math.round(height) + 'px';
  const frames = clip && (clip.frames || clip.frameBuffers);
  const fw = clip && (clip.frameWidth || clip.width);
  const fh = clip && (clip.frameHeight || clip.height);
  if (Array.isArray(frames) && frames.length && fw > 0 && fh > 0 && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      const scale = Math.max(width / fw, height / fh);
      const dw = Math.max(1, Math.round(fw * scale));
      const dh = Math.max(1, Math.round(fh * scale));
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx2d = canvas.getContext('2d');
      const scratch = document.createElement('canvas');
      scratch.width = fw;
      scratch.height = fh;
      const sctx = scratch.getContext('2d');
      const raw = frames[0];
      const bytes = raw instanceof Uint8ClampedArray ? raw
        : raw instanceof Uint8Array ? new Uint8ClampedArray(raw.buffer, raw.byteOffset, Math.min(raw.byteLength, fw * fh * 4))
        : null;
      if (ctx2d && sctx && bytes && bytes.length >= fw * fh * 4) {
        sctx.putImageData(new ImageData(bytes.slice(0, fw * fh * 4), fw, fh), 0, 0);
        ctx2d.drawImage(scratch, Math.round((width - dw) / 2), Math.round((height - dh) / 2), dw, dh);
        box.appendChild(canvas);
        box._reelCanvas = { canvas, scratch, fw, fh, width, height };
        return box;
      }
    } catch (_) { /* title art stands in */ }
  }
  box.appendChild(ghostArt(clip ? clip.kind : 'stunt', clip ? clipStableKey(clip) : 'ghost', Math.round(width), Math.round(height)));
  return box;
}

/** Repaint a plate's canvas with the frame nearest a trim edge (the trim preview link). */
function previewEdgeFrame(box, clip, tick) {
  const rig = box && box._reelCanvas;
  const frames = clip && (clip.frames || clip.frameBuffers);
  if (!rig || !Array.isArray(frames) || frames.length < 2) return;
  const start = Number(clip.startTick);
  const end = Number(clip.endTick);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
  const f = Math.max(0, Math.min(1, (tick - start) / (end - start)));
  const raw = frames[Math.round(f * (frames.length - 1))];
  if (!raw) return;
  try {
    const { canvas, scratch, fw, fh, width, height } = rig;
    const ctx2d = canvas.getContext('2d');
    const sctx = scratch.getContext('2d');
    const bytes = raw instanceof Uint8ClampedArray ? raw
      : raw instanceof Uint8Array ? new Uint8ClampedArray(raw.buffer, raw.byteOffset, Math.min(raw.byteLength, fw * fh * 4))
      : null;
    if (!ctx2d || !sctx || !bytes || bytes.length < fw * fh * 4) return;
    sctx.putImageData(new ImageData(bytes.slice(0, fw * fh * 4), fw, fh), 0, 0);
    const scale = Math.max(width / fw, height / fh);
    const dw = Math.max(1, Math.round(fw * scale));
    const dh = Math.max(1, Math.round(fh * scale));
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(scratch, Math.round((width - dw) / 2), Math.round((height - dh) / 2), dw, dh);
  } catch (_) { /* the first frame stands */ }
}

/** Reel geometry for a rail of `railW` px: plate size, spacing, arc. All in rail-host px. */
export function reelGeometry(railW) {
  const w = Math.max(320, Number(railW) || 800);
  const plateW = Math.max(220, Math.min(340, w * 0.24));
  // art + foot + name + sub + bounds + tickcode + beam, measured off the still (was 122, 18px short).
  const plateH = Math.round(plateW * 0.52) + 140;
  const spacing = Math.max(96, Math.min(210, (w / 2 - 20 - plateW / 2) / REEL_HALF_WINDOW));
  const baseY = 24 + plateH;
  // Deep falloff: neighbours tuck behind the chosen plate small and dim, or the
  // carousel reads as one tangled plate (the 1280 populated still proved it).
  const scaleFor = (d) => 1 / (1 + 0.13 * Math.abs(d));
  // A smooth quadratic arc: |d| put a visible cusp at the crown of the rail.
  const railY = (d) => baseY + d * d * 6;
  // Neighbours sink as they recede, so their names step down away from the chosen word.
  const topFor = (d) => railY(d) - plateH * scaleFor(d) - 14 + Math.abs(d) * 10;
  return { plateW, plateH, spacing, baseY, scaleFor, railY, topFor };
}

/** The trimmable window beam: the marked window is the rule, the trim is the lit segment. */
function buildBeam(plate, clip, view, interactive) {
  const beam = el('div', 'orr-clip__beam');
  const W = 300;
  const H = 30;
  const art = svg('svg', { class: 'orr-svg', 'aria-hidden': 'true' });
  art.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const y = 15;
  art.appendChild(svg('path', { d: `M 4 ${y} L ${W - 4} ${y}`, class: 'orr-band', opacity: '0.7' }));
  art.appendChild(svg('path', { d: `M 4 ${y} L ${W - 4} ${y}`, class: 'orr-edge', opacity: '0.6' }));
  const seg = svg('path', { d: '', class: 'orr-lit' });
  const segBloom = svg('path', { d: '', class: 'orr-lit-bloom' });
  art.appendChild(segBloom);
  art.appendChild(seg);
  beam.appendChild(art);
  const paint = () => {
    const win = trimmedWindow(clip, view.trims);
    const origStart = Number(clip.startTick);
    const origEnd = Number(clip.endTick);
    const span = Math.max(1, origEnd - origStart);
    const a = 4 + ((win.startTick - origStart) / span) * (W - 8);
    const b = 4 + ((win.endTick - origStart) / span) * (W - 8);
    const d = `M ${a.toFixed(1)} ${y} L ${Math.max(a + 2, b).toFixed(1)} ${y}`;
    seg.setAttribute('d', d);
    segBloom.setAttribute('d', d);
    return { a, b };
  };
  let pos = paint();
  plate._reelPaintBeam = paint;
  if (interactive) {
    for (const edge of ['start', 'end']) {
      const thumb = el('div', 'orr-clip__thumb');
      thumb.setAttribute('role', 'slider');
      thumb.setAttribute('aria-label', edge === 'start' ? 'Trim window in-point' : 'Trim window out-point');
      thumb.tabIndex = 0;
      thumb.dataset.edge = edge;
      const place = () => {
        pos = paint();
        thumb.style.left = ((edge === 'start' ? pos.a : pos.b) / W * 100) + '%';
      };
      place();
      plate._reelPlaceThumbs = plate._reelPlaceThumbs || [];
      plate._reelPlaceThumbs.push(place);
      let dragging = false;
      thumb.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        dragging = true;
        try { thumb.setPointerCapture(ev.pointerId); } catch (_) { /* drag still tracks */ }
        ev.preventDefault();
        ev.stopPropagation();
      });
      thumb.addEventListener('pointermove', (ev) => {
        if (!dragging) return;
        const rect = beam.getBoundingClientRect();
        const f = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
        nudgeTrimEdge(view, clip, edge, f, { preview: plate });
      });
      const done = () => { dragging = false; };
      thumb.addEventListener('pointerup', done);
      thumb.addEventListener('pointercancel', done);
      thumb.addEventListener('keydown', (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        ev.preventDefault();
        ev.stopPropagation();
        const win = trimmedWindow(clip, view.trims);
        const span = Math.max(1, Number(clip.endTick) - Number(clip.startTick));
        const cur = edge === 'start' ? win.startTick : win.endTick;
        const next = cur + (ev.key === 'ArrowLeft' ? -1 : 1) * Math.max(1, Math.round(win.tickRate * 0.25));
        const f = (next - Number(clip.startTick)) / span;
        nudgeTrimEdge(view, clip, edge, f, { preview: plate });
      });
      beam.appendChild(thumb);
    }
  }
  return beam;
}

/** Move one trim edge to fraction `f` of the marked window (drag, thumbs, [ ] keys). */
function nudgeTrimEdge(view, clip, edge, f, { preview = null } = {}) {
  if (!clip) return;
  const origStart = Math.max(0, Math.floor(Number(clip.startTick) || 0));
  const rate = Number.isFinite(Number(clip.tickRate)) && Number(clip.tickRate) > 0 ? Number(clip.tickRate) : 60;
  const minWidth = Math.max(1, Math.round(TRIM_MIN_SECONDS * rate));
  const origEnd = Math.max(origStart + minWidth, Math.floor(Number(clip.endTick) || 0));
  const win = trimmedWindow(clip, view.trims);
  const target = origStart + Math.max(0, Math.min(1, Number(f) || 0)) * (origEnd - origStart);
  let { startTick, endTick } = win;
  if (edge === 'start') startTick = Math.max(origStart, Math.min(endTick - minWidth, Math.round(target)));
  else endTick = Math.min(origEnd, Math.max(startTick + minWidth, Math.round(target)));
  view.trims.set(clipStableKey(clip), { startTick, endTick });
  if (view.disposed) return;
  const plate = preview || (view.platesHost && view.platesHost.querySelector('.orr-clip__plate.is-chosen'));
  if (plate) {
    if (typeof plate._reelPaintBeam === 'function') plate._reelPaintBeam();
    for (const place of plate._reelPlaceThumbs || []) place();
    const bounds = plate.querySelector('.orr-clip__bounds');
    if (bounds) bounds.textContent = fmtClipSeconds(startTick, rate) + ' – ' + fmtClipSeconds(endTick, rate) + ' S';
    const artBox = plate.querySelector('.orr-clip__art');
    if (artBox) previewEdgeFrame(artBox, clip, edge === 'start' ? startTick : endTick);
  }
  paintReelCounters(view);
}

function paintReelCounters(view) {
  if (!view || view.disposed) return;
  const clips = view.clips || [];
  if (view.countCounter) view.countCounter.set(clips.length);
  let runtime = 0;
  for (const clip of clips) {
    const win = trimmedWindow(clip, view.trims);
    runtime += (win.endTick - win.startTick) / win.tickRate;
  }
  if (view.runtimeCounter) view.runtimeCounter.set(runtime);
  if (view.pos) {
    view.pos.textContent = clips.length
      ? (view.chosenIdx + 1) + ' / ' + clips.length
      : '0 / 0';
  }
}

function subLineFor(clip) {
  const rating = clipRating(clip);
  const kind = clip.kind === 'kill' ? 'Kill' : clip.kind === 'trick' ? 'Stunt' : clip.kind === 'death' ? 'Death' : 'Moment';
  return rating.label === kind ? kind : rating.label + ' · ' + kind;
}

function buildPlate(clip, view, geo, { ghost = null } = {}) {
  const plate = el('article', 'orr-clip__plate' + (ghost ? ' is-ghost' : ''));
  plate.style.width = Math.round(geo.plateW) + 'px';
  if (ghost) {
    plate.setAttribute('aria-label', ghost.label + ', no moment yet');
    const artH = Math.round(geo.plateW * 0.52);
    const box = el('div', 'orr-clip__art');
    box.style.height = artH + 'px';
    box.appendChild(ghostArt(ghost.kind, ghost.label, Math.round(geo.plateW), artH));
    plate.appendChild(box);
    plate.appendChild(el('div', 'orr-clip__foot'));
    plate.appendChild(el('h3', 'orr-clip__name', ghost.label));
    plate.appendChild(el('p', 'orr-clip__sub', ghost.sub));
    return plate;
  }
  plate.setAttribute('role', 'option');
  plate.tabIndex = -1;
  plate.dataset.clipId = clip.id;
  const artH = Math.round(geo.plateW * 0.52);
  plate.appendChild(plateArt(clip, geo.plateW, artH));
  plate.appendChild(el('div', 'orr-clip__foot'));
  const name = clip.label || (clip.trickId ? String(clip.trickId).replace(/_/g, ' ') : 'Moment');
  plate.appendChild(el('h3', 'orr-clip__name', name));
  plate.appendChild(el('p', 'orr-clip__sub', subLineFor(clip)));
  const win = trimmedWindow(clip, view.trims);
  plate.appendChild(el('p', 'orr-clip__bounds',
    fmtClipSeconds(win.startTick, win.tickRate) + ' – ' + fmtClipSeconds(win.endTick, win.tickRate) + ' S'));
  plate.appendChild(el('p', 'orr-clip__tickcode',
    'TICK ' + win.startTick + '–' + win.endTick + (clip.seed == null ? '' : ' · SEED ' + clip.seed)));
  const gaugeBox = el('div', 'orr-clip__gauge');
  const gaugeSvg = svg('svg', { class: 'orr-svg', 'aria-hidden': 'true' });
  gaugeSvg.setAttribute('viewBox', '0 0 46 46');
  gaugeSvg.setAttribute('width', '46');
  gaugeSvg.setAttribute('height', '46');
  const rating = clipRating(clip);
  const gauge = arcGauge({ cx: 23, cy: 23, r: 15, from: -120, to: 120, width: 3, tone: rating.tone === 'threat' ? 'threat' : 'hi', ghost: false });
  gaugeSvg.appendChild(gauge.el);
  gaugeBox.appendChild(gaugeSvg);
  plate.appendChild(gaugeBox);
  view.gauges.push(gauge);
  gauge.set(rating.fraction, { instant: reducedMotion() });
  plate.appendChild(buildBeam(plate, clip, view, true));
  plate.addEventListener('click', () => {
    const idx = view.clips.findIndex((c) => c.id === clip.id);
    if (idx >= 0) selectReelClip(view, idx, { focus: false });
  });
  plate.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    const idx = view.clips.findIndex((c) => c.id === clip.id);
    if (idx >= 0) selectReelClip(view, idx, { focus: false });
  });
  return plate;
}

function layoutReel(view) {
  if (!view || view.disposed) return;
  const railW = Math.max(320, Math.floor(view.railHost.clientWidth || view.container.clientWidth * 0.92 || 800));
  const geo = reelGeometry(railW);
  view.geo = geo;
  for (const gauge of view.gauges) {
    try { gauge.dispose(); } catch (_) { /* cosmetic */ }
  }
  view.gauges = [];
  view.platesHost.innerHTML = '';
  while (view.railSvg.firstChild) view.railSvg.firstChild.remove();
  view.railSvg.setAttribute('viewBox', `0 0 ${railW} 380`);
  const cx = railW / 2;
  // The curved rail: a bone band sampled on the same arc the plates ride.
  const lo = -REEL_HALF_WINDOW - 0.7;
  const hi = REEL_HALF_WINDOW + 0.7;
  const pts = [];
  for (let d = lo; d <= hi + 1e-6; d += 0.25) {
    pts.push(`${(cx + d * geo.spacing).toFixed(1)} ${geo.railY(d).toFixed(1)}`);
  }
  const railD = 'M ' + pts.join(' L ');
  const railBand = svg('path', { d: railD, class: 'orr-band', opacity: '0.9' });
  railBand.style.setProperty('--orr-band-a', '0.24');
  view.railSvg.appendChild(railBand);
  view.railSvg.appendChild(svg('path', { d: railD, class: 'orr-edge', opacity: '0.7' }));
  // The Hand rides the rail and points at the chosen plate.
  const hand = svg('g', {});
  const footY = geo.railY(0) - 14;
  hand.appendChild(svg('path', { d: `M 0 ${geo.railY(0) + 10} L 0 ${footY - 18}`, class: 'orr-bloom orr-hand', 'stroke-width': 7 }));
  hand.appendChild(svg('path', { d: `M 0 ${geo.railY(0) + 10} L 0 ${footY - 18}`, class: 'orr-core orr-hand', 'stroke-width': 2 }));
  hand.appendChild(svg('path', {
    d: `M -6 ${footY - 10} L 0 ${footY - 20} L 6 ${footY - 10}`,
    class: 'orr-core orr-hand', 'stroke-width': 2, fill: 'none',
  }));
  hand.appendChild(svg('circle', { cx: 0, cy: geo.railY(0) + 10, r: 3.5, style: 'fill:var(--dp-hand,#f2b950)' }));
  view.railSvg.appendChild(hand);
  view.handNode = hand;
  if (!view.handSpring) {
    view.handSpring = createSpring({ value: cx - 90, preset: 'swing', onUpdate: (x) => {
      view.handX = x;
      if (!view.disposed && view.handNode) view.handNode.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
    }});
  }
  // A rebuilt node starts untransformed; a rested spring would early-out and strand it at 0.
  hand.setAttribute('transform', `translate(${view.handSpring.value.toFixed(2)} 0)`);
  view.handSpring.set(cx, { instant: reducedMotion() });

  const clips = view.clips;
  const items = [];
  if (clips.length) {
    const from = Math.max(0, Math.min(view.chosenIdx - REEL_HALF_WINDOW, Math.max(0, clips.length - (REEL_HALF_WINDOW * 2 + 1))));
    const to = Math.min(clips.length - 1, from + REEL_HALF_WINDOW * 2);
    for (let i = from; i <= to; i += 1) items.push({ clip: clips[i], d: i - view.chosenIdx });
  } else {
    const ghosts = [
      { label: 'A STUNT', sub: 'LAND A NAMED TRICK', kind: 'trick' },
      { label: 'A KILL', sub: 'SCORE A KILL', kind: 'kill' },
      { label: 'A SAVE', sub: 'PULL OFF A SAVE', kind: 'save' },
    ];
    ghosts.forEach((ghost, k) => items.push({ ghost, d: (k - 1) * 1.8, s: 0.75 }));
  }
  items.forEach(({ clip, ghost, d, s: fixed }, order) => {
    const plate = clip ? buildPlate(clip, view, geo) : buildPlate(null, view, geo, { ghost });
    const s = fixed || geo.scaleFor(d);
    const x = cx + d * geo.spacing - geo.plateW / 2;
    const y = geo.topFor(d);
    const base = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    plate._reelBase = base;
    plate.style.transform = base;
    plate.style.opacity = clips.length ? String(1 - Math.min(0.5, Math.abs(d) * 0.2)) : '0.85';
    plate.style.zIndex = String(20 - Math.abs(d));
    if (clip) {
      const chosen = d === 0;
      plate.classList.toggle('is-chosen', chosen);
      plate.setAttribute('aria-selected', chosen ? 'true' : 'false');
      plate.tabIndex = chosen ? 0 : -1;
      plate.style.setProperty('--orr-order', String(order));
    }
    view.platesHost.appendChild(plate);
  });
}

function selectReelClip(view, idx, { focus = true } = {}) {
  if (!view || view.disposed || !view.clips.length) return;
  const next = Math.max(0, Math.min(view.clips.length - 1, idx | 0));
  if (next === view.chosenIdx && view.platesHost.children.length) {
    if (focus) {
      const plate = view.platesHost.querySelector('.orr-clip__plate.is-chosen');
      if (plate && typeof plate.focus === 'function') {
        try { plate.focus({ preventScroll: true }); } catch (_) { /* courtesy */ }
      }
    }
    return;
  }
  view.chosenIdx = next;
  layoutReel(view);
  paintReelCounters(view);
  buildExportLamp(view);
  cue('move');
  if (focus) {
    const plate = view.platesHost.querySelector('.orr-clip__plate.is-chosen');
    if (plate && typeof plate.focus === 'function') {
      try { plate.focus({ preventScroll: true }); } catch (_) { /* courtesy */ }
    }
  }
}

function chosenClip(view) {
  return view && view.clips && view.clips.length ? view.clips[Math.max(0, Math.min(view.clips.length - 1, view.chosenIdx))] : null;
}

/** Wire pointer + keyboard feeds so a hold verb arms the same way on every device. */
function wireHoldFeeds(button, hold) {
  button.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    hold.feed(true);
  });
  button.addEventListener('pointerup', () => hold.feed(false));
  button.addEventListener('pointercancel', () => hold.feed(false));
  button.addEventListener('pointerleave', () => hold.feed(false));
  button.addEventListener('keydown', (ev) => {
    if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) {
      ev.preventDefault();
      hold.feed(true);
    }
  });
  button.addEventListener('keyup', (ev) => {
    if (ev.key === ' ' || ev.key === 'Enter') hold.feed(false);
  });
  button.addEventListener('blur', () => hold.feed(false));
}

function doExport(view) {
  if (!view || view.disposed) return;
  const clip = chosenClip(view);
  if (!clip) return;
  const win = trimmedWindow(clip, view.trims);
  const shaped = { ...clip, startTick: win.startTick, endTick: win.endTick, seconds: (win.endTick - win.startTick) / win.tickRate };
  const outcome = exportClip(shaped, { format: view.format });
  if (outcome.ok) {
    exportedKeys.add(clipStableKey(clip) + '|' + view.format);
    if (view.readout) view.readout.textContent = 'EXPORTED ' + outcome.filename + ' (' + outcome.source + ')';
    cue('confirm');
    buildExportLamp(view);
  } else {
    if (view.readout) view.readout.textContent = 'EXPORT UNAVAILABLE: ' + outcome.reason;
    cue('deny');
  }
}

/** EXPORT is the Lamp Key — plain until this clip+format was exported, then hold-to-overwrite. */
function buildExportLamp(view) {
  if (!view || view.disposed || !view.lampSlot) return;
  view.lampSlot.innerHTML = '';
  const clip = chosenClip(view);
  const lamp = document.createElement('button');
  lamp.type = 'button';
  if (!clip) {
    lamp.textContent = 'FLY TO MAKE ONE';
    lamp.setAttribute('aria-label', 'Fly to make a clip');
    lamp.addEventListener('click', () => { cue('confirm'); flyToMakeOne(view.ctx); });
    view.lampSlot.appendChild(lamp);
    dressLampKey(lamp);
    return;
  }
  lamp.textContent = 'EXPORT';
  const overwrite = exportedKeys.has(clipStableKey(clip) + '|' + view.format);
  lamp.setAttribute('aria-label', overwrite ? 'Export clip (hold to overwrite)' : 'Export clip');
  view.lampSlot.appendChild(lamp);
  if (overwrite) {
    const hold = attachHoldVerb(lamp, { ms: 600, onFire: () => { view.exportFiredAt = Date.now(); doExport(view); } });
    view.holds.push(hold);
    wireHoldFeeds(lamp, hold);
    dressLampKey(lamp, { hold: true, note: 'OVERWRITE' });
    lamp.addEventListener('click', () => {
      if (Date.now() - (view.exportFiredAt || 0) < 500) return;
      cue('deny');
      if (view.readout) view.readout.textContent = 'HOLD EXPORT TO OVERWRITE THIS CLIP’S ' + view.format.toUpperCase();
    });
  } else {
    dressLampKey(lamp);
    lamp.addEventListener('click', () => doExport(view));
  }
}

function doDelete(view) {
  if (!view || view.disposed) return;
  const clip = chosenClip(view);
  const director = view.director;
  if (!clip || !director || typeof director.clear !== 'function' || typeof director.mark !== 'function') {
    cue('deny');
    if (view.readout) view.readout.textContent = 'NOTHING TO DELETE';
    return;
  }
  const survivors = view.clips.filter((c) => c.id !== clip.id).slice().reverse();
  director.clear();
  for (const kept of survivors) {
    director.mark({
      tick: kept.momentTick, kind: kept.kind, trickId: kept.trickId, label: kept.label,
      rarity: kept.rarity, actorId: kept.actorId, targetId: kept.targetId, seed: kept.seed,
    });
  }
  view.clips = typeof director.list === 'function' ? director.list() : [];
  view.chosenIdx = Math.max(0, Math.min(view.clips.length - 1, view.chosenIdx));
  layoutReel(view);
  paintReelCounters(view);
  buildExportLamp(view);
  buildVerbs(view);
  if (view.readout) {
    view.readout.textContent = view.clips.length
      ? 'DELETED ' + (clip.label || 'MOMENT') + ' — ' + view.clips.length + ' LEFT'
      : 'REEL EMPTY — FLY TO MAKE ONE';
  }
  cue('confirm');
}

function doPlayInReplay(view) {
  if (!view || view.disposed) return;
  const clip = chosenClip(view);
  if (!clip) return;
  const recording = resolveReplayRecording(view.ctx) || null;
  const ticks = recording ? Math.max(0, recording.ticks | 0) : 0;
  if (!recording || !(ticks > 0)) {
    cue('deny');
    if (view.readout) view.readout.textContent = 'NO TAPE — FLY TO RECORD BEFORE REPLAYING A MOMENT';
    return;
  }
  const win = trimmedWindow(clip, view.trims);
  requestReplaySeek(Math.max(0, Math.min(ticks - 1, win.startTick)));
  if (openState && openState.view === view) {
    const { rootEl, ctx } = openState;
    closeClips();
    openReplay(rootEl, ctx);
  } else {
    cue('confirm');
    if (view.readout) view.readout.textContent = 'TAPE CUED AT TICK ' + win.startTick + ' — PAUSE › REPLAY OPENS THIS WINDOW';
  }
}

function buildVerbs(view) {
  if (!view || view.disposed || !view.verbsSlot) return;
  view.verbsSlot.innerHTML = '';
  const clip = chosenClip(view);
  if (!clip) return;
  const list = el('ul', 'dp-lit dp-lit--fine');
  list.setAttribute('aria-label', 'Clip actions');
  const playLi = el('li');
  playLi.dataset.bank = '1';
  const play = el('button', 'dp-lit__item', 'PLAY-IN-REPLAY');
  play.type = 'button';
  play.addEventListener('click', () => doPlayInReplay(view));
  playLi.appendChild(play);
  const delLi = el('li');
  delLi.dataset.bank = '1';
  const del = el('button', 'dp-lit__item', 'DELETE');
  del.type = 'button';
  del.setAttribute('aria-label', 'Delete clip (hold to confirm)');
  const hold = attachHoldVerb(del, { ms: 600, onFire: () => { view.deleteFiredAt = Date.now(); doDelete(view); } });
  view.holds.push(hold);
  wireHoldFeeds(del, hold);
  del.addEventListener('click', () => {
    if (Date.now() - (view.deleteFiredAt || 0) < 500) return;
    cue('deny');
    if (view.readout) view.readout.textContent = 'HOLD DELETE TO CONFIRM — IT DROPS THE MOMENT';
  });
  delLi.appendChild(del);
  list.append(playLi, delLi);
  view.verbsSlot.appendChild(list);
}

const DIAL_ANGLES = Object.freeze({ gif: -55, mp4: 55 });

function setClipFormat(view, format, { announce = true } = {}) {
  if (!view || view.disposed) return;
  const next = format === 'mp4' ? 'mp4' : 'gif';
  if (view.format === next && view.dialSpring) return;
  view.format = next;
  if (view.dialSpring) view.dialSpring.set(DIAL_ANGLES[next], { instant: reducedMotion() });
  for (const opt of view.dialHost ? view.dialHost.querySelectorAll('.orr-clip__dial-opt') : []) {
    const on = opt.dataset.format === next;
    opt.setAttribute('aria-checked', on ? 'true' : 'false');
    opt.tabIndex = on ? 0 : -1;
  }
  buildExportLamp(view);
  if (announce) cue('move');
}

function buildDial(view) {
  const host = el('div', 'orr-clip__dial');
  const dial = el('div', '');
  dial.setAttribute('role', 'radiogroup');
  dial.setAttribute('aria-label', 'Export format');
  const W = 120;
  const H = 58;
  const art = svg('svg', { class: 'orr-svg orr-clip__dial-svg', 'aria-hidden': 'true' });
  art.setAttribute('viewBox', `0 0 ${W} ${H}`);
  art.setAttribute('width', String(W));
  art.setAttribute('height', String(H));
  const cx = W / 2;
  const cy = H - 6;
  const r = 38;
  const arc = (a0, a1) => {
    const p = (deg) => {
      const a = (deg - 90) * Math.PI / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const track = arc(-62, 62);
  art.appendChild(svg('path', { d: track, class: 'orr-band', opacity: '0.7' }));
  art.appendChild(svg('path', { d: track, class: 'orr-edge', opacity: '0.6' }));
  // The needle is bone light, not amber: the rail's Hand is this screen's one Hand
  // (cross-surface palette law), so the dial reads as a needle dial, never a second Hand.
  const needle = svg('g', {});
  needle.appendChild(svg('path', { d: `M 0 0 L 0 ${-(r - 6)}`, class: 'orr-bloom orr-hi', 'stroke-width': 6 }));
  needle.appendChild(svg('path', { d: `M 0 0 L 0 ${-(r - 6)}`, class: 'orr-core orr-hi', 'stroke-width': 2 }));
  needle.appendChild(svg('circle', { cx: 0, cy: -(r - 6), r: 3, class: 'orr-bead' }));
  const dialG = svg('g', { transform: `translate(${cx} ${cy})` });
  dialG.appendChild(needle);
  art.appendChild(dialG);
  view.dialNeedle = dialG;
  dial.appendChild(art);
  const opts = el('div', '');
  opts.style.display = 'flex';
  opts.style.justifyContent = 'space-between';
  opts.style.width = '100%';
  for (const format of ['gif', 'mp4']) {
    const opt = el('span', 'orr-clip__dial-opt', format.toUpperCase());
    opt.setAttribute('role', 'radio');
    opt.dataset.format = format;
    opt.tabIndex = (format === view.format) ? 0 : -1;
    opt.setAttribute('aria-checked', format === view.format ? 'true' : 'false');
    opt.addEventListener('click', () => setClipFormat(view, format));
    opt.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setClipFormat(view, format); }
    });
    opts.appendChild(opt);
  }
  dial.appendChild(opts);
  dial.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    ev.stopPropagation();
    setClipFormat(view, ev.key === 'ArrowLeft' ? 'gif' : 'mp4');
    const opt = opts.querySelector(`[data-format="${view.format}"]`);
    if (opt && typeof opt.focus === 'function') {
      try { opt.tabIndex = 0; opt.focus({ preventScroll: true }); } catch (_) { /* courtesy */ }
    }
  });
  dial.addEventListener('pointerdown', (ev) => {
    if (ev.target && ev.target.closest && ev.target.closest('.orr-clip__dial-opt')) return;
    const rect = dial.getBoundingClientRect();
    setClipFormat(view, ev.clientX - rect.left < rect.width / 2 ? 'gif' : 'mp4');
  });
  host.appendChild(dial);
  if (!view.dialSpring) {
    view.dialSpring = createSpring({ value: DIAL_ANGLES[view.format], preset: 'swing', onUpdate: (deg) => {
      if (!view.disposed && view.dialNeedle) {
        view.dialNeedle.setAttribute('transform', `translate(${cx} ${cy}) rotate(${deg.toFixed(2)})`);
      }
    }});
  }
  view.dialNeedle.setAttribute('transform', `translate(${cx} ${cy}) rotate(${view.dialSpring.value.toFixed(2)})`);
  view.dialHost = host;
  return host;
}

function reelLegend(view) {
  if (!view.clips.length) return 'LAND A NAMED STUNT OR A KILL — THE REEL CATCHES IT HERE';
  return 'DRAG A WINDOW EDGE TO PULL IT OPEN · [ ] TRIM · ARROWS RIDE THE RAIL';
}

function exitReel(view) {
  if (openState && openState.view === view) {
    closeClips();
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

function buildContent(container, ctx) {
  injectDeckplate();
  // This screen's own placement lives in styles/ui.css (migrated screens own no CSS);
  // the orrery tokens below are library material, owned by src/ui/orrery/tokens.js.
  injectOrrery();
  const director = resolveClipDirector(ctx);
  let clips = [];
  try {
    clips = director && typeof director.list === 'function' ? director.list() || [] : [];
  } catch (_) {
    clips = [];
  }
  container.innerHTML = '';
  container.classList.add('k-screen', 'k-screen--stage', 'orr-clips');
  container.dataset.role = CLIPS_SCREEN_ID;
  container.setAttribute('aria-label', CLIPS_LABEL);

  const view = {
    container, ctx, director, clips,
    chosenIdx: 0, trims: new Map(), format: 'gif',
    disposed: false, raf: null, ro: null,
    railHost: null, railSvg: null, platesHost: null, geo: null,
    handNode: null, handSpring: null, handX: 0,
    dialNeedle: null, dialSpring: null, dialHost: null,
    countCounter: null, runtimeCounter: null, pos: null, readout: null,
    lampSlot: null, verbsSlot: null,
    gauges: [], holds: [], keyHandler: null,
    exportFiredAt: 0, deleteFiredAt: 0,
  };

  const veilTop = el('div', 'orr-clips__veil-top');
  veilTop.setAttribute('aria-hidden', 'true');
  const veilFoot = el('div', 'orr-clips__veil-foot');
  veilFoot.setAttribute('aria-hidden', 'true');
  container.append(veilTop, veilFoot);

  const exitWrap = el('div', 'orr-clips__exit');
  const exitList = words([{ label: 'Exit', action: 'exit' }], {
    ariaLabel: CLIPS_LABEL,
    system: 'light',
    onPick: () => exitReel(view),
  });
  exitWrap.append(exitList);
  container.append(exitWrap);

  const read = el('div', 'orr-clips__read');
  const countEl = el('div', 'orr-clips__count', '0');
  const countLabel = el('div', 'orr-clips__count-label', clips.length === 1 ? 'CLIP' : 'CLIPS');
  const runtimeEl = el('div', 'orr-clips__runtime');
  const runtimeNum = el('span', 'orr-clips__runtime-num', '0.0');
  runtimeEl.append(runtimeNum, el('span', 'orr-clips__runtime-unit', ' S TOTAL'));
  read.append(countEl, countLabel, runtimeEl);
  container.append(read);
  view.countCounter = createCounter(countEl);
  view.countCounter.set(clips.length);
  view.runtimeCounter = createCounter(runtimeNum, { format: (n) => (Math.max(0, Number(n) || 0)).toFixed(1) });
  view.runtimeCounter.set(0);

  const railHost = el('div', 'orr-clips__rail');
  const railSvg = svg('svg', { class: 'orr-svg orr-rail-svg', 'aria-hidden': 'true' });
  const platesHost = el('div', 'orr-clips__plates');
  platesHost.setAttribute('role', 'listbox');
  platesHost.setAttribute('aria-label', 'Rated moments');
  railHost.append(railSvg, platesHost);
  container.append(railHost);
  view.railHost = railHost;
  view.railSvg = railSvg;
  view.platesHost = platesHost;

  const readline = el('div', 'orr-clips__readline');
  const pos = el('span', 'orr-clips__pos', clips.length ? '1 / ' + clips.length : '0 / 0');
  const readout = el('p', 'orr-clips__readout', reelLegend(view));
  readout.dataset.role = 'clips-readout';
  readline.append(pos, readout);
  container.append(readline);
  view.pos = pos;
  view.readout = readout;

  const actions = el('div', 'orr-clips__actions');
  if (clips.length) actions.appendChild(buildDial(view));
  const lampSlot = el('div', 'orr-clips__lamp');
  actions.appendChild(lampSlot);
  const verbsSlot = el('div', 'orr-clips__verbs');
  actions.appendChild(verbsSlot);
  container.append(actions);
  view.lampSlot = lampSlot;
  view.verbsSlot = verbsSlot;
  buildExportLamp(view);
  buildVerbs(view);

  layoutReel(view);
  paintReelCounters(view);
  if (typeof ResizeObserver === 'function') {
    view.ro = new ResizeObserver(() => layoutReel(view));
    try { view.ro.observe(railHost); } catch (_) { /* measured once is enough */ }
  }

  // Tilt Plates: produced art leans toward the cursor. Flat under reduced motion.
  if (!reducedMotion()) {
    platesHost.addEventListener('pointermove', (ev) => {
      const plate = ev.target && ev.target.closest ? ev.target.closest('.orr-clip__plate') : null;
      if (!plate || !plate._reelBase || view.disposed) return;
      const rect = plate.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const fx = Math.max(-1, Math.min(1, ((ev.clientX - rect.left) / rect.width - 0.5) * 2));
      const fy = Math.max(-1, Math.min(1, ((ev.clientY - rect.top) / rect.height - 0.5) * 2));
      plate.style.transform = `perspective(900px) ${plate._reelBase} rotateX(${(-fy * 6).toFixed(2)}deg) rotateY(${(fx * 7).toFixed(2)}deg)`;
    });
    platesHost.addEventListener('pointerout', (ev) => {
      const plate = ev.target && ev.target.closest ? ev.target.closest('.orr-clip__plate') : null;
      if (plate && plate._reelBase && (!ev.relatedTarget || !plate.contains(ev.relatedTarget))) {
        plate.style.transform = plate._reelBase;
      }
    });
  }

  const onKey = (ev) => {
    if (view.disposed) return;
    const inOverlay = openState && openState.view === view;
    if (ev.key === 'Escape' && inOverlay) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      closeClips();
      return;
    }
    if (!view.clips.length) return;
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const own = ev.target && ev.target.closest && ev.target.closest('.orr-clips__actions, .orr-clip__thumb, .orr-clip__dial');
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      if (own) return;
      ev.preventDefault();
      selectReelClip(view, view.chosenIdx + (ev.key === 'ArrowLeft' ? -1 : 1));
    } else if (ev.key === 'Home' || ev.key === 'End') {
      if (own) return;
      ev.preventDefault();
      selectReelClip(view, ev.key === 'Home' ? 0 : view.clips.length - 1);
    } else if (ev.key === '[' || ev.key === '{' || ev.key === ']' || ev.key === '}') {
      if (own) return;
      const clip = chosenClip(view);
      if (!clip) return;
      ev.preventDefault();
      const edge = ev.key === '[' || ev.key === '{' ? 'start' : 'end';
      const win = trimmedWindow(clip, view.trims);
      const span = Math.max(1, Number(clip.endTick) - Number(clip.startTick));
      // [ trims the head (plain: later, shift: back earlier); ] trims the tail mirrored.
      // Plain keys narrow, so a fresh full window always visibly answers the first press.
      const mag = Math.max(1, Math.round(win.tickRate * 0.25));
      const step = edge === 'start' ? (ev.shiftKey ? -mag : mag) : (ev.shiftKey ? mag : -mag);
      const cur = edge === 'start' ? win.startTick : win.endTick;
      nudgeTrimEdge(view, clip, edge, (cur + step - Number(clip.startTick)) / span);
      cue('move');
    }
  };
  view.keyHandler = onKey;
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true);

  try {
    settle(railHost, { from: 'bottom', state: 'clips-rail' });
    settle(read, { from: 'right', delay: 60, state: 'clips-read' });
    settle(actions, { from: 'bottom', delay: 120, state: 'clips-actions' });
    decrypt(readout, readout.textContent, { duration: 260, delay: 180 });
  } catch (_) { /* motion is cosmetic */ }

  return view;
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
  const view = buildContent(container, ctx);

  const parent = (rootEl && rootEl.parentElement) || document.body;
  parent.appendChild(container);
  suppressPauseRoot(rootEl, true);
  document.body.classList.add(CLIPS_PRESENTATION_CLASS);

  openState = { overlay: container, rootEl, ctx, onKey: view.keyHandler, view };
  settle(container, { from: 'bottom', state: 'clips-open' });
  focusFirstOverlayControl(container);
  cue('open');
}

export const clipsScreen = {
  id: CLIPS_SCREEN_ID,
  _view: null,

  mount(rootEl, ctx) {
    if (this._view) {
      disposeReelView(this._view);
      this._view = null;
    }
    this._view = buildContent(rootEl, ctx);
  },

  onShow(ctx) {
    if (ctx && ctx.state && ctx.state.mode === 'flight') ctx.state.mode = 'paused';
    cue('open');
  },

  onHide() {
    if (this._view) {
      disposeReelView(this._view);
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
