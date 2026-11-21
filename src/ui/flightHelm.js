// The flight helm (HUD-2 items 12-13): who is flying the ship, and the one-key berth run.
//
//   · ONE flight-mode chip above the speed dial names whatever is steering the ship that is not
//     the player — the berth autopilot, a plotted-course autopilot, a hero manoeuvre, the orbit
//     assist, the docking guide — in plain words, for exactly as long as it steers.
//   · "[E] Fly to berth" is offered on the station E actually flies to (berthOffer.js: the
//     selected or tracked station, else the nearest one when the pilot is not in a fight). It
//     sits beside the station when the station is on screen, else at the screen edge toward it.
//   · While the berth autopilot flies, the approach is drawn in the world: ship → corridor mouth
//     → berth, a dashed lane the same ink as the dock guide.
//
// Performance (HUD-2 item 15): the DOM is resolved once at mount; nothing here queries the
// document, measures layout or reads computed style on the frame path. The offer chip's width is
// read once per text change (it is the only box placement needs). Text and transforms are written
// only when they change. No backdrop-filter, no infinite animation.

import { resolveAutopilotTarget } from '../core/flight/flightPresentationReads.js';
import { activeRaceMission } from '../systems/racingSteer.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../data/collisionProxyManifests.js';
import { berthAutopilotStation, berthOfferStation, stationDisplayName } from './berthOffer.js';
import { formatDistance } from './units.js';
import { promptLabel } from './bindings.js';

const STYLE_ID = 'sf-helm-css';
const SVG_NS = 'http://www.w3.org/2000/svg';
/** Cadence of the lane's corridor resolve (the projection itself runs every overlay frame). */
const LANE_RESOLVE_S = 0.2;

const HERO_WORDS = Object.freeze({
  bank: { title: 'Boomerang run', detail: 'banking out for the bomb' },
  return: { title: 'Boomerang run', detail: 'swinging back' },
  pinball_dash: { title: 'Pinball rush', detail: 'dashing through' },
});

function finite(n, d = 0) { const v = Number(n); return Number.isFinite(v) ? v : d; }

/**
 * Who is steering the ship that is not the player, in plain words, or null when the pilot has the
 * stick. Pure: reads state only. Highest authority first — one answer, never a list.
 * @returns {{ id: string, title: string, detail: string, takeover: string } | null}
 */
export function resolveFlightSteerer(state) {
  if (!state || state.mode !== 'flight' || (state.ui && state.ui.docked)) return null;
  const player = state.entities && typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  if (!player || player.alive === false) return null;
  const ap = state.nav && state.nav.autopilot;
  const berth = berthAutopilotStation(state);
  if (berth) {
    return { id: 'berth', title: 'Autopilot', detail: `to the ${stationDisplayName(berth)} berth`, takeover: 'steer to take over' };
  }
  if (ap && ap.active === true) {
    const label = typeof ap.label === 'string' && ap.label.trim() ? ap.label.trim() : 'the marker';
    return { id: 'course', title: 'Autopilot', detail: `to ${label}`, takeover: 'steer to take over' };
  }
  const hero = state.heroManeuverReadModel;
  const heroWords = hero && HERO_WORDS[hero.phase];
  if (heroWords && (hero.mode === 'pinball') === (hero.phase === 'pinball_dash')) {
    return { id: 'hero', title: heroWords.title, detail: heroWords.detail, takeover: '' };
  }
  const frame = player._flightFrame;
  if (frame && frame.orbitAssist && frame.orbitAssist.active === true) {
    return { id: 'orbit', title: 'Orbit assist', detail: 'holding the swing', takeover: 'steer to take over' };
  }
  // The corridor's capture tug names itself only while it actually pushes (its applied impulse),
  // not merely because the hull sits in the capture volume.
  const dock = state.dockingCorridor;
  if (dock && dock.assist && (dock.assist.ax || dock.assist.az) && dock.berthed !== true) {
    return { id: 'dock', title: 'Docking guide', detail: 'easing you into the berth', takeover: '' };
  }
  if (frame && frame.pursuitSlot && frame.pursuitSlot.active === true) {
    return { id: 'pursuit', title: 'Pursuit assist', detail: 'holding your firing slot', takeover: 'steer to take over' };
  }
  return null;
}

/**
 * Whether the berth offer is on screen, and for which station. Pure.
 * @param {object} state
 * @param {{ fight?: boolean, dockInRange?: boolean }} ctx
 */
export function resolveBerthOffer(state, { fight = false, dockInRange = false } = {}) {
  if (!state || state.mode !== 'flight' || (state.ui && state.ui.docked) || dockInRange) return null;
  if (state.run && state.run.kind === 'survival' && state.run.phase && state.run.phase !== 'inactive') return null;
  if (state.nav && state.nav.autopilot && state.nav.autopilot.active === true) return null;
  const offer = berthOfferStation(state);
  if (!offer) return null;
  // The nearest station is a suggestion; a fight is not the moment to suggest leaving it, and
  // neither is a timed run. A station the pilot picked is an answer to their own question and
  // stays offered.
  if (!offer.chosen && (fight || activeRaceMission(state))) return null;
  return offer;
}

const CSS = `
.sf-helm-mode { position:absolute; left:calc(22px + var(--sf-safe-inset-left, 0px)); bottom:290px; z-index:14;
  display:flex; align-items:center; gap:9px; max-width:min(420px, 46vw); padding:5px 12px 5px 9px;
  color:#fff1cf; font:600 13px/1.2 var(--visor-font, var(--dp-face-read, sans-serif)); letter-spacing:.02em;
  background:linear-gradient(90deg, rgb(10 22 30 / .9), rgb(10 22 30 / .74));
  border-left:2px solid #ecf07e; pointer-events:none; white-space:nowrap; }
.sf-helm-mode[hidden] { display:none; }
.sf-helm-mode__title { color:#ecf07e; font-weight:700; text-transform:uppercase; letter-spacing:.1em; font-size:12px; }
.sf-helm-mode__detail { overflow:hidden; text-overflow:clip; }
.sf-helm-mode__take { color:rgb(255 241 207 / .7); font-weight:500; }
.sf-helm-mode__take:empty { display:none; }
.sf-helm-offer { position:absolute; left:0; top:0; z-index:13; display:inline-flex; align-items:center; gap:9px;
  padding:6px 13px; isolation:isolate; pointer-events:none; white-space:nowrap; will-change:transform;
  color:#fff2d2; font:600 14px/1.1 var(--visor-font, var(--dp-face-read, sans-serif)); }
.sf-helm-offer[hidden] { display:none; }
.sf-helm-offer::before, .sf-helm-offer::after { content:""; position:absolute; inset:0; pointer-events:none;
  clip-path:var(--visor-chip-cut, none); }
.sf-helm-offer::before { background:#e8d3a4; z-index:-1; clip-path:var(--visor-chip-rim, none); }
.sf-helm-offer::after { background:linear-gradient(145deg,rgb(17 29 35 / .93),rgb(10 21 28 / .85)); z-index:-2; }
.sf-helm-offer kbd { display:inline-grid; place-items:center; min-width:24px; min-height:21px; padding:2px 6px;
  background:#faf0d0; color:#15202b; border-radius:3px; font:700 13px/1 var(--visor-font, sans-serif); }
.sf-helm-offer__name { color:rgb(255 242 210 / .78); font-weight:500; font-size:13px; margin-right:-5px; }
.sf-helm-offer__dist { display:inline-block; min-width:52px; color:rgb(255 242 210 / .78); font-weight:500; font-size:13px; font-variant-numeric:tabular-nums; }
.sf-helm-offer__arrow { display:inline-block; width:16px; height:9px; flex:0 0 auto; background:#ecf07e;
  clip-path:polygon(0 0, 100% 50%, 0 100%, 30% 50%); }
.sf-helm-offer__arrow[hidden] { display:none; }
.sf-helm-lane { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
.sf-helm-lane[hidden] { display:none; }
.sf-helm-lane__path { fill:none; stroke:#ecf07e; stroke-opacity:.78; stroke-width:2; stroke-dasharray:9 7; stroke-linecap:round; }
.sf-helm-lane__mouth { fill:#19262e; stroke:#ecf07e; stroke-width:1.5; }
.sf-helm-lane__berth { fill:#ecf07e; stroke:#19262e; stroke-width:1.2; }
html[data-sf-mobile-flight="1"] .sf-helm-mode { bottom:auto; top:calc(70px + var(--sf-safe-inset-top, 0px)); left:50%; transform:translateX(-50%); }
`;

function injectStyle(doc) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/**
 * Mount the helm into the flight HUD root.
 * @param {HTMLElement} root  #hud
 * @param {object} state
 * @param {{ worldToScreen?: Function, dockInRange?: () => boolean, attention?: () => string }} hooks
 */
export function createFlightHelm(root, state, hooks = {}) {
  const doc = root.ownerDocument || document;
  injectStyle(doc);

  // --- the mode chip ---
  const mode = doc.createElement('div');
  mode.className = 'sf-helm-mode';
  mode.setAttribute('role', 'status');
  mode.setAttribute('aria-live', 'polite');
  mode.hidden = true;
  const modeTitle = doc.createElement('span'); modeTitle.className = 'sf-helm-mode__title';
  const modeDetail = doc.createElement('span'); modeDetail.className = 'sf-helm-mode__detail';
  const modeTake = doc.createElement('span'); modeTake.className = 'sf-helm-mode__take';
  mode.append(modeTitle, modeDetail, modeTake);
  root.appendChild(mode);

  // --- the berth offer ---
  const offer = doc.createElement('div');
  offer.className = 'sf-helm-offer';
  offer.setAttribute('aria-hidden', 'true');
  offer.hidden = true;
  const offerKey = doc.createElement('kbd');
  const offerVerb = doc.createElement('span'); offerVerb.textContent = 'Fly to berth';
  const offerName = doc.createElement('span'); offerName.className = 'sf-helm-offer__name';
  // A pointer toward an off-screen station: a plain element rotated by transform.
  const arrow = doc.createElement('span');
  arrow.className = 'sf-helm-offer__arrow';
  arrow.setAttribute('aria-hidden', 'true');
  const offerDist = doc.createElement('span'); offerDist.className = 'sf-helm-offer__dist';
  offer.append(offerKey, offerVerb, offerName, offerDist, arrow);
  root.appendChild(offer);

  // --- the approach lane ---
  const lane = doc.createElementNS(SVG_NS, 'svg');
  lane.setAttribute('class', 'sf-helm-lane');
  lane.setAttribute('aria-hidden', 'true');
  const lanePath = doc.createElementNS(SVG_NS, 'path'); lanePath.setAttribute('class', 'sf-helm-lane__path');
  const laneMouth = doc.createElementNS(SVG_NS, 'circle'); laneMouth.setAttribute('class', 'sf-helm-lane__mouth'); laneMouth.setAttribute('r', '4');
  const laneBerth = doc.createElementNS(SVG_NS, 'circle'); laneBerth.setAttribute('class', 'sf-helm-lane__berth'); laneBerth.setAttribute('r', '4.5');
  lane.append(lanePath, laneMouth, laneBerth);
  lane.setAttribute('hidden', '');
  root.appendChild(lane);

  // Written-value caches: the DOM is touched only when a value changes.
  let modeSig = '';
  let offerText = '';
  let offerPick = null;
  let offerResolveIn = 0;
  let offerW = 0;
  let offerH = 0;
  let offerTransform = '';
  let arrowRot = '';
  let arrowShown = null;
  let laneD = '';
  let laneShown = false;
  let laneViewport = '';
  let laneResolveIn = 0;
  const laneWorld = { mouth: null, berth: { x: 0, y: 0, z: 0 } };
  const scratchWorld = { x: 0, y: 0, z: 0 };
  const sShip = { x: 0, y: 0, onScreen: false };
  const sMouth = { x: 0, y: 0, onScreen: false };
  const sBerth = { x: 0, y: 0, onScreen: false };
  const sOffer = { x: 0, y: 0, onScreen: false };

  function setHidden(el, hidden) { if (el.hidden !== hidden) el.hidden = hidden; }

  function updateMode() {
    const who = resolveFlightSteerer(state);
    const sig = who ? `${who.title}|${who.detail}|${who.takeover}` : '';
    if (sig === modeSig) return who;
    modeSig = sig;
    if (!who) { setHidden(mode, true); return who; }
    modeTitle.textContent = who.title;
    modeDetail.textContent = who.detail;
    modeTake.textContent = who.takeover ? `· ${who.takeover}` : '';
    setHidden(mode, false);
    return who;
  }

  function project(world, out) {
    const w2s = hooks.worldToScreen;
    if (typeof w2s !== 'function') return null;
    const at = w2s(world, out);
    return at && Number.isFinite(at.x) && Number.isFinite(at.y) ? at : null;
  }

  function hideOffer() { setHidden(offer, true); }

  function updateOffer(dt, w, h) {
    const fight = typeof hooks.attention === 'function' && hooks.attention() === 'fight';
    const dockInRange = typeof hooks.dockInRange === 'function' && hooks.dockInRange();
    // The pick (a station scan) resolves at ~5 Hz; the chip's placement follows every overlay tick.
    offerResolveIn -= finite(dt, 1 / 30);
    if (offerResolveIn <= 0) {
      offerResolveIn = 0.2;
      offerPick = resolveBerthOffer(state, { fight, dockInRange });
    } else if (dockInRange) offerPick = null;
    const pick = offerPick;
    if (!pick || !pick.station || pick.station.alive === false) { hideOffer(); return; }
    const station = pick.station;
    const player = state.entities.get(state.playerId);
    if (!player || !player.pos) { hideOffer(); return; }
    const dist = Math.hypot(station.pos.x - player.pos.x, station.pos.z - player.pos.z);
    const key = promptLabel('dock').replace(/^\[\s*|\s*\]$/g, '');
    // Only the key or the station's name changes the chip's width (the distance sits in a
    // fixed-width span), so the one layout read happens on a new station, not as the ship moves.
    const text = `${key}|${stationDisplayName(station)}`;
    if (text !== offerText) {
      offerText = text;
      offerKey.textContent = key;
      offerName.textContent = `${stationDisplayName(station)} ·`;
      offerW = 0; // re-measured below once, after the text write
    }
    const distText = formatDistance(dist);
    if (offerDist.textContent !== distText) offerDist.textContent = distText;
    scratchWorld.x = station.pos.x; scratchWorld.y = station.pos.y || 0; scratchWorld.z = station.pos.z;
    const at = project(scratchWorld, sOffer);
    if (!at) { hideOffer(); return; }
    setHidden(offer, false);
    if (!offerW) { offerW = offer.offsetWidth || 200; offerH = offer.offsetHeight || 32; }
    // The safe field for a world prompt: below the top chips and objective strip, above the
    // instrument band (power bar, cluster, minimap), inset from both sides.
    const top = 96;
    const bottom = h - 268;
    const left = 24;
    const right = w - 24;
    const onScreen = at.onScreen !== false && at.x >= left && at.x <= right && at.y >= top && at.y <= bottom;
    let x; let y; let rot = null;
    if (onScreen) {
      // Beside the station, never on it: to the right, else to the left.
      x = at.x + 34 + offerW <= right ? at.x + 34 : at.x - 34 - offerW;
      y = at.y - offerH - 14;
      if (y < top) y = at.y + 16;
    } else {
      // Edge of the safe field toward the station, the arrow pointing at it.
      const cx = w / 2;
      const cy = (top + bottom) / 2;
      const dx = at.x - cx;
      const dy = at.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const sx = dx === 0 ? Infinity : ((dx > 0 ? right - offerW / 2 : left + offerW / 2) - cx) / dx;
      const sy = dy === 0 ? Infinity : ((dy > 0 ? bottom - offerH / 2 : top + offerH / 2) - cy) / dy;
      const s = Math.max(0, Math.min(sx, sy));
      x = cx + dx * s - offerW / 2;
      y = cy + dy * s - offerH / 2;
      rot = `rotate(${(Math.atan2(dy / len, dx / len) * 180 / Math.PI).toFixed(0)}deg)`;
    }
    x = Math.round(Math.max(left, Math.min(right - offerW, x)));
    y = Math.round(Math.max(top, Math.min(bottom - offerH, y)));
    // The objective card (and the hold line under it) own the top-left corner: a chip that would
    // land there drops below it instead of printing over the objective.
    if (x < Math.min(380, w * 0.3) && y < 200) y = Math.min(bottom - offerH, 200);
    const t = `translate3d(${x}px,${y}px,0)`;
    if (t !== offerTransform) { offerTransform = t; offer.style.transform = t; }
    const showArrow = rot != null;
    if (showArrow !== arrowShown) { arrowShown = showArrow; if (showArrow) arrow.removeAttribute('hidden'); else arrow.setAttribute('hidden', ''); }
    if (showArrow && rot !== arrowRot) { arrowRot = rot; arrow.style.transform = rot; }
  }

  function hideLane() { if (laneShown) { laneShown = false; lane.setAttribute('hidden', ''); } }

  function resolveLane(station, player) {
    const target = resolveAutopilotTarget(state, state.nav.autopilot);
    laneWorld.mouth = target && target.dockingStage !== 'berth' && target.approachPoint
      ? { x: target.approachPoint.x, y: 0, z: target.approachPoint.z } : null;
    const manifest = resolveCollisionProxyManifest(station);
    const anchor = (manifest && resolveDockAnchor(station, manifest, player)) || station.pos;
    laneWorld.berth.x = anchor.x; laneWorld.berth.y = station.pos.y || 0; laneWorld.berth.z = anchor.z;
  }

  function updateLane(dt, w, h) {
    const station = berthAutopilotStation(state);
    const player = station && state.entities.get(state.playerId);
    if (!station || !player || !player.pos) { hideLane(); laneResolveIn = 0; return; }
    laneResolveIn -= dt;
    if (laneResolveIn <= 0) { laneResolveIn = LANE_RESOLVE_S; resolveLane(station, player); }
    const ship = project(player.pos, sShip);
    const berth = project(laneWorld.berth, sBerth);
    const mouth = laneWorld.mouth ? project(laneWorld.mouth, sMouth) : null;
    if (!ship || !berth) { hideLane(); return; }
    const vp = `0 0 ${w} ${h}`;
    if (vp !== laneViewport) { laneViewport = vp; lane.setAttribute('viewBox', vp); }
    // Start a little ahead of the ship so the lane never draws over the hull.
    const firstX = mouth ? mouth.x : berth.x;
    const firstY = mouth ? mouth.y : berth.y;
    const span = Math.hypot(firstX - ship.x, firstY - ship.y) || 1;
    const lead = Math.min(28, span * 0.4);
    const sx = ship.x + (firstX - ship.x) / span * lead;
    const sy = ship.y + (firstY - ship.y) / span * lead;
    const r = (n) => Math.round(n);
    const d = mouth
      ? `M${r(sx)} ${r(sy)}L${r(mouth.x)} ${r(mouth.y)}L${r(berth.x)} ${r(berth.y)}`
      : `M${r(sx)} ${r(sy)}L${r(berth.x)} ${r(berth.y)}`;
    if (d !== laneD) {
      laneD = d;
      lanePath.setAttribute('d', d);
      laneBerth.setAttribute('cx', r(berth.x)); laneBerth.setAttribute('cy', r(berth.y));
      if (mouth) { laneMouth.setAttribute('cx', r(mouth.x)); laneMouth.setAttribute('cy', r(mouth.y)); laneMouth.removeAttribute('display'); }
      else laneMouth.setAttribute('display', 'none');
    }
    if (!laneShown) { laneShown = true; lane.removeAttribute('hidden'); }
  }

  return {
    /** Overlay cadence: dt in seconds, w/h the viewport (already known to the caller). */
    frame(dt, w, h) {
      if (!state || state.mode !== 'flight') { setHidden(mode, true); modeSig = ''; hideOffer(); hideLane(); return; }
      updateMode();
      updateOffer(dt, w, h);
      updateLane(finite(dt, 1 / 30), w, h);
    },
    /** The viewport changed: re-measure the chip on its next show. */
    resize() { offerW = 0; laneViewport = ''; },
    destroy() { mode.remove(); offer.remove(); lane.remove(); },
  };
}
