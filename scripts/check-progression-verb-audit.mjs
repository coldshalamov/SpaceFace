// check-progression-verb-audit.mjs — mechanical "scalar vs verb" progression audit.
//
// Classifies EVERY shipped module, weapon and tech node as verb-changing (grants a capability or
// state change), intel (a read, neither pure stat nor combat verb), or scalar (percentage/flat
// stat). Emits a markdown report; doubles as the vocabulary drift guard: a module whose `mods`
// carries a key this file does not know fails the run, so any new system that grows the mods
// vocabulary must register its keys here first.
//
// Classification precedence per module: verb > intel > scalar. A mixed module (e.g. unique_knitbots
// hullRepairOOC + repairDockedDrones) classifies by its strongest entry; secondary classes are
// listed in its row. Tech classification is NOT re-derived here — we import the committed ladder's
// own `classifyTechNode` / `STAT_ONLY_JUSTIFICATIONS` from src/data/techVerbLadder.js so the audit
// can never disagree with the table that ships.
//
// Verb vocabulary sources (read, not edited): src/systems/ships.js derived fold +
// CONTROL_GUN_TOKEN_RE, src/systems/cloak.js, src/systems/countermeasures.js,
// src/systems/impulseCharges.js, src/systems/weapons.js deploy gate, src/data/attackTraits.js
// (imported directly — id-matched verb rigs), src/systems/scanner.js, src/systems/missions.js,
// src/systems/uniqueLootAbilities.js.
//
// Exits nonzero when: any module has a mods key absent from the vocabulary (drift), any module is
// unclassifiable, or a population is empty. `--write=<path>` also writes the report file.
import { readFileSync, writeFileSync } from 'node:fs';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { TECH_NODES } from '../src/data/tech.js';
import { BODY_MODULES } from '../src/data/claimableBodies.js';
import { ATTACK_TRAIT_BY_ID } from '../src/data/attackTraits.js';
import {
  classifyTechNode, countVerbVsStatOnly, STAT_ONLY_JUSTIFICATIONS, STRICT_STAT_ONLY_IDS,
} from '../src/data/techVerbLadder.js';

const REPORT_DATE = '2026-09-18';

// ─── Vocabulary: mods keys that grant a capability / state change (VERB) ───
// Each entry: key → [grants, consumer note]. New systems must register here.
const VERB_MOD_KEYS = Object.freeze({
  masslineHeadId: ['tether-head verb (tractor / elastic_whip / frame_coupler / monofilament_sweep / transverse_snare / twin_bridle)', 'ships.js massline fold'],
  countermeasure: ['activated countermeasure (chaff / ecm / decoy)', 'systems/countermeasures.js'],
  cloakBaseRadius: ['activated stealth cloak', 'systems/cloak.js'],
  cloakDrainPerS: ['activated stealth cloak (energy bar)', 'systems/cloak.js'],
  cloakRechargePerS: ['activated stealth cloak (energy bar)', 'systems/cloak.js'],
  impulseChargeCapacity: ['impulse charge carry + throw', 'systems/impulseCharges.js'],
  bombPropulsion: ['propelled bomb / vector charge', 'systems/impulseCharges.js'],
  repulsionTrap: ['drop-a-trap radial shove', 'systems/impulseCharges.js'],
  droneBay: ['launch drones from a bay', 'ships.js droneBayCountForFittings'],
  jumpDriveTier: ['jump verb', 'ships.js derived fold (jumpDriveTier)'],
  tractorWholeWrecks: ['whole-wreck latch', 'latched by unique_tideline_tractor id in systems/uniqueLootAbilities.js'],
  repairDockedDrones: ['repair docked drones', 'unique_knitbots; test-pinned, no live systems consumer found'],
  microJumpBlink: ['micro-jump blink (usesPerEncounter)', 'DECLARED ONLY — no src/systems consumer found yet'],
  reactiveMissileKnockback: ['reactive missile knockback (usesPerEncounter)', 'DECLARED ONLY — no src/systems consumer found yet'],
  // Landing today from another lane (pre-registered so the landing audits clean):
  swingDrive: ['pendulum dash through a taut line', 'NEW — landing lane'],
  lootMagnetRange: ['pull loot shards into magnet range', 'NEW — landing lane'],
  towFlail: ['towed mass becomes flail damage', 'NEW — landing lane'],
  pointDefense: ['auto-intercept projectiles (object value)', 'NEW — landing lane'],
});

// ─── Vocabulary: reads / intel — their own class, neither pure stat nor combat verb ───
const INTEL_MOD_KEYS = Object.freeze({
  revealCargo: 'read another ship\'s cargo (contactHail/comms)',
  marketIntel: 'market price intel (systems/economy.js)',
  scanRpBonus: 'research points per freeflight scan pulse (systems/missions.js)',
  scannerRadiusMult: 'scanner ping radius (systems/scanner.js)',
  pingPersistMult: 'ping persistence (systems/scanner.js)',
  radarRangePct: 'radar range (ships.js derived fold)',
  scannerCloak: 'reduce scanner detectability (ships.js derived fold)',
  hiddenCargoPct: 'hide cargo fraction (ships.js derived fold)',
  anomalyPingReduction: 'close an anomaly fix in fewer pulses (systems/scanner.js)',
  overusePingThreshold: 'ping-overuse allowance (systems/uniqueWrecks.js)',
});

// ─── Vocabulary: every other known mods key is a SCALAR (percentage / flat stat) ───
const SCALAR_MOD_KEYS = Object.freeze([
  'shieldFlat', 'shieldRegenFlat', 'hullFlat', 'topSpeed', 'accelMult', 'turnMult',
  'travelCeilingMult', 'strafeMult', 'brakeMult', 'cargoFlat', 'cargoCapPct',
  'damageReductionPct', 'boostTopSpeedPct', 'boostDurS', 'boostCdS', 'hullRepairOOC',
  'magnetRange', 'weaponRangePct', 'weaponDmgPct', 'weaponHeatDissipPct',
  'ramDamageDealtMult', 'tetherReelRateMult', 'tetherSpoolMult', 'richCoreRingPctBonus',
  'scanRangeMult',
]);

const KNOWN_CM_KINDS = new Set(['chaff', 'ecm', 'decoy']); // decoy lands today
const KNOWN_MASSLINE_HEADS = new Set([
  'tractor', 'elastic_whip', 'frame_coupler', 'monofilament_sweep', 'transverse_snare', 'twin_bridle',
]);
const KNOWN_DEPLOY_KINDS = new Set(['vector_mine', 'gravity_well']); // gravity_well lands today

// CONTROL_GUN_TOKEN_RE is read out of src/systems/ships.js source (importing ships.js would drag
// the whole runtime). If the regex moves or renames, this audit fails loudly rather than guessing.
const shipsSource = readFileSync(new URL('../src/systems/ships.js', import.meta.url), 'utf8');
const tokenMatch = shipsSource.match(/CONTROL_GUN_TOKEN_RE\s*=\s*\/(.+?)\//);
if (!tokenMatch) throw new Error('check-progression-verb-audit: CONTROL_GUN_TOKEN_RE not found in src/systems/ships.js — control-gun vocabulary drifted');
const CONTROL_GUN_TOKEN_RE = new RegExp(tokenMatch[1]);

const CLASS_RANK = { verb: 0, intel: 1, scalar: 2 };

function keyClass(key) {
  if (VERB_MOD_KEYS[key]) return 'verb';
  if (INTEL_MOD_KEYS[key]) return 'intel';
  if (SCALAR_MOD_KEYS.includes(key)) return 'scalar';
  return null;
}

/**
 * Classify one module def.
 * Returns { primary, classes, verbSources, intelKeys, scalarKeys, unknownKeys, warnings }.
 */
function classifyModule(def) {
  const classes = new Set();
  const verbSources = [];
  const intelKeys = [];
  const scalarKeys = [];
  const unknownKeys = [];
  const warnings = [];
  // Id-matched verb rigs: the id IS the grammar (src/data/attackTraits.js).
  if (ATTACK_TRAIT_BY_ID[def.id]) {
    classes.add('verb');
    verbSources.push(`id-matched attack trait (${ATTACK_TRAIT_BY_ID[def.id].family})`);
  }
  const mods = def.mods || {};
  for (const key of Object.keys(mods)) {
    const cls = keyClass(key);
    if (!cls) { unknownKeys.push(key); continue; }
    classes.add(cls);
    if (cls === 'verb') {
      verbSources.push(key === 'masslineHeadId' ? `masslineHeadId='${mods[key]}'` : key);
      if (key === 'masslineHeadId' && !KNOWN_MASSLINE_HEADS.has(mods[key])) {
        warnings.push(`unknown masslineHeadId '${mods[key]}' (known: ${[...KNOWN_MASSLINE_HEADS].join(', ')})`);
      }
      if (key === 'countermeasure' && mods[key] && !KNOWN_CM_KINDS.has(mods[key].kind)) {
        warnings.push(`unknown countermeasure kind '${mods[key].kind}' (known: ${[...KNOWN_CM_KINDS].join(', ')})`);
      }
    } else if (cls === 'intel') intelKeys.push(key);
    else scalarKeys.push(key);
  }
  const primary = ['verb', 'intel', 'scalar'].find((c) => classes.has(c)) || null;
  // A module with no mods and no id-verb can still be a plain stat block: the mining lasers carry
  // top-level dps/rareOreChance/directToCargo (mining dps is scalar per the progression contract).
  // Only a def with NONE of mods / attack-trait id / stat fields is unclassifiable.
  let scalarBasis = null;
  if (!primary) {
    const statFields = ['dps', 'rareOreChance', 'directToCargo'].filter((f) => f in def);
    if (statFields.length) {
      scalarBasis = `top-level stat fields (${statFields.join(', ')})`;
    }
  }
  return {
    primary: primary || (scalarBasis ? 'scalar' : null),
    classes: [...classes].sort((a, b) => CLASS_RANK[a] - CLASS_RANK[b]),
    verbSources,
    intelKeys,
    scalarKeys,
    scalarBasis,
    unknownKeys,
    warnings,
  };
}

/**
 * Classify one weapon def. Verb sources per the progression contract: the deploy gate
 * (tracking==='deploy' / deployKind), state-change status payloads, physics impulse,
 * subsystem coupling, baked attack traits, and control-gun token ids.
 */
function classifyWeapon(def) {
  const verbSources = [];
  if ((def.tracking || '') === 'deploy' || def.deployKind) {
    verbSources.push(def.deployKind ? `deployKind=${def.deployKind}` : "tracking='deploy'");
    if (def.deployKind && !KNOWN_DEPLOY_KINDS.has(def.deployKind)) {
      verbSources.push(`UNREGISTERED deployKind '${def.deployKind}'`);
    }
  }
  if (Array.isArray(def.statuses) && def.statuses.length) verbSources.push(`statuses (${def.statuses.map((s) => s.id).join(', ')})`);
  if (Number(def.impulsePerHit) > 0) verbSources.push('impulsePerHit');
  if (Number(def.subsystemShare) > 0 || Number(def.shieldBypass) > 0) verbSources.push('subsystemShare/shieldBypass');
  if (Array.isArray(def.attackTraits) && def.attackTraits.length) verbSources.push(`attackTraits (${def.attackTraits.join(', ')})`);
  if (CONTROL_GUN_TOKEN_RE.test(def.id || '')) verbSources.push('control-gun token');
  return { primary: verbSources.length ? 'verb' : 'scalar', verbSources };
}

// ─── Run the audit ───
const errors = [];   // fatal: vocabulary drift, unclassifiable defs, empty populations
const warnings = []; // report-only: unknown enum VALUES (kind/head/deployKind) inside known keys
const moduleRows = MODULES.map((def) => ({ def, ...classifyModule(def) }));
for (const row of moduleRows) {
  if (row.unknownKeys.length) {
    errors.push(`MODULE DRIFT ${row.def.id}: unknown mods key(s) ${row.unknownKeys.join(', ')} — register them in scripts/check-progression-verb-audit.mjs (VERB/INTEL/SCALAR tables)`);
  }
  if (!row.primary) {
    errors.push(`UNCLASSIFIABLE MODULE ${row.def.id}: no mods, no id-matched attack trait`);
  }
  for (const w of row.warnings) warnings.push(`${row.def.id}: ${w}`);
}
const weaponRows = WEAPONS.map((def) => ({ def, ...classifyWeapon(def) }));
for (const row of weaponRows) {
  for (const src of row.verbSources) {
    if (src.startsWith('UNREGISTERED deployKind')) warnings.push(`${row.def.id}: ${src} — add it to KNOWN_DEPLOY_KINDS`);
  }
}
if (!MODULES.length) errors.push('MODULES is empty — nothing to audit');
if (!WEAPONS.length) errors.push('WEAPONS is empty — nothing to audit');
if (!TECH_NODES.length) errors.push('TECH_NODES is empty — nothing to audit');

// Dangling unlock refs are report-only findings (tech.js/modules.js are other lanes' files).
// Known-fitting ids span MODULES ∪ WEAPONS plus the claimable-body module catalog: some tech
// unlocks (mod_sensor_post under tech_long_range_survey) name OUTPOST builds, not ship fittings,
// and resolving against claimableBodies keeps that from reporting as a dangling ref.
const claimableModuleIds = new Set(BODY_MODULES.map((row) => row && row.id));
const knownFittingIds = new Set([...MODULES, ...WEAPONS].map((d) => d.id));
const danglingUnlocks = [];
for (const node of TECH_NODES) {
  for (const id of (node.unlocks && node.unlocks.modules) || []) {
    if (!knownFittingIds.has(id) && !claimableModuleIds.has(id)) danglingUnlocks.push(`${node.id} → ${id}`);
  }
}

const strictCounts = countVerbVsStatOnly(TECH_NODES, 'strict');
const broadCounts = countVerbVsStatOnly(TECH_NODES, 'broad');
const techRows = TECH_NODES.map((node) => {
  const strict = classifyTechNode(node, 'strict');
  const broad = classifyTechNode(node, 'broad');
  return { node, strict, broad, justification: STAT_ONLY_JUSTIFICATIONS[node.id] || null };
});
const broadStatRows = techRows.filter((r) => r.broad === 'stat-only');

// ─── Markdown report ───
const count = (rows, cls) => rows.filter((r) => r.primary === cls).length;
const moduleVerb = count(moduleRows, 'verb');
const moduleIntel = count(moduleRows, 'intel');
const moduleScalar = count(moduleRows, 'scalar');
const weaponVerb = count(weaponRows, 'verb');
const weaponScalar = count(weaponRows, 'scalar');

const lines = [];
lines.push('# Progression Vertical Audit — Scalar vs Verb');
lines.push('');
lines.push(`Generated **${REPORT_DATE}** by \`scripts/check-progression-verb-audit.mjs\` — this file is GENERATED, do not hand-edit. Regenerate with \`npm run check:progression:verbs -- --write=design/program/PROGRESSION_VERTICAL_AUDIT.md\`.`);
lines.push('');
lines.push('A module is **verb** when it grants a capability or state change (tether head, cloak, countermeasure, drone bay, jump, impulse charge, attack-trait rig, …), **intel** when it is a read (reveal cargo, market data, scan bonuses), and **scalar** when it only moves numbers (shieldFlat, *Mult, *Pct, …). Precedence per module: verb > intel > scalar; secondary classes are listed in the row. Tech classification is imported verbatim from the committed ladder (`src/data/techVerbLadder.js`), not re-derived.');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| Population | Verb | Intel | Scalar | Total |');
lines.push('|---|---:|---:|---:|---:|');
lines.push(`| Modules (src/data/modules.js) | ${moduleVerb} | ${moduleIntel} | ${moduleScalar} | ${MODULES.length} |`);
lines.push(`| Weapons (src/data/weapons.js) | ${weaponVerb} | 0 | ${weaponScalar} | ${WEAPONS.length} |`);
lines.push(`| Tech nodes (src/data/tech.js) | verb ${strictCounts.verb} strict / ${broadCounts.verb} broad | — | stat-only ${strictCounts.statOnly} strict / ${broadCounts.statOnly} broad | ${TECH_NODES.length} |`);
lines.push('');
lines.push(`Tech reading: ${strictCounts.verb} nodes grant a ship or module in both modes; ${broadCounts.statOnly - strictCounts.statOnly} more fall to stat-only under the ladder's **broad** mode (hull-license-only nodes plus two enlarge-an-existing-verb passives); ${strictCounts.statOnly} are strict stat-only (no ship, no module).`);
lines.push('');
lines.push('## Verb modules');
lines.push('');
lines.push('| Module | Granted by | Secondary classes |');
lines.push('|---|---|---|');
for (const row of moduleRows.filter((r) => r.primary === 'verb')) {
  const secondary = row.classes.filter((c) => c !== 'verb').join(' + ') || '—';
  lines.push(`| \`${row.def.id}\` | ${row.verbSources.join(', ')} | ${secondary} |`);
}
lines.push('');
lines.push('## Intel modules (reads — neither pure stat nor combat verb)');
lines.push('');
lines.push('| Module | Intel keys | Secondary classes |');
lines.push('|---|---|---|');
for (const row of moduleRows.filter((r) => r.primary === 'intel')) {
  const secondary = row.classes.filter((c) => c !== 'intel').join(' + ') || '—';
  lines.push(`| \`${row.def.id}\` | ${row.intelKeys.join(', ')} | ${secondary} |`);
}
lines.push('');
const scalarByStatField = moduleRows.filter((r) => r.primary === 'scalar' && r.scalarBasis);
if (scalarByStatField.length) {
  lines.push(`Modules classified scalar on top-level stat fields alone (no mods, no id-verb): ${scalarByStatField.map((r) => `\`${r.def.id}\` (${r.scalarBasis})`).join(', ')}.`);
  lines.push('');
}
lines.push(`## Stat-only tech nodes (${broadCounts.statOnly}, with the ladder's own justification)`);
lines.push('');
lines.push('| Node | Mode | Justification (src/data/techVerbLadder.js) |');
lines.push('|---|---|---|');
for (const row of broadStatRows) {
  const mode = row.strict === 'stat-only' ? 'strict + broad' : 'broad only';
  const just = row.justification || '_(no STAT_ONLY_JUSTIFICATIONS entry — ladder drift)_';
  lines.push(`| \`${row.node.id}\` | ${mode} | ${just} |`);
}
lines.push('');
lines.push('## Verb weapons');
lines.push('');
lines.push('| Weapon | Verb source |');
lines.push('|---|---|');
for (const row of weaponRows.filter((r) => r.primary === 'verb')) {
  lines.push(`| \`${row.def.id}\` | ${row.verbSources.join(', ')} |`);
}
if (weaponScalar) {
  lines.push('');
  lines.push(`Scalar weapons (no impulse, deploy, status, subsystem coupling, trait or control token): ${weaponRows.filter((r) => r.primary === 'scalar').map((r) => `\`${r.def.id}\``).join(', ') || '—'}`);
}
lines.push('');
if (danglingUnlocks.length) {
  lines.push(`## Findings (report-only, other lanes' files)`);
  lines.push('');
  for (const d of danglingUnlocks) lines.push(`- Dangling tech unlock ref: ${d} (not in MODULES ∪ WEAPONS)`);
  lines.push('');
}
const declaredOnly = Object.entries(VERB_MOD_KEYS).filter(([, v]) => v[1].startsWith('DECLARED ONLY'));
if (declaredOnly.length) {
  lines.push(`Declared-but-unwired verb keys (in data, no live systems consumer yet): ${declaredOnly.map(([k]) => `\`${k}\``).join(', ')}.`);
  lines.push('');
}
if (warnings.length) {
  lines.push('## Vocabulary warnings (known keys, unknown values)');
  lines.push('');
  for (const w of warnings) lines.push(`- ${w}`);
  lines.push('');
}
lines.push('## Vocabulary contract');
lines.push('');
lines.push(`The drift guard knows ${Object.keys(VERB_MOD_KEYS).length} verb mods keys, ${Object.keys(INTEL_MOD_KEYS).length} intel keys, ${SCALAR_MOD_KEYS.length} scalar keys, ${Object.keys(ATTACK_TRAIT_BY_ID).length} id-matched attack-trait rigs, massline heads {${[...KNOWN_MASSLINE_HEADS].join(', ')}}, countermeasure kinds {${[...KNOWN_CM_KINDS].join(', ')}}, and deploy kinds {${[...KNOWN_DEPLOY_KINDS].join(', ')}}. A mods key outside these sets fails this check — register new keys in \`scripts/check-progression-verb-audit.mjs\` in the same packet that introduces them.`);
lines.push('');

const report = lines.join('\n');
console.log(report);

const writeArg = process.argv.find((a) => a.startsWith('--write='));
if (writeArg) {
  const out = writeArg.slice('--write='.length);
  writeFileSync(new URL(`../${out}`, import.meta.url), report, 'utf8');
  console.error(`[check-progression-verb-audit] wrote ${out}`);
}

if (errors.length) {
  for (const w of warnings) console.error(`[check-progression-verb-audit] WARN: ${w}`);
  for (const e of errors) console.error(`[check-progression-verb-audit] FAIL: ${e}`);
  process.exit(1);
}
for (const w of warnings) console.error(`[check-progression-verb-audit] WARN: ${w}`);
console.error(`[check-progression-verb-audit] OK — modules ${MODULES.length} (verb ${moduleVerb} / intel ${moduleIntel} / scalar ${moduleScalar}), weapons ${WEAPONS.length} (verb ${weaponVerb} / scalar ${weaponScalar}), tech ${TECH_NODES.length} (strict-verb ${strictCounts.verb} / broad-stat ${broadCounts.statOnly} / strict-stat ${strictCounts.statOnly})`);
