// src/observability/sessionReport.js
// Session report generator and telemetry funnel analytics (PQ-167 Leaf .00).
// Pure data transformation: no PII, no network, no window/DOM dependencies.

export const FUNNEL_TARGETS_S = {
  firstFlight: 60,       // 1 minute
  firstSwing: 180,       // 3 minutes
  firstShove: 300,       // 5 minutes
  firstDock: 600,        // 10 minutes
  firstHeat: 900,        // 15 minutes
  firstTrade: 720,       // 12 minutes
  firstMine: 480,        // 8 minutes
  firstKill: 600,        // 10 minutes
  firstMissionAccept: 780,
  firstMissionComplete: 1200,
  firstJump: 1500,       // 25 minutes
  firstTierUp: 1800,      // 30 minutes
  first1000cr: 900,      // 15 minutes
  firstModule: 1200,     // 20 minutes
};

export const FUNNEL_LABELS = {
  firstFlight: 'First Flight (Thrust / Propulsion)',
  firstSwing: 'First Swing (Tether Latch / Release)',
  firstShove: 'First Shove (Concussion / Repulsor / Impact)',
  firstDock: 'First Station Dock',
  firstHeat: 'First Heat (Wanted Escalation)',
  firstTrade: 'First Commodity Trade',
  firstMine: 'First Ore Mined',
  firstKill: 'First Enemy Kill',
  firstMissionAccept: 'First Mission Accepted',
  firstMissionComplete: 'First Mission Completed',
  firstJump: 'First Hyperspace Jump',
  firstTierUp: 'First Faction Tier-Up',
  first1000cr: 'First 1,000 Credits Earned',
  firstModule: 'First Module Fitted / Acquired',
};

export const CORE_FIRST_HOUR_STEPS = [
  'firstFlight',
  'firstSwing',
  'firstShove',
  'firstDock',
  'firstHeat',
];

/**
 * Formats a millisecond duration into human-readable MM:SS or HH:MM:SS string.
 * @param {number} ms Duration in milliseconds
 * @returns {string} Formatted string
 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/**
 * Builds structured report data with derived analytics from raw session aggregates.
 * @param {object} session Raw session or serialized session object
 * @returns {object} Structured session report data
 */
export function buildSessionReportData(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('[sessionReport] Invalid session object passed to buildSessionReportData');
  }

  const s = session;
  const startedAt = s.startedAt || 0;
  const endedAt = s.endedAt || startedAt;
  const durationMs = Number.isFinite(s.durationMs) && s.durationMs > 0
    ? s.durationMs
    : Math.max(0, endedAt - startedAt);

  const durationHours = Math.max(0.00028, durationMs / 3600000); // at least ~1 second in hours
  const durationMinutes = Math.max(0.0166, durationMs / 60000);

  // 1. Funnel analysis
  const rawFunnel = s.funnel || {};
  const funnelSteps = [
    { key: 'firstFlight', at: rawFunnel.firstFlightAt },
    { key: 'firstSwing', at: rawFunnel.firstSwingAt },
    { key: 'firstShove', at: rawFunnel.firstShoveAt },
    { key: 'firstDock', at: rawFunnel.firstDockAt },
    { key: 'firstHeat', at: rawFunnel.firstHeatAt },
    { key: 'firstTrade', at: rawFunnel.firstTradeAt },
    { key: 'firstMine', at: rawFunnel.firstMineAt },
    { key: 'firstKill', at: rawFunnel.firstKillAt },
    { key: 'firstMissionAccept', at: rawFunnel.firstMissionAcceptAt },
    { key: 'firstMissionComplete', at: rawFunnel.firstMissionCompleteAt },
    { key: 'firstJump', at: rawFunnel.firstJumpAt },
    { key: 'firstTierUp', at: rawFunnel.firstTierUpAt },
    { key: 'first1000cr', at: rawFunnel.first1000crAt },
    { key: 'firstModule', at: rawFunnel.firstModuleAt },
  ].map(({ key, at }) => {
    const reached = Number.isFinite(at) && at >= 0;
    const atMs = reached ? at : null;
    const atSeconds = reached ? Math.round(at / 1000) : null;
    const targetSeconds = FUNNEL_TARGETS_S[key] || 600;
    const onPace = reached ? atSeconds <= targetSeconds : false;
    return {
      step: key,
      label: FUNNEL_LABELS[key] || key,
      reached,
      atMs,
      atSeconds,
      atFormatted: reached ? formatDuration(at) : 'Not Reached',
      targetSeconds,
      targetFormatted: formatDuration(targetSeconds * 1000),
      onPace,
    };
  });

  const coreSteps = funnelSteps.filter((step) => CORE_FIRST_HOUR_STEPS.includes(step.step));
  const coreReachedCount = coreSteps.filter((step) => step.reached).length;
  const coreCompletionRate = Math.round((coreReachedCount / CORE_FIRST_HOUR_STEPS.length) * 1000) / 10;

  // 2. Physical Verbs analysis
  const rawVerbs = s.verbs || {};
  const verbCounts = { ...rawVerbs };
  let totalVerbs = 0;
  let distinctVerbs = 0;

  for (const [verb, count] of Object.entries(verbCounts)) {
    const c = Number.isFinite(count) ? Math.max(0, count) : 0;
    verbCounts[verb] = c;
    totalVerbs += c;
    if (c > 0) distinctVerbs += 1;
  }

  const verbsPerHour = durationMs > 0 ? Math.round((totalVerbs / durationHours) * 10) / 10 : 0;
  const verbsPerMinute = durationMs > 0 ? Math.round((totalVerbs / durationMinutes) * 100) / 100 : 0;

  // 3. Combat analysis
  const kills = s.kills || {};
  const deaths = s.deaths || {};
  const deathLog = Array.isArray(s.deathLog) ? s.deathLog : [];
  const deathCauses = { ...(deaths.byCause || {}) };

  // 4. Economy analysis
  const trades = s.trades || {};
  const credits = s.credits || {};
  const ore = s.ore || {};
  const missions = s.missions || {};
  const navigation = s.navigation || {};
  const progression = s.progression || {};

  const creditsEarned = credits.earned || 0;
  const creditsSpent = credits.spent || 0;
  const netCredits = creditsEarned - creditsSpent;

  return {
    schemaVersion: 1,
    sessionId: s.sessionId || 'unknown',
    startedAt,
    startedDate: startedAt ? new Date(startedAt).toISOString() : 'N/A',
    endedAt,
    endedDate: endedAt ? new Date(endedAt).toISOString() : 'N/A',
    durationMs,
    durationFormatted: formatDuration(durationMs),
    durationMinutes: Math.round(durationMinutes * 10) / 10,
    durationHours: Math.round(durationHours * 100) / 100,

    funnel: {
      steps: funnelSteps,
      coreReachedCount,
      coreTotalCount: CORE_FIRST_HOUR_STEPS.length,
      coreCompletionRate,
      firstHourComplete: coreReachedCount === CORE_FIRST_HOUR_STEPS.length,
    },

    verbs: {
      totalCount: totalVerbs,
      distinctCount: distinctVerbs,
      verbsPerHour,
      verbsPerMinute,
      counts: verbCounts,
    },

    combat: {
      killsTotal: kills.total || 0,
      killsByClass: kills.byVictimClass || {},
      killsByFaction: kills.byFaction || {},
      deathsTotal: deaths.total || 0,
      deathsByCause: deathCauses,
      deathLogCount: deathLog.length,
      deathLogSample: deathLog.slice(-5),
    },

    economy: {
      tradesBuy: trades.buy || 0,
      tradesSell: trades.sell || 0,
      tradesTotal: (trades.buy || 0) + (trades.sell || 0),
      creditsEarned,
      creditsSpent,
      netCredits,
      creditsByReason: credits.byReason || {},
      oreUnitsTotal: ore.unitsTotal || 0,
      oreByType: ore.byType || {},
    },

    missions: {
      accepted: missions.accepted || 0,
      completed: missions.completed || 0,
      failed: missions.failed || 0,
      expired: missions.expired || 0,
      byType: missions.byType || {},
    },

    navigation: {
      docks: navigation.docks || 0,
      jumps: navigation.jumps || 0,
      sectorsVisited: navigation.sectorsVisited || [],
      sectorsVisitedCount: (navigation.sectorsVisited || []).length,
    },

    cohort: s.cohort || null,
    testerId: s.testerId || null,
    playerId: s.playerId || null,
    sessionNumber: s.sessionNumber || null,

    progression: {
      techResearched: progression.techResearched || 0,
      factionTierUps: progression.factionTierUps || 0,
      techNodes: progression.techNodes || [],
      tierUps: progression.tierUps || [],
    },
  };
}

/**
 * Renders a clean one-page Markdown telemetry session report.
 * @param {object} session Raw session or report data
 * @returns {string} One-page Markdown report
 */
export function renderSessionReportMarkdown(session) {
  const data = session && session.schemaVersion === 1 && session.funnel && session.verbs
    ? session
    : buildSessionReportData(session);

  const lines = [];

  lines.push(`# SpaceFace Session Telemetry Report`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| **Session ID** | \`${data.sessionId}\` |`);
  lines.push(`| **Started At** | ${data.startedDate} |`);
  lines.push(`| **Duration** | **${data.durationFormatted}** (${data.durationMinutes} min / ${data.durationHours} hr) |`);
  lines.push(`| **Core First-Hour Gates** | **${data.funnel.coreCompletionRate}%** (${data.funnel.coreReachedCount}/${data.funnel.coreTotalCount} reached) |`);
  lines.push(`| **Physical Verbs / Hour** | **${data.verbs.verbsPerHour}** (${data.verbs.verbsPerMinute} / min, ${data.verbs.distinctCount} distinct) |`);
  lines.push(``);

  lines.push(`## 1. Onboarding Funnel Progression`);
  lines.push(``);
  lines.push(`| Milestone | Reached | Time Offset | Target | On Pace |`);
  lines.push(`|---|:---:|:---:|:---:|:---:|`);
  for (const step of data.funnel.steps) {
    const reachedIcon = step.reached ? 'YES' : 'NO';
    const paceIcon = step.reached ? (step.onPace ? 'PASS' : 'SLOW') : 'PENDING';
    lines.push(`| ${step.label} | ${reachedIcon} | ${step.atFormatted} | ≤ ${step.targetFormatted} | ${paceIcon} |`);
  }
  lines.push(``);

  lines.push(`## 2. Physical Verbs & Rhythm`);
  lines.push(``);
  lines.push(`- **Total Player Verb Activations:** ${data.verbs.totalCount}`);
  lines.push(`- **Physical Verbs / Hour:** ${data.verbs.verbsPerHour} (Benchmark floor: ≥ 240 / hr)`);
  lines.push(`- **Physical Verbs / Minute:** ${data.verbs.verbsPerMinute} (Benchmark floor: ≥ 4.0 / min)`);
  lines.push(`- **Distinct Verbs Used:** ${data.verbs.distinctCount}`);
  lines.push(``);

  const verbEntries = Object.entries(data.verbs.counts).filter(([, c]) => c > 0);
  if (verbEntries.length > 0) {
    lines.push(`| Verb | Activations | Share |`);
    lines.push(`|---|:---:|:---:|`);
    for (const [verb, count] of verbEntries) {
      const share = data.verbs.totalCount > 0
        ? Math.round((count / data.verbs.totalCount) * 1000) / 10
        : 0;
      lines.push(`| \`${verb}\` | ${count} | ${share}% |`);
    }
  } else {
    lines.push(`*No player physical verbs were recorded during this session.*`);
  }
  lines.push(``);

  lines.push(`## 3. Combat & Survivability`);
  lines.push(``);
  lines.push(`- **Player Kills:** ${data.combat.killsTotal}`);
  lines.push(`- **Player Defeats / Deaths:** ${data.combat.deathsTotal}`);
  lines.push(``);

  const deathEntries = Object.entries(data.combat.deathsByCause);
  if (deathEntries.length > 0) {
    lines.push(`| Cause of Death | Occurrences |`);
    lines.push(`|---|:---:|`);
    for (const [cause, count] of deathEntries) {
      lines.push(`| \`${cause}\` | ${count} |`);
    }
  } else {
    lines.push(`*Zero player deaths in this session (Clean survival).*`);
  }
  lines.push(``);

  lines.push(`## 4. Economy, Missions & Navigation`);
  lines.push(``);
  lines.push(`- **Credits:** Earned +${data.economy.creditsEarned.toLocaleString()} cr | Spent -${data.economy.creditsSpent.toLocaleString()} cr | Net: ${data.economy.netCredits.toLocaleString()} cr`);
  lines.push(`- **Trading:** ${data.economy.tradesBuy} buys, ${data.economy.tradesSell} sells (${data.economy.tradesTotal} total trades)`);
  lines.push(`- **Mining:** ${data.economy.oreUnitsTotal} units ore harvested`);
  lines.push(`- **Missions:** ${data.missions.completed} completed, ${data.missions.failed} failed (${data.missions.accepted} accepted)`);
  lines.push(`- **Navigation:** ${data.navigation.docks} docks, ${data.navigation.jumps} jumps across ${data.navigation.sectorsVisitedCount} sector(s)`);
  lines.push(`- **Progression:** ${data.progression.techResearched} tech nodes researched, ${data.progression.factionTierUps} faction tier-ups`);
  lines.push(``);

  lines.push(`## 5. Release Gate Status (§15.1 Alignment)`);
  lines.push(``);
  const alphaFunnelPass = data.funnel.coreCompletionRate >= 80;
  const alphaVerbPass = data.verbs.verbsPerHour >= 240;
  lines.push(`- **ALPHA Solid enough to understand (First 10 min, PQ-163):** ${alphaFunnelPass ? 'PASS' : 'WARN'} (${data.funnel.coreCompletionRate}% unaided completion)`);
  lines.push(`- **ALPHA Permissive enough to abuse (Physical verbs rate):** ${alphaVerbPass ? 'PASS' : 'WARN'} (${data.verbs.verbsPerHour} verbs/hr)`);
  lines.push(``);

  return lines.join('\n');
}

/**
 * Returns structured JSON report.
 * @param {object} session Raw session or report data
 * @returns {object} JSON serializable report object
 */
export function exportSessionReportJson(session) {
  return buildSessionReportData(session);
}

export default {
  buildSessionReportData,
  renderSessionReportMarkdown,
  exportSessionReportJson,
  formatDuration,
  FUNNEL_TARGETS_S,
  FUNNEL_LABELS,
  CORE_FIRST_HOUR_STEPS,
};
