import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  THUNDERCHILD,
  THUNDERCHILD_TITLE_ID,
  TITLE_CANDIDATE_LIMIT,
  TITLE_HISTORY_LIMIT,
  TITLE_PROCESSED_RECEIPT_LIMIT,
  TITLES_SEEN_LIMIT,
} from '../src/data/titles.js';
import {
  compareThunderchildCandidates,
  createTitlesSystem,
} from '../src/systems/titles.js';

class TestBus {
  constructor() {
    this.listeners = new Map();
    this.emissions = [];
  }

  on(event, fn) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(fn);
    this.listeners.set(event, listeners);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const listeners = this.listeners.get(event) || [];
    this.listeners.set(event, listeners.filter((listener) => listener !== fn));
  }

  emit(event, payload) {
    this.emissions.push({ event, payload });
    for (const listener of [...(this.listeners.get(event) || [])]) listener(payload, event);
  }

  emitted(event) {
    return this.emissions.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }
}

function entity(id, worldRecordId, overrides = {}) {
  const data = {
    worldRecordId,
    shipDefId: `ship_${id}`,
    displayName: `Ship ${id}`,
    ...(overrides.data || {}),
  };
  return {
    id,
    type: 'ship',
    alive: true,
    factionId: overrides.factionId || 'faction_scn',
    ...overrides,
    data,
  };
}

function stateWith(...entities) {
  return {
    story: {},
    tick: 0,
    simTime: 0,
    playerId: 0,
    entities: new Map(entities.map((entry) => [entry.id, entry])),
    entityList: [...entities],
  };
}

function setup(...entities) {
  const state = stateWith(...entities);
  const bus = new TestBus();
  const system = createTitlesSystem();
  system.init({ state, bus, helpers: {} });
  return { state, bus, system };
}

function hold(receiptId, entityId, overrides = {}) {
  return {
    receiptId,
    entityId,
    startedTick: 100,
    endedTick: 3700,
    alliedThreat: 4,
    hostileThreat: 8,
    hostileOutcomes: 3,
    candidateKills: 3,
    survived: true,
    ...overrides,
  };
}

function title(state) {
  return state.story.titles.byId[THUNDERCHILD_TITLE_ID];
}

function resolve(bus, receipt) {
  bus.emit('title:holdResolved', receipt);
}

test('Thunderchild data is frozen, deterministic, and declares the audited earning rule', () => {
  assert.equal(THUNDERCHILD.id, 'title_thunderchild');
  assert.equal(THUNDERCHILD.title, 'Thunderchild');
  assert.equal(THUNDERCHILD.minDurationTicks, 3600);
  assert.deepEqual(THUNDERCHILD.threatRatio, { hostileMultiplier: 2, alliedMultiplier: 3 });
  assert.equal(THUNDERCHILD.minHostileOutcomes, 3);
  assert.equal(THUNDERCHILD.maxKillMarks, 12);
  assert.ok(THUNDERCHILD.aura.radius > 0);
  assert.ok(THUNDERCHILD.aura.morale > 0);
  assert.ok(Object.isFrozen(THUNDERCHILD));
  assert.ok(Object.isFrozen(THUNDERCHILD.threatRatio));
  assert.ok(Object.isFrozen(THUNDERCHILD.aura));
});

test('only a surviving durable ship that held for 3600 ticks against 3:2 threat earns the vacant title', () => {
  const durable = entity(1, 'world:reach:casket:1', { factionId: 'faction_reach', data: { shipDefId: 'ship_casket', displayName: 'Red Mercy' } });
  const transient = entity(2, null, { factionId: 'faction_scn' });
  const { state, bus } = setup(durable, transient);

  resolve(bus, hold('no-durable', transient.id));
  resolve(bus, hold('did-not-survive', durable.id, { survived: false }));
  resolve(bus, hold('too-short', durable.id, { endedTick: 3699 }));
  resolve(bus, hold('too-safe', durable.id, { alliedThreat: 6, hostileThreat: 8 }));
  resolve(bus, hold('too-few-outcomes', durable.id, { hostileOutcomes: 2 }));
  resolve(bus, hold('fractional-receipt', durable.id, { hostileOutcomes: 3.5 }));
  assert.equal(title(state).status, 'vacant');

  resolve(bus, hold('reach-earned', durable.id));
  assert.deepEqual(title(state).holder, {
    shipDefId: 'ship_casket',
    factionId: 'faction_reach',
    displayName: 'Red Mercy',
  });
  assert.equal(title(state).holderKey, 'world:reach:casket:1');
  assert.equal(title(state).earnedTick, 3700);
  assert.equal(title(state).killMarks, 0);
  assert.equal(title(state).successionCount, 0);
  assert.deepEqual(state.story.titlesSeen, [{
    id: 'title_thunderchild:0:world:reach:casket:1',
    title: 'Thunderchild',
    seenAt: 3700,
    holderKey: 'world:reach:casket:1',
  }]);

  const earned = bus.emitted('title:earned');
  assert.equal(earned.length, 1);
  assert.equal(earned[0].receiptId, 'reach-earned');
  assert.equal(bus.emitted('title:auraChanged')[0].active, true);
  assert.deepEqual(bus.emitted('news:publish')[0], {
    text: 'Red Mercy has earned the title Thunderchild.',
    kind: 'title_earned',
    titleId: 'title_thunderchild',
    holderKey: 'world:reach:casket:1',
    channelId: 'news',
    receiptId: 'title:earned:reach-earned',
  });
});

test('duplicate receipts are idempotent and a living holder cannot be displaced', () => {
  const holder = entity(1, 'world:holder');
  const challenger = entity(2, 'world:challenger', { factionId: 'faction_dmc' });
  const { state, bus } = setup(holder, challenger);
  resolve(bus, hold('holder-earned', holder.id));
  resolve(bus, hold('challenger-one', challenger.id, { alliedThreat: 6, hostileThreat: 10, endedTick: 4000 }));
  resolve(bus, hold('challenger-one', challenger.id, { alliedThreat: 1, hostileThreat: 99, endedTick: 8000 }));
  resolve(bus, hold('challenger-worse', challenger.id, { alliedThreat: 4, hostileThreat: 7, endedTick: 3900 }));
  resolve(bus, hold('challenger-better', challenger.id, { alliedThreat: 4, hostileThreat: 12, endedTick: 4100 }));

  assert.equal(title(state).holderKey, 'world:holder');
  assert.equal(title(state).candidates.length, 1);
  assert.equal(title(state).candidates[0].holderKey, 'world:challenger');
  assert.equal(title(state).candidates[0].receiptId, 'challenger-better');
  assert.equal(bus.emitted('title:earned').length, 1);
  assert.equal(bus.emitted('title:succession').length, 0);
});

test('successor comparator uses ratio, outcomes, duration, earlier qualification, then lexical holder key', () => {
  const base = {
    alliedThreat: 4,
    hostileThreat: 8,
    hostileOutcomes: 3,
    startedTick: 100,
    endedTick: 3700,
  };
  assert.ok(compareThunderchildCandidates({ ...base, hostileThreat: 9, holderKey: 'world:z' }, { ...base, hostileThreat: 8, holderKey: 'world:a' }) < 0);
  assert.ok(compareThunderchildCandidates({ ...base, hostileOutcomes: 4, holderKey: 'world:z' }, { ...base, hostileOutcomes: 3, holderKey: 'world:a' }) < 0);
  assert.ok(compareThunderchildCandidates({ ...base, startedTick: 0, holderKey: 'world:z' }, { ...base, startedTick: 200, holderKey: 'world:a' }) < 0);
  assert.ok(compareThunderchildCandidates({ ...base, endedTick: 3600, startedTick: 0, holderKey: 'world:z' }, { ...base, endedTick: 3700, startedTick: 100, holderKey: 'world:a' }) < 0);
  assert.ok(compareThunderchildCandidates({ ...base, holderKey: 'world:a' }, { ...base, holderKey: 'world:z' }) < 0);
  assert.ok(compareThunderchildCandidates(
    { ...base, alliedThreat: 0, hostileThreat: 1, hostileOutcomes: 4, holderKey: 'world:b' },
    { ...base, alliedThreat: 0, hostileThreat: 100, hostileOutcomes: 3, holderKey: 'world:a' },
  ) < 0, 'two infinite ratios tie before hostile-outcome comparison');
  assert.ok(compareThunderchildCandidates(
    { ...base, alliedThreat: 4, hostileThreat: 8, holderKey: 'world:z-finite' },
    { ...base, alliedThreat: 0, hostileThreat: 0, holderKey: 'world:a-zero' },
  ) < 0, 'a finite positive ratio outranks the defined zero value of 0/0');
});

test('canonical holder death moves the aura to the best cross-faction successor and publishes literal news', () => {
  const incumbent = entity(1, 'world:incumbent', { data: { displayName: 'Old Thunder' } });
  const weaker = entity(2, 'world:weaker', { factionId: 'faction_scn', data: { displayName: 'Grey Watch' } });
  const winner = entity(3, 'world:winner', { factionId: 'faction_reach', data: { shipDefId: 'ship_scythe', displayName: 'Knifewake' } });
  const { state, bus } = setup(incumbent, weaker, winner);
  resolve(bus, hold('incumbent-earned', incumbent.id));
  resolve(bus, hold('weaker-qualified', weaker.id, { alliedThreat: 4, hostileThreat: 8 }));
  resolve(bus, hold('winner-qualified', winner.id, { alliedThreat: 4, hostileThreat: 10 }));

  incumbent.alive = false;
  state.tick = 5000;
  bus.emit('entity:killed', { id: incumbent.id, killerId: 99 });

  assert.equal(title(state).holderKey, 'world:winner');
  assert.equal(title(state).holder.factionId, 'faction_reach');
  assert.equal(title(state).earnedTick, 5000, 'the successor earns the title when it passes, not when its hold qualified');
  assert.equal(title(state).successionCount, 1);
  assert.equal(title(state).candidates.length, 1);
  assert.equal(title(state).candidates[0].holderKey, 'world:weaker');
  assert.equal(state.story.titlesSeen.at(-1).seenAt, 5000);
  assert.deepEqual(bus.emitted('title:succession')[0], {
    titleId: 'title_thunderchild',
    title: 'Thunderchild',
    previousHolderKey: 'world:incumbent',
    previousHolder: { shipDefId: 'ship_1', factionId: 'faction_scn', displayName: 'Old Thunder' },
    holderKey: 'world:winner',
    holder: { shipDefId: 'ship_scythe', factionId: 'faction_reach', displayName: 'Knifewake' },
    tick: 5000,
    successionCount: 1,
    cause: 'holder_killed',
    receiptId: 'title:succession:1:world:winner',
  });
  assert.equal(bus.emitted('title:auraChanged').at(-1).holderKey, 'world:winner');
  assert.deepEqual(bus.emitted('news:publish').at(-1), {
    text: 'The Thunderchild is dead. Knifewake carries the title now.',
    kind: 'title_succession',
    titleId: 'title_thunderchild',
    holderKey: 'world:winner',
    previousHolderKey: 'world:incumbent',
    channelId: 'news',
    receiptId: 'title:succession:1:world:winner',
  });
});

test('holder kills add one exact-once kill mark while non-holder kills do not', () => {
  const holder = entity(1, 'world:holder');
  const other = entity(2, 'world:other');
  const victim = entity(3, 'world:victim');
  const victim2 = entity(4, 'world:victim2');
  const { state, bus } = setup(holder, other, victim, victim2);
  resolve(bus, hold('holder-earned', holder.id));
  state.tick = 4000;
  bus.emit('entity:killed', { id: victim.id, killerId: holder.id });
  bus.emit('entity:killed', { id: victim.id, killerId: holder.id });
  bus.emit('entity:killed', { id: victim2.id, killerId: other.id });

  for (let index = 0; index < 13; index++) {
    const markedVictim = entity(100 + index, `world:marked-victim:${index}`);
    state.entities.set(markedVictim.id, markedVictim);
    state.entityList.push(markedVictim);
    state.tick += 1;
    bus.emit('entity:killed', { id: markedVictim.id, killerId: holder.id });
  }

  assert.equal(title(state).killMarks, THUNDERCHILD.maxKillMarks, 'visible kill marks stop at the decal-ready cap');
  assert.deepEqual(bus.emitted('title:killMarksChanged')[0], {
    titleId: 'title_thunderchild',
    title: 'Thunderchild',
    holderKey: 'world:holder',
    killMarks: 1,
    victimKey: 'world:victim',
    tick: 4000,
    receiptId: 'title:kill:4000:world:victim',
  });
  assert.equal(bus.emitted('title:killMarksChanged').length, 14);
});

test('despawn, sector exit, and a non-holder death never transfer; holder death with no successor leaves vacancy', () => {
  const holder = entity(1, 'world:holder', { data: { displayName: 'Last Light' } });
  const bystander = entity(2, 'world:bystander');
  const { state, bus } = setup(holder, bystander);
  resolve(bus, hold('holder-earned', holder.id));
  bus.emit('entity:destroyed', { id: holder.id });
  bus.emit('sector:exit', { continuous: false });
  bus.emit('entity:killed', { id: bystander.id, killerId: 99 });
  assert.equal(title(state).holderKey, 'world:holder');

  state.tick = 4300;
  holder.alive = false;
  bus.emit('entity:killed', { id: holder.id, killerId: 99 });
  assert.equal(title(state).status, 'vacant');
  assert.equal(title(state).holderKey, null);
  assert.equal(title(state).holder, null);
  assert.equal(title(state).successionCount, 1);
  assert.equal(bus.emitted('title:auraChanged').at(-1).active, false);
  assert.equal(bus.emitted('news:publish').at(-1).text, 'The Thunderchild is dead. The title waits.');
});

test('a canonically killed candidate is removed and can never inherit later', () => {
  const holder = entity(1, 'world:holder');
  const candidate = entity(2, 'world:dead-candidate');
  const { state, bus } = setup(holder, candidate);
  resolve(bus, hold('holder-earned', holder.id));
  resolve(bus, hold('candidate-qualified', candidate.id, { hostileThreat: 10 }));
  assert.equal(title(state).candidates.length, 1);

  state.tick = 4200;
  candidate.alive = false;
  bus.emit('entity:killed', { id: candidate.id, killerId: 99 });
  assert.equal(title(state).holderKey, 'world:holder');
  assert.deepEqual(title(state).candidates, []);
  assert.equal(bus.emitted('title:succession').length, 0);

  state.tick = 4300;
  holder.alive = false;
  bus.emit('entity:killed', { id: holder.id, killerId: 99 });
  assert.equal(title(state).status, 'vacant');
  assert.equal(title(state).holderKey, null);
});

test('save-loaded silently rebinds a JSON-roundtripped holder and preserves deterministic succession candidates', () => {
  const incumbent = entity(1, 'world:incumbent');
  const candidate = entity(2, 'world:candidate', { data: { displayName: 'Second Bell' } });
  const first = setup(incumbent, candidate);
  resolve(first.bus, hold('incumbent-earned', incumbent.id));
  resolve(first.bus, hold('candidate-qualified', candidate.id, { hostileThreat: 9 }));

  const savedStory = JSON.parse(JSON.stringify(first.state.story));
  assert.equal(JSON.stringify(savedStory).includes('entityId'), false, 'runtime entity ids never enter durable title state');
  const restoredIncumbent = entity(101, 'world:incumbent');
  const restoredCandidate = entity(102, 'world:candidate', { data: { displayName: 'Second Bell' } });
  const restored = setup(restoredIncumbent, restoredCandidate);
  restored.state.story = savedStory;
  restored.bus.emissions.length = 0;
  restored.bus.emit('save:loaded', {});
  assert.deepEqual(restored.bus.emissions, [{ event: 'save:loaded', payload: {} }]);

  restored.state.tick = 8000;
  restoredIncumbent.alive = false;
  restored.bus.emit('entity:killed', { id: restoredIncumbent.id, killerId: 99 });
  assert.equal(title(restored.state).holderKey, 'world:candidate');
  assert.equal(title(restored.state).holder.displayName, 'Second Bell');
});

test('candidate, history, processed-receipt, and title-sighting collections remain bounded', () => {
  const incumbent = entity(1, 'world:incumbent');
  const challengers = Array.from({ length: TITLE_CANDIDATE_LIMIT + 7 }, (_, index) => entity(index + 2, `world:candidate:${String(index).padStart(2, '0')}`));
  const { state, bus } = setup(incumbent, ...challengers);
  resolve(bus, hold('incumbent-earned', incumbent.id));
  for (let index = 0; index < challengers.length; index++) {
    resolve(bus, hold(`candidate-${index}`, challengers[index].id, { hostileThreat: 8 + index }));
  }
  assert.equal(title(state).candidates.length, TITLE_CANDIDATE_LIMIT);

  for (let index = 0; index < TITLE_PROCESSED_RECEIPT_LIMIT + 9; index++) {
    resolve(bus, hold(`invalid-${index}`, 999999, { endedTick: 0 }));
  }
  assert.equal(title(state).processedReceiptIds.length, TITLE_PROCESSED_RECEIPT_LIMIT);

  title(state).history = Array.from({ length: TITLE_HISTORY_LIMIT + 9 }, (_, index) => ({ kind: 'legacy', tick: index }));
  title(state).killMarks = 999;
  state.story.titlesSeen = Array.from({ length: TITLES_SEEN_LIMIT + 9 }, (_, index) => ({ id: `legacy-${index}`, title: 'Thunderchild', seenAt: index, holderKey: `world:${index}` }));
  bus.emit('save:loaded', {});
  assert.equal(title(state).killMarks, THUNDERCHILD.maxKillMarks);
  assert.equal(title(state).history.length, TITLE_HISTORY_LIMIT);
  assert.equal(state.story.titlesSeen.length, TITLES_SEEN_LIMIT);
});

test('S4 groundwork stays isolated from integration, UI, station, render, save, news, and morale owners', async () => {
  const [dataSource, systemSource] = await Promise.all([
    readFile(new URL('../src/data/titles.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/systems/titles.js', import.meta.url), 'utf8'),
  ]);
  const source = `${dataSource}\n${systemSource}`;
  for (const forbidden of [
    '../core/registry.js', '../core/gameState.js', '../save/', '../ui/', '../render/',
    'styles/ui.css', 'state.player', 'player.titles', 'wingMorale', 'lossLedger',
    "bus.on('entity:destroyed'", "bus.on('sector:exit'", 'Math.random(',
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden surface: ${forbidden}`);
  }
  assert.match(systemSource, /bus\.on\('title:holdResolved'/);
  assert.match(systemSource, /bus\.on\('entity:killed'/);
  assert.match(systemSource, /bus\.on\('save:loaded'/);
});
