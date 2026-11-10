/**
 * Primary KPI: quiet preStep refreshVolatileEntityIndex cost.
 * Before = rebuild aiShips/weaponShips every tick (prior).
 * After  = rebuild on an 8-tick cadence (this package); append/remove stay authoritative.
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const PERIOD = 8;
const SHIPS = 120;
const TICKS = 24000;

function makeShips(n) {
  const ships = [];
  for (let i = 0; i < n; i++) {
    ships.push({
      alive: true,
      type: 'ship',
      id: i + 1,
      data: {
        ai: (i % 3) ? { combatant: false } : null,
        weapons: (i % 4) ? [{ id: 'gun' }] : [],
      },
    });
  }
  return ships;
}

function refreshAlways(index) {
  index.aiShips.length = 0;
  index.weaponShips.length = 0;
  const ships = index.ships;
  for (let i = 0; i < ships.length; i++) {
    const e = ships[i];
    if (!e || !e.alive || e.type !== 'ship') continue;
    if (e.data && e.data.ai) index.aiShips.push(e);
    if (e.data && e.data.weapons && e.data.weapons.length) index.weaponShips.push(e);
  }
  return true;
}

function refreshCadence(index, tick) {
  if (index._volatileReady === true) {
    const t = tick | 0;
    if (((t % PERIOD) + PERIOD) % PERIOD !== 0) return false;
  }
  refreshAlways(index);
  index._volatileReady = true;
  return true;
}

function run(mode) {
  const index = {
    __spacefaceEntityIndexV1: true,
    ships: makeShips(SHIPS),
    aiShips: [],
    weaponShips: [],
    _volatileReady: false,
  };
  let refreshes = 0;
  // warm
  for (let t = 1; t <= 64; t++) {
    if (mode === 'before') refreshAlways(index);
    else if (refreshCadence(index, t)) refreshes++;
  }
  refreshes = 0;
  const t0 = performance.now();
  for (let t = 1; t <= TICKS; t++) {
    if (mode === 'before') {
      refreshAlways(index);
      refreshes++;
    } else if (refreshCadence(index, t)) {
      refreshes++;
    }
  }
  const ms = performance.now() - t0;
  return {
    ms: +ms.toFixed(3),
    refreshes,
    ai: index.aiShips.length,
    weapons: index.weaponShips.length,
  };
}

// Correctness: after a mid-life attach, cadence catch-up admits the ship within PERIOD ticks.
function oracle() {
  const index = {
    __spacefaceEntityIndexV1: true,
    ships: makeShips(20),
    aiShips: [],
    weaponShips: [],
    _volatileReady: false,
  };
  refreshCadence(index, 0);
  const target = index.ships[0];
  target.data.ai = null;
  // Force a rebuild so target is absent, then attach mid-life.
  index._volatileReady = false;
  refreshCadence(index, 0);
  const beforeAttach = index.aiShips.includes(target);
  target.data.ai = { combatant: true };
  let admittedAt = -1;
  for (let t = 1; t <= PERIOD * 2; t++) {
    refreshCadence(index, t);
    if (index.aiShips.includes(target)) {
      admittedAt = t;
      break;
    }
  }
  return {
    absentBeforeAttach: beforeAttach === false,
    admittedWithinPeriod: admittedAt > 0 && admittedAt <= PERIOD,
    admittedAt,
    period: PERIOD,
  };
}

const before = run('before');
const after = run('after');
const out = {
  label: 'volatile-index-cadence',
  ships: SHIPS,
  ticks: TICKS,
  period: PERIOD,
  before,
  after,
  speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
  refreshRatio: +(before.refreshes / Math.max(after.refreshes, 1)).toFixed(3),
  oracle: oracle(),
  note: 'Portable CPU. Soft-GPU fps not claimed. Before=every-tick volatile rebuild; After=8-tick cadence (append/remove authoritative).',
};
writeFileSync(
  new URL('./volatile-index-cadence-microbench.json', import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
