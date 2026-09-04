// scripts/lib/critic/rubric.mjs — The ten-question critic rubric.
//
// Vision authority: design/program/FUN_CONVERGENCE_LOOP.md section 3.3.
// "A vision-capable model that did not make the change reads the frame strips and the metrics
// and answers ten yes/no questions, each with the frame index that proves the answer.
// Prose without a frame is not a verdict."

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
  }),
]);

export const QUESTION_7_INVERTED = 7;
export const PASS_THRESHOLD = 7;

/**
 * Computes how many answers (1-9) match their goodAnswer.
 * Note: Question 7 is inverted, so "no" contributes +1 to passCount.
 *
 * @param {Array<{q: number, answer: string}>} answers
 * @returns {number}
 */
export function computePassCount(answers) {
  if (!Array.isArray(answers)) return 0;
  const answerMap = new Map();
  for (const a of answers) {
    if (a && typeof a.q === 'number') {
      answerMap.set(a.q, String(a.answer || '').trim().toLowerCase());
    }
  }

  let count = 0;
  for (const rq of RUBRIC_QUESTIONS) {
    if (rq.goodAnswer == null) continue; // Skip question 10
    const given = answerMap.get(rq.q);
    if (given === rq.goodAnswer) {
      count++;
    }
  }
  return count;
}

/**
 * Seven or more matching answers is a pass.
 *
 * @param {number} passCount
 * @returns {boolean}
 */
export function isPass(passCount) {
  return passCount >= PASS_THRESHOLD;
}
