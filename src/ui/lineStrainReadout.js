import { readLineVisualProfile } from '../render/lineVisualProfile.js';

export function lineStrainWords(state, profile) {
  // overClass is a positive signal from the progression owner, not an inverse proof that the
  // current body has been checked. A line can hold an anchor or a tow, and a fresh/arcade
  // mirror can legitimately have no active class verdict. Never print a fabricated one.
  const rating = Number.isFinite(profile.ceilingT) && profile.ceilingT > 0
    ? `RATED ${profile.ceilingT.toLocaleString('en-US')} T` : 'RATING UNKNOWN';
  return {
    title: `LINE ${profile.label} · ${rating}`,
    detail: profile.overClass ? `OVER CLASS · WINCH ${Math.round(profile.heat * 100)}%`
      : profile.active ? `WINCH ${Math.round(profile.heat * 100)}%` : 'WINCH COOLING',
  };
}

const CSS = `
.sf-line-strain { position:fixed; left:0; top:0; width:max-content; min-width:148px; max-width:220px;
 padding:6px 10px; border-radius:4px; border:1px solid rgb(236 230 216 / .13);
 background:linear-gradient(180deg, rgb(16 20 28 / .88), rgb(11 14 20 / .88));
 box-shadow:inset 0 1px 0 rgb(255 255 255 / .05), 0 8px 20px -6px rgb(0 0 0 / .68);
 pointer-events:none; color:var(--dp-ink-strong,#f4f1ea);
 font:600 12px/1.35 var(--dp-face-read,"Instrument Sans",sans-serif);
 font-variant-numeric:tabular-nums; letter-spacing:.03em; }
.sf-line-strain[hidden] { display:none; }
.sf-line-strain__detail { color:var(--dp-ink-dim,#9ba3b0); font-family:var(--dp-face-num,"Spline Sans Mono",monospace); font-weight:500; font-size:12px; }
.sf-line-strain[data-over=true] .sf-line-strain__detail { color:var(--dp-warn,#ffc078); }
.sf-line-strain__track { width:100%; height:3px; border-radius:1.5px; margin-top:4px; background:rgb(236 230 216 / .18); overflow:hidden; }
.sf-line-strain__fill { height:100%; width:100%; transform-origin:left center; background:var(--dp-warn,#ffc078); }
`;

/** The hero instrument follows the ship. It reads the same saved/live bag as the cable and winch. */
export function createLineStrainReadout(host) {
  const doc = host?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!host || !doc?.createElement) return null;
  if (!doc.getElementById('sf-line-strain-style')) {
    const style = doc.createElement('style'); style.id = 'sf-line-strain-style'; style.textContent = CSS;
    (doc.head || host).appendChild(style);
  }
  const root = doc.createElement('div'); root.className = 'sf-line-strain'; root.hidden = true;
  root.setAttribute('role', 'meter'); root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100');
  const title = doc.createElement('div'), detail = doc.createElement('div');
  detail.className = 'sf-line-strain__detail';
  const track = doc.createElement('div'), fill = doc.createElement('div');
  track.className = 'sf-line-strain__track'; fill.className = 'sf-line-strain__fill'; track.appendChild(fill);
  root.appendChild(title); root.appendChild(detail); root.appendChild(track); host.appendChild(root);
  const profile = {}, query = { x: 0, y: 0, z: 0 };
  // Re-setting [hidden] on an already hidden root still invalidates style every frame.
  const hide = () => { if (!root.hidden) root.hidden = true; };
  // DOM writes are dirty-gated: identical text/aria/style assignments still cost
  // style/attribute processing every frame while a line stays hot.
  let lastTitle = '', lastDetail = '', lastOver = '', lastNow = '', lastLabel = '';
  let lastTx = -1, lastTy = -1, lastHeat = -1;
  // Viewport size is a forced-layout read; cache it and refresh only when the window resizes.
  let viewW = 0, viewH = 0;
  const invalidateView = () => { viewW = 0; viewH = 0; };
  const view = globalThis.window ?? globalThis;
  view.addEventListener?.('resize', invalidateView);
  return {
    root,
    update(state, player, project) {
      readLineVisualProfile(state, profile);
      if (state.mode !== 'flight' || state.ui?.docked || !player?.alive || typeof project !== 'function'
          || (!profile.active && profile.heat <= .02)) { hide(); return; }
      query.x = player.pos.x; query.z = player.pos.z;
      const center = project(query);
      if (!center || center.onScreen === false || !Number.isFinite(center.x) || !Number.isFinite(center.y)) { hide(); return; }
      const x = center.x, y = center.y;
      query.x += Math.max(1, Number(player.radius) || 8);
      const edge = project(query);
      const clear = edge && Number.isFinite(edge.x) ? Math.max(30, Math.abs(edge.x - x)) + 18 : 50;
      if (!viewW || !viewH) {
        viewW = doc.documentElement?.clientWidth || globalThis.innerWidth || 960;
        viewH = doc.documentElement?.clientHeight || globalThis.innerHeight || 540;
      }
      const w = viewW, h = viewH;
      const words = lineStrainWords(state, profile);
      if (words.title !== lastTitle) { lastTitle = words.title; title.textContent = words.title; }
      if (words.detail !== lastDetail) { lastDetail = words.detail; detail.textContent = words.detail; }
      const over = String(profile.overClass);
      if (over !== lastOver) { lastOver = over; root.dataset.over = over; }
      const label = `${words.title}. ${words.detail}`;
      if (label !== lastLabel) { lastLabel = label; root.setAttribute('aria-label', label); }
      const now = String(Math.round(profile.heat * 100));
      if (now !== lastNow) { lastNow = now; root.setAttribute('aria-valuenow', now); }
      const tx = Math.round(Math.max(16, Math.min(w - 236, x + clear)));
      const ty = Math.round(Math.max(16, Math.min(h - 70, y + 20)));
      if (tx !== lastTx || ty !== lastTy) {
        lastTx = tx; lastTy = ty;
        root.style.transform = `translate3d(${tx}px,${ty}px,0)`;
      }
      const heat = profile.heat;
      if (heat !== lastHeat) { lastHeat = heat; fill.style.transform = `scaleX(${heat})`; }
      if (root.hidden) root.hidden = false;
    },
    hide,
    destroy() {
      view.removeEventListener?.('resize', invalidateView);
      if (typeof root.remove === 'function') root.remove();
      else root.parentNode?.removeChild?.(root);
    },
  };
}
