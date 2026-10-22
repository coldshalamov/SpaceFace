// build_map §34 row 525 — Quiet: juggling runners, decoy pods, the Swap (E-07),
// sold routes, and the Hush Head stamp row 513 reads.
import assert from 'node:assert/strict';
import test from 'node:test';

import { faction as QUIET } from '../src/data/factions/quiet.js';
import * as SWAP from '../src/data/encounters/702-the-swap.js';

function makeState() {
  return { entities: new Map(), simTime: 0, tick: 0, player: null, playerId: 'player', story: { flags: {} } };
}

let seq = 0;
function spawn(state, spec) {
  const e = {
    id: spec.id || `e${++seq}`,
    alive: true,
    pos: { x: spec.x || 0, z: spec.z || 0 },
    vel: { x: spec.vx || 0, z: spec.vz || 0 },
    mass: spec.mass || 0,
    radius: spec.radius || 4,
    type: spec.type || 'ship',
    factionId: spec.factionId || null,
    data: spec.data || {},
  };
  state.entities.set(e.id, e);
  return e;
}

test('Quiet kit declares runners, decoy pods, Hush Head, sold routes and the Swap', () => {
  const roles = QUIET.shipRoles.map((r) => r.role);
  for (const r of ['runner', 'relay-buoy']) assert.ok(roles.includes(r), `shipRoles includes ${r}`);
  assert.ok(QUIET.custom.juggling.throws >= 2, 'the second throw carries the real crate');
  assert.ok(QUIET.custom.juggling.windupS > 0 && QUIET.custom.juggling.handoffFlightS > 0);
  assert.ok(QUIET.custom.decoyPods.spoofMassT > 0);
  assert.equal(QUIET.custom.hushHead.heldStamp, 'signatureHidden', 'row 513 reads this stamp');
  assert.equal(QUIET.custom.soldRoutes.markFlag, 'quiet_sold_route');
  assert.equal(QUIET.custom.theSwap.encounterId, 'the_swap');
});

// ── The Swap (E-07) — stub director; the test integrates the flying crate like physics does ──

function makeHarness() {
  const state = makeState();
  state.player = { id: 'player', alive: true, pos: { x: 0, z: 400 }, mass: 55, data: {} };
  const events = [];
  const grants = [];
  const reps = [];
  const live = {
    id: 'enc3', shapeId: 'the_swap', squadId: 'sq3', sectorId: 'sector_pallas_drift',
    plan: {
      zoneCenter: { x: 0, z: 0 },
      ships: [{ role: 'squad', pos: {} }, { role: 'escort', pos: {} }],
    },
    anchor: null, roles: {}, ids: [], data: {}, vars: {},
    shape: SWAP.default, phase: 'pending', deadlineAt: 0,
  };
  const d = {
    state,
    now: () => state.simTime,
    player: () => state.player,
    stream: () => () => 0.5,
    spawnShips: (lv, ships) => ships.map((sh) => {
      const e = spawn(state, { x: sh.pos.x, z: sh.pos.z, mass: 40, factionId: 'faction_quiet', data: { ai: {} } });
      lv.roles[e.id] = sh.role; lv.ids.push(e.id);
      return e.id;
    }),
    entsOf: (lv, role) => lv.ids.map((id) => state.entities.get(id)).filter((e) => e && (!role || lv.roles[e.id] === role)),
    spawnCargoPod: (lv, spec) => {
      const e = spawn(state, {
        x: spec.pos.x, z: spec.pos.z, mass: spec.unitMass * spec.amount,
        type: 'pickup', factionId: spec.factionId,
        data: { kind: 'cargo', commodityId: spec.commodityId, amount: spec.amount },
      });
      lv.roles[e.id] = 'freight_pod'; lv.ids.push(e.id);
      return e;
    },
    say: () => true,
    emit: (name, payload) => events.push({ name, payload }),
    grant: (amt, reason) => grants.push({ amount: amt, reason }),
    rep: (f, delta, reason) => reps.push({ factionId: f, delta, reason }),
    resolve: (lv, outcome) => { lv.phase = 'done'; lv.outcome = outcome; },
    abort: (lv, reason) => { lv.phase = 'done'; lv.outcome = `abort:${reason}`; },
  };
  return { state, d, live, events, grants, reps };
}

function tickS(h, seconds, integrate = true) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    h.state.simTime += dt;
    if (integrate) {
      for (const e of h.state.entities.values()) {
        if (e.alive === false || !e.pos || !e.vel) continue;
        if (e.type === 'pickup' && e.data && e.data.flight) {
          e.pos.x += e.vel.x * dt;
          e.pos.z += e.vel.z * dt;
        }
      }
    }
    SWAP.runtime.tick(h.d, h.live, h.state, h.state.simTime);
    if (h.live.phase === 'done') break;
  }
}

function latch(h, crateId) {
  SWAP.runtime.event(h.d, h.live, h.state, 'tetherAttached', {
    actorId: 'player', targetId: crateId, attachmentId: 'att1',
  });
}

test('the Swap fires: two runners stand off, a decoy and a sealed crate between them', () => {
  const h = makeHarness();
  SWAP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.swap;
  const a = h.state.entities.get(rec.runnerAId);
  const b = h.state.entities.get(rec.runnerBId);
  assert.ok(Math.abs(a.pos.x - b.pos.x) > 700, 'the runners stand off across the field');
  const decoy = h.state.entities.get(rec.decoyId);
  const real = h.state.entities.get(rec.realId);
  assert.equal(decoy.data.swapDecoy, true);
  assert.equal(decoy.data.decoySpoofMassT, QUIET.custom.decoyPods.spoofMassT, 'the decoy reads heavy');
  assert.equal(real.data.swapReal, true);
  assert.equal(rec.phase, 'windup');
});

test('the first throw is the decoy — catch it and you bought ballast and a sold route', () => {
  const h = makeHarness();
  SWAP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.swap;
  tickS(h, QUIET.custom.juggling.windupS + 0.3, false);
  assert.equal(rec.phase, 'flight1', 'the windup released the first throw');
  const decoy = h.state.entities.get(rec.decoyId);
  assert.ok(decoy.data.flight, 'the decoy is in the air');
  latch(h, rec.decoyId);
  assert.equal(h.live.outcome, 'decoy_caught');
  assert.equal(h.state.story.flags.quiet_sold_route.reason, 'player_interference',
    'the Quiet sold your route for the trouble');
  assert.ok(h.events.some((e) => e.name === 'quiet:routeSold'));
});

test('the second throw carries the real crate — catch it mid-air for the clean shot', () => {
  const h = makeHarness();
  SWAP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.swap;
  tickS(h, QUIET.custom.juggling.windupS + 0.3, false);
  // Let the decoy fly its full arc and land on runner B.
  tickS(h, QUIET.custom.juggling.handoffFlightS + 0.4);
  assert.equal(rec.phase, 'beat');
  tickS(h, 1.3, false);
  assert.equal(rec.phase, 'flight2', 'the real crate is in the air on the second throw');
  const real = h.state.entities.get(rec.realId);
  assert.ok(real.data.flight);
  latch(h, rec.realId);
  assert.equal(h.live.outcome, 'crate_caught');
  assert.ok(h.grants.some((g) => g.reason === 'the_swap_real_crate' && g.amount === QUIET.custom.theSwap.realCrateValueCr));
  assert.ok(h.reps.some((r) => r.reason === 'the_swap_crate_caught'));
});

test('let both throws land and the handoff completes — your route is already sold', () => {
  const h = makeHarness();
  SWAP.runtime.fire(h.d, h.live, h.state);
  tickS(h, QUIET.custom.juggling.windupS + QUIET.custom.juggling.handoffFlightS * 2 + 4);
  assert.equal(h.live.outcome, 'swap_completed');
  assert.equal(h.state.story.flags.quiet_sold_route.reason, 'swap_completed');
});

test('put a runner down and the Quiet files the route and the debt', () => {
  const h = makeHarness();
  SWAP.runtime.fire(h.d, h.live, h.state);
  const rec = h.live.data.swap;
  SWAP.runtime.event(h.d, h.live, h.state, 'squadKill', { id: rec.runnerAId, byPlayer: true });
  assert.equal(h.live.outcome, 'runner_downed');
  assert.ok(h.reps.some((r) => r.delta === -3));
  assert.ok(h.state.story.flags.quiet_sold_route);
});
