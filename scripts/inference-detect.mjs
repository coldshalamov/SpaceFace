#!/usr/bin/env node
/**
 * Autonomous INFERENCE director board — structural thinness detection PLUS
 * mode selection so repeated runs cannot collapse onto easy-to-count registries.
 *
 * This is NOT the program queue. PQ/NEXT = pre-specified units.
 * INFERENCE = agent runs this, picks ONE cell of the board, invents the unit,
 * implements it through live owners, records the result in inference-memory.
 *
 * v2 changes (see design/program/INFERENCE_LANES.md):
 * - Structural metrics DETECT; they no longer alone CHOOSE. The board offers
 *   repair / starved / opportunity / integration / recovery cells.
 * - Counts use CONSUMED fields and live (released) assets. Prose fields and
 *   source-only files do not raise breadth; duplicates are defects.
 * - Memory (design/program/inference-memory.json) drives anti-pile-on decay,
 *   starvation scheduling, rejected-idea blocking, and reference rotation.
 *
 * Selection logic lives in scripts/lib/inferenceCore.mjs (pure, tested by
 * test/inference-core.test.mjs). Keep repo-fact gathering here, logic there.
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { SECTORS } from '../src/data/sectors.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';

import {
  uniq, concentration, idBreadth, scoreStructuralGap, liveAssetBreadth,
  normalizeMemory, buildDirectorBoard, resolveScope, slateRequirements,
  objectLiteralKeys, SCOPE_MAP,
} from './lib/inferenceCore.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const outPath = flag('out') ? resolve(ROOT, flag('out')) : null;
const scopeArg = flag('scope');
const nxArg = flag('nx');
const today = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Runtime vocabularies — strings the runtime actually recognizes. An unknown
// combatDoctrineId normalizes to null (behavior silently OFF); an unknown
// silhouette falls back to the default family; an unknown aiArchetype degrades
// to base capabilities. Fabricated strings are DEFECTS, never diversity.
// ---------------------------------------------------------------------------
const recognizedDoctrines = new Set(Object.values(CombatDoctrineId));
const readSrc = (rel) => {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};
const recognizedSilhouettes = new Set(objectLiteralKeys(readSrc('src/render/visualFactory.js'), 'const ENEMY_FAMILY_BUILDERS ='));
const recognizedArchetypes = new Set(objectLiteralKeys(readSrc('src/systems/combat.js'), 'const ARCHETYPE_TACTICAL_CAPABILITIES ='));
const jobKindsWithGraphs = new Set(objectLiteralKeys(readSrc('src/systems/npcJobs.js'), 'const PHASE_GRAPHS ='));

// ---------------------------------------------------------------------------
// Structural facts (live registries; consumed + recognized fields only)
// ---------------------------------------------------------------------------

// Enemy behavior vocabulary: aiDoctrine.defaultActivity + roe are what the AI
// stack actually consumes. The prose `behavior` string has no runtime reader
// and must not count as behavioral breadth.
const enemyBehaviorCombos = concentration(ENEMY_TYPES.map((e) => {
  const d = e.aiDoctrine || {};
  if (!d.defaultActivity && !d.roe) return null;
  return `${d.defaultActivity || '?'}/${d.roe || '?'}`;
}));
const fabricatedDoctrines = uniq(ENEMY_TYPES.map((e) => e.combatDoctrineId))
  .filter((id) => id && !recognizedDoctrines.has(id));
const enemyDoctrines = concentration(ENEMY_TYPES.map((e) => (
  recognizedDoctrines.has(e.combatDoctrineId) ? e.combatDoctrineId : null
)));
const fabricatedSilhouettes = uniq(ENEMY_TYPES.map((e) => e.silhouette))
  .filter((s) => s && recognizedSilhouettes.size > 0 && !recognizedSilhouettes.has(s));
// Unknown silhouette strings render as the fallback family, so they collapse
// onto shipId for counting — matching what the player actually sees.
const enemySilhouettes = concentration(ENEMY_TYPES.map((e) => (
  (e.silhouette && (recognizedSilhouettes.size === 0 || recognizedSilhouettes.has(e.silhouette)))
    ? e.silhouette
    : e.shipId
)));
const fabricatedArchetypes = uniq(ENEMY_TYPES.map((e) => e.aiArchetype))
  .filter((a) => a && recognizedArchetypes.size > 0 && !recognizedArchetypes.has(a));
const telegraphed = ENEMY_TYPES.filter((e) => e.telegraph || e.counterHint).length;

// Enemies never referenced by any encounter spawn recipe (advisory: they may
// still spawn via other owners, but an unreferenced def deserves suspicion).
const encounterText = JSON.stringify(ENCOUNTERS || {});
const unreferencedEnemies = ENEMY_TYPES
  .map((e) => e.id)
  .filter((id) => id && !encounterText.includes(`"${id}"`));

// Job kinds count only when a phase graph exists: an enum-only entry no NPC
// can ever run is a ghost, not living-world breadth.
const jobKindsAll = Object.values(NPC_JOB_KIND || {});
const jobKinds = jobKindsAll.filter((k) => jobKindsWithGraphs.size === 0 || jobKindsWithGraphs.has(k));
const ghostJobKinds = jobKindsAll.filter((k) => jobKindsWithGraphs.size > 0 && !jobKindsWithGraphs.has(k));

// Authored pocket cast — parse with comments stripped so a commented-out
// jobKind cannot raise the count.
let pocketJobKinds = [];
let pocketSectorIds = [];
const pocketPath = resolve(ROOT, 'src/data/sectorActivityPockets.js');
if (existsSync(pocketPath)) {
  const text = readFileSync(pocketPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  pocketJobKinds = uniq([...text.matchAll(/jobKind:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
  pocketSectorIds = uniq([...text.matchAll(/SECTOR_ID\s*=\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
    .concat([...text.matchAll(/sectorId:\s*['"]([^'"]+)['"]/g)].map((m) => m[1])));
}

// Weapons/modules: duplicates are defects; behavior hooks separate mechanism
// breadth from stat-row breadth.
const WEAPON_HOOK_FIELDS = ['continuous', 'splashRadius', 'submunitions', 'deployKind', 'rcsDisruptS', 'impulsePerHit', 'tumbleTorque', 'intercepts', 'statuses', 'beam', 'chargeUp'];
const MODULE_HOOK_FIELDS = ['directToCargo', 'rareOreChance', 'legality', 'salvageOnly', 'unique', 'onHit', 'onDamage', 'active'];
const weaponIds = idBreadth(WEAPONS.map((w) => w.id));
const weaponHookShare = WEAPONS.length
  ? WEAPONS.filter((w) => WEAPON_HOOK_FIELDS.some((f) => w[f] != null && w[f] !== false)).length / WEAPONS.length
  : 0;
const moduleIds = idBreadth(MODULES.map((m) => m.id));
const moduleHookShare = MODULES.length
  ? MODULES.filter((m) => MODULE_HOOK_FIELDS.some((f) => m[f] != null && m[f] !== false)).length / MODULES.length
  : 0;
const shipIds = idBreadth(SHIPS.map((s) => s.id));

const stationIds = uniq(SECTORS.flatMap((s) => (s.stations || []).map((st) => st.id)));

// Encounters count only when SCHEDULABLE: their zoneTypes must intersect a
// zone type actually placed in some sector, and weight must be positive.
// "No matching zone → the shape is simply not schedulable" (encounters.js) —
// an unschedulable row is catalog padding, not incident variety.
const placedZoneTypes = new Set();
for (const entry of Object.values(SECTOR_ZONES || {})) {
  const zones = Array.isArray(entry) ? entry : (entry && entry.zones) || [];
  for (const z of zones) if (z && z.type) placedZoneTypes.add(z.type);
}
const allEncounterKeys = Object.keys(ENCOUNTERS || {});
// weight<=0 shapes are legitimate when another owner direct-fires them
// (unique wrecks, follow-ons). Scan src for references before calling padding.
function collectSourceText(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    try {
      const st = statSync(p);
      if (st.isDirectory()) collectSourceText(p, out);
      else if (entry.endsWith('.js') && !p.endsWith(`data${'\\'}encounters.js`) && !p.endsWith('data/encounters.js')) {
        out.push(readFileSync(p, 'utf8'));
      }
    } catch { /* unreadable entry ignored */ }
  }
  return out;
}
const srcRefText = collectSourceText(resolve(ROOT, 'src'), []).join('\n');
const unschedulableEncounters = allEncounterKeys.filter((key) => {
  const enc = ENCOUNTERS[key] || {};
  const plannerReachable = enc.weight == null || enc.weight > 0;
  const zonesDeclared = Array.isArray(enc.zoneTypes) && enc.zoneTypes.length > 0;
  const zonesPlaced = zonesDeclared && enc.zoneTypes.some((zt) => placedZoneTypes.has(zt));
  if (zonesDeclared && !zonesPlaced) return true; // anchored to nowhere
  if (!plannerReachable && !srcRefText.includes(`'${key}'`) && !srcRefText.includes(`"${key}"`)) return true; // weight 0 and nothing direct-fires it
  return false;
});
const unschedulableSet = new Set(unschedulableEncounters);
const encounterIds = idBreadth(allEncounterKeys.filter((k) => !unschedulableSet.has(k)));

// Hulls: LIVE breadth = present in the release manifest. Source-tree GLBs
// that never reached release are integration debt, not breadth.
const hullDir = resolve(ROOT, 'assets/ships/parts/hulls');
const hullsOnDisk = existsSync(hullDir)
  ? readdirSync(hullDir).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, ''))
  : [];
let hullsReleased = [];
const releaseManifestPath = resolve(ROOT, 'assets/ships/release/release_manifest.json');
if (existsSync(releaseManifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));
    hullsReleased = (manifest.assets || [])
      .filter((a) => a.kind === 'part:hulls')
      .map((a) => a.id);
  } catch { /* tolerated: falls back to zero released, flagged below */ }
}
const hulls = liveAssetBreadth({ onDisk: hullsOnDisk, released: hullsReleased });

// Integration debt: authored-but-unwired inventory. This is the recorded
// promotion-boundary failure class (EXPANSION_PROGRAM §10 item 3).
function countGlbs(dir) {
  let n = 0;
  if (!existsSync(dir)) return 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    try {
      if (statSync(p).isDirectory()) n += countGlbs(p);
      else if (entry.endsWith('.glb')) n += 1;
    } catch { /* unreadable entry ignored */ }
  }
  return n;
}
const incubatorGlbs = countGlbs(resolve(ROOT, 'assets/incubator'));
let microeventCount = 0;
const microeventDir = resolve(ROOT, 'design/incubator/microevent_library/catalog');
if (existsSync(microeventDir)) {
  for (const f of readdirSync(microeventDir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(microeventDir, f), 'utf8'));
      const arr = Array.isArray(j) ? j : (j.events || j.entries || []);
      if (Array.isArray(arr)) microeventCount += arr.length;
    } catch { /* malformed catalog file ignored */ }
  }
}

const integrationDebt = [
  ...(incubatorGlbs > 0 ? [{ id: 'incubator_glbs', count: incubatorGlbs, note: 'assets/incubator/** source GLBs with no runtime consumer. Select + re-author + prove families one at a time; never bulk-promote.' }] : []),
  ...(microeventCount > 0 ? [{ id: 'microevent_catalog', count: microeventCount, note: 'design/incubator/microevent_library events with no runtime consumer. Prove one causal chain before any framework.' }] : []),
  ...(hulls.sourceOnlyCount > 0 ? [{ id: 'source_only_hulls', count: hulls.sourceOnlyCount, note: `hull GLBs on disk but absent from release_manifest: ${hulls.sourceOnly.join(', ')}` }] : []),
];

// ---------------------------------------------------------------------------
// Structural gap list. Each gap names the workflows it can feed (`wfs`) and
// what the metric CANNOT see (`blindSpots`) so agents stop treating a count
// as an experience verdict.
// ---------------------------------------------------------------------------

const gaps = [
  {
    id: 'enemy_behavior_vocabulary',
    surface: 'enemy combat roles',
    wfs: ['WF-02'],
    metric: enemyBehaviorCombos,
    floorUnique: 6,
    softUnique: 10,
    why: 'Few consumed activity/roe combos → engagements resolve the same way regardless of label.',
    how: 'New defaultActivity/roe combination wired through the live AI stack + encounter proof. The prose `behavior` field does not count.',
    blindSpots: 'Cannot see whether combos are readable, fun, or reachable in ordinary play.',
  },
  {
    id: 'enemy_doctrines',
    surface: 'enemy combat roles',
    wfs: ['WF-02'],
    metric: enemyDoctrines,
    floorUnique: 5,
    softUnique: 9,
    why: 'Combat doctrine concentration → same engagement pattern. Only doctrine ids in CombatDoctrineId count; a NEW doctrine means implementing runtime behavior, not inventing a string.',
    how: 'Implement a new doctrine in src/ai/combatDoctrine.js AND wire it into live enemy defs used by directors/spawns.',
    blindSpots: 'A bespoke single-occupant doctrine raises unique without changing most fights.',
  },
  {
    id: 'enemy_silhouettes',
    surface: 'enemy combat roles',
    wfs: ['WF-02', 'WF-11'],
    metric: enemySilhouettes,
    floorUnique: 6,
    softUnique: 12,
    why: 'Shared silhouettes/hulls make factions read as recolors.',
    how: 'Distinct silhouette or wholeship presentation per role family.',
    blindSpots: 'Cannot see whether silhouettes read at the normal camera bands.',
  },
  {
    id: 'npc_job_kinds',
    surface: 'NPC jobs / living activity',
    wfs: ['WF-01'],
    metric: { n: jobKinds.length, unique: jobKinds.length, topShare: 0, top: null },
    floorUnique: 6,
    softUnique: 8,
    why: 'Few job graphs → world work looks like one loop with labels. Only kinds WITH a phase graph count.',
    how: 'New jobKind with a genuinely distinct phase graph + sector cast wiring.',
    blindSpots: 'Cannot see whether work is visible, interruptible, or consequential near the player.',
  },
  {
    id: 'pocket_job_cast',
    surface: 'sector / pocket activity',
    wfs: ['WF-01', 'WF-03'],
    metric: { n: pocketJobKinds.length, unique: pocketJobKinds.length, topShare: 0, top: null },
    floorUnique: 5,
    softUnique: 8,
    why: 'Authored pocket cast uses few jobKinds → empty industrial feel.',
    how: 'More actorSlots with real jobKinds and targets in sectorActivityPockets.',
    blindSpots: 'Counts authored data, not running actors. Comments are excluded; wiring is not proven.',
  },
  {
    id: 'pocket_sector_coverage',
    surface: 'sector / pocket activity',
    wfs: ['WF-03'],
    metric: { n: SECTORS.length, unique: pocketSectorIds.length, topShare: 0, top: pocketSectorIds[0] || null },
    floorUnique: 2,
    softUnique: 6,
    why: `Authored activity pockets exist in ${pocketSectorIds.length}/${SECTORS.length} sectors — everywhere else is a scatter radius.`,
    how: 'Author a pocket for a NON-Ceres sector with its own cast, routes, and identity (contrast, not clone).',
    blindSpots: 'A pocket data block is not a lived pocket; needs route proof.',
  },
  {
    id: 'weapons_roster',
    surface: 'weapons / physics tools',
    wfs: ['WF-05'],
    metric: { n: weaponIds.n, unique: weaponIds.unique, topShare: 0, top: null },
    floorUnique: 12,
    softUnique: 20,
    extraScore: weaponHookShare < 0.5 ? 15 : 0,
    why: `Thin mechanism variety limits physical mess. Behavioral-hook share: ${(weaponHookShare * 100).toFixed(0)}% (stat-only rows are not mechanisms).`,
    how: 'New mechanically distinct weapon/tool with multi-use proof — impulse, field, deploy, status; not damage-number reskins.',
    blindSpots: 'Cannot see whether a weapon creates new tactics in ordinary play.',
  },
  {
    id: 'ship_defs',
    surface: 'ships / builds',
    wfs: ['WF-07', 'WF-11'],
    metric: { n: shipIds.n, unique: shipIds.unique, topShare: 0, top: null },
    floorUnique: 15,
    softUnique: 25,
    why: 'Few ship defs → progression and traffic feel sparse.',
    how: 'New ship def + role kit or traffic presentation identity.',
    blindSpots: 'A stat row is not a capability milestone; ships are pure stat records today.',
  },
  {
    id: 'stations_placed',
    surface: 'stations / places',
    wfs: ['WF-04'],
    metric: { n: stationIds.length, unique: stationIds.length, topShare: 0, top: null },
    floorUnique: 12,
    softUnique: 20,
    why: 'Few station identities → destinations feel sparse.',
    how: 'New station or embodied place with distinct role (not menu-only).',
    blindSpots: 'Cannot distinguish an embodied destination from a menu entrance.',
  },
  {
    id: 'encounters',
    surface: 'encounters / incidents',
    wfs: ['WF-02', 'WF-08'],
    metric: { n: encounterIds.n, unique: encounterIds.unique, topShare: 0, top: null },
    floorUnique: 20,
    softUnique: 40,
    why: 'Thin encounter catalog → freeflight incidents feel rare/same.',
    how: 'New interruptible encounter package on ordinary route.',
    blindSpots: 'Catalog size says nothing about trigger frequency or variety in play.',
  },
  {
    id: 'hull_part_family_live',
    surface: 'ship/part material craft',
    wfs: ['WF-11'],
    metric: { n: hullsOnDisk.length, unique: hulls.liveCount, topShare: 0, top: null },
    floorUnique: 8,
    softUnique: 12,
    why: `Live (released) hull kits: ${hulls.liveCount}; source-only: ${hulls.sourceOnlyCount}. Only released assets count.`,
    how: 'Material/form pass on an existing released family, or new kit taken all the way through release + runtime identity.',
    blindSpots: 'Release presence is not an art verdict; G-gates and normal-camera review still apply.',
  },
  {
    id: 'modules',
    surface: 'progression / modules',
    wfs: ['WF-07'],
    metric: { n: moduleIds.n, unique: moduleIds.unique, topShare: 0, top: null },
    floorUnique: 20,
    softUnique: 35,
    extraScore: moduleHookShare < 0.25 ? 10 : 0,
    why: `Thin module list limits build agency. Behavioral-hook share: ${(moduleHookShare * 100).toFixed(0)}% — stat-mod rows dominate.`,
    how: 'New module with a real behavioral hook (not stat-only if possible).',
    blindSpots: 'Cannot see whether a module changes what the player DOES.',
  },
].map((gap) => {
  const score = scoreStructuralGap({
    unique: gap.metric.unique,
    n: gap.metric.n,
    topShare: gap.metric.topShare,
    floorUnique: gap.floorUnique,
    softUnique: gap.softUnique,
  }) + (gap.extraScore || 0);
  return { ...gap, score };
}).sort((a, b) => b.score - a.score);

// Data defects: fabricated strings, ghosts, padding. These LOWER credibility;
// none of them ever raises a breadth number.
const dataDefects = [
  ...(fabricatedDoctrines.length ? [`FABRICATED combatDoctrineId (runtime normalizes to null — behavior silently OFF): ${fabricatedDoctrines.join(', ')}`] : []),
  ...(fabricatedSilhouettes.length ? [`FABRICATED silhouette (renders as fallback family): ${fabricatedSilhouettes.join(', ')}`] : []),
  ...(fabricatedArchetypes.length ? [`UNRECOGNIZED aiArchetype (degrades to base capabilities): ${fabricatedArchetypes.join(', ')}`] : []),
  ...(ghostJobKinds.length ? [`GHOST job kinds (enum entry with no phase graph — no NPC can run them): ${ghostJobKinds.join(', ')}`] : []),
  ...(unschedulableEncounters.length ? [`UNSCHEDULABLE encounters (zoneTypes match no placed zone, or weight<=0): ${unschedulableEncounters.join(', ')}`] : []),
  ...(weaponIds.duplicates.length ? [`weapons: duplicate ids ${weaponIds.duplicates.join(', ')}`] : []),
  ...(shipIds.duplicates.length ? [`ships: duplicate ids ${shipIds.duplicates.join(', ')}`] : []),
  ...(moduleIds.duplicates.length ? [`modules: duplicate ids ${moduleIds.duplicates.join(', ')}`] : []),
  ...(encounterIds.duplicates.length ? [`encounters: duplicate ids ${encounterIds.duplicates.join(', ')}`] : []),
];
const advisories = [
  ...(unreferencedEnemies.length ? [`enemies never referenced by any encounter recipe (verify another owner actually spawns them): ${unreferencedEnemies.join(', ')}`] : []),
];

// ---------------------------------------------------------------------------
// Memory + director board
// ---------------------------------------------------------------------------

const memoryPath = resolve(ROOT, 'design/program/inference-memory.json');
let rawMemory = null;
if (existsSync(memoryPath)) {
  try { rawMemory = JSON.parse(readFileSync(memoryPath, 'utf8')); }
  catch { rawMemory = null; }
}
const { memory, warnings: memoryWarnings } = normalizeMemory(rawMemory, today);

const scopeWfs = resolveScope(scopeArg);
if (scopeArg && !scopeWfs) {
  console.error(`Unknown scope "${scopeArg}". Known: ${Object.keys(SCOPE_MAP).join(', ')}`);
}
const board = buildDirectorBoard({ structural: gaps, memory, today, integrationDebt, scopeWfs });
const slate = slateRequirements(nxArg || 1, scopeWfs);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const report = {
  schema: 'spaceface.inferenceDetect.v2',
  generatedAt: new Date().toISOString(),
  purpose: 'Autonomous INFERENCE director board (not PQ dispatch). Structural metrics detect; the board chooses.',
  scope: scopeArg || null,
  scopeWfs,
  nx: nxArg ? Number(nxArg) : null,
  slateRequirements: slate,
  memoryWarnings,
  snapshots: {
    enemyTypes: ENEMY_TYPES.length,
    enemyBehaviorCombos,
    enemyDoctrines,
    enemySilhouettes,
    enemyTelegraphCoverage: `${telegraphed}/${ENEMY_TYPES.length}`,
    npcJobKinds: jobKinds.length,
    pocketJobKinds,
    pocketSectors: pocketSectorIds,
    weapons: weaponIds.unique,
    weaponBehavioralHookShare: Number(weaponHookShare.toFixed(2)),
    ships: shipIds.unique,
    modules: moduleIds.unique,
    moduleBehavioralHookShare: Number(moduleHookShare.toFixed(2)),
    stations: stationIds.length,
    encounters: encounterIds.unique,
    hullsLive: hulls.liveCount,
    hullsSourceOnly: hulls.sourceOnlyCount,
    incubatorGlbs,
    microeventCatalog: microeventCount,
    fabricatedDoctrines,
    fabricatedSilhouettes,
    fabricatedArchetypes,
    ghostJobKinds,
    unschedulableEncounters,
    unreferencedEnemies,
  },
  dataDefects,
  advisories,
  gaps,
  board: {
    suggestedMode: board.suggestedMode,
    modeReason: board.modeReason,
    repair: board.repair.slice(0, 8).map(({ id, score, wfs, recentWeight, saturated, why }) => ({ id, score, wfs, recentWeight: Number(recentWeight.toFixed(2)), saturated, why })),
    starved: board.starved.slice(0, 8).map(({ wf, name, measured, staleness }) => ({ wf, name, measured, staleness: staleness === Infinity ? 'never' : Math.round(staleness) })),
    integration: board.integration,
    recovery: board.recovery,
    blocked: board.blocked.map((u) => ({ id: u.id, date: u.date, fingerprint: u.fingerprint, reason: u.reason })),
    failedTwice: board.failedTwice.map((p) => ({ reason: p.reason, count: p.count })),
    overusedReferences: board.overusedReferences,
  },
  agentInstructions: [
    'You are NOT waiting for a human-named unit. PQ owns that door.',
    `Suggested mode this run: ${board.suggestedMode.toUpperCase()} — ${board.modeReason}. Override only with stated evidence.`,
    'Pick ONE board cell, then invent the unit yourself inside it. A count is a symptom, not a task: verify the experiential reality on the ordinary route before building.',
    'Printed examples in the workflow docs are SPENT ideas — never submit one as a candidate (design/inference-workflows/02_CREATIVE_CONVERGENCE_LOOP.md).',
    'Candidates matching a BLOCKED fingerprint need new recorded evidence, not silence.',
    `Slate: up to ${slate.acceptedMax} accepted unit(s), >=${slate.minCandidates} candidates, pairwise-distinct fingerprints (>=${slate.minDistinctAxesPerPair} axes), span >=${slate.minDomainsSpanned} domain(s). Fewer accepted units than requested is an HONEST outcome.`,
    'Implement through live owners; prove on the ordinary route; then record the unit: node scripts/inference-record.mjs --help',
  ],
};

const fmtGap = (g) => (
  `  [${String(g.score).padStart(3)}] ${g.id}  wf=${(g.wfs || []).join('/')}  unique=${g.metric.unique}/${g.metric.n}`
  + (g.metric.topShare ? ` top=${g.metric.top}@${(g.metric.topShare * 100).toFixed(0)}%` : '')
  + (g.saturated ? `  [SATURATED recent=${g.recentWeight.toFixed(1)} — pick a different cell]` : '')
  + `\n         why: ${g.why}\n         blind: ${g.blindSpots}`
);

const lines = [
  'INFERENCE DIRECTOR BOARD (structural detection + mode selection)',
  scopeArg ? `scope=${scopeArg} -> ${(scopeWfs || []).join(', ') || 'UNKNOWN'}` : 'scope=(none)',
  '',
  `enemies=${ENEMY_TYPES.length} behaviorCombos=${enemyBehaviorCombos.unique} doctrines=${enemyDoctrines.unique} silhouettes=${enemySilhouettes.unique} telegraphs=${telegraphed}/${ENEMY_TYPES.length}`,
  `jobs kinds=${jobKinds.length} pocketJobKinds=${pocketJobKinds.length} pocketSectors=${pocketSectorIds.length}/${SECTORS.length}`,
  `weapons=${weaponIds.unique}(hooks ${(weaponHookShare * 100).toFixed(0)}%) ships=${shipIds.unique} modules=${moduleIds.unique}(hooks ${(moduleHookShare * 100).toFixed(0)}%) stations=${stationIds.length} encounters=${encounterIds.unique}`,
  `hulls live=${hulls.liveCount} sourceOnly=${hulls.sourceOnlyCount} | incubator GLBs=${incubatorGlbs} microevents=${microeventCount} (unwired)`,
  ...(dataDefects.length ? ['', 'DATA DEFECTS (fabricated strings and padding never count as breadth — fix or remove):', ...dataDefects.map((d) => `  ${d}`)] : []),
  ...(advisories.length ? ['', 'ADVISORIES:', ...advisories.map((d) => `  ${d}`)] : []),
  ...(memoryWarnings.length ? ['', ...memoryWarnings.map((w) => `MEMORY WARNING: ${w}`)] : []),
  '',
  `>>> SUGGESTED MODE: ${board.suggestedMode.toUpperCase()} — ${board.modeReason}`,
  '',
  'REPAIR (structural gaps; a count is a symptom — verify on the ordinary route first):',
  ...board.repair.slice(0, 6).map(fmtGap),
  '',
  'STARVED (domains the structural metrics can never surface — schedule by staleness):',
  ...board.starved.slice(0, 6).map((d) => `  ${d.wf} ${d.name}${d.measured ? '' : ' [unmeasured]'} — last touched: ${d.staleness === Infinity ? 'never recorded' : Math.round(d.staleness) + 'd ago'}`),
  '',
  'INTEGRATION DEBT (authored but unwired — wire before authoring more of the same):',
  ...(board.integration.length ? board.integration.map((d) => `  ${d.id}: ${d.count} — ${d.note}`) : ['  (none detected)']),
  '',
  'RECOVERY (known defects; VERIFY liveness against current code before acting):',
  ...(board.recovery.length ? board.recovery.map((d) => `  [${d.severity}] ${d.id} (${d.wf}) — ${d.note}`) : ['  (none recorded)']),
  '',
  'OPPORTUNITY (deficits are not the only door — generate from strengths):',
  '  What do existing SpaceFace systems make possible that nothing exploits yet?',
  '  What would be funny, beautiful, dangerous, or trailer-worthy that only THIS game can do?',
  '  At least one candidate must be justified purely from SpaceFace systems/fiction,',
  '  generated BEFORE reading the reference library. Printed doc examples are spent.',
  ...(board.blocked.length ? ['', 'BLOCKED (recently rejected/cut — do not resurrect without NEW recorded evidence):', ...board.blocked.map((u) => `  ${u.date} ${u.id}: ${u.fingerprint} (${u.reason || 'no reason recorded'})`)] : []),
  ...(board.failedTwice.length ? ['', 'FAILED TWICE (do not attempt a third time on the same premise):', ...board.failedTwice.map((p) => `  ${p.reason} (x${p.count})`)] : []),
  ...(board.overusedReferences.length ? ['', 'OVERUSED REFERENCES (rotate or go repo-native):', ...board.overusedReferences.map((r) => `  ${r.ref} used ${r.uses}x in 30d`)] : []),
  '',
  `SLATE for ${nxArg || 1}x${scopeArg ? ` ${scopeArg}` : ''}: up to ${slate.acceptedMax} accepted, >=${slate.minCandidates} candidates, span >=${slate.minDomainsSpanned} domain(s). Fewer accepted than requested is HONEST when the rest are filler.`,
  '',
  'Agent: pick ONE cell, verify its reality on the ordinary route, invent the unit, ship it through live owners, then: node scripts/inference-record.mjs',
];

console.log(lines.join('\n'));
if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${outPath}`);
}
