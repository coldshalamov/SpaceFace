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

import { RUBRIC_QUESTIONS, computePassCount, isPass } from './rubric.mjs';

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
 * Validates candidate verdict against the strip manifest.
 *
 * @param {object} candidate Parsed model candidate object
 * @param {object} manifest Manifest schema spaceface.frameStripManifest.v2
 * @param {object} [options] Model/run metadata
 * @returns {object} Full spaceface.funCritic.v1 document
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

  const passCount = computePassCount(normalizedAnswers);
  const pass = isPass(passCount);
  const rejected = rejectReasons.length > 0;

  return {
    schema: 'spaceface.funCritic.v1',
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
    passCount,
    pass,
    rejected,
    rejectReasons,
    rawResponsePath: options.rawResponsePath || '',
  };
}
