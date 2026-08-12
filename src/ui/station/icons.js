// src/ui/station/icons.js — Orbital Command icon set.
// Hand-drawn line glyphs on a 24x24 grid, stroke = currentColor, so every icon
// inherits tile/text color and stays visually consistent (no emoji, no mixed weights).
// Each entry is the INNER svg markup; wrap() adds the <svg> frame.

const P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const RAW = {
  // --- destinations ---
  market: `<path ${P} d="M4 19V9M9 19V5M14 19v-7M19 19v-11"/><path ${P} d="M3 19h18" opacity="0.55"/>`,
  shipworks: `<path ${P} d="M12 3.2c3.1 2 4.7 5.2 4.7 9.1 0 2.6-.7 4.6-1.7 6.2H9c-1-1.6-1.7-3.6-1.7-6.2 0-3.9 1.6-7.1 4.7-9.1Z"/><path ${P} d="M7.4 12.4 3.7 14v3.1l3.9-1.2M16.6 12.4 20.3 14v3.1l-3.9-1.2"/><circle cx="12" cy="10" r="1.5" ${P}/>`,
  industry: `<path ${P} d="M4 20V11l5 3V11l5 3V6l6 4v10Z"/><path ${P} d="M8 20v-3M13 20v-3M18 20v-3" opacity="0.6"/>`,
  contracts: `<path ${P} d="M7 3h7l4 4v14H7Z"/><path ${P} d="M14 3v4h4" opacity="0.7"/><path ${P} d="M10 12h5M10 15.5h5" opacity="0.75"/>`,
  factions: `<path ${P} d="M12 3 5 6v5.5c0 4 2.9 7.4 7 8.5 4.1-1.1 7-4.5 7-8.5V6Z"/><path ${P} d="M12 8.2 13.3 11l3 .3-2.3 2 .7 3-2.7-1.6L9.3 16.3l.7-3-2.3-2 3-.3Z" opacity="0.85"/>`,
  bar: `<path ${P} d="M5 4h14l-6 7v6M13 17h4M9 17h-2"/><path ${P} d="M8 8h8" opacity="0.6"/>`,
  ledger: `<path ${P} d="M6 3.5h9l3 3V20.5H6Z"/><path ${P} d="M15 3.5V6.5h3" opacity="0.7"/><path ${P} d="M8.5 11h6M8.5 14h6M8.5 17h3.5" opacity="0.8"/>`,

  // --- dock actions ---
  repair: `<path ${P} d="M14.5 4.2a3.8 3.8 0 0 0-4.9 4.9l-5 5a1.7 1.7 0 0 0 2.4 2.4l5-5a3.8 3.8 0 0 0 4.9-4.9l-2.2 2.2-2.1-.6-.6-2.1Z"/>`,
  refuel: `<path ${P} d="M12 3.5c3 3.6 5 6.3 5 9.1a5 5 0 0 1-10 0c0-2.8 2-5.5 5-9.1Z"/><path ${P} d="M10 13.5a2.2 2.2 0 0 0 2.2 2.2" opacity="0.8"/>`,
  resupply: `<path ${P} d="M4 8.5 12 5l8 3.5-8 3.5Z"/><path ${P} d="M4 8.5v7L12 19l8-3.5v-7M12 12v7" opacity="0.85"/>`,
  undock: `<path ${P} d="M12 4.5 6.5 10M12 4.5 17.5 10M12 4.5V15"/><path ${P} d="M6 19h12" opacity="0.7"/>`,

  // --- misc / status ---
  credits: `<circle cx="12" cy="12" r="8" ${P}/><path ${P} d="M14.5 9.5a3 3 0 1 0 0 5" opacity="0.9"/>`,
  hull: `<path ${P} d="M12 3.5 19 6.5v5c0 4-3 7.3-7 8.5-4-1.2-7-4.5-7-8.5v-5Z"/>`,
  fuel: `<path ${P} d="M12 4c2.4 2.9 4 5 4 7.2a4 4 0 0 1-8 0C8 9 9.6 6.9 12 4Z"/>`,
  cargo: `<path ${P} d="M4 8.5 12 5l8 3.5-8 3.5Z"/><path ${P} d="M4 8.5v7L12 19l8-3.5v-7" opacity="0.85"/>`,
  info: `<circle cx="12" cy="12" r="8.2" ${P}/><path ${P} d="M12 11v5M12 8.2v.2" opacity="0.95"/>`,
  chevron: `<path ${P} d="m9 6 6 6-6 6"/>`,
  // Dismiss. The set previously had no close glyph, so panels reached for `undock` — a launch
  // arrow — and every chooser shipped with an up-arrow where its close button should be.
  close: `<path ${P} d="M7 7l10 10M17 7 7 17"/>`,
  spark: `<path ${P} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M18 6l-2.5 2.5M6 18l2.5-2.5M18 18l-2.5-2.5" opacity="0.9"/>`,
  target: `<circle cx="12" cy="12" r="7.5" ${P}/><circle cx="12" cy="12" r="2.4" ${P}/><path ${P} d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>`,
  route: `<circle cx="5.5" cy="17.5" r="2.1" ${P}/><circle cx="18.5" cy="6.5" r="2.1" ${P}/><path ${P} stroke-dasharray="2 2.6" d="M7 16 17 8"/>`,
  clock: `<circle cx="12" cy="12" r="8" ${P}/><path ${P} d="M12 7.5V12l3 2"/>`,
};

/** Return an <svg> string for the named icon. size in px. */
export function icon(name, size = 24) {
  const inner = RAW[name] || RAW.info;
  return `<svg class="sx-ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export const ICON_NAMES = Object.keys(RAW);
