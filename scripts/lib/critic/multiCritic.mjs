// scripts/lib/critic/multiCritic.mjs — Multi-model comparison and agreement summary.
//
// Law from packet:
// "printing a short agreement summary: which questions they agreed on and, separately,
// their two answers to question 10. Never average two critics. Disagreement is recorded
// as disagreement."

import { RUBRIC_QUESTIONS } from './rubric.mjs';

/**
 * Compares answers from multiple critic runs on the same strip.
 *
 * @param {Array<{model: string, result: object}>} runs
 * @returns {object} { summaryText, agreedQuestions, disagreedQuestions, fundamentals }
 */
export function compareCritics(runs) {
  if (!Array.isArray(runs) || runs.length < 2) {
    return {
      summaryText: '(Multi-critic comparison requires at least 2 critic runs)',
      agreedQuestions: [],
      disagreedQuestions: [],
      fundamentals: [],
    };
  }

  const agreedQuestions = [];
  const disagreedQuestions = [];

  for (let q = 1; q <= 9; q++) {
    const qAnswers = runs.map((r) => {
      const ansObj = r.result?.answers?.find((a) => a.q === q);
      return {
        model: r.model,
        answer: ansObj?.answer?.toLowerCase() ?? 'none',
        frameIndex: ansObj?.frameIndex ?? null,
      };
    });

    const firstAns = qAnswers[0].answer;
    const allAgree = qAnswers.every((qa) => qa.answer === firstAns && qa.answer !== 'none');

    if (allAgree) {
      agreedQuestions.push({ q, answer: firstAns, details: qAnswers });
    } else {
      disagreedQuestions.push({ q, details: qAnswers });
    }
  }

  const fundamentals = runs.map((r) => ({
    model: r.model,
    fundamental: r.result?.fundamental || null,
  }));

  // Build formatted summary text
  const lines = [
    '========================================================================',
    '                 CRITIC MULTI-MODEL AGREEMENT SUMMARY                   ',
    '========================================================================',
    '',
    `Models compared: ${runs.map((r) => r.model).join(', ')}`,
    '',
    '── Questions 1-9 Agreement ─────────────────────────────────────────────',
  ];

  for (let q = 1; q <= 9; q++) {
    const rq = RUBRIC_QUESTIONS.find((item) => item.q === q);
    const qText = rq ? rq.question : `Question ${q}`;
    const agree = agreedQuestions.find((a) => a.q === q);
    if (agree) {
      lines.push(`  Q${q}: AGREE [${agree.answer}] — "${qText}"`);
    } else {
      const dis = disagreedQuestions.find((d) => d.q === q);
      const answersStr = dis ? dis.details.map((d) => `${d.model}=${d.answer} (frame ${d.frameIndex})`).join(', ') : 'no data';
      lines.push(`  Q${q}: DISAGREE [${answersStr}] — "${qText}"`);
    }
  }

  lines.push('');
  lines.push(`Total Agreement: ${agreedQuestions.length}/9 questions agreed.`);
  lines.push('');
  lines.push('── Question 10: The Fundamental (Never Averaged) ──────────────────────');

  for (const f of fundamentals) {
    const fund = f.fundamental;
    lines.push(`[Model: ${f.model}]`);
    if (!fund) {
      lines.push('  (No fundamental reported)');
    } else {
      lines.push(`  Rule:           ${fund.rule || 'unspecified'}`);
      lines.push(`  File:           ${fund.file || 'unspecified'}`);
      lines.push(`  What it does:   ${fund.does || 'unspecified'}`);
      lines.push(`  Breaks sentence: "${fund.breaksSentence || 'unspecified'}"`);
      lines.push(`  Frame index:    ${fund.frameIndex ?? 'none'}`);
    }
    lines.push('');
  }
  lines.push('========================================================================');

  const summaryText = lines.join('\n');
  return {
    summaryText,
    agreedQuestions,
    disagreedQuestions,
    fundamentals,
  };
}
