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
 * Reel Cool Charges Harden Burst Drive Pull Whip Sweep Snare Spool Chaff Web Trap
 * (Burn, Screen, and Ram overlap the arc pool).
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
  'Reel',
  'Cool',
  'Charges',
  'Harden',
  'Burst',
  'Drive',
  'Pull',
  'Whip',
  'Sweep',
  'Snare',
  'Spool',
  'Chaff',
  'Web',
  'Trap',
  // Named-synthesis records (kind: 'evolution') — the build converts parts into an evolved item.
  'Evolve',
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

/**
 * What one pick says about how the run kills (SF-072). Three families, matching the vocabulary
 * `applyBuildPressure` already speaks in survivalWavePlanner: `collision` is mass-as-weapon —
 * thrown hulls, lines, rams, and the room doing the killing. `orbit` is gunnery — the build
 * wins on shots and positioning. `chain` is multiplication — one hit that spreads, primes, or
 * herds a pack. Purely defensive cards (Screen/Harden/Chaff) and synthesis records carry no
 * family on purpose: armor is not a way of killing, and a run that only bought defense has no
 * dominant verb to test.
 */
const VERB_BUILD_FAMILY = Object.freeze({
  Throw: 'collision',
  Tag: 'collision',
  Bind: 'collision',
  Weight: 'collision',
  Ram: 'collision',
  Pull: 'collision',
  Whip: 'collision',
  Reel: 'collision',
  Charges: 'collision',
  Spool: 'collision',
  Sweep: 'collision',
  Snare: 'collision',
  Bank: 'orbit',
  Fan: 'orbit',
  Seek: 'orbit',
  Pierce: 'orbit',
  Punch: 'orbit',
  Sustain: 'orbit',
  Burn: 'orbit',
  Volume: 'orbit',
  Cadence: 'orbit',
  Sidearm: 'orbit',
  Burst: 'orbit',
  Drive: 'orbit',
  Cool: 'orbit',
  Arc: 'chain',
  Fork: 'chain',
  Twin: 'chain',
  Web: 'chain',
  Freeze: 'chain',
  Short: 'chain',
  Scramble: 'chain',
  Unsteer: 'chain',
  Mine: 'chain',
  Trap: 'chain',
});

export const RUN_BUILD_FAMILIES = Object.freeze(['collision', 'orbit', 'chain']);

/** The build family a display verb belongs to, or null for defensive/untyped picks. */
export function verbBuildFamily(verb) {
  return typeof verb === 'string' && Object.hasOwn(VERB_BUILD_FAMILY, verb)
    ? VERB_BUILD_FAMILY[verb]
    : null;
}

/**
 * The run's build summary — the input `planWave` buildSummary was shaped for.
 *
 * Reads `state.run.modifiers` verbatim: only the verb on each immutable record is read, so a
 * stale save or a hand-authored record can never produce a family the catalog does not name.
 * `dominant` is the family the most picks feed; a tie goes to the family of the most RECENT
 * pick among the tied families, because the last card bought is the build the player is
 * actually flying now. A run with no family-bearing picks (or only defense) returns
 * `dominant: null` — nothing to test, nothing to pressure.
 */
export function summarizeRunBuild(modifiers) {
  const tally = { collision: 0, orbit: 0, chain: 0 };
  const recency = { collision: -1, orbit: -1, chain: -1 };
  let picks = 0;
  const list = Array.isArray(modifiers) ? modifiers : [];
  for (let i = 0; i < list.length; i++) {
    const family = verbBuildFamily(list[i] && list[i].verb);
    if (!family) continue;
    picks += 1;
    tally[family] += 1;
    recency[family] = i;
  }
  let dominant = null;
  let best = 0;
  for (const family of RUN_BUILD_FAMILIES) {
    const n = tally[family];
    if (n > best || (n === best && n > 0 && dominant != null && recency[family] > recency[dominant])) {
      best = n;
      dominant = family;
    }
  }
  return { dominant, tally, picks };
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
