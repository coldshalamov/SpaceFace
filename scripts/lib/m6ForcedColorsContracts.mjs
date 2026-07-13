export const M6_FORCED_COLORS_SCHEMA = 'spaceface.m6ForcedColors.v1';
export const M6_FORCED_COLORS_VIEWPORT = Object.freeze({ width: 1280, height: 800 });
export const M6_FORCED_COLORS_SYSTEM_COLORS = Object.freeze([
  'Canvas',
  'CanvasText',
  'ButtonFace',
  'ButtonText',
  'Highlight',
  'HighlightText',
  'GrayText',
]);
export const M6_FORCED_COLORS_KEYS = Object.freeze(['Tab', 'Shift+Tab', 'Enter', 'Escape']);

/** Pure validator for browser/Electron forced-colors evidence receipts. */
export function validateM6ForcedColorsReceipt(receipt, { runtime } = {}) {
  const failures = [];
  const expectedRuntime = runtime || receipt && receipt.runtime;
  if (!receipt || typeof receipt !== 'object') {
    return { pass: false, failures: ['receipt must be an object'], runtime: expectedRuntime || null };
  }
  if (receipt.schema !== M6_FORCED_COLORS_SCHEMA) failures.push('schema mismatch');
  if (expectedRuntime !== 'browser' && expectedRuntime !== 'electron') failures.push('runtime must be browser or electron');
  if (receipt.runtime !== expectedRuntime) failures.push(`runtime mismatch: ${receipt.runtime || 'missing'} !== ${expectedRuntime || 'missing'}`);

  requireTrue(receipt.route, 'publicRoot', 'public player root was not exercised', failures);
  requireTrue(receipt.route, 'canonicalRoot', 'canonical root URL was not maintained', failures);
  requireTrue(receipt.route, 'cleanUrl', 'public root carried query/hash flags', failures);
  requireFalse(receipt.route, 'injectedState', 'game state injection is forbidden', failures);

  requireTrue(receipt.forcedColors, 'enabledBeforeLoad', 'forced colors were not enabled before load', failures);
  requireTrue(receipt.forcedColors, 'mediaMatches', 'forced-colors media query was not active', failures);
  requireTrue(receipt.forcedColors, 'rootClass', 'sf-forced-colors root bridge was not active', failures);
  requireTrue(receipt.forcedColors, 'applyReport', 'applyAccessibility did not report forcedColorsActive', failures);

  if (receipt.input?.source !== 'keyboard') failures.push('input source must be keyboard');
  if (!sameSequence(receipt.input?.sequence, M6_FORCED_COLORS_KEYS)) failures.push('real Tab/Shift+Tab/Enter/Escape sequence is incomplete');
  requireTrue(receipt.input, 'mainMenuOnly', 'input escaped the main menu surface', failures);
  requireTrue(receipt.input, 'settingsOnly', 'input escaped the Settings surface', failures);

  requireTrue(receipt.ui, 'mainMenuVisible', 'main menu visibility not proved', failures);
  requireTrue(receipt.ui, 'settingsVisible', 'Settings visibility not proved', failures);
  requireTrue(receipt.ui, 'focusVisible', 'visible keyboard focus not proved', failures);
  if (!(Number(receipt.ui?.focusOutlineWidthPx) >= 3)) failures.push('focus outline must be at least 3px');
  requireTrue(receipt.ui, 'focusUsesHighlight', 'focus outline did not use Highlight', failures);
  requireTrue(receipt.ui, 'opaqueBoundaries', 'opaque UI boundaries not proved', failures);
  requireTrue(receipt.ui, 'textGlyphRedundancy', 'text/glyph redundancy not proved', failures);
  for (const token of M6_FORCED_COLORS_SYSTEM_COLORS) {
    requireTrue(receipt.ui?.systemColors, token, `${token} system color not proved`, failures);
  }

  if (receipt.viewport?.width !== M6_FORCED_COLORS_VIEWPORT.width
    || receipt.viewport?.height !== M6_FORCED_COLORS_VIEWPORT.height) {
    failures.push('viewport must be exactly 1280x800');
  }
  requireEmptyArray(receipt.viewport, 'clipped', 'visible UI clipping detected', failures);
  requireEmptyArray(receipt.viewport, 'overlaps', 'visible UI overlap detected', failures);
  if (!Array.isArray(receipt.errors) || receipt.errors.length) failures.push('runtime/page/request errors must be empty');

  if (!cleanText(receipt.capture?.path)) failures.push('capture path missing');
  if (!(Number(receipt.capture?.bytes) >= 1024)) failures.push('capture is too small');
  requireTrue(receipt.capture, 'nonBlank', 'capture is blank', failures);
  if (!(Number(receipt.capture?.uniqueColors) >= 2)) failures.push('capture lacks color variance');

  requireTrue(receipt.cleanup, 'pass', 'owned teardown failed', failures);
  requireTrue(receipt.cleanup, 'owned', 'runtime ownership not proved', failures);
  requireTrue(receipt.cleanup, 'pageClosed', 'page remained open', failures);
  if (expectedRuntime === 'browser') {
    requireTrue(receipt.cleanup, 'contextClosed', 'browser context remained open', failures);
    requireTrue(receipt.cleanup, 'browserClosed', 'browser remained connected', failures);
    requireTrue(receipt.cleanup, 'serverClosed', 'owned browser server remained open', failures);
  } else if (expectedRuntime === 'electron') {
    requireTrue(receipt.cleanup, 'runtimeClosed', 'Electron runtime remained open', failures);
    requireTrue(receipt.cleanup, 'listenerClosed', 'Electron listener remained open', failures);
    requireTrue(receipt.cleanup, 'profileRemoved', 'isolated Electron profile remained on disk', failures);
  }

  return {
    pass: failures.length === 0,
    failures,
    runtime: expectedRuntime || null,
    schema: receipt.schema || null,
  };
}

function requireTrue(owner, field, failure, failures) {
  if (!owner || owner[field] !== true) failures.push(failure);
}

function requireFalse(owner, field, failure, failures) {
  if (!owner || owner[field] !== false) failures.push(failure);
}

function requireEmptyArray(owner, field, failure, failures) {
  if (!owner || !Array.isArray(owner[field]) || owner[field].length) failures.push(failure);
}

function sameSequence(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}
