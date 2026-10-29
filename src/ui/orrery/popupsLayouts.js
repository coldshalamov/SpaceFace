// popupsLayouts.js — the popup tier's layout home (ORRERY register): the shared chrome for the
// three popup instruments this unit owns — the find palette (globalFind.js), the entity dossier
// drawer (entityLinks.js) and the quiet states of its apron verbs.
//
// WHY A JS-INJECTED SHEET: the popup tier's base look lives in the shared stylesheets
// (styles/kit.css "Confirm / Tier-2 tooltip / Find palette", styles/ui.css "§14 entity links +
// drawer") which several screens share — this lane does not edit shared sheets. The established
// composition idiom for lane-owned styling is a guarded <style> injection (src/ui/orrery/chartHub.js
// injectHubStyle, src/ui/orrery/hoverTag.js). Every rule here SCOPES to or augments the existing
// classes; none redefines the tier.
//
// THE THREE MOVES (each judged on the bench PNGs, popup-find / popup-dossier):
//   1. ONE PANE. The palette was two unrelated glass slabs plus a caption floating on the scrim —
//      a web command palette, not the popup tier's single instrument. globalFind.js now wraps
//      input + results + hint in one .sf-find__pane; this sheet gives the pane the tier's chrome —
//      corner brackets, one drawn head rule, the wash — and strips the per-slab glass so the
//      surface reads as one instrument. Rows arrive on the tier's stagger (28 ms), not as a block.
//   2. THE SHEET HUGS ITS CONTENT. A four-line dossier left ~380 px of dead glass above the apron
//      at 1920×1080 — the exact "unfinished sidebar" read the drawer's own history fights. The
//      sheet now runs top → content, capped at the viewport; a tall record still scrolls and the
//      sticky apron still rides the foot.
//   3. RUNGS READ AS DOORS AT REST. A dossier link rung was indistinguishable from body text
//      until hovered (the underline deliberately returns only on intent). Each rung now carries a
//      quiet etched chevron — the door mark — which warms to the lamp under the hand. And a
//      disabled apron verb now LOOKS disabled (the FB-050 "needs a docked quote" state shipped
//      with no disabled treatment at all).
//   5. THE PALETTE SHARPENS ONLY OVER A STILL WORLD. The pane's 22px blur painted per-frame over
//      live flight whenever find opened with no screen up — the flight-hosted palette
//      (.sf-find--host, globalFind mounts it bare on #screens) sat over the running world, and P9
//      makes backdrop-filter in flight an S1. The blur now scopes to the screen-hosted pane; the
//      flight-hosted pane takes the flight glass' flat --dp-glass-flight fill instead.
//   4. THE PALETTE STEPS BACK FOR THE DRAWER. A dossier opened from a palette row painted under
//      the palette's own scrim (palette z 4500, drawer layer z 40); the drawer is announced on
//      the bus (ui:entityDrawer, entityLinks.js) and the palette recedes to .25 opacity while it
//      is up — "the palette waits behind the drawer" made true at the pixels.
//
// LAW: colours are --dp-* / the tier's existing --sf-pop-* only, alpha via color-mix; no new
// token root; nothing below the 12 px floor; no bordered rectangle (brackets and rules only);
// reduced motion kills every animation and transition here under BOTH the media query and
// html.sf-reduce-motion (the game's own accessibility setting).

const STYLE_ID = 'sf-orrery-popups-layouts';

const CHEVRON = 'url("data:image/svg+xml,'
  + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
  )
  + '")';

const CSS = `
/* ── 1. The find palette is one pane ─────────────────────────────────────────────────────── */
.sf-find .sf-find__pane {
  position: relative;
  display: flex; flex-direction: column;
  width: min(calc(660px * var(--k-s, 1)), 92vw);
  box-sizing: border-box;
  background:
    radial-gradient(70% 130px at 50% 0, var(--sf-pop-wash, rgb(232 226 212 / .055)), transparent),
    var(--sf-pop-glass, linear-gradient(180deg, rgb(18 21 28 / .9), rgb(8 10 14 / .96)));
  animation: sf-popups-unfold 420ms var(--sf-pop-settle, cubic-bezier(.16, 1, .3, 1)) backwards;
}
/* P9: blur only over a paused/static world. The screen-hosted pane keeps the 22px wash; the
   flight-hosted palette (globalFind mounts it bare on #screens as .sf-find--host while the
   world runs) paints the flight glass' flat --dp-glass-flight fill instead — no per-frame
   blur over live flight. */
.sf-find:not(.sf-find--host) .sf-find__pane {
  -webkit-backdrop-filter: blur(22px) saturate(1.15); backdrop-filter: blur(22px) saturate(1.15);
}
.sf-find.sf-find--host .sf-find__pane {
  background: var(--dp-glass-flight, rgb(18 23 29 / .82));
  -webkit-backdrop-filter: none; backdrop-filter: none;
}
/* Same P9 law on the host scrim itself: .sf-find's blur(9px) otherwise repaints the whole
   viewport behind the pane every frame the palette is up over live flight. The dim wash stays —
   only the per-frame blur goes. */
.sf-find.sf-find--host {
  -webkit-backdrop-filter: none; backdrop-filter: none;
}
/* The edge: four corner brackets floating just outside the glass — the tier's edge language,
   never a border. */
.sf-find .sf-find__pane::before { content: ""; position: absolute; inset: -8px; pointer-events: none;
  background:
    linear-gradient(var(--sf-pop-tick, rgb(232 226 212 / .55)) 0 0) left top / 16px 1px,
    linear-gradient(var(--sf-pop-tick, rgb(232 226 212 / .55)) 0 0) left top / 1px 16px,
    linear-gradient(var(--sf-pop-tick, rgb(232 226 212 / .55)) 0 0) right top / 16px 1px,
    linear-gradient(var(--sf-pop-tick, rgb(232 226 212 / .55)) 0 0) right top / 1px 16px,
    linear-gradient(var(--sf-pop-tick, rgb(232 226 212 / .55)) 0 0) left bottom / 16px 1px,
    linear-gradient(var(--sf-pop-tick, rgb(232 226 212 / .55)) 0 0) left bottom / 1px 16px,
    linear-gradient(var(--sf-pop-tick, rgb(232 226 212 / .55)) 0 0) right bottom / 16px 1px,
    linear-gradient(var(--sf-pop-tick, rgb(232 226 212 / .55)) 0 0) right bottom / 1px 16px;
  background-repeat: no-repeat;
  animation: sf-popups-brackets 520ms var(--sf-pop-settle, cubic-bezier(.16, 1, .3, 1)) 40ms backwards; }
/* One drawn rule along the head: 1 px core + bloom as geometry, the tier's lit head. */
.sf-find .sf-find__pane::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--sf-pop-edge, rgb(232 226 212 / .5)) 16%, var(--sf-pop-edge, rgb(232 226 212 / .5)) 84%, transparent);
  box-shadow: 0 0 22px 3px var(--sf-pop-bloom, rgb(232 226 212 / .16));
  transform-origin: 50% 50%;
  animation: sf-popups-draw 560ms var(--sf-pop-settle, cubic-bezier(.16, 1, .3, 1)) 80ms backwards; }

/* The field loses its own slab: the pane carries the glass, the field keeps only its resting
   rule — which warms to the lamp under focus (the palette's one amber leader). */
.sf-find .sf-find__pane input.sf-find__input,
.sf-find .sf-find__pane input.sf-find__input:hover,
.sf-find .sf-find__pane input.sf-find__input:focus {
  background:
    linear-gradient(90deg, transparent, var(--dp-rule-hi, rgb(232 226 212 / .22)) 10%, var(--dp-rule-hi, rgb(232 226 212 / .22)) 90%, transparent) bottom / 100% 1px no-repeat;
  -webkit-backdrop-filter: none; backdrop-filter: none;
  animation: none;
}
.sf-find .sf-find__pane input.sf-find__input:focus {
  background:
    linear-gradient(90deg, transparent, var(--dp-lamp, #f2b950) 8%, var(--dp-lamp-hot, #ffd98c) 50%, var(--dp-lamp, #f2b950) 92%, transparent) bottom / 100% 1.5px no-repeat; }
/* The results lose their second slab: one continuous surface under the field. */
.sf-find .sf-find__pane .sf-find__results {
  background: none;
  -webkit-backdrop-filter: none; backdrop-filter: none;
  padding-top: 2px;
}

/* Rows arrive on the tier's stagger — 28 ms per rung, the scales-tick cadence — never as a block. */
.sf-find .sf-find__pane .sf-find__row { animation: sf-popups-rise 300ms var(--sf-pop-settle, cubic-bezier(.16, 1, .3, 1)) backwards; }
.sf-find .sf-find__pane .sf-find__row:nth-child(1) { animation-delay: 140ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(2) { animation-delay: 168ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(3) { animation-delay: 196ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(4) { animation-delay: 224ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(5) { animation-delay: 252ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(6) { animation-delay: 280ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(7) { animation-delay: 308ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(8) { animation-delay: 336ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(9) { animation-delay: 364ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(10) { animation-delay: 392ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(11) { animation-delay: 420ms; }
.sf-find .sf-find__pane .sf-find__row:nth-child(12) { animation-delay: 448ms; }

/* The hint is the pane's foot — one surface, a hairline where the ladder ends. Its etched-caps
   typography stays the shared sheet's; this only seats it and keeps the 12 px floor. */
.sf-find .sf-find__pane .sf-find__hint {
  position: relative; width: 100%;
  padding: 12px 28px 14px;
  background: linear-gradient(90deg, var(--dp-rule, rgb(232 226 212 / .1)), transparent 85%) top / 100% 1px no-repeat;
  animation-delay: 220ms;
}
/* A dossier opened from a row paints under this palette's scrim; while it is up the palette
   steps back (entityLinks announces it via ui:entityDrawer → globalFind toggles the class): the
   viewport veil lifts with the pane, so the drawer reads in front and the palette holds its
   place behind it as a quiet ghost. */
.sf-find.sf-find--recede { background: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.sf-find.sf-find--recede .sf-find__pane { opacity: .25; pointer-events: none; transition: opacity 180ms var(--sf-pop-settle, cubic-bezier(.16, 1, .3, 1)); }

/* ── 2. The dossier sheet hugs its content ───────────────────────────────────────────────── */
/* Full height on a four-line dossier read as an unfinished sidebar; top-anchored with a viewport
   cap, a short record ends at its apron and a long one still scrolls (overflow from the base
   .sf-drawer rule). Same selector as the shared sheet, injected after it — the tie breaks late. */
.sf-drawerlayer > .sf-drawer--entity { top: 0; bottom: auto; max-height: 100%; display: flex; flex-direction: column; }
/* With the sheet's height left to its content, the deck's height:100% resolved to auto and never
   scrolled: a long record ran past the viewport and took the sticky verbs with it (OPEN ON THE CHART
   and CLOSE were unreachable at 960x540 and 375x667). As a flex column the deck shrinks to the
   capped sheet and scrolls, so the apron rides the foot again. */
.sf-drawerlayer > .sf-drawer--entity > .sf-drawer__deck { height: auto; min-height: 0; }
/* Phone: the sheet is full width, so a hugging sheet left a strip of the station foot (COMMS,
   UNDOCK) printing under it. There it fills the screen and the verbs sit on its foot. */
@media (max-width: 640px) {
  .sf-drawerlayer > .sf-drawer--entity { bottom: 0; max-height: none; }
  .sf-drawerlayer > .sf-drawer--entity > .sf-drawer__deck { flex: 1 1 auto; }
  .sf-drawer--entity .sf-drawer__deck > .sf-drawer__apron { margin-top: auto; }
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

/* ── Reduced motion: every state arrives instantly, both guards ──────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .sf-find .sf-find__pane, .sf-find .sf-find__pane::before, .sf-find .sf-find__pane::after,
  .sf-find .sf-find__pane .sf-find__row, .sf-find .sf-find__pane .sf-find__hint { animation: none; }
  .sf-find.sf-find--recede .sf-find__pane { transition: none; }
  .sf-entity-link--row::after { transition: none; }
}
html.sf-reduce-motion .sf-find .sf-find__pane,
html.sf-reduce-motion .sf-find .sf-find__pane::before,
html.sf-reduce-motion .sf-find .sf-find__pane::after,
html.sf-reduce-motion .sf-find .sf-find__pane .sf-find__row,
html.sf-reduce-motion .sf-find .sf-find__pane .sf-find__hint { animation: none; }
html.sf-reduce-motion .sf-find.sf-find--recede .sf-find__pane { transition: none; }
html.sf-reduce-motion .sf-entity-link--row::after { transition: none; }

/* ── Keyframes: the tier's own names, declared here so the pane never depends on load order ── */
@keyframes sf-popups-unfold {
  from { opacity: 0; clip-path: inset(46% -30px 46% -30px); transform: translateY(8px) scale(.985); }
  to   { opacity: 1; clip-path: inset(-30px -30px -30px -30px); transform: none; }
}
@keyframes sf-popups-draw { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
@keyframes sf-popups-brackets { from { opacity: 0; inset: -26px; } to { opacity: 1; inset: -8px; } }
@keyframes sf-popups-rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
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
