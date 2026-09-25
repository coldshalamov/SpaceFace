// Crucible narration gate: a live Survival run owns its own announcement channel — no adventure
// narration (hull role briefing, unique-wreck rumor/news, cold-start comms, market headlines)
// may reach the flight glass. Adventure New Game must keep every one of those surfaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { story } from '../src/systems/story.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { crucibleSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame, installSandboxGameStartedHook } from '../src/ui/sandbox/sandboxSetup.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(seed = 4242) {
  const state = createGameState(seed);
  const bus = createBus();
  const heard = { toasts: [], news: [], comms: [], headlines: [] };
  bus.on('toast', (p) => heard.toasts.push(p));
  bus.on('news:publish', (p) => heard.news.push(p));
  bus.on('comms:popup', (p) => heard.comms.push(p));
  bus.on('news:headline', (p) => heard.headlines.push(p));
  const world = { enterSector() {}, relocatePlayerInSector() { return true; } };
  const registry = { get: (name) => ({ ships, economy, runSession, world })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  economy.init(ctx);
  ships.init(ctx);
  runSession.init(ctx);
  presentationAdapters.init(ctx);
  uniqueWrecks.init(ctx);
  story.init(ctx);
  createMarketNews(ctx);
  installSandboxGameStartedHook(bus, ctx);
  return { state, bus, heard, world };
}

const ADVENTURE_SENTENCES = /active ·|rumor charted/i;

test('Crucible launch surfaces no adventure narration (role briefing, wreck rumor, cold start, news)', async () => {
  const { state, bus, heard } = harness();
  // The Crucible arena lives inside Helios Prime — the same sector the Choir-Tender rumor keys on.
  state.world.currentSectorId = 'sector_helios_prime';
  state.mode = 'loading';
  const setup = crucibleSetupFor({ starterId: 'web_weaver', seed: 4242 }).value;
  requestSandboxGame(bus, crucibleLaunchConfig(setup));
  // Sandbox setup runs on scenePrepared — inside it ships.newGame() publishes the announce:true
  // roleContext packet while state.mode is still 'loading' and the run is already Survival.
  bus.emit('game:scenePrepared', {});
  assert.equal(state.run.kind, 'survival');
  state.mode = 'flight';
  bus.emit('game:started', {});
  await flush();
  for (let i = 0; i < 120; i++) story.update(1 / 60, state);
  await flush();
  assert.equal(
    heard.toasts.filter((t) => ADVENTURE_SENTENCES.test(String(t && t.text))).length,
    0,
    `adventure narration toasts leaked into the Crucible HUD: ${JSON.stringify(heard.toasts.map((t) => t && t.text))}`,
  );
  assert.equal(heard.comms.length, 0, 'story cold-start comms leaked into the Crucible HUD');
  assert.equal(
    heard.news.filter((e) => e && e.kind === 'wreck_rumor').length,
    0,
    'unique-wreck rumor news:publish leaked into the Crucible run',
  );
  assert.equal(heard.headlines.length, 0, 'marketNews republished a headline during a Survival run');
  assert.equal(
    state.player.uniqueWrecks && Object.keys(state.player.uniqueWrecks.bearings || {}).length,
    0,
    'a unique-wreck bearing was recorded during a Survival run',
  );
});

test('Adventure New Game still surfaces the role briefing and the Helios wreck rumor', async () => {
  const { state, bus, heard } = harness();
  state.world.currentSectorId = 'sector_helios_prime';
  state.mode = 'loading';
  ships.newGame(); // publishes the announce:true roleContext while loading → held for flight
  state.mode = 'flight';
  bus.emit('game:started', {});
  await flush();
  const texts = heard.toasts.map((t) => String(t && t.text));
  assert.ok(
    texts.some((t) => /active ·/.test(t)),
    `adventure New Game lost its hull role briefing: ${JSON.stringify(texts)}`,
  );
  assert.ok(
    texts.some((t) => /rumor charted/.test(t)),
    `adventure New Game lost the Choir-Tender rumor toast: ${JSON.stringify(texts)}`,
  );
  assert.ok(
    heard.news.some((e) => e && e.kind === 'wreck_rumor'),
    'adventure New Game lost the authored wreck news:publish',
  );
});
