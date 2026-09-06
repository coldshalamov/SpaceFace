// scripts/lib/critic/multiCritic.mjs — Multi-model comparison and agreement summary.
//
// Law from packet:
// "printing a short agreement summary: which questions they agreed on and, separately,
// their two answers to question 10. Never average two critics. Disagreement is recorded
// as disagreement."
// The three-part verdict (PQ-173.04) is compared the same way: each model's blockers and
// intent result are listed side by side, never merged.

import { RUBRIC_QUESTIONS, BLOCKERS } from './rubric.mjs';

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

  // Verdict parts, per model. A blocker one critic raised and another cleared is a disagreement
  // to read, not a coin to flip.
  const verdicts = runs.map((r) => ({
    model: r.model,
    pass: r.result?.verdict?.pass ?? null,
    raised: (r.result?.blockers || []).filter((b) => b && b.blocked === true).map((b) => `${b.id} (${b.frameIndex != null ? `frame ${b.frameIndex}` : 'receipt'})`),
    intent: r.result?.intent || null,
  }));
  const blockerDisagreements = BLOCKERS
    .map((def) => ({
      id: def.id,
      states: runs.map((r) => ({
        model: r.model,
        blocked: (r.result?.blockers || []).find((b) => b && b.id === def.id)?.blocked ?? null,
      })),
    }))
    .filter((row) => new Set(row.states.map((s) => s.blocked)).size > 1);

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
  lines.push(`Total Agreement: ${agreedQuestions.length}/9 questions agreed (coverage, never the verdict).`);
  lines.push('');
  lines.push('── The Verdict: Blockers and Intent (Never Averaged) ──────────────────');
  for (const v of verdicts) {
    const passWord = v.pass === true ? 'PASS' : (v.pass === false ? 'FAIL' : 'no verdict recorded');
    lines.push(`[Model: ${v.model}] ${passWord}; blockers raised: ${v.raised.length ? v.raised.join(', ') : 'none'}`);
    if (v.intent && v.intent.declared) {
      const support = v.intent.supported === true ? 'SUPPORTED' : (v.intent.supported === false ? 'NOT SUPPORTED' : 'unanswered');
      lines.push(`  intent: ${support} — tradeoff spent: ${v.intent.tradeoff || 'unspecified'}`);
    }
  }
  if (blockerDisagreements.length > 0) {
    lines.push(`Blockers the models disagree on: ${blockerDisagreements
      .map((d) => `${d.id} [${d.states.map((s) => `${s.model}=${s.blocked === true ? 'BLOCKED' : (s.blocked === false ? 'clear' : 'none')}`).join(', ')}]`)
      .join('; ')}`);
  }
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
    verdicts,
    blockerDisagreements,
  };
}
