// INF-story — the world remembers YOUR ship dying, in one line a player would repeat.
//
// Before this unit the biggest single beat in the game left the memory owners silent or generic:
//   • lossLedger skipped the player entity entirely and nothing subscribed to `player:death`
//     (lossLedger._handleEntityKilled: `p.id === state.playerId` return), so `lossesFor(sector)`
//     held no row for your hull — and your own wreck then read SOMEONE ELSE'S provenance via
//     `_tagWreck`'s latestLossFor, with a generic class label threatening 'Your Hull';
//   • the chronicler had no `player:death` in FACT_EVENTS — no fact, no story, no ticker line,
//     no dock recall for the day you died;
//   • the ship ledger's only trace was the circular sink line ("Paid 500 cr for hull insurance
//     because of the hull deductible") with no hull name, killer or place.
// The defeat receipt (combat/playerDefeat.buildDefeatReceipt) already carried the real citation:
// killerId, attacker label, weapon, cause sentence. This pins the recording of it.
//
// Contract (deterministic, sim-time only; payload shapes copied from the real emitters):
//   1. combat receipt  — combat.js beginPlayerDefeat → `player:death` { ...receipt, recoverable,
//      victimVel } with killerId/attacker/weapon/cause (playerDefeat.buildDefeatReceipt);
//   2. hazard receipt  — world.js radiation death → `player:death` { recoverable, origin,
//      victimVel } with NO killer and NO attacker;
//   3. the chronicler archives a kill fact with the seats swapped (subject = the player, actor =
//      the receipt's attacker) and, after settle, the ticker carries the one-line summary;
//   4. the loss ledger files one durable ledger-only row (no news voice, no ghost-convoy lane
//      count), the ship ledger renders it naming your hull and the sector, and the player wreck
//      takes its OWN provenance while keeping its authored 'Your Hull' identity.
//
// Run: node --test test/inf-story-player-loss-memory.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { chronicler } from '../src/systems/chronicler.js';
import { latestLossFor, lossLedger } from '../src/systems/lossLedger.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { createMarketNews } from '../src/ui/marketNews.js';

const SEED = 4242;

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [chronicler] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  const ticker = createMarketNews({
    state: sim.state, bus: sim.bus, helpers: { voice: { say: () => false } },
  });
  return { sim, state: sim.state, bus: sim.bus, chron: sim.registry.get('chronicler'), ticker };
}

function facts(state) {
  return state.chronicler.stories.flatMap((s) => s.nodes);
}

function factsFor(state, event) {
  return facts(state).filter((f) => f.event === event);
}

function step(t, ticks = 1) {
  for (let i = 0; i < ticks; i++) t.sim.step();
}

/** Real combat defeat receipt shape (fields read by the after-action screen and the ledgers). */
function defeatReceipt(over = {}) {
  return {
    schemaVersion: 1,
    tick: 1200,
    simTime: 20,
    killerId: 77,
    attacker: 'Reach Cutlass',
    factionId: 'faction_reach',
    faction: 'Reach',
    weaponId: 'weapon_lance',
    weapon: 'Lance',
    dominantLayer: 'hull',
    direction: 'ASTERN',
    vitalsPct: { shield: 0, armor: 0, hull: 0 },
    context: 'combat',
    cause: 'Destroyed by a Reach Cutlass lance while drifting unshielded',
    fatalSummary: 'A lance round broke the hull astern.',
    pos: { x: 10, z: 20 },
    recovery: { stationId: 'station_ceres', costCr: 500, insuranceStatus: 'insured' },
    ...over,
  };
}

test('your defeat is a cited kill fact, the ticker speaks it, and a replay dedupes', () => {
  const t = boot();
  t.state.entities.set(77, { id: 77, type: 'ship', data: { callsign: 'RIME-6' } });

  t.bus.emit('player:death', { ...defeatReceipt(), recoverable: true, victimVel: { x: 4, z: 0 } });
  t.bus.emit('player:death', { ...defeatReceipt(), recoverable: true, victimVel: { x: 4, z: 0 } });
  step(t, 200); // ingest, settle (2s), publish wake

  const deaths = factsFor(t.state, 'player:death');
  assert.equal(deaths.length, 1, 'one fact per defeat — the synchronous replay dedupes');
  const fact = deaths[0];
  assert.equal(fact.stage, 'kill', 'the death rides the kill stage, seats swapped');
  assert.equal(fact.subject.player, true, 'the victim seat is the player');
  assert.equal(fact.subject.name, 'you', 'the player identity; prose renders it as "your ship"');
  assert.equal(fact.actor.name, 'Reach Cutlass', 'the actor is whoever the receipt names');
  assert.equal(fact.actor.player, false, 'a death claims no kill');
  assert.ok(fact.details.reason.includes('Reach Cutlass lance'),
    `the receipt's own cause sentence is the citation: ${fact.details.reason}`);

  const view = t.chron.query({}).find((v) => v.kind === 'battle' && String(v.title).startsWith('Your hull'));
  assert.ok(view, 'the death forms a speakable story view');
  assert.equal(view.title, 'Your hull went dark in ceres belt');
  assert.equal(view.summary, 'Reach Cutlass destroyed your ship in ceres belt.',
    'the one line a player would repeat, citing the real change');
  assert.ok(view.score >= 38, `a player death clears the news floor: ${view.score}`);

  const tickerRows = t.state.ui.marketNews.log.filter((row) => row.text === view.summary);
  assert.ok(tickerRows.length >= 1, 'the ticker remembered the day you died');
  assert.ok(tickerRows[0].evidence.length >= 1, 'the ticker line cites its evidence');

  // The saved death fact validates on load (persistence EVENT_STAGES contract).
  const snapshot = JSON.parse(JSON.stringify(t.chron.serialize()));
  assert.doesNotThrow(() => t.chron.deserialize(snapshot), 'the saved death fact validates on load');
  assert.equal(factsFor(t.state, 'player:death').length, 1, 'the death survives the round-trip');
});

test('a hazard death with no killer still speaks, without crediting a phantom pilot', () => {
  const t = boot();
  // world.js radiation shape: { recoverable, origin, victimVel } — no killer, no attacker.
  t.bus.emit('player:death', {
    recoverable: true, origin: { kind: 'hazard_radiation' }, victimVel: { x: 0, z: 0 },
  });
  step(t, 200);

  const deaths = factsFor(t.state, 'player:death');
  assert.equal(deaths.length, 1);
  assert.equal(deaths[0].actor.id, null, 'no killer, no invented attacker id');
  const view = t.chron.query({}).find((v) => String(v.title).startsWith('Your hull'));
  assert.ok(view, 'the hazard death still forms a story');
  assert.equal(view.summary, 'Your ship was destroyed in ceres belt.',
    'an unattributed loss is spoken without a phantom pilot');
  const tickerRows = t.state.ui.marketNews.log.filter((row) => row.text === view.summary);
  assert.ok(tickerRows.length >= 1, 'the ticker carries it too');
});

// ---- loss ledger / ship ledger harness (same shape as loss-ledger-kill-provenance) ----------

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
    },
    off(name, fn) {
      handlers.set(name, (handlers.get(name) || []).filter((entry) => entry !== fn));
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of [...(handlers.get(name) || [])]) fn(payload);
    },
  };
}

function makeState() {
  return {
    meta: { seed: SEED },
    simTime: 720,
    playerId: 1,
    entities: new Map(),
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: { id: 'sector_helios_prime', name: 'Helios Prime', owner: 'faction_scn' },
      },
    },
  };
}

function makeSystem(state, bus = makeBus(), voice = { say: () => true }) {
  const system = { ...lossLedger };
  system.init({ state, bus, helpers: { voice }, registry: { get: () => null } });
  return { system, bus };
}

test('the loss ledger files your hull, the ship ledger keeps the row, and it survives a save', () => {
  const state = makeState();
  state.entities.set(1, {
    id: 1, type: 'ship', factionId: 'faction_scn',
    data: { defId: 'ship_kestrel', shipName: 'Tessera', callsign: 'TESS-1' },
  });
  const voiceCalls = [];
  const bus = makeBus();
  const { system } = makeSystem(state, bus, {
    say(cue) { voiceCalls.push(cue); return true; },
  });

  bus.emit('player:death', {
    ...defeatReceipt({ killerId: 77, attacker: 'Reach Cutlass' }),
    recoverable: true, victimVel: { x: 0, z: 0 },
  });

  const entry = latestLossFor(state, 'sector_helios_prime');
  assert.ok(entry, 'your loss is on the sector ring');
  assert.equal(entry.source, 'player:death');
  assert.equal(entry.kind, 'ship');
  assert.equal(entry.victimName, 'Tessera', 'your hull keeps its name');
  assert.equal(entry.victimCallsign, 'TESS-1');
  assert.equal(entry.killerId, 77);
  assert.equal(entry.killedByPlayer, false, 'a death is not a kill, even in the ledger');

  assert.equal(voiceCalls.filter((cue) => cue.channel === 'news').length, 0,
    'a defeat must not consume the one-voice news channel');
  assert.equal(bus.emitted.some((e) => e.name === 'rumor:ghostConvoy'), false);
  assert.equal(bus.emitted.some((e) => e.name === 'mission:offered'), false);
  assert.equal(bus.emitted.filter((e) => e.name === 'lossLedger:recorded').length, 1,
    'durable downstream consumers still receive exactly one receipt');

  // The ship ledger renders the row: your hull's retained identity, the sector, no invented
  // killer. (The row prefers the retained callsign over the hull name — existing pinned
  // preference, loss-ledger-kill-provenance "named victim identity".)
  const model = buildShipLedger(state, { page: 0, pageSize: 12 });
  const lossRow = model.entries.find((row) => row.type === 'loss');
  assert.ok(lossRow, 'the ship ledger keeps the loss row');
  assert.match(lossRow.text, /TESS-1|Tessera/, `the row names your hull: ${lossRow.text}`);
  assert.match(lossRow.text, /Helios Prime/, `the row cites the sector: ${lossRow.text}`);
  assert.equal(lossRow.playerCaused, false);

  // Round-trip through save.
  const snapshot = JSON.parse(JSON.stringify(system.serialize()));
  const restoredState = makeState();
  const { system: restored } = makeSystem(restoredState);
  restored.deserialize(snapshot);
  const restoredEntry = latestLossFor(restoredState, 'sector_helios_prime');
  assert.equal(restoredEntry.lossId, entry.lossId);
  assert.equal(restoredEntry.victimName, 'Tessera');
  assert.equal(restoredEntry.source, 'player:death');

  system.destroy();
  restored.destroy();
});

test('your own wreck reads its own provenance and keeps its authored identity', () => {
  const state = makeState();
  state.entities.set(1, {
    id: 1, type: 'ship', factionId: 'faction_scn',
    data: { defId: 'ship_kestrel', shipName: 'Tessera' },
  });
  const bus = makeBus();
  const { system } = makeSystem(state, bus);

  bus.emit('player:death', {
    ...defeatReceipt({ killerId: 77 }), recoverable: true, victimVel: { x: 0, z: 0 },
  });
  const entry = latestLossFor(state, 'sector_helios_prime');

  // The player wreck materializes (aftermathWrecks _specForMarker) as type 'wreck' with the
  // authored 'Your Hull' label and its own marker class.
  const playerWreck = {
    id: 900, type: 'wreck',
    data: { sectorId: 'sector_helios_prime', playerWreck: true, scanLabel: 'Your Hull',
      wreckClass: 'fresh', wreckClassLabel: 'Your Hull' },
  };
  bus.emit('entity:spawned', { id: 900, type: 'wreck', entity: playerWreck });

  assert.equal(playerWreck.data.scanLabel, 'Your Hull', 'the authored label survives');
  assert.equal(playerWreck.data.wreckClass, 'fresh', 'the marker class survives');
  assert.ok(playerWreck.data.provenance, 'the wreck now carries provenance');
  assert.equal(playerWreck.data.provenance.lossId, entry.lossId,
    'the provenance names YOUR loss, not whatever the sector lost last');

  // An ordinary wreck in the same sector keeps the existing enrichment behavior.
  const npcWreck = {
    id: 901, type: 'wreck',
    data: { sectorId: 'sector_helios_prime' },
  };
  bus.emit('entity:spawned', { id: 901, type: 'wreck', entity: npcWreck });
  assert.ok(npcWreck.data.wreckClass && npcWreck.data.wreckClass !== 'fresh',
    'non-player wrecks still take the class enrichment');
  assert.ok(npcWreck.data.scanLabel, 'non-player wrecks still take a scan label');

  system.destroy();
});
