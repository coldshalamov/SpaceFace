// Layout home for the results SHEET band (`renderResultsSheet`, src/ui/screens/resultsSheet.js)
// on the Crucible results plate. NOT the plate itself: the plate's composition — title, figures,
// dial, one scroll column, share — lives in `crucibleResultsLayouts.js` (no hyphen). This sheet
// scopes `.sf-crres__sheet` internals only: the etched sub-captions that name the two ladders,
// the rhythm between the sheet's blocks, and the quiet empty reading. Injected by the sheet's own
// render (the plate cannot be edited to wire it); idempotent; fakeDom-safe (no head → no-op).
//
// ORRERY law held here: no borders, no boxes, no backdrop-filter, nothing below the 12 px floor,
// colours only as `--dp-*` tokens (alpha via color-mix), rest light warm bone, no amber/red/ice —
// the sheet is a quiet ledger; the plate's one Hand is the verb in the foot.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'orr-crucible-results-sheet-style';

const SHEET_CSS = `
/* sub-captions: the etched role a notch quieter than the band titles (which carry the hairline
   rule from the plate layout). They name the two ladders so the column reads without memory. */
#screens .sf-crres__sheet .sf-crres__sheet-sub {
  margin: 18px 0 2px;
  font-family: var(--dp-face-etch);
  font-variation-settings: "wght" 720, "wdth" 72;
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--dp-ink-mute);
}

/* the sheet's blocks sit on one rhythm: run name under the title, ladders under their captions,
   the readings last. Explicit margins — no generic child combinator to fight the plate layout. */
#screens .sf-crres__sheet .sf-crres__stunt-rows,
#screens .sf-crres__sheet .sf-crres__kit-rows { margin: 0; }
#screens .sf-crres__sheet .sf-crres__overconfidence,
#screens .sf-crres__sheet .sf-crres__sheet-empty { margin: 14px 0 0; }

/* the empty reading: a quiet line that says what would be here — body face, mute bone, never a
   box, never an apology in the plate's voice. */
#screens .sf-crres__sheet .sf-crres__sheet-empty {
  font-family: var(--dp-face-read);
  font-size: 14px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--dp-ink-mute) 88%, transparent);
}

/* the overconfidence reading stays a sentence, a notch dimmer than the run name — a self-read,
   not a judgment; red is threat only and this is not threat. */
#screens .sf-crres__sheet .sf-crres__overconfidence { color: var(--dp-ink-dim); }

/* narrow windows: condense the captions (width axis + tracking), never below 12 px. */
@media (max-width: 1100px) {
  #screens .sf-crres__sheet .sf-crres__sheet-sub { font-variation-settings: "wght" 720, "wdth" 92; letter-spacing: .08em; }
}
`;

export function injectCrucibleResultsSheetLayout(doc = globalThis.document) {
  if (!doc?.head || typeof doc.getElementById !== 'function' || doc.getElementById(STYLE_ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = SHEET_CSS;
  doc.head.appendChild(style);
}
