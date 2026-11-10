#!/usr/bin/env node
// scripts/check-playtest-gates.mjs
// Evaluates ALPHA/BETA numeric gates from telemetry playtest reports (PQ-167 Leaf .02).
// Computes completion %, verbs/hour, session-2 return, and prints the §15.1 release gate rows.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { buildSessionReportData } from '../src/observability/sessionReport.js';
import { auditWeeklyPlaytests, validatePlaytestSession } from './run-weekly-playtest.mjs';

const RECEIPTS_PLAYTESTS_DIR = path.resolve('design/program/roadmap/receipts/playtests');

function usage() {
  console.log(`Usage:
  node scripts/check-playtest-gates.mjs [--dir <path>] [--json] [--verbose]
  npm run check:playtest:gates

Options:
  --dir <path>    Directory of session JSON files (default: design/program/roadmap/receipts/playtests/)
  --json          Output gate metrics as structured JSON
  --verbose       Print detailed breakdown for each individual playtest session
  -h, --help      Show this message
`);
}

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      dir: { type: 'string' },
      json: { type: 'boolean' },
      verbose: { type: 'boolean' },
    },
  }));
} catch (error) {
  console.error(`check-playtest-gates: ${error.message}`);
  process.exit(2);
}

if (values.help) {
  usage();
  process.exit(0);
}

/**
 * Loads and builds structured report data for all playtest sessions in directory.
 * @param {string} dir Path to directory containing session JSON files
 * @returns {Array<object>} Array of structured session report data
 */
export function loadPlaytestReports(dir = RECEIPTS_PLAYTESTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f.includes('session')).sort();
  const reports = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const session = JSON.parse(raw);
      if (validatePlaytestSession(session, dir).ok) {
        reports.push(buildSessionReportData(session));
      }
    } catch (_err) {
      // skip unreadable file
    }
  }

  return reports;
}

/**
 * Computes release gates metrics from a collection of session reports.
 * @param {Array<object>} reports List of structured session reports
 * @returns {object} Computed gate metrics and status
 */
export function computePlaytestGates(reports) {
  const sessionCount = reports.length;
  if (sessionCount === 0) {
    return {
      sessionCount: 0,
      totalPlaytimeHours: 0,
      completionRate: 0,
      verbsPerHour: 0,
      session2ReturnRate: 0,
      totalPlaytimeMs: 0, totalPlaytimeMinutes: 0, totalVerbs: 0, verbsPerMinute: 0,
      targets: { alphaCompletion: 80, alphaVerbsPerHour: 240, betaSession2Return: 60 },
      funnelStepRates: {},
      deathCauses: {},
      gates: {
        alpha: { passed: false, reasons: ['No playtest sessions found'] },
        beta: { passed: false, reasons: ['No playtest sessions found'] },
      },
    };
  }

  let totalPlaytimeMs = 0;
  let totalVerbs = 0;
  const funnelCounts = {
    firstFlight: 0,
    firstSwing: 0,
    firstShove: 0,
    firstDock: 0,
    firstHeat: 0,
    firstTrade: 0,
    firstMine: 0,
    firstKill: 0,
    first1000cr: 0,
    firstModule: 0,
  };
  let coreCompletedSessions = 0;
  const deathCauses = {};

  for (const rep of reports) {
    totalPlaytimeMs += rep.durationMs || 0;
    totalVerbs += rep.verbs.totalCount || 0;

    // Track funnel milestones
    let sessionCorePass = true;
    for (const step of rep.funnel.steps) {
      if (step.reached && funnelCounts[step.step] != null) {
        funnelCounts[step.step] += 1;
      }
    }

    if (rep.funnel.firstHourComplete) {
      coreCompletedSessions += 1;
    }

    // Accumulate death causes
    for (const [cause, count] of Object.entries(rep.combat.deathsByCause || {})) {
      deathCauses[cause] = (deathCauses[cause] || 0) + count;
    }
  }

  const totalPlaytimeHours = Math.max(0.001, totalPlaytimeMs / 3600000);
  const verbsPerHour = Math.round((totalVerbs / totalPlaytimeHours) * 10) / 10;
  const verbsPerMinute = Math.round((totalVerbs / (totalPlaytimeMs / 60000)) * 100) / 100;

  // 1. Completion %: Percentage of playtests achieving the core first-hour loop (PQ-163 / §15.1)
  const completionRate = Math.round((coreCompletedSessions / sessionCount) * 1000) / 10;

  const funnelStepRates = {};
  for (const [key, count] of Object.entries(funnelCounts)) {
    funnelStepRates[key] = Math.round((count / sessionCount) * 1000) / 10;
  }

  // 2. Session-2 Return Rate: Derived dynamically from playtest cohort retention or returning player sessions
  let session2ReturnRate = 0.0;
  const cohortsSeen = new Map();
  for (const rep of reports) {
    const c = rep.cohort;
    if (c && c.cohortId && Number.isFinite(c.testersTotal) && c.testersTotal > 0) {
      if (!cohortsSeen.has(c.cohortId)) {
        cohortsSeen.set(c.cohortId, {
          total: c.testersTotal,
          returned: Number.isFinite(c.testersReturnedSession2) ? c.testersReturnedSession2 : 0,
        });
      }
    }
  }

  if (cohortsSeen.size > 0) {
    let sumTotal = 0;
    let sumReturned = 0;
    for (const c of cohortsSeen.values()) {
      sumTotal += c.total;
      sumReturned += c.returned;
    }
    session2ReturnRate = sumTotal > 0 ? Math.round((sumReturned / sumTotal) * 1000) / 10 : 0.0;
  } else {
    // Group by testerId / playerId to compute proportion of returning testers
    const testerSessions = new Map();
    for (const rep of reports) {
      const id = rep.testerId || rep.playerId;
      if (id) {
        testerSessions.set(id, (testerSessions.get(id) || 0) + 1);
      }
    }
    if (testerSessions.size > 0) {
      let returningCount = 0;
      for (const count of testerSessions.values()) {
        if (count >= 2) returningCount += 1;
      }
      session2ReturnRate = Math.round((returningCount / testerSessions.size) * 1000) / 10;
    } else {
      session2ReturnRate = null; // Anonymous sessions cannot establish return behavior.
    }
  }

  // Gate evaluation thresholds per §15.1
  const ALPHA_COMPLETION_TARGET = 80.0; // ≥ 80% unaided completion
  const ALPHA_VERBS_TARGET = 240.0;     // ≥ 240 verbs/hr (4.0 verbs/min)
  const BETA_RETURN_TARGET = 60.0;      // ≥ 60% session-2 return rate

  const alphaPass = completionRate >= ALPHA_COMPLETION_TARGET && verbsPerHour >= ALPHA_VERBS_TARGET;
  const betaPass = session2ReturnRate >= BETA_RETURN_TARGET;

  return {
    sessionCount,
    totalPlaytimeMs,
    totalPlaytimeHours: Math.round(totalPlaytimeHours * 10) / 10,
    totalPlaytimeMinutes: Math.round((totalPlaytimeMs / 60000) * 10) / 10,
    totalVerbs,
    verbsPerHour,
    verbsPerMinute,
    completionRate,
    session2ReturnRate,
    funnelStepRates,
    deathCauses,
    targets: {
      alphaCompletion: ALPHA_COMPLETION_TARGET,
      alphaVerbsPerHour: ALPHA_VERBS_TARGET,
      betaSession2Return: BETA_RETURN_TARGET,
    },
    gates: {
      alpha: {
        passed: alphaPass,
        completionPass: completionRate >= ALPHA_COMPLETION_TARGET,
        verbsPass: verbsPerHour >= ALPHA_VERBS_TARGET,
      },
      beta: {
        passed: betaPass,
        returnPass: session2ReturnRate >= BETA_RETURN_TARGET,
      },
    },
  };
}

/**
 * Formats the §15.1 release gates table for display.
 * @param {object} metrics Computed playtest gate metrics
 * @param {Array<object>} reports Loaded reports
 * @returns {string} Formatted output
 */
export function formatSection15Rows(metrics, reports = [], audit = null) {
  return [
    'SPACEFACE RELEASE GATES (§15.1) — TELEMETRY SUBSET',
    'Milestone: ALPHA — "The Toy Works" [overall milestone unmeasured]',
    '  First ten minutes power fantasy (PQ-163): unaided completion is not established by funnel presence alone.',
    '  Core funnel completion: ' + metrics.completionRate + '% (target ≥ 80%)',
    '  Physical verbs rate: ' + metrics.verbsPerHour + '/hour (target ≥ 240)',
    'Milestone: BETA — "The World Works" [overall milestone unmeasured]',
    '  Session-2 return rate: ' + (metrics.session2ReturnRate === null ? 'unmeasured' : metrics.session2ReturnRate + '%') + ' (target ≥ 60%)',
    'Milestone: RELEASE — "It Ships" [overall milestone unmeasured]',
    '  Telemetry funnels and weekly playtest loop (PQ-167): ' + (audit?.ok ? 'four observed consecutive weeks' : 'pending observed weekly sessions'),
    '  Admitted sessions: ' + metrics.sessionCount + '; playtime: ' + metrics.totalPlaytimeMinutes + ' minutes',
    'Other §15.1 gates require their own player-route evidence; this report does not mark them met.',
  ].join('\n');
}

// CLI Execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const dir = values.dir ? path.resolve(values.dir) : RECEIPTS_PLAYTESTS_DIR;
  const reports = loadPlaytestReports(dir);
  const metrics = computePlaytestGates(reports);

  const audit = auditWeeklyPlaytests(dir);
  if (values.json) {
    console.log(JSON.stringify({ ...metrics, weeklyPlaytests: { ok: audit.ok, issues: audit.issues } }, null, 2));
  } else {
    console.log(formatSection15Rows(metrics, reports, audit));
  }

  // Evidence gaps remain visible and cannot produce a passing gate.
  if (!audit.ok) {
    console.warn('\n[check:playtest:gates] Warning: playtest receipt audit noted issues:');
    for (const issue of audit.issues) {
      console.warn(`  - ${issue}`);
    }
  }

  process.exit(audit.ok && metrics.gates.alpha.passed && metrics.gates.beta.passed ? 0 : 1);
}
