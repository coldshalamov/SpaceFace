import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';
import { codexScreen, worldCodexEntries, requestCodexTab } from '../src/ui/screens/codex.js';
import { knownAces } from '../src/data/namedAces.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';

// FB-037 — the codex gets a World tab: unique-wreck dispositions, named-ace memories,
// provenance chains held against you, and chronicler stories with citations — all read
// from already-saved bags, computed in the pure worldCodexEntries, rendered through the
// same makeEntry every other tab uses. No new state; no unread-wreck locations.

const ACE = knownAces()[0];
const WRECK = uniqueWreckById('wreck_isc_vigilant');

function worldState() {
  return {
    meta: { seed: 4242 },
    simTime: 60,
    player: {
      uniqueWrecks: {
        bearings: {
          wreck_isc_vigilant: {
            wreckId: 'wreck_isc_vigilant', name: WRECK.name, sectorId: 'sector_veil_nebula',
            phase: 'salvaged', choiceId: 'authority_handover', outcome: 'handed_over',
            resolvedAtS: 40, exactPos: { x: -280, z: 640 },
          },
        },
      },
    },
    aceMemory: { [ACE.id]: { encountered: true, grudge: 4, loyalty: 0, fleeCount: 0 } },
    provenance: {
      v: 1, nextSeq: 2, openIncidents: {},
      chains: [{
        id: 'chain-1', open: true, bountyPending: true, amendsActive: false, outcome: null,
        nodes: [
          { k: 'act', t: 20, tick: 12, factionId: 'faction_scn', text: 'Raid on the Meridian berth', reason: 'raid' },
          { k: 'standing', t: 25, tick: 15, factionId: 'faction_scn', reason: 'standing' },
        ],
        edges: [],
      }],
    },
    chronicler: {
      pending: [], seen: [], profiles: [], legends: [],
      stories: [{
        id: 'story:test-kill', revision: 2, createdAt: 10, updatedAt: 30,
        nodes: [{
          id: 'f1', stage: 'kill', t: 30, seq: 1, group: 'g:test',
          actor: { key: 'player', id: 1, player: true, name: 'You' },
          subject: { key: 'npc:7', id: 7, player: false, name: 'Vesper Gull' },
          details: { cause: 'gunfire', victimClass: 'ship' },
          sectorId: 'sector_helios', sectorName: 'Helios Drift',
          visibility: 'public', parent: null, parentStatus: 'none', dedupe: 'd:1',
        }],
        edges: [], groups: ['g:test'],
      }],
    },
  };
}

test('fb-037: a seed-4242 save with a wreck, a grudge ace, and a chain renders four entries', () => {
  const groups = worldCodexEntries(worldState());
  assert.equal(groups.wrecks.length, 1);
  assert.equal(groups.aces.length, 1);
  assert.equal(groups.chains.length, 1);
  assert.equal(groups.stories.length, 1);
  const total = groups.wrecks.length + groups.aces.length + groups.chains.length + groups.stories.length;
  assert.equal(total, 4, 'one resolved wreck + one grudge ace + one chain + one story = four entries');

  const wreck = groups.wrecks[0];
  assert.equal(wreck.id, 'world:wreck:wreck_isc_vigilant');
  assert.equal(wreck.name, 'ISC Vigilant');
  assert.equal(wreck.meta, 'Resolved');
  assert.match(wreck.body, /Last decision: FILE CONCORD EVIDENCE/, 'the last decision reads as a label, not an id');
  assert.match(wreck.note, /VIGILANT EVIDENCE FILED/, 'the wreck entry cites its receipt');

  const ace = groups.aces[0];
  assert.equal(ace.name, ACE.name);
  assert.equal(ace.meta, 'Holds a grudge');
  assert.match(ace.body, new RegExp(ACE.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the memory line names the captain');

  const chain = groups.chains[0];
  assert.equal(chain.name, 'Raid on the Meridian berth', 'the chain names the act that started it');
  assert.equal(chain.meta, 'Held against you');
  assert.match(chain.body, /bounty still stands/, 'the held-against-you readout names the open hold');
  assert.match(chain.note, /Closing verb: open/, 'an unsettled chain reports itself open');

  const story = groups.stories[0];
  assert.equal(story.name, 'Loss recorded in Helios Drift');
  assert.match(story.body, /You destroyed Vesper Gull in Helios Drift/, 'recall text rides the story view');
  assert.match(story.note, /Cited story:test-kill:r2/, 'the story carries its record citation');
});

test('fb-037: unread wreck bearings never leak a location', () => {
  const state = worldState();
  const bearings = state.player.uniqueWrecks.bearings;
  bearings.wreck_dmc_ironsong = {
    wreckId: 'wreck_dmc_ironsong', name: 'DMC Ironsong', sectorId: 'sector_nyx_cutlane',
    phase: 'rumored', exactPos: { x: 999, z: -999 },
  };
  const spec = worldCodexEntries(state).wrecks.find((entry) => entry.id === 'world:wreck:wreck_dmc_ironsong');
  assert.ok(spec, 'a heard bearing is an entry');
  assert.equal(spec.meta, 'Bearing heard');
  const printed = JSON.stringify(spec);
  assert.equal(printed.includes('nyx_cutlane'), false, 'no sector id in the printed entry');
  assert.equal(printed.includes('999'), false, 'no coordinates in the printed entry');
});

test('fb-037: worldCodexEntries is read-only and hostile to stale saves', () => {
  const state = worldState();
  const snapshot = JSON.stringify(state);
  worldCodexEntries(state);
  assert.equal(JSON.stringify(state), snapshot, 'derivation mutates nothing');

  assert.deepEqual(worldCodexEntries(null), { wrecks: [], aces: [], chains: [], stories: [] });
  assert.deepEqual(worldCodexEntries({}), { wrecks: [], aces: [], chains: [], stories: [] });
  // A stale save can name a wreck that no longer exists and a phase the current code dropped.
  const stale = {
    player: { uniqueWrecks: { bearings: {
      wreck_gone_forever: { wreckId: 'wreck_gone_forever', phase: 'obliterated' },
    } } },
  };
  const groups = worldCodexEntries(stale);
  assert.equal(groups.wrecks.length, 1, 'an unknown wreck still files by its own name');
  assert.equal(groups.wrecks[0].name, 'wreck_gone_forever');
  assert.equal(groups.wrecks[0].meta, 'Bearing heard', 'an unknown phase falls back to the unread state');
  // Neutral aces and un-encountered records are silent, not noise.
  const quiet = { aceMemory: { [ACE.id]: { encountered: true, grudge: 0 } } };
  assert.equal(worldCodexEntries(quiet).aces.length, 0);
});

test('fb-037: the World tab renders its entries through the same entry path every tab uses', () => {
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom();
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  try {
    codexScreen._sections = [];
    codexScreen._entries = [];
    codexScreen._renderWorld({ state: worldState() });
    assert.equal(codexScreen._sections.length, 4, 'the tab keeps the four world sections');
    assert.equal(codexScreen._entries.length, 4, 'four entries render through makeEntry');
    for (const entry of codexScreen._entries) {
      assert.ok(entry.article, `${entry.id} carries a real article`);
      const text = textLines(entry.article).join('\n');
      assert.ok(text.includes(entry.name), `${entry.id} prints its name in the article`);
    }
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});

test('fb-037: requestCodexTab(\'World\') deep-links to the new tab', () => {
  const state = worldState();
  const previous = {
    activeTab: codexScreen._activeTab, body: codexScreen._body,
    ctx: codexScreen._ctx, visible: codexScreen._visible,
  };
  try {
    codexScreen._body = null;
    codexScreen._activeTab = 'Story';
    requestCodexTab('World');
    codexScreen.onShow({ state });
    assert.equal(codexScreen._activeTab, 'World', 'the deep link lands on the world tab');
  } finally {
    Object.assign(codexScreen, previous);
  }
  // An unknown tab name still fails closed at the request edge.
  requestCodexTab('Not A Tab');
  try {
    codexScreen._body = null;
    codexScreen._activeTab = 'Ship';
    codexScreen.onShow({ state });
    assert.equal(codexScreen._activeTab, 'Ship', 'a stale request cannot redirect the screen');
  } finally {
    Object.assign(codexScreen, previous);
  }
});
