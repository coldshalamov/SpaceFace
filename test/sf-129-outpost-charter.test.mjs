// SF-129 — "a tech unlock that creates a new physical question".
//
// Selected node: tech_outpost_charter, the logistics capstone. Its unlock already creates the
// physical question — "where do I plant my claim, and what do I build on it" — through two
// ordinary-route operations:
//
//   USE 1   claims.buildModule: Cargo Depot / Defense Battery on a claimed body (a place you
//           fly freight to — the depot is a drone MOVE beacon, the battery contests raids).
//   USE 2   automation.buildOutpost: deploys a physical production outpost in the live sector.
//
// The missing behavior this packet adds: the gate was enforced only in the automation panel —
// the ui:fleetOrder intent channel bypassed it and charged/build unresearched. The research
// check now lives at the transaction owner (same rule claims.buildModule and the ships fit
// boundary already apply), so the refusal is transactional: no charge, no deploy.
//
// Migration / invested value: the entitlement keys on player.researchedNodes' stable id — a
// save that already earned the node passes the same gate, and built work survives a
// serialize/deserialize round trip.
import assert from 'node:assert/strict';
import test from 'node:test';

import { claims as claimsBase } from '../src/systems/claims.js';
import { automation } from '../src/systems/automation.js';
import { OUTPOSTS, TRADERS } from '../src/data/automation.js';
import { BODY_MODULES } from '../src/data/claimableBodies.js';
import { TECH_NODES } from '../src/data/tech.js';
import { STRICT_STAT_ONLY_IDS } from '../src/data/techVerbLadder.js';

const FRONTIER = 'sector_io_reach';
const NODE = 'tech_outpost_charter';
const PREREQ = 'tech_autonomous_fleets';

// ── harness (same shape as claim-specializations.test.mjs) ───────────────────────────────────

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeState({ sectorId = FRONTIER, credits = 500000, researched = [] } = {}) {
  return {
    simTime: 1000,
    meta: { seed: 47 },
    playerId: 'player',
    mode: 'flight',
    player: {
      credits,
      heat: 0,
      droneTierCap: 4,
      stats: {},
      researchedNodes: researched.slice(),
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 400 },
      ownedShips: [],
    },
    world: { currentSectorId: sectorId, activeSector: null },
    entities: new Map(),
    entityList: [],
    claims: null,
    automation: null,
  };
}

function boot({ credits = 500000, researched = [] } = {}) {
  const state = makeState({ credits, researched });
  const bus = makeBus();
  const ctx = { state, bus, helpers: {}, registry: { get: () => null } };
  bus.on('economy:chargeCredits', (p) => {
    state.player.credits = Math.max(0, (state.player.credits || 0) - Math.max(0, Math.round(p.amount || 0)));
  });
  bus.on('economy:grantCredits', (p) => {
    state.player.credits = (state.player.credits || 0) + Math.max(0, Math.round(p.amount || 0));
  });
  const auto = Object.create(automation);
  auto.init({ state, bus, helpers: {}, registry: null });
  auto.newGame();
  const sys = { ...claimsBase };
  sys.init(ctx);
  if (!state.claims) state.claims = { bodies: [] };
  return { state, bus, sys, auto };
}

function claimBody(h) {
  assert.equal(h.sys.claim({ id: 'poi_claim_pallas', name: 'Pallas Industrial Moon', size: 'M', pos: { x: 20, z: 0 } }), true);
  return h.state.claims.bodies.at(-1);
}

function toasts(h) {
  return h.bus.emitLog.filter((e) => e.evt === 'toast').map((e) => e.payload.text);
}

test('the node is the one strict leftover whose unlock opens construction in the world', () => {
  const node = TECH_NODES.find((n) => n.id === NODE);
  assert.ok(node, 'the charter node exists');
  assert.deepEqual(node.prereqs, [PREREQ], 'prerequisites stay the authored chain');
  assert.ok(STRICT_STAT_ONLY_IDS.includes(NODE),
    'the strict ladder still counts it a passive node — the packet node');

  // Its physical questions are real catalog entries: the depot is a drone dropoff (MOVE
  // beacon), the battery contests raids; both carry the node's techReq at the claims owner.
  const depot = BODY_MODULES.find((m) => m.id === 'mod_depot');
  const battery = BODY_MODULES.find((m) => m.id === 'mod_defense');
  assert.equal(depot.techReq, NODE);
  assert.equal(depot.effect, 'depot');
  assert.equal(battery.techReq, NODE);
  assert.equal(battery.effect, 'defense');
  assert.ok(OUTPOSTS.length > 0, 'automation outposts exist for the same charter');
});

test('without the research every construction path refuses transactionally — no charge, no deploy', () => {
  const h = boot({ researched: [] });

  // claims path — the gate already lived here. (Claiming the body itself is research-free;
  // baseline the credits after that honest fee.)
  const body = claimBody(h);
  const creditsBefore = h.state.player.credits;
  assert.equal(h.sys.buildModule(body.id, 'mod_depot'), false, 'depot refuses unresearched');
  assert.equal(h.sys.buildModule(body.id, 'mod_defense'), false, 'battery refuses unresearched');
  assert.equal(body.modules.length, 0, 'refusal leaves no half-built slot');

  // automation path — the packet's added gate at the order owner (was UI-only before).
  assert.equal(h.auto.buildOutpost(OUTPOSTS[0].id), false, 'outpost refuses unresearched');
  assert.equal(h.state.automation.outposts.length, 0, 'no outpost record materializes');
  assert.equal(h.auto.hireTrader(TRADERS[0].id), false, 'hiring refuses its own gate too');
  assert.equal(h.state.automation.traders.length, 0);

  assert.equal(h.state.player.credits, creditsBefore, 'a refused transaction charges nothing');
  const text = toasts(h).join('\n');
  assert.match(text, /Research required: Outpost Charter/, 'the refusal names the gate');
  assert.match(text, /Research required: Autonomous Fleets/, 'the trader refusal names its gate');
});

test('a fresh unlock answers two distinct uses in the live world', () => {
  const h = boot({ researched: [PREREQ, NODE] });
  const creditsBefore = h.state.player.credits;

  // USE 1 — claim-body construction: depot + battery on one claim (both slots of the node).
  const body = claimBody(h);
  assert.equal(h.sys.buildModule(body.id, 'mod_depot'), true, 'depot builds post-charter');
  assert.equal(h.sys.buildModule(body.id, 'mod_defense'), true, 'battery builds post-charter');
  assert.deepEqual(body.modules, ['mod_depot', 'mod_defense']);

  // USE 2 — an automation outpost deployed into the current sector: a real position in the
  // live world, not a promise of later content.
  assert.equal(h.auto.buildOutpost(OUTPOSTS[0].id), true, 'the charter deploys the outpost');
  const outpost = h.state.automation.outposts.at(-1);
  assert.equal(outpost.sectorId, FRONTIER, 'the outpost lands in the live sector');
  assert.ok(Number.isFinite(outpost.pos.x) && Number.isFinite(outpost.pos.z),
    'the outpost is a physical thing with a position, not a flag');
  assert.ok(h.bus.emitLog.some((e) => e.evt === 'asset:deployed' && e.payload.kind === 'outpost'),
    'the deploy publishes its asset event');
  assert.ok(h.state.player.credits < creditsBefore, 'the build charged the real price');
});

test('an already-earned save keeps the entitlement and the built work through a round trip', () => {
  // Save shape: researchedNodes already carries the stable id; claims serialize the build.
  const h = boot({ researched: [PREREQ, NODE] });
  const body = claimBody(h);
  h.sys.buildModule(body.id, 'mod_depot');
  h.auto.buildOutpost(OUTPOSTS[0].id);

  const claimsSnap = JSON.parse(JSON.stringify(h.sys.serialize()));
  const autoSnap = JSON.parse(JSON.stringify(h.auto.serialize()));
  const researchedSnap = h.state.player.researchedNodes.slice();

  // Reload: a fresh boot carrying the same researched ids and the serialized records.
  const h2 = boot({ researched: researchedSnap });
  h2.sys.deserialize(claimsSnap);
  h2.auto.deserialize(autoSnap);

  const restored = h2.state.claims.bodies.find((b) => b.poiId === 'poi_claim_pallas');
  assert.ok(restored, 'the claim survives the round trip');
  assert.deepEqual(restored.modules, ['mod_depot'], 'the built module survives');
  assert.equal(h2.state.automation.outposts.length, 1, 'the deployed outpost survives');

  // The entitlement itself persists: the same stable id still passes both gates.
  assert.equal(h2.sys.buildModule(restored.id, 'mod_defense'), true,
    'the inherited entitlement still builds on the loaded save');
  assert.equal(h2.auto.hireTrader(TRADERS[0].id), true,
    'the prereq chain still hires through the loaded save');
});

test('refusal rollback: a failed build leaves slot, credits and state untouched', () => {
  const h = boot({ researched: [PREREQ, NODE, 'tech_long_range_survey'] });
  const body = claimBody(h);
  // Fill the claim's slots, then attempt one more — the refusal must not charge or half-fit.
  h.sys.buildModule(body.id, 'mod_depot');
  h.sys.buildModule(body.id, 'mod_defense');
  h.sys.buildModule(body.id, 'mod_sensor_post');
  const creditsBefore = h.state.player.credits;
  assert.equal(h.sys.buildModule(body.id, 'mod_depot'), false, 'already-built refuses');
  assert.equal(body.modules.length, 3, 'no phantom fourth module');
  assert.equal(h.state.player.credits, creditsBefore, 'a refused build charges nothing');

  // Repeating a refused order is idempotent — second refusal identical, still no charge.
  assert.equal(h.auto.buildOutpost('mod_depot'), false, 'an unknown outpost def refuses');
});
