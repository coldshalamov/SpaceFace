import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { createSimulation } from '../src/core/sim.js';
import { chronicler } from '../src/systems/chronicler.js';
import { FAUNA_SPECIES, FAUNA_TAXONOMY } from '../src/data/alienFauna.js';
import { createAlienEcologyState, ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { FAUNA_FAMILIES, decodedSuhlClauses, namesForTheDead } from '../src/data/discoveryPresentation.js';
import { DISCOVERY_AUDIO_RECIPES, FAUNA_ROLE_SOUND, MACHINE_SOUND_IDS } from '../src/data/discoveryAudio.js';
import { MACHINE_KINDS, MACHINE_SITES } from '../src/data/precursorMachines.js';
import { materializeMachineLayer, tickMachineLayer } from '../src/systems/precursorMachines.js';
import { vergeCourt } from '../src/systems/faction_verge.js';
import { handleAlienEcologyEvent, serializeAlienEcologyState, deserializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { tickDiscoverySound } from '../src/systems/discoverySound.js';
import { faunaFieldNote } from '../src/ui/targetPanel.js';
import { codexPagesView } from '../src/ui/sim/codexPages.js';
import { discoveryCommsPayload } from '../src/ui/comms.js';
import { commsToastSpec } from '../src/ui/floatingText.js';
import { getBusForRecipe, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';

function fixture(sectorId = 'sector_veil_nebula') {
  const state = { meta: { seed: 4242 }, mode: 'flight', simTime: 0, tick: 0, playerId: 1,
    entities: new Map(), entityList: [], player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }],
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 } },
    world: { currentSectorId: sectorId, sectors: {}, alienEcology: createAlienEcologyState() } };
  const events = []; let id = 100;
  const world = { state, active: { dressing: [] }, registry: { get: () => null },
    _toGlobal: p => ({ ...p }), _toLocal: p => ({ ...p }),
    bus: { emit: (name, payload) => events.push({ name, payload }) },
    helpers: { mulberry32, hash32, spawnEntity(spec) {
      const entity = { ...spec, id: id++, alive: true, occupantGeneration: 1, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
    } } };
  const player = { id: 1, type: 'player', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10 };
  state.entities.set(1, player); state.entityList.push(player);
  return { state, world, events, player,
    seconds(seconds, update) {
      for (let i = 0; i < seconds * 10; i++) {
        state.simTime += .1; state.tick++;
        tickMachineLayer(world, .1);
        update?.(.1, state);
      }
    },
    spawn: world.helpers.spawnEntity,
  };
}
const pages = state => codexPagesView(state).sections.find(section => section.id === 'species').pages;

test('468: a physical scan earns only its species anatomy and behaviour page, with reload and deduplication', () => {
  const f = fixture(), ray = f.spawn({ type: 'fauna', pos: { x: 50, z: 0 }, data: { ecology: { speciesId: 'veil_ray', driveState: 'forage' } } });
  const other = f.spawn({ type: 'fauna', pos: { x: 1800, z: 0 }, data: { ecology: { speciesId: 'furnace_maw' } } });
  assert.equal(faunaFieldNote(ray, f.state), null);
  assert.equal(pages(f.state).find(page => page.id === 'veil_ray').unlocked, false);
  handleAlienEcologyEvent(f.world, 'scan:pulse', { source: 'npc', pos: { x: 0, z: 0 }, radius: 300 });
  assert.equal(f.state.world.alienEcology.revelation, 0);
  const pulse = { source: 'player-scanner', pos: { x: 0, z: 0 }, radius: 300 };
  handleAlienEcologyEvent(f.world, 'scan:pulse', pulse);
  assert.match(faunaFieldNote(ray, f.state).join(' '), /ELECTRORECEPTIVE MEMBRANE/);
  assert.equal(faunaFieldNote(other, f.state), null, 'global revelation does not expose an unscanned species');
  const page = pages(f.state).find(row => row.id === 'veil_ray');
  assert.equal(page.unlocked, true); assert.match(page.body, /Membrane drifters/); assert.match(page.body, /flinch/);
  assert.equal(pages(f.state).find(row => row.id === 'furnace_maw').unlocked, false);
  handleAlienEcologyEvent(f.world, 'scan:pulse', pulse);
  assert.equal(f.events.filter(row => row.payload?.from === 'Field Notes').length, 1);
  const restored = fixture(); deserializeAlienEcologyState(restored.state, JSON.parse(JSON.stringify(serializeAlienEcologyState(f.state))));
  assert.equal(pages(restored.state).find(row => row.id === 'veil_ray').unlocked, true);
  assert.equal(pages(restored.state).find(row => row.id === 'furnace_maw').unlocked, false);
  const legacy = JSON.parse(JSON.stringify(serializeAlienEcologyState(f.state)));
  delete legacy.taxonomy.scannedSpecies;
  legacy.evidence = { oldFieldNote1: true, oldFieldNote2: true };
  const oldRun = fixture(); deserializeAlienEcologyState(oldRun.state, legacy);
  assert.equal(oldRun.state.world.alienEcology.taxonomy.scannedSpecies, undefined);
  assert.equal(pages(oldRun.state).find(row => row.id === 'veil_ray').unlocked, true, 'a legacy save keeps its already-earned pages');
});

test('468: all existing species have a real field family, including seven different families', () => {
  assert.ok(new Set(Object.values(FAUNA_TAXONOMY)).size >= 5);
  for (const id of Object.keys(FAUNA_SPECIES)) {
    const family = FAUNA_TAXONOMY[id].replace('tax_', '');
    assert.ok(FAUNA_FAMILIES[family]?.note.length > 30, id);
  }
});

test('468: all nine role calls and every machine kind are wired to the live ambient recipe resolver', () => {
  assert.equal(Object.keys(FAUNA_ROLE_SOUND).length, 9);
  assert.deepEqual([...MACHINE_SOUND_IDS].sort(), Object.keys(MACHINE_KINDS).sort());
  const ids = new Set(DISCOVERY_AUDIO_RECIPES.map(row => row.id));
  for (const recipe of DISCOVERY_AUDIO_RECIPES) {
    assert.equal(resolveAudioCueRecipeId(recipe.id), recipe.id);
    assert.equal(getBusForRecipe(recipe, recipe.id), 'ambient');
    assert.ok(recipe.baseFreq > 30 && recipe.gainEnvelope.peak > 0 && recipe.gainEnvelope.release > 0);
  }
  const f = fixture();
  for (const role of Object.keys(FAUNA_ROLE_SOUND)) {
    const species = Object.values(FAUNA_SPECIES).find(row => row.role === role);
    assert.ok(species, `${role} has a live creature`);
    const entity = { id: role, alive: true, pos: { x: 100, z: 0 }, data: { ecology: { speciesId: species.id } } };
    assert.equal(tickDiscoverySound(f.world, [entity], 'fauna', f.player, f.state.simTime += 10), true);
    assert.ok(ids.has(f.events.at(-1).payload.id));
    assert.equal(tickDiscoverySound(f.world, [entity], 'fauna', f.player, f.state.simTime), false, 'a call is not emitted every frame');
  }
  for (const kind of MACHINE_SOUND_IDS) {
    const entity = { id: kind, alive: true, pos: { x: 100, z: 0 }, data: { machine: { kind } } };
    assert.equal(tickDiscoverySound(f.world, [entity], 'machine', f.player, f.state.simTime += 10), true);
    assert.ok(ids.has(f.events.at(-1).payload.id));
  }
  f.state.paused = true;
  assert.equal(tickDiscoverySound(f.world, [], 'machine', f.player, f.state.simTime += 10), false);
});

test('468: the unexplained Helios prism is materialized and audible on the ordinary starter mining approach', () => {
  const f = fixture('sector_helios_prime');
  const court = Object.create(vergeCourt);
  court.init({ state: f.state, bus: f.world.bus });
  const update = court.update.bind(court);
  materializeMachineLayer(f.world, { id: 'sector_helios_prime' }, f.world.active);
  const prism = f.state.entityList.find(entity => entity.data?.machine?.siteId === 'helios_unanswered_survey');
  assert.ok(prism); assert.equal(prism.type, 'machine');
  f.state.onboarding = { active: true };
  f.state.player.credits = 5150;
  f.player.mass = 33;
  f.player.pos = { x: 720, z: -260 }; f.seconds(1, update);
  assert.equal(f.state.world.alienEcology.machineSites.helios_unanswered_survey.seen, true);
  assert.equal(f.state.world.alienEcology.machineProtocol, 'unknown', 'the tease does not identify the machine civilisation');
  assert.ok(f.events.some(row => row.name === 'audio:cue' && row.payload.id === 'ambient_machine_surveyor_prism'));
  assert.ok(f.events.some(row => row.name === 'toast' && row.payload.kind === 'discovery'));
  assert.ok(f.state.simTime < 20 * 60);

  f.player.pos = { x: -400, z: -220 }; f.seconds(1, update);
  f.player.mass = 35; // Return from carrying the starter cargo.
  f.player.pos = { ...prism.pos }; f.seconds(5, update);
  assert.deepEqual(f.events.filter(row => row.name === 'verge:massWeighed').map(row => row.payload.mass), [33, 35]);
  f.player.pos = { x: 760, z: 460 }; f.seconds(20, update);
  assert.equal(f.events.some(row => row.name === 'economy:chargeCredits'), false);
  assert.deepEqual(f.state.verge.violations, []);
  assert.deepEqual(f.state.verge.checkpoints, {});
  assert.equal(f.state.verge.escort, null);
  assert.equal(f.state.verge.pursuit, null);
});

test('Continue retires the old Helios chase without changing a settled fine or another prism’s authority', () => {
  const f = fixture();
  const court = Object.create(vergeCourt);
  court.init({ state: f.state, bus: f.world.bus });
  const update = court.update.bind(court);
  materializeMachineLayer(f.world, { id: 'sector_veil_nebula' }, f.world.active);
  const prism = f.state.entityList.find(entity => entity.data?.machine?.siteId === 'veil_survey_monolith');
  assert.ok(prism);
  f.player.mass = 35;
  f.player.pos = { ...prism.pos };
  f.state.player.credits = 0;
  const saved = court.serialize();
  saved.seq = 15;
  saved.receipts = ['pursuit_fine:4', 'pursuit_fine:11'];
  saved.violations = [{ directive: 'ESCORT', machineId: 223, violatorId: 1, at: 0 }];
  const retired = { id: 15, machineId: prism.id, gen: 29, sectorId: 'sector_helios_prime' };
  saved.pursuit = { ...retired, openedAt: 0, status: 'crossed' };
  saved.returns = [{
    machineId: retired.machineId, gen: retired.gen, sectorId: retired.sectorId,
    siteId: 'helios_unanswered_survey', kind: 'surveyor_prism', x: 480, z: -220,
  }];
  const v = court.deserialize(JSON.parse(JSON.stringify(saved)));

  assert.equal(v.pursuit, null, 'the old post identity still identifies the retired chase after the body ID is reused');
  assert.deepEqual(v.receipts, saved.receipts);
  assert.equal(f.state.player.credits, 0);
  assert.deepEqual(v.returns, []);
  f.seconds(6, update);
  assert.equal(f.events.some(row => row.name === 'verge:pursuitResumed'), false);
  assert.equal(f.events.some(row => row.name === 'verge:checkpointChallenged' && row.payload.machineId === prism.id), true);
  assert.equal(v.escort?.machineId, prism.id, 'the authored Veil checkpoint still enforces a real docket mark');
});

test('468: only an accepted physical appeal decodes one clause, and Continue cannot decode it twice', () => {
  const f = fixture(); materializeMachineLayer(f.world, { id: 'sector_veil_nebula' }, f.world.active);
  f.player.pos = { ...MACHINE_SITES.veil_exception_chamber.center };
  const ae = ensureAlienEcologyState(f.state); ae.machineProtocol = 'revoked';
  addCargo(f.state, 'cmdty_spore_catalyst', 2); f.seconds(14);
  assert.equal(decodedSuhlClauses(f.state).length, 0);
  removeCargo(f.state, 'cmdty_spore_catalyst', 2, 'jettison'); f.seconds(13);
  assert.equal(decodedSuhlClauses(f.state).length, 1);
  const clause = decodedSuhlClauses(f.state)[0]; assert.ok(clause.incidentId); assert.match(clause.text, /classification/i);
  f.seconds(30); assert.equal(decodedSuhlClauses(f.state).length, 1);
  const saved = JSON.parse(JSON.stringify(serializeAlienEcologyState(f.state)));
  deserializeAlienEcologyState(f.state, saved); f.seconds(13);
  assert.equal(decodedSuhlClauses(f.state).length, 1);
  assert.equal(f.events.filter(row => row.payload?.from === 'Dr. Iren Suhl').length, 1);
});

test('468: Names for the Dead reads six real named losses and never invents missing people', () => {
  const sim = createSimulation({ seed: 4242, systems: [chronicler] });
  sim.state.playerId = 1; sim.state.world.currentSectorId = 'sector_helios_prime'; sim.state.mode = 'flight';
  for (let i = 0; i < 6; i++) {
    sim.state.simTime = 60 + i; sim.state.tick = (60 + i) * 60;
    sim.bus.emit('entity:killed', { id: 100 + i, victimId: 100 + i, victimName: `Actual Hull ${i}`, killerId: 1, cause: 'kinetic' });
    sim.registry.get('chronicler').update(1 / 60, sim.state);
  }
  const before = JSON.stringify(sim.state.chronicler), names = namesForTheDead(sim.state);
  assert.equal(names.length, 6); assert.ok(names.every(row => row.name.startsWith('Actual Hull') && row.citation));
  assert.ok(names.every(row => row.place === 'Helios Prime' && !row.body.includes('sector_')));
  assert.deepEqual(namesForTheDead({}), []);
  assert.equal(JSON.stringify(sim.state.chronicler), before);
});

test('468: discovery comms have their own category and only one presentation owner', () => {
  const machine = { from: 'Surveyor', kind: 'machine', text: 'HOLD POSITION.' };
  assert.deepEqual(discoveryCommsPayload(machine), { sender: 'Surveyor', category: 'machine', text: machine.text });
  assert.equal(commsToastSpec(machine), null);
  assert.equal(discoveryCommsPayload({ kind: 'ecology', text: ' ' }), null);
  assert.equal(discoveryCommsPayload({ kind: 'combat', text: 'An ordinary receipt' }), null);
  assert.ok(commsToastSpec({ kind: 'combat', text: 'An ordinary receipt' }));
});
