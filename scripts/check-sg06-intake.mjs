import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const REQUIRED_MODULES = Object.freeze([
  'src/ai/contracts.js',
  'src/ai/director.js',
  'src/ai/inspection.js',
  'src/ai/maneuver.js',
  'src/ai/perception.js',
  'src/ai/shipDecision.js',
  'src/ai/sg03ActionPort.js',
  'src/ai/squad.js',
  'src/ai/stack.js',
  'src/ai/trace.js',
]);

const REQUIRED_FULL_HANDOFF = Object.freeze([
  'docs/handoffs/SG-06_AI_HANDOFF.md',
  'docs/Spec/SG-06_ACCEPTANCE.json',
  'third_party/reference-ledger-sg06.yml',
  'scripts/check-sg06-ai.mjs',
  'scripts/check-sg06-encounter-owner.mjs',
  'scripts/check-sg06-registry-init.mjs',
  'scripts/check-sg06-live-registry.mjs',
  'scripts/check-sg06-live-tether-break.mjs',
  'src/systems/aiEncounter.js',
]);

const PRODUCTION_CLAIM_MARKERS = Object.freeze([
  'src/ai/index.js',
  'src/systems/tacticalAI.js',
  'docs/handoffs/SG-06_AI_HANDOFF.md',
]);

const packageJson = json('package.json');
const scripts = packageJson.scripts || {};

assert(exists('docs/handoffs/SG-06_LAYERED_AI_INTAKE.md'), 'SG-06 intake guard requires docs/handoffs/SG-06_LAYERED_AI_INTAKE.md');
const intake = read('docs/handoffs/SG-06_LAYERED_AI_INTAKE.md');
assert(intake.includes('F10CC6B0FF01339EA90522D0C969DFE049DAF8788203580D3851B56220A358D5'),
  'SG-06 intake doc must record the accepted zip SHA-256');
assert(intake.includes('Accepted at port level'), 'SG-06 intake doc must mark the final artifact as accepted at port level');
assert(scripts['check:sg06:intake'], 'package.json must expose check:sg06:intake');
assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check:sg06:intake'),
  'package.json check:sg06 must include the SG-06 intake guard');
assert(scripts['check:sg06:ai'] && scripts['check:sg06:ai'].includes('check-sg06-ai.mjs'),
  'package.json must expose the SG-06 100-seed AI acceptance suite');
assert(scripts['check:ai'] && scripts['check:ai'].includes('check:sg06:ai'),
  'package.json check:ai must alias the SG-06 acceptance suite');
assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check:sg06:ai'),
  'package.json check:sg06 must run the SG-06 acceptance suite');
assert(scripts['check:sg06:registry-init'] && scripts['check:sg06:registry-init'].includes('check-sg06-registry-init.mjs'),
  'package.json must expose the SG-06 lazy registry-init gate');
assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check:sg06:registry-init'),
  'package.json check:sg06 must run the SG-06 lazy registry-init gate');
assert(scripts['check:sg06:live-registry'] && scripts['check:sg06:live-registry'].includes('check-sg06-live-registry.mjs'),
  'package.json must expose the SG-06 production registry gate');
assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check:sg06:live-registry'),
  'package.json check:sg06 must run the SG-06 production registry gate');
assert(scripts['check:sg06:encounter-owner'] && scripts['check:sg06:encounter-owner'].includes('check-sg06-encounter-owner.mjs'),
  'package.json must expose the SG-06 active encounter owner gate');
assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check:sg06:encounter-owner'),
  'package.json check:sg06 must run the SG-06 active encounter owner gate');
assert(scripts['check:sg06:tether-break'] && scripts['check:sg06:tether-break'].includes('check-sg06-live-tether-break.mjs'),
  'package.json must expose the SG-06 live tether-break gate');
assert(scripts['check:sg06'] && scripts['check:sg06'].includes('check:sg06:tether-break'),
  'package.json check:sg06 must run the SG-06 live tether-break gate');

const hasProductionClaim = PRODUCTION_CLAIM_MARKERS.some(exists) || systemImportsSg06();

if (exists('src/ai/index.js')) {
  assertNoDanglingExports('src/ai/index.js');
  for (const rel of REQUIRED_MODULES) assert(exists(rel), `SG-06 production AI export requires ${rel}`);
}

if (hasProductionClaim) {
  for (const rel of REQUIRED_FULL_HANDOFF) {
    assert(exists(rel), `SG-06 production landing requires ${rel}`);
  }
  assertAcceptanceRecord();
  assertAiActionPort();
  assertNoPrivilegedAiMutation();
  assertSourceHygiene();
  await assertGatedProductionRegistration();
}

console.log('SG-06 intake checks OK');

function assertNoDanglingExports(rel) {
  for (const specifier of exportSpecifiers(read(rel))) {
    const target = `src/ai/${specifier}.js`;
    assert(exists(target), `${rel} re-exports missing module ${target}`);
  }
}

function exportSpecifiers(source) {
  const out = [];
  const re = /export\s+\*\s+from\s+['"]\.\/([^'"]+)\.js['"]/g;
  let match;
  while ((match = re.exec(source))) out.push(match[1]);
  return out;
}

function systemImportsSg06() {
  for (const rel of ['src/systems/ai.js', 'src/systems/tacticalAI.js']) {
    if (!exists(rel)) continue;
    const text = read(rel);
    if (text.includes('../ai/') || text.includes("from './tacticalAI") || text.includes('TacticalAIStack')) return true;
  }
  return false;
}

function assertAiActionPort() {
  const rel = 'src/ai/sg03ActionPort.js';
  assert(exists(rel), 'SG-06 production landing requires src/ai/sg03ActionPort.js');
  const text = read(rel);
  assert(text.includes('requestAction'), 'SG-06 ActionDef port must submit through the SG-03 requestAction path');
  assert(text.includes('source') && text.includes('ai'), 'SG-06 ActionDef port must stamp source.kind=ai trace metadata');
}

function assertNoPrivilegedAiMutation() {
  for (const rel of existingFiles(['src/ai', 'src/systems/tacticalAI.js'])) {
    const text = stripComments(read(rel));
    assert(!/\brouteDamage\s*\(/.test(text), `${rel} must not call combat damage routing directly`);
    assert(!/\.(?:hp|hull|shield|armor|cap)\s*(?:=|\+=|-=|--|\+\+)/.test(text), `${rel} must not mutate combat resources directly`);
    assert(!/\bintent\s*\.\s*(?:fire|fireGroup)\s*=/.test(text), `${rel} must not use legacy intent fire shortcuts`);
    assert(!/\bstate\s*\.\s*player\b/.test(text), `${rel} must not read hidden player state directly`);
  }
}

function assertSourceHygiene() {
  for (const rel of existingFiles(['src/ai', 'src/systems/tacticalAI.js'])) {
    const text = stripComments(read(rel));
    assert(!/\bMath\s*\.\s*random\s*\(/.test(text), `${rel} must not use Math.random`);
    assert(!/\bDate\s*\.\s*now\s*\(/.test(text), `${rel} must not use Date.now`);
    assert(!/\bperformance\s*\.\s*now\s*\(/.test(text), `${rel} must not use wall-clock timing`);
    assert(!/\bdocument\s*\./.test(text), `${rel} must stay renderer/DOM independent`);
    assert(!/\bTHREE\s*\./.test(text), `${rel} must stay renderer/DOM independent`);
    assert(!/\bglobalThis\s*\.\s*window\b/.test(text), `${rel} must stay renderer/DOM independent`);
    assert(!/\bwindow\s*\.\s*(?:document|addEventListener|requestAnimationFrame|localStorage|sessionStorage|location|navigator)\b/.test(text),
      `${rel} must stay renderer/DOM independent`);
  }
}

function assertAcceptanceRecord() {
  const acceptance = json('docs/Spec/SG-06_ACCEPTANCE.json');
  assert.equal(acceptance.schema, 'spaceface.sg06.acceptance.v1', 'SG-06 acceptance record schema mismatch');
  assert.equal(acceptance.contract, 'SG-06', 'SG-06 acceptance record contract mismatch');
  assert.equal(acceptance.deterministic, true, 'SG-06 acceptance record must declare deterministic replay');
  assert.equal(acceptance.seeds, 100, 'SG-06 acceptance record must cover 100 seeded runs');
  assert.ok(Array.isArray(acceptance.tactics) && acceptance.tactics.length >= 3,
    'SG-06 acceptance record must demonstrate at least three tactics');
  assert.deepEqual(new Set(acceptance.counterTetherActions), new Set(['action_cut', 'action_dash']),
    'SG-06 acceptance record must cover both canonical counter-tether actions');
  assert.equal(acceptance.physicalFormationConvergence, 'covered_by_check_sg06_formation',
    'SG-06 acceptance should point physical convergence proof at the Rapier formation gate');
  assert.equal(acceptance.integrationStatus && acceptance.integrationStatus.productionRegistration,
    'explicit_sg06_tactical_backend_proved_default_replacement_gated',
    'SG-06 acceptance should record the opted-in production registry gate status');
  assert.equal(acceptance.integrationStatus && acceptance.integrationStatus.masslineThresholdBreak,
    'opted_in_sg06_dash_armed_overload_proved_default_replacement_gated',
    'SG-06 acceptance should record the opted-in Massline threshold-break gate status');
  assert.equal(acceptance.integrationStatus && acceptance.integrationStatus.activeEncounterOwner,
    'covered_by_check_sg06_encounter_owner',
    'SG-06 acceptance should record the active encounter owner gate status');
  assert.equal(acceptance.integrationStatus && acceptance.integrationStatus.transientEncounterSaveLoadReset,
    'covered_by_check_gameplay_core',
    'SG-06 acceptance should record the transient save/load reset gate status');
  assert.equal(acceptance.integrationStatus && acceptance.integrationStatus.runtimeCapabilityGating,
    'covered_by_check_sg06_production_ports',
    'SG-06 acceptance should record the runtime capability gating status');
  assert.equal(acceptance.integrationStatus && acceptance.integrationStatus.productionSpawnTacticalCapabilities,
    'covered_by_check_sg06_production_ports_and_encounter_owner',
    'SG-06 acceptance should record the production spawn tactical capability status');
}

async function assertGatedProductionRegistration() {
  const registry = read('src/core/registry.js');
  assert(registry.includes('createTacticalAISystem'), 'SG-06 registry gate must construct tacticalAI through the production registry');
  assert(registry.includes('aiEncounter'), 'SG-06 registry gate must register the active encounter owner');
  assert(registry.includes("aiBackend === 'sg06-tactical'"), 'SG-06 tacticalAI must stay behind the explicit AI backend selector');
  assert(registry.includes("physicsBackend === 'rapier-dynamic'"), 'SG-06 tacticalAI must require SG-02 dynamic authority in the production registry');
  assert(registry.includes("byName.set('ai', aiSlot)"), 'production registry must preserve the ai slot alias for the selected backend');
  const gameState = read('src/core/gameState.js');
  assert(gameState.includes("aiBackend: 'legacy'"), 'default game settings must keep legacy AI until live parity gates pass');
  const saveSystem = read('src/save/saveSystem.js');
  assert(saveSystem.includes('VALID_AI_BACKENDS'), 'save restore must validate the AI backend setting');
  assert(saveSystem.includes("'sg06-tactical'"), 'save restore must allow only the explicit SG-06 AI backend id');
  assert(saveSystem.includes('this.state.aiEncounter = { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] }'),
    'save restore must clear transient SG-06 encounter commands and owner state');
  assert(read('scripts/check-sg06-ai.mjs').includes('transientEncounterSaveLoadReset'),
    'SG-06 acceptance report generator must include the transient save/load reset status');
  assert(read('scripts/check-sg06-ai.mjs').includes('runtimeCapabilityGating'),
    'SG-06 acceptance report generator must include the runtime capability gating status');
  assert(read('scripts/check-sg06-ai.mjs').includes('productionSpawnTacticalCapabilities'),
    'SG-06 acceptance report generator must include the production spawn tactical capability status');
  const combat = read('src/systems/combat.js');
  assert(combat.includes('tacticalCapabilitiesFor'), 'enemy spawn specs must author SG-06 tactical capability metadata');
  assert(combat.includes('ARCHETYPE_TACTICAL_CAPABILITIES'), 'enemy spawn tactical capabilities must be explicit and reviewable');
  const tactical = read('src/systems/tacticalAI.js');
  assert(tactical.includes('helpers.aiManeuver'), 'SG-06 tacticalAI must depend on helpers.aiManeuver');
  assert(tactical.includes('function ensureStack'), 'SG-06 tacticalAI must lazy-bind ports for registry-slot initialization');
  assert(tactical.includes('new TacticalAIStack'), 'SG-06 tacticalAI must construct the validated stack');
  const encounterOwner = read('src/systems/aiEncounter.js');
  assert(encounterOwner.includes('request_reinforcement'), 'SG-06 encounter owner must consume reinforcement commands');
  assert(encounterOwner.includes('makeEnemySpawnSpec'), 'SG-06 encounter owner must route spawns through the existing combat spawn factory');
  assert(read('src/ai/stack.js').includes('assertAIPorts'), 'SG-06 stack must fail closed on missing ports');
  assert(read('src/ai/contracts.js').includes('function requireMethod'), 'SG-06 port contract must require methods explicitly');
  const { TacticalAIStack } = await import('../src/ai/stack.js');
  assert.throws(() => new TacticalAIStack({ ports: {} }), /required/,
    'SG-06 stack must throw when required ports are missing');
}

function existingFiles(relOrFiles) {
  const roots = Array.isArray(relOrFiles) ? relOrFiles : [relOrFiles];
  const out = [];
  for (const rel of roots) {
    if (!exists(rel)) continue;
    if (!isDirectory(rel)) out.push(rel);
    else walk(rel, (file) => {
      if (file.endsWith('.js') || file.endsWith('.mjs')) out.push(file);
    });
  }
  return out;
}

function walk(rel, visit) {
  for (const entry of readdirSync(abs(rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) walk(child, visit);
    else visit(child);
  }
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function json(rel) {
  return JSON.parse(read(rel));
}

function read(rel) {
  return readFileSync(abs(rel), 'utf8');
}

function exists(rel) {
  return existsSync(abs(rel));
}

function isDirectory(rel) {
  try {
    return readdirSync(abs(rel), { withFileTypes: true }) && true;
  } catch (_) {
    return false;
  }
}

function abs(rel) {
  return resolve(ROOT, rel);
}
