// Hull-burst overhaul, slice C — THE BURST IS THE BOOST (owner principle, 2026-09-30).
//
// The front 'bumper' weapons (Gravity Bumper, Fire Lance, Grip Bumper) are no longer a separately
// triggered module attack: they are upgrades you BUY that augment the boost. Hold Shift and the
// ship's purchased boost upgrade fires automatically — the wedge is live exactly while the boost
// gesture is paying, at no extra cost beyond the boost meter. There is no burst key, no window and
// no recharge; a player may turn the upgrade off in settings, but by default every boost fires it.
//
// The rules under test:
//   1. the throw is momentum: a crawling touch is a nudge, a full-speed arrival is the full effect,
//      and a heavy hull shrugs (the mass ratio), with a ceiling;
//   2. the wedge is a cone in front of the nose: not behind, not past its reach, not far to the side;
//   3. the burst needs a fitted module, a live player in flight, the settings switch on, and a RISING
//      boost edge; releasing the boost ends it and lets any hostage go;
//   4. every HOSTILE hull is thrown once per boost gesture through the ordinary impulse route (port
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
import { flightV3 } from '../src/systems/flightV3.js';

const GRAVITY = resolveHullBurst('gravity', 1);

function harness({ fitted = 'gravity', playerVel = { x: 0, z: 0 }, docked = false, integrate = false, boostBurst } = {}) {
  const player = {
    id: 1, alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 }, vel: { ...playerVel }, rot: 0, radius: 12,
    mass: 18, flags: { docked }, data: { derived: fitted ? { hullBurstKind: fitted, hullBurstRank: 1 } : {} },
  };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    entityIndex: null,
    mode: 'flight', tick: 0, simTime: 0,
    ...(boostBurst === undefined ? {} : { settings: { gameplay: { boostBurst } } }),
  };
  const impulses = [];
  const damages = [];
  const events = [];
  const listeners = Object.create(null);
  const bus = {
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => {}; },
    emit(type, payload) { events.push({ type, payload }); for (const fn of listeners[type] || []) fn(payload); },
  };
  // `integrate` makes the stub port behave like a physics owner: an impulse changes the hull's velocity (dv = J / m)
  // and each tick moves every entity by its velocity, so a carry can be judged by where the hull actually ends up.
  const helpers = {
    combatPhysics: {
      applyImpulse: (req) => {
        impulses.push(req);
        if (integrate) {
          const e = state.entities.get(req.entityId);
          if (e) { e.vel.x += req.impulse.x / e.mass; e.vel.z += req.impulse.z / e.mass; }
        }
        return true;
      },
    },
    routeCombatDamage: (req) => { damages.push(req); return null; },
  };
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
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick += 1; state.simTime = state.tick / 60;
      hullBurst.update(1 / 60);
      if (integrate) for (const e of state.entityList) { e.pos.x += e.vel.x / 60; e.pos.z += e.vel.z / 60; }
    }
  };
  // The boost gesture, the way flightV3 hands it to the poll: the resource-gated flag on the player.
  const boost = (on) => { player.flags.boosting = !!on; };
  return { state, player, add, tick, boost, impulses, damages, events, bus };
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
  assert.ok(at(80, 35), 'the wedge opens with distance: 35 WU off the line at 80 WU is in');
  assert.equal(at(20, 60), null, 'but a hull beside the nose is not');
  const turned = hullBurstWedgeHit(GRAVITY, { pos: { x: 0, z: 0 }, rot: Math.PI / 2, radius: 12 }, { pos: { x: 0, z: 60 }, radius: 9 });
  assert.ok(turned, 'the wedge follows the heading');
});

test('the burst needs the module, flight, a live player and the settings switch — and nothing else', () => {
  const none = harness({ fitted: null });
  none.boost(true);
  none.tick();
  assert.equal(none.state.hullBurst.phase, 'ready', 'no module, no burst');
  assert.equal(hullBurst.activate(), false, 'the bench entry is refused the same way');

  const docked = harness({ docked: true });
  docked.boost(true);
  docked.tick();
  assert.equal(docked.state.hullBurst.phase, 'ready', 'not while docked');

  const off = harness({ boostBurst: false });
  off.boost(true);
  off.tick();
  assert.equal(off.state.hullBurst.phase, 'ready', 'the upgrade is off in settings');
  assert.equal(hullBurst.activate(), false, 'and the bench entry agrees');

  const h = harness();
  assert.equal(hullBurst.activate(), true, 'activate() stays the one refusal path (the bench uses it)');
  assert.equal(h.state.hullBurst.phase, 'active');
  assert.equal(hullBurst.activate(), false, 'not while it is already running');
  // No window, no recharge: the boost meter is the only clock. Release and press again — it fires.
  h.boost(false);
  h.tick();
  assert.equal(h.state.hullBurst.phase, 'ready', 'the boost ending ends the burst');
  h.boost(true);
  h.tick();
  assert.equal(h.state.hullBurst.phase, 'active', 'and the next boost fires it again immediately');
  assert.equal(hullBurst.activate(), false, 'a boost that never ended keeps the wedge lit');
});

test('the boost gesture lights the burst while it is held, and only while it is held', () => {
  const h = harness();
  h.boost(true);
  h.tick();
  assert.equal(h.state.hullBurst.phase, 'active', 'the rising boost edge lights the wedge');
  h.tick(600); // ten seconds of held boost: no window to expire
  assert.equal(h.state.hullBurst.phase, 'active', 'a held boost keeps the wedge live — the meter is the only clock');
  h.boost(false);
  h.tick();
  assert.equal(h.state.hullBurst.phase, 'ready', 'the falling edge ends it');
  assert.ok(h.events.some((e) => e.type === 'hullBurst:ended' && e.payload.reason === 'boostEnded'), 'and says why');
  h.tick();
  assert.equal(h.state.hullBurst.phase, 'ready', 'staying off the boost keeps it ready');
});

test('a hostile hull in the wedge is thrown ONCE, through the ordinary impulse route, credited to the player', () => {
  const h = harness({ playerVel: { x: 200, z: 0 } });
  const wasp = h.add({ pos: { x: 90, z: 0 }, vel: { x: -40, z: 0 } });
  const stun = [];
  h.bus.on(HITSTUN_IMPULSE_EVENT, (p) => stun.push(p));
  h.boost(true);
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

test('every hull is thrown once per boost gesture, and a new gesture re-arms them', () => {
  const h = harness();
  const a = h.add({ pos: { x: 60, z: 0 } });
  const b = h.add({ pos: { x: 85, z: 20 } });
  h.boost(true);
  h.tick(5);
  assert.deepEqual(h.impulses.map((i) => i.entityId).sort(), [a.id, b.id].sort());
  h.boost(false);
  h.tick(); // release re-arms the latch
  h.boost(true);
  h.tick();
  assert.equal(h.impulses.length, 4, 'the second boost gesture hits them again');
});

test('a non-hostile hull is nudged, never flung, stunned or credited', () => {
  const h = harness({ playerVel: { x: 300, z: 0 } });
  const trader = h.add({ team: 2, data: {}, pos: { x: 70, z: 0 } });
  const stun = [];
  h.bus.on(HITSTUN_IMPULSE_EVENT, (p) => stun.push(p));
  h.boost(true);
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
  h.boost(true);
  h.tick(10);
  assert.equal(h.impulses.filter((i) => i.entityId === rock.id).length, 0);
  assert.equal(h.impulses.filter((i) => i.entityId === h.player.id).length, 0);
});

test('hulls behind, beside or past the reach are left alone', () => {
  const h = harness();
  h.add({ pos: { x: -60, z: 0 } });
  h.add({ pos: { x: 0, z: 90 } });
  h.add({ pos: { x: 400, z: 0 } });
  h.boost(true);
  h.tick(10);
  assert.equal(h.impulses.length, 0);
});

test('docking, jumping, leaving the sector or dying ends the burst with the gesture still held', () => {
  for (const event of ['dock:docked', 'jump:start', 'sector:exit', 'player:death']) {
    const h = harness();
    h.boost(true);
    h.tick(30);
    h.bus.emit(event, {});
    assert.equal(h.state.hullBurst.phase, 'ready', `${event} ends the burst (no recharge tail: it is simply off)`);
    assert.ok(h.events.some((e) => e.type === 'hullBurst:ended' && e.payload.reason === 'interrupted'), `${event} says why`);
  }
});

test('a save load or a new game comes back ready, whatever was running', () => {
  for (const event of ['save:loaded', 'save:restoring', 'game:new']) {
    const h = harness();
    h.boost(true);
    h.tick(30);
    h.bus.emit(event, {});
    assert.equal(h.state.hullBurst.phase, 'ready', event);
    // The reset re-arms the edge, so a boost still held across the load lights the wedge again on
    // its next tick — every boost fires the upgrade, and a fresh session is a fresh gesture.
    h.boost(false);
    h.tick();
    h.boost(true);
    h.tick();
    assert.equal(h.state.hullBurst.phase, 'active', `${event}: the next boost fires it again`);
  }
});

test('a hull the physics owner has no body for yet is retried, not latched as thrown', () => {
  const h = harness();
  const wasp = h.add({ pos: { x: 60, z: 0 } });
  let accept = false;
  h.helpers = null;
  const original = h.impulses;
  // The stub port in the harness always accepts; swap in a refusing one for the first ticks.
  const port = hullBurst.helpers.combatPhysics;
  const realApply = port.applyImpulse;
  port.applyImpulse = (req) => { if (!accept) return false; return realApply(req); };
  h.boost(true);
  h.tick(3);
  assert.equal(original.length, 0, 'refused: nothing landed');
  accept = true;
  h.tick(2);
  assert.equal(original.filter((i) => i.entityId === wasp.id).length, 1, 'thrown as soon as the body exists');
});

test('a hostile already inside the wedge when the boost starts, at a crawl, is not a dud for the whole gesture', () => {
  const h = harness({ playerVel: { x: 0, z: 0 } });
  const wasp = h.add({ pos: { x: 45, z: 0 } });
  h.boost(true);
  h.tick(2);
  const first = h.impulses.filter((i) => i.entityId === wasp.id);
  assert.equal(first.length, 1, 'the boost at a standstill gives a nudge');
  const firstDv = Math.hypot(first[0].impulse.x, first[0].impulse.z) / 16;
  assert.ok(firstDv < 15, `a small one (${firstDv.toFixed(1)} WU/s)`);
  h.tick(20);
  assert.equal(h.impulses.filter((i) => i.entityId === wasp.id).length, 1, 'and no repeat while nothing has changed');
  // The player now drives into it: a much stronger hit is worth the full effect.
  h.player.vel.x = 250;
  wasp.vel.x = 0;
  h.tick(2);
  const all = h.impulses.filter((i) => i.entityId === wasp.id);
  assert.equal(all.length, 2, 'the second, much stronger hit lands');
  assert.ok(Math.hypot(all[1].impulse.x, all[1].impulse.z) / 16 > 4 * firstDv, 'and it is the strong one');
});

test('a hull that enters the wedge late is hit with the closing speed at ENTRY, not from across the room', () => {
  const h = harness({ playerVel: { x: 150, z: 0 }, integrate: true });
  const wasp = h.add({ pos: { x: 260, z: 0 } });
  h.boost(true);
  h.tick(10);
  assert.equal(h.impulses.filter((i) => i.entityId === wasp.id).length, 0, 'still far outside the strike zone: nothing touched it');
  h.tick(80);
  const hit = h.impulses.filter((i) => i.entityId === wasp.id);
  assert.equal(hit.length, 1, 'it is thrown when its edge crosses the reach');
  const gap = wasp.pos.x - h.player.pos.x;
  assert.ok(gap > 0, 'ahead of the player');
  const dv = Math.hypot(hit[0].impulse.x, hit[0].impulse.z) / 16;
  assert.ok(dv > 150, `and given the full-arrival throw for a 150 WU/s closing, not a crawl's (${dv.toFixed(0)} WU/s)`);
});

test('a nudge carries no provenance: it is not the player\u2019s doing', () => {
  const h = harness({ playerVel: { x: 250, z: 0 } });
  h.add({ team: 2, data: {}, pos: { x: 60, z: 0 } });
  h.boost(true);
  h.tick(2);
  assert.equal(h.impulses.length, 1);
  assert.equal(h.impulses[0].provenance, undefined, 'no stunt-journal root for a hull the player is not fighting');
});

test('the module is real: sold, researchable, and one per hull', () => {
  const mod = MODULES.find((m) => m.id === 'mod_gravity_bumper_s');
  assert.ok(mod, 'the module exists');
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

test('the latch is per entity OBJECT: a new hull that reuses a dead hull id in the same gesture is still thrown', () => {
  const h = harness();
  const first = h.add({ pos: { x: 60, z: 0 } });
  h.boost(true);
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
  h.boost(true);
  h.tick(3);
  assert.doesNotThrow(() => structuredClone(h.state.hullBurst));
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.hullBurst)).phase, 'active');
});

// ---- FIRE LANCE ------------------------------------------------------------------------------------------------

const LANCE = resolveHullBurst('lance', 1);

test('the Fire Lance: full speed kills a light hull through the combat kernel, credited to the player, no throw', () => {
  const h = harness({ fitted: 'lance', playerVel: { x: 160, z: 0 } });
  const wasp = h.add({ pos: { x: 60, z: 0 }, hull: 150, shield: 110, armorHp: 0, armorFlat: 0 });
  h.boost(true);
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
  h.boost(true);
  h.tick();
  const thermal = h.damages[0].packet.channels.thermal;
  assert.ok(thermal <= LANCE.heavyDamageCap + 1e-6, `capped (${thermal.toFixed(0)})`);
  assert.ok(thermal < 0.5 * (1600 + 1100), 'a heavy survives a touch');
  assert.ok(h.damages[0].packet.statuses[0].stacks >= 1, 'and it burns');
});

test('the Fire Lance is speed-scaled: a crawling touch scorches, it does not finish', () => {
  const crawl = harness({ fitted: 'lance', playerVel: { x: 15, z: 0 } });
  crawl.add({ pos: { x: 60, z: 0 }, hull: 150, shield: 110 });
  crawl.boost(true);
  crawl.tick();
  const fast = harness({ fitted: 'lance', playerVel: { x: 160, z: 0 } });
  fast.add({ pos: { x: 60, z: 0 }, hull: 150, shield: 110 });
  fast.boost(true);
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
  h.boost(true);
  h.tick(3);
  assert.equal(h.damages.length, 0, 'a civilian is left alone');
  assert.equal(h.impulses.length, 0, 'and is not even nudged');

  const narrow = harness({ fitted: 'lance', playerVel: { x: 100, z: 0 } });
  narrow.add({ pos: { x: 70, z: 45 } });
  narrow.boost(true);
  narrow.tick(3);
  assert.equal(narrow.damages.length, 0, 'a hull 45 WU off the line is outside a lance');
  const wide = harness({ fitted: 'gravity', playerVel: { x: 100, z: 0 } });
  wide.add({ pos: { x: 70, z: 45 } });
  wide.boost(true);
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
});

// ---- GRIP BUMPER -----------------------------------------------------------------------------------------------

const GRIP = resolveHullBurst('grip', 1);

test('the Grip Bumper catches ONE light hostile hull and takes its helm; a medium hull and a civilian are left alone', () => {
  const h = harness({ fitted: 'grip', playerVel: { x: 120, z: 0 } });
  const stun = [];
  h.bus.on(HITSTUN_IMPULSE_EVENT, (p) => stun.push(p));
  const medium = h.add({ pos: { x: 50, z: 0 }, mass: 48 });
  const civilian = h.add({ team: 2, data: {}, pos: { x: 55, z: 8 } });
  h.boost(true);
  h.tick(2);
  assert.equal(h.state.hullBurst.grip, null, 'nothing catchable yet');
  assert.equal(h.impulses.filter((i) => i.entityId === medium.id || i.entityId === civilian.id).length, 0, 'a medium hull and a civilian are not touched');
  const wasp = h.add({ pos: { x: 60, z: 4 } });
  const wasp2 = h.add({ pos: { x: 62, z: -4 } });
  h.tick(2);
  assert.equal(h.state.hullBurst.grip.targetId, wasp.id, 'the first light hostile is the hostage');
  assert.equal(stun.length, 1);
  assert.equal(stun[0].source, 'hull_grip', 'the helm goes through the one law, but not as a shove-class source (no outbound floor)');
  assert.equal(stun[0].victimId, wasp.id);
  assert.equal(h.impulses.filter((i) => i.entityId === wasp2.id).length, 0, 'one hostage at a time');
  assert.equal(readRecentImpulseProvenance(wasp, h.state.tick).actorId, 1, 'the player is credited for what the hostage meets');
});

test('the carry holds the hostage at the nose at the player\u2019s velocity (a spring-damper through the port, no overlap)', () => {
  const h = harness({ fitted: 'grip', playerVel: { x: 100, z: 0 }, integrate: true });
  const wasp = h.add({ pos: { x: 90, z: 30 }, vel: { x: 0, z: 0 } });
  h.boost(true);
  h.tick(90);
  assert.equal(h.state.hullBurst.grip.targetId, wasp.id, 'still held while the boost pays');
  const socket = h.player.pos.x + h.player.radius + wasp.radius + GRIP.gapWu;
  assert.ok(Math.abs(wasp.pos.x - socket) < 3, `at the nose socket (${wasp.pos.x.toFixed(1)} vs ${socket.toFixed(1)})`);
  assert.ok(Math.abs(wasp.pos.z - h.player.pos.z) < 3, `on the line of flight (z ${wasp.pos.z.toFixed(1)})`);
  assert.ok(Math.abs(wasp.vel.x - h.player.vel.x) < 3, `at the player\u2019s speed (${wasp.vel.x.toFixed(1)})`);
  assert.ok(wasp.pos.x - wasp.radius > h.player.pos.x + h.player.radius, 'and never overlapping the player');
  assert.ok(h.impulses.filter((i) => i.reason === 'hull_grip').length > 60, 'the carry is impulses, every tick');
});

test('releasing the boost lets it go: released ahead of the player at 1.15x its speed, the burst simply ends', () => {
  const h = harness({ fitted: 'grip', playerVel: { x: 100, z: 0 }, integrate: true });
  const wasp = h.add({ pos: { x: 60, z: 0 } });
  const stun = [];
  h.bus.on(HITSTUN_IMPULSE_EVENT, (p) => stun.push(p));
  h.boost(true);
  h.tick(60);
  h.boost(false);
  h.tick();
  assert.equal(h.state.hullBurst.phase, 'ready', 'the boost ending ends the burst');
  assert.equal(h.state.hullBurst.grip, null);
  assert.ok(h.events.some((e) => e.type === 'hullBurst:released' && e.payload.reason === 'boostEnded'), 'the hostage is released with the gesture');
  h.tick();
  assert.ok(wasp.vel.x >= h.player.vel.x * GRIP.releaseBoost - 1e-6 + GRIP.releaseKickWuS - 1, `leaves faster than the player (${wasp.vel.x.toFixed(0)})`);
  const release = stun.filter((p) => p.source === 'hull_burst');
  assert.equal(release.length, 1, 'the release is a shove-class hull_burst hit: helm lost, credit held');
});

test('the hostage dying drops the hold while the burst keeps riding the boost', () => {
  const dies = harness({ fitted: 'grip', playerVel: { x: 100, z: 0 }, integrate: true });
  const wasp = dies.add({ pos: { x: 60, z: 0 } });
  dies.boost(true);
  dies.tick(30);
  wasp.alive = false;
  const before = dies.impulses.length;
  dies.tick(3);
  assert.equal(dies.state.hullBurst.grip, null, 'the hold is dropped');
  assert.equal(dies.impulses.length, before, 'and nothing more is applied to a dead hull');
  assert.equal(dies.state.hullBurst.phase, 'active', 'the burst itself keeps riding the boost and can catch another');
});

test('the Grip Bumper module is real: sold, researchable, taught', () => {
  const mod = MODULES.find((m) => m.id === 'mod_grip_bumper_s');
  assert.ok(mod, 'the module exists');
  assert.equal(mod.mods.hullBurst, 'grip');
  assert.equal(HULL_BURST_TYPES.grip.moduleId, mod.id);
  assert.ok(typeof mod.sentence === 'string' && mod.sentence.length > 0);
  const tech = TECH_NODES.find((t) => t.id === mod.requiresTech);
  assert.ok(tech && tech.unlocks.modules.includes(mod.id), 'its tech node lists it');
  assert.equal(getDerivedStats('ship_wasp', fittingsFromDefaultModules('ship_wasp', ['mod_grip_bumper_s'])).hullBurstKind, 'grip');
});

test('rank 2 (the Mk2 modules) reaches farther and hits harder, and the higher rank wins', () => {
  for (const [id, kind] of [['mod_gravity_bumper_s_mk2', 'gravity'], ['mod_fire_lance_s_mk2', 'lance'], ['mod_grip_bumper_s_mk2', 'grip']]) {
    const mod = MODULES.find((m) => m.id === id);
    assert.ok(mod, `${id} exists`);
    assert.equal(mod.mods.hullBurst, kind);
    assert.equal(mod.mods.hullBurstRank, 2);
    assert.equal(mod.size, 'S', 'a starter hull can carry it');
    assert.ok(typeof mod.sentence === 'string' && mod.sentence.length > 0, `${id} has a sentence`);
    const tech = TECH_NODES.find((t) => t.id === mod.requiresTech);
    assert.ok(tech && tech.unlocks.modules.includes(id), `${id}: its tech node lists it`);
    const base = resolveHullBurst(kind, 1);
    const upgraded = resolveHullBurst(kind, 2);
    assert.ok(upgraded.reachWu > base.reachWu * 1.15, `${kind}: reaches farther`);
    assert.equal(getDerivedStats('ship_wasp', fittingsFromDefaultModules('ship_wasp', [id])).hullBurstRank, 2);
  }
  assert.ok(resolveHullBurst('gravity', 2).maxDeltaVWuS > resolveHullBurst('gravity', 1).maxDeltaVWuS, 'and hits harder');
});

// ---- THE ONE-METER CONTRACT (flightV3's real boost state machine drives the poll) ------------------------------

/**
 * A per-test instance of the REAL player-boost state machine (flightV3._stepPlayerBoost, the method
 * the production flightSlot runs before hullBurst in the same tick). It owns what a Shift press is
 * worth: the dash on the edge, the resource-gated `boosting` flag, the hysteresis cut-out. The
 * harness feeds its answer to player.flags.boosting, exactly as _stepCraft does (flightV3.js:369).
 */
function realBoost(host) {
  const v3 = Object.create(flightV3);
  v3.bus = host.bus;
  v3.state = host.state;
  return (held) => {
    const boosting = v3._stepPlayerBoost(host.player, held, 1 / 60, host.state);
    host.player.flags.boosting = boosting;
    return boosting;
  };
}

test('a low-tank Shift that only dashes fires NO burst: the poll reads the resource-gated flag, not the key', () => {
  // With the tank under the >1 gate the press can still dash but never boosts, so the wedge must
  // stay dark for that whole press. No regen: the gate stays closed for the length of the pin.
  const h = harness();
  h.player.boost = { max: 100, energy: 0.5, drainRate: 20, regenRate: 0, dashImpulse: 0, dashCost: 10, dashCd: 0, dashCdT: 0, _boostArmed: true };
  const stepBoost = realBoost(h);
  for (let i = 0; i < 8; i++) {
    const boosting = stepBoost(true);
    h.tick();
    assert.equal(boosting, false, `tick ${i}: the press never becomes a boost while the gate is closed`);
  }
  assert.equal(h.state.hullBurst.phase, 'ready', 'a dash-only press never lights the wedge');
});

test('a 0-energy cut-out mid-boost ends the burst and releases the hostage', () => {
  const h = harness({ fitted: 'grip', playerVel: { x: 100, z: 0 }, integrate: true });
  h.add({ pos: { x: 60, z: 0 } });
  // A small tank with a fast drain: the boost is real, then cuts out mid-gesture while held.
  h.player.boost = { max: 40, energy: 30, drainRate: 40, regenRate: 4, dashImpulse: 0, dashCost: 5, dashCd: 0, dashCdT: 0, _boostArmed: true };
  const stepBoost = realBoost(h);
  let cut = false;
  for (let i = 0; i < 240 && !cut; i++) {
    cut = !stepBoost(true);
    h.tick();
  }
  assert.equal(h.player.flags.boosting, false, 'setup: the tank cut out while the key was still held');
  assert.ok(h.state.hullBurst.grip != null || h.events.some((ev) => ev.type === 'hullBurst:hit' && ev.payload.caught), 'setup: the grip had caught its hostage');
  assert.equal(h.state.hullBurst.phase, 'ready', 'the cut-out ended the burst');
  assert.equal(h.state.hullBurst.grip, null, 'and the hostage is released');
  assert.ok(h.events.some((ev) => ev.type === 'hullBurst:ended' && ev.payload.reason === 'boostEnded'), 'as an ordinary boost end');
});
