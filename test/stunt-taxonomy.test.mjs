// PQ-146 revision 2 taxonomy contract. Sixteen recognitions: thirteen primaries across six
// families, two modifiers and one bridge. Recognition reads physical evidence only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRICK_DEFINITIONS, KNOWN_TRICK_IDS, STUNT_SCHEMA_VERSION, classifyStuntEvidence, createStuntDetector } from '../src/combat/stuntTaxonomy.js';
import { EVIDENCE_REVISION } from '../src/combat/stuntEvidence.js';
import { PRIMARY_SCORING } from '../src/combat/stuntScoring.js';

const PRIMARIES = ['bolas','wrecking_ball','clothesline','tow_kill','rock_discovery','well_golf','dead_mans_mass','bank_job','return_to_sender','kickstart','needle_thread','one_two','slingshot_golf'];
const FAMILIES = ['tether','impact','field','debris','rebound','escape'];

test('sixteen recognitions: thirteen primaries in six families, two modifiers, one bridge, rarity bases 50/90/140/200', () => {
  assert.equal(STUNT_SCHEMA_VERSION, 2);
  assert.equal(KNOWN_TRICK_IDS.length, 16);
  assert.deepEqual(KNOWN_TRICK_IDS.filter(id => TRICK_DEFINITIONS[id].role === 'primary').sort(), [...PRIMARIES].sort());
  assert.deepEqual(KNOWN_TRICK_IDS.filter(id => TRICK_DEFINITIONS[id].role === 'modifier').sort(), ['collateral','razor_release']);
  assert.deepEqual(KNOWN_TRICK_IDS.filter(id => TRICK_DEFINITIONS[id].role === 'bridge'), ['near_miss']);
  assert.deepEqual([...new Set(PRIMARIES.map(id => TRICK_DEFINITIONS[id].family))].sort(), [...FAMILIES].sort());
  const byRarity = { common: 50, uncommon: 90, rare: 140, legendary: 200 };
  for (const id of PRIMARIES) {
    const def = TRICK_DEFINITIONS[id];
    assert.equal(def.baseScore, byRarity[def.rarity], id);
    assert.deepEqual(PRIMARY_SCORING[id], [def.family, def.baseScore], `${id} scoring spec agrees with the definition`);
  }
  for (const id of ['collateral','razor_release','near_miss']) {
    assert.equal(TRICK_DEFINITIONS[id].baseScore, 0, `${id} never independently pays`);
    assert.equal(TRICK_DEFINITIONS[id].family, null);
    assert.equal(PRIMARY_SCORING[id], undefined);
  }
  assert.equal(TRICK_DEFINITIONS.near_miss.name, 'Close Shave');
  assert.equal(TRICK_DEFINITIONS.slingshot_golf.rarity, 'legendary');
  assert.equal(TRICK_DEFINITIONS.rock_discovery.rarity, 'common');
  assert.ok(Object.isFrozen(TRICK_DEFINITIONS) && Object.isFrozen(TRICK_DEFINITIONS.bolas));
});

// Minimal evidence shaped like the physical journal. u = 100 so thresholds read as fractions.
function root(over = {}) {
  return { id: 'root:1', actorId: 0, sourceId: 1, sourceLife: 'life:1', tick: 100, kind: 'weapon_hit', truncated: false,
    sourceType: 'ship', sourceHostile: true, sourceDeathTick: null, sourceName: 'A',
    reference: { cruise: 100, mass: 16, hull: 100, radius: 6, length: 12 }, playerMass: 18, playerLength: 12, sceneReferenceMass: 18,
    before: { x: 0, z: 100 }, after: { x: 100, z: 0 }, dv: { x: 100, z: -100 }, nodes: [], terminals: [], ...over };
}
function receipt(over = {}, rootOver = {}, pathOver = {}) {
  const r = root(rootOver);
  return { tick: 160, targetId: 2, targetName: 'B', targetHostile: true, damageApplied: true, targetKilled: true, hullDamage: 100, targetHullMax: 100, helmLossSeconds: 0,
    surface: 'craft', otherMass: 16, victimLife: { lifeId: 'life:2', threatClass: 'fodder', dead: true },
    stuntEvidence: { revision: EVIDENCE_REVISION, root: r, previousRoot: null,
      path: { rootId: r.id, sourceId: 1, targetId: 2, sourceLife: 'life:1', targetLife: 'life:2', tick: 160, edges: 1, closingSpeed: 80, usefulDeltaV: 140, momentum: 640, ...pathOver },
      contact: { aId: 1, bId: 2, aRef: { cruise: 100, mass: 16, hull: 100 }, bRef: { cruise: 100, mass: 16, hull: 100 } } }, ...over };
}
const swing = { constraint: { id: 'rope', loadedTicks: 30, sweep: 90, attached: false, displacement: 40 }, release: { id: 'release:1', tick: 120, reason: 'tether_cut', grade: 'razor' } };

test('a receipt without a live physical root, a hostile target or a material consequence names nothing', () => {
  assert.deepEqual(classifyStuntEvidence(receipt({}, swing)), ['bolas']);
  assert.deepEqual(classifyStuntEvidence({ ...receipt({}, swing), stuntEvidence: { ...receipt({}, swing).stuntEvidence, revision: 1 } }), []);
  assert.deepEqual(classifyStuntEvidence(receipt({}, { ...swing, truncated: true })), []);
  assert.deepEqual(classifyStuntEvidence(receipt({ targetHostile: false }, swing)), []);
  assert.deepEqual(classifyStuntEvidence(receipt({ targetKilled: false, hullDamage: 20, helmLossSeconds: 3 }, swing)), [], 'twenty percent hull is not material');
  assert.deepEqual(classifyStuntEvidence(receipt({ targetKilled: false, hullDamage: 30, helmLossSeconds: 0.5 }, swing)), [], 'half a second of helm loss is not material');
  assert.deepEqual(classifyStuntEvidence(receipt({ targetKilled: false, hullDamage: 30, helmLossSeconds: 1 }, swing)), ['bolas'], 'a quarter hull plus one second of helm loss is');
  assert.deepEqual(classifyStuntEvidence(receipt({ tick: 590 }, swing, { tick: 590 })), [], 'eight seconds after the root the lineage is closed');
  assert.deepEqual(classifyStuntEvidence(receipt({}, swing, { edges: 5 })), [], 'more than four transfer edges is not a bounded chain');
  assert.deepEqual(classifyStuntEvidence(receipt({ damageApplied: false }, swing)), []);
});

test('each primary card reads its own physical witnesses and no button-side fact', () => {
  // Bolas: loaded 60-degree swing, release, intact hostile payload, closing at half cruise.
  assert.deepEqual(classifyStuntEvidence(receipt({}, { ...swing, constraint: { ...swing.constraint, sweep: 50 } })), [], 'fifty degrees is not a swing');
  assert.deepEqual(classifyStuntEvidence(receipt({}, { ...swing, constraint: { ...swing.constraint, loadedTicks: 10 } })), [], 'a quarter second of load is required');
  assert.deepEqual(classifyStuntEvidence(receipt({}, swing, { closingSpeed: 40 })), [], 'closing under half cruise is a touch');
  assert.deepEqual(classifyStuntEvidence(receipt({}, { ...swing, sourceDeathTick: 90 })), ['dead_mans_mass'], 'a dead payload is a repurposed wreck, never a Bolas');
  assert.deepEqual(classifyStuntEvidence(receipt({ tick: 320 }, swing, { tick: 320 })), [], 'contact more than three seconds after release is unclaimed');
  // Wrecking Ball: still attached, 45-degree loaded arc, mass at least half the victim, closing at half the victim cruise.
  const attached = { constraint: { id: 'rope', loadedTicks: 30, sweep: 50, attached: true, displacement: 40 } };
  assert.deepEqual(classifyStuntEvidence(receipt({}, attached)), ['wrecking_ball']);
  assert.deepEqual(classifyStuntEvidence(receipt({}, { ...attached, reference: { cruise: 100, mass: 6, hull: 100, radius: 6, length: 12 } })), [], 'a light flail cannot wreck a heavier hull');
  assert.deepEqual(classifyStuntEvidence(receipt({}, { constraint: { ...attached.constraint, loadedTicks: 130 } })), [], 'orbit duration past two seconds is not paid');
  // Tow-kill: the payload itself dies on terrain while still attached after two hull lengths of tow.
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 1, surface: 'terrain' }, attached)), ['tow_kill','rock_discovery'], 'the fatal towed terrain contact outranks its own Rock Discovery fact');
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 1, surface: 'terrain', targetKilled: false, hullDamage: 40, helmLossSeconds: 2 }, attached)), ['rock_discovery'], 'a tow needs a kill; a disabling terrain contact is only Rock Discovery');
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 1, surface: 'terrain' }, { constraint: { ...attached.constraint, displacement: 10 } })), ['rock_discovery'], 'under two hull lengths of tow the terrain death is only Rock Discovery');
  // Rock Discovery: the redirected body itself meets terrain at half cruise within three seconds.
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 1, surface: 'terrain' })), ['rock_discovery']);
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 1, surface: 'craft' })), [], 'a body-to-body contact is not geology');
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 1, surface: 'terrain', tick: 300 }, {}, { tick: 300 })), []);
  // Dead Man's Mass: a substantial wreck manipulated after its death.
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'wreck', sourceDeathTick: 50 })), ['dead_mans_mass']);
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'wreck', sourceDeathTick: 100 })), [], 'a manipulation at the death tick inherits, it does not author');
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'wreck', sourceDeathTick: 50, reference: { cruise: 100, mass: 3, hull: 1, radius: 6, length: 12 } })), [], 'a cosmetic fragment under a fifth of the reference mass');
  // One-Two: a second, separated, 45-degree revision of a free path.
  const first = root({ id: 'root:0', tick: 60, nodes: [{ kind: 'weapon_hit', tick: 60, endTick: 60 }] });
  const withPrevious = (over = {}, prev = first) => { const r = receipt({ targetId: 1, surface: 'terrain' }, { previousRoot: prev.id, ...over }); r.stuntEvidence.previousRoot = prev; return r; };
  assert.deepEqual(classifyStuntEvidence(withPrevious()), ['one_two','rock_discovery']);
  assert.deepEqual(classifyStuntEvidence(withPrevious({}, { ...first, tick: 92, nodes: [{ kind: 'weapon_hit', tick: 92, endTick: 92 }] })), ['rock_discovery'], 'under a fifth of a second of free flight is one intervention');
  assert.deepEqual(classifyStuntEvidence(withPrevious({ before: { x: 100, z: 0 }, after: { x: 120, z: 30 }, dv: { x: 20, z: 30 } })), ['rock_discovery'], 'a fourteen-degree revision is more damage, not a second solution');
  // Well Golf and Slingshot Golf: a causal field entry, a 35-degree bend, exit, and a terminal within three seconds.
  const fieldExit = { kind: 'field_exit', tick: 140, entryTick: 130, entryCausal: true, bend: 40, deltaV: 30 };
  assert.deepEqual(classifyStuntEvidence(receipt({}, { nodes: [fieldExit] })), ['well_golf']);
  assert.deepEqual(classifyStuntEvidence(receipt({}, { nodes: [{ ...fieldExit, entryCausal: false }] })), [], 'a field the body would have entered anyway is not a golf');
  assert.deepEqual(classifyStuntEvidence(receipt({}, { nodes: [{ ...fieldExit, bend: 20 }] })), []);
  assert.deepEqual(classifyStuntEvidence(receipt({}, { ...swing, nodes: [fieldExit] })), ['slingshot_golf','well_golf','bolas']);
  assert.deepEqual(classifyStuntEvidence(receipt({ tick: 300 }, { ...swing, nodes: [{ ...fieldExit, entryTick: 250, tick: 255 }] }, { tick: 300 })), ['well_golf','bolas'], 'entry more than two seconds after release is not a sling');
  // Clothesline: a line intercept edge, then a second transfer edge from the intercepted body.
  const intercept = { kind: 'line_intercept', tick: 130, lifeId: 'life:2', loadedTicks: 20, endpointDisplacement: 30, deltaV: 40, crossedPriorCorridor: true, displacementTick: 100 };
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 3, surface: 'terrain' }, { nodes: [intercept] }, { edges: 2, sourceLife: 'life:2', targetLife: 'life:3' })), ['clothesline']);
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 3, surface: 'terrain' }, { nodes: [{ ...intercept, deltaV: 20 }] }, { edges: 2, sourceLife: 'life:2' })), [], 'under 0.3 cruise transverse transfer is a rendered rope');
  assert.deepEqual(classifyStuntEvidence(receipt({ targetId: 3, surface: 'terrain' }, { nodes: [intercept] }, { edges: 1, sourceLife: 'life:2' })), [], 'without the follow-on collision there is no Clothesline');
  // Bank Job and Return to Sender read the projectile lineage.
  const bank = { kind: 'reflection', tick: 130, angle: 40, unreflectedMiss: true, directOccluded: true, solutionTick: 95, surfaceDisplacement: 0, surfaceWidth: 20, surfaceTurn: 0, playerDisplacement: 20, playerTurn: 30 };
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'projectile', nodes: [bank] })), ['bank_job']);
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'projectile', nodes: [{ ...bank, directOccluded: false }] })), [], 'a target the direct line reaches is fair shooting, not a bank');
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'projectile', nodes: [{ ...bank, playerTurn: 10, playerDisplacement: 0 }] })), [], 'a fixed firing solution at a fixed wall earns nothing');
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'projectile', projectileOwnerId: 2, originalMissesOwner: true, kind: 'projectile_redirect' })), ['return_to_sender']);
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'projectile', projectileOwnerId: 2, originalMissesOwner: true, kind: 'passive_reflect' })), [], 'a passive stationary shield is not execution');
  assert.deepEqual(classifyStuntEvidence(receipt({}, { sourceType: 'projectile', projectileOwnerId: 9, originalMissesOwner: true, kind: 'projectile_redirect' })), [], 'returning it to a different enemy is a bank variant');
});

test('escape receipts need a tracked threat and a completed escape; Kickstart needs a retained launch', () => {
  const escape = (over = {}, rootOver = {}) => ({ tick: 200, targetId: 5, targetHostile: true, escape: { completed: true, closeShave: false, boundaryIds: [], threatEpisodeId: 'threat:1', ...over },
    victimLife: { lifeId: 'life:5', threatClass: 'none', dead: false },
    stuntEvidence: { revision: EVIDENCE_REVISION, contact: null, path: { tick: 200, edges: 0, usefulDeltaV: 0, momentum: 0 },
      root: root({ id: 'root:9', sourceId: 0, tick: 120, kind: 'impulse_charge', threatAtRoot: 'threat:1',
        nodes: [{ kind: 'launch_retained', tick: 165, deltaV: 40, exitSpeed: 140, retainedSpeed: 135, retainedTicks: 45 }], ...rootOver }) } });
  assert.deepEqual(classifyStuntEvidence(escape()), ['kickstart']);
  assert.deepEqual(classifyStuntEvidence(escape({ completed: false })), [], 'an unfinished escape is not paid');
  assert.deepEqual(classifyStuntEvidence(escape({}, { threatAtRoot: null })), [], 'a self-blast in empty space is nothing');
  assert.deepEqual(classifyStuntEvidence(escape({}, { nodes: [{ kind: 'launch_retained', tick: 165, deltaV: 40, exitSpeed: 120, retainedSpeed: 118, retainedTicks: 45 }] })), [], 'under 1.25 cruise is not a Kickstart');
  assert.deepEqual(classifyStuntEvidence(escape({}, { nodes: [{ kind: 'launch_retained', tick: 165, deltaV: 40, exitSpeed: 140, retainedSpeed: 100, retainedTicks: 45 }] })), [], 'speed thrown away is not a Kickstart');
  assert.deepEqual(classifyStuntEvidence(escape({ closeShave: true }, { nodes: [] })), ['near_miss'], 'a bare narrow miss is only the bridge');
  assert.deepEqual(classifyStuntEvidence(escape({ boundaryIds: [7, 8] }, { needle: { boundaryIds: [7, 8] }, escape: { boundaryIds: [7, 8] }, nodes: [] })), ['needle_thread']);
  assert.deepEqual(classifyStuntEvidence(escape({ boundaryIds: [7, 8] }, { needle: { boundaryIds: [7, 8] }, escape: { boundaryIds: [7, 8] }, nodes: [], tick: 10 })), [], 'an escape more than three seconds after the root is not this root');
});

test('precedence names one primary for one physical achievement and settles the same victim once', () => {
  const detector = createStuntDetector({ playerId: 0 });
  const sling = receipt({}, { ...swing, nodes: [{ kind: 'field_exit', tick: 140, entryTick: 130, entryCausal: true, bend: 40, deltaV: 30 }] });
  const [trick] = detector.processEvent('combat:collisionConsequence', sling);
  assert.equal(trick.trickId, 'slingshot_golf');
  assert.deepEqual(trick.factualTags, ['well_golf', 'bolas'], 'the less specific names ride along as facts');
  assert.equal(trick.modifiers.razorRelease, 'razor');
  assert.equal(trick.modifiers.collateralCount, 1);
  assert.deepEqual(detector.processEvent('combat:collisionConsequence', sling), [], 'the same dead victim on the same episode pays once');
  assert.deepEqual(detector.processEvent('combat:collisionConsequence', receipt({}, { actorId: 4 })), [], 'an NPC root is never the player');
  assert.deepEqual(detector.processEvent('combat:collisionConsequence', { ...sling, victimLife: null }), [], 'no victim life, no terminal');
  const again = createStuntDetector({ playerId: 0 });
  assert.equal(again.processTrace([{ type: 'combat:collisionConsequence', data: sling }]).length, 1);
  assert.deepEqual(again.processTrace([{ type: 'combat:collisionConsequence', data: sling }]), [], 'a second pass over the same tape is a replay');
  const fresh = createStuntDetector({ playerId: 0 }), twin = createStuntDetector({ playerId: 0 });
  assert.deepEqual(fresh.processTrace([{ type: 'combat:collisionConsequence', data: sling }]), twin.processTrace([{ type: 'combat:collisionConsequence', data: sling }]), 'deterministic across detectors');
});
