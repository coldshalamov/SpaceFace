// Rank confirmed product findings. Canaries and closed negative controls are not defects.
// Never invent a row to fill a quota.

const IMPACT = Object.freeze({
  'double-payment': 100,
  'save-discontinuity': 95,
  'determinism-drift': 92,
  'unresponsive-commands': 90,
  'stalled-loading': 88,
  'false-success': 85,
  'stuck-missions': 80,
  'impossible-docking': 80,
  'unexpected-menu-fallback': 75,
  'wrong-ship-controls': 70,
  'missing-essential-model': 60,
});

export function triageSweep(sweep) {
  const confirmed = (sweep && sweep.confirmed || [])
    .filter((row) => row.origin !== 'canary')
    .map((row) => ({
      ...row,
      impact: IMPACT[row.id] || 50,
    }))
    .sort((a, b) => b.impact - a.impact || String(a.journeyId).localeCompare(String(b.journeyId)) || (a.seed - b.seed));
  const top = [];
  const seen = new Set();
  for (const row of confirmed) {
    const key = `${row.id}|${row.journeyId}|${row.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    top.push(row);
    if (top.length === 10) break;
  }
  return {
    schema: 'spaceface.strangerTriage.v1',
    confirmedCount: confirmed.length,
    top,
    quotaInvented: false,
    note: top.length < 10
      ? `Confirmed product defects in this sweep: ${top.length}. No extra defects were invented.`
      : 'Top 10 confirmed product defects by impact.',
  };
}
