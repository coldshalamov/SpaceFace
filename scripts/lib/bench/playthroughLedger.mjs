// scripts/lib/bench/playthroughLedger.mjs — hour-by-hour ledger for long open-world playthroughs.
//
// Part of the program-compass instrument: measures the shape of an actual scripted playthrough the
// same way the fun-loop measures a bench run. Honest-by-construction rules from
// scripts/lib/bench/funMetrics.mjs apply: a number the trace cannot support stays null with a gap
// string, never fabricated.
//
// The recorder wraps bus.emit once at harness level, so every event the sim emits is counted into
// per-sim-hour buckets (type histogram) while a targeted list also captures payloads. Policies
// report decisions/notes through recordDecision/recordNote. Nothing here mutates gameplay state.

const HOUR_S = 3600;
const TICKS_PER_S = 60;
const CHAIN_WINDOW_S = 600; // a causal chain may span up to 10 sim-minutes

// Targeted payload capture. Type histogram is recorded for every event regardless.
const TARGETED_TYPES = new Set([
  'entity:killed', 'combat:fire', 'combat:damage', 'projectile:hit',
  'tether:attached', 'tether:broken', 'tether:cut', 'tether:cutPlayer', 'tether:reel', 'tether:latchDenied',
  'sector:enter', 'sector:exit', 'dock:docked', 'dock:undocked',
  'asteroid:destroyed', 'player:shot', 'verb:used', 'combat:actionStarted',
  'player:died', 'player:respawn', 'damage:playerHull', 'collision:playerKnock',
  'economy:applyTradePressure', 'mission:accepted', 'mission:completed', 'mission:failed',
  'heat:changed', 'wanted:changed', 'law:response', 'faction:standingChanged',
  'encounter:started', 'encounter:ended', 'bark:shown', 'story:factChanged', 'scenario:factChanged',
  'loot:spawned', 'salvage:collected', 'cargo:pickedUp', 'pickup:collected',
]);

const CHAIN_KINDS = new Set([
  'playerKill', 'salvagePickup', 'commoditySell', 'creditsNoSale', 'wantedOrHeat', 'lawResponse',
]);

export function createPlaythroughLedger({ state, bus, archetype, seed }) {
  const hours = [];
  const firsts = {};
  const decisions = [];
  const notes = [];
  const deaths = [];
  let currentHour = -1;
  let hourBucket = null;
  let chainWindow = []; // { tick, tS, kind, data }
  let lastCredits = null;
  let dockEpisodeOpen = false;
  let wrapError = null;

  function hourSnapshot(h) {
    const player = state.playerId != null ? state.entities.get(state.playerId) : null;
    const cargo = player && player.cargo;
    const cargoUsed = cargo && cargo.items
      ? Object.values(cargo.items).reduce((a, b) => a + (Number(b) || 0), 0) : null;
    return {
      simTimeS: Math.round(state.simTime * 10) / 10,
      credits: state.player && state.player.credits != null ? state.player.credits : null,
      hull: player ? Math.round((player.hull || 0) * 10) / 10 : null,
      hullMax: player ? (player.hullMax || null) : null,
      shield: player ? Math.round((player.shield || 0) * 10) / 10 : null,
      cargoUsed: cargoUsed,
      cargoCap: cargo ? (cargo.capacity ?? cargo.cap ?? null) : null,
      sectorId: state.world ? state.world.currentSectorId : null,
      shipId: player && player.data ? player.data.defId : null,
      alive: player ? !!player.alive : null,
      wanted: !!(state.heat && (state.heat.wanted || state.heat.level > 0)),
    };
  }

  function beginHour(h) {
    currentHour = h;
    hourBucket = {
      hour: h,
      fromTick: state.tick,
      fromSimTimeS: Math.round(state.simTime * 10) / 10,
      startSnapshot: hourSnapshot(h),
      eventTypes: {},          // full histogram of every bus event this hour
      targeted: {},            // type -> [ {tick, data} ] (payload-captured, capped)
      shots: 0, damageDealt: 0, damageTaken: 0,
      killsByPlayer: 0, killsByCause: {},
      tetherAttach: 0, tetherCut: 0, tetherBroken: 0,
      sectorEnters: [], docks: 0, undocks: 0,
      missionsAccepted: 0, missionsCompleted: 0, missionsFailed: 0,
      commoditySoldCr: 0, commoditySoldU: 0, commodityBoughtCr: 0,
      asteroidsMined: 0, salvagePickups: 0,
      wantedTimeS: 0, heatPeak: 0,
      chains: [],              // {kind, ticks[], spanS, events[]}
      decisionsThisHour: 0,
      quietLongestGapS: 0,
      lastEventTick: state.tick,
    };
    hours.push(hourBucket);
    for (const key of ['firstKill', 'firstPlayerKill', 'firstDeath', 'firstDock', 'firstSale',
      'firstTetherAttach', 'firstMissionAccept', 'firstSectorChange', 'first10kCredits',
      'firstHostileFireAtPlayer', 'firstChain']) {
      if (firsts[key] == null) firsts[key] = null; // declare; filled when observed
    }
  }

  function recordEvent(type, data) {
    const h = Math.floor(state.simTime / HOUR_S);
    if (h !== currentHour) {
      if (currentHour >= 0) closeHour();
      beginHour(h);
    }
    hourBucket.eventTypes[type] = (hourBucket.eventTypes[type] || 0) + 1;
    const gapS = (state.tick - hourBucket.lastEventTick) / TICKS_PER_S;
    if (gapS > hourBucket.quietLongestGapS) hourBucket.quietLongestGapS = Math.round(gapS * 10) / 10;
    hourBucket.lastEventTick = state.tick;

    if (!TARGETED_TYPES.has(type)) return;
    if (!hourBucket.targeted[type]) hourBucket.targeted[type] = [];
    if (hourBucket.targeted[type].length < 400) {
      hourBucket.targeted[type].push({
        tick: state.tick,
        ...(data && typeof data === 'object' ? slim(data) : { value: data }),
      });
    }

    // ── targeted aggregation ────────────────────────────────────────────────────
    const player = state.playerId;
    if (type === 'combat:fire') {
      if (data && data.ownerId === player) hourBucket.shots++;
      else if (data && data.ownerId != null && data.ownerId !== player) {
        const shooter = state.entities.get(data.ownerId);
        if (shooter && shooter.team !== 0 && firsts.firstHostileFireAtPlayer == null) {
          firsts.firstHostileFireAtPlayer = state.tick;
        }
      }
    } else if (type === 'combat:damage') {
      if (data && data.targetId === player) hourBucket.damageTaken += Number(data.amount) || 0;
      else if (data && (data.attackerId === player || data.ownerId === player)) {
        hourBucket.damageDealt += Number(data.applied ?? data.amount) || 0;
      }
    } else if (type === 'entity:killed') {
      const cause = data && typeof data.cause === 'string' ? data.cause : 'unrecorded';
      const credited = data && (data.killerId === player || data.ownerId === player);
      if (credited) {
        hourBucket.killsByPlayer++;
        if (firsts.firstPlayerKill == null) firsts.firstPlayerKill = state.tick;
        chainWindow.push({
          tick: state.tick, tS: state.simTime, kind: 'playerKill',
          data: { cause, bountyCr: Number(data.bountyCr) || 0, lawful: !!data.factionLawful },
        });
      }
      hourBucket.killsByCause[cause] = (hourBucket.killsByCause[cause] || 0) + 1;
      if (data && data.id === player && firsts.firstDeath == null) firsts.firstDeath = state.tick;
    } else if (type === 'tether:attached') {
      hourBucket.tetherAttach++;
      if (firsts.firstTetherAttach == null) firsts.firstTetherAttach = state.tick;
    } else if (type === 'tether:broken') hourBucket.tetherBroken++;
    else if (type === 'tether:cut' || type === 'tether:cutPlayer') hourBucket.tetherCut++;
    else if (type === 'sector:enter') {
      hourBucket.sectorEnters.push(data && data.sectorId);
      if (firsts.firstSectorChange == null && state.simTime > 5) firsts.firstSectorChange = state.tick;
    } else if (type === 'dock:docked') {
      // dockingCorridor re-emits while the corridor is engaged — count unique episodes only.
      if (!dockEpisodeOpen) {
        dockEpisodeOpen = true;
        hourBucket.docks++;
        if (firsts.firstDock == null) firsts.firstDock = state.tick;
      }
    } else if (type === 'dock:undocked') {
      dockEpisodeOpen = false;
      hourBucket.undocks++;
    }
    else if (type === 'mission:accepted') {
      hourBucket.missionsAccepted++;
      if (firsts.firstMissionAccept == null) firsts.firstMissionAccept = state.tick;
    } else if (type === 'mission:completed') hourBucket.missionsCompleted++;
    else if (type === 'mission:failed') hourBucket.missionsFailed++;
    else if (type === 'asteroid:destroyed') hourBucket.asteroidsMined++;
    else if (type === 'player:died') {
      deaths.push({ tick: state.tick, simTimeS: Math.round(state.simTime), data: slim(data || {}) });
    } else if (type === 'heat:changed' || type === 'wanted:changed') {
      const level = data && (data.level ?? data.heat ?? data.wanted);
      if (Number.isFinite(Number(level))) {
        hourBucket.heatPeak = Math.max(hourBucket.heatPeak, Number(level));
        if (Number(level) > 0) {
          chainWindow.push({ tick: state.tick, tS: state.simTime, kind: 'wantedOrHeat', data: { level } });
        }
      }
    } else if (type === 'law:response') {
      chainWindow.push({ tick: state.tick, tS: state.simTime, kind: 'lawResponse', data: slim(data || {}) });
    } else if (type === 'salvage:collected' || type === 'cargo:pickedUp' || type === 'pickup:collected') {
      hourBucket.salvagePickups++;
      chainWindow.push({ tick: state.tick, tS: state.simTime, kind: 'salvagePickup', data: slim(data || {}) });
    }
  }

  // Called by the pilot service layer after a live economy.execute sell/buy.
  function recordTrade({ side, stationId, commodityId, qty, cr }) {
    if (side === 'sell') {
      hourBucket.commoditySoldCr += cr;
      hourBucket.commoditySoldU += qty;
      if (firsts.firstSale == null) firsts.firstSale = state.tick;
      chainWindow.push({
        tick: state.tick, tS: state.simTime, kind: 'commoditySell',
        data: { commodityId, qty, cr, stationId },
      });
    } else {
      hourBucket.commodityBoughtCr += cr;
    }
  }

  // Bounty-style credit gains with no sale attached (from the policy's credit ledger).
  function recordCreditsNoSale(cr, reason) {
    chainWindow.push({ tick: state.tick, tS: state.simTime, kind: 'creditsNoSale', data: { cr, reason } });
  }

  function recordDecision(d) {
    if (decisions.length >= 6000) return; // cap: a stuck loop must not flood the ledger
    const entry = {
      tick: state.tick, hour: currentHour,
      situation: String(d.situation || '').slice(0, 120),
      options: (d.options || []).map((o) => ({
        id: String(o.id || '').slice(0, 60),
        tradeoff: String(o.tradeoff || '').slice(0, 140),
      })),
      chosen: String(d.chosen || '').slice(0, 60),
    };
    decisions.push(entry);
    if (hourBucket) hourBucket.decisionsThisHour++;
  }

  function recordNote(text) {
    notes.push({ tick: state.tick, hour: currentHour, text: String(text).slice(0, 200) });
    if (notes.length > 400) notes.splice(0, notes.length - 400);
  }

  // Chain detection over the rolling window. Two patterns:
  //   combat_salvage_economy : playerKill → salvagePickup → commoditySell (≤ CHAIN_WINDOW_S)
  //   combat_law             : playerKill → wantedOrHeat/lawResponse (≤ 300 s)
  function detectChains() {
    chainWindow = chainWindow.filter((e) => state.simTime - e.tS <= CHAIN_WINDOW_S);
    const kills = chainWindow.filter((e) => e.kind === 'playerKill');
    for (const kill of kills) {
      if (kill._consumed) continue;
      const salvage = chainWindow.find((e) => e.kind === 'salvagePickup' && e.tS > kill.tS
        && e.tS - kill.tS <= CHAIN_WINDOW_S);
      const sale = salvage
        ? chainWindow.find((e) => e.kind === 'commoditySell' && e.tS > salvage.tS
          && e.tS - salvage.tS <= CHAIN_WINDOW_S)
        : null;
      if (salvage && sale) {
        pushChain('combat_salvage_economy', [kill, salvage, sale]);
        kill._consumed = true; salvage._consumed = true; sale._consumed = true;
      } else if (salvage) {
        pushChain('combat_salvage_pending', [kill, salvage]);
        kill._consumed = true; salvage._consumed = true;
      }
      const law = chainWindow.find((e) => (e.kind === 'wantedOrHeat' || e.kind === 'lawResponse')
        && e.tS > kill.tS && e.tS - kill.tS <= 300);
      if (law) {
        pushChain('combat_law', [kill, law]);
        law._consumed = true;
      }
    }
    if (chainWindow.some((e) => e.kind === 'playerKill') && firsts.firstChain == null) {
      firsts.firstChain = state.tick;
    }
  }

  function pushChain(kind, events) {
    if (!hourBucket) return;
    hourBucket.chains.push({
      kind,
      spanS: Math.round((events[events.length - 1].tS - events[0].tS) * 10) / 10,
      ticks: events.map((e) => e.tick),
    });
  }

  function closeHour() {
    hourBucket.toTick = state.tick;
    hourBucket.toSimTimeS = Math.round(state.simTime * 10) / 10;
    hourBucket.endSnapshot = hourSnapshot(hourBucket.hour + 1);
    hourBucket.decisionsThisHour = decisions.filter((d) => d.hour === hourBucket.hour).length;
    detectChains();
  }

  // ── wrap bus.emit once: full histogram + targeted capture, zero gameplay mutation ──
  const originalEmit = bus.emit.bind(bus);
  bus.emit = function wrappedEmit(type, data) {
    try {
      if (typeof type === 'string' && type !== 'economy:tick') recordEvent(type, data);
      else if (type === 'economy:tick' && hourBucket) {
        hourBucket.eventTypes[type] = (hourBucket.eventTypes[type] || 0) + 1;
      }
    } catch (error) {
      if (!wrapError) { wrapError = error; }
    }
    return originalEmit(type, data);
  };

  function finish() {
    if (hourBucket) closeHour();
    // derive economy curve from hour snapshots
    const economyCurve = hours.map((h) => ({
      hour: h.hour,
      creditsStart: h.startSnapshot ? h.startSnapshot.credits : null,
      creditsEnd: h.endSnapshot ? h.endSnapshot.credits : null,
      soldCr: Math.round(h.commoditySoldCr),
      boughtCr: Math.round(h.commodityBoughtCr),
    }));
    return {
      schema: 'spaceface.playthroughLedger.v1',
      archetype, seed,
      startedAtTick: hours.length ? hours[0].fromTick : 0,
      endedAtTick: state.tick,
      simTimeS: Math.round(state.simTime),
      hours: hours.length,
      firsts: { ...firsts, tickToS: undefined },
      firstsBySimHour: Object.fromEntries(Object.entries(firsts)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, Math.round((v / TICKS_PER_S / HOUR_S) * 100) / 100])),
      deaths,
      verbs: verbSummary(),
      totals: summarize(),
      economyCurve,
      decisions,
      notes,
      hours_detail: hours,
      wrapError: wrapError ? String(wrapError.message || wrapError) : null,
    };
  }

  function summarize() {
    const agg = {
      shots: 0, damageDealt: 0, damageTaken: 0, killsByPlayer: 0, tetherAttach: 0,
      tetherCut: 0, tetherBroken: 0, docks: 0, undocks: 0, missionsAccepted: 0,
      missionsCompleted: 0, missionsFailed: 0, commoditySoldCr: 0, commoditySoldU: 0,
      commodityBoughtCr: 0, asteroidsMined: 0, salvagePickups: 0, decisions: decisions.length,
      distinctVerbsObserved: 0,
    };
    const allEventTypes = new Set();
    const killCauses = {};
    const sectorVisits = {};
    for (const h of hours) {
      agg.shots += h.shots; agg.damageDealt += Math.round(h.damageDealt);
      agg.damageTaken += Math.round(h.damageTaken); agg.killsByPlayer += h.killsByPlayer;
      agg.tetherAttach += h.tetherAttach; agg.tetherCut += h.tetherCut;
      agg.tetherBroken += h.tetherBroken; agg.docks += h.docks; agg.undocks += h.undocks;
      agg.missionsAccepted += h.missionsAccepted; agg.missionsCompleted += h.missionsCompleted;
      agg.missionsFailed += h.missionsFailed;
      agg.commoditySoldCr += Math.round(h.commoditySoldCr);
      agg.commoditySoldU += h.commoditySoldU;
      agg.commodityBoughtCr += Math.round(h.commodityBoughtCr);
      agg.asteroidsMined += h.asteroidsMined; agg.salvagePickups += h.salvagePickups;
      for (const [k, v] of Object.entries(h.killsByCause)) killCauses[k] = (killCauses[k] || 0) + v;
      for (const [k, v] of Object.entries(h.eventTypes)) allEventTypes.add(k);
      for (const s of h.sectorEnters) sectorVisits[s] = (sectorVisits[s] || 0) + 1;
    }
    agg.killCausesByAll = killCauses;
    agg.sectorVisits = sectorVisits;
    agg.distinctEventTypes = allEventTypes.size;
    agg.chainsByKind = {};
    for (const h of hours) for (const c of h.chains) {
      agg.chainsByKind[c.kind] = (agg.chainsByKind[c.kind] || 0) + 1;
    }
    return agg;
  }

  // Verb sampling: the runner reports the pilot's active-verb set each tick; the ledger keeps
  // per-hour distinct verbs and the share of ticks with at least one verb active.
  const verbHourSets = new Map();
  let verbActiveTicks = 0;
  let verbTotalTicks = 0;
  function sampleVerbs(verbs) {
    verbTotalTicks++;
    const h = Math.floor(state.simTime / HOUR_S);
    if (!verbHourSets.has(h)) verbHourSets.set(h, new Set());
    const set = verbHourSets.get(h);
    for (const v of verbs) set.add(v);
    if (verbs.length > 0) verbActiveTicks++;
  }
  function verbSummary() {
    const perHour = {};
    const all = new Set();
    for (const [h, set] of verbHourSets) {
      perHour[h] = [...set].sort();
      for (const v of set) all.add(v);
    }
    return {
      distinctVerbs: all.size,
      verbsList: [...all].sort(),
      activeTickShare: verbTotalTicks ? Math.round((verbActiveTicks / verbTotalTicks) * 1000) / 1000 : 0,
      perHour,
    };
  }
  return { recordTrade, recordCreditsNoSale, recordDecision, recordNote, sampleVerbs, finish, hoursRef: () => hours };
}

function slim(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
      out[k] = typeof v === 'string' ? v.slice(0, 60) : v;
    } else if (typeof v === 'object' && (v.x != null || v.id != null)) {
      out[k] = v.x != null ? { x: Math.round(v.x), z: Math.round(v.z) } : v.id;
    }
    if (Object.keys(out).length >= 10) break;
  }
  return out;
}
