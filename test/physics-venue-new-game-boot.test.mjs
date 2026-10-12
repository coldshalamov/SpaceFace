import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { runNewGameSimBoot } from '../src/core/newGameBoot.js';
import { onboarding } from '../src/systems/onboarding.js';
import { orbitalGallery } from '../src/gallery/orbital/system.js';
import { createKineticLeague } from '../src/sports/kineticLeague/system.js';
import { fields } from '../src/systems/fields.js';
import { installPhysicsVenueHooks, stagePhysicsVenue } from '../src/ui/physicsVenues.js';

function element() {
  return {
    children: [], style: {}, dataset: {}, textContent: '', innerHTML: '',
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    appendChild() {}, prepend() {}, remove() {}, setAttribute() {},
    getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, querySelector: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}

globalThis.document = {
  getElementById: () => null, querySelector: () => null,
  head: element(), body: element(), documentElement: null,
  createElement: () => element(),
};

function adventureActors(state) {
  return state.entityList.filter(entity => entity.alive !== false && entity.id !== state.playerId
    && (entity.data?.rescue === true || entity.data?.scenarioActorId));
}

for (const [kind, id, systemName] of [
  ['gallery', 'og-a1-straight-cue', 'orbitalGallery'],
  ['league', 'kl-01', 'kineticLeague'],
]) {
  test(`${kind} public temporary launch excludes Adventure preparation, actors and voice`, async () => {
    const run = await bootRealPath({ seed: 1845,
      systems: [Object.create(onboarding), orbitalGallery, createKineticLeague(), fields,
        'flightV3', 'actions', 'physics'],
      hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, isPlayer: true }] });
    const registry = { get: name => run.runtime.getSystem(name) };
    const helpers = run.runtime.getHelpers();
    const tutorial = run.runtime.getSystem('onboarding');
    const spoken = [];
    helpers.voice = { say(line) { spoken.push(line); return true; } };
    const tutorialLines = [];
    const rescueStarts = [];
    run.bus.on('tutorial:say', line => tutorialLines.push(line));
    run.bus.on('rescue:started', payload => rescueStarts.push(payload));
    const unhook = installPhysicsVenueHooks(run.bus, () => ({ state: run.state }));
    let boot;
    const newGame = opts => {
      run.state.mode = 'loading';
      boot = runNewGameSimBoot({ state: run.state, helpers, bus: run.bus, registry,
        opts, awaitPhysicsPrep: true });
    };
    const off = run.bus.on('game:new', newGame);
    try {
      assert.equal(stagePhysicsVenue(run.bus, kind, id), true);
      assert.deepEqual(await boot, { ok: true });
      await Promise.resolve();
      assert.equal(run.state.physicsVenueSession, true);
      assert.equal(adventureActors(run.state).length, 0,
        'loading never installs the 47-A cast or tutorial rescue bodies');
      assert.equal(tutorial._preparedRescue, null);
      assert.equal(tutorial.prepareStartingScene(), false);

      // This is the same readiness handoff the launcher uses, with no scenario bypass.
      run.state.mode = 'flight';
      run.bus.emit('game:started', {});
      assert.equal(run.state.onboarding.active, false,
        'suppression already holds before the queued venue enter event');
      await Promise.resolve();
      assert.equal(run.state.physicsVenuePublic.kind, kind);
      assert.equal(adventureActors(run.state).length, 0);
      assert.equal(rescueStarts.length, 0);
      tutorial._sayTutorial('Adventure-only contextual hint');
      assert.equal(tutorialLines.length, 0, 'the tutorial event voice remains closed');
      assert.equal(spoken.filter(line => line.channel === 'tutorial').length, 0);

      run.player = run.state.entities.get(run.state.playerId);
      run.step(2);
      const venueSystem = run.runtime.getSystem(systemName);
      const body = kind === 'gallery'
        ? run.state.entities.get(run.state.orbitalGallery.roles.cue)
        : venueSystem._venue.entity('ball');
      run.assertBodies([run.player, body], `temporary-${kind}`);
      assert.equal(run.proof().physicsBackend, 'rapier-dynamic');

      venueSystem.leave();
      run.bus.emit('game:new', { seed: 1845 });
      assert.deepEqual(await boot, { ok: true });
      await Promise.resolve();
      assert.equal(run.state.physicsVenueSession, false,
        'the next ordinary Adventure does not inherit temporary-session suppression');
      assert(adventureActors(run.state).some(entity => entity.data?.scenarioActorId),
        'ordinary New Game retains its authored 47-A opening');
      assert.equal(run.state.entityList.filter(entity => entity.data?.rescue === true).length, 6);
      run.state.mode = 'flight';
      run.bus.emit('game:started', {});
      assert.equal(run.state.onboarding.active, true);
      assert.equal(rescueStarts.length, 1, 'Adventure adopts its prepared rescue once');
      const lineCount = tutorialLines.length;
      tutorial._sayTutorial('Adventure contextual hint');
      assert.equal(tutorialLines.length, lineCount + 1);
    } finally {
      off();
      unhook();
      run.dispose();
    }
  });
}
