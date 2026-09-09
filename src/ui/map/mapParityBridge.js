// Shared semantic-key and active-objective bridge for the unified navigation chart.
//
// The chart keeps its high-information survey-table composition. This module establishes visual
// parity with the flight radar in two places:
//   1. the inspector teaches the same five identities;
//   2. the chart's live objective receives the same four-corner destination bracket.
//
// The objective overlay reads the chart's already-resolved click target; it does not duplicate map
// projection or route state. It runs only while the cached chart screen is visible and sleeps when
// the screen is hidden. Roots are remount-safe: replacing a cached root's innerHTML reinstalls both
// the key and overlay instead of trusting a process-global "installed" bit.

import { MAP_LEGEND_ORDER, symbolDescriptor } from './tacticalMapGrammar.js';

const STYLE_ID = 'sf-map-parity-bridge-style';
const rootStates = new WeakMap();
let observer = null;
let observerDocument = null;
let registrations = 0;

const GLYPH_SVG = Object.freeze({
  player: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12 12 5 4 8.4 7.5 12 4 15.6 12 19Z"/><path class="ink" d="m21 12-5-2v4Z"/></svg>',
  objective: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="open" d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/><path d="m12 7 5 5-5 5-5-5Z"/></svg>',
  hostile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="open" d="m12 3 7 15-7-4-7 4Z"/><circle class="open" cx="12" cy="12" r="9"/></svg>',
  station: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 4 12 0 5 8-5 8H6l-5-8Z"/><rect class="ink" x="9" y="9" width="6" height="6"/></svg>',
  gate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="open" cx="12" cy="12" r="9"/><circle class="open" cx="12" cy="12" r="4"/><path class="open" d="M8 2v4m8-4v4M8 18v4m8-4v4"/></svg>',
});

export function mapParityLegendModel() {
  return MAP_LEGEND_ORDER.map((kind) => Object.freeze({
    ...symbolDescriptor(kind),
    svg: GLYPH_SVG[kind],
  }));
}

function liveStateFor(root) {
  const state = rootStates.get(root);
  if (!state) return null;
  if (!state.key || !state.key.isConnected || !state.overlay || !state.overlay.isConnected) {
    state.dispose();
    rootStates.delete(root);
    return null;
  }
  return state;
}

export function enhanceMapParityRoot(root) {
  if (!root || typeof document === 'undefined') return false;
  if (liveStateFor(root)) return true;

  const inspector = root.querySelector && (
    root.querySelector('.gm-right-inspector')
    || root.querySelector('.gm-left-rail')
  );
  const viewport = root.querySelector && root.querySelector('.gm-viewport');
  const canvas = root.querySelector && root.querySelector('.gm-viewport canvas, canvas');
  if (!inspector || !viewport || !canvas) return false;

  const key = root.querySelector('[data-map-parity-key="v2"]') || createLegendKey(document);
  if (!key.isConnected) inspector.appendChild(key);

  const overlay = createObjectiveOverlay(document);
  viewport.appendChild(overlay);

  const state = createRootState(root, key, overlay, viewport, canvas);
  rootStates.set(root, state);
  state.startIfVisible();

  const existingLabel = canvas.getAttribute('aria-label');
  const parityLabel = 'Player hull, objective brackets, hostile chevrons, stations, and gates match the flight radar symbol key.';
  if (!existingLabel || !existingLabel.includes(parityLabel)) {
    canvas.setAttribute(
      'aria-label',
      existingLabel ? `${existingLabel} ${parityLabel}` : `Navigation chart. ${parityLabel}`,
    );
  }
  root.dataset.semanticMapGrammar = 'v2';
  return true;
}

function createLegendKey(documentRef) {
  const section = documentRef.createElement('section');
  section.className = 'gm-parity-key';
  section.dataset.mapParityKey = 'v2';
  section.setAttribute('aria-label', 'Navigation symbol key shared with the flight radar');
  section.innerHTML = [
    '<div class="gm-parity-key__title">SYMBOL KEY / FLIGHT PARITY</div>',
    '<div class="gm-parity-key__grid">',
    ...mapParityLegendModel().map((item) => (
      `<span class="gm-parity-key__item" data-kind="${item.id}" title="${item.label}: ${item.channel}">`
        + `<span class="gm-parity-key__glyph">${item.svg}</span>`
        + `<span class="gm-parity-key__label">${item.label}</span>`
        + '</span>'
    )),
    '</div>',
  ].join('');
  return section;
}

function createObjectiveOverlay(documentRef) {
  const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('gm-parity-overlay');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = `
    <g class="gm-parity-overlay__objective" visibility="hidden">
      <path d="M-13-6V-13H-6 M6-13H13V-6 M13 6V13H6 M-6 13H-13V6"></path>
    </g>`;
  return svg;
}

function createRootState(root, key, overlay, viewport, canvas) {
  const screen = root.closest && root.closest('.screen');
  const visibilityOwner = screen || root;
  const objective = overlay.querySelector('.gm-parity-overlay__objective');
  let frame = 0;
  let disposed = false;
  let screenModule = null;
  let modulePending = false;

  const isVisible = () => {
    if (!root.isConnected || !overlay.isConnected) return false;
    if (visibilityOwner.hidden || visibilityOwner.inert) return false;
    if (visibilityOwner.getAttribute && visibilityOwner.getAttribute('aria-hidden') === 'true') return false;
    return !(visibilityOwner.style && visibilityOwner.style.display === 'none');
  };

  const ensureModule = () => {
    if (screenModule || modulePending) return;
    modulePending = true;
    import('../galaxyMap.js')
      .then((mod) => { screenModule = mod && mod.galaxyMapScreen; })
      .catch(() => { screenModule = null; })
      .finally(() => { modulePending = false; });
  };

  const hideObjective = () => {
    if (objective) objective.setAttribute('visibility', 'hidden');
  };

  const draw = () => {
    frame = 0;
    if (disposed || !isVisible()) {
      hideObjective();
      return;
    }

    ensureModule();
    const width = Math.max(1, Number(canvas.clientWidth) || Number(viewport.clientWidth) || 1);
    const height = Math.max(1, Number(canvas.clientHeight) || Number(viewport.clientHeight) || 1);
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const targets = screenModule && Array.isArray(screenModule._clickTargets)
      ? screenModule._clickTargets
      : [];
    // `active-waypoint` is the chart's canonical target. The fallbacks retain compatibility with
    // older map payloads without allowing an unrelated objective-like marker earlier in the target
    // array to steal the bracket.
    const active = targets.find((target) => target && target.id === 'active-waypoint')
      || targets.find((target) => target && target.markerKind === 'mission-objective')
      || targets.find((target) => target && target.objective === true);
    const x = active && Number(active.sx);
    const y = active && Number(active.sy);
    const onCanvas = Number.isFinite(x) && Number.isFinite(y)
      && x >= 0 && x <= width && y >= 0 && y <= height;
    if (objective && onCanvas) {
      objective.setAttribute('transform', `translate(${x} ${y})`);
      objective.setAttribute('visibility', 'visible');
    } else {
      // Off-canvas destinations already own the chart's edge-tick affordance. Do not draw a second
      // clipped bracket at an invented coordinate.
      hideObjective();
    }
    frame = requestAnimationFrame(draw);
  };

  const startIfVisible = () => {
    if (disposed || frame || !isVisible()) return;
    frame = requestAnimationFrame(draw);
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    hideObjective();
  };

  const visibilityObserver = typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver(() => {
      if (isVisible()) startIfVisible();
      else stop();
    });
  if (visibilityObserver) {
    visibilityObserver.observe(visibilityOwner, {
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'inert', 'aria-hidden'],
    });
  }

  return {
    key,
    overlay,
    startIfVisible,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      if (visibilityObserver) visibilityObserver.disconnect();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
  };
}

function enhanceCurrentRoot(documentRef) {
  const root = documentRef && documentRef.getElementById
    ? documentRef.getElementById('sf-galaxymap')
    : null;
  return enhanceMapParityRoot(root);
}

export function installMapParityBridge() {
  if (typeof document === 'undefined') return () => {};
  const documentRef = document;
  registrations += 1;
  injectStyle(documentRef);
  enhanceCurrentRoot(documentRef);

  if (
    typeof MutationObserver !== 'undefined'
    && (!observer || observerDocument !== documentRef)
  ) {
    if (observer) observer.disconnect();
    observerDocument = documentRef;
    observer = new MutationObserver(() => {
      enhanceCurrentRoot(documentRef);
    });
    observer.observe(documentRef.body || documentRef.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    registrations = Math.max(0, registrations - 1);
    if (registrations === 0 && observer) {
      observer.disconnect();
      observer = null;
      observerDocument = null;
    }
  };
}

function injectStyle(documentRef) {
  if (documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#sf-galaxymap .gm-parity-key {
  flex:0 0 auto;
  width:100%;
  box-sizing:border-box;
  margin-top:auto;
  padding:10px 0 0;
  border-top:1px solid rgba(190,178,152,.24);
  color:var(--ink-dim,#b3afa2);
  font-family:var(--mf-ui,"IBM Plex Sans","Segoe UI",system-ui,sans-serif);
}
#sf-galaxymap .gm-parity-key__title {
  margin-bottom:8px;
  color:var(--ink-mute,#8a877d);
  font-family:var(--mf-mono,"IBM Plex Mono",ui-monospace,monospace);
  font-size:12px;
  font-weight:700;
  letter-spacing:.06em;
}
#sf-galaxymap .gm-parity-key__grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:8px 10px;
}
#sf-galaxymap .gm-parity-key__item {
  display:flex;
  align-items:center;
  min-width:0;
  gap:7px;
  font-size:12px;
  line-height:1.25;
  letter-spacing:.035em;
  white-space:nowrap;
}
#sf-galaxymap .gm-parity-key__label {
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
}
#sf-galaxymap .gm-parity-key__glyph {
  width:20px;
  height:20px;
  flex:0 0 20px;
}
#sf-galaxymap .gm-parity-key__glyph svg {
  width:100%;
  height:100%;
  overflow:visible;
}
#sf-galaxymap .gm-parity-key__glyph path,
#sf-galaxymap .gm-parity-key__glyph circle,
#sf-galaxymap .gm-parity-key__glyph rect {
  fill:currentColor;
  stroke:currentColor;
  stroke-width:1.7;
  stroke-linejoin:round;
}
#sf-galaxymap .gm-parity-key__glyph .open { fill:none; }
#sf-galaxymap .gm-parity-key__glyph .ink { fill:#f4f0e6; stroke:none; }
#sf-galaxymap .gm-parity-key__item[data-kind="player"] { color:#63f3ff; }
#sf-galaxymap .gm-parity-key__item[data-kind="objective"] { color:#ffc064; }
#sf-galaxymap .gm-parity-key__item[data-kind="hostile"] { color:#ff6673; }
#sf-galaxymap .gm-parity-key__item[data-kind="station"] { color:#63d8ff; }
#sf-galaxymap .gm-parity-key__item[data-kind="gate"] { color:#c7a9ff; }
#sf-galaxymap .gm-viewport { position:relative; }
#sf-galaxymap .gm-parity-overlay {
  position:absolute;
  inset:0;
  z-index:4;
  width:100%;
  height:100%;
  overflow:hidden;
  pointer-events:none;
}
#sf-galaxymap .gm-parity-overlay__objective {
  fill:none;
  stroke:#ffc064;
  stroke-width:2;
  stroke-linecap:square;
  stroke-linejoin:miter;
  vector-effect:non-scaling-stroke;
}
#sf-galaxymap[data-layout="narrow"] .gm-parity-key {
  margin-top:0;
  padding-top:8px;
}
#sf-galaxymap[data-layout="narrow"] .gm-parity-key__title { margin-bottom:6px; }
#sf-galaxymap[data-layout="narrow"] .gm-parity-key__grid { gap:6px 12px; }
`;
  documentRef.head.appendChild(style);
}
