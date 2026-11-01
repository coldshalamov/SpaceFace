// Normal game pages link the generated HUD CSS in index.html. Keep this small runtime helper as a
// fallback for embedded UI hosts that mount uiRoot without the canonical document shell.
import { injectDeckplate } from '../deckplate/index.js';

const HUD_STYLE_ID = 'sf-hud-style';

export function ensureHudStylesheet(doc = globalThis.document) {
  injectDeckplate(doc);
  if (!doc?.head || doc.getElementById(HUD_STYLE_ID)) return;
  const link = doc.createElement('link');
  link.id = HUD_STYLE_ID;
  link.rel = 'stylesheet';
  link.href = '/styles/hud-flight.generated.css';
  doc.head.appendChild(link);
}
