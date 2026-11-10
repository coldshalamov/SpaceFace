import { mulberry32, hash32 } from '../core/rng.js';

export const MANIFEST_STAKES = Object.freeze([0, 25, 100, 500]);
export const MANIFEST_TARGET = 21;
export const MANIFEST_STYLES = Object.freeze([
  { id: 'inspector', name: 'Inspector', line: 'Audits an unsealed load before adding cargo.' },
  { id: 'hauler', name: 'Hauler', line: 'Fills the hold early, then protects the manifest.' },
  { id: 'smuggler', name: 'Smuggler', line: 'Keeps a bribe ready and risks the heavy load.' },
  { id: 'clerk', name: 'Clerk', line: 'Permits first. Holds early when the other column is weaker.' },
  { id: 'racer', name: 'Racer', line: 'Pushes the last tonne. You can make him overfill.' },
]);

export function manifestStyle(contactId) {
  const id = String(contactId || '');
  const key = /yune|orrin|doss/.test(id) ? 0 : /mara|vols/.test(id) ? 3
    : /zell|vane|kell/.test(id) ? 2 : /coldburn/.test(id) ? 4 : hash32(id) % 5;
  return MANIFEST_STYLES[key];
}

export function manifestDeedCards(state) {
  const c = state?.player?.stationContactCounters || {}, out = [];
  if (c['mara.debt'] > 0) out.push({ id: 'medical_priority', kind: 'permit', name: 'Medical Priority', note: 'Earned by a delivered survivor pod.' });
  if (c['senna.names'] > 0) out.push({ id: 'restored_registry', kind: 'audit', name: 'Restored Registry', note: 'Earned by resolving a named wreck.' });
  if (c['yune.trust'] > 0) out.push({ id: 'clean_seal', kind: 'permit', name: 'Clean Seal', note: 'Earned by clean Helios freight.' });
  if (c['zell.work'] > 0) out.push({ id: 'workshop_favor', kind: 'bribe', name: 'Workshop Favor', note: 'Earned by an illegal installation.' });
  if (Array.isArray(state?.missions?.completed) && state.missions.completed.length > 0) out.push({ id: 'paid_invoice', kind: 'cargo', value: 5, sealed: true, name: 'Paid Invoice', note: 'Earned by completed contract work.' });
  if (Object.values(state?.player?.stationContacts || {}).some(r => r?.flags?.manifest_won)) {
    out.push({ id: 'counterfoil', kind: 'cargo', value: 7, sealed: true, name: 'Counterfoil', note: 'Won across a Manifest table.' });
  }
  return out;
}

export function manifestDeck(state, seed, withDeeds = true) {
  const cards = [];
  for (let n = 0; n < 3; n++) for (const value of [3, 4, 5, 6, 7, 8, 9]) cards.push({ id: `cargo_${value}_${n}`, kind: 'cargo', value, name: `${value} tonnes` });
  for (let n = 0; n < 5; n++) for (const kind of ['permit', 'bribe', 'audit']) cards.push({ id: `${kind}_${n}`, kind, name: { permit: 'Transit Permit', bribe: 'Quiet Envelope', audit: 'Audit Notice' }[kind] });
  if (withDeeds) cards.push(...manifestDeedCards(state));
  const rng = mulberry32(hash32(seed, 'manifest-deck'));
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}

export const manifestTotal = side => side.loads.reduce((sum, card) => sum + card.value, 0);
const side = deck => ({ deck, hand: deck.splice(0, 6), loads: [], permit: false, bribe: false, held: false, rounds: 0 });

export function createManifestMatch(state, { id, opponentId, opponentName, stake, seed }) {
  const match = { id, opponentId, opponentName, style: manifestStyle(opponentId).id, stake,
    seed, round: 1, turn: 'player', status: 'playing', log: ['Three manifests. Closest to 21 wins; an overfilled hold scores zero.'],
    player: side(manifestDeck(state, seed)), opponent: side(manifestDeck(null, seed ^ 0x513a, false)) };
  return match;
}

function note(match, line) { match.log.push(line); match.log = match.log.slice(-8); }
function settleRound(match) {
  const a = manifestTotal(match.player), b = manifestTotal(match.opponent);
  const pa = a <= MANIFEST_TARGET ? a : 0, pb = b <= MANIFEST_TARGET ? b : 0;
  if (pa > pb) match.player.rounds++; else if (pb > pa) match.opponent.rounds++;
  note(match, `Manifest ${match.round}: you ${a}${a > 21 ? ' OVERLOAD' : ''}; ${match.opponentName} ${b}${b > 21 ? ' OVERLOAD' : ''}.`);
  if (match.round === 3 || match.player.rounds === 2 || match.opponent.rounds === 2) {
    match.status = 'settled'; match.outcome = match.player.rounds > match.opponent.rounds ? 'win' : match.player.rounds < match.opponent.rounds ? 'loss' : 'draw';
    note(match, match.outcome === 'win' ? 'Your paperwork stands. The pot is yours.' : match.outcome === 'draw' ? 'Equal columns. Your stake comes back.' : 'The house keeps the pot. Keep the lesson.');
    return;
  }
  match.round++;
  for (const s of [match.player, match.opponent]) {
    s.hand = s.deck.splice(0, 6); s.loads = []; s.permit = false; s.bribe = false; s.held = !s.hand.length;
  }
  match.turn = 'player';
  if (match.player.held && match.opponent.held) settleRound(match);
}

export function playManifestTurn(match, who, action, cardId) {
  if (match.status !== 'playing' || match.turn !== who || !['player', 'opponent'].includes(who)) return false;
  const own = match[who], other = match[who === 'player' ? 'opponent' : 'player'];
  if (own.held) return false;
  if (action === 'hold') { own.held = true; note(match, `${who === 'player' ? 'You hold' : `${match.opponentName} holds`} at ${manifestTotal(own)}.`); }
  else {
    const at = own.hand.findIndex(c => c.id === cardId); if (at < 0) return false;
    const [card] = own.hand.splice(at, 1);
    if (card.kind === 'cargo') own.loads.push({ ...card, sealed: card.sealed || own.permit });
    else if (card.kind === 'permit') { own.permit = true; for (const load of own.loads) load.sealed = true; }
    else if (card.kind === 'bribe') { own.bribe = true; if (own.deck.length) own.hand.push(own.deck.shift()); }
    else if (card.kind === 'audit') {
      if (other.bribe) { other.bribe = false; note(match, 'The envelope swallows the audit.'); }
      else {
        const exposed = other.loads.filter(c => !c.sealed).sort((a, b) => b.value - a.value)[0];
        if (exposed) { other.loads.splice(other.loads.indexOf(exposed), 1); note(match, `${exposed.value} unpermitted tonnes struck from the other manifest.`); }
        else note(match, 'The audit finds no unpermitted load.');
      }
    }
    note(match, `${who === 'player' ? 'You file' : `${match.opponentName} files`} ${card.name}.`);
    if (manifestTotal(own) > 21 || !own.hand.length) own.held = true;
  }
  if (own.held && other.held) settleRound(match);
  else match.turn = other.held ? who : who === 'player' ? 'opponent' : 'player';
  return true;
}

export function manifestAiAction(match) {
  const own = match.opponent, total = manifestTotal(own), player = manifestTotal(match.player);
  const find = kind => own.hand.find(c => c.kind === kind);
  let card;
  if (match.style === 'inspector' && match.player.loads.some(c => !c.sealed)) card = find('audit');
  if (!card && ['clerk', 'hauler'].includes(match.style) && !own.permit && (total > 0 || match.style === 'clerk')) card = find('permit');
  if (!card && match.style === 'smuggler' && !own.bribe && total >= 12) card = find('bribe');
  if (!card && (total < (match.style === 'racer' ? 20 : match.style === 'clerk' ? 16 : 18) || (match.player.held && player <= 21 && total < player))) {
    card = own.hand.filter(c => c.kind === 'cargo' && total + c.value <= 21).sort((a, b) => b.value - a.value)[0];
    if (!card && match.style === 'racer' && total < player) card = find('cargo');
  }
  return card ? { action: 'play', cardId: card.id } : { action: 'hold' };
}

export function manifestPublicState(match) {
  if (!match) return null;
  return { ...match, log: match.log.slice(), player: { ...match.player, loads: match.player.loads.map(c => ({ ...c })), deck: undefined, hand: match.player.hand.map(c => ({ ...c })) },
    opponent: { ...match.opponent, loads: match.opponent.loads.map(c => ({ ...c })), deck: undefined, hand: undefined, cardsHeld: match.opponent.hand.length } };
}
