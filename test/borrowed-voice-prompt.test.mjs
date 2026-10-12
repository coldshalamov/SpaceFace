import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { borrowedVoice } from '../src/systems/borrowedVoice.js';
import { borrowedVoicePrompt } from '../src/ui/borrowedVoicePrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { BORROWED_VOICE as C } from '../src/data/borrowedVoice.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';

function fixture(saved = null) {
  const sim = createSimulation({ seed: 816, systems: [economy, borrowedVoice] });
  const state = sim.state;
  state.mode = 'flight';
  state.run.kind = 'adventure';
  state.run.phase = 'inactive';
  state.world.currentSectorId = C.sectorId;
  state.settings.gameplay.physicsBackend = 'legacy';
  ensureAlienEcologyState(state).revelation = 2;
  const player = sim.spawn({ type: 'ship', hull: 100, mass: 28, radius: 8, collides: false,
    pos: { x: C.center.x + 70, z: C.center.z + 40 } });
  state.playerId = player.id;
  if (saved) sim.registry.get('borrowedVoice').deserialize(saved);
  sim.step(.2);
  return { sim, state, player, owner: sim.registry.get('borrowedVoice'), close: () => sim.dispose() };
}

test('recorder loss refreshes stale disposition choices without losing partial evidence or paying', () => {
  const h = fixture();
  let next = null;
  let visible = null;
  const offers = [];
  const notices = [];
  const intents = [];
  setPromptDeck({
    offerDecision(spec) { visible = spec; offers.push(spec); return true; },
    resolveDecision(id) { if (id === 'borrowed-voice:record') visible = null; },
  });
  const offToast = h.sim.bus.on('toast', row => notices.push(row));
  const offIntent = h.sim.bus.on('borrowedVoice:disposition', row => intents.push(row));
  borrowedVoicePrompt.init({ bus: h.sim.bus });
  try {
    const a = h.owner._find('a');
    a.pos.x = C.center.x + 8;
    a.pos.z = C.center.z;
    a.rot = Math.PI;
    for (let i = 0; i < 8; i++) h.sim.step(.2);
    assert.equal(h.owner.inspect(a.id).recovered, true);
    const firstCard = visible;
    assert.ok(firstCard?.choices.some(choice => choice.id === 'archive'));
    const firstRevision = h.owner._row.evidenceRevision;

    const lose = id => {
      const entity = h.owner._find(id);
      assert.ok(entity);
      entity.alive = false;
      h.sim.bus.emit('entity:killed', { targetId: entity.id });
      h.sim.helpers.removeEntity(entity.id);
    };
    lose('b');
    assert.equal(h.owner._row.evidenceRevision, firstRevision + 1);
    assert.equal(h.state.player.credits, 0);

    // The card's action retains its original revision; its refusal must reopen current evidence.
    firstCard.onChoose('archive');
    assert.equal(intents.at(-1)?.revision, firstRevision);
    assert.equal(h.state.player.credits, 0, 'a rejected stale choice cannot pay');
    assert.equal(h.owner._row.disposition, 'open');
    assert.deepEqual(h.owner._row.recoveredFragmentIds, ['borrowed-voice:fragment-a']);
    assert.equal(offers.length, 2, 'the prompt adapter receives a replacement snapshot');
    assert.match(visible?.detail || '', /UNKNOWN — original source lost/);
    assert.ok(visible?.choices.some(choice => choice.id === 'archive'));
    assert.ok(notices.some(row => /record changed/i.test(row.text)));

    // A queued double activation of the same stale action is also harmless and fail-visible.
    firstCard.onChoose('archive');
    assert.equal(intents.at(-1)?.revision, firstRevision);
    assert.equal(h.state.player.credits, 0);
    assert.equal(h.owner._row.disposition, 'open');
    assert.equal(offers.length, 3);

    // A second source loss stales the refreshed card too. Preserve both missing sources and the
    // single recovered fragment until the player makes a current, evidence-backed choice.
    lose('c');
    const secondCard = visible;
    secondCard.onChoose('archive');
    assert.equal(intents.at(-1)?.revision, firstRevision + 1);
    assert.equal(h.state.player.credits, 0);
    assert.equal(h.owner._row.disposition, 'open');
    assert.deepEqual(h.owner._row.recoveredFragmentIds, ['borrowed-voice:fragment-a']);
    assert.equal(h.owner._row.recorderOutcomeIds.b.status, 'destroyed');
    assert.equal(h.owner._row.recorderOutcomeIds.c.status, 'destroyed');
    assert.equal(offers.length, 4);
    assert.match(visible?.detail || '', /UNKNOWN — original source lost/);

    // The latest card can quarantine. Neither the stale archives nor the losses erase what was
    // recovered, and the actual disposition/evidence survive a cold owner restore.
    visible.onChoose('quarantine');
    assert.equal(intents.at(-1)?.revision, firstRevision + 2);
    assert.equal(h.state.player.credits, 0);
    assert.equal(h.owner._row.disposition, 'quarantine');
    assert.deepEqual(h.owner._row.recoveredFragmentIds, ['borrowed-voice:fragment-a']);
    const saved = h.owner.serialize();
    next = fixture(saved);
    assert.equal(next.owner._row.disposition, 'quarantine');
    assert.deepEqual(next.owner._row.recoveredFragmentIds, ['borrowed-voice:fragment-a']);
    assert.equal(next.owner._row.recorderOutcomeIds.b.status, 'destroyed');
    assert.equal(next.owner._row.recorderOutcomeIds.c.status, 'destroyed');
    assert.equal(next.owner._row.archiveReceipt, null);
    assert.ok(next.owner._find('a'));
    assert.equal(next.owner._find('b'), null);
    assert.equal(next.owner._find('c'), null);
  } finally {
    borrowedVoicePrompt.destroy();
    offToast();
    offIntent();
    setPromptDeck(null);
    next?.close();
    h.close();
  }
});

function promptHarness(sim) {
  let visible = null;
  const offers = [];
  const notices = [];
  const intents = [];
  setPromptDeck({
    offerDecision(spec) { visible = spec; offers.push(spec); return true; },
    resolveDecision(id) { if (id === 'borrowed-voice:record') visible = null; },
  });
  const offToast = sim.bus.on('toast', row => notices.push(row));
  const offIntent = sim.bus.on('borrowedVoice:disposition', row => intents.push(row));
  borrowedVoicePrompt.init({ bus: sim.bus });
  return {
    get visible() { return visible; }, offers, notices, intents,
    close() {
      borrowedVoicePrompt.destroy();
      offToast(); offIntent(); setPromptDeck(null);
    },
  };
}

function recoverA(h) {
  const a = h.owner._find('a');
  a.pos.x = C.center.x + 8; a.pos.z = C.center.z; a.rot = Math.PI;
  for (let i = 0; i < 8; i++) h.sim.step(.2);
  assert.equal(h.owner.inspect(a.id).recovered, true);
}

function loseRecorder(h, id) {
  const entity = h.owner._find(id);
  assert.ok(entity);
  entity.alive = false;
  h.sim.bus.emit('entity:killed', { targetId: entity.id });
  h.sim.helpers.removeEntity(entity.id);
}

test('stale choices do not reopen after leaving the site, sector, docking, or save restoration', () => {
  for (const boundary of ['site', 'sector', 'dock', 'restore']) {
    const h = fixture();
    const ui = promptHarness(h.sim);
    try {
      recoverA(h);
      const stale = ui.visible;
      loseRecorder(h, 'b');
      const originalOfferCount = ui.offers.length;

      if (boundary === 'site') h.player.pos.x = C.center.x + C.siteRange + 1;
      if (boundary === 'sector') {
        h.state.world.currentSectorId = 'elsewhere';
        h.sim.bus.emit('sector:exit');
      }
      if (boundary === 'dock') {
        h.state.ui.docked = true;
        h.sim.bus.emit('dock:docked');
      }
      if (boundary === 'restore') h.sim.bus.emit('save:restoring');

      stale.onChoose('archive');
      assert.equal(ui.offers.length, originalOfferCount, `${boundary} must not reopen the prompt`);
      assert.equal(h.state.player.credits, 0, `${boundary} must not grant an archive payout`);
      assert.equal(h.owner._row.disposition, 'open');
      assert.deepEqual(h.owner._row.recoveredFragmentIds, ['borrowed-voice:fragment-a']);
    } finally {
      ui.close();
      h.close();
    }
  }
});

test('stale actions after archive or quarantine do not reopen terminal records or repeat effects', () => {
  for (const terminalDisposition of ['archive', 'quarantine']) {
    const h = fixture();
    const ui = promptHarness(h.sim);
    try {
      recoverA(h);
      const stale = ui.visible;
      ui.visible.onChoose(terminalDisposition);
      const offersAfterCommit = ui.offers.length;
      assert.equal(h.owner._row.disposition, terminalDisposition);
      const creditAfterCommit = terminalDisposition === 'archive' ? C.archiveCr : 0;
      assert.equal(h.state.player.credits, creditAfterCommit);

      stale.onChoose(terminalDisposition === 'archive' ? 'quarantine' : 'archive');
      assert.equal(ui.offers.length, offersAfterCommit, `${terminalDisposition} must not reopen`);
      assert.equal(h.owner._row.disposition, terminalDisposition);
      assert.equal(h.state.player.credits, creditAfterCommit, 'a stale terminal choice cannot repeat effects');
      assert.deepEqual(h.owner._row.recoveredFragmentIds, ['borrowed-voice:fragment-a']);
      if (terminalDisposition === 'archive') assert.equal(h.owner._row.archiveReceipt.amount, C.archiveCr);
      else assert.equal(h.owner._row.archiveReceipt, null);
    } finally {
      ui.close();
      h.close();
    }
  }
});
