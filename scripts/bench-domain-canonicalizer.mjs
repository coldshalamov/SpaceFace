import { canonicalSignatureAgainst } from './lib/domainSignatureStream.mjs';

const OPAQUE = '@@opaque';
const CYCLE = '@@cycle';

// Callable reference for the pre-scratch implementation. The benchmark keeps
// this beside the candidate so a source change cannot silently turn the
// comparison into two copies of the optimized path.
function legacyWrite(value, parts, seen) {
  if (value === null) { parts.push('null'); return; }
  const t = typeof value;
  if (t === 'number') {
    parts.push('n:', Number.isNaN(value) ? 'NaN'
      : Object.is(value, -0) ? '-0'
        : Number.isFinite(value) ? String(value)
          : String(value));
    return;
  }
  if (t === 'string') { parts.push('s:', JSON.stringify(value)); return; }
  if (t === 'boolean') { parts.push('b:', String(value)); return; }
  if (t === 'bigint') { parts.push('g:', String(value)); return; }
  if (t !== 'object') { parts.push(OPAQUE); return; }
  if (seen.has(value)) { parts.push(CYCLE); return; }
  if (Array.isArray(value)) {
    seen.add(value);
    parts.push('a:[');
    for (let i = 0; i < value.length; i++) {
      if (i) parts.push(',');
      legacyWrite(value[i], parts, seen);
    }
    parts.push(']');
    seen.delete(value);
    return;
  }
  if (value instanceof Map) {
    seen.add(value);
    const entries = [];
    for (const [key, entryValue] of value) {
      const keyParts = [];
      legacyWrite(key, keyParts, seen);
      entries.push([keyParts.join(''), entryValue]);
    }
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    parts.push('m:{');
    for (let i = 0; i < entries.length; i++) {
      if (i) parts.push(',');
      parts.push(entries[i][0], '=>');
      legacyWrite(entries[i][1], parts, seen);
    }
    parts.push('}');
    seen.delete(value);
    return;
  }
  if (value instanceof Set) {
    seen.add(value);
    const sigs = [];
    for (const item of value) {
      const itemParts = [];
      legacyWrite(item, itemParts, seen);
      sigs.push(itemParts.join(''));
    }
    sigs.sort();
    parts.push('e:{', sigs.join(','), '}');
    seen.delete(value);
    return;
  }
  if (value instanceof Date) { parts.push('d:', String(value.getTime())); return; }
  if (value instanceof RegExp) { parts.push('r:', value.source, '/', value.flags); return; }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      parts.push('y:DataView:[', String(value.byteLength), ']');
      return;
    }
    parts.push('y:', value.constructor.name, ':[');
    for (let i = 0; i < value.length; i++) {
      if (i) parts.push(',');
      legacyWrite(value[i], parts, seen);
    }
    parts.push(']');
    return;
  }
  seen.add(value);
  const keys = Object.keys(value).sort();
  parts.push('o:{');
  for (let i = 0; i < keys.length; i++) {
    if (i) parts.push(',');
    parts.push(JSON.stringify(keys[i]), '=');
    let field;
    try { field = value[keys[i]]; } catch (_) { field = undefined; }
    legacyWrite(field, parts, seen);
  }
  parts.push('}');
  seen.delete(value);
}

function legacyCanonical(value) {
  const parts = [];
  legacyWrite(value, parts, new Set());
  return parts.join('');
}

function makeMarket(rowCount = 2500) {
  const market = {
    stationId: 'station_ashcache',
    faction: 'frontier',
    cycle: 284,
    updatedAt: 184521.5,
    rows: {},
    history: [],
  };
  for (let i = 0; i < rowCount; i++) {
    const id = `commodity_${String(i).padStart(3, '0')}`;
    market.rows[id] = {
      id,
      category: i % 4 === 0 ? 'ore' : i % 4 === 1 ? 'fuel' : i % 4 === 2 ? 'food' : 'parts',
      price: 12.5 + (i * 17) % 911,
      stock: (i * 97) % 4000,
      capacity: 4200 + (i % 7) * 250,
      demand: ((i * 13) % 100) / 100,
      trend: i % 3 - 1,
      route: { source: `s${i % 11}`, destination: `s${(i + 3) % 11}`, hops: [i % 5, (i + 2) % 5] },
    };
  }
  for (let tick = 0; tick < 32; tick++) {
    market.history.push({ tick, prices: [tick * 1.5, tick * 2.5, tick * 3.5], volume: tick * 19 });
  }
  return market;
}

function makeNpcJobs(count = 44) {
  const byId = {};
  for (let i = 0; i < count; i++) {
    const jobId = `job-${String(i).padStart(3, '0')}`;
    byId[jobId] = {
      id: jobId,
      kind: i % 3 === 0 ? 'escort' : i % 3 === 1 ? 'freight' : 'patrol',
      status: i % 5 === 0 ? 'active' : 'queued',
      actorId: `ship-${i % 18}`,
      source: { sector: `sector-${i % 9}`, x: i * 17.25, z: -i * 9.5 },
      destination: { sector: `sector-${(i + 2) % 9}`, x: i * -11.75, z: i * 4.25 },
      route: Array.from({ length: 5 }, (_, hop) => ({ sector: `sector-${(i + hop) % 9}`, eta: i + hop * 0.25 })),
      cargo: { ore: i * 3, fuel: i % 7, parts: (i * 11) % 23 },
      telemetry: { lastTick: i * 12, retries: i % 4, threat: (i % 10) / 10 },
    };
  }
  return { byId, nextId: count + 100, active: count - 9 };
}

function makeCombatEntities(count = 14) {
  const entities = {};
  for (let i = 0; i < count; i++) {
    const id = `entity-${i}`;
    entities[id] = {
      id,
      role: i === 0 ? 'player' : i % 2 ? 'raider' : 'civilian',
      pose: { position: { x: i * 41.25, y: 0, z: -i * 28.5 }, rotation: i * 0.125 },
      velocity: { x: i * 0.5, y: 0, z: -i * 0.25 },
      health: { current: 100 - i * 3, max: 100, shield: i * 2 },
      weapons: [{ slot: 0, heat: i * 0.1, cooldown: i % 4 }, { slot: 1, heat: i * 0.2, cooldown: (i + 1) % 4 }],
      effects: new Set([`effect-${i % 3}`, { intensity: i / 10 }]),
    };
  }
  return { entities, trace: [{ tick: 1, event: 'spawn' }, { tick: 2, event: 'lock' }] };
}

function nsSince(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function retainedHeapDelta(value, fn, iterations, previous) {
  if (!global.gc) return null;
  global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < iterations; i++) fn(value, previous);
  global.gc();
  return (process.memoryUsage().heapUsed - before) / (1024 * 1024);
}

function runBenchmark({ value, previous }, iterations) {
  const scratch = {};
  // Warm both paths before measuring, with a shared workload and no retained
  // signatures beyond the current comparison.
  for (let i = 0; i < 20; i++) {
    legacyCanonical(value);
    canonicalSignatureAgainst(value, previous, scratch);
  }
  if (global.gc) global.gc();
  let oldMs = 0;
  let newMs = 0;
  let outputBytes = 0;
  for (let i = 0; i < iterations; i++) {
    if ((i & 1) === 0) {
      let start = process.hrtime.bigint();
      const oldSig = legacyCanonical(value);
      oldMs += nsSince(start);
      start = process.hrtime.bigint();
      const newSig = canonicalSignatureAgainst(value, previous, scratch);
      newMs += nsSince(start);
      if (oldSig !== newSig) throw new Error('canonical output mismatch');
      outputBytes += newSig.length;
    } else {
      let start = process.hrtime.bigint();
      const newSig = canonicalSignatureAgainst(value, previous, scratch);
      newMs += nsSince(start);
      start = process.hrtime.bigint();
      const oldSig = legacyCanonical(value);
      oldMs += nsSince(start);
      if (oldSig !== newSig) throw new Error('canonical output mismatch');
      outputBytes += newSig.length;
    }
  }
  if (global.gc) global.gc();
  return {
    oldMs,
    newMs,
    oldMsPerCall: oldMs / iterations,
    newMsPerCall: newMs / iterations,
    speedup: oldMs / newMs,
    outputBytesPerCall: Math.round(outputBytes / iterations),
    oldRetainedHeapDeltaMb: retainedHeapDelta(value, legacyCanonical, 12, previous),
    newRetainedHeapDeltaMb: retainedHeapDelta(
      value,
      (input, expected) => canonicalSignatureAgainst(input, expected, scratch),
      12,
      previous,
    ),
  };
}

const iterations = Math.max(10, Number(process.env.SF_CANON_ITERATIONS || 60));
function makeScenario(name, value, mutate) {
  const previous = legacyCanonical(value);
  return { name, value: mutate ? mutate(structuredClone(value)) : value, previous };
}

const market = makeMarket();
const marketEarly = makeScenario('market.rows:changed-early', market, (value) => {
  value.cycle += 1;
  return value;
});
const marketLate = makeScenario('market.rows:changed-late', market, (value) => {
  value.updatedAt += 1;
  return value;
});
const marketRemoved = makeScenario('market.rows:removed-last', market, (value) => {
  delete value.updatedAt;
  return value;
});

const jobs = makeNpcJobs();
const jobsEarly = makeScenario('npcJobs.byId:changed-early', jobs, (value) => {
  value.active += 1;
  return value;
});
const jobsLate = makeScenario('npcJobs.byId:changed-late', jobs, (value) => {
  value.nextId += 1;
  return value;
});

const combat = makeCombatEntities();
const combatEarly = makeScenario('combat.entities:changed-early', combat, (value) => {
  value.entities['entity-0'].health.current -= 1;
  return value;
});
const combatLate = makeScenario('combat.entities:changed-late', combat, (value) => {
  value.trace[value.trace.length - 1].tick += 1;
  return value;
});

const cases = [
  { name: 'market.rows:unchanged', value: market, previous: legacyCanonical(market) },
  marketEarly,
  marketLate,
  marketRemoved,
  { name: 'npcJobs.byId:unchanged', value: jobs, previous: legacyCanonical(jobs) },
  jobsEarly,
  jobsLate,
  { name: 'combat.entities:unchanged', value: combat, previous: legacyCanonical(combat) },
  combatEarly,
  combatLate,
];

console.log(JSON.stringify({
  schema: 'spaceface.domain-canonicalizer-benchmark.v1',
  iterations,
  gc: typeof global.gc === 'function',
  cases: cases.map((scenario) => ({
    name: scenario.name,
    ...runBenchmark(scenario, iterations),
  })),
}, null, 2));
