// src/systems/asteroidInteriorPuzzle.js — Deep Subterranean Synergy, Anomaly, Blueprint & Cutaway Solver.
// Pure, deterministic helper owned by src/systems/asteroidSites.js (never imports Three.js, DOM,
// siteThermalModel, or wall-clock time). Elevates interior Asteroid Works placement into a rich
// spatial engineering puzzle AND projects live schematics + blueprint tools into Field Architect.
import { hash32 } from '../core/rng.js';
import { COLS, ROWS, tileIndex } from './drillFieldModel.js';
import { SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID } from '../data/sites.js';
import {
  ASTEROID_BLUEPRINTS,
  ASTEROID_BLUEPRINT_BY_ID,
  BELT_ORBITAL_STRUCTURES,
  SITE_DIRECTIVE_BY_ID,
  SUBTERRANEAN_ANOMALIES,
  SUBTERRANEAN_ANOMALY_BY_ID,
  SUBTERRANEAN_SYNERGY_RULES,
} from '../data/beltEmpireData.js';
import { contactProfile, machineCapability, oreContactRate } from './siteProduction.js';
import { COMMODITIES } from '../data/commodities.js';

const COMMODITY_PRICE = new Map(COMMODITIES.map((c) => [c.id, Number(c.basePrice) || 10]));

function chebyshevDist(a, b) {
  return Math.max(Math.abs((a.col | 0) - (b.col | 0)), Math.abs((a.row | 0) - (b.row | 0)));
}

function inBounds(col, row) {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

/**
 * Rotate a relative blueprint cell offset (dc, dr) by k * 90deg clockwise.
 */
export function rotateCellOffset(dc, dr, rotation = 0) {
  const r = ((Math.trunc(Number(rotation) || 0) % 4) + 4) % 4;
  if (r === 1) return { dc: (-dr) || 0, dr: dc || 0 };
  if (r === 2) return { dc: (-dc) || 0, dr: (-dr) || 0 };
  if (r === 3) return { dc: dr || 0, dr: (-dc) || 0 };
  return { dc: dc || 0, dr: dr || 0 };
}

/**
 * Deterministically generate and evaluate 2-4 subterranean geological anomalies
 * anchored deep inside an asteroid's bore grid. Anomalies act as tactical puzzle anchors:
 * keeping them solid and adjacent to machines grants permanent site-wide auras, while
 * drilling directly through them forfeits the permanent aura in exchange for lump resources.
 */
export function evaluateSubterraneanAnomalies(boreSeed, field, machines = []) {
  const seed = (boreSeed >>> 0) || 1;
  if (!field || !Array.isArray(field)) return [];
  const count = 2 + (hash32(seed, 'anom-count') % 3); // 2..4 anomalies per asteroid
  const results = [];
  const usedKeys = new Set();
  const minRow = 4;
  const maxRow = Math.max(minRow + 4, ROWS - 4);
  const minCol = 3;
  const maxCol = Math.max(minCol + 4, COLS - 4);

  for (let i = 0; i < count; i++) {
    const def = SUBTERRANEAN_ANOMALIES[hash32(seed, 'anom-type', i) % SUBTERRANEAN_ANOMALIES.length];
    let col = minCol + (hash32(seed, 'anom-c', i) % Math.max(1, maxCol - minCol));
    let row = minRow + (hash32(seed, 'anom-r', i) % Math.max(1, maxRow - minRow));
    let guard = 0;
    while (usedKeys.has(`${col},${row}`) && guard < 12) {
      col = minCol + ((col + 3) % Math.max(1, maxCol - minCol));
      row = minRow + ((row + 2) % Math.max(1, maxRow - minRow));
      guard++;
    }
    usedKeys.add(`${col},${row}`);

    const tile = field[col] && field[col][row];
    const breached = !tile || tile.type === 'empty';
    let tappedByMachineId = null;
    if (!breached && Array.isArray(machines)) {
      for (const m of machines) {
        if (!m) continue;
        if (Math.abs((m.col | 0) - col) <= 1 && Math.abs((m.row | 0) - row) <= 1 && (m.col !== col || m.row !== row)) {
          tappedByMachineId = m.id;
          break;
        }
      }
    }

    results.push({
      id: `${def.id}_${i}`,
      defId: def.id,
      name: def.name,
      kind: def.kind,
      bonusType: def.bonusType,
      magnitude: def.magnitude,
      lumpLoot: def.lumpLoot,
      summary: def.summary,
      col,
      row,
      idx: tileIndex(col, row),
      status: breached ? 'breached' : (tappedByMachineId ? 'tapped' : 'sealed'),
      tappedByMachineId,
    });
  }
  return results;
}

/**
 * Evaluate full subterranean spatial synergies, active directive multipliers,
 * doctrine modifiers, orbital structure boosts, and anomaly auras for one site.
 * Returns per-machine cooling, yield, speed, brace, and link-rate modifiers.
 */
export function evaluateSubterraneanSynergies({
  site,
  field,
  geoByMachine = {},
  compRatio = {},
  powerCompByMachine = {},
  empireDoctrines = {},
  weather = null,
} = {}) {
  const machines = Array.isArray(site?.machines) ? site.machines : [];
  const directive = SITE_DIRECTIVE_BY_ID.get(site?.directive) || SITE_DIRECTIVE_BY_ID.get('standard');

  // Doctrine tier tallies
  const unlocked = empireDoctrines && typeof empireDoctrines === 'object' ? empireDoctrines : {};
  const extractorDocBonus = (unlocked.doc_deep_core_1 ? 0.15 : 0) + (unlocked.doc_deep_core_3 ? 0.25 : 0);
  const processCeilingBonus = unlocked.doc_deep_core_2 ? 0.15 : 0;
  const globalCoolingDoc = unlocked.doc_cryo_1 ? 2.5 : 0;
  const powerDrawMultDoc = unlocked.doc_cryo_3 ? 0.85 : 1.0;
  const linkRateDocBonus = unlocked.doc_swarm_1 ? 8 : 0;
  const anomalyDoubleMult = unlocked.doc_deep_core_3 ? 2 : 1;

  // Orbital structure bonuses installed around this rock
  const defenses = Array.isArray(site?.defenses) ? site.defenses : [];
  let orbitalCoolingBonus = 0;
  let orbitalLinkRateBonus = 0;
  let orbitalStorageBonus = 0;
  let orbitalDefenseRating = 0;
  let orbitalPowerNetMw = 0;
  let orbitalShieldImmune = false;
  let passiveRegocretePerMin = 0;
  let salePriceMult = 1;
  let droneSlotBonus = unlocked.doc_swarm_2 ? 1 : 0;
  let hullRepairPerMin = 0;
  for (const defEntry of defenses) {
    const spec = BELT_ORBITAL_STRUCTURES[defEntry?.kind];
    if (!spec) continue;
    orbitalCoolingBonus += Number(spec.thermalSinkBonus) || 0;
    orbitalLinkRateBonus += Number(spec.linkRateBonusPerMin) || 0;
    orbitalStorageBonus += Number(spec.storageBonusU) || 0;
    orbitalDefenseRating += Number(spec.defenseRating) || 0;
    orbitalPowerNetMw += Number(spec.powerDeltaMw) || 0;
    if (spec.stormImmune) orbitalShieldImmune = true;
    passiveRegocretePerMin += Number(spec.passiveRegocretePerMin) || 0;
    if (spec.salePriceMult) salePriceMult = Math.max(salePriceMult, Number(spec.salePriceMult) || 1);
    droneSlotBonus += Number(spec.droneSlotsBonus) || 0;
    hullRepairPerMin += Number(spec.hullRepairPerMin) || 0;
  }

  // Anomalies (intact & tapped)
  const anomalies = evaluateSubterraneanAnomalies(site?.boreSeed || site?.asteroidId || 1, field, machines);
  let anomalyCoolingAura = 0;
  let anomalyYieldBonus = 0;
  let anomalyPowerBonusMw = 0;
  let anomalyLinkBoost = 0;
  for (const anom of anomalies) {
    if (anom.status !== 'tapped') continue;
    if (anom.bonusType === 'cooling_aura' || anom.bonusType === 'heat_vent') {
      anomalyCoolingAura += anom.magnitude * anomalyDoubleMult;
    } else if (anom.bonusType === 'value_aura') {
      anomalyYieldBonus += anom.magnitude * anomalyDoubleMult;
    } else if (anom.bonusType === 'power_aura') {
      anomalyPowerBonusMw += anom.magnitude * anomalyDoubleMult;
    } else if (anom.bonusType === 'link_boost') {
      anomalyLinkBoost += anom.magnitude * anomalyDoubleMult;
    }
  }

  const cryos = [];
  const braces = [];
  const resonators = [];
  const drivers = [];
  const capacitors = [];

  for (const m of machines) {
    const pk = powerCompByMachine[m.id];
    const ratio = pk != null ? Number(compRatio[pk] ?? 1) : 1;
    const active = ratio > 0 || SITE_MACHINE_BY_ID.get(m.defId)?.power >= 0;
    if (!active) continue;
    if (m.defId === 'sm_cryo_condenser') cryos.push(m);
    else if (m.defId === 'sm_seismic_brace') braces.push(m);
    else if (m.defId === 'sm_harmonic_resonator') resonators.push(m);
    else if (m.defId === 'sm_mass_driver') drivers.push(m);
    else if (m.defId === 'sm_capacitor_bank') capacitors.push(m);
  }

  const machineModifiers = {};
  let cryoCooledCount = 0;
  let resonatorBoostedCount = 0;
  let bracedHeavyCount = 0;

  for (const m of machines) {
    const def = SITE_MACHINE_BY_ID.get(m.defId);
    const geo = geoByMachine[m.id] || null;
    let coolingRate = globalCoolingDoc + orbitalCoolingBonus * 0.25 + anomalyCoolingAura * 0.4;
    if (weather && !orbitalShieldImmune && Number.isFinite(weather.heatDelta)) {
      coolingRate = Math.max(0, coolingRate - weather.heatDelta);
    }

    // Cryo condenser aura
    let cryoStacks = 0;
    for (const c of cryos) {
      if (chebyshevDist(m, c) <= SUBTERRANEAN_SYNERGY_RULES.cryoRadius) cryoStacks++;
    }
    if (cryoStacks > 0) {
      cryoCooledCount++;
      const cGeoBoost = cryos[0] && geoByMachine[cryos[0].id]
        ? Math.min(2, ((geoByMachine[cryos[0].id].ores?.cmdty_ice_water || 0) * 1.5))
        : 0;
      coolingRate += Math.min(
        SUBTERRANEAN_SYNERGY_RULES.cryoMaxCooling,
        cryoStacks * (SUBTERRANEAN_SYNERGY_RULES.cryoCoolingPerUnit + cGeoBoost),
      );
    }

    // Harmonic resonator extraction aura
    let resonatorStacks = 0;
    if (m.defId === 'sm_extractor' || m.defId === 'sm_gas_tap' || m.defId === 'sm_auto_drill') {
      for (const r of resonators) {
        if (chebyshevDist(m, r) <= SUBTERRANEAN_SYNERGY_RULES.resonatorRadius) resonatorStacks++;
      }
    }
    if (resonatorStacks > 0) resonatorBoostedCount++;

    // Seismic brace stability aura for heavy processors
    let braced = false;
    if (def && def.power <= -8) {
      for (const b of braces) {
        if (chebyshevDist(m, b) <= SUBTERRANEAN_SYNERGY_RULES.braceRadius) {
          braced = true;
          break;
        }
      }
      if (braced) bracedHeavyCount++;
    }

    const yieldMult = Math.max(
      0.5,
      1
        + extractorDocBonus
        + anomalyYieldBonus
        + (directive.yieldBonus || 0)
        + (resonatorStacks > 0 ? SUBTERRANEAN_SYNERGY_RULES.resonatorYieldBonus : 0)
        + (weather?.yieldMult ? (weather.yieldMult - 1) : 0),
    );
    const cryoBonusSpeed = (cryoStacks > 0 && (directive.id === 'cryo_superconduct' || cryoStacks >= 1))
      ? SUBTERRANEAN_SYNERGY_RULES.cryoOverdriveSpeedBonus
      : 0;
    const processMult = Math.max(
      0.5,
      (directive.speedMult || 1)
        + cryoBonusSpeed
        + (braced ? SUBTERRANEAN_SYNERGY_RULES.braceStabilitySpeedBonus : 0)
        + (m.defId === 'sm_deep_synthesizer' ? processCeilingBonus : 0),
    );
    const powerDrawMult = Math.max(0.5, (directive.powerDrawMult || 1) * powerDrawMultDoc);
    const capBoost = (geo?.solid || 0) > 0 && directive.id === 'cryo_superconduct' ? 1.0 : 1.0;

    machineModifiers[m.id] = {
      coolingRate: Math.round(coolingRate * 100) / 100,
      yieldMult: Math.round(yieldMult * 1000) / 1000,
      processMult: Math.round(processMult * 1000) / 1000,
      powerDrawMult: Math.round(powerDrawMult * 1000) / 1000,
      cryoCooled: cryoStacks > 0,
      resonatorBoosted: resonatorStacks > 0,
      seismicBraced: braced,
      capBoost,
    };
  }

  return {
    directive,
    anomalies,
    machineModifiers,
    summary: {
      cryoCondensers: cryos.length,
      cryoCooledMachines: cryoCooledCount,
      seismicBraces: braces.length,
      bracedHeavyMachines: bracedHeavyCount,
      harmonicResonators: resonators.length,
      resonatorBoostedExtractors: resonatorBoostedCount,
      massDrivers: drivers.length,
      capacitorBanks: capacitors.length,
      capacitorCapacityMwS: capacitors.length * SUBTERRANEAN_SYNERGY_RULES.capacitorCapacityMwS,
      totalLinkRateBoostPerMin: drivers.length * SUBTERRANEAN_SYNERGY_RULES.massDriverLinkBoostPerMin
        + orbitalLinkRateBonus
        + anomalyLinkBoost
        + linkRateDocBonus,
      orbitalPowerNetMw: orbitalPowerNetMw + anomalyPowerBonusMw,
      orbitalStorageBonus,
      orbitalDefenseRating,
      orbitalShieldImmune,
      passiveRegocretePerMin,
      salePriceMult,
      droneSlotBonus,
      hullRepairPerMin,
    },
  };
}

/**
 * Evaluate how well a subterranean blueprint fits and scores at a given (anchorCol, anchorRow, rotation)
 * on an asteroid's interior field. Used both by Field Architect remote blueprint placement
 * and Asteroid Works layout hints.
 */
export function scoreBlueprintPlacement(field, site, blueprintId, anchorCol, anchorRow, rotation = 0) {
  const bp = ASTEROID_BLUEPRINT_BY_ID.get(blueprintId);
  if (!bp || !field || !Array.isArray(field)) {
    return { valid: false, reason: 'bad-blueprint', score: -1, cells: [] };
  }
  const existingMachines = new Map();
  for (const m of site?.machines || []) {
    existingMachines.set(`${m.col},${m.row}`, m);
  }
  const entryCol = Math.floor(COLS / 2);
  const resolvedCells = [];
  let geologyScore = 0;
  let veinValuePerMin = 0;
  let thermalSinkScore = 0;
  let rockDigCount = 0;
  let gasContacts = 0;

  for (const cell of bp.cells) {
    const off = rotateCellOffset(cell.dc, cell.dr, rotation);
    const col = anchorCol + off.dc;
    const row = anchorRow + off.dr;
    if (!inBounds(col, row) || row <= 0) {
      return { valid: false, reason: 'out-of-bounds', score: -1, cells: [] };
    }
    if (col === entryCol && row === 0) {
      return { valid: false, reason: 'entry-reserved', score: -1, cells: [] };
    }
    if (existingMachines.has(`${col},${row}`)) {
      return { valid: false, reason: 'occupied', score: -1, cells: [] };
    }
    const tile = field[col] && field[col][row];
    if (tile && tile.type === 'gas' && cell.machineId) {
      return { valid: false, reason: 'gas-hazard', score: -1, cells: [] };
    }
    if (!tile || tile.type !== 'empty') rockDigCount++;

    if (cell.machineId) {
      const def = SITE_MACHINE_BY_ID.get(cell.machineId);
      const profile = contactProfile(field, col, row, COLS, ROWS);
      if (def?.requiresContact === 'gas' && (profile.gas + (profile.vented || 0)) <= 0) {
        return { valid: false, reason: 'needs-gas', score: -1, cells: [] };
      }
      gasContacts += profile.gas;
      thermalSinkScore += (profile.basalt * 1.2 + profile.matrix * 0.7);
      for (const [oreId, count] of Object.entries(profile.ores || {})) {
        const val = oreContactRate(oreId) * (COMMODITY_PRICE.get(oreId) || 15) * count;
        veinValuePerMin += val;
        thermalSinkScore += count * 1.5;
      }
      if (def?.usesGeology) {
        const cap = machineCapability(def, profile, cell.mode || def.defaultMode);
        if (cap.geologyLive) geologyScore += 18 + veinValuePerMin * 0.4;
      }
      if (cell.mode) {
        const rec = SITE_RECIPE_BY_ID.get(cell.mode);
        if (rec) {
          const matchedContacts = (rec.contactKinds || []).reduce((n, k) => n + (profile[k] || 0), 0)
            + (rec.contactOres || []).reduce((n, o) => n + (profile.ores[o] || 0), 0);
          geologyScore += matchedContacts * 12;
        }
      }
    }
    resolvedCells.push({ ...cell, col, row, idx: tileIndex(col, row) });
  }

  const totalScore = Math.round((geologyScore + thermalSinkScore * 2.2 + gasContacts * 20 - rockDigCount * 2.5) * 10) / 10;
  return {
    valid: true,
    reason: null,
    blueprintId,
    anchorCol,
    anchorRow,
    col: anchorCol,
    row: anchorRow,
    rotation,
    score: totalScore,
    veinValuePerMin: Math.round(veinValuePerMin * 10) / 10,
    thermalSinkScore: Math.round(thermalSinkScore * 10) / 10,
    rockDigCount,
    cells: resolvedCells,
  };
}

/**
 * Find the highest-scoring interior placement candidates for any blueprint
 * on this asteroid across all rotations.
 */
export function findBestBlueprintSeats(field, site, blueprintId, limit = 5) {
  if (!field || !ASTEROID_BLUEPRINT_BY_ID.has(blueprintId)) return [];
  const candidates = [];
  for (let row = 2; row < ROWS - 2; row += 2) {
    for (let col = 2; col < COLS - 2; col += 2) {
      for (let rot = 0; rot < 4; rot++) {
        const res = scoreBlueprintPlacement(field, site, blueprintId, col, row, rot);
        if (res.valid) candidates.push(res);
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);
  return candidates.slice(0, Math.max(1, limit | 0));
}

/**
 * Build a compact 2D schematic summary of an asteroid's interior for instant tactical
 * inspection inside Field Architect without leaving space.
 */
export function generateInteriorCutawaySchematic(site, field, machines = [], overlays = {}, thermalSnapshot = null) {
  if (!field || !Array.isArray(field)) return null;
  const cols = field.length;
  const rows = field[0]?.length || 0;
  const machineAt = new Map();
  for (const m of machines || []) {
    machineAt.set(`${m.col},${m.row}`, m);
  }
  const powerSet = new Set(Array.isArray(overlays?.power) ? overlays.power : []);
  const laneSet = new Set(Array.isArray(overlays?.lane) ? overlays.lane : []);
  const thermMap = new Map();
  if (thermalSnapshot && Array.isArray(thermalSnapshot.machines)) {
    for (const tm of thermalSnapshot.machines) thermMap.set(tm.id, tm.band);
  }

  let emptyCells = 0;
  let veinCells = 0;
  let gasCells = 0;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = field[c][r];
      const idx = tileIndex(c, r);
      const m = machineAt.get(`${c},${r}`) || null;
      let kind = 'dirt';
      if (!t || t.type === 'empty') {
        kind = 'empty';
        emptyCells++;
      } else if (t.type === 'rock') kind = 'rock';
      else if (t.type === 'gas') { kind = 'gas'; gasCells++; }
      else if (t.type === 'vein') { kind = 'vein'; veinCells++; }

      if (kind === 'empty' || kind === 'gas' || kind === 'vein' || m || powerSet.has(idx) || laneSet.has(idx)) {
        cells.push({
          c,
          r,
          kind,
          ore: t?.ore || null,
          machineId: m ? m.defId : null,
          thermalBand: m ? (thermMap.get(m.id) || 'nominal') : null,
          power: powerSet.has(idx),
          lane: laneSet.has(idx),
        });
      }
    }
  }
  const anomalies = evaluateSubterraneanAnomalies(site?.boreSeed || site?.asteroidId || 1, field, machines);
  return {
    cols,
    rows,
    emptyCells,
    veinCells,
    gasCells,
    anomalies,
    highlights: cells,
  };
}
