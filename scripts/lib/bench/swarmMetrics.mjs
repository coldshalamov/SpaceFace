// scripts/lib/bench/swarmMetrics.mjs — PQ-174.00 swarm fun bars from a recorded Crucible run.
//
// Pure. Reads a bench run record (eventTrace + identity fields) and returns named swarm
// metrics. Missing historical telemetry stays null with a reason — never inferred as zero.
// Collision receipts and combat:collateral are never memorable moments. A 90s survivor is
// right-censored, never a run-length-to-death. Player-death traces
// (entity:killed cause='player' + archetype='player') are not hostile kills.

import { SIM_DT } from '../../../src/core/sim.js';

export const SWARM_METRICS_SCHEMA = 'spaceface.swarmMetrics.v1';
export const SWARM_TICK_HZ = 60;
export const SWARM_DEFAULT_CENSOR_SECONDS = 90;
export const SWARM_MOMENT_BURST_WINDOW_S = 2;
export const SWARM_MOMENT_BURST_KILLS = 3;

const PHYSICS_KILL_CAUSES = new Set([
  'collision',
  'impact',
  'knock',
  'crush',
  'throw',
  'slam',
  'environment',
  'hazard',
  'well',
  'repulsor',
  'tether',
  'physics',
  'collateral',
  'mass',
  'bank',
  'machinery',
]);

const NOT_MOMENT_TYPES = new Set([
  'collision:playerKnock',
  'combat:collateral',
  'physics:impact',
  'physics:contact',
]);

const MENU_TYPES = new Set([
  'survival:draftOpened',
  'survival:draftOpen',
  'survival:refitOpened',
  'survival:menuOpened',
  'run:draftOpened',
  'run:refitOpened',
  'run:draftOffered',
  'run:refitOffered',
  'ui:menu',
  'survival:upgradeOffered',
]);

const WAVE_PLANNED_TYPES = new Set([
  'run:wavePlanned',
  'survival:wavePlanned',
  'wave:planned',
]);

const WAVE_COMPLETE_TYPES = new Set([
  'run:waveCleared',
  'survival:waveCleared',
  'run:waveComplete',
  'run:waveCompleted',
  'survival:waveComplete',
  'survival:waveCompleted',
  'wave:complete',
  'wave:completed',
]);

const WAVE_CLEANUP_TYPES = new Set([
  'run:waveCleanup',
  'survival:waveCleanup',
  'wave:cleanup',
  'run:cleanupBegan',
  'run:cleanupEnded',
  'survival:cleanupBegan',
  'survival:cleanupEnded',
]);

const HOSTILE_SPAWN_TYPES = new Set([
  'entity:spawned',
  'hostile:spawned',
  'spawn:hostile',
  'wave:spawn',
  'survival:hostileSpawned',
  'run:hostileSpawned',
]);

const KILL_TYPES = new Set([
  'entity:killed',
  'combat:kill',
  'combat:killed',
]);

const UNAVAILABLE_FIRST_HOSTILE =
  'raw first-hostile spawn was not captured on this trace; wave:planned is not a spawn';
const UNAVAILABLE_DEATH_CAUSE =
  'player death cause and telegraph evidence were not captured on this historical trace';
const UNAVAILABLE_MENUS =
  'menu / draft / refit openings were not captured on this historical trace';
const UNAVAILABLE_TELEGRAPH =
  'in-force telegraph evidence requires a causal attacker sampled at death; not on this trace';

/**
 * Derive PQ-174 swarm bars from one Crucible bench run record.
 *
 * @param {object} run  A `toRunRecord` / simulate result with eventTrace, simSeconds, stopReason.
 * @returns {object} Named swarm metric group. Unobserved historical fields are null + reason.
 */
export function measureSwarmRun(run = {}) {
  const trace = Array.isArray(run.eventTrace) ? run.eventTrace : [];
  const simSeconds = finiteNumber(run.simSeconds)
    ?? ticksToSeconds(run.ticks)
    ?? 0;
  const ticks = Number.isFinite(run.ticks) ? (run.ticks | 0) : Math.round(simSeconds / SIM_DT);
  const stopReason = run.stopReason || null;
  const censoredAtCap = isRightCensored(stopReason, simSeconds, ticks);

  const events = trace.map(normalizeEvent).filter(Boolean);
  const kills = events.filter(isHostileKill);
  const playerDeathsRaw = events.filter(isPlayerDeathKill);
  const verbs = events.filter((e) => e.type === 'verb:used' && e.data?.verb);
  const wavePlanned = events.filter((e) => WAVE_PLANNED_TYPES.has(e.type));
  const waveComplete = events.filter((e) => WAVE_COMPLETE_TYPES.has(e.type));
  const waveCleanup = events.filter((e) => WAVE_CLEANUP_TYPES.has(e.type));
  const menuEvents = events.filter((e) => MENU_TYPES.has(e.type) || isMenuLike(e));
  const hostileSpawns = events.filter(isHostileSpawnEvent);

  const firstKillEvent = kills[0] || null;
  const firstHostileEvent = hostileSpawns[0] || null;
  const telemetry = readTelemetry(events, run);

  const firstKill = firstKillEvent
    ? timedObservation(firstKillEvent, { source: 'entity:killed hostile' })
    : unavailableObservation(
      kills.length === 0 && simSeconds > 0
        ? 'no hostile entity:killed on this trace'
        : 'no hostile kill recorded',
    );

  const firstHostile = firstHostileEvent
    ? timedObservation(firstHostileEvent, { source: firstHostileEvent.type })
    : unavailableObservation(
      telemetry.firstHostile
        ? 'capture was armed; no hostile spawn observed on this run'
        : UNAVAILABLE_FIRST_HOSTILE,
    );

  const verbSet = uniqueVerbs(verbs);
  const minutes = simSeconds > 0 ? simSeconds / 60 : 0;
  const verbUseRate = minutes > 0 ? verbs.length / minutes : 0;
  const verbDiversityRate = minutes > 0 ? verbSet.length / minutes : 0;

  const moments = collectMeaningfulMoments(kills);
  const momentsPerMinute = minutes > 0 ? moments.length / minutes : 0;

  const waveDurations = measureWaveDurations({
    planned: wavePlanned,
    complete: waveComplete,
    simSeconds,
    ticks,
    censoredAtCap,
    stopReason,
  });
  const cleanupDurations = measureCleanupDurations({
    planned: wavePlanned,
    complete: waveComplete,
    cleanup: waveCleanup,
    simSeconds,
  });
  const quietAfterWave1 = measureQuietSecondsAfterWave1({
    waveDurations,
    events,
    kills,
    verbs,
    moments,
    simSeconds,
  });

  const occupancy = Array.isArray(run.occupancyTrace) ? run.occupancyTrace : [];
  const clearBreath = measureClearBreath({
    events,
    kills,
    occupancy,
    waveDurations,
    simSeconds,
  });

  const playerDeaths = measurePlayerDeaths(playerDeathsRaw, events, run);
  const firstDeath = measureFirstDeath({
    playerDeaths,
    playerDeathsRaw,
    stopReason,
    simSeconds,
    censoredAtCap,
    events,
  });

  const menus = measureMenus(menuEvents, waveDurations, wavePlanned, telemetry.menus);
  const buildIdentity = measureBuildIdentity(run);
  const quotaFromTrace = readQuota(events, wavePlanned);
  const killTimes = kills.map((k) => k.seconds);
  const killNAt = (n) => {
    if (kills.length < n) return null;
    return round6(kills[n - 1].seconds);
  };

  return {
    schema: SWARM_METRICS_SCHEMA,
    loadoutId: run.loadoutId ?? null,
    seed: run.seed ?? null,
    arenaId: run.arenaId ?? null,
    stopReason,
    simSeconds: round6(simSeconds),
    ticks,
    censored: censoredAtCap,
    firstHostile,
    firstKill,
    verbs: {
      used: verbSet,
      diversity: verbSet.length,
      uses: verbs.length,
      useRatePerMinute: round6(verbUseRate),
      diversityPerMinute: round6(verbDiversityRate),
    },
    meaningfulMoments: moments,
    momentsPerMinute: round6(momentsPerMinute),
    quietSecondsAfterWave1: quietAfterWave1,
    clearBreath,
    playerDeaths,
    buildIdentity,
    waveDurations,
    cleanupDurations,
    menus,
    firstDeath,
    kills: {
      hostile: kills.length,
      playerDeathsExcluded: playerDeathsRaw.length,
      timesSeconds: killTimes.map(round6),
      kill15AtSeconds: killNAt(15),
      killNAtSeconds: Object.fromEntries(
        [1, 3, 5, 10, 15, 19, 22].filter((n) => kills.length >= n)
          .map((n) => [String(n), killNAt(n)]),
      ),
    },
    quotaFromTrace,
    notes: {
      collisionReceiptsAreNotMoments: true,
      collateralIsNotAMoment: true,
      survivingCapIsRightCensored: censoredAtCap,
      playerDeathCausePlayerIsNotAHostileKill: true,
    },
  };
}

export function ticksToSeconds(ticks, dt = SIM_DT) {
  const n = Number(ticks);
  if (!Number.isFinite(n)) return null;
  return n * (Number.isFinite(dt) && dt > 0 ? dt : 1 / SWARM_TICK_HZ);
}

export function isRightCensored(stopReason, simSeconds, ticks) {
  if (stopReason === 'player_dead' || stopReason === 'playerDead' || stopReason === 'dead') {
    return false;
  }
  if (stopReason === 'tick_cap' || stopReason === 'tickCap' || stopReason === 'time_cap'
    || stopReason === 'duration' || stopReason === 'wave_target' || stopReason === 'waveTarget') {
    return true;
  }
  const seconds = finiteNumber(simSeconds) ?? ticksToSeconds(ticks) ?? 0;
  // A survivor who ran the full window is right-censored even if the reason string is missing.
  return seconds >= SWARM_DEFAULT_CENSOR_SECONDS - 1e-6 && stopReason !== 'player_dead';
}

export function isPlayerDeathKill(event) {
  if (!event || !KILL_TYPES.has(event.type)) return false;
  const d = event.data || {};
  if (d.archetype === 'player' && d.cause === 'player') return true;
  if (d.archetype === 'player' && (d.victimIsPlayer === true || d.entityId === 'player' || d.id === 'player')) {
    return true;
  }
  return false;
}

export function isHostileKill(event) {
  if (!event || !KILL_TYPES.has(event.type)) return false;
  if (isPlayerDeathKill(event)) return false;
  const d = event.data || {};
  // Bench ingest stamps player death as cause='player'. That is the victim fingerprint,
  // not "killed by the player" — hostile kills use weapon/collision/ai/verb.
  if (d.cause === 'player') return false;
  if (d.archetype === 'player') return false;
  if (d.faction === 'player' && d.role === 'player') return false;
  return true;
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type || raw.ev || raw.event || null;
  if (!type) return null;
  const tick = Number.isFinite(raw.tick) ? (raw.tick | 0) : null;
  const data = raw.data ?? raw.payload ?? {};
  const seconds = Number.isFinite(raw.seconds)
    ? raw.seconds
    : (tick != null ? ticksToSeconds(tick) : null);
  return { type, tick, seconds, data };
}

function isHostileSpawnEvent(event) {
  if (!event) return false;
  if (!HOSTILE_SPAWN_TYPES.has(event.type)) return false;
  const d = event.data || {};
  if (d.archetype === 'player' || d.faction === 'player' || d.role === 'player') return false;
  if (d.side === 'player' || d.isPlayer === true) return false;
  // A spawn event with no side/faction still counts as a hostile arrival when the type says so.
  return true;
}

function isMenuLike(event) {
  const type = event.type || '';
  if (type.includes('draft') && (type.includes('open') || type.includes('offer'))) return true;
  if (type.includes('refit') && type.includes('open')) return true;
  return false;
}

function timedObservation(event, extra = {}) {
  return {
    available: true,
    seconds: round6(event.seconds),
    tick: event.tick,
    reason: null,
    ...extra,
  };
}

function unavailableObservation(reason) {
  return {
    available: false,
    seconds: null,
    tick: null,
    reason,
  };
}

function uniqueVerbs(verbEvents) {
  const seen = [];
  const set = new Set();
  for (const e of verbEvents) {
    const v = String(e.data.verb);
    if (!set.has(v)) {
      set.add(v);
      seen.push(v);
    }
  }
  return seen;
}

function collectMeaningfulMoments(kills) {
  const moments = [];
  const usedInBurst = new Set();

  // Burst: ≥3 hostile kills inside 2 s, coalesced once per cluster.
  for (let i = 0; i < kills.length; i++) {
    if (usedInBurst.has(i)) continue;
    const start = kills[i].seconds ?? 0;
    const cluster = [i];
    for (let j = i + 1; j < kills.length; j++) {
      const t = kills[j].seconds ?? 0;
      if (t - start <= SWARM_MOMENT_BURST_WINDOW_S) cluster.push(j);
      else break;
    }
    // Extend the cluster to a greedy 2s window from the first unused kill, then require ≥3.
    if (cluster.length >= SWARM_MOMENT_BURST_KILLS) {
      for (const idx of cluster) usedInBurst.add(idx);
      const last = kills[cluster[cluster.length - 1]];
      moments.push({
        kind: 'kill_burst',
        seconds: round6(start),
        tick: kills[i].tick,
        killCount: cluster.length,
        windowSeconds: SWARM_MOMENT_BURST_WINDOW_S,
        untilSeconds: round6(last.seconds),
      });
    }
  }

  // Attributed physics kills (not already the only signal of a burst, but they may coexist).
  for (let i = 0; i < kills.length; i++) {
    const k = kills[i];
    if (!isAttributedPhysicsKill(k)) continue;
    moments.push({
      kind: 'physics_kill',
      seconds: round6(k.seconds),
      tick: k.tick,
      cause: k.data?.cause ?? k.data?.killCause ?? null,
      source: k.data?.source ?? k.data?.weaponId ?? null,
    });
  }

  moments.sort((a, b) => (a.seconds ?? 0) - (b.seconds ?? 0));
  return moments;
}

export function isAttributedPhysicsKill(kill) {
  const d = kill.data || {};
  const cause = String(d.cause || d.killCause || d.via || '').toLowerCase();
  if (PHYSICS_KILL_CAUSES.has(cause)) return true;
  if (d.physics === true || d.attributed === 'physics') return true;
  const source = String(d.source || d.weaponId || d.verb || '').toLowerCase();
  if (source.includes('concussion') || source.includes('shove') || source.includes('well')
    || source.includes('tether') || source.includes('whip') || source.includes('throw')
    || source.includes('repulsor')) {
    return true;
  }
  return false;
}

/**
 * Hostile-kill split for the PQ-137.05 kit-order clause. Gun kills are hostile kills that are
 * not physics-attributed — a Pulse grind cannot hide inside the physics kit's total.
 */
export function countKitKills(eventTrace) {
  const events = (Array.isArray(eventTrace) ? eventTrace : []).map(normalizeEvent).filter(Boolean);
  const kills = events.filter(isHostileKill);
  let physics = 0;
  for (const kill of kills) {
    if (isAttributedPhysicsKill(kill)) physics += 1;
  }
  return {
    hostile: kills.length,
    physics,
    gun: kills.length - physics,
  };
}

function measureWaveDurations({ planned, complete, simSeconds, ticks, censoredAtCap, stopReason }) {
  const starts = indexByWave(planned);
  const ends = indexByWave(complete);
  const waves = new Set([...starts.keys(), ...ends.keys()]);
  if (waves.size === 0) {
    return [];
  }
  const out = [];
  const ordered = [...waves].sort((a, b) => a - b);
  for (const wave of ordered) {
    const startEv = starts.get(wave);
    const endEv = ends.get(wave);
    const startS = startEv?.seconds ?? 0;
    if (endEv && Number.isFinite(endEv.seconds)) {
      out.push({
        wave,
        status: 'completed',
        startSeconds: round6(startS),
        endSeconds: round6(endEv.seconds),
        durationSeconds: round6(endEv.seconds - startS),
        startTick: startEv?.tick ?? null,
        endTick: endEv.tick ?? null,
      });
      continue;
    }
    // No complete event: the wave is still open at stop. Right-censor at the recorded stop,
    // never call a 90s survivor a death.
    const endS = simSeconds;
    out.push({
      wave,
      status: 'censored',
      startSeconds: round6(startS),
      endSeconds: round6(endS),
      durationSeconds: round6(endS - startS),
      startTick: startEv?.tick ?? null,
      endTick: Number.isFinite(ticks) ? ticks : null,
      censorReason: censoredAtCap
        ? 'run reached the tick cap with this wave still open (right-censored)'
        : (stopReason === 'player_dead'
          ? 'player died before this wave completed (right-censored at death)'
          : 'wave still open at run stop (right-censored)'),
    });
  }
  return out;
}

function measureCleanupDurations({ planned, complete, cleanup, simSeconds }) {
  if (complete.length === 0 && cleanup.length === 0) return [];
  const out = [];
  const nextPlanned = planned.slice().sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

  if (cleanup.length) {
    const began = cleanup.filter((e) => /began|start|cleanup$/i.test(e.type) || e.data?.phase === 'begin');
    const ended = cleanup.filter((e) => /ended|end/i.test(e.type) || e.data?.phase === 'end');
    if (began.length && ended.length) {
      for (let i = 0; i < Math.min(began.length, ended.length); i++) {
        const b = began[i];
        const e = ended[i];
        out.push({
          wave: waveOf(b) ?? waveOf(e) ?? i + 1,
          status: 'completed',
          durationSeconds: round6((e.seconds ?? 0) - (b.seconds ?? 0)),
          durationTicks: (e.tick ?? 0) - (b.tick ?? 0),
          startTick: b.tick,
          endTick: e.tick,
        });
      }
      return out;
    }
  }

  // Fallback: quota-met / wave-complete → next wave planned. Matches the 46-tick cleanup
  // observed when a complete event is followed by the next wave:planned.
  for (const done of complete) {
    const wave = waveOf(done);
    const next = nextPlanned.find((p) => (waveOf(p) ?? 0) === (wave ?? 0) + 1 && (p.tick ?? 0) >= (done.tick ?? 0));
    if (!next) {
      out.push({
        wave: wave ?? null,
        status: 'censored',
        durationSeconds: null,
        durationTicks: null,
        reason: 'cleanup still open at run stop (right-censored)',
        simSecondsAtStop: round6(simSeconds),
      });
      continue;
    }
    out.push({
      wave: wave ?? null,
      status: 'completed',
      durationSeconds: round6((next.seconds ?? 0) - (done.seconds ?? 0)),
      durationTicks: (next.tick ?? 0) - (done.tick ?? 0),
      startTick: done.tick,
      endTick: next.tick,
    });
  }
  return out;
}

const PRESSURE_TELEGRAPH_TYPES = new Set([
  'swarm:pressureTelegraph',
  'swarm:reinforcementTelegraph',
]);
const PRESSURE_SPEND_TYPES = new Set([
  'swarm:pressureSpend',
  'run:waveMaterialized',
]);

export const SWARM_CLEAR_BREATH_KILLS = 3;
export const SWARM_CLEAR_BREATH_SECONDS = 4;

function measureClearBreath({ events, kills, occupancy, waveDurations, simSeconds }) {
  const waves = Array.isArray(waveDurations) ? waveDurations : [];
  const occ = Array.isArray(occupancy) ? occupancy : [];
  const telegraphs = (events || []).filter((e) => PRESSURE_TELEGRAPH_TYPES.has(e.type));
  const spends = (events || []).filter((e) => {
    if (PRESSURE_SPEND_TYPES.has(e.type) === false) return false;
    if (e.type === 'run:waveMaterialized') return e.data?.reinforcement === true && (e.data?.admitted || 0) > 0;
    return (e.data?.count || 0) > 0 || e.data?.spent > 0;
  });

  const perWave = [];
  const waveNums = waves.length
    ? waves.map((w) => w.wave)
    : [...new Set([
      ...kills.map((k) => waveOf(k)).filter((n) => Number.isInteger(n)),
      ...telegraphs.map((e) => waveOf(e)).filter((n) => Number.isInteger(n)),
      1,
    ])];

  for (const wave of [...new Set(waveNums)].sort((a, b) => a - b)) {
    const waveRow = waves.find((w) => w.wave === wave) || null;
    const windowStart = waveRow?.startSeconds ?? 0;
    const windowEnd = waveRow?.endSeconds ?? simSeconds;
    const breath = findBreathInWave({
      wave,
      kills: kills.filter((k) => {
        const w = waveOf(k);
        if (Number.isInteger(w)) return w === wave;
        const t = k.seconds;
        return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
      }),
      occupancy: occ.filter((s) => {
        if (Number.isInteger(s.wave) && s.wave !== wave) return false;
        const t = Number.isFinite(s.seconds) ? s.seconds : ticksToSeconds(s.tick);
        return Number.isFinite(t) && t >= windowStart && t <= windowEnd + 1e-6;
      }),
      telegraphs: telegraphs.filter((e) => (waveOf(e) ?? wave) === wave),
      spends: spends.filter((e) => (waveOf(e) ?? wave) === wave),
      windowStart,
      windowEnd,
    });
    perWave.push(breath);
  }

  const hits = perWave.filter((b) => b.met === true);
  if (hits.length > 0) {
    return {
      available: true,
      met: true,
      seconds: hits[0].emptierSeconds,
      wavesMet: hits.map((b) => b.wave),
      perWave,
      reason: null,
    };
  }

  if (occ.length === 0 && telegraphs.length === 0 && spends.length === 0) {
    return {
      available: false,
      met: false,
      seconds: null,
      wavesMet: [],
      perWave,
      reason: 'no occupancy samples or pressure-telegraph events on this trace; quiet-after-wave-1 is a different bar',
    };
  }

  return {
    available: true,
    met: false,
    seconds: perWave.reduce((best, b) => {
      const n = b.emptierSeconds;
      if (!Number.isFinite(n)) return best;
      return best == null ? n : Math.max(best, n);
    }, null),
    wavesMet: [],
    perWave,
    reason: null,
  };
}

function findBreathInWave({ wave, kills, occupancy, telegraphs, spends, windowStart, windowEnd }) {
  const burst = findKillBurst(kills, SWARM_CLEAR_BREATH_KILLS, SWARM_MOMENT_BURST_WINDOW_S);
  if (occupancy.length >= 2 && burst) {
    const after = burst.untilSeconds;
    const beforeList = occupancy.filter((s) => sampleSeconds(s) <= burst.seconds);
    const beforeSample = beforeList.length ? beforeList[beforeList.length - 1] : null;
    const beforeAlive = beforeSample && Number.isFinite(beforeSample.alive)
      ? beforeSample.alive
      : null;
    const afterAlive = occupancy.find((s) => sampleSeconds(s) >= after);
    const floor = afterAlive && Number.isFinite(afterAlive.alive)
      ? afterAlive.alive
      : (beforeAlive != null ? beforeAlive - burst.killCount : null);
    if (floor != null && beforeAlive != null && floor < beforeAlive) {
      const holdEnd = after + SWARM_CLEAR_BREATH_SECONDS;
      const during = occupancy.filter((s) => {
        const t = sampleSeconds(s);
        return t > after && t <= holdEnd;
      });
      const maxDuring = during.reduce((m, s) => Math.max(m, s.alive ?? 0), floor);
      const emptier = maxDuring <= floor + 1;
      const spent = occupancy.some((s) => {
        const t = sampleSeconds(s);
        return t > holdEnd && t <= holdEnd + 1.5 && (s.alive ?? 0) >= floor + 2;
      });
      let emptierSeconds = 0;
      if (during.length) {
        const thin = during.filter((s) => (s.alive ?? 0) <= floor + 1);
        const lastThin = thin.length ? thin[thin.length - 1] : null;
        if (lastThin) emptierSeconds = round6(sampleSeconds(lastThin) - after);
      }
      if (emptier && emptierSeconds >= SWARM_CLEAR_BREATH_SECONDS - 0.05) {
        return {
          wave,
          met: true,
          emptierSeconds: round6(Math.max(emptierSeconds, SWARM_CLEAR_BREATH_SECONDS)),
          killBurstAt: round6(burst.seconds),
          spent: spent === true,
          source: 'occupancy',
        };
      }
      return {
        wave,
        met: false,
        emptierSeconds: round6(emptierSeconds),
        killBurstAt: round6(burst.seconds),
        spent: spent === true,
        source: 'occupancy',
      };
    }
  }

  const tg = telegraphs[0];
  const spend = spends.find((e) => (e.seconds ?? 0) >= (tg?.seconds ?? 0) + SWARM_CLEAR_BREATH_SECONDS - 0.05);
  if (tg && spend) {
    const dt = round6((spend.seconds ?? 0) - (tg.seconds ?? 0));
    return {
      wave,
      met: dt >= SWARM_CLEAR_BREATH_SECONDS - 0.05,
      emptierSeconds: dt,
      killBurstAt: round6(tg.seconds),
      spent: true,
      source: 'telegraph',
    };
  }

  if (tg && !spend) {
    const open = round6((windowEnd ?? tg.seconds) - tg.seconds);
    return {
      wave,
      met: false,
      emptierSeconds: open,
      killBurstAt: round6(tg.seconds),
      spent: false,
      source: 'telegraph',
    };
  }

  return {
    wave,
    met: false,
    emptierSeconds: null,
    killBurstAt: burst ? round6(burst.seconds) : null,
    spent: false,
    source: occupancy.length ? 'occupancy' : (kills.length ? 'kills' : 'none'),
  };
}

function findKillBurst(kills, minKills, windowS) {
  for (let i = 0; i < kills.length; i++) {
    const start = kills[i].seconds ?? 0;
    const cluster = [kills[i]];
    for (let j = i + 1; j < kills.length; j++) {
      const t = kills[j].seconds ?? 0;
      if (t - start <= windowS) cluster.push(kills[j]);
      else break;
    }
    if (cluster.length >= minKills) {
      const last = cluster[cluster.length - 1];
      return {
        seconds: start,
        untilSeconds: last.seconds ?? start,
        killCount: cluster.length,
      };
    }
  }
  return null;
}

function sampleSeconds(sample) {
  if (Number.isFinite(sample?.seconds)) return sample.seconds;
  return ticksToSeconds(sample?.tick) ?? 0;
}

function measureQuietSecondsAfterWave1({ waveDurations, events, kills, verbs, moments, simSeconds }) {
  const w1 = waveDurations.find((w) => w.wave === 1);
  if (!w1 || w1.status !== 'completed') {
    return {
      available: false,
      seconds: null,
      reason: w1
        ? 'wave 1 did not complete; quiet-after-wave-1 is undefined on a censored opener'
        : 'wave 1 completion was not observed on this trace',
    };
  }
  const start = w1.endSeconds;
  const end = simSeconds;
  if (!(end > start)) {
    return { available: true, seconds: 0, reason: null };
  }
  const activity = [
    ...kills.map((e) => e.seconds),
    ...verbs.map((e) => e.seconds),
    ...moments.map((m) => m.seconds),
    ...events.filter((e) => e.type === 'player:shot').map((e) => e.seconds),
  ].filter((t) => Number.isFinite(t) && t >= start && t <= end);

  // Count whole seconds after wave 1 with no kill, verb, moment, or shot.
  let quiet = 0;
  const lo = Math.ceil(start);
  const hi = Math.floor(end);
  for (let s = lo; s < hi; s++) {
    const hit = activity.some((t) => t >= s && t < s + 1);
    if (!hit) quiet += 1;
  }
  return { available: true, seconds: quiet, reason: null, windowStartSeconds: round6(start), windowEndSeconds: round6(end) };
}

function measurePlayerDeaths(playerDeathsRaw, events, run) {
  if (playerDeathsRaw.length === 0) {
    if (run.stopReason === 'player_dead') {
      // Death happened but the historical kill payload does not name a cause/telegraph.
      return [{
        available: true,
        seconds: round6(finiteNumber(run.simSeconds) ?? 0),
        tick: Number.isFinite(run.ticks) ? run.ticks : null,
        cause: null,
        causeAvailable: false,
        causeReason: UNAVAILABLE_DEATH_CAUSE,
        telegraph: null,
        telegraphAvailable: false,
        telegraphReason: UNAVAILABLE_TELEGRAPH,
        attacker: null,
      }];
    }
    return [];
  }
  return playerDeathsRaw.map((e) => {
    const d = e.data || {};
    const attacker = d.attackerId ?? d.killerId ?? d.sourceId ?? d.by ?? null;
    const namedCause = decodePlayerDeathCause(d);
    const telegraph = decodeTelegraph(d, events, e);
    return {
      available: true,
      seconds: round6(e.seconds),
      tick: e.tick,
      cause: namedCause.value,
      causeAvailable: namedCause.available,
      causeReason: namedCause.reason,
      telegraph: telegraph.value,
      telegraphAvailable: telegraph.available,
      telegraphReason: telegraph.reason,
      attacker,
      rawCauseField: d.cause ?? null,
    };
  });
}

function decodePlayerDeathCause(data) {
  const cause = data.cause;
  // `cause: 'player'` is the victim fingerprint, not the named killer. Do not report it as
  // the death cause and do not invent one from lastAction.
  if (cause == null || cause === 'player') {
    const attackerKind = data.attackerArchetype ?? data.killerArchetype ?? data.sourceArchetype ?? null;
    const named = data.deathCause ?? data.namedCause ?? data.killReason ?? null;
    if (named && named !== 'player') {
      return { available: true, value: String(named), reason: null };
    }
    if (attackerKind && attackerKind !== 'player') {
      return { available: true, value: String(attackerKind), reason: null };
    }
    if (data.lastAction) {
      return {
        available: false,
        value: null,
        reason: 'lastAction is not a causal death cause and was not used',
      };
    }
    return { available: false, value: null, reason: UNAVAILABLE_DEATH_CAUSE };
  }
  return { available: true, value: String(cause), reason: null };
}

function decodeTelegraph(data, events, deathEvent) {
  const attacker = data.attackerId ?? data.killerId ?? data.sourceId ?? null;
  if (data.telegraphed === true || data.telegraphInForce === true || data.telegraph === true) {
    if (!attacker) {
      return {
        available: false,
        value: null,
        reason: 'telegraph flag without a causal attacker is treated as unknown',
      };
    }
    return {
      available: true,
      value: data.telegraphKind ?? data.telegraphType ?? true,
      reason: null,
      attacker,
    };
  }
  if ((data.telegraphed === false || data.telegraphInForce === false) && attacker != null) {
    return { available: true, value: false, reason: null, attacker };
  }
  if (!attacker) {
    return { available: false, value: null, reason: UNAVAILABLE_TELEGRAPH };
  }
  const inForce = findInForceTelegraph(events, deathEvent, attacker);
  if (inForce) {
    return { available: true, value: inForce.type, reason: null, attacker };
  }
  return { available: false, value: null, reason: UNAVAILABLE_TELEGRAPH };
}

function findInForceTelegraph(events, deathEvent, attackerId) {
  const deathTick = deathEvent.tick ?? Infinity;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if ((e.tick ?? 0) > deathTick) continue;
    if ((e.tick ?? 0) < deathTick - Math.round(2 / SIM_DT)) break;
    const d = e.data || {};
    const id = d.attackerId ?? d.sourceId ?? d.id ?? d.entityId ?? null;
    if (id !== attackerId) continue;
    if (e.type.includes('telegraph') || d.telegraph === true || d.windup === true || d.broadcast === true) {
      return e;
    }
  }
  return null;
}

function measureFirstDeath({ playerDeaths, playerDeathsRaw, stopReason, simSeconds, censoredAtCap }) {
  if (playerDeaths.length > 0) {
    const d = playerDeaths[0];
    return {
      available: true,
      censored: false,
      seconds: d.seconds,
      tick: d.tick,
      reason: null,
    };
  }
  if (playerDeathsRaw.length > 0) {
    const d = playerDeathsRaw[0];
    return {
      available: true,
      censored: false,
      seconds: round6(d.seconds),
      tick: d.tick,
      reason: null,
    };
  }
  if (stopReason === 'player_dead') {
    return {
      available: true,
      censored: false,
      seconds: round6(simSeconds),
      tick: null,
      reason: 'stopReason=player_dead; named cause/telegraph unavailable on this trace',
    };
  }
  if (censoredAtCap) {
    return {
      available: false,
      censored: true,
      seconds: null,
      tick: null,
      reason: `survived to ${round6(simSeconds)}s (right-censored; not a run-length-to-death)`,
    };
  }
  return {
    available: false,
    censored: true,
    seconds: null,
    tick: null,
    reason: 'no player death observed; duration is right-censored at stop',
  };
}

function measureMenus(menuEvents, waveDurations, wavePlanned, armed) {
  if (menuEvents.length === 0 && !armed) {
    return {
      available: false,
      count: null,
      perWave: null,
      reason: UNAVAILABLE_MENUS,
    };
  }
  const wavesObserved = Math.max(waveDurations.length, wavePlanned.length, 1);
  return {
    available: true,
    count: menuEvents.length,
    perWave: round6(menuEvents.length / wavesObserved),
    reason: null,
    events: menuEvents.map((e) => ({
      type: e.type,
      seconds: round6(e.seconds),
      tick: e.tick,
      wave: waveOf(e),
    })),
  };
}

function compactFittedIds(fitted) {
  if (!Array.isArray(fitted)) return [];
  const ids = [];
  for (const item of fitted) {
    if (typeof item === 'string' && item) ids.push(item);
    else if (item && typeof item.defId === 'string' && item.defId) ids.push(item.defId);
  }
  return ids;
}

function measureBuildIdentity(run) {
  const fit = run.fitReceipt && typeof run.fitReceipt === 'object' ? run.fitReceipt : null;
  const body = run.bodyAdmission && typeof run.bodyAdmission === 'object' ? run.bodyAdmission : null;
  const fitted = Array.isArray(fit?.fitted) ? fit.fitted
    : (Array.isArray(fit?.slots) ? fit.slots : null);
  const weapons = Array.isArray(fit?.weapons) ? fit.weapons : null;
  const hull = body?.hullId ?? body?.id ?? fit?.hullId ?? run.hullId ?? null;
  if (!fit && !body && !run.loadoutId && !run.hullId) {
    return {
      available: false,
      loadoutId: null,
      hullId: null,
      fitted: null,
      fittedIds: null,
      code: null,
      reason: 'no fitReceipt / bodyAdmission / loadoutId on this record',
    };
  }
  const fittedIds = compactFittedIds(fitted ?? weapons);
  const loadoutId = run.loadoutId ?? null;
  const codeParts = [loadoutId, hull, fittedIds.length ? fittedIds.join('+') : null].filter(Boolean);
  return {
    available: true,
    loadoutId,
    hullId: hull,
    fitted: fitted ?? weapons ?? null,
    fittedIds,
    code: codeParts.length ? codeParts.join('/') : (loadoutId || hull || null),
    fitReceiptPresent: Boolean(fit),
    bodyAdmissionPresent: Boolean(body),
    reason: null,
  };
}

function readTelemetry(events, run) {
  const flag = run && run.swarmTelemetry && typeof run.swarmTelemetry === 'object'
    ? run.swarmTelemetry
    : null;
  const mark = events.find((e) => e.type === 'swarm:telemetry');
  const channels = new Set(
    Array.isArray(mark?.data?.channels) ? mark.data.channels : [],
  );
  const armed = (name, aliases = []) => {
    if (flag && flag[name] === true) return true;
    if (channels.has(name)) return true;
    return aliases.some((a) => channels.has(a));
  };
  return {
    firstHostile: armed('firstHostile', ['hostile:spawned']),
    menus: armed('menus', ['run:draftOffered', 'run:refitOffered']),
    deathTelegraph: armed('deathTelegraph', ['player:death-telegraph']),
  };
}

function readQuota(events, wavePlanned) {
  for (const e of [...wavePlanned, ...events]) {
    const q = e.data?.quota ?? e.data?.plan?.quota ?? e.data?.swarm?.quota ?? null;
    if (Number.isInteger(q) && q > 0) {
      return { available: true, wave: waveOf(e) ?? 1, quota: q, reason: null };
    }
  }
  return { available: false, wave: null, quota: null, reason: 'quota was not on wave:planned payload in this trace' };
}

function indexByWave(events) {
  const map = new Map();
  for (const e of events) {
    const w = waveOf(e);
    if (!Number.isInteger(w)) continue;
    if (!map.has(w)) map.set(w, e);
  }
  return map;
}

function waveOf(event) {
  const d = event?.data || {};
  const w = d.wave ?? d.waveIndex ?? d.n ?? null;
  const n = Number(w);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round6(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1e6) / 1e6;
}

export const SWARM_UNAVAILABLE = Object.freeze({
  firstHostile: UNAVAILABLE_FIRST_HOSTILE,
  deathCause: UNAVAILABLE_DEATH_CAUSE,
  menus: UNAVAILABLE_MENUS,
  telegraph: UNAVAILABLE_TELEGRAPH,
});

function shortReason(reason, fallback = 'unobserved') {
  const text = String(reason || fallback).replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function fmtNa(obs, fallback = 'unobserved') {
  return `n/a(${shortReason(obs?.reason, fallback)})`;
}

function fmtObs(obs, suffix = 's') {
  if (!obs || obs.available !== true || obs.seconds == null) return fmtNa(obs);
  return `${obs.seconds}${suffix}`;
}

function formatBuildBar(id) {
  if (!id || id.available !== true) return fmtNa(id, 'no fitReceipt / bodyAdmission / loadoutId on this record');
  if (id.code) return id.code;
  const fitted = Array.isArray(id.fittedIds) && id.fittedIds.length
    ? id.fittedIds.join('+')
    : null;
  const parts = [id.loadoutId, id.hullId, fitted].filter(Boolean);
  return parts.length ? parts.join('/') : fmtNa({ reason: 'build identity present but empty' });
}

function formatVerbBar(verbs) {
  if (!verbs || typeof verbs !== 'object') return 'n/a(verbs were not on this record)';
  return `${verbs.diversity ?? 0}@${verbs.useRatePerMinute ?? 0}/min`;
}

function formatMomentBar(swarm) {
  if (swarm.momentsPerMinute == null && !Array.isArray(swarm.meaningfulMoments)) {
    return 'n/a(moments were not on this record)';
  }
  const count = Array.isArray(swarm.meaningfulMoments) ? swarm.meaningfulMoments.length : 0;
  const rate = swarm.momentsPerMinute ?? 0;
  return `${count}@${rate}/min`;
}

function formatQuietBar(quiet) {
  if (!quiet || quiet.available !== true) return fmtNa(quiet, 'wave 1 completion was not observed on this trace');
  return String(quiet.seconds);
}

function formatMenuBar(menus) {
  if (!menus || menus.available !== true) return fmtNa(menus, UNAVAILABLE_MENUS);
  return `${menus.count}@${menus.perWave}/wave`;
}

function formatDeathBar(swarm) {
  const death = swarm.firstDeath;
  if (death?.censored) {
    const at = Number.isFinite(swarm.simSeconds) ? `@${swarm.simSeconds}s` : '';
    return `censored${at}(${shortReason(death.reason, 'right-censored; not a run-length-to-death')})`;
  }
  if (death?.available) return `${death.seconds}s`;
  return fmtNa(death, 'no player death observed');
}

function formatCauseBits(playerDeaths) {
  const pd = Array.isArray(playerDeaths) ? playerDeaths : [];
  if (pd.length === 0) return 'none';
  return pd.map((d) => {
    const cause = d.causeAvailable ? d.cause : fmtNa({ reason: d.causeReason }, UNAVAILABLE_DEATH_CAUSE);
    const tg = d.telegraphAvailable ? String(d.telegraph) : fmtNa({ reason: d.telegraphReason }, UNAVAILABLE_TELEGRAPH);
    return `cause=${cause},telegraph=${tg}`;
  }).join(';');
}

function formatWaveBar(waveDurations) {
  if (!Array.isArray(waveDurations) || waveDurations.length === 0) {
    return 'n/a(no wave duration observed)';
  }
  return waveDurations.map((w) => {
    const dur = w.status === 'completed' ? `${w.durationSeconds}s` : `censored:${w.durationSeconds}s`;
    return `w${w.wave}:${w.status}/${dur}`;
  }).join(',');
}

function formatCleanupBar(cleanupDurations) {
  if (!Array.isArray(cleanupDurations) || cleanupDurations.length === 0) {
    return 'n/a(no cleanup interval observed)';
  }
  return cleanupDurations.map((c) => {
    if (c.status !== 'completed' || c.durationSeconds == null) {
      return `w${c.wave}:n/a(${shortReason(c.reason, 'cleanup still open at run stop (right-censored)')})`;
    }
    return `w${c.wave}:${c.durationTicks ?? '?'}t/${c.durationSeconds}s`;
  }).join(',');
}

/** One-line swarm bars for a live bench run. Unavailable stays n/a with a reason, never a fake zero. */
export function formatSwarmBars(swarm) {
  if (!swarm) return '[swarm-bars] (none)';
  const pd = swarm.playerDeaths || [];
  const build = formatBuildBar(swarm.buildIdentity);
  const loadout = swarm.loadoutId || swarm.buildIdentity?.loadoutId || 'n/a';
  return (
    `[swarm-bars] loadout=${loadout} build=${build} seed=${swarm.seed ?? '?'} `
    + `firstHostile=${fmtObs(swarm.firstHostile)} firstKill=${fmtObs(swarm.firstKill)} `
    + `verbs=${formatVerbBar(swarm.verbs)} `
    + `moments=${formatMomentBar(swarm)} `
    + `quietAfterW1=${formatQuietBar(swarm.quietSecondsAfterWave1)} `
    + `deaths=${pd.length}(${formatCauseBits(pd)}) `
    + `waves=${formatWaveBar(swarm.waveDurations)} `
    + `cleanup=${formatCleanupBar(swarm.cleanupDurations)} `
    + `menus=${formatMenuBar(swarm.menus)} `
    + `firstDeath=${formatDeathBar(swarm)}`
  );
}
