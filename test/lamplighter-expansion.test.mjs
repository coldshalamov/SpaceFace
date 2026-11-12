// lamplighter-expansion — the work layer under W-SHIFT's LL-6 (build_map row 506).
//
// Covers the route economy the relit rim runs on:
//   lamp upkeep    the oil tank, per-slot charges, burn, gutters, cold seats
//   fuel service   oil pods towed in, fuel cells siphoned from a parked hold
//   tending        a cell straight to a dimming lamp's wick
//   lit route      wayfarers walk the lit lane and pay a due; dark sends them back
//   snuffers       the dark's moths drink lit lamps; the post pays the bounty
//   the ask wire   posted work, verifies, sours, lapses when the keeper dies
//   the keeper     deeds into tiers, grudges into the latched spurn, amends
//   once-only      purses and bounties latch before their emits; replays are free
//
// Determinism: simTime clocks and hash32 seq draws only — no wall time, no Math.random.
// Money moves through economy:grantCredits; standing through faction:repDelta.
//
// Run: node --test test/lamplighter-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { LAMPLIGHTER } from '../src/data/lamplighter.js';
import {
  lamplighter,
  lamplighterSpec,
  lamplighterDeadSpec,
  lamplighterLampSpec,
  lamplighterOilPodSpec,
  lamplighterWayfarerSpec,
  lamplighterSnufferSpec,
  lamplighterBoard,
  lamplighterAsks,
  lamplighterStanding,
  lamplighterTierFor,
  ensureLamplighterState,
  LAMPLIGHTER_UPKEEP,
  LAMPLIGHTER_TEND,
  LAMPLIGHTER_TRAFFIC,
  LAMPLIGHTER_SNUFFERS,
  LAMPLIGHTER_WORK,
  LAMPLIGHTER_PAY,
} from '../src/systems/lamplighter.js';

const SEED = 4177;
const SECTOR = 'sector_sedna_dark';
const CELL = 'cmdty_fuel_cells';
const int = (v) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : 0; };

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [lamplighter] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 60000, z: 60000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true, data: { name: 'PLAYER' },
  });
  state.playerId = player.id;
  const events = [];
  for (const ev of [
    'lamplighter:planted', 'lamplighter:guttered', 'lamplighter:oiled',
    'lamplighter:oilSold', 'lamplighter:lampTended', 'lamplighter:oilPodDropped',
    'lamplighter:wayfarerInbound', 'lamplighter:wayfarerArrived',
    'lamplighter:wayfarerTurned', 'lamplighter:wayfarerLost',
    'lamplighter:snufferInbound', 'lamplighter:snufferDowned',
    'lamplighter:lampSiphoned', 'lamplighter:askPosted', 'lamplighter:askVerified',
    'lamplighter:askSoured', 'lamplighter:askLapsed', 'lamplighter:favor',
    'lamplighter:amends', 'lamplighter:forgiven', 'lamplighter:grudge',
    'lamplighter:spurned', 'lamplighter:keeperTier', 'lamplighter:rimPaid',
    'lamplighter:logged',
  ]) bus.on(ev, (p) => events.push({ ev, p }));
  const heard = (name) => events.filter((e) => e.ev === name).map((e) => e.p);
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const grants = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  const reps = [];
  bus.on('faction:repDelta', (p) => reps.push(p));
  // First step into the sector: the keeper, the dead stock, the hail.
  bus.emit('sector:enter', { sectorId: SECTOR });
  return { sim, state, bus, player, events, heard, popups, grants, reps };
}

// ── fixture reads ──────────────────────────────────────────────────────────────
const flags = (state) => state.story.flags;
const board = (state) => lamplighterBoard(state);
const t = (state) => ensureLamplighterState(state);
const alive = (state, tag) =>
  (state.entityList || []).filter((e) => e?.alive && e.data?.[tag] === true);
const robot = (state) => alive(state, 'lamplighter')[0] || null;
const dead = (state) => alive(state, 'lamplighterDead');
const lamps = (state) => alive(state, 'lamplighterLamp');
const pods = (state) => alive(state, 'lamplighterOil');
const ways = (state) => alive(state, 'lamplighterWayfarer');
const snuffs = (state) => alive(state, 'lamplighterSnuffer');

/** Settle a body into the keeper's arm ring and let one census take it. */
function deliver(sim, e, post) {
  e.pos = { x: post.x + 4, z: post.z - 3 };
  e.vel = { x: 0, z: 0 };
  sim.step();
}

/** Plant the next dead buoy — the machine takes lowest dark slot first. */
function lightNext(sim, state) {
  const b = dead(state)[0];
  assert.ok(b, 'a dead buoy waits on the rim');
  deliver(sim, b, robot(state).pos);
}

function lightPath(sim, state, n) {
  for (let i = 0; i < n; i += 1) lightNext(sim, state);
}

function killBy(bus, victim, killerId) {
  victim.alive = false; // the emitter marks the body dead before the bus hears it
  bus.emit('entity:killed', {
    id: victim.id, type: victim.type, pos: victim.pos ? { ...victim.pos } : null,
    killerId: killerId ?? null,
  });
}

function giveCells(state, n) {
  const cargo = state.player.cargo;
  cargo.items[CELL] = n;
  cargo.usedVolume = n * 0.8;
  cargo.usedMass = n * 0.6;
}

const grantOf = (grants, prefix) => grants.filter((g) => String(g.reason || '').startsWith(prefix));

// ── the board surface ──────────────────────────────────────────────────────────

test('the keeper materializes with a half tank and an honest board', () => {
  const { sim, state } = boot();
  assert.ok(robot(state), 'LL-6 holds the post');
  assert.equal(dead(state).length, LAMPLIGHTER.deadCount);
  const b = board(state);
  assert.equal(b.lit, 0);
  assert.equal(b.oil, LAMPLIGHTER_UPKEEP.oilCap * LAMPLIGHTER_UPKEEP.startOilFrac);
  assert.deepEqual(b.charge, new Array(LAMPLIGHTER.slotCount).fill(0));
  assert.equal(b.standing.tier, 0);
  assert.equal(b.standing.deeds, 0);
  assert.deepEqual(b.asks, []);
  // Reads copy: a caller scribbling on the board cannot bend the durable record.
  b.charge[0] = 999; b.asks.push({ id: 'fake', kind: 'oil' });
  assert.equal(board(state).charge[0], 0);
  assert.equal(board(state).asks.length, 0);
  sim.dispose();
});

test('a planted lamp draws its charge from the tank; the first light pays once', () => {
  const { sim, state, grants, heard } = boot();
  lightNext(sim, state);
  let f = flags(state);
  assert.equal(f[LAMPLIGHTER.litFlag] & 1, 1);
  const planted = heard('lamplighter:planted');
  assert.equal(planted.length, 1);
  assert.equal(planted[0].slot, 0);
  assert.equal(planted[0].coldReplant, false);
  // First plant: 90 + the once-only first-light purse 150.
  assert.equal(grantOf(grants, 'lamplighter_plant').length, 1);
  assert.equal(grantOf(grants, 'lamplighter_plant')[0].amount, LAMPLIGHTER_PAY.plantPayCr + LAMPLIGHTER_PAY.firstLightCr);
  // The wick drank a full charge; the tank reports it.
  assert.equal(board(state).oil, 0);
  assert.equal(board(state).charge[0], LAMPLIGHTER_UPKEEP.chargePerLamp);
  // Second plant: no first-light purse — and a dry tank still gives the wick its pilot.
  lightNext(sim, state);
  f = flags(state);
  assert.equal(grantOf(grants, 'lamplighter_plant').length, 2);
  assert.equal(grantOf(grants, 'lamplighter_plant')[1].amount, LAMPLIGHTER_PAY.plantPayCr);
  assert.equal(board(state).charge[1], LAMPLIGHTER_UPKEEP.pilotCharge);
  sim.dispose();
});

test('a lamp with no charge gutters out: seat clears, body leaves, chronicle files', () => {
  const { sim, state, heard } = boot();
  lightNext(sim, state);
  flags(state).lamplighter_charge[0] = 3; // three sim-seconds of light left
  sim.runTicks(3 * 60 + 30);
  const gut = heard('lamplighter:guttered');
  assert.equal(gut.length, 1);
  assert.equal(gut[0].slot, 0);
  assert.equal(gut[0].cause, 'burned');
  assert.equal(flags(state)[LAMPLIGHTER.litFlag], 0, 'the seat bit went dark honestly');
  assert.equal(lamps(state).length, 0);
  assert.equal(board(state).stats.guttered, 1);
  assert.ok(heard('lamplighter:logged').some((l) => l.kind === 'guttered'));
  sim.dispose();
});

test('six lamps is the rim: the purse pays once and stays paid', () => {
  const { sim, state, grants, heard } = boot();
  lightPath(sim, state, LAMPLIGHTER.slotCount);
  assert.equal(flags(state)[LAMPLIGHTER.rimFlag], true);
  const rimPays = heard('lamplighter:rimPaid');
  assert.equal(rimPays.length, 1);
  const rimGrants = grantOf(grants, 'lamplighter_rim');
  assert.equal(rimGrants.length, 1);
  // Six plants is six deeds — the purse rides the keeper tier it just earned.
  assert.equal(board(state).standing.deeds, LAMPLIGHTER.slotCount);
  assert.equal(rimGrants[0].amount,
    Math.round(LAMPLIGHTER_PAY.rimPurseCr * lamplighterTierFor(LAMPLIGHTER.slotCount).payMult));
  sim.runTicks(120);
  assert.equal(heard('lamplighter:rimPaid').length, 1, 'no second rim purse on the replay');
  assert.equal(grantOf(grants, 'lamplighter_rim').length, 1);
  sim.dispose();
});

// ── the fuel economy ───────────────────────────────────────────────────────────

test('a thin tank drops an oil pod and posts the ask; delivery fills and verifies', () => {
  const { sim, state, grants, heard } = boot();
  flags(state).lamplighter_oil = 100; // under the ask line and the drop line
  t(state).nextPodAt = 0;
  sim.step();
  assert.equal(heard('lamplighter:oilPodDropped').length, 1);
  assert.equal(pods(state).length, 1);
  const asks = heard('lamplighter:askPosted');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].kind, 'oil');
  const pod = pods(state)[0];
  deliver(sim, pod, robot(state).pos);
  assert.equal(board(state).oil, 100 + LAMPLIGHTER_UPKEEP.podOil);
  assert.equal(heard('lamplighter:oiled').length, 1);
  const podGrants = grantOf(grants, 'lamplighter_oil');
  assert.equal(podGrants.length, 1);
  assert.equal(podGrants[0].amount, LAMPLIGHTER_UPKEEP.podPayCr);
  const verified = heard('lamplighter:askVerified');
  assert.equal(verified.length, 1);
  assert.equal(verified[0].how, 'pod');
  assert.equal(verified[0].payCr, LAMPLIGHTER_WORK.verifyPayCr);
  assert.equal(board(state).stats.pods, 1);
  sim.dispose();
});

test('parked in the ring, the machine siphons a cell a beat and pays for it', () => {
  const { sim, state, grants, heard, player } = boot();
  flags(state).lamplighter_oil = 100;
  giveCells(state, 3);
  player.pos = { x: robot(state).pos.x + 20, z: robot(state).pos.z + 10 };
  sim.step();
  assert.equal(state.player.cargo.items[CELL], 2, 'one cell drawn this beat');
  assert.equal(board(state).oil, 100 + LAMPLIGHTER_UPKEEP.cellOilEach);
  assert.equal(heard('lamplighter:oilSold').length, 1);
  assert.equal(grantOf(grants, 'lamplighter_cell').length, 1);
  assert.equal(grantOf(grants, 'lamplighter_cell')[0].amount, LAMPLIGHTER_UPKEEP.cellPayCr);
  // Same beat: no second siphon. The next beat draws the next cell.
  sim.step();
  assert.equal(state.player.cargo.items[CELL], 2);
  state.simTime += LAMPLIGHTER_UPKEEP.cellBeatS + 0.01;
  sim.step();
  assert.equal(state.player.cargo.items[CELL], 1);
  assert.equal(board(state).oil, 100 + 2 * LAMPLIGHTER_UPKEEP.cellOilEach);
  sim.dispose();
});

test('the siphon also answers the oil ask — a hold of cells counts as running it', () => {
  const { sim, state, heard, player } = boot();
  flags(state).lamplighter_oil = 50;
  giveCells(state, 2);
  player.pos = { ...robot(state).pos };
  sim.step(); // the ask posts and the first drawn cell settles it in the same census
  assert.equal(heard('lamplighter:askPosted').filter((a) => a.kind === 'oil').length, 1);
  const verified = heard('lamplighter:askVerified');
  assert.equal(verified.length, 1);
  assert.equal(verified[0].kind, 'oil');
  assert.equal(verified[0].how, 'cells');
  assert.equal(lamplighterAsks(state).length, 0, 'a verified ask leaves the wire');
  sim.dispose();
});

test('tending: a cell beside a low lamp tops the wick and tips the keeper', () => {
  const { sim, state, grants, heard, player } = boot();
  lightNext(sim, state);
  const lamp = lamps(state)[0];
  flags(state).lamplighter_charge[0] = 40;
  giveCells(state, 2);
  player.pos = { x: lamp.pos.x + 10, z: lamp.pos.z + 5 };
  sim.step();
  const tended = heard('lamplighter:lampTended');
  assert.equal(tended.length, 1);
  assert.equal(tended[0].slot, 0);
  assert.ok(tended[0].charge > 120, 'the wick took the cell');
  assert.equal(state.player.cargo.items[CELL], 1);
  const tips = grantOf(grants, 'lamplighter_tend');
  assert.equal(tips.length, 1);
  assert.equal(tips[0].amount, LAMPLIGHTER_TEND.tendTipCr);
  assert.equal(board(state).stats.tended, 1);
  assert.ok(heard('lamplighter:favor').some((f) => f.kind === 'tend'));
  sim.dispose();
});

// ── the lit route ──────────────────────────────────────────────────────────────

test('light draws traffic: a wayfarer walks the lit slots and pays its due once', () => {
  const { sim, state, grants, heard } = boot();
  lightNext(sim, state);
  t(state).nextWayfarerAt = 0;
  sim.step();
  assert.equal(heard('lamplighter:wayfarerInbound').length, 1);
  const w = ways(state)[0];
  assert.ok(w, 'a wayfarer rides the lit lane');
  // Walk it to the post: past the last waypoint it pays and leaves the census.
  w.data.lampWp = w.data.lampRoute.length;
  w.pos = { x: LAMPLIGHTER.post.x + 30, z: LAMPLIGHTER.post.z + 20 };
  sim.step();
  const arrived = heard('lamplighter:wayfarerArrived');
  assert.equal(arrived.length, 1);
  assert.equal(arrived[0].tollCr,
    Math.round(LAMPLIGHTER_TRAFFIC.tollTipCr * board(state).standing.payMult));
  assert.equal(grantOf(grants, 'lamplighter_toll').length, 1);
  assert.equal(ways(state).length, 0, 'the hull left the rim after paying');
  assert.equal(board(state).stats.ways, 1);
  sim.dispose();
});

test('when the lane dies under it, a wayfarer turns back for the rim and leaves', () => {
  const { sim, state, heard } = boot();
  lightNext(sim, state);
  t(state).nextWayfarerAt = 0;
  sim.step();
  const w = ways(state)[0];
  flags(state)[LAMPLIGHTER.litFlag] = 0; // the lights go out mid-approach
  w.pos = { x: LAMPLIGHTER.post.x, z: LAMPLIGHTER.post.z - 4000 }; // past the leave margin
  sim.step();
  assert.equal(heard('lamplighter:wayfarerTurned').length, 1);
  assert.equal(ways(state).length, 0);
  sim.dispose();
});

// ── the dark pushes back ───────────────────────────────────────────────────────

test('three lamps draw a snuffer; latched to a lamp it drinks the charge dry', () => {
  const { sim, state, heard } = boot();
  lightPath(sim, state, 3);
  t(state).nextSnufferAt = 0;
  sim.step();
  assert.equal(heard('lamplighter:snufferInbound').length, 1);
  assert.equal(snuffs(state).length, 1);
  sim.step(); // the bounty posts the census after the moth flies
  assert.ok(heard('lamplighter:askPosted').some((a) => a.kind === 'snuffers'),
    'the bounty posts while a moth flies');
  const s = snuffs(state)[0];
  const lamp = lamps(state).find((l) => l.data.lamplighterSlot === 0);
  flags(state).lamplighter_charge[0] = 24; // four sim-seconds at the siphon rate
  s.pos = { ...lamp.pos }; // latched on the light
  sim.runTicks(4 * 60 + 40);
  const siph = heard('lamplighter:lampSiphoned');
  assert.ok(siph.length >= 1);
  assert.equal(siph[0].snufferId, s.id);
  const gut = heard('lamplighter:guttered');
  assert.equal(gut.length, 1);
  assert.equal(gut[0].cause, 'siphoned');
  assert.equal(flags(state)[LAMPLIGHTER.litFlag] & 1, 0, 'the drank seat went dark');
  sim.dispose();
});

test('a snuffer cooled by the pilot pays the bounty once — a replayed kill is free', () => {
  const { sim, state, bus, player, grants, heard } = boot();
  lightPath(sim, state, 3);
  t(state).nextSnufferAt = 0;
  sim.step();
  sim.step(); // the bounty ask posts the census after the moth flies
  const s = snuffs(state)[0];
  killBy(bus, s, player.id);
  killBy(bus, s, player.id); // the report re-emitted — the body files once
  const downed = heard('lamplighter:snufferDowned');
  assert.equal(downed.length, 1, 'one cooled hull, one receipt');
  const bounty = grantOf(grants, 'lamplighter_bounty');
  assert.equal(bounty.length, 1, 'one cooled hull, one purse');
  // Three plants is tier one — the posted rate scales once, not twice.
  assert.equal(bounty[0].amount,
    Math.round(LAMPLIGHTER_SNUFFERS.bountyCr * lamplighterTierFor(3).payMult));
  assert.ok(heard('lamplighter:askVerified').some((v) => v.kind === 'snuffers'));
  assert.equal(board(state).stats.downs, 1);
  sim.dispose();
});

test('a snuffer cooled by someone else files the report but pays the pilot nothing', () => {
  const { sim, state, bus, grants, heard } = boot();
  lightPath(sim, state, 3);
  t(state).nextSnufferAt = 0;
  sim.step();
  const s = snuffs(state)[0];
  killBy(bus, s, 99999);
  assert.equal(heard('lamplighter:snufferDowned').length, 1);
  assert.equal(grantOf(grants, 'lamplighter_bounty').length, 0);
  sim.dispose();
});

// ── the ask wire ───────────────────────────────────────────────────────────────

test('an unanswered ask sours on its clock and costs a little regard', () => {
  const { sim, state, reps, heard } = boot();
  flags(state).lamplighter_oil = 50;
  sim.step();
  assert.equal(lamplighterAsks(state).length, 1);
  state.simTime += LAMPLIGHTER_WORK.askTtlS + 1;
  sim.step();
  const soured = heard('lamplighter:askSoured');
  assert.equal(soured.length, 1);
  assert.equal(soured[0].kind, 'oil');
  assert.ok(reps.some((r) => r.delta === LAMPLIGHTER_WORK.sourRep), 'the cold lead files a small debit');
  sim.step(); // the tank is still thin — a soured lead stays down, no regard bleed
  assert.equal(lamplighterAsks(state).length, 0);
  state.simTime += LAMPLIGHTER_WORK.askTtlS + 1;
  sim.step();
  assert.equal(heard('lamplighter:askSoured').length, 1, 'no second sour on the same lead');
  // A filled tank re-arms the wire; thin again and the machine re-asks.
  flags(state).lamplighter_oil = LAMPLIGHTER_UPKEEP.oilCap;
  sim.step();
  flags(state).lamplighter_oil = 50;
  sim.step();
  assert.equal(lamplighterAsks(state).length, 1);
  assert.notEqual(lamplighterAsks(state)[0].id, soured[0].askId);
  sim.dispose();
});

test('a soured oil ask stays down across the save boundary', () => {
  const { sim, state, bus, reps, heard } = boot();
  flags(state).lamplighter_oil = 50;
  sim.step(); // the thin tank posts the lead
  state.simTime += LAMPLIGHTER_WORK.askTtlS + 1;
  sim.step(); // it sours — the snub files on the durable record
  assert.equal(heard('lamplighter:askSoured').length, 1);
  assert.equal(flags(state).lamplighter_oilBan, true);
  delete state.lamplighter; // a real load re-derives the session slice empty
  bus.emit('save:loaded');
  sim.step();
  assert.equal(lamplighterAsks(state).length, 0, 'no re-ask on a snub it remembers');
  state.simTime += LAMPLIGHTER_WORK.askTtlS + 1;
  sim.step();
  assert.equal(heard('lamplighter:askSoured').length, 1, 'no second bleed across the boundary');
  assert.equal(reps.filter((r) => r.delta === LAMPLIGHTER_WORK.sourRep).length, 1);
  sim.dispose();
});

test('a soured bounty stays down while its moths still fly — no regard bleed', () => {
  const { sim, state, bus, reps, heard } = boot();
  // A full tank keeps the wire to one lead — top it before every planting, since
  // each lamp draws its first charge out of the oil.
  for (let i = 0; i < 3; i++) {
    flags(state).lamplighter_oil = LAMPLIGHTER_UPKEEP.oilCap;
    lightNext(sim, state);
  }
  flags(state).lamplighter_oil = LAMPLIGHTER_UPKEEP.oilCap;
  t(state).nextSnufferAt = 0;
  sim.step(); // the moth is inbound
  sim.step(); // the bounty posts the census after it flies
  assert.equal(heard('lamplighter:askPosted').filter((a) => a.kind === 'snuffers').length, 1);
  // The pilot ignores the wire — the lead sours on its clock.
  state.simTime += LAMPLIGHTER_WORK.askTtlS + 1;
  sim.step();
  assert.equal(heard('lamplighter:askSoured').length, 1);
  assert.equal(flags(state).lamplighter_snufferBan, true, 'the snub files on the durable record');
  // The same moths still fly — the refused bounty must not repost and sour again.
  sim.step();
  assert.equal(lamplighterAsks(state).length, 0);
  state.simTime += LAMPLIGHTER_WORK.askTtlS + 1;
  sim.step();
  assert.equal(heard('lamplighter:askSoured').length, 1, 'no second bleed on the same lead');
  assert.equal(reps.filter((r) => r.delta === LAMPLIGHTER_WORK.sourRep).length, 1);
  // The snub survives the save boundary — durable like the oil ban.
  delete state.lamplighter;
  bus.emit('save:loaded');
  sim.step();
  assert.equal(lamplighterAsks(state).length, 0, 'no re-ask on a snub it remembers');
  // The infestation passing re-arms the wire — a new wave is a new lead.
  for (const m of snuffs(state)) killBy(bus, m, 99999); // cooled — not by the pilot's hand
  sim.step();
  assert.equal(flags(state).lamplighter_snufferBan, false, 'the ban lifts when the moths are gone');
  assert.equal(lamplighterAsks(state).filter((a) => a.kind === 'snuffers').length, 0,
    'no bounty posts on an empty rim');
  // A fresh moth — the dark keeps its own clock — posts a fresh lead, not the snub.
  if (snuffs(state).length === 0) sim.spawn(lamplighterSnufferSpec(99));
  sim.step();
  const bounties = lamplighterAsks(state).filter((a) => a.kind === 'snuffers');
  assert.equal(bounties.length, 1, 'the new infestation posts its own lead');
  sim.dispose();
});

// ── favors, grudges, and the latched spurn ─────────────────────────────────────

test('a lamp the pilot puts out files a grudge and replants cold — no cheer, no credit', () => {
  const { sim, state, bus, player, grants, reps, heard, popups } = boot();
  lightNext(sim, state);
  const lamp = lamps(state)[0];
  grants.length = 0;
  killBy(bus, lamp, player.id);
  assert.equal(flags(state)[LAMPLIGHTER.litFlag] & 1, 0);
  assert.equal(int(flags(state).lamplighter_snuffed) & 1, 1, 'the seat remembers who put it out');
  assert.equal(board(state).standing.strikes, 1);
  assert.ok(reps.some((r) => r.delta === LAMPLIGHTER_WORK.strikeRep));
  assert.equal(heard('lamplighter:grudge').length, 1);
  // Replanting the seat you broke is work without pay.
  lightNext(sim, state);
  const planted = heard('lamplighter:planted');
  assert.equal(planted.at(-1).coldReplant, true);
  assert.equal(grantOf(grants, 'lamplighter_plant').length, 0, 'a cold replant pays nothing');
  assert.ok(popups.some((p) => p.text === 'THE HOLE YOU MADE IS FILLED. THE LIGHT REMEMBERS WHO PUT IT OUT.'));
  sim.dispose();
});

test('the spurn latches: work feeds it but pays nothing until the debt is zero', () => {
  const { sim, state, grants, heard } = boot();
  const f = flags(state);
  f.lamplighter_strikes = LAMPLIGHTER_WORK.spurnAfter;
  f.lamplighter_spurned = true;
  grants.length = 0;
  lightNext(sim, state); // amends 1
  lightNext(sim, state); // amends 2
  assert.equal(grants.length, 0, 'the purse stays shut while the name is in the dark column');
  assert.equal(heard('lamplighter:amends').length, 2);
  assert.equal(board(state).standing.strikes, 1);
  assert.equal(board(state).standing.spurned, true);
  lightNext(sim, state); // debt zero — forgiven
  assert.equal(board(state).standing.strikes, 0);
  assert.equal(heard('lamplighter:forgiven').length, 1);
  lightNext(sim, state); // and the purse opens again
  assert.ok(grants.length > 0, 'a paid favor follows the forgiven ledger');
  sim.dispose();
});

test('murder on the lit lane files the heavier grudge', () => {
  const { sim, state, bus, player, reps, heard } = boot();
  lightNext(sim, state);
  t(state).nextWayfarerAt = 0;
  sim.step();
  const w = ways(state)[0];
  killBy(bus, w, player.id);
  assert.equal(heard('lamplighter:wayfarerLost').length, 1);
  assert.equal(heard('lamplighter:grudge').length, 1);
  assert.ok(reps.some((r) => r.delta === LAMPLIGHTER_WORK.wayfarerKillRep));
  assert.equal(board(state).stats.lost, 1);
  sim.dispose();
});

// ── kill reports are receipts: replayed, duplicated, and stale ─────────────────

test('a re-emitted kill report on a lamp is not a second grudge', () => {
  const { sim, state, bus, player, reps, heard } = boot();
  lightNext(sim, state);
  const lamp = lamps(state)[0];
  killBy(bus, lamp, player.id);
  killBy(bus, lamp, player.id); // the corpse still answers its id — the seat is already dark
  assert.equal(board(state).standing.strikes, 1, 'one offense, one strike');
  assert.equal(heard('lamplighter:grudge').length, 1);
  assert.equal(reps.filter((r) => r.delta === LAMPLIGHTER_WORK.strikeRep).length, 1);
  sim.dispose();
});

test('a stale receipt cannot darken a seat a live lamp replanted', () => {
  const { sim, state, bus, player } = boot();
  lightNext(sim, state);
  const lamp = lamps(state)[0];
  killBy(bus, lamp, player.id); // first report: the seat darkens, one grudge files
  // A second body fills the hole while the corpse still answers the wire —
  // the seat belongs to the live lamp now.
  sim.spawn(lamplighterLampSpec(0));
  const f = flags(state);
  f[LAMPLIGHTER.litFlag] |= 1; // the replant relit the seat
  bus.emit('entity:killed', { id: lamp.id, killerId: player.id, type: lamp.type });
  assert.equal(f[LAMPLIGHTER.litFlag] & 1, 1, 'the replanted lamp keeps its light');
  assert.equal(board(state).standing.strikes, 1, 'the corpse files no second offense');
  assert.equal(lamps(state).length, 1, 'the live lamp is untouched');
  sim.dispose();
});

test('a stale kill report on a live body settles nothing', () => {
  const { sim, state, bus, player, heard } = boot();
  lightNext(sim, state);
  const lamp = lamps(state)[0];
  // The wire's id was recycled — the occupant answering it is alive, so this is
  // a stale receipt: no seat clears, no grudge files.
  bus.emit('entity:killed', { id: lamp.id, killerId: player.id, type: lamp.type });
  assert.equal(flags(state)[LAMPLIGHTER.litFlag] & 1, 1, 'the lit seat stays lit');
  assert.equal(board(state).standing.strikes, 0);
  assert.equal(heard('lamplighter:grudge').length, 0);
  sim.dispose();
});

test('a forged seat stamp past the last slot cannot reach the mask through mod-32 shifts', () => {
  const { sim, state, bus, player, heard } = boot();
  lightPath(sim, state, 4); // bits 0..3 — slot 99 aliases bit 3 through 1<<99
  // A hand-cut corpse claims a seat the lane does not have — it files nothing.
  const forged = sim.spawn(lamplighterLampSpec(0));
  forged.data.lamplighterSlot = 99; // 99 & 31 = 3 — a real lit seat
  killBy(bus, forged, player.id);
  assert.equal(flags(state)[LAMPLIGHTER.litFlag] & 0b1000, 0b1000,
    'the forged corpse cannot darken the real seat its stamp aliases');
  assert.equal(int(flags(state).lamplighter_snuffed) & 0b1000, 0, 'no snub marks a seat it never held');
  assert.equal(board(state).standing.strikes, 0, 'no grudge files for a seat the lane never had');
  assert.equal(heard('lamplighter:guttered').length, 0);
  // A moth parked on a live forged lamp finds no seat to drink — the census map
  // never claims it — and the charge ledger keeps its authored width.
  const forgedLive = sim.spawn(lamplighterLampSpec(0));
  forgedLive.data.lamplighterSlot = 99;
  const s = sim.spawn(lamplighterSnufferSpec(7));
  s.pos = { ...forgedLive.pos };
  flags(state).lamplighter_charge.fill(LAMPLIGHTER_UPKEEP.chargePerLamp);
  const litBefore = flags(state)[LAMPLIGHTER.litFlag];
  sim.step();
  assert.equal(flags(state)[LAMPLIGHTER.litFlag], litBefore, 'no seat guttered');
  assert.equal(flags(state).lamplighter_charge.length, LAMPLIGHTER.slotCount,
    'a wrapped write never stretches the charge ledger');
  assert.equal(heard('lamplighter:guttered').length, 0);
  sim.dispose();
});

test('a re-emitted wayfarer kill files once — the id:generation key holds', () => {
  const { sim, state, bus, player, reps, heard } = boot();
  lightNext(sim, state);
  t(state).nextWayfarerAt = 0;
  sim.step();
  const w = ways(state)[0];
  killBy(bus, w, player.id);
  killBy(bus, w, player.id);
  assert.equal(heard('lamplighter:wayfarerLost').length, 1, 'the route loses the hauler once');
  assert.equal(heard('lamplighter:grudge').length, 1, 'the murder files once');
  assert.equal(reps.filter((r) => r.delta === LAMPLIGHTER_WORK.wayfarerKillRep).length, 1);
  assert.equal(board(state).standing.strikes, 1);
  assert.equal(board(state).stats.lost, 1, 'one body, one loss on the board');
  sim.dispose();
});

test('two snuffers on one lamp drink the seat dark once — never twice', () => {
  const { sim, state, heard } = boot();
  lightNext(sim, state);
  const lamp = lamps(state)[0];
  flags(state).lamplighter_charge[0] = 0.05; // a sip left
  for (let i = 0; i < 2; i += 1) {
    const s = sim.spawn(lamplighterSnufferSpec(i));
    s.pos = { ...lamp.pos }; // both moths latched on the same light
  }
  sim.step();
  assert.equal(heard('lamplighter:guttered').length, 1, 'one seat goes dark once');
  assert.equal(board(state).stats.guttered, 1);
  assert.equal(flags(state)[LAMPLIGHTER.litFlag] & 1, 0);
  sim.dispose();
});

// ── receipts report what moved ─────────────────────────────────────────────────

test('the rim purse receipt reports the tiered grant, not the base', () => {
  const { sim, state, grants, heard } = boot();
  lightPath(sim, state, LAMPLIGHTER.slotCount);
  const grant = grantOf(grants, 'lamplighter_rim')[0];
  assert.equal(heard('lamplighter:rimPaid')[0].payCr, grant.amount);
  assert.equal(grant.amount, Math.round(LAMPLIGHTER_PAY.rimPurseCr * lamplighterTierFor(LAMPLIGHTER.slotCount).payMult));
  sim.dispose();
});

test('while spurned the receipts say zero — the purse stayed shut', () => {
  const { sim, state, bus, player, heard } = boot();
  lightPath(sim, state, 3);
  t(state).nextSnufferAt = 0;
  t(state).nextWayfarerAt = 0;
  sim.step();
  const f = flags(state);
  f.lamplighter_strikes = 2; f.lamplighter_spurned = true;
  const s = snuffs(state)[0];
  killBy(bus, s, player.id);
  assert.equal(heard('lamplighter:snufferDowned')[0].bountyCr, 0, 'no purse, no receipt');
  assert.equal(board(state).standing.strikes, 1, 'the kill still worked the debt');
  const w = ways(state)[0];
  w.data.lampWp = w.data.lampRoute.length;
  w.pos = { x: LAMPLIGHTER.post.x + 30, z: LAMPLIGHTER.post.z + 20 };
  sim.step();
  assert.equal(heard('lamplighter:wayfarerArrived')[0].tollCr, 0);
  assert.equal(board(state).standing.strikes, 0);
  sim.dispose();
});

test('the once-stamp bag evicts to the cap, not under it', () => {
  const { sim, state, heard } = boot();
  const paid = flags(state).lamplighter_paid = {};
  for (let i = 0; i < 96; i += 1) paid[`old:${i}`] = 1;
  const pod = sim.spawn(lamplighterOilPodSpec(0));
  deliver(sim, pod, robot(state).pos);
  assert.equal(heard('lamplighter:oiled').length, 1);
  assert.equal(Object.keys(flags(state).lamplighter_paid).length, 96,
    'one new stamp evicts exactly one old one');
  sim.dispose();
});

// ── the pilot's service edge ───────────────────────────────────────────────────

test('a corpse parked in the ring sells no fuel', () => {
  const { sim, state, heard, player } = boot();
  flags(state).lamplighter_oil = 100;
  giveCells(state, 3);
  player.pos = { x: robot(state).pos.x + 20, z: robot(state).pos.z + 10 };
  player.alive = false; // a wreck in the ring, not a pilot at the pump
  sim.step();
  assert.equal(state.player.cargo.items[CELL], 3, 'no cell leaves a dead hand');
  assert.equal(heard('lamplighter:oilSold').length, 0);
  player.alive = true; // and a live pilot resumes the trade
  sim.step();
  assert.equal(state.player.cargo.items[CELL], 2);
  assert.equal(heard('lamplighter:oilSold').length, 1);
  sim.dispose();
});

// ── the keeper record ──────────────────────────────────────────────────────────

test('deeds raise the keeper tier and the tier scales the purse', () => {
  const { sim, state, grants, heard } = boot();
  lightPath(sim, state, 3); // three deeds — Hand of the Post
  const tierUps = heard('lamplighter:keeperTier');
  assert.equal(tierUps.length, 1);
  assert.equal(tierUps[0].tier, 1);
  assert.equal(board(state).standing.deeds, 3);
  grants.length = 0;
  lightNext(sim, state);
  const pay = grantOf(grants, 'lamplighter_plant')[0];
  assert.ok(pay, 'the fourth lamp pays');
  assert.equal(pay.amount, Math.round(LAMPLIGHTER_PAY.plantPayCr * lamplighterTierFor(3).payMult));
  sim.dispose();
});

test('the tier table is monotonic and the ladder names five ranks', () => {
  assert.equal(lamplighterTierFor(-4).tier, 0);
  assert.equal(lamplighterTierFor(0).id, 'stranger');
  assert.equal(lamplighterTierFor(3).id, 'hand');
  assert.equal(lamplighterTierFor(8).id, 'keeper');
  assert.equal(lamplighterTierFor(16).id, 'warden');
  assert.equal(lamplighterTierFor(4000).id, 'rimlit');
});

// ── durability and cleanup ─────────────────────────────────────────────────────

test('kill the keeper: the wire lapses, the ambient rim goes home, the lamps stay', () => {
  const { sim, state, bus, player, heard } = boot();
  lightPath(sim, state, 3);
  flags(state).lamplighter_oil = 50; // an open oil ask posts next census
  sim.step(); // the lit lane draws its own traffic — a wayfarer is already inbound
  assert.ok(ways(state).length >= 1);
  assert.equal(snuffs(state).length, 1);
  assert.ok(lamplighterAsks(state).some((a) => a.kind === 'oil'));
  const lapsedBefore = heard('lamplighter:askLapsed').length;
  killBy(bus, robot(state), player.id);
  assert.equal(flags(state)[LAMPLIGHTER.goneFlag], true);
  assert.ok(heard('lamplighter:askLapsed').length > lapsedBefore, 'the open asks lapsed');
  sim.step();
  assert.equal(robot(state), null, 'no respawn behind the gone flag');
  assert.equal(snuffs(state).length, 0, 'a dead post owes no bounties');
  assert.equal(ways(state).length, 0, 'a dead post owes no route');
  assert.equal(pods(state).length, 0, 'a dead post drops no oil');
  assert.equal(lamps(state).length, 3, 'the planted lights are the rim\'s furniture');
  sim.dispose();
});

test('malformed session and durable state normalize on read and never throw', () => {
  const { sim, state } = boot();
  state.lamplighter = { asks: 'junk', log: 4, nextPodAt: 'x', nextSnufferAt: {} };
  const f = flags(state);
  f.lamplighter_oil = 'bad';
  f.lamplighter_charge = 'worse';
  f.lamplighter_paid = 7;
  f.lamplighter_deeds = 'NaN';
  f.lamplighter_strikes = null;
  assert.doesNotThrow(() => sim.step());
  const b = board(state);
  assert.ok(Number.isFinite(b.oil));
  assert.equal(b.charge.length, LAMPLIGHTER.slotCount);
  assert.equal(b.standing.tier, 0);
  assert.deepEqual(t(state).asks, []);
  sim.dispose();
});

test('the session ledgers stay bounded under junk input', () => {
  const { sim, state } = boot();
  const lt = t(state);
  for (let i = 0; i < 30; i += 1) lt.asks.push({ id: `junk:${i}`, kind: 'oil', state: 'verified' });
  for (let i = 0; i < 40; i += 1) lt.log.push({ id: `log:${i}`, kind: 'planted' });
  sim.step();
  assert.ok(t(state).asks.length <= 16);
  assert.ok(t(state).log.length <= 20);
  sim.dispose();
});

test('a recycled id carries no prior receipt — the generation rides the key', () => {
  const { sim, state, heard } = boot();
  flags(state).lamplighter_oil = 100;
  t(state).nextPodAt = 0;
  sim.step();
  const pod = pods(state)[0];
  const key = `pod:${pod.id}:${pod.occupantGeneration ?? 0}`;
  deliver(sim, pod, robot(state).pos);
  assert.equal(heard('lamplighter:oiled').length, 1);
  // The same body, delivered twice — the arms already ate it; a re-report pays nothing.
  assert.equal(flags(state).lamplighter_paid[key] != null, true);
  // A new hull claiming the recycled slot is a new body and a new receipt.
  sim.helpers.removeEntity(pod.id);
  state.entities.delete(pod.id);
  sim.step();
  const pod2 = sim.spawn(lamplighterOilPodSpec(99));
  assert.equal(pod2.id, pod.id, 'the slot recycled');
  assert.notEqual(pod2.occupantGeneration, pod.occupantGeneration, 'the generation guards it');
  deliver(sim, pod2, robot(state).pos);
  assert.equal(heard('lamplighter:oiled').length, 2, 'the new body pays its own receipt');
  sim.dispose();
});

test('save:loaded keeps the durable record and re-hails the visit', () => {
  const { sim, state, bus, popups } = boot();
  lightPath(sim, state, 2);
  const oil = board(state).oil;
  const charge = [...board(state).charge];
  const hails = popups.filter((p) => p.id === 'lamplighter_announce').length;
  bus.emit('save:loaded');
  assert.equal(board(state).lit, 2, 'the mask survives');
  assert.equal(board(state).oil, oil, 'the tank survives');
  assert.deepEqual(board(state).charge, charge, 'the charges survive');
  assert.equal(board(state).standing.deeds, 2, 'the keeper record survives');
  assert.equal(
    popups.filter((p) => p.id === 'lamplighter_announce').length, hails + 1,
    'a returning pilot hears the ask again',
  );
  sim.dispose();
});

test('the exports hold: specs tag their bodies, constants are frozen', () => {
  assert.equal(lamplighterSpec().data.lamplighter, true);
  assert.equal(lamplighterDeadSpec(2).data.lamplighterDeadIndex, 2);
  assert.equal(lamplighterLampSpec(4).data.lamplighterSlot, 4);
  assert.equal(lamplighterOilPodSpec(7).data.lamplighterOil, true);
  const w = lamplighterWayfarerSpec(2, 7);
  assert.equal(w.data.lamplighterWayfarer, true);
  assert.deepEqual(w.data.lampRoute, [2, 1, 0]);
  assert.equal(lamplighterSnufferSpec(3).data.lamplighterSnuffer, true);
  assert.ok(Object.isFrozen(LAMPLIGHTER_UPKEEP));
  assert.ok(Object.isFrozen(LAMPLIGHTER_SNUFFERS));
  // Deterministic: the same seq draws the same drop ring.
  const a = lamplighterOilPodSpec(11).pos;
  const b = lamplighterOilPodSpec(11).pos;
  assert.deepEqual(a, b);
});
