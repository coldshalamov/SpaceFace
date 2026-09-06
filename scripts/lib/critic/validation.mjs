// scripts/lib/critic/validation.mjs — Verdict validation and content pattern check.
//
// Law:
// 1. A frame number is missing, not an integer, or outside the strip.
//    Validate every answers[].frameIndex and fundamental.frameIndex against the manifest's
//    real frames[].index set — not against framesCount, because retention renumbers.
// 2. Question 10 names content. Reject when fundamental mentions adding enemies, ships,
//    weapons, missions, stations, levels, particles, camera shake, more health, or level scaling.
// 3. Fewer than nine yes/no answers, or duplicate q, or answer not 'yes' or 'no'.
// 4. Extractable balanced JSON.
// 5. The three-part verdict (PQ-173.04, audit 2026-09-05) fails closed: all seven blockers, each
//    with a JSON boolean and a non-empty evidence field (a raised frame-proof blocker needs a shown
//    frame); the intent result when a claim was declared (a boolean, at least one shown frame, the
//    tradeoff spent); the five sentences of the play judgment. A missing part is a rejected verdict,
//    never a cleared one.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, basename } from 'node:path';
import {
  RUBRIC_QUESTIONS,
  BLOCKERS,
  JUDGMENT_FIELDS,
  VISION_SENTENCE,
  computeCoverage,
  decideVerdict,
} from './rubric.mjs';

/** Capture's NORMAL_SPEED_FLOOR. Never trust a lower manifest-supplied floor. */
export const CANONICAL_NORMAL_SPEED_FLOOR = 0.60;
const SAFE_BASENAME_RE = /^[a-zA-Z0-9._-]+$/;

function containmentRel(rootPath, childPath) {
  const rel = relative(rootPath, childPath);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return null;
  return rel;
}

function isSafeBasename(name) {
  return typeof name === 'string'
    && name
    && basename(name) === name
    && SAFE_BASENAME_RE.test(name)
    && name !== '.'
    && name !== '..'
    && !name.includes('/')
    && !name.includes('\\')
    && !name.includes(':');
}

/**
 * Strict critic admission gate for strip manifests.
 *
 * Missing proof is a hard refusal before model launch:
 * - Expected schema ('spaceface.frameStripManifest.v2')
 * - Shipping camera ('shipping_chase' with finite positive cameraMeasured numbers)
 * - Verified hidden HUD (hudText === 'off' and hudTextVerified === true, no visible leftovers)
 * - Positive drawn-hull proof (medianPartsPerFrame > 0, framesWithHull > 0, framesTotal > 0)
 * - Normal speed (normalSpeed === true and finite realtimeFraction >= 0.60)
 * - Format (frameFormat === 'jpeg', every frame .jpg, contactSheet .png)
 * - Source identity proof (gitHead, gitTree, productionDirty, productionDiffHash)
 * - Harness digest proof (non-empty string matching expectedHarnessDigest if supplied)
 * - Every exact manifest-listed frame exists on disk as a nonzero regular file
 * - Contact sheet exists inside receiptDir as a nonzero regular file
 * - No stale frame filenames, format mismatch, or unlisted frame files in stripDir
 *
 * @param {object} manifest Manifest to validate
 * @param {object} [options]
 * @param {string} [options.manifestPath]
 * @param {string} [options.stripDir]
 * @param {string} [options.receiptDir]
 * @param {string} [options.expectedHarnessDigest]
 * @param {boolean} [options.checkFiles=true] Whether to check files on disk
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateStripAdmission(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, reason: 'Manifest is missing or not an object' };
  }
  if (manifest.schema !== 'spaceface.frameStripManifest.v2') {
    return { ok: false, reason: `Invalid or missing manifest schema: expected 'spaceface.frameStripManifest.v2', got '${manifest.schema}'` };
  }

  const cam = manifest.cameraMeasured;
  if (
    manifest.camera !== 'shipping_chase' ||
    !cam ||
    cam.available !== true ||
    typeof cam.heightWU !== 'number' || !Number.isFinite(cam.heightWU) || cam.heightWU <= 0 ||
    typeof cam.fovDeg !== 'number' || !Number.isFinite(cam.fovDeg) || cam.fovDeg <= 0 ||
    typeof cam.aspect !== 'number' || !Number.isFinite(cam.aspect) || cam.aspect <= 0 ||
    typeof cam.visibleDepthWU !== 'number' || !Number.isFinite(cam.visibleDepthWU) || cam.visibleDepthWU <= 0
  ) {
    return {
      ok: false,
      reason: 'Missing shipping-camera proof: camera must be "shipping_chase" with finite positive numeric cameraMeasured measurements (heightWU, fovDeg, aspect, visibleDepthWU)',
    };
  }

  if (manifest.hudText !== 'off' || manifest.hudTextVerified !== true) {
    return { ok: false, reason: 'Missing verified hidden HUD proof: hudText must be "off" and hudTextVerified must be true' };
  }
  if (Array.isArray(manifest.hudTextLeftovers)) {
    const hasLeftoverText = manifest.hudTextLeftovers.some((l) => {
      if (!l) return false;
      const t = typeof l === 'string' ? l : (l.text || '');
      return typeof t === 'string' && t.trim().length > 0;
    });
    if (hasLeftoverText) {
      return { ok: false, reason: 'HUD verification failed: leftover visible HUD text present in manifest' };
    }
  }

  if (manifest.normalSpeed !== true) {
    return { ok: false, reason: `Slow-motion capture refused: normalSpeed must be true (got ${manifest.normalSpeed})` };
  }
  if (typeof manifest.realtimeFraction !== 'number' || !Number.isFinite(manifest.realtimeFraction)
    || manifest.realtimeFraction < CANONICAL_NORMAL_SPEED_FLOOR) {
    return {
      ok: false,
      reason: `Slow-motion capture refused: realtimeFraction must be a finite number >= ${CANONICAL_NORMAL_SPEED_FLOOR} (got ${manifest.realtimeFraction})`,
    };
  }

  if (manifest.frameFormat !== 'jpeg') {
    return { ok: false, reason: `Unsupported frameFormat: expected 'jpeg', got '${manifest.frameFormat}'` };
  }

  const hullDrawn = manifest.hullDrawn;
  if (!hullDrawn || hullDrawn.framesTotal <= 0 || (hullDrawn.medianPartsPerFrame || 0) <= 0 || (hullDrawn.framesWithHull || 0) <= 0) {
    return {
      ok: false,
      reason: `Missing positive drawn-hull proof: ${hullDrawn?.framesWithHull || 0} of ${hullDrawn?.framesTotal || 0} frames drew the hull (median ${hullDrawn?.medianPartsPerFrame || 0})`,
    };
  }

  const sourceIdentity = manifest.sourceIdentity;
  if (
    !sourceIdentity ||
    typeof sourceIdentity !== 'object' ||
    typeof sourceIdentity.gitHead !== 'string' ||
    !sourceIdentity.gitHead ||
    typeof sourceIdentity.gitTree !== 'string' ||
    !sourceIdentity.gitTree ||
    typeof sourceIdentity.productionDirty !== 'boolean' ||
    typeof sourceIdentity.productionDiffHash !== 'string' ||
    !sourceIdentity.productionDiffHash
  ) {
    return { ok: false, reason: 'Missing complete sourceIdentity proof in strip manifest' };
  }

  if (typeof manifest.harnessDigest !== 'string' || !manifest.harnessDigest) {
    return { ok: false, reason: 'Missing harnessDigest proof in strip manifest' };
  }
  if (options.expectedHarnessDigest && manifest.harnessDigest !== options.expectedHarnessDigest) {
    return {
      ok: false,
      reason: `Mismatched harnessDigest in manifest (${manifest.harnessDigest} !== ${options.expectedHarnessDigest})`,
    };
  }

  if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) {
    return { ok: false, reason: 'Strip manifest contains zero frames' };
  }
  if (!Number.isInteger(manifest.framesCount) || manifest.framesCount !== manifest.frames.length) {
    return { ok: false, reason: `Frame count mismatch: frames array length (${manifest.frames.length}) !== framesCount (${manifest.framesCount})` };
  }
  if (!Number.isInteger(hullDrawn.framesTotal) || manifest.frames.length !== hullDrawn.framesTotal) {
    return { ok: false, reason: `Frame count mismatch: frames array length (${manifest.frames.length}) !== hullDrawn.framesTotal (${hullDrawn.framesTotal})` };
  }

  const seenIndices = new Set();
  const manifestFiles = new Set();

  for (let i = 0; i < manifest.frames.length; i++) {
    const f = manifest.frames[i];
    if (!f || typeof f !== 'object') {
      return { ok: false, reason: `Frame item at index ${i} is not an object` };
    }
    if (typeof f.index !== 'number' || !Number.isInteger(f.index)) {
      return { ok: false, reason: `Frame item at position ${i} has non-integer index: ${JSON.stringify(f.index)}` };
    }
    if (seenIndices.has(f.index)) {
      return { ok: false, reason: `Duplicate frame index in manifest: ${f.index}` };
    }
    seenIndices.add(f.index);

    if (!isSafeBasename(f.file)) {
      return { ok: false, reason: `Frame entry index ${f.index} has unsafe or path-escaping filename: "${f.file}"` };
    }
    if (!f.file.endsWith('.jpg')) {
      return { ok: false, reason: `Frame entry index ${f.index} filename "${f.file}" does not match required .jpg extension for jpeg frameFormat` };
    }
    if (manifestFiles.has(f.file)) {
      return { ok: false, reason: `Duplicate frame filename in manifest: "${f.file}"` };
    }
    manifestFiles.add(f.file);
  }

  if (!manifest.contactSheet || typeof manifest.contactSheet !== 'string' || !manifest.contactSheet.trim()) {
    return { ok: false, reason: 'Missing or empty contactSheet path in manifest' };
  }
  const contactBase = basename(manifest.contactSheet);
  if (!contactBase.toLowerCase().endsWith('.png') || !isSafeBasename(contactBase)) {
    return { ok: false, reason: `Invalid contactSheet format: expected a safe .png basename, got '${manifest.contactSheet}'` };
  }

  const rawReceiptDir = options.receiptDir || manifest.receiptDir;
  if (!rawReceiptDir || typeof rawReceiptDir !== 'string' || !rawReceiptDir.trim()) {
    return { ok: false, reason: 'Missing capture-owned receiptDir for contact-sheet containment' };
  }
  const receiptDir = resolve(rawReceiptDir);
  const resolvedContactSheet = isAbsolute(manifest.contactSheet)
    ? resolve(manifest.contactSheet)
    : resolve(receiptDir, manifest.contactSheet);
  if (!containmentRel(receiptDir, resolvedContactSheet)) {
    return { ok: false, reason: `contactSheet "${resolvedContactSheet}" escaped receipt directory "${receiptDir}"` };
  }
  if (basename(resolvedContactSheet) !== contactBase) {
    return { ok: false, reason: `contactSheet "${resolvedContactSheet}" basename mismatch` };
  }

  const rawStripDir = options.stripDir || manifest.stripDir || (options.manifestPath ? dirname(options.manifestPath) : '');
  if (options.checkFiles !== false) {
    if (!rawStripDir || !existsSync(rawStripDir)) {
      return { ok: false, reason: `Strip directory not found on disk: ${rawStripDir}` };
    }
    const resolvedStripDir = resolve(rawStripDir);

    for (const f of manifest.frames) {
      const framePath = resolve(resolvedStripDir, f.file);
      const rel = containmentRel(resolvedStripDir, framePath);
      if (!rel || rel !== f.file) {
        return { ok: false, reason: `Frame file "${f.file}" escapes strip directory "${resolvedStripDir}"` };
      }
      try {
        const st = statSync(framePath);
        if (!st.isFile()) {
          return { ok: false, reason: `Manifest-listed frame file is not a regular file: ${framePath}` };
        }
        if (st.size <= 0) {
          return { ok: false, reason: `Manifest-listed frame file is empty (0 bytes): ${framePath}` };
        }
      } catch (err) {
        return { ok: false, reason: `Nonexistent manifest-listed frame file: ${framePath}` };
      }
    }

    try {
      const st = statSync(resolvedContactSheet);
      if (!st.isFile()) {
        return { ok: false, reason: `contactSheet is not a regular file: ${resolvedContactSheet}` };
      }
      if (st.size <= 0) {
        return { ok: false, reason: `contactSheet file is empty (0 bytes): ${resolvedContactSheet}` };
      }
    } catch (err) {
      return { ok: false, reason: `Nonexistent contactSheet file: ${resolvedContactSheet}` };
    }

    let dirEntries;
    try {
      dirEntries = readdirSync(resolvedStripDir);
    } catch (err) {
      return { ok: false, reason: `Failed to read strip directory "${resolvedStripDir}": ${err.message}` };
    }

    for (const name of dirEntries) {
      if (name === 'strip-manifest.json') continue;
      if (resolvedContactSheet && resolve(resolvedStripDir, name) === resolvedContactSheet) continue;
      const lower = name.toLowerCase();
      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        if (!lower.endsWith('.jpg')) {
          return { ok: false, reason: `Stale frame filename format mismatch: ${name} does not match expected format jpeg (.jpg)` };
        }
        if (!manifestFiles.has(name)) {
          return { ok: false, reason: `Stale or unlisted frame file found in strip directory: ${name}` };
        }
      }
    }
  }

  return { ok: true };
}

/**
 * Forbidden phrases for Question 10 / the fundamental.
 *
 * The critic proposes a RULE CHANGE, never more stuff. But note what that does and does not
 * forbid, because the first version of this list got it backwards and would have rejected the
 * very finding the critic exists to produce:
 *
 *   "add a particle burst on impact"            <- a proposal. Forbidden.
 *   "the only answer an impact gets is a
 *    particle burst; nothing stops or shakes"   <- a DIAGNOSIS, and it is audit finding A11.
 *                                                  Naming the lazy answer is the critic's job.
 *
 * So every pattern here is anchored to a proposing verb (add / more / introduce / spawn / give it /
 * use). A noun on its own is evidence, not a violation.
 */
export const CONTENT_ANSWER_PATTERNS = Object.freeze([
  /add(?:ing)?\s+(?:more\s+)?enemies/i,
  /more\s+enemies/i,
  /spawn\s+(?:more\s+)?enemies/i,
  /add(?:ing)?\s+(?:more\s+)?ships/i,
  /more\s+ships/i,
  /add(?:ing)?\s+(?:more\s+)?weapons/i,
  /more\s+weapons/i,
  /new\s+weapons/i,
  /add(?:ing)?\s+(?:more\s+)?missions/i,
  /more\s+missions/i,
  /add(?:ing)?\s+(?:more\s+)?stations/i,
  /more\s+stations/i,
  /add(?:ing)?\s+(?:more\s+)?levels/i,
  /more\s+levels/i,
  /level\s+scaling/i,
  /scale\s+(?:with|by)\s+levels?/i,
  // Particles and camera shake are forbidden as ANSWERS, not as observations.
  /(?:add|adding|introduce|introducing|use|using|give\s+\w+|need|needs|should\s+have)\s+(?:\w+\s+){0,3}particles?/i,
  /more\s+particles?/i,
  /particle\s+(?:burst|effect|system)\s+(?:should|would|to)\s+/i,
  /(?:add|adding|introduce|introducing|use|using|give\s+\w+|need|needs|should\s+have)\s+(?:\w+\s+){0,3}camera\s+shake/i,
  /more\s+camera\s+shake/i,
  /more\s+health/i,
  /add(?:ing)?\s+health/i,
  /increase\s+health/i,
  /hp\s+(?:sponge|inflation)/i,
  /health\s+sponge/i,
]);

/**
 * Tests whether input string or object matches any content forbidden pattern.
 *
 * @param {string|object} input
 * @returns {RegExp|null} Matched pattern or null
 */
export function matchesContentPatterns(input) {
  const texts = [];
  if (typeof input === 'string') {
    texts.push(input);
  } else if (input && typeof input === 'object') {
    for (const val of Object.values(input)) {
      if (typeof val === 'string') texts.push(val);
    }
  }
  const combined = texts.join(' ');
  for (const pattern of CONTENT_ANSWER_PATTERNS) {
    if (pattern.test(combined)) {
      return pattern;
    }
  }
  return null;
}

/**
 * The known audit findings a critic can be asked to reproduce (FEEL_CONTRACT §A, 2026-09-03).
 *
 * Each pattern names the MECHANISM in the words a viewer of the frames would use, and the rule's
 * own name beside it, so a verdict counts whether the critic read the pre-fix source or only the
 * pictures. `--expect-fundamental` accepts one of these keys or any regular expression.
 */
export const KNOWN_FUNDAMENTALS = Object.freeze({
  // A1/A2: holding forward (or letting go) above the governed cap slowed the ship.
  governor_brake: /governor|overspeed|neutral.?brake|counter.?thrust|reactionAssist|auto.?brak|earned speed|speed .{0,40}(eaten|confiscat|bled|braked|slowed|decay|falls|drops|is lost|thrown away)|(slow|brak|bleed|decay)\w* .{0,60}(above|past|over) .{0,20}cap|(dead |full |complete )?(stop|halt)\w* .{0,60}(hands.?off|release|let go|throttle|input|coast)|(hands.?off|release|let go|throttle|coast)\w* .{0,60}(dead |full |complete )?(stop|halt|brak)/i,
  // A4: the physics owner truncated every NPC's velocity to 1.15x its cap, deleting given momentum.
  npc_clamp: /_?clampSpeed|maxSpeed|speed (cap|clamp|limit)|velocity (cap|clamp|limit|truncat)|clamp\w* .{0,60}(velocity|speed|momentum)|(1\.15|115 ?%)|snaps? back|momentum .{0,40}(deleted|erased|clamped|truncated|capped)|(deleted|erased|truncated|capped) .{0,40}momentum|stays? parked|position barely (changes|moves)|barely (moves|displaced)|no (visible )?(knockback|displacement)|never fl(y|ies) as thrown|not thrown|(not|never) become\w* (a )?projectile/i,
  // A5: terrain and structure contact never took the helm; a slammed ship kept flying its plan.
  terrain_helm: /helm|collisionAllowsHelmLoss|tumble|stagger|keeps? (its )?(heading|course|nose|plan)|(rock|asteroid|terrain|structure) .{0,80}(heading|course|nose|plan|control|helm|tumble)/i,
});

/**
 * Does the critic's fundamental name the expected finding? Matches across rule, file, does and
 * breaksSentence, so a critic that saw the mechanism but named a neighbouring file still counts,
 * and one that named the file without the mechanism does too.
 *
 * @param {object|null} fundamental normalized { rule, file, does, breaksSentence }
 * @param {string|RegExp} expected a KNOWN_FUNDAMENTALS key or a regular expression source
 * @returns {{ matched: boolean, pattern: string, text: string }}
 */
export function matchesExpectedFundamental(fundamental, expected) {
  const text = ['rule', 'file', 'does', 'breaksSentence']
    .map((k) => (fundamental && typeof fundamental[k] === 'string' ? fundamental[k] : ''))
    .join(' ');
  // A comma-separated list of known keys is "any of these": one strip can only ever expose one
  // fundamental per verdict, but the shove tape exposes two findings (the NPC cap and terrain
  // helm) and either is a reproduction of what that strip was captured for.
  const wanted = expected instanceof RegExp
    ? [{ key: expected.source, pattern: expected }]
    : String(expected || '').split(',').map((s) => s.trim()).filter(Boolean).map((key) => ({
      key,
      pattern: KNOWN_FUNDAMENTALS[key] || new RegExp(key, 'i'),
    }));
  const matchedKeys = wanted.filter((w) => w.pattern.test(text)).map((w) => w.key);
  return {
    matched: matchedKeys.length > 0,
    matchedKeys,
    pattern: wanted.map((w) => w.pattern.source).join(' | '),
    text,
  };
}

const EVIDENCE_MAX_CHARS = 400;

function frameIndexProblem(value, validFrameIndices) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return `non-integer frameIndex ${JSON.stringify(value)}`;
  }
  if (!validFrameIndices.has(value)) {
    return `frameIndex ${value}, which is outside the ${validFrameIndices.size} frames the critic was shown`;
  }
  return null;
}

/**
 * The seven blockers, fail closed. Every blocker must be present exactly once with a JSON boolean
 * (`true` = blocked, always), a non-empty evidence sentence, and — when raised — the proof its
 * definition demands: a shown frame for a 'frame' blocker; a shown frame or the evidence sentence
 * itself (a receipt in the run facts) for a 'frame-or-receipt' blocker.
 *
 * @param {unknown} candidateBlockers
 * @param {Set<number>} validFrameIndices
 * @param {string[]} rejectReasons appended in place
 * @returns {Array<object>} normalized blockers in rubric order
 */
export function normalizeBlockers(candidateBlockers, validFrameIndices, rejectReasons) {
  const byId = new Map();
  if (!Array.isArray(candidateBlockers)) {
    rejectReasons.push('Verdict is missing "blockers" array: a verdict without its seven blockers is not a verdict');
  } else {
    for (let i = 0; i < candidateBlockers.length; i++) {
      const b = candidateBlockers[i];
      if (!b || typeof b !== 'object') {
        rejectReasons.push(`Blocker item at index ${i} is not an object`);
        continue;
      }
      const id = typeof b.id === 'string' ? b.id.trim() : '';
      if (!BLOCKERS.some((def) => def.id === id)) {
        rejectReasons.push(`Unknown blocker id ${JSON.stringify(b.id)} at index ${i}`);
        continue;
      }
      if (byId.has(id)) {
        rejectReasons.push(`Duplicate blocker '${id}'`);
        continue;
      }
      byId.set(id, b);
    }
  }

  const normalized = [];
  for (const def of BLOCKERS) {
    const b = byId.get(def.id);
    if (!b) {
      rejectReasons.push(`Missing blocker '${def.id}': every one of the seven must be answered, clear or blocked`);
      normalized.push({ id: def.id, blocked: null, evidence: '', frameIndex: null, evidenceKind: 'missing' });
      continue;
    }
    if (typeof b.blocked !== 'boolean') {
      rejectReasons.push(`Blocker '${def.id}' has non-boolean "blocked": ${JSON.stringify(b.blocked)} (true = blocked, false = clear, nothing else)`);
    }
    const evidence = typeof b.evidence === 'string' ? b.evidence.trim().slice(0, EVIDENCE_MAX_CHARS) : '';
    if (!evidence) {
      rejectReasons.push(`Blocker '${def.id}' is missing its evidence field: a blocker with no evidence is neither clear nor blocked`);
    }
    const frameProblem = frameIndexProblem(b.frameIndex, validFrameIndices);
    if (frameProblem) {
      rejectReasons.push(`Blocker '${def.id}' cites ${frameProblem}`);
    }
    const hasFrame = !frameProblem && typeof b.frameIndex === 'number';
    if (b.blocked === true && def.proof === 'frame' && !hasFrame) {
      rejectReasons.push(`Blocker '${def.id}' is raised without a shown frame. ${VISION_SENTENCE}`);
    }
    normalized.push({
      id: def.id,
      blocked: typeof b.blocked === 'boolean' ? b.blocked : null,
      evidence,
      frameIndex: hasFrame ? b.frameIndex : null,
      evidenceKind: hasFrame ? 'frame' : (evidence ? 'receipt' : 'missing'),
    });
  }
  return normalized;
}

/**
 * The intent result. The harness owns the claim (it came from `--intent`); the model reports only
 * whether the frames support it, with the frames, and which tradeoff it saw spent. With no declared
 * claim there is nothing to judge, and the model's "intent" is ignored rather than trusted.
 *
 * @param {unknown} candidateIntent
 * @param {{ claim?: string, tradeoff?: string }|null} declared
 * @param {Set<number>} validFrameIndices
 * @param {string[]} rejectReasons appended in place
 */
export function normalizeIntent(candidateIntent, declared, validFrameIndices, rejectReasons) {
  const claim = declared && typeof declared.claim === 'string' ? declared.claim.trim() : '';
  const declaredTradeoff = declared && typeof declared.tradeoff === 'string' && declared.tradeoff.trim()
    ? declared.tradeoff.trim()
    : null;
  if (!claim) {
    return { declared: false, claim: null, declaredTradeoff: null, supported: null, evidence: [], tradeoff: null, note: '' };
  }
  const result = { declared: true, claim, declaredTradeoff, supported: null, evidence: [], tradeoff: null, note: '' };
  if (!candidateIntent || typeof candidateIntent !== 'object') {
    rejectReasons.push('Verdict is missing "intent": a claim was declared and the critic did not say whether the frames support it');
    return result;
  }
  if (typeof candidateIntent.supported !== 'boolean') {
    rejectReasons.push(`intent.supported must be a JSON boolean, got ${JSON.stringify(candidateIntent.supported)}: a claim is supported by the frames or it is not`);
  } else {
    result.supported = candidateIntent.supported;
  }
  const evidence = Array.isArray(candidateIntent.evidence) ? candidateIntent.evidence : [];
  const frames = [];
  for (const idx of evidence) {
    const problem = frameIndexProblem(idx, validFrameIndices);
    if (problem) rejectReasons.push(`intent.evidence cites ${problem}`);
    else if (typeof idx === 'number' && !frames.includes(idx)) frames.push(idx);
  }
  if (frames.length === 0) {
    rejectReasons.push(`intent.evidence names no shown frame. ${VISION_SENTENCE}`);
  }
  result.evidence = frames.sort((a, b) => a - b);
  const tradeoff = typeof candidateIntent.tradeoff === 'string' ? candidateIntent.tradeoff.trim().slice(0, EVIDENCE_MAX_CHARS) : '';
  if (!tradeoff) {
    rejectReasons.push('intent.tradeoff is empty: say which tradeoff was spent, or "none observed"');
  }
  result.tradeoff = tradeoff || null;
  result.note = typeof candidateIntent.note === 'string' ? candidateIntent.note.trim().slice(0, EVIDENCE_MAX_CHARS) : '';
  return result;
}

/**
 * The play judgment: five non-empty sentences, plus an optional list of shown frames.
 *
 * @param {unknown} candidateJudgment
 * @param {Set<number>} validFrameIndices
 * @param {string[]} rejectReasons appended in place
 */
export function normalizeJudgment(candidateJudgment, validFrameIndices, rejectReasons) {
  const result = {};
  for (const f of JUDGMENT_FIELDS) result[f.key] = '';
  result.frames = [];
  if (!candidateJudgment || typeof candidateJudgment !== 'object') {
    rejectReasons.push('Verdict is missing "judgment": the play judgment is a part of the verdict, not an optional remark');
    return result;
  }
  for (const f of JUDGMENT_FIELDS) {
    const text = typeof candidateJudgment[f.key] === 'string' ? candidateJudgment[f.key].trim().slice(0, EVIDENCE_MAX_CHARS) : '';
    if (!text) rejectReasons.push(`judgment.${f.key} is empty (${f.prompt})`);
    result[f.key] = text;
  }
  const frames = Array.isArray(candidateJudgment.frames) ? candidateJudgment.frames : [];
  for (const idx of frames) {
    const problem = frameIndexProblem(idx, validFrameIndices);
    if (problem) rejectReasons.push(`judgment.frames cites ${problem}`);
    else if (typeof idx === 'number' && !result.frames.includes(idx)) result.frames.push(idx);
  }
  result.frames.sort((a, b) => a - b);
  return result;
}

/**
 * Validates candidate verdict against the strip manifest.
 *
 * @param {object} candidate Parsed model candidate object
 * @param {object} manifest Manifest schema spaceface.frameStripManifest.v2
 * @param {object} [options] Model/run metadata
 * @param {{ claim?: string, tradeoff?: string }|null} [options.intent] The cycle's declared claim
 *   and tradeoff (from --intent / --tradeoff). Absent means no claim: no intent result is judged.
 * @returns {object} Full spaceface.funCritic.v2 document
 */
export function validateVerdict(candidate, manifest, options = {}) {
  const rejectReasons = [];
  // A verdict may cite only what the critic was SHOWN. The strip holds hundreds of frames; the
  // model is handed a bounded set (scripts/lib/critic/frameSelect.mjs), and an index it was never
  // given is an index it did not look at — the exact shape of a confident hallucination.
  const shown = Array.isArray(options.shownFrames) && options.shownFrames.length > 0
    ? options.shownFrames
    : (Array.isArray(manifest?.frames) ? manifest.frames : []);
  const validFrameIndices = new Set(shown.map((f) => f.index));

  const normalizedAnswers = [];
  const candidateAnswers = candidate?.answers;

  if (!Array.isArray(candidateAnswers)) {
    rejectReasons.push('Verdict is missing "answers" array');
  } else {
    if (candidateAnswers.length !== 9) {
      rejectReasons.push(`Expected exactly 9 answers, but received ${candidateAnswers.length}`);
    }

    const seenQ = new Set();
    for (let i = 0; i < candidateAnswers.length; i++) {
      const a = candidateAnswers[i];
      if (!a || typeof a !== 'object') {
        rejectReasons.push(`Answer item at index ${i} is not an object`);
        continue;
      }

      if (typeof a.q !== 'number' || !Number.isInteger(a.q)) {
        rejectReasons.push(`Answer at index ${i} has non-integer question number 'q': ${JSON.stringify(a.q)}`);
        continue;
      }

      if (a.q < 1 || a.q > 9) {
        rejectReasons.push(`Answer question number 'q' out of range (1-9): ${a.q}`);
      }

      if (seenQ.has(a.q)) {
        rejectReasons.push(`Duplicate answer for question q=${a.q}`);
      }
      seenQ.add(a.q);

      const rawAnswer = String(a.answer || '').trim().toLowerCase();
      if (rawAnswer !== 'yes' && rawAnswer !== 'no') {
        rejectReasons.push(`Answer for q=${a.q} must be exactly 'yes' or 'no', got: ${JSON.stringify(a.answer)}`);
      }

      if (typeof a.frameIndex !== 'number' || !Number.isInteger(a.frameIndex)) {
        rejectReasons.push(`Answer for q=${a.q} missing or non-integer frameIndex: ${JSON.stringify(a.frameIndex)}`);
      } else if (!validFrameIndices.has(a.frameIndex)) {
        rejectReasons.push(`Answer for q=${a.q} references frameIndex ${a.frameIndex}, which is outside the ${validFrameIndices.size} frames the critic was shown`);
      }

      const rubricQ = RUBRIC_QUESTIONS.find((rq) => rq.q === a.q);
      const questionText = rubricQ ? rubricQ.question : (a.question || `Question ${a.q}`);

      normalizedAnswers.push({
        q: a.q,
        question: questionText,
        answer: rawAnswer,
        frameIndex: a.frameIndex,
        note: typeof a.note === 'string' ? a.note.slice(0, 200) : '',
      });
    }

    // Check if any question 1-9 was completely missing
    for (let q = 1; q <= 9; q++) {
      if (!seenQ.has(q)) {
        rejectReasons.push(`Missing answer for question q=${q}`);
      }
    }
    // Sort answers by question number 1..9
    normalizedAnswers.sort((a, b) => a.q - b.q);
  }

  // Validate fundamental
  const fundamental = candidate?.fundamental;
  let normalizedFundamental = {
    rule: '',
    file: '',
    does: '',
    breaksSentence: '',
    frameIndex: null,
  };

  if (!fundamental || typeof fundamental !== 'object') {
    rejectReasons.push('Verdict is missing "fundamental" object');
  } else {
    normalizedFundamental = {
      rule: String(fundamental.rule || ''),
      file: String(fundamental.file || ''),
      does: String(fundamental.does || ''),
      breaksSentence: String(fundamental.breaksSentence || ''),
      frameIndex: fundamental.frameIndex,
    };

    if (!normalizedFundamental.rule) rejectReasons.push('fundamental.rule is empty or missing');
    if (!normalizedFundamental.file) rejectReasons.push('fundamental.file is empty or missing');
    if (!normalizedFundamental.does) rejectReasons.push('fundamental.does is empty or missing');
    if (!normalizedFundamental.breaksSentence) rejectReasons.push('fundamental.breaksSentence is empty or missing');

    if (typeof fundamental.frameIndex !== 'number' || !Number.isInteger(fundamental.frameIndex)) {
      rejectReasons.push(`fundamental missing or non-integer frameIndex: ${JSON.stringify(fundamental.frameIndex)}`);
    } else if (!validFrameIndices.has(fundamental.frameIndex)) {
      rejectReasons.push(`fundamental references frameIndex ${fundamental.frameIndex}, which is outside the ${validFrameIndices.size} frames the critic was shown`);
    }

    const matchedContent = matchesContentPatterns(fundamental);
    if (matchedContent) {
      rejectReasons.push(`fundamental names content (matched ${matchedContent}): critic must propose a rule change, never more stuff`);
    }
  }

  // The three parts of the verdict. Each fails closed; the coverage count is not an input.
  const blockers = normalizeBlockers(candidate?.blockers, validFrameIndices, rejectReasons);
  const intent = normalizeIntent(candidate?.intent, options.intent || null, validFrameIndices, rejectReasons);
  const judgment = normalizeJudgment(candidate?.judgment, validFrameIndices, rejectReasons);

  const coverage = computeCoverage(normalizedAnswers);
  const rejected = rejectReasons.length > 0;
  const verdict = decideVerdict({ blockers, intent, rejected });

  return {
    schema: 'spaceface.funCritic.v2',
    strip: {
      bench: manifest?.bench || 'unknown',
      scenarioId: manifest?.scenarioId || 'unknown',
      seed: manifest?.seed ?? 0,
      arenaId: manifest?.arenaId || 'unknown',
      loadoutId: manifest?.loadoutId || 'unknown',
      framesCount: manifest?.framesCount ?? manifest?.frames?.length ?? 0,
      framesShown: validFrameIndices.size,
      framesShownIndices: [...validFrameIndices].sort((a, b) => a - b),
      // What the pictures actually contained, carried out of the manifest so a verdict can never be
      // read without it: a strip whose median frame drew no hull is a strip of an empty arena.
      hullDrawn: manifest?.hullDrawn ?? null,
      normalSpeed: manifest?.normalSpeed ?? null,
      webglRenderer: manifest?.webglRenderer ?? null,
      frameFormat: manifest?.frameFormat || (manifest?.frames?.[0]?.file?.endsWith('.jpg') ? 'jpeg' : 'png') || 'jpeg',
      contactSheet: manifest?.contactSheet || options.contactSheet || null,
      receiptDir: manifest?.receiptDir || options.receiptDir || '',
      sourceIdentity: manifest?.sourceIdentity || null,
      harnessDigest: manifest?.harnessDigest || null,
      frames: (Array.isArray(manifest?.frames) ? manifest.frames : []).map((f) => ({
        index: f.index,
        file: f.file,
        tick: f.tick,
        simTime: f.simTime,
      })),
      stripDir: manifest?.stripDir || '',
      manifestPath: options.manifestPath || '',
    },
    model: {
      route: options.modelRoute || 'unknown',
      label: options.modelLabel || 'unknown',
      wallMs: options.wallMs ?? 0,
    },
    answers: normalizedAnswers,
    fundamental: normalizedFundamental,
    // Coverage: how much of the checklist the pictures covered. Never the verdict.
    coverage,
    // The verdict's three parts, and the decision made from them alone.
    blockers,
    intent,
    judgment,
    verdict,
    rejected,
    rejectReasons,
    rawResponsePath: options.rawResponsePath || '',
  };
}
