import { OUTFITS, SALVAGE_PIECES, SALVAGE_SITUATIONS, SALVAGE_OUTFITS_LIMITS as L,
  bodyKey, crewKey, situation, SALVAGE_YARDS, distrustsPlayer } from './catalog.js';

const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (n, fallback = 0, max = 1e7) => Number.isFinite(n) ? Math.max(-max, Math.min(max, n)) : fallback;
const positive = (n, max = 1e9) => Math.max(0, finite(n, 0, max));
const integer = (n, max = 1e9) => Math.trunc(positive(n, max));
const point = (p, fallback = { x: 0, z: 0 }) => ({ x: finite(p?.x, fallback.x), z: finite(p?.z, fallback.z) });
const safeId = (value, max = 120) => typeof value === 'string' && value.length <= max
  && /^[\w:./-]+$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value) ? value : null;
const bodyStates = new Set(['live', 'delivered', 'salvaged', 'destroyed']);
const crewStates = new Set(['approach', 'tow', 'stalled', 'idle', 'departing', 'departed', 'destroyed']);
const claims = new Set(['keel', 'latch', 'player']);

export function freshSalvageOutfits() {
  return { schema: 1, meetings: {}, memory: Object.fromEntries(OUTFITS.map(c => [c.id,
    { helped: 0, kept: 0, cheated: 0, lastEvent: null, events: [] }])) };
}

export function makeSalvageMeeting({ id, sectorId, anchor, variant, now = 0, memory }) {
  const shape = situation(variant), origin = point(anchor);
  const meeting = { id, sectorId, stationId: SALVAGE_YARDS[sectorId] || 'station_ceres',
    anchor: origin, receiver: { x: origin.x + 450, z: origin.z },
    variant: shape.id, title: shape.title, status: 'working', createdAt: now,
    revision: 0, offer: null, agreement: null, receipts: {}, heardReturn: false,
    bodies: Object.fromEntries(SALVAGE_PIECES.map(p => [p.id, {
      id: p.id, key: bodyKey(id, p.id), label: p.label, status: 'live',
      claim: p.id === 'core' ? shape.coreClaim : p.id === shape.latchTarget ? 'latch' : null,
      pos: { x: origin.x + p.offset.x, z: origin.z + p.offset.z }, vel: { x: 0, z: 0 },
      rot: p.id === 'frame' ? 0.7 : -0.2, angVel: 0, hull: p.hull,
      pool: { ...p.pool }, entityId: null, deliveredBy: null, minedByPlayer: 0, claimUntil: null,
    }])),
    crews: Object.fromEntries(OUTFITS.map(c => [c.id, {
      id: c.id, key: crewKey(id, c.id), entityId: null, jobId: null, status: 'approach',
      targetId: c.id === 'keel' ? 'core' : shape.latchTarget,
      pos: { x: origin.x + c.offset.x, z: origin.z + c.offset.z }, vel: { x: 0, z: 0 },
      rot: 0, angVel: 0, hull: c.id === 'keel' ? 260 : 130,
      startsAt: now + (c.id === 'keel' ? shape.keelDelay : 0),
      towSeconds: 0, overcommitted: false, stalls: 0, lastRequestAt: -10,
      // Trust changes decisions, not just text: a helped cutter leaves the light crate alone.
      favorsPlayer: !distrustsPlayer(memory?.[c.id]) && (memory?.[c.id]?.helped || 0) > (memory?.[c.id]?.cheated || 0),
      cautious: distrustsPlayer(memory?.[c.id]),
    }])),
  };
  if (meeting.crews.latch.favorsPlayer) {
    meeting.bodies.cache.claim = 'player';
    if (meeting.crews.latch.targetId === 'cache') {
      meeting.crews.latch.targetId = 'frame'; meeting.bodies.frame.claim = 'latch';
    }
  }
  if (meeting.crews.latch.cautious) {
    meeting.crews.latch.targetId = 'cache'; meeting.bodies.cache.claim = 'latch';
    meeting.bodies.core.claim = 'keel'; meeting.crews.latch.pos.x += 120;
  }
  return meeting;
}

/** Whitelist restore. Entity IDs are runtime-only; stable keys reconstruct/adopt originals. */
export function normalizeSalvageOutfits(raw) {
  const out = freshSalvageOutfits();
  if (!plain(raw) || raw.schema !== 1) return out;
  for (const crew of OUTFITS) {
    const src = raw.memory?.[crew.id];
    if (!plain(src)) continue;
    const mem = out.memory[crew.id];
    for (const k of ['helped', 'kept', 'cheated']) mem[k] = integer(src[k], 100000);
    mem.events = (Array.isArray(src.events) ? src.events : []).filter(e => plain(e)
      && safeId(e.id, 240) && safeId(e.meetingId) && ['helped', 'kept', 'cheated'].includes(e.kind))
      .slice(-L.memoryEvents).map(e => ({ id: e.id, meetingId: e.meetingId, kind: e.kind,
        cause: ['player_damage', 'promise_broken', 'split_kept', 'cooperate', 'rescue'].includes(e.cause) ? e.cause : e.kind,
        at: positive(e.at) }));
    mem.lastEvent = mem.events.length ? mem.events[mem.events.length - 1] : null;
  }
  if (!plain(raw.meetings)) return out;
  for (const [id, src] of Object.entries(raw.meetings).slice(0, L.meetings)) {
    if (!safeId(id) || !plain(src) || src.id !== id || !safeId(src.sectorId) || !SALVAGE_YARDS[src.sectorId]
      || !SALVAGE_SITUATIONS.some(s => s.id === src.variant)) continue;
    const m = makeSalvageMeeting({ id, sectorId: src.sectorId, anchor: src.anchor,
      variant: src.variant, now: positive(src.createdAt), memory: out.memory });
    m.receiver = point(src.receiver, m.receiver); m.revision = integer(src.revision);
    m.heardReturn = src.heardReturn === true;
    for (const def of SALVAGE_PIECES) {
      const b = src.bodies?.[def.id], row = m.bodies[def.id];
      // Missing or mismatched body records fail closed; they never refill a source.
      if (!plain(b) || b.key !== row.key || !bodyStates.has(b.status)) { row.status = 'destroyed'; row.pool = {}; continue; }
      row.status = b.status; row.claim = claims.has(b.claim) ? b.claim : null;
      row.pos = point(b.pos, row.pos); row.vel = point(b.vel); row.rot = finite(b.rot);
      row.angVel = finite(b.angVel, 0, 20); row.hull = positive(b.hull, def.hull);
      row.pool = Object.fromEntries(Object.entries(def.pool).map(([key, qty]) => [key, integer(b.pool?.[key], qty)]));
      row.deliveredBy = claims.has(b.deliveredBy) ? b.deliveredBy : null;
      row.claimUntil = Number.isFinite(b.claimUntil) ? positive(b.claimUntil) : null;
      row.minedByPlayer = integer(b.minedByPlayer, Object.values(def.pool).reduce((a, b) => a + b, 0));
      if (row.status === 'live' && Object.values(row.pool).every(qty => qty === 0)) row.status = 'salvaged';
      if (row.status !== 'live') row.pool = {};
    }
    for (const def of OUTFITS) {
      const c = src.crews?.[def.id], row = m.crews[def.id];
      if (!plain(c) || c.key !== row.key) { row.status = 'destroyed'; continue; }
      row.status = crewStates.has(c.status) ? c.status : 'idle';
      row.pos = point(c.pos, row.pos); row.vel = point(c.vel); row.rot = finite(c.rot);
      row.angVel = finite(c.angVel, 0, 20); row.hull = positive(c.hull, 10000);
      row.targetId = SALVAGE_PIECES.some(p => p.id === c.targetId) ? c.targetId : null;
      row.startsAt = positive(c.startsAt); row.towSeconds = positive(c.towSeconds, 100000);
      row.lastRequestAt = -10; row.overcommitted = c.overcommitted === true;
      row.stalls = integer(c.stalls, 100); row.favorsPlayer = c.favorsPlayer === true;
      row.cautious = c.cautious === true;
    }
    if (plain(src.receipts)) for (const [key, receipt] of Object.entries(src.receipts).slice(0, 24)) {
      if (safeId(key, 240) && key.startsWith(`${id}:`) && plain(receipt)) {
        m.receipts[key] = { id: key, amount: positive(receipt.amount, 10000), at: positive(receipt.at),
          kind: String(receipt.kind || 'delivery').slice(0, 32) };
      }
    }
    const a = src.agreement;
    if (plain(a) && ['split', 'cooperate', 'rescue'].includes(a.type)
      && ['active', 'complete', 'broken'].includes(a.status)) {
      m.agreement = { type: a.type, status: a.status, crewId: a.type === 'rescue' ? 'latch' : 'keel',
        pieceId: a.type === 'rescue' ? 'core' : 'frame', acceptedAt: positive(a.acceptedAt),
        bonus: positive(a.bonus, 500), receiptId: `${id}:agreement:${a.type}` };
    }
    m.status = Object.values(m.bodies).every(b => b.status !== 'live') ? 'complete' : 'working';
    out.meetings[id] = m;
  }
  return out;
}

export function captureSalvageOutfits(state, registry) {
  const owner = registry?.get?.('salvageOutfits');
  return owner?.serialize ? owner.serialize() : normalizeSalvageOutfits(state?.salvageOutfits);
}

export function restoreSalvageOutfits(data, registry) {
  const owner = registry?.get?.('salvageOutfits');
  if (!owner?.deserialize) return false;
  owner.deserialize(data?.salvageOutfits || null);
  return true;
}

export const cloneSalvageOutfits = clone;
