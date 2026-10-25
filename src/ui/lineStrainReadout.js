import { readLineVisualProfile } from '../render/lineVisualProfile.js';

export function lineStrainWords(state, profile, target) {
  const mass = Number(target?.physicsBody?.mass ?? target?.mass);
  const tonnes = Number.isFinite(mass) && mass > 0 ? `${Math.round(mass * 10) / 10} T / ${profile.ceilingT.toLocaleString('en-US')} T` : '';
  return {
    title: `LINE ${profile.label}${tonnes ? ' · ' + tonnes : ''}`,
    detail: profile.overClass ? `OVER CLASS · WINCH ${Math.round(profile.heat * 100)}%`
      : profile.active ? `WITHIN CLASS · WINCH ${Math.round(profile.heat * 100)}%` : 'WINCH COOLING',
  };
}

const CSS = `
.sf-line-strain { position:fixed; left:0; top:0; width:220px; pointer-events:none;
 color:var(--dp-ink-strong,#eee); font:600 12px/1.45 var(--dp-font-mono,monospace);
 letter-spacing:.04em; text-shadow:0 1px 3px var(--dp-bg,#080c12); }
.sf-line-strain[hidden] { display:none; }
.sf-line-strain__detail { color:var(--dp-ink-dim,#bcc7d1); font-size:12px; }
.sf-line-strain[data-over=true] .sf-line-strain__detail { color:var(--dp-warn,#ffc078); }
.sf-line-strain__track { width:120px; height:2px; margin-top:4px; background:var(--dp-hairline,#48515a); }
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
  return {
    root,
    update(state, player, project) {
      readLineVisualProfile(state, profile);
      if (state.mode !== 'flight' || state.ui?.docked || !player?.alive || typeof project !== 'function'
          || (!profile.active && profile.heat <= .02)) { root.hidden = true; return; }
      query.x = player.pos.x; query.z = player.pos.z;
      const center = project(query);
      if (!center || center.onScreen === false || !Number.isFinite(center.x) || !Number.isFinite(center.y)) { root.hidden = true; return; }
      const x = center.x, y = center.y;
      query.x += Math.max(1, Number(player.radius) || 8);
      const edge = project(query);
      const clear = edge && Number.isFinite(edge.x) ? Math.max(30, Math.abs(edge.x - x)) + 18 : 50;
      const w = doc.documentElement?.clientWidth || globalThis.innerWidth || 960;
      const h = doc.documentElement?.clientHeight || globalThis.innerHeight || 540;
      const target = state.entities?.get?.(state.player?.tether?.targetId);
      const words = lineStrainWords(state, profile, target);
      title.textContent = words.title; detail.textContent = words.detail;
      root.dataset.over = String(profile.overClass);
      root.setAttribute('aria-label', `${words.title}. ${words.detail}`);
      root.setAttribute('aria-valuenow', String(Math.round(profile.heat * 100)));
      root.style.transform = `translate3d(${Math.round(Math.max(16, Math.min(w - 236, x + clear)))}px,${Math.round(Math.max(16, Math.min(h - 70, y + 20)))}px,0)`;
      fill.style.transform = `scaleX(${profile.heat})`;
      root.hidden = false;
    },
    hide() { root.hidden = true; },
    destroy() {
      if (typeof root.remove === 'function') root.remove();
      else root.parentNode?.removeChild?.(root);
    },
  };
}
