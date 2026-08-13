import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { contactStateWord } from '../src/systems/scanner.js';

function boot(seed = 47101) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_helios_prime';
  sim.state.story.beatIndex = 7;
  sim.state.player.researchedNodes.push('tech_long_range_survey');
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

const SECTOR_FOR = Object.freeze({
  depth_h1_distress_from_inside: 'sector_helios_prime',
  depth_h2_drifting_bloom: 'sector_veil_nebula',
  depth_h3_wreck_that_knows_you: 'sector_io_reach',
  depth_h4_love_letter_buoy: 'sector_io_reach',
  depth_h5_corridor_massacre: 'sector_io_reach',
  depth_h6_patrol_ambush: 'sector_io_reach',
  depth_h7_spared_return: 'sector_io_reach',
  depth_h8_echo_of_player: 'sector_veil_nebula',
});

function force(t, shapeId, suffix = 'a', options = {}) {
  const sectorId = options.sectorId || SECTOR_FOR[shapeId];
  t.state.world.currentSectorId = sectorId;
  const encounterId = `debug:e1:${shapeId}:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId,
    encounterId,
    sectorId,
    anchor: options.anchor || { x: 0, z: 0 },
    force: options.force !== false,
    data: options.data || {},
  });
  assert.equal(result.ok, true, `${shapeId}/${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

function choose(t, encounterId, choiceId) {
  t.bus.emit('encounter:choose', { encounterId, choiceId });
}

function completion(t, shapeId) {
  return t.state.story.depthProgramEncounters?.completed?.[shapeId] || null;
}

function collect(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function graffitiSetTexts(set) {
  return new Set(FLAVOR_PACKS.graffiti.entries
    .filter((entry) => entry.set === set)
    .map((entry) => entry.text));
}

test('the live director can force one self-registered authored encounter by deterministic debug id', () => {
  const t = boot();
  assert.equal(typeof t.director.requestAuthoredEncounter, 'function');
  const result = t.director.requestAuthoredEncounter({
    shapeId: 'depth_h1_distress_from_inside',
    encounterId: 'debug:e1:h1:47101',
    sectorId: 'sector_helios_prime',
    anchor: { x: -1760, z: -1260 },
    force: true,
  });
  assert.deepEqual(result, { ok: true, encounterId: 'debug:e1:h1:47101' });
  assert.equal(t.state.encounterDirector.live['debug:e1:h1:47101']?.shapeId, 'depth_h1_distress_from_inside');
});

test('H1 header anchors normal planning at the yard and requires a genuinely prior visit', () => {
  const shape = ENCOUNTERS.depth_h1_distress_from_inside;
  let planned = null;
  for (let day = 0; day < 80 && !planned; day += 1) {
    planned = planEncounters(47105, 'sector_helios_prime', day,
      zonesForSector('sector_helios_prime'), null, { [shape.id]: shape })
      .find((row) => row.shapeId === shape.id) || null;
  }
  assert.ok(planned, 'the seeded major window must eventually select H1');
  assert.equal(planned.zoneId, 'encounter-anchor:poi_helios_yard');
  assert.deepEqual(planned.zoneCenter,
    sectorLocalToGlobalForSector({ x: -1760, z: -1260 }, 'sector_helios_prime'));

  const t = boot(47105);
  t.state.story.beatIndex = 3;
  t.state.world.discovery.sector_helios_prime = {
    discovered: true,
    pois: { poi_helios_yard: { discovered: true, identified: false } },
  };
  t.bus.emit('poi:discovered', { poiId: 'poi_helios_yard', type: 'derelict' });
  const request = (encounterId) => t.director.requestAuthoredEncounter({
    shapeId: shape.id, encounterId, sectorId: 'sector_helios_prime', anchor: planned.zoneCenter,
  });
  assert.deepEqual(request('debug:e1:h1:not-prior'), { ok: false, reason: 'gated' });
  t.sim.step(1);
  assert.equal(request('debug:e1:h1:prior').ok, true);
});

test('normal planning excludes E1 encounters from sectors outside their static gates', () => {
  const shape = ENCOUNTERS.depth_h5_corridor_massacre;
  for (let day = 0; day < 80; day += 1) {
    const rows = planEncounters(47106, 'sector_helios_prime', day,
      zonesForSector('sector_helios_prime'), null, { [shape.id]: shape });
    assert.equal(rows.length, 0, `H5 leaked into Helios on day ${day}`);
  }
});

test('H1 resolves all three grief branches once without credits or combat rewards', () => {
  const cases = [
    ['listen', 'listen', 'volsEchoUnlocked'],
    ['board', 'boarded', 'volsBlackBoxRecovered'],
    ['leave', 'left', 'volsMaydayGhost'],
  ];
  for (const [choiceId, outcome, flag] of cases) {
    const t = boot(47110);
    const events = collect(t, ['graffiti:show', 'ambientComms:register', 'cargo:persistentAdded']);
    const beforeCredits = t.state.player.credits;
    const id = force(t, 'depth_h1_distress_from_inside', choiceId);
    choose(t, id, choiceId);
    assert.equal(completion(t, 'depth_h1_distress_from_inside')?.outcome, outcome);
    assert.equal(t.state.story.flags[flag], true);
    assert.equal(t.state.player.credits, beforeCredits);
    assert.equal(t.state.encounterDirector.live[id], undefined);
    assert.ok(events.length >= (choiceId === 'listen' ? 0 : 1));
    const blocked = t.director.requestAuthoredEncounter({
      shapeId: 'depth_h1_distress_from_inside', encounterId: `${id}:again`,
      sectorId: 'sector_helios_prime', anchor: { x: 0, z: 0 },
    });
    assert.deepEqual(blocked, { ok: false, reason: 'gated' });
  }
});

test('H2 makes the first hail, scan, or shot a permanent Understory posture', () => {
  const hail = boot(47120);
  const hailEvents = collect(hail, ['faction:repDelta']);
  let id = force(hail, 'depth_h2_drifting_bloom', 'hail');
  choose(hail, id, 'hail');
  assert.equal(hail.state.story.flags.understoryTradePosture, 'open_early');
  assert.equal(completion(hail, 'depth_h2_drifting_bloom')?.outcome, 'hailed');
  assert.ok(hailEvents.some((row) => row.payload.factionId === 'faction_understory' && row.payload.delta > 0));

  const scan = boot(47121);
  id = force(scan, 'depth_h2_drifting_bloom', 'scan');
  scan.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
  assert.equal(scan.state.story.flags.understoryTradePosture, 'cautious');
  assert.equal(completion(scan, 'depth_h2_drifting_bloom')?.outcome, 'scanned');

  const fire = boot(47122);
  const events = collect(fire, ['faction:aggro', 'faction:tradePosture', 'faction:repDelta']);
  id = force(fire, 'depth_h2_drifting_bloom', 'fire');
  const live = fire.state.encounterDirector.live[id];
  assert.equal(live.ids.length, 1, 'the bloom must be a physical contact');
  fire.bus.emit('combat:damage', { attackerId: fire.state.playerId, targetId: live.ids[0], amount: 1 });
  assert.equal(fire.state.story.flags.understoryNeverFiresFirst, false);
  assert.equal(fire.state.story.flags.understoryPermanentGrudge, true);
  assert.equal(completion(fire, 'depth_h2_drifting_bloom')?.outcome, 'fired');
  assert.ok(events.some((row) => row.name === 'faction:aggro'));
  assert.ok(events.some((row) => row.name === 'faction:repDelta'
    && row.payload.factionId === 'faction_understory' && row.payload.delta <= -100));
});

test('H3 makes reading, carrying, and ignoring the Vols letter durably different', () => {
  const cases = [
    ['read', 'read', 'volsLetterRead'],
    ['carry', 'carried', 'volsLetterCarried'],
    ['ignore', 'ignored', 'volsLetterIgnored'],
  ];
  for (const [choiceId, outcome, flag] of cases) {
    const t = boot(47130);
    const id = force(t, 'depth_h3_wreck_that_knows_you', choiceId);
    assert.ok([...t.state.entities.values()].some((entity) => entity.type === 'wreck'
      && entity.data?.encounterId === id), 'the recognizing derelict must exist in physical space');
    choose(t, id, choiceId);
    assert.equal(completion(t, 'depth_h3_wreck_that_knows_you')?.outcome, outcome);
    assert.equal(t.state.story.flags[flag], true);
    if (choiceId === 'carry') {
      assert.ok(t.state.story.persistentCargo.includes('depth_vols_letter'));
      assert.equal(t.state.story.flags.kurtzDeskVolsLetter, true);
    }
    if (choiceId === 'ignore') assert.equal(t.state.story.flags.volsLetterEpilogue, false);
  }
});

test('H4 re-seeds the buoy with no payout, warms comms, and alone ends recurrence', () => {
  const heard = boot(47140);
  let id = force(heard, 'depth_h4_love_letter_buoy', 'heard');
  choose(heard, id, 'listen');
  assert.equal(completion(heard, 'depth_h4_love_letter_buoy')?.outcome, 'heard');
  const repeat = heard.director.requestAuthoredEncounter({
    shapeId: 'depth_h4_love_letter_buoy', encounterId: `${id}:repeat`,
    sectorId: 'sector_io_reach', anchor: { x: 0, z: 0 },
  });
  assert.equal(repeat.ok, true, 'listening must not consume the rare encounter forever');

  const reseeded = boot(47141);
  const events = collect(reseeded, ['graffiti:show', 'ambientComms:toneChanged']);
  const beforeCredits = reseeded.state.player.credits;
  id = force(reseeded, 'depth_h4_love_letter_buoy', 'reseed');
  choose(reseeded, id, 'reseed');
  assert.equal(completion(reseeded, 'depth_h4_love_letter_buoy')?.outcome, 'reseeded');
  assert.equal(reseeded.state.story.flags.kindness, true);
  assert.equal(reseeded.state.player.credits, beforeCredits);
  assert.equal(events.length, 2);
  const blocked = reseeded.director.requestAuthoredEncounter({
    shapeId: 'depth_h4_love_letter_buoy', encounterId: `${id}:blocked`,
    sectorId: 'sector_io_reach', anchor: { x: 0, z: 0 },
  });
  assert.deepEqual(blocked, { ok: false, reason: 'gated' });
});

test('physical E1 choices select deterministic exact V2 graffiti once', () => {
  const cases = [
    { seed: 47142, shapeId: 'depth_h1_distress_from_inside', choiceId: 'board', set: 'vols_hand' },
    { seed: 47143, shapeId: 'depth_h3_wreck_that_knows_you', choiceId: 'read', set: 'vols_hand' },
    { seed: 47144, shapeId: 'depth_h4_love_letter_buoy', choiceId: 'reseed', set: 'kindness' },
  ];

  for (const spec of cases) {
    const run = (suffix) => {
      const t = boot(spec.seed);
      const events = collect(t, ['graffiti:show']);
      const id = force(t, spec.shapeId, suffix);
      choose(t, id, spec.choiceId);
      assert.equal(events.length, 1, `${spec.shapeId} must surface one authored graffiti line`);
      assert.ok(graffitiSetTexts(spec.set).has(events[0].payload.line),
        `${spec.shapeId} must consume the exact ${spec.set} corpus`);
      const blocked = t.director.requestAuthoredEncounter({
        shapeId: spec.shapeId,
        encounterId: `${id}:again`,
        sectorId: SECTOR_FOR[spec.shapeId],
        anchor: { x: 0, z: 0 },
      });
      assert.deepEqual(blocked, { ok: false, reason: 'gated' });
      assert.equal(events.length, 1, `${spec.shapeId} graffiti must remain once-ever`);
      return events[0].payload.line;
    };

    assert.equal(run('authored-a'), run('authored-b'),
      `${spec.shapeId} must select byte-identical graffiti for the same save seed`);
  }
});

test('H5 exposes exactly three alignment branches and no neutral escape hatch', () => {
  const cases = [
    ['flee', 'fled', ['corridorCoverHeld']],
    ['publish', 'published', ['valePathClosed', 'orrinPathOpen']],
    ['engage', 'engaged', ['concordHostileForever', 'dorinBranchUnlocked']],
  ];
  for (const [choiceId, outcome, flags] of cases) {
    const t = boot(47150);
    const events = collect(t, ['faction:repDelta', 'faction:aggro', 'news:headline']);
    const id = force(t, 'depth_h5_corridor_massacre', choiceId);
    assert.ok([...t.state.entities.values()].filter((entity) => entity.type === 'wreck'
      && entity.data?.encounterId === id).length >= 3, 'the civilian aftermath must be physically present');
    choose(t, id, 'neutral');
    assert.equal(completion(t, 'depth_h5_corridor_massacre'), null, 'unknown fourth choice must do nothing');
    assert.ok(t.state.encounterDirector.live[id], 'the forced choice remains unresolved');
    choose(t, id, choiceId);
    const completed = completion(t, 'depth_h5_corridor_massacre');
    assert.equal(completed?.outcome, outcome);
    if (choiceId === 'publish') {
      assert.deepEqual(completed.sourceAnchor, { x: 0, z: 0 },
        'the published H5 transition retains its finite physical source anchor');
      assert.match(completed.orrinWitnessSourceId, /^orrin-witness:depth_h5_corridor_massacre:published:/);
    } else {
      assert.equal(completed.orrinWitnessSourceId, undefined,
        'other H5 outcomes cannot mint Orrin evidence authority');
    }
    for (const flag of flags) assert.equal(t.state.story.flags[flag], true);
    assert.ok(events.length >= 1);
    if (choiceId === 'engage') assert.ok(events.some((row) => row.name === 'faction:repDelta'
      && row.payload.factionId === 'faction_scn' && row.payload.delta <= -100));
  }
});

test('H6 is repeatable and the wait branch alone creates high-loot/high-risk vulture pressure', () => {
  const t = boot(47160);
  const events = collect(t, ['faction:repDelta', 'salvage:fieldVulture', 'encounter:winnerHostile']);
  let id = force(t, 'depth_h6_patrol_ambush', 'concord');
  let live = t.state.encounterDirector.live[id];
  const concord = live.ids.filter((entityId) => live.roles[entityId] === 'squad')
    .map((entityId) => t.state.entities.get(entityId));
  const reach = live.ids.filter((entityId) => live.roles[entityId] === 'escort')
    .map((entityId) => t.state.entities.get(entityId));
  assert.ok(concord.length && reach.length, 'both battle lines must spawn');
  assert.ok(concord.every((entity) => entity.data.ai.retaliationTargetId === reach[0].id));
  assert.ok(reach.every((entity) => entity.data.ai.retaliationTargetId === concord[0].id));
  choose(t, id, 'concord');
  assert.equal(completion(t, 'depth_h6_patrol_ambush')?.outcome, 'concord');
  assert.ok(events.some((row) => row.name === 'faction:repDelta' && row.payload.factionId === 'faction_scn'));
  assert.ok(concord.every((entity) => entity.team === 0), 'the aided patrol must join the player team');
  assert.ok(reach.every((entity) => entity.team === 1 && entity.data.ai.forcePlayerTarget === true));

  id = force(t, 'depth_h6_patrol_ambush', 'wait');
  live = t.state.encounterDirector.live[id];
  choose(t, id, 'wait');
  assert.equal(completion(t, 'depth_h6_patrol_ambush')?.outcome, 'concord',
    'waiting must not overwrite the prior repeatable receipt before the battle settles');
  assert.equal(live.phase, 'waiting_battle');
  for (const entityId of live.ids.filter((entityId) => live.roles[entityId] === 'squad')) {
    const entity = t.state.entities.get(entityId);
    if (entity) entity.alive = false;
  }
  t.sim.step(1);
  assert.equal(completion(t, 'depth_h6_patrol_ambush')?.outcome, 'vultured');
  assert.ok(events.some((row) => row.name === 'salvage:fieldVulture' && row.payload.risk === 'high'));
  assert.ok(events.some((row) => row.name === 'encounter:winnerHostile'));
  assert.ok([...t.state.entities.values()].some((entity) => entity.type === 'wreck'
    && entity.data?.encounterId === id), 'waiting must leave a physical high-value salvage field');
  assert.ok(live.ids.some((entityId) => t.state.entities.get(entityId)?.data?.ai?.forcePlayerTarget === true),
    'the deterministic winner must turn on the player');
});

test('H7 generalizes an ace escape into a seeded moral debt and reveals cumulative mercy', () => {
  const first = boot(47170);
  first.state.world.currentSectorId = 'sector_io_reach';
  let denied = first.director.requestAuthoredEncounter({
    shapeId: 'depth_h7_spared_return', encounterId: 'debug:e1:h7:none',
    sectorId: 'sector_io_reach', anchor: { x: 0, z: 0 },
  });
  assert.deepEqual(denied, { ok: false, reason: 'gated' });
  first.bus.emit('aceMemory:transition', {
    aceId: 'ace_yara_no_cut', aceName: 'Yara No-Cut', transition: 'fled',
    record: { lastSectorId: 'sector_io_reach', returnTier: 2 },
  });
  const debt = first.state.story.moralMemory?.debts?.ace_yara_no_cut;
  assert.ok(debt, 'aceMemory fled transition must seed the generalized debt seam');
  assert.match(debt.disposition, /^(ally|vengeful)$/);
  assert.equal(first.state.story.moralMemory.mercyCount, 1);
  const id = force(first, 'depth_h7_spared_return', 'return', { force: false });
  const returning = first.state.encounterDirector.live[id];
  assert.ok(returning.ids.length >= 3, 'a vengeful spared ace must return with escalated composition');
  assert.equal(first.state.entities.get(returning.ids[0])?.data?.ai?.passive, debt.disposition === 'ally');
  const voices = collect(first, ['encounter:voice']);
  choose(first, id, 'ask');
  assert.equal(completion(first, 'depth_h7_spared_return')?.outcome, debt.disposition === 'ally' ? 'allied' : 'vengeful');
  assert.equal(first.state.story.flags.lastMoralReturnMercyCount, 1);
  assert.ok(voices.some((row) => row.payload.text.includes('mercy: 1')),
    'asking why must answer from cumulative mercy');

  const second = boot(47170);
  second.state.world.currentSectorId = 'sector_io_reach';
  second.bus.emit('moralMemory:remember', { id: 'ace_yara_no_cut', name: 'Yara No-Cut', cause: 'spared' });
  assert.equal(second.state.story.moralMemory.debts.ace_yara_no_cut.disposition, debt.disposition,
    'the disposition is seeded when spared, not rolled at reveal');
});

test('H8 resolves hail, break, and six seconds of mirrored sim-coordinate flight', () => {
  const hail = boot(47180);
  hail.state.story.playerChoiceLines = ['I came back for the names.'];
  const hailPlayer = hail.state.entities.get(hail.state.playerId);
  hailPlayer.data.defId = 'ship_kestrel';
  let id = force(hail, 'depth_h8_echo_of_player', 'hail');
  const hailLive = hail.state.encounterDirector.live[id];
  assert.equal(hail.state.entities.get(hailLive.ids[0]).data.defId, 'ship_kestrel',
    'the echo must carry the player hull signature');
  choose(hail, id, 'hail');
  assert.equal(completion(hail, 'depth_h8_echo_of_player')?.outcome, 'hailed');
  assert.equal(hail.state.story.flags.echoQuotedLine, 'I came back for the names.');

  const broken = boot(47181);
  const brokenEvents = collect(broken, ['sensorGhost:swarm']);
  id = force(broken, 'depth_h8_echo_of_player', 'break');
  const echoId = broken.state.encounterDirector.live[id].ids[0];
  broken.bus.emit('tether:attached', { actorId: broken.state.playerId, targetId: 999999 });
  assert.ok(broken.state.encounterDirector.live[id], 'an unrelated tether must not shatter the echo');
  broken.bus.emit('tether:attached', { actorId: broken.state.playerId, targetId: echoId });
  assert.equal(completion(broken, 'depth_h8_echo_of_player')?.outcome, 'shattered');
  assert.equal(brokenEvents.length, 1);

  const synced = boot(47182);
  id = force(synced, 'depth_h8_echo_of_player', 'sync');
  const live = synced.state.encounterDirector.live[id];
  const echo = synced.state.entities.get(live.ids[0]);
  const player = synced.state.entities.get(synced.state.playerId);
  assert.ok(echo && live.vars.mirrorCenter, 'mirror contact must be physical and expose its sim center');
  const center = live.vars.mirrorCenter;
  echo.pos.x = center.x + 100; echo.pos.z = center.z; echo.vel.x = 12; echo.vel.z = 0;
  player.pos.x = center.x - 100; player.pos.z = center.z; player.vel.x = -12; player.vel.z = 0;
  for (let i = 0; i < 6; i++) synced.sim.step(1);
  assert.equal(completion(synced, 'depth_h8_echo_of_player')?.outcome, 'synced');
  assert.equal(synced.state.story.flags.volsMirrorSecretUnlocked, true);
});

test('H8 publishes the complete player mirror identity before entity:spawned consumers run', () => {
  const t = boot(47183);
  const player = t.state.entities.get(t.state.playerId);
  player.data.defId = 'ship_kestrel';
  player.data.fittings = ['wpn_pulse_laser_s', null, 'mod_scanner_mk1', null, null, null];
  player.factionId = 'faction_free';
  player.data.factionId = player.factionId;
  player.data.team = player.team;

  let spawned = null;
  t.bus.on('entity:spawned', ({ entity }) => {
    if (!entity?.data?.echoOfPlayer) return;
    spawned = {
      defId: entity.data.defId,
      fittings: [...entity.data.fittings],
      team: entity.team,
      dataTeam: entity.data.team,
      callsign: entity.data.callsign,
      scanLabel: entity.data.scanLabel,
      role: entity.data.role,
      lootTableId: entity.data.lootTableId,
      silhouette: entity.data.silhouette,
      shipClass: entity.data.shipClass,
      archetype: entity.data.ai?.archetype,
      spawnContext: entity.data.ai?.spawnContext,
    };
  });

  const id = force(t, 'depth_h8_echo_of_player', 'spawn-identity');
  assert.ok(spawned, 'entity:spawned must observe the echo identity atomically, not a later mutation');
  assert.equal(spawned.defId, player.data.defId);
  assert.deepEqual(spawned.fittings, player.data.fittings);
  assert.equal(spawned.team, player.team);
  assert.equal(spawned.dataTeam, player.team);
  assert.equal(spawned.callsign, 'Tessera Echo');
  assert.equal(spawned.scanLabel, 'Tessera Echo');
  assert.equal(spawned.role, 'echo');
  assert.equal(spawned.lootTableId, null);
  assert.equal(spawned.silhouette, undefined);
  assert.equal(spawned.shipClass, undefined);
  assert.equal(spawned.archetype, 'mirror_echo');
  assert.equal(spawned.spawnContext, 'anomaly_echo');

  const live = t.state.encounterDirector.live[id];
  const echo = t.state.entities.get(live.ids[0]);
  assert.equal(contactStateWord(echo, player.team, t.state), 'ECHO');
});

test('H1 and H4 materialize the wreck and buoy their verbs act on', () => {
  const h1 = boot(47190);
  const h1Id = force(h1, 'depth_h1_distress_from_inside', 'physical');
  assert.ok([...h1.state.entities.values()].some((entity) => entity.type === 'wreck'
    && entity.data?.encounterId === h1Id
    && entity.data?.storyPropKind === 'vols_mayday_wreck'));

  const h4 = boot(47191);
  const h4Id = force(h4, 'depth_h4_love_letter_buoy', 'physical');
  assert.ok([...h4.state.entities.values()].some((entity) => entity.type === 'beacon'
    && entity.data?.encounterId === h4Id
    && entity.data?.storyPropKind === 'love_letter_buoy'
    && entity.data?.assetRef === 'asset.slice.kessler_handoff_beacon'));
});

test('actual authored player lines are recorded and quoted by H8', () => {
  const t = boot(47192);
  let id = force(t, 'depth_h1_distress_from_inside', 'choice-history');
  choose(t, id, 'board');
  assert.equal(t.state.story.playerChoiceLines.at(-1), 'I will bring the black box home.');

  id = force(t, 'depth_h8_echo_of_player', 'echo-history');
  choose(t, id, 'hail');
  assert.equal(t.state.story.flags.echoQuotedLine, 'I will bring the black box home.');
});

test('durable E1 outcomes change later E1 presentation instead of ending as inert flags', () => {
  const h3 = boot(47193);
  let id = force(h3, 'depth_h1_distress_from_inside', 'listen-first');
  choose(h3, id, 'listen');
  const h3Voices = collect(h3, ['encounter:voice']);
  force(h3, 'depth_h3_wreck_that_knows_you', 'vols-echo');
  assert.ok(h3Voices.some((row) => /VOLS ECHO/.test(row.payload.text)));

  const h8 = boot(47194);
  Object.assign(h8.state.story.flags, {
    understoryPermanentGrudge: true,
    orrinPathOpen: true,
    kindness: true,
  });
  const h8Voices = collect(h8, ['encounter:voice']);
  force(h8, 'depth_h8_echo_of_player', 'remembered-consequences');
  assert.ok(h8Voices.some((row) => /ORRIN|UNDERSTORY|KINDNESS/.test(row.payload.text)));
});

test('H6 wait observes a real battle result before creating the vulture outcome', () => {
  const t = boot(47195);
  const events = collect(t, ['salvage:fieldVulture', 'encounter:winnerHostile']);
  const id = force(t, 'depth_h6_patrol_ambush', 'wait-real');
  const live = t.state.encounterDirector.live[id];
  choose(t, id, 'wait');
  assert.equal(completion(t, 'depth_h6_patrol_ambush'), null);
  assert.equal(live.phase, 'waiting_battle');

  for (const entityId of live.ids.filter((entityId) => live.roles[entityId] === 'escort')) {
    const entity = t.state.entities.get(entityId);
    if (entity) entity.alive = false;
  }
  t.sim.step(1);
  assert.equal(completion(t, 'depth_h6_patrol_ambush')?.outcome, 'vultured');
  assert.equal(live.vars.winner, 'concord');
  assert.ok(events.some((row) => row.name === 'salvage:fieldVulture'
    && row.payload.resolution === 'combat_outcome'));
});

test('H7 covers ask, accept, and refuse for both seeded dispositions', () => {
  for (const disposition of ['ally', 'vengeful']) {
    for (const choiceId of ['ask', 'accept', 'refuse']) {
      let t = null;
      let debt = null;
      for (let seed = 47200; seed < 47300; seed += 1) {
        const candidate = boot(seed);
        candidate.state.world.currentSectorId = 'sector_io_reach';
        candidate.bus.emit('moralMemory:remember', {
          id: `return_${disposition}_${choiceId}`,
          name: 'Held-Out Return',
          cause: 'spared',
        });
        const next = candidate.state.story.moralMemory.debts[`return_${disposition}_${choiceId}`];
        if (next.disposition === disposition) { t = candidate; debt = next; break; }
      }
      assert.ok(t && debt, `seed for ${disposition}/${choiceId}`);
      const id = force(t, 'depth_h7_spared_return', `${disposition}-${choiceId}`, { force: false });
      choose(t, id, choiceId);
      assert.equal(completion(t, 'depth_h7_spared_return')?.outcome,
        choiceId === 'refuse' ? 'refused' : (disposition === 'ally' ? 'allied' : 'vengeful'));
    }
  }
});

test('completed encounters and pending moral debts survive a plain JSON save boundary', () => {
  const before = boot(47196);
  let id = force(before, 'depth_h2_drifting_bloom', 'save');
  choose(before, id, 'scan');
  before.bus.emit('moralMemory:remember', { id: 'saved_spare', name: 'Saved Spare', cause: 'spared' });
  const savedStory = JSON.parse(JSON.stringify(before.state.story));

  const resumed = boot(47196);
  resumed.state.story = savedStory;
  resumed.state.world.currentSectorId = 'sector_veil_nebula';
  assert.deepEqual(resumed.director.requestAuthoredEncounter({
    shapeId: 'depth_h2_drifting_bloom', encounterId: 'debug:e1:save:blocked',
    sectorId: 'sector_veil_nebula', anchor: { x: 0, z: 0 },
  }), { ok: false, reason: 'gated' });
  resumed.state.world.currentSectorId = 'sector_io_reach';
  id = force(resumed, 'depth_h7_spared_return', 'saved-debt', { force: false });
  assert.ok(resumed.state.encounterDirector.live[id]);
});
