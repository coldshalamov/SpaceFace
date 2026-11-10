// src/ui/ship/hullPoster.js — the produced hull render on the shipworks stage (dock and THE SHIP).
//
// The same idea the new-game stage uses (src/ui/screens/stageHull.js), built for the shared ship
// stage: the Cycles render of the hull on show IS the stage until the authored hull has drawn in
// the live preview, and wherever that preview never arrives (a second WebGL context refused, a
// cold cache). Then the poster fades and the live hull takes over (.sx-sw__stage.is-live).
//
// The render also carries the hull's named hook empties projected into the image
// (assets/ui/renders/hulls/manifest.json `marks`), so the system beads sit on the real sockets
// of the picture, not on a guess. design/frontend/ONE_PHOTOGRAPH.md section 9.2 asset 1 / 2.

import { hullPosterUrl } from '../hullPosters.js';

const MANIFEST_URL = new URL('../../../assets/ui/renders/hulls/manifest.json', import.meta.url).href;

/** Which hook empty each slot type sits on. Several sockets of one type spread along the mark. */
export const SLOT_MARKS = Object.freeze({
  weapon: ['SOCKET_Weapon_Front'],
  mining: ['SOCKET_Mining_Front'],
  engine: ['SOCKET_Engine_Main'],
  cargo: ['SOCKET_Cargo_Ventral'],
  utility: ['SOCKET_Utility_Dorsal'],
  // The hero view looks at the port side: the port thruster is the one on the near wing.
  thruster: ['SOCKET_RCS_Port', 'SOCKET_RCS_Starboard'],
  // A shield is a ship system with no literal socket: it sits on the hull's heart, a little
  // above the root so it never lands on the ventral cargo mark.
  shield: [],
});

let manifestPromise = null;
let manifestData = null;

/** The render manifest, fetched once. Resolves null where there is no fetch (node tests). */
export function loadHullPosterManifest() {
  if (manifestData) return Promise.resolve(manifestData);
  if (!manifestPromise) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    manifestPromise = fetch(MANIFEST_URL)
      .then((r) => (r && r.ok ? r.json() : null))
      .then((json) => { manifestData = json && json.hulls ? json : null; return manifestData; })
      .catch(() => null);
  }
  return manifestPromise;
}

function rootMark(marks) {
  const key = Object.keys(marks).find((k) => /_LOD0_ROOT$/.test(k));
  return (key && marks[key]) || marks.SOCKET_Camera_Focus || null;
}

/**
 * The bead for one slot, as [u, v] in the image (0..1 from the top-left), or null when this hull
 * has no marks. `ordinal`/`count` spread several sockets of one type.
 */
export function markForSlot(marks, slotType, ordinal = 0, count = 1) {
  if (!marks || typeof marks !== 'object') return null;
  const names = SLOT_MARKS[slotType] || [];
  let p = null;
  if (names.length > 1 && marks[names[ordinal % names.length]]) p = marks[names[ordinal % names.length]];
  else if (names.length && marks[names[0]]) p = marks[names[0]];
  let u; let v;
  if (p) { u = Number(p[0]); v = Number(p[1]); }
  else {
    const root = rootMark(marks);
    if (!root) return null;
    u = Number(root[0]);
    v = Number(root[1]) - (slotType === 'shield' ? 0.06 : 0.02);
  }
  // Two sockets of one type share one mark on these renders (the Pelican's twin mining arms):
  // spread them along the hull so each has its own bead and label. The RCS pair has two marks.
  const shared = names.length <= 1 && count > 1;
  if (shared) u += (ordinal - (count - 1) / 2) * 0.035;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return [Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v))];
}

const inkCache = new Map();

/** The hull's alpha bounding box in the image, normalised 0..1 (measured once per render). */
export function measurePosterInk(img) {
  const key = img && (img.currentSrc || img.src);
  if (!key || !img.naturalWidth || !img.naturalHeight) return null;
  if (inkCache.has(key)) return inkCache.get(key);
  let box = null;
  try {
    const w = 240;
    const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h).data;
    let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= 0) box = { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };
  } catch (_) { box = null; }
  inkCache.set(key, box);
  return box;
}

/**
 * The poster on one stage. `after` is the element it goes behind the overlays of (the canvas);
 * `onChange` runs when the picture, its marks or its ink box arrive so the caller re-projects.
 */
export function createStagePoster(stageEl, { after = null, onChange = () => {} } = {}) {
  const img = document.createElement('img');
  img.className = 'sx-sw__poster';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.decoding = 'async';
  img.draggable = false;
  img.hidden = true;
  if (after && after.parentNode === stageEl) stageEl.insertBefore(img, after.nextSibling);
  else stageEl.prepend(img);

  let defId = null;
  let view = 'hero';
  let url = null;
  let live = false;
  let ink = null;
  let imgRect = null;

  const notify = () => { try { onChange(); } catch (_) { /* a re-projection failure must not break the poster */ } };
  img.addEventListener('load', () => { ink = measurePosterInk(img); notify(); });
  img.addEventListener('error', () => { ink = null; notify(); });
  loadHullPosterManifest().then((m) => { if (m) notify(); });

  function marks() {
    const hull = manifestData && manifestData.hulls && manifestData.hulls[defId];
    const entry = hull && hull[view];
    return entry && entry.marks ? entry.marks : null;
  }

  function aspect() {
    const hull = manifestData && manifestData.hulls && manifestData.hulls[defId];
    const entry = hull && hull[view];
    if (entry && entry.width && entry.height) return entry.width / entry.height;
    if (img.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight;
    return view === 'side' ? 2400 / 1100 : 2400 / 1350;
  }

  return {
    el: img,
    /** Show the render for this hull (null hides it; a hull with no render has no poster). */
    setHull(nextDefId, nextView = 'hero') {
      const nextUrl = hullPosterUrl(nextDefId, nextView);
      if (nextDefId !== defId) live = false;
      defId = nextDefId || null;
      view = nextView;
      if (nextUrl !== url) {
        url = nextUrl;
        ink = null;
        imgRect = null;
        if (url) img.src = url; else img.removeAttribute('src');
        if (url && img.complete && img.naturalWidth) ink = measurePosterInk(img);
      }
      img.hidden = !url;
      stageEl.classList.toggle('has-poster', !!url);
      stageEl.classList.toggle('is-live', !!url && live);
    },
    /** The live hull has drawn (or is gone again for a new hull). */
    setLive(next) {
      live = !!next;
      stageEl.classList.toggle('is-live', !!url && live);
    },
    has() { return !!url; },
    isLive() { return !!url && live; },
    /** The picture is the stage right now: a render exists and the live hull has not drawn. */
    showing() { return !!url && !live; },
    ready() { return !!url && !!marks(); },
    defId() { return defId; },
    view() { return view; },
    ink() { return ink; },
    aspect,
    marks,
    /** Put the image at `rect` (stage px). */
    place(rect) {
      imgRect = rect;
      img.style.left = `${Math.round(rect.left)}px`;
      img.style.top = `${Math.round(rect.top)}px`;
      img.style.width = `${Math.round(rect.width)}px`;
      img.style.height = `${Math.round(rect.height)}px`;
    },
    /** A slot's bead in stage px, from the render's marks and where the image was placed. */
    pointFor(slotType, ordinal = 0, count = 1) {
      if (!imgRect) return null;
      const uv = markForSlot(marks(), slotType, ordinal, count);
      if (!uv) return null;
      return { x: imgRect.left + uv[0] * imgRect.width, y: imgRect.top + uv[1] * imgRect.height };
    },
  };
}
