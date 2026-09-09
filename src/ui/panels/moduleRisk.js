// BP-09.1 MODULE-DRAWBACK-GLYPHS.
//
// Pure readout helper for fitting screens. It surfaces only risks already
// represented in shipped data/derived stats; it does not create drawbacks.
import { MODULES } from '../../data/modules.js';
import { SHIPS } from '../../data/ships.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../../systems/ships.js';

export const HEAVY_MODULE_MASS = 10;
export const HEAVY_BUILD_MASS_RATIO = 1.2;

const MODULE_BY_ID = new Map(MODULES.map((moduleDef) => [moduleDef.id, moduleDef]));
const SHIP_BY_ID = new Map(SHIPS.map((shipDef) => [shipDef.id, shipDef]));

export const MODULE_RISK_GLYPHS = Object.freeze({
  contraband: Object.freeze({
    id: 'contraband',
    glyph: 'contraband',
    label: 'Contraband',
    tone: 'illegal',
  }),
  mining_noise: Object.freeze({
    id: 'mining_noise',
    glyph: 'noise',
    label: 'Mining noise',
    tone: 'loud',
  }),
  heavy_module: Object.freeze({
    id: 'heavy_module',
    glyph: 'mass',
    label: 'Heavy',
    tone: 'heavy',
  }),
  power_hungry: Object.freeze({
    id: 'power_hungry',
    glyph: 'power',
    label: 'Power hungry',
    tone: 'hot',
  }),
  heavy_build: Object.freeze({
    id: 'heavy_build',
    glyph: 'mass-stack',
    label: 'Heavy fit',
    tone: 'heavy',
  }),
});

export function moduleById(moduleOrId) {
  if (!moduleOrId) return null;
  if (typeof moduleOrId === 'string') return MODULE_BY_ID.get(moduleOrId) || null;
  if (moduleOrId.id && MODULE_BY_ID.has(moduleOrId.id)) return MODULE_BY_ID.get(moduleOrId.id);
  return moduleOrId;
}

export function moduleRiskGlyphs(moduleOrId) {
  const moduleDef = moduleById(moduleOrId);
  if (!moduleDef) return [];
  const mods = moduleDef.mods || {};
  const risks = [];

  if (moduleDef.legality === 'contraband') {
    risks.push(risk('contraband', {
      moduleId: moduleDef.id,
      source: 'module.legality',
      value: moduleDef.legality,
      hiddenCargoPct: finite(mods.hiddenCargoPct, 0),
      scannerCloak: finite(mods.scannerCloak, 0),
      detail: 'Customs scans can treat this fitting as contraband.',
    }));
  }

  if (moduleDef.slotType === 'mining' && Number.isFinite(Number(moduleDef.dps))) {
    risks.push(risk('mining_noise', {
      moduleId: moduleDef.id,
      source: 'mining._updateMiningNoise',
      dps: Number(moduleDef.dps),
      detail: 'Sustained beam use raises player.miningNoise and can emit danger:miningNoise.',
    }));
  }

  if (finite(moduleDef.mass, 0) >= HEAVY_MODULE_MASS) {
    risks.push(risk('heavy_module', {
      moduleId: moduleDef.id,
      source: 'module.mass',
      mass: finite(moduleDef.mass, 0),
      detail: 'Module mass feeds getDerivedStats handling and flight mass.',
    }));
  }

  return risks;
}

export function moduleRiskStrip(moduleIds = [], options = {}) {
  const shipId = options.shipId || 'ship_kestrel';
  const requestedModules = (moduleIds || []).map(moduleById).filter(Boolean);
  const fittings = Array.isArray(options.fittings)
    ? options.fittings.slice()
    : fittingsFromDefaultModules(shipId, requestedModules.map((moduleDef) => moduleDef.id));
  const modules = fittings.map(moduleById).filter(Boolean);
  const derived = getDerivedStats(shipId, fittings, options.player || null);
  const shipDef = SHIP_BY_ID.get(shipId) || SHIP_BY_ID.get('ship_kestrel');
  const baseMass = finite(shipDef && shipDef.mass, 1);
  const massRatio = baseMass > 0 ? finite(derived.mass, baseMass) / baseMass : 1;

  const moduleRisks = modules.map((moduleDef) => ({
    moduleId: moduleDef.id,
    risks: moduleRiskGlyphs(moduleDef),
  }));
  const aggregateRisks = [];

  if (finite(derived.continuousDrain, 0) > finite(derived.capRegen, 0)) {
    aggregateRisks.push(risk('power_hungry', {
      source: 'getDerivedStats.continuousDrain',
      continuousDrain: round1(derived.continuousDrain),
      capRegen: round1(derived.capRegen),
      detail: 'Continuous module draw exceeds capacitor regeneration.',
    }));
  }

  if (massRatio >= HEAVY_BUILD_MASS_RATIO) {
    aggregateRisks.push(risk('heavy_build', {
      source: 'getDerivedStats.mass',
      mass: round1(derived.mass),
      baseMass: round1(baseMass),
      massRatio: round2(massRatio),
      detail: 'Fitted mass materially changes handling.',
    }));
  }

  return Object.freeze({
    shipId,
    moduleIds: modules.map((moduleDef) => moduleDef.id),
    derived: Object.freeze({
      continuousDrain: round1(derived.continuousDrain),
      capRegen: round1(derived.capRegen),
      mass: round1(derived.mass),
      baseMass: round1(baseMass),
      massRatio: round2(massRatio),
    }),
    moduleRisks: Object.freeze(moduleRisks.map((entry) => Object.freeze({
      moduleId: entry.moduleId,
      risks: Object.freeze(entry.risks),
    }))),
    risks: Object.freeze(uniqueRisks([
      ...moduleRisks.flatMap((entry) => entry.risks),
      ...aggregateRisks,
    ])),
  });
}

function risk(id, basis) {
  const base = MODULE_RISK_GLYPHS[id];
  return Object.freeze({
    id: base.id,
    glyph: base.glyph,
    label: base.label,
    tone: base.tone,
    basis: Object.freeze({ ...basis }),
  });
}

function uniqueRisks(risks) {
  const out = [];
  const seen = new Set();
  for (const item of risks) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round1(value) {
  return Math.round(finite(value, 0) * 10) / 10;
}

function round2(value) {
  return Math.round(finite(value, 0) * 100) / 100;
}
