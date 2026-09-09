// scripts/lib/critic/rubric.mjs — The critic's rubric: the ONE source.
//
// Vision authority: design/program/FUN_CONVERGENCE_LOOP.md section 3.3, whose body is GENERATED
// from this file (node scripts/generate-critic-rubric-doc.mjs) and checked against it by
// test/fun-critic.test.mjs. Edit here, never in the document.
//
// "A vision-capable model that did not make the change reads the frame strips and the metrics
// and answers ten yes/no questions, each with the frame index that proves the answer.
// Prose without a frame is not a verdict."
//
// "The count of "yes" answers is a coverage score, never the verdict." (audit 2026-09-05, PQ-173.04)
// The verdict has three independent parts: BLOCKERS (any one fails the bench regardless of the
// count), the INTENT RESULT (did the frames show what the cycle claimed, and which tradeoff was
// spent), and the PLAY JUDGMENT (what the player can now perceive, decide and execute; where
// friction remains; what would falsify the candidate). The ten questions stay as coverage.

export const VISION_SENTENCE = 'Prose without a frame is not a verdict.';
export const COVERAGE_SENTENCE = 'The count of "yes" answers is a coverage score, never the verdict.';
export const BLOCKER_SENTENCE = 'Any one blocker fails the bench regardless of the count.';

export const RUBRIC_QUESTIONS = Object.freeze([
  Object.freeze({
    q: 1,
    question: 'Can I tell what the player did from the frames alone?',
    goodAnswer: 'yes',
  }),
  Object.freeze({
    q: 2,
    question: 'Did the world answer within a third of a second (motion, light, or a visible receipt)?',
    goodAnswer: 'yes',
  }),
  Object.freeze({
    q: 3,
    question: 'Did something the player did not directly touch change because of it?',
    goodAnswer: 'yes',
  }),
  Object.freeze({
    q: 4,
    question: "Would the vision's sentence for this verb be true here? (quote the sentence)",
    goodAnswer: 'yes',
  }),
  Object.freeze({
    q: 5,
    question: 'Is the ship a controllable mass (turns inside the screen, stops when braked, keeps earned speed)?',
    goodAnswer: 'yes',
  }),
  Object.freeze({
    q: 6,
    question: 'Are the light ships ammunition here, rather than only targets?',
    goodAnswer: 'yes',
  }),
  Object.freeze({
    q: 7,
    question: 'Is anything on screen a glowing sphere standing in for a designed event?',
    goodAnswer: 'no', // inverted: "no" is the good answer
  }),
  Object.freeze({
    q: 8,
    question: 'Did anyone flee, choose, or arrive because of the violence?',
    goodAnswer: 'yes',
  }),
  Object.freeze({
    q: 9,
    question: 'Would a stranger tell a "so then" story about these twelve seconds?',
    goodAnswer: 'yes',
  }),
  Object.freeze({
    q: 10,
    question: 'What is the ONE fundamental that, if fixed, would flip the most "no" answers? Name the rule, the file, what it does, and the vision sentence it breaks.',
    goodAnswer: null, // the fundamental
    docNote: 'the format of `FEEL_CONTRACT.md` §A',
  }),
]);

export const QUESTION_7_INVERTED = 7;

/** Questions 1–9 are the coverage score; question 10 is the fundamental. */
export const COVERAGE_QUESTION_COUNT = 9;

/**
 * The stand-in blocker binds to the rubric question about the glowing sphere BY ITS TEXT, so the
 * number it cites in the generated document is always the number that question actually has.
 * (The hand-written document said "question 5"; the glowing-sphere question is 7. Rubric q5 is the
 * controllable mass.)
 */
export const STAND_IN_QUESTION = RUBRIC_QUESTIONS.find((rq) => /glowing sphere/i.test(rq.question)).q;

/**
 * The seven blockers. Each is answered separately by the critic with a boolean whose polarity is
 * always the same — `blocked: true` means blocked — plus an evidence field. `proof` says what the
 * evidence must be when the blocker is raised: a frame the critic was shown ('frame'), or a frame
 * OR a receipt in the run facts ('frame-or-receipt'), because a save or a stall is not always a
 * picture. `ownerWords` is the only form that may reach the owner's page (the engineering ids
 * contain words the jargon lint refuses, and rightly).
 */
export const BLOCKERS = Object.freeze([
  Object.freeze({
    id: 'visual_stand_in',
    label: 'a bad visual stand-in',
    ownerWords: 'a glowing blob or soft disc standing in for something that should have been designed',
    proof: 'frame',
    question: STAND_IN_QUESTION,
    definition: 'A camera-facing glow, soft disc, sphere or particle cloud is doing the job of a designed object or event. Tiny background stars at sky depth are the only exception; anything the ship can fly past is not a star.',
  }),
  Object.freeze({
    id: 'unreachable_route',
    label: 'an unreachable default route',
    ownerWords: 'you could not get here in the normal game without a special switch',
    proof: 'frame-or-receipt',
    question: null,
    definition: 'What the strip shows cannot be reached on the default route without a flag, a URL parameter or a debug key (the run facts name the route the strip was photographed on).',
  }),
  Object.freeze({
    id: 'wrong_control_label',
    label: 'a wrong control label',
    ownerWords: 'a label on screen that names the wrong key or the wrong action',
    proof: 'frame',
    question: null,
    definition: 'A label visible in the frames names a key or an action that the pictures or the input tape show is not what happens.',
  }),
  Object.freeze({
    id: 'value_lost_or_duplicated',
    label: 'lost or duplicated value',
    ownerWords: 'something you own vanished or doubled on its own',
    proof: 'frame-or-receipt',
    question: null,
    definition: 'Credits, cargo, loot, a claim or a ship appears twice or disappears without a cause the frames show.',
  }),
  Object.freeze({
    id: 'unreadable_decisive_threat',
    label: 'an unreadable decisive threat',
    ownerWords: 'the thing that decided the fight could not be read on screen before it landed',
    proof: 'frame',
    question: null,
    definition: 'The threat that decided the outcome (the shot, the ram, the wall, the wave) was not readable at the shipping camera before it landed.',
  }),
  Object.freeze({
    id: 'broken_save',
    label: 'a broken save',
    ownerWords: 'saving and coming back changed what had happened',
    proof: 'frame-or-receipt',
    question: null,
    definition: 'A save-and-reload inside the run changed a position, an owner, a count or an outcome. If the run had no save boundary, the blocker is clear and the evidence says so.',
  }),
  Object.freeze({
    id: 'performance_regression',
    label: 'a performance regression',
    ownerWords: 'the game got noticeably slower or stuttered',
    proof: 'frame-or-receipt',
    question: null,
    definition: 'The strip stutters, repeats frames, or a stretch of it ran below the normal-speed floor (the run-health facts say where and how far).',
  }),
]);

export const BLOCKER_IDS = Object.freeze(BLOCKERS.map((b) => b.id));

/** The intent result: what the cycle claimed, whether the frames support it, what was spent. */
export const INTENT_FIELDS = Object.freeze([
  Object.freeze({ key: 'supported', kind: 'boolean', prompt: 'do the frames show the claimed improvement (true) or not (false); never a maybe' }),
  Object.freeze({ key: 'evidence', kind: 'frames', prompt: 'the frame indices that show the claim holding, or the ones that show it failing' }),
  Object.freeze({ key: 'tradeoff', kind: 'text', prompt: 'which tradeoff was actually spent in what you saw, in one sentence ("none observed" is an answer)' }),
]);

/** The play judgment: five sentences for someone who does not read code. */
export const JUDGMENT_FIELDS = Object.freeze([
  Object.freeze({ key: 'perceive', prompt: 'what the player can now perceive that they could not before' }),
  Object.freeze({ key: 'decide', prompt: 'what the player can now decide that they could not before' }),
  Object.freeze({ key: 'execute', prompt: 'what the player can now execute that they could not before' }),
  Object.freeze({ key: 'friction', prompt: 'where friction remains' }),
  Object.freeze({ key: 'falsifier', prompt: 'what observation would falsify the candidate' }),
]);

/**
 * Coverage: how many of questions 1–9 got their good answer. Question 7 is inverted, so "no"
 * counts there. This number is never the verdict.
 *
 * @param {Array<{q: number, answer: string}>} answers
 * @returns {{ good: number, of: number }}
 */
export function computeCoverage(answers) {
  const answerMap = new Map();
  for (const a of Array.isArray(answers) ? answers : []) {
    if (a && typeof a.q === 'number') {
      answerMap.set(a.q, String(a.answer || '').trim().toLowerCase());
    }
  }
  let good = 0;
  for (const rq of RUBRIC_QUESTIONS) {
    if (rq.goodAnswer == null) continue; // question 10 is the fundamental, not coverage
    if (answerMap.get(rq.q) === rq.goodAnswer) good++;
  }
  return { good, of: COVERAGE_QUESTION_COUNT };
}

/**
 * The verdict, decided from the three parts and nothing else. The coverage score is not an input.
 *
 * @param {object} parts
 * @param {Array<{id: string, blocked: boolean}>} parts.blockers
 * @param {{ declared: boolean, supported: boolean|null }} parts.intent
 * @param {boolean} parts.rejected
 * @returns {{ pass: boolean, blocked: boolean, blockerIds: string[], reason: string }}
 */
export function decideVerdict({ blockers = [], intent = { declared: false, supported: null }, rejected = false } = {}) {
  const blockerIds = (Array.isArray(blockers) ? blockers : [])
    .filter((b) => b && b.blocked === true)
    .map((b) => b.id);
  const blocked = blockerIds.length > 0;
  if (rejected) {
    return { pass: false, blocked, blockerIds, reason: 'the verdict was rejected; nothing in it is evidence' };
  }
  if (blocked) {
    return {
      pass: false,
      blocked,
      blockerIds,
      reason: `blocked by ${blockerIds.join(', ')} — ${BLOCKER_SENTENCE.charAt(0).toLowerCase()}${BLOCKER_SENTENCE.slice(1)}`,
    };
  }
  if (intent && intent.declared && intent.supported !== true) {
    return { pass: false, blocked, blockerIds, reason: 'no blocker, but the frames do not support what the cycle claimed' };
  }
  if (intent && intent.declared) {
    return { pass: true, blocked, blockerIds, reason: 'no blocker, and the frames support what the cycle claimed' };
  }
  return { pass: true, blocked, blockerIds, reason: 'no blocker; no claim was declared for this strip, so there is no intent to judge' };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The document block. FUN_CONVERGENCE_LOOP.md §3.3 holds exactly this text between its markers.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const RUBRIC_DOC_BEGIN = '<!-- critic-rubric:begin (generated from scripts/lib/critic/rubric.mjs — do not edit by hand) -->';
export const RUBRIC_DOC_END = '<!-- critic-rubric:end -->';

/**
 * Wrap one paragraph at `width` columns. `prefix` opens the first line (a list bullet, a number);
 * continuation lines are indented to the prefix's width so the item reads as one block.
 */
export function wrapParagraph(text, width = 100, prefix = '') {
  const indent = ' '.repeat(prefix.length);
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const lead = lines.length === 0 ? prefix.length : indent.length;
    if (line && lead + candidate.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? `${prefix}${l}` : `${indent}${l}`)).join('\n');
}

/**
 * The §3.3 body, generated. Deterministic: same rubric in, same text out.
 * @returns {string}
 */
export function renderRubricDoc() {
  const out = [];
  out.push(wrapParagraph(
    'A vision-capable model that did not make the change reads the frame strips and the metrics and '
    + `answers ten yes/no questions, each with the frame index that proves the answer. ${VISION_SENTENCE}`,
  ));
  out.push('');
  for (const rq of RUBRIC_QUESTIONS) {
    const text = rq.docNote ? `${rq.question.replace(/\.$/, '')} — ${rq.docNote}.` : rq.question;
    const inverted = rq.goodAnswer === 'no' ? ' (the good answer is "no")' : '';
    out.push(wrapParagraph(`${text}${inverted}`, 100, `${rq.q}. `));
  }
  out.push('');
  out.push(wrapParagraph(
    `${COVERAGE_SENTENCE} The verdict has three independent parts (audit 2026-09-05, \`PQ-173.04\`), `
    + 'and the tool prints each of them:',
  ));
  out.push('');
  out.push(wrapParagraph(
    '**Blockers** — seven, each answered separately with a boolean whose polarity is always the same '
    + '(`blocked: true` means blocked) and an evidence field: a frame the critic was shown, or a '
    + `receipt in the run facts where the definition allows one. ${BLOCKER_SENTENCE}`,
    100, '- ',
  ));
  for (const b of BLOCKERS) {
    const q = b.question != null ? ` (question ${b.question})` : '';
    const proof = b.proof === 'frame' ? 'a frame is required when raised' : 'a frame or a receipt when raised';
    out.push(wrapParagraph(`\`${b.id}\` — ${b.label}${q}; ${proof}. ${b.definition}`, 100, '  - '));
  }
  out.push(wrapParagraph(
    '**Intent result** — the one-line hypothesis the cycle declared (§3.4, handed to the tool with '
    + '`--intent`), whether the frames support it (a boolean, with the frames that show it holding or '
    + 'failing), and which tradeoff was actually spent against the one the cycle declared before the run '
    + '(§3.6, `--tradeoff`). A strip graded with no declared claim records no intent result; the '
    + 'critic never invents one.',
    100, '- ',
  ));
  out.push(wrapParagraph(
    '**Play judgment** — '
    + JUDGMENT_FIELDS.map((f) => f.prompt).join('; ')
    + '. Written for someone who does not read code. It is not a sum of adjectives and not an event counter.',
    100, '- ',
  ));
  out.push('');
  out.push(wrapParagraph(
    'A verdict passes only with no blocker and, when a claim was declared, with the frames supporting '
    + 'it; a verdict with one blocker fails however many good answers it counted. The owner report '
    + 'renders the three parts in plain words. The critic\'s answer to question 10 is the next cycle\'s '
    + 'hypothesis. The critic never proposes content.',
  ));
  out.push('');
  out.push(wrapParagraph(
    'This block is generated from `scripts/lib/critic/rubric.mjs` by `node '
    + 'scripts/generate-critic-rubric-doc.mjs` and checked against it by `test/fun-critic.test.mjs`; '
    + 'change the rubric, not this text.',
  ));
  return out.join('\n');
}

/**
 * Replace the generated block inside a document, or report that the markers are missing.
 * @param {string} docText
 * @returns {{ ok: boolean, text: string, reason?: string, current?: string }}
 */
export function spliceRubricDoc(docText) {
  const text = String(docText ?? '');
  const begin = text.indexOf(RUBRIC_DOC_BEGIN);
  const end = text.indexOf(RUBRIC_DOC_END);
  if (begin === -1 || end === -1 || end < begin) {
    return { ok: false, text, reason: 'rubric markers missing or out of order' };
  }
  const beginLineEnd = begin + RUBRIC_DOC_BEGIN.length;
  const current = text.slice(beginLineEnd, end).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  const generated = renderRubricDoc();
  const next = `${text.slice(0, beginLineEnd)}\n${generated}\n${text.slice(end)}`;
  return { ok: true, text: next, current, generated, changed: current !== generated };
}
