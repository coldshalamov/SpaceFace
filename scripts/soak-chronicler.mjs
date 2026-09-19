/** Module-only synthetic soak, fixed-step replay and mid-inbox save/restore comparison.
 * Wall time is measured only in this harness. The simulation module never sees it.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createChronicler } from '../src/systems/chronicler.js';
import { createBus, OUTPUTS, receipts } from '../tests/chronicler/harness.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const i = a.indexOf('='); return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)];
}));
const hours = Number(args['--hours'] || 63);
const seeds = String(args['--seeds'] || '4242,8008').split(',').map(Number);
if (!Number.isFinite(hours) || hours <= 0 || hours > 168 || seeds.some(s => !Number.isSafeInteger(s))) {
  throw new Error('Use --hours=0.1..168 --seeds=4242,8008 [--out=report.json]');
}
const totalTicks = Math.round(hours * 3600 * 60);
function hash(s) { return createHash('sha256').update(s).digest('hex'); }
function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
}
function tapeFor(seed) {
  const pick = seeded(seed), tape = [];
  for (let episode = 0, tick = 60; tick < totalTicks - 30 * 60; episode++, tick += 180 * 60) {
    const suffix = `-${seed}-${episode}`;
    let packets;
    switch (pick() % 8) {
      case 0: packets = receipts(suffix).map((p, i) => [tick + [0, 0, 0, 3, 8, 15, 23][i] * 60, ...p]); break;
      case 1: packets = receipts(suffix).slice(0, 4).map((p, i) => [tick + (i === 3 ? 3 * 60 : 0), ...p]); break;
      case 2: packets = ['fled', 'returned', 'defeated'].map((transition, i) => [tick + i * 7 * 60,
        'aceMemory:transition', { aceId: `ace${suffix}`, aceName: `Voss ${episode}`, transition }]); break;
      case 3: packets = [[tick, 'distress:rescued', { id: `rescue${suffix}`, name: `Courier ${episode}` }]]; break;
      case 4: packets = [[tick, 'heat:changed', { level: 2, value: .3, previousLevel: 0 }],
        [tick + 5 * 60, 'heat:changed', { level: 4, value: .7, previousLevel: 2 }],
        [tick + 20 * 60, 'heat:changed', { level: 0, value: 0, previousLevel: 4 }]]; break;
      case 5: packets = [[tick, 'economy:tradeCompleted', { receiptId: `untraced${suffix}`, side: 'sell',
        stationId: 'station_helios_dock', commodityId: 'cmdty_salvage', qty: 3, total: 3000 }]]; break;
      case 6: packets = receipts(suffix).slice(0, 2).map(([event, p]) => [tick, event, { ...p, killerId: 9,
        ...(p.presentation ? { presentation: { ...p.presentation, playerCaused: false } } : {}) }]); break;
      default: packets = [[tick, 'salvage:reactorVented', { wreckId: `reactor${suffix}` }],
        [tick, 'aftermath:causeRecorded', { fingerprint: `cause${suffix}`, consequenceKind: 'shipping shortage' }],
        [tick + 8 * 60, 'aftermath:remedied', { fingerprint: `cause${suffix}`, consequenceKind: 'shipping shortage', missionId: `mission${suffix}` }]];
    }
    for (const p of packets) tape.push(p);
    // Repeated receipt delivery is realistic; it must not duplicate facts, quantities or legends.
    if (episode % 5 === 0) tape.push(structuredClone(packets[0]));
  }
  return tape.sort((a, b) => a[0] - b[0]);
}
function percentile(values, fraction) { return values.length ? values[Math.min(values.length - 1, Math.floor(values.length * fraction))] : 0; }
function run(tape, seed, restore) {
  const bus = createBus(), outputHash = createHash('sha256');
  const state = { simTime: 0, tick: 0, playerId: 1, meta: { seed }, entities: new Map(),
    world: { currentSectorId: 'helios', activeSector: { name: 'Helios' } },
    rng: () => { throw new Error('Unexpected gameplay RNG consumption'); } };
  const counts = Object.fromEntries(OUTPUTS.map(e => [e, 0])); let completeAnnouncements = 0;
  for (const event of OUTPUTS) bus.on(event, payload => {
    counts[event]++; if (event === 'chronicler:story' && payload.complete) completeAnnouncements++;
    outputHash.update(JSON.stringify([state.tick, event, payload]) + '\n');
  });
  let publishPasses = 0;
  function install() {
    const instance = createChronicler().init({ state, bus });
    const publish = instance._publish;
    instance._publish = function (...args) { publishPasses++; return publish.apply(this, args); };
    return instance;
  }
  let system = install();
  const splitTick = tape.find(p => p[0] >= Math.floor(totalTicks / 2))?.[0] || Math.floor(totalTicks / 2);
  let input = 0, maxBytes = 0, maxStories = 0, maxFacts = 0, maxPending = 0, maxSeen = 0;
  let checkpointPending = 0, samples = 0, activeSteps = 0;
  const timings = [], start = performance.now();
  for (let tick = 0; tick <= totalTicks; tick++) {
    state.tick = tick; state.simTime = tick / 60;
    let active = false;
    while (input < tape.length && tape[input][0] === tick) {
      const [, event, p] = tape[input++]; bus.emit(event, p); active = true;
    }
    if (tick === splitTick && restore) {
      const snapshot = system.serialize(); checkpointPending = snapshot.pending.length;
      system.destroy(); state.chronicler = JSON.parse(JSON.stringify(snapshot));
      system = install();
    }
    if (active) {
      maxPending = Math.max(maxPending, state.chronicler.pending.length);
      const before = performance.now(); system.update(1 / 60, state);
      timings.push(performance.now() - before); activeSteps++;
      maxStories = Math.max(maxStories, state.chronicler.stories.length);
      maxFacts = Math.max(maxFacts, state.chronicler.stories.reduce((n, s) => n + s.nodes.length, 0));
      maxSeen = Math.max(maxSeen, state.chronicler.seen.length);
      if (activeSteps % 64 === 0) { maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(system.serialize()))); samples++; }
    } else system.update(1 / 60, state);
  }
  const final = JSON.stringify(system.serialize());
  maxBytes = Math.max(maxBytes, Buffer.byteLength(final)); samples++;
  const diagnostics = system.diagnostics(); timings.sort((a, b) => a - b);
  for (const story of state.chronicler.stories) {
    if (story.nodes.length > diagnostics.config.maxFactsPerStory) throw new Error('Unbounded story');
    const ids = new Set(story.nodes.map(f => f.id));
    if (story.edges.some(e => !ids.has(e.from) || !ids.has(e.to))) throw new Error('Dangling edge');
  }
  if (maxStories > diagnostics.config.maxStories || maxPending > diagnostics.config.maxPending
      || maxSeen > diagnostics.config.maxSeen) throw new Error('Retention bound exceeded');
  return {
    mode: restore ? 'mid-inbox-save-restore' : 'uninterrupted', seed, simulatedHours: hours,
    updateCalls: totalTicks + 1, inputsDelivered: input, outputCounts: counts, completeAnnouncements,
    checkpoint: restore ? { tick: splitTick, pendingFacts: checkpointPending } : null,
    snapshotSha256: hash(final), outputSha256: outputHash.digest('hex'),
    retention: { peakStories: maxStories, peakFacts: maxFacts, peakPending: maxPending,
      peakSeen: maxSeen, sampledMaxSnapshotBytes: maxBytes, snapshotSamples: samples },
    diagnostics,
    measurements: { wallSeconds: (performance.now() - start) / 1000, activeSteps, publishPasses,
      activeStepMedianMs: percentile(timings, .5), activeStepP95Ms: percentile(timings, .95),
      activeStepMaxMs: timings.at(-1) || 0 },
  };
}
const results = [];
for (const seed of seeds) {
  // Isolate seeds so this stress fixture does not accumulate four large V8 heaps/JIT profiles.
  // A seed still runs both uninterrupted and restored trajectories in its own process.
  if (seeds.length > 1) {
    const child = spawnSync(process.execPath, [process.argv[1], `--hours=${hours}`, `--seeds=${seed}`],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (child.stderr) process.stderr.write(child.stderr);
    if (child.error) throw child.error;
    if (!child.stdout) throw new Error(`Soak child ${seed} returned no report (status ${child.status})`);
    const report = JSON.parse(child.stdout);
    results.push(...report.results);
    if (child.status !== 0 || !report.passed) process.exitCode = 1;
    if (typeof args['--out'] === 'string') writeFileSync(args['--out'] + '.partial', JSON.stringify(results, null, 2));
    continue;
  }
  const tape = tapeFor(seed);
  const continuous = run(tape, seed, false), resumed = run(tape, seed, true);
  const expectedCompleteChains = tape.filter(p => p[1] === 'chronicler:provenance' && p[2].stage === 'law').length;
  const allSuppliedChainsConnected = continuous.completeAnnouncements === expectedCompleteChains
    && resumed.completeAnnouncements === expectedCompleteChains;
  const exactState = continuous.snapshotSha256 === resumed.snapshotSha256;
  const exactOutputs = continuous.outputSha256 === resumed.outputSha256;
  results.push({ seed, exactState, exactOutputs, expectedCompleteChains, allSuppliedChainsConnected, continuous, resumed });
  console.error(`seed ${seed}: state=${exactState}, emissions=${exactOutputs}, ${continuous.updateCalls} ticks/run`);
  if (!exactState || !exactOutputs || !allSuppliedChainsConnected) process.exitCode = 1;
  if (typeof args['--out'] === 'string') writeFileSync(args['--out'] + '.partial', JSON.stringify(results, null, 2));
}
const report = {
  scope: 'MODULE-ONLY synthetic 60 Hz simulation with the real packet bus; NOT full-game/browser/FPS evidence',
  node: process.version, platform: process.platform, arch: process.arch,
  hoursPerRun: hours, seeds, results,
  passed: results.every(r => r.exactState && r.exactOutputs && r.allSuppliedChainsConnected),
};
const json = JSON.stringify(report, null, 2) + '\n';
if (typeof args['--out'] === 'string') writeFileSync(args['--out'], json);
console.log(json);
