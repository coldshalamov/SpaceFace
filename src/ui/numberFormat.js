// Locale-aware number formatting (PRO-03).
//
// The bug this exists to end: player-visible numbers were formatted with a PINNED 'en-US' tag, so a
// German player read "12,345" where their locale writes "12.345". Two call sites already had the
// right idea — src/combat/playerDefeat.js grew a local formatCredits() for exactly this — but the
// HUD kept hardcoding 'en-US', and the pattern had nowhere shared to live. This is that place.
//
// It deliberately adds NO dependency: Intl.NumberFormat is already what toLocaleString uses.
//
// The locale is resolved in this order, and every step has a reason:
//   1. an explicit tag (the caller knows better);
//   2. state.settings.locale — the player's own choice, which is the authoritative source and may
//      differ from the runtime locale (settings can be read before setGameLocale has been applied);
//   3. currentGameLocale() — the live runtime locale;
//   4. 'en-US' — the shipped default, and the only tag we trust exists.
//
// Every Intl call is guarded: a malformed or unsupported tag throws a RangeError in some engines,
// and a number readout must never be the thing that breaks a frame.

import { currentGameLocale } from '../localization/gameLocalization.js';

export const FALLBACK_NUMBER_LOCALE = 'en-US';

export function resolveNumberLocale(state, explicit) {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const chosen = state && state.settings && typeof state.settings.locale === 'string'
    ? state.settings.locale.trim()
    : '';
  if (chosen) return chosen;
  try {
    const live = currentGameLocale();
    if (typeof live === 'string' && live.trim()) return live.trim();
  } catch {
    // no runtime locale available (headless, or the localization module is not initialized)
  }
  return FALLBACK_NUMBER_LOCALE;
}

/**
 * A grouped integer in the player's locale: 12345 -> "12,345" (en-US) / "12.345" (de-DE).
 * Non-finite input collapses to "0" rather than printing "NaN" into the HUD.
 */
export function formatNumber(value, state, options) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const tag = resolveNumberLocale(state, options && options.locale);
  try {
    return safe.toLocaleString(tag, options && options.intl);
  } catch {
    try {
      return safe.toLocaleString(FALLBACK_NUMBER_LOCALE, options && options.intl);
    } catch {
      return String(Math.round(safe));
    }
  }
}

/** The common case: a rounded credit/quantity readout in the player's locale. */
export function formatCount(value, state, options) {
  return formatNumber(Math.max(0, Math.round(Number(value) || 0)), state, options);
}

/**
 * True when this tag actually renders a grouping separator. Used by tests and by the pseudo-locale
 * audit; false means the tag is a valid locale that simply groups nothing (e.g. some CJK locales
 * do not group by default), which is correct behaviour, not a bug.
 */
export function localeGroupsThousands(tag) {
  const grouped = formatNumber(1234567, null, { locale: tag });
  return /[^\d]/.test(grouped.replace(/-/g, ''));
}