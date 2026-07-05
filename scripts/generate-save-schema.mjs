#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import { CURRENT_VERSION, MIGRATIONS } from '../src/save/migrations.js';

const ROOT_URL = new URL('../', import.meta.url);
const SCHEMA_PATH = new URL('SAVE_SCHEMA.md', ROOT_URL);
const MODE = process.argv.includes('--write')
  ? 'write'
  : process.argv.includes('--check')
    ? 'check'
    : 'print';

const report = buildSchemaReport();
const markdown = renderMarkdown(report);

if (MODE === 'write') {
  writeFileSync(SCHEMA_PATH, markdown);
  console.log(`Wrote ${fileURLToPath(SCHEMA_PATH)}`);
} else if (MODE === 'check') {
  const existing = readFileSync(SCHEMA_PATH, 'utf8');
  assert.equal(existing, markdown, 'SAVE_SCHEMA.md is stale; run node scripts/generate-save-schema.mjs --write');
  console.log(`SAVE_SCHEMA.md OK (version ${CURRENT_VERSION}, ${report.paths.length} paths)`);
} else {
  process.stdout.write(markdown);
}

function buildSchemaReport() {
  const state = createGameState(47);
  seedSaveablePlayer(state);
  const ctx = {
    state,
    bus: { emit() {}, on() { return () => {}; } },
    helpers: {},
    registry: { get() { return null; } },
  };
  save.init(ctx);
  const data = normalizeSchemaData(save.serializeData());
  const envelope = save.serialize('schema-fixture');
  validateEnvelope(envelope);
  const migrationReport = validateMigrations();
  return {
    version: CURRENT_VERSION,
    dataKeys: Object.keys(data),
    paths: collectPaths(data),
    migrations: migrationReport.steps,
    migrationCoverage: migrationReport.coverage,
  };
}

function seedSaveablePlayer(state) {
  state.mode = 'flight';
  state.playerId = 1;
  state.nextEntityId = 2;
  state.meta.createdAt = 'schema-fixture';
  state.meta.playtimeS = 0;
  state.player.credits = 5000;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_free',
    radius: 12,
    mass: 100,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
    shield: 50,
    shieldMax: 50,
    cap: 100,
    capMax: 100,
    flags: {},
    data: { defId: 'ship_kestrel', fittings: [] },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
}

function validateEnvelope(envelope) {
  assert.equal(envelope.fmt, 'spaceface-save', 'save envelope format should stay stable');
  assert.equal(envelope.version, CURRENT_VERSION, 'save envelope should use CURRENT_VERSION');
  assert.equal(typeof envelope.checksum, 'string', 'save envelope should include checksum');
  assert.doesNotThrow(() => JSON.stringify(envelope), 'save envelope should be plain JSON');
  assert(envelope.data && envelope.data.entities && envelope.data.entities.player,
    'schema fixture should include a restorable player entity');
}

function normalizeSchemaData(data) {
  const out = JSON.parse(JSON.stringify(data));
  if (out.meta) out.meta.lastSavedAt = '<iso8601>';
  return out;
}

function validateMigrations() {
  const byFrom = new Map();
  for (const step of MIGRATIONS) {
    assert.equal(typeof step.from, 'number', 'migration.from should be numeric');
    assert.equal(typeof step.to, 'number', 'migration.to should be numeric');
    assert.equal(typeof step.fn, 'function', `migration ${step.from}->${step.to} should have fn`);
    assert(!byFrom.has(step.from), `duplicate migration from version ${step.from}`);
    assert(step.to > step.from, `migration ${step.from}->${step.to} must move forward`);
    byFrom.set(step.from, step);
  }

  const coverage = [];
  for (let version = 1; version < CURRENT_VERSION; version++) {
    const data = legacyFixture(version);
    const reached = applyMigrationChain(data, version, byFrom);
    assert.equal(reached, CURRENT_VERSION, `migration chain from v${version} should reach CURRENT_VERSION`);
    assertMigrationDefaults(data);
    const once = stableStringify(data);
    const rerunReached = applyMigrationChain(data, version, byFrom);
    assert.equal(rerunReached, CURRENT_VERSION, `migration chain from v${version} should be re-runnable`);
    assert.equal(stableStringify(data), once, `migration chain from v${version} should be idempotent`);
    coverage.push({ from: version, to: reached });
  }

  return {
    steps: MIGRATIONS.map((m) => ({ from: m.from, to: m.to })),
    coverage,
  };
}

function legacyFixture(version) {
  const data = {
    meta: { version },
    player: {},
    cargo: { items: {}, capVolume: 40, capMass: 60 },
    entities: {
      player: { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel' } },
      persistent: [],
      simTime: 0,
      tick: 0,
    },
  };
  if (version >= 2) data.crafting = { queues: {} };
  if (version >= 3) data.sectorSim = { sectors: {}, meta: {} };
  if (version >= 5) data.combat = { schemaVersion: 1, combatSchemaVersion: 1, actions: {}, attachments: { byId: {} } };
  if (version >= 6) data.nav = { route: null, autoTravel: false, waypoint: null };
  return data;
}

function applyMigrationChain(data, fromVersion, byFrom) {
  let version = fromVersion;
  let guard = 0;
  while (version < CURRENT_VERSION && guard++ < 64) {
    const step = byFrom.get(version);
    assert(step, `missing migration from v${version}`);
    step.fn(data);
    version = step.to;
  }
  assert(guard < 64, 'migration chain should not loop');
  return version;
}

function assertMigrationDefaults(data) {
  assert(data.crafting && typeof data.crafting.queues === 'object', 'migrations should seed crafting.queues');
  assert(data.sectorSim && typeof data.sectorSim.sectors === 'object', 'migrations should seed sectorSim.sectors');
  assert(data.sectorSim && typeof data.sectorSim.meta === 'object', 'migrations should seed sectorSim.meta');
  assert(data.combat && data.combat.attachments && typeof data.combat.attachments.byId === 'object',
    'migrations should seed combat attachments');
  assert(data.nav && 'route' in data.nav && 'autoTravel' in data.nav && 'waypoint' in data.nav,
    'migrations should seed nav route/autoTravel/waypoint');
}

function collectPaths(value) {
  const rows = [];
  visit('$', value);
  rows.sort((a, b) => a.path.localeCompare(b.path));
  return rows;

  function visit(path, node) {
    rows.push({ path, type: describeType(node), sample: sampleValue(node) });
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (node.length) visit(`${path}[]`, node[0]);
      return;
    }
    for (const key of Object.keys(node)) visit(`${path}.${key}`, node[key]);
  }
}

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function sampleValue(value) {
  if (value === null) return 'null';
  const type = describeType(value);
  if (type === 'object') return '{}';
  if (type === 'array') return `length ${value.length}`;
  const raw = String(value);
  return raw.length > 48 ? raw.slice(0, 45) + '...' : raw;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# SpaceFace Save Schema');
  lines.push('');
  lines.push('> Generated by `node scripts/generate-save-schema.mjs --write`. Do not edit by hand.');
  lines.push('');
  lines.push(`Current save version: \`${report.version}\``);
  lines.push('');
  lines.push('## Data Key Order');
  lines.push('');
  for (const key of report.dataKeys) lines.push(`- \`${key}\``);
  lines.push('');
  lines.push('## Migration Chain');
  lines.push('');
  for (const step of report.migrations) lines.push(`- v${step.from} -> v${step.to}`);
  lines.push('');
  lines.push('## Migration Coverage');
  lines.push('');
  for (const item of report.migrationCoverage) lines.push(`- v${item.from} fixture migrates to v${item.to}`);
  lines.push('');
  lines.push('## Serialized Paths');
  lines.push('');
  lines.push('| Path | Type | Sample |');
  lines.push('|---|---|---|');
  for (const row of report.paths) {
    lines.push(`| \`${escapeTable(row.path)}\` | ${escapeTable(row.type)} | ${escapeTable(row.sample)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

function escapeTable(value) {
  return String(value).replace(/\|/g, '\\|');
}
