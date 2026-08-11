#!/usr/bin/env node
/**
 * Autonomous thinness / sameiness detector for INFERENCE work.
 *
 * This is NOT the program queue. PQ/NEXT = pre-specified units.
 * INFERENCE = agent runs this (or equivalent), finds what is empty/cheap/samey
 * from shipped data, invents the improvement, implements it, re-runs detect.
 *
 * Metrics are structural (registry diversity). They do not prove fun or A-list art.
 * They do replace "wait for the owner to notice samey/empty."
 */
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { SECTORS } from '../src/data/sectors.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFlag = process.argv.find((a) => a.startsWith('--out='));
const outPath = outFlag ? resolve(ROOT, outFlag.slice('--out='.length)) : null;

function uniq(values) {
  return [...new Set(values.filter((v) => v != null && v !== ''))];
}

function concentration(values) {
  const list = values.filter((v) => v != null && v !== '');
  if (list.length === 0) return { n: 0, unique: 0, topShare: 1, top: null };
  const counts = new Map();
  for (const v of list) counts.set(v, (counts.get(v) || 0) + 1);
  let top = null;
  let topN = 0;
  for (const [k, n] of counts) {
    if (n > topN) { top = k; topN = n; }
  }
  return {
    n: list.length,
    unique: counts.size,
    topShare: topN / list.length,
    top,
  };
}

function scoreGap({ unique, n, topShare, floorUnique, softUnique }) {
  // Higher = more urgent for autonomous improvement.
  let score = 0;
  if (unique < floorUnique) score += (floorUnique - unique) * 20;
  else if (unique < softUnique) score += (softUnique - unique) * 8;
  if (n > 0 && topShare >= 0.45) score += Math.round((topShare - 0.44) * 100);
  if (n > 0 && unique / n < 0.35) score += 15;
  return score;
}

const enemyArchetypes = concentration(ENEMY_TYPES.map((e) => e.aiArchetype));
const enemyDoctrines = concentration(ENEMY_TYPES.map((e) => e.combatDoctrineId));
const enemySilhouettes = concentration(ENEMY_TYPES.map((e) => e.silhouette || e.shipId));
const enemyShips = concentration(ENEMY_TYPES.map((e) => e.shipId));

const jobKinds = Object.values(NPC_JOB_KIND || {});
const jobKindCount = jobKinds.length;

// Ceres (and any) authored jobKinds in activity pockets
let pocketJobKinds = [];
const pocketPath = resolve(ROOT, 'src/data/sectorActivityPockets.js');
if (existsSync(pocketPath)) {
  const text = readFileSync(pocketPath, 'utf8');
  pocketJobKinds = uniq([...text.matchAll(/jobKind:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
}

const hullDir = resolve(ROOT, 'assets/ships/parts/hulls');
const hullGlbs = existsSync(hullDir)
  ? readdirSync(hullDir).filter((f) => f.endsWith('.glb'))
  : [];

const stationIds = uniq(SECTORS.flatMap((s) => (s.stations || []).map((st) => st.id)));
const encounterIds = Object.keys(ENCOUNTERS || {});

const gaps = [
  {
    id: 'enemy_ai_archetypes',
    surface: 'enemy combat roles',
    wf: 'WF-02',
    metric: enemyArchetypes,
    floorUnique: 6,
    softUnique: 10,
    why: 'Hostile AI behaviors look samey when few archetypes cover the roster.',
    how: 'Add or rework enemy types with distinct aiArchetype + combatDoctrineId + silhouette, not only HP/dmg.',
  },
  {
    id: 'enemy_doctrines',
    surface: 'enemy combat roles',
    wf: 'WF-02',
    metric: enemyDoctrines,
    floorUnique: 5,
    softUnique: 9,
    why: 'Combat doctrine concentration → same engagement pattern.',
    how: 'Wire more doctrines into live enemy defs used by directors/spawns.',
  },
  {
    id: 'enemy_silhouettes',
    surface: 'enemy combat roles',
    wf: 'WF-02 / WF-11',
    metric: enemySilhouettes,
    floorUnique: 6,
    softUnique: 12,
    why: 'Shared silhouettes/hulls make factions read as recolors.',
    how: 'Distinct silhouette or wholeship presentation per role family.',
  },
  {
    id: 'npc_job_kinds',
    surface: 'NPC jobs / living activity',
    wf: 'WF-01',
    metric: { n: jobKindCount, unique: jobKindCount, topShare: 0, top: null },
    floorUnique: 6,
    softUnique: 8,
    why: 'Few job graphs → world work looks like one loop with labels.',
    how: 'New jobKind with distinct phase graph + Ceres (or sector) cast wiring.',
  },
  {
    id: 'pocket_job_cast',
    surface: 'sector / pocket activity',
    wf: 'WF-01 / WF-03',
    metric: {
      n: pocketJobKinds.length,
      unique: pocketJobKinds.length,
      topShare: 0,
      top: null,
    },
    floorUnique: 5,
    softUnique: 8,
    why: 'Authored pocket cast uses few jobKinds → empty industrial feel.',
    how: 'More actorSlots with real jobKinds and targets in sectorActivityPockets.',
  },
  {
    id: 'weapons_roster',
    surface: 'weapons / physics tools',
    wf: 'WF-05',
    metric: { n: WEAPONS.length, unique: WEAPONS.length, topShare: 0, top: null },
    floorUnique: 12,
    softUnique: 20,
    why: 'Thin weapon/tool roster limits physical mess variety.',
    how: 'New mechanically distinct weapon/module with multi-use proof.',
  },
  {
    id: 'ship_defs',
    surface: 'ships / builds',
    wf: 'WF-07 / WF-11',
    metric: { n: SHIPS.length, unique: SHIPS.length, topShare: 0, top: null },
    floorUnique: 15,
    softUnique: 25,
    why: 'Few ship defs → progression and traffic feel sparse.',
    how: 'New ship def + role kit or traffic presentation identity.',
  },
  {
    id: 'stations_placed',
    surface: 'stations / places',
    wf: 'WF-04',
    metric: { n: stationIds.length, unique: stationIds.length, topShare: 0, top: null },
    floorUnique: 12,
    softUnique: 20,
    why: 'Few station identities → destinations feel sparse.',
    how: 'New station or embodied place with distinct role (not menu-only).',
  },
  {
    id: 'encounters',
    surface: 'encounters / incidents',
    wf: 'WF-02 / WF-08',
    metric: { n: encounterIds.length, unique: encounterIds.length, topShare: 0, top: null },
    floorUnique: 20,
    softUnique: 40,
    why: 'Thin encounter catalog → freeflight incidents feel rare/same.',
    how: 'New interruptible encounter package on ordinary route.',
  },
  {
    id: 'hull_part_family',
    surface: 'ship/part material craft',
    wf: 'WF-11',
    metric: { n: hullGlbs.length, unique: hullGlbs.length, topShare: 0, top: null },
    floorUnique: 8,
    softUnique: 12,
    why: 'Few hull kits or flat materials → fleet looks cheap.',
    how: 'Material/form pass on existing hull family or new kit with measureable surface response.',
  },
  {
    id: 'modules',
    surface: 'progression / modules',
    wf: 'WF-07',
    metric: { n: MODULES.length, unique: MODULES.length, topShare: 0, top: null },
    floorUnique: 20,
    softUnique: 35,
    why: 'Thin module list → builds lack agency options.',
    how: 'New module with real behavioral hook (not stat-only if possible).',
  },
].map((gap) => {
  const score = scoreGap({
    unique: gap.metric.unique,
    n: gap.metric.n,
    topShare: gap.metric.topShare,
    floorUnique: gap.floorUnique,
    softUnique: gap.softUnique,
  });
  return { ...gap, score };
}).sort((a, b) => b.score - a.score);

const report = {
  schema: 'spaceface.inferenceDetect.v1',
  generatedAt: new Date().toISOString(),
  purpose: 'Autonomous gap find for INFERENCE (not PQ dispatch).',
  summary: {
    gapCount: gaps.length,
    top: gaps.filter((g) => g.score > 0).slice(0, 5).map((g) => g.id),
  },
  snapshots: {
    enemyTypes: ENEMY_TYPES.length,
    enemyArchetypes: enemyArchetypes,
    enemyDoctrines: enemyDoctrines,
    enemySilhouettes: enemySilhouettes,
    enemyShips: enemyShips,
    npcJobKinds: jobKindCount,
    pocketJobKinds,
    weapons: WEAPONS.length,
    ships: SHIPS.length,
    modules: MODULES.length,
    stations: stationIds.length,
    encounters: encounterIds.length,
    hullGlbs: hullGlbs.length,
  },
  gaps,
  agentInstructions: [
    'You are NOT waiting for a human-named unit. PQ owns that door.',
    'Pick the highest-score gap that is not recently piled-on (see INFERENCE_LEDGER).',
    'Invent a concrete improvement that raises unique count or lowers concentration.',
    'Implement through live owners; prove with focused tests; re-run this script; score for that gap should not worsen and should usually improve.',
    'Update INFERENCE_LEDGER +1 for the surface.',
  ],
};

const text = [
  'INFERENCE DETECT (autonomous thinness / sameiness)',
  `enemies=${ENEMY_TYPES.length} archetypes=${enemyArchetypes.unique} doctrines=${enemyDoctrines.unique} silhouettes=${enemySilhouettes.unique}`,
  `jobs kinds=${jobKindCount} pocketJobKinds=${pocketJobKinds.length} [${pocketJobKinds.join(',')}]`,
  `weapons=${WEAPONS.length} ships=${SHIPS.length} stations=${stationIds.length} encounters=${encounterIds.length} hullGlbs=${hullGlbs.length}`,
  '',
  'RANKED GAPS (score>0 first):',
  ...gaps.filter((g) => g.score > 0).map((g) => (
    `  [${String(g.score).padStart(3)}] ${g.id}  wf=${g.wf}  unique=${g.metric.unique}/${g.metric.n}`
    + (g.metric.topShare ? ` top=${g.metric.top}@${(g.metric.topShare * 100).toFixed(0)}%` : '')
    + `\n         why: ${g.why}\n         how: ${g.how}`
  )),
  '',
  'Agent: pick top gap, invent the unit yourself, ship it, re-run detect, tick ledger.',
].join('\n');

console.log(text);
if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${outPath}`);
}
