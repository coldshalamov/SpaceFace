import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARKS, BARK_FACTIONS, BARK_SITUATIONS, BARK_EVENT_SITUATIONS, barkFor,
  HULL_RECOGNITION, hullRecognitionBarkFor,
  HISTORY_RECOGNITION, historyBarkFor,
  BAR_GREETING_BARKS, barGreetingBarkFor,
  BAR_APPROACH_BARKS, barApproachBarkFor,
  SECTOR_GREETING_BARKS, sectorGreetingBarkFor,
  WITNESS_CRIME_BARKS, witnessCrimeBarkFor,
  PURSUIT_BARKS, pursuitBarkFor,
  SURRENDER_BARKS, surrenderBarkFor,
  ESCAPE_TAUNT_BARKS, escapeTauntBarkFor,
  podHuntBarkFor,
  ORE_FLOOD_BARKS, oreFloodBarkFor,
  dockDeedBarkFor,
  rivalScavengerLineFor,
  witnessSeamLineFor,
  lawStepBarkFor,
  passengerBeatLine,
  TUMBLE_RAKE_BARKS, tumbleRakeBarkFor,
} from '../src/data/barks.js';
import { BARK_SITUATION_FILL, BARK_CELL_MIN, topUpBarkSituationCells } from '../src/data/barkSituationFill.js';
import { resolveBarkVoice, resolveVoiceRegister, identifyRegisterFromPcm, FACTION_VOICE_REGISTERS } from '../src/audio/barkVoice.js';
import { resolveFactionSting, resolveSectorBed } from '../src/audio/themeMatrix.js';

// D254: the fill reservoir used to be capped at BARK_CELL_MIN=12 appends, leaving ~55 authored
// tail lines unreachable. The cap is gone — every line in BARK_SITUATION_FILL must land in the
// live merged cell, and no touched cell may end under the floor.

const SITUATION_KEYS = [...BARK_SITUATIONS, ...BARK_EVENT_SITUATIONS];

test('the fill table holds no dead keys — every faction id and situation key is live', () => {
  // A fill cell under a misspelled faction or a non-live situation key is dead space of the
  // exact D254 class: authored, iterated by nobody, caught by no reachability count.
  for (const factionId of Object.keys(BARK_SITUATION_FILL)) {
    assert.ok(BARK_FACTIONS.includes(factionId), `fill faction '${factionId}' is not a live BARK_FACTIONS id`);
    for (const situation of Object.keys(BARK_SITUATION_FILL[factionId])) {
      assert.ok(SITUATION_KEYS.includes(situation), `fill key ${factionId}/${situation} is not a live situation`);
      const cell = BARK_SITUATION_FILL[factionId][situation];
      assert.ok(
        Array.isArray(cell) && cell.every((l) => typeof l === 'string' && l.trim().length > 0 && l === l.trim()),
        `fill cell ${factionId}/${situation} is not an array of trimmed non-empty strings — authored content the mutator silently skips`,
      );
      // The mutator dedupes against `seen`, so an authored repeat inside one cell is silently
      // dropped — dead authored weight no consumer can reach, the exact D254 class.
      assert.equal(
        new Set(cell).size,
        cell.length,
        `fill cell ${factionId}/${situation} holds a duplicate line — silently deduped dead authored weight`,
      );
    }
  }
  // The same dead-space class on the base side: a BARKS pack keyed under a non-live faction
  // id is iterated by nobody — countBarkCorpus, enumerateBarkPipeline, and the mutator all
  // key off BARK_FACTIONS.
  assert.deepEqual(
    Object.keys(BARKS).filter((k) => !BARK_FACTIONS.includes(k)),
    [],
    'BARKS holds a pack under a non-live faction id',
  );
});

test('every fill line is reachable in the merged BARKS cell', () => {
  let fillLineCount = 0;
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    const fill = BARK_SITUATION_FILL[factionId];
    if (!pack || !fill) continue;
    for (const situation of SITUATION_KEYS) {
      const extra = fill[situation];
      const cell = pack[situation];
      if (!Array.isArray(extra) || extra.length === 0) continue;
      assert.ok(Array.isArray(cell), `${factionId}/${situation}: fill exists but no live cell`);
      fillLineCount += extra.length;
      // Tail-equality, not membership: `includes` also passes when the mutator's `seen` dedupe
      // silently dropped a fill line that duplicates a base line — dead authored weight of the
      // exact D254 class. Fill must land verbatim at the cell's tail.
      assert.deepEqual(
        cell.slice(cell.length - extra.length),
        extra,
        `${factionId}/${situation}: fill must land verbatim at the cell tail — a deduped, dropped, or reordered fill line is silent dead weight`,
      );
    }
  }
  assert.ok(fillLineCount > 0, 'fill corpus is non-empty (test is measuring real lines)');
});

test('no touched cell ends under the BARK_CELL_MIN floor', () => {
  // topUp is idempotent on the already-merged corpus — a second run appends nothing and
  // reports only cells that remain under the floor after all fill is consumed.
  const underFloor = topUpBarkSituationCells(BARKS, BARK_FACTIONS, BARK_SITUATIONS, BARK_EVENT_SITUATIONS);
  assert.deepEqual(underFloor, []);
});

test('every live cell meets the floor directly — not just via the mutator report', () => {
  // The floor contract belongs to the corpus itself, so assert it straight off BARKS for
  // every faction × situation rather than trusting the mutator's own report.
  const under = [];
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    assert.ok(pack, `${factionId} missing from BARKS`);
    // A pack key outside the situation set is the same dead-space class as a dead fill key:
    // authored, iterated by nobody — e.g. a typo'd `attacks:` cell.
    assert.deepEqual(
      Object.keys(pack).filter((k) => !SITUATION_KEYS.includes(k)),
      [],
      `${factionId} pack holds keys no consumer iterates`,
    );
    for (const situation of SITUATION_KEYS) {
      const cell = pack[situation];
      assert.ok(Array.isArray(cell), `${factionId}/${situation} is missing or not an array`);
      assert.ok(
        cell.every((l) => typeof l === 'string' && l === l.trim() && l.length > 0),
        `${factionId}/${situation} holds a padded or non-string line — caption text must be exactly its trimmed self`,
      );
      assert.equal(
        new Set(cell).size, cell.length,
        `${factionId}/${situation} holds a duplicate line — authored dead weight that reads as additive`,
      );
      if (cell.length < BARK_CELL_MIN) {
        under.push(`${factionId}/${situation} (${cell.length})`);
      }
    }
  }
  assert.deepEqual(under, []);
});

test('deep cell indices past the old cap resolve to authored lines', () => {
  // A cell longer than the old 12-cap proves its tail is live; barkFor must return the exact
  // line at every index, including the former dead zone.
  let deepCells = 0;
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    const fill = BARK_SITUATION_FILL[factionId];
    if (!pack || !fill) continue;
    for (const situation of SITUATION_KEYS) {
      const cell = pack[situation];
      if (!Array.isArray(fill[situation]) || !Array.isArray(cell) || cell.length <= BARK_CELL_MIN) continue;
      deepCells += 1;
      for (let i = 0; i < cell.length; i += 1) {
        assert.equal(barkFor(factionId, situation, i), cell[i], `${factionId}/${situation}[${i}] not selectable`);
      }
    }
  }
  assert.ok(deepCells > 0, 'expected merged cells deeper than the old cap');
});

test('prototype-keyed ids take the documented fallback at every selector — never a crash or an inherited member', () => {
  // 'toString'/'constructor'/'__proto__' are valid strings a hostile or corrupted factionId can
  // carry; every corpus lookup must answer with its contracted fallback, not an Object.prototype
  // member, a TypeError, or the literal text "undefined". Guards are Object.hasOwn throughout.
  for (const key of ['toString', 'constructor', '__proto__']) {
    assert.ok(BARKS.faction_free.scan.includes(barkFor(key, 'scan', 0)), `barkFor(${key}) must speak faction_free`);
    assert.ok(BARKS.faction_scn.scan.includes(barkFor('faction_scn', key, 0)),
      `barkFor(faction_scn, ${key}) must fall back to the scan cell, not adopt a prototype member`);
    // The selector replaces {ship}/{class} tokens on the way out — compare post-replacement.
    const expectedHull = HULL_RECOGNITION.faction_free.map((l) => l.replace(/\{ship\}/g, 'that hull').replace(/\{class\}/g, 'hull'));
    assert.ok(expectedHull.includes(hullRecognitionBarkFor(key, 0, {})), `hullRecognitionBarkFor(${key}) must speak faction_free`);
    assert.ok(BAR_GREETING_BARKS.faction_free.any.includes(barGreetingBarkFor(key, key, 0)), `barGreetingBarkFor(${key}) must speak faction_free.any`);
    assert.ok(BAR_APPROACH_BARKS.faction_free.includes(barApproachBarkFor(key, 0)), `barApproachBarkFor(${key}) must speak faction_free`);
    // kills>0 qualifies the 'kills' family — a prototype key must still reach faction_free,
    // not return '' and silently eat the line on the live scan path.
    const expectedHistory = HISTORY_RECOGNITION.faction_free.kills.map((l) =>
      l.replace(/\{ship\}/g, 'that hull').replace(/\{kills\}/g, '2').replace(/\{captain\}/g, 'the captain'));
    assert.ok(expectedHistory.includes(historyBarkFor(key, { hasHistory: true, kills: 2 }, 0)), `historyBarkFor(${key}) must speak faction_free`);
    assert.equal(sectorGreetingBarkFor(key, 0), null, `sectorGreetingBarkFor(${key}) must return null for an unknown sector`);
    assert.equal(lawStepBarkFor(key), null, `lawStepBarkFor(${key}) must return null for an unknown event`);
    assert.equal(passengerBeatLine(key, 0), '', `passengerBeatLine(${key}) must return '' for an unknown kind`);
    assert.ok(WITNESS_CRIME_BARKS.faction_free.includes(witnessCrimeBarkFor(key, 0)), `witnessCrimeBarkFor(${key}) must speak faction_free`);
    assert.ok(PURSUIT_BARKS.faction_free.includes(pursuitBarkFor(key, 0)), `pursuitBarkFor(${key}) must speak faction_free`);
    assert.ok(SURRENDER_BARKS.faction_free.includes(surrenderBarkFor(key, 0)), `surrenderBarkFor(${key}) must speak faction_free`);
    assert.ok(ESCAPE_TAUNT_BARKS.faction_free.includes(escapeTauntBarkFor(key, 0)), `escapeTauntBarkFor(${key}) must speak faction_free`);
    assert.equal(podHuntBarkFor(key, key, 0), null, `podHuntBarkFor(${key}) must return null for an unknown key`);
    const expectedOre = ORE_FLOOD_BARKS.working.map((l) => l.replace(/\{ore\}/g, 'iron'));
    assert.ok(expectedOre.includes(oreFloodBarkFor(key, 0, 'iron')), `oreFloodBarkFor(${key}) must speak the working register`);
    assert.equal(dockDeedBarkFor(key, 0, { deed: 'x' }), null, `dockDeedBarkFor(${key}) must return null for an unknown tone`);
    assert.equal(rivalScavengerLineFor(key, 0), '', `rivalScavengerLineFor(${key}) must return '' for an unknown kind`);
    assert.equal(witnessSeamLineFor(key, 5), null, `witnessSeamLineFor(${key}) must return null for an unknown tracker`);
    assert.equal(resolveVoiceRegister(key).id, FACTION_VOICE_REGISTERS.faction_free.id, `resolveVoiceRegister(${key}) must fall back to faction_free`);
    assert.equal(resolveBarkVoice({ factionId: key, situation: 'scan', line: 'x' }).registerId, 'faction_free', `resolveBarkVoice(${key}) must fall back to faction_free`);
    assert.equal(resolveFactionSting(key), null, `resolveFactionSting(${key}) must return null`);
    assert.match(resolveSectorBed(key).id, /^bed_/, `resolveSectorBed(${key}) must take the hashed-bed path`);
  }
  assert.equal(identifyRegisterFromPcm(null), null, 'identifyRegisterFromPcm(null) must return null, not throw');
  assert.equal(identifyRegisterFromPcm([]), null, 'identifyRegisterFromPcm([]) must return null, not throw');
  // Index selectors wrap negatives into range like pickIndex — lines[-1] must never be null.
  assert.ok(TUMBLE_RAKE_BARKS.includes(tumbleRakeBarkFor(-1)), 'tumbleRakeBarkFor(-1) must wrap into the corpus');
  assert.ok(SECTOR_GREETING_BARKS.sector_helios_prime.includes(sectorGreetingBarkFor('sector_helios_prime', -2)),
    'sectorGreetingBarkFor(-2) must wrap into the sector cell');
});

test('restored runtime state bags re-home to null-prototype — record-derived keys write own keys', async () => {
  const { witnessState, observeStuntWitnesses, sampledStuntWitnesses } = await import('../src/combat/stuntWitnesses.js');
  const { barkDirector } = await import('../src/systems/barkDirector.js');

  // A restored save adopts titles.stuntWitnessing wholesale — every field the loop
  // dereferences normalizes instead of crashing the 60 Hz tick.
  const state = { mode: 'flight', tick: 1, entities: new Map(), playerId: 'p1',
    story: { titles: { stuntWitnessing: { episodes: null, reports: 'corrupt', sequence: 'NaN', lastTick: 'x' } } } };
  const own = witnessState(state);
  assert.equal(Object.getPrototypeOf(own.episodes), null, 'episodes bag must be null-prototype');
  assert.deepEqual(own.reports, []);
  assert.equal(own.sequence, 0);
  assert.doesNotThrow(() => observeStuntWitnesses(state), 'a malformed restored bag must not crash the tick');

  // An own '__proto__' episode key (JSON round-trip) resolves the row, not Object.prototype.
  const restored = { mode: 'flight', tick: 1, entities: new Map(), playerId: 'p1',
    story: { titles: { stuntWitnessing: { episodes: JSON.parse('{"__proto__":{"rootId":"__proto__","rootTick":0}}') } } } };
  witnessState(restored);
  const ep = restored.story.titles.stuntWitnessing.episodes;
  assert.equal(Object.getPrototypeOf(ep), null);
  assert.equal(ep['__proto__'].rootId, '__proto__', 'the restored row survives as an own key');
  assert.doesNotThrow(() => sampledStuntWitnesses(restored, { rootId: '__proto__', tick: 0 }),
    'a restored episode row must not crash the witness sampler');

  // Primitive episode values and null observer rows skip — they must not throw mid-tick.
  const prim = { mode: 'flight', tick: 1, entities: new Map(), playerId: 'p1',
    story: { titles: { stuntWitnessing: { episodes: { root7: 7 } } } } };
  witnessState(prim);
  assert.doesNotThrow(() => sampledStuntWitnesses(prim, { rootId: 'root7', tick: 0 }),
    'a primitive episode value must skip, not throw');
  const nullRow = { mode: 'flight', tick: 1, entities: new Map(), playerId: 'p1',
    story: { titles: { stuntWitnessing: { episodes: { r1: { observers: { w: null } } } } } } };
  witnessState(nullRow);
  assert.doesNotThrow(() => sampledStuntWitnesses(nullRow, { rootId: 'r1', tick: 0 }),
    'a null observer row must skip, not throw');

  // barkDirector.update re-homes restored plain-prototype bags through the public seam.
  const dir = Object.create(barkDirector);
  const dstate = { mode: 'flight', tick: 0, simTime: 0, playerId: 'p1', entities: new Map(), story: {}, settings: {}, combat: {},
    barkDirector: {
      entities: { toString: { entityId: 'e', said: {} } },
      ambientBySector: { toString: { quietSince: 0 } },
      stuntRecognition: { speakers: { toString: { titleEncounter: null, lines: [] } } },
    } };
  assert.doesNotThrow(() => dir.update(1 / 60, dstate));
  assert.equal(Object.getPrototypeOf(dstate.barkDirector.entities), null);
  assert.equal(Object.getPrototypeOf(dstate.barkDirector.ambientBySector), null);
  assert.equal(Object.getPrototypeOf(dstate.barkDirector.stuntRecognition.speakers), null);
  assert.equal(dstate.barkDirector.entities['toString'].entityId, 'e', 'restored rows survive the re-home');

  // raiderEscapesSaid: a 'toString' custody id speaks once then dedupes — a plain-proto bag
  // would read the inherited member and stay silent forever.
  const dir2 = Object.create(barkDirector);
  const estate = { mode: 'flight', tick: 0, simTime: 0, playerId: 'p1', entities: new Map(), story: {},
    barkDirector: { raiderEscapesSaid: {} } };
  dir2.state = estate;
  assert.equal(dir2._speakRaiderEscape({ custodyId: 'toString', qty: 2 }), true, 'the first escape report must speak');
  assert.equal(dir2._speakRaiderEscape({ custodyId: 'toString', qty: 2 }), false, 'the second must dedupe');
  assert.equal(Object.getPrototypeOf(estate.barkDirector.raiderEscapesSaid), null);
});

test('malformed values inside restored bags are dead data — no tick crash, no silent wedge', async () => {
  const {
    witnessState, observeStuntWitnesses, deliverWitnessReports, sendWitnessReports,
    boundStuntNarrative, qualifyStuntTitles, stuntDossierForNetwork, knownStuntTitles,
  } = await import('../src/combat/stuntWitnesses.js');
  const { bindStuntEvidence, unbindStuntEvidence } = await import('../src/combat/stuntEvidence.js');
  const { barkDirector } = await import('../src/systems/barkDirector.js');

  // The episodes bag itself can be a primitive — witnessState rebuilds it wholesale.
  const corruptOwn = { mode: 'flight', tick: 1, entities: new Map(), playerId: 'p1', story: { titles: { stuntWitnessing: 7 } } };
  assert.doesNotThrow(() => witnessState(corruptOwn), 'a primitive restored bag must be rebuilt, not dereferenced');
  assert.equal(Object.getPrototypeOf(corruptOwn.story.titles.stuntWitnessing.episodes), null);

  // A live journal root plus malformed episode rows: the sweep must drop dead rows and the
  // root walk must replace them — not crash on row.rootTick or mint observers onto a number.
  const state = { mode: 'flight', tick: 10, simTime: 0, entities: new Map(), playerId: 'p1',
    story: { titles: { stuntWitnessing: { episodes: { junk: null, live: 7, stale: 'x' }, reports: [], sequence: 0, lastTick: -1 } } } };
  const journal = bindStuntEvidence(state);
  journal.roots.set('live', { id: 'live', actorId: 'p1', tick: 0, sourceId: 's1', sourceLife: 'life:s1', nodes: [] });
  state.entities.set('p1', { id: 'p1', type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} });
  state.entities.set('s1', { id: 's1', type: 'payload', alive: true, pos: { x: 5, z: 0 }, data: {} });
  assert.doesNotThrow(() => observeStuntWitnesses(state), 'malformed episode rows must not crash the tick');
  assert.equal(state.story.titles.stuntWitnessing.episodes.junk, undefined, 'a null episode row is dropped by the sweep');
  assert.equal(typeof state.story.titles.stuntWitnessing.episodes.live, 'object', 'a primitive row at a live root is replaced');
  unbindStuntEvidence(state);

  // The report queue ejects null/primitive packets instead of crashing the delivery tick.
  const delivery = { mode: 'flight', tick: 10, simTime: 0, entities: new Map(), playerId: 'p1',
    story: { titles: { stuntWitnessing: { episodes: {}, reports: [null, 7, {}], sequence: 0, lastTick: -1 }, stuntIncidents: 'x' } } };
  assert.doesNotThrow(() => deliverWitnessReports(delivery, null));
  assert.deepEqual(delivery.story.titles.stuntWitnessing.reports, [], 'dead packets drain from the queue');

  // Senders skip null/primitive witness rows; narrative binding skips dead incident fields.
  const sender = { mode: 'flight', tick: 1, entities: new Map(), playerId: 'p1',
    story: { titles: { stuntWitnessing: { episodes: {}, reports: [], sequence: 0, lastTick: -1 },
      stuntIncidents: [null, { id: 'a', chain: [null, 7], witnesses: [null], reports: [null], reportedNetworks: 'x', titleIds: 5 }] } } };
  for (let i = 0; i < 9; i++) sender.story.titles.stuntIncidents.push(null);
  assert.doesNotThrow(() => sendWitnessReports(sender, { id: 'a', witnesses: [null, 7] }, null));
  assert.doesNotThrow(() => boundStuntNarrative(sender), 'null incident/chain/report rows must not crash the binder');
  assert.doesNotThrow(() => stuntDossierForNetwork(sender, 'net'), 'malformed title fields must not crash the dossier');
  assert.doesNotThrow(() => knownStuntTitles(sender, { id: 'o', type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} }),
    'malformed byId rows must not crash the known-title scan');

  // Qualify a real title through corrupted byId/stuntProgress/titlesSeen — the fields
  // normalize and the award still lands.
  const qualify = { mode: 'flight', tick: 1, entities: new Map(), playerId: 'p1',
    story: { titlesSeen: 5,
      titles: { byId: 7, stuntProgress: 'x',
        stuntIncidents: [], stuntWitnessing: { episodes: {}, reports: [], sequence: 0, lastTick: -1 } } } };
  assert.doesNotThrow(() => qualifyStuntTitles(qualify, { id: 'i1', trickId: 'bolas', consequence: { killed: true }, visibility: 'reported', tick: 1 }, null));
  assert.equal(qualify.story.titles.byId.title_bolas?.status, 'held', 'the bolas title still earns through normalized fields');
  assert.equal(qualify.story.titlesSeen.length, 1);

  // barkDirector: primitive/shapeless entity records, pending entries, and speaker rows are
  // rebuilt or dropped — a shapeless pending entry used to wedge the stunt-bark queue forever.
  const dir = Object.create(barkDirector);
  const dstate = { mode: 'flight', tick: 0, simTime: 0, playerId: 'p1', entities: new Map(), story: {}, settings: {}, combat: {},
    barkDirector: {
      entities: { e1: 7, e2: {} },
      stuntRecognition: { pending: [null, {}, 7, 'x'], recentTicks: [null], deliveredIds: [], speakers: { s1: 7 } },
      raiderEscapesSaid: { c1: 7 },
    } };
  dstate.entities.set('e1', { id: 'e1', type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { ai: {} }, factionId: 'faction_scn' });
  dir.state = dstate; dir.helpers = { voice: { say: () => true } };
  assert.doesNotThrow(() => dir._speak(dstate.entities.get('e1'), 'warn', 'probe'), 'a primitive entity record must not crash _speak');
  assert.doesNotThrow(() => dir._speak({ id: 'e2', type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { ai: {} }, factionId: 'faction_scn' }, 'warn', 'probe'),
    'a shapeless entity record must not crash _speak');
  const record = dstate.barkDirector.stuntRecognition;
  assert.equal(record.pending.length, 0, 'shapeless pending entries drain — the queue cannot wedge');
  assert.doesNotThrow(() => dir._advanceStuntBarks());
  record.pending.push({ id: 'q1', speakerIdentity: 's1', status: 'queued', expiresTick: 9999, tick: 0, eligibleTick: 0 });
  assert.doesNotThrow(() => dir._completeStuntBark(record.pending[0], 'voice'), 'a primitive speaker row must be rebuilt, not crash');
  assert.equal(typeof record.speakers.s1, 'object');
  assert.equal(dir._speakRaiderEscape({ custodyId: 'c1', qty: 2 }), true, 'a corrupt said row must not mute the custody id forever');
});
