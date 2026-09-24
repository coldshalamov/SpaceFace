// check-progression-verb-audit.mjs — mechanical "scalar vs verb" progression audit.
//
// Classifies EVERY shipped module, weapon and tech node as verb-changing (grants a capability or
// state change), intel (a read, neither pure stat nor combat verb), or scalar (percentage/flat
// stat). Emits a markdown report; doubles as the progression verb drift guard (PQ-208.00) with two
// failure modes, both fatal:
//   1. VOCABULARY drift — a module whose `mods` carries a key this file does not know fails the
//      run, so any new system that grows the mods vocabulary must register its keys here first.
//   2. CONSUMER drift — a registered verb key must carry consumer EVIDENCE, verified against live
//      source on every run: `{ file, symbol }` requires the symbol to occur in the named file, so
//      a consumer that is renamed, moved or deleted fails the audit instead of silently leaving a
//      declared verb key that names no implemented behaviour. A key with no direct consumer may
//      only be registered as `{ declaredOnly: '<packet leaf>' }` — an honest, loud label (it is
//      reported on every run), never an unmarked absence. An evidence block that is missing or
//      malformed fails the run: the guard fails closed.
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
// Exits nonzero when: any module has a mods key absent from the vocabulary (drift), any registered
// verb key's consumer evidence fails to verify or is malformed (a declared verb that names no
// implemented behaviour), any module is unclassifiable, or a population is empty.
// `--write=<path>` also writes the report file.
//
// Pure pieces (keyClass, classifyModule, classifyWeapon, auditModules,
// verifyVerbKeyConsumers, runAudit) are exported so `node --test` can pin the guard — including
// its negative (planted-drift) cases — without spawning the CLI. The CLI only runs when this file
// is the entry script.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { TECH_NODES } from '../src/data/tech.js';
import { BODY_MODULES } from '../src/data/claimableBodies.js';
import { ATTACK_TRAIT_BY_ID } from '../src/data/attackTraits.js';
import {
  classifyTechNode, countVerbVsStatOnly, STAT_ONLY_JUSTIFICATIONS, STRICT_STAT_ONLY_IDS,
} from '../src/data/techVerbLadder.js';

const REPORT_DATE = '2026-09-19';

// ─── Vocabulary: mods keys that grant a capability / state change (VERB) ───
// Each entry: key → [grants, consumer note, evidence].
// evidence is `{ file, symbol }` (mechanically verified: symbol must occur in the live file) or
// `{ declaredOnly: '<packet leaf>' }` (honestly labeled unwired key — reported every run).
// New systems must register here, with evidence, in the same packet that introduces the key.
const VERB_MOD_KEYS = Object.freeze({
  masslineHeadId: ['tether-head verb (tractor / elastic_whip / frame_coupler / monofilament_sweep / transverse_snare / twin_bridle)', 'ships.js massline fold', { file: 'src/systems/ships.js', symbol: 'masslineHeadId' }],
  countermeasure: ['activated countermeasure (chaff / ecm / decoy)', 'systems/countermeasures.js', { file: 'src/systems/countermeasures.js', symbol: 'countermeasure' }],
  cloakBaseRadius: ['activated stealth cloak', 'systems/cloak.js', { file: 'src/systems/cloak.js', symbol: 'cloakBaseRadius' }],
  cloakDrainPerS: ['activated stealth cloak (energy bar)', 'systems/cloak.js', { file: 'src/systems/cloak.js', symbol: 'cloakDrainPerS' }],
  cloakRechargePerS: ['activated stealth cloak (energy bar)', 'systems/cloak.js', { file: 'src/systems/cloak.js', symbol: 'cloakRechargePerS' }],
  impulseChargeCapacity: ['impulse charge carry + throw', 'systems/impulseCharges.js', { file: 'src/systems/impulseCharges.js', symbol: 'impulseChargeCapacity' }],
  bombPropulsion: ['propelled bomb / vector charge', 'systems/impulseCharges.js', { file: 'src/systems/impulseCharges.js', symbol: 'bombPropulsion' }],
  repulsionTrap: ['drop-a-trap radial shove', 'systems/impulseCharges.js', { file: 'src/systems/impulseCharges.js', symbol: 'repulsionTrap' }],
  droneBay: ['launch drones from a bay', 'ships.js droneBayCountForFittings', { file: 'src/systems/ships.js', symbol: 'droneBay' }],
  jumpDriveTier: ['jump verb', 'ships.js derived fold (jumpDriveTier)', { file: 'src/systems/ships.js', symbol: 'jumpDriveTier' }],
  tractorWholeWrecks: ['whole-wreck latch (implemented by module id, not by reading this key)', 'unique_tideline_tractor latch in systems/uniqueLootAbilities.js', { file: 'src/systems/uniqueLootAbilities.js', symbol: 'unique_tideline_tractor' }],
  repairDockedDrones: ['repair docked drones (test-pinned contract; no live systems consumer reads this key yet)', 'pinned by test/depth-program-authored-salvage.test.mjs', { file: 'test/depth-program-authored-salvage.test.mjs', symbol: 'repairDockedDrones' }],
  microJumpBlink: ['micro-jump blink (usesPerEncounter)', 'systems/uniqueLootAbilities.js fittedVerbSpec', { file: 'src/systems/uniqueLootAbilities.js', symbol: 'microJumpBlink' }],
  reactiveMissileKnockback: ['reactive missile knockback (usesPerEncounter)', 'systems/uniqueLootAbilities.js fittedVerbSpec', { file: 'src/systems/uniqueLootAbilities.js', symbol: 'reactiveMissileKnockback' }],
  swingDrive: ['pendulum dash through a taut line', 'systems/flightV3.js + ships.js fold (landed)', { file: 'src/systems/flightV3.js', symbol: 'swingDrive' }],
  lootMagnetRange: ['pull loot shards into magnet range', 'systems/lootShards.js + ships.js fold (landed)', { file: 'src/systems/lootShards.js', symbol: 'lootMagnetRange' }],
  towFlail: ['towed mass becomes flail damage', 'systems/collisionConsequences.js + ships.js fold (landed)', { file: 'src/systems/collisionConsequences.js', symbol: 'towFlail' }],
  pointDefense: ['auto-intercept projectiles (object value)', 'systems/countermeasures.js (landed)', { file: 'src/systems/countermeasures.js', symbol: 'pointDefense' }],
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
function classifyWeapon(def, controlGunTokenRe = CONTROL_GUN_TOKEN_RE) {
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
  if (controlGunTokenRe.test(def.id || '')) verbSources.push('control-gun token');
  return { primary: verbSources.length ? 'verb' : 'scalar', verbSources };
}

/**
 * Module-drift pass: unknown mods keys (vocabulary drift) and unclassifiable defs are fatal.
 * Exported so the negative (planted-drift) case is unit-testable without touching real data.
 */
function auditModules(rows) {
  const errors = [];
  const warnings = [];
  if (!rows.length) errors.push('MODULES is empty — nothing to audit');
  for (const row of rows) {
    if (row.unknownKeys.length) {
      errors.push(`MODULE DRIFT ${row.def.id}: unknown mods key(s) ${row.unknownKeys.join(', ')} — register them in scripts/check-progression-verb-audit.mjs (VERB/INTEL/SCALAR tables)`);
    }
    if (!row.primary) {
      errors.push(`UNCLASSIFIABLE MODULE ${row.def.id}: no mods, no id-matched attack trait`);
    }
    for (const w of row.warnings) warnings.push(`${row.def.id}: ${w}`);
  }
  return { errors, warnings };
}

function defaultReadEvidenceText(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

/**
 * PQ-208.00 drift guard — verify every registered verb key's consumer evidence against live source.
 * A declared verb key that names no implemented behaviour is fatal; an unwired key may only exist
 * behind an honest `{ declaredOnly }` label naming the packet leaf that will resolve it.
 * `readText` is injectable so unit tests can plant drift without touching the tree.
 */
function verifyVerbKeyConsumers({ vocabulary = VERB_MOD_KEYS, readText = defaultReadEvidenceText } = {}) {
  const errors = [];
  const verified = [];
  const declaredOnly = [];
  for (const [key, entry] of Object.entries(vocabulary)) {
    const evidence = Array.isArray(entry) ? entry[2] : undefined;
    if (!evidence || typeof evidence !== 'object') {
      errors.push(`VERB KEY '${key}' carries no consumer evidence — register it with { file, symbol } (live consumer) or { declaredOnly: '<packet leaf>' }`);
      continue;
    }
    if (typeof evidence.declaredOnly === 'string' && evidence.declaredOnly.trim()) {
      declaredOnly.push(`\`${key}\` (tracked by ${evidence.declaredOnly})`);
      continue;
    }
    if (typeof evidence.file !== 'string' || !evidence.file
      || typeof evidence.symbol !== 'string' || !evidence.symbol) {
      errors.push(`VERB KEY '${key}' evidence is malformed — expected { file, symbol } or { declaredOnly: '<packet leaf>' }`);
      continue;
    }
    let text;
    try {
      text = readText(evidence.file);
    } catch {
      errors.push(`DECLARED VERB '${key}' names no implemented behaviour: consumer evidence file '${evidence.file}' is missing (consumer moved or deleted?)`);
      continue;
    }
    if (!text.includes(evidence.symbol)) {
      errors.push(`DECLARED VERB '${key}' names no implemented behaviour: symbol '${evidence.symbol}' no longer occurs in '${evidence.file}' — the consumer drifted or was renamed`);
      continue;
    }
    verified.push(key);
  }
  return { errors, verified, declaredOnly };
}

/**
 * Run the whole audit against the current tree. Pure with respect to the tree: reads files,
 * writes nothing. Returns { report, errors, warnings, summary, verified, declaredOnly }.
 */
function runAudit() {
  const errors = [];   // fatal: vocabulary drift, consumer drift, unclassifiable defs, empty populations
  const warnings = []; // report-only: unknown enum VALUES (kind/head/deployKind) inside known keys

  const verbVerification = verifyVerbKeyConsumers();
  errors.push(...verbVerification.errors);

  const moduleRows = MODULES.map((def) => ({ def, ...classifyModule(def) }));
  const modulePass = auditModules(moduleRows);
  errors.push(...modulePass.errors);
  warnings.push(...modulePass.warnings);

  const weaponRows = WEAPONS.map((def) => ({ def, ...classifyWeapon(def) }));
  for (const row of weaponRows) {
    for (const src of row.verbSources) {
      if (src.startsWith('UNREGISTERED deployKind')) warnings.push(`${row.def.id}: ${src} — add it to KNOWN_DEPLOY_KINDS`);
    }
  }
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
    lines.push('## Findings (report-only, other lanes\' files)');
    lines.push('');
    for (const d of danglingUnlocks) lines.push(`- Dangling tech unlock ref: ${d} (not in MODULES ∪ WEAPONS)`);
    lines.push('');
  }
  if (verbVerification.declaredOnly.length) {
    lines.push(`Declared-but-unwired verb keys (registered verbs whose mods key no system reads — honestly labeled, tracked by the packet leaf that will wire or reclassify each): ${verbVerification.declaredOnly.join(', ')}.`);
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
  lines.push(`The drift guard knows ${Object.keys(VERB_MOD_KEYS).length} verb mods keys, ${Object.keys(INTEL_MOD_KEYS).length} intel keys, ${SCALAR_MOD_KEYS.length} scalar keys, ${Object.keys(ATTACK_TRAIT_BY_ID).length} id-matched attack-trait rigs, massline heads {${[...KNOWN_MASSLINE_HEADS].join(', ')}}, countermeasure kinds {${[...KNOWN_CM_KINDS].join(', ')}}, and deploy kinds {${[...KNOWN_DEPLOY_KINDS].join(', ')}}. A mods key outside these sets fails this check — register new keys in \`scripts/check-progression-verb-audit.mjs\` in the same packet that introduces them. Every verb key also carries consumer evidence verified on every run (PQ-208.00): ${verbVerification.verified.length} keys verified against live source, ${verbVerification.declaredOnly.length} declared-only pending their tracked leaf. A declared verb key that names no implemented behaviour fails the run.`);
  lines.push('');

  const report = lines.join('\n');
  const summary = {
    modules: MODULES.length, moduleVerb, moduleIntel, moduleScalar,
    weapons: WEAPONS.length, weaponVerb, weaponScalar,
    tech: TECH_NODES.length, strictVerb: strictCounts.verb, broadStat: broadCounts.statOnly, strictStat: strictCounts.statOnly,
    verbKeysVerified: verbVerification.verified.length,
    verbKeysDeclaredOnly: verbVerification.declaredOnly.length,
  };
  return {
    report, errors, warnings, summary,
    verified: verbVerification.verified,
    declaredOnly: verbVerification.declaredOnly,
  };
}

const invokedAsMain = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) {
  const outcome = runAudit();
  console.log(outcome.report);

  const writeArg = process.argv.find((a) => a.startsWith('--write='));
  if (writeArg) {
    const out = writeArg.slice('--write='.length);
    writeFileSync(new URL(`../${out}`, import.meta.url), outcome.report, 'utf8');
    console.error(`[check-progression-verb-audit] wrote ${out}`);
  }

  if (outcome.errors.length) {
    for (const w of outcome.warnings) console.error(`[check-progression-verb-audit] WARN: ${w}`);
    for (const e of outcome.errors) console.error(`[check-progression-verb-audit] FAIL: ${e}`);
    process.exit(1);
  }
  for (const w of outcome.warnings) console.error(`[check-progression-verb-audit] WARN: ${w}`);
  console.error(`[check-progression-verb-audit] OK — modules ${MODULES.length} (verb ${outcome.summary.moduleVerb} / intel ${outcome.summary.moduleIntel} / scalar ${outcome.summary.moduleScalar}), weapons ${WEAPONS.length} (verb ${outcome.summary.weaponVerb} / scalar ${outcome.summary.weaponScalar}), tech ${TECH_NODES.length} (strict-verb ${outcome.summary.strictVerb} / broad-stat ${outcome.summary.broadStat} / strict-stat ${outcome.summary.strictStat}), verb keys ${outcome.summary.verbKeysVerified} verified / ${outcome.summary.verbKeysDeclaredOnly} declared-only`);
}

export {
  VERB_MOD_KEYS, INTEL_MOD_KEYS, SCALAR_MOD_KEYS,
  keyClass, classifyModule, classifyWeapon, auditModules,
  verifyVerbKeyConsumers, runAudit,
};
