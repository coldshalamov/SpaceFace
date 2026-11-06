// inf-beacon-lamp — the buoy you paid 250 credits for says it is alive.
//
// World beacons carried authored motion life (mooring sway, claim lean, warn rock) but no
// light read at all (`strobeHz: 0`, no lamp anywhere): a claim beacon holding a safe zone on
// a 45-second lease read as a dark stick. Now a permanent buoy runs a calm running light, a
// working claim beacon pulses claim-green, and a lease nearly up switches to the fast
// anti-collision double-flash — slowed, never silenced, under reduced motion.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BEACON_LAMP_CAP,
  BEACON_LAMP_COLORS,
  BEACON_LAMP_WARN_S,
  BEACON_RUNNING_FLOOR,
  BEACON_WORKING_FLOOR,
  BeaconLampLayer,
  beaconLampPhase,
  isLampBeacon,
  resolveBeaconLampPlan,
} from '../src/render/beaconLampLife.js';

function buoy(overrides = {}) {
  return {
    id: 'beacon-1',
    type: 'beacon',
    alive: true,
    pos: { x: 120, z: -60 },
    radius: 5,
    data: { storyPropKind: 'claim_beacon', expireAt: 1000 },
    view: { root: null },
    ...overrides,
  };
}

const NOW = 995; // 5 s of lease left on the base buoy

test('a permanent buoy runs a light that breathes but never goes dark', () => {
  const lane = buoy({ data: {} });
  let minGlow = 2;
  for (let t = 0; t < 12; t += 0.05) {
    const plan = resolveBeaconLampPlan(lane, t, false, {});
    assert.equal(plan.mode, 'running');
    assert.equal(plan.colorHex, BEACON_LAMP_COLORS.running);
    assert.ok(plan.glow01 >= BEACON_RUNNING_FLOOR - 1e-9, 'a live lamp never reads as a dead one');
    minGlow = Math.min(minGlow, plan.glow01);
  }
  assert.ok(minGlow < 0.8, 'a running light breathes; it is not a steady floodlight');
});

test('a working claim beacon pulses claim green with a lit floor', () => {
  const claim = buoy({ data: { storyPropKind: 'claim_beacon', expireAt: NOW + 30 } });
  let peak = 0;
  let minGlow = 2;
  for (let t = 0; t < 8; t += 0.02) {
    const plan = resolveBeaconLampPlan(claim, NOW + t, false, {});
    assert.equal(plan.mode, 'working');
    assert.equal(plan.colorHex, BEACON_LAMP_COLORS.working);
    peak = Math.max(peak, plan.glow01);
    minGlow = Math.min(minGlow, plan.glow01);
  }
  assert.ok(peak > 0.85, 'the working pulse reaches full lamp brightness');
  assert.ok(minGlow >= BEACON_WORKING_FLOOR - 1e-9);
});

test('a lease nearly up switches to the amber anti-collision double-flash', () => {
  const warn = buoy({ data: { storyPropKind: 'claim_beacon', expireAt: NOW + BEACON_LAMP_WARN_S - 0.1 } });
  let peaks = 0;
  let inPulse = false;
  for (let t = 0; t < 3; t += 0.005) {
    const plan = resolveBeaconLampPlan(warn, NOW + t, false, {});
    assert.equal(plan.mode, 'warn');
    assert.equal(plan.colorHex, BEACON_LAMP_COLORS.warn);
    const hot = plan.glow01 > BEACON_WORKING_FLOOR + 0.2;
    if (hot && !inPulse) { peaks++; inPulse = true; }
    if (!hot) inPulse = false;
  }
  // ~3.3 periods sampled; a double-flash yields two peaks per period.
  assert.ok(peaks >= 5, `the warn lamp flashes in pairs (saw ${peaks} peaks over 3 s)`);
});

test('reduced motion slows the blink; it never silences it', () => {
  const warn = buoy({ data: { storyPropKind: 'claim_beacon', expireAt: NOW + 3 } });
  const countPeaks = (reduced) => {
    let peaks = 0;
    let inPulse = false;
    for (let t = 0; t < 10; t += 0.01) {
      const hot = resolveBeaconLampPlan(warn, NOW + t, reduced, {}).glow01 > BEACON_WORKING_FLOOR + 0.2;
      if (hot && !inPulse) { peaks++; inPulse = true; }
      if (!hot) inPulse = false;
    }
    return peaks;
  };
  const full = countPeaks(false);
  const reduced = countPeaks(true);
  assert.ok(reduced < full / 2, `reduced stretches the period (full ${full} peaks, reduced ${reduced})`);
  assert.ok(reduced >= 4, 'slowed, never silenced — a dark lamp reads as a dead buoy');
  // And the reduced lamp is never dark across a whole stretched period.
  let minGlow = 2;
  for (let t = 0; t < 2.7; t += 0.02) {
    minGlow = Math.min(minGlow, resolveBeaconLampPlan(warn, NOW + t, true, {}).glow01);
  }
  assert.ok(minGlow >= BEACON_WORKING_FLOOR - 1e-9);
});

test('dead, moved-away and non-beacon entities carry no lamp plan', () => {
  const out = {};
  assert.equal(resolveBeaconLampPlan(null, NOW, false, out).live, false);
  assert.equal(resolveBeaconLampPlan(buoy({ alive: false }), NOW, false, out).live, false);
  assert.equal(resolveBeaconLampPlan(buoy({ type: 'mine' }), NOW, false, out).live, false);
  assert.equal(resolveBeaconLampPlan(buoy({ pos: { x: NaN, z: 0 } }), NOW, false, out).live, false);
  assert.equal(out.glow01, 0);
  assert.equal(isLampBeacon(buoy({ id: null })), false);
});

test('lamp phase is deterministic per beacon and varies across beacons', () => {
  assert.equal(beaconLampPhase('beacon-7'), beaconLampPhase('beacon-7'));
  assert.notEqual(beaconLampPhase('beacon-7'), beaconLampPhase('beacon-8'));
  // Determinism off the id, never off the clock or a random source.
  const claim = buoy();
  const a = resolveBeaconLampPlan(claim, 42.5, false, {});
  const b = resolveBeaconLampPlan(claim, 42.5, false, {});
  assert.equal(a.glow01, b.glow01);
});

test('the layer mounts one bead per beacon on its view root and releases it with the buoy', () => {
  const layer = new BeaconLampLayer();
  const roots = new Map();
  const makeRoot = () => {
    const children = [];
    return {
      children,
      add(child) { children.push(child); },
      remove(child) { const i = children.indexOf(child); if (i >= 0) children.splice(i, 1); },
    };
  };
  const a = buoy({ id: 'b-a', view: { root: (roots.set('b-a', makeRoot()), roots.get('b-a')) } });
  const b = buoy({ id: 'b-b', view: { root: (roots.set('b-b', makeRoot()), roots.get('b-b')) } });
  layer.update([a, b], NOW, false);
  assert.equal(layer.slots.size, 2);
  assert.equal(roots.get('b-a').children.length, 1, 'one lamp bead on the buoy root');
  // Beacon b leaves the world: its bead is released, a stays lit.
  layer.update([a], NOW + 0.1, false);
  assert.equal(layer.slots.size, 1);
  assert.equal(roots.get('b-b').children.length, 0, 'a gone beacon takes its lamp with it');
  assert.equal(roots.get('b-a').children.length, 1);
  layer.dispose();
});

test('a re-grafted view root keeps the bead on the live root', () => {
  const layer = new BeaconLampLayer();
  const oldRoot = { children: [], add(c) { this.children.push(c); }, remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); } };
  const newRoot = { children: [], add(c) { this.children.push(c); }, remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); } };
  const e = buoy({ view: { root: oldRoot } });
  layer.update([e], NOW, false);
  assert.equal(oldRoot.children.length, 1);
  e.view.root = newRoot; // authored views re-graft under retained roots
  layer.update([e], NOW + 0.1, false);
  assert.equal(newRoot.children.length, 1, 'the bead follows the live root');
  assert.equal(oldRoot.children.length, 0, 'the stale root lets go');
  layer.dispose();
});

test('the tracked set is bounded', () => {
  assert.ok(BEACON_LAMP_CAP >= 2, 'claim beacons cap at 2 active by sim design');
  assert.ok(BEACON_LAMP_CAP <= 24, 'the lamp set never becomes an unbounded crowd');
});

test('the live owner is wired: vfx updates the lamp layer with the presented sim time', () => {
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfx, /import \{ BeaconLampLayer \} from '\.\/beaconLampLife\.js';/);
  assert.match(vfx, /this\._updateBeaconLampLife\(\);/, 'the frame update walks the lamp layer');
  assert.match(vfx, /indexedTypeScan\(this\.state, 'radarContacts'\)/,
    'beacons have no typed lane; the scan uses the radar bucket with its own predicate');
});
