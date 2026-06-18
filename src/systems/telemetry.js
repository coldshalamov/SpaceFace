// Local, privacy-safe telemetry sink (no network, no consent, no PII). Subscribes to real gameplay
// events on the bus and maintains (1) a bounded ring buffer of recent meaningful events and (2)
// per-SESSION aggregates: trade volume by side/commodity, credits earned/spent (via the SOLE money
// channel `credits:changed`), kills, deaths-by-cause, ore mined by type, missions by type+outcome,
// onboarding-funnel milestone timestamps, and a death/lifespan log. Aggregates are persisted to
// localStorage under a versioned, append-only-per-session key with a hard cap on stored sessions
// (oldest rotated out). All storage access is wrapped in try/catch so private-mode / quota / SSR
// (no window) all degrade to in-memory only.
//
// Design correctness (see design/EVENT_TAXONOMY.md):
//   - "first mine" keys off `mining:yield` (player ore release), NOT `economy:tradeCompleted` — a
//     buy-and-resell of ore would otherwise false-trigger the mining funnel step.
//   - credits earned/spent come ONLY from `credits:changed`; trade settlements, bounties, loot and
//     mission rewards all already flow through it, so we never also add `tradeCompleted.total` etc.
//     into the money buckets (that would double-count). Trade *volume* is a separate aggregate.
//   - kills are filtered to `killerId === playerId` (most `entity:killed` are NPC-vs-NPC).
//
// Entry point: createTelemetry(bus, state). No-op-safe singleton (a second call disposes the prior
// instance). Mirrors to window.__SF_TELEMETRY__ for dev. Not wired here — the lead wires it later.

const STORAGE_KEY = 'sf_telemetry_v1';
const SCHEMA_VERSION = 1;
const RING_CAP = 2000;        // recent-event ring buffer cap (no unbounded growth)
const MAX_SESSIONS = 25;      // stored-session cap; oldest rotated out
const MAX_DEATH_LOG = 200;    // per-session death/lifespan log cap
const SAVE_DEBOUNCE_MS = 4000;

// Module-level singleton handle (per the no-op-safe requirement).
let _instance = null;

const hasWindow = typeof window !== 'undefined';

function now() {
  if (hasWindow && window.performance && typeof window.performance.now === 'function') {
    return Math.round(window.performance.now());
  }
  return Date.now();
}

function safeLocalStorage() {
  try {
    if (!hasWindow || !window.localStorage) return null;
    // Touch it — Safari private mode throws on access/setItem.
    const probe = '__sf_tlm_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (_err) {
    return null;
  }
}

function genSessionId() {
  const r = Math.floor(Math.random() * 0xffffffff).toString(36);
  return 's_' + Date.now().toString(36) + '_' + r;
}

function emptyAggregates() {
  return {
    schema: SCHEMA_VERSION,
    sessionId: genSessionId(),
    startedAt: Date.now(),          // wall-clock (for human-readable session listing)
    startedSimMark: now(),          // monotonic mark for duration math
    endedAt: 0,
    durationMs: 0,

    trades: { buy: 0, sell: 0, byCommodity: {} },          // counts + per-commodity {buy,sell,qty}
    credits: { earned: 0, spent: 0, byReason: {} },         // sole source: credits:changed
    kills: { total: 0, byVictimClass: {}, byFaction: {} },  // player kills only
    deaths: { total: 0, byCause: {} },
    ore: { unitsTotal: 0, byType: {} },                      // mining:yield qty by commodityId
    missions: { accepted: 0, completed: 0, failed: 0, expired: 0, byType: {} },
    progression: { techResearched: 0, factionTierUps: 0, techNodes: [], tierUps: [] },
    navigation: { docks: 0, jumps: 0, sectorsVisited: [] },

    // First-occurrence timestamps (monotonic ms since session start). -1 = not yet reached. We use
    // -1 (not 0) so that a step reached on the exact rebase tick — offset 0ms — still reads as reached.
    funnel: {
      firstDockAt: -1, firstTradeAt: -1, firstMineAt: -1, firstKillAt: -1,
      firstMissionAcceptAt: -1, firstMissionCompleteAt: -1, firstJumpAt: -1, firstTierUpAt: -1,
    },

    deathLog: [],   // [{ atMs, simTime, cause, killerId, killerType, killerFaction, pos:{x,z}, lifespanMs }]
  };
}

export function createTelemetry(bus, state) {
  // No-op-safe singleton: dispose any prior instance before constructing a new one.
  if (_instance && typeof _instance.dispose === 'function') {
    try { _instance.dispose(); } catch (_err) { /* ignore */ }
    _instance = null;
  }
  if (!bus || typeof bus.on !== 'function') {
    throw new Error('[telemetry] createTelemetry(bus, state): a bus with .on() is required');
  }

  const store = safeLocalStorage();
  const unsubs = [];
  const ring = [];               // bounded ring buffer of recent meaningful events
  let ringSeq = 0;
  let session = emptyAggregates();
  let lastSpawnMark = now();     // lifespan anchor (game start / respawn)
  let saveTimer = null;
  let disposed = false;

  // ----------------------------------------------------------------------------------------------
  // ring buffer (cap RING_CAP, drop-oldest)
  // ----------------------------------------------------------------------------------------------
  function pushRing(type, data) {
    ring.push({ seq: ringSeq++, atMs: now() - session.startedSimMark, simTime: simNow(), type, data });
    if (ring.length > RING_CAP) ring.splice(0, ring.length - RING_CAP);
  }

  function simNow() {
    return (state && typeof state.simTime === 'number') ? state.simTime : 0;
  }

  function markFunnel(key) {
    if (session.funnel[key] < 0) session.funnel[key] = now() - session.startedSimMark;
  }

  // ----------------------------------------------------------------------------------------------
  // persistence — debounced; flush also bound to page lifecycle below
  // ----------------------------------------------------------------------------------------------
  function scheduleSave() {
    if (!store || disposed) return;
    if (saveTimer !== null) return;            // already pending
    if (hasWindow && typeof window.setTimeout === 'function') {
      saveTimer = window.setTimeout(() => { saveTimer = null; persist(); }, SAVE_DEBOUNCE_MS);
    } else {
      persist();
    }
  }

  function readAllSessions() {
    if (!store) return [];
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.sessions)) return [];
      return parsed.sessions;
    } catch (_err) {
      return [];   // corrupt / unreadable → treat as empty, never throw
    }
  }

  function persist() {
    if (!store || disposed) return;
    session.endedAt = Date.now();
    session.durationMs = now() - session.startedSimMark;
    try {
      const sessions = readAllSessions().filter((s) => s && s.sessionId !== session.sessionId);
      sessions.push(serializeSession());
      // rotate oldest beyond the cap
      while (sessions.length > MAX_SESSIONS) sessions.shift();
      store.setItem(STORAGE_KEY, JSON.stringify({ schema: SCHEMA_VERSION, sessions }));
    } catch (_err) {
      // quota / private-mode / serialization — drop this write, keep running in memory
    }
  }

  // Strip transient monotonic marks from the persisted copy (keep storage stable + small).
  function serializeSession() {
    const s = session;
    return {
      schema: SCHEMA_VERSION, sessionId: s.sessionId,
      startedAt: s.startedAt, endedAt: s.endedAt, durationMs: s.durationMs,
      trades: s.trades, credits: s.credits, kills: s.kills, deaths: s.deaths,
      ore: s.ore, missions: s.missions, progression: s.progression,
      navigation: s.navigation, funnel: s.funnel, deathLog: s.deathLog,
    };
  }

  // ----------------------------------------------------------------------------------------------
  // small aggregate helpers
  // ----------------------------------------------------------------------------------------------
  function bump(obj, key, by) {
    if (key == null) key = 'unknown';
    obj[key] = (obj[key] || 0) + (by == null ? 1 : by);
  }
  function pushUnique(arr, val) {
    if (val != null && arr.indexOf(val) === -1) arr.push(val);
  }

  // ----------------------------------------------------------------------------------------------
  // death-cause derivation — `player:death` only carries {pos, killerId}; there is NO native cause
  // field. The killer entity outlives the victim, so we read it from state at handler time.
  // ----------------------------------------------------------------------------------------------
  function deriveDeathCause(killerId) {
    if (killerId == null) return { cause: 'environmental', type: null, faction: null };
    if (state && state.playerId != null && killerId === state.playerId) {
      return { cause: 'self', type: 'ship', faction: null };
    }
    const killer = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(killerId) : null;
    if (!killer) return { cause: 'unknown', type: null, faction: null };
    const data = killer.data || {};
    const klass = data.shipClass || killer.type || 'unknown';
    const cause = killer.type === 'ship' ? ('ship:' + (data.shipClass || 'generic'))
      : killer.type === 'asteroid' ? 'collision:asteroid'
      : killer.type === 'station' ? 'collision:station'
      : killer.type || 'unknown';
    return { cause, type: klass, faction: killer.factionId || null };
  }

  // ----------------------------------------------------------------------------------------------
  // subscriptions — every name below is verified against an emit site in src/ (see EVENT_TAXONOMY).
  // ----------------------------------------------------------------------------------------------
  function sub(event, fn) { unsubs.push(bus.on(event, fn)); }

  // game lifecycle — reset the lifespan anchor so death lifespans are measured from spawn. We also
  // re-base the funnel/ring time origin (`startedSimMark`) to actual play start, so "time to first
  // dock/trade/..." excludes time spent in the main menu before a run began (the sink may be
  // constructed at boot, well before game:started).
  function rebaseToPlayStart() { session.startedSimMark = now(); lastSpawnMark = now(); }
  sub('game:started', rebaseToPlayStart);
  sub('save:loaded', rebaseToPlayStart);
  sub('player:respawn', () => { lastSpawnMark = now(); });

  // ECONOMY — trade volume (NOT money). economy.js:504
  sub('economy:tradeCompleted', (p) => {
    if (!p) return;
    const side = p.side === 'sell' ? 'sell' : 'buy';
    session.trades[side] += 1;
    const c = session.trades.byCommodity[p.commodityId] ||
      (session.trades.byCommodity[p.commodityId] = { buy: 0, sell: 0, qty: 0 });
    c[side] += 1;
    c.qty += Math.abs(p.qty || 0);
    markFunnel('firstTradeAt');
    pushRing('economy:tradeCompleted', { side, commodityId: p.commodityId, qty: p.qty, total: p.total });
    scheduleSave();
  });

  // CREDITS — the SOLE money channel. economy.js:548 / 559
  sub('credits:changed', (p) => {
    if (!p) return;
    const delta = p.delta || 0;
    if (delta > 0) session.credits.earned += delta;
    else if (delta < 0) session.credits.spent += -delta;
    const r = session.credits.byReason[p.reason || 'unknown'] ||
      (session.credits.byReason[p.reason || 'unknown'] = { earned: 0, spent: 0 });
    if (delta > 0) r.earned += delta; else if (delta < 0) r.spent += -delta;
    // not ring-buffered: high-frequency and fully captured by aggregates
    scheduleSave();
  });

  // COMBAT — player kills only. combat.js:156
  sub('entity:killed', (p) => {
    if (!p) return;
    if (state && state.playerId != null && p.killerId !== state.playerId) return; // NPC-vs-NPC: ignore
    session.kills.total += 1;
    bump(session.kills.byVictimClass, p.victimClass || p.type);
    bump(session.kills.byFaction, p.factionId);
    markFunnel('firstKillAt');
    pushRing('entity:killed', { victimClass: p.victimClass || p.type, factionId: p.factionId, bountyCr: p.bountyCr });
    scheduleSave();
  });

  // PLAYER DEATH — deaths-by-cause + death/lifespan log. combat.js:194
  sub('player:death', (p) => {
    p = p || {};
    const c = deriveDeathCause(p.killerId);
    session.deaths.total += 1;
    bump(session.deaths.byCause, c.cause);
    const atMs = now() - session.startedSimMark;
    const entry = {
      atMs, simTime: simNow(), cause: c.cause,
      killerId: p.killerId == null ? null : p.killerId,
      killerType: c.type, killerFaction: c.faction,
      pos: p.pos ? { x: p.pos.x, z: p.pos.z } : null,
      lifespanMs: now() - lastSpawnMark,
    };
    session.deathLog.push(entry);
    if (session.deathLog.length > MAX_DEATH_LOG) session.deathLog.splice(0, session.deathLog.length - MAX_DEATH_LOG);
    pushRing('player:death', entry);
    persist();   // deaths are rare + important — flush immediately, don't debounce
  });

  // MINING — player ore release (qty-bearing). mining.js:213 / 335. Drones emit mining:tick (no qty)
  // and are intentionally excluded from "ore mined".
  sub('mining:yield', (p) => {
    if (!p) return;
    const qty = p.qty || 0;
    session.ore.unitsTotal += qty;
    bump(session.ore.byType, p.commodityId, qty);
    markFunnel('firstMineAt');   // correct funnel anchor — NOT economy:tradeCompleted
    pushRing('mining:yield', { commodityId: p.commodityId, qty });
    scheduleSave();
  });

  // MISSIONS — by type + outcome. missions.js:413 / 662 / 679 / 696
  sub('mission:accepted', (p) => {
    p = p || {};
    session.missions.accepted += 1;
    bumpMissionType(p.type, 'accepted');
    markFunnel('firstMissionAcceptAt');
    pushRing('mission:accepted', { missionId: p.missionId, type: p.type });
    scheduleSave();
  });
  sub('mission:completed', (p) => {
    p = p || {};
    session.missions.completed += 1;
    bumpMissionType(p.type, 'completed');
    markFunnel('firstMissionCompleteAt');
    pushRing('mission:completed', { missionId: p.missionId, type: p.type, factionId: p.factionId });
    scheduleSave();
  });
  sub('mission:failed', (p) => {
    p = p || {};
    session.missions.failed += 1;
    bumpMissionType(p.type, 'failed'); // type may be absent on failed payload — folds to 'unknown'
    pushRing('mission:failed', { missionId: p.missionId, reason: p.reason });
    scheduleSave();
  });
  sub('mission:expired', (p) => {
    p = p || {};
    session.missions.expired += 1;
    bumpMissionType(p.type, 'expired');
    pushRing('mission:expired', { missionId: p.missionId, reason: p.reason });
    scheduleSave();
  });

  function bumpMissionType(type, outcome) {
    const key = type || 'unknown';
    const t = session.missions.byType[key] ||
      (session.missions.byType[key] = { accepted: 0, completed: 0, failed: 0, expired: 0 });
    t[outcome] += 1;
  }

  // PROGRESSION — tech unlocks (ships.js:431) + faction rep tier-ups (factions.js:232, tierChanged).
  // NOTE: there is no overarching player-progression-tier event (see EVENT_TAXONOMY gaps).
  sub('tech:researched', (p) => {
    p = p || {};
    session.progression.techResearched += 1;
    pushUnique(session.progression.techNodes, p.nodeId);
    markFunnel('firstTierUpAt');
    pushRing('tech:researched', { nodeId: p.nodeId });
    scheduleSave();
  });
  sub('faction:repChanged', (p) => {
    if (!p || !p.tierChanged) return;   // only the rep *tier* crossing is a milestone
    session.progression.factionTierUps += 1;
    session.progression.tierUps.push({ atMs: now() - session.startedSimMark, factionId: p.factionId, newTier: p.newTier });
    markFunnel('firstTierUpAt');
    pushRing('faction:repChanged', { factionId: p.factionId, newTier: p.newTier });
    scheduleSave();
  });

  // NAVIGATION — dock + jump milestones. input.js:29 (dock:docked) / world.js:500 (jump:arrive)
  sub('dock:docked', (p) => {
    p = p || {};
    session.navigation.docks += 1;
    markFunnel('firstDockAt');
    pushRing('dock:docked', { stationId: p.stationId });
    scheduleSave();
  });
  sub('jump:arrive', (p) => {
    p = p || {};
    session.navigation.jumps += 1;
    pushUnique(session.navigation.sectorsVisited, p.sectorId);
    markFunnel('firstJumpAt');
    pushRing('jump:arrive', { sectorId: p.sectorId, interdicted: p.interdicted, ambushCount: p.ambushCount });
    scheduleSave();
  });

  // ----------------------------------------------------------------------------------------------
  // page-lifecycle flush — there is NO session-end gameplay event (see EVENT_TAXONOMY gaps), so we
  // lean on the browser to flush a final snapshot. These are browser listeners, not file edits.
  // ----------------------------------------------------------------------------------------------
  let onVisibility = null;
  let onPageHide = null;
  if (hasWindow && typeof window.addEventListener === 'function') {
    onVisibility = () => { if (document && document.visibilityState === 'hidden') persist(); };
    onPageHide = () => persist();
    try {
      window.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('beforeunload', onPageHide);
    } catch (_err) { /* ignore */ }
  }

  // ----------------------------------------------------------------------------------------------
  // query API
  // ----------------------------------------------------------------------------------------------
  function getSessionStats() {
    return JSON.parse(JSON.stringify(serializeSession()));
  }

  function getCareerStats() {
    // career = persisted sessions + the live (not-yet-persisted) one, merged.
    const persisted = readAllSessions().filter((s) => s && s.sessionId !== session.sessionId);
    const all = persisted.concat([serializeSession()]);
    const career = {
      sessions: all.length,
      trades: { buy: 0, sell: 0 },
      credits: { earned: 0, spent: 0 },
      kills: 0, deaths: 0,
      ore: { unitsTotal: 0, byType: {} },
      missions: { accepted: 0, completed: 0, failed: 0, expired: 0 },
      progression: { techResearched: 0, factionTierUps: 0 },
      navigation: { docks: 0, jumps: 0 },
      totalPlaytimeMs: 0,
    };
    for (const s of all) {
      if (!s) continue;
      career.trades.buy += (s.trades && s.trades.buy) || 0;
      career.trades.sell += (s.trades && s.trades.sell) || 0;
      career.credits.earned += (s.credits && s.credits.earned) || 0;
      career.credits.spent += (s.credits && s.credits.spent) || 0;
      career.kills += (s.kills && s.kills.total) || 0;
      career.deaths += (s.deaths && s.deaths.total) || 0;
      career.ore.unitsTotal += (s.ore && s.ore.unitsTotal) || 0;
      if (s.ore && s.ore.byType) for (const k in s.ore.byType) bump(career.ore.byType, k, s.ore.byType[k]);
      if (s.missions) {
        career.missions.accepted += s.missions.accepted || 0;
        career.missions.completed += s.missions.completed || 0;
        career.missions.failed += s.missions.failed || 0;
        career.missions.expired += s.missions.expired || 0;
      }
      if (s.progression) {
        career.progression.techResearched += s.progression.techResearched || 0;
        career.progression.factionTierUps += s.progression.factionTierUps || 0;
      }
      if (s.navigation) {
        career.navigation.docks += s.navigation.docks || 0;
        career.navigation.jumps += s.navigation.jumps || 0;
      }
      career.totalPlaytimeMs += s.durationMs || 0;
    }
    return career;
  }

  // Onboarding funnel: ordered steps with reached-flag + first-reach offset (ms since session start).
  function getFunnel() {
    const f = session.funnel;
    const steps = [
      ['firstDock', f.firstDockAt],
      ['firstTrade', f.firstTradeAt],
      ['firstMine', f.firstMineAt],
      ['firstKill', f.firstKillAt],
      ['firstMissionAccept', f.firstMissionAcceptAt],
      ['firstMissionComplete', f.firstMissionCompleteAt],
      ['firstJump', f.firstJumpAt],
      ['firstTierUp', f.firstTierUpAt],
    ];
    return steps.map(([key, at]) => ({ step: key, reached: at >= 0, atMs: at >= 0 ? at : null }));
  }

  // Death heatmap: world positions + cause for a spatial overlay. CAREER-WIDE (persisted sessions +
  // the live one) — grouped with getCareerStats(), a heatmap is conventionally cumulative. Pass
  // `sessionOnly === true` for just the current session.
  function getDeathHeatmap(sessionOnly) {
    const logs = sessionOnly
      ? session.deathLog
      : readAllSessions()
          .filter((s) => s && s.sessionId !== session.sessionId)
          .reduce((acc, s) => acc.concat(s.deathLog || []), [])
          .concat(session.deathLog);
    return logs
      .filter((d) => d && d.pos)
      .map((d) => ({ x: d.pos.x, z: d.pos.z, cause: d.cause, lifespanMs: d.lifespanMs, simTime: d.simTime }));
  }

  function getRecentEvents(limit) {
    const n = limit && limit > 0 ? Math.min(limit, ring.length) : ring.length;
    return ring.slice(ring.length - n);
  }

  // Reset: clear the LIVE session aggregates + ring (does NOT wipe persisted history; pass true to also
  // clear localStorage). A fresh session id is minted so the next persist() appends cleanly.
  function reset(clearStored) {
    session = emptyAggregates();
    ring.length = 0;
    ringSeq = 0;
    lastSpawnMark = now();
    if (clearStored && store) {
      try { store.removeItem(STORAGE_KEY); } catch (_err) { /* ignore */ }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (saveTimer !== null && hasWindow && typeof window.clearTimeout === 'function') {
      window.clearTimeout(saveTimer); saveTimer = null;
    }
    persist();   // final flush
    for (const u of unsubs) { try { u(); } catch (_err) { /* ignore */ } }
    unsubs.length = 0;
    if (hasWindow && typeof window.removeEventListener === 'function') {
      try {
        if (onVisibility) window.removeEventListener('visibilitychange', onVisibility);
        if (onPageHide) { window.removeEventListener('pagehide', onPageHide); window.removeEventListener('beforeunload', onPageHide); }
      } catch (_err) { /* ignore */ }
    }
    if (hasWindow && window.__SF_TELEMETRY__ === api) {
      try { delete window.__SF_TELEMETRY__; } catch (_err) { window.__SF_TELEMETRY__ = undefined; }
    }
    if (_instance === api) _instance = null;
  }

  const api = {
    name: 'telemetry',
    getSessionStats, getCareerStats, getFunnel, getDeathHeatmap,
    getRecentEvents, reset, dispose,
    // live handles for dev inspection
    get sessionId() { return session.sessionId; },
  };

  _instance = api;
  if (hasWindow) {
    try { window.__SF_TELEMETRY__ = api; } catch (_err) { /* ignore */ }
  }
  return api;
}

export default createTelemetry;
