import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from '@babel/parser';
import { resolveShot } from '../scripts/lib/uiBenchCatalog.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState, validateRunState, canCancelSwarmPreparation } from '../src/core/runState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { swarmStakeFor } from '../src/data/swarmStakes.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { ships as shipsSystem } from '../src/systems/ships.js';
import { resetCrucibleMetaForTests, useCrucibleMetaStorage } from '../src/systems/survivalRecords.js';

const source = readFileSync(new URL('../tools/ui-bench.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module' });
const functions = ['benchOwnerBus', 'seedCrucibleRun', 'seedCrucibleShot'].map(name => {
  const node = ast.program.body.find(entry => entry.type === 'FunctionDeclaration' && entry.id.name === name);
  assert.ok(node, `${name} exists in the real bench`);
  return source.slice(node.start, node.end);
}).join('\n');

function fixture(id, query = '') {
  const shot = resolveShot(id);
  assert.ok(shot, `Unknown fixture ${id}`);
  const state = createGameState(4242);
  const mode = state.mode;
  const context = {
    state, shot, params: new URLSearchParams(query), bus: createBus(),
    COMBAT_LAB_STARTER_PACKAGES, TECH_NODES, createRunState, runSession, shipsSystem, survivalDraft, swarmStakeFor,
    benchDraftOwner: null, benchOwnerUnsubs: [], benchOwnerLive: false,
  };
  // Execute the real fixture constructors with the real run/draft/ship owners. No DOM,
  // renderer, click actor, run completion or cancellation response is manufactured here.
  runInNewContext(`${functions}\nseedCrucibleShot(shot.screen, shot);`, context);
  assert.equal(state.mode, mode, 'a fixture capture must not claim it launched gameplay');
  return { state, owner: context.benchDraftOwner, clean: () => context.benchOwnerUnsubs.forEach(off => off()) };
}

function withFreshProfile(work) {
  resetCrucibleMetaForTests();
  const values = new Map();
  useCrucibleMetaStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  try { return work(); } finally { useCrucibleMetaStorage(null); resetCrucibleMetaForTests(); }
}

test('opening armory fixture has a real unplanned run lifetime and starting equipment budget', () => withFreshProfile(() => {
  const h = fixture('crucible-opening');
  try {
    const run = h.state.run;
    assert.equal(validateRunState(run).ok, true);
    assert.equal(run.kind, 'survival');
    assert.equal(run.ruleset, 'swarm');
    assert.equal(run.phase, 'draft');
    assert.equal(run.wave, 0);
    assert.equal(run.wavePlanId, null);
    assert.ok(Number.isSafeInteger(run.retireToken) && run.retireToken > 0, 'runSession minted the lifetime');
    assert.equal(run.credits, swarmStakeFor(run.telemetry.swarmStake).purse);
    assert.equal(run.score, 0);
    assert.equal(canCancelSwarmPreparation(run), true, 'Back to hangar is eligible on the captured opening');
    assert.ok(h.owner.currentOffers().length > 0, 'the real draft owner supplies the visible equipment');
  } finally { h.clean(); }
}));

test('canonical round-three armory and Gauntlet fixtures retain their original phase and budget', () => withFreshProfile(() => {
  for (const [id, query, ruleset] of [
    ['crucible-draft', '', 'swarm'],
    ['crucible-rearm', '', 'scored'],
    ['crucible-opening', 'ruleset=scored', 'scored'],
  ]) {
    const h = fixture(id, query);
    try {
      const run = h.state.run;
      assert.equal(validateRunState(run).ok, true);
      assert.equal(run.ruleset, ruleset);
      assert.equal(run.phase, 'draft');
      assert.equal(run.wave, 3);
      assert.equal(run.credits, 64);
      assert.equal(run.score, 1180);
      assert.equal(canCancelSwarmPreparation(run), false, `${id} is not a fresh Swarm preparation`);
    } finally { h.clean(); }
  }
}));
