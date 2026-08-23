// Survival style scoring (PQ-133.07a).
// Pure. Variety across kill causes raises the multiplier; repeating the last
// cause decays it toward 1. Direct kills never score below their base.

export const STYLE_WINDOW = 8;
export const STYLE_MAX_MULTIPLIER = 4;

const PRESENTATION_TO_STYLE = Object.freeze({
  explosive: 'explosive',
  terrain_collision: 'terrain',
  ship_collision: 'collision',
  kinetic: 'direct',
  generic: 'direct',
});

function normalizeCause(cause) {
  if (cause === 'explosive' || cause === 'terrain' || cause === 'collision' || cause === 'direct') {
    return cause;
  }
  return PRESENTATION_TO_STYLE[cause] || 'direct';
}

export function styleCauseFromKill(payload) {
  if (payload && typeof payload.styleCause === 'string') return normalizeCause(payload.styleCause);
  if (payload && typeof payload.cause === 'string') return normalizeCause(payload.cause);
  const presentation = payload && payload.presentation;
  if (presentation && typeof presentation.cause === 'string') {
    return normalizeCause(presentation.cause);
  }
  return 'direct';
}

export function emptyStyle() {
  return { multiplier: 1, recentCauses: [] };
}

export function applyStyleKill(style, cause) {
  const mapped = normalizeCause(cause);
  const recent = Array.isArray(style && style.recentCauses) ? style.recentCauses.slice() : [];
  const last = recent[recent.length - 1];
  recent.push(mapped);
  while (recent.length > STYLE_WINDOW) recent.shift();
  let multiplier = Number.isFinite(style && style.multiplier) ? style.multiplier : 1;
  if (last === mapped) {
    multiplier = 1 + (multiplier - 1) * 0.5;
  } else {
    const unique = new Set(recent).size;
    multiplier = Math.min(STYLE_MAX_MULTIPLIER, multiplier + 0.25 * unique);
  }
  if (!(multiplier >= 1)) multiplier = 1;
  return { multiplier, recentCauses: recent };
}

export function scoreWithStyle(base, multiplier, cause) {
  const amount = Number.isFinite(base) ? Math.max(0, Math.round(base)) : 0;
  const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const scaled = Math.round(amount * mult);
  if (normalizeCause(cause) === 'direct') return Math.max(amount, scaled);
  return Math.max(1, scaled);
}
