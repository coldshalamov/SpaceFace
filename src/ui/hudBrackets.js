// src/ui/hudBrackets.js — J07 "ink on vacuum" (SCREENS_A §1, NEXT_JOBS J07).
//
// One shape for every de-boxed HUD surface: four hairline corner brackets and nothing else. No
// plate, no full border, no drop shadow.
//
// Why a module and not a CSS class: the flight HUD's surfaces are authored across five self-
// injecting stylesheets (uiRoot.injectHudCss, comms.js, sectorLawPresenter.js, onboarding.js,
// contactHailPrompt.js). A class in one of them is invisible to the others, and this repo has
// already paid for the version of that mistake where three stylesheets set one selector and only
// the last one was doing anything. A string every stylesheet interpolates has exactly one owner.
//
// Why backgrounds and not ::before/::after: `.sf-overview::before` already carries the LOCAL
// CONTACTS label, and several of these surfaces use ::after for state. Eight background layers of
// the same 1px gradient cost no elements and collide with nothing.
//
// NOTE: consumers interpolate this into a template literal, so it must never contain a backtick.

export const BRACKET_ARM = 11;

/**
 * CSS declarations drawing four corner brackets inside the element's padding box.
 * @param {string} color any CSS colour, including a var(). Defaults to the HUD hairline token.
 * @param {number} arm arm length in px.
 * @returns {string} declarations, semicolon-terminated, safe to interpolate into a rule body.
 */
export function bracketCss(color = 'var(--sf-brk-col, rgba(148,178,205,.42))', arm = BRACKET_ARM) {
  const g = `linear-gradient(${color}, ${color})`;
  const h = `${arm}px 1px`;
  const v = `1px ${arm}px`;
  return [
    `background-image:${new Array(8).fill(g).join(', ')};`,
    'background-repeat:no-repeat;',
    `background-size:${h}, ${v}, ${h}, ${v}, ${h}, ${v}, ${h}, ${v};`,
    'background-position:left top, left top, right top, right top, left bottom, left bottom, right bottom, right bottom;',
  ].join(' ');
}

/**
 * Full de-box: strip the plate, then draw the brackets. Use this on any surface that currently
 * ships a background + border + box-shadow card.
 * @param {string} color bracket colour.
 * @returns {string} declarations.
 */
export function deboxCss(color) {
  return `background-color:transparent; border:none; border-radius:0; box-shadow:none; ${bracketCss(color)}`;
}

/**
 * Per-glyph scrim for text that no longer sits on a plate. Same idiom as `.sf-firstuse`, which is
 * the one chromeless readout this build already trusted over arbitrary scenery.
 */
export const INK_SHADOW = '0 1px 2px #000, 0 0 7px rgba(0,0,0,.9)';
