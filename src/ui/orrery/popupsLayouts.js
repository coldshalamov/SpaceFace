// Layout of the global entity search and dossier. The popup material and role marks
// come from styles/kit.css. The independent record and action scrollports live here.
const STYLE_ID = 'sf-orrery-popups-layouts';

const CHEVRON = 'url("data:image/svg+xml,'
  + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
  )
  + '")';

const CSS = `
/* Search has one listening field, one result ladder and a fixed key legend. */
.sf-find .sf-find__pane {
  display: flex; flex-direction: column; box-sizing: border-box; width: min(620px, calc(100% - 24px));
  max-height: calc(100dvh - 16vh - 20px); border: 1px solid var(--sf-pop-seam); border-top: 2px solid var(--dp-phos);
  background: var(--sf-pop-glass); box-shadow: var(--sf-pop-shadow);
}
.sf-find .sf-find__field {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--sf-pop-seam);
}
.sf-find .sf-find__field::before {
  content: ""; width: 40px; height: 40px; flex: none; background: var(--sf-pop-sweep) center / contain no-repeat;
}
.sf-find .sf-find__field:focus-within { border-bottom-color: var(--dp-lamp); }
.sf-find .sf-find__field input.sf-find__input {
  flex: 1; min-width: 0; width: 0; padding: 8px 0; font-size: clamp(16px, 2vw, 22px);
  background: transparent; animation: none; backdrop-filter: none;
}
.sf-find .sf-find__dismiss {
  position: relative; flex: none; width: 40px; height: 40px; padding: 0;
  border: 1px solid var(--sf-pop-seam); border-radius: 2px; color: var(--dp-ink); background: transparent; cursor: pointer;
}
.sf-find .sf-find__dismiss::before, .sf-find .sf-find__dismiss::after {
  content: ""; position: absolute; left: 30%; top: 48%; width: 40%; height: 2px; background: currentColor; rotate: 45deg;
}
.sf-find .sf-find__dismiss::after { rotate: -45deg; }
.sf-find .sf-find__dismiss:is(:hover,:focus-visible) { color: var(--dp-lamp-hot); border-color: currentColor; }
.sf-find .sf-find__pane .sf-find__results {
  width: auto; min-height: 0; overflow: auto; padding: 4px; background: none; animation: none; backdrop-filter: none;
}
.sf-find .sf-find__row {
  grid-template-columns: 6em minmax(0,1fr) minmax(0,auto); gap: 10px; padding: 10px 14px;
  min-height: 42px; border-bottom: 1px solid var(--dp-rule); align-items: center;
}
.sf-find .sf-find__kind { color: var(--dp-phos); letter-spacing: .045em; }
.sf-find .sf-find__name, .sf-find .sf-find__detail { white-space: normal; overflow-wrap: anywhere; }
.sf-find .sf-find__pane .sf-find__hint {
  width: auto; padding: 10px 18px; border-top: 1px solid var(--dp-rule); background: rgb(0 0 0 / .13);
  font: 500 13px/1.45 var(--dp-face-read); text-transform: none; letter-spacing: .02em; animation: none;
}
@media (max-width: 540px) {
  .sf-find .sf-find__row { grid-template-columns: 5.5em minmax(0,1fr); row-gap: 3px; }
  .sf-find .sf-find__detail { grid-column: 2; }
  .sf-find .sf-find__field { padding: 8px; gap: 8px; }
}
.sf-find.sf-find--host, .sf-find.sf-find--recede { backdrop-filter: none; }
.sf-find.sf-find--recede { background: none; }
.sf-find.sf-find--recede .sf-find__pane { opacity: .24; pointer-events: none; }
/* Screen-hosted search and dossier are siblings. The drawer must receive pointer hits as well as focus. */
.sf-find--recede ~ .sf-drawerlayer { z-index: 4501; }
/* ── 2. The dossier sheet hugs its content ───────────────────────────────────────────────── */
/* Full height on a four-line dossier read as an unfinished sidebar; top-anchored with a viewport
   cap, a short record ends at its apron and a long one still scrolls (overflow from the base
   .sf-drawer rule). Same selector as the shared sheet, injected after it — the tie breaks late. */
.sf-drawerlayer > .sf-drawer--entity { top: 0; bottom: auto; max-height: 100%; display: flex; flex-direction: column;
  box-sizing: border-box; background: var(--sf-pop-glass); border: 1px solid var(--sf-pop-seam);
  border-top: 2px solid var(--dp-phos); box-shadow: var(--sf-pop-shadow); mask-image: none; backdrop-filter: none;
}
.sf-drawer--entity .sf-drawer__kicker { letter-spacing: .065em; }
.sf-drawer--entity .sf-drawer__kicker::before {
  width: 34px; height: 34px; mask: none; background: var(--sf-pop-record) center / contain no-repeat;
}
.sf-drawer--entity .sf-tile__k, .sf-drawer--entity .sf-deck__label { letter-spacing: .06em; }
.sf-drawer--entity .sf-drawer__x { border: 1px solid var(--sf-pop-seam); border-radius: 2px; }
.sf-drawer--entity .sf-entity-link--row { padding-right: 16px; }
.sf-drawer--entity .sf-drawer__deck { padding-left: clamp(20px, 3vw, 40px); }

/* The record and action rail are flex siblings: the rail reserves its actual height, including
   Back and price-alert rows, while the record takes the remaining scrollable space. A long rail
   is independently scrollable so enlarged text cannot consume the entire record viewport. */
.sf-drawerlayer > .sf-drawer--entity > .sf-drawer__deck { flex: 1 1 auto; height: auto; min-height: 0; scroll-padding-block: 8px; }
.sf-drawer--entity > .sf-drawer__deck:focus-visible { outline: 2px solid var(--dp-lamp, #f2b950); outline-offset: -2px; }
.sf-drawer--entity > .sf-drawer__apron {
  position: relative; bottom: auto; flex: 0 0 auto; min-height: 0; max-height: 50vh;
  background: transparent; box-shadow: none;
  box-sizing: border-box; overflow-y: auto; scroll-padding-block: 8px;
  margin: 18px 36px 0 clamp(20px, 3vw, 40px);
}
.sf-drawer--entity > .sf-drawer__apron > .sf-drawer__verb {
  box-sizing: border-box; min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere;
}
@media (max-height: 760px) {
  .sf-drawer--entity > .sf-drawer__apron { margin-top: 18px; }
}
/* Phone: the sheet is full width, so a hugging sheet left a strip of the station foot (COMMS,
   UNDOCK) printing under it. There it fills the screen and the verbs sit on its foot. */
@media (max-width: 640px) {
  .sf-drawerlayer > .sf-drawer--entity { bottom: 0; max-height: none; }
  .sf-drawerlayer > .sf-drawer--entity > .sf-drawer__deck { flex: 1 1 auto; }
  .sf-drawer--entity > .sf-drawer__apron { margin: 20px 20px 0; }
}

/* 641–1100 wide: at 48vw the 960x540 sheet left a 336px column, so CLOSE wrapped to a second apron
   row and the taller apron buried POWERS under its fade with no sign the record went on. The sheet
   holds 480px, its column starts 12px nearer the fade, and the verbs tighten (same keys, same order) so the three sit on one row. */
@media (min-width: 641px) and (max-width: 1100px) {
  .sf-drawerlayer > .sf-drawer--entity { width: min(600px, max(48vw, 480px)); }
  .sf-drawer--entity .sf-drawer__deck { padding-left: 32px; }
  .sf-drawer--entity > .sf-drawer__apron { margin-left: 32px; column-gap: 10px; }
  .sf-drawer--entity .sf-drawer__apron > .sf-drawer__verb { padding: 0 15px 0 13px; letter-spacing: .11em; }
}

/* Short desktop: keep the compact record, but reserve the footer through normal flex layout.
   Its height follows the actual actions rather than a 60px assumption that fails when Back,
   Watch and price-alert controls wrap onto extra rows. */
@media (min-width: 641px) and (max-height: 560px) {
  .sf-drawerlayer > .sf-drawer--entity { bottom: 0; max-height: none; }
  /* The deck shrinks above the action rail; only its record scrolls. */
  .sf-drawerlayer > .sf-drawer--entity > .sf-drawer__deck {
    flex: 1 1 auto; min-height: 0; height: auto;
    max-height: none; margin-bottom: 0;
    gap: 8px; padding-top: 14px; padding-bottom: 10px; padding-right: 28px;
  }
  .sf-drawer--entity .sf-drawer__crest { gap: 4px; padding-bottom: 6px; padding-right: 36px; }
  .sf-drawer--entity .sf-drawer__title { font-size: clamp(22px, 3.2vw, 32px); }
  .sf-drawer--entity .sf-drawer__facts { gap: 8px 16px; }
  .sf-drawer--entity .sf-drawer__facts .sf-tile { padding-top: 6px; gap: 2px; }
  .sf-drawer--entity .sf-tile__v { font-size: 14px; }
  .sf-drawer--entity .sf-tile--data .sf-tile__v { font-size: 18px; }
  .sf-drawer--entity .sf-drawer__stage { gap: 8px; }
  .sf-drawer--entity .sf-deck { gap: 2px; }
  .sf-drawer--entity .sf-deck__label { font-size: 12px; letter-spacing: .14em; }
  .sf-drawer--entity .sf-drawer__prose { font-size: 13px; line-height: 1.35; }
  .sf-drawer--entity .sf-entity-link--row { padding: 5px 2px 5px 0; font-size: 14px; }
  .sf-drawer--entity > .sf-drawer__apron {
    position: relative; left: auto; right: auto; bottom: auto;
    z-index: 2; margin: 8px 28px 0 32px; height: auto; box-sizing: border-box;
    padding-top: 10px; padding-bottom: 10px;
  }
  .sf-drawer--entity .sf-drawer__apron > .sf-drawer__verb { min-height: 34px; padding: 0 14px 0 12px; }
  .sf-drawer--entity .sf-drawer__x { top: 8px; right: 12px; width: 36px; height: 36px; }
}
/* Wider short frames retain the same content and action inset. */
@media (min-width: 1101px) and (max-height: 560px) {
  .sf-drawerlayer > .sf-drawer--entity > .sf-drawer__deck { padding-left: 40px; }
  .sf-drawer--entity > .sf-drawer__apron { margin-left: 40px; margin-right: 28px; }
}

/* ── 3. Rungs are doors at rest; disabled verbs look disabled ────────────────────────────── */
/* The quiet etched chevron — the door mark. Bone at rest, the lamp under the hand; it slides a
   few px toward the exit it names. */
.sf-entity-link--row::after { content: ""; position: absolute; right: 4px; top: 50%; width: 10px; height: 10px;
  margin-top: -5px;
  background: color-mix(in srgb, var(--dp-ink-mute, #b0aea6) 78%, transparent);
  -webkit-mask: ${CHEVRON} center / contain no-repeat; mask: ${CHEVRON} center / contain no-repeat;
  transition: background 140ms var(--dp-ease-settle, cubic-bezier(.16, 1, .3, 1)), translate 200ms var(--dp-ease-snap, cubic-bezier(.3, 1.6, .4, 1)); }
.sf-entity-link--row:hover::after, .sf-entity-link--row:focus-visible::after {
  background: var(--dp-lamp, #f2b950); translate: 3px 0; }

/* An apron verb that cannot act must read as unable: the FB-050 "needs a docked quote" state
   shipped with no disabled treatment. */
.sf-drawer__verb[disabled], .sf-drawer__verb:disabled {
  cursor: default; opacity: .38; filter: none;
  color: var(--dp-ink-mute, #b0aea6);
  background: linear-gradient(225deg, transparent calc(12px * .7071), var(--dp-field-ink, rgb(232 226 212 / .08)) 0);
  box-shadow: none;
}
.sf-drawer__verb[disabled]:hover, .sf-drawer__verb:disabled:hover,
.sf-drawer__verb[disabled]:active, .sf-drawer__verb:disabled:active { transform: none; box-shadow: none; }

@media (forced-colors: active) {
  .sf-find .sf-find__pane, .sf-drawerlayer > .sf-drawer--entity { background: Canvas; color: CanvasText; border-color: CanvasText; }
  .sf-find .sf-find__dismiss:focus-visible { outline: 2px solid Highlight !important; }
}
@media (prefers-reduced-motion: reduce) { .sf-entity-link--row::after { transition: none; } }
html.sf-reduce-motion .sf-entity-link--row::after { transition: none; }
`;

/** Idempotent injection — called by the popup modules when they are created (uiRoot mount and
 *  the bench harness both go through createGlobalFind / createEntityLinks). */
export function ensurePopupsLayout(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
