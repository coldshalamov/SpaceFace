import { ionStormBlackout } from '../data/environmentalMachinery.js';

// Only instrument groups go dark. Comms, captions, prompts, menus and flight input remain live.
export function mountIonStormHud(root, state) {
  const doc = root.ownerDocument || document;
  const style = doc.createElement('style');
  style.textContent = '#hud.sf-ion-blackout .sf-rightdock,#hud.sf-ion-blackout .orr-hud-cluster,#hud.sf-ion-blackout .sf-vtape{visibility:hidden!important}';
  root.appendChild(style);
  const caption = doc.createElement('div');
  caption.className = 'k-text';
  caption.setAttribute('role', 'status');
  caption.textContent = 'ION FRONT — scope offline. Follow your engine and the radio.';
  caption.hidden = true;
  const rail = root.querySelector('.sf-leftcontext') || root;
  rail.appendChild(caption);
  let previous = null;
  return {
    update() {
      const player = state.entities?.get(state.playerId);
      const active = state.mode === 'flight' && !state.ui?.docked && !player?.flags?.docked && ionStormBlackout(state, player);
      if (active === previous) return;
      previous = active;
      root.classList.toggle('sf-ion-blackout', active);
      caption.hidden = !active;
    },
    destroy() { root.classList.remove('sf-ion-blackout'); caption.remove(); style.remove(); },
  };
}
