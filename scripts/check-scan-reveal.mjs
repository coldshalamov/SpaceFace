#!/usr/bin/env node
// BP-02.1/C3 Scan-Reveals-Loadout contract.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/scanReveal.js', import.meta.url)), 'src/data/scanReveal.js exists');
assert.ok(existsSync(new URL('../src/systems/scanReveal.js', import.meta.url)), 'src/systems/scanReveal.js exists');

const dataMod = await import('../src/data/scanReveal.js');
const sysMod = await import('../src/systems/scanReveal.js');
const {
  SCAN_REVEAL_CLASS_RADIUS,
  SCAN_REVEAL_DEEP_RADIUS,
  SCAN_REVEAL_FULL_RADIUS,
  buildShipScanReveal,
  isFalseManifestCandidate,
  sameScanReveal,
  scanQualityForDistance,
  scanRevealFingerprint,
} = dataMod;
const scanReveal = sysMod.scanReveal || sysMod.default;

assert.equal(scanReveal && scanReveal.name, 'scanReveal', 'scanReveal exports a registry system');
assert.equal(typeof buildShipScanReveal, 'function', 'buildShipScanReveal helper exported');
assert.equal(scanQualityForDistance(SCAN_REVEAL_FULL_RADIUS + 1), 'class', 'range past full radius degrades to class');
assert.equal(scanQualityForDistance(SCAN_REVEAL_CLASS_RADIUS + 1), null, 'range past class radius is ignored');

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in scan reveal path'); };
  Date.now = () => { throw new Error('Date.now in scan reveal path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testFullScanRevealsLoadout);
guarded(testRangeDegradesToClassOnly);
guarded(testSmugglerSecondCloseScanMarksSuspect);
guarded(testNonShipIgnoredAndNoDuplicateSpam);
guarded(testDeterministicHelper);
testPackageAndRegistryWiring();

console.log(`[check-scan-reveal] PASS - ${sections} sections green`);

function boot({ targetPos = { x: 280, z: 0 }, targetSpec = null } = {}) {
  const sim = createSimulation({ seed: 515, systems: [scanner, scanReveal] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 220,
    hullMax: 220,
    radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;

  const spec = targetSpec || makeShipEntitySpec('ship_wasp', {
    team: 1,
    factionId: 'faction_reach',
    pos: targetPos,
    fittings: ['wpn_pulse_laser_s', 'wpn_autocannon_s'],
    ai: { archetype: 'pirate_raider' },
  });
  spec.pos = targetPos;
  spec.factionId = spec.factionId || 'faction_reach';
  spec.data = spec.data || {};
  spec.data.bountyCr = spec.data.bountyCr || 420;
  spec.data.shipClass = spec.data.shipClass || 'fighter';
  const target = sim.spawn(spec);

  const log = { reveals: [] };
  bus.on('scan:shipRevealed', (payload) => log.reveals.push(payload));
  return { sim, state, bus, player, target, log };
}

function runScan(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function runPastCooldown(t) {
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

function testFullScanRevealsLoadout() {
  const t = boot();
  runScan(t);
  const reveal = t.target.data.scanRevealed;
  assert.ok(reveal, 'ship receives scanRevealed payload');
  assert.equal(reveal.quality, 'full', 'near scan resolves full loadout');
  assert.equal(reveal.shipId, 'ship_wasp', 'scan records the ship definition id');
  assert.equal(reveal.shipClass, 'fighter', 'scan records ship class');
  assert.equal(reveal.factionId, 'faction_reach', 'scan records faction id');
  assert.equal(reveal.bountyCr, 420, 'scan records bounty value');
  assert.deepEqual(reveal.loadout.map((w) => w.id).sort(), ['wpn_autocannon_s', 'wpn_pulse_laser_s'],
    'scan records compact weapon loadout from runtime weapons');
  assert.equal(t.log.reveals.length, 1, 'full reveal emits one scan:shipRevealed event');
  ok('real scanner pulse resolves nearby ship loadout and bounty');
}

function testRangeDegradesToClassOnly() {
  const t = boot({ targetPos: { x: SCAN_REVEAL_FULL_RADIUS + 180, z: 0 } });
  runScan(t);
  const reveal = t.target.data.scanRevealed;
  assert.ok(reveal, 'range-class target still receives a reveal');
  assert.equal(reveal.quality, 'class', 'range scan degrades to class-only');
  assert.equal(reveal.shipId, 'ship_wasp', 'class-only reveal still identifies hull');
  assert.deepEqual(reveal.loadout, [], 'class-only reveal does not leak loadout');
  assert.equal(reveal.bountyCr, null, 'class-only reveal does not leak bounty');
  ok('outlying pulse degrades to class-only instead of leaking full loadout');
}

function testSmugglerSecondCloseScanMarksSuspect() {
  const smuggler = makeShipEntitySpec('ship_mule', {
    team: 2,
    factionId: 'faction_quiet',
    pos: { x: SCAN_REVEAL_DEEP_RADIUS - 20, z: 0 },
    fittings: ['wpn_pulse_laser_s'],
    ai: { archetype: 'fleeing_trader', passive: true },
  });
  smuggler.data.shipClass = 'freighter';
  smuggler.data.trafficRole = 'smuggler';
  smuggler.data.falseManifest = { cargoHint: 'machine parts' };
  const t = boot({ targetPos: smuggler.pos, targetSpec: smuggler });
  assert.equal(isFalseManifestCandidate(t.target), true, 'smuggler is a false-manifest candidate');

  runScan(t);
  assert.equal(t.target.data.scanRevealed.manifestTrust, 'false', 'first scan preserves false manifest');
  assert.equal(t.target.data.scanRevealed.cargoHint, 'machine parts', 'first scan shows declared cargo');
  runPastCooldown(t);
  runScan(t);
  assert.equal(t.target.data.scanRevealed.quality, 'deep', 'second close scan upgrades to deep quality');
  assert.equal(t.target.data.scanRevealed.manifestTrust, 'suspect', 'second close scan marks manifest suspect');
  assert.equal(t.target.data.scanRevealed.cargoHint, 'machine parts', 'declared cargo remains visible for UI contrast');
  assert.equal(t.log.reveals.length, 2, 'only the trust-changing second scan emits another reveal');
  ok('smuggler false manifest needs a second close pulse before suspect');
}

function testNonShipIgnoredAndNoDuplicateSpam() {
  const t = boot();
  const rock = t.sim.spawn({
    type: 'asteroid',
    team: 2,
    pos: { x: 160, z: 80 },
    alive: true,
    radius: 20,
    data: { typeId: 'ast_common' },
  });
  runScan(t);
  const first = t.target.data.scanRevealed;
  assert.equal(rock.data.scanRevealed, undefined, 'asteroids do not receive ship scan reveal');
  t.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
  assert.equal(t.log.reveals.length, 1, 'same reveal fingerprint does not spam events');
  assert.equal(sameScanReveal(first, t.target.data.scanRevealed), true, 'same reveal helper recognizes duplicate');
  ok('scan reveal ignores non-ships and de-dupes identical reveals');
}

function testDeterministicHelper() {
  const a = boot();
  const b = boot();
  const revealA = buildShipScanReveal(a.target, a.state, { origin: { x: 0, z: 0 }, now: 12 });
  const revealB = buildShipScanReveal(b.target, b.state, { origin: { x: 0, z: 0 }, now: 99 });
  assert.equal(scanRevealFingerprint(revealA), scanRevealFingerprint(revealB),
    'same entity shape yields same scan reveal fingerprint independent of wall time');
  ok('scan reveal helper is deterministic and sim-time only');
}

function testPackageAndRegistryWiring() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:scan-reveal'], 'node scripts/check-scan-reveal.mjs',
    'package exposes check:scan-reveal');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /import \{ scanReveal \} from '\.\.\/systems\/scanReveal\.js';/,
    'registry imports scanReveal system');
  assert.match(registry, /scanner, scanReveal, buildIdentity, pirateDisguise/,
    'scanReveal is registered immediately after scanner, with buildIdentity before pirateDisguise');

  const source = readFileSync(new URL('../src/systems/scanReveal.js', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/data/scanReveal.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'scan reveal path does not use RNG, wall-clock time, or timers');
  ok('package and registry wiring are present');
}
