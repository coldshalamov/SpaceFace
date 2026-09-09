// BP-11 packet A9 acceptance check: Sector Hazard Gradient on the Map.
//
// Contract (src/ui/dangerGradient.js — see design/revamp/detail/A_sector_station.md A9):
//   - gradientFor is PURE over the SHIPPED dangerTier helper (sectors.js) — its tier must equal
//     dangerTier(sector) for every shipped sector AND across a synthetic security sweep (catches
//     any re-derivation drift); it never mutates the sector (no new map data).
//   - Monotonic in dangerTier across the 10 shipped sectors: heat is non-decreasing with tier and
//     equal tiers share one color (one tint per tier).
//   - Endpoints read correctly: Helios Prime (secure, tier 0) tints COOL (blue-dominant) and
//     Ashfall Reach (lethal, tier 5) tints HOT (red-dominant).
//   - The badge reuses the shipped SECURITY_TIER_LABELS display language (map ≡ postcard).
//   - The applier HOOKS the existing starmap node render without editing the map file: original
//     _drawNodes still runs, discovered nodes gain tint+badge, undiscovered nodes stay fogged,
//     install is idempotent, uninstall restores the original, and headless (no document, no
//     force) it is a strict no-op.
import assert from 'node:assert/strict';

import { SECTORS, dangerTier } from '../src/data/sectors.js';
import { SECURITY_TIER_LABELS } from '../src/ui/sectorPostcard.js';
import {
  gradientFor, TIER_COLORS, installDangerGradient, uninstallDangerGradient,
} from '../src/ui/dangerGradient.js';

assertUsesShippedDangerTier();
assertMonotonicAcrossSectors();
assertCoolHotEndpoints();
assertNoNewMapData();
assertApplierHooksExistingRender();
assertHeadlessStrictNoop();

console.log(`Danger gradient checks OK (${SECTORS.length} sectors, monotonic + shipped-helper + guarded applier)`);

// ── one source of truth: the shipped dangerTier, never re-derived ───────────────────────────────

function assertUsesShippedDangerTier() {
  for (const s of SECTORS) {
    assert.equal(gradientFor(s).tier, dangerTier(s),
      `${s.id}: gradientFor must report the SHIPPED dangerTier (${dangerTier(s)})`);
  }
  // Synthetic sweep: any drift from the shipped formula (round vs floor, clamp bounds…) fails here.
  for (let sec = 0; sec <= 1.0001; sec += 0.05) {
    const synth = { id: 'synth', security: sec, tier: 2 };
    assert.equal(gradientFor(synth).tier, dangerTier(synth),
      `security=${sec.toFixed(2)}: tier must match shipped dangerTier exactly`);
  }
}

// ── monotonic gradient ─────────────────────────────────────────────────────────────────────────

function assertMonotonicAcrossSectors() {
  const graded = SECTORS.map((s) => ({ id: s.id, tier: dangerTier(s), g: gradientFor(s) }))
    .sort((a, b) => a.tier - b.tier);
  assert.ok(graded.length >= 10, `expected the 10 shipped sectors; got ${graded.length}`);
  for (let i = 1; i < graded.length; i++) {
    const prev = graded[i - 1], cur = graded[i];
    assert.ok(cur.g.heat >= prev.g.heat,
      `heat must be non-decreasing in dangerTier: ${prev.id}(t${prev.tier} h${prev.g.heat}) → ${cur.id}(t${cur.tier} h${cur.g.heat})`);
    if (cur.tier === prev.tier) {
      assert.equal(cur.g.color, prev.g.color, `equal tiers share one tint: ${prev.id} vs ${cur.id}`);
    } else {
      assert.ok(cur.g.heat > prev.g.heat, `strictly hotter tier must be strictly hotter heat: ${prev.id} → ${cur.id}`);
      assert.notEqual(cur.g.color, prev.g.color, `different tiers must tint differently: ${prev.id} vs ${cur.id}`);
    }
    assert.equal(cur.g.badge, SECURITY_TIER_LABELS[cur.tier], `${cur.id}: badge reuses the shipped tier language`);
  }
}

function channel(hex, i) { return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16); }

function assertCoolHotEndpoints() {
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  const ashfall = SECTORS.find((s) => s.id === 'sector_ashfall_reach');
  assert.ok(helios && ashfall, 'shipped endpoint sectors must exist');
  const cool = gradientFor(helios), hot = gradientFor(ashfall);
  assert.equal(cool.tier, 0, 'Helios Prime is the secure endpoint (tier 0)');
  assert.equal(hot.tier, TIER_COLORS.length - 1, 'Ashfall Reach is the lethal endpoint (tier 5)');
  assert.equal(cool.color, TIER_COLORS[0]);
  assert.equal(hot.color, TIER_COLORS[TIER_COLORS.length - 1]);
  // Semantically cool vs hot, not just "different": blue-dominant vs red-dominant.
  assert.ok(channel(cool.color, 2) > channel(cool.color, 0),
    `secure tint must be COOL (blue>red); got ${cool.color}`);
  assert.ok(channel(hot.color, 0) > channel(hot.color, 2),
    `lethal tint must be HOT (red>blue); got ${hot.color}`);
}

function assertNoNewMapData() {
  const s = SECTORS.find((x) => x.id === 'sector_ceres_belt');
  const before = JSON.stringify({ id: s.id, security: s.security, tier: s.tier, position: s.position });
  gradientFor(s);
  const after = JSON.stringify({ id: s.id, security: s.security, tier: s.tier, position: s.position });
  assert.equal(after, before, 'gradientFor must not mutate the sector (no new map data)');
}

// ── the guarded applier ────────────────────────────────────────────────────────────────────────

function makeStubG() {
  const calls = [];
  const g = {
    calls,
    fillStyle: '', font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    arc(...a) { calls.push(['arc', ...a]); },
    fill() { calls.push(['fill', this.fillStyle, this.globalAlpha]); },
    fillText(text, x, y) { calls.push(['fillText', text, x, y, this.fillStyle]); },
  };
  return g;
}

function makeStubScreen() {
  const origCalls = [];
  return {
    origCalls,
    _cam: { zoom: 1 },
    _isDiscovered(id) { return id !== 'sector_hidden'; },
    _drawNodes(g, nodes, currentId, now) { origCalls.push([nodes.length, currentId, now]); },
  };
}

function assertApplierHooksExistingRender() {
  const screen = makeStubScreen();
  const origFn = screen._drawNodes;
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');

  assert.equal(installDangerGradient(screen, { force: true }), true, 'applier installs onto the hook');
  assert.equal(installDangerGradient(screen, { force: true }), false, 'second install is a no-op (idempotent)');
  assert.notEqual(screen._drawNodes, origFn, 'the render hook is wrapped');

  const g = makeStubG();
  const nodes = [
    { sector: helios, x: 10, y: 20, r: 12 },
    { sector: { id: 'sector_hidden', security: 0.1 }, x: 50, y: 60, r: 10 },
  ];
  screen._drawNodes(g, nodes, 'sector_helios_prime', 123);

  assert.equal(screen.origCalls.length, 1, 'the ORIGINAL node render still runs (hook, not replace)');
  assert.deepEqual(screen.origCalls[0], [2, 'sector_helios_prime', 123], 'original receives untouched args');

  const badges = g.calls.filter((c) => c[0] === 'fillText');
  assert.equal(badges.length, 1, `one badge per DISCOVERED node only; got ${badges.length}`);
  assert.equal(badges[0][1], SECURITY_TIER_LABELS[0].toUpperCase(), 'Helios badge reads the tier-0 label');
  assert.equal(badges[0][4], TIER_COLORS[0], 'badge draws in the cool tier-0 tint');
  const tints = g.calls.filter((c) => c[0] === 'fill');
  assert.equal(tints.length, 1, 'one tint wash per discovered node');
  assert.equal(tints[0][1], TIER_COLORS[0], 'tint wash uses gradientFor color');
  assert.ok(tints[0][2] < 1, 'tint is a translucent wash, not a repaint');

  assert.equal(uninstallDangerGradient(screen), true, 'uninstall succeeds');
  assert.equal(screen._drawNodes, origFn, 'uninstall restores the ORIGINAL render function');
  assert.equal(uninstallDangerGradient(screen), false, 'double-uninstall is a safe no-op');
}

function assertHeadlessStrictNoop() {
  assert.equal(typeof document, 'undefined', 'this check must run headless');
  const screen = makeStubScreen();
  const origFn = screen._drawNodes;
  assert.equal(installDangerGradient(screen), false, 'no document + no force → applier refuses');
  assert.equal(screen._drawNodes, origFn, 'headless leaves the render hook untouched');
}
