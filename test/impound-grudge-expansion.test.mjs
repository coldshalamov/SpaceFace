// CRT-03 expansion — the lot hull's nemesis arc.
// Covers the new behavior in src/systems/impoundGrudge.js: escalation tiers on
// the papers, the learned-tactics log, ambush surfacings on the player's own
// velocity vector, docked sabotage (tracker / rigged berth fee), the blood-price
// parley with its physical pay verb, and the three terminal resolutions.
// Seeded and deterministic: every draw the module makes is hash32(lossId, ...).

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { hash32 } from '../src/core/rng.js';
import {
  IMPOUND_GRUDGE_SCHEMA,
  activeImpoundShadow,
  mintImpoundShadow,
  noteImpoundGrudgeKill,
  tickImpoundGrudge,
} from '../src/systems/impoundGrudge.js';

const LOSS_ID = 'loss_arc_test';

function boot({ credits = 5000, lossId = LOSS_ID, vel } = {}) {
  const state = createGameState(777);
  state.mode = 'flight';
  state.simTime = 1000;
  state.tick = 60000;
  state.playerId = 1;
  state.player.credits = credits;
  state.player.ownedShips = [{
    defId: 'ship_wasp',
    impoundShadow: mintImpoundShadow({ lossId, callsign: 'Marrow' }, 1000),
  }];
  state.player.activeShipIndex = 0;
  state.ui.docked = false;
  state.entities.set(1, {
    id: 1, alive: true, type: 'ship',
    pos: { x: 0, z: 0 },
    vel: vel || { x: 0, z: 0 },
    data: {},
  });
  const captures = { emits: [], voices: [] };
  const busSubs = [];
  let nextId = 9000;
  // The world's entity factory stamps occupantGeneration so a recycled id can never
  // inherit a prior occupant's pairings — the module's liveGen/escortGens checks are
  // only exercised if this harness does the same.
  let nextGen = 1;
  const ctx = {
    bus: {
      on: (ev, fn) => { busSubs.push({ ev, fn }); return () => {}; },
      emit: (name, payload) => captures.emits.push({ name, payload }),
    },
    helpers: {
      spawnEntity: (spec) => {
        const id = nextId++;
        const ent = { ...spec, id, alive: true, occupantGeneration: nextGen++ };
        state.entities.set(id, ent);
        return ent;
      },
      spawnBudget: null,
      voice: { say: (p) => { captures.voices.push(p); return true; } },
    },
    emit: (name, payload) => captures.emits.push({ name, payload }),
    makeEnemySpec: (archetype, level, pos, opts) => makeEnemySpawnSpec(archetype, level, pos, opts),
  };
  const shadow = state.player.ownedShips[0].impoundShadow;
  return { state, ctx, captures, shadow, busSubs, player: state.entities.get(1) };
}

/** Advance the clock past the find window and surface the nemesis. */
function surface(h, { advance = 0.5 } = {}) {
  h.state.simTime = (Number(h.shadow.nextAt) || 0) + advance;
  tickImpoundGrudge(h.state, h.ctx);
  assert.ok(h.shadow.liveId != null, 'the grudge surfaced');
  return h.state.entities.get(h.shadow.liveId);
}

/** One live-tracking tick at ~1 Hz. */
function tick(h, dt = 1) {
  h.state.simTime += dt;
  tickImpoundGrudge(h.state, h.ctx);
}

/** Kill the live nemesis the way the real game does: combat emits entity:killed
 *  while the id still names the body, then the sweep deletes it and frees the id. */
function killNemesis(h) {
  const id = h.shadow.liveId;
  const e = h.state.entities.get(id);
  assert.ok(e, 'a live nemesis to kill');
  noteImpoundGrudgeKill(h.state, { id, killerId: 1 });
  h.state.entities.delete(id);
  tick(h);
}

/** The nemesis vanishes without a body — a clean escape, not a kill. */
function loseNemesis(h) {
  h.state.entities.delete(h.shadow.liveId);
  tick(h);
}

/** Deterministically pick a visits count whose parley roll lands under 0.35. */
function visitsForParley(lossId) {
  for (let v = 1; v < 60; v++) {
    const roll = hash32(lossId, 'impound-mode', v) / 0xffffffff;
    if (roll < 0.35) return v;
  }
  throw new Error('no parley roll under 0.35 in range');
}

// ── mint + schema ────────────────────────────────────────────────────────────

test('the expanded shadow stays plain JSON, deterministic, and schema-stamped', () => {
  const a = mintImpoundShadow({ lossId: 'loss_x', callsign: 'Marrow' }, 50);
  const b = mintImpoundShadow({ lossId: 'loss_x', callsign: 'Marrow' }, 50);
  assert.equal(a.schemaVersion, IMPOUND_GRUDGE_SCHEMA);
  assert.deepEqual(a, b, 'same papers mint the same nemesis');
  assert.equal(a.tier, 0);
  assert.equal(a.resolved, null);
  assert.deepEqual(a.liveEscortIds, []);
  const round = JSON.parse(JSON.stringify(a));
  assert.deepEqual(round, a, 'the whole record survives a save round-trip');
});

test('a schema-1 save record is upgraded in place, preserving its counters', () => {
  const h = boot();
  const legacy = {
    schemaVersion: 1, lossId: 'loss_old', priorCallsign: 'Marrow',
    grudgeName: 'Mara Vex', grudgeCallsign: 'WIDOWMAKER', archetype: 'reaver_pirate',
    deaths: 2, visits: 3, liveId: null, nextAt: h.state.simTime + 10,
  };
  h.state.player.ownedShips[0].impoundShadow = legacy;
  tickImpoundGrudge(h.state, h.ctx);
  assert.equal(legacy.deaths, 2, 'the papers still remember the kills');
  assert.equal(legacy.visits, 3);
  assert.equal(legacy.schemaVersion, IMPOUND_GRUDGE_SCHEMA);
  assert.deepEqual(legacy.learning.fights, []);
  assert.equal(legacy.tier, 2, 'tier derives from remembered deaths');
});

// ── escalation tiers + learned tactics ───────────────────────────────────────

test('each killing raises the tier; tiers bring escorts and a hotter hull', () => {
  const h = boot();
  surface(h);                       // tier 0: the stalker, alone
  assert.equal(h.shadow.tier, 0);
  assert.equal(h.shadow.mode, 'hunt');
  assert.equal(h.shadow.liveEscortIds.length, 0);

  killNemesis(h);
  assert.equal(h.shadow.deaths, 1);
  assert.equal(h.shadow.tier, 1, 'first blood makes it a hunter');
  assert.ok(h.captures.emits.some((e) => e.name === 'impoundGrudge:escalated' && e.payload.tier === 1));
  assert.equal(h.shadow.learning.kills, 1);
  assert.equal(h.shadow.learning.fights.length, 1);
  assert.equal(h.shadow.learning.fights[0].end, 'killed');

  surface(h);
  killNemesis(h);                   // kill again → tier 2
  assert.equal(h.shadow.tier, 2);
  assert.equal(h.shadow.deaths, 2);

  const third = surface(h);         // tier 2 brings the pack
  assert.ok(['hunt', 'ambush', 'parley'].includes(h.shadow.mode));
  if (h.shadow.mode !== 'parley') {
    assert.equal(h.shadow.liveEscortIds.length, 2, 'the pack flies with the papers');
    for (const id of h.shadow.liveEscortIds) {
      const esc = h.state.entities.get(id);
      assert.equal(esc.data.impoundGrudge.role, 'escort');
      assert.equal(esc.data.ai.squadId, `impound-grudge:${LOSS_ID}`);
      assert.equal(esc.data.combat.targetId, 1);
    }
    assert.equal(third.data.impoundGrudge.tier, 2);
  }
});

test('escaping the nemesis is a lesson too — and enough escapes starve the vendetta', () => {
  const h = boot();
  surface(h);
  loseNemesis(h);
  assert.equal(h.shadow.deaths, 0, 'no body, no kill on the papers');
  assert.equal(h.shadow.learning.escapes, 1);
  assert.equal(h.shadow.learning.fights[0].end, 'escaped');
  assert.ok(h.shadow.nextAt > h.state.simTime, 'the warm trail resurfaces');

  h.shadow.learning.escapes = 3;    // one more getaway outlasts it
  surface(h);
  const nemesis = h.state.entities.get(h.shadow.liveId);
  // The last escape is physical: the player berths while it is still hunting.
  h.state.ui.docked = true;
  tick(h, 1);
  assert.equal(h.shadow.learning.escapes, 4);
  assert.equal(h.shadow.resolved, 'outlasted');
  assert.equal(nemesis.data.ai.activity.kind, 'flee', 'a stood-down hunter burns home');
  assert.ok(h.captures.emits.some((e) => e.name === 'impoundGrudge:resolved' && e.payload.kind === 'outlasted'));
  assert.ok(h.captures.emits.some((e) => e.name === 'news:publish'));

  // Resolved is dead paper: no more surfacings, ever.
  h.state.ui.docked = false;
  h.state.simTime += 100000;
  tickImpoundGrudge(h.state, h.ctx);
  assert.equal(h.shadow.liveId, null);
});

// ── ambush ───────────────────────────────────────────────────────────────────

test('a tracker or learned escapes turn the next find into a close ambush on the player vector', () => {
  const h = boot({ vel: { x: 60, z: 0 } });
  h.shadow.tier = 2;
  h.shadow.deaths = 2;
  h.shadow.trackedUntil = h.state.simTime + 500; // sabotage tracker live — forces ambush, not parley
  const nemesis = surface(h);
  assert.equal(h.shadow.mode, 'ambush');
  assert.equal(nemesis.data.ai.roe, 'weapons_free');
  assert.equal(nemesis.data.ai.engagementTrigger, 'grudge_ambush');
  // Cut-the-lane geometry: it arrives ahead of the player's own velocity, close.
  assert.ok(nemesis.pos.x > 600, `ambush lands on the intercept vector (${nemesis.pos.x})`);
  const d = Math.hypot(nemesis.pos.x - h.player.pos.x, nemesis.pos.z - h.player.pos.z);
  assert.ok(d <= 620 + 60 * 6 + 1 + 900, `ambush is close, not the approach band (${d})`);
  // Tier-2 ambush salts the run line through the mines owner.
  const mines = h.captures.emits.filter((e) => e.name === 'mines:placeRequest');
  assert.equal(mines.length, 3, 'the pack seeds a wake on the escape line');
  assert.equal(mines[0].payload.ownerId, nemesis.id);
  for (const m of mines) assert.ok(Number.isFinite(m.payload.pos.x) && Number.isFinite(m.payload.pos.z));
});

test('learned fast kills buy a better hull and the ambush doctrine', () => {
  const h = boot({ vel: { x: 40, z: 0 } });
  h.shadow.deaths = 1;
  h.shadow.tier = 1;
  h.shadow.learning.fastKills = 2;   // it has died fast twice — it stops stalking
  const nemesis = surface(h);
  assert.equal(h.shadow.mode, 'ambush');
  // LEVEL_BASE(4) + 2*deaths + 2 fast-kill bonus = 8.
  assert.equal(nemesis.data.level, 8);
});

// ── docked sabotage ──────────────────────────────────────────────────────────

test('docked in the marked hull, the grudge works the berth — tracker or rigged fee', () => {
  const h = boot();
  h.shadow.deaths = 1;
  h.shadow.tier = 1;
  h.state.ui.docked = true;

  tick(h, 1);                        // registers the dock
  assert.ok(h.shadow.dockedSince != null, 'the berth clock started');
  tick(h, 1);                        // arms the sabotage clock
  assert.ok(h.shadow.dockArmedAt > h.state.simTime);

  h.state.simTime = h.shadow.dockArmedAt + 0.5;
  tickImpoundGrudge(h.state, h.ctx);
  assert.equal(h.shadow.sabotages, 1);
  assert.equal(h.shadow.dockSabotageDone, true);
  assert.ok(h.captures.voices.length >= 1, 'the sabotage is spoken, not silent');
  assert.ok(h.captures.emits.some((e) => e.name === 'toast'));

  const tracked = h.captures.emits.some((e) => e.name === 'impoundGrudge:tracked');
  const fee = h.captures.emits.find((e) => e.name === 'economy:chargeCredits');
  if (tracked) {
    assert.ok(h.shadow.trackedUntil > h.state.simTime);
  } else {
    assert.ok(fee && fee.payload.amount > 0, 'the berth fee rides the economy charge event');
    assert.match(fee.payload.reason, /impound_grudge/);
  }

  // One hit per docking, and it never lands a spawn while berthed.
  tick(h, 30);
  assert.equal(h.shadow.sabotages, 1);
  assert.equal(h.shadow.liveId, null);

  // Undocking re-arms the berth crew for the next stop.
  h.state.ui.docked = false;
  tick(h, 1);
  assert.equal(h.shadow.dockSabotageDone, false);
});

test('a fresh stalker has no pull in the yards — sabotage needs blood on the papers', () => {
  const h = boot();
  assert.equal(h.shadow.tier, 0);
  h.state.ui.docked = true;
  for (let i = 0; i < 200; i++) tick(h, 1);
  assert.equal(h.shadow.sabotages, 0);
  assert.equal(h.shadow.dockedSince, null, 'tier 0 never even registers the berth');
});

// ── settlement: the blood-price parley ───────────────────────────────────────

test('the parley hails a blood price; cutting thrust inside handshake range pays it off', () => {
  const h = boot({ credits: 10000 });
  h.shadow.deaths = 1;
  h.shadow.tier = 1;
  h.shadow.visits = visitsForParley(LOSS_ID); // this surfacing's mode roll lands parley
  const nemesis = surface(h);
  assert.equal(h.shadow.mode, 'parley');
  assert.equal(nemesis.data.ai.passive, true, 'under flag it parks and talks');
  assert.equal(nemesis.data.ai.roe, 'hold_fire');
  assert.equal(nemesis.data.ai.activity.kind, 'hail_hold');
  const offer = h.shadow.offer;
  assert.ok(offer && offer.price > 0);
  const offerEvent = h.captures.emits.find((e) => e.name === 'impoundGrudge:offer');
  assert.ok(offerEvent && offerEvent.payload.price === offer.price);

  // The physical pay verb: park inside handshake range and hold.
  h.player.pos = { x: nemesis.pos.x + 100, z: nemesis.pos.z };
  h.player.vel = { x: 0, z: 0 };
  for (let i = 0; i < 5; i++) tick(h, 1);
  assert.equal(h.shadow.resolved, 'settled');
  const charge = h.captures.emits.find((e) => e.name === 'economy:chargeCredits');
  assert.ok(charge, 'the blood price moves through the economy charge event');
  assert.equal(charge.payload.amount, offer.price);
  assert.ok(h.captures.emits.some((e) => e.name === 'impoundGrudge:settled'));
  assert.equal(h.state.entities.get(nemesis.id).data.ai.activity.kind, 'flee', 'paid, it runs home');
  assert.equal(h.shadow.liveId, null);

  // Settled paper never surfaces again.
  h.state.simTime += 50000;
  tick(h, 1);
  assert.equal(h.shadow.liveId, null);
});

test('firing on the flag, running out the deadline, or broke pockets all turn the parley hot', () => {
  // (a) opened fire
  let h = boot({ credits: 10000 });
  h.shadow.deaths = 1; h.shadow.tier = 1;
  h.shadow.visits = visitsForParley(LOSS_ID);
  let nemesis = surface(h);
  assert.equal(h.shadow.mode, 'parley');
  nemesis.hull -= 5; // a shot landed on the flag
  tick(h, 1);
  assert.equal(h.shadow.offer, null);
  assert.equal(h.shadow.resolved, null, 'a refused offer is a fight, not an ending');
  assert.equal(nemesis.data.ai.passive, false);
  assert.equal(nemesis.data.ai.roe, 'weapons_free');
  assert.equal(nemesis.data.ai.engagementTrigger, 'player_attack');
  assert.equal(nemesis.data.combat.targetId, 1);
  assert.ok(h.captures.emits.some((e) => e.name === 'impoundGrudge:offerRefused'));

  // (b) silence past the deadline
  h = boot({ credits: 10000 });
  h.shadow.deaths = 1; h.shadow.tier = 1;
  h.shadow.visits = visitsForParley(LOSS_ID);
  nemesis = surface(h);
  h.state.simTime = h.shadow.offer.deadlineAt + 0.1;
  tick(h, 0.1);
  assert.equal(nemesis.data.ai.roe, 'weapons_free');
  assert.equal(nemesis.data.ai.engagementTrigger, 'ignored_demand');

  // (c) the handshake hold with empty pockets — mocked, then hot
  h = boot({ credits: 10 });
  h.shadow.deaths = 1; h.shadow.tier = 1;
  h.shadow.visits = visitsForParley(LOSS_ID);
  nemesis = surface(h);
  h.player.pos = { x: nemesis.pos.x + 50, z: nemesis.pos.z };
  for (let i = 0; i < 6; i++) tick(h, 1);
  assert.equal(h.shadow.resolved, null, 'empty pockets buy no ending');
  assert.equal(nemesis.data.ai.roe, 'weapons_free');
  assert.equal(nemesis.data.ai.engagementTrigger, 'broke_pockets');
  assert.ok(!h.captures.emits.some((e) => e.name === 'economy:chargeCredits'), 'no charge for a broke payer');
});

// ── the apex duel and the payoff resolution ──────────────────────────────────

test('the third killing buys the apex duel; killing that hull ends the arc with a blood prize', () => {
  const h = boot();
  h.shadow.deaths = 3;
  h.shadow.tier = 3;
  const nemesis = surface(h);
  assert.equal(h.shadow.mode, 'duel');
  assert.equal(nemesis.data.impoundGrudge.mode, 'duel');
  // The spent-everything hull is measurably harder than a stock spec.
  const stock = makeEnemySpawnSpec(h.shadow.archetype, nemesis.data.level, { x: 0, z: 0 }, {});
  assert.ok(nemesis.hullMax > stock.hullMax, `apex hull ${nemesis.hullMax} > ${stock.hullMax}`);
  assert.ok(nemesis.shieldMax > stock.shieldMax);
  assert.equal(h.shadow.liveEscortIds.length, 2, 'the duel still brings its killers');

  noteImpoundGrudgeKill(h.state, { id: nemesis.id, killerId: 1 });
  h.state.entities.delete(nemesis.id);
  tick(h, 1);
  assert.equal(h.shadow.resolved, 'avenged');
  assert.equal(h.shadow.deaths, 4);
  const grant = h.captures.emits.find((e) => e.name === 'economy:grantCredits');
  assert.ok(grant && grant.payload.amount >= 600, 'the blood prize posts through the grant event');
  assert.ok(h.captures.emits.some((e) => e.name === 'impoundGrudge:resolved' && e.payload.kind === 'avenged'));
  assert.ok(h.captures.emits.some((e) => e.name === 'news:publish'));

  // Escorts stood down and the papers are closed.
  assert.deepEqual(h.shadow.liveEscortIds, []);
  h.state.simTime += 99999;
  tick(h, 1);
  assert.equal(h.shadow.liveId, null);
});

test('tier-2 wounds speak the curse line once, and only once', () => {
  const h = boot();
  h.shadow.deaths = 2;
  h.shadow.tier = 2;
  h.shadow.trackedUntil = h.state.simTime + 500; // force ambush — deterministic mode
  const nemesis = surface(h);
  const hailsBefore = h.captures.emits.filter((e) => e.name === 'comms:popup').length;
  nemesis.hull = nemesis.hullMax * 0.2;
  tick(h, 1);
  const hailsAfter = h.captures.emits.filter((e) => e.name === 'comms:popup').length;
  assert.equal(hailsAfter, hailsBefore + 1, 'the wounded nemesis names the debt');
  assert.equal(h.shadow.cursed, true);
  tick(h, 1);
  assert.equal(
    h.captures.emits.filter((e) => e.name === 'comms:popup').length,
    hailsAfter,
    'it does not repeat itself',
  );
});

// ── invariants the original slice promised ───────────────────────────────────

test('surfacing still respects the budget gate and never doubles while one lives', () => {
  const h = boot();
  h.captures.emits.length = 0;
  h.ctx.helpers.spawnBudget = {
    request: () => 0, // a crowded sky
    releaseSome: () => {}, bindEntity: () => {},
  };
  h.state.simTime = h.shadow.nextAt + 1;
  tickImpoundGrudge(h.state, h.ctx);
  assert.equal(h.shadow.liveId, null);
  assert.ok(h.shadow.nextAt > h.state.simTime, 'the find is deferred, not dropped');

  h.ctx.helpers.spawnBudget = null;
  surface(h);
  const id = h.shadow.liveId;
  tick(h, 30);
  assert.equal(h.shadow.liveId, id, 'no doubling while the nemesis lives');
});

test('the production seam: a kill delivered through the real bus counts on the papers', () => {
  const h = boot();
  surface(h);
  // The tick self-subscribes to ctx.bus — the channel the director actually owns.
  const sub = h.busSubs.find((s) => s.ev === 'entity:killed');
  assert.ok(sub, 'the grudge is listening on the ctx bus');
  const id = h.shadow.liveId;
  sub.fn({ id, killerId: 1 });           // combat's emit, while the id still names the body
  h.state.entities.delete(id);           // then the sweep takes it
  tick(h);
  assert.equal(h.shadow.deaths, 1, 'a bus-delivered kill is a kill');
  assert.equal(h.shadow.tier, 1);
});

test('a kill event for a foreign entity on the recycled id stamps nothing', () => {
  const h = boot();
  surface(h);
  const id = h.shadow.liveId;
  h.state.entities.delete(id);
  // A foreign hull took the recycled id before the kill event landed.
  h.state.entities.set(id, {
    id, alive: true, type: 'ship', pos: { x: 0, z: 0 }, data: {},
  });
  const sub = h.busSubs.find((s) => s.ev === 'entity:killed');
  if (sub) sub.fn({ id, killerId: 1 }); else noteImpoundGrudgeKill(h.state, { id, killerId: 1 });
  tick(h);
  assert.equal(h.shadow.deaths, 0, 'an untagged body cannot stamp the papers');
  assert.equal(h.shadow.learning.escapes, 1);
});

test('a save/continue mid-surfacing drops the trail — no free escape credit', () => {
  const h = boot();
  surface(h);
  const sub = h.busSubs.find((s) => s.ev === 'save:loaded');
  assert.ok(sub, 'the grudge listens for save restore');
  sub.fn();                                // restore: the nemesis body never persisted
  assert.equal(h.shadow.liveId, null);
  assert.equal(h.shadow.learning.escapes, 0, 'a reload is not a getaway');
  assert.ok(Number.isFinite(h.shadow.nextAt) && h.shadow.nextAt > 0, 'the trail resurfaces later');
});

test('a stale kill stamp that names another id cannot forge an escape across save:loaded', () => {
  // Corrupt/stale ledger row: killedLiveId is set but disagrees with the live
  // trail. It is not a kill — the restore drops the trail like any unload, and
  // the next tick must not read the bodyless liveId as an 'escaped' lesson.
  const h = boot();
  surface(h);
  h.shadow.killedLiveId = h.shadow.liveId + 500; // names nobody
  const sub = h.busSubs.find((s) => s.ev === 'save:loaded');
  assert.ok(sub, 'the grudge listens for save restore');
  sub.fn();
  assert.equal(h.shadow.killedLiveId, null, 'a foreign stamp is paper noise');
  assert.equal(h.shadow.liveId, null, 'the trail still drops');
  tick(h);
  assert.equal(h.shadow.learning.escapes, 0, 'no escape banked off a mismatched stamp');
  assert.equal(h.shadow.deaths, 0, 'no kill banked either');
  assert.equal(h.shadow.resolved, null);
});

test('a kill stamp that names the live trail survives save:loaded and lands', () => {
  const h = boot();
  surface(h);
  const id = h.shadow.liveId;
  const killSub = h.busSubs.find((s) => s.ev === 'entity:killed');
  killSub.fn({ id, killerId: 1 });         // stamped while the body is still in the map
  const saveSub = h.busSubs.find((s) => s.ev === 'save:loaded');
  saveSub.fn();                            // reload before the next tick
  assert.equal(h.shadow.killedLiveId, id, 'the stamp survives the restore');
  h.state.entities.delete(id);             // restored world has no body for it
  tick(h);
  assert.equal(h.shadow.deaths, 1, 'a stamped kill is still a kill after a load');
  assert.equal(h.shadow.tier, 1);
  assert.equal(h.shadow.learning.fights[0].end, 'killed');
});

test('a kill is only a kill when entity:killed says so — a swept body counts as an escape', () => {
  const h = boot();
  surface(h);
  // The despawn sweep's shape: flagged dead, then deleted, no kill event.
  const id = h.shadow.liveId;
  h.state.entities.delete(id);
  tick(h);
  assert.equal(h.shadow.deaths, 0, 'no kill event, no kill on the papers');
  assert.equal(h.shadow.learning.escapes, 1);
});

test('a recycled entity id never inherits the grudge — writes fail closed', () => {
  const h = boot();
  surface(h);
  const id = h.shadow.liveId;
  h.state.entities.delete(id);
  // A foreign hull takes the recycled id — no impoundGrudge tag, fresh generation.
  const foreign = {
    id, alive: true, type: 'ship', occupantGeneration: 77,
    pos: { x: 50, z: 50 }, vel: { x: 0, z: 0 },
    data: { ai: {}, combat: {}, intent: {} },
  };
  h.state.entities.set(id, foreign);
  h.state.ui.docked = true; // the dock-escape path is where standDown used to write
  tick(h, 1);
  assert.equal(foreign.data.ai.roe, undefined, 'the foreign hull is untouched');
  assert.equal(foreign.data.ai.passive, undefined);
  assert.equal(h.shadow.learning.escapes, 1, 'a swapped-out id reads as gone, not killed');
  assert.equal(h.shadow.deaths, 0);
});

test('shots into the armor layer refuse the parley like shots into the hull', () => {
  const h = boot({ credits: 10000 });
  h.shadow.deaths = 1; h.shadow.tier = 1;
  h.shadow.visits = visitsForParley(LOSS_ID);
  const nemesis = surface(h);
  assert.equal(h.shadow.mode, 'parley');
  nemesis.armorHp = Math.max(0, (nemesis.armorHp || 0) - 1) ; // a hit that only stripped armor
  if ((nemesis.armorHp || 0) < h.shadow.offer.armor) {
    tick(h, 1);
    assert.equal(h.shadow.offer, null);
    assert.equal(nemesis.data.ai.engagementTrigger, 'player_attack');
  } else {
    // The spec carries no armor pool — the refusal rests on hull/shield alone here.
    nemesis.hull -= 1;
    tick(h, 1);
    assert.equal(h.shadow.offer, null);
  }
});

test('a long fight teaches it to bring one extra escort, still inside the budget cap', () => {
  const h = boot();
  h.shadow.deaths = 1;
  h.shadow.tier = 1;
  h.shadow.trackedUntil = h.state.simTime + 500; // deterministic: ambush, not parley
  surface(h);
  const baseline = h.shadow.liveEscortIds.length;

  const h2 = boot();
  h2.shadow.deaths = 1;
  h2.shadow.tier = 1;
  h2.shadow.learning.longFights = 1;
  h2.shadow.trackedUntil = h2.state.simTime + 500;
  h2.shadow.visits = h.shadow.visits; // same roll so only the lesson differs
  surface(h2);
  assert.equal(h2.shadow.liveEscortIds.length, baseline + 1, 'long fights invite the pack');
});

test('settled and avenged each pay exactly once and emit their events exactly once', () => {
  // settled
  const h = boot({ credits: 10000 });
  h.shadow.deaths = 1; h.shadow.tier = 1;
  h.shadow.visits = visitsForParley(LOSS_ID);
  const nemesis = surface(h);
  h.player.pos = { x: nemesis.pos.x + 80, z: nemesis.pos.z };
  for (let i = 0; i < 8; i++) tick(h, 1);
  assert.equal(h.captures.emits.filter((e) => e.name === 'economy:chargeCredits').length, 1);
  assert.equal(h.captures.emits.filter((e) => e.name === 'impoundGrudge:settled').length, 1);
  assert.equal(h.captures.emits.filter((e) => e.name === 'impoundGrudge:resolved').length, 1);

  // avenged
  const h2 = boot();
  h2.shadow.deaths = 3; h2.shadow.tier = 3;
  const apex = surface(h2);
  noteImpoundGrudgeKill(h2.state, { id: apex.id, killerId: 1 });
  h2.state.entities.delete(apex.id);
  for (let i = 0; i < 5; i++) tick(h2, 1);
  assert.equal(h2.captures.emits.filter((e) => e.name === 'economy:grantCredits').length, 1);
  assert.equal(h2.captures.emits.filter((e) => e.name === 'impoundGrudge:resolved').length, 1);
});

test('a stood-down nemesis is stamped to despawn, not left holding a spawn slot', () => {
  const h = boot({ credits: 10000 });
  h.shadow.deaths = 1; h.shadow.tier = 1;
  h.shadow.visits = visitsForParley(LOSS_ID);
  const nemesis = surface(h);
  h.player.pos = { x: nemesis.pos.x + 80, z: nemesis.pos.z };
  for (let i = 0; i < 6; i++) tick(h, 1);
  assert.equal(h.shadow.resolved, 'settled');
  const gone = h.state.entities.get(nemesis.id);
  assert.ok(gone, 'the hull still exists long enough to fly off');
  assert.ok(Number.isFinite(gone.data.despawnAt), 'it carries a real despawn stamp');
  assert.ok(gone.data.despawnAt > 0 && gone.data.despawnAt <= h.state.simTime + 21);
});

test('the arc stays on state.* as plain data through the whole lifecycle', () => {
  const h = boot({ credits: 10000 });
  h.shadow.deaths = 1; h.shadow.tier = 1;
  h.shadow.visits = visitsForParley(LOSS_ID);
  const nemesis = surface(h);
  h.player.pos = { x: nemesis.pos.x + 80, z: nemesis.pos.z };
  for (let i = 0; i < 5; i++) tick(h, 1);
  const blob = JSON.parse(JSON.stringify(h.shadow));
  assert.equal(blob.resolved, 'settled');
  assert.equal(blob.tier, 1);
  assert.ok(blob.learning.fights.length <= 8, 'the fight log is bounded');
  assert.equal(activeImpoundShadow(h.state).resolved, 'settled');
});

// ── external-helper fault tolerance ──────────────────────────────────────────
// The module already try/catches helpers.spawnEntity; voice.say and
// spawnBudget.bindEntity are the same class of foreign call and must fail just
// as closed. Callers latch BEFORE they speak, so a voice fault must not strand
// a half-flipped outcome (a refused flag that never goes hot, a latched
// 'avenged' whose prize never posts); and a bind fault after a successful
// spawn must leave a tracked body, never an orphan the next tick would double.

test('a throwing voice helper cannot wedge outcomes — the line degrades to a popup', () => {
  // (a) the apex duel: hail + avenged line both fault — spawn, resolution, and
  // the blood prize still land.
  const h = boot();
  h.ctx.helpers.voice = { say: () => { throw new Error('arbiter fault'); } };
  h.shadow.deaths = 3;
  h.shadow.tier = 3;
  const nemesis = surface(h);
  assert.equal(h.shadow.mode, 'duel', 'a faulted hail does not abort the spawn');
  assert.ok(
    h.captures.emits.some((e) => e.name === 'comms:popup'),
    'the line still reaches the glass as a popup',
  );
  noteImpoundGrudgeKill(h.state, { id: nemesis.id, killerId: 1 });
  h.state.entities.delete(nemesis.id);
  tick(h);
  assert.equal(h.shadow.resolved, 'avenged');
  assert.ok(
    h.captures.emits.some((e) => e.name === 'economy:grantCredits'),
    'the blood prize still posts despite the voice fault',
  );
  assert.ok(h.captures.emits.some((e) => e.name === 'impoundGrudge:resolved' && e.payload.kind === 'avenged'));

  // (b) a faulted refusal line still turns the flag hot — the nemesis must not
  // be left parked passive under a consumed offer.
  const h2 = boot({ credits: 10000 });
  h2.ctx.helpers.voice = { say: () => { throw new Error('arbiter fault'); } };
  h2.shadow.deaths = 1;
  h2.shadow.tier = 1;
  h2.shadow.visits = visitsForParley(LOSS_ID);
  const flagged = surface(h2);
  assert.equal(h2.shadow.mode, 'parley');
  flagged.hull -= 5;                      // a shot lands on the flag
  tick(h2, 1);
  assert.equal(h2.shadow.offer, null, 'the offer was consumed');
  assert.equal(h2.shadow.mode, 'hunt');
  assert.equal(flagged.data.ai.roe, 'weapons_free', 'the refused flag still goes hot');
  assert.equal(flagged.data.ai.passive, false);
});

test('a throwing budget bind cannot orphan the nemesis or its escorts', () => {
  // The shadow claims the body before budget bookkeeping: a bind fault leaves a
  // tracked surfacing, never an untracked hull the next tick would double.
  const h = boot();
  let bindCalls = 0;
  h.ctx.helpers.spawnBudget = {
    request: () => 3,
    bindEntity: () => { bindCalls += 1; throw new Error('ledger fault'); },
    releaseSome: () => {},
  };
  h.state.simTime = (Number(h.shadow.nextAt) || 0) + 0.5;
  assert.throws(() => tickImpoundGrudge(h.state, h.ctx), /ledger fault/);
  assert.ok(h.shadow.liveId != null, 'the papers own the spawned hull even when the bind faults');
  assert.equal(h.state.entities.get(h.shadow.liveId).data.impoundGrudge.role, 'nemesis');

  const liveAfterFault = h.shadow.liveId;
  tick(h, 1);
  assert.equal(h.shadow.liveId, liveAfterFault, 'no double-spawn while the faulted surfacing is tracked');

  // The escort path: tracked first, bound second — a mid-loop fault cannot
  // leave a tagged hostile outside the stand-down list.
  const h2 = boot();
  h2.shadow.deaths = 2;
  h2.shadow.tier = 2;
  h2.shadow.trackedUntil = h2.state.simTime + 500; // deterministic ambush → pack
  let calls = 0;
  h2.ctx.helpers.spawnBudget = {
    request: () => 3,
    bindEntity: () => { calls += 1; if (calls === 2) throw new Error('ledger fault'); },
    releaseSome: () => {},
  };
  h2.state.simTime = (Number(h2.shadow.nextAt) || 0) + 0.5;
  assert.throws(() => tickImpoundGrudge(h2.state, h2.ctx), /ledger fault/);
  assert.equal(h2.shadow.liveEscortIds.length, 1, 'the escort spawned before the fault is still tracked');
  const orphan = h2.state.entities.get(h2.shadow.liveEscortIds[0]);
  assert.equal(orphan.data.impoundGrudge.lossId, LOSS_ID, 'stand-down can still reach it');
});
