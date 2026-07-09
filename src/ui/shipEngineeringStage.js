// src/ui/shipEngineeringStage.js — premium 3D engineering stage used by Shipyard & Outfitting.
// Wraps shipPreviewMount with a DOM/SVG overlay for power-flow beams, hardpoint pings, gauges,
// and ghost-module previews. View-only; emits no sim mutations.
//
// Layout: a framed canvas stage with an absolute effect overlay (beams, pings) and a gauge rack.
// All effects come from src/ui/effects/* and obey the same setActive/dispose contract.
import { createShipPreviewMount } from './shipPreviewMount.js';
import { createRouteBeam, createRippleField, createCircularGauge } from './effects/index.js';
import { SHIPS } from '../data/ships.js';
import { buildSlotList } from '../systems/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

const SLOT_KIND = {
  weapon: 'danger',
  shield: 'shield',
  engine: 'warn',
  cargo: 'cargo',
  mining: 'good',
  utility: 'accent-3',
};

const GAUGE_DEFS = [
  { key: 'mass', label: 'Mass', kind: 'warn', suffix: 't' },
  { key: 'capMax', label: 'Energy', kind: 'energy', suffix: '' },
  { key: 'shieldMax', label: 'Shield', kind: 'shield', suffix: '' },
  { key: 'cargoCap', label: 'Cargo', kind: 'cargo', suffix: 'u' },
  { key: 'maxSpeed', label: 'Thrust', kind: 'accent', suffix: '' },
  { key: 'continuousDrain', label: 'Heat', kind: 'heat', suffix: '' },
];

function fmt(n) { return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—'; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Map a ship slot (from buildSlotList) to an approximate local-space anchor on the hull so the
 * overlay can draw power beams / pings to it. Falls back to a polar ring for slots without authored
 * mount points so every system gets a visible node.
 */
function slotLocalAnchor(shipDef, slot, typeIndex, totalOfType) {
  const visuals = shipDef && shipDef.visuals;
  if (slot.type === 'weapon' && visuals && visuals.hardpoints && visuals.hardpoints[typeIndex]) {
    const p = visuals.hardpoints[typeIndex].pos;
    return { x: p[0] || 0, y: p[1] || 0, z: p[2] || 0 };
  }
  if (slot.type === 'engine' && visuals && visuals.engineMounts && visuals.engineMounts[typeIndex]) {
    const p = visuals.engineMounts[typeIndex].pos;
    return { x: p[0] || 0, y: p[1] || 0, z: p[2] || 0 };
  }
  // Polar fallback ring: distribute non-weapon/engine slots around the midship.
  const R = 0.55;
  const ang = (typeIndex / Math.max(1, totalOfType)) * Math.PI * 2 + Math.PI * 0.25;
  return { x: Math.cos(ang) * 0.1, y: 0.12, z: Math.sin(ang) * R };
}

/**
 * Create an engineering stage.
 * @param {HTMLElement} container — parent element to build into
 * @param {object} opts
 * @param {object} [opts.envMap] — scene envMap for chrome hulls
 * @param {string} [opts.dockId] — dock interior part id
 * @param {()=>void} [opts.onReady] — called when first ship frame renders
 */
export function createShipEngineeringStage(container, opts = {}) {
  const stage = document.createElement('div');
  stage.className = 'st-eng-stage';
  stage.innerHTML = `
    <div class="st-eng-stage__frame">
      <canvas class="st-eng-stage__canvas" aria-label="Ship preview"></canvas>
      <div class="st-eng-stage__overlay" aria-hidden="true"></div>
      <div class="st-eng-stage__gauges" aria-hidden="true"></div>
      <div class="st-eng-stage__loading" aria-live="polite">
        <span class="st-eng-stage__spinner" aria-hidden="true"></span>
      </div>
    </div>
    <div class="st-eng-stage__label"></div>
  `;
  container.appendChild(stage);

  const frame = stage.querySelector('.st-eng-stage__frame');
  const canvas = stage.querySelector('.st-eng-stage__canvas');
  const overlay = stage.querySelector('.st-eng-stage__overlay');
  const gaugeWrap = stage.querySelector('.st-eng-stage__gauges');
  const labelEl = stage.querySelector('.st-eng-stage__label');

  const preview = createShipPreviewMount(canvas, {
    envMap: opts.envMap,
    dockId: opts.dockId,
    authoredWarmup: false,
    fastPreview: true,
    onFirstFrame: () => {
      stage.classList.add('is-ready');
      stage.classList.remove('is-loading');
      if (typeof opts.onReady === 'function') opts.onReady();
      syncBeams();
    },
  });

  // Effect layer instances (lazy or immediate).
  const beam = createRouteBeam(overlay, { width: 400, height: 300 });
  const ping = createRippleField(overlay, { width: 400, height: 300 });
  const gauges = {};
  for (const g of GAUGE_DEFS) {
    const mount = document.createElement('div');
    mount.className = 'st-eng-gauge st-eng-gauge--' + g.key;
    mount.title = g.label;
    gaugeWrap.appendChild(mount);
    gauges[g.key] = createCircularGauge(mount, { size: 48, stroke: 4, kind: g.kind });
  }

  let currentDefId = null;
  let currentSlots = [];
  let currentTypeIndices = [];
  let beamSpec = [];          // [{slotIndex, kind, active}]
  let highlightedSlot = null; // slotIndex

  function overlayRect() { return overlay.getBoundingClientRect(); }

  function projectSlot(slotIndex) {
    const shipDef = SHIP_BY_ID.get(currentDefId);
    if (!shipDef || !preview) return null;
    const slot = currentSlots[slotIndex];
    if (!slot) return null;
    const anchor = slotLocalAnchor(shipDef, slot, currentTypeIndices[slotIndex], typeCount(slot.type));
    const client = preview.projectLocalPoint(anchor);
    if (!client) return null;
    const r = overlayRect();
    return { x: client.x - r.left, y: client.y - r.top };
  }

  function typeCount(type) {
    return currentSlots.filter((s) => s.type === type).length;
  }

  function reactorPoint() {
    const r = overlayRect();
    return { x: r.width * 0.5, y: r.height * 0.62 };
  }

  function syncBeams() {
    const reactor = reactorPoint();
    if (!beamSpec.length) {
      beam.setPath([], { active: false });
      return;
    }
    // Build polyline segments reactor -> each active hardpoint. We draw them as one polyline per
    // hardpoint so routeBeam can animate each dash independently.
    const pts = [];
    for (const spec of beamSpec) {
      const p = projectSlot(spec.slotIndex);
      if (!p) continue;
      pts.push({ from: reactor, to: p, kind: spec.kind, active: spec.active });
    }
    if (!pts.length) {
      beam.setPath([], { active: false });
      return;
    }
    // Average endpoints into one polyline for the beam primitive; color by the dominant kind.
    const dominant = pts[0].kind;
    const poly = [reactor];
    for (const p of pts) poly.push(p.to);
    beam.setPath(poly, { active: true, kind: dominant });
  }

  function syncPing() {
    if (highlightedSlot == null) return;
    const p = projectSlot(highlightedSlot);
    if (!p) return;
    const kind = currentSlots[highlightedSlot] && SLOT_KIND[currentSlots[highlightedSlot].type];
    ping.ping(p.x, p.y, { kind: kind || 'accent', radius: 38, ttl: 420 });
  }

  function setShip(defId) {
    if (defId === currentDefId && preview.getDefId() === defId) return;
    currentDefId = defId;
    const shipDef = SHIP_BY_ID.get(defId);
    currentSlots = shipDef ? buildSlotList(shipDef) : [];
    // Compute per-slot type index for authored mount lookup.
    const counts = {};
    currentTypeIndices = currentSlots.map((s) => { counts[s.type] = (counts[s.type] || 0) + 1; return counts[s.type] - 1; });
    stage.classList.remove('is-ready');
    stage.classList.add('is-loading');
    highlightedSlot = null;
    preview.show(defId, { rotating: false });
    if (preview.getDefId() === defId) {
      stage.classList.add('is-ready');
      stage.classList.remove('is-loading');
      syncBeams();
    }
    labelEl.textContent = shipDef ? shipDef.name : '';
  }

  /**
   * @param {Array<{slotIndex:number, kind?:string, active?:boolean}>} specs
   */
  function setPowerFlow(specs) {
    beamSpec = Array.isArray(specs) ? specs.slice() : [];
    syncBeams();
  }

  function setHighlightSlot(slotIndex) {
    highlightedSlot = slotIndex;
    syncPing();
  }

  function setGauges(stats = {}) {
    for (const g of GAUGE_DEFS) {
      const raw = stats[g.key];
      let v = 0;
      if (g.key === 'mass') {
        // mass gauge: fraction of a generous cap (250t) so capitals don't clip.
        v = clamp01((raw || 0) / 250);
      } else if (g.key === 'capMax') {
        // energy cap vs 600 reference.
        v = clamp01((raw || 0) / 600);
      } else if (g.key === 'shieldMax') {
        v = clamp01((raw || 0) / 800);
      } else if (g.key === 'cargoCap') {
        v = clamp01((raw || 0) / 400);
      } else if (g.key === 'maxSpeed') {
        v = clamp01((raw || 0) / 350);
      } else if (g.key === 'continuousDrain') {
        // heat / drain: relative to regen. >1 means unsustainable (amber/red handled by caller color).
        const regen = stats.capRegen || 1;
        v = clamp01((raw || 0) / Math.max(1, regen * 1.5));
      }
      gauges[g.key].setValue(v, { kind: g.kind, label: `${g.label}: ${fmt(raw)}${g.suffix}` });
    }
  }

  function setLabel(html) {
    labelEl.innerHTML = html || '';
  }

  function setActive(on) {
    const active = !!on;
    preview.setActive(active);
    beam.setActive(active);
    ping.setActive(active);
    for (const k in gauges) gauges[k].setActive(active);
  }

  function resize() {
    preview.resize();
    const r = frame.getBoundingClientRect();
    beam.resize(r.width, r.height);
    ping.resize(r.width, r.height);
    syncBeams();
  }

  function dispose() {
    beam.dispose();
    ping.dispose();
    for (const k in gauges) gauges[k].dispose();
    preview.dispose();
    if (stage.parentNode) stage.parentNode.removeChild(stage);
  }

  return {
    el: stage,
    setShip,
    setPowerFlow,
    setHighlightSlot,
    setGauges,
    setLabel,
    setActive,
    resize,
    dispose,
    get defId() { return currentDefId; },
  };
}
