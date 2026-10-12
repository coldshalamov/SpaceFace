import { crowdLiveryForEntity } from '../data/crowdLiveries.js';

export const SHIP_APPEARANCE_VERSION = 1;
export const SHIP_FINISHES = Object.freeze(['worn', 'satin', 'polished']);
export const SHIP_DECALS = Object.freeze(['none', 'borrowed_time', 'concord', 'industrial', 'frontier']);

const GENERIC_DEFAULT = Object.freeze({
  version: SHIP_APPEARANCE_VERSION,
  hullColor: null,
  accentColor: null,
  finish: 'satin',
  wear: 0.2,
  decalId: 'none',
});
const KESTREL_DEFAULT = Object.freeze({
  version: SHIP_APPEARANCE_VERSION,
  hullColor: null,
  accentColor: null,
  finish: 'worn',
  wear: 0.55,
  decalId: 'borrowed_time',
});

export function defaultShipAppearance(defId) {
  return defId === 'ship_kestrel' ? KESTREL_DEFAULT : GENERIC_DEFAULT;
}

export function normalizeShipAppearance(input, defId = null) {
  const fallback = defaultShipAppearance(defId);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const finish = SHIP_FINISHES.includes(source.finish) ? source.finish : fallback.finish;
  const decalId = SHIP_DECALS.includes(source.decalId) ? source.decalId : fallback.decalId;
  const wearNumber = Number(source.wear);
  return Object.freeze({
    version: SHIP_APPEARANCE_VERSION,
    hullColor: normalizeHexColor(source.hullColor),
    accentColor: normalizeHexColor(source.accentColor),
    finish,
    wear: Number.isFinite(wearNumber) ? Math.max(0, Math.min(1, wearNumber)) : fallback.wear,
    decalId,
  });
}

export function shipAppearanceSignature(input, defId = null) {
  const appearance = normalizeShipAppearance(input, defId);
  return [
    appearance.version,
    appearance.hullColor || '-',
    appearance.accentColor || '-',
    appearance.finish,
    appearance.wear.toFixed(3),
    appearance.decalId,
  ].join('|');
}

export function paletteWithShipAppearance(entity, basePalette) {
  const base = {
    ...(basePalette || {}),
    appearanceHullOverride: false,
    appearanceAccentOverride: false,
  };
  const raw = entity && entity.data && entity.data.appearance;
  if (!raw) {
    // C12 crowd livery (ID-V): factioned NPC hulls without an authored appearance wear a
    // deterministic per-faction texture set. Palette-level material treatment only — the
    // player (team 0) and stations are ineligible, so nothing here touches player paint.
    const livery = crowdLiveryForEntity(entity);
    if (livery) {
      base.hull = livery.hullColor || base.hull;
      base.accent = livery.accentColor || base.accent;
      base.finish = livery.finish;
      base.wear = livery.wear;
      base.crowdLiveryId = livery.id;
    }
    return base;
  }
  const defId = entity && entity.data && entity.data.defId;
  const appearance = normalizeShipAppearance(raw, defId);
  if (appearance.hullColor) {
    base.hull = appearance.hullColor;
    base.appearanceHullOverride = true;
  }
  if (appearance.accentColor) {
    base.accent = appearance.accentColor;
    base.appearanceAccentOverride = true;
  }
  base.finish = appearance.finish;
  base.wear = appearance.wear;
  return base;
}

function normalizeHexColor(value) {
  if (value == null || value === '') return null;
  const token = String(value).trim().toLowerCase().replace(/^#/, '');
  return /^[0-9a-f]{6}$/.test(token) ? `#${token}` : null;
}
