import assert from 'node:assert/strict';
import test from 'node:test';

import {
  barContactIntelTags,
  barRegularStoryLine,
  barWarTalkLine,
  buildReply,
  generateContacts,
  warRecordForFaction,
} from '../src/ui/station/barContacts.js';
import { FACTION_META } from '../src/data/factions.js';
import { SECTORS } from '../src/data/sectors.js';
import { getActiveAceRouteForSector } from '../src/data/namedAces.js';

// The contested pair whose front sector is Tethys Junction: Concord drilling company against
// the Meridian trade school. station_tethys (Tethys Trade Hub) is an MTS house.
const PAIR = 'faction_dmc:faction_mts';
const HOUSE = 'faction_mts';
const RIVAL = 'faction_dmc';
const TETHYS = 'station_tethys';

function warState(overrides = {}) {
  return {
    meta: { seed: 4242 },
    simTime: 600 * 3,
    world: {
      currentSectorId: 'sector_tethys_junction',
      // Every neighbor already surveyed: the barkeep has no survey packet to pitch, so the
      // war answer stands alone in the reply chain.
      discovery: {
        sector_helios_prime: { discovered: true },
        sector_ceres_belt: { discovered: true },
        sector_vesta_forge: { discovered: true },
        sector_io_reach: { discovered: true },
      },
    },
    conflicts: {
      [PAIR]: {
        tension: 82,
        state: 'war',
        playerLean: 0.3, // positive favors faction_mts — the house
        momentum: 46,
        front: { frontKills: 6, blockade: 1, siege: 0, thrown: 1 },
      },
    },
    ...overrides,
  };
}

const ctx = (state) => ({ state, bus: { emit() {} } });

function factionName(id) {
  const meta = FACTION_META.find((row) => row.id === id);
  return (meta && (meta.short || meta.name)) || id;
}

test('the war record reads the pair, the rival, and nothing when the pair is not at war', () => {
  const war = warRecordForFaction(warState(), HOUSE);
  assert.ok(war, 'a house at war has a war record');
  assert.equal(war.rivalId, RIVAL);
  assert.equal(war.factionId, HOUSE);
  assert.equal(warRecordForFaction(warState(), 'faction_choir'), null, 'an uninvolved house stays wordless');
  const cold = warState();
  cold.conflicts[PAIR].state = 'cold';
  assert.equal(warRecordForFaction(cold, HOUSE), null, 'a cold pair stays quiet, like the arrival desk');
});

test('a contact whose house is at war carries the war as its first intel tag', () => {
  const state = warState();
  const barkeep = { id: 'contact_station_tethys_0', role: 'barkeep', factionId: HOUSE };
  const tags = barContactIntelTags(barkeep, state, TETHYS);
  assert.ok(tags.length >= 1, 'tags still render');
  assert.equal(tags[0].label, 'War', 'the war leads the contact tags');
  assert.match(tags[0].text, new RegExp(factionName(RIVAL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the tag names the rival');
  assert.match(tags[0].text, /Tethys Junction/, 'the tag names the contested front sector');
  // A patron whose own faction fights carries their own house's war, not the station's.
  const miner = { id: 'contact_x_9', role: 'miner', factionId: RIVAL };
  const rivalTags = barContactIntelTags(miner, state, TETHYS);
  assert.equal(rivalTags[0].label, 'War', 'the rival patron speaks for their own house');
  assert.match(rivalTags[0].text, new RegExp(factionName(HOUSE).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'from the other side the rival name flips');
  // No war, no tag: the tag surface is unchanged for every existing fixture state.
  const quiet = barContactIntelTags(barkeep, warState({ conflicts: {} }), TETHYS);
  assert.equal(quiet.some((tag) => tag.label === 'War'), false);
});

test('the word during a war is the war, never the old silence', () => {
  const state = warState();
  const reply = buildReply('barkeep', 'word', ctx(state), TETHYS, { id: 'contact_station_tethys_0', role: 'barkeep', factionId: HOUSE });
  assert.match(reply.text, new RegExp(factionName(RIVAL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the word names the rival');
  assert.match(reply.text, /Tethys Junction/, 'the word names the front');
  assert.doesNotMatch(reply.text, /Ships come, ships go/, 'the old nothing-to-say answer is gone mid-war');
  assert.ok(reply.warPosture, 'the reply carries the conflict posture it read');
  // The player leaned the war toward the house: the room says it noticed.
  assert.match(reply.text, /noticed|your work/, 'a banked lean for the house is read back');
  assert.doesNotMatch(reply.text, /against this house/, 'leaning for the house is not read as betrayal');
});

test('leaning against the house reads differently from leaning for it', () => {
  const against = warState();
  against.conflicts[PAIR].playerLean = -0.3; // favors faction_dmc — against the MTS house
  const reply = buildReply('barkeep', 'word', ctx(against), TETHYS, { id: 'c', role: 'barkeep', factionId: HOUSE });
  assert.match(reply.text, /against this house/, 'a hostile lean is named honestly');
  const neutral = warState();
  neutral.conflicts[PAIR].playerLean = 0;
  const quiet = buildReply('barkeep', 'word', ctx(neutral), TETHYS, { id: 'c', role: 'barkeep', factionId: HOUSE });
  assert.doesNotMatch(quiet.text, /your work/, 'no lean, no accusation');
  assert.doesNotMatch(quiet.text, /noticed here/, 'no lean, no credit');
});

test('rumors answer the war on their days and never lie that things are quiet', () => {
  let warDays = 0;
  let pitchDays = 0;
  for (let day = 0; day < 24; day++) {
    const state = warState({ simTime: 600 * day });
    const reply = buildReply('barkeep', 'rumors', ctx(state), TETHYS, { id: 'c', role: 'barkeep', factionId: HOUSE });
    assert.doesNotMatch(reply.text, /quiet lately/i, 'the too-quiet fallback never lies mid-war');
    if (reply.warPosture) warDays++;
    else pitchDays++;
  }
  assert.ok(warDays > 0, 'the war actually answers rumors sometimes');
  assert.ok(pitchDays > 0, 'the rumor pitch keeps its days — a war never locks the ledger out');
});

test('with no war the added reads are inert — every answer is the old chain', () => {
  const state = warState({ conflicts: {} });
  for (const sector of SECTORS) {
    state.world.discovery[sector.id] = { discovered: true };
  }
  for (const [stationId, house] of [['station_tethys', HOUSE], ['station_io_merc', 'faction_quiet'], ['station_ceres', 'faction_dmc']]) {
    for (let day = 0; day < 10; day++) {
      state.simTime = 600 * day;
      const contact = { id: 'c', role: 'barkeep', factionId: house };
      const rumors = buildReply('barkeep', 'rumors', ctx(state), stationId, contact);
      assert.equal(rumors.warPosture, undefined, 'no war, no war posture on rumors');
      assert.doesNotMatch(rumors.text, /war with/i, 'no war, no war line on rumors');
      const word = buildReply('barkeep', 'word', ctx(state), stationId, contact);
      assert.equal(word.warPosture, undefined, 'no war, no war posture on the word');
      assert.doesNotMatch(word.text, /war with/i, 'no war, no war line on the word');
    }
  }
});

test('the blockade and siege facts on the front pick their own rumor variants', () => {
  const state = warState();
  state.conflicts[PAIR].front = { frontKills: 3, blockade: 2, siege: 0, thrown: 0 };
  const blockade = barWarTalkLine(state, warRecordForFaction(state, HOUSE), 'rumors');
  assert.match(blockade, /strangling the supply lane/, 'a blockaded lane tells the dock story');
  state.conflicts[PAIR].front = { frontKills: 3, blockade: 0, siege: 1, thrown: 0 };
  const siege = barWarTalkLine(state, warRecordForFaction(state, HOUSE), 'rumors');
  assert.match(siege, /heavy hull/, 'a cracked bastion tells the siege story');
});

test('a returning regular opens with the war that moved while they were out', () => {
  const state = warState();
  state.player = { stationContacts: { contact_regular: { met: true, talkCount: 2, lastChoice: 'rumors', standing: 1 } } };
  const regular = { id: 'contact_regular', name: 'Juno Vance', role: 'barkeep', factionId: HOUSE };
  const line = barRegularStoryLine(regular, state, TETHYS);
  assert.match(line, /war with/i, 'the trouble beat names the war');
  assert.match(line, new RegExp(factionName(RIVAL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'and names the rival');
  const peaceful = warState({ conflicts: {} });
  peaceful.player = state.player;
  const calm = barRegularStoryLine(regular, peaceful, TETHYS);
  assert.doesNotMatch(calm, /war with/i, 'no war, no war talk from the regular');
});

test('an authored contact keeps its own line even inside a house at war', () => {
  // Quinn runs the smuggler den's bar (faction_quiet house); give the Quiet a war and the
  // authored voice still answers Rumors on war days — the war never overwrites an authored line.
  const state = warState();
  delete state.conflicts[PAIR];
  state.conflicts['faction_quiet:faction_scn'] = {
    tension: 90, state: 'war', playerLean: 0, momentum: 10,
    front: { frontKills: 2, blockade: 0, siege: 0, thrown: 0 },
  };
  const contact = { id: 'c', role: 'barkeep', factionId: 'faction_quiet', canonicalKey: 'quinn' };
  let warDaysSeen = 0;
  for (let day = 0; day < 30; day++) {
    const dayState = warState({ simTime: 600 * day });
    delete dayState.conflicts[PAIR];
    dayState.conflicts['faction_quiet:faction_scn'] = state.conflicts['faction_quiet:faction_scn'];
    const reply = buildReply('barkeep', 'rumors', ctx(dayState), 'station_smuggler', contact);
    assert.equal(reply.warPosture, undefined, 'the war never rides over the authored voice');
    // The same house's war answers the plain room at the outpost (no authored keeper there)
    // on days without an ace sighting in the sector.
    if (!getActiveAceRouteForSector('sector_io_reach', 600 * day)) {
      const procedural = buildReply('barkeep', 'rumors', ctx(dayState), 'station_io_merc',
        { id: 'c2', role: 'barkeep', factionId: 'faction_quiet' });
      if (procedural.warPosture) warDaysSeen++;
    }
  }
  assert.ok(warDaysSeen > 0, 'the house war answers the plain room on its own days');
});

test('the bar line-up itself is unchanged in shape by a war', () => {
  const state = warState();
  const contacts = generateContacts(TETHYS, state);
  assert.ok(Array.isArray(contacts) && contacts.length >= 2, 'the room still fills');
  assert.equal(contacts[0].role, 'barkeep', 'the first stool is still the keeper');
});
