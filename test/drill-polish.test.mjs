import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DRILL_GRIND_LOOP_ID,
  audio,
  drillGrindMix,
} from '../src/audio/audioSystem.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import {
  DRILL_GAS_SHAKE_MAX_PX,
  drillGasShakeOffset,
} from '../src/ui/screens/drill.js';

function drillState({ heat = 0, energy = 100, hardness = 1, active = true } = {}) {
  return {
    active,
    drillTemp: heat,
    drillEnergy: energy,
    avatar: { isDrilling: active, drillTarget: { col: 0, row: 0 } },
    field: [[{ hardness }]],
  };
}

test('gas trauma moves the drill canvas, decays, and respects reduced motion', () => {
  const full = drillGasShakeOffset(0.42, 0, false);
  const late = drillGasShakeOffset(0.08, 0.34, false);
  const reduced = drillGasShakeOffset(0.42, 0, true);
  assert.ok(Math.hypot(full.x, full.y) > 1, 'gas impact must produce visible canvas displacement');
  assert.ok(Math.abs(full.x) <= DRILL_GAS_SHAKE_MAX_PX);
  assert.ok(Math.abs(full.y) <= DRILL_GAS_SHAKE_MAX_PX);
  assert.ok(Math.hypot(late.x, late.y) < Math.hypot(full.x, full.y), 'trauma must decay');
  assert.ok(Math.hypot(reduced.x, reduced.y) <= Math.hypot(full.x, full.y) * 0.25 + 1e-9);
});

test('drill grind is one continuous bed modulated by heat, energy, and hardness', () => {
  const recipe = RECIPES.find((entry) => entry.id === DRILL_GRIND_LOOP_ID);
  assert.equal(recipe?.type, 'continuous_noise');
  assert.ok(recipe.gainMult <= 0.5, 'grind must stay below the semantic reward/hazard voices');

  const idle = drillGrindMix(drillState({ active: false }));
  const cool = drillGrindMix(drillState({ heat: 10, energy: 100, hardness: 0.7 }));
  const loaded = drillGrindMix(drillState({ heat: 90, energy: 18, hardness: 2.2 }));
  assert.equal(idle.active, false);
  assert.equal(cool.active, true);
  assert.ok(loaded.filterHz > cool.filterHz, 'hot, hard drilling must brighten the grind');
  assert.notEqual(loaded.rate, cool.rate, 'rig load must be audible before lockout');
});

test('drill grind lifecycle holds exactly one voice and releases it on contact loss', () => {
  let starts = 0;
  let releases = 0;
  const voice = {
    gain: { gain: { setTargetAtTime() {} } },
    filter: { frequency: { setTargetAtTime() {} } },
    sources: [{ playbackRate: { setTargetAtTime() {} } }],
  };
  const harness = {
    state: { drill: drillState({ heat: 45, energy: 70, hardness: 1.4 }) },
    rt: { ctx: { state: 'running', currentTime: 12 }, loops: {} },
    _startLoopVoice(id) {
      starts++;
      assert.equal(id, DRILL_GRIND_LOOP_ID);
      return voice;
    },
    _endLoopVoice(value) {
      releases++;
      assert.equal(value, voice);
    },
  };

  audio._updateDrillGrind.call(harness);
  audio._updateDrillGrind.call(harness);
  assert.equal(starts, 1, 'continuous contact must reuse one grind voice');
  assert.equal(harness.rt.loops.drillGrind, voice);

  harness.state.drill.avatar.isDrilling = false;
  audio._updateDrillGrind.call(harness);
  assert.equal(releases, 1);
  assert.equal(harness.rt.loops.drillGrind, undefined);
});

test('drill screen leaves semantic event audio to the presentation orchestrator', () => {
  const screen = readFileSync(new URL('../src/ui/screens/drill.js', import.meta.url), 'utf8');
  const orchestrator = readFileSync(new URL('../src/systems/presentationOrchestrator.js', import.meta.url), 'utf8');
  const adapters = readFileSync(new URL('../src/systems/presentationAdapters.js', import.meta.url), 'utf8');

  assert.doesNotMatch(screen, /emit\(['"]audio:cue['"]/, 'screen must not stack generic drill cues');
  for (const event of ['drill:scanPulse', 'drill:yield', 'drill:gasHit']) {
    assert.match(orchestrator, new RegExp(event.replace(':', '\\:')));
  }
  for (const cue of ['mining.drill.seismic_pulse', 'mining.drill.yield', 'mining.drill.gas_hazard']) {
    assert.match(adapters, new RegExp(cue.replaceAll('.', '\\.')));
  }
  assert.match(screen, /fillText\('ENERGY'/, 'canvas must show a spatial energy gauge');
});
