import { el } from '../kit/index.js';
import { dpIcon } from '../deckplate/icons.js';
import { injectManifestLayouts } from '../orrery/manifestLayouts.js';
import { MANIFEST_STAKES, MANIFEST_TARGET, manifestDeedCards, manifestStyle, manifestTotal } from '../../data/manifestGame.js';

const SUITS = {
  cargo:  { icon: 'cargo', name: 'Cargo', title: 'Freight consignment', move: 'Add the printed tonnage to your hold.' },
  permit: { icon: 'shield', name: 'Permit', title: 'Transit Permit', move: 'Seal all present and future loads against audits.' },
  bribe:  { icon: 'credits', name: 'Envelope', title: 'Quiet Envelope', move: 'Draw one card and block the next audit.' },
  audit:  { icon: 'scan', name: 'Audit', title: 'Audit Notice', move: 'Strike the largest exposed load in the other hold.' },
};
const regular = { id: 'contact_station_helios_barkeep', name: 'The berth regular' };
const creditFigure = value => Number(value || 0).toLocaleString('en-US');

function button(label, key, action, variant = 'sf-key--ghost') {
  const node = el('button', 'sf-key ' + variant, label);
  node.type = 'button';
  node.dataset.focusKey = key;
  node.addEventListener('click', action);
  return node;
}

function cardFace(card, onPlay, sealed = false) {
  const suit = SUITS[card.kind];
  const face = onPlay ? button('', card.id, onPlay, 'manifest-card') : el('article', 'manifest-card');
  face.dataset.suit = card.kind;
  const print = el('span', 'manifest-print');
  print.setAttribute('aria-hidden', 'true');
  const rank = el('span', 'manifest-rank');
  if (card.kind === 'cargo' && card.value) {
    rank.append(el('strong', '', card.value), el('small', '', 't'));
  } else {
    rank.innerHTML = dpIcon(suit.icon, 21);
  }
  print.appendChild(rank);
  const title = el('strong', 'manifest-card-name', card.name || suit.title);
  const cargoCover = card.sealed || sealed ? 'Sealed against audits.' : 'Exposed until you play a permit.';
  const copy = el('span', 'manifest-card-copy', card.kind === 'cargo' && card.value
    ? cargoCover : suit.move);
  face.append(print, el('span', 'manifest-suit', suit.name), title, copy);
  return face;
}

function disclosure(title, className) {
  const details = el('details', className);
  const summary = el('summary', '', title);
  summary.dataset.focusKey = className;
  summary.tabIndex = 0;
  details.appendChild(summary);
  return details;
}

function takeSeat(table, ctx, opponent) {
  const style = manifestStyle(opponent.id);
  table.append(el('p', 'manifest-label', 'Across the table'), el('h2', 'manifest-rival', opponent.name),
    el('p', 'manifest-style', style.name), el('p', 'manifest-prose', style.line));

  const stakes = el('section', 'manifest-stakes');
  const balance = ctx.state.player?.credits || 0;
  stakes.appendChild(el('h3', 'manifest-section-title', 'Choose your stake'));
  const actions = el('div', 'manifest-actions');
  for (const stake of MANIFEST_STAKES) {
    const control = button(stake ? `Stake ${creditFigure(stake)} cr` : 'Practice · no stake', 'stake-' + stake,
      () => ctx.bus.emit('ui:manifestStart', { stake, opponentId: opponent.id, opponentName: opponent.name }),
      stake ? 'sf-key--ghost' : 'manifest-primary');
    control.disabled = stake > balance;
    actions.appendChild(control);
  }
  stakes.append(actions, el('p', 'manifest-note', 'Leaving the berth or loading a save forfeits an unfinished stake.'));
  table.appendChild(stakes);
}

function showDeck(hand, state) {
  hand.appendChild(el('h2', 'manifest-section-title', 'The deck'));
  const guide = el('div', 'manifest-cards manifest-cards--guide');
  for (const kind of Object.keys(SUITS)) guide.appendChild(cardFace({ kind }));
  hand.appendChild(guide);
  const signed = manifestDeedCards(state);
  const details = disclosure(`Signed cards · ${signed.length}`, 'manifest-deeds');
  if (signed.length) {
    const list = el('ul');
    for (const card of signed) {
      const line = el('li');
      line.append(el('strong', '', card.name), el('span', '', card.note + ' ' +
        (card.kind === 'cargo' ? `${card.value} sealed tonnes.` : SUITS[card.kind].move)));
      list.appendChild(line);
    }
    details.appendChild(list);
  } else {
    details.appendChild(el('p', 'manifest-prose', 'Your deck is ready to play. Station work and table wins can earn signed cards.'));
  }
  hand.appendChild(details);
}

function holdReading(side, label) {
  const panel = el('section', 'manifest-hold');
  const total = manifestTotal(side);
  if (total > MANIFEST_TARGET) panel.classList.add('is-over');
  const line = el('div', 'manifest-hold-head');
  line.append(el('h3', 'manifest-label', label), el('span', 'manifest-note', `${side.rounds} won`));
  const reading = el('p', 'manifest-tonnes', total);
  reading.appendChild(el('span', '', ` / ${MANIFEST_TARGET} t`));
  const meter = el('div', 'manifest-meter');
  meter.setAttribute('aria-hidden', 'true');
  meter.style.setProperty('--fill', Math.min(100, total / MANIFEST_TARGET * 100) + '%');
  const condition = [total > MANIFEST_TARGET ? 'Overloaded' : side.held ? 'Holding' : '', side.permit ? 'Sealed' : 'Unpermitted', side.bribe ? 'Envelope ready' : ''].filter(Boolean);
  panel.append(line, reading, meter, el('p', 'manifest-condition', condition.join(' · ')),
    el('p', 'manifest-note', side.loads.map(c => `${c.value} ${c.sealed ? 'sealed' : 'exposed'}`).join(' + ') || 'Empty manifest'));
  return panel;
}

function showMatch(table, hand, match, act) {
  const playable = match.turn === 'player' && !match.player.held;
  table.append(el('p', 'manifest-label', `Manifest ${match.round} of 3`), el('h2', 'manifest-rival', match.opponentName),
    el('p', 'manifest-style', manifestStyle(match.opponentId).name));
  const holds = el('div', 'manifest-portfolio');
  holds.append(holdReading(match.player, 'Your hold'), holdReading(match.opponent, 'Their hold'));
  table.appendChild(holds);
  if (match.log.length > 1) table.appendChild(el('p', 'manifest-last', match.log.at(-1)));
  hand.append(el('p', 'manifest-label', playable ? 'Your turn' : 'Across the table'), el('h2', 'manifest-section-title', 'Your hand'));
  const cards = el('div', 'manifest-cards');
  for (const card of match.player.hand) {
    const face = cardFace(card, () => act('play', card.id), match.player.permit);
    face.disabled = !playable;
    cards.appendChild(face);
  }
  hand.appendChild(cards);
}

function addRecord(table, match) {
  const details = disclosure('Table record', 'manifest-log');
  const list = el('ol');
  for (const line of [...match.log].reverse()) list.appendChild(el('li', '', line));
  details.appendChild(list);
  table.appendChild(details);
}

export const manifestScreen = {
  id: 'manifest',
  mount(root, ctx) {
    this._root = root;
    this._ctx = ctx;
    this._match = null;
    this._error = null;
    this._intent = 0;
    this._changed = payload => {
      this._match = payload?.match || null;
      this._error = payload?.error;
      this.render();
    };
    ctx.bus.on('manifest:changed', this._changed);
    injectManifestLayouts();
    root.classList.add('k-screen', 'k-screen--stage', 'orr-manifest');
    this._header = el('header', 'manifest-header');
    this._body = el('main', 'manifest-body');
    this._footer = el('footer', 'manifest-foot');
    this._live = el('div', 'manifest-announcement');
    this._live.setAttribute('role', 'status');
    root.replaceChildren(this._header, this._body, this._footer, this._live);
    this.render();
  },
  onShow(ctx) { this._ctx = ctx; ctx.bus.emit('ui:manifestOpen', {}); },
  act(action, cardId) {
    if (!this._match) return;
    this._ctx.bus.emit('ui:manifestAction', { matchId: this._match.id, action, cardId,
      intentId: `${this._match.id}:click:${this._intent++}` });
  },
  render() {
    if (!this._root) return;
    const root = this._root, ctx = this._ctx, match = this._match;
    const playing = match?.status === 'playing';
    const before = root.ownerDocument.activeElement;
    const focusKey = root.contains(before) && before?.dataset?.focusKey;
    const keyboardFocus = focusKey && before.matches(':focus-visible');
    const priorCards = [...root.querySelectorAll('button.manifest-card')];
    const cardIndex = priorCards.indexOf(before);
    const opened = new Set([...root.querySelectorAll('details[open]')].map(d => d.className));
    const scroll = this._body.scrollTop;
    const sameState = root.dataset.tablePhase === (playing ? 'hand' : 'seat');
    root.dataset.tablePhase = playing ? 'hand' : 'seat';

    const title = el('div');
    title.append(el('h1', 'manifest-title', 'Manifest'),
      el('p', 'manifest-subtitle', 'Win the most rounds. Get closest to 21 tonnes without going over.'));
    const balance = el('div', 'manifest-balance');
    balance.append(el('span', 'manifest-label', playing ? 'Table pot' : 'Your balance'),
      el('strong', '', creditFigure(playing ? match.stake * 2 : ctx.state.player?.credits)), el('span', 'manifest-unit', 'cr'));
    this._header.replaceChildren(title, balance);

    const table = el('section', 'manifest-table'), hand = el('section', 'manifest-hand');
    if (this._error) table.appendChild(el('p', 'manifest-error', this._error));
    if (playing) {
      showMatch(table, hand, match, (action, id) => this.act(action, id));
    } else {
      if (match) {
        const outcome = match.outcome === 'win' ? 'Your manifest stands' : match.outcome === 'draw' ? 'Equal columns' : 'The house takes the pot';
        table.appendChild(el('p', 'manifest-result', `${outcome} · ${match.player.rounds}–${match.opponent.rounds}`));
      }
      takeSeat(table, ctx, ctx.state.ui?.manifestOpponent || regular);
      showDeck(hand, ctx.state);
    }
    const tools = el('div', 'manifest-tools');
    if (match) addRecord(tools, match);
    const rules = disclosure(playing ? 'Rules and options' : 'Table rules', 'manifest-rules');
    rules.appendChild(el('p', 'manifest-prose', 'Play one card, then your opponent answers. Hold to stop adding cards for that round. Closest to 21 tonnes wins. An overloaded hold scores zero. Play up to three rounds. A tie returns your stake.'));
    if (playing) rules.appendChild(button(match.stake ? 'Concede match' : 'Concede practice', 'forfeit',
      () => this.act('forfeit'), 'sf-key--text'));
    tools.appendChild(rules);
    table.appendChild(tools);
    this._body.replaceChildren(table, hand);
    for (const details of this._body.querySelectorAll('details')) details.open = opened.has(details.className);
    this._body.scrollTop = sameState ? scroll : 0;

    const leave = button(playing ? match.stake ? 'Forfeit and leave' : 'Leave practice' : 'Back to the bar', 'leave', () => {
      if (this._match?.status === 'playing') this.act('forfeit');
      ctx.bus.emit('ui:popScreen', {});
    });
    this._footer.replaceChildren(leave);
    if (playing) {
      const hold = button('Hold this manifest', 'hold', () => this.act('hold'), 'manifest-primary');
      hold.disabled = match.turn !== 'player' || match.player.held;
      this._footer.appendChild(hold);
    }
    this._live.textContent = this._error || match?.log.at(-1) || '';

    if (focusKey) {
      const controls = [...root.querySelectorAll('[data-focus-key]:not(:disabled)')];
      const cards = [...root.querySelectorAll('button.manifest-card:not(:disabled)')];
      const next = controls.find(node => node.dataset.focusKey === focusKey)
        || cards[Math.min(Math.max(0, cardIndex), cards.length - 1)] || controls[0];
      next?.focus({ preventScroll: true });
      if (keyboardFocus) {
        next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  },
  dispose() {
    this._ctx?.bus.off('manifest:changed', this._changed);
    this._root = this._ctx = this._match = this._header = this._body = this._footer = this._live = null;
  },
};
