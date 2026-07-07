#!/usr/bin/env node
// BP-13/B9 Pirate Doctrines contract.
//
// This is intentionally a data-only gate: doctrines parameterize later pirate
// parley/scan systems, but do not register a runtime system by themselves.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { BARK_SITUATIONS } from '../src/data/barks.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/pirateDoctrines.js', import.meta.url)),
  'src/data/pirateDoctrines.js exists');

const doctrineMod = await import('../src/data/pirateDoctrines.js');
const {
  PIRATE_DOCTRINE_IDS,
  PIRATE_DOCTRINES,
  isPirateDoctrine,
  pirateDoctrineById,
  pirateDoctrineForEntity,
  pirateDoctrineReadout,
  pirateParleyPlanForEntity,
} = doctrineMod;

const REQUIRED_IDS = ['toll', 'thief', 'salvage-jackal', 'tech-raider', 'ideological'];
const BARKS = new Set(BARK_SITUATIONS);
let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in pirate doctrine path'); };
  Date.now = () => { throw new Error('Date.now in pirate doctrine path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testDoctrineRoster);
guarded(testObservableAxis);
guarded(testTollParleyContract);
guarded(testThiefCargoGrabContract);
guarded(testScanReadoutContract);

console.log(`[check-pirate-doctrines] PASS - ${sections} sections green`);

function testDoctrineRoster() {
  assert.deepEqual(PIRATE_DOCTRINE_IDS, REQUIRED_IDS, 'doctrine ids stay in spec order');
  assert.equal(Object.keys(PIRATE_DOCTRINES).length, REQUIRED_IDS.length, 'only the five shipped doctrines exist');
  assert.equal(isPirateDoctrine('slaver'), false, 'slaver doctrine stays cut/deferred');
  assert.equal(JSON.stringify(PIRATE_DOCTRINES).includes('slaver'), false, 'slaver does not sneak into data payloads');
  assert.equal(pirateDoctrineById('scavenger'), null, 'legacy scavenger doctrine is not silently upgraded into a pirate parley');
  ok('roster has exactly the BP-13 B9 doctrines and no cut doctrine');
}

function testObservableAxis() {
  const signatures = new Set();
  for (const id of REQUIRED_IDS) {
    const doctrine = pirateDoctrineById(id);
    assert.ok(doctrine, `${id}: doctrine exists`);
    assert.equal(doctrine.id, id, `${id}: id matches key`);
    assert.equal(typeof doctrine.label, 'string', `${id}: label exists`);
    assert.ok(doctrine.label.length > 0, `${id}: label not empty`);
    assert.equal(typeof doctrine.demandType, 'string', `${id}: demandType exists`);
    assert.equal(typeof doctrine.targetPreference, 'string', `${id}: targetPreference exists`);
    assert.ok(BARKS.has(doctrine.barkSituation), `${id}: barkSituation ${doctrine.barkSituation} is shipped`);
    assert.equal(typeof doctrine.contactWord, 'string', `${id}: contactWord exists`);
    assert.equal(typeof doctrine.scanReadout, 'string', `${id}: scanReadout exists`);
    assert.equal(typeof doctrine.startsParley, 'boolean', `${id}: startsParley is explicit`);
    signatures.add([
      doctrine.demandType,
      doctrine.targetPreference,
      doctrine.barkSituation,
      doctrine.startsParley,
      doctrine.cargoStrategy,
    ].join('|'));
  }
  assert.equal(signatures.size, REQUIRED_IDS.length,
    'each doctrine changes at least one observable demand/target/bark/parley/cargo axis');
  ok('each doctrine changes an observable gameplay/readout axis');
}

function testTollParleyContract() {
  const entity = { data: { ai: { doctrine: 'toll' } } };
  const doctrine = pirateDoctrineForEntity(entity);
  const plan = pirateParleyPlanForEntity(entity);
  assert.equal(doctrine.id, 'toll', 'entity doctrine resolves to toll');
  assert.equal(plan.doctrineId, 'toll', 'parley plan keeps doctrine id');
  assert.equal(plan.startsParley, true, 'toll starts the B6 parley ladder');
  assert.equal(plan.demandType, 'tithe', 'toll demands a tithe');
  assert.deepEqual(plan.barkSequence, ['scan', 'demand-cargo', 'attack'],
    'toll barks scan -> demand -> attack for B6');
  assert.equal(plan.complianceOutcome, 'break-off', 'complying with toll breaks the squad off');
  ok('toll doctrine exposes the B6 parley ladder contract');
}

function testThiefCargoGrabContract() {
  const entity = { data: { ai: { doctrine: 'thief' } } };
  const plan = pirateParleyPlanForEntity(entity);
  assert.equal(plan.doctrineId, 'thief', 'parley plan keeps thief id');
  assert.equal(plan.startsParley, false, 'thief skips the formal demand window');
  assert.equal(plan.demandType, 'none', 'thief has no demand type');
  assert.equal(plan.cargoStrategy, 'grab-cargo', 'thief grabs cargo');
  assert.match(plan.targetPreference, /cargo|value/, 'thief targets cargo/value');
  assert.equal(plan.barkSequence.includes('demand-cargo'), false, 'thief does not emit demand-cargo');
  ok('thief doctrine skips demand and points at cargo grabbing');
}

function testScanReadoutContract() {
  const entity = { data: { ai: { doctrine: 'tech-raider' } } };
  const readout = pirateDoctrineReadout(entity);
  assert.deepEqual(
    Object.keys(readout).sort(),
    [
      'barkSituation', 'contactWord', 'demandType', 'doctrineId',
      'label', 'scanReadout', 'startsParley', 'targetPreference',
    ].sort(),
    'scan readout shape is stable for contacts/strip consumers',
  );
  assert.equal(readout.doctrineId, 'tech-raider', 'readout resolves doctrine id');
  assert.equal(readout.contactWord, 'TECH RAIDER', 'readout exposes a compact contacts word');
  assert.match(readout.scanReadout, /module|tech|reactor/i, 'readout tells the player what this pirate wants');
  assert.equal(pirateDoctrineReadout({ data: { ai: { doctrine: 'official' } } }), null,
    'non-pirate doctrines produce no pirate readout');
  ok('doctrine is queryable for scan/contact readouts without runtime side effects');
}
