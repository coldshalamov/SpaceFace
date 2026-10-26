// ORRERY composition home for the two flight radials (design/frontend/ORRERY.md §6 "Radials"):
//
//   - src/ui/commsRadial.js  — the comms fan (hold-to-open)  — restyled by orrery/commsLayouts.js
//   - src/ui/wingmanRadial.js — the wingman command dial     — restyled by orrery/wingmanLayouts.js
//
// This sheet carries only what a radial needs BEYOND its own layout sheet, and is injected after
// both of them so the delta stays readable:
//
//   - the ≤1400px tier condenses the wingman dial by scale (.8); ORRERY.md §3.4/P10 says a narrow
//     viewport condenses type, never shrinks it below the 12px floor — so every size on the dial
//     compensates (12/.8 = 15 declared, 14/.8 = 17.5 declared) and stays ≥12px on the composited
//     pixels, and the hub title (the widest string) also condenses on the width axis's tracking
//     (.14em → .07em) so "ALL WINGS" holds one line inside the 124px hub. The band is guarded
//     against the phone tier (≤760px / ≤560px tall), which compensates
//     itself (scale .72 with --wr-type 16.7px);
//   - the wingman key face widens and its legend tightens to .12em so the longest legend
//     ("ATTACK TARGET") holds one line — the four keys share one rhythm;
//   - press feedback: the keys and the hub answer :active on the snap preset (a press is felt, not
//     only seen), and the hub arrives on the settle preset instead of a bare ease;
//   - the comms keys ride the token key height (--dp-key-h-2 40px); --fan-key-h is written by the
//     fan's JS so the arc-rail math and this height share one source;
//   - while either radial is open the world-positioned marks stand down entirely: the tell line
//     (a FLYBY chip ghosted legibly through the fan's fill at both viewports), the lock sigil
//     (its rosette bled into the ATTACK wedge as a dim octagon nobody could name), and the
//     gravity/momentum marks. Paint only: the doctrine tell's assertive live-region announce in
//     hud.js pushDoctrineTell is independent of the decorative chips and still speaks;
//   - the fan's shade pool stops being a feathered ellipse — the soft rounded silhouette was the
//     most card-like shape on the surface. The deck now sits on a chamfered instrument bezel: a
//     near-opaque faceted plate clipped to a cut-corner polygon, with an etched rim light drawn
//     on the same clip so the edges read machined, not rounded;
//   - at the ≤1400px tier the fan also shifts right (50% → 54%), so its bezel clears the LINE
//     SPACE legend and the ability column by ~60px instead of feathering over them;
//   - the dial's hub pours deeper, so a live HUD line behind cannot print through onto the
//     scope word either;
//   - one Hand per screen: the surface NOT under the pointer stands down (fan verbs while the
//     plate is hovered; the dial's scope cue while a key is), and the wingman glyphs rest bone —
//     amber belongs to the chosen key alone;
//   - reduced motion reaches every added state instantly (html.sf-reduce-motion and the OS hint).
//
// Static alpha and transforms only: no backdrop-filter, no filter, no borders, no new token roots
// (the component-scoped --wr-type / --fan-key-h pattern continues here).
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-flight-radials';
const F = 'html body #sf-commsfan';
const W = 'html body .sf-wradial';
// The wingman's own compensations apply exactly where its .8 scale tier applies, and nowhere the
// phone tier (scale .72 + its own type compensation) does.
const NARROW = '@media (max-width:1400px) and (min-width:761px) and (min-height:561px)';

const CSS = `
/* ── wingman dial: the condensed tier holds the 12px floor on composited pixels ─────────────── */
${NARROW} {
  ${W} { --wr-type:15px; }
  ${W} .sf-wradial__hub-title { font-size:15px; letter-spacing:.04em; }
  ${W} .sf-wradial__hub { padding-left:8px !important; padding-right:8px !important; }
  ${W} .sf-wradial__hub-scope { font-size:15px !important; }
  ${W} .sf-wradial__hub-count { font-size:17.5px !important; }
  /* The fan slides right on the condensed tier: at 1280×720 its left bezel edge sat ~15px off
     the ability column and the pool feathered over the "LINE SPACE" legend (critic finding 5).
     At 54% the bezel clears the legend by ~60px while staying ~150px clear of the right dock. */
  ${F} { left:54%; }
}

/* ── wingman keys: one rhythm — the longest legend holds one line ───────────────────────────── */
${W} .sf-wradial__face { width:126px; }
${W} .sf-wradial__label { letter-spacing:.12em; white-space:nowrap; }
@media (max-width:760px), (max-height:560px) { ${W} .sf-wradial__face { width:150px; } }

/* ── wingman press + arrival: transforms on the spring presets, a press is felt ─────────────── */
${W} .sf-wradial__hub { transition:transform .22s cubic-bezier(.22, 1, .36, 1); }
${W} .sf-wradial__hub:active { transform:translate(-50%, -50%) scale(.97); }
${W} .sf-wradial__face { transition:transform .12s cubic-bezier(.2, .9, .3, 1.2); }
${W} .sf-wradial__wedge:not(.sf-wradial__wedge--disabled):active .sf-wradial__face { transform:translate(-50%, -50%) scale(.95); }
${W} .sf-wradial__wedge:not(.sf-wradial__wedge--disabled):active .sf-wradial__seg path { stroke-width:4; }

/* ── comms fan: the keys ride the token key height (--fan-key-h: written by commsRadial.js) ── */
${F} .sf-commsfan__wedge { height:var(--fan-key-h, 40px); }

/* ── a radial owns the frame: every world-positioned mark stands down ─────────────────────────
   The tell chips (.sf-tells), the lock sigil (.sf-lockdiamond), the gravity/momentum marks all
   live at projected world positions — a layer the translucent radial fills were never meant to
   host. A FLYBY chip ghosted legibly through the fan, and the friendly lock rosette printed
   through the ATTACK wedge as a dim octagon (critic findings 1 + 6). Suppression is paint only:
   .sf-tells is already aria-hidden decorative and the shared assertive live region announces in
   hud.js pushDoctrineTell — speech is untouched. hidden covers the dial's 160ms fade-out, so a
   mark can never pop in mid-exit. */
body:has(#sf-commsfan.is-open, .sf-drawer--haildeck.is-open, .sf-wradial:not([hidden]))
  :is(.sf-tells, .sf-lockdiamond, .sf-gravity-mark, .sf-momentum-sink) { visibility:hidden !important; }

/* ── comms fan: the shade pool becomes a machined bezel, not a rounded slab ───────────────────
   The feathered ellipse did darken the world behind the fan, but its soft silhouette was the
   most card-like shape on the surface (critic finding 2). Same job — part the live HUD — drawn
   the instrument way: a near-opaque faceted plate clipped to a cut-corner polygon, plus an
   etched rim light on the same clip (uniform hairline + brighter top-left facets) so the edges
   read machined. The clip-path corners stay inside the old pool's footprint, so nothing that
   was covered is newly exposed. */
${F}::before { inset:-34px -52px -28px -44px; border-radius:0;
  clip-path:polygon(24px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 24px),
    calc(100% - 24px) 100%, 10px 100%, 0 calc(100% - 10px), 0 24px);
  background:
    /* the top edge is a read edge — the plate carries a tick scale along it the way the radar
       bezel and the ribbon baseline do, so the long straight run stops reading as a bare slab
       side (craft critic r2 finding R2) */
    repeating-linear-gradient(90deg, rgb(232 226 212 / .34) 0 1.5px, transparent 1.5px 13px)
      26px 0 / calc(100% - 40px) 5px no-repeat,
    linear-gradient(163deg, rgb(5 7 11 / .97), rgb(4 6 10 / .94) 46%, rgb(6 8 13 / .96)); }
${F}::after { content:""; position:absolute; inset:-34px -52px -28px -44px; z-index:-1; pointer-events:none;
  clip-path:polygon(24px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 24px),
    calc(100% - 24px) 100%, 10px 100%, 0 calc(100% - 10px), 0 24px);
  box-shadow:inset 0 0 0 1.4px rgb(232 226 212 / .34),
    inset 4px 4px 0 -2.4px rgb(255 246 226 / .5),
    inset -4px -4px 0 -2.4px rgb(232 226 212 / .13); }
html:root[data-sf-mobile="1"] body #sf-commsfan::after { inset:-28px -28px -24px -28px; }
@media (forced-colors:active) { ${F}::after { display:none; } }

/* ── one Hand per screen: while the contact plate is under the pointer (its "HAIL DECK" hint is
   the amber then), the verb holding keyboard focus stands down — the mirror of the wedge-side
   rule commsLayouts already authors ─────────────────────────────────────────────────────────── */
${F} .sf-commsfan__hub:is(:hover, :focus-visible) ~ .sf-commsfan__wedgehost .sf-commsfan__wedge:not(:hover):not(.is-dim) { color:rgb(232 230 216 / .9); }
${F} .sf-commsfan__hub:is(:hover, :focus-visible) ~ .sf-commsfan__wedgehost .sf-commsfan__wedge:not(:hover):not(.is-dim)::before {
  background:rgb(232 230 216 / .92) !important;
  box-shadow:0 0 0 2px rgb(5 7 10), 0 0 8px 1px rgb(232 230 216 / .4) !important; }
${F} .sf-commsfan__hub:is(:hover, :focus-visible) ~ .sf-commsfan__wedgehost .sf-commsfan__wedge:not(:hover)::after { opacity:0; }
${F} .sf-commsfan__hub:is(:hover, :focus-visible) ~ .sf-commsfan__wedgehost .sf-commsfan__wedge:not(:hover):not(.is-dim) .sf-commsfan__keychip { color:var(--dp-phos, #dfeeff); }

/* ── wingman dial: the hub is the reading centre — deep enough glass that a live-HUD line behind
   it (the tell) cannot print through onto "2 CRAFT / TAB"; same glass hue, a near-opaque pour
   (background-color carries the depth: the shorthand above would reset it) ──────────────────── */
${W} .sf-wradial__hub { background:radial-gradient(circle, rgb(7 9 13 / .96), rgb(7 9 13 / .9) 70%, rgb(7 9 13 / .6) 100%) !important;
  background-color:rgb(7 9 13 / .97) !important; }

/* ── wingman keys: bone glyphs at rest — amber is the Hand on the chosen key only (the comms
   fan's own language); the authored hover/focus rule re-lights the key under the pilot's hand */
${W} .sf-wradial__glyph { color:rgb(232 230 216 / .9); opacity:.85; }
${W}:has(.sf-wradial__wedge:is(:hover, :focus-visible)) .sf-wradial__hub:hover .sf-wradial__hub-scope { color:rgb(232 230 216 / .8); }

/* ── reduced motion: every added state arrives instantly ────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  ${W} .sf-wradial__hub, ${W} .sf-wradial__face { transition:none; }
}
html.sf-reduce-motion ${W} .sf-wradial__hub,
html.sf-reduce-motion ${W} .sf-wradial__face { transition:none; }
`;

export function injectFlightRadialsLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
