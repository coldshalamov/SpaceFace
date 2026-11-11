// src/ui/discoveryPlate.js — Feature 20: the first-discovery plate.
//
// Canonical discovery records live in world.discovery (POIs/sites), player.uniqueWrecks.bearings
// (historic wrecks), and aceMemory (rare flagships). This module only listens to their
// first-contact receipts — discovery:plateUnlocked, uniqueWreck:bearingFixed, and
// aceMemory:transition 'encountered' — and queues a quiet receipt for the existing HUD lane.
// It writes no gameplay state; Codex records are durable before the event fires.
import { uniqueWreckById } from '../data/uniqueWrecks.js';
import { presentReceipt } from '../core/receiptPresenter.js';
import { isSwarmGlass } from './swarmGlass.js';

const QUEUE_MAX = 3;
const RECEIPT_SPACING_MS = 3500;
const QUIET_SPEED = 30;
const MOMENT_TTL_S = 4;
const MOMENT_EXIT_MS = 500;

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
  if (!bus || typeof bus.on !== 'function') return { tick() {}, push() {}, show() { return false; }, destroy() {} };
  const queue = [];
  const seen = new Set();
  let nextReceiptAt = 0;
  let destroyed = false;
  let momentEl = null;
  let momentHandle = null;
  let momentOutAt = 0;
  let momentRemoveAt = 0;

  function removeMoment() {
    if (momentHandle) { momentHandle.clear(); momentHandle = null; }
    if (momentEl && momentEl.parentNode) momentEl.parentNode.removeChild(momentEl);
    momentEl = null;
    momentOutAt = 0;
    momentRemoveAt = 0;
  }

  // A moment plate (G19-01): the same .sf-discovery-plate surface the codex plates were drawn
  // with, shown right now for rec.ttlS seconds rather than queued behind the quiet-flight gate.
  // G16-02: with a live Stage the plate rides the banner slot inside the shared frame — the
  // positioning wrapper and the in/out classes only stay on the legacy #hud seat.
  // rec = { title, lines?: string[], ttlS?: seconds }. Returns false where there is no DOM.
  function show(rec) {
    const doc = typeof document !== 'undefined' ? document : null;
    if (destroyed || !doc || typeof doc.createElement !== 'function' || !rec || !rec.title) return false;
    const stage = ctx && ctx.stage;
    const staged = stage && typeof stage.show === 'function';
    const host = staged ? null : (doc.getElementById ? (doc.getElementById('hud') || doc.body) : doc.body);
    if (!staged && (!host || typeof host.appendChild !== 'function')) return false;
    removeMoment();
    const frame = doc.createElement('div');
    frame.className = 'sf-discovery-plate__frame';
    frame.setAttribute('role', 'status');
    const title = doc.createElement('div');
    title.className = 'sf-discovery-plate__title';
    title.textContent = rec.title;
    frame.appendChild(title);
    for (const line of Array.isArray(rec.lines) ? rec.lines.slice(0, 3) : []) {
      const meta = doc.createElement('div');
      meta.className = 'sf-discovery-plate__meta';
      meta.textContent = line;
      frame.appendChild(meta);
    }
    const ttlS = Number.isFinite(rec.ttlS) && rec.ttlS > 0 ? rec.ttlS : MOMENT_TTL_S;
    if (staged) {
      momentHandle = stage.show('banner', frame, { id: 'discovery-moment', severity: 'info' });
      momentEl = frame;
      momentOutAt = performance.now() + ttlS * 1000;
      momentRemoveAt = momentOutAt;
      return true;
    }
    const el = doc.createElement('div');
    el.className = 'sf-discovery-plate';
    el.appendChild(frame);
    host.appendChild(el);
    momentEl = el;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { if (momentEl === el) el.classList.add('sf-discovery-plate--in'); });
    } else {
      el.classList.add('sf-discovery-plate--in');
    }
    momentOutAt = performance.now() + ttlS * 1000;
    momentRemoveAt = momentOutAt + MOMENT_EXIT_MS;
    return true;
  }

  function push(rec) {
    if (destroyed || !rec || !rec.title) return;
    const key = rec.key || `${rec.kicker}|${rec.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (queue.length >= QUEUE_MAX) queue.shift();
    queue.push({ ...rec, key });
  }

  // The receipt lane already yields to combat. Delay nonurgent discoveries while the
  // player is handling a line, maneuvering, or carrying significant momentum as well.
  function quietForDiscovery(state) {
    if (!state || state.mode !== 'flight' || state.ui?.docked) return false;
    const job = typeof document !== 'undefined' ? document.body?.dataset?.sfHudJob : '';
    if (job === 'fight' || job === 'hurt' || job === 'latch' || state.player?.tether?.active) return false;
    const input = state.input || {};
    if (input.boost || input.fire || input.brake || Math.abs(input.moveX || 0) > 0.1
      || Math.abs(input.moveZ || 0) > 0.1 || Math.abs(input.turnIntent || 0) > 0.1) return false;
    const player = state.entities?.get?.(state.playerId);
    const vel = player?.vel;
    return !vel || Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0) < QUIET_SPEED;
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

  const unsubs = [
    bus.on('discovery:plateUnlocked', onPlateUnlocked),
    bus.on('uniqueWreck:bearingFixed', onWreckFixed),
    bus.on('aceMemory:transition', onAceTransition),
  ];

  return {
    push,
    show,
    tick() {
      const now = performance.now();
      if (momentEl) {
        if (momentHandle) {
          if (now >= momentOutAt) removeMoment();
        } else if (now >= momentRemoveAt) removeMoment();
        else if (now >= momentOutAt) {
          momentEl.classList.remove('sf-discovery-plate--in');
          momentEl.classList.add('sf-discovery-plate--out');
          momentOutAt = Infinity;
        }
      }
      // Swarm glass (design/program/finish/swarm S2): no codex/discovery plates during a round.
      if (destroyed || !queue.length || isSwarmGlass(getState()) || !quietForDiscovery(getState())) return;
      if (now < nextReceiptAt) return;
      const rec = queue[0];
      const text = `Discovery: ${rec.title} · saved to Codex`;
      if (presentReceipt({ text, kind: 'info', source: 'discovery', channel: 'discovery', ttl: 4, silent: true })) {
        queue.shift();
        nextReceiptAt = now + RECEIPT_SPACING_MS;
      }
    },
    destroy() {
      destroyed = true;
      for (const off of unsubs) if (typeof off === 'function') off();
      queue.length = 0;
      removeMoment();
    },
  };
}
