// inf-mine-strike — the fence answers the throw. A mine is a ghost to the contact solver
// (material 'projectile') and its proximity fuze senses only hulls its IFF admits, so a rock the
// pilot hurled through a fence passed straight through it, and so did the pilot's throw of the
// layer's own wingman. SF-041 names "throw a body through" as a fence answer; the mines owner
// now fuzes on mass the pilot hurled into an armed mine: a body carrying the pilot's fresh
// thrown-mass cause (stamped here by the real tumbleStates throw owner), the body on the pilot's
// line, or the still-witnessed wreck of the pilot's own kill — when its swept path crosses the
// mine's contact disc at the throw floor or faster. One blast on what struck it, the pilot's
// credit, one band line per throw. Drift, NPC throws, set-downs, cargo and unarmed fuses stay
// what they were.
//
// Harness mirrors inf-plow-turn: real tumbleStates + mines owners on the core sim (which does
// not integrate poses, so each body sits exactly where its last fixed step ended). Production
// feature maps, restored after every case.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  applyFeatureConfigToMaps,
  PRODUCTION_FEATURES,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { mines, MINE_STRIKE_MIN_SPEED, MINE_STRIKE_LINE_GAP_S } from '../src/systems/mines.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { bindChainWreck, isThrownMassTag, rememberChainDeath } from '../src/combat/killCausality.js';

function fixture(t) {
  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const sim = createSimulation({ seed: 7, systems: [tumbleStates, mines] });
  t.after(() => { sim.dispose(); restoreFeatureMaps(flags); });
  const { state, bus } = sim;
  // The combat kernel is the damage owner the mines route through (production builds it in the
  // combat system; this harness builds the same per-state kernel directly).
  getCombatKernel({ state, bus, helpers: sim.helpers, registry: sim.registry });
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -900, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true, data: {} });
  state.playerId = player.id;
  // The layer parks well off the fence: its hull never enters a trigger disc by accident.
  const layer = sim.spawn({ type: 'ship', team: 1, pos: { x: 900, z: 900 }, vel: { x: 0, z: 0 },
    hull: 40, hullMax: 40, radius: 10, mass: 20, collides: true, data: {} });
  const events = [];
  for (const name of ['mines:struck', 'mines:triggered', 'mines:detonated', 'combat:damage', 'voice:say']) {
    bus.on(name, (p) => events.push({ name, p }));
  }
  return { sim, state, bus, events, player, layer, mineOwner: sim.registry.get('mines') };
}

function place(h, pos, { ownerId = h.layer.id, team = 1, armDelayS = 0 } = {}) {
  const mine = h.mineOwner.placeMine({ ownerId, team, pos, armDelayS, telegraph: false });
  assert.ok(mine, 'the fence mine was placed');
  return mine;
}

/** A body whose last fixed step carried it from `from` to `to` (both relative to `at`). */
function body(h, type, at, from, to, extra = {}) {
  const vx = (to.x - from.x) / SIM_DT;
  const vz = (to.z - from.z) / SIM_DT;
  return h.sim.spawn({ type, pos: { x: at.x + to.x, z: at.z + to.z }, vel: { x: vx, z: vz },
    radius: 4, mass: 30, collides: true, data: {}, ...extra });
}

/** The real throw owner stamps the pilot's thrown-mass cause on the released body. */
function throwIt(h, entity, speed = 200) {
  h.bus.emit('massline:throw', { payloadId: entity.id, payloadSpeed: speed, tick: h.state.tick });
}

const named = (h, name) => h.events.filter((e) => e.name === name).map((e) => e.p);
const strikeLines = (h) => named(h, 'voice:say').filter((p) => p.id === 'mine-struck');

test('the strike custody reads the law card\'s own thrown-mass tags', () => {
  for (const tag of ['massline_throw', 'massline', 'rope_throw', 'massline_whip']) {
    assert.equal(isThrownMassTag(tag), true, tag);
  }
  for (const tag of ['npc_body_launch', 'weapon_hit', 'environment', 'direct_contact', '', null]) {
    assert.equal(isThrownMassTag(tag), false, String(tag));
  }
});

test('a rock the pilot throws through a fence sets off the mine it strikes, and the band says so once', t => {
  const h = fixture(t);
  const a = place(h, { x: 0, z: 0 });
  const b = place(h, { x: 0, z: 240 });
  // One cast clears two mines in the same tick: two strikes, two blasts, one line.
  const rockA = body(h, 'asteroid', a.pos, { x: -6, z: 0 }, { x: 4, z: 0 });
  const rockB = body(h, 'asteroid', b.pos, { x: -6, z: 1 }, { x: 4, z: 1 });
  throwIt(h, rockA);
  throwIt(h, rockB);
  h.sim.step(SIM_DT);

  assert.equal(a.alive, false, 'the first mine went off on the rock that struck it');
  assert.equal(b.alive, false, 'the second mine went off on its rock');
  assert.ok(a.data.triggered && b.data.triggered, 'both fuzes are spent');
  const struck = named(h, 'mines:struck');
  assert.deepEqual(struck.map((p) => p.mineId).sort(), [a.id, b.id].sort());
  assert.ok(struck.every((p) => p.custody === 'throw'), 'custody names the throw');
  assert.ok(struck.every((p) => p.speed >= MINE_STRIKE_MIN_SPEED), 'a strike is at the throw floor or faster');
  const snapped = named(h, 'mines:triggered');
  assert.equal(snapped.length, 2, 'the ordinary snap receipt still lands once per mine');
  assert.ok(snapped.every((p) => p.struck === true), 'the snap says it was struck');
  assert.equal(snapped.find((p) => p.mineId === a.id).targetId, rockA.id, 'the charge is spent on what struck it');
  assert.equal(named(h, 'mines:detonated').length, 2, 'one detonation per mine, the blast cue consumers fire');
  assert.equal(rockA.alive, true, 'a rock is not damageable: the throw opens the lane, it is not consumed');
  const lines = strikeLines(h);
  assert.equal(lines.length, 1, 'one band line per throw, not one per mine');
  assert.equal(lines[0].text, 'Your throw set off that mine');

  // A second throw inside the gap stays quiet on the band; past the gap it speaks again.
  const c = place(h, { x: 400, z: 0 });
  const rockC = body(h, 'asteroid', c.pos, { x: 0, z: -6 }, { x: 0, z: 4 });
  throwIt(h, rockC);
  h.sim.step(SIM_DT);
  assert.equal(c.alive, false, 'the third mine still goes off');
  assert.equal(strikeLines(h).length, 1, 'inside the line gap the band does not repeat itself');
  h.state.simTime += MINE_STRIKE_LINE_GAP_S;
  const d = place(h, { x: 400, z: 300 });
  const rockD = body(h, 'asteroid', d.pos, { x: 6, z: 0 }, { x: -4, z: 0 });
  throwIt(h, rockD);
  h.sim.step(SIM_DT);
  assert.equal(d.alive, false);
  assert.equal(strikeLines(h).length, 2, 'past the gap a new throw speaks once more');
});

test('the swept path catches a fast throw that skipped the disc between two samples', t => {
  const h = fixture(t);
  const mine = place(h, { x: 0, z: 0 });
  // 1,800 wu/s: the step started 15 wu short and ended 15 wu past — both samples clear of the
  // 6 + 4 wu contact disc, the path straight through the charge.
  const rock = body(h, 'asteroid', mine.pos, { x: -15, z: 2 }, { x: 15, z: 2 });
  throwIt(h, rock, 1800);
  h.sim.step(SIM_DT);
  assert.equal(mine.alive, false, 'the throw did not tunnel through the fence');
  assert.equal(named(h, 'mines:struck')[0].bodyId, rock.id);
});

test('no custody, no strike: drift, an NPC throw, a set-down, a miss and an unarmed fuse stay quiet', t => {
  const h = fixture(t);
  const drift = place(h, { x: 0, z: 0 });
  body(h, 'asteroid', drift.pos, { x: -6, z: 0 }, { x: 4, z: 0 });            // nobody threw it

  const npc = place(h, { x: 300, z: 0 });
  const npcRock = body(h, 'asteroid', npc.pos, { x: -6, z: 0 }, { x: 4, z: 0 });
  recordImpulseProvenance(npcRock, { actorId: h.layer.id, weaponId: 'npc_launcher',
    tag: 'npc_body_launch', appliedTick: h.state.tick, magnitude: 400 });   // an NPC's throw

  const slow = place(h, { x: 600, z: 0 });
  const slowRock = body(h, 'asteroid', slow.pos, { x: 0, z: 0 }, { x: 0.1, z: 0 }); // 6 wu/s
  throwIt(h, slowRock, 6);

  const wide = place(h, { x: 900, z: 0 });
  const wideRock = body(h, 'asteroid', wide.pos, { x: -6, z: 30 }, { x: 4, z: 30 });
  throwIt(h, wideRock);

  const unarmed = place(h, { x: 1200, z: 0 }, { armDelayS: 30 });
  const fuseRock = body(h, 'asteroid', unarmed.pos, { x: -6, z: 0 }, { x: 4, z: 0 });
  throwIt(h, fuseRock);

  h.sim.step(SIM_DT);
  for (const [label, mine] of [['drift', drift], ['npc throw', npc], ['set-down', slow],
    ['miss', wide], ['unarmed', unarmed]]) {
    assert.equal(mine.alive, true, `${label}: the mine is still in the fence`);
    assert.ok(!mine.data.triggered, `${label}: the fuze is unspent`);
  }
  assert.equal(named(h, 'mines:struck').length, 0);
  assert.equal(strikeLines(h).length, 0);
});

test('the layer\'s own wingman — and the layer itself — thrown into its fence takes the blast: the pilot\'s kill', t => {
  const h = fixture(t);
  const mine = place(h, { x: 0, z: 0 });
  // The wingman flies the layer's colors: the proximity fuze's IFF spares it while it sits on
  // the charge (a set-down is not a strike either).
  const wingman = h.sim.spawn({ type: 'ship', team: 1, pos: { x: 3, z: 0 }, vel: { x: 0, z: 0 },
    hull: 30, hullMax: 30, radius: 9, mass: 24, collides: true, data: {} });
  h.sim.step(SIM_DT);
  assert.equal(mine.alive, true, 'a same-team hull at rest on the charge does not set it off');

  wingman.vel.x = 600;
  throwIt(h, wingman, 600);
  h.sim.step(SIM_DT);
  assert.equal(mine.alive, false, 'thrown at speed, the wingman strikes the charge');
  const hit = named(h, 'combat:damage').find((p) => p.targetId === wingman.id);
  assert.ok(hit, 'the blast routes through the damage owner');
  assert.equal(String(hit.attackerId), String(h.player.id), 'the pilot who threw it owns the blast');
  assert.ok(hit.applied > 0, 'the wingman took the real packet');

  // The layer is never sensed by its own fuze; thrown into its own mine, it is taken by it.
  const own = place(h, { x: 0, z: 400 });
  h.layer.pos.x = own.pos.x + 4; h.layer.pos.z = own.pos.z;
  h.layer.vel.x = 600; h.layer.vel.z = 0;
  throwIt(h, h.layer, 600);
  h.sim.step(SIM_DT);
  assert.equal(own.alive, false, 'the layer struck its own charge');
  const layerHit = named(h, 'combat:damage').find((p) => p.targetId === h.layer.id);
  assert.ok(layerHit && String(layerHit.attackerId) === String(h.player.id) && layerHit.applied > 0,
    'its own garden takes the layer, on the pilot\'s credit');
});

test('the wreck of the pilot\'s kill, still carrying its momentum, trips the fence', t => {
  const h = fixture(t);
  const victim = h.sim.spawn({ type: 'ship', team: 1, pos: { x: -40, z: 0 }, vel: { x: 0, z: 0 },
    hull: 0, hullMax: 30, radius: 9, mass: 24, collides: true, data: {} });
  assert.ok(Number.isSafeInteger(victim.occupantGeneration));
  h.state.simTime = 10;
  const witness = rememberChainDeath(h.state, 'marker:kill', {
    type: 'ship', id: victim.id, killerId: h.player.id,
  }, victim);
  assert.ok(witness, 'the pilot\'s kill is remembered');
  const mine = place(h, { x: 0, z: 0 });
  const hulk = body(h, 'wreck', mine.pos, { x: -6, z: 0 }, { x: 4, z: 0 }, { radius: 9 });
  assert.ok(bindChainWreck(h.state, 'marker:kill', hulk), 'the aftermath binds the kill to its wreck');
  // A stranger's wreck crossing another mine at the same speed carries nobody's cause.
  const other = place(h, { x: 0, z: 300 });
  body(h, 'wreck', other.pos, { x: -6, z: 0 }, { x: 4, z: 0 }, { radius: 9 });
  h.sim.step(SIM_DT);

  assert.equal(mine.alive, false, 'the kill\'s wreck set the charge off');
  const struck = named(h, 'mines:struck');
  assert.equal(struck.length, 1);
  assert.equal(struck[0].custody, 'wreck');
  assert.equal(struck[0].bodyId, hulk.id);
  assert.equal(other.alive, true, 'a wreck nobody made yours stays drift');
  assert.equal(strikeLines(h)[0].text, 'The wreck you made set off that mine');
});

test('a rock on the pilot\'s line whipped through a mine sets it off; cargo on the line stays the recovery owners\' business', t => {
  const h = fixture(t);
  const mine = place(h, { x: 0, z: 0 });
  const rock = body(h, 'asteroid', mine.pos, { x: 0, z: -6 }, { x: 0, z: 4 });
  h.state.player.tether = { active: true, targetId: rock.id };
  h.sim.step(SIM_DT);
  assert.equal(mine.alive, false, 'the whipped mass struck the charge');
  assert.equal(named(h, 'mines:struck')[0].custody, 'line');
  assert.equal(strikeLines(h)[0].text, 'The mass on your line set off that mine');

  const cargoMine = place(h, { x: 500, z: 0 });
  const pod = body(h, 'payload', cargoMine.pos, { x: 0, z: -6 }, { x: 0, z: 4 });
  h.state.player.tether = { active: true, targetId: pod.id };
  h.sim.step(SIM_DT);
  assert.equal(cargoMine.alive, true, 'a towed pod is not a striker');
  assert.equal(pod.alive, true);
});

test('the pilot\'s own hull never strike-fuzes, and the pilot\'s own mine still ignores the pilot', t => {
  const h = fixture(t);
  const mine = place(h, { x: 0, z: 0 }, { ownerId: h.player.id, team: 0 });
  h.player.pos.x = 4; h.player.pos.z = 0;
  h.player.vel.x = 600; h.player.vel.z = 0;
  recordImpulseProvenance(h.player, { actorId: h.player.id, weaponId: 'massline',
    tag: 'massline_throw', appliedTick: h.state.tick, magnitude: 100 });
  h.sim.step(SIM_DT);
  assert.equal(mine.alive, true, 'the pilot\'s hull is governed by proximity and custody grace, never the strike');
  assert.equal(named(h, 'mines:struck').length, 0);
});

test('two throws through one mine in one step: the closest approach takes the charge, every replay', () => {
  const outcome = () => {
    const t = { after: (fn) => cleanups.push(fn) };
    const cleanups = [];
    try {
      const h = fixture(t);
      const mine = place(h, { x: 0, z: 0 });
      const near = body(h, 'asteroid', mine.pos, { x: -6, z: 1 }, { x: 4, z: 1 });
      const far = body(h, 'asteroid', mine.pos, { x: -6, z: 7 }, { x: 4, z: 7 });
      throwIt(h, far);
      throwIt(h, near);
      h.sim.step(SIM_DT);
      const struck = named(h, 'mines:struck');
      assert.equal(struck.length, 1, 'one charge, one victim');
      return { body: struck[0].bodyId === near.id ? 'near' : 'far', alive: mine.alive };
    } finally {
      for (const fn of cleanups.reverse()) fn();
    }
  };
  const first = outcome();
  assert.deepEqual(first, { body: 'near', alive: false });
  assert.deepEqual(outcome(), first, 'same setup, same strike');
});
