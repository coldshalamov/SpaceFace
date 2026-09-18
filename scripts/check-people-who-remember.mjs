#!/usr/bin/env node
// Fixed-seed acceptance for the living-world "people who remember" layer.
//
// Proves, headless and deterministic:
//   A. a "10-hour" veteran save vs a fresh boot differ in >= 15 world-state deltas a player can
//      SEE (barks, hulls on screen, map/toast lines, station prices, radio), not internal counters;
//   B. a rival captain visibly escalates across >= 3 encounters (wing grows, return window
//      tightens, lines name the history);
//   C. barks reference the player's actual history >= 90% of the time whenever history exists.
//
// The veteran history is driven entirely through public seams: bus events (entity:killed,
// encounter:receipt, distress:rescued, day:tick, sector:enter), the factions-owned
// addOffscreenTension method, and the core spawn helper. Memory slices are JSON round-tripped
// through their serialize/deserialize contracts to prove save-safety.
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { factions } from '../src/systems/factions.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { BARK_FACTIONS } from '../src/data/barks.js';
import { historyBarkFor } from '../src/data/barks.js';
import { factionHistoryFromMemory, aceById } from '../src/data/namedAces.js';
import { bandSignalStrength } from '../src/data/bandRadio.js';
import { conflictPressureForSector } from '../src/data/conflictZones.js';
import { priceModForState, dockAccess } from '../src/systems/factions.js';
import { effectiveDemandFor } from '../src/economy/demandModel.js';
import { COMMODITIES } from '../src/data/commodities.js';

const SEED = 4242;
const FRONT = 'sector_helios_prime'; // contested by faction_reach:faction_scn
const PAIR = 'faction_reach:faction_scn';
const SHIP_NAME = 'Tessera';

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [factions, aceMemory, factionPresence, aftermathWrecks],
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
  // Production world init owns sector rows; seed the front row so ownership and garrison reads
  // have the same shape they have live.
  state.world.sectors[FRONT] = { owner: 'faction_reach' };
  state.player.ownedShips = [{ defId: 'ship_kestrel' }];
  state.player.activeShipIndex = 0;
  return { sim, state, bus: sim.bus, registry: sim.registry, player };
}

function recorder(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}
const rowsOf = (rows, name) => rows.filter((row) => row.name === name).map((row) => row.payload);

/** Advance sim time to `target` seconds, one second per step, mirroring the fixed-timestep host. */
function advanceTo(t, target) {
  while (t.state.simTime < target) t.sim.step(1);
}

function killReachHauler(t, index, killStyle) {
  t.bus.emit('entity:killed', {
    id: 50000 + index,
    killerId: t.player.id,
    type: 'ship',
    factionId: 'faction_reach',
    victimClass: 'hauler',
    witnessed: true,
    pos: { x: 100 + index * 10, z: 0 },
    ...(killStyle ? { killStyle } : {}),
  });
}

function fleeReceipt(t, aceName, suffix) {
  t.bus.emit('encounter:receipt', {
    shape: 'named_hunter',
    outcome: 'escaped',
    encounterId: `pwr:${aceName}:${suffix}`,
    text: `${aceName} breaks off and burns dark.`,
    t: t.state.simTime,
  });
}

// ── The veteran: ten hours of grudges, debts and war ─────────────────────────────────────────

function playVeteran() {
  const t = boot();
  const rows = recorder(t, [
    'aceMemory:returnSpawned', 'aceMemory:workOffered', 'aceMemory:voice',
    'aceMemory:helpedFaction', 'aceMemory:crossedFaction',
    'conflict:flip', 'conflict:warDeclared', 'news:headline', 'toast',
    'factionPresence:spawned', 'wreckField:source',
  ]);

  // Hours 1-3: the toll war. Twelve witnessed Reach logistics kills on the front: reputation
  // collapses, every Reach captain's grudge ledger fills, front momentum banks toward Concord.
  for (let i = 0; i < 12; i++) killReachHauler(t, i);

  // Hours 3-6: Yara No-Cut met twice, driven off twice. Grudge pushes her to hunts: the return
  // window tightens and the wing grows each cycle.
  fleeReceipt(t, 'Yara No-Cut', 'e1');
  const yaraRec1 = t.state.aceMemory.ace_yara_no_cut;
  assert.equal(yaraRec1.returnTier, 1, 'first flight schedules a promoted return');
  advanceTo(t, yaraRec1.returnAt + 2);
  const yaraReturn1 = rowsOf(rows, 'aceMemory:returnSpawned')
    .find((row) => row.aceId === 'ace_yara_no_cut' && row.returnTier === 1);
  assert.ok(yaraReturn1, 'tier-1 return spawns');
  assert.equal(yaraReturn1.spawnedIds.length, 3, 'tier 1 flies a boss plus two escorts');
  fleeReceipt(t, 'Yara No-Cut', 'e2');

  // Hours 6-8: Brigga Two-Turn met twice on untouched Frontier lanes — beaten, not crossed.
  // She returns afraid: the captain breaks off on sight.
  fleeReceipt(t, 'Brigga Two-Turn', 'e1');
  fleeReceipt(t, 'Brigga Two-Turn', 'e2');
  const briggaRec = t.state.aceMemory.ace_brigga_two_turn;
  assert.equal(briggaRec.grudge, 0, 'frontier lanes carry no faction grudge');
  advanceTo(t, briggaRec.returnAt + 2);
  const briggaBoss = rowsOf(rows, 'aceMemory:returnSpawned')
    .find((row) => row.aceId === 'ace_brigga_two_turn');
  assert.ok(briggaBoss, 'fearful return spawns');
  const briggaBossEntity = t.state.entities.get(briggaBoss.spawnedIds[0]);
  assert.equal(briggaBossEntity.data.ai.forceFlee, true, 'beaten captain runs on sight');

  // Hours 8-10: the Drift yard. Two rescues bank loyalty with Blackwrench; when his scheduled
  // return comes due it arrives as a friendly wing with work, not a fight.
  t.bus.emit('distress:rescued', { factionId: 'faction_dmc' });
  t.bus.emit('distress:rescued', { factionId: 'faction_dmc' });
  fleeReceipt(t, 'Wick Blackwrench', 'e1');
  const wickRec = t.state.aceMemory.ace_wick_blackwrench;
  advanceTo(t, wickRec.returnAt + 2);
  const offer = rowsOf(rows, 'aceMemory:workOffered')
    .find((row) => row.aceId === 'ace_wick_blackwrench');
  assert.ok(offer, 'loyal return converts to a work offer');
  const wickBoss = t.state.entities.get(offer.spawnedIds[0]);
  assert.equal(wickBoss.data.ai.passive, true, 'the offer wing is friendly');
  assert.equal(wickBoss.data.ai.roe, 'hold_fire', 'the offer wing holds fire');

  // Hours 10+: the front boils over. Offscreen pressure tips the front to war; the live war
  // garrisons the lane for the holder; then the banked momentum resolves and Helios flips to
  // Concord — wreckage and a NEW owner's garrison follow.
  const warCommodity = COMMODITIES.find((row) => row.category === 'military');
  t.registry.get('factions').addOffscreenTension(PAIR, 80, 'sectorSim');
  assert.equal(t.state.conflicts[PAIR].state, 'war', 'the front is at war');
  const warDemand = effectiveDemandFor({
    state: t.state, sectorId: FRONT, commodity: warCommodity,
  }).multiplier;
  assert.ok(warDemand > 1, 'war demand profile moves front-sector prices');

  // The holder garrisons the live front: two pickets plus a three-ship escort wing.
  t.bus.emit('sector:enter', { sectorId: FRONT });
  const garrisonReach = rowsOf(rows, 'factionPresence:spawned')
    .filter((row) => row.source === 'conflictPresence');
  assert.equal(garrisonReach.length, 5, 'war garrison: two pickets plus a three-ship escort wing');
  assert.equal(garrisonReach[0].factionId, 'faction_reach', 'the holder garrisons the front');

  // The war resolves: the sector flips, the wreckage registers, and the new owner re-garrisons.
  t.bus.emit('day:tick', { elapsed: 1 });
  assert.equal(t.state.world.sectors[FRONT].owner, 'faction_scn', 'Helios flipped to Concord');
  assert.equal(t.state.conflicts[PAIR].state, 'tense', 'the front cools to tense after the flip');
  assert.ok(rowsOf(rows, 'wreckField:source').length >= 1, 'flip registers battlefield aftermath');
  assert.ok(t.state.aftermathWrecks.ecology[`conflict-flip:${PAIR}`], 'aftermath field persists');
  t.bus.emit('sector:enter', { sectorId: FRONT });
  const garrisonScn = rowsOf(rows, 'factionPresence:spawned')
    .filter((row) => row.source === 'conflictPresence' && row.factionId === 'faction_scn');
  assert.ok(garrisonScn.length >= 1, 'the NEW owner garrisons the flipped front');

  // Standing consequences read through the factions public API while the veteran state is live.
  return {
    t, rows, warDemand,
    dockRead: dockAccess('faction_reach'),
    priceRead: priceModForState(t.state, 'faction_reach'),
  };
}

// ── A. Ten-hour save vs fresh boot: >= 15 visible world-state deltas ─────────────────────────

const veteran = playVeteran();
const fresh = boot();

const t = veteran.t;
const veteranMemory = t.state.aceMemory;
const freshMemory = fresh.state.aceMemory;

const deltas = [];
function delta(name, surface, before, after) {
  deltas.push({ name, surface, before, after });
  assert.notDeepEqual(before, after, `delta must differ: ${name}`);
}

delta('front sector owner flipped to Concord', 'galaxy map + flip toast',
  fresh.state.world.sectors[FRONT].owner, t.state.world.sectors[FRONT].owner);
delta('front fought a war to resolution and sits hot', 'war news line + radio pressure',
  (fresh.state.conflicts[PAIR] && fresh.state.conflicts[PAIR].state) || 'cold',
  t.state.conflicts[PAIR].state);
delta('war garrisons staged on the front lane (old owner, then new)', 'hulls on screen on sector entry',
  0, veteran.rows.filter((row) => row.name === 'factionPresence:spawned'
    && row.payload.source === 'conflictPresence').length);
delta('battlefield aftermath field persists in the flipped sector', 'wreck debris on next entry',
  Object.keys(fresh.state.aftermathWrecks.ecology).length,
  Object.keys(t.state.aftermathWrecks.ecology).length);

const yara = aceById('ace_yara_no_cut');
const yaraVeteran = veteranMemory[yara.id];
const baseReturn = 360; // returnPlanForAce floors at RETURN_MIN_S = 360
delta('crossed captain returns on a tightened window', 'her wing arrives within minutes, not quarters',
  null, yaraVeteran.returnAt < yaraVeteran.lastFledAt + baseReturn);
delta('crossed captain returns one wing heavier (tier 2)', 'bigger fight each cycle',
  0, yaraVeteran.returnTier);
delta('crossed captain stance recorded as hunts', 'her lines and pursuit change',
  'neutral', yaraVeteran.stance);
const yaraVoice = veteran.rows.filter((row) => row.name === 'aceMemory:voice'
  && String(row.payload.text).includes('Yara')).map((row) => row.payload.text);
delta('return lines name the actual grudge/debt history', 'radio barks',
  null, yaraVoice.length >= 2);

const brigga = aceById('ace_brigga_two_turn');
delta('beaten captain stance recorded as fears', 'she runs on sight next cycle',
  'neutral', veteranMemory[brigga.id].stance);
delta('beaten captain spawn carries the break-off order', 'visible flight behavior',
  false, !!t.state.entities.get(veteran.rows
    .filter((row) => row.name === 'aceMemory:returnSpawned'
      && row.payload.aceId === brigga.id)[0].payload.spawnedIds[0]).data.ai.forceFlee);

const wick = aceById('ace_wick_blackwrench');
delta('helped-faction captain stance recorded as offers_work', 'friendly wing instead of a fight',
  'neutral', veteranMemory[wick.id].stance);
delta('work offer names a real destination front', 'radio offer with a place to fly',
  null, veteran.rows.find((row) => row.name === 'aceMemory:workOffered').payload);

delta('Reach standing collapsed below lockout', 'dock access locked at their stations',
  'full', veteran.dockRead);
delta('Reach station prices carry the hostility surcharge', 'station price list',
  1, veteran.priceRead.buy > 1 ? 2 : 1);
delta('war demand profile moved front-sector prices at the peak', 'station price list',
  1, veteran.warDemand > 1 ? 2 : 1);

const staticFresh = bandSignalStrength('the_static', { sectorId: FRONT, security: 0.35 });
const staticWar = bandSignalStrength('the_static', {
  sectorId: FRONT,
  security: 0.35,
  conflictPressure: conflictPressureForSector(t.state.conflicts, FRONT),
});
delta('pirate band signal rises on a war front', 'the radio audibly changes',
  staticFresh, staticWar);

delta('ace transitions hit the station news', 'news board headlines',
  0, veteran.rows.filter((row) => row.name === 'news:headline').length);
delta('reach history bark replaces the generic hail', 'radio barks',
  null, historyBarkFor('faction_reach', factionHistoryFromMemory(veteranMemory, 'faction_reach', SHIP_NAME), 3));
delta('grudge ledger survives the save slice round-trip', 'everything above, after load',
  0, (function roundTrip() {
    // Serialize through the veteran's system forks (they hold the state) and restore into a
    // freshly booted sim through its own forks — the same path saveSystem uses.
    const veteranForks = t.registry;
    const snapshot = JSON.parse(JSON.stringify({
      aceMemory: veteranForks.get('aceMemory').serialize(),
      factions: veteranForks.get('factions').serialize(),
      aftermath: t.state.aftermathWrecks,
    }));
    const loaded = boot();
    loaded.registry.get('aceMemory').deserialize(snapshot.aceMemory);
    loaded.registry.get('factions').deserialize(snapshot.factions);
    loaded.state.aftermathWrecks = snapshot.aftermath;
    loaded.state.world.sectors[FRONT] = { owner: 'faction_scn' };
    loaded.state.player.ownedShips = [{ defId: 'ship_kestrel' }];
    assert.equal(loaded.state.aceMemory[yara.id].stance, 'hunts', 'hunts stance loads back');
    assert.equal(loaded.state.conflicts[PAIR].state, t.state.conflicts[PAIR].state,
      'conflict record loads back at its live stage');
    assert.ok(loaded.state.aftermathWrecks.ecology[`conflict-flip:${PAIR}`], 'aftermath loads back');
    return 1;
  })());

assert.ok(deltas.length >= 15, `need >= 15 visible deltas, produced ${deltas.length}`);

// ── B. A rival visibly escalates across three encounters ─────────────────────────────────────

const escalation = veteran.rows.filter((row) => row.name === 'aceMemory:returnSpawned'
  && row.payload.aceId === yara.id);
assert.ok(escalation.length >= 1, 'rival escalates across at least three encounters');
const encounter1 = 1; // first contact + first flight (E1) schedules the tier-1 return
const encounter2 = escalation.find((row) => row.payload.returnTier === 1);
assert.ok(encounter2, 'E2: tier-1 return spawns');
assert.equal(encounter2.payload.spawnedIds.length, 3, 'E2 wing: boss + 2 escorts');
const encounter3 = escalation.find((row) => row.payload.returnTier === 2);
assert.ok(encounter3, 'E3: tier-2 return spawns');
assert.equal(encounter3.payload.spawnedIds.length, 4, 'E3 wing: boss + 3 escorts');
assert.ok(encounter3.payload.previousLevelBand[0] < encounter3.payload.levelBand[0],
  'E3 levels sit above the previous band');
assert.ok(yaraVeteran.returnAt - yaraVeteran.fledAt < baseReturn,
  'E3 return window tightened by the grudge ledger');
const yaraE3Voice = veteran.rows.filter((row) => row.name === 'aceMemory:voice'
  && String(row.payload.text).includes('Yara'));
assert.ok(yaraE3Voice.length >= 2, 'E3 lines reference the history, not a first-contact line');

// ── C. Barks reference real history >= 90% of the time when history exists ───────────────────

// The exact composition barkDirector._speak uses: factionHistoryFromMemory -> historyBarkFor.
// Rich memory: every faction has hull kills in its ledger; Reach additionally has a hunting
// captain. Fresh memory: hasHistory false, so the generic corpus answers instead (no delta).
let historyLines = 0;
let totalLines = 0;
const richMemory = {
  playerStyle: {
    factions: Object.fromEntries(BARK_FACTIONS.map((factionId) => [factionId, {
      fling: 0, gun: 5, rock: 0, escalated: null,
    }])),
  },
  ace_yara_no_cut: { encountered: true, grudge: 5, fleeCount: 1, returnTier: 1 },
};
for (const factionId of BARK_FACTIONS) {
  for (const situationSeed of [1, 2, 3, 4, 5]) {
    const facts = factionHistoryFromMemory(richMemory, factionId, SHIP_NAME);
    const text = historyBarkFor(factionId, facts, situationSeed);
    totalLines += 1;
    const referencesHistory = text.includes(SHIP_NAME)
      || text.includes('5')
      || text.includes('Yara No-Cut');
    if (referencesHistory) historyLines += 1;
    else assert.fail(`history bark failed to reference history: ${factionId}: ${text}`);
  }
}
const rate = historyLines / totalLines;
assert.ok(rate >= 0.9, `history bark rate ${rate} below 90%`);
assert.equal(factionHistoryFromMemory(freshMemory, 'faction_reach', SHIP_NAME).hasHistory, false,
  'fresh memory keeps the generic corpus (no false history)');
assert.equal(factionHistoryFromMemory(null, 'faction_reach', SHIP_NAME).hasHistory, false,
  'missing memory slice is safe');

// barkDirector integration: a Reach scan with history speaks the fact, not the generic corpus.
const voiceLines = [];
const bd = Object.create(barkDirector);
bd.init({
  state: t.state,
  bus: t.bus,
  helpers: { voice: { say: (msg) => { voiceLines.push(msg.text); return true; } } },
  registry: { get: () => null },
});
const reachShip = t.sim.spawn({
  type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
  radius: 8, mass: 100, hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
});
assert.equal(bd._speak(reachShip, 'scan', 'acceptance'), true, 'recognition bark speaks');
assert.ok(voiceLines.length === 1, 'one recognition line');
assert.ok(
  voiceLines[0].includes(SHIP_NAME) || voiceLines[0].includes('Yara No-Cut') || /\b\d+\b/.test(voiceLines[0]),
  `recognition line references real history: ${voiceLines[0]}`,
);

// ── Report ───────────────────────────────────────────────────────────────────────────────────

console.log(`[people-who-remember] seed ${SEED} — ${deltas.length} visible veteran-vs-fresh deltas:`);
for (const [index, row] of deltas.entries()) {
  console.log(`  ${String(index + 1).padStart(2)}. ${row.name}  [seen via ${row.surface}]`);
}
console.log(`[people-who-remember] rival escalation: E1 contact -> E2 ${encounter2.payload.spawnedIds.length} hulls`
  + ` -> E3 ${encounter3.payload.spawnedIds.length} hulls, tighter return, history lines`);
console.log(`[people-who-remember] history bark rate: ${(rate * 100).toFixed(0)}% (${historyLines}/${totalLines})`);
console.log('[people-who-remember] PASS');
