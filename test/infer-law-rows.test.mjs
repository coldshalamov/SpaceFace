// PB-CONS-C, PB-CONS-D, PB-CONS-E, NXB-044, and the law half of row 247.
// Seed 4242. The law owner only: a destroyed memorial can be found by someone who
// was not there, restitution names who it is for, an audit uses the record the
// player built, tolls/warrants/restitution do not swallow each other, a fine can
// be chosen, and a surrender has a price. Heat is never zeroed here.
import test from 'node:test';
import assert from 'node:assert/strict';

import { lawSecurity } from '../src/systems/lawSecurity.js';
import { quoteImpoundBill } from '../src/systems/custodyConsequences.js';

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function makeLaw(player = {}) {
  const entities = new Map();
  const state = {
    meta: { seed: 4242 },
    simTime: 40,
    tick: 80,
    mode: 'flight',
    playerId: 'player',
    player: { heat: 0, credits: 5000, cargo: { items: {} }, ...player },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [],
  };
  const bus = makeBus();
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, law, entities };
}

function add(run, entity) {
  run.entities.set(entity.id, entity);
  run.state.entityList.push(entity);
  return entity;
}

function events(bus, name) {
  return bus.emitLog.filter((row) => row.evt === name);
}

test('PB-CONS-C: a destroyed memorial can be found by someone who was not there', () => {
  const run = makeLaw();
  add(run, {
    id: 'hulk', type: 'wreck', alive: true, pos: { x: 0, z: 0 },
    data: { role: 'wreck' },
  });
  run.bus.emit('entity:destroyed', { id: 'hulk', pos: { x: 0, z: 0 }, killerId: 'pilot-axe' });
  assert.equal(run.law.findDestroyedMemorial({ finderId: 'stranger', siteId: 'hulk' }).found, false);
  assert.equal(run.state.lawSecurity.memorialSites, undefined);

  add(run, {
    id: 'shrine', type: 'wreck', alive: true, pos: { x: 10, z: 10 },
    data: { memorial: true, siteId: 'shrine_helios', name: 'Helios Shrine' },
  });
  add(run, {
    id: 'wit', type: 'ship', alive: true, pos: { x: 30, z: 10 },
    data: { ai: { lawful: true } },
  });
  run.bus.emit('entity:destroyed', {
    id: 'shrine', pos: { x: 10, z: 10 }, killerId: 'pilot-axe',
  });
  run.bus.emit('entity:destroyed', {
    id: 'shrine', pos: { x: 10, z: 10 }, killerId: 'pilot-axe',
  });
  assert.equal(Object.keys(run.state.lawSecurity.memorialSites).length, 1);

  run.bus.emit('scan:wreckResolved', { siteId: 'shrine_helios', finderId: 'stranger' });
  const found = run.law.findDestroyedMemorial({ finderId: 'stranger', siteId: 'shrine_helios' });
  assert.equal(found.found, true);
  assert.equal(found.finderWasThere, false);
  assert.equal(found.evidence, 'witnessed');
  assert.ok(found.witnessEntityIds.includes('wit'));
  assert.equal(found.witnessEntityIds.includes('stranger'), false);
  assert.equal(found.foundBy.filter((id) => id === 'stranger').length, 1);
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 0);

  add(run, {
    id: 'quiet', type: 'wreck', alive: true, pos: { x: 800, z: 800 },
    data: { memorial: true, siteId: 'quiet_stone', name: 'Quiet Stone' },
  });
  run.bus.emit('entity:destroyed', {
    id: 'quiet', pos: { x: 800, z: 800 }, killerId: 'pilot-axe',
  });
  const uncertain = run.law.findDestroyedMemorial({ finderId: 'stranger', siteId: 'quiet_stone' });
  assert.equal(uncertain.found, true);
  assert.equal(uncertain.finderWasThere, false);
  assert.equal(uncertain.evidence, 'uncertain');
  assert.equal(uncertain.namedParty, null);
  assert.equal(uncertain.statement.includes('pilot-axe'), false);
  assert.match(uncertain.statement, /not seen/);

  const saved = run.law.serialize();
  const later = makeLaw();
  later.law.deserialize(saved);
  const again = later.law.findDestroyedMemorial({ finderId: 'years-later', siteId: 'shrine_helios' });
  assert.equal(again.found, true);
  assert.equal(again.finderWasThere, false);
  assert.equal(again.name, 'Helios Shrine');
  assert.equal(later.state.player.heat, 0);
});

test('PB-CONS-D: restitution names the person it is for', () => {
  const run = makeLaw({ heat: 0.4 });
  const unnamed = run.law.noteComposedObligation({
    kind: 'restitution', causeId: 'hit:ivo', amountCr: 100,
  });
  assert.equal(unnamed.accepted, false);
  assert.equal(unnamed.reason, 'unnamed');
  assert.equal(run.law.restitutionFor('hit:ivo'), null);

  const opened = run.law.noteComposedObligation({
    kind: 'restitution', causeId: 'hit:ivo', amountCr: 100, forPerson: 'Ivo Pell',
  });
  assert.equal(opened.accepted, true);
  assert.equal(opened.obligation.forPerson, 'Ivo Pell');
  assert.match(opened.obligation.whatFor, /Ivo Pell/);

  const renamed = run.law.noteComposedObligation({
    kind: 'restitution', causeId: 'hit:ivo', amountCr: 9999, forPerson: 'Someone Else',
  });
  assert.equal(renamed.duplicate, true);
  assert.equal(renamed.obligation.forPerson, 'Ivo Pell');
  assert.equal(renamed.obligation.amountCr, 100);

  const named = run.law.restitutionFor('hit:ivo');
  assert.equal(named.forPerson, 'Ivo Pell');
  assert.equal(named.globalExoneration, false);
  assert.match(named.promise, /Ivo Pell/);
  assert.equal(run.state.player.heat, 0.4);
  assert.equal(events(run.bus, 'heat:clear').length, 0);
});

test('PB-CONS-E: the law checks you against the record you actually built', () => {
  const run = makeLaw({ heat: 0.4 });
  const opened = run.law._openIncident(
    { id: 'player' },
    { id: 'hauler-9' },
    { stationId: 'station_helios', entityId: 'st', factionId: 'faction_scn', radius: 900 },
    'player_assault',
  );
  run.law._recordReceipt({
    cause: 'player_piracy',
    outcome: 'distress_received',
    incidentId: 'law:neighbor-piracy',
    attackerId: 'player',
    targetId: 'hauler-2',
    stationId: 'station_helios',
    text: 'NEIGHBOR — a second real charge stays on the record.',
  });
  const before = run.state.lawSecurity.receipts.length;
  const audit = run.law.auditBuiltRecord({
    subjectId: 'player',
    charges: [
      { incidentId: opened.id, cause: 'player_assault' },
      { incidentId: 'law:neighbor-piracy', cause: 'player_piracy' },
      { incidentId: 'law:fabricated', cause: 'player_assault' },
      { cause: 'player_assault' },
    ],
  });
  assert.equal(audit.results[0].verdict, 'confirmed');
  assert.equal(audit.results[1].verdict, 'confirmed');
  assert.equal(audit.results[2].verdict, 'not_on_record');
  assert.equal(audit.results[3].verdict, 'confirmed');
  assert.equal(audit.invented, false);
  assert.equal(run.state.lawSecurity.receipts.length, before);
  assert.equal(run.state.lawSecurity.incidents[opened.id] || run.state.lawSecurity.incidents[`station_helios:player`].id, opened.id);

  const stranger = run.law.auditBuiltRecord({
    subjectId: 'other-pilot',
    charges: [{ incidentId: opened.id, cause: 'player_assault' }],
  });
  assert.equal(stranger.results[0].verdict, 'not_on_record');
  assert.equal(run.state.player.heat, 0.4);
  assert.equal(events(run.bus, 'heat:clear').length, 0);
  assert.equal(events(run.bus, 'law:recordAudit').length, 2);
});

test('NXB-044: tolls, warrants and restitution stay one readable set of bills', () => {
  const run = makeLaw({ heat: 0.4, cargo: { items: { bulk: 120 } } });
  const pirate = (id, zoneId) => ({
    id,
    type: 'ship',
    alive: true,
    pos: { x: 200, z: 0 },
    factionId: 'faction_reach',
    data: {
      ai: {
        spawnContext: 'ambient',
        archetype: 'pirate_raider',
        sectorSecurity: 0.2,
        ...(zoneId ? { zoneId } : {}),
      },
    },
  });
  const first = pirate('raider-1');
  const second = pirate('raider-2');
  run.bus.emit('entity:spawned', { entity: first });
  run.bus.emit('entity:spawned', { entity: second });
  const passage = `passage:sector_helios_prime:${first.data.ai.zoneId}`;
  const again = run.law.noteComposedObligation({
    kind: 'toll', causeId: passage, amountCr: 9999, label: 'passage toll',
  });
  assert.equal(again.duplicate, true);
  assert.equal(again.obligation.amountCr, 120);

  const other = pirate('raider-3', 'lane-west');
  run.bus.emit('entity:spawned', { entity: other });
  const otherPassage = `passage:sector_helios_prime:${other.data.ai.zoneId}`;
  assert.notEqual(otherPassage, passage);

  const unnamed = run.law.noteComposedObligation({
    kind: 'restitution', causeId: 'hit:ivo', amountCr: 100,
  });
  assert.equal(unnamed.reason, 'unnamed');
  run.law.noteComposedObligation({
    kind: 'restitution', causeId: 'hit:ivo', amountCr: 100, forPerson: 'Ivo Pell',
  });
  run.law.noteComposedObligation({
    kind: 'warrant', causeId: 'hit:ivo', amountCr: 80, label: 'local warrant',
  });

  const partial = run.law.payComposedObligation({
    kind: 'restitution', causeId: 'hit:ivo', amountCr: 40,
  });
  assert.equal(partial.obligation.remainingCr, 60);
  assert.equal(partial.obligation.advertisePay, true);
  assert.equal(partial.obligation.forPerson, 'Ivo Pell');

  const tollPaid = run.law.payComposedObligation({ kind: 'toll', causeId: passage });
  assert.equal(tollPaid.obligation.advertisePay, false);
  assert.equal(tollPaid.obligation.status, 'paid');

  const left = run.law.composedDisposition().filter((row) => row.advertisePay);
  const leftKeys = left.map((row) => row.key).sort();
  assert.deepEqual(leftKeys, [
    `restitution:hit:ivo`,
    `toll:${otherPassage}`,
    'warrant:hit:ivo',
  ].sort());
  assert.equal(run.law.restitutionFor('hit:ivo').forPerson, 'Ivo Pell');
  assert.equal(run.law.restitutionFor('hit:ivo').globalExoneration, false);
  assert.equal(run.state.player.heat, 0.4);
  assert.equal(events(run.bus, 'heat:clear').length, 0);
  assert.equal(events(run.bus, 'economy:chargeCredits').length, 2);
});

test('row 247: a fine can be chosen and a surrender has a price', () => {
  const station = {
    id: 'station_tethys', type: 'station', alive: true, factionId: 'faction_scn',
    pos: { x: 0, z: 0 }, data: { stationId: 'station_tethys' },
  };

  const leave = makeLaw({ heat: 0.2, credits: 5000 });
  add(leave, station);
  leave.bus.emit('dock:docked', { stationId: 'station_tethys', fineChoice: 'leave' });
  assert.equal(events(leave.bus, 'economy:chargeCredits').length, 0);
  assert.equal(events(leave.bus, 'heat:clear').length, 0);
  assert.equal(leave.state.player.heat, 0.2);
  const standing = leave.law.composedDisposition().find((row) => row.kind === 'warrant');
  assert.equal(standing.advertisePay, true);
  leave.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(leave.bus, 'economy:chargeCredits').length, 1);
  assert.equal(events(leave.bus, 'heat:clear').length, 1);
  assert.equal(leave.state.player.heat, 0.2, 'law asks the heat owner to clear; it does not zero heat');
  leave.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(events(leave.bus, 'economy:chargeCredits').length, 1, 'the same fine is not charged twice');

  const worked = makeLaw({ heat: 0.2, credits: 10 });
  add(worked, { ...station });
  worked.bus.emit('dock:docked', { stationId: 'station_tethys', fineChoice: 'work' });
  assert.equal(events(worked.bus, 'economy:chargeCredits').length, 0);
  worked.law.update(3.9, worked.state);
  assert.equal(events(worked.bus, 'heat:clear').length, 0);
  worked.law.update(0.2, worked.state);
  assert.equal(events(worked.bus, 'heat:clear').length, 1);
  assert.equal(events(worked.bus, 'heat:clear')[0].payload.reason, 'station_fine_work');
  assert.equal(events(worked.bus, 'economy:chargeCredits').length, 0);
  assert.equal(worked.state.player.heat, 0.2);

  const neighbor = makeLaw({ heat: 0.2, credits: 5000 });
  add(neighbor, { ...station });
  neighbor.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(events(neighbor.bus, 'economy:chargeCredits').length, 0, 'FB-039: the berth assesses, it does not charge');
  assert.equal(events(neighbor.bus, 'law:fineAssessed').filter((row) => row.payload.offer === true).length, 1);
  neighbor.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(neighbor.bus, 'economy:chargeCredits').length, 1);
  assert.equal(events(neighbor.bus, 'heat:clear').length, 1);
  const paid = events(neighbor.bus, 'law:response').find((row) => row.payload.action === 'fine_paid');
  assert.equal(paid.payload.fineCr, 250);

  const broke = makeLaw({ heat: 0.2, credits: 10 });
  add(broke, { ...station });
  broke.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(events(broke.bus, 'economy:chargeCredits').length, 0);
  assert.ok(events(broke.bus, 'law:fineAssessed').some((row) => row.payload.offer === true), 'a broke pilot still gets the offer');
  broke.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(broke.bus, 'economy:chargeCredits').length, 0, 'a short answer is refused, never charged');
  assert.ok(events(broke.bus, 'law:response').some((row) => row.payload.action === 'fine_unpaid'));
  assert.equal(broke.state.player.heat, 0.2);

  const scan = makeLaw({ heat: 0.2, credits: 5000 });
  add(scan, { ...station });
  const refused = scan.bus.emit('law:playerSurrender', {}) || scan.law._beginPlayerSurrender();
  assert.equal(refused.reason || events(scan.bus, 'law:surrenderRefused')[0].payload.reason, 'not_in_custody_tier');
  scan.bus.emit('dock:docked', { stationId: 'station_tethys' });
  scan.bus.emit('law:fineChoice', { choice: 'pay', stationId: 'station_tethys' });
  assert.equal(events(scan.bus, 'economy:chargeCredits').length, 1, 'a refused surrender still leaves the fine payable');

  const held = makeLaw({ heat: 0.65, credits: 5000 });
  add(held, {
    id: 'player', type: 'ship', alive: true, pos: { x: 40, z: 5000 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  });
  const patrol = add(held, {
    id: 'patrol', type: 'ship', alive: true, pos: { x: 0, z: 5000 }, rot: 0, factionId: 'faction_scn',
    data: { ai: { lawful: true }, intent: { fire: true }, combat: { targetId: 'player' } },
  });
  const bystander = add(held, {
    id: 'far-patrol', type: 'ship', alive: true, pos: { x: 0, z: 5400 }, rot: 0, factionId: 'faction_scn',
    data: { ai: { lawful: true }, intent: { fire: true }, combat: { targetId: 'player' } },
  });
  const raider = add(held, {
    id: 'raider', type: 'ship', alive: true, pos: { x: 0, z: 5600 }, rot: 0, factionId: 'faction_reach',
    data: { ai: { lawful: false }, intent: { fire: true }, combat: { targetId: 'player' } },
  });
  held.law.noteComposedObligation({ kind: 'toll', causeId: 'passage:keep', amountCr: 120, label: 'passage toll' });
  const started = held.law._beginPlayerSurrender();
  assert.equal(started.phase, 'holding');
  assert.equal(started.priceCr, quoteImpoundBill(held.state.player));
  assert.ok(started.priceCr > 0);
  held.law.update(4, held.state);
  const accepted = events(held.bus, 'law:surrenderAccepted');
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].payload.priceCr, started.priceCr);
  assert.equal(held.state.player.heat, 0.65);
  assert.equal(events(held.bus, 'heat:clear').length, 0);
  assert.equal(patrol.data.intent.fire, false);
  assert.equal(bystander.data.intent.fire, false, 'an accepted surrender stands down every lawful engager, not only the cone responder');
  assert.equal(raider.data.intent.fire, true, 'a surrender to the law does not disarm an unlawful attacker');
  const surrenderBill = held.law.composedDisposition().find((row) => row.causeId === started.causeId);
  assert.equal(surrenderBill.advertisePay, true);
  assert.equal(surrenderBill.amountCr, started.priceCr);
  held.law.payComposedObligation({ kind: 'warrant', causeId: started.causeId });
  const afterPay = held.law.composedDisposition();
  assert.equal(afterPay.find((row) => row.causeId === started.causeId).advertisePay, false);
  assert.equal(afterPay.find((row) => row.causeId === 'passage:keep').advertisePay, true);
  assert.equal(held.state.player.heat, 0.65);

  const fired = makeLaw({ heat: 0.65 });
  add(fired, {
    id: 'player', type: 'ship', alive: true, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  });
  add(fired, {
    id: 'patrol', type: 'ship', alive: true, pos: { x: 0, z: 0 }, rot: 0, factionId: 'faction_scn',
    data: { ai: { lawful: true }, intent: { fire: true } },
  });
  assert.equal(fired.law._beginPlayerSurrender().phase, 'holding');
  fired.law.update(1, fired.state);
  fired.bus.emit('combat:fire', { ownerId: 'player', targetId: 'patrol' });
  fired.law.update(5, fired.state);
  assert.equal(fired.state.lawSecurity.playerSurrender.phase, 'cancelled');
  assert.equal(fired.law.composedDisposition().some((row) => row.label === 'surrender'), false);
  assert.equal(events(fired.bus, 'heat:clear').length, 0);
  assert.equal(fired.state.player.heat, 0.65);

  const alone = makeLaw({ heat: 0.65 });
  add(alone, {
    id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  });
  const noLaw = alone.law._beginPlayerSurrender();
  assert.equal(noLaw.reason, 'no_responder');
  assert.equal(alone.law.composedDisposition().length, 0);
  assert.equal(alone.state.player.heat, 0.65);
});
