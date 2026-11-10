// LAMPLIGHTER / LL-6 (row 506 member 7) — relighting the dead rim buoys in Sedna Dark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAMPLIGHTER } from '../src/data/lamplighter.js';
import {
  lamplighterDeadSpot, lamplighterSlotSpot, lamplighterArmable, lamplighterDeadOwed,
  lamplighterLitCount, lamplighterFirstDark, lamplighterMaskSet, lamplighterMaskClear,
  lamplighterDriftHome,
} from '../src/characters/lamplighterRules.js';
import {
  createLamplighter, lamplighterSpec, lamplighterDeadSpec, lamplighterLampSpec,
} from '../src/systems/lamplighter.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

function fixture({ sector = 'sector_sedna_dark', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const player = { id: 7, alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    tick: 60,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const helpers = {
    spawnEntity(spec) {
      const e = { id: 900 + state.entityList.length, alive: true, ...spec };
      state.entityList.push(e); state.entities.set(e.id, e); return e;
    },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createLamplighter();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, sys, player };
}

const robot = (state) => state.entityList.find((e) => e.alive && e.data?.lamplighter);
const dead = (state) => state.entityList.filter((e) => e.alive && e.data?.lamplighterDead);
const lamps = (state) => state.entityList.filter((e) => e.alive && e.data?.lamplighterLamp);
const says = (popups, prefix) => popups.filter((p) => String(p.id).startsWith(prefix));
// The walk home rides the impulse membrane — drain queued commands like the physics owner.
const impulses = (entity) => {
  const cmds = consumePhysicsCommand(entity);
  return cmds && cmds.impulses ? cmds.impulses.splice(0) : [];
};
const inArms = (e, pos = LAMPLIGHTER.post) => { e.pos = { x: pos.x + 4, z: pos.z - 3 }; e.vel = { x: 0, z: 0 }; };

test('spec + spawn: robot and six dead buoys in sector only, one hail per visit', () => {
  const s = lamplighterSpec();
  assert.equal(s.data.lamplighter, true);
  assert.equal(s.data.authoredCharacter, 'lamplighter');
  assert.equal(s.data.homeSectorId, 'sector_sedna_dark');
  assert.equal(s.data.scannerSignalKind, 'salvage');
  const { state, popups } = fixture();
  assert.ok(robot(state));
  assert.equal(dead(state).length, LAMPLIGHTER.deadCount, 'the dead stock drifts on the rim');
  assert.equal(lamps(state).length, 0);
  const hail = says(popups, 'lamplighter_announce');
  assert.equal(hail.length, 1);
  assert.match(hail[0].text, /lane buoys are dead/);
  // Sector-gated: no presence off the rim or out of the adventure.
  assert.equal(fixture({ runKind: 'survival' }).state.entityList.filter((e) => e.data?.lamplighter || e.data?.lamplighterDead).length, 0);
  assert.equal(fixture({ sector: 'sector_io_reach' }).state.entityList.filter((e) => e.data?.lamplighter || e.data?.lamplighterDead).length, 0);
});

test('a settled dead buoy in the arms is consumed and plants lamp slot 0', () => {
  const { state, popups, sys } = fixture();
  const buoy = dead(state)[0];
  inArms(buoy, robot(state).pos);
  sys.update(0.5, state);
  assert.equal(buoy.alive, false, 'the arms consumed it');
  assert.equal(lamps(state).length, 1);
  assert.equal(lamps(state)[0].data.lamplighterSlot, 0);
  const spot = lamplighterSlotSpot(0);
  assert.ok(Math.hypot(lamps(state)[0].pos.x - spot.x, lamps(state)[0].pos.z - spot.z) < 1e-6);
  assert.equal(state.story.flags.lamplighter_lit, 0b000001);
  assert.equal(says(popups, 'lamplighter_lit_').length, 1);
  assert.match(says(popups, 'lamplighter_lit_')[0].text, /One more light\. The dark is smaller\./);
});

test('a flyby is not a delivery: fast buoys do not feed the arms', () => {
  const { state, sys } = fixture();
  const buoy = dead(state)[0];
  buoy.pos = { x: LAMPLIGHTER.post.x + 4, z: LAMPLIGHTER.post.z };
  buoy.vel = { x: 80, z: 0 };
  sys.update(0.5, state);
  assert.equal(buoy.alive, true, 'a miss survives — the arms take what ARRIVES');
  assert.equal(lamps(state).length, 0);
  assert.equal(state.story.flags.lamplighter_lit, undefined);
  // Non-stock bodies are not buoys: rocks and the player never feed the lamp line.
  state.entityList.push({ id: 42, alive: true, pos: { x: LAMPLIGHTER.post.x, z: LAMPLIGHTER.post.z }, vel: { x: 0, z: 0 }, mass: 30, data: {} });
  sys.update(0.5, state);
  assert.equal(state.entityList.find((e) => e.id === 42).alive, true);
  assert.equal(lamps(state).length, 0);
});

test('six deliveries light the path in order, then the rim stays lit', () => {
  const { state, popups, sys } = fixture();
  for (let i = 0; i < LAMPLIGHTER.slotCount; i += 1) {
    const buoy = dead(state)[0];
    assert.ok(buoy, `dead stock ${i} on the rim`);
    inArms(buoy, robot(state).pos);
    sys.update(0.5, state);
  }
  assert.equal(lamps(state).length, LAMPLIGHTER.slotCount);
  assert.deepEqual(lamps(state).map((l) => l.data.lamplighterSlot).sort(), [0, 1, 2, 3, 4, 5]);
  assert.equal(state.story.flags.lamplighter_rimLit, true);
  assert.equal(says(popups, 'lamplighter_rim').length, 1);
  assert.match(says(popups, 'lamplighter_rim')[0].text, /THE RIM HOLDS/);
  // The stock is spent — the last buoy was the sixth light; no dead buoys reseed.
  sys.update(0.5, state);
  assert.equal(dead(state).length, 0);
});

test('occupied seat: a restored lamp claiming its slot never gets a twin', () => {
  const { state, sys } = fixture();
  const r = robot(state);
  // The durable record says slots 0 and 2 are lit and a save already restored the
  // slot-2 lamp body; the census may only materialize the missing one.
  state.story.flags.lamplighter_lit = 0b000101;
  const kept = lamplighterLampSpec(2);
  kept.id = 77; kept.alive = true;
  state.entityList.push(kept);
  sys.update(0.5, state);
  const slotTwo = lamps(state).filter((l) => l.data.lamplighterSlot === 2);
  assert.equal(slotTwo.length, 1, 'seat 2 was occupied — no twin spawned coincident');
  assert.equal(slotTwo[0].id, 77, 'the restored lamp kept its body');
  assert.equal(lamps(state).filter((l) => l.data.lamplighterSlot === 0).length, 1, 'the dark seat rematerialized');
  void r;
});

test('a lamp shot out darkens its slot; the next buoy replants the hole', () => {
  const { state, bus, sys } = fixture();
  const r = robot(state);
  // Light slots 0 and 1.
  for (let i = 0; i < 2; i += 1) { const b = dead(state)[0]; inArms(b, r.pos); sys.update(0.5, state); }
  const lamp0 = lamps(state).find((l) => l.data.lamplighterSlot === 0);
  lamp0.alive = false;
  bus.emit('entity:killed', { id: lamp0.id, killerId: 7 });
  assert.equal(state.story.flags.lamplighter_lit, 0b000010, 'the record went dark on that seat');
  sys.update(0.5, state);
  assert.equal(lamps(state).filter((l) => l.data.lamplighterSlot === 0).length, 0, 'the hole stays dark until a buoy answers it');
  const buoy = dead(state)[0];
  inArms(buoy, r.pos);
  sys.update(0.5, state);
  const replanted = lamps(state).find((l) => l.data.lamplighterSlot === 0);
  assert.ok(replanted, 'the lowest dark slot healed first');
  assert.equal(state.story.flags.lamplighter_lit, 0b000011);
});

test('destroyed dead stock is replaced by the sector on the next pass', () => {
  const { state, sys } = fixture();
  const buoy = dead(state)[0];
  const idx = buoy.data.lamplighterDeadIndex;
  buoy.alive = false; // shot to pieces — a dead lane marker persists
  sys.update(0.5, state);
  const replacement = dead(state).find((e) => e.data.lamplighterDeadIndex === idx);
  assert.ok(replacement, 'the rim owes the stock back');
  const spot = lamplighterDeadSpot(idx);
  assert.ok(Math.hypot(replacement.pos.x - spot.x, replacement.pos.z - spot.z) < 1e-6);
  // A buoy towed far away is still stock — no twin for a live claimant.
  const far = dead(state).find((e) => e.data.lamplighterDeadIndex !== idx);
  far.pos = { x: 9000, z: 9000 };
  sys.update(0.5, state);
  assert.equal(dead(state).filter((e) => e.data.lamplighterDeadIndex === far.data.lamplighterDeadIndex).length, 1);
});

test('kill the lamplighter: the feed goes dark, the planted light stays', () => {
  const { state, bus, popups, sys } = fixture();
  const r = robot(state);
  const b = dead(state)[0]; inArms(b, r.pos); sys.update(0.5, state);
  assert.equal(lamps(state).length, 1);
  r.alive = false;
  bus.emit('entity:killed', { id: r.id, killerId: 7 });
  assert.equal(state.story.flags.lamplighter_gone, true);
  assert.match(says(popups, 'lamplighter_gone')[0].text, /LL-6 OUT/);
  // Re-entering does not resurrect it; a fresh armful cannot be accepted.
  bus.emit('sector:enter', { sectorId: LAMPLIGHTER.sectorId });
  assert.equal(robot(state), undefined, 'the gone lamplighter never respawns');
  const left = dead(state)[0];
  inArms(left, LAMPLIGHTER.post);
  sys.update(0.5, state);
  assert.equal(left.alive, true, 'no arms — nothing accepts the buoy');
  assert.equal(lamps(state).length, 1, 'the light you planted is the rim\'s, not the robot\'s');
});

test('save:loaded clears the per-visit hail and keeps the lit record', () => {
  const { state, bus, popups, sys } = fixture();
  const r = robot(state);
  const b = dead(state)[0]; inArms(b, r.pos); sys.update(0.5, state);
  assert.equal(says(popups, 'lamplighter_announce').length, 1);
  bus.emit('save:loaded', {});
  assert.equal(says(popups, 'lamplighter_announce').length, 2, 'a restored visit hails again');
  assert.equal(lamps(state).length, 1, 'the lit path survived the load');
  assert.equal(state.story.flags.lamplighter_lit, 0b000001);
});

test('drift-home: a shoved robot walks back through the impulse membrane', () => {
  const { state, sys } = fixture();
  const r = robot(state);
  r.pos = { x: LAMPLIGHTER.post.x + 400, z: LAMPLIGHTER.post.z };
  r.vel = { x: 0, z: 0 };
  sys.update(0.5, state);
  const go = impulses(r);
  assert.equal(go.length, 1, 'station-keeping is a queued impulse, not a vel write');
  assert.ok(go[0].x < 0, 'the impulse points home');
  // On the post at rest: it stands.
  r.pos = { ...LAMPLIGHTER.post };
  sys.update(0.5, state);
  assert.equal(impulses(r).length, 0);
});

test('pure rules: armable gate, stock owed, the slot mask, drift home', () => {
  const settled = { alive: true, pos: { x: LAMPLIGHTER.post.x, z: LAMPLIGHTER.post.z }, vel: { x: 0, z: 0 }, data: { lamplighterDead: true } };
  assert.equal(lamplighterArmable(settled), true);
  assert.equal(lamplighterArmable({ ...settled, vel: { x: 99, z: 0 } }), false); // screaming through
  assert.equal(lamplighterArmable({ ...settled, pos: { x: 0, z: 0 } }), false); // outside the ring
  assert.equal(lamplighterArmable({ ...settled, data: {} }), false); // not stock
  assert.equal(lamplighterDeadOwed(4, 1), 1);
  assert.equal(lamplighterDeadOwed(6, 0), 0);
  assert.equal(lamplighterLitCount(0b0101), 2);
  assert.equal(lamplighterFirstDark(0b0101), 1); // holes heal first
  assert.equal(lamplighterFirstDark(0b111111), -1);
  assert.equal(lamplighterMaskSet(0b0100, 0), 0b0101);
  assert.equal(lamplighterMaskClear(0b0101, 2), 0b0001);
  assert.deepEqual(lamplighterDriftHome({ pos: { x: LAMPLIGHTER.post.x, z: LAMPLIGHTER.post.z }, vel: { x: 0, z: 0 } }), null);
  const dv = lamplighterDriftHome({ pos: { x: LAMPLIGHTER.post.x + 100, z: LAMPLIGHTER.post.z }, vel: { x: 0, z: 0 } });
  assert.ok(dv.x < 0 && Math.abs(dv.z) < 1e-9);
});

test('destroy + re-init: provider and owned hulls clean', () => {
  const { state, helpers, sys } = fixture();
  sys.update(0.5, state);
  const before = helpers.sectorCookProviders.length;
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, before - 1);
  assert.equal(state.entityList.filter((e) => e.alive && (e.data?.lamplighter || e.data?.lamplighterDead || e.data?.lamplighterLamp)).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.lamplighter).length, 1);
  assert.equal(dead(state).length, LAMPLIGHTER.deadCount);
});
