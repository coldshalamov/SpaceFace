import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARKS,
  BARK_FACTIONS,
  BARK_SITUATIONS,
  BARK_SITUATION_RULES,
  barkFor,
} from '../src/data/barks.js';
import { SECTORS } from '../src/data/sectors.js';
import { STATION_SLOGANS, stationSloganFor } from '../src/data/stationSlogans.js';
import {
  FACTION_NAME_BANKS,
  ordinaryShipIdentity,
} from '../src/data/factionNameBanks.js';
import { PLAYER_DEEDS } from '../src/data/titles.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { createTitlesSystem } from '../src/systems/titles.js';
import { traffic } from '../src/systems/traffic.js';
import { barContactIntelTags, buildReply, generateContacts } from '../src/ui/screens/bar.js';
import { targetDisplayName } from '../src/ui/targetPanel.js';

class TestBus {
  constructor() {
    this.listeners = new Map();
    this.emissions = [];
  }

  on(event, listener) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    const listeners = this.listeners.get(event) || [];
    this.listeners.set(event, listeners.filter((entry) => entry !== listener));
  }

  emit(event, payload) {
    this.emissions.push({ event, payload });
    for (const listener of [...(this.listeners.get(event) || [])]) listener(payload);
  }

  emitted(event) {
    return this.emissions.filter((entry) => entry.event === event).map((entry) => entry.payload);
  }
}

function ship(id, overrides = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: overrides.team ?? 0,
    factionId: overrides.factionId || 'faction_free',
    pos: overrides.pos || { x: 0, z: 0 },
    data: { ...(overrides.data || {}) },
  };
}

function titleHarness(story = {}) {
  const player = ship(1);
  const heavy = ship(9, {
    team: 1,
    factionId: 'faction_reach',
    data: { heavyDisabled: true, towable: true },
  });
  const state = {
    story,
    tick: 1200,
    simTime: 20,
    playerId: player.id,
    entities: new Map([[player.id, player], [heavy.id, heavy]]),
    entityList: [player, heavy],
  };
  const bus = new TestBus();
  const system = createTitlesSystem();
  system.init({ state, bus, helpers: {} });
  return { state, bus, system, player, heavy };
}

function kill(bus, state, cause, victimId, overrides = {}) {
  const payload = {
    id: victimId,
    killerId: state.playerId,
    victimClass: overrides.victimClass,
    presentation: { style: { id: cause, ...(overrides.style || {}) } },
  };
  bus.emit('entity:killed', payload);
  bus.emit('entity:killed', payload);
}

test('ordinary combat and traffic routes consume faction/role banks as stable scan identities', () => {
  assert.equal(FACTION_NAME_BANKS.faction_verge_layers.shipNames.includes('Edge Case'), false,
    'the Verge bank never breaks fiction with a developer wink');
  const reachA = makeEnemySpawnSpec('reaver_pirate', 3, { x: 180, z: -40 }, {
    startedTick: 600,
    identityKey: 'ordinary:reach:1',
  });
  const reachB = makeEnemySpawnSpec('reaver_pirate', 12, { x: 180, z: -40 }, {
    startedTick: 600,
    identityKey: 'ordinary:reach:1',
  });
  assert.equal(reachA.data.ai.name, reachB.data.ai.name,
    'difficulty does not rename the same ordinary contact');
  assert.equal(reachA.data.callsign, reachB.data.callsign);
  assert.equal(targetDisplayName(reachA), reachA.data.ai.name,
    'the live target panel reads the ordinary encounter identity');
  assert.equal(reachA.data.ordinaryIdentity.factionId, 'faction_reach');
  assert.equal(reachA.data.ordinaryIdentity.role, reachA.data.ai.archetype);

  reachA.data.ai.name = 'Authored Boss';
  assert.equal(targetDisplayName(reachA), 'Authored Boss',
    'authored boss/ace identity still outranks the ordinary callsign');

  const trafficSystem = Object.assign(Object.create(traffic), {
    state: { meta: { seed: 29 }, tick: 90 },
  });
  const first = ship(20, {
    team: 2,
    factionId: 'faction_mts',
    pos: { x: 144, z: -52 },
    data: { factionId: 'faction_mts', ai: { archetype: 'fleeing_trader', passive: true } },
  });
  const second = ship(21, {
    team: 2,
    factionId: 'faction_mts',
    pos: { x: 144, z: -52 },
    data: { factionId: 'faction_mts', ai: { archetype: 'fleeing_trader', passive: true } },
  });
  trafficSystem._stampTrafficDurableIdentity(first, 'sector_helios_prime', 'hauler', { label: 'Cargo Hauler' }, 2);
  trafficSystem._stampTrafficDurableIdentity(second, 'sector_helios_prime', 'hauler', { label: 'Cargo Hauler' }, 2);
  assert.equal(first.data.worldRecordId, second.data.worldRecordId);
  assert.equal(first.data.name, second.data.name);
  assert.equal(first.data.callsign, second.data.callsign);
  assert.equal(targetDisplayName(first), first.data.name,
    'ordinary default-route traffic exposes the bank name on scan');
  assert.match(first.data.callsign, /^MER-(LOAD|AXLE|MANIFEST)-\d{2}$/);

  for (const factionId of Object.keys(FACTION_NAME_BANKS)) {
    const identity = ordinaryShipIdentity(factionId, 'patrol', 0x29a5f00d);
    assert.ok(identity.name && identity.callsign, `${factionId} has a live name projection`);
    assert.equal(identity.factionId, factionId);
    assert.equal(identity.roleFamily, 'patrol');
  }
});

test('canonical physical receipts earn each player deed exactly once and survive Continue', () => {
  assert.equal(PLAYER_DEEDS.find((entry) => entry.id === 'deed_smokewalker')?.title, 'Smokewalker');
  assert.equal(PLAYER_DEEDS.find((entry) => entry.id === 'deed_linehauler')?.title, 'Linehauler');
  const { state, bus, player, heavy } = titleHarness();
  kill(bus, state, 'terrain_smash', 101);
  kill(bus, state, 'chain', 102, { style: { chainDepth: 3 } });
  kill(bus, state, 'well_collapse', 103);
  kill(bus, state, 'burn_up', 104);

  const strip = {
    parentId: heavy.id,
    partId: 'drive-port',
    entityId: 91,
    attackerId: state.playerId,
  };
  bus.emit('heavyPart:detached', strip);
  bus.emit('heavyPart:detached', strip);
  bus.emit('tether:latched', { targetId: heavy.id, type: 'tether_standard' });
  bus.emit('tether:latched', { targetId: heavy.id, type: 'tether_standard' });
  kill(bus, state, 'ordinary', 105, { victimClass: 'capital' });

  const own = state.story.titles.playerDeeds;
  assert.deepEqual(own.order, PLAYER_DEEDS.map((entry) => entry.id));
  assert.equal(Object.keys(own.earnedById).length, PLAYER_DEEDS.length);
  assert.equal(bus.emitted('title:earned').length, PLAYER_DEEDS.length,
    'duplicate physical receipts cannot announce a title twice');
  assert.equal(bus.emitted('toast').length, PLAYER_DEEDS.length,
    'each first earning reaches the existing live toast surface once');
  assert.equal(state.story.titlesSeen.filter((entry) => entry.holderKey === 'player').length,
    PLAYER_DEEDS.length, 'the existing Ship Ledger source receives every deed');
  assert.deepEqual(player.data.deedTitleIds, PLAYER_DEEDS.map((entry) => entry.id));
  assert.equal(player.data.deedTitleName, 'Keelbreaker');

  const savedStory = structuredClone(state.story);
  const continued = titleHarness();
  const emittedBeforeLoad = continued.bus.emissions.length;
  continued.state.story = savedStory;
  continued.bus.emit('save:loaded', {});
  assert.deepEqual(continued.state.story.titles.playerDeeds, savedStory.titles.playerDeeds);
  assert.deepEqual(continued.player.data.deedTitleIds, PLAYER_DEEDS.map((entry) => entry.id));
  assert.equal(continued.player.data.deedTitleName, 'Keelbreaker');
  assert.equal(continued.bus.emitted('title:earned').length, 0,
    'Continue rebinds deed presentation without re-awarding it');
  assert.equal(continued.bus.emissions.length, emittedBeforeLoad + 1,
    'save:loaded itself is the only Continue bus emission in the focused route');
});

test('unattributed or non-physical outcomes cannot earn player deeds', () => {
  const { state, bus, heavy } = titleHarness();
  bus.emit('entity:killed', {
    id: 200,
    killerId: 99,
    presentation: { style: { id: 'well_collapse' } },
  });
  bus.emit('entity:killed', {
    id: 201,
    killerId: state.playerId,
    presentation: { style: { id: 'ordinary' } },
  });
  bus.emit('heavyPart:detached', {
    parentId: heavy.id,
    partId: 'drive-port',
    attackerId: 99,
  });
  heavy.data.heavyDisabled = false;
  bus.emit('tether:latched', { targetId: heavy.id });
  assert.deepEqual(state.story.titles.playerDeeds.order, []);
  assert.equal(bus.emitted('title:earned').length, 0);
  assert.equal(bus.emitted('toast').length, 0);
});

test('every real station has authored slogan copy repeated by the bar', () => {
  const stationIds = SECTORS.flatMap((sector) => (sector.stations || []).map((station) => station.id));
  assert.equal(Object.keys(STATION_SLOGANS).length, stationIds.length);
  for (const stationId of stationIds) {
    const slogan = stationSloganFor(stationId);
    assert.equal(typeof slogan, 'string', `${stationId} has a slogan`);
    assert.ok(slogan.length >= 8 && slogan.length <= 48, `${stationId} slogan is terse`);
  }

  const contacts = generateContacts('station_helios', {});
  const barkeep = contacts.find((contact) => contact.role === 'barkeep');
  assert.ok(barkeep, 'Helios bar includes a barkeep contact');
  assert.match(barkeep.line, /You Are Leaving\./);
  assert.ok(barContactIntelTags(barkeep, {}, 'station_helios')
    .some((tag) => tag.label === 'Hull' && tag.text === 'You Are Leaving.'));
  assert.match(
    buildReply('barkeep', 'word', { state: {} }, 'station_helios', barkeep).text,
    /You Are Leaving\./,
  );
});

test('faction barks cover context tags with data cooldowns and dying lines use voice arbitration', () => {
  for (const factionId of BARK_FACTIONS) {
    for (const situation of BARK_SITUATIONS) {
      assert.ok(Array.isArray(BARKS[factionId][situation]) && BARKS[factionId][situation].length > 0,
        `${factionId} covers ${situation}`);
      assert.ok(BARK_SITUATION_RULES[situation] && BARK_SITUATION_RULES[situation].cooldownS > 0,
        `${situation} owns a data cooldown`);
    }
  }
  assert.equal(barkFor('faction_reach', 'dying', 0, { archetypeTag: 'heavy' }), 'Core breach.');

  const player = ship(1, { team: 0 });
  const first = ship(2, {
    team: 1,
    factionId: 'faction_reach',
    data: { ai: { archetype: 'heavy_gunship' }, combat: { targetId: 1 } },
  });
  const second = ship(3, {
    team: 1,
    factionId: 'faction_reach',
    data: { ai: { archetype: 'heavy_gunship' }, combat: { targetId: 1 } },
  });
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 10,
    playerId: player.id,
    world: { currentSectorId: 'sector_ceres_belt' },
    meta: { seed: 29 },
    entities: new Map([[player.id, player], [first.id, first], [second.id, second]]),
    entityList: [player, first, second],
  };
  const bus = new TestBus();
  const spoken = [];
  const system = Object.create(barkDirector);
  system.init({ state, bus, helpers: { voice: { say(payload) { spoken.push(payload); return true; } } } });

  bus.emit('entity:killed', { id: first.id, killerId: player.id, victimClass: 'heavy' });
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].channel, 'bark');
  assert.equal(spoken[0].kind, 'barkDirector');
  assert.equal(spoken[0].archetypeTag, 'heavy');
  bus.emit('entity:killed', { id: second.id, killerId: player.id, victimClass: 'heavy' });
  assert.equal(spoken.length, 1, 'same faction/situation cooldown suppresses immediate duplicate death chatter');
  system.destroy();
});
