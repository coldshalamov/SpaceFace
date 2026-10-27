// src/ui/orrery/power-railLayouts.js — the ORRERY composition for the Power Rail (build_map §11.12;
// design/frontend/ORRERY.md §6 Flight: the ordnance crescent of the flight Cluster).
//
// The rail's MODEL lives in src/ui/powerRail.js (the rank, the slot states, the one tip bank); its
// renderer is the Cluster (src/ui/orrery/flightCluster.js). This sheet carries the rail's own
// presentation law where the shared renderer leaves it open:
//
//   1. Rest light is warm bone (ORRERY §3.3). The per-power tints the Cluster's sheet paints on the
//      five marks at rest (pull amber, shove red, pin blue, bomb orange, line cyan — hudAdapter
//      GROUP_POWER, citing design/expansion/05_ASSET_ROSTER.md §7.2) collide with the colour law:
//      red is threat only, ice is data in motion only, and amber leads only as the Hand. The marks
//      already differ by shape (the kit glyph) and word (the name + key label) — the non-colour
//      channel the rubric requires — so the tints bought identification at the price of the law.
//      They are retired HERE at rest; armed and live keys keep their amber (the Hand family), and
//      cooling / locked / empty keys read as dimmed bone, never coloured.
//   2. Hover, focus-visible and press are authored for every socket (P4/P6): the ring warms to the
//      bright bone, its bloom twin deepens (geometry, never a filter), the mark lifts, the label
//      comes to full ink; keyboard focus draws the 2 px bone bracket round the socket; press
//      presses the socket. Transforms and opacity only — the flight-HUD budget (ORRERY §6 hard
//      rule) allows nothing else to animate.
//   3. Reduced motion reaches every state instantly: transitions die under html.sf-reduce-motion
//      (flightCluster already stops the rail's keyframes there; this sheet's transitions join it).
//
// WIRING: the rail has no mount of its own to call an inject() from — every consumer reaches the
// rail through the model — so powerRail.js imports this sheet and injects it once at module load
// (headless-safe: no document, no work). The Cluster's sheet is injected later, at
// createFlightCluster, so every rule here is written at a HIGHER SPECIFICITY than the rule it
// refines and never leans on cascade order. Scoped to the rail's own classes; nothing here reaches
// the ring stack, the Speed Dial, the Hand or any other instrument.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'orr-power-rail-layouts';

// The one rest-state mark rule: bone ink for every power, except where a state already speaks
// (armed/live amber). (0,6,0) against the Cluster tint rules' (0,3,0) — wins wherever both match,
// and does not match the state rules it must not beat.
const REST_MARK = '.orr-cluster .orr-cluster__key[data-power]:not(.is-armed):not(.is-live) .orr-cluster__icon';
// A socket answers the cursor only while its verb could fire: cooling, locked and empty sockets
// keep their dim authored states under the pointer.
const ANSWERING = '.orr-cluster .orr-cluster__key:hover:not(.is-cooldown):not(.is-locked):not(.is-empty)';
const ANSWERING_NODE = '.orr-cluster .orr-cluster__key.is-node:hover:not(.is-cooldown):not(.is-locked):not(.is-empty)';

const CSS = `
/* ---- 1. rest light: warm bone, the law of the instrument ---------------------------------------- */
${REST_MARK} { color:var(--dp-ink, #e8e2d4); }
/* collapsed nodes keep their quieter mark (flightCluster sets .66); the unfolded key is full */
.orr-cluster .orr-cluster__key.is-node[data-power]:not(.is-armed):not(.is-live) .orr-cluster__icon { opacity:.66; }

/* ---- 2. the socket answers ---------------------------------------------------------------------- */
/* hover: the ring warms one step of bone, its bloom twin deepens — light rising, never a glow
   filter (P9: bloom is geometry) */
.orr-cluster .orr-cluster__key:hover svg circle.orr-rest { stroke:var(--dp-line-hi, #f4efe2); }
.orr-cluster .orr-cluster__key:hover svg circle.orr-bloom { opacity:.34; }
.orr-cluster .orr-cluster__key:hover .orr-cluster__keytag { color:var(--dp-ink, #e8e2d4); }
${ANSWERING} .orr-cluster__icon { opacity:1; }
${ANSWERING_NODE} .orr-cluster__icon { opacity:.88; }
/* the mark lifts on opacity only; colour snaps (no paint transition on the flight floor) */
.orr-cluster .orr-cluster__icon { transition:opacity .14s var(--dp-ease-out, ease-out); }

/* keyboard focus: the 2 px bone bracket round the socket, the label at full ink, the key word
   phos-bright — the same seat that raises the tier-2 why reveal in the live game */
.orr-cluster .orr-cluster__key:focus { outline:none; }
.orr-cluster .orr-cluster__key:focus-visible { outline:none; }
.orr-cluster .orr-cluster__key:focus-visible svg circle.orr-rest { stroke:var(--dp-ink, #e8e2d4); stroke-width:2; }
.orr-cluster .orr-cluster__key:focus-visible svg circle.orr-bloom { opacity:.42; }
.orr-cluster .orr-cluster__key:focus-visible .orr-cluster__keytag { color:var(--dp-ink, #e8e2d4); }
.orr-cluster .orr-cluster__key:focus-visible .orr-cluster__keytag b { color:var(--dp-phos, #dfeeff); }

/* press: the socket presses (transform only, on the snap-short beat) */
.orr-cluster .orr-cluster__key svg { transform-origin:center; transition:transform .13s var(--dp-ease-out, ease-out); }
.orr-cluster .orr-cluster__key:active svg { transform:scale(.93); }

/* ---- 3. the collapsed rung reads one step under the chosen key ----------------------------------- */
/* nodes sat at .92 — brighter than the unfolded key's .88, inverting the rail's hierarchy */
.orr-cluster .orr-cluster__key.is-node .orr-cluster__keytag { color:color-mix(in srgb, var(--dp-ink, #e8e2d4) 78%, transparent); }
.orr-cluster .orr-cluster__key.is-node:hover .orr-cluster__keytag,
.orr-cluster .orr-cluster__key.is-node:focus-visible .orr-cluster__keytag { color:color-mix(in srgb, var(--dp-ink, #e8e2d4) 95%, transparent); }
.orr-cluster .orr-cluster__key.is-node .orr-cluster__keytag b { color:color-mix(in srgb, var(--dp-ink, #e8e2d4) 82%, transparent); }

/* ---- reduced motion: every state arrives instantly ---------------------------------------------- */
html.sf-reduce-motion .orr-cluster .orr-cluster__icon,
html.sf-reduce-motion .orr-cluster .orr-cluster__key svg { transition:none !important; }
`;

export function injectPowerRailLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
