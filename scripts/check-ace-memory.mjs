#!/usr/bin/env node
// BP-13/B10 Named Crews & Aces contract.
//
// Named pirate aces keep durable memory: first contact, flee, defeat, deterministic return
// scheduling, and one station-news headline per state transition. The system also recognizes the
// shipped named-hunter receipt seam, so encounterDirector stays untouched.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/namedAces.js', import.meta.url)),
  'src/data/namedAces.js exists');
assert.ok(existsSync(new URL('../src/systems/aceMemory.js', import.meta.url)),
  'src/systems/aceMemory.js exists');

const dataMod = await import('../src/data/namedAces.js');
const sysMod = await import('../src/systems/aceMemory.js');
const {
  NAMED_ACE_IDS,
  NAMED_ACES,
  aceById,
  aceByName,
  newsForAceTransition,
  returnPlanForAce,
} = dataMod;
const aceMemory = sysMod.aceMemory || sysMod.default;

const REQUIRED_IDS = ['ace_yara_no_cut', 'ace_toll_saint_venn', 'ace_mako_broken_ring'];
let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in ace memory path'); };
  Date.now = () => { throw new Error('Date.now in ace memory path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testRosterAndPureReaders);
guarded(testDefeatEmitsExactlyOneNewsHeadline);
guarded(testFleeSchedulesDeterministicReturn);
guarded(testSaveRoundTripCarriesAceMemory);
guarded(testNamedHunterReceiptSeam);
guarded(testMasslineFlingMemory);

console.log(`[check-ace-memory] PASS - ${sections} sections green`);

function boot(seed = 1010) {
  const sim = createSimulation({ seed, systems: [aceMemory, save] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_sker_haven';
  const log = { news: [], transitions: [], voices: [] };
  sim.bus.on('news:headline', (p) => log.news.push(p));
  sim.bus.on('aceMemory:transition', (p) => log.transitions.push(p));
  sim.bus.on('aceMemory:voice', (p) => log.voices.push(p));
  return { sim, state: sim.state, bus: sim.bus, log };
}

function testRosterAndPureReaders() {
  assert.deepEqual(NAMED_ACE_IDS, REQUIRED_IDS, 'B10 roster ids stay in spec order');
  assert.equal(Object.keys(NAMED_ACES).length, REQUIRED_IDS.length, 'only the three B10 aces are in the core roster');
  const crews = REQUIRED_IDS.map((id) => aceById(id).crew);
  assert.deepEqual(crews, ['Red Latch Crew', 'Sker Hooks', 'The Empty Ledger'], 'spec crew names are present');
  assert.equal(aceById('ace_yara_no_cut').name, 'Yara No-Cut', 'Yara roster entry exists');
  assert.equal(aceByName('Toll Saint Venn').id, 'ace_toll_saint_venn', 'ace lookup by display name works');
  assert.equal(aceByName('Sable Iask').id, 'cap_sable_iask', 'existing named-hunter captains are recognized');
  assert.match(newsForAceTransition(aceById('ace_yara_no_cut'), 'defeated'), /Yara No-Cut/,
    'defeat headline names the ace');
  assert.match(aceById('ace_mako_broken_ring').signatureBark, /Broken Ring/,
    'each ace carries a signature bark line');
  ok('B10 roster and pure readers expose named crews, leaders, gimmicks, and receipt aliases');
}

function testDefeatEmitsExactlyOneNewsHeadline() {
  const t = boot();
  t.bus.emit('namedAce:defeated', { aceId: 'ace_yara_no_cut', sectorId: 'sector_sker_haven' });
  assert.equal(t.log.news.length, 1, 'defeat emits one headline');
  assert.match(t.log.news[0].headline, /Yara No-Cut/, 'headline names the defeated ace');
  assert.equal(t.log.news[0].kind, 'ace-defeated', 'headline has ace defeated kind');
  assert.equal(t.state.aceMemory.ace_yara_no_cut.defeated, true, 'state records defeated transition');
  assert.equal(t.state.aceMemory.ace_yara_no_cut.encountered, true, 'defeated ace is also encountered');

  t.bus.emit('namedAce:defeated', { aceId: 'ace_yara_no_cut', sectorId: 'sector_sker_haven' });
  assert.equal(t.log.news.length, 1, 'repeat defeat does not spam news');
  assert.equal(t.log.transitions.length, 1, 'repeat defeat does not emit another transition');
  ok('defeating a named ace emits exactly one station-news headline naming that ace');
}

function testFleeSchedulesDeterministicReturn() {
  const run = () => {
    const t = boot(4242);
    t.state.simTime = 180;
    t.bus.emit('namedAce:fled', { aceId: 'ace_toll_saint_venn', sectorId: 'sector_sker_haven' });
    const rec = t.state.aceMemory.ace_toll_saint_venn;
    return {
      fled: rec.fled,
      encountered: rec.encountered,
      returnScheduled: rec.returnScheduled,
      returnAt: rec.returnAt,
      returnAfterS: rec.returnAfterS,
      returnSeed: rec.returnSeed,
      news: t.log.news.map((p) => p.headline),
    };
  };
  const first = run();
  const second = run();
  assert.equal(first.fled, true, 'fled flag is set at state.aceMemory[id].fled');
  assert.equal(first.encountered, true, 'fled ace is marked encountered');
  assert.equal(first.returnScheduled, true, 'fled ace gets a return schedule');
  assert.ok(first.returnAt > 180, 'returnAt is in the future');
  assert.ok(first.returnAfterS >= 360, 'return delay is readable, not immediate');
  assert.deepEqual(first, second, 'same seed and ace id produce identical flee memory');

  const ace = aceById('ace_toll_saint_venn');
  assert.deepEqual(
    returnPlanForAce(ace, 4242, 180),
    { returnAt: first.returnAt, returnAfterS: first.returnAfterS, returnSeed: first.returnSeed },
    'pure return planner matches runtime state',
  );
  ok('fleeing a named ace schedules a deterministic bigger-return flag');
}

function testSaveRoundTripCarriesAceMemory() {
  const t = boot(5151);
  t.bus.emit('namedAce:fled', { aceId: 'ace_mako_broken_ring', sectorId: 'sector_sker_haven' });
  const before = JSON.parse(JSON.stringify(t.state.aceMemory));
  const saveSys = t.sim.registry.get('save');
  const data = saveSys.serializeData();
  assert.deepEqual(data.aceMemory, before, 'save payload includes aceMemory');

  t.state.aceMemory = null;
  saveSys._callDeserialize('aceMemory', data.aceMemory);
  assert.deepEqual(t.state.aceMemory, before, 'save deserialize restores aceMemory exactly');
  ok('save/reload path round-trips state.aceMemory');
}

function testNamedHunterReceiptSeam() {
  const t = boot(6262);
  t.bus.emit('encounter:receipt', {
    shape: 'named_hunter',
    outcome: 'escaped',
    text: 'HUNTER ESCAPED - Sable Iask will return stronger.',
    t: t.state.simTime,
  });
  const rec = t.state.aceMemory.cap_sable_iask;
  assert.equal(rec.fled, true, 'named-hunter escaped receipt marks the recognized captain fled');
  assert.equal(rec.returnScheduled, true, 'receipt-triggered flee schedules a return');
  assert.equal(t.log.news.length, 1, 'receipt transition emits one news headline');
  assert.match(t.log.news[0].headline, /Sable Iask/, 'receipt headline names the existing captain');
  ok('existing named-hunter receipts feed ace memory without touching encounterDirector');
}

function testMasslineFlingMemory() {
  const t = boot(7373);
  const aceShip = {
    id: 77,
    alive: true,
    data: { aceMemory: { aceId: 'ace_yara_no_cut', aceName: 'Yara No-Cut' } },
  };
  t.state.entities.set(aceShip.id, aceShip);
  t.state.simTime = 42;
  t.bus.emit('massline:tumbled', {
    victimId: aceShip.id,
    cause: 'self-throw',
    spin: 4.5,
    time: t.state.simTime,
  });
  const rec = t.state.aceMemory.ace_yara_no_cut;
  assert.equal(rec.flungCount, 1, 'named ace remembers being flung');
  assert.equal(rec.lastFlungAt, 42, 'fling memory uses deterministic sim time');
  assert.equal(rec.lastFlungCause, 'self-throw');
  assert.equal(rec.lastFlungSpin, 4.5);
  assert.equal(t.log.transitions.at(-1).transition, 'flung', 'fling emits the durable transition seam');
  assert.equal(t.log.news.length, 0, 'a tumble does not fake a defeat/flee headline');
  ok('named aces remember massline flings without changing hostility or forcing a flee');
}
