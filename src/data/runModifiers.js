// Run modifier records for the ten-wave shell (PQ-133.02 / CRU-016).
//
// The queue row for PQ-133.02 names `src/data/runModifiers.js` as the draft-modifier
// owner. In v0 a "modifier" is exactly one draft pick: the immutable record the draft
// owner emits (`run:modifierRecordRequested`) and runSession stamps into
// `state.run.modifiers` verbatim — never a stat slider. This module owns the record
// shape and its validator so producers (survivalDraft) and consumers
// (survivalResults, the draft/refit screens) agree without importing each other.
//
// LIVE SHAPE (src/systems/survivalDraft.js `resolvePick`): the `verb` is the DISPLAY
// verb the player read on the card ('Throw', 'Bank', …), `offerId` is the catalog id
// ('throw', 'bank'), and `slotIndex`/`replaced` say where it landed. There is no
// schemaVersion on live records — runSession stores whatever object it is handed.
// Pure data + pure functions: no bus, no registry, no state, no RNG. The verb list
// is literal on purpose (importing the draft catalogs would drag systems/ships into
// data/); `test/crucible-ten-wave-shell.test.mjs` cross-checks it against both live
// catalogs so drift fails loudly.

/**
 * Every display verb either draft pool can offer. Arc pool
 * (src/data/survivalDraft.js): Throw Tag Bind Mine Unsteer Scramble Screen Seek
 * Pierce Sustain Burn Volume Cadence Sidearm. Swarm additions
 * (src/data/swarmDraft.js): Bank Punch Fork Twin Arc Weight Short Freeze Fan Ram
 * Cool Charges Harden Bank Screen Burst Knit Lead Drive Pull Whip Sweep Snare
 * Spool Chaff (Burn and Screen overlap the arc pool).
 */
export const RUN_MODIFIER_VERBS = Object.freeze([
  'Throw',
  'Tag',
  'Bind',
  'Mine',
  'Unsteer',
  'Scramble',
  'Screen',
  'Seek',
  'Pierce',
  'Sustain',
  'Burn',
  'Volume',
  'Cadence',
  'Sidearm',
  'Bank',
  'Punch',
  'Fork',
  'Twin',
  'Arc',
  'Weight',
  'Short',
  'Freeze',
  'Fan',
  'Ram',
  'Cool',
  'Charges',
  'Harden',
  'Bank Screen',
  'Burst',
  'Knit',
  'Lead',
  'Drive',
  'Pull',
  'Whip',
  'Sweep',
  'Snare',
  'Spool',
  'Chaff',
]);

const VERB_SET = new Set(RUN_MODIFIER_VERBS);

function issue(path, message) {
  return { path, message };
}

/**
 * Validate one immutable run-modifier record.
 * Shape: { kind, offerId, verb, defId, wave, slotIndex?, replaced? }. `kind` is a
 * non-empty string ('weapon' on every live record), `offerId` the catalog id,
 * `verb` a known display verb, `defId` a non-blank weapon/module id, `wave` the
 * 1-based wave that offered it. Extra fields are ignored (forward-compat).
 */
export function validateRunModifier(entry) {
  try {
    return validateRunModifierInner(entry);
  } catch {
    return { ok: false, issues: [issue('', 'invalid run modifier')] };
  }
}

function validateRunModifierInner(entry) {
  const issues = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, issues: [issue('', 'modifier must be an object')] };
  }
  if (typeof entry.kind !== 'string' || entry.kind.length === 0) {
    issues.push(issue('kind', 'kind must be a non-empty string'));
  }
  if (typeof entry.offerId !== 'string' || entry.offerId.length === 0) {
    issues.push(issue('offerId', 'offerId must be a non-empty string'));
  }
  if (typeof entry.verb !== 'string' || !VERB_SET.has(entry.verb)) {
    issues.push(issue('verb', 'unknown verb'));
  }
  if (typeof entry.defId !== 'string' || entry.defId.trim().length === 0) {
    issues.push(issue('defId', 'defId must be a non-empty string'));
  }
  if (entry.slotIndex != null && (!Number.isInteger(entry.slotIndex) || entry.slotIndex < 0)) {
    issues.push(issue('slotIndex', 'slotIndex must be a non-negative integer'));
  }
  if (!Number.isInteger(entry.wave) || entry.wave < 1) {
    issues.push(issue('wave', 'wave must be an integer >= 1'));
  }
  return { ok: issues.length === 0, issues };
}

/** Build a live-shaped record. Pure: never writes state.
 * Incomplete or null input yields a structurally complete but INVALID record —
 * callers must run it through validateRunModifier. */
export function runModifierRecord(args) {
  const src = args || {};
  return {
    kind: typeof src.kind === 'string' ? src.kind : null,
    offerId: typeof src.offerId === 'string' ? src.offerId : null,
    verb: typeof src.verb === 'string' ? src.verb : null,
    defId: typeof src.defId === 'string' ? src.defId : null,
    slotIndex: Number.isInteger(src.slotIndex) ? src.slotIndex : null,
    replaced: typeof src.replaced === 'string' ? src.replaced : null,
    wave: Number.isInteger(src.wave) ? src.wave : 0,
  };
}
