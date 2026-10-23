// Turn-based table owner installed by stationContacts. No clock, physics or credit writer.
import { hash32 } from '../core/rng.js';
import { MANIFEST_STAKES, createManifestMatch, manifestAiAction, manifestPublicState, playManifestTurn } from '../data/manifestGame.js';

export function createManifestTable({ state, bus }) {
  let match = null, sequence = 0;
  const off = [], intents = new Set();
  const on = (type, fn) => { bus.on(type, fn); off.push(() => bus.off(type, fn)); };
  const docked = () => state.ui?.docked === true && state.ui.dockedStationId != null;
  const publish = error => bus.emit('manifest:changed', { match: manifestPublicState(match), error: error || null });
  const finish = () => {
    if (!match || match.status !== 'settled' || match.paid) return;
    match.paid = true; // latch before emitting: a listener may reenter the table.
    const amount = match.outcome === 'win' ? match.stake * 2 : match.outcome === 'draw' ? match.stake : 0;
    if (amount) bus.emit('economy:grantCredits', { amount, reason: `manifest:${match.id}:${match.outcome}` });
    if (match.outcome === 'win') bus.emit('stationContact:manifestWon', { contactId: match.opponentId, matchId: match.id });
    bus.emit('manifest:completed', { matchId: match.id, outcome: match.outcome, opponentId: match.opponentId, stake: match.stake, returnedCr: amount });
  };
  on('ui:manifestOpen', () => publish(docked() ? null : 'A Manifest table needs a berth. Dock first.'));
  on('ui:manifestStart', payload => {
    if (!docked()) return publish('Dock before taking a seat.');
    if (match?.status === 'playing') return publish('Finish or forfeit this match first.');
    const stake = Number(payload?.stake);
    const opponentId = String(payload?.opponentId || '').slice(0, 96);
    if (!MANIFEST_STAKES.includes(stake) || !opponentId.startsWith('contact_')) return publish('Choose a contact and one of the table stakes.');
    const id = `${state.meta?.seed || 0}:${state.tick || 0}:${sequence++}`;
    const next = createManifestMatch(state, { id, opponentId, stake,
      opponentName: String(payload?.opponentName || 'The regular').replace(/\s+/g, ' ').slice(0, 64),
      seed: hash32(state.meta?.seed || 0, opponentId, id) });
    const request = { amount: stake, reason: `manifest:${id}:stake`, requireFull: true,
      expectedCredits: state.player.credits, commit: () => { match = next; intents.clear(); return true; } };
    bus.emit('economy:chargeCredits', request);
    if (!request.result) return publish('The stake could not be paid. Your credits and the table are unchanged.');
    publish();
  });
  on('ui:manifestAction', payload => {
    if (!docked() || !match || payload?.matchId !== match.id) return;
    const intentId = String(payload.intentId || '');
    if (!intentId || intents.has(intentId) || match.status !== 'playing') return;
    if (!['play', 'hold', 'forfeit'].includes(payload.action)) return;
    if (payload.action === 'forfeit') {
      match.status = 'settled'; match.outcome = 'loss'; match.log.push('You leave the table. The stake stays in the pot.');
    } else {
      if (!playManifestTurn(match, 'player', payload.action, payload.cardId)) return;
      for (let n = 0; n < 16 && match.status === 'playing' && match.turn === 'opponent'; n++) {
        const choice = manifestAiAction(match); playManifestTurn(match, 'opponent', choice.action, choice.cardId);
      }
    }
    intents.add(intentId); finish(); publish();
  });
  on('dock:undocked', () => { if (match?.status === 'playing') { match.status = 'settled'; match.outcome = 'loss'; finish(); } });
  on('save:restoring', () => { match = null; intents.clear(); });
  on('game:new', () => { match = null; intents.clear(); sequence = 0; });
  return { reset() { match = null; intents.clear(); sequence = 0; },
    dispose() { for (const unsub of off) unsub(); match = null; intents.clear(); } };
}
