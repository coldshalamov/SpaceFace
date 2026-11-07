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
  if (!bus || typeof bus.on !== 'function') return { tick() {}, push() {}, destroy() {} };
  const queue = [];
  const seen = new Set();
  let nextReceiptAt = 0;
  let destroyed = false;

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
    tick() {
      // Swarm glass (design/program/finish/swarm S2): no codex/discovery plates during a round.
      if (destroyed || !queue.length || isSwarmGlass(getState()) || !quietForDiscovery(getState())) return;
      const now = performance.now();
      if (now < nextReceiptAt) return;
      const rec = queue[0];
      if (presentReceipt({ text: `Discovery: ${rec.title} · saved to Codex`, kind: 'info', ttl: 4, silent: true })) {
        queue.shift();
        nextReceiptAt = now + RECEIPT_SPACING_MS;
      }
    },
    destroy() {
      destroyed = true;
      for (const off of unsubs) if (typeof off === 'function') off();
      queue.length = 0;
    },
  };
}
