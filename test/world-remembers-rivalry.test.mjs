// THE WORLD REMEMBERS - U-D: rivalry arcs that are LOUD. Real aceMemory + real encounterDirector,
// fixed seeds 4242 / 8008, headless. One ace (Yara No-Cut) walks the whole arc:
//   first contact (director named_hunter) -> a wingman rammed -> the player leaves -> the director's
//   'escaped' receipt -> aceMemory schedules the return -> the return SPAWNS and its first words name
//   WHERE (sector), HOW it ended (outcome) and WITH WHAT (kill style) -> the hail deck opens with the
//   same grievance while it is live -> the kill is permanent, so the surviving wingman inherits the
//   name ("... the Second") and the return line names the one that was killed.
// Save/load keeps every field, and a return delay that already elapsed at load is not lost.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { aceById } from '../src/data/namedAces.js';
import {
  FIGHT_OUTCOMES,
  fightOutcomeFromSignals,
  fightStatusText,
  grievanceLineFor,
  grievanceLive,
  grievanceSeedFor,
  heirIdentity,
  lastFightLineFor,
  sectorDisplayName,
} from '../src/data/pilotCallsigns.js';
import {
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
} from '../src/data/contactHail.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createMarketNews } from '../src/ui/marketNews.js';

const ACE_ID = 'ace_yara_no_cut';
const ACE_NAME = 'Yara No-Cut';
const SECTOR_ID = 'sector_sker_haven';
const SECTOR_NAME = 'Sker Haven';
const SEEDS = [4242, 8008];

function boot(seed) {
  const sim = createSimulation({
    seed,
    systems: [aceMemory, spawnBudget, encounterDirector, aiPorts],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.playerId = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 10,
  }).id;
  const voices = [];
  const system = sim.registry.get('aceMemory');
  system.helpers = { ...system.helpers, voice: { say(payload) { voices.push(payload); return true; } } };
  const events = { returnSpawned: [], transitions: [], news: [], heirs: [] };
  // Defeat copy reaches news:headline through the production cited-news reader.
  createMarketNews({ state, bus });
  bus.on('aceMemory:returnSpawned', (p) => events.returnSpawned.push(structuredClone(p)));
  bus.on('aceMemory:transition', (p) => events.transitions.push(structuredClone(p)));
  bus.on('news:headline', (p) => events.news.push(structuredClone(p)));
  bus.on('aceMemory:heirNamed', (p) => events.heirs.push(structuredClone(p)));
  return { sim, state, bus, voices, events, director: sim.registry.get('encounterDirector') };
}

function tickSeconds(sim, seconds) {
  sim.runTicks(Math.ceil(seconds / SIM_DT));
}

/** First contact through the REAL director: the named_hunter script spawns boss + wing. */
function firstContact(h) {
  const { state, director, sim } = h;
  const result = director.requestAuthoredEncounter({
    shapeId: 'named_hunter',
    encounterId: `rivalry:${ACE_ID}`,
    sectorId: SECTOR_ID,
    force: true,
    data: { aceId: ACE_ID },
  });
  assert.equal(result.ok, true, `the director must field the ace: ${JSON.stringify(result)}`);
  tickSeconds(sim, 0.1);
  const live = state.encounterDirector.live[`rivalry:${ACE_ID}`];
  assert.ok(live, 'the encounter is live');
  const boss = [...live.ids].map((id) => state.entities.get(id)).find((e) => e && e.data.ai.encounterRole === 'boss');
  const wing = [...live.ids].map((id) => state.entities.get(id)).filter((e) => e && e.data.ai.encounterRole === 'escort');
  assert.ok(boss, 'the ace flies the boss seat');
  assert.ok(wing.length >= 1, 'the ace has a wing');
  assert.equal(boss.data.ai.namedAceId, ACE_ID);
  return { live, boss, wing };
}

function killByPlayer(h, entity, { style = null, cause = 'generic' } = {}) {
  entity.hull = 0;
  entity.alive = false;
  h.bus.emit('entity:killed', {
    id: entity.id, killerId: h.state.playerId, type: 'ship', factionId: entity.factionId,
    killStyle: style || undefined,
    presentation: { playerCaused: true, cause },
  });
}

/** Engage, then leave: the director's own _depart(engaged) resolves 'escaped' and speaks the receipt. */
function playerLeaves(h) {
  const { state, sim } = h;
  tickSeconds(sim, 9);
  state.simTime += 9;
  tickSeconds(sim, 1.5);
  const player = state.entities.get(state.playerId);
  player.pos.x += 9000;
  tickSeconds(sim, 2.5);
}

function fireReturn(h) {
  const rec = h.state.aceMemory[ACE_ID];
  assert.ok(rec && rec.returnScheduled === true && Number.isFinite(rec.returnAt), 'a return is scheduled');
  h.state.simTime = Math.max(h.state.simTime, rec.returnAt);
  tickSeconds(h.sim, 0.6);
  return h.events.returnSpawned.at(-1);
}

function spokenAs(h, situation) {
  return h.voices.filter((v) => v.id && v.id.includes(`:${situation}`));
}

function escapedArc(seed) {
  const h = boot(seed);
  const { wing } = firstContact(h);
  killByPlayer(h, wing[0], { style: 'ram', cause: 'ship_collision' });
  playerLeaves(h);
  return h;
}

for (const seed of SEEDS) {
  test(`seed ${seed}: first contact -> wingman rammed -> escape -> the return really spawns`, () => {
    const h = escapedArc(seed);
    const rec = h.state.aceMemory[ACE_ID];
    assert.equal(rec.fled, true, 'the director receipt reached aceMemory as a flee');
    assert.equal(rec.fleeCount, 1);
    assert.equal(rec.lastSectorId, SECTOR_ID);
    assert.equal(rec.lastStyle, 'ram', 'the style is the way the player killed the wing');
    assert.equal(rec.lastOutcome, 'rammed', 'a rammed wingman reads as a rammed fight');
    assert.equal(rec.returnTier, 1);

    const returned = fireReturn(h);
    assert.ok(returned, 'the return spawned on the default (aceMemory.helpers.spawnEntity) route');
    assert.equal(returned.aceId, ACE_ID);
    assert.ok(returned.spawnedIds.length >= 2, 'boss plus escorts');
    const boss = h.state.entities.get(returned.spawnedIds[0]);
    assert.equal(boss.data.aceMemory.role, 'boss');
    assert.equal(boss.data.ai.name, ACE_NAME);
    assert.equal(rec.returned, true);
  });

  test(`seed ${seed}: the return's first line names where, how it ended, and with what`, () => {
    const h = escapedArc(seed);
    fireReturn(h);
    const rec = h.state.aceMemory[ACE_ID];
    const first = h.voices.find((v) => v.kind === 'aceMemory');
    assert.ok(first, 'the ace speaks on return');
    assert.match(first.id, /^aceMemory:ace_yara_no_cut:last-fight:/, 'the FIRST ace line is the last-fight line');
    assert.ok(first.text.startsWith(`${ACE_NAME}: `), first.text);
    assert.ok(first.text.includes(SECTOR_NAME), `names the sector: ${first.text}`);
    assert.ok(/shoulder-charge/.test(first.text), `names the style (ram -> blade register): ${first.text}`);
    assert.ok(/hull through mine|like a door/.test(first.text), `names how it ended (rammed): ${first.text}`);
    const expected = lastFightLineFor(
      aceById(ACE_ID), rec, grievanceSeedFor(seed, aceById(ACE_ID), rec), SECTOR_NAME,
    );
    assert.equal(first.text, expected, 'one reader builds the spoken line');
    const spoken = h.voices.map((v) => v.text);
    assert.ok(spoken.length >= 1);
    assert.equal(h.voices.filter((v) => v.channel === 'bark').every((v) => v.kind === 'aceMemory'), true);
  });

  test(`seed ${seed}: the hail deck opens with the grievance while the grudge is live`, () => {
    const h = escapedArc(seed);
    const returned = fireReturn(h);
    const { state } = h;
    const rec = state.aceMemory[ACE_ID];
    const boss = state.entities.get(returned.spawnedIds[0]);
    const player = state.entities.get(state.playerId);
    boss.pos.x = player.pos.x + 600;
    boss.pos.z = player.pos.z;
    state.player.targetId = boss.id;
    assert.equal(grievanceLive(rec), true);

    const availability = contactHailAvailability(state);
    assert.equal(availability.enabled, true, `an ace is hailable: ${JSON.stringify(availability.reason)}`);
    assert.equal(availability.kind, 'ace');
    const offer = createContactHailOffer(state, availability, 'rivalry-hail', state.simTime + 30);
    assert.equal(offer.kind, 'ace');
    assert.equal(offer.lines[0], `${ACE_NAME.toUpperCase()} · RED LATCH CREW`);
    const spoken = h.voices.find((v) => v.id && v.id.includes(':last-fight:'));
    const bare = spoken.text.slice(`${ACE_NAME}: `.length).toUpperCase();
    assert.equal(offer.lines[1], bare, 'the opener is the grievance line the ace spoke on return');
    assert.ok(offer.lines[1].includes('SKER HAVEN'));
    assert.deepEqual(offer.actions.map((a) => a.id), ['status', 'identify']);

    const status = createContactHailResponse(state, offer, 'status');
    assert.equal(status.lines[0], `STATUS · ${fightStatusText(rec, SECTOR_NAME)}`);
    assert.match(status.lines[0], /LAST MET SKER HAVEN · YOU RAMMED THEM · RAM/);
    const identify = createContactHailResponse(state, offer, 'identify');
    assert.match(identify.lines[0], /YARA NO-CUT · RED LATCH CREW · RETURN TIER 1/);

    // The grudge ends with the fight: a settled rival opens with its faction's voice again.
    rec.defeated = true;
    assert.equal(grievanceLive(rec), false);
    const settled = createContactHailOffer(state, contactHailAvailability(state), 'rivalry-hail-2', state.simTime + 30);
    assert.notEqual(settled.lines[1], offer.lines[1]);
    assert.match(settled.lines[1], /^REACH LINE\./);
  });

  test(`seed ${seed}: the kill is permanent, so the surviving wingman inherits the name`, () => {
    const h = boot(seed);
    const { boss, wing } = firstContact(h);
    killByPlayer(h, wing[0], { style: 'gun' });
    const survivor = wing[1] || wing[0];
    // Keep exactly one wing hull alive: kill the first, spare the second (or respawn-equivalent).
    if (!wing[1]) {
      const extra = h.sim.spawn({
        type: 'ship', team: 1, pos: { x: 500, z: 500 }, hull: 100, hullMax: 100, radius: 8,
        data: { ai: { namedAceId: ACE_ID, encounterRole: 'escort' }, namedAceId: ACE_ID },
      });
      assert.ok(extra);
    }
    tickSeconds(h.sim, 0.1);
    killByPlayer(h, boss, { style: 'gun' });
    tickSeconds(h.sim, 0.2);

    const rec = h.state.aceMemory[ACE_ID];
    assert.equal(rec.defeated, true, 'the code retires a killed named ace');
    assert.equal(rec.returnScheduled, false, 'permanence is unchanged: the ace itself does not return');
    assert.equal(rec.lastOutcome, 'killed');
    assert.equal(rec.heirId, `heir_${ACE_ID}`);

    const heir = h.state.aceMemory[rec.heirId];
    assert.ok(heir, 'an heir record exists');
    assert.equal(heir.promoted, true);
    assert.match(heir.name, /^[A-Z][a-z]+ No-Cut the Second$/);
    assert.ok(!heir.name.includes(ACE_NAME), 'the heir name never contains the dead ace\'s full name');
    assert.equal(heir.crew, 'Red Latch Crew');
    assert.equal(heir.grudgeKey, 'lost_captain');
    assert.equal(heir.predecessorName, ACE_NAME);
    assert.equal(heir.lastSectorId, SECTOR_ID);
    assert.equal(heir.lastOutcome, 'killed');
    assert.equal(h.events.heirs.length, 1);
    assert.ok(h.events.news.some((n) => n.kind === 'ace-heir' && n.headline.includes(heir.name) && n.headline.includes(ACE_NAME)));
    const wearer = h.state.entities.get(heir.sourceEntityId);
    assert.ok(wearer, 'a real wingman hull took the name');
    assert.equal(wearer.data.ai.name, heir.name);
    assert.ok(heir.name.endsWith('the Second'));
    assert.ok(survivor);

    // The heir comes back as a hunter, and its line is about the one that was killed.
    h.state.simTime = Math.max(h.state.simTime, heir.returnAt);
    tickSeconds(h.sim, 0.6);
    const returned = h.events.returnSpawned.find((e) => e.aceId === heir.id);
    assert.ok(returned, 'the heir return spawns through the promoted-return machinery');
    assert.equal(returned.stance, 'hunts');
    const line = h.voices.find((v) => v.id && v.id.startsWith(`aceMemory:${heir.id}:last-fight:`));
    assert.ok(line, 'the heir speaks the lineage line first');
    assert.ok(line.text.startsWith(`${heir.name}: `), line.text);
    assert.ok(line.text.includes(ACE_NAME), `names the one killed: ${line.text}`);
    assert.ok(line.text.includes(SECTOR_NAME), `names the sector: ${line.text}`);
    // One heir per ace, and the ace stays dead.
    assert.equal(h.state.aceMemory[ACE_ID].defeated, true);
    assert.equal(h.events.returnSpawned.filter((e) => e.aceId === ACE_ID).length, 0);
  });

  test(`seed ${seed}: a returned ace killed in its own return fight settles - and leaves an heir`, () => {
    const h = escapedArc(seed);
    const returned = fireReturn(h);
    assert.ok(returned);
    const boss = h.state.entities.get(returned.spawnedIds[0]);
    killByPlayer(h, boss, { style: 'ram', cause: 'ship_collision' });
    const rec = h.state.aceMemory[ACE_ID];
    assert.equal(rec.defeated, true, 'a return-fight kill reaches the ledger (it never did before)');
    assert.equal(rec.lastOutcome, 'killed');
    assert.equal(rec.lastStyle, 'ram');
    assert.ok(h.events.news.some((n) => n.kind === 'ace-defeated' && n.aceId === ACE_ID));
    const heir = h.state.aceMemory[rec.heirId];
    assert.ok(heir, 'a return escort survives to take the name');
    assert.equal(heir.lastStyle, 'ram');
    assert.equal(grievanceLive(rec), false);
  });

  test(`seed ${seed}: a returned ace that runs comes back again, one tier heavier`, () => {
    const h = escapedArc(seed);
    const first = fireReturn(h);
    const rec = h.state.aceMemory[ACE_ID];
    const tier = rec.returnTier;
    const boss = h.state.entities.get(first.spawnedIds[0]);
    boss.data.despawnAt = h.state.simTime;
    tickSeconds(h.sim, 0.6);
    assert.equal(rec.returned, false, 'the spent return is cleared');
    assert.equal(rec.returnScheduled, true, 'the escaped return re-arms');
    assert.equal(rec.returnTier, tier + 1);
    assert.equal(rec.fleeCount, 2);
    assert.equal(rec.lastOutcome, 'you_fled', 'an unhurt boss that breaks off reads as the player leaving');
    const second = fireReturn(h);
    assert.ok(second && second !== first, 'it spawns again');
    assert.equal(second.returnTier, tier + 1);
    const lines = spokenAs(h, 'last-fight');
    assert.equal(lines.length, 2, 'both returns open with the last fight');
    assert.notEqual(lines[0].id, lines[1].id);
  });

  test(`seed ${seed}: the arc survives save/load, and a return whose delay already elapsed is not lost`, () => {
    const h = escapedArc(seed);
    const rec = h.state.aceMemory[ACE_ID];
    const snapshot = JSON.parse(JSON.stringify(h.sim.registry.get('aceMemory').serialize()));
    const saved = snapshot[ACE_ID];
    for (const key of ['lastSectorId', 'lastOutcome', 'lastStyle', 'fightStartedAt', 'returnAt', 'returnTier']) {
      assert.deepEqual(saved[key], rec[key], `${key} serializes`);
    }
    assert.equal(saved.lastOutcome, 'rammed');

    // Load into a fresh game whose clock is already PAST the return time.
    const fresh = boot(seed);
    fresh.sim.registry.get('aceMemory').deserialize(snapshot);
    const loaded = fresh.state.aceMemory[ACE_ID];
    for (const key of ['lastSectorId', 'lastOutcome', 'lastStyle', 'fightStartedAt', 'returnAt', 'returnTier', 'fleeCount']) {
      assert.deepEqual(loaded[key], rec[key], `${key} survives load`);
    }
    fresh.state.simTime = rec.returnAt + 900;
    tickSeconds(fresh.sim, 0.6);
    const returned = fresh.events.returnSpawned.at(-1);
    assert.ok(returned, 'a return whose delay elapsed during the save is still owed on load');
    const line = fresh.voices.find((v) => v.id && v.id.includes(':last-fight:'));
    assert.ok(line.text.includes(SECTOR_NAME) && /shoulder-charge/.test(line.text), line.text);

    // Mid-arc, after the return fired: the spent window stays spent through a round trip.
    const again = JSON.parse(JSON.stringify(fresh.sim.registry.get('aceMemory').serialize()));
    assert.equal(again[ACE_ID].returned, true);
    assert.equal(again[ACE_ID].returnScheduled, false);
  });
}

test('the phrase table: every outcome names its sector and its style, in every register', () => {
  const acePerRegister = [
    'ace_toll_saint_venn', 'ace_yara_no_cut', 'ace_ves_no_face', 'ace_sere_pattern', 'ace_voss_shaft_seven',
  ];
  const seen = new Set();
  for (const id of acePerRegister) {
    const ace = aceById(id);
    for (const outcome of FIGHT_OUTCOMES.filter((o) => o !== 'killed')) {
      for (const style of ['fling', 'gun', 'rock', 'ram']) {
        for (const seed of SEEDS) {
          const rec = { lastOutcome: outcome, lastStyle: style };
          const line = lastFightLineFor(ace, rec, seed, 'Ceres Belt');
          assert.ok(line.startsWith(`${ace.name}: `), line);
          assert.ok(line.includes('Ceres Belt'), `${id}/${outcome}: ${line}`);
          assert.ok(!/[{}]/.test(line), `no unfilled placeholder: ${line}`);
          seen.add(line);
        }
      }
    }
  }
  assert.ok(seen.size >= 100, `phrases are varied (${seen.size})`);
  // Deterministic, and empty without a fight on record.
  const ace = aceById(ACE_ID);
  const rec = { lastOutcome: 'netted', lastStyle: 'fling' };
  assert.equal(lastFightLineFor(ace, rec, 4242, 'Io Reach'), lastFightLineFor(ace, rec, 4242, 'Io Reach'));
  assert.equal(lastFightLineFor(ace, {}, 4242, 'Io Reach'), '');
  assert.match(lastFightLineFor(ace, rec, 4242, 'Io Reach'), /tether-work/);
  // A promoted pilot speaks the raider register; the heir names the fallen.
  const pilot = { id: 'pilot_9', name: 'Rex Hollow', crew: 'The Cold Wake' };
  const pilotLine = grievanceLineFor(pilot, { promoted: true, lastOutcome: 'wingman_died', lastStyle: 'gun' }, 4242, 'Io Reach');
  assert.ok(pilotLine.startsWith('Rex Hollow: ') && pilotLine.includes('Io Reach') && /guns/.test(pilotLine), pilotLine);
  const heir = heirIdentity(aceById(ACE_ID), 4242, 31);
  assert.match(heir.name, /^[A-Z][a-z]+ No-Cut the Second$/);
  assert.equal(heir.crew, 'Red Latch Crew');
  assert.equal(heirIdentity(aceById(ACE_ID), 4242, 31).name, heir.name, 'deterministic');
});

test('outcome folding: the most personal signal wins, and an unhurt boss that breaks off means the player left', () => {
  assert.equal(fightOutcomeFromSignals({}), 'you_fled');
  assert.equal(fightOutcomeFromSignals({ bossHullFrac: 0.3 }), 'they_fled');
  assert.equal(fightOutcomeFromSignals({ bossHullFrac: 0.9 }), 'you_fled');
  assert.equal(fightOutcomeFromSignals({ wingmanDown: true, bossHullFrac: 0.2 }), 'wingman_died');
  assert.equal(fightOutcomeFromSignals({ rammed: true, wingmanDown: true }), 'rammed');
  assert.equal(fightOutcomeFromSignals({ flung: true, rammed: true }), 'netted');
  assert.equal(fightOutcomeFromSignals({ killed: true, flung: true }), 'killed');
  assert.equal(sectorDisplayName('sector_sker_haven'), 'Sker Haven');
  assert.equal(sectorDisplayName('sector_x', { world: { sectors: { sector_x: { name: 'Xanadu' } } } }), 'Xanadu');
});
