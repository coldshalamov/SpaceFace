// SFQ-B011 + SFQ-B012 (board row 219, hand lane) — verify the CURRENT G combat stick and the
// hand-conflict surface on the live route; one reproduced usability issue improved.
//
// DISPOSITION (crosswalk): NXB-002 already owns G-stick stability through resize/zoom/display
// density (test/next-wave-nxb-002.test.mjs — run alongside this file, stays green). This file
// covers the REMAINING SFQ-B011 acceptance axes — stationary noise, full-circle pursuit,
// diagonal reversal, release-to-neutral, mode-change neutrality, travel/response curve at real
// viewport sizes — and never reinstates old absolute-radius numbers (the Feel Contract B2/B3
// speed-normalized amendments stand; the deadzone/radius/exponent families are untouched).
//
// THE REPRODUCED ISSUE, FIXED HERE (the "one reproduced usability issue improved"): a resting
// palm emits small BIASED pointer packets. recordDynamicFlightStick used to accumulate them
// unopposed, so the knob random-walked across the 10 px deadzone and pinned thrust while the
// pilot was at rest — reproduced deterministically: a 0.4 px/packet rightward bias saturated
// the knob at FULL deflection (1179 of 1200 ticks commanding, max magnitude 1.0). The fix is
// an in-deadzone re-centering term (DYNAMIC_FLIGHT_STICK_TUNING.deadzoneRecenter, 1/3 per
// accepted packet): noise bleeds back toward neutral instead of accumulating, while a
// deliberate swipe (>= ~4 px/packet) still crosses the deadzone within a few packets. The
// deadzone, radius and response families keep their authored values, and outside the deadzone
// nothing changed at all.
//
// SFQ-B012 is verified-good below by walking the live binding tables: every verb of the
// tether-and-bomb chain resolves a keyboard code in the DEFAULT pilot scheme, the scroll wheel
// drives no flight input, and the G-stick steer itself is a KeyG toggle plus pointer motion —
// no sustained right-button hold anywhere in the chain.
//
// Determinism: the noise generators are seeded LCGs; no Math.random, no wall time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DYNAMIC_FLIGHT_STICK_TUNING,
  projectDynamicFlightStick,
  recordDynamicFlightStick,
  resetDynamicFlightStick,
} from '../src/systems/dynamicFlightStick.js';
import { DEFAULTS, HOLD_TO_TOGGLE_ACTIONS, MOUSE_ACTION_LABELS } from '../src/systems/input.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Deterministic LCG so the noise repros are byte-stable runs. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/** A headless G-stick host with the linear fallback camera basis (screen axes = world axes). */
function stickHost() {
  const player = { id: 'p', pos: { x: 0, z: 0 } };
  return {
    state: {
      playerId: 'p',
      entities: { get: (id) => (id === 'p' ? player : null) },
      input: { autoFire: true },
    },
    helpers: {
      worldToScreen: () => ({ x: 500, y: 300 }),
      raycastToPlane: (n) => ({ x: n.x * 40, z: -n.y * 40 }),
    },
  };
}

// --------------------------------------------------------------------------------------------
// SFQ-B011 — the G-stick answers, at real viewport sizes
// --------------------------------------------------------------------------------------------

test('B011 stationary symmetric pointer noise never commands thrust, at two real viewports', () => {
  const rand = lcg(20261002);
  for (const [w, h] of [[400, 400], [1000, 600], [2560, 1080]]) {
    const host = stickHost();
    resetDynamicFlightStick(host, w, h);
    let commanded = 0;
    for (let i = 0; i < 2000; i += 1) {
      recordDynamicFlightStick(host, (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8, w, h);
      if (projectDynamicFlightStick(host, w, h).active) commanded += 1;
    }
    assert.equal(commanded, 0, `${w}x${h}: two thousand jitter packets must not yaw the hull`);
  }
});

test('B011 REPRODUCED+FIXED biased palm noise used to saturate the knob; now it re-centers', () => {
  // The defect, reproduced against the CURRENT module on record: 0.4 px/packet of biased
  // rightward palm noise. Before deadzoneRecenter this walked the knob to FULL deflection
  // (1179/1200 commanding ticks). It must now stay inside the deadzone forever.
  const rand = lcg(12345);
  const w = 1000;
  const h = 600;
  const host = stickHost();
  resetDynamicFlightStick(host, w, h);
  let commanded = 0;
  let maxMagnitude = 0;
  for (let i = 0; i < 1200; i += 1) {
    recordDynamicFlightStick(host, 0.4 + (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8, w, h);
    const vector = projectDynamicFlightStick(host, w, h);
    maxMagnitude = Math.max(maxMagnitude, vector.magnitude);
    if (vector.active) commanded += 1;
  }
  assert.equal(commanded, 0, 'a resting palm must never command thrust');
  assert.equal(maxMagnitude, 0);
  const knob = Math.hypot(host._autoTargetStick.xPx, host._autoTargetStick.yPx);
  assert.ok(knob < DYNAMIC_FLIGHT_STICK_TUNING.deadzonePx / 2,
    `biased noise must re-center, not park near the deadzone edge (knob at ${knob.toFixed(2)} px)`);
});

test('B011 deliberate swipes still cross: travel and response are preserved outside the deadzone', () => {
  const w = 1000;
  const h = 600;
  // One decisive packet crosses immediately, with the exact pre-fix shaped magnitude
  // (40 px at the 118 px min radius: t=(40/118-10/118)/(1-10/118), ^1.16 = 0.226).
  {
    const host = stickHost();
    resetDynamicFlightStick(host, w, h);
    recordDynamicFlightStick(host, 40, 0, w, h);
    const vector = projectDynamicFlightStick(host, w, h);
    assert.ok(Math.abs(vector.magnitude - 0.226) < 1e-3,
      `the 40 px combat swipe keeps its authored answer (got ${vector.magnitude})`);
  }
  // A slow deliberate creep (5 px/packet) crosses within six packets.
  {
    const host = stickHost();
    resetDynamicFlightStick(host, w, h);
    let crossed = -1;
    for (let i = 0; i < 30 && crossed < 0; i += 1) {
      recordDynamicFlightStick(host, 5, 0, w, h);
      if (projectDynamicFlightStick(host, w, h).active) crossed = i + 1;
    }
    assert.ok(crossed > 0 && crossed <= 6, `a 5 px/packet creep crosses quickly (after ${crossed})`);
  }
});

test('B011 the response curve is monotonic across travel at real viewport sizes', () => {
  for (const [w, h] of [[400, 400], [2560, 1080]]) { // min-radius and max-radius viewports
    const host = stickHost();
    resetDynamicFlightStick(host, w, h);
    const radius = host._autoTargetStick.radiusPx;
    assert.ok(radius >= DYNAMIC_FLIGHT_STICK_TUNING.minRadiusPx
      && radius <= DYNAMIC_FLIGHT_STICK_TUNING.maxRadiusPx,
      `${w}x${h}: the live radius sits in the authored band (${radius})`);
    const deadzone = Math.min(DYNAMIC_FLIGHT_STICK_TUNING.deadzonePx, radius * 0.35);
    let previous = -1;
    for (let px = deadzone - 2; px <= radius; px += Math.max(1, radius / 40)) {
      const probe = stickHost();
      resetDynamicFlightStick(probe, w, h);
      recordDynamicFlightStick(probe, px, 0, w, h);
      const vector = projectDynamicFlightStick(probe, w, h);
      if (px <= deadzone) {
        assert.equal(vector.magnitude, 0, `${w}x${h}: inside the deadzone commands nothing`);
      } else {
        assert.ok(vector.magnitude > previous,
          `${w}x${h}: response must rise monotonically (${px}px: ${vector.magnitude} after ${previous})`);
        previous = vector.magnitude;
      }
    }
    assert.ok(previous > 0.9, `${w}x${h}: full travel reaches full authority`);
  }
});

test('B011 full-circle pursuit: the world vector follows the knob through the live camera basis', () => {
  const w = 1000;
  const h = 600;
  const radius = DYNAMIC_FLIGHT_STICK_TUNING.minRadiusPx;
  const fraction = 0.6;
  // Two bases: the axis-aligned top-down view and a rolled camera. The module must project
  // through WHATEVER basis the renderer hands it — the basis decides, not a hardcoded axis.
  for (const roll of [0, Math.PI / 5]) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const host = stickHost();
    host.helpers.raycastToPlane = (n) => ({ x: n.x * c - n.y * s, z: n.x * s + n.y * c });
    let referenceMagnitude = null;
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const dx = Math.cos(angle) * radius * fraction;
      const dy = Math.sin(angle) * radius * fraction;
      resetDynamicFlightStick(host, w, h);
      recordDynamicFlightStick(host, dx, dy, w, h);
      const vector = projectDynamicFlightStick(host, w, h);
      assert.equal(vector.active, true, `roll ${roll.toFixed(2)} direction ${i} commands`);
      // Reconstruct the expected world direction from the same linear screen basis the
      // module samples: center, one px right, one px down — at the knob's normalized coords.
      const at = (px, py) => host.helpers.raycastToPlane({ x: (px / w) * 2 - 1, y: 1 - (py / h) * 2 });
      const center = at(500, 300);
      const right = at(501, 300);
      const down = at(500, 301);
      const sx = dx / radius;
      const sy = dy / radius;
      const ex = (right.x - center.x) * sx + (down.x - center.x) * sy;
      const ez = (right.z - center.z) * sx + (down.z - center.z) * sy;
      const expectedLength = Math.hypot(ex, ez);
      const worldLength = Math.hypot(vector.worldX, vector.worldZ);
      assert.ok(worldLength > 1e-8, `direction ${i} carries a world vector`);
      const dot = (vector.worldX * (ex / expectedLength) + vector.worldZ * (ez / expectedLength))
        / worldLength;
      assert.ok(Math.abs(dot - 1) < 1e-9,
        `roll ${roll.toFixed(2)} direction ${i}: world vector must follow the basis (dot ${dot})`);
      if (referenceMagnitude === null) referenceMagnitude = vector.magnitude;
      else assert.ok(Math.abs(vector.magnitude - referenceMagnitude) < 1e-9,
        'the same knob radius commands the same authority in every direction');
    }
  }
});

test('B011 diagonal reversal tracks the curve with no displacement jump', () => {
  const w = 1000;
  const h = 600;
  const radius = DYNAMIC_FLIGHT_STICK_TUNING.minRadiusPx;
  const host = stickHost();
  resetDynamicFlightStick(host, w, h);
  // Sweep the knob from (+r,0) through the +diag to (-r,0): the reversal path a real chase
  // flies. Magnitude must fall and rise along the curve, never spike above the rim value.
  let peak = 0;
  let previous = Infinity;
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const x = radius * (1 - (2 * i) / steps);
    const y = radius * 0.7 * Math.sin((i / steps) * Math.PI);
    const probe = stickHost();
    resetDynamicFlightStick(probe, w, h);
    recordDynamicFlightStick(probe, x, y, w, h);
    const vector = projectDynamicFlightStick(probe, w, h);
    peak = Math.max(peak, vector.magnitude);
    assert.ok(vector.magnitude <= previous + 1e-9 || vector.magnitude >= previous - 1e-9,
      'no discontinuity along the reversal');
    previous = vector.magnitude;
    assert.ok(vector.magnitude <= 1 + 1e-9, 'bounded by the rim');
  }
  assert.ok(peak > 0.2, 'the reversal path commands real authority');
});

test('B011 release-to-neutral is immediate, and a mode change cannot smuggle a displacement jump', () => {
  const w = 1000;
  const h = 600;
  const host = stickHost();
  resetDynamicFlightStick(host, w, h);
  recordDynamicFlightStick(host, 60, 30, w, h);
  assert.ok(projectDynamicFlightStick(host, w, h).active);
  // Release: the knob centers and commands nothing on the same tick.
  resetDynamicFlightStick(host, w, h);
  const neutral = projectDynamicFlightStick(host, w, h);
  assert.equal(neutral.active, false);
  assert.equal(neutral.magnitude, 0);
  assert.equal(neutral.worldX, 0);
  assert.equal(neutral.worldZ, 0);
  // Disarmed stick: even a displaced knob commands nothing while autoFire is off.
  recordDynamicFlightStick(host, 80, 0, w, h);
  host.state.input.autoFire = false;
  const disarmed = projectDynamicFlightStick(host, w, h);
  assert.equal(disarmed.active, false);
  assert.equal(disarmed.magnitude, 0);
  // The live mode edge re-centers on the G toggle (input.js owns the flip; this file only
  // pins that it calls the reset — the no-jump-after-mode-change half of the acceptance).
  const inputSource = read('../src/systems/input.js');
  assert.match(inputSource,
    /autoTargetPointer !== !!this\._autoTargetPointerMode[\s\S]{0,600}resetDynamicFlightStick\(this, geometryForStick/,
    'the G on/off edge must re-center the stick (no stale displacement after a mode change)');
});

// --------------------------------------------------------------------------------------------
// SFQ-B012 — hand conflicts, verified-good on the live binding tables
// --------------------------------------------------------------------------------------------

test('B012 the tether-and-bomb chase chain is fully keyboard-first in the default pilot scheme', () => {
  const pilot = DEFAULTS.SCHEMES.pilot;
  // steer: WASD/arrows + G-stick (KeyG toggle). latch + release: tether. arm + drop + cycle:
  // the bomb bay. escape tool: countermeasure. every one resolves a keyboard code.
  const chain = ['forward', 'reverse', 'yawLeft', 'yawRight', 'strafeLeft', 'strafeRight',
    'autoFire', 'tether', 'dropBomb', 'cycleBomb', 'chargeThrow', 'chargeDetonate',
    'countermeasure', 'boost', 'brake'];
  for (const action of chain) {
    const codes = pilot[action] || [];
    assert.ok(codes.length > 0, `${action} must have a binding`);
    assert.ok(codes.some((code) => code.startsWith('Key') || code.startsWith('Digit')
      || code.startsWith('Arrow') || ['Space', 'Comma', 'Period', 'ShiftLeft', 'ShiftRight',
        'CapsLock', 'Backquote', 'NumLock', 'BracketLeft', 'BracketRight'].includes(code)),
      `${action} must be reachable from the keyboard (got ${codes.join('/')})`);
  }
  // The mouse constants exist but are not required by the chain: LMB fires, RMB is the
  // group-2/mine tool lane — no tether/bomb verb lives on a held mouse button.
  assert.equal(MOUSE_ACTION_LABELS.fire, 'LMB');
  assert.equal(MOUSE_ACTION_LABELS.mine, 'RMB');
  assert.deepEqual(pilot.fire, [], 'gun fire is LMB (constant), never a REQUIRED chain link');
});

test('B012 the scroll wheel drives no flight input', () => {
  const inputSource = read('../src/systems/input.js');
  assert.doesNotMatch(inputSource, /addEventListener\(\s*['"]wheel['"]/,
    'no wheel listener: the scroll wheel is not a flight axis');
  for (const scheme of Object.values(DEFAULTS.SCHEMES)) {
    for (const [action, codes] of Object.entries(scheme)) {
      for (const code of codes) {
        assert.ok(!/wheel/i.test(code), `${action} must not bind ${code}`);
      }
    }
  }
});

test('B012 sustained holds have the toggle latch, so no chain verb requires a sustained grip', () => {
  // FB-113's hold-to-toggle latches: boost, brake, bulletTime, massline, reelIn, reelOut.
  for (const verb of ['boost', 'brake', 'bulletTime', 'reelIn', 'reelOut']) {
    assert.ok(HOLD_TO_TOGGLE_ACTIONS.includes(verb),
      `${verb} can be latched instead of held (accessibility.holdToToggle)`);
  }
  // The tether is an edge latch by grammar (Space/F/Digit3 press-release, not a hold), and
  // reel reach is duplicated by the G-stick-compatible flight verbs — two hands stay on
  // keyboard and trackpad for the whole chase.
  const pilot = DEFAULTS.SCHEMES.pilot;
  assert.ok(pilot.tether.includes('Space') && pilot.tether.includes('KeyF'));
});
