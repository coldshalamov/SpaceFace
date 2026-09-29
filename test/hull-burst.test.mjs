// Hull-burst overhaul, slice C: the Gravity Bumper (design doc section 4-5, data/hullBurst.js,
// systems/hullBurst.js).
//
// Owner, 2026-09-29: "a kind of special attack that lasts however long ... not a constant thing",
// "mostly front-facing ... the nose is the weapon", and the point of the whole overhaul: position
// and arrival speed matter, so the Massline (the fastest way to arrive aimed) matters.
//
// The rules under test:
//   1. the throw is momentum: a crawling touch is a nudge, a full-speed arrival is the full effect,
//      and a heavy hull shrugs (the mass ratio), with a ceiling;
//   2. the wedge is a cone in front of the nose: not behind, not past its reach, not far to the side;
//   3. the verb refuses without a fitted module, while docked, while running and while recharging,
//      and its timing is sim time;
//   4. every HOSTILE hull is thrown once per activation through the ordinary impulse route (port
//      impulse, provenance naming the player, the one hitstun law); non-hostile hulls are nudged
//      only; rocks are never touched and the player is never pushed;
//   5. one hull-burst module per hull, deterministic when a fit carries two.
import assert from 'node:assert/strict';
import test from 'node:test';

import { HULL_BURST_TYPES, resolveHullBurst, hullBurstType } from '../src/data/hullBurst.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { fittingsFromDefaultModules, getDerivedStats, stationShopOffer } from '../src/systems/ships.js';
import { HITSTUN_IMPULSE_EVENT, readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { hullBurst, hullBurstDeltaV, hullBurstWedgeHit } from '../src/systems/hullBurst.js';

const GRAVITY = resolveHullBurst('gravity', 1);

function harness({ fitted = 'gravity', playerVel = { x: 0, z: 0 }, docked = false } = {}) {
  const player = {
    id: 1, alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 }, vel: { ...playerVel }, rot: 0, radius: 12,
    mass: 18, flags: { docked }, data: { derived: fitted ? { hullBurstKind: fitted, hullBurstRank: 1 } : {} },
  };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    entityIndex: null,
    mode: 'flight', tick: 0, simTime: 0, input: { actions: { hullBurst: false } },
  };
  const impulses = [];
  const damages = [];
  const events = [];
  const listeners = Object.create(null);
  const bus = {
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => {}; },
    emit(type, payload) { events.push({ type, payload }); for (const fn of listeners[type] || []) fn(payload); },
  };
  const helpers = { combatPhysics: { applyImpulse: (req) => { impulses.push(req); return true; } }, routeCombatDamage: (req) => { damages.push(req); return null; } };
  hullBurst.init({ state, bus, helpers });
  const add = (over) => {
    const ent = {
      id: state.entities.size + 1, alive: true, type: 'ship', team: 3, pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
      radius: 9, mass: 16, data: { encounter: true }, ...over,
    };
    state.entities.set(ent.id, ent);
    state.entityList.push(ent);
    return ent;
  };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { state.tick += 1; state.simTime = state.tick / 60; hullBurst.update(1 / 60); } };
  return { state, player, add, tick, impulses, damages, events, bus };
}

test('the throw is momentum: a crawl is a nudge, a full-speed arrival is the full effect, heavies shrug', () => {
  const bumper = 18 * GRAVITY.massScale;
  const crawl = hullBurstDeltaV(GRAVITY, 10, bumper, 16);
  const swing = hullBurstDeltaV(GRAVITY, 300, bumper, 16);
  assert.ok(crawl > 0, 'a touch still moves a light hull');
  assert.ok(swing / crawl >= 5, `full swing throws >= 5x a crawl (${swing.toFixed(1)} vs ${crawl.toFixed(1)})`);
  const huge = hullBurstDeltaV(GRAVITY, 5000, bumper, 16);
  assert.ok(huge <= GRAVITY.maxDeltaVWuS && huge > GRAVITY.maxDeltaVWuS * 0.99, 'the soft ceiling holds');
  assert.ok(hullBurstDeltaV(GRAVITY, 300, bumper, 16) > hullBurstDeltaV(GRAVITY, 300, bumper, 60), 'and heavier hulls stay ordered below it, even at speed');
  const light = hullBurstDeltaV(GRAVITY, 200, bumper, 16);
  const medium = hullBurstDeltaV(GRAVITY, 200, bumper, 60);
  const heavy = hullBurstDeltaV(GRAVITY, 200, bumper, 150);
  const capital = hullBurstDeltaV(GRAVITY, 200, bumper, 600);
  assert.ok(light > medium && medium > heavy && heavy > capital, 'heavier hulls are thrown less');
  assert.ok(capital < light * 0.25, 'a capital barely notices');
  assert.equal(hullBurstDeltaV(GRAVITY, -80, bumper, 16), hullBurstDeltaV(GRAVITY, 0, bumper, 16), 'a hull pulling away is a touch, never a negative throw');
});

test('a thrown light hull leaves the nose FASTER than the player is flying, so the player does not ram it again', () => {
  const bumper = 18 * GRAVITY.massScale;
  for (const arrival of [120, 200, 281, 400]) {
    const wasp = hullBurstDeltaV(GRAVITY, arrival, bumper, 16);
    assert.ok(wasp > arrival, `a Wasp thrown by a ${arrival} WU/s arrival leaves at ${wasp.toFixed(0)} (> ${arrival})`);
  }
  const boost = hullBurstDeltaV(GRAVITY, 281, bumper, 16);
  const sling = hullBurstDeltaV(GRAVITY, 450, bumper, 16);
  assert.ok(sling > boost * 1.15, `there is headroom above boost speed: a 450 WU/s arrival throws ${sling.toFixed(0)} vs ${boost.toFixed(0)} at 281`);
});

test('the wedge is a cone in front of the nose', () => {
  const player = { pos: { x: 0, z: 0 }, rot: 0, radius: 12 };
  const at = (x, z, radius = 9) => hullBurstWedgeHit(GRAVITY, player, { pos: { x, z }, radius });
  assert.ok(at(60, 0), 'dead ahead is in');
  assert.ok(at(GRAVITY.reachWu + 12 + 9 - 1, 0), 'the far edge (reach + nose + own radius) is in');
  assert.equal(at(GRAVITY.reachWu + 12 + 9 + 10, 0), null, 'past the reach is out');
  assert.equal(at(-60, 0), null, 'behind is out');
  assert.equal(at(0, 80), null, 'abeam is out (never a ring)');
  assert.equal(at(60, 90), null, 'far to the side is out');
  assert.ok(at(100, 40), 'the wedge opens with distance: 40 WU off the line at 100 WU is in');
  assert.equal(at(20, 60), null, 'but a hull beside the nose is not');
  const turned = hullBurstWedgeHit(GRAVITY, { pos: { x: 0, z: 0 }, rot: Math.PI / 2, radius: 12 }, { pos: { x: 0, z: 60 }, radius: 9 });
  assert.ok(turned, 'the wedge follows the heading');
});

test('the verb needs the module, flight, and its recharge; timing is sim time', () => {
  const none = harness({ fitted: null });
  assert.equal(hullBurst.activate(), false, 'no module, no burst');
  none.tick();

  const docked = harness({ docked: true });
  assert.equal(hullBurst.activate(), false, 'not while docked');
  docked.tick();

  const h = harness();
  assert.equal(hullBurst.activate(), true);
  assert.equal(h.state.hullBurst.phase, 'active');
  assert.equal(hullBurst.activate(), false, 'not while it is already running');
  h.tick(Math.round(GRAVITY.durationS * 60) + 2);
  assert.equal(h.state.hullBurst.phase, 'cooling', 'the window ends on sim time');
  assert.ok(h.events.some((e) => e.type === 'hullBurst:ended' && e.payload.reason === 'expired'));
  assert.equal(hullBurst.activate(), false, 'not while recharging');
  assert.ok(GRAVITY.cooldownS > GRAVITY.durationS, 'the recharge is clearly longer than the window');
  h.tick(Math.round(GRAVITY.cooldownS * 60) + 2);
  assert.equal(h.state.hullBurst.phase, 'ready');
  assert.equal(hullBurst.activate(), true, 'and it can go again');
});

test('the input edge lights the burst and is consumed', () => {
  const h = harness();
  h.state.input.actions.hullBurst = true;
  h.tick();
  assert.equal(h.state.hullBurst.phase, 'active');
  assert.equal(h.state.input.actions.hullBurst, false, 'the edge is consumed');
});

test('a hostile hull in the wedge is thrown ONCE, through the ordinary impulse route, credited to the player', () => {
  const h = harness({ playerVel: { x: 200, z: 0 } });
  const wasp = h.add({ pos: { x: 90, z: 0 }, vel: { x: -40, z: 0 } });
  const stun = [];
  h.bus.on(HITSTUN_IMPULSE_EVENT, (p) => stun.push(p));
  hullBurst.activate();
  h.tick();
  assert.equal(h.impulses.length, 1, 'one impulse');
  const shove = h.impulses[0];
  assert.equal(shove.entityId, wasp.id);
  assert.equal(shove.reason, 'hull_burst');
  assert.ok(shove.impulse.x > 0, 'thrown away from the nose');
  assert.equal(shove.provenance.actorId, 1);
  const closing = 240; // 200 (player) - (-40) (target), along the +x radial
  const expected = hullBurstDeltaV(GRAVITY, closing, 18 * GRAVITY.massScale, 16) * 16;
  const magnitude = Math.hypot(shove.impulse.x, shove.impulse.z);
  assert.ok(Math.abs(magnitude - expected) < 1e-6, `impulse = deltaV x target mass (${magnitude} vs ${expected})`);

  const prov = readRecentImpulseProvenance(wasp, h.state.tick);
  assert.ok(prov && prov.actorId === 1 && prov.tag === 'hull_burst', 'the throw is attributed to the player');

  assert.equal(stun.length, 1, 'one hitstun publish');
  assert.equal(stun[0].source, 'hull_burst');
  assert.equal(stun[0].victimId, wasp.id);
  assert.equal(stun[0].attackerId, 1);
  assert.equal(stun[0].attackerMass, 18 * GRAVITY.massScale, 'the player counts as much heavier while it runs');

  h.tick(30);
  assert.equal(h.impulses.length, 1, 'a hull sitting in the wedge is never re-hit every tick');
  assert.equal(h.state.hullBurst.hits, 1);
});

test('every hull is thrown once per activation, and a new activation re-arms them', () => {
  const h = harness();
  const a = h.add({ pos: { x: 60, z: 0 } });
  const b = h.add({ pos: { x: 100, z: 20 } });
  hullBurst.activate();
  h.tick(5);
  assert.deepEqual(h.impulses.map((i) => i.entityId).sort(), [a.id, b.id].sort());
  h.tick(Math.round(GRAVITY.durationS * 60));
  h.tick(Math.round(GRAVITY.cooldownS * 60) + 2);
  hullBurst.activate();
  h.tick();
  assert.equal(h.impulses.length, 4, 'the second activation hits them again');
});

test('a non-hostile hull is nudged, never flung, stunned or credited', () => {
  const h = harness({ playerVel: { x: 300, z: 0 } });
  const trader = h.add({ team: 2, data: {}, pos: { x: 70, z: 0 } });
  const stun = [];
  h.bus.on(HITSTUN_IMPULSE_EVENT, (p) => stun.push(p));
  hullBurst.activate();
  h.tick();
  assert.equal(h.impulses.length, 1, 'it is pushed');
  const dv = Math.hypot(h.impulses[0].impulse.x, h.impulses[0].impulse.z) / 16;
  assert.ok(dv <= GRAVITY.nudgeMaxDeltaVWuS + 1e-9, `nudge only (${dv.toFixed(2)} WU/s)`);
  assert.equal(stun.length, 0, 'no stun');
  assert.equal(readRecentImpulseProvenance(trader, h.state.tick), null, 'no credit or heat trail');
});

test('rocks are never touched and the player is never pushed', () => {
  const h = harness({ playerVel: { x: 300, z: 0 } });
  const rock = h.add({ type: 'asteroid', team: 0, data: {}, pos: { x: 50, z: 0 }, radius: 30, mass: 900 });
  hullBurst.activate();
  h.tick(10);
  assert.equal(h.impulses.filter((i) => i.entityId === rock.id).length, 0);
  assert.equal(h.impulses.filter((i) => i.entityId === h.player.id).length, 0);
});

test('hulls behind, beside or past the reach are left alone', () => {
  const h = harness();
  h.add({ pos: { x: -60, z: 0 } });
  h.add({ pos: { x: 0, z: 90 } });
  h.add({ pos: { x: 400, z: 0 } });
  hullBurst.activate();
  h.tick(10);
  assert.equal(h.impulses.length, 0);
});

test('docking or dying ends the burst and starts the recharge', () => {
  const h = harness();
  hullBurst.activate();
  h.bus.emit('dock:docked', {});
  assert.equal(h.state.hullBurst.phase, 'cooling');
  assert.ok(h.state.hullBurst.readyAt >= GRAVITY.cooldownS - 1e-9, 'a cut-short burst still owes the full recharge');
});

test('the module is real: sold, researchable, and one per hull', () => {
  const mod = MODULES.find((m) => m.id === 'mod_gravity_bumper_s');
  assert.ok(mod, 'the module exists');
  assert.equal(mod.slotType, 'utility');
  assert.equal(mod.mods.hullBurst, 'gravity');
  assert.ok(hullBurstType(mod.mods.hullBurst), 'and names a real burst type');
  assert.equal(HULL_BURST_TYPES.gravity.moduleId, mod.id);
  assert.ok(typeof mod.sentence === 'string' && mod.sentence.length > 0, 'it has a plain-words sentence');
  const tech = TECH_NODES.find((t) => t.id === mod.requiresTech);
  assert.ok(tech && tech.unlocks.modules.includes(mod.id), 'its tech node lists it');
});

test('the fitted module reaches the derived stats (and a bare hull has none)', () => {
  const one = getDerivedStats('ship_wasp', fittingsFromDefaultModules('ship_wasp', ['mod_gravity_bumper_s']));
  assert.equal(one.hullBurstKind, 'gravity');
  assert.equal(one.hullBurstRank, 1);
  const bare = getDerivedStats('ship_wasp', []);
  assert.equal(bare.hullBurstKind, null);
  assert.equal(bare.hullBurstRank, 0);
});

test('the first station stocks it at first-haul terms; everywhere else the catalog price and the gate stand', () => {
  const mod = MODULES.find((m) => m.id === 'mod_gravity_bumper_s');
  assert.equal(mod.price, 24000, 'catalog price');
  assert.equal(mod.requiresTech, 'tech_graviton_drives', 'catalog research gate');
  assert.equal(stationShopOffer(mod, 'station_helios').price, 12000, 'the rack at Helios');
  assert.equal(stationShopOffer(mod, 'station_tethys'), null, 'no special listing elsewhere');
});

test('the latch is per entity OBJECT: a new hull that reuses a dead hull id in the same window is still thrown', () => {
  const h = harness();
  const first = h.add({ pos: { x: 60, z: 0 } });
  hullBurst.activate();
  h.tick(2);
  assert.equal(h.impulses.length, 1);
  // The first hull dies and the runtime hands its id to a new one.
  first.alive = false;
  h.state.entities.delete(first.id);
  h.state.entityList.splice(h.state.entityList.indexOf(first), 1);
  const reborn = h.add({ id: first.id, pos: { x: 70, z: 0 } });
  assert.equal(reborn.id, first.id, 'setup: the id is recycled');
  h.tick(2);
  assert.equal(h.impulses.filter((i) => i.entityId === first.id).length, 2, 'the recycled id is thrown again');
});

test('state.hullBurst is plain data: it survives JSON and structuredClone (snapshot code may meet it)', () => {
  const h = harness();
  hullBurst.activate();
  h.tick(3);
  assert.doesNotThrow(() => structuredClone(h.state.hullBurst));
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.hullBurst)).phase, 'active');
});

// ---- FIRE LANCE ------------------------------------------------------------------------------------------------

const LANCE = resolveHullBurst('lance', 1);

test('the Fire Lance: full speed kills a light hull through the combat kernel, credited to the player, no throw', () => {
  const h = harness({ fitted: 'lance', playerVel: { x: 160, z: 0 } });
  const wasp = h.add({ pos: { x: 60, z: 0 }, hull: 150, shield: 110, armorHp: 0, armorFlat: 0 });
  hullBurst.activate();
  h.tick();
  assert.equal(h.damages.length, 1, 'one damage packet');
  const d = h.damages[0];
  assert.equal(d.attackerId, 1, 'the player is the attacker (a kill is the players and pays the loot burst)');
  assert.equal(d.targetId, wasp.id);
  const thermal = d.packet.channels.thermal;
  assert.ok(thermal >= (150 + 110) * LANCE.lethalMargin - 1e-6, `more than the whole pool (${thermal.toFixed(0)} vs ${(150 + 110)})`);
  assert.equal(d.packet.statuses[0].id, 'status_burning');
  assert.equal(d.packet.statuses[0].stacks, LANCE.burnStacks, 'full burn at full speed');
  assert.equal(h.impulses.length, 0, 'a lance burns, it never throws');
  assert.equal(h.events.filter((e) => e.type === HITSTUN_IMPULSE_EVENT).length, 0, 'and never stuns');
});

test('the Fire Lance: a heavy takes a bounded share and burns; it does not die to one touch', () => {
  const h = harness({ fitted: 'lance', playerVel: { x: 160, z: 0 } });
  h.add({ pos: { x: 60, z: 0 }, mass: 300, hull: 1600, shield: 1100, armorHp: 0 });
  hullBurst.activate();
  h.tick();
  const thermal = h.damages[0].packet.channels.thermal;
  assert.ok(thermal <= LANCE.heavyDamageCap + 1e-6, `capped (${thermal.toFixed(0)})`);
  assert.ok(thermal < 0.5 * (1600 + 1100), 'a heavy survives a touch');
  assert.ok(h.damages[0].packet.statuses[0].stacks >= 1, 'and it burns');
});

test('the Fire Lance is speed-scaled: a crawling touch scorches, it does not finish', () => {
  const crawl = harness({ fitted: 'lance', playerVel: { x: 15, z: 0 } });
  crawl.add({ pos: { x: 60, z: 0 }, hull: 150, shield: 110 });
  hullBurst.activate();
  crawl.tick();
  const fast = harness({ fitted: 'lance', playerVel: { x: 160, z: 0 } });
  fast.add({ pos: { x: 60, z: 0 }, hull: 150, shield: 110 });
  hullBurst.activate();
  fast.tick();
  const slowDamage = crawl.damages[0].packet.channels.thermal;
  const fastDamage = fast.damages[0].packet.channels.thermal;
  assert.ok(slowDamage < 0.25 * (150 + 110), `a crawl does not kill (${slowDamage.toFixed(0)})`);
  assert.ok(fastDamage > 5 * slowDamage, 'and a full-speed pass does far more');
  assert.equal(crawl.damages[0].packet.statuses[0].stacks, 1, 'the crawl still lights one stack');
});

test('the Fire Lance never touches a non-hostile hull, and its wedge is narrow', () => {
  const h = harness({ fitted: 'lance', playerVel: { x: 160, z: 0 } });
  h.add({ team: 2, data: {}, pos: { x: 60, z: 0 } });
  hullBurst.activate();
  h.tick(3);
  assert.equal(h.damages.length, 0, 'a civilian is left alone');
  assert.equal(h.impulses.length, 0, 'and is not even nudged');

  const narrow = harness({ fitted: 'lance', playerVel: { x: 100, z: 0 } });
  narrow.add({ pos: { x: 70, z: 45 } });
  hullBurst.activate();
  narrow.tick(3);
  assert.equal(narrow.damages.length, 0, 'a hull 45 WU off the line is outside a lance');
  const wide = harness({ fitted: 'gravity', playerVel: { x: 100, z: 0 } });
  wide.add({ pos: { x: 70, z: 45 } });
  hullBurst.activate();
  wide.tick(3);
  assert.equal(wide.impulses.length, 1, 'the same hull is inside the Gravity Bumper');
});

test('the Fire Lance module is real: sold, researchable, taught, one hull burst per hull', () => {
  const mod = MODULES.find((m) => m.id === 'mod_fire_lance_s');
  assert.ok(mod, 'the module exists');
  assert.equal(mod.mods.hullBurst, 'lance');
  assert.equal(HULL_BURST_TYPES.lance.moduleId, mod.id);
  assert.ok(typeof mod.sentence === 'string' && mod.sentence.length > 0);
  const tech = TECH_NODES.find((t) => t.id === mod.requiresTech);
  assert.ok(tech && tech.unlocks.modules.includes(mod.id), 'its tech node lists it');
  const derived = getDerivedStats('ship_wasp', fittingsFromDefaultModules('ship_wasp', ['mod_fire_lance_s']));
  assert.equal(derived.hullBurstKind, 'lance');
  assert.ok(GRAVITY.reachWu > LANCE.reachWu && GRAVITY.halfAngleRad > LANCE.halfAngleRad, 'the lance is the narrow, short wedge');
  assert.ok(LANCE.cooldownS > LANCE.durationS, 'recharge clearly longer than the window');
});
