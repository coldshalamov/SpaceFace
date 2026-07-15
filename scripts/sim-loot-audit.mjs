#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BLUEPRINTS } from '../src/data/blueprints.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';
import { WEAPONS } from '../src/data/weapons.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { combat } from '../src/systems/combat.js';
import {
  formatLootAuditSummary,
  runDepthProgramLootAudit,
} from './lib/depthProgramLootAudit.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(`${ROOT}/design/depth-program/unique-loot-reservations.json`, 'utf8'));
const args = parseArgs(process.argv.slice(2));

const report = runDepthProgramLootAudit({
  runs: args.runs,
  seedStart: args.seedStart,
  manifest,
  declaredWrecks: UNIQUE_WRECKS,
  enemyTypes: ENEMY_TYPES,
  combatRollLoot: combat.rollLoot,
  makeCombatRng: (seed, sourceId) => mulberry32(hash32(seed, 'combat', sourceId)),
  catalogs: {
    blueprints: BLUEPRINTS,
    commodities: COMMODITIES,
    modules: MODULES,
    ships: SHIPS,
    weapons: WEAPONS,
  },
});

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatLootAuditSummary(report));
  console.log('Rarest observed normal drops:');
  for (const row of report.rarestNormalDrops) {
    console.log(`  ${row.enemyId}/${row.itemId}: ${row.hits}/${report.runs} = ${(row.observedRate * 100).toFixed(2)}% (authored ${(row.authoredChance * 100).toFixed(2)}%)`);
  }
  if (report.issues.length) {
    console.error('Issues:');
    for (const row of report.issues) console.error(`  [${row.code}] ${row.path}: ${row.message}`);
  }
}

if (!report.ok) process.exitCode = 1;

function parseArgs(argv) {
  const valueAfter = (flag, fallback) => {
    const at = argv.indexOf(flag);
    if (at < 0 || argv[at + 1] == null) return fallback;
    const value = Number(argv[at + 1]);
    return Number.isInteger(value) ? value : fallback;
  };
  return {
    runs: valueAfter('--runs', 1000),
    seedStart: valueAfter('--seed-start', 1),
    json: argv.includes('--json'),
  };
}
