// build_map §34 row 515 — Concord: commanders, rigid formations, Clamp Tender (cargo only),
// Scale Barge, and The Weighing (E-04) playable three ways + pay/bluff/run.
import assert from 'node:assert/strict';
import test from 'node:test';

import { faction as SCN } from '../src/data/factions/scn.js';
import { factionConcord } from '../src/systems/faction_concord.js';
import * as WEIGHING from '../src/data/encounters/700-the-weighing.js';
import { SWEEP_SCANNER_PROFILES } from '../src/data/massSignature.js';

function makeBus() {
  const events = [];
  return { events, emit(name, payload) { events.push({ name, payload }); } };
}

function makeState() {
  return { entities: new Map(), simTime: 0, tick: 0, player: null };
}

let spawnSeq = 0;
function spawn(state, spec) {
  const e = {
    id: spec.id || `e${++spawnSeq}`,
    alive: true,
    pos: { x: spec.x || 0, z: spec.z || 0 },
    vel: { x: 0, z: 0 },
    mass: spec.mass || 0,
    radius: spec.radius || 4,
    type: spec.type || 'ship',
    factionId: spec.factionId || null,
    data: spec.data || {},
  };
  state.entities.set(e.id, e);
  return e;
}

function makeSys(state, bus) {
  const sys = { ...factionConcord };
  sys.init({ state, bus, helpers: {} });
  return sys;
}

// ── faction data ──────────────────────────────────────────────────────────────────────────

test('Concord kit declares commanders, clamp tender, scale barge and the Weighing', () => {
  assert.equal(SCN.id, 'faction_scn');
  const roles = SCN.shipRoles.map((r) => r.role);
  for (const r of ['formation-commander', 'clamp-tender', 'scale-barge']) {
    assert.ok(roles.includes(r), `shipRoles includes ${r}`);
  }
  assert.equal(SCN.custom.scaleBarge.scannerProfile, 'scale_barge');
  assert.equal(SCN.custom.weighing.encounterId, 'the_weighing');
  assert.ok(SCN.custom.commander.lockRadiusWu > 0);
  assert.ok(SCN.custom.clampTender.breakRadiusWu > SCN.custom.clampTender.grabRadiusWu);
  assert.equal(SWEEP_SCANNER_PROFILES.scale_barge.ringRadius > 0, true, 'the barge profile exists (row 513)');
});

// ── commanders: the bowling-pin rule ──────────────────────────────────────────────────────

function spawnWing(state) {
  const mk = (id, x, extra = {}) => spawn(state, {
    id, x, z: 0, mass: 55, factionId: 'faction_scn',
    data: { ai: { squadId: 'wing7', ...extra } },
  });
  const commander = mk('cmdr', 0, { squadSocket: 'lead' });
  const a = mk('wing_a', 40);
  const b = mk('wing_b', -40);
  return { commander, a, b };
}

test('fling the commander and the formation locks rigid; the wing coasts', () => {
  const state = makeState(); const bus = makeBus();
  const { commander, a, b } = spawnWing(state);
  const sys = makeSys(state, bus);
  sys.update(1 / 60, state);
  assert.equal(a.data.formationLocked, undefined, 'wing holds while the mast stands');

  // Kill the commander outright — the lock lands the same way.
  commander.alive = false;
  sys.update(1 / 60, state);
  assert.equal(a.data.formationLocked, true);
  assert.equal(b.data.formationLocked, true);
  assert.equal(a.data.ai.passive, true, 'locked members stop maneuvering — they coast rigid');
  assert.equal(state.concord.lockedFormations.wing7, true);
  const ev = bus.events.find((e) => e.name === 'concord:formationLocked');
  assert.ok(ev, 'the lock lands with an event');
  assert.deepEqual(ev.payload.commanderIds, ['cmdr']);
});

test('a commander flung past the lock radius locks the wing; a new mast re-forms it (FF)', () => {
  const state = makeState(); const bus = makeBus();
  const { commander, a } = spawnWing(state);
  const sys = makeSys(state, bus);
  sys.update(1 / 60, state);
  assert.equal(state.concord.lockedFormations.wing7, undefined);

  // The throw: commander leaves its own wing by more than lockRadiusWu.
  commander.pos.x = 900;
  sys.update(1 / 60, state);
  assert.equal(a.data.formationLocked, true, 'the flung commander froze the wing');

  // FF — a fresh commander hull lands inside the radius and the wing re-forms around it.
  spawn(state, {
    id: 'cmdr2', x: 0, z: 0, mass: 55, factionId: 'faction_scn',
    data: { ai: { squadId: 'wing7', squadSocket: 'lead' } },
  });
  sys.update(1 / 60, state);
  assert.equal(a.data.formationLocked, false, 'the wing re-forms around the new commander');
  assert.equal(state.concord.lockedFormations.wing7, false);
  assert.ok(bus.events.some((e) => e.name === 'concord:formationReformed'));
});

test('other factions’ squads are not the Concord rule', () => {
  const state = makeState(); const bus = makeBus();
  spawn(state, { id: 'rc', x: 0, z: 0, factionId: 'faction_reach', data: { ai: { squadId: 'pk', squadSocket: 'lead' } } });
  const m = spawn(state, { id: 'rm', x: 50, z: 0, factionId: 'faction_reach', data: { ai: { squadId: 'pk' } } });
  state.entities.get('rc').alive = false;
  makeSys(state, bus).update(1 / 60, state);
  assert.equal(m.data.formationLocked, undefined, 'a Reach pack scatters — it never locks');
});

// ── Clamp Tender: grabs loose cargo, never ships ─────────────────────────────────────────

test('a Clamp Tender grabs the nearest loose cargo body — and never a hull', () => {
  const state = makeState(); const bus = makeBus();
  const tender = spawn(state, {
    id: 'tender', x: 0, z: 0, mass: 200, factionId: 'faction_scn',
    data: { ai: { encounterRole: 'clamp-tender' } },
  });
  const pod = spawn(state, { id: 'pod', x: 150, z: 0, mass: 40, type: 'pickup', data: { kind: 'cargo' } });
  const hull = spawn(state, { id: 'light_hull', x: 80, z: 0, mass: 30, type: 'ship', factionId: 'faction_quiet' });
  const sys = makeSys(state, bus);
  sys.update(1 / 60, state);
  assert.equal(tender.data.clampTargetId, 'pod', 'the tender took the cargo');
  assert.equal(pod.data.clampedBy, 'tender');
  assert.equal(hull.data.clampedBy, undefined, 'a hull is never a clamp target');
  assert.ok(bus.events.some((e) => e.name === 'concord:clampAttached' && e.payload.bodyId === 'pod'));

  // Out-pull it: drag the pod past the break radius and the clamp tears loose (E-03).
  pod.pos.x = 900;
  sys.update(1 / 60, state);
  assert.equal(tender.data.clampTargetId, null);
  assert.equal(pod.data.clampedBy, undefined);
  assert.ok(bus.events.some((e) => e.name === 'concord:clampReleased' && e.payload.reason === 'out_pulled'));
});

// ── The Weighing (E-04) — driven through a stub director ────────────────────────────────

function makeDirectorHarness() {
  const state = makeState();
  state.player = { id: 'player', alive: true, pos: { x: 120, z: 0 }, mass: 55, data: {} };
  const events = [];
  const charges = [];
  const reps = [];
  const live = {
    id: 'enc1', shapeId: 'the_weighing', squadId: 'sq1',
    plan: {
      zoneCenter: { x: 0, z: 0 },
      ships: [
        { role: 'squad', pos: { x: 0, z: 0 } },
        { role: 'escort', pos: { x: 0, z: 0 } },
        { role: 'escort', pos: { x: 0, z: 0 } },
      ],
    },
    anchor: null, roles: {}, ids: [], data: {}, vars: {},
    shape: WEIGHING.default, phase: 'pending', deadlineAt: 0,
  };
  const d = {
    state,
    now: () => state.simTime,
    player: () => state.player,
    stream: () => { let s = 12345; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; },
    spawnShips: (lv, ships) => ships.map((sh) => {
      const e = spawn(state, {
        x: sh.pos.x, z: sh.pos.z, mass: 900, radius: 40, type: 'ship',
        factionId: 'faction_scn', data: { ai: {} },
      });
      lv.roles[e.id] = sh.role; lv.ids.push(e.id);
      return e.id;
    }),
    entsOf: (lv, role) => lv.ids.map((id) => state.entities.get(id)).filter((e) => e && (!role || lv.roles[e.id] === role)),
    spawnProp: (lv, opts) => spawn(state, {
      x: opts.pos.x, z: opts.pos.z, mass: opts.mass, radius: opts.radius, type: 'beacon', data: {},
    }),
    say: () => true,
    emit: (name, payload) => events.push({ name, payload }),
    offerChoices: (lv, ids, timeout, deadlineAt) => { lv.lastOffer = { ids, timeout, deadlineAt }; },
    charge: (amt, reason) => charges.push({ amount: amt, reason }),
    rep: (f, delta, reason) => reps.push({ factionId: f, delta, reason }),
    resolve: (lv, outcome) => { lv.phase = 'done'; lv.outcome = outcome; },
    abort: (lv, reason) => { lv.phase = 'done'; lv.outcome = `abort:${reason}`; },
  };
  return { state, d, live, events, charges, reps };
}

function fireWeighing() {
  const h = makeDirectorHarness();
  WEIGHING.runtime.fire(h.d, h.live, h.state);
  return h;
}

function tickS(h, seconds) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    h.state.simTime += dt;
    WEIGHING.runtime.tick(h.d, h.live, h.state, h.state.simTime);
    if (h.live.phase === 'done') break;
  }
}

test('the Weighing fires: barge anchors, ring lit, escorts hold, shadow rock furnished', () => {
  const h = fireWeighing();
  const weigh = h.live.data.weigh;
  assert.ok(weigh, 'the scale record exists');
  const barge = h.state.entities.get(weigh.bargeId);
  assert.equal(barge.data.massScanner, 'scale_barge');
  assert.equal(barge.data.scanLabel, 'SCALE BARGE — WEIGHING');
  assert.equal(weigh.escortIds.length, 2);
  const rock = h.state.entities.get(weigh.rockId);
  assert.ok(rock && rock.mass >= 300, 'a dense fragment waits inside the ring');
  assert.equal(weigh.manifestMassT, 55, 'the manifest is the hull at fire time');
});

test('a clean hull inside the ring weighs clean and clears', () => {
  const h = fireWeighing();
  tickS(h, 4);
  assert.equal(h.live.outcome, 'weighed_clean');
  assert.equal(h.charges.length, 0, 'no fine on a clean scale');
});

test('over-mass dwell opens the verdict; paying settles it', () => {
  const h = fireWeighing();
  // The extra mass rides beside the hull — a loose pod in the open.
  spawn(h.state, { id: 'crate', x: 140, z: 20, mass: 40, type: 'pickup', data: { kind: 'cargo' } });
  tickS(h, 3);
  const weigh = h.live.data.weigh;
  assert.equal(weigh.verdictOpen, true, 'the scale spoke over-mass');
  assert.ok(h.live.lastOffer, 'the verdict offers pay / bluff / run');
  assert.deepEqual(h.live.lastOffer.ids, ['pay', 'bluff', 'run']);
  assert.ok(h.events.some((e) => e.name === 'weighing:overMass'));
  WEIGHING.runtime.choose(h.d, h.live, h.state, 'pay');
  assert.equal(h.live.outcome, 'fined_paid');
  assert.equal(h.charges[0].amount, Math.max(60, Math.round(weigh.overByT * 38)));
  assert.ok(h.reps.some((r) => r.reason === 'weighing_paid'));
});

test('third way: parking the mass in the big rock’s shadow cleans the second reading', () => {
  const h = fireWeighing();
  const weigh = h.live.data.weigh;
  const rock = h.state.entities.get(weigh.rockId);
  const crate = spawn(h.state, { id: 'crate', x: 140, z: 20, mass: 40, type: 'pickup', data: { kind: 'cargo' } });
  tickS(h, 3);
  assert.equal(weigh.verdictOpen, true);
  // Sling it behind the rock: barge → pod sightline now crosses the rock disc.
  const dx = rock.pos.x, dz = rock.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  crate.pos.x = dx + (dx / len) * (rock.radius + 20);
  crate.pos.z = dz + (dz / len) * (rock.radius + 20);
  tickS(h, 0.2);
  assert.equal(h.live.outcome, 'weighed_clean', 'the shadow takes the mass off the scale');
});

test('a decoy pod owns the signature — over-mass never lands', () => {
  const h = fireWeighing();
  spawn(h.state, { id: 'decoy', x: 140, z: 20, mass: 12, type: 'pickup', data: { kind: 'cargo', decoySpoofMassT: 40 } });
  tickS(h, 4);
  const weigh = h.live.data.weigh;
  assert.equal(weigh.verdictOpen, false, 'the decoy’s mass is its own manifest');
  assert.equal(weigh.decoys.length, 1);
  assert.equal(h.live.outcome, 'weighed_clean');
});

test('running the ring after a verdict is a warrant-flavored bolt', () => {
  const h = fireWeighing();
  spawn(h.state, { id: 'crate', x: 140, z: 20, mass: 40, type: 'pickup', data: { kind: 'cargo' } });
  tickS(h, 3);
  WEIGHING.runtime.choose(h.d, h.live, h.state, 'run');
  assert.equal(h.live.outcome, 'weighing_evaded');
  assert.ok(h.reps.some((r) => r.delta === -4));
  assert.ok(h.events.some((e) => e.name === 'law:warrantIssued'));
  const escort = h.state.entities.get(h.live.data.weigh.escortIds[0]);
  assert.equal(escort.data.ai.passive, false, 'escorts drop the hold and pursue');
});
