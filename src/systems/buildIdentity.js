// buildIdentity.js - BP-09.1 BUILD-ID backend.
//
// Classifies a scanned ship's fitted modules into a readable archetype badge. This is deliberately
// informational: it writes only entity.data.buildIdentity / scanRevealed.buildIdentity so UI surfaces
// can render the badge without scanner, target-panel, combat, or module-stat edits.
import { SHIPS } from '../data/ships.js';
import { MODULES } from '../data/modules.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const MODULE_BY_ID = new Map(MODULES.map((mod) => [mod.id, mod]));

function cleanId(id) {
  return typeof id === 'string' && id ? id : null;
}

function sortedUnique(ids) {
  return [...new Set((ids || []).map(cleanId).filter(Boolean))].sort();
}

function shipDefForEntity(entity, fallbackShipId = null) {
  const data = entity && entity.data || {};
  const id = data.defId || data.shipId || entity && entity.shipId || fallbackShipId;
  return SHIP_BY_ID.get(id) || null;
}

function moduleIdsForBuild(input) {
  if (Array.isArray(input)) return sortedUnique(input);
  const data = input && input.data || {};
  return sortedUnique([
    ...(Array.isArray(data.fittings) ? data.fittings : []),
    ...(Array.isArray(input && input.fittings) ? input.fittings : []),
    ...(Array.isArray(data.modules) ? data.modules : []),
  ]);
}

function moduleDefs(ids) {
  return ids.map((id) => MODULE_BY_ID.get(id)).filter(Boolean);
}

function roleText(shipDef, input, reveal) {
  const data = input && input.data || {};
  return String(
    data.role ||
    reveal && reveal.role ||
    data.shipClass ||
    reveal && reveal.shipClass ||
    shipDef && shipDef.role ||
    input && input.role ||
    'ship',
  ).toLowerCase();
}

function hasSlot(defs, slotType) {
  return defs.some((def) => def.slotType === slotType);
}

function hasModValue(defs, key) {
  return defs.some((def) => def.mods && def.mods[key] != null);
}

function makeIdentity(def, basis) {
  return Object.freeze({
    id: def.id,
    label: def.label,
    summary: def.summary,
    confidence: def.confidence,
    tags: Object.freeze(def.tags.slice()),
    basis: Object.freeze({
      shipId: basis.shipId || null,
      role: basis.role || null,
      modules: Object.freeze(basis.modules.slice()),
      matched: Object.freeze((def.matched || []).slice()),
    }),
  });
}

function roleFallback(role) {
  if (role.includes('starter')) return {
    id: 'starter_skiff',
    label: 'Starter Skiff',
    summary: 'Baseline utility hull; read the fittings for its specialty.',
    confidence: 'role_fallback',
    tags: ['starter', 'flex'],
    matched: ['role:starter'],
  };
  if (role.includes('interceptor')) return {
    id: 'strike_interceptor',
    label: 'Strike Interceptor',
    summary: 'Fast combat hull built around burst positioning.',
    confidence: 'role_fallback',
    tags: ['combat', 'fast'],
    matched: ['role:interceptor'],
  };
  if (role.includes('fighter')) return {
    id: 'light_fighter',
    label: 'Light Fighter',
    summary: 'Light combat hull with direct-fire pressure.',
    confidence: 'role_fallback',
    tags: ['combat'],
    matched: ['role:fighter'],
  };
  if (role.includes('freighter') || role.includes('hauler')) return {
    id: 'cargo_runner',
    label: 'Cargo Runner',
    summary: 'Cargo-first hull; expect poor turning and a loaded hold.',
    confidence: 'role_fallback',
    tags: ['cargo', 'heavy'],
    matched: ['role:cargo'],
  };
  if (role.includes('mining')) return {
    id: 'mining_rig',
    label: 'Mining Rig',
    summary: 'Extraction hull; drill and cargo decisions define the threat.',
    confidence: 'role_fallback',
    tags: ['mining', 'industrial'],
    matched: ['role:mining'],
  };
  if (role.includes('explorer') || role.includes('survey')) return {
    id: 'survey_scout',
    label: 'Survey Scout',
    summary: 'Sensor-forward hull that prefers information and range.',
    confidence: 'role_fallback',
    tags: ['sensor', 'scout'],
    matched: ['role:survey'],
  };
  if (role.includes('capital') || role.includes('battlecruiser') || role.includes('flagship')) return {
    id: 'capital_brawler',
    label: 'Capital Brawler',
    summary: 'Heavy combat hull; treat its mass as part of the weapon.',
    confidence: 'role_fallback',
    tags: ['combat', 'capital'],
    matched: ['role:capital'],
  };
  if (role.includes('corvette') || role.includes('gunship')) return {
    id: 'gunship',
    label: 'Gunship',
    summary: 'Combat hull with heavier arcs and sustained pressure.',
    confidence: 'role_fallback',
    tags: ['combat', 'gunship'],
    matched: ['role:gunship'],
  };
  if (role.includes('multi')) return {
    id: 'multirole',
    label: 'Multirole',
    summary: 'Flexible hull; scan the modules before assuming its job.',
    confidence: 'role_fallback',
    tags: ['flex'],
    matched: ['role:multirole'],
  };
  return {
    id: 'generalist',
    label: 'Generalist',
    summary: 'No strong module pair detected; use the hull role as the read.',
    confidence: 'role_fallback',
    tags: ['general'],
    matched: ['role:ship'],
  };
}

export function classifyBuildIdentity(input, options = {}) {
  const ids = moduleIdsForBuild(input);
  const defs = moduleDefs(ids);
  const idSet = new Set(ids);
  const shipDef = options.shipDef || shipDefForEntity(input, options.shipId);
  const reveal = options.reveal || null;
  const role = roleText(shipDef, input, reveal);
  const basis = {
    shipId: shipDef && shipDef.id || options.shipId || reveal && reveal.shipId || null,
    role,
    modules: ids,
  };

  const hasCargo = hasSlot(defs, 'cargo') || hasModValue(defs, 'cargoFlat') || hasModValue(defs, 'cargoCapPct');
  const hasMining = hasSlot(defs, 'mining') || hasModValue(defs, 'richCoreRingPctBonus');
  const hasSensor = idSet.has('mod_survey_suite') || idSet.has('mod_cargo_scanner_s') || hasModValue(defs, 'scannerRadiusMult');
  const hasWinch = idSet.has('mod_winch_hd') || hasModValue(defs, 'tetherReelRateMult');
  const hasCharge = idSet.has('mod_charge_rack') || hasModValue(defs, 'impulseChargeCapacity');
  const hasRam = idSet.has('mod_ram_plate') || hasModValue(defs, 'ramDamageDealtMult');
  const hasSmuggler = idSet.has('mod_smuggler_hold') || defs.some((def) => def.legality === 'contraband');

  let def = null;
  if (hasSmuggler) {
    def = {
      id: 'ghost_hauler',
      label: 'Ghost Hauler',
      summary: 'Cargo hull with hidden space; customs risk matters.',
      confidence: 'module_rule',
      tags: ['cargo', 'stealth', 'contraband'],
      matched: ['mod_smuggler_hold'],
    };
  } else if (hasRam && hasCargo) {
    def = {
      id: 'rammer_truck',
      label: 'Rammer-Truck',
      summary: 'Cargo mass plus ram hardware turns the hold into impact threat.',
      confidence: 'module_pair',
      tags: ['ram', 'cargo', 'heavy'],
      matched: ['mod_ram_plate', 'cargo'],
    };
  } else if (hasWinch && hasCharge) {
    def = {
      id: 'control_tug',
      label: 'Control-Tug',
      summary: 'Winch authority plus charges can reposition fights.',
      confidence: 'module_pair',
      tags: ['tether', 'control', 'impulse'],
      matched: ['mod_winch_hd', 'mod_charge_rack'],
    };
  } else if (hasCharge && hasRam) {
    def = {
      id: 'demolition_rig',
      label: 'Demolition Rig',
      summary: 'Impact hardware and charge capacity favor burst collisions.',
      confidence: 'module_pair',
      tags: ['ram', 'impulse', 'burst'],
      matched: ['mod_ram_plate', 'mod_charge_rack'],
    };
  } else if (hasMining && hasCargo) {
    def = {
      id: 'bulk_miner',
      label: 'Bulk Miner',
      summary: 'Extraction plus hold space points to long-haul mining.',
      confidence: 'module_pair',
      tags: ['mining', 'cargo'],
      matched: ['mining', 'cargo'],
    };
  } else if (hasMining) {
    def = {
      id: 'seam_miner',
      label: 'Seam Miner',
      summary: 'Mining gear defines the build; watch the drill line.',
      confidence: 'module_rule',
      tags: ['mining'],
      matched: ['mining'],
    };
  } else if (hasSensor) {
    def = {
      id: 'control_scout',
      label: 'Control Scout',
      summary: 'Sensor gear makes information the build advantage.',
      confidence: 'module_rule',
      tags: ['sensor', 'scout'],
      matched: ['sensor'],
    };
  } else {
    def = roleFallback(role);
  }

  return makeIdentity(def, basis);
}

function sameIdentity(a, b) {
  return !!a && !!b && a.id === b.id && JSON.stringify(a.basis) === JSON.stringify(b.basis);
}

export const buildIdentity = {
  name: 'buildIdentity',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._onShipRevealed = (payload) => this._stampReveal(payload, { emit: true });
    this._onScanPulse = () => this._restampVisible();
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('scan:shipRevealed', this._onShipRevealed);
      this.bus.on('scan:pulse', this._onScanPulse);
    }
  },

  _entityForReveal(reveal) {
    const id = reveal && reveal.entityId;
    if (id == null || !this.state || !this.state.entities || typeof this.state.entities.get !== 'function') return null;
    return this.state.entities.get(id) || null;
  },

  _stampReveal(reveal, { emit = false } = {}) {
    const entity = this._entityForReveal(reveal);
    if (!entity || !reveal) return null;
    const data = entity.data || (entity.data = {});
    const identity = classifyBuildIdentity(entity, { reveal });
    const previous = data.buildIdentity || null;
    data.buildIdentity = identity;
    reveal.buildIdentity = identity;
    if (data.scanRevealed && data.scanRevealed.entityId === reveal.entityId) {
      data.scanRevealed.buildIdentity = identity;
    }
    if (emit && !sameIdentity(previous, identity) && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('buildIdentity:revealed', {
        entityId: reveal.entityId,
        shipId: identity.basis.shipId,
        buildIdentity: identity,
      });
    }
    return identity;
  },

  _restampVisible() {
    const list = this.state && Array.isArray(this.state.entityList) ? this.state.entityList : [];
    for (const entity of list) {
      const reveal = entity && entity.data && entity.data.scanRevealed;
      if (reveal && reveal.entityId != null) this._stampReveal(reveal, { emit: false });
    }
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onShipRevealed) this.bus.off('scan:shipRevealed', this._onShipRevealed);
      if (this._onScanPulse) this.bus.off('scan:pulse', this._onScanPulse);
    }
    this._onShipRevealed = null;
    this._onScanPulse = null;
  },
};

export default buildIdentity;
