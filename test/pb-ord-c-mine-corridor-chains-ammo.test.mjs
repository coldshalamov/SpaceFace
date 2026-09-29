// PB-ORD-C — SF-041+042+043 (build_map.md §1C row 95).
// Counterexamples the old behavior fails:
//   · SF-042: a bomb blast could not reach other drift ordnance at all — no sympathetic
//     chain, no bounded deterministic multi-bomb consequence.
//   · SF-041: a placed mine was invisible to both blast forces and field forces, so
//     "displace the fence with force" was not a real solution; the seeded wake had no
//     authored safe lane.
//   · SF-043: the zero-ammo refusal / exact reconciliation laws around the corridor route
//     were not bound by tests at the commit boundary.
// Everything asserts authoritative results (events + routed damage + entity facts), and the
// chain tests replay the same seed twice and demand identical outcomes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { bombs } from '../src/systems/bombs.js';
import { BOMB_DEFS, BOMB_DRIFT } from '../src/data/bombs.js';
import { mines, mineCorridorLayout, MINE_CORRIDOR_COUNT, MINE_CORRIDOR_FLANK_WU, MINE_TRIGGER_RADIUS } from '../src/systems/mines.js';
import { fields } from '../src/systems/fields.js';

const DT = 1 / 60;

/** One shared world for the bombs + mines owners, seeded like test/bombs.test.mjs. */
function bootOrdnance() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const bus = createBus();
  const events = { detonated: [], primed: [], triggered: [], placed: [], denied: [], cycle: [], charges: [], dropped: [] };
  bus.on('bombs:detonated', (p) => events.detonated.push(p));
  bus.on('bombs:primed', (p) => events.primed.push(p));
  bus.on('bombs:denied', (p) => events.denied.push(p));
  bus.on('bombs:cycle', (p) => events.cycle.push(p));
  bus.on('bombs:dropped', (p) => events.dropped.push(p));
  bus.on('mines:triggered', (p) => events.triggered.push(p));
  bus.on('mines:placed', (p) => events.placed.push(p));
  bus.on('economy:chargeCredits', (p) => events.charges.push(p));
  const impulses = [];
  const damage = [];
  let nextId = 50;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    routeCombatDamage(req) { damage.push(req); return { ok: true }; },
    combatPhysics: {
      applyImpulse(req) { impulses.push(req); return true; },
    },
  };
  const bombsSys = Object.create(bombs);
  bombsSys.init({ state, bus, helpers });
  const minesSys = Object.create(mines);
  minesSys.init({ state, bus, helpers });
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  return {
    state, bus, bombsSys, minesSys, player, helpers, events, impulses, damage,
    spawnShip(id, x, z, { team = 1, hull = 80, radius = 6 } = {}) {
      const ship = {
        id, type: 'ship', alive: true, team, mass: 32, radius, rot: 0,
        pos: { x, z }, vel: { x: 0, z: 0 }, hull, hullMax: hull,
        shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, cap: 40, capMax: 40, capRegen: 6,
      };
      state.entities.set(id, ship);
      state.entityList.push(ship);
      return ship;
    },
    /** A drift bomb exactly as bombs.drop authors it, at a chosen spot, optionally armed. */
    spawnBomb(id, x, z, { ownerId = 1, team = 0, armed = true, payloadId = 'bomb_frag' } = {}) {
      const now = state.simTime;
      const def = BOMB_DEFS[payloadId];
      const bomb = helpers.spawnEntity({
        id, // honoured: spawnEntity spreads the spec over its auto-counter
        type: 'bomb', pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
        radius: 4.2, mass: 2, collides: true, physicsBody: false,
        team, ownerId,
        data: {
          kind: 'bomb', bombId: def.id, ownerId, phase: 'drift', armed,
          // The drop law's arming clock (bombs.js drop): an unarmed capsule arms at
          // now + armS, so command detonation and sympathetic chains cannot cook it off early.
          armedAt: now + (armed ? 0 : BOMB_DRIFT.armS), detonateAt: now + def.fuzeS,
          spawnedAt: now, fieldStartedAt: 0, fieldEndsAt: 0, nextFieldTick: 0,
          triggered: false, spinRadS: 0, sectorId: null, visualRadius: 1.4, retired: false,
        },
      });
      return bomb;
    },
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        state.simTime += DT;
        state.tick += 1;
        minesSys.update(DT, state);
        bombsSys.update(DT, state);
      }
    },
  };
}

// ── SF-042: chain-reaction causality ─────────────────────────────────────────

function chainSequence(t) {
  return t.events.detonated.map((d) => ({
    bombId: d.bombId, trigger: d.trigger, chainFrom: d.chainFrom, ownerId: d.ownerId,
    resolveTick: t.state.tick,
  }));
}

test('one blast primes every armed bomb in reach through the stable id order, once each', () => {
  const t = bootOrdnance();
  try {
    const centre = t.spawnBomb(10, 0, 0);
    // The ring is ENEMY-owned: commandDetonate is owner-scoped (bombs.js commandDetonate), so
    // the player's command primes only the centre and the chain is the ring's only prime path.
    // Spawned OUT of id order (9, 7, 8): the prime order below proves id-sorting, not spawn luck.
    const ring = [
      t.spawnBomb(9, 0, 60, { ownerId: 2, team: 1 }),
      t.spawnBomb(7, 60, 0, { ownerId: 2, team: 1 }),
      t.spawnBomb(8, -60, 0, { ownerId: 2, team: 1 }),
    ];
    // Arm clock: drop law gives 0.5 s; the fixture spawns armed already.
    t.tick(1); // collect
    centre.data.armed = true;
    for (const b of ring) assert.equal(b.data.armed, true);
    // Command-detonate only the centre: the warning resolves, the blast primes the ring.
    t.bombsSys.commandDetonate(t.player.id, t.state);
    const chainPrimes = () => t.events.primed.filter((p) => p.trigger === 'chain');
    assert.equal(chainPrimes().length, 0, 'no sympathetic prime before the blast');
    assert.equal(t.events.primed[0].trigger, 'command', 'the centre itself primes by command');
    t.tick(20); // ~0.33 s: warning (0.18 s) resolves, blast lands, ring primes
    assert.deepEqual(chainPrimes().map((p) => p.bombId), [7, 8, 9],
      'sympathetic primes follow the stable id-sorted order, not list luck');
    assert.ok(chainPrimes().every((p) => p.chainFrom === centre.id));
    t.tick(30); // the ring resolves its own warnings
    const seq = t.events.detonated;
    assert.equal(seq.length, 4, 'four bombs, four terminal events — no double detonation');
    assert.equal(seq[0].bombId, centre.id);
    assert.equal(seq[0].chainFrom, null, 'the origin blast has no immediate cause');
    const ringSeq = seq.slice(1);
    assert.deepEqual(ringSeq.map((d) => d.bombId), [7, 8, 9], 'ring resolves in the same stable order');
    assert.ok(ringSeq.every((d) => d.trigger === 'chain' && d.chainFrom === centre.id),
      'each chain detonation names its immediate cause');
    assert.ok(ringSeq.every((d) => d.ownerId === 2),
      'the chain keeps each bomb\'s ORIGINAL owner (the enemy laid them), not the origin\'s');
  } finally {
    t.bus.clear();
  }
});

test('the chain replays byte-identically on the same seed (ring in one tick)', () => {
  const run = () => {
    const t = bootOrdnance();
    try {
      const centre = t.spawnBomb(10, 0, 0);
      // Two opposing owners in the ring: commandDetonate is owner-scoped, so the WHOLE ring
      // must be enemy-owned for the chain to be the only prime path. Ownership never gates
      // sympathetic detonation, and each detonation still bills its ORIGINAL owner.
      const ring = [
        t.spawnBomb(7, 60, 0, { ownerId: 2, team: 1 }),
        t.spawnBomb(8, -60, 0, { ownerId: 2, team: 1 }),
        t.spawnBomb(9, 0, 60, { ownerId: 2, team: 1 }),
      ];
      t.tick(1);
      t.bombsSys.commandDetonate(t.player.id, t.state);
      t.tick(60);
      return {
        detonations: t.events.detonated.map((d) => ({
          bombId: d.bombId, trigger: d.trigger, chainFrom: d.chainFrom, ownerId: d.ownerId,
          tick: d.ownerId === 2 ? t.damage.filter((r) => r.attackerId === 2).length : undefined,
        })),
        primedOrder: t.events.primed.map((p) => p.bombId),
        ownerTwoDamage: t.damage.filter((r) => r.attackerId === 2 && r.origin?.kind === 'bomb').length,
      };
    } finally {
      t.bus.clear();
    }
  };
  const a = run();
  const b = run();
  assert.deepEqual(b, a, 'same seed, same world, same chain — including owner-attributed damage');
  assert.equal(a.detonations.length, 4);
  assert.equal(a.ownerTwoDamage > 0, true, 'the enemy-owned ring bomb bills its own owner');
});

test('an unarmed capsule is never cooked off by a blast (arming law preserved)', () => {
  const t = bootOrdnance();
  try {
    const centre = t.spawnBomb(10, 0, 0);
    // 70 wu out: outside the frag contact ring (trigger 44 + player 6 = 50) the unarmed capsule
    // would cross once its own arming clock (0.5 s) runs out mid-test, yet inside the frag
    // radius (96) — the chain reaches it and must skip it on the armed law alone.
    const cold = t.spawnBomb(11, 70, 0, { armed: false });
    // ...and a payload destroyed before arming is gone for every path: command, chain, fuze.
    const shotDown = t.spawnBomb(12, 40, 0);
    shotDown.alive = false;
    t.tick(1);
    t.bombsSys.commandDetonate(t.player.id, t.state);
    t.tick(40);
    assert.equal(cold.alive, true, 'the unarmed capsule survives the blast');
    assert.equal(cold.data.phase, 'drift');
    assert.equal(cold.data.triggered, false);
    assert.ok(t.events.detonated.some((d) => d.bombId === centre.id));
    assert.ok(!t.events.detonated.some((d) => d.bombId === shotDown.id),
      'a payload destroyed before arming never reaches a terminal transition');
    assert.equal(t.events.detonated.length, 1, 'only the armed origin detonates');
  } finally {
    t.bus.clear();
  }
});

// ── SF-041: the corridor and displaced mines ─────────────────────────────────

test('the corridor law lays an overlapping wall on one flank and leaves the opposite flank open', () => {
  const from = { x: 0, z: 0 };
  const to = { x: 400, z: 0 }; // approach along +x; the perpendicular flank is +z
  const a = mineCorridorLayout(from, to);
  assert.equal(a.length, MINE_CORRIDOR_COUNT);
  assert.deepEqual(mineCorridorLayout(from, to), a, 'pure geometry: same endpoints, same fence');
  const laterals = a.map((p) => p.z);
  assert.ok(laterals.every((z) => z > 0), 'every hull hugs the SAME flank');
  assert.ok(Math.abs(laterals[0] - MINE_CORRIDOR_FLANK_WU) < 1e-9,
    'the first disc (trigger 55) just kisses the approach line at 56 wu');
  assert.ok(Math.min(...laterals) - MINE_TRIGGER_RADIUS > 0,
    'the opposite flank is a readable safe lane: no trigger disc crosses the centreline');
  for (let i = 1; i < a.length; i++) {
    const gap = Math.hypot(a[i].x - a[i - 1].x, a[i].z - a[i - 1].z);
    assert.ok(gap < MINE_TRIGGER_RADIUS * 2, 'hugged flank overlaps into a wall, not a sieve');
  }
});

test('a blast shoves a placed mine without arming, triggering, or damaging it', () => {
  const t = bootOrdnance();
  try {
    const jackal = t.spawnShip(2, 400, 0, { team: 1 });
    // 80 wu out: beyond the trigger ring (55) of the player at the origin, so the fence stays
    // live until the blast, yet inside the frag radius (96) so the blast reaches it.
    const mine = t.minesSys.placeMine({ ownerId: jackal.id, pos: { x: 80, z: 0 }, team: 1, armDelayS: 0, telegraph: false });
    assert.ok(mine, 'mine placed');
    const centre = t.spawnBomb(10, 0, 0);
    t.tick(1);
    centre.data.armed = true;
    t.bombsSys.commandDetonate(t.player.id, t.state);
    t.tick(20);
    const shove = t.impulses.find((r) => r.entityId === mine.id);
    assert.ok(shove, 'the blast reached the mine as a physical impulse (old behavior: nothing)');
    assert.equal(mine.alive, true, 'displacement is not destruction');
    assert.equal(mine.data.triggered, false, 'a blast never trips the mine trigger');
    assert.equal(mine.hull, mine.hullMax, 'a blast never damages the mine hull');
    assert.equal(mine.data.ownerId, jackal.id, 'displaced mine retains its owner');
    assert.equal(mine.data.armed, true, 'displaced mine keeps its arm state');
  } finally {
    t.bus.clear();
  }
});

test('a displaced mine keeps its fuse and target eligibility and triggers on the enemy', () => {
  const t = bootOrdnance();
  try {
    const jackal = t.spawnShip(2, 400, 0, { team: 1 });
    // The escort is a THIRD party (team 2): a mine never trips on its own team (mines.js
    // _findTriggerVictim), so a team-1 escort could only ever be passed over. Seeded at 150 wu
    // — beyond every trigger ring at rest — then displaced next to the escort.
    const escort = t.spawnShip(3, 500, 0, { team: 2 });
    const mine = t.minesSys.placeMine({ ownerId: jackal.id, pos: { x: 150, z: 0 }, team: 1, armDelayS: 0, telegraph: false });
    t.tick(1);
    // Displace it (any force — here the recorded law is the position change) next to the escort.
    mine.pos.x = escort.pos.x - 30;
    mine.pos.z = 0;
    t.tick(3);
    assert.equal(t.events.triggered.length, 1, 'the displaced mine triggers on the hostile');
    assert.equal(t.events.triggered[0].ownerId, jackal.id, 'the trigger still names its layer');
    assert.equal(t.events.triggered[0].targetId, escort.id);
    assert.equal(mine.alive, false, 'one terminal transition');
    assert.ok(t.damage.some((r) => r.attackerId === jackal.id && r.targetId === escort.id),
      'the blast routes with the original owner attribution');
  } finally {
    t.bus.clear();
  }
});

test('the field loose-body family now collects placed mines (Repulsor can move the fence)', () => {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const bus = createBus();
  const helpers = { spawnEntity: null, queryRadius: null };
  const fieldsSys = Object.create(fields);
  fieldsSys.init({ state, bus, helpers, registry: { get: () => null } });
  const mine = {
    id: 9, type: 'mine', alive: true, team: 1, radius: 6,
    pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 },
    physicsBody: { schemaVersion: 1, radius: 6, mass: 8, inertiaY: 20, dynamic: true, ccd: true, material: 'projectile', revision: 0 },
    data: { kind: 'mine', mine: true, ownerId: 2, armed: true },
  };
  state.entities.set(9, mine);
  state.entityList.push(mine);
  const out = [];
  fieldsSys._collectFieldCandidates(
    { center: { x: 10, z: 0 }, radius: 60, kind: 'repulsor', ownerId: 1 },
    state, out,
  );
  assert.ok(out.some((e) => e.id === 9 && e.type === 'mine'),
    'the fence is inside the field candidate set (old behavior: mines skipped)');
  fieldsSys.destroy?.();
  bus.clear();
});

test('the wake seed consumes the corridor law (authoring bound)', () => {
  const source = readFileSync(new URL('../src/systems/encounterScripts.js', import.meta.url), 'utf8');
  assert.match(source, /mineCorridorLayout\(jackal\.pos, player\.pos/,
    'the minefield_wake spring lays the flank fence through the shared corridor law');
  assert.doesNotMatch(source, /\(\(i % 2\) === 0 \? -1 : 1\) \* 28/,
    'the old staggered wake wall is gone');
});

// ── SF-043: ammunition decisions at the commit boundary ──────────────────────

function bootRack() {
  const t = bootOrdnance();
  const rt = t.state.bombs;
  rt.rack.cells[0] = { id: 'bomb_frag', count: BOMB_DEFS.bomb_frag.magazine };
  rt.rack.cells[1] = null;
  rt.stock = { bomb_frag: 4, bomb_concussion: 4 };
  rt.selectedId = 'bomb_frag';
  return t;
}

test('a dry rack refuses the drop without consuming cooldown or moving the selection', () => {
  const t = bootRack();
  try {
    const rt = t.state.bombs;
    rt.rack.cells[0] = { id: 'bomb_frag', count: 0 };
    rt.rack.cells[1] = null;
    rt.selectedId = null;
    const cooldownBefore = rt.cooldownUntil;
    t.state.input.actions = { dropBomb: true };
    t.tick(1);
    assert.equal(t.events.dropped.length, 0, 'nothing released');
    assert.equal(rt.cooldownUntil, cooldownBefore, 'a refusal never buys the release latch');
    assert.deepEqual(rt.cooldowns, {}, 'no per-payload cooldown was written either');
    assert.equal(rt.selectedId, null, 'the selection stays put on a refusal');
    assert.ok(t.events.denied.length === 0, 'the dry bay answers on the press path, not a fake denial');
  } finally {
    t.bus.clear();
  }
});

test('counts and costs reconcile exactly across buy, fit, drop, and depleted advance', () => {
  const t = bootRack();
  try {
    const rt = t.state.bombs;
    // Buy: the economy receipt is exact (price × units), stock climbs by the same units.
    const before = t.events.charges.length;
    t.playerCreditsProxy = undefined;
    t.state.player.credits = 100000;
    assert.equal(t.bombsSys.buyPayload({ payloadId: 'bomb_concussion', units: 2 }), true);
    const charge = t.events.charges[t.events.charges.length - 1];
    assert.equal(charge.amount, BOMB_DEFS.bomb_concussion.price * 2);
    assert.equal(rt.stock.bomb_concussion, 6);

    // Fit socket 2 from stock, drop the whole frag magazine: every drop decrements exactly once.
    assert.equal(t.bombsSys.fitPayload({ socketIndex: 1, payloadId: 'bomb_concussion' }), true);
    assert.equal(rt.rack.cells[1].count, BOMB_DEFS.bomb_concussion.magazine);
    assert.equal(rt.stock.bomb_concussion, 2, 'fitting moves units out of the hangar, never duplicates them');
    const beforeCharges = t.events.charges.length;

    t.state.player.credits = 100000;
    for (let i = 0; i < BOMB_DEFS.bomb_frag.magazine + 1; i++) {
      t.state.input.actions = { dropBomb: true };
      t.tick(1);
      t.state.simTime += 5; // clear the shared release latch between presses
    }
    // The magazine+1-th press is the depleted advance: the bay moves to the loaded concussion
    // socket and releases THAT payload, so the raw event count exceeds the frag magazine by one.
    // The exact reconciliation counts frag units only.
    const fragDrops = t.events.dropped.filter((d) => d.payloadId === 'bomb_frag').length;
    assert.equal(fragDrops, BOMB_DEFS.bomb_frag.magazine, 'exactly the loaded frag units leave the bay');
    const fragCell = rt.rack.cells.find((c) => c && c.id === 'bomb_frag');
    assert.equal(fragCell.count, 0, 'the frag cell is dry, its socket keeps the fit');
    assert.equal(rt.selectedId, 'bomb_concussion', 'the bay announced its advance to the loaded socket');
    assert.ok(t.events.cycle.some((c) => c.reason === 'depleted' && c.payloadId === 'bomb_concussion'),
      'the depleted advance was announced, not silent');
    assert.equal(t.events.charges.length, beforeCharges, 'drops cost no credits — ordnance is pre-paid');
  } finally {
    t.bus.clear();
  }
});

test('two different payload mixes both solve the corridor physics (route solvability)', () => {
  // Mix A: the concussion drum shoves the whole fence off the lane (displacement solution).
  const mixA = bootOrdnance();
  try {
    const jackal = mixA.spawnShip(2, 400, 0, { team: 1 });
    const fence = mineCorridorLayout({ x: 0, z: 0 }, { x: 400, z: 0 })
      .map((pos, i) => mixA.minesSys.placeMine({ ownerId: jackal.id, pos, team: 1, armDelayS: 0, telegraph: i === 0 }));
    mixA.tick(1);
    // Drum seeded at the fence centroid: all three hulls sit within one concussion radius
    // (130 wu) — the single-blast displacement solution. At the old (0, 30) only the first
    // hull was in reach, which is a placement error, not a law.
    const drum = mixA.spawnBomb(10, 150, 102, { payloadId: 'bomb_concussion' });
    drum.data.armed = true;
    mixA.bombsSys.commandDetonate(mixA.player.id, mixA.state);
    mixA.tick(20);
    const shoved = fence.filter((m) => mixA.impulses.some((r) => r.entityId === m.id));
    assert.equal(shoved.length, fence.length, 'mix A: the drum displaces every hull of the fence');
    assert.ok(fence.every((m) => m.alive && !m.data.triggered), 'displaced, not spent: the fence stays live terrain');
  } finally {
    mixA.bus.clear();
  }
  // Mix B: no ordnance at the fence at all — the safe lane is threadable by flight alone
  // (the geometry test above proves no trigger disc crosses the centreline).
  const laneY = 0;
  const fenceLine = mineCorridorLayout({ x: 0, z: 0 }, { x: 400, z: 0 });
  const minClearance = Math.min(...fenceLine.map((p) => Math.abs(p.z - laneY))) - MINE_TRIGGER_RADIUS;
  assert.ok(minClearance >= 0, 'mix B: the open flank threads at zero ordnance cost');
});
