// drillLayouts — the Asteroid Works screen's ORRERY composition home (src/ui/AGENTS.md:
// screen composition lives in src/ui/orrery/*Layouts.js). Carries what styles/asteroid-ops.css
// cannot style because it mounts OUTSIDE .ast-screen: the industry planner's dialog and its
// bottom-left Plan key attach to document.body, where the screen's custom properties and sheet
// do not reach. One injected, idempotent sheet, painted in the screen's own instrument voice:
// glass slips with a bone crown line (never a border), hairline row rules, bone focus brackets,
// sentence case, and one amber verb. Values reuse the screen's literal families
// (glass rgb(8 11 16 / x), bone rgb(236 230 216 / x)) and the shared --dp-* tokens; hot hover
// names --orr-bone-hot with the literal as fallback (this sheet mounts outside .ast-screen).
export const DRILL_LAYOUTS_STYLE_ID = 'sf-drill-layouts-style';

const DRILL_LAYOUTS_CSS = `
#aw-plan-key {
  position: absolute; left: 12px; bottom: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 64px; min-height: 40px; padding: 0 16px;
  box-sizing: border-box;
  background-color: rgb(8 11 16 / .88);
  background-image: linear-gradient(180deg, rgb(236 230 216 / .5) 0 2px, transparent 2px);
  background-size: 100% 100%; background-repeat: no-repeat;
  color: var(--dp-ink, #e8e2d4);
  font: 600 12px/1 "Instrument Sans", system-ui, sans-serif;
  letter-spacing: 0.02em; text-transform: none;
  box-shadow: 0 4px 14px rgb(0 0 0 / .5);
  cursor: pointer; pointer-events: auto;
  transition: background-color 120ms var(--dp-ease-out, ease-out), color 120ms var(--dp-ease-out, ease-out);
}
/* Bone-hot names --orr-bone-hot (styles/asteroid-ops.css); the literal is the fallback because
   this key mounts on document.body, outside the .ast-screen scope that declares it. */
#aw-plan-key:hover { background-color: rgb(16 21 29 / .92); color: var(--orr-bone-hot, #fffdf6); }
#aw-plan-key:active { background-color: rgb(8 11 16 / .88); color: #b7b4a6; }
#aw-plan-key:focus-visible { outline: 2px solid #ece6d8; outline-offset: 2px; }

#aw-industry-planner {
  box-sizing: border-box;
  width: min(580px, calc(100vw - 24px));
  max-height: calc(100dvh - 32px);
  padding: 22px 26px 24px;
  overflow: auto;
  color-scheme: dark;
  background-color: rgb(6 8 12 / .92);
  background-image: linear-gradient(180deg, rgb(236 230 216 / .5) 0 2px, transparent 2px);
  background-size: 100% 100%; background-repeat: no-repeat;
  color: var(--dp-ink-dim, #b7b4a6);
  border: 0;
  box-shadow: 0 24px 70px rgb(0 0 0 / .6);
  font: 400 14px/1.5 "Instrument Sans", system-ui, sans-serif;
  text-transform: none;
}
#aw-industry-planner::backdrop { background: rgb(5 7 10 / .55); }
#aw-industry-planner[open] { animation: aw-plan-in 180ms var(--dp-ease-out, ease-out) both; }
@keyframes aw-plan-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.aw-plan-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.aw-plan-title {
  margin: 0 0 12px;
  font-family: "Archivo", "Instrument Sans", system-ui, sans-serif;
  font-weight: 800; font-stretch: 125%; font-size: 22px; line-height: 1.15;
  letter-spacing: -0.01em; text-transform: none;
  color: #ece6d8;
}
.aw-plan-dismiss {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 44px; min-height: 44px;
  background: none; border: 0;
  color: #b7b4a6;
  font: 400 18px/1 "Instrument Sans", system-ui, sans-serif;
  cursor: pointer;
  transition: color 120ms var(--dp-ease-out, ease-out);
}
.aw-plan-dismiss:hover { color: #ece6d8; }
.aw-plan-dismiss:focus-visible { outline: 2px solid #ece6d8; outline-offset: 2px; }

.aw-plan-intro { margin: 0 0 14px; color: #b7b4a6; }
.aw-plan-controls { display: grid; grid-template-columns: minmax(0, 1fr) 88px; gap: 12px; }
.aw-plan-field {
  display: block;
  font: 600 12px/1.2 "Archivo", "Instrument Sans", system-ui, sans-serif;
  font-stretch: 112%; letter-spacing: 0.02em; text-transform: none;
  color: #b7b4a6;
}
.aw-plan-input {
  display: block; width: 100%; box-sizing: border-box;
  min-height: 44px; margin-top: 6px; padding: 0 10px;
  font: 500 13px/1.2 "Instrument Sans", system-ui, sans-serif;
  background: rgb(236 230 216 / .06);
  color: #ece6d8;
  border: 0; border-radius: 0;
}
.aw-plan-input:focus-visible { outline: 2px solid #ece6d8; outline-offset: 1px; background: rgb(236 230 216 / .12); }
.aw-plan-input:disabled { color: rgb(236 230 216 / .38); background: transparent; }
.aw-plan-input option { background: #0c0a08; color: #ece6d8; }

.aw-plan-subtitle {
  margin: 14px 0 4px;
  font: 600 12px/1.3 "Archivo", "Instrument Sans", system-ui, sans-serif;
  font-stretch: 112%; letter-spacing: 0.02em; text-transform: none;
  color: #ece6d8;
}
.aw-plan-list { margin: 8px 0; padding: 0; }
.aw-plan-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px;
  padding: 7px 0;
  background-image: linear-gradient(180deg, rgb(236 230 216 / .14) 1px, transparent 0);
  background-repeat: repeat-x; background-position: top left;
}
.aw-plan-row:first-child { background-image: none; }
.aw-plan-row dt { overflow-wrap: anywhere; }
.aw-plan-row dd {
  margin: 0;
  font: 500 13px/1.4 "Spline Sans Mono", ui-monospace, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: #ece6d8;
}
.aw-plan-steps { margin: 10px 0; padding-left: 20px; line-height: 1.55; }
.aw-plan-steps li { margin: 10px 0; color: #b7b4a6; }
.aw-plan-steps strong { color: #ece6d8; font-weight: 600; }
.aw-plan-note { line-height: 1.5; color: #b7b4a6; }
.aw-plan-details { margin: 10px 0 0; }
.aw-plan-summary {
  display: flex; align-items: center; gap: 8px;
  min-height: 44px; cursor: pointer;
  font: 600 12px/1.2 "Archivo", "Instrument Sans", system-ui, sans-serif;
  font-stretch: 112%; letter-spacing: 0.02em; text-transform: none;
  color: #b7b4a6;
  transition: color 120ms var(--dp-ease-out, ease-out);
}
.aw-plan-summary:hover { color: #ece6d8; }
.aw-plan-summary:focus-visible { outline: 2px solid #ece6d8; outline-offset: 2px; }
.aw-plan-summary::marker { color: #b7b4a6; }
.aw-plan-details[open] > .aw-plan-summary { color: #ece6d8; }

.aw-plan-done {
  display: inline-flex; align-items: center; justify-content: center;
  width: 100%; min-height: 44px; margin-top: 14px;
  box-sizing: border-box;
  background: var(--dp-hand, #f2b950);
  color: #1a1206;
  font: 700 15px/1 "Archivo", "Instrument Sans", system-ui, sans-serif;
  font-stretch: 118%; letter-spacing: 0.02em; text-transform: none;
  border: 0;
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
  cursor: pointer;
  transition: background-color 120ms var(--dp-ease-out, ease-out);
}
.aw-plan-done:hover { background: var(--dp-hand-hot, #ffd98c); }
.aw-plan-done:active { background: #e0a33e; }
.aw-plan-done:focus-visible { outline: 2px solid #ece6d8; outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  #aw-industry-planner[open] { animation: none; }
  #aw-plan-key, .aw-plan-dismiss, .aw-plan-summary, .aw-plan-done { transition: none; }
}
html.sf-reduce-motion #aw-industry-planner[open] { animation: none; }
html.sf-reduce-motion #aw-plan-key,
html.sf-reduce-motion .aw-plan-dismiss,
html.sf-reduce-motion .aw-plan-summary,
html.sf-reduce-motion .aw-plan-done { transition: none; }
`;

/** Idempotent: the planner may be created once per screen mount; the sheet lands once per doc. */
export function injectDrillLayouts(doc) {
  if (!doc || doc.getElementById(DRILL_LAYOUTS_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = DRILL_LAYOUTS_STYLE_ID;
  el.textContent = DRILL_LAYOUTS_CSS;
  doc.head.appendChild(el);
}
