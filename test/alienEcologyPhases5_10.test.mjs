// Focused coverage for alien-ecology program phases 5–10 (AE-050..AE-109):
// strain memory priors, ambient growth, encounter-deck bias, phantom contacts,
// exposure, faction policy, ecology missions, and the machine protocol layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIEN_SITES,
  ALIEN_STRAINS,
  CONTAMINATION_SITE_BASE,
  ECOLOGY_DECK,
  ECOLOGY_MISSIONS,
  EXPOSURE_MODEL,
  REVELATION_SOURCES,
  alienSitesForSector,
  contaminationAt,
  contaminationSaleMult,
  ecologyMissionForSite,
  pickEcologyEncounter,
  planPhantomContacts,
  pointContaminationAt,
  recordContaminationKnowledge,
} from '../src/data/alienEcology.js';
import {
  MACHINE_DIRECTIVES,
  MACHINE_KINDS,
  MACHINE_SITES,
  advanceMachineProtocol,
  grantWitnessMark,
  hasWitnessMark,
  machineProtocolRank,
  machineRevealsVerge,
  machineSitesForSector,
  suppressionFieldAt,
} from '../src/data/precursorMachines.js';
import { machineRouteOpen } from '../src/systems/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';

function makeState() {
  return {
    meta: { seed: 47 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_charon_expanse', sectors: {} },
    story: {},
  };
}

test('phases 5-6: strain vectors carry memory priors and wave sites exist per sector', () => {
  for (const [id, strain] of Object.entries(ALIEN_STRAINS)) {
    assert.ok(strain.memoryPriors, `${id} missing memoryPriors`);
    for (const [trait, v] of Object.entries(strain.memoryPriors)) {
      assert.ok(v >= 0 && v <= 1, `${id}.memoryPriors.${trait} out of [0,1]`);
    }
  }
  assert.ok(alienSitesForSector('sector_charon_expanse').length >= 3); // nursery + freighter + garden
  assert.ok(alienSitesForSector('sector_veil_nebula').length >= 1); // quiet ice
  assert.ok(alienSitesForSector('sector_ashfall_reach').length >= 1); // breathing dock
  for (const s of Object.values(ALIEN_SITES)) assert.ok(CONTAMINATION_SITE_BASE[s.siteId], `${s.siteId} missing site base`);
});

test('phase 7: point contamination blends sector lean with site lifts', () => {
  const state = makeState();
  const site = ALIEN_SITES.warm_freighter;
  const far = pointContaminationAt(state, 'sector_charon_expanse', site.center.x + 50000, site.center.z);
  const near = pointContaminationAt(state, 'sector_charon_expanse', site.center.x, site.center.z);
  assert.ok(near > far, 'site center should be hotter than deep space');
});

test('phase 7: ecology deck rows are gated by contamination and pick deterministically', () => {
  assert.ok(ECOLOGY_DECK.length >= 3);
  assert.equal(pickEcologyEncounter(makeState(), 'sector_helios_prime', null, () => 0.5), null);
  const a = pickEcologyEncounter(makeState(), 'sector_charon_expanse', null, () => 0.5);
  const b = pickEcologyEncounter(makeState(), 'sector_charon_expanse', null, () => 0.5);
  assert.deepEqual(a, b);
});

test('phase 7: phantom contacts only appear where contamination is high', () => {
  assert.equal(planPhantomContacts(makeState(), 'sector_helios_prime', () => 0.42).length, 0);
  const state = makeState();
  const sites = ensureAlienEcologyState(state).sites;
  for (const s of alienSitesForSector('sector_charon_expanse')) sites[s.siteId] = { state: 'bloom' };
  const phantoms = planPhantomContacts(state, 'sector_charon_expanse', () => 0.42);
  assert.ok(phantoms.length > 0, 'bloomed sites should lift sector contamination into phantom range');
  assert.equal(phantoms[0].phantom, true);
});

test('phase 7: faction policy refuses biohazard cargo at clean markets', () => {
  const state = makeState();
  const policy = contaminationSaleMult(state, 'sector_charon_expanse', 'faction_scn');
  assert.equal(policy.refuses, true);
  const quiet = contaminationSaleMult(state, 'sector_charon_expanse', 'faction_quiet');
  assert.ok(quiet.priceMult > 1, 'black market pays a premium');
});

test('phase 7: ecology missions bind to real sites and reuse known types', () => {
  const mission = ecologyMissionForSite('warm_freighter');
  assert.ok(mission, 'warm freighter should offer an ecology mission');
  assert.ok(['salvage_retrieval', 'recon_scan'].includes(mission.type));
  for (const m of ECOLOGY_MISSIONS) {
    assert.ok(ALIEN_SITES[m.siteId], `mission ${m.id} points at a missing site`);
  }
});

test('phase 7: contamination knowledge records per-sector summaries', () => {
  const state = makeState();
  recordContaminationKnowledge(state, 'sector_charon_expanse', 'growth confirmed at nursery');
  const ae = ensureAlienEcologyState(state);
  assert.ok(ae.mapKnowledge.sector_charon_expanse.notes.includes('growth confirmed at nursery'));
  assert.ok(REVELATION_SOURCES.length >= 3);
});

test('phase 9: machine protocol advances monotonically and faults are terminal', () => {
  assert.ok(machineProtocolRank('witnessed') > machineProtocolRank('observed'));
  const state = makeState();
  assert.equal(advanceMachineProtocol(state, 'seen'), 'observed');
  assert.equal(advanceMachineProtocol(state, 'satisfied'), 'compliant');
  assert.equal(advanceMachineProtocol(state, 'witnessed'), 'witnessed');

  const broken = makeState();
  advanceMachineProtocol(broken, 'seen');
  assert.equal(advanceMachineProtocol(broken, 'violated'), 'violation');
  // A violated record never climbs back up the order.
  advanceMachineProtocol(broken, 'satisfied');
  assert.equal(ensureAlienEcologyState(broken).machineProtocol, 'violation');
});

test('phase 9-10: machine sites are distributed and suppression fields resolve', () => {
  assert.ok(machineSitesForSector('sector_charon_expanse').length >= 1);
  assert.ok(machineSitesForSector('sector_veil_nebula').length >= 2);
  assert.ok(machineSitesForSector('sector_ashfall_reach').length >= 3);
  const corridor = MACHINE_SITES.veil_null_corridor;
  const field = suppressionFieldAt('sector_veil_nebula', corridor.center.x, corridor.center.z);
  assert.ok(field && field.suppression.radius > 0, 'null corridor center must sit in its field');
  assert.equal(suppressionFieldAt('sector_helios_prime', 0, 0), null);
  for (const d of Object.values(MACHINE_DIRECTIVES)) assert.ok(d.line && d.line.length > 0);
  assert.ok(Object.keys(MACHINE_KINDS).length >= 3);
});

test('phase 10: witness mark opens the machine route and reveals the Verge thread', () => {
  const state = makeState();
  assert.equal(machineRouteOpen(state, 'wormhole'), false);
  assert.equal(grantWitnessMark(state, 'ashfall_gate_underlayer'), true);
  assert.equal(hasWitnessMark(state), true);
  assert.equal(machineRouteOpen(state, 'wormhole'), true); // witnessed protocol opens it
  assert.equal(machineRevealsVerge(state), true);
  assert.equal(state.story.verge.revealed, true);
  assert.equal(machineRevealsVerge(state), false); // one-shot
});

test('exposure model constants stay inside sane bounds', () => {
  assert.ok(EXPOSURE_MODEL.gainPerSecPerC > 0);
  assert.ok(EXPOSURE_MODEL.decayPerSec > 0);
  assert.ok(EXPOSURE_MODEL.warnAt < EXPOSURE_MODEL.severeAt);
});
