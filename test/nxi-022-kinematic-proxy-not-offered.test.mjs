// NXI-022 — a scripted machine proxy is never offered as throwable cargo; the loose payload
// beside it is. Seed 4242. Eligibility truth through the one owner (tetherGameplay.isAttachable),
// which feeds both the advertised acquisition receipt and the latch commit.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/core/rng.js';
import { isAttachable, survivalRoundWreckLatchLegal } from '../src/systems/tetherGameplay.js';

const SEED = 4242;

const base = (id, type, x, z, extra = {}) => ({
  id,
  type,
  alive: true,
  pos: { x, z },
  vel: { x: 0, z: 0 },
  radius: extra.radius ?? 10,
  mass: extra.mass ?? 500,
  ...extra.body !== undefined ? {} : { physicsBody: { dynamic: true, radius: extra.radius ?? 10, mass: extra.mass ?? 500 } },
  data: extra.data || {},
  ...(extra.top || {}),
});

const state = () => ({
  seed: SEED,
  tick: 120,
  simTime: 120 / 60,
  rng: mulberry32(SEED),
  playerId: 1,
  entities: new Map(),
  run: { phase: 'active', wave: 2 },
});

test('NXI-022 a world-site machine proxy is not offered in either body shape', () => {
  const s = state();
  // Non-solid component proxy: pose owned by the site runtime, no physics body at all.
  const ghost = base('site-kiln', 'wreck', 120, 0, {
    data: { role: 'world_site_component', kind: 'world_site_component', worldSiteComponentId: 'kiln_a', worldSiteTargetable: true },
    body: false,
  });
  ghost.physicsBody = false;
  assert.equal(isAttachable(ghost, 1, s), false, 'a physicsBody:false machine proxy is never a tow candidate');

  // Solid component proxy: kinematic body (material 'station', mass 1e9) — still site machinery.
  const solid = base('site-press', 'wreck', 120, 0, {
    radius: 30,
    data: { role: 'world_site_component', kind: 'world_site_component', worldSiteComponentId: 'press_b', worldSiteTargetable: true },
    body: false,
  });
  solid.physicsBody = { dynamic: false, radius: 30, mass: 1e9, inertiaY: 1e9, material: 'station' };
  assert.equal(isAttachable(solid, 1, s), false, 'a solid kinematic machine proxy is still not tow cargo');

  // The collision proxy never was a latch target and stays denied.
  const collision = base('site-shell', 'wreck', 120, 0, {
    data: { role: 'world_site_collision', kind: 'world_site_collision', worldSiteCollisionProxyId: 'shell' },
    body: false,
  });
  collision.physicsBody = false;
  assert.equal(isAttachable(collision, 1, s), false);
});

test('NXI-022 scripted pose classes outside the sites are denied too', () => {
  const s = state();
  const machine = base('precursor-1', 'machine', 90, 0, { body: false, data: { machine: { kind: 'loom' } } });
  machine.physicsBody = false;
  assert.equal(isAttachable(machine, 1, s), false, 'a precursor machine ignores damage and physics alike');

  const fauna = base('fauna-1', 'fauna', 90, 0, { body: false });
  fauna.physicsBody = false;
  assert.equal(isAttachable(fauna, 1, s), false, 'fauna swim on their own brain, not on the line');

  const laneActor = base('lane-1', 'freighter', 90, 0, { mass: 1e5, body: false, data: { parentType: 'lane_traffic' } });
  laneActor.physicsBody = false;
  assert.equal(isAttachable(laneActor, 1, s), false, 'closed-form route visuals advance by script');
});

test('NXI-022 the loose payload beside the machine is offered', () => {
  const s = state();
  // The NXB-006 released site payload: sensor body, real dynamics, scanner-targetable.
  const payload = base('payload-1', 'payload', 118, 4, {
    radius: 7,
    mass: 24,
    data: {
      role: 'world_site_payload',
      kind: 'payload',
      worldSiteTargetable: true,
      worldSitePayloadId: 'lot_ore',
      salvagePool: { ore_raw: 3 },
    },
  });
  payload.collides = false;
  assert.equal(isAttachable(payload, 1, s), true, 'the actual loose payload beside the machine stays offered');
});

test('NXI-022 neighboring successes keep latching', () => {
  const s = state();
  // Anchoring to big immovable masses is core play — real kinematic body objects stay legal.
  const station = base('station-1', 'station', 300, 0, { radius: 60, mass: 1e9 });
  station.physicsBody = { dynamic: false, radius: 60, mass: 1e9, material: 'station' };
  assert.equal(isAttachable(station, 1, s), true);

  const asteroid = base('ast-1', 'asteroid', 140, 0, { radius: 26, mass: 900 });
  asteroid.physicsBody = { radius: 26 };
  assert.equal(isAttachable(asteroid, 1, s), true);

  const mine = base('mine-1', 'mine', 60, 0, { radius: 4, mass: 12, data: { masslineTetherable: true } });
  assert.equal(isAttachable(mine, 1, s), true);

  const beacon = base('beacon-1', 'beacon', 60, 0, { radius: 5, mass: 1e6, data: { masslineTetherable: true } });
  assert.equal(isAttachable(beacon, 1, s), true);

  const wreck = base('wreck-1', 'wreck', 150, 0, { radius: 18, mass: 260 });
  assert.equal(isAttachable(wreck, 1, s), true);

  // VERB-12 — a wreck made in this survival round stays latchable ahead of the shop.
  const fresh = base('wreck-fresh', 'wreck', 150, 0, { radius: 18, mass: 260, data: { runCohort: 'survival', runWave: 2 } });
  assert.equal(survivalRoundWreckLatchLegal(fresh, s), true);
  assert.equal(isAttachable(fresh, 1, s), true);
});
