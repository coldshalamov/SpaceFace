// Plan 32 — one presentation authority for physical pickup bodies, vacuum ribbons, and radar.
// This module is immutable data + pure lookup only: pickup motion, collection, cargo, and rewards
// remain owned by their existing simulation systems. Hot render/radar callers receive frozen shared
// records, so classification does not allocate per frame.
import { COMMODITIES } from './commodities.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));

function profile(id, label, worldShape, radarShape, colors, material) {
  return Object.freeze({
    id,
    label,
    worldShape,
    radarShape,
    worldColor: material.color,
    accentColor: material.accent,
    emissiveColor: material.emissive,
    darkColor: material.dark,
    radarColors: Object.freeze(colors),
  });
}

export const PICKUP_PRESENTATION = Object.freeze({
  credits: profile(
    'credits', 'Credits', 'minted-credit-chip', 'hexagon',
    { none: '#ffd45a', protanopia: '#f0e442', deuteranopia: '#f0e442', tritanopia: '#ff9d2f' },
    { color: '#d8ad48', accent: '#ffe58a', emissive: '#8a5a14', dark: '#30220f' },
  ),
  ore: profile(
    'ore', 'Ore / scrap', 'split-ore-cluster', 'diamond',
    { none: '#b98b61', protanopia: '#8f735b', deuteranopia: '#92745c', tritanopia: '#a87961' },
    { color: '#8f6b4d', accent: '#d1a16f', emissive: '#5b3218', dark: '#26211e' },
  ),
  refined: profile(
    'refined', 'Refined material', 'banded-ingot-stack', 'double-bar',
    { none: '#d2dbe2', protanopia: '#e0e6eb', deuteranopia: '#dce4e8', tritanopia: '#edf0f2' },
    { color: '#aebbc4', accent: '#eef5f8', emissive: '#6e8793', dark: '#293137' },
  ),
  component: profile(
    'component', 'Component / electronics', 'open-circuit-cage', 'cross',
    { none: '#46d7e8', protanopia: '#56b4e9', deuteranopia: '#45b7d1', tritanopia: '#00b8a9' },
    { color: '#24869a', accent: '#7af1ff', emissive: '#14b9d0', dark: '#152d34' },
  ),
  munitions: profile(
    'munitions', 'Munitions', 'finned-cartridge', 'triangle',
    { none: '#ff6d45', protanopia: '#e69f00', deuteranopia: '#e98b20', tritanopia: '#ff4d6d' },
    { color: '#a9442e', accent: '#ffad63', emissive: '#e24a22', dark: '#351a16' },
  ),
  module: profile(
    'module', 'Module', 'service-spindle', 'bracket',
    { none: '#7794ff', protanopia: '#6f78d8', deuteranopia: '#7386d8', tritanopia: '#7d72c9' },
    { color: '#5267aa', accent: '#aebeff', emissive: '#596fe6', dark: '#20263c' },
  ),
  rare: profile(
    'rare', 'Quest / rare', 'relic-compass-cage', 'star',
    { none: '#d876ff', protanopia: '#cc79a7', deuteranopia: '#c879bd', tritanopia: '#d45aa9' },
    { color: '#8652a5', accent: '#f0b0ff', emissive: '#b34ee2', dark: '#2d1938' },
  ),
  cargo: profile(
    'cargo', 'General cargo', 'sealed-cargo-brick', 'square',
    { none: '#65d19e', protanopia: '#009e73', deuteranopia: '#00a487', tritanopia: '#42b983' },
    { color: '#477b68', accent: '#8ce3bc', emissive: '#2d9e72', dark: '#1b2c27' },
  ),
});

export const PICKUP_PRESENTATION_IDS = Object.freeze(Object.keys(PICKUP_PRESENTATION));

function isRarePickupData(data, commodity) {
  if (!data) return false;
  const kind = String(data.kind || '').toLowerCase();
  if (kind === 'rare' || kind === 'quest' || kind === 'reputation' || kind === 'rp') return true;
  if (data.rarePickup === true || data.questItem === true || data.missionItem === true
    || data.storyPickup === true || data.rareSpawnRole || data.rareSpawnShapeId) return true;
  if (data.richLotSource || data.uniqueDropId || String(data.commodityId || '').startsWith('unique_')) return true;
  return commodity && commodity.legality === 'restricted' && data.classifiedReward === true;
}

/** Return one frozen shared presentation record; never allocates in the render/radar hot path. */
export function pickupPresentationFor(data) {
  const value = data || null;
  const kind = String(value && value.kind || '').toLowerCase();
  if (kind === 'credit_chip' || kind === 'credits') return PICKUP_PRESENTATION.credits;
  const commodity = value && value.commodityId ? COMMODITY_BY_ID.get(value.commodityId) : null;
  if (isRarePickupData(value, commodity)) return PICKUP_PRESENTATION.rare;
  if (kind === 'module' || String(value && value.commodityId || '').startsWith('mod_')) {
    return PICKUP_PRESENTATION.module;
  }
  const category = String(commodity && commodity.category || '').toLowerCase();
  if (category === 'military') return PICKUP_PRESENTATION.munitions;
  if (category === 'component' || category === 'tech'
    || value && value.commodityId === 'cmdty_salvage_electronics') {
    return PICKUP_PRESENTATION.component;
  }
  if (category === 'refined') return PICKUP_PRESENTATION.refined;
  if (kind === 'ore' || category === 'raw ore' || category === 'gas'
    || category === 'crystal' || category === 'exotic' || category === 'salvage') {
    return PICKUP_PRESENTATION.ore;
  }
  return PICKUP_PRESENTATION.cargo;
}

export function pickupRadarColorFor(data, mode = 'none') {
  const presentation = pickupPresentationFor(data);
  return presentation.radarColors[mode] || presentation.radarColors.none;
}

export function validatePickupPresentationMap() {
  const errors = [];
  const modes = ['none', 'protanopia', 'deuteranopia', 'tritanopia'];
  const profiles = PICKUP_PRESENTATION_IDS.map((id) => PICKUP_PRESENTATION[id]);
  if (new Set(profiles.map((row) => row.worldShape)).size !== profiles.length) {
    errors.push('pickup world silhouettes must be one-to-one');
  }
  if (new Set(profiles.map((row) => row.radarShape)).size !== profiles.length) {
    errors.push('pickup radar silhouettes must be one-to-one');
  }
  for (const mode of modes) {
    if (new Set(profiles.map((row) => row.radarColors[mode])).size !== profiles.length) {
      errors.push(`pickup radar colors must remain distinct in ${mode}`);
    }
  }
  return errors;
}
