// ORRERY composition for the Crucible lab rack (design/frontend/ORRERY.md §6, Crucible).
//
// The lab rack is one instrument rendered in two hosts: the Sandbox screen's Combat Lab panel
// (src/ui/screens/sandbox.js) and the practice-room rack over live flight (`.sf-lab-flight`,
// mounted by crucibleLabControls.js). The rows themselves are kit rows (styles/kit.css); this
// module owns the lab's own `sf-lab-*` presentation — the live speed reading, the telemetry
// block, and the flight glass — so the hooks stop being dead classes without touching the
// shared sheet. Rest light is warm bone; the one cold note is the reading itself (--dp-phos);
// no backdrop-filter (the flight host sits over a live world); corner ticks, never a border.
import { injectOrrery } from './tokens.js';

export const CRUCIBLE_LAB_STYLE_ID = 'sf-orrery-crucible-lab-layouts';

const CSS = `
/* The rack's rows: when a host's label styling wraps a wide word row (caps, tracked), the
   concept name holds the FIRST word line, not a centred orphan between two lines, and a wrapped
   line sits one text-line away from its predecessors — the 48px word gap is for the horizontal
   axis only. */
.sf-lab-runtime .k-row { align-items: start; }
.sf-lab-runtime .k-words--row { row-gap: calc(6px * var(--k-s, 1)); }

/* The live speed reading: a scale tick sets it off from the choice words — it is a reading,
   not a sixth word. Tabular figures hold the lane while the scale changes; the reading is the
   one cold note on the rack (--dp-phos); the role is said in words (aria-label), never in hue. */
.sf-lab-speed-now {
  padding-left: calc(14px * var(--k-s, 1));
  border-left: 2px solid var(--k-hair);
  font-variant-numeric: tabular-nums;
  color: var(--dp-phos);
  align-self: center;
}

/* The telemetry block: air between the rack and the readings; figures are tabular, and the
   live tick — the one figure that always moves — reads brighter than the sampled rows. */
.sf-lab-tel { margin-top: calc(18px * var(--k-s, 1)); }
.sf-lab-tel-row .sf-lab-tel-tick { color: var(--k-text-live); }
.sf-lab-tel-row .sf-lab-tel-v, .sf-lab-tel-row .sf-lab-tel-tick { font-variant-numeric: tabular-nums; }

/* The practice-room rack over live flight: glass tint only — never a blur (flight floor),
   never a border. Its edges are two corner ticks, the sanctioned glass edge. */
.sf-lab-flight {
  background: var(--dp-glass);
  padding: calc(10px * var(--k-s, 1)) calc(14px * var(--k-s, 1));
}
.sf-lab-flight::before, .sf-lab-flight::after {
  content: ""; position: absolute; width: 14px; height: 14px; pointer-events: none;
}
.sf-lab-flight::before {
  left: 0; top: 0;
  border-left: 2px solid color-mix(in srgb, var(--k-bone) 55%, transparent);
  border-top: 2px solid color-mix(in srgb, var(--k-bone) 55%, transparent);
}
.sf-lab-flight::after {
  right: 0; bottom: 0;
  border-right: 2px solid color-mix(in srgb, var(--k-bone) 55%, transparent);
  border-bottom: 2px solid color-mix(in srgb, var(--k-bone) 55%, transparent);
}
`;

/** Idempotent: one style element per document; safe under the tests' fake documents. */
export function injectCrucibleLabLayouts(doc = globalThis.document) {
  if (!doc || typeof doc.createElement !== 'function') return;
  if (!doc.head || typeof doc.head.appendChild !== 'function') return;
  if (typeof doc.getElementById === 'function' && doc.getElementById(CRUCIBLE_LAB_STYLE_ID)) return;
  // The lab composes the ORRERY token layer (--dp-glass, --dp-phos); inject it first where the
  // host screen has not already (the injection itself is idempotent and head-guarded).
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = CRUCIBLE_LAB_STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
