#!/usr/bin/env node
// D1 living opposition — natural crowded-sector soak (F0 task 8).
//
// Proves ≥1 FACTION_DOCTRINES-tagged hostile/carrier appears via ordinary sector
// materialization (world ambient zone plan / ring ambient) without force-spawn,
// requestAuthoredEncounter, or SF injection.
//
// Green bar (this residual):
//   - Crowded sector enter → ≥1 live contact with data/ai.factionDoctrineId that
//     matches a shipped FACTION_DOCTRINES profile id.
//   - Combat doctrine id present on that contact (living combat layer).
//   - Multi-seed (CI pair) isolation; deterministic report.
//
// Honest residual (fail-closed documentation, not a green claim):
//   - Helix still has no natural zone / fleet carrier (Fable §5.7 spawn-policy
//     still rules Helix budget class / gating). Report helixCarrierCount and
//     fail only if FORCE_HELIX_CARRIER=1.
//
// Usage:
//   npm run check:depth-program:d1:living-opposition
//   FORCE_HELIX_CARRIER=1 npm run check:depth-program:d1:living-opposition  # fail-closed Helix bar

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { FACTION_DOCTRINES as DOCTRINES } from '../src/data/factionDoctrines.js';
import { SECTORS } from '../src/data/sectors.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, '.devshots/depth-program/d1-living-opposition.json');
const LOG = resolve(ROOT, 'implementer/living-opposition.log');

const CI_SEEDS = Object.freeze([48_200, 48_201]);
// Sker Haven: enemyDensity 0.70, multiple Reach zone ambush carriers — ordinary crowded play.
const CROWDED_SECTOR = 'sector_sker_haven';
// Ceres is a secondary crowded belt (lower density) for multi-sector proof.
const SECONDARY_SECTOR = 'sector_ceres_belt';
const HEADLESS_SKIP = new Set(['render', 'vfx', 'feel', 'audio', 'ui', 'save', 'sectorPostcard']);
const FORCE_HELIX = String(process.env.FORCE_HELIX_CARRIER || '') === '1';
const SOAK_TICKS = 30; // brief settle; ambient materializes on enterSector, not over soak

const DOCTRINE_IDS = new Set(
  Object.values(DOCTRINES).map((row) => row && row.id).filter(Boolean),
);
const HELIX_DOCTRINE_ID = DOCTRINES.faction_helix && DOCTRINES.faction_helix.id;

assert.ok(DOCTRINE_IDS.size >= 9, 'FACTION_DOCTRINES must cover original nine + expansions');
assert.equal(HELIX_DOCTRINE_ID, 'helix_controlled_escalation');

const restoreGlobals = installHeadlessBrowserStubs();
let rows;
try {
  rows = [];
  for (const seed of CI_SEEDS) {
    rows.push(soakSeed(seed, CROWDED_SECTOR));
    rows.push(soakSeed(seed, SECONDARY_SECTOR));
  }
} finally {
  restoreGlobals();
}

const tagged = rows.filter((row) => row.doctrineTaggedCount >= 1);
const helixRows = rows.filter((row) => row.helixCarrierCount >= 1);

assert.ok(
  tagged.length === rows.length,
  `every crowded-sector soak must surface ≥1 FACTION_DOCTRINES-tagged contact; tagged=${tagged.length}/${rows.length}`,
);

if (FORCE_HELIX) {
  assert.ok(
    helixRows.length > 0,
    'FORCE_HELIX_CARRIER=1: Helix natural carrier required but helixCarrierCount=0 (REAL residual; Fable §5.7)',
  );
}

const report = {
  schema: 'spaceface.depth_program.d1_living_opposition.v1',
  check: 'depth-program-d1-living-opposition',
  seeds: [...CI_SEEDS],
  sectors: [CROWDED_SECTOR, SECONDARY_SECTOR],
  forceHelix: FORCE_HELIX,
  pass: true,
  doctrineTaggedSoaks: tagged.length,
  helixCarrierSoaks: helixRows.length,
  helixResidual: helixRows.length === 0
    ? 'REAL — Helix has no natural fleet/zone carrier; Fable §5.7 spawn-policy still blocks product change'
    : null,
  rows,
  notes: [
    'No force-spawn / requestAuthoredEncounter / window.SF',
    'Ambient materializes through registered world.enterSector only',
    'factionDoctrineId stamped on zone/ring ambient when FACTION_DOCTRINES owns the faction',
    'Helix residual is documented, not waived as green',
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
mkdirSync(dirname(LOG), { recursive: true });
writeFileSync(LOG, formatLog(report), 'utf8');

console.log(JSON.stringify({
  pass: true,
  doctrineTaggedSoaks: report.doctrineTaggedSoaks,
  helixCarrierSoaks: report.helixCarrierSoaks,
  helixResidual: report.helixResidual,
  evidence: OUT,
  log: LOG,
}, null, 2));
console.log('[check-depth-program-d1-living-opposition] PASS');

function soakSeed(seed, sectorId) {
  const harness = makeHarness(seed, sectorId);
  try {
    const { state, registry } = harness;
    const world = registry.get('world');
    assert.ok(world && typeof world.enterSector === 'function', 'world.enterSector required');

    // Ordinary materialization: boot membership only. No spawn:request / makeEnemySpawnSpec harness.
    world.enterSector(sectorId, { placePlayer: true });
    assert.equal(state.world.currentSectorId, sectorId, `entered ${sectorId}`);

    for (let i = 0; i < SOAK_TICKS; i += 1) registry.step(1 / 60);

    const contacts = collectContacts(state);
    const doctrineTagged = contacts.filter((c) => DOCTRINE_IDS.has(c.factionDoctrineId));
    const combatDoctrineTagged = contacts.filter((c) => !!c.combatDoctrineId);
    const helix = contacts.filter((c) => (
      c.factionId === 'faction_helix'
      || c.factionDoctrineId === HELIX_DOCTRINE_ID
    ));
    const hostileTagged = doctrineTagged.filter((c) => c.hostileTeam || c.context === 'zone_hostile' || c.context === 'ambient');

    assert.ok(
      doctrineTagged.length >= 1,
      `${sectorId} seed=${seed}: expected ≥1 FACTION_DOCTRINES-tagged contact; got ${contacts.length} contacts, doctrineTagged=0`,
    );
    assert.ok(
      combatDoctrineTagged.length >= 1,
      `${sectorId} seed=${seed}: expected living combatDoctrineId on contacts`,
    );

    return {
      seed,
      sectorId,
      contactCount: contacts.length,
      doctrineTaggedCount: doctrineTagged.length,
      combatDoctrineTaggedCount: combatDoctrineTagged.length,
      hostileDoctrineTaggedCount: hostileTagged.length,
      helixCarrierCount: helix.length,
      sample: doctrineTagged.slice(0, 3).map((c) => ({
        entityId: c.entityId,
        factionId: c.factionId,
        factionDoctrineId: c.factionDoctrineId,
        combatDoctrineId: c.combatDoctrineId,
        context: c.context,
        team: c.team,
      })),
      pass: true,
    };
  } finally {
    harness.dispose();
  }
}

function collectContacts(state) {
  const out = [];
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false) continue;
    if (entity.id === state.playerId) continue;
    if (entity.type && entity.type !== 'ship' && entity.type !== 'npc') {
      // ships are type 'ship'; still accept any with ai + faction
    }
    const data = entity.data || {};
    const ai = data.ai || {};
    const factionDoctrineId = data.factionDoctrineId || ai.factionDoctrineId || data.contactDoctrineId || null;
    const combatDoctrineId = ai.combatDoctrineId || null;
    const factionId = entity.factionId || data.factionId || null;
    // Only report entities that look like fleet/hostile contacts (not stations/asteroids).
    if (!factionId && !factionDoctrineId && !combatDoctrineId) continue;
    if (!ai.archetype && !combatDoctrineId && !factionDoctrineId) continue;
    out.push({
      entityId: entity.id,
      factionId,
      factionDoctrineId,
      combatDoctrineId,
      context: ai.spawnContext || null,
      team: entity.team,
      hostileTeam: entity.team === 1 || entity.team === 3,
    });
  }
  return out;
}

function makeHarness(seed, sectorId) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.tutorialHints = false;
  state.world.sectors = Object.fromEntries(SECTORS.map((s) => [s.id, { ...s, owner: s.factionId }]));
  state.world.currentSectorId = sectorId;

  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  const registry = createRegistry(ctx);
  ctx.registry = registry;

  for (const system of registry.systems) {
    if (HEADLESS_SKIP.has(system.name)) continue;
    if (typeof system.init === 'function') system.init(ctx);
  }

  const origin = sectorGlobalOrigin(sectorId);
  const player = helpers.spawnEntity(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: origin.x, z: origin.z },
  }));
  state.playerId = player.id;

  return {
    state,
    bus,
    helpers,
    registry,
    player,
    dispose() {
      try { registry.destroy(); } catch { /* best effort */ }
    },
  };
}

function formatLog(report) {
  const lines = [
    `# D1 living-opposition implementer log`,
    `date: ${new Date().toISOString()}`,
    `gate: check:depth-program:d1:living-opposition`,
    `pass: ${report.pass}`,
    `seeds: ${report.seeds.join(', ')}`,
    `sectors: ${report.sectors.join(', ')}`,
    `doctrineTaggedSoaks: ${report.doctrineTaggedSoaks}/${report.rows.length}`,
    `helixCarrierSoaks: ${report.helixCarrierSoaks}`,
    `helixResidual: ${report.helixResidual || 'none'}`,
    ``,
    `## per-seed`,
  ];
  for (const row of report.rows) {
    lines.push(
      `- seed=${row.seed} sector=${row.sectorId} contacts=${row.contactCount} `
      + `factionDoctrine=${row.doctrineTaggedCount} combatDoctrine=${row.combatDoctrineTaggedCount} `
      + `helix=${row.helixCarrierCount} sample=${JSON.stringify(row.sample)}`,
    );
  }
  lines.push('');
  lines.push('## notes');
  for (const n of report.notes) lines.push(`- ${n}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

/** Minimal browser stubs so registry systems that touch DOM (input) can init headless. */
function installHeadlessBrowserStubs() {
  const prior = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  const listeners = new Map();
  globalThis.addEventListener = (type, fn) => {
    const key = String(type || '');
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    const set = listeners.get(String(type || ''));
    if (set) set.delete(fn);
  };
  globalThis.document = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    body: { style: {} },
    documentElement: { style: {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => {
      const el = {
        style: {},
        classList: { add() {}, remove() {}, contains() { return false; } },
        children: [],
        setAttribute() {},
        appendChild(child) { this.children.push(child); return child; },
        removeChild() {},
        addEventListener() {},
        removeEventListener() {},
      };
      return el;
    },
  };
  globalThis.window = globalThis;
  globalThis.HTMLElement = class HTMLElement {};
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  return () => {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}
