import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { economy } from '../src/systems/economy.js';
import { createManifestTable } from '../src/systems/manifestGame.js';
import { createManifestMatch, manifestAiAction, manifestDeck, manifestDeedCards, manifestPublicState, playManifestTurn } from '../src/data/manifestGame.js';

function match() { return createManifestMatch({}, { id: '4242:table:1', opponentId: 'contact_yune', opponentName: 'Clerk Yune', stake: 25, seed: 4242 }); }
const cargo = (id, value, sealed = false) => ({ id, value, sealed, kind: 'cargo', name: `${value} tonnes` });

test('cargo, permits, envelopes and audits interact through the actual table rules', () => {
  const m = match();
  m.player.hand = [cargo('load', 8), { id: 'seal', kind: 'permit', name: 'Permit' }, cargo('spare', 3)];
  m.opponent.hand = [{ id: 'audit1', kind: 'audit', name: 'Audit' }, { id: 'audit2', kind: 'audit', name: 'Audit' }, cargo('spare-opponent', 3)];
  assert.ok(playManifestTurn(m, 'player', 'play', 'load'));
  assert.ok(playManifestTurn(m, 'opponent', 'play', 'audit1'));
  assert.equal(m.player.loads.length, 0, 'audit removes an unpermitted load');
  m.player.loads.push(cargo('valuable', 9));
  assert.ok(playManifestTurn(m, 'player', 'play', 'seal'));
  assert.equal(m.player.loads[0].sealed, true);
  assert.ok(playManifestTurn(m, 'opponent', 'play', 'audit2'));
  assert.equal(m.player.loads[0].value, 9, 'a permit survives the audit');

  const b = match(); b.player.bribe = true; b.player.loads = [cargo('exposed', 9)]; b.turn = 'opponent';
  b.opponent.hand.unshift({ id: 'notice', kind: 'audit', name: 'Audit' });
  playManifestTurn(b, 'opponent', 'play', 'notice');
  assert.equal(b.player.loads.length, 1); assert.equal(b.player.bribe, false, 'one audit consumes one envelope');
});

test('seeded decks, hidden hands and five opponent styles stay deterministic and finish', () => {
  assert.deepEqual(manifestDeck({}, 4242), manifestDeck({}, 4242));
  assert.notDeepEqual(manifestDeck({}, 4242), manifestDeck({}, 4243));
  const styles = new Set();
  for (const opponentId of ['contact_yune', 'contact_mara_children', 'contact_tinker_zell', 'contact_coldburn_rey', 'contact_station_helios_0']) {
    const m = createManifestMatch({}, { id: opponentId, opponentId, opponentName: opponentId, stake: 0, seed: 4242 });
    styles.add(m.style);
    for (let turns = 0; turns < 100 && m.status === 'playing'; turns++) {
      const who = m.turn;
      const choice = who === 'opponent' ? manifestAiAction(m)
        : { action: 'play', cardId: m.player.hand.find(c => c.kind === 'cargo' && c.value + m.player.loads.reduce((n, r) => n + r.value, 0) <= 21)?.id };
      if (!choice.cardId) choice.action = 'hold';
      assert.ok(playManifestTurn(m, who, choice.action, choice.cardId));
    }
    assert.equal(m.status, 'settled');
    const view = manifestPublicState(m); assert.equal(view.opponent.hand, undefined); assert.equal(view.player.deck, undefined);
    if (view.player.loads.length) { view.player.loads[0].value = 999; assert.notEqual(m.player.loads[0].value, 999); }
  }
  assert.ok(styles.size >= 4, 'the named cast does not all use the same policy');
});

test('cards come from real saved deeds and a won counterfoil, with no paid deck gate', () => {
  assert.equal(manifestDeedCards({}).length, 0);
  const cards = manifestDeedCards({ player: { stationContactCounters: { 'mara.debt': 1, 'senna.names': 1, 'yune.trust': 1, 'zell.work': 1 }, stationContacts: { regular: { flags: { manifest_won: true } } } } });
  assert.equal(cards.length, 5);
  assert.equal(new Set(cards.map(c => c.kind)).size, 4);
  assert.ok(manifestDeck({}, 1).length >= 30, 'a new pilot already owns a playable full deck');
});

test('the economy owner charges atomically, duplicate clicks cannot pay twice, reload cannot replay a pot', () => {
  const state = createGameState(4242), bus = createBus(); state.ui.docked = true; state.ui.dockedStationId = 2; state.player.credits = 100;
  const creditOwner = Object.create(economy); creditOwner.state = state; creditOwner.bus = bus;
  bus.on('economy:chargeCredits', p => creditOwner._onChargeCreditsRequest(p));
  bus.on('economy:grantCredits', p => creditOwner.grantCredits(p.amount, p.reason));
  let publicState;
  bus.on('manifest:changed', p => { publicState = p; });
  const table = createManifestTable({ state, bus });
  bus.emit('ui:manifestStart', { opponentId: 'contact_yune', opponentName: 'Clerk Yune', stake: 500 });
  assert.equal(state.player.credits, 100); assert.equal(publicState.match, null);
  bus.emit('ui:manifestStart', { opponentId: 'contact_yune', opponentName: 'Clerk Yune', stake: 25 });
  assert.equal(state.player.credits, 75); const id = publicState.match.id;
  const leave = { matchId: id, action: 'forfeit', intentId: 'leave-1' };
  bus.emit('ui:manifestAction', leave); bus.emit('ui:manifestAction', leave);
  assert.equal(state.player.credits, 75); assert.equal(publicState.match.outcome, 'loss');
  bus.emit('save:restoring'); bus.emit('ui:manifestAction', leave);
  assert.equal(state.player.credits, 75);
  state.ui.docked = false;
  bus.emit('ui:manifestStart', { opponentId: 'contact_yune', stake: 25 });
  assert.equal(state.player.credits, 75);
  table.dispose();
});

test('a full public-action win pays once through the economy owner and earns the counterfoil', () => {
  let winningTables = 0;
  for (let seed = 4242; seed < 4250; seed++) {
    const state = createGameState(seed), bus = createBus(); state.ui.docked = true; state.ui.dockedStationId = 2; state.player.credits = 100;
    const owner = Object.create(economy); owner.state = state; owner.bus = bus;
    bus.on('economy:chargeCredits', p => owner._onChargeCreditsRequest(p));
    bus.on('economy:grantCredits', p => owner.grantCredits(p.amount, p.reason));
    let view, won = 0; bus.on('manifest:changed', p => { view = p.match; });
    bus.on('stationContact:manifestWon', () => won++);
    const table = createManifestTable({ state, bus });
    bus.emit('ui:manifestStart', { opponentId: 'contact_coldburn_rey', opponentName: 'Coldburn Rey', stake: 25 });
    let last;
    for (let n = 0; n < 100 && view?.status === 'playing'; n++) {
      const total = view.player.loads.reduce((sum, c) => sum + c.value, 0);
      const audit = view.player.hand.find(c => c.kind === 'audit' && view.opponent.loads.some(r => !r.sealed));
      const card = audit || view.player.hand.filter(c => c.kind === 'cargo' && c.value + total <= 21).sort((a, b) => b.value - a.value)[0];
      last = { matchId: view.id, intentId: `${seed}:${n}`, action: card ? 'play' : 'hold', cardId: card?.id };
      bus.emit('ui:manifestAction', last);
    }
    assert.equal(view.status, 'settled');
    assert.equal(state.player.credits, view.outcome === 'win' ? 125 : view.outcome === 'draw' ? 100 : 75);
    const paid = state.player.credits; bus.emit('ui:manifestAction', last);
    assert.equal(state.player.credits, paid);
    assert.equal(won, view.outcome === 'win' ? 1 : 0);
    if (won) winningTables++;
    table.dispose();
  }
  assert.ok(winningTables > 0, 'a pilot can actually beat the rival through ordinary play');
});
