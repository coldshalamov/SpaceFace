// FB-102 / FB-103 — the statistics read model. Plain data in, plain rows out.
// This module does not subscribe, emit, or write a counter.

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function wordsFromId(id) {
  return String(id || '')
    .replace(/^(wpn_|weapon_|cmdty_|sector_|ship_)/, '')
    .split(/[_:-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'Unknown';
}

export function formatStat(value, unit) {
  const n = num(value);
  const text = Math.round(n).toLocaleString('en-US');
  return unit ? text + ' ' + unit : text;
}

function formatDuration(seconds) {
  const n = Math.max(0, Math.round(num(seconds)));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return h + ' h ' + m + ' m';
  if (m > 0 && s > 0) return m + ' m ' + s + ' s';
  if (m > 0) return m + ' m';
  return s + ' s';
}

function pairs(obj) {
  const rows = [];
  const bag = obj && typeof obj === 'object' ? obj : {};
  for (const key of Object.keys(bag).sort()) {
    rows.push([wordsFromId(key), formatStat(bag[key]), bag[key]]);
  }
  return rows;
}

/**
 * Groups the counters a statistics screen is allowed to read.
 * `career` is careerStats(). `playerStats` is state.player.stats.
 * Law stays a sentence unless a real field is present.
 */
export function statisticsModel({ career = {}, playerStats = {} } = {}) {
  const stats = playerStats && typeof playerStats === 'object' ? playerStats : {};
  const flight = [
    ['Distance flown', formatStat(career.distanceFlownWu, 'wu')],
    ...pairs(career.timeBySector).map(([name, , raw]) => [name + ' time', formatDuration(raw)]),
  ];
  const fight = [
    ['Kills', formatStat(stats.kills != null ? stats.kills : career.kills)],
    ...pairs(career.killsByWeapon).map(([name, value]) => [name + ' kills', value]),
    ['Ships lost', formatStat(career.shipsLost)],
  ];
  const trade = [
    ['Trades', formatStat(stats.tradesCount)],
    ['Lifetime profit', formatStat(stats.lifetimeProfit, 'cr')],
    ['Biggest profit', formatStat(stats.biggestSingleProfit, 'cr')],
    ['Smuggled', formatStat(stats.smuggledValue, 'cr')],
    ['Passive earned', formatStat(stats.totalPassiveEarnedLifetime, 'cr')],
  ];
  const law = [];
  if (stats.wantedTier != null) law.push(['Wanted', String(stats.wantedTier)]);
  if (stats.heat != null) law.push(['Heat', formatStat(stats.heat)]);
  if (stats.fines != null) law.push(['Fines', formatStat(stats.fines, 'cr')]);
  const lawGroup = law.length
    ? { id: 'law', label: 'Law', rows: law }
    : { id: 'law', label: 'Law', rows: [], note: 'No heat, no fines, not wanted.' };
  return {
    groups: [
      { id: 'flight', label: 'Flight', rows: flight },
      { id: 'line', label: 'Line', rows: [['Biggest throw', formatStat(career.biggestThrowSpeed, 'wu/s')]] },
      { id: 'fight', label: 'Fight', rows: fight },
      { id: 'trade', label: 'Trade', rows: trade },
      lawGroup,
    ],
  };
}
