// SWARM-06 — the veteran band: from Zone 5 a seeded share of affixed hulls carry a second,
// always-distinct affix. Two behaviors on one marked body — never a bigger hull, never a
// hotter gun. The harness drives the real stamp path the way the wave planner's bodies do.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  SWARM_AFFIXES,
  SWARM_AFFIX_BY_ID,
  SWARM_AFFIX_VETERAN_FROM_WAVE,
  swarmAffixVeteranFor,
  swarmAffixVeteranPct,
  validateSwarmThreats,
} from '../src/data/swarmThreats.js';
import { swarmElites } from '../src/systems/swarmElites.js';

const SWARM = 'swarm';
const ARENA = 'helios_core';
const DT = 1 / 60;

function harness({ seed = 73311, threats = [], wave = 45 } = {}) {
  const state = createGameState(seed);
  state.run = {
    // validateRunState holds the closed-key contract — spread the real shape, never hand-roll it.
    ...createRunState({ kind: 'survival', ruleset: SWARM, seed }),
    phase: 'active',
    wave,
    arenaId: ARENA,
    telemetry: { threats: threats.slice() },
  };
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const spawned = [];
  const routed = [];
  const ctx = {
    state, bus,
    helpers: {
      spawnBudget: { request: (n) => n, bindEntity: () => true, releaseSome: () => {} },
      spawnEntity: (spec) => { const e = { ...spec, id: `s${spawned.length}` }; spawned.push(e); return e; },
      routeCombatDamage: (req) => { routed.push(req); },
    },
    registry: { get: () => null },
  };
  swarmElites.init(ctx);
  return { state, bus, emitted, spawned, routed };
}

function body(id, wave, { champion = true, role = 'fodder', x = 0, z = 0 } = {}) {
  return {
    id, alive: true, pos: { x, z }, type: 'ship',
    hull: 100, hullMax: 100, armor: 0, armorMax: 0,
    shield: 0, shieldMax: 0,
    maxSpeed: 60, combatSpeed: 50, thrust: 40,
    data: { runCohort: 'survival', runWave: wave, runRole: role, swarmChampion: champion },
  };
}

function stampChampions(h, count, wave) {
  const bodies = [];
  for (let i = 0; i < count; i++) {
    const b = body(1000 + i, wave, { champion: true });
    h.state.entities.set(b.id, b);
    bodies.push(b);
  }
  swarmElites.update(DT, h.state);
  return bodies;
}

/** A veteran whose SECOND slot carries `affixId` — scans seeds through the real stamp path. */
function findVeteranSecond(affixId, { maxSeed = 60, wave = 60, per = 48 } = {}) {
  for (let seed = 1; seed <= maxSeed; seed++) {
    const h = harness({ seed, wave });
    const bodies = stampChampions(h, per, wave);
    const hit = bodies.find((b) => b.data.swarmAffix2 === affixId);
    if (hit) return { h, body: hit };
  }
  return null;
}

/** Drop every entity but the keepers so an aura/kill read isolates the one body under test. */
function isolate(h, ...keep) {
  const ids = new Set(keep.map((e) => e.id));
  for (const key of [...h.state.entities.keys()]) {
    if (!ids.has(key)) h.state.entities.delete(key);
  }
}

/* ---- the law --------------------------------------------------------------- */

test('the veteran band is a bounded climb that opens at Zone 5', () => {
  assert.equal(validateSwarmThreats().ok, true, validateSwarmThreats().issues.join('; '));
  assert.equal(SWARM_AFFIX_VETERAN_FROM_WAVE, 41);
  assert.equal(swarmAffixVeteranPct(40), 0, 'below the gate the band is shut');
  assert.equal(swarmAffixVeteranPct(41), 20);
  assert.equal(swarmAffixVeteranPct(50), 29);
  assert.equal(swarmAffixVeteranPct(61), 40, 'the climb stops at the cap');
  assert.equal(swarmAffixVeteranPct(200), 40, 'and never passes it');
  assert.equal(swarmAffixVeteranPct('nope'), 0);
});

test('the pair law never doubles a trick and reaches every partner', () => {
  for (const a of SWARM_AFFIXES) {
    const seen = new Set();
    for (let hash = 0; hash < 240; hash++) {
      const second = swarmAffixVeteranFor(hash, a.id);
      assert.notEqual(second, a.id, 'no double-shielded, ever');
      assert.ok(SWARM_AFFIX_BY_ID[second]);
      seen.add(second);
    }
    assert.equal(seen.size, SWARM_AFFIXES.length - 1, 'every partner is reachable');
  }
  assert.equal(swarmAffixVeteranFor(3, 'bogus'), null);
  assert.equal(swarmAffixVeteranFor(-1, 'shielded'), null);
  assert.equal(swarmAffixVeteranFor(1.5, 'shielded'), null);
});

/* ---- (a) pre-band waves are byte-identical ---------------------------------- */

test('pre-band waves stamp byte-identical: same seed, same single affix, never a second', () => {
  for (const wave of [21, 30, 40]) {
    // swarmElites is a singleton — stamp each harness before the next init steals it.
    const a = harness({ seed: 73311, wave });
    const bodiesA = stampChampions(a, 30, wave);
    const b = harness({ seed: 73311, wave });
    const bodiesB = stampChampions(b, 30, wave);
    for (let i = 0; i < bodiesA.length; i++) {
      assert.equal(bodiesA[i].data.swarmAffix, bodiesB[i].data.swarmAffix, `w${wave} body ${i}`);
      assert.equal(bodiesA[i].data.swarmAffixWave, bodiesB[i].data.swarmAffixWave);
      assert.equal(bodiesA[i].data.swarmAffix2, undefined, `wave ${wave} stays pre-band`);
      assert.ok(SWARM_AFFIX_BY_ID[bodiesA[i].data.swarmAffix], 'every champion carries one trick');
    }
    const affixEvents = (h) => h.emitted
      .filter((e) => e.event === 'swarm:affix')
      .map((e) => [e.payload.id, e.payload.affix, e.payload.wave]);
    assert.deepEqual(affixEvents(a), affixEvents(b), 'the receipt stream repeats exactly');
    for (const e of a.emitted.filter((x) => x.event === 'swarm:affix')) {
      assert.equal(e.payload.veteran, false);
      assert.equal(e.payload.affix2, null);
      assert.deepEqual(e.payload.affixes, [e.payload.affix]);
    }
  }
});

/* ---- (b) band waves: a seeded subset carries two DISTINCT affixes ------------ */

test('band waves mark a seeded minority with two distinct, deterministic affixes', () => {
  const h = harness({ seed: 73311, wave: 50 });
  const bodies = stampChampions(h, 60, 50);
  const veterans = bodies.filter((b) => b.data.swarmAffix2 != null);
  assert.ok(veterans.length > 0, 'the band yields veterans');
  assert.ok(veterans.length < bodies.length, 'a marked minority, never the whole room');
  for (const v of veterans) {
    assert.ok(SWARM_AFFIX_BY_ID[v.data.swarmAffix]);
    assert.ok(SWARM_AFFIX_BY_ID[v.data.swarmAffix2]);
    assert.notEqual(v.data.swarmAffix, v.data.swarmAffix2, 'the pair is always distinct');
  }
  // The stamp event tells presentation the whole story: both names, the veteran flag.
  const vetEvent = h.emitted.find((e) => e.event === 'swarm:affix' && e.payload.veteran === true);
  assert.ok(vetEvent, 'a veteran stamp emits the two-affix receipt');
  assert.equal(vetEvent.payload.affixes.length, 2);
  assert.equal(vetEvent.payload.affixes[0], vetEvent.payload.affix);
  assert.equal(vetEvent.payload.affixes[1], vetEvent.payload.affix2);
  assert.ok(vetEvent.payload.name2, 'the second name travels for any readout');
  // Determinism: the same seed stamps the same veterans every replay.
  const again = harness({ seed: 73311, wave: 50 });
  const bodies2 = stampChampions(again, 60, 50);
  assert.deepEqual(
    bodies2.map((b) => [b.data.swarmAffix, b.data.swarmAffix2 ?? null]),
    bodies.map((b) => [b.data.swarmAffix, b.data.swarmAffix2 ?? null]),
    'same seed + wave + ordinal → same pair',
  );
});

/* ---- (b) both slots are mechanically live — every affix in the second slot --- */

test('a second-slot shielded still lands the bubble; a second-slot hasted still lands the legs', () => {
  const shielded = findVeteranSecond('shielded');
  assert.ok(shielded, 'a shielded-second veteran exists under some seed');
  assert.equal(shielded.body.shieldMax, 70, 'the authored bubble — flat, not a multiplier');
  assert.equal(shielded.body.shield, 70);
  const hasted = findVeteranSecond('hasted');
  assert.ok(hasted, 'a hasted-second veteran exists under some seed');
  assert.ok(Math.abs(hasted.body.maxSpeed - 60 * 1.33) < 0.001, 'the legs run a third hotter');
  assert.ok(Math.abs(hasted.body.combatSpeed - 50 * 1.33) < 0.001);
});

test('a second-slot volatile still detonates; a second-slot splitter still bursts', () => {
  const vol = findVeteranSecond('volatile');
  assert.ok(vol, 'a volatile-second veteran exists under some seed');
  vol.h.bus.emit('entity:killed', { id: vol.body.id, killerId: 'raider-9' });
  const blast = vol.h.emitted.find((e) => e.event === 'charge:detonated' && e.payload.trigger === 'volatile');
  assert.ok(blast, 'the kill receipt fires the second trick');
  assert.equal(blast.payload.hostId, vol.body.id);

  const spl = findVeteranSecond('splitter');
  assert.ok(spl, 'a splitter-second veteran exists under some seed');
  spl.h.bus.emit('entity:killed', { id: spl.body.id, killerId: 'raider-9' });
  const wasps = spl.h.spawned.filter((s) => s.data && s.data.swarmSplit === true);
  assert.equal(wasps.length, 2, 'the burst still pays two wasps');
  for (const w of wasps) assert.equal(w.data.runWave, 60);
});

test('second-slot auras still run: a magnet drags chips, a commander feeds shields', () => {
  const mag = findVeteranSecond('magnetic');
  assert.ok(mag, 'a magnetic-second veteran exists under some seed');
  const chip = { id: 'chip-1', alive: true, type: 'pickup', pos: { x: 60, z: 0 }, data: { wallet: 'run' } };
  mag.h.state.entities.set(chip.id, chip);
  isolate(mag.h, mag.body, chip);
  for (let i = 0; i < 30; i++) swarmElites.update(DT, mag.h.state);
  const dist = Math.hypot(chip.pos.x - mag.body.pos.x, chip.pos.z - mag.body.pos.z);
  assert.ok(dist < 60, 'the second-slot magnet still drags the chip');

  const com = findVeteranSecond('commander');
  assert.ok(com, 'a commander-second veteran exists under some seed');
  const ally = body('ally-1', 60, { champion: false, role: 'fodder', x: 50, z: 0 });
  com.h.state.entities.set(ally.id, ally);
  isolate(com.h, com.body, ally);
  for (let i = 0; i < 10; i++) swarmElites.update(DT, com.h.state);
  assert.ok(ally.shield > 0, 'the second-slot commander still feeds nearby hulls');
  assert.equal(ally.data.swarmCommanderShield, true);
});

test('both halves of a veteran pair are live on the same body', () => {
  // Find any veteran; assert each member's mechanical signature landed on that one hull.
  const found = findVeteranSecond('hasted', { wave: 60 });
  assert.ok(found);
  const { body: v, h } = found;
  assert.ok(Math.abs(v.maxSpeed - 60 * 1.33) < 0.001, 'the second trick applied');
  const primary = v.data.swarmAffix;
  if (primary === 'shielded') assert.equal(v.shieldMax, 70);
  if (primary === 'volatile' || primary === 'splitter') {
    h.bus.emit('entity:killed', { id: v.id, killerId: 'raider-9' });
    if (primary === 'volatile') {
      assert.ok(h.emitted.some((e) => e.event === 'charge:detonated' && e.payload.trigger === 'volatile'));
    } else {
      assert.equal(h.spawned.filter((s) => s.data && s.data.swarmSplit === true).length, 2);
    }
  }
});

/* ---- (c) no affix ever doubles itself on a stamped body --------------------- */

test('no stamped body ever carries the same trick twice', () => {
  for (const seed of [73311, 5, 42, 909]) {
    for (const wave of [41, 50, 60]) {
      const h = harness({ seed, wave });
      const bodies = stampChampions(h, 40, wave);
      for (const b of bodies) {
        if (b.data.swarmAffix2 == null) continue;
        assert.notEqual(b.data.swarmAffix, b.data.swarmAffix2, `seed ${seed} w${wave}`);
      }
    }
  }
});

/* ---- (d) champion/boss eligibility unchanged -------------------------------- */

test('eligibility is unchanged: champions and elite-role only, fodder never', () => {
  const h = harness({ seed: 99, wave: 50 });
  const champ = body(1, 50, { champion: true, role: 'fodder' });
  const elite = body(2, 50, { champion: false, role: 'elite' });
  const fodder = body(3, 50, { champion: false, role: 'fodder' });
  for (const b of [champ, elite, fodder]) h.state.entities.set(b.id, b);
  swarmElites.update(DT, h.state);
  assert.ok(champ.data.swarmAffix, 'the champion is still marked');
  assert.ok(elite.data.swarmAffix, 'the elite-role body is still marked');
  assert.equal(fodder.data.swarmAffix, undefined, 'chaff stays clean at any wave');
  assert.equal(fodder.data.swarmAffix2, undefined);
  // A zone-4 boss wave stays single-affix — the band opens at 41, not before.
  const h2 = harness({ seed: 99, wave: 40 });
  const boss = body(9, 40, { champion: true });
  h2.state.entities.set(9, boss);
  swarmElites.update(DT, h2.state);
  assert.ok(boss.data.swarmAffix);
  assert.equal(boss.data.swarmAffix2, undefined, 'the zone-4 boss keeps one trick');
});

/* ---- (e) two behaviors, never bigger numbers --------------------------------- */

test('veterans carry a second behavior, never a bigger hull, shield mult, or gun', () => {
  const h = harness({ seed: 73311, wave: 55 });
  const bodies = stampChampions(h, 80, 55);
  const veterans = bodies.filter((b) => b.data.swarmAffix2 != null);
  assert.ok(veterans.length > 0, 'veterans exist at wave 55');
  const plain = bodies.filter((b) => b.data.swarmAffix2 == null);
  assert.ok(plain.length > 0, 'the room still fields single-affix hulls');
  for (const v of veterans) {
    assert.equal(v.hullMax, 100, 'no hull inflation');
    assert.equal(v.hull, 100);
    assert.equal(v.armorMax, 0, 'no armor inflation');
    const pair = [v.data.swarmAffix, v.data.swarmAffix2];
    if (pair.includes('shielded')) {
      assert.equal(v.shieldMax, 70, 'the authored bubble, never a multiplier');
    } else {
      assert.equal(v.shieldMax, 0, 'no shield the affix did not author');
    }
    const hasteCount = pair.filter((a) => a === 'hasted').length;
    assert.ok(hasteCount <= 1, 'distinct — haste can never stack');
    assert.ok(Math.abs(v.maxSpeed - 60 * Math.pow(1.33, hasteCount)) < 0.001);
    // Same numbers as a same-spec single-affix hull in the same room.
    assert.equal(v.hullMax, plain[0].hullMax);
  }
});

/* ---- the wager interplay ----------------------------------------------------- */

test('armoured_elites buys early affixes but never early veterans', () => {
  const early = harness({ seed: 73311, threats: ['armoured_elites'], wave: 5 });
  const earlyBodies = stampChampions(early, 30, 5);
  for (const b of earlyBodies) {
    assert.ok(b.data.swarmAffix, 'the wager still brings the vocabulary early');
    assert.equal(b.data.swarmAffix2, undefined, 'the band still waits for deep waves');
    assert.equal(b.hullMax, 150, 'the plating leg is unchanged');
  }
  const late = harness({ seed: 73311, threats: ['armoured_elites'], wave: 55 });
  const lateBodies = stampChampions(late, 80, 55);
  const vets = lateBodies.filter((b) => b.data.swarmAffix2 != null);
  assert.ok(vets.length > 0, 'the band still arrives under the wager');
  for (const v of vets) {
    assert.equal(v.hullMax, 150, 'plating is the wager, never the band');
    assert.notEqual(v.data.swarmAffix, v.data.swarmAffix2);
  }
});
