// ORRERY composition for the Save/Load screen — the screen's own layer over the shared
// saveLayouts.js sheet (which also dresses Game Over, so it is not edited per screen).
//
// What lives here is what only this screen owns and no other sheet dresses: the save-name
// field's hover, focus, and disabled readings. The kit's input focus was a 1px hair brighten
// (styles/kit.css `.k-input:focus`), and the bench walk measured "no visible change" when the
// field took focus — invisible focus is a rubric defect (ORRERY_RUBRIC P4 #13), so focus here
// is unmistakable: the underline doubles and lights to ink with a soft warm pool under the
// field. Focus keeps the bone voice (the kit's 2px bracket is keyboard focus-visible); amber
// stays the Hand. No animation, so reduced motion needs nothing here.
const STYLE_ID = 'sf-orrery-save-load-layouts';
const SL = 'html body #screens > .k-screen.of-saveload.orr-saveload.orr-saveload';

const CSS = `
/* the save-name field: a quiet hover, a focus the eye finds, a disabled state that reads.
   The crossfade rides the kit's focus-duration token, which is 0ms under the game's
   reduced-motion setting (html.sf-reduce-motion) — no motion of our own to gate. */
${SL} .sf-save-ledger .sf-slot-label .k-input { transition:border-color var(--k-d-focus, 120ms) var(--dp-ease-out, ease-out), box-shadow var(--k-d-focus, 120ms) var(--dp-ease-out, ease-out); }
${SL} .sf-save-ledger .sf-slot-label .k-input:hover { border-bottom-color:var(--dp-line-hi, rgb(232 226 212 / .62)) !important; }
${SL} .sf-save-ledger .sf-slot-label .k-input:focus { border-bottom-color:var(--dp-ink, #e8e2d4) !important;
  box-shadow:0 1px 0 var(--dp-ink, #e8e2d4), 0 14px 26px -16px color-mix(in srgb, var(--dp-ink, #e8e2d4) 60%, transparent) !important; outline:none; }
${SL} .sf-save-ledger .sf-slot-label .k-input:focus-visible { outline:2px solid var(--dp-ink, #e8e2d4) !important; outline-offset:4px; }
${SL} .sf-save-ledger .sf-slot-label .k-input:disabled { border-bottom-color:var(--dp-line-faint, rgb(232 226 212 / .14));
  color:var(--dp-ink-mute, #b0aea6); cursor:default; }
/* the placeholder leaves the legacy grey for the field's own ink at a whisper */
${SL} .sf-save-ledger .sf-slot-label .k-input::placeholder { color:color-mix(in srgb, var(--dp-ink, #e8e2d4) 40%, transparent); opacity:1; }
`;

export function injectSaveLoadLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
