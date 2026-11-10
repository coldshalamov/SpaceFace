import { el } from '../kit/index.js';
import { injectManifestLayouts } from '../orrery/manifestLayouts.js';
import { MANIFEST_STAKES, manifestDeedCards, manifestStyle, manifestTotal } from '../../data/manifestGame.js';

const cardLine = card => card.kind === 'cargo' ? `${card.value} tonnes${card.sealed ? ' · sealed' : ' · exposed until permitted'}`
  : card.kind === 'permit' ? 'Seal every load on your manifest, including later cargo.'
  : card.kind === 'bribe' ? 'Stop one audit and draw one more card.' : 'Strike the largest unpermitted load from the other manifest.';
const button = (text, action, disabled = false) => {
  const b = el('button', 'k-word k-word--emph', text); b.type = 'button'; b.disabled = disabled;
  b.addEventListener('click', action); return b;
};
const actions = (...buttons) => {
  const list = el('ul', 'k-words k-words--row manifest-actions');
  for (const b of buttons) { const item = el('li'); item.appendChild(b); list.appendChild(item); }
  return list;
};

export const manifestScreen = {
  id: 'manifest',
  mount(root, ctx) {
    this._root = root; this._ctx = ctx; this._match = null; this._error = null; this._intent = 0;
    this._changed = payload => { this._match = payload?.match || null; this._error = payload?.error; this.render(); };
    ctx.bus.on('manifest:changed', this._changed);
    injectManifestLayouts(); root.classList.add('k-screen', 'k-screen--stage', 'orr-manifest');
    this.render();
  },
  onShow(ctx) { this._ctx = ctx; this.render(); ctx.bus.emit('ui:manifestOpen', {}); },
  act(action, cardId) {
    if (!this._match) return;
    this._ctx.bus.emit('ui:manifestAction', { matchId: this._match.id, action, cardId,
      intentId: `${this._match.id}:click:${this._intent++}` });
  },
  render() {
    if (!this._root) return;
    const root = this._root, ctx = this._ctx, match = this._match;
    root.replaceChildren();
    const title = el('header', 'k-title'); title.appendChild(el('h1', 'k-display k-t-title', 'Manifest'));
    title.appendChild(el('p', 'k-sentence', 'Cargo. Permits. Quiet envelopes. An audit at the wrong moment.'));
    root.appendChild(title);
    const body = el('main', 'manifest-body'), table = el('section'), hand = el('section', 'manifest-hand');
    body.append(table, hand); root.appendChild(body);
    if (this._error) table.appendChild(el('p', 'k-sentence', this._error));
    if (!match || match.status !== 'playing') {
      if (match) table.appendChild(el('h2', 'k-display', `${match.outcome === 'win' ? 'Your manifest stands' : match.outcome === 'draw' ? 'Equal columns' : 'The house takes the pot'} · ${match.player.rounds}—${match.opponent.rounds}`));
      const opponent = ctx.state.ui?.manifestOpponent || { id: 'contact_station_helios_barkeep', name: 'The berth regular' };
      table.appendChild(el('h2', 'k-row__name', `Across the table: ${opponent.name}`));
      const style = manifestStyle(opponent.id);
      table.appendChild(el('p', 'k-sentence', `${style.name} · ${style.line}`));
      table.appendChild(el('p', 'k-sentence manifest-rules', 'Win more of three manifests than the other pilot. Play one card, then the other pilot answers. Cargo adds tonnes; closest to 21 wins. Overload scores zero. Permits seal your cargo; an audit strikes the largest exposed load. A quiet envelope cancels one audit and draws a card. Hold to stop adding cards for that manifest. Leaving the berth or loading a save forfeits an unfinished stake.'));
      table.appendChild(actions(...MANIFEST_STAKES.map(stake => button(stake ? `Stake ${stake} cr` : 'Practice · no stake', () =>
        ctx.bus.emit('ui:manifestStart', { stake, opponentId: opponent.id, opponentName: opponent.name }), stake > (ctx.state.player?.credits || 0)))));
      hand.appendChild(el('p', 'k-caps', 'Cards your deeds earned'));
      const earned = manifestDeedCards(ctx.state);
      if (!earned.length) hand.appendChild(el('p', 'k-sentence', 'Everyone starts with a full working deck. Rescues, wreck records, clean freight and a table win bring signed cards.'));
      for (const card of earned) {
        hand.appendChild(el('p', 'k-row__name', card.name)); hand.appendChild(el('p', 'k-sentence', `${card.note} ${cardLine(card)}`));
      }
    } else {
      table.appendChild(el('p', 'k-caps', `Manifest ${match.round} of 3 · pot ${match.stake * 2} cr`));
      table.appendChild(el('h2', 'k-row__name', `${match.opponentName} · ${manifestStyle(match.opponentId).name}`));
      const portfolios = el('div', 'manifest-portfolio');
      for (const [id, label] of [['player', 'Your hold'], ['opponent', 'Their hold']]) {
        const side = match[id], panel = el('section');
        panel.appendChild(el('p', 'k-caps', `${label} · ${side.rounds} manifests won`));
        panel.appendChild(el('p', 'manifest-tonnes', `${manifestTotal(side)} / 21`));
        panel.appendChild(el('p', 'k-sentence', `${side.permit ? 'Sealed' : 'Unpermitted'}${side.bribe ? ' · envelope ready' : ''}${side.held ? ' · HELD' : ''}`));
        panel.appendChild(el('p', 'k-row__sub', side.loads.map(c => `${c.value}${c.sealed ? ' sealed' : ' exposed'}`).join(' + ') || 'Empty manifest'));
        portfolios.appendChild(panel);
      }
      table.appendChild(portfolios);
      table.appendChild(actions(button('Hold this manifest', () => this.act('hold'), match.turn !== 'player' || match.player.held),
        button('Forfeit the pot', () => this.act('forfeit'))));
      hand.appendChild(el('p', 'k-caps', 'Your hand · play one card'));
      for (const card of match.player.hand) {
        const b = button(card.name, () => this.act('play', card.id), match.turn !== 'player' || match.player.held);
        b.classList.add('manifest-card'); b.appendChild(el('small', '', cardLine(card))); hand.appendChild(b);
      }
    }
    if (match) {
      const log = el('section', 'manifest-log'); log.setAttribute('aria-label', 'Table record'); log.setAttribute('aria-live', 'polite');
      for (const line of match.log) log.appendChild(el('p', 'k-sentence', line)); table.appendChild(log);
    }
    const foot = el('footer', 'k-foot');
    foot.appendChild(button(match?.status === 'playing' ? 'Leave · forfeit stake' : 'Back to the bar', () => {
      if (this._match?.status === 'playing') this.act('forfeit');
      ctx.bus.emit('ui:popScreen', {});
    })); root.appendChild(foot);
  },
  dispose() { this._ctx?.bus.off('manifest:changed', this._changed); this._root = null; this._ctx = null; this._match = null; },
};
