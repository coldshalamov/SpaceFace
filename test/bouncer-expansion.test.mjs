// BOUNCER expansion — enforceable law: station records, escalating strikes, wanted
// rowdies, hired muscle, VIP courtesy, trespass-on-sight bans. Seeded, deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBouncer, bouncerSpec, bouncerRecordKey, bouncerIsVip, bouncerEjectScale,
  bouncerStatusAfterEject, bouncerMuscleSpec, bouncerMusclePatrolPost,
  BOUNCER_LAW, BOUNCER_MUSCLE,
} from '../src/systems/bouncer.js';
import { BOUNCER } from '../src/data/bouncer.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

const CENTER = BOUNCER.center;
const INSIDE = { x: CENTER.x + 20, z: CENTER.z };
const OUTSIDE = { x: CENTER.x + BOUNCER.ringRadius + 400, z: CENTER.z };
const HEARD = [
  'comms:popup', 'bouncer:warned', 'bouncer:ejected', 'bouncer:offense',
  'bouncer:wanted', 'bouncer:wantedCleared', 'bouncer:banned', 'bouncer:vipDischarge',
  'bouncer:muscleHired', 'bouncer:muscleShove', 'bouncer:muscleStandDown',
  'bouncer:vipEarned',
];

function fixture({ sector = BOUNCER.sectorId, kind = 'adventure', seed = 42 } = {}) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 0, tick: 0, mode: 'flight', run: { kind }, rng: mulberry32(seed),
    world: { currentSectorId: sector }, entities: new Map(), entityList: [],
    story: { flags: {} }, playerId: 7, ui: { docked: false },
  };
  let id = 10;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++id }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(rid) { const e = state.entities.get(rid); if (e) e.alive = false; },
  };
  const player = helpers.spawnEntity({ type: 'ship', pos: { ...OUTSIDE }, vel: { x: 0, z: 0 }, radius: 4, mass: 20, hull: 50, hullMax: 50, isPlayer: true });
  state.playerId = player.id;
  for (const t of HEARD) bus.on(t, (p) => events.push([t, p]));
  const system = createBouncer();
  system.init({ state, bus, helpers });
  const robot = () => state.entityList.filter((e) => e.alive && e.data?.bouncer === true)[0] || null;
  const muscle = () => state.entityList.filter((e) => e.alive !== false && e.data?.bouncerMuscle === true);
  const addCorsair = (over = {}) => helpers.spawnEntity({
    type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 25, hull: 30, hullMax: 30, data: {}, ...over,
  });
  const fire = (ownerId) => bus.emit('combat:fire', { ownerId, weaponId: 'wpn_pulse', origin: INSIDE });
  const impulses = (entity) => {
    const cmds = consumePhysicsCommand(entity);
    return cmds && cmds.impulses ? cmds.impulses.splice(0) : [];
  };
  const records = () => state.stationRecords?.bouncer || null;
  const row = (e) => records()?.offenders?.[bouncerRecordKey(e, state)] || null;
  const count = (t) => events.filter(([x]) => x === t).length;
  return { bus, state, helpers, system, events, robot, muscle, addCorsair, fire, impulses, records, row, count, player };
}

/** warn → throw #1 → throw #2 posts the sheet wanted. */
function makeWanted(f, e) {
  f.fire(e.id); f.fire(e.id);
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.fire(e.id);
}

/** …and throws #3 and #4 ban the hull outright. */
function makeBanned(f, e) {
  makeWanted(f, e);
  for (let i = 0; i < 2; i++) {
    f.state.simTime += BOUNCER.ejectCooldownS + 1;
    f.fire(e.id);
  }
}

test('the station keeps a JSON-safe rap sheet — offenses, tab, status, mirror flag', () => {
  const f = fixture();
  const c = f.addCorsair();
  f.fire(c.id);
  const rec = f.records();
  assert.ok(rec, 'stationRecords.bouncer exists after the first offense');
  const row = f.row(c);
  assert.equal(row.offenses, 1);
  assert.equal(row.strikes, 1);
  assert.equal(row.status, 'watched');
  assert.equal(row.lastKind, 'discharge');
  assert.equal(row.tab, BOUNCER_LAW.tabPerOffense);
  assert.equal(f.count('bouncer:offense'), 1);
  // Every byte of the sheet must survive JSON — saves and scanners read it raw.
  const clone = JSON.parse(JSON.stringify(f.state.stationRecords));
  assert.deepEqual(clone.bouncer.offenders[bouncerRecordKey(c, f.state)].status, 'watched');
  const mirror = f.state.story.flags[BOUNCER_LAW.recordsFlag];
  assert.ok(mirror && typeof mirror === 'object', 'the flag mirror carries the sheet');
  assert.equal(mirror.offenders[bouncerRecordKey(c, f.state)].offenses, 1);
});

test('the second throw posts the hull wanted — mark, event, and hired muscle', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeWanted(f, c);
  const row = f.row(c);
  assert.equal(row.ejections, 2);
  assert.equal(row.status, 'wanted');
  assert.ok(Number.isFinite(row.wantedUntil) && row.wantedUntil > f.state.simTime);
  assert.equal(c.data.bazaarWanted, true, 'the live hull wears the mark other actors read');
  assert.equal(f.count('bouncer:wanted'), 1);
  assert.equal(f.records().wantedIssued, 1);
  assert.equal(f.muscle().length, BOUNCER_MUSCLE.perWanted, 'a wanted hull rates its contract');
  assert.equal(f.count('bouncer:muscleHired'), 1);
  assert.equal(f.muscle()[0].data.muscleFor, bouncerRecordKey(c, f.state));
});

test('wanted rowdies get no more warnings — every shot inside is the throw', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeWanted(f, c);
  const warnedBefore = f.count('bouncer:warned');
  f.impulses(c);
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.fire(c.id);
  assert.equal(f.count('bouncer:warned'), warnedBefore, 'the door has nothing left to say');
  assert.equal(f.impulses(c).length, 1, 'the first shot inside is the throw');
  assert.equal(f.row(c).ejections, 3);
});

test('repeat rowdies fly harder — every prior throw adds to the next', () => {
  const f = fixture();
  const c = f.addCorsair();
  const dv = () => { const [i] = f.impulses(c); return Math.hypot(i.x, i.z) / c.mass; };
  f.fire(c.id); f.fire(c.id);
  const first = dv();
  assert.ok(Math.abs(first - BOUNCER.ejectDeltaV) < 1e-6, 'throw one is the authored shove');
  makeWanted(f, c); // consumes throws #2 — already read above? re-read for #2
  f.impulses(c);
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.fire(c.id); // throw #3
  const third = dv();
  assert.ok(third > first, 'a watched-then-wanted hull is thrown harder');
  const expected = BOUNCER.ejectDeltaV * (1 + 2 * BOUNCER_LAW.repeatEjectScale);
  assert.ok(Math.abs(third - expected) < 1e-6, `expected ${expected}, got ${third}`);
});

test('the fourth throw bans the hull — mark, event, and the player receipt', () => {
  const f = fixture();
  f.player.pos.x = INSIDE.x; f.player.pos.z = INSIDE.z;
  makeBanned(f, f.player);
  const row = f.row(f.player);
  assert.equal(row.status, 'banned');
  assert.equal(row.ejections, 4);
  assert.ok(row.bannedAt != null);
  assert.equal(row.wantedUntil, null, 'a ban does not cool');
  assert.equal(f.player.data.doorBanned, true);
  assert.equal(f.count('bouncer:banned'), 1);
  assert.equal(f.records().bansIssued, 1);
  assert.equal(f.state.story.flags[BOUNCER_LAW.playerBannedFlag], true, 'the receipt sticks');
});

test('a banned hull inside the ring is thrown on sight — no shot required', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeBanned(f, c);
  assert.equal(f.row(c).status, 'banned');
  const ejectsBefore = f.count('bouncer:ejected');
  f.impulses(c);
  f.state.simTime += BOUNCER.ejectCooldownS + 1; // let the arm breathe
  f.system.update(0.5, f.state); // the sweep sees the mark — no combat:fire involved
  const trespass = f.events.filter(([t, p]) => t === 'bouncer:ejected' && p.kind === 'trespass');
  assert.equal(trespass.length, 1, 'the mark is the warrant');
  assert.ok(f.count('bouncer:ejected') > ejectsBefore);
  // The door's throw lands among any muscle shoves — find it by its mass-scaled delta-V.
  const imp = f.impulses(c);
  const expected = BOUNCER.ejectDeltaV * (1 + 4 * BOUNCER_LAW.repeatEjectScale) * BOUNCER_LAW.bannedEjectScale;
  const dvs = imp.map((i) => Math.hypot(i.x, i.z) / c.mass);
  assert.ok(dvs.some((dv) => Math.abs(dv - expected) < 1e-6),
    `banned hulls are thrown hardest of all — expected ${expected} in [${dvs.join(', ')}]`);
  assert.equal(f.records().trespassThrows, 1);
});

test('hired muscle chases its mark and shoves it out through the membrane', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeWanted(f, c);
  const m = f.muscle()[0];
  assert.ok(m, 'contract on the field');
  // Far: it drives toward the mark.
  m.pos.x = c.pos.x + 400; m.pos.z = c.pos.z; m.vel.x = 0; m.vel.z = 0;
  f.system.update(0.5, f.state);
  const chase = f.impulses(m);
  assert.equal(chase.length, 1, 'the chase is a queued impulse, not a vel write');
  assert.ok(chase[0].x < 0, 'the impulse points at the mark');
  // Near: it hangs on and puts the mark through the door.
  f.impulses(c);
  m.pos.x = c.pos.x + 15; m.pos.z = c.pos.z; m.vel.x = 0; m.vel.z = 0;
  f.system.update(0.5, f.state);
  const shove = f.impulses(c);
  assert.equal(shove.length, 1, 'a paid hand shoves the mark');
  const dv = Math.hypot(shove[0].x, shove[0].z) / c.mass;
  assert.ok(Math.abs(dv - BOUNCER_MUSCLE.shoveDv) < 1e-6);
  assert.ok(shove[0].x > 0, 'the shove points out through the door (radial from ring heart)');
  assert.equal(f.count('bouncer:muscleShove'), 1);
  // The arm needs a breath: an immediate second update does not stack shoves.
  f.system.update(0.5, f.state);
  assert.equal(f.count('bouncer:muscleShove'), 1, 'shove cooldown bounds the arm');
});

test('a markless contract holds a perimeter post — muscle patrols the ring', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeWanted(f, c);
  const m = f.muscle()[0];
  c.alive = false; // the mark dies on someone else's knife; the paper is still hot
  f.system.update(0.5, f.state);
  assert.ok(m.alive !== false, 'the contract outlives the mark — it waits at the ring');
  const imp = f.impulses(m);
  assert.equal(imp.length, 1, 'it walks to its berth through the membrane');
  const post = bouncerMusclePatrolPost(m.data.patrolSlot);
  const dx = post.x - m.pos.x, dz = post.z - m.pos.z;
  const dot = imp[0].x * dx + imp[0].z * dz;
  assert.ok(dot > 0, 'the impulse points at the patrol berth');
});

test('wanted sheets cool on clean time; the muscle stands down with them', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeWanted(f, c);
  const m = f.muscle()[0];
  f.state.simTime += BOUNCER_LAW.wantedS + 1;
  f.system.update(0.5, f.state);
  const row = f.row(c);
  assert.equal(row.status, 'watched', 'the sheet cools back to watched');
  assert.equal(row.wantedUntil, null);
  assert.equal(c.data.bazaarWanted, undefined, 'the mark comes off the hull');
  assert.equal(f.count('bouncer:wantedCleared'), 1);
  assert.equal(m.alive, false, 'the contract ends with the paper');
  const stands = f.events.filter(([t, p]) => t === 'bouncer:muscleStandDown' && p.reason === 'cooled');
  assert.equal(stands.length, 1);
});

test('muscle contracts are bounded — the bazaar pays for four hulls at once, tops', () => {
  const f = fixture();
  const rowdies = [];
  for (let i = 0; i < BOUNCER_MUSCLE.maxTotal + 1; i++) {
    const c = f.addCorsair();
    makeWanted(f, c);
    rowdies.push(c);
  }
  assert.equal(f.muscle().length, BOUNCER_MUSCLE.maxTotal, 'the purse caps the contract line');
  assert.equal(f.records().muscleHired, BOUNCER_MUSCLE.maxTotal);
  assert.equal(f.records().wantedIssued, BOUNCER_MUSCLE.maxTotal + 1,
    'every mark still posts its sheet — only the muscle line is bounded');
});

test('friends of the house get a courtesy notice, never a strike', () => {
  const f = fixture();
  const vip = f.addCorsair({ data: { vip: true } });
  f.fire(vip.id); f.fire(vip.id);
  assert.equal(f.count('bouncer:warned'), 0, 'no strike for a friend of the house');
  assert.equal(f.count('bouncer:ejected'), 0);
  assert.equal(f.impulses(vip).length, 0);
  assert.equal(f.count('bouncer:vipDischarge'), 1, 'one talking-to per burst window');
  assert.equal(f.records().vipNotices, 2, 'the sheet still counts every discharge');
  assert.equal(f.row(vip), null, 'but the VIP keeps no offender row');
  f.state.simTime += 31;
  f.fire(vip.id);
  assert.equal(f.count('bouncer:vipDischarge'), 2, 'the notice rate-limit is per hull over time');
  // The player's own door standing reads from story flags.
  f.player.pos.x = INSIDE.x; f.player.pos.z = INSIDE.z;
  f.state.story.flags.bouncer_vip = true;
  f.fire(f.player.id); f.fire(f.player.id);
  assert.equal(f.count('bouncer:warned'), 0);
  assert.equal(f.impulses(f.player).length, 0);
});

test('muscle does not eat door law — a paid hand firing inside is not a strike', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeWanted(f, c);
  const m = f.muscle()[0];
  m.pos.x = INSIDE.x; m.pos.z = INSIDE.z;
  const warns = f.count('bouncer:warned'), ejects = f.count('bouncer:ejected');
  f.fire(m.id);
  assert.equal(f.count('bouncer:warned'), warns);
  assert.equal(f.count('bouncer:ejected'), ejects);
});

test('the rap sheet survives the save through the flag mirror', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeBanned(f, c);
  const mirror = JSON.parse(JSON.stringify(f.state.story.flags[BOUNCER_LAW.recordsFlag]));
  assert.equal(mirror.offenders[bouncerRecordKey(c, f.state)].status, 'banned');
  // The envelope replaces state; the live subtree is gone and the mirror must rebuild it.
  f.state.stationRecords = {};
  f.bus.emit('save:loaded', {});
  const rec = f.records();
  assert.ok(rec, 'the sheet came back off the mirror');
  assert.equal(rec.offenders[bouncerRecordKey(c, f.state)].status, 'banned');
  assert.equal(rec.bansIssued, mirror.bansIssued);
  // A save that carried no door history restores an empty sheet, never a stale one.
  delete f.state.story.flags[BOUNCER_LAW.recordsFlag];
  f.state.stationRecords = { bouncer: { schema: 999, offenders: { 'hull:1': { status: 'banned' } } } };
  f.bus.emit('save:loaded', {});
  assert.equal(f.state.stationRecords.bouncer, undefined, 'no mirror, no phantom sheet');
});

test('a banned hull that survives the save keeps its paper — marks, throws, muscle', () => {
  const f = fixture();
  const c = f.addCorsair({ occupantGeneration: 11 });
  makeBanned(f, c);
  const key = bouncerRecordKey(c, f.state);
  assert.equal(f.row(c).status, 'banned');
  assert.equal(f.row(c).gen, 11);
  // The save serializes data but never the non-enumerable occupant token; the
  // restore re-stamps every hull a fresh generation under a reclaimed id.
  const savedData = JSON.parse(JSON.stringify(c.data));
  assert.equal(savedData.bazaarWanted, true, 'the mark rides the save in data');
  assert.equal(savedData.doorBanned, true);
  const deadId = c.id;
  f.state.entityList.length = 0;
  f.state.entities.clear();
  f.player = f.helpers.spawnEntity({ type: 'ship', pos: { ...OUTSIDE }, vel: { x: 0, z: 0 }, radius: 4, mass: 20, hull: 50, hullMax: 50, isPlayer: true });
  f.state.playerId = f.player.id;
  f.state.stationRecords = {};
  const c2 = f.helpers.spawnEntity({
    type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 25, hull: 30, hullMax: 30, data: savedData, occupantGeneration: 99,
  });
  f.state.entities.delete(c2.id);
  c2.id = deadId;
  f.state.entities.set(deadId, c2);
  f.bus.emit('save:loaded', {});
  const row = f.records().offenders[key];
  assert.equal(row.status, 'banned');
  assert.equal(row.gen, 99, 'the row re-stamps onto the restored occupant, not dead paper');
  // The re-bound paper enforces: marks stay on, muscle re-hires, trespass throws.
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.system.update(0.5, f.state);
  assert.equal(c2.data.bazaarWanted, true, 'the restored mark is not stripped as stale');
  assert.equal(c2.data.doorBanned, true);
  assert.equal(f.muscle().length, BOUNCER_MUSCLE.perBanned, 'the contract re-stands against the mark');
  const trespass = f.events.filter(([t, p]) => t === 'bouncer:ejected' && p.kind === 'trespass' && p.entityId === c2.id);
  assert.equal(trespass.length, 1, 'the ban still throws on sight after the save');
});

test('a stale mark on dead paper still dies — adoption needs hot paper', () => {
  const f = fixture();
  const c = f.addCorsair({ occupantGeneration: 11 });
  makeWanted(f, c);
  const key = bouncerRecordKey(c, f.state);
  // Snapshot the mark the save would carry, then let the sheet honestly cool —
  // the mirror ends up 'watched' while the hull snapshot still reads marked.
  const savedData = JSON.parse(JSON.stringify(c.data));
  f.state.simTime += BOUNCER_LAW.wantedS + 1;
  f.system.update(0.5, f.state);
  assert.equal(f.row(c).status, 'watched');
  c.alive = false;
  const deadId = c.id;
  f.state.entityList.length = 0;
  f.state.entities.clear();
  f.player = f.helpers.spawnEntity({ type: 'ship', pos: { ...OUTSIDE }, vel: { x: 0, z: 0 }, radius: 4, mass: 20, hull: 50, hullMax: 50, isPlayer: true });
  f.state.playerId = f.player.id;
  f.state.stationRecords = {};
  const c2 = f.helpers.spawnEntity({
    type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 25, hull: 30, hullMax: 30, data: savedData, occupantGeneration: 42,
  });
  f.state.entities.delete(c2.id);
  c2.id = deadId;
  f.state.entities.set(deadId, c2);
  f.bus.emit('save:loaded', {});
  assert.equal(f.records().offenders[key].gen, 11, 'a cooled row does not adopt the stranger');
  f.system.update(0.5, f.state);
  assert.equal(c2.data.bazaarWanted, undefined, 'the stale mark strips on the sweep');
});

test('the ledger stays bounded — old small fry evicts before active paper', () => {
  const f = fixture();
  // Fill past the cap with watched-only rows.
  for (let i = 0; i < BOUNCER_LAW.maxOffenderRows + 3; i++) {
    const c = f.addCorsair();
    f.fire(c.id);
    f.state.simTime += 1;
  }
  // One wanted hull — its paper must survive the prune.
  const rowdy = f.addCorsair();
  makeWanted(f, rowdy);
  f.system.update(0.5, f.state);
  const rec = f.records();
  assert.ok(Object.keys(rec.offenders).length <= BOUNCER_LAW.maxOffenderRows + 1,
    'the ledger is bounded (plus the row written after the sweep)');
  f.system.update(0.5, f.state); // a second sweep settles it fully under the cap
  assert.ok(Object.keys(rec.offenders).length <= BOUNCER_LAW.maxOffenderRows);
  assert.equal(f.row(rowdy)?.status, 'wanted', 'active paper is never evicted');
});

test('pure helpers are honest — keys, VIP, scales, statuses, specs', () => {
  const state = { playerId: 7 };
  assert.equal(bouncerRecordKey({ id: 7, isPlayer: true }, state), 'player');
  assert.equal(bouncerRecordKey({ id: 9, data: { authoredCharacter: 'docket' } }, state), 'char:docket');
  assert.equal(bouncerRecordKey({ id: 9, data: {} }, state), 'hull:9');
  assert.equal(bouncerIsVip({ data: { vip: true } }, {}), true);
  assert.equal(bouncerIsVip({ data: { stationCrew: true } }, {}), true);
  assert.equal(bouncerIsVip({ isPlayer: true, data: {} }, { bouncer_vip: true }), true);
  assert.equal(bouncerIsVip({ data: {} }, {}), false);
  assert.equal(bouncerStatusAfterEject(0), 'watched');
  assert.equal(bouncerStatusAfterEject(BOUNCER_LAW.ejectionsToWanted), 'wanted');
  assert.equal(bouncerStatusAfterEject(BOUNCER_LAW.ejectionsToBan), 'banned');
  assert.equal(bouncerEjectScale(null), 1);
  assert.equal(bouncerEjectScale({ ejections: 2, status: 'wanted' }), 1 + 2 * BOUNCER_LAW.repeatEjectScale);
  const bannedScale = bouncerEjectScale({ ejections: 4, status: 'banned' });
  assert.ok(bannedScale > 1 + 4 * BOUNCER_LAW.repeatEjectScale, 'banned hulls fly hardest');
  // Muscle specs are deterministic per mark+slot — same key, same spawn geometry.
  const a = bouncerMuscleSpec('hull:12', 0), b = bouncerMuscleSpec('hull:12', 0);
  assert.deepEqual(a.pos, b.pos);
  assert.equal(a.data.bouncerMuscle, true);
  assert.equal(a.data.muscleFor, 'hull:12');
  const post = bouncerMusclePatrolPost(3);
  const r = Math.hypot(post.x - CENTER.x, post.z - CENTER.z);
  assert.ok(r <= BOUNCER.ringRadius, 'perimeter berths sit on the ring');
  assert.notDeepEqual(bouncerMusclePatrolPost(1), bouncerMusclePatrolPost(2));
});

test('a recycled transponder does not inherit the dead rowdy\'s paper', () => {
  const f = fixture();
  const c = f.addCorsair({ occupantGeneration: 11 });
  makeBanned(f, c);
  const key = bouncerRecordKey(c, f.state);
  const row = f.row(c);
  assert.equal(row.status, 'banned');
  assert.equal(row.gen, 11, 'the hull row is stamped with its occupant generation');
  // The rowdy dies inside the cordon; the allocator hands its transponder id to
  // a fresh hull with a fresh occupant generation.
  const deadId = c.id;
  c.alive = false;
  const c2 = f.helpers.spawnEntity({
    type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 25, hull: 30, hullMax: 30, data: {}, occupantGeneration: 12,
  });
  f.state.entities.delete(c2.id);
  c2.id = deadId;
  f.state.entities.set(deadId, c2);
  // The sweep must not re-mark, trespass-throw, or muscle-hunt the new occupant.
  const ejectsBefore = f.count('bouncer:ejected');
  const warnsBefore = f.count('bouncer:warned');
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.system.update(0.5, f.state);
  assert.equal(c2.data.bazaarWanted, undefined, 'the recycled hull wears no wanted mark');
  assert.equal(c2.data.doorBanned, undefined, 'and no ban mark');
  assert.equal(f.impulses(c2).length, 0, 'no throw and no shove lands on the new hull');
  assert.equal(f.count('bouncer:ejected'), ejectsBefore, 'no trespass throw on sight');
  // And when the new hull genuinely offends, it starts a fresh sheet — warn
  // first, like anyone\'s — not a continuation of the corpse\'s ban.
  f.fire(c2.id);
  const fresh = f.records().offenders[key];
  assert.equal(fresh.offenses, 1);
  assert.equal(fresh.ejections, 0, 'the dead hull\'s four throws are not inherited');
  assert.equal(fresh.status, 'watched');
  assert.equal(fresh.gen, 12);
  assert.equal(f.count('bouncer:warned'), warnsBefore + 1, 'a first strike is a warning');
  assert.equal(f.impulses(c2).length, 0, 'one shot inside earns a warning, not a throw');
  assert.equal(f.count('bouncer:banned'), 1, 'the only ban on record is still the dead hull\'s');
});

test('a continuous beam books one offense — per-tick receipts strike and throw, never re-book', () => {
  const f = fixture();
  const c = f.addCorsair();
  const beam = (phase) => f.bus.emit('combat:fire', {
    ownerId: c.id, weaponId: 'wpn_beam', origin: INSIDE, continuous: true, phase,
  });
  beam('begin');
  for (let i = 0; i < 5; i++) beam('update');
  const row = f.row(c);
  assert.equal(row.offenses, 1, 'one held trigger is one discharge, not six');
  assert.equal(row.strikes, 1, 'continuations do not re-book the sheet');
  assert.equal(f.count('bouncer:offense'), 1);
  // Throw timing is identical to discrete fire: the second tick inside the
  // window is the throw, and the arm cooldown bounds the rest.
  assert.equal(f.count('bouncer:warned'), 1);
  assert.equal(row.ejections, 1);
  assert.equal(row.tab, BOUNCER_LAW.tabPerOffense + BOUNCER_LAW.tabPerOffense * row.ejections);
  assert.equal(f.impulses(c).length, 1);
  // A friend of the house on a beam likewise gets one courtesy, not six.
  const vip = f.addCorsair({ data: { vip: true } });
  const vipBeam = (phase) => f.bus.emit('combat:fire', {
    ownerId: vip.id, weaponId: 'wpn_beam', origin: INSIDE, continuous: true, phase,
  });
  const noticesBefore = f.records().vipNotices;
  vipBeam('begin'); vipBeam('update'); vipBeam('update'); vipBeam('update');
  assert.equal(f.records().vipNotices, noticesBefore + 1);
  assert.equal(f.count('bouncer:vipDischarge'), 1);
});

test('a wanted hull that re-offends re-heats its sheet — the deadline moves', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeWanted(f, c);
  const row = f.row(c);
  const firstDeadline = row.wantedUntil;
  assert.ok(Number.isFinite(firstDeadline));
  f.state.simTime += 60; // still hot — well inside the 150-second sheet
  f.fire(c.id); // a wanted hull gets no warning: the shot is the throw
  assert.equal(row.status, 'wanted');
  assert.equal(row.ejections, 3);
  assert.equal(row.wantedUntil, f.state.simTime + BOUNCER_LAW.wantedS,
    'the sheet re-heats from this offense, not the original post');
  assert.ok(row.wantedUntil > firstDeadline);
  assert.equal(c.data.bazaarWantedUntil, row.wantedUntil,
    'the hull advertises the live deadline');
});

test('a docked hull is not rowdy — no trespass throw, no muscle shove', () => {
  const f = fixture();
  f.player.pos.x = INSIDE.x; f.player.pos.z = INSIDE.z;
  makeBanned(f, f.player);
  assert.equal(f.row(f.player).status, 'banned');
  // The player berths at the bazaar inside the cordon — alive, positioned,
  // still banned. The berth, not the ban, is what shields.
  f.state.ui.docked = true;
  f.impulses(f.player);
  const ejectsBefore = f.count('bouncer:ejected');
  for (let i = 0; i < 2; i++) {
    f.state.simTime += BOUNCER.ejectCooldownS + 1;
    f.system.update(0.5, f.state);
  }
  assert.equal(f.count('bouncer:ejected'), ejectsBefore, 'a berthed hull is not thrown on sight');
  assert.equal(f.impulses(f.player).length, 0, 'no throw and no muscle shove lands');
  assert.equal(f.player.data.doorBanned, true, 'the paper still stands');
  assert.equal(f.player.data.bazaarWanted, true, 'the mark still reads — only enforcement sleeps');
  // A berthed corsair reads the same way through flags.docked.
  const c = f.addCorsair();
  makeBanned(f, c);
  c.flags.docked = true;
  f.state.ui.docked = false;
  f.impulses(c);
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.system.update(0.5, f.state);
  const thrown = f.events.filter(([t, p]) => t === 'bouncer:ejected' && p.entityId === c.id && p.kind === 'trespass');
  assert.equal(thrown.length, 0, 'a docked corsair is not trespass-thrown either');
  assert.equal(f.impulses(c).length, 0);
});

test('a ban stops advertising a cooling deadline — bazaarWantedUntil clears', () => {
  const f = fixture();
  const c = f.addCorsair();
  makeWanted(f, c);
  assert.ok(Number.isFinite(c.data.bazaarWantedUntil), 'the wanted hull advertises its sheet');
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.fire(c.id); // throw #3
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.fire(c.id); // throw #4 — the ban
  const row = f.row(c);
  assert.equal(row.status, 'banned');
  assert.equal(row.wantedUntil, null, 'a ban does not cool');
  assert.equal(c.data.bazaarWantedUntil, null, 'the hull stops quoting a deadline it outlived');
  assert.equal(c.data.bazaarWanted, true, 'the mark itself stays — banned hulls are marked');
  // The sweep keeps the advertised field synced to the paper, not stale.
  f.system.update(0.5, f.state);
  assert.equal(c.data.bazaarWantedUntil, null);
});

test('spec and registry surface are unchanged — the robot is the same hull', () => {
  const spec = bouncerSpec();
  assert.equal(spec.data.bouncer, true);
  assert.equal(spec.data.authoredCharacter, 'bouncer');
  assert.equal(spec.hull, 300);
  const f = fixture();
  assert.ok(f.robot());
  f.system.destroy();
  assert.equal(f.robot(), null);
  assert.equal(f.muscle().length, 0, 'destroy stands the whole door down');
});

test('five clean berths earn the courtesy flag — one offense burns the streak', () => {
  const f = fixture();
  const flags = f.state.story.flags;
  const dock = () => f.bus.emit('dock:docked', {});
  for (let i = 0; i < 4; i++) dock();
  assert.equal(flags.bouncer_vip, undefined, 'four berths is still a stranger');
  dock();
  assert.equal(flags.bouncer_vip, true, 'the door knows the transponder now');
  assert.equal(f.count('bouncer:vipEarned'), 1);

  // VIP firing takes a spoken notice, never a strike.
  f.player.pos = { ...INSIDE };
  f.fire(f.player.id);
  assert.equal(f.count('bouncer:vipDischarge'), 1, 'the door talks, it does not strike');
  assert.equal(f.row(f.player), null, 'no blotter entry for a friend of the house');

  // A recorded offense burns the streak: a fresh pilot who offends restarts at zero.
  const g = fixture();
  g.player.pos = { ...INSIDE };
  g.fire(g.player.id);
  assert.equal(g.state.story.flags.bouncer_clean_docks, 0, 'the offense zeroed the streak');
});

test('a corrupt mirror row is normalized, not thrown on — the law still applies', () => {
  const f = fixture();
  const c = f.addCorsair({ occupantGeneration: 7 });
  const key = bouncerRecordKey(c, f.state);
  // A hostile or damaged save carries whatever JSON it wants in the mirror —
  // a string where a row belongs must not turn every shot into a thrown fault.
  f.state.story.flags[BOUNCER_LAW.recordsFlag] = {
    schema: BOUNCER_LAW.recordsSchema,
    offenders: { [key]: 'oops' },
  };
  f.state.stationRecords = {};
  f.bus.emit('save:loaded', {});
  f.fire(c.id);
  const row = f.records().offenders[key];
  assert.ok(row && typeof row === 'object', 'the garbage slot is refiled as a real sheet');
  assert.equal(row.offenses, 1);
  assert.equal(row.status, 'watched');
  assert.equal(row.gen, 7);
  assert.equal(f.count('bouncer:warned'), 1);
  f.fire(c.id);
  assert.equal(f.impulses(c).length, 1, 'the second strike still throws');
});

test('dead paper holds no contract — a banned corpse frees the muscle purse', () => {
  const f = fixture();
  const corpses = [];
  for (let i = 0; i < 2; i++) {
    const c = f.addCorsair({ occupantGeneration: 40 + i });
    makeBanned(f, c);
    corpses.push(c);
  }
  assert.equal(f.muscle().length, BOUNCER_MUSCLE.maxTotal, 'two bans fill the purse');
  // Both rowdies die with their paper still hot — bans never cool by time.
  for (const c of corpses) { c.alive = false; f.state.entities.delete(c.id); }
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.system.update(0.5, f.state);
  assert.equal(f.muscle().length, 0, 'a contract cannot outlive its mark\'s hull');
  const stands = f.events.filter(([t, p]) => t === 'bouncer:muscleStandDown' && p.reason === 'dead_paper');
  assert.equal(stands.length, BOUNCER_MUSCLE.maxTotal, 'dead paper stands its hands down');
  // The purse is free again: the next live mark gets its contract.
  const c3 = f.addCorsair({ occupantGeneration: 99 });
  makeWanted(f, c3);
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.system.update(0.5, f.state);
  const hired = f.muscle().filter((m) => m.data.muscleFor === bouncerRecordKey(c3, f.state));
  assert.equal(hired.length, BOUNCER_MUSCLE.perWanted, 'living paper still buys muscle');
  // The dead rows stay filed (blotter history) but count as evictable, not active.
  assert.equal(f.records().offenders[bouncerRecordKey(corpses[0], f.state)].status, 'banned');
});

test('a remapped transponder keeps its paper — the envelope\'s id map rebinds the sheet', () => {
  const f = fixture();
  const c = f.addCorsair({ occupantGeneration: 11 });
  makeBanned(f, c);
  const oldId = c.id;
  assert.equal(f.records().offenders[`hull:${oldId}`].status, 'banned');
  const savedData = JSON.parse(JSON.stringify(c.data));
  assert.equal(savedData.doorBanned, true);
  // Restore: a stranger claims the rowdy's old transponder first, and the
  // marked hull lands on a fresh id — the envelope publishes where it went.
  f.state.entityList.length = 0;
  f.state.entities.clear();
  f.player = f.helpers.spawnEntity({ type: 'ship', pos: { ...OUTSIDE }, vel: { x: 0, z: 0 }, radius: 4, mass: 20, hull: 50, hullMax: 50, isPlayer: true });
  f.state.playerId = f.player.id;
  f.state.stationRecords = {};
  const stranger = f.helpers.spawnEntity({
    type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 25, hull: 30, hullMax: 30, data: {}, occupantGeneration: 55,
  });
  f.state.entities.delete(stranger.id);
  stranger.id = oldId;
  f.state.entities.set(oldId, stranger);
  const c2 = f.helpers.spawnEntity({
    type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 25, hull: 30, hullMax: 30, data: savedData, occupantGeneration: 99,
  });
  const newId = c2.id;
  assert.notEqual(newId, oldId, 'the rowdy could not reclaim its transponder');
  f.state.sessionEntityIdRemap = new Map([[String(oldId), newId]]);
  f.bus.emit('save:loaded', {});
  const oldKey = `hull:${oldId}`, newKey = `hull:${newId}`;
  assert.equal(f.records().offenders[oldKey], undefined, 'the sheet left the dead key');
  const row = f.records().offenders[newKey];
  assert.ok(row, 'the sheet followed the hull to its new transponder');
  assert.equal(row.status, 'banned');
  assert.equal(row.ejections, 4, 'the ban still carries its history');
  assert.equal(row.gen, 99, 'rebound to the restored occupant, not the stranger');
  // The stranger holding the old id is clean; the marked hull keeps its law.
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.system.update(0.5, f.state);
  assert.equal(stranger.data.bazaarWanted, undefined, 'a recycled transponder wears nothing');
  assert.equal(stranger.data.doorBanned, undefined);
  assert.equal(c2.data.bazaarWanted, true);
  assert.equal(c2.data.doorBanned, true);
  const hired = f.muscle().filter((m) => m.data.muscleFor === newKey);
  assert.equal(hired.length, BOUNCER_MUSCLE.perBanned, 'the contract re-stands under the new key');
  const trespass = f.events.filter(([t, p]) => t === 'bouncer:ejected' && p.kind === 'trespass' && p.entityId === newId);
  assert.equal(trespass.length, 1, 'the ban still throws on sight after the remap');
  const againstStranger = f.events.filter(([t, p]) => t === 'bouncer:ejected' && p.kind === 'trespass' && p.entityId === oldId);
  assert.equal(againstStranger.length, 0, 'the stranger is never thrown on sight');
});

test('a hostile ledger with null rows still evicts — the sim never throws', () => {
  const f = fixture();
  const offenders = { 'hull:1': null };
  for (let i = 2; i <= BOUNCER_LAW.maxOffenderRows + 2; i++) {
    offenders[`hull:${i}`] = i % 3 === 0 ? 'oops' : { status: 'watched', lastOffenseAt: i };
  }
  f.state.story.flags[BOUNCER_LAW.recordsFlag] = { schema: BOUNCER_LAW.recordsSchema, offenders };
  f.state.stationRecords = {};
  f.bus.emit('save:loaded', {});
  assert.doesNotThrow(() => f.system.update(0.5, f.state), 'a null row must not throw through sim.step');
  const keys = Object.keys(f.records().offenders);
  assert.ok(keys.length <= BOUNCER_LAW.maxOffenderRows, 'the ledger is still bounded');
});

test('a beam begun outside the cordon still books its one discharge inside', () => {
  const f = fixture();
  const c = f.addCorsair({ pos: { ...OUTSIDE } });
  const beam = (phase) => f.bus.emit('combat:fire', {
    ownerId: c.id, weaponId: 'wpn_beam', origin: c.pos, continuous: true, phase,
  });
  beam('begin'); // legal — the trigger was pulled outside the ring
  assert.equal(f.row(c), null, 'outside the ring is outside the law');
  c.pos.x = INSIDE.x; c.pos.z = INSIDE.z; // the hull carries the live beam inside
  beam('update');
  const row = f.row(c);
  assert.equal(row.offenses, 1, 'the first inside contact is the one discharge');
  assert.equal(f.count('bouncer:offense'), 1);
  assert.equal(f.count('bouncer:warned'), 1);
  beam('update'); // strike two: the throw — and the sheet escalates, not a null row
  assert.equal(f.impulses(c).length, 1);
  assert.equal(row.ejections, 1, 'the throw lands on the sheet like any other');
  for (let i = 0; i < 4; i++) beam('update');
  assert.equal(row.offenses, 1, 'the whole hold is still one discharge');
  assert.equal(f.count('bouncer:offense'), 1);
  // Keep holding past the arm cooldown: the ladder keeps climbing to wanted.
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  beam('update');
  assert.equal(row.ejections, 2);
  assert.equal(row.status, 'wanted', 'a beam walked in mid-hold posts its mark like any shot');
  assert.equal(c.data.bazaarWanted, true);
});

test('an unprovable occupant does not inherit a stamped rowdy\'s sheet', () => {
  const f = fixture();
  const c = f.addCorsair({ occupantGeneration: 11 });
  makeBanned(f, c);
  const key = bouncerRecordKey(c, f.state);
  assert.equal(f.row(c).status, 'banned');
  const deadId = c.id;
  c.alive = false;
  // The recycler hands the transponder to a hull that was never gen-stamped:
  // _entityByKey already refuses to serve it, so the blotter must too.
  const c2 = f.helpers.spawnEntity({
    type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 25, hull: 30, hullMax: 30, data: {},
  });
  f.state.entities.delete(c2.id);
  c2.id = deadId;
  f.state.entities.set(deadId, c2);
  const warnsBefore = f.count('bouncer:warned');
  f.fire(c2.id);
  const fresh = f.records().offenders[key];
  assert.equal(fresh.offenses, 1);
  assert.equal(fresh.ejections, 0, 'the dead hull\'s four throws are not inherited');
  assert.equal(fresh.status, 'watched', 'first strike is a warning, not a continuation of the ban');
  assert.equal(f.count('bouncer:warned'), warnsBefore + 1);
  assert.equal(f.impulses(c2).length, 0);
  // And the dead paper can never mark, muscle-hunt, or trespass-throw it.
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.system.update(0.5, f.state);
  assert.equal(c2.data.bazaarWanted, undefined);
  assert.equal(c2.data.doorBanned, undefined);
});

test('the courtesy list does not commute a warrant — hot paper outranks VIP', () => {
  const f = fixture();
  // The player earns the ban honestly, THEN carries the courtesy flag — a
  // stale or crafted flag must not shield live paper.
  f.player.pos.x = INSIDE.x; f.player.pos.z = INSIDE.z;
  makeBanned(f, f.player);
  assert.equal(f.row(f.player).status, 'banned');
  f.state.story.flags.bouncer_vip = true;
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  const noticesBefore = f.count('bouncer:vipDischarge');
  const ejectsBefore = f.count('bouncer:ejected');
  f.fire(f.player.id);
  assert.equal(f.count('bouncer:vipDischarge'), noticesBefore, 'a marked hull gets no courtesy');
  const eject = f.events.filter(([t, p]) => t === 'bouncer:ejected' && p.isPlayer === true);
  assert.ok(f.count('bouncer:ejected') > ejectsBefore, 'a shot inside still throws');
  assert.equal(eject.at(-1)[1].status, 'banned', 'the throw reads the live sheet, not the courtesy list');
  assert.equal(f.row(f.player).ejections, 5);
  // The same for an authored VIP whose sheet is banned — shot and sight both throw.
  const c = f.addCorsair();
  makeBanned(f, c);
  assert.equal(f.row(c).status, 'banned');
  c.data.vip = true;
  f.impulses(c);
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.fire(c.id);
  assert.equal(f.impulses(c).length, 1, 'a VIP-marked hull\'s shot inside is the throw');
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.system.update(0.5, f.state);
  const trespass = f.events.filter(([t, p]) => t === 'bouncer:ejected' && p.entityId === c.id && p.kind === 'trespass');
  assert.equal(trespass.length, 1, 'the mark is the warrant — VIP or not');
});

test('a hostile muscle hull with a non-string contract is stood down, never thrown on', () => {
  const f = fixture();
  const m = f.helpers.spawnEntity({
    type: 'drone', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 8, mass: 18, hull: 120, hullMax: 120,
    data: { bouncerMuscle: true, muscleFor: 5 },
  });
  assert.equal(f.system._wantedMarkFor(5), null, 'a non-string key resolves nothing');
  assert.doesNotThrow(() => f.system.update(0.5, f.state));
  assert.equal(m.alive, false, 'a contract with no paper stands down');
  const stands = f.events.filter(([t, p]) => t === 'bouncer:muscleStandDown' && p.reason === 'no_record');
  assert.equal(stands.length, 1);
});
