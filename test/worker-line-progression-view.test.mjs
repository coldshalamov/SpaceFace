import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { normalizeLineProgression } from '../src/data/lineProgression.js';
import { readLineVisualProfile } from '../src/render/lineVisualProfile.js';
import { lineStrainWords } from '../src/ui/lineStrainReadout.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { lineProgression } from '../src/systems/lineProgression.js';

test('native heavy anchor carries the owner class and heat through the worker view, then clears and restores', async () => {
  const h = await bootRealPath({ seed: 10,
    systems: ['actions', 'flightV3', 'aiPorts', 'physics', combat, tetherGameplay, lineProgression],
    hulls: [{ hullId: 'ship_wasp', isPlayer: true, pos: { x: 0, z: 0 } }] });
  try {
    const rock = h.spawnObstacle({ pos: { x: 110, z: 0 }, radius: 14, mass: 960, dynamic: false,
      data: { typeId: 'ast_common_rock' } });
    const differ = createDomainDiffer(), domains = new Map();
    function sync() {
      for (const update of differ.diff(h.state, h.state.tick).updates) {
        applyDomainPathUpdate(domains, structuredClone(update), new Set());
      }
      return { mode: domains.get('mode'), run: domains.get('run'), player: domains.get('player'),
        playerId: h.state.playerId, entities: h.state.entities, lineProgression: domains.get('lineProgression') };
    }
    let view = sync();
    assert.equal(view.lineProgression.classIndex, 1);
    assert.equal(view.lineProgression.presentationHold.targetId, null);
    h.state.input.aimWorld = { ...rock.pos };
    h.state.input.tetherMode = 'nearest';
    h.step(1, { before() { h.state.input.actions.tetherFire = true; }, after: sync });
    h.step(60, { before() { h.state.input.actions.tetherFire = false; }, after: sync });
    assert.equal(h.state.player.tether.targetId, rock.id, 'the real latch owner acquired the anchor');
    assert.equal(h.state.lineProgression.overClass, true);
    h.state.lineProgression.privateScratch = { shouldNotShip: 'private' };
    view = sync();
    assert.equal(view.lineProgression.presentationHold.targetId, rock.id);
    assert.equal(view.lineProgression.presentationHold.attachmentId, h.state.player.tether.attachmentId);
    assert.equal(view.lineProgression.privateScratch, undefined);
    assert.equal(view.lineProgression.classFullControlMassT, 20);
    assert.equal(view.lineProgression.overClass, true);
    assert.equal(view.lineProgression.winchHeat, h.state.lineProgression.winchHeat);
    const profile = readLineVisualProfile(view);
    assert.equal(profile.overClass, true);
    assert.equal(profile.verdictKnown, true);
    assert.equal(profile.heat, h.state.lineProgression.winchHeat);
    assert.equal(profile.ceilingT, 20);
    assert.equal(readLineVisualProfile(h.state).overClass, true, 'the authoritative main lane still reads its own bag');

    h.step(1, { before() { h.state.input.actions.tetherCut = true; }, after: sync });
    h.step(2, { before() { h.state.input.actions.tetherCut = false; }, after: sync });
    view = sync();
    assert.equal(h.state.player.tether.active, false);
    assert.equal(view.lineProgression.presentationHold.targetId, null);
    assert.equal(view.lineProgression.overClass, false);
    assert.equal(readLineVisualProfile(view).overClass, false);
    assert.equal(view.lineProgression.tonnageLoggedT, 960);

    h.runtime.getSystem('lineProgression').deserialize({ data: { tonnageLoggedT: 15000,
      grantedClassSteps: 1, trialClassSteps: 0, winchHeat: 0 } });
    h.step(1); view = sync();
    assert.equal(view.lineProgression.classIndex, 3);
    assert.equal(normalizeLineProgression(view.lineProgression).classIndex, 3,
      'the station appraisal can reconstruct the earned class from the bounded mirror');
    assert.equal(view.lineProgression.presentationHold.targetId, null);
  } finally { h.dispose(); }
});

test('projected verdict requires the same attachment and target lifetime; cooling and main-lane reads survive', () => {
  const target = { id: 2, occupantGeneration: 7, alive: true };
  const state = { mode: 'flight', run: { kind: 'adventure', phase: 'inactive' },
    player: { tether: { active: true, targetId: 2, attachmentId: 'a1' } },
    entities: new Map([[2, target]]),
    lineProgression: { classIndex: 1, overClass: true, winchHeat: .4,
      presentationHold: { targetId: 2, attachmentId: 'a1', occupantGeneration: 7 } } };
  let profile = readLineVisualProfile(state);
  assert.equal(profile.verdictKnown, true); assert.equal(profile.overClass, true);

  for (const change of [
    () => { state.player.tether.attachmentId = 'a2'; },
    () => { state.player.tether.targetId = 3; },
    () => { target.occupantGeneration = 8; },
    () => { state.lineProgression.presentationHold.occupantGeneration = null; },
    () => { state.entities.delete(2); },
  ]) {
    state.player.tether.targetId = 2; state.player.tether.attachmentId = 'a1';
    target.occupantGeneration = 7; state.entities.set(2, target);
    state.lineProgression.presentationHold.occupantGeneration = 7;
    change(); profile = readLineVisualProfile(state);
    assert.equal(profile.verdictKnown, false); assert.equal(profile.overClass, null);
    assert.equal(profile.heat, .4, 'winch heat remains a hardware reading during identity lag');
    const words = lineStrainWords(state, profile);
    assert.equal(words.title, 'LINE I · RATED 20 T');
    assert.equal(words.detail, 'WINCH 40%');
    assert.doesNotMatch(words.detail, /OVER CLASS|WITHIN CLASS/);
  }
  state.player.tether.active = false;
  profile = readLineVisualProfile(state);
  assert.equal(profile.overClass, false); assert.equal(profile.heat, .4);
  assert.equal(lineStrainWords(state, profile).detail, 'WINCH COOLING');

  delete state.lineProgression.presentationHold;
  state.player.tether.active = true;
  profile = readLineVisualProfile(state);
  assert.equal(profile.verdictKnown, true); assert.equal(profile.overClass, true,
    'the main lane trusts its direct owner without a worker presentation marker');
});
