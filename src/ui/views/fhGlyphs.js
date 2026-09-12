// src/ui/views/fhGlyphs.js — the Field Hardware filled glyph family, for the Power Rail.
//
// The flight HUD drew its slot art with `station/icons.js`: 1.6 px open strokes on a 24 grid. That
// vocabulary is correct for a menu tile and wrong inside a machined recess — a hairline outline sunk
// in a socket bay reads as a web icon someone dropped into a photograph. The Field Hardware
// direction asks for one FILLED family, and the kit produced exactly the nine verbs this rail names:
// seed, well, repel, cone, skim and line exist in `assets/ui/kit/icons/` and appear nowhere else in
// the game, because they were drawn for these sockets and never wired.
//
// Each glyph is two layers by design: the body in `currentColor`, and a `.accent` path the socket
// tints separately, so a lit slot shows a warm core inside a bone silhouette without a second file.
//
// PROVENANCE — path data copied verbatim from the produced 24 px SVGs, no redrawing:
//   weapon icon-munitions   tether icon-line    well  icon-well   cone icon-cone   rig icon-utility
//   blast  icon-spark       seed   icon-seed    repel icon-repel  skim icon-skim
// all under `assets/ui/kit/icons/24/`. Inline rather than `background-image` on purpose: forced
// colours keeps inline SVG and `currentColor` and drops CSS background images, and the HUD has to
// stay legible in high contrast (AGENTS.md §6, accessibility floor).
//
// The tether mark is keyed by its verb rather than by the kit's file name (`icon-line`) for a
// mechanical reason: `line` is in `recognizedCopyFields` in `scripts/localization-surfaces.json`, so
// a key called `line` holding a string makes the extractor file this SVG path data as player copy
// awaiting translation. Verified against that list — the other eight names are clear.

const RAW = Object.freeze({
  weapon: `<path fill="currentColor" fill-rule="evenodd" d="M6.40,8.00H6.80A1.40,1.40 0 0 1 8.20,9.40V18.00A1.40,1.40 0 0 1 6.80,19.40H6.40A1.40,1.40 0 0 1 5.00,18.00V9.40A1.40,1.40 0 0 1 6.40,8.00ZM5.00,8.00 L8.20,8.00 L6.60,3.60ZM11.80,8.00H12.20A1.40,1.40 0 0 1 13.60,9.40V18.00A1.40,1.40 0 0 1 12.20,19.40H11.80A1.40,1.40 0 0 1 10.40,18.00V9.40A1.40,1.40 0 0 1 11.80,8.00ZM10.40,8.00 L13.60,8.00 L12.00,3.60ZM17.20,8.00H17.60A1.40,1.40 0 0 1 19.00,9.40V18.00A1.40,1.40 0 0 1 17.60,19.40H17.20A1.40,1.40 0 0 1 15.80,18.00V9.40A1.40,1.40 0 0 1 17.20,8.00ZM15.80,8.00 L19.00,8.00 L17.40,3.60Z"/><path fill="currentColor" class="accent" d="M5.20,19.80H18.80A1.00,1.00 0 0 1 19.80,20.80V21.00A1.00,1.00 0 0 1 18.80,22.00H5.20A1.00,1.00 0 0 1 4.20,21.00V20.80A1.00,1.00 0 0 1 5.20,19.80Z"/>`,
  blast: `<path fill="currentColor" fill-rule="evenodd" d="M12.00,1.80 L14.00,9.00 L21.20,11.00 L14.00,13.00 L12.00,20.20 L10.00,13.00 L2.80,11.00 L10.00,9.00Z"/><path fill="currentColor" class="accent" d="M10.00,11.00a2.00,2.00 0 1 0 4.00,0a2.00,2.00 0 1 0 -4.00,0Z"/>`,
  tether: `<path fill="currentColor" fill-rule="evenodd" d="M2.20,18.80a3.00,3.00 0 1 0 6.00,0a3.00,3.00 0 1 0 -6.00,0ZM15.80,5.20a3.00,3.00 0 1 0 6.00,0a3.00,3.00 0 1 0 -6.00,0ZM5.20,19.65 L19.65,5.20 L18.80,4.35 L4.35,18.80Z"/><path fill="currentColor" class="accent" d="M9.80,12.00a2.20,2.20 0 1 0 4.40,0a2.20,2.20 0 1 0 -4.40,0Z"/>`,
  seed: `<path fill="currentColor" fill-rule="evenodd" d="M7.80,12.00a4.20,4.20 0 1 0 8.40,0a4.20,4.20 0 1 0 -8.40,0ZM17.75,12.65 L21.85,12.65 L21.85,11.35 L17.75,11.35ZM14.31,17.30 L16.36,20.86 L17.49,20.21 L15.44,16.65ZM8.56,16.65 L6.51,20.21 L7.64,20.86 L9.69,17.30ZM6.25,11.35 L2.15,11.35 L2.15,12.65 L6.25,12.65ZM9.69,6.70 L7.64,3.14 L6.51,3.79 L8.56,7.35ZM15.44,7.35 L17.49,3.79 L16.36,3.14 L14.31,6.70Z"/>`,
  well: `<path fill="currentColor" fill-rule="evenodd" d="M3.00,12.00a9.00,9.00 0 1 0 18.00,0a9.00,9.00 0 1 0 -18.00,0ZM4.75,12.00a7.25,7.25 0 1 1 14.50,0a7.25,7.25 0 1 1 -14.50,0ZM8.40,12.00a3.60,3.60 0 1 0 7.20,0a3.60,3.60 0 1 0 -7.20,0ZM18.29,17.37 L15.54,14.62 L14.62,15.54 L17.37,18.29ZM6.63,18.29 L9.38,15.54 L8.46,14.62 L5.71,17.37ZM5.71,6.63 L8.46,9.38 L9.38,8.46 L6.63,5.71ZM17.37,5.71 L14.62,8.46 L15.54,9.38 L18.29,6.63Z"/><path fill="currentColor" class="accent" d="M10.20,12.00a1.80,1.80 0 1 0 3.60,0a1.80,1.80 0 1 0 -3.60,0Z"/>`,
  repel: `<path fill="currentColor" fill-rule="evenodd" d="M20.86,13.56 L20.65,14.48 L20.34,15.37 L19.95,16.23 L19.46,17.03 L18.89,17.79 L18.25,18.47 L17.54,19.09 L16.77,19.63 L15.95,20.09 L15.08,20.46 L14.53,18.95 L15.24,18.65 L15.92,18.28 L16.56,17.83 L17.14,17.32 L17.67,16.76 L18.13,16.14 L18.53,15.47 L18.86,14.77 L19.11,14.04 L19.29,13.28ZM10.44,20.86 L9.52,20.65 L8.63,20.34 L7.77,19.95 L6.97,19.46 L6.21,18.89 L5.53,18.25 L4.91,17.54 L4.37,16.77 L3.91,15.95 L3.54,15.08 L5.05,14.53 L5.35,15.24 L5.72,15.92 L6.17,16.56 L6.68,17.14 L7.24,17.67 L7.86,18.13 L8.53,18.53 L9.23,18.86 L9.96,19.11 L10.72,19.29ZM3.14,10.44 L3.35,9.52 L3.66,8.63 L4.05,7.77 L4.54,6.97 L5.11,6.21 L5.75,5.53 L6.46,4.91 L7.23,4.37 L8.05,3.91 L8.92,3.54 L9.47,5.05 L8.76,5.35 L8.08,5.72 L7.44,6.17 L6.86,6.68 L6.33,7.24 L5.87,7.86 L5.47,8.53 L5.14,9.23 L4.89,9.96 L4.71,10.72ZM13.56,3.14 L14.48,3.35 L15.37,3.66 L16.23,4.05 L17.03,4.54 L17.79,5.11 L18.47,5.75 L19.09,6.46 L19.63,7.23 L20.09,8.05 L20.46,8.92 L18.95,9.47 L18.65,8.76 L18.28,8.08 L17.83,7.44 L17.32,6.86 L16.76,6.33 L16.14,5.87 L15.47,5.47 L14.77,5.14 L14.04,4.89 L13.28,4.71ZM8.20,12.00a3.80,3.80 0 1 0 7.60,0a3.80,3.80 0 1 0 -7.60,0ZM9.60,12.00a2.40,2.40 0 1 1 4.80,0a2.40,2.40 0 1 1 -4.80,0ZM14.62,15.54 L16.67,17.59 L17.59,16.67 L15.54,14.62ZM8.46,14.62 L6.41,16.67 L7.33,17.59 L9.38,15.54ZM9.38,8.46 L7.33,6.41 L6.41,7.33 L8.46,9.38ZM15.54,9.38 L17.59,7.33 L16.67,6.41 L14.62,8.46Z"/>`,
  cone: `<path fill="currentColor" fill-rule="evenodd" d="M3.00,3.40 L3.00,20.60 L20.40,15.40 L20.40,8.60ZM7.80,6.00 L7.80,18.00 L9.00,18.00 L9.00,6.00Z"/><path fill="currentColor" class="accent" d="M2.60,9.60H3.40A1.20,1.20 0 0 1 4.60,10.80V13.20A1.20,1.20 0 0 1 3.40,14.40H2.60A1.20,1.20 0 0 1 1.40,13.20V10.80A1.20,1.20 0 0 1 2.60,9.60Z"/>`,
  skim: `<path fill="currentColor" fill-rule="evenodd" d="M2.40,15.00 L21.60,15.00 L18.00,20.20 L6.00,20.20ZM7.90,13.30 L7.90,3.70 L6.50,3.70 L6.50,13.30ZM12.70,13.30 L12.70,3.70 L11.30,3.70 L11.30,13.30ZM17.50,13.30 L17.50,3.70 L16.10,3.70 L16.10,13.30Z"/><path fill="currentColor" class="accent" d="M10.20,2.40H13.80A1.20,1.20 0 0 1 15.00,3.60V3.80A1.20,1.20 0 0 1 13.80,5.00H10.20A1.20,1.20 0 0 1 9.00,3.80V3.60A1.20,1.20 0 0 1 10.20,2.40Z"/>`,
  rig: `<path fill="currentColor" fill-rule="evenodd" d="M3.40,12.00a8.60,8.60 0 1 0 17.20,0a8.60,8.60 0 1 0 -17.20,0ZM5.15,12.00a6.85,6.85 0 1 1 13.70,0a6.85,6.85 0 1 1 -13.70,0ZM16.35,15.35H17.55A1.00,1.00 0 0 1 18.55,16.35V17.55A1.00,1.00 0 0 1 17.55,18.55H16.35A1.00,1.00 0 0 1 15.35,17.55V16.35A1.00,1.00 0 0 1 16.35,15.35ZM6.45,15.35H7.65A1.00,1.00 0 0 1 8.65,16.35V17.55A1.00,1.00 0 0 1 7.65,18.55H6.45A1.00,1.00 0 0 1 5.45,17.55V16.35A1.00,1.00 0 0 1 6.45,15.35ZM6.45,5.45H7.65A1.00,1.00 0 0 1 8.65,6.45V7.65A1.00,1.00 0 0 1 7.65,8.65H6.45A1.00,1.00 0 0 1 5.45,7.65V6.45A1.00,1.00 0 0 1 6.45,5.45ZM16.35,5.45H17.55A1.00,1.00 0 0 1 18.55,6.45V7.65A1.00,1.00 0 0 1 17.55,8.65H16.35A1.00,1.00 0 0 1 15.35,7.65V6.45A1.00,1.00 0 0 1 16.35,5.45Z"/><path fill="currentColor" class="accent" d="M9.40,12.00a2.60,2.60 0 1 0 5.20,0a2.60,2.60 0 1 0 -5.20,0Z"/>`,
});

export const FH_GLYPH_NAMES = Object.keys(RAW);

/** True when `name` resolves to a produced glyph rather than falling back. */
export function hasFhGlyph(name) {
  return Object.prototype.hasOwnProperty.call(RAW, String(name || ''));
}

/**
 * Inline one glyph at `size` CSS pixels. The 24 viewBox is the kit grid; scaling it is safe because
 * every path is a fill, so there is no stroke to go sub-pixel the way the old line family did.
 * An unknown name renders nothing rather than a fallback `info` mark — a socket showing the wrong
 * verb is a worse lie than a socket showing none.
 */
export function fhGlyph(name, size = 24) {
  const inner = RAW[String(name || '')];
  if (!inner) return '';
  return `<svg class="fh-glyph" viewBox="0 0 24 24" width="${size}" height="${size}" `
    + `aria-hidden="true" focusable="false">${inner}</svg>`;
}
