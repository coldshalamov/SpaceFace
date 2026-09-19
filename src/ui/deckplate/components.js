// Deckplate components — the five (plus one) opinionated instruments every screen assembles.
// Hand-rolled one-off panels are forbidden downstream: a screen that needs a gauge, a target
// bracket, a contact row, an annunciator or an equipment socket mounts THESE.
//
// Every component is a CSS contract on a small DOM shape; the flight HUD maps its existing
// contract classes (sf-*) onto these, so frame-writer JS and tests keep their seams. State is
// carried by data-* attributes and modifier classes — never by inline style decisions.
//
// Motion law: instruments REACT. Needles settle (long soft tail), brackets breathe at idle and
// snap when they latch, annunciators escalate (lamp beats, then holds) and degrade (lamp dims).
// Reduced motion swaps every oscillation for a steady lamp + a word; state is never motion-only.

export const DECKPLATE_COMPONENTS_CSS = `
/* ══ 1. dp-gauge — the dial/rail instrument: machined plate, etched legend, lamp-lit reading,
   recessed channel the fill travels in, machined cursor index. */
.dp-gauge { position:relative; overflow:hidden; }
.dp-gauge .dp-gauge__legend { position:absolute; left:var(--dp-pad); top:calc(var(--dp-u) * 2); }
.dp-gauge .dp-gauge__reading { position:absolute; right:var(--dp-pad); top:calc(var(--dp-u) * 2); }
.dp-gauge .dp-gauge__ticks {
  position:absolute; inset:0; pointer-events:none; opacity:.9;
  background-image:repeating-linear-gradient(90deg,
    rgb(255 232 190 / .30) 0 1px, transparent 1px calc(100% / 12));
  -webkit-mask-image:linear-gradient(180deg, transparent 0 30%, #000 30% 100%);
  mask-image:linear-gradient(180deg, transparent 0 30%, #000 30% 100%);
}
.dp-gauge .dp-gauge__fill {
  position:absolute; inset:0; transform-origin:left center; transform:scaleX(0);
  background:linear-gradient(180deg, var(--dp-lamp-hot) 0%, var(--dp-lamp) 46%, var(--dp-lamp-dim) 100%);
  box-shadow:0 0 8px var(--dp-lamp-bloom), inset 0 1px 0 rgb(255 255 255 / .28);
}
.dp-gauge .dp-gauge__cursor { position:absolute; inset:0; pointer-events:none; }
.dp-gauge .dp-gauge__runout { color:var(--dp-lamp); }

/* ══ 2. dp-bracket — the target bracket: four machined corner arms. Idle they BREATHE (the
   sensor is alive); on latch they SNAP (one overshoot, then still — a mechanical event). */
.dp-bracket { --dp-bracket-arm:12px; --dp-bracket-c:var(--dp-lamp); }
@keyframes dp-bracket-breathe {
  0%, 100% { opacity:.62; transform:scale(1); }
  50% { opacity:1; transform:scale(1.035); }
}
@keyframes dp-bracket-snap {
  0% { transform:scale(1.22); opacity:.7; }
  55% { transform:scale(.97); opacity:1; }
  100% { transform:scale(1); opacity:1; }
}
.dp-bracket--idle { animation:dp-bracket-breathe var(--dp-d-breathe) var(--dp-ease-lamp) infinite; }
.dp-bracket--snap { animation:dp-bracket-snap 240ms var(--dp-ease-snap) 1; }

/* ══ 3. dp-contact — the roster row: lamp bead (IFF), name as a reading, state etched. The row
   is a printed line on the plate; hover wakes its lamp. */
.dp-contact { position:relative; }
.dp-contact .dp-contact__lamp {
  width:7px; height:7px; border-radius:50%; flex:0 0 auto;
  transition:box-shadow var(--dp-d-settle) var(--dp-ease-lamp), background var(--dp-d-settle) var(--dp-ease-lamp);
}
.dp-contact:hover .dp-contact__lamp, .dp-contact:focus-visible .dp-contact__lamp {
  box-shadow:0 0 8px currentColor, 0 0 2px currentColor;
}

/* ══ 4. dp-annunc — the annunciator (alert): machined strip, lamp lens, etched word. ESCALATE:
   on raise the lamp beats (twice fast for a warning; a hard repeating blink for danger) then
   HOLDS lit. DEGRADE: clearing dims the lens rather than vanishing the strip. A persistent
   status (dock prompt) never blinks: it is a lit control, not an alarm. */
@keyframes dp-lamp-raise {
  0% { opacity:0; } 12% { opacity:1; } 26% { opacity:.25; }
  40% { opacity:1; } 54% { opacity:.35; } 70%, 100% { opacity:1; }
}
@keyframes dp-lamp-danger {
  0%, 54% { opacity:1; } 60%, 74% { opacity:.28; } 80%, 100% { opacity:1; }
}
@keyframes dp-annunc-in {
  0% { transform:translateY(-6px) scale(.985); opacity:0; }
  60% { transform:translateY(0) scale(1.004); opacity:1; }
  100% { transform:translateY(0) scale(1); opacity:1; }
}
.dp-annunc {
  display:inline-flex; align-items:center; gap:calc(var(--dp-u) * 2.5);
  padding:calc(var(--dp-u) * 1.75) calc(var(--dp-u) * 3.5);
  animation:dp-annunc-in var(--dp-d-settle) var(--dp-ease-settle) 1;
}
.dp-annunc .dp-annunc__lens {
  width:8px; height:8px; border-radius:50%; flex:0 0 auto;
  animation:dp-lamp-raise var(--dp-d-escalate) steps(1, end) 1;
}
.dp-annunc--danger .dp-annunc__lens { animation:dp-lamp-raise var(--dp-d-escalate) steps(1, end) 1, dp-lamp-danger 1.15s steps(1, end) var(--dp-d-escalate) infinite; }
.dp-annunc--status .dp-annunc__lens { animation:none; }

/* ══ 5. dp-socket — the equipment recess: a bay cut into the rail plate; recess shadow, verb
   mark seated in it, etched key numeral, lamp strip on the bay floor carrying state. */
.dp-socket {
  position:relative; display:grid; place-items:center;
  background:
    radial-gradient(120% 90% at 50% 0%, rgb(255 232 190 / .05), transparent 55%),
    linear-gradient(180deg, rgb(0 0 0 / .62), rgb(0 0 0 / .22) 58%, rgb(255 255 255 / .028));
  box-shadow:
    inset 0 2px 5px rgb(0 0 0 / .78),
    inset 0 -1px 0 rgb(255 232 190 / .10),
    inset 1px 0 0 rgb(0 0 0 / .4),
    inset -1px 0 0 rgb(0 0 0 / .4);
  border-radius:var(--dp-r-instrument);
}
.dp-socket .dp-socket__lamp {
  position:absolute; left:12%; right:12%; bottom:7%; height:2px; border-radius:1px;
  background:var(--dp-metal-4);
  transition:background var(--dp-d-settle) var(--dp-ease-lamp), box-shadow var(--dp-d-settle) var(--dp-ease-lamp);
}
.dp-socket[data-state="armed"] .dp-socket__lamp,
.dp-socket--armed .dp-socket__lamp {
  background:var(--dp-lamp);
  box-shadow:0 0 7px var(--dp-lamp-bloom), 0 0 2px var(--dp-lamp-hot);
}
.dp-socket[data-state="cooling"] .dp-socket__lamp { background:var(--dp-lamp-dim); box-shadow:none; }

/* ══ 6. dp-vital — the segmented channel: a channel cut in the plate; segments are lamp wells.
   Lit wells glow from inside the cut; unlit wells are bare metal. */
.dp-vital { position:relative; display:flex; gap:2px; padding:3px; }
.dp-vital .dp-vital__seg {
  flex:1 1 0; min-width:0; height:9px; border-radius:1px;
  background:linear-gradient(180deg, var(--dp-metal-0), var(--dp-metal-1));
  box-shadow:inset 0 1px 1px rgb(0 0 0 / .6);
}
.dp-vital .dp-vital__seg.is-on {
  background:linear-gradient(180deg, var(--dp-lamp-hot) 0%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%);
  box-shadow:0 0 6px var(--dp-lamp-bloom), inset 0 1px 0 rgb(255 255 255 / .3);
}
.dp-vital .dp-vital__seg.is-hot {
  background:linear-gradient(180deg, var(--dp-danger-hot) 0%, var(--dp-danger) 55%, #a8241a 100%);
  box-shadow:0 0 6px var(--dp-danger-bloom), inset 0 1px 0 rgb(255 255 255 / .26);
}
.dp-vital .dp-vital__seg.is-cold { background:linear-gradient(180deg, #efe6d2, #b9ae97); box-shadow:none; }

/* ══ Reduced motion: the machine holds still; every state survives as lamp + word ════════════ */
@media (prefers-reduced-motion:reduce) {
  .dp-bracket--idle, .dp-bracket--snap,
  .dp-annunc, .dp-annunc .dp-annunc__lens, .dp-annunc--danger .dp-annunc__lens { animation:none !important; }
  .dp-annunc--danger .dp-annunc__lens { background:var(--dp-danger); box-shadow:0 0 7px var(--dp-danger-bloom); }
}
html.sf-reduce-motion .dp-bracket--idle, html.sf-reduce-motion .dp-bracket--snap,
html.sf-reduce-motion .dp-annunc, html.sf-reduce-motion .dp-annunc .dp-annunc__lens,
html.sf-reduce-flash .dp-annunc .dp-annunc__lens, html.sf-reduce-flash .dp-annunc--danger .dp-annunc__lens {
  animation:none !important;
}
html.sf-reduce-flash .dp-annunc--danger .dp-annunc__lens { background:var(--dp-danger); }
`;

/* Forced colours: components restate to the system palette (materials.js already flattened). */
export const DECKPLATE_COMPONENTS_FORCED_CSS = `
@media (forced-colors:active) {
  .dp-annunc { border:1px solid CanvasText; }
  .dp-annunc .dp-annunc__lens { background:CanvasText; }
  .dp-annunc--danger .dp-annunc__lens { background:Mark; }
  .dp-socket { border:1px solid CanvasText; }
  .dp-socket .dp-socket__lamp { background:CanvasText; }
  .dp-vital .dp-vital__seg { background:Canvas; box-shadow:inset 0 0 0 1px GrayText; }
  .dp-vital .dp-vital__seg.is-on { background:Highlight; }
  .dp-gauge .dp-gauge__fill { background:Highlight; box-shadow:none; }
  .dp-gauge .dp-gauge__ticks { display:none; }
}
`;
