import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRegistry } from '../src/core/registry.js';
import { rememberMoralDebt } from '../src/systems/moralMemory.js';
import { createSpecial500ConfessionalPrompt } from '../src/ui/special500ConfessionalPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { stationShiftAt } from '../src/data/worldCalendar.js';
import { buildEndingEpilogueModel, createEndingEpilogue } from '../src/ui/endingEpilogue.js';
import { fakeDom } from './helpers/fake-dom.mjs';
import { confessionalReadback } from '../src/systems/special500Confessional.js';
import { validateSystemClockDeclarations } from '../src/runtime/authoritativeSystemManifest.js';

const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));

function epilogueFixture(bus, state) {
  const previous = globalThis.document, doc = fakeDom(), root = doc._make('div');
  const make = doc.createElement;
  const matches = (node, selector) => selector.startsWith('.')
    && selector.slice(1).split('.').every(name => node.classList.contains(name));
  function augment(node) {
    node.querySelector = selector => {
      for (const child of node.children) { if (matches(child, selector)) return child;
        const found = child.querySelector(selector); if (found) return found; }
      return null;
    };
    node.remove = () => { if (!node.parentNode) return;
      const children = node.parentNode.children; children.splice(children.indexOf(node), 1); node.parentNode = null; };
    node.focus = () => { doc.activeElement = node; };
    return node;
  }
  augment(root); doc.createElement = tag => augment(make(tag));
  doc.querySelector = selector => root.querySelector(selector);
  globalThis.document = doc;
  const reader = createEndingEpilogue({ bus, state, root });
  return { root, reader, restore() { reader.destroy(); if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous; } };
}

// Only the transport is injected. Both sides use production code: actual main lane forward/
// replay/mirrors and actual default production worker host, with structured-cloned envelopes.
// There is no browser, external worker process, GPU or synthetic success responder.
async function fixture() {
  const worker = createSimHost(), mainState = createGameState(4242), mainBus = createBus();
  const replies = [], posts = [];
  let receive, completed, chain = Promise.resolve();
  const lane = createSimLaneRuntime({ state: mainState, bus: mainBus, registry: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, helpers: { scenarioContract: contract },
    channelFactory: () => ({
      onMessage(fn) { receive = fn; },
      post(message) {
        const msg = structuredClone(message); posts.push(msg);
        if (msg.kind === 'shutdown') return;
        chain = chain.then(async () => {
          const reply = msg.kind === 'init' ? await worker.init(msg) : await worker.tick(msg);
          const packet = structuredClone({ ...reply, kind: msg.kind === 'init' ? 'ready' : 'tickDone', seq: msg.seq });
          replies.push(packet); receive(packet);
          if (msg.kind === 'tick' && completed) { const done = completed; completed = null; done.resolve(packet); }
        }).catch(error => { if (completed) completed.reject(error); else throw error; });
      },
      terminate() {}, // no external process exists; the isolated runtime is disposed below
    }),
  });
  await lane.readyPromise;
  const { state, bus, registry, runtime } = worker.host;
  registry.get('factions').newGame();
  const offers = [], receipts = [], popups = [], rep = [], cues = [], delivered = [];
  mainBus.on('special500:confessional', p => { if (p.offerId) offers.push(p); });
  mainBus.on('special500:confessionalReceipt', p => receipts.push(p));
  mainBus.on('comms:popup', p => popups.push(p));
  mainBus.on('faction:repChanged', p => rep.push(p));
  mainBus.on('audio:cue', p => cues.push(p));
  mainBus.on('mail:delivered', p => delivered.push(p));
  const deck = { card: null, offerDecision(card) { this.card = card; return true; },
    resolveDecision() { this.card = null; } };
  setPromptDeck(deck);
  const prompt = createSpecial500ConfessionalPrompt({ bus: mainBus, state: mainState });
  const flush = () => new Promise((resolve, reject) => {
    completed = { resolve, reject };
    // An idle directive-driven twin does not post a tick just to drain worker output.
    // A genuine mount-ready request supplies a command without advancing simulation.
    mainBus.emit('ui:confessionalReady', {});
    lane.runner.prepareWithoutAdvance();
  });
  const send = async (name, payload) => { mainBus.emit(name, payload); return flush(); };
  function fresh() {
    state.story.flags = {}; state.story.moralMemory = undefined; state.story.writtenFinale = null;
    state.story.endgameResolved = false; state.story.endgameChoice = null; state.story.postEnding = null;
    state.mail = { delivered: [], events: [], schemaVersion: 1 };
    state.simTime = 20; state.tick = 1200; state.player.credits = 100;
    state.run.kind = 'adventure'; state.run.phase = 'inactive';
    state.physicsVenueSession = null; state.ui.docked = false; state.ui.dockedStationId = null;
    rememberMoralDebt(state, { id: 'actual-ledger', name: 'The spared raider', cause: 'moral_trap:test' });
  }
  return { worker, lane, state, bus, registry, runtime, mainState, mainBus, offers, receipts,
    popups, rep, cues, delivered, deck, prompt, posts, replies, flush, send, fresh,
    dispose() { prompt.destroy(); setPromptDeck(null); lane.close(); runtime.dispose(); } };
}

test('incoming systems settle and resume through the real production main/worker boundary', async t => {
  const f = await fixture();
  try {
    await t.test('production browser and worker registrations resolve, with no polling clocks', () => {
      const browser = createRegistry({ state: createGameState(22), bus: createBus(), helpers: {}, applyRuntimeFeatures: false });
      for (const name of ['special500Confessional', 'special500DeathBell', 'special500ForgeKaraoke']) {
        assert.equal(f.registry.get(name)?.name, name); assert.equal(browser.get(name)?.name, name);
      }
      assert.deepEqual(validateSystemClockDeclarations(), []);
    });

    await t.test('public adapter waits for actual worker settlement and rewards once', async () => {
      f.fresh();
      const choirBefore = f.state.factions.faction_choir?.rep || 0;
      await f.send('dock:docked', { stationId: 'station_forge' });
      assert.ok(f.deck.card, 'worker offer reaches main-mounted adapter');
      const oldCard = f.deck.card, offer = f.offers.at(-1);
      const offReentry = f.bus.on('credits:changed', p => {
        if (p.reason === 'special500:confessional_tithe')
          f.bus.emit('ui:confessionalChoose', { ...offer, choice: 'file' });
      });
      assert.equal(oldCard.onChoose('file', 'keyboard'), true);
      assert.equal(f.state.player.credits, 100, 'main emit cannot synchronously settle worker money');
      assert.ok(f.deck.card.choices.every(choice => choice.disabled));
      await f.flush();
      offReentry();
      assert.equal(f.state.player.credits, 60);
      assert.equal(f.state.factions.faction_choir.rep, choirBefore + 1);
      assert.equal(f.deck.card, null, 'only authoritative terminal receipt closes the card');
      assert.equal(f.state.story.flags.guilt_filed.recordText, offer.recordText);
      await f.send('ui:confessionalChoose', { offerId: offer.offerId, generation: offer.generation, choice: 'file' });
      assert.equal(oldCard.onChoose('file', 'stale-closure'), false);
      assert.equal(f.state.player.credits, 60);
      assert.equal(f.state.factions.faction_choir.rep, choirBefore + 1);
      assert.ok(f.posts.some(post => post.kind === 'tick' && post.commands?.length));
      assert.equal(f.lane.getDiagnostics().unforwardedEmitTypes['ui:confessionalChoose'], undefined);
    });

    await t.test('short, stale-balance and absent payment consumers cannot file partial success', async () => {
      f.fresh(); await f.send('dock:docked', { stationId: 'station_forge' });
      const offer = f.offers.at(-1), choice = { ...offer, choice: 'file' };
      f.state.player.credits = 39;
      await f.send('ui:confessionalChoose', choice);
      assert.equal(f.state.player.credits, 39); assert.equal(f.state.story.flags.guilt_filed, undefined);
      assert.ok(f.state.story.flags.guilt_offer); assert.ok(f.deck.card.choices.every(c => !c.disabled));
      const economy = f.registry.get('economy'), original = economy._onChargeCreditsRequest;
      f.state.player.credits = 100;
      // Reproduce an owner rejecting a stale quote, using the real exact-charge owner.
      economy._onChargeCreditsRequest = function(p) { p.expectedCredits += 1; return original.call(this, p); };
      await f.send('ui:confessionalChoose', choice);
      assert.equal(f.state.player.credits, 100); assert.equal(f.state.story.flags.guilt_filed, undefined);
      economy._onChargeCreditsRequest = () => {};
      await f.send('ui:confessionalChoose', choice);
      assert.equal(f.state.player.credits, 100); assert.equal(f.state.story.flags.guilt_filed, undefined);
      economy._onChargeCreditsRequest = original;
      await f.send('ui:confessionalChoose', choice);
      assert.equal(f.state.player.credits, 60);
    });

    await t.test('runtime generation invalidates old choices and receipts; declined booths never charge', async () => {
      f.fresh(); await f.send('ui:confessionalChoose', { choice: 'decline' });
      assert.equal(f.state.story.flags.guilt_tithe_declined, undefined);
      await f.send('dock:docked', { stationId: 'station_forge' });
      const old = f.offers.at(-1);
      f.registry.get('special500Confessional').init({ state: f.state, bus: f.bus });
      await f.flush();
      const current = f.offers.at(-1);
      assert.equal(current.offerId, old.offerId); assert.ok(current.generation > old.generation);
      await f.send('ui:confessionalChoose', { ...old, choice: 'file' });
      assert.equal(f.state.player.credits, 100); assert.ok(f.deck.card);
      // A delayed reply for the previous lifecycle must not close today's offer.
      f.mainBus.emit('special500:confessionalReceipt', { ...old, outcome: 'filed' });
      assert.ok(f.deck.card);
      await f.send('ui:confessionalChoose', { ...current, choice: 'decline' });
      assert.equal(f.state.player.credits, 100); assert.equal(f.state.story.flags.guilt_tithe_declined, 20);
      await f.send('dock:docked', { stationId: 'station_forge' }); assert.equal(f.deck.card, null);
    });

    await t.test('real combat defeat selects actual position; no duplicate bell after owner reinit', async () => {
      f.fresh(); f.state.mode = 'flight'; f.state.settings.gameplay.difficulty = 'ironman';
      const player = f.runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: 999, z: 0 } }));
      f.state.playerId = player.id;
      f.state.world.activeSector.stations = [
        { id: 'origin', pos: { x: 0, z: 0 } }, { id: 'near-wreck', pos: { x: 1000, z: 0 } },
      ];
      const count = f.cues.filter(cue => cue.id === 'sfx_eighth_bell_toll').length;
      f.registry.get('combat').kill(player, null, {}); await f.flush();
      const bells = f.cues.filter(cue => cue.id === 'sfx_eighth_bell_toll');
      assert.equal(bells.length, count + 1); assert.deepEqual(bells.at(-1).position, { x: 1000, z: 0 });
      f.registry.get('special500DeathBell').init({ state: f.state, bus: f.bus });
      f.registry.get('special500DeathBell')._onDeath({ pos: { x: 999, z: 0 } }); await f.flush();
      assert.equal(f.cues.filter(cue => cue.id === 'sfx_eighth_bell_toll').length, count + 1);
    });

    await t.test('Karaoke gates the actual performance, reputation and real once-only mail', async () => {
      f.fresh(); f.state.mode = 'menu'; f.state.world.currentSectorId = 'sector_vesta_forge';
      f.state.simTime = 20;
      while (f.registry.get('special500ForgeKaraoke')._onTheBell('station_forge', f.state.simTime)) f.state.simTime += 10;
      const before = f.state.factions.faction_pitborn?.rep || 0;
      await f.send('dock:docked', { stationId: 'station_forge' });
      assert.equal(f.state.story.flags.heard_the_count_sung, undefined);
      assert.equal(f.state.story.flags['special500.SP2-063'], undefined);
      f.state.simTime += stationShiftAt('station_forge', f.state.simTime).endsInS;
      await f.send('dock:docked', { stationId: 'station_forge' });
      assert.ok(f.state.story.flags.heard_the_count_sung != null);
      assert.equal(f.state.factions.faction_pitborn.rep, before + 1);
      f.registry.get('mail').update(1, f.state); await f.flush();
      assert.equal(f.state.mail.delivered.filter(id => id === 'mail_heard_the_count').length, 1);
      await f.send('dock:docked', { stationId: 'station_forge' });
      f.registry.get('mail').update(1, f.state); await f.flush();
      assert.equal(f.state.factions.faction_pitborn.rep, before + 1);
      assert.equal(f.popups.filter(row => row.id === 'mail:mail_heard_the_count').length, 1);
    });

    await t.test('canonical finale delivers the exact accepted text in mail and ending, surviving eviction', async () => {
      const glass = epilogueFixture(f.mainBus, f.mainState);
      try {
      f.fresh(); await f.send('dock:docked', { stationId: 'station_forge' });
      const offer = f.offers.at(-1);
      await f.send('ui:confessionalChoose', { ...offer, choice: 'file' });
      const filed = f.state.story.flags.guilt_filed.recordText;
      assert.equal(confessionalReadback(f.state), null);
      f.registry.get('mail').update(1, f.state);
      assert.ok(!f.state.mail.delivered.includes('mail_guilt_read_back'));
      f.state.simTime = 30;
      f.state.world.currentSectorId = 'sector_ashfall_reach';
      f.state.story.flags.deep_reach_operation_complete = true;
      f.state.story.flags.kurtz_desk_opened = true;
      assert.equal(f.registry.get('cargo').addCargo('cmdty_personal_ledger', 1), 1);
      const ineligible = [];
      f.bus.on('endgame:ineligible', p => ineligible.push(p));
      f.bus.emit('ui:endgameChoose', { choice: 'D', confirm: true });
      await f.flush();
      assert.equal(f.state.story.endgameChoice, 'D', JSON.stringify(ineligible));
      const story = f.registry.get('story');
      let guard = 0;
      while (f.state.story.writtenFinale.completedAtS == null && guard++ < 50) {
        f.state.simTime = f.state.story.writtenFinale.nextAtS;
        story._pumpWrittenFinale();
      }
      assert.ok(f.state.story.writtenFinale.completedAtS != null);
      await f.flush();
      assert.equal(f.popups.find(p => p.id === 'mail:mail_guilt_read_back')?.text, filed);
      const delivery = f.delivered.find(p => p.id === 'mail_guilt_read_back');
      assert.equal(buildEndingEpilogueModel({ event: 'mail:delivered', payload: delivery,
        state: f.mainState }).filedRecordText, filed, 'main can render before its story mirror catches up');
      const staleContinuation = buildEndingEpilogueModel({ event: 'mail:delivered', payload: delivery,
        state: { story: { postEnding: { choiceId: 'SANDBOX' } } } });
      assert.equal(staleContinuation.id, 'D'); assert.equal(staleContinuation.filedRecordText, filed);
      const rendered = glass.root.querySelector('.sf-ending-epilogue__record');
      assert.ok(rendered, 'actual ending reader mounted from the real worker delivery');
      assert.equal(rendered.children[1].textContent, filed, 'DOM reader preserves every accepted byte');
      f.state.mail.events = Array.from({ length: 96 }, (_, i) => ({ n: 'unrelated', t: i, f: {} }));
      assert.equal(confessionalReadback(f.state).text, filed, 'eligibility is saved ending state, not transient history');
      const deliveredBefore = f.popups.filter(p => p.id === 'mail:mail_guilt_read_back').length;
      f.registry.get('mail').update(1, f.state); await f.flush();
      assert.equal(f.popups.filter(p => p.id === 'mail:mail_guilt_read_back').length, deliveredBefore);
      } finally { glass.restore(); }
    });

    await t.test('a bounded full ledger keeps its exact words across the default event bridge', async () => {
      f.fresh(); f.state.simTime = 180;
      for (let i = 1; i < 128; i++) rememberMoralDebt(f.state, {
        id: `bounded-${i}`, name: `Pilot ${i} ` + 'N'.repeat(80), cause: 'moral_trap:' + 'C'.repeat(80),
      });
      await f.send('dock:docked', { stationId: 'station_forge' });
      const offer = f.offers.at(-1);
      assert.equal(offer.records, 128); assert.ok(offer.recordText.length > 20000);
      await f.send('ui:confessionalChoose', { ...offer, choice: 'file' });
      const exact = f.state.story.flags.guilt_filed.recordText;
      assert.equal(exact, offer.recordText);
      f.state.world.currentSectorId = 'sector_ashfall_reach';
      f.state.story.flags.deep_reach_operation_complete = true; f.state.story.flags.kurtz_desk_opened = true;
      if (!f.state.player.cargo.items.cmdty_personal_ledger)
        assert.equal(f.registry.get('cargo').addCargo('cmdty_personal_ledger', 1), 1);
      f.bus.emit('ui:endgameChoose', { choice: 'D', confirm: true });
      assert.equal(f.state.story.endgameChoice, 'D');
      let guard = 0;
      while (f.state.story.writtenFinale.completedAtS == null && guard++ < 50) {
        f.state.simTime = f.state.story.writtenFinale.nextAtS; f.registry.get('story')._pumpWrittenFinale();
      }
      await f.flush();
      const delivered = f.delivered.filter(row => row.id === 'mail_guilt_read_back').at(-1);
      assert.equal(delivered.readback.text, exact);
      assert.equal(buildEndingEpilogueModel({ event: 'mail:delivered', payload: delivered,
        state: f.mainState }).filedRecordText, exact);
    });
  } finally { f.dispose(); }
});
