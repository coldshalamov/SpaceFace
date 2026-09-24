// src/ui/discoveryPlate.js — Feature 20: the first-discovery plate.
//
// Canonical discovery records live in world.discovery (POIs/sites), player.uniqueWrecks.bearings
// (historic wrecks), and aceMemory (rare flagships). This module only listens to their
// first-contact receipts — discovery:plateUnlocked, uniqueWreck:bearingFixed, and
// aceMemory:transition 'encountered' — and slides a 3 s glass plate in from the HUD edge.
// It writes no gameplay state; "tucks into the Codex" is already true because the records are
// durable before the event fires.
import { uniqueWreckById } from '../data/uniqueWrecks.js';

const PLATE_TTL_MS = 3000;
const PLATE_FADE_MS = 320;
const QUEUE_MAX = 3;

function humanizeId(value) {
  const s = String(value || '').replace(/[_:.-]+/g, ' ').trim();
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unknown Contact';
}

function sectorOf(state, sectorId) {
  const sectors = state && state.world && state.world.sectors;
  return (sectors && sectors[sectorId]) || null;
}

export function createDiscoveryPlate(ctx) {
  const bus = ctx && ctx.bus;
  const getState = typeof ctx === 'object' && ctx && ctx.state !== undefined
    ? () => ctx.state
    : (typeof ctx === 'function' ? ctx : () => null);
  if (!bus || typeof bus.on !== 'function' || typeof document === 'undefined') {
    return { tick() {}, push() {}, destroy() {} };
  }

  const el = document.createElement('div');
  el.className = 'sf-discovery-plate';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.display = 'none';
  el.innerHTML =
    '<div class="sf-discovery-plate__frame">'
    + '<div class="sf-discovery-plate__kicker"></div>'
    + '<div class="sf-discovery-plate__title"></div>'
    + '<div class="sf-discovery-plate__meta"></div>'
    + '</div>';
  const kickerEl = el.querySelector('.sf-discovery-plate__kicker');
  const titleEl = el.querySelector('.sf-discovery-plate__title');
  const metaEl = el.querySelector('.sf-discovery-plate__meta');

  const queue = [];
  const seen = new Set();
  let active = null; // { born, ttl, leaving }
  let unsubs = null;

  function ensureConnected() {
    if (el.isConnected) return;
    const host = document.getElementById('hud') || document.body;
    if (host) host.appendChild(el);
  }

  function show(rec, now) {
    ensureConnected();
    kickerEl.textContent = rec.kicker;
    titleEl.textContent = rec.title;
    metaEl.textContent = rec.meta || '';
    el.style.display = 'block';
    el.classList.remove('sf-discovery-plate--out');
    // Next frame so the slide-in transition actually plays from the parked transform.
    requestAnimationFrame(() => el.classList.add('sf-discovery-plate--in'));
    active = { born: now, ttl: PLATE_TTL_MS, leaving: false, key: rec.key };
  }

  function push(rec) {
    if (!rec || !rec.title) return;
    const key = rec.key || `${rec.kicker}|${rec.title}`;
    if (seen.has(key)) return;
    if (active && active.key === key) return;
    if (queue.length >= QUEUE_MAX) queue.shift();
    seen.add(key);
    queue.push({ ...rec, key });
  }

  function resolvePoiPlate(p) {
    const state = getState();
    const sectorId = p.sectorId;
    const poiId = p.poiId;
    const sector = sectorOf(state, sectorId);
    const poi = sector && Array.isArray(sector.pois)
      ? sector.pois.find((row) => row && row.id === poiId)
      : null;
    let title = poi && poi.discoveryPlate && typeof poi.discoveryPlate.title === 'string'
      ? poi.discoveryPlate.title.trim()
      : null;
    if (!title && poi && poi.name) title = poi.name;
    if (!title) {
      const rec = state && state.world && state.world.discovery
        && state.world.discovery[sectorId] && state.world.discovery[sectorId].pois
        && state.world.discovery[sectorId].pois[poiId];
      title = (rec && rec.name) || humanizeId(poiId);
    }
    const type = String((poi && poi.type) || p.type || 'site').toUpperCase();
    const sectorName = sector && sector.name ? sector.name : humanizeId(sectorId);
    return {
      key: `poi:${sectorId}:${poiId}`,
      kicker: 'NEW CODEX ENTRY — DISCOVERY',
      title,
      meta: `${sectorName} · ${type}`,
    };
  }

  function onPlateUnlocked(p) {
    if (!p || p.poiId == null) return;
    push(resolvePoiPlate(p));
  }

  function onWreckFixed(p) {
    if (!p || p.wreckId == null) return;
    const def = uniqueWreckById(p.wreckId);
    const sector = sectorOf(getState(), p.sectorId);
    push({
      key: `wreck:${p.wreckId}`,
      kicker: 'HISTORIC WRECK LOCATED',
      title: (def && def.name) || humanizeId(p.wreckId),
      meta: `${sector && sector.name ? sector.name : humanizeId(p.sectorId)} · UNIQUE WRECK`,
    });
  }

  function onAceTransition(p) {
    if (!p || p.transition !== 'encountered') return;
    push({
      key: `ace:${p.aceId || p.aceName}`,
      kicker: 'FLAGSHIP CONTACT',
      title: p.aceName || 'Rare signature',
      meta: 'Rare faction flagship identified · Codex recorded',
    });
  }

  unsubs = [
    bus.on('discovery:plateUnlocked', onPlateUnlocked),
    bus.on('uniqueWreck:bearingFixed', onWreckFixed),
    bus.on('aceMemory:transition', onAceTransition),
  ];

  return {
    push,
    tick() {
      if (!active && !queue.length) return;
      const now = performance.now();
      if (!active) { show(queue.shift(), now); return; }
      const age = now - active.born;
      if (!active.leaving && age >= active.ttl) {
        active.leaving = true;
        el.classList.remove('sf-discovery-plate--in');
        el.classList.add('sf-discovery-plate--out');
      }
      if (age >= active.ttl + PLATE_FADE_MS) {
        el.style.display = 'none';
        el.classList.remove('sf-discovery-plate--in', 'sf-discovery-plate--out');
        active = null;
      }
    },
    destroy() {
      if (unsubs) for (const off of unsubs) { if (typeof off === 'function') off(); }
      unsubs = null;
      queue.length = 0;
      active = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
