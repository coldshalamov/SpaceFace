// Living-world "people who remember" — persistent-cast memory contracts.
//
// A captain who remembers the player picks a stance from the persisted ledger (hunts when crossed,
// fears when beaten, offers_work when their faction was helped), the stance changes the spawned
// return (tightened window / break-off order / friendly work offer), and voice lines reference the
// actual history. Fixed seeds, headless sim.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { factions } from '../src/systems/factions.js';
import { aceMemory, ACE_MEMORY_VERSION } from '../src/systems/aceMemory.js';
import {
  ACE_BEATS_FEAR_AT,
  ACE_GRUDGE_HUNT_AT,
  ACE_GRUDGE_MAX,
  ACE_LOYALTY_WORK_AT,
  ACE_LOYALTY_MAX,
  aceById,
  factionHistoryFromMemory,
  huntsReturnDelayS,
  rememberedBarkFor,
  stanceForRecord,
} from '../src/data/namedAces.js';
import { BARK_FACTIONS, historyBarkFor } from '../src/data/barks.js';
import {
  CONFLICT_ESCALATION,
  conflictAftermathAnchor,
  conflictPressureForSector,
  escalationForConflict,
} from '../src/data/conflictZones.js';
import { planConflictPresence } from '../src/data/factionPresence.js';

const PAIR = 'faction_reach:faction_scn';
const FRONT = 'sector_helios_prime';

test('stances derive from the persisted ledger with the authored thresholds', () => {
  assert.equal(ACE_MEMORY_VERSION, 2, 'schema stays at the v2 shape; new fields normalize in');

  // Helped enough and never crossed: work, not war.
  assert.equal(stanceForRecord({ loyalty: ACE_LOYALTY_WORK_AT, grudge: 0 }).stance, 'offers_work');
  // Crossed once too often: hunts outranks loyalty ("after all we paid you" cuts both ways).
  assert.equal(stanceForRecord({ loyalty: 9, grudge: ACE_GRUDGE_HUNT_AT }).stance, 'hunts');
  // Beaten twice on a sub-max wing: fear until the crew is heavy enough to try again.
  const beaten = { fled: true, fleeCount: ACE_BEATS_FEAR_AT, returnTier: 1 };
  assert.equal(stanceForRecord(beaten).stance, 'fears');
  // A max-tier wing restores confidence: the final stand, not another flight.
  assert.equal(stanceForRecord({ ...beaten, returnTier: 3 }).stance, 'neutral');
  // Caps hold.
  assert.equal(stanceForRecord({ grudge: 999 }).grudge, ACE_GRUDGE_MAX);
  assert.equal(stanceForRecord({ loyalty: -5 }).loyalty, 0);
});

test('crossed captains return sooner, floored at two minutes', () => {
  assert.equal(huntsReturnDelayS(650, 0), 650);
  assert.ok(huntsReturnDelayS(650, 5) < 650);
  assert.equal(huntsReturnDelayS(650, 99), 120);
  assert.equal(huntsReturnDelayS(0, 0), 120);
});

test('remembered lines name the actual history facts', () => {
  const yara = aceById('ace_yara_no_cut');
  const rec = { grudge: 5, crew: yara.crew };
  const hunt = rememberedBarkFor(yara, rec, { stance: 'hunts' }, 11);
  assert.ok(hunt.includes('Yara No-Cut') && hunt.includes('5'), hunt);
  const offer = rememberedBarkFor(yara, rec, { stance: 'offers_work' }, 11);
  assert.ok(offer.includes('Reach'), offer);
  assert.equal(rememberedBarkFor(yara, rec, { stance: 'neutral' }, 11), '',
    'neutral falls back to the existing taunt path');
});

test('faction history reads empty without memory and facts with it', () => {
  assert.equal(factionHistoryFromMemory(null, 'faction_reach', 'Tessera').hasHistory, false);
  assert.equal(factionHistoryFromMemory({}, 'faction_reach', 'Tessera').hasHistory, false);
  const memory = {
    playerStyle: { factions: { faction_reach: { fling: 1, gun: 3, rock: 0 } } },
    ace_yara_no_cut: { encountered: true, grudge: 4, fleeCount: 1, returnTier: 1 },
  };
  const facts = factionHistoryFromMemory(memory, 'faction_reach', 'Tessera');
  assert.equal(facts.hasHistory, true);
  assert.equal(facts.kills, 4);
  assert.deepEqual(facts.captains.map((row) => row.stance), ['hunts']);
  // Un-encountered captains stay out of the history even with a grudge ledger.
  const quiet = factionHistoryFromMemory({
    playerStyle: { factions: { faction_reach: { fling: 0, gun: 2, rock: 0 } } },
    ace_yara_no_cut: { encountered: false, grudge: 4 },
  }, 'faction_reach', 'Tessera');
  assert.deepEqual(quiet.captains, []);
});

test('history barks always reference a real fact, for every faction', () => {
  const memory = {
    playerStyle: {
      factions: Object.fromEntries(BARK_FACTIONS.map((id) => [id, {
        fling: 0, gun: 7, rock: 0, escalated: null,
      }])),
    },
    ace_yara_no_cut: { encountered: true, grudge: 5, fleeCount: 1, returnTier: 1 },
  };
  for (const factionId of BARK_FACTIONS) {
    for (const seed of [1, 2, 3]) {
      const facts = factionHistoryFromMemory(memory, factionId, 'Tessera');
      const line = historyBarkFor(factionId, facts, seed);
      assert.notEqual(line, '');
      assert.ok(
        line.includes('Tessera') || line.includes('7') || line.includes('Yara No-Cut'),
        `${factionId}: ${line}`,
      );
    }
  }
  assert.equal(historyBarkFor('faction_reach', { hasHistory: false }, 1), '',
    'no history keeps the generic corpus');
});

test('conflict escalation reads the factions-owned record, thresholds stay theirs', () => {
  assert.deepEqual(escalationForConflict(null), { stage: 'cold', ...CONFLICT_ESCALATION.cold });
  assert.equal(escalationForConflict({ state: 'tense' }).pickets, 1);
  const war = escalationForConflict({ state: 'war', tension: 100 });
  assert.equal(war.stage, 'war');
  assert.equal(war.pickets, 2);
  assert.equal(war.escortWing, 3);
  assert.equal(conflictPressureForSector(
    { [PAIR]: { state: 'war' } }, FRONT,
  ), CONFLICT_ESCALATION.war.pressure);
  assert.equal(conflictPressureForSector({}, FRONT), 0);
  const anchor = conflictAftermathAnchor(PAIR, FRONT, 4242);
  assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.z));
  assert.deepEqual(anchor, conflictAftermathAnchor(PAIR, FRONT, 4242), 'anchors are deterministic');
});

test('war garrisons stage for the holder and re-garrison after a flip', () => {
  const conflicts = { [PAIR]: { state: 'war', tension: 100 } };
  const reachGarrison = planConflictPresence({
    sectorId: FRONT, seed: 4242, conflicts, ownerFactionId: 'faction_reach',
  });
  assert.equal(reachGarrison.length, 5, 'two pickets plus a three-ship escort wing');
  assert.ok(reachGarrison.every((plan) => plan.factionId === 'faction_reach'));
  assert.ok(reachGarrison.every((plan) => plan.passive === true), 'garrisons do not start wars');
  assert.ok(reachGarrison.every((plan) => plan.source === 'conflictPresence'));

  const scnGarrison = planConflictPresence({
    sectorId: FRONT, seed: 4242, conflicts, ownerFactionId: 'faction_scn',
  });
  assert.ok(scnGarrison.every((plan) => plan.factionId === 'faction_scn'),
    'a flipped front re-garrisons with the NEW owner');
  assert.ok(scnGarrison.every((plan) => plan.routeId !== reachGarrison[0].routeId
    || plan.factionId !== reachGarrison[0].factionId), 'no spawn-key collision across owners');

  assert.equal(planConflictPresence({
    sectorId: FRONT, seed: 4242, conflicts: { [PAIR]: { state: 'cold', tension: 0 } },
  }).length, 0, 'cold fronts stay quiet');
  assert.equal(planConflictPresence({
    sectorId: FRONT, seed: 4242, conflicts: { [PAIR]: { state: 'tense', tension: 45 } },
  }).length, 1, 'tense fronts stage a single picket');
});

function boot(seed = 90210) {
  const sim = createSimulation({
    seed,
    systems: [factions, aceMemory],
  });
  const state = sim.state;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  state.mode = 'flight';
  state.world.currentSectorId = FRONT;
  return { sim, state, bus: sim.bus, player };
}

const fleeReceipt = (t, text) => t.bus.emit('encounter:receipt', {
  shape: 'named_hunter', outcome: 'escaped', text, t: t.state.simTime,
});

test('a helped-faction captain converts his return into a friendly work offer', () => {
  const t = boot(777);
  const rows = [];
  t.bus.on('aceMemory:workOffered', (payload) => rows.push(payload));
  t.bus.emit('distress:rescued', { factionId: 'faction_dmc' });
  t.bus.emit('distress:rescued', { factionId: 'faction_dmc' });
  fleeReceipt(t, 'Wick Blackwrench breaks off.');
  const rec = t.state.aceMemory.ace_wick_blackwrench;
  assert.equal(rec.loyalty, 4, 'rescues bank loyalty');
  while (t.state.simTime < rec.returnAt + 2) t.sim.step(1);
  assert.equal(rows.length, 1, 'the return arrives as an offer');
  const boss = t.state.entities.get(rows[0].spawnedIds[0]);
  assert.equal(boss.data.ai.passive, true, 'the offer wing is friendly');
  assert.equal(boss.data.ai.roe, 'hold_fire', 'the offer wing holds fire');
  assert.equal(boss.data.aceMemory.workOffer, true);
  assert.equal(rec.stance, 'offers_work');
});

test('a twice-beaten captain returns afraid and his hull breaks off on sight', () => {
  const t = boot(90210);
  fleeReceipt(t, 'Brigga Two-Turn breaks off.');
  fleeReceipt(t, 'Brigga Two-Turn breaks off.');
  const rec = t.state.aceMemory.ace_brigga_two_turn;
  assert.equal(rec.fleeCount, 2);
  assert.equal(rec.grudge, 0, 'no faction blood, no grudge');
  assert.equal(stanceForRecord(rec).stance, 'fears', 'the ledger derives fear at schedule time');
  while (t.state.simTime < rec.returnAt + 2) t.sim.step(1);
  const wing = [...t.state.entities.values()].filter((e) => e.data && e.data.aceMemory
    && e.data.aceMemory.aceId === 'ace_brigga_two_turn');
  const boss = wing.find((e) => e.data.aceMemory.role === 'boss');
  assert.ok(boss, 'the captain returns');
  assert.equal(rec.stance, 'fears', 'the spawn records the stance');
  assert.equal(boss.data.ai.forceFlee, true, 'beaten captains run on sight');
  const escorts = wing.filter((e) => e.data.aceMemory.role === 'escort');
  assert.ok(escorts.every((e) => e.data.ai.forceFlee !== true),
    'the wing still fights; only the captain breaks off');
});

test('a crossed captain returns faster, heavier, and speaking the grudge', () => {
  const t = boot(4242);
  const voice = [];
  t.bus.on('aceMemory:voice', (payload) => voice.push(payload));
  for (let i = 0; i < 12; i++) {
    t.bus.emit('entity:killed', {
      id: 90000 + i, killerId: t.player.id, type: 'ship',
      factionId: 'faction_reach', victimClass: 'hauler', witnessed: true,
      pos: { x: i * 10, z: 0 },
    });
  }
  fleeReceipt(t, 'Yara No-Cut breaks off.');
  const rec = t.state.aceMemory.ace_yara_no_cut;
  assert.equal(stanceForRecord(rec).stance, 'hunts', 'twelve crossed hulls arm the hunt');
  const firstWindow = rec.returnAt - rec.fledAt;
  assert.ok(firstWindow < 360, 'the tightened window beats the 360 s base floor');
  while (t.state.simTime < rec.returnAt + 2) t.sim.step(1);
  const firstWing = [...t.state.entities.values()].filter((e) => e.data && e.data.aceMemory
    && e.data.aceMemory.aceId === 'ace_yara_no_cut');
  assert.ok(firstWing.length >= 3, 'tier-1 wing: boss plus two escorts');
  assert.equal(rec.stance, 'hunts', 'the spawn records the stance');
  fleeReceipt(t, 'Yara No-Cut breaks off.');
  const rec2 = t.state.aceMemory.ace_yara_no_cut;
  assert.equal(rec2.returnTier, 2, 'second flight promotes the wing again');
  assert.ok(rec2.returnAt - rec2.fledAt < 360, 'still hunting on a shortened leash');
  while (t.state.simTime < rec2.returnAt + 2) t.sim.step(1);
  const secondWing = [...t.state.entities.values()].filter((e) => e.data && e.data.aceMemory
    && e.data.aceMemory.aceId === 'ace_yara_no_cut');
  assert.ok(secondWing.length > firstWing.length, 'the wing visibly grows across encounters');
  const lines = voice.filter((row) => String(row.text).includes('Yara'));
  assert.ok(lines.length >= 1, 'the captain speaks on return');
  assert.ok(
    lines.some((row) => row.situation === 'return-hunts'
      || (row.situation === 'style-taunt' && /gunned|flung|threw/.test(row.text))),
    'the return line references the actual history (grudge ledger or kill-style count)',
  );
});

test('ace memory normalizes old saves and round-trips the new ledger', () => {
  const t = boot(47);
  const fork = t.sim.registry.get('aceMemory');
  fork.deserialize({
    schemaVersion: 2,
    news: {},
    activeReturns: {},
    cultureIntros: {},
    planetChallenges: {},
    playerStyle: { counts: { fling: 0, gun: 2, rock: 0 } },
    ace_yara_no_cut: { id: 'ace_yara_no_cut', encountered: true, fled: true, fleeCount: 1 },
  });
  const rec = t.state.aceMemory.ace_yara_no_cut;
  assert.equal(rec.grudge, 0, 'old saves read as un-crossed');
  assert.equal(rec.loyalty, 0, 'old saves read as un-helped');
  assert.equal(rec.stance, null);

  rec.grudge = 6;
  rec.loyalty = 3;
  rec.stance = 'hunts';
  const snapshot = JSON.parse(JSON.stringify(fork.serialize()));
  assert.equal(snapshot.normalized, undefined, 'runtime shape flags never reach the save');
  fork.deserialize(snapshot);
  const reloaded = t.state.aceMemory.ace_yara_no_cut;
  assert.equal(reloaded.grudge, 6);
  assert.equal(reloaded.loyalty, 3);
  assert.equal(reloaded.stance, 'hunts');
  assert.equal(reloaded.returnScheduled, false, 'stale schedule flags stay safe');
});
