import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The worker-local catch-up batch must shed on measured wall work so one heavy
// step cannot compound into a multi-hundred-ms reply (the world goes slow-
// motion instead of freezing). Explicit-step directives stay exact so
// tape/replay/verification runs are never cut.
test('catch-up tick directives shed on work budget; explicit steps run exactly', async () => {
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });

    const bounded = await lane.tick({ tick: 1, steps: 4, workBudgetMs: 0.0001,
      ackJournalEnd: init.journalSequence });
    assert.equal(bounded.stepsRequested, 4);
    assert.equal(bounded.stepsExecuted, 1, 'over-budget batch stops after the first step');
    assert.ok(bounded.completedTick, 'a partial batch still publishes a completed tick');

    const exact = await lane.tick({ tick: 2, steps: 4, ackJournalEnd: bounded.journalEnd });
    assert.equal(exact.stepsRequested, 4);
    assert.equal(exact.stepsExecuted, 4, 'no budget means the batch runs exactly');
  } finally {
    await lane.shutdown?.();
  }
});
