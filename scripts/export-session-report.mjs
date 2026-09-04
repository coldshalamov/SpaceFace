#!/usr/bin/env node
// scripts/export-session-report.mjs
// Exports JSON + one-page Markdown telemetry reports for any saved session (PQ-167 Leaf .00).
// Local-only, opt-in upload later, no PII.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  buildSessionReportData,
  renderSessionReportMarkdown,
  exportSessionReportJson,
} from '../src/observability/sessionReport.js';

function usage() {
  console.log(`Usage:
  node scripts/export-session-report.mjs --file <path-to-session.json> [--format md|json|both] [--out <dir>]
  node scripts/export-session-report.mjs --session <sessionId> [--storage <path>] [--format md|json|both] [--out <dir>]
  node scripts/export-session-report.mjs --latest [--storage <path>] [--format md|json|both] [--out <dir>]
  node scripts/export-session-report.mjs --demo [--format md|json|both] [--out <dir>]

Options:
  --file <path>       Path to JSON file containing a session or { sessions: [...] }
  --session <id>      Session ID to export from storage
  --latest            Export the most recent session from storage
  --storage <path>    Path to telemetry JSON file or localStorage dump
  --out <dir>         Output directory for exported report files
  --format <type>     Output format: 'md', 'json', or 'both' (default: 'both')
  --demo              Generate and export a sample representative playtest session
  -h, --help          Show this message
`);
}



export function createDemoSession(overrides = {}) {
  const now = Date.now();
  return {
    schema: 1,
    sessionId: overrides.sessionId || `demo_session_${now.toString(36)}`,
    startedAt: now - 2700000, // 45 minutes ago
    endedAt: now,
    durationMs: 2700000,
    trades: {
      buy: 4,
      sell: 8,
      byCommodity: {
        cmdty_ore_common: { buy: 0, sell: 6, qty: 32 },
        cmdty_components_basic: { buy: 3, sell: 2, qty: 10 },
        cmdty_fuel_cell: { buy: 1, sell: 0, qty: 4 },
      },
    },
    credits: {
      earned: 14500,
      spent: 4200,
      byReason: {
        'trade:sell': { earned: 8500, spent: 0 },
        'bounty': { earned: 4000, spent: 0 },
        'mission:completed': { earned: 2000, spent: 0 },
        'service:repair': { earned: 0, spent: 1200 },
        'outfitting:module': { earned: 0, spent: 3000 },
      },
    },
    kills: {
      total: 7,
      byVictimClass: { fighter: 5, scout: 2 },
      byFaction: { faction_reach: 4, faction_pirates: 3 },
    },
    deaths: {
      total: 2,
      byCause: { 'ship:fighter': 1, 'collision:asteroid': 1 },
    },
    ore: {
      unitsTotal: 48,
      byType: { cmdty_ore_common: 36, cmdty_ore_rare: 12 },
    },
    missions: {
      accepted: 3,
      completed: 2,
      failed: 1,
      expired: 0,
      byType: {
        cargo_delivery: { accepted: 2, completed: 2, failed: 0, expired: 0 },
        bounty_hunt: { accepted: 1, completed: 0, failed: 1, expired: 0 },
      },
    },
    progression: {
      techResearched: 2,
      factionTierUps: 1,
      techNodes: ['tech_cargo_racks', 'tech_kinetic_drivers'],
      tierUps: [{ atMs: 1850000, factionId: 'faction_scn', newTier: 'trusted' }],
    },
    navigation: {
      docks: 5,
      jumps: 2,
      sectorsVisited: ['sector_helios_prime', 'sector_ceres_belt'],
    },
    verbs: {
      thrust: 142,
      brake: 38,
      boost: 24,
      latch: 18,
      reel: 12,
      release: 16,
      throw: 4,
      shove: 15,
      well: 3,
      stroke: 8,
      fire: 64,
      dock: 5,
      mine: 14,
      trade: 12,
      jump: 2,
      ...(overrides.verbs || {}),
    },
    funnel: {
      firstFlightAt: 12000,        // 12s
      firstSwingAt: 95000,         // 1m 35s
      firstShoveAt: 240000,        // 4m 00s
      firstDockAt: 420000,         // 7m 00s
      firstHeatAt: 780000,         // 13m 00s
      firstTradeAt: 540000,
      firstMineAt: 320000,
      firstKillAt: 610000,
      firstMissionAcceptAt: 680000,
      firstMissionCompleteAt: 1120000,
      firstJumpAt: 1540000,
      firstTierUpAt: 1850000,
      first1000crAt: 560000,
      firstModuleAt: 890000,
      ...(overrides.funnel || {}),
    },
    deathLog: [
      {
        atMs: 820000,
        simTime: 820,
        cause: 'ship:fighter',
        killerId: 104,
        killerType: 'fighter',
        killerFaction: 'faction_reach',
        pos: { x: 120, z: -450 },
        lifespanMs: 820000,
      },
      {
        atMs: 1980000,
        simTime: 1980,
        cause: 'collision:asteroid',
        killerId: null,
        killerType: 'asteroid',
        killerFaction: null,
        pos: { x: -840, z: 230 },
        lifespanMs: 1160000,
      },
    ],
    ...overrides,
    synthetic: true,
    evidenceKind: 'demo',
  };
}

export function loadSession(options = {}) {
  if (options.demo) {
    return createDemoSession();
  }

  if (options.file) {
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Malformed or truncated JSON in session file: ${err.message}`);
    }
    if (parsed && parsed.sessionId) return parsed;
    if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
      if (options.session) {
        const found = parsed.sessions.find((s) => s && s.sessionId === options.session);
        if (found) return found;
        throw new Error(`Session ID "${options.session}" not found in file: ${options.file}`);
      }
      return parsed.sessions[parsed.sessions.length - 1];
    }
    if (parsed && parsed.session && parsed.session.sessionId) return parsed.session;
    throw new Error(`File does not contain a valid session record: ${options.file}`);
  }

  if (options.storage) {
    const storagePath = path.resolve(options.storage);
    if (!fs.existsSync(storagePath)) {
      throw new Error(`Storage file does not exist: ${storagePath}`);
    }
    let parsed;
    try {
      const raw = fs.readFileSync(storagePath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Malformed or truncated JSON in storage file: ${err.message}`);
    }
    let sessions = [];
    if (Array.isArray(parsed)) {
      sessions = parsed;
    } else if (parsed && Array.isArray(parsed.sessions)) {
      sessions = parsed.sessions;
    } else if (parsed && parsed.sf_telemetry_v1 && Array.isArray(parsed.sf_telemetry_v1.sessions)) {
      sessions = parsed.sf_telemetry_v1.sessions;
    }
    if (sessions.length === 0) {
      throw new Error(`No sessions found in storage file: ${options.storage}`);
    }
    if (options.session) {
      const found = sessions.find((s) => s && s.sessionId === options.session);
      if (found) return found;
      throw new Error(`Session ID "${options.session}" not found in storage: ${options.storage}`);
    }
    return sessions[sessions.length - 1];
  }

  if (options.session || options.latest) {
    const receiptsDir = path.resolve('design/program/roadmap/receipts/playtests');
    if (fs.existsSync(receiptsDir)) {
      const jsonFiles = fs.readdirSync(receiptsDir).filter((f) => f.endsWith('.json')).sort();
      if (jsonFiles.length > 0) {
        if (options.session) {
          for (const f of jsonFiles) {
            try {
              const fullPath = path.join(receiptsDir, f);
              const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
              if (data && (data.sessionId === options.session || f.includes(options.session))) {
                return data;
              }
            } catch (_err) {}
          }
          throw new Error(`Session ID "${options.session}" not found in playtests directory.`);
        }
        const latestFile = jsonFiles[jsonFiles.length - 1];
        try {
          return JSON.parse(fs.readFileSync(path.join(receiptsDir, latestFile), 'utf8'));
        } catch (err) {
          throw new Error(`Failed reading latest session file (${latestFile}): ${err.message}`);
        }
      }
    }
    throw new Error(`No saved playtest sessions found to satisfy --${options.session ? 'session' : 'latest'}`);
  }

  // Fallback demo session if no file/storage was specified
  return createDemoSession();
}

export function exportReport(session, options = {}) {
  const format = options.format || 'both';
  const outDir = options.out ? path.resolve(options.out) : null;
  const data = buildSessionReportData(session);
  const markdown = renderSessionReportMarkdown(data);
  const json = exportSessionReportJson(data);

  if (outDir) {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const baseName = session.sessionId || 'session';
    if (format === 'md' || format === 'both') {
      const mdPath = path.join(outDir, `${baseName}.md`);
      fs.writeFileSync(mdPath, markdown, 'utf8');
      console.log(`Exported Markdown report: ${mdPath}`);
    }
    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(outDir, `${baseName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
      console.log(`Exported JSON report: ${jsonPath}`);
    }
  } else {
    if (format === 'json') {
      console.log(JSON.stringify(json, null, 2));
    } else if (format === 'md') {
      console.log(markdown);
    } else {
      console.log(markdown);
      console.log('\n--- JSON DATA ---\n');
      console.log(JSON.stringify(json, null, 2));
    }
  }

  return { data, markdown, json };
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        file: { type: 'string' },
        session: { type: 'string' },
        latest: { type: 'boolean' },
        storage: { type: 'string' },
        out: { type: 'string' },
        format: { type: 'string', default: 'both' },
        demo: { type: 'boolean' },
      },
    }));
  } catch (error) {
    console.error(`export-session-report: ${error.message}`);
    process.exit(2);
  }

  if (values.help) {
    usage();
    process.exit(0);
  }

  try {
    const session = loadSession(values);
    exportReport(session, values);
  } catch (err) {
    console.error(`export-session-report: error - ${err.message}`);
    process.exit(1);
  }
}
