import { SHIPS } from '../../data/ships.js';
import { describeHullRole } from '../../data/shipRoleLattice.js';
import { hash32 } from '../../core/rng.js';
import { getDerivedStats } from '../../systems/ships.js';
import { capabilityDefinitions } from './shipBandModels.js';

export const LOADOUT_PRESET_CAP_PER_HULL = 6;

const SHIP_BY_ID = new Map(SHIPS.map((row) => [row.id, row]));

const LABEL_TEXT_BY_KEY = Object.freeze({
  tow_and_swing: 'Tow & Swing',
  spring_and_release: 'Spring & Release',
  coupled_pair: 'Coupled Pair',
  line_cutter: 'Line Cutter',
  snare: 'Snare',
  twin_bridle: 'Twin Bridle',
  quiet_approach: 'Quiet Approach',
  prospector: 'Prospector',
  hauler: 'Hauler',
  long_reach: 'Long Reach',
  knife_fight: 'Knife Fight',
  wrangler: 'Wrangler',
  support: 'Support',
  brawler: 'Brawler',
  role: '',
});

const MASSLINE_LABEL_KEY_BY_ID = Object.freeze({
  tractor: 'tow_and_swing',
  elastic_whip: 'spring_and_release',
  frame_coupler: 'coupled_pair',
  monofilament_sweep: 'line_cutter',
  transverse_snare: 'snare',
  twin_bridle: 'twin_bridle',
});

const APPLY_REASON_LABELS = Object.freeze({
  dock_to_refit: 'Dock to refit',
  missing_modules: 'Modules not in hold',
  cargo_overflow: 'Cargo would overflow',
  research_required: 'Research required',
  massline_head_conflict: 'Massline heads conflict',
  weapon_capacity: 'Weapon capacity exceeded',
  engine_capacity: 'Engine capacity exceeded',
  outfit_space: 'Outfit space exceeded',
  incompatible_slot: 'Preset no longer fits this hull',
  unknown_module: 'Preset contains unknown hardware',
  invalid_preset: 'Preset data is invalid',
  hull_mismatch: 'Preset is for a different hull',
});

const CONTROL_GUN_TOKEN_RE = /(gravity_marker|momentum_sink|concussion|rcs_disruptor|vector_mine)/;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asPresetFittings(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === 'string' && entry ? entry : null));
}

function roleLabelForHull(hullDefId) {
  const role = describeHullRole(hullDefId);
  if (role && role.roleLabel) return role.roleLabel;
  const def = SHIP_BY_ID.get(hullDefId);
  if (def && def.role) return String(def.role).replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return 'Multirole';
}

function topCapabilityVerb(derived) {
  const rows = capabilityDefinitions(derived);
  if (!rows.length) return '';
  return rows[0].verb || '';
}

function nextSaveId(baseId, existingIds) {
  if (!existingIds.has(baseId)) return baseId;
  let suffix = 1;
  let candidate = `${baseId}_${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }
  return candidate;
}

function sharedLabelMeta(hullDefId, fittings, player) {
  const derived = getDerivedStats(hullDefId, fittings, player);
  const subtitle = topCapabilityVerb(derived);
  const capabilityRows = capabilityDefinitions(derived);
  const capabilityVerbs = capabilityRows.map((row) => row.verb).filter(Boolean);
  return { derived, subtitle, capabilityVerbs };
}

function deriveLabelKey(derived, hullDefId) {
  if (!derived) return 'role';
  if (derived.masslineHeadId && MASSLINE_LABEL_KEY_BY_ID[derived.masslineHeadId]) {
    return MASSLINE_LABEL_KEY_BY_ID[derived.masslineHeadId];
  }
  if (finite(derived.scannerCloak, 0) > 0 || finite(derived.hiddenCargoPct, 0) > 0) {
    return 'quiet_approach';
  }
  const miningSlotsFilled = Math.max(0, finite(derived.miningSlotsFilled, 0));
  const miningSlotsTotal = Math.max(0, finite(derived.miningSlotsTotal, 0));
  if (miningSlotsTotal > 0 && miningSlotsFilled >= miningSlotsTotal) {
    return 'prospector';
  }
  const shipDef = SHIP_BY_ID.get(hullDefId);
  const baseCargo = Math.max(0, finite(shipDef && shipDef.cargo, 0));
  const haulerThreshold = baseCargo + Math.max(40, Math.round(baseCargo * 0.35));
  if (finite(derived.cargoCap, 0) >= haulerThreshold) {
    return 'hauler';
  }
  const maxWeaponRange = Math.max(0, finite(derived.maxWeaponRange, 0));
  if (maxWeaponRange >= 900) return 'long_reach';
  if (maxWeaponRange > 0 && maxWeaponRange <= 520) return 'knife_fight';
  if (finite(derived.controlWeaponCount, 0) > 0) return 'wrangler';
  if (
    finite(derived.droneBayCount, 0) > 0
    || finite(derived.hullRepairOOC, 0) > 0
    || finite(derived.chaffCount, 0) > 0
    || finite(derived.ecmCount, 0) > 0
  ) {
    return 'support';
  }
  if (finite(derived.damageReductionMult, 1) < 1 || finite(derived.ramDamageDealtMult, 0) > 0) {
    return 'brawler';
  }
  return 'role';
}

function labelTextForKey(labelKey, hullDefId) {
  if (labelKey === 'role' || !LABEL_TEXT_BY_KEY[labelKey]) return roleLabelForHull(hullDefId);
  return LABEL_TEXT_BY_KEY[labelKey];
}

export function isLoadoutPresetLabelKey(labelKey) {
  return Object.prototype.hasOwnProperty.call(LABEL_TEXT_BY_KEY, labelKey);
}

export function createLoadoutPresetId({ hullDefId, fittings = [], createdAt = 0 } = {}) {
  const safeHull = String(hullDefId || 'ship_kestrel');
  const safeFittings = asPresetFittings(fittings);
  const seed = hash32('loadout-preset', safeHull, Math.round(finite(createdAt, 0)), safeFittings.join(','));
  return `lp_${seed.toString(16).padStart(8, '0')}`;
}

export function normalizeLoadoutPreset(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || !record.id) return null;
  if (typeof record.hullDefId !== 'string' || !record.hullDefId) return null;
  const labelKey = isLoadoutPresetLabelKey(record.labelKey) ? record.labelKey : 'role';
  return {
    id: record.id,
    hullDefId: record.hullDefId,
    fittings: asPresetFittings(record.fittings),
    labelKey,
    createdAt: Math.max(0, Math.round(finite(record.createdAt, 0))),
  };
}

export function presetsForHull(player, hullDefId) {
  const source = player && Array.isArray(player.loadoutPresets) ? player.loadoutPresets : [];
  const out = [];
  for (const row of source) {
    const preset = normalizeLoadoutPreset(row);
    if (!preset || preset.hullDefId !== hullDefId) continue;
    out.push(preset);
  }
  return out;
}

export function formatLoadoutApplyReason(applyResult, { dockLabel = 'Dock to refit' } = {}) {
  if (applyResult && applyResult.ok) return { ok: true, reason: 'ok', text: '' };
  const reason = (applyResult && applyResult.reason) || 'invalid_preset';
  if (reason === 'dock_to_refit') {
    return { ok: false, reason, text: dockLabel || APPLY_REASON_LABELS.dock_to_refit };
  }
  if (reason === 'missing_modules') {
    const missingCount = Math.max(1, Math.round(finite(applyResult && applyResult.missingCount, 1)));
    const text = `${missingCount} module${missingCount === 1 ? '' : 's'} not in hold`;
    return { ok: false, reason, text };
  }
  if (applyResult && typeof applyResult.text === 'string' && applyResult.text.trim()) {
    return { ok: false, reason, text: applyResult.text.trim() };
  }
  return {
    ok: false,
    reason,
    text: APPLY_REASON_LABELS[reason] || 'Cannot apply this build',
  };
}

export function deriveLoadoutPresetLabel({ hullDefId, fittings = [], player = null } = {}) {
  const normalizedFittings = asPresetFittings(fittings);
  const { derived, subtitle, capabilityVerbs } = sharedLabelMeta(hullDefId, normalizedFittings, player);
  const labelKey = deriveLabelKey(derived, hullDefId);
  return {
    labelKey,
    label: labelTextForKey(labelKey, hullDefId),
    subtitle,
    capabilityVerbs,
    derived,
  };
}

export function buildLoadoutPresetRailModel({
  player = null,
  hullDefId = null,
  currentFittings = [],
  selectedPresetId = null,
  canRefit = true,
  refitWhy = 'Dock to refit',
  simTime = 0,
  dryRunApply = null,
} = {}) {
  if (!hullDefId) {
    return {
      presets: [],
      selectedPreset: null,
      saveSlot: null,
    };
  }
  const presets = presetsForHull(player, hullDefId);
  const existingIds = new Set(presets.map((row) => row.id));
  const selectedId = presets.some((row) => row.id === selectedPresetId) ? selectedPresetId : null;
  const rendered = presets.map((preset) => {
    const derivedMeta = deriveLoadoutPresetLabel({
      hullDefId,
      fittings: preset.fittings,
      player,
    });
    const applyAttempt = !canRefit
      ? { ok: false, reason: 'dock_to_refit', text: refitWhy }
      : (typeof dryRunApply === 'function' ? dryRunApply(preset) : { ok: false, reason: 'invalid_preset' });
    const applyState = formatLoadoutApplyReason(applyAttempt, { dockLabel: refitWhy });
    const labelKey = isLoadoutPresetLabelKey(preset.labelKey) ? preset.labelKey : derivedMeta.labelKey;
    return {
      ...preset,
      labelKey,
      label: labelTextForKey(labelKey, hullDefId),
      subtitle: derivedMeta.subtitle,
      capabilityVerbs: derivedMeta.capabilityVerbs,
      applyAttempt,
      applyState,
      selected: preset.id === selectedId,
    };
  });
  const selectedPreset = rendered.find((row) => row.selected) || null;
  const count = rendered.length;
  const saveLabel = deriveLoadoutPresetLabel({
    hullDefId,
    fittings: currentFittings,
    player,
  });
  const baseId = createLoadoutPresetId({
    hullDefId,
    fittings: currentFittings,
    createdAt: simTime,
  });
  const saveSlot = {
    // Saving snapshots the CURRENT fit into the preset store — no station service needed, so it
    // is available on the flight host too. Only the cap can block it. (Apply is the dock-gated
    // verb; its reasons stay on the preset lozenges, not here.)
    canSave: count < LOADOUT_PRESET_CAP_PER_HULL,
    reasonText: count >= LOADOUT_PRESET_CAP_PER_HULL
      ? `${LOADOUT_PRESET_CAP_PER_HULL} of ${LOADOUT_PRESET_CAP_PER_HULL} builds on this hull`
      : '',
    labelKey: saveLabel.labelKey,
    label: saveLabel.label,
    subtitle: saveLabel.subtitle,
    presetId: nextSaveId(baseId, existingIds),
    createdAt: Math.max(0, Math.round(finite(simTime, 0))),
    count,
    cap: LOADOUT_PRESET_CAP_PER_HULL,
  };
  return {
    presets: rendered,
    selectedPreset,
    saveSlot,
  };
}

export function sanitizePresetSelectionMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [hullDefId, presetId] of Object.entries(value)) {
    if (typeof hullDefId !== 'string' || !hullDefId) continue;
    if (typeof presetId !== 'string' || !presetId) continue;
    out[hullDefId] = presetId;
  }
  return out;
}

export function canSavePresetForHull(player, hullDefId) {
  const count = presetsForHull(player, hullDefId).length;
  return {
    count,
    cap: LOADOUT_PRESET_CAP_PER_HULL,
    canSave: count < LOADOUT_PRESET_CAP_PER_HULL,
    reasonText: count >= LOADOUT_PRESET_CAP_PER_HULL
      ? `${LOADOUT_PRESET_CAP_PER_HULL} of ${LOADOUT_PRESET_CAP_PER_HULL} builds on this hull`
      : '',
  };
}

export function isControlGunDefId(defId) {
  return typeof defId === 'string' && CONTROL_GUN_TOKEN_RE.test(defId);
}
