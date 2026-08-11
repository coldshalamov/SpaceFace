/**
 * U13 / WF-15 — dense-scene camera + feel legibility (focused unit tests).
 *
 * Pins the three framing/timing repairs that make swarm combat readable without dimming
 * spectacle or damping camera energy:
 *   H1  peak-preserving FOV punch rise-rate (feel.js)
 *   H2  composition geometry uses base FOV, not punched cam.fov (camera.js)
 *   H3  active-attacker look-ahead attenuation + sticky threat composition (camera.js)
 *   H4  conservative minZoom survives safe-rect clamp (camera.js)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACTIVE_ATTACKER_LOOKAHEAD_SCALE,
  COMPOSITION_THREAT_STICK_S,
  createChaseCamera,
  playerHasActiveAttackerFraming,
  resolveChaseComposition,
} from '../src/render/camera.js';
import {
  addFovPunch,
  FOV_PUNCH_CAP,
  FOV_PUNCH_RISE_RATE,
  stepFovPunch,
} from '../src/render/feel.js';

const DT = 1 / 60;
const FOV = 50;
const ASPECT = 16 / 9;
const TILT = 60;

function ship(id, x, z, team = 1, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    hull: 100,
    team,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: extras.radius ?? 6,
    maxSpeed: 120,
    bank: 0,
    data: {
      encounter: team !== 0 ? { id: `u13-test-${id}` } : undefined,
      combat: extras.combat ?? (team !== 0 ? { targetId: 1, lockTarget: 1 } : null),
    },
  };
}

function stateWith(player, others = []) {
  return {
    playerId: player.id,
    entities: new Map([[player.id, player], ...others.map((o) => [o.id, o])]),
    player: {
      cruise: null,
      tether: { active: false, targetId: null },
      flybyFocus: { active: false, targetId: null },
    },
    settings: { video: { fov: FOV, motionReduce: false } },
    camera: { zoom: 144, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    combat: { attachments: { byId: {} } },
  };
}

// ── H1: FOV punch peak preserved, rate bounded ────────────────────────────────

test('H1: FOV punch reaches full authored peak before decaying', () => {
  let env = 0;
  let app = 0;
  env = addFovPunch(env, 2.2, FOV_PUNCH_CAP);
  let peak = 0;
  // 200 ms is enough for a 2.2° punch at 28 deg/s (~79 ms to peak).
  for (let i = 0; i < 20; i++) {
    const s = stepFovPunch(env, app, DT);
    env = s.envelope;
    app = s.applied;
    peak = Math.max(peak, app);
  }
  assert.ok(peak >= 2.15, `authored 2.2° peak must land (got ${peak.toFixed(3)})`);
});

test('H1: dense recoil+hit stacking never exceeds FOV_PUNCH_RISE_RATE on the camera', () => {
  let env = 0;
  let app = 0;
  let maxRate = 0;
  for (let f = 0; f < 120; f++) {
    if (f % 6 === 0) env = addFovPunch(env, 0.9, FOV_PUNCH_CAP);
    if (f % 18 === 0) env = addFovPunch(env, 2.2, FOV_PUNCH_CAP);
    const prev = app;
    const s = stepFovPunch(env, app, DT);
    env = s.envelope;
    app = s.applied;
    maxRate = Math.max(maxRate, Math.abs(app - prev) / DT);
  }
  // Small epsilon for float; the integrator is a hard rate clamp.
  assert.ok(maxRate <= FOV_PUNCH_RISE_RATE + 1e-6,
    `applied FOV rate ${maxRate.toFixed(2)} deg/s must stay ≤ rise rate ${FOV_PUNCH_RISE_RATE}`);
  assert.ok(app > 0 || env >= 0, 'integrator remains well-defined under dense fire');
});

// ── H2 / H4: composition FOV + conservative minZoom ───────────────────────────

test('H2: punched view.fov must not shrink active-attacker minZoom vs base FOV', () => {
  const player = ship(1, 0, 0, 0);
  const attacker = ship(2, 120, 0, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const state = stateWith(player, [attacker]);

  const base = resolveChaseComposition(state, player, { x: 0, z: 0 }, {
    fov: FOV,
    baseFov: FOV,
    aspect: ASPECT,
    tiltDeg: TILT,
  });
  const punched = resolveChaseComposition(state, player, { x: 0, z: 0 }, {
    // If the integrator mistakenly preferred view.fov over baseFov, a wide punch would under-zoom.
    fov: FOV + 8,
    baseFov: FOV,
    aspect: ASPECT,
    tiltDeg: TILT,
  });
  assert.ok(base.minZoom > 0, 'active attacker must demand a containment floor');
  assert.ok(Math.abs(base.minZoom - punched.minZoom) < 1e-6,
    `minZoom must key off baseFov (base=${base.minZoom.toFixed(2)} punchedView=${punched.minZoom.toFixed(2)})`);
});

test('H4: active-attacker minZoom fits the threat even if focus were player-centered', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const attacker = ship(2, 140, 20, 1, { combat: { targetId: 1, lockTarget: 1 }, radius: 6 });
  const state = stateWith(player, [attacker]);
  const composition = resolveChaseComposition(state, player, { x: 0, z: 0 }, {
    fov: FOV,
    baseFov: FOV,
    aspect: ASPECT,
    tiltDeg: TILT,
  });
  assert.equal(composition.hasActiveAttacker, true);
  // Player-centered fit for a ~140 WU attacker at SAFE_NDC 0.55 needs well above the 144 WU default.
  assert.ok(composition.minZoom > 160,
    `conservative minZoom should open past default framing (got ${composition.minZoom.toFixed(1)})`);
});

// ── H3: sticky threat + look-ahead gate ───────────────────────────────────────

test('H3: sticky composition holds a threat through a brief nearer challenger blip', () => {
  const player = ship(1, 0, 0, 0);
  const a = ship(2, 80, 0, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const b = ship(3, 90, 0, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const state = stateWith(player, [a, b]);
  const sticky = { id: null, remainS: 0, wasActive: false };
  const view = { fov: FOV, baseFov: FOV, aspect: ASPECT, tiltDeg: TILT, dt: DT };

  const first = resolveChaseComposition(state, player, { x: 0, z: 0 }, view, null, null, sticky);
  assert.equal(first.composedThreatId, 2, 'nearest active attacker wins initially');
  assert.ok(sticky.remainS > 0, 'sticky hold arms after first composition');

  // Blip: B teleports slightly closer for one frame, but not under the 85% closer-break threshold
  // (80 * 0.85 = 68; place B at 75 so it is nearer but does not break stick).
  b.pos.x = 75;
  const held = resolveChaseComposition(state, player, { x: 0, z: 0 }, view, null, null, sticky);
  assert.equal(held.composedThreatId, 2,
    'sticky must hold A through a non-decisive nearer blip (got ' + held.composedThreatId + ')');

  // Decisive closer break: well under 85% of sticky distance.
  b.pos.x = 40;
  const broken = resolveChaseComposition(state, player, { x: 0, z: 0 }, view, null, null, sticky);
  assert.equal(broken.composedThreatId, 3, 'meaningfully closer attacker breaks the sticky hold');
});

test('H3: playerHasActiveAttackerFraming is true when a hostile locks the player', () => {
  const player = ship(1, 0, 0, 0);
  const attacker = ship(2, 60, 0, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const ambient = ship(3, 60, 0, 1, { combat: { targetId: null, lockTarget: null } });
  assert.equal(playerHasActiveAttackerFraming(stateWith(player, [attacker]), player), true);
  assert.equal(playerHasActiveAttackerFraming(stateWith(player, [ambient]), player), false);
  assert.ok(ACTIVE_ATTACKER_LOOKAHEAD_SCALE > 0 && ACTIVE_ATTACKER_LOOKAHEAD_SCALE < 1,
    'combat look-ahead scale must attenuate without zeroing pilot motion');
  assert.ok(COMPOSITION_THREAT_STICK_S > 0.1 && COMPOSITION_THREAT_STICK_S < 0.6,
    'sticky hold is a short furball stabilizer, not a camera lock');
});

test('H3: chase follow keeps an active attacker inside the pair safe frame during a dodge', () => {
  globalThis.window = { innerWidth: 1600, innerHeight: 1000 };
  const player = ship(1, 0, 0, 0, { radius: 7 });
  player.vel = { x: 90, z: 20 };
  const attacker = ship(2, 110, 10, 1, { combat: { targetId: 1, lockTarget: 1 }, radius: 6 });
  const state = stateWith(player, [attacker]);
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  for (let i = 0; i < 90; i++) {
    player.pos.x += player.vel.x * DT;
    player.pos.z += player.vel.z * DT;
    // Lateral dodge — the failure mode where full look-ahead used to abandon the attacker.
    player.vel.x = 90 * Math.cos(i * 0.08);
    player.vel.z = 40 * Math.sin(i * 0.11);
    camera.follow(DT);
  }
  const fx = state.camera.focus.x;
  const fz = state.camera.focus.z;
  const zoom = Math.hypot(
    camera.obj.position.x - fx,
    camera.obj.position.y,
    camera.obj.position.z - fz,
  );
  const tilt = TILT * Math.PI / 180;
  const tanHalf = Math.tan(FOV * Math.PI / 360);
  const dx = Math.abs(attacker.pos.x - fx) + attacker.radius;
  const dz = Math.abs(attacker.pos.z - fz);
  const depth = Math.max(8, zoom - (Math.cos(tilt) * dz + attacker.radius));
  const ndc = Math.max(
    dx / (depth * tanHalf * ASPECT),
    (Math.sin(tilt) * dz + attacker.radius) / (depth * tanHalf),
  );
  assert.ok(ndc <= 0.80 + 1e-3,
    `active attacker must stay in pair safe frame during dodge (ndc=${ndc.toFixed(3)}, zoom=${zoom.toFixed(1)})`);
});
