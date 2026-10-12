// Swarm shelf relevance and the campaign-objective untrack. The armory screen is
// the UI lane; this pins the data the shelf is allowed to offer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { offerDraft } from '../src/data/survivalDraft.js';
import { isSwarmRelevantDef, swarmFightReason } from '../src/data/swarmCatalog.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { missions } from '../src/systems/missions.js';

const HARNESS_IRRELEVANT = /cargo|market|trade|uplink|drill|prospect|bio-?spectral|biofilm|survey|refin|mining/i;

function defById(id) {
  return MODULES.find((m) => m.id === id) || WEAPONS.find((w) => w.id === id) || null;
}

test('the ricochet starter and a full swarm draft stay inside the fight', () => {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === 'ricochet_runner');
  assert.ok(starter);
  for (const row of starter.loadout) {
    const def = defById(row.defId);
    assert.ok(def, row.defId);
    assert.equal(isSwarmRelevantDef(def), true, row.defId);
    assert.ok(swarmFightReason(def).length >= 12, row.defId);
    assert.equal(HARNESS_IRRELEVANT.test(def.name || ''), false, def.name);
  }
  const scanner = defById('mod_cargo_scanner_s');
  assert.equal(isSwarmRelevantDef(scanner), false);
  assert.equal(scanner.swarmReason, undefined);
  const draft = offerDraft({
    seed: 4242, wave: 2, ruleset: 'swarm', hullId: 'ship_hornet', count: 5000, fittings: [],
  });
  assert.equal(draft.ok, true);
  assert.ok(draft.offers.length > 0);
  assert.equal(draft.offers.length, draft.eligibleCount, 'the draw covers the whole legal shelf');
  for (const offer of draft.offers) {
    const def = defById(offer.defId);
    assert.ok(def, offer.defId);
    assert.equal(isSwarmRelevantDef(def), true, offer.defId);
    assert.equal(def.swarmReason, undefined, `${offer.defId} stays unstamped`);
    assert.ok(swarmFightReason(def).length >= 12, offer.defId);
    assert.ok(typeof offer.blurb === 'string' && offer.blurb.length >= 12, offer.defId);
    assert.equal(HARNESS_IRRELEVANT.test(offer.name || ''), false, offer.name);
    assert.equal(HARNESS_IRRELEVANT.test(def.name || ''), false, def.name);
  }
});

test('a live swarm run drops the tracked campaign objective without failing it', () => {
  const sys = Object.create(missions);
  const mission = { id: 'contract-47a', status: 'active', title: '47-A' };
  sys.bus = { emit() {} };
  sys.state = {
    run: { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 1 },
    ui: { trackedMissionId: mission.id },
    nav: { waypoint: { kind: 'mission', missionId: mission.id } },
    missions: { active: [mission] },
  };
  assert.equal(sys._refreshNavigation(), false);
  assert.equal(sys.state.ui.trackedMissionId, null);
  assert.equal(sys.state.nav.waypoint, null);
  assert.equal(mission.status, 'active');
  sys.state.run = { kind: 'adventure', phase: 'active' };
  sys.state.ui.trackedMissionId = null;
  sys.state.nav.waypoint = null;
  assert.equal(sys._refreshNavigation(), true);
  assert.equal(sys.state.ui.trackedMissionId, mission.id);
});
