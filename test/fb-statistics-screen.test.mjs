// FB-102 + FB-103 — career counters already live in the ledger. The statistics
// screen reads them. Seed 4242 is the smuggled figure.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { statisticsModel } from '../src/core/statistics.js';
import { renderStatistics, statisticsScreen } from '../src/ui/screens/statistics.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const SEED = 4242;

test('FB-103 the statistics model prints every supplied counter and does not invent a law', () => {
  const model = statisticsModel({
    career: {
      distanceFlownWu: 1200,
      biggestThrowSpeed: 88,
      shipsLost: 2,
      killsByWeapon: { railgun: 4 },
      timeBySector: { helios_prime: 30 },
    },
    playerStats: {
      kills: 9,
      tradesCount: 3,
      lifetimeProfit: 500,
      biggestSingleProfit: 200,
      smuggledValue: SEED,
      totalPassiveEarnedLifetime: 70,
    },
  });
  const text = model.groups.flatMap((group) => [
    ...(group.rows || []).map((row) => row.join(' ')),
    group.note || '',
  ]).join('\n');
  assert.match(text, /Distance flown 1,200 wu/);
  assert.match(text, /Helios Prime time 30 s/);
  assert.match(text, /Biggest throw 88 wu\/s/);
  assert.match(text, /Railgun kills 4/);
  assert.match(text, /Ships lost 2/);
  assert.match(text, /Smuggled 4,242 cr/);
  assert.match(text, /Passive earned 70 cr/);
  assert.match(text, /No heat, no fines, not wanted/);
  assert.equal(text.includes('helios_prime'), false);

  const previous = globalThis.document;
  globalThis.document = fakeDom();
  try {
    const node = renderStatistics(model);
    assert.match(textLines(node).join('\n'), /4,242 cr/);
  } finally {
    globalThis.document = previous;
  }
});

test('FB-103 the screen reads and the pause reference group opens it', () => {
  const screen = readFileSync(new URL('../src/ui/screens/statistics.js', import.meta.url), 'utf8');
  assert.match(screen, /careerStats\(/);
  assert.equal(screen.includes('.stats ='), false);
  const pause = readFileSync(new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8');
  assert.match(pause, /pushScreen', 'statistics'/);
  assert.match(pause, /group: 'Reference'/);
  assert.equal(statisticsScreen.id, 'statistics');
});
