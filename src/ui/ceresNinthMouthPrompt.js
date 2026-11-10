// Prompt Deck owns all input and accessible, mute-friendly text presentation.
// This adapter only reads offers and emits intents; the runtime owns rescue outcomes.
import { getPromptDeck } from './promptDeck.js';
const ID = 'ceres-ninth-mouth';
export function createCeresNinthMouthPrompt({ state, bus, helpers }) {
  const marks = createNinthMouthServiceMarks({ state, helpers });
  let current = null, currentId = null, consumedId = null, destroyed = false;
  const close = () => {
    consumedId = currentId ?? state.ceresNinthMouthOffer?.id ?? consumedId;
    current = null; currentId = null;
    marks.hide();
    getPromptDeck()?.resolveDecision(ID);
  };
  const off = ['save:restoring', 'sector:exit', 'dock:docked', 'game:new', 'game:newGame']
    .map(name => bus.on(name, close));
  return {
    frame() {
      if (destroyed) return;
      const offer = state.mode === 'flight' && !state.ui?.docked ? state.ceresNinthMouthOffer : null;
      if (!offer) { marks.hide(); if (current) close(); return; }
      const player = state.entities?.get(state.playerId);
      if (!player?.alive || !(player.hull > 0) || player.occupantGeneration !== offer.playerLife) {
        marks.hide();
        if (current) close();
        return;
      }
      marks.update(offer);
      if (offer.id === consumedId || current === offer && currentId === offer.id) return;
      const deck = getPromptDeck();
      if (!deck) return;
      current = offer; currentId = offer.id;
      const offerId = offer.id, playerLife = offer.playerLife;
      const spec = {
        id: ID, kind: 'contact', sender: 'DESSA KROLL · NINTH MOUTH',
        headline: offer.headline, detail: offer.detail,
        choices: offer.choices.map(choice => ({ ...choice, cancel: choice.id === 'close' })),
        onChoose(action) {
          if (destroyed || current !== offer || currentId !== offerId || offer.id !== offerId
            || state.ceresNinthMouthOffer !== offer
            || state.mode !== 'flight' || state.ui?.docked
            || state.entities?.get(state.playerId) !== player || !player.alive || !(player.hull > 0)
            || player.occupantGeneration !== playerLife || offer.playerLife !== playerLife
            || !offer.choices.some(choice => choice.id === action && !choice.disabled)) return false;
          consumedId = offerId;
          current = null; currentId = null;
          deck.resolveDecision(ID);
          bus.emit('ceresNinthMouth:action', { offerId, action, playerLife });
          return true;
        },
      };
      if (deck.hasDecision?.(ID)) deck.updateDecision(ID, spec);
      else deck.offerDecision(spec);
    },
    close,
    destroy() { if (destroyed) return; destroyed = true; off.forEach(fn => fn?.()); close(); marks.destroy(); },
  };
}


// Authored navigation locations reuse the ordinary HUD goal diamond. These are
// labels for service positions, never modeled sockets, collision or fake solids.
export function createNinthMouthServiceMarks({ state, helpers }) {
  const rows = [], seen = [null, null, null, null];
  const world = { x: 0, y: 0, z: 0 }, screen = { x: 0, y: 0, onScreen: false };
  let destroyed = false;
  function hide() { for (const row of rows) row.node.style.display = 'none'; }
  function mount() {
    if (rows.length || typeof document === 'undefined') return;
    const root = document.getElementById('hud');
    if (!root) return;
    for (let i = 0; i < 4; i++) {
      const node = document.createElement('div');
      node.className = 'sf-objarrow sf-objarrow--onscreen';
      node.style.display = 'none';
      node.style.pointerEvents = 'none';
      node.setAttribute('role', 'img');
      node.innerHTML = '<svg class="sf-objarrow__glyph" viewBox="0 0 24 24" aria-hidden="true">'
        + '<path class="sf-objarrow__mark" d="M12 3.4 20.6 12 12 20.6 3.4 12Z"/></svg>'
        + '<span class="sf-objarrow__label mono"></span>';
      root.appendChild(node);
      rows.push({ node, label: node.querySelector('.sf-objarrow__label') });
    }
  }
  return {
    hide,
    update(offer) {
      hide();
      if (destroyed || !helpers?.worldToScreen || state.mode !== 'flight' || state.ui?.docked
        || !Array.isArray(offer?.serviceMarks)) return;
      mount(); seen.fill(null);
      let count = 0;
      for (let i = 0; i < offer.serviceMarks.length && count < rows.length; i++) {
        const mark = offer.serviceMarks[i];
        if (!mark || typeof mark.id !== 'string' || seen.includes(mark.id)
          || typeof mark.label !== 'string' || !Number.isFinite(mark.pos?.x)
          || !Number.isFinite(mark.pos?.z) || !(mark.radius > 0) || !Number.isFinite(mark.radius)) continue;
        seen[count] = mark.id;
        const row = rows[count++];
        world.x = mark.pos.x; world.z = mark.pos.z;
        screen.onScreen = false;
        const projected = helpers.worldToScreen(world, screen);
        // Behind-camera and off-screen locations are not mislabeled as visible marks.
        if (!projected?.onScreen || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) continue;
        const label = `SERVICE MARK · ${mark.label}`;
        row.label.textContent = label;
        row.node.setAttribute('aria-label', `${label}, ${Math.round(mark.radius)} units radius`);
        row.node.dataset.edge = typeof window !== 'undefined' && projected.x > window.innerWidth * 0.6 ? 'right' : 'left';
        row.node.style.transform = `translate3d(${projected.x}px,${projected.y}px,0)`;
        row.node.style.display = '';
      }
    },
    destroy() { if (destroyed) return; destroyed = true; for (const row of rows) row.node.remove(); rows.length = 0; },
  };
}
