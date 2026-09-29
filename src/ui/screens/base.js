// Base screen (V2 §6 / M3). The base-management view for a claimed body — shows the body's module
// slots, lets the player build modules (depot/refinery/teleporter/defense), and fire the
// teleporter. Reuses the screen-modal pattern (like station hub). Entry: pushed from the claim/base
// binding near an already-claimed body (input.js sets state.ui.pendingClaimBodyId first).
import {
  BODY_MODULES,
  BODY_MODULE_BY_ID,
  BODY_SLOTS_BY_SIZE,
  BODY_SPECIALIZATIONS,
  BODY_SPECIALIZATION_BY_ID,
  CLAIMABLE_BODY_SITES,
} from '../../data/claimableBodies.js';
import { TECH_NODES } from '../../data/tech.js';
import { escapeHtml } from '../comms.js';
import { icon } from '../station/icons.js';
import { BINDINGS } from '../bindings.js';
import { confirm, isConfirmOpen } from '../confirm.js';
import { dressLampKey } from '../orrery/lampKey.js';

const STYLE_ID = 'sf-base-style';
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const BASE_BUILD_PRIORITY = ['mod_depot', 'mod_refinery', 'mod_sensor_post', 'mod_throughline_sling', 'mod_defense', 'mod_teleporter'];

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
/* ORRERY Base instrument (Wave 3 Surface 2): the claim registry as a terminal of light.
   The menu plate and the deckplate pass underneath dissolve here into borderless Glass; every
   rule is scoped #screens .orr-base so it outranks both without touching them. Law: ONE amber
   Hand + ONE amber Lamp Key per screen; bone rest rgb(236 230 216); red for threat only. */
#screens .screen.sf-menu.orr-base.orr-base {
  --orr-bone:236 230 216;
  --orr-ink:var(--dp-ink, #e8e2d4);
  --orr-dim:var(--dp-ink-dim, #b7b4a6);
  --orr-mute:var(--dp-ink-mute, #8f8c80);
  --orr-hand:var(--dp-hand, var(--dp-lamp, #f2b950));
  --orr-danger:var(--dp-danger, #ff5038);
  --dp-glass:rgb(22 29 40 / .66);
  background:
    linear-gradient(to bottom, rgb(var(--orr-bone) / .07), rgb(var(--orr-bone) / 0) 24%),
    var(--dp-glass);
  -webkit-backdrop-filter:blur(18px) saturate(1.15);
  backdrop-filter:blur(18px) saturate(1.15);
  border:0; border-radius:0; box-shadow:none;
  padding:0; min-width:0; max-width:min(94vw, 1120px);
  overflow:hidden; isolation:isolate; z-index:101;
  -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%), linear-gradient(to right, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
  -webkit-mask-composite:source-in;
  mask-image:linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%), linear-gradient(to right, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
  mask-composite:intersect;
}
#screens .screen.sf-menu.orr-base.orr-base.is-empty {
  align-self:flex-end; width:min(92vw, 880px); margin:0 auto 6vh;
  animation:orr-base-unfold 420ms cubic-bezier(.16, 1, .3, 1) both;
}
#screens .screen.sf-menu.orr-base.orr-base.is-claimed {
  width:min(94vw, 1120px); max-height:90vh;
  animation:orr-base-unfold 420ms cubic-bezier(.16, 1, .3, 1) both;
}
@keyframes orr-base-unfold {
  from { opacity:0; transform:translateY(10px); }
  to { opacity:1; transform:none; }
}
html.sf-reduce-motion #screens .screen.sf-menu.orr-base.orr-base.is-empty,
html.sf-reduce-motion #screens .screen.sf-menu.orr-base.orr-base.is-claimed { animation:none; }
#screens .screen.sf-menu.orr-base.orr-base::before {
  content:""; display:block; position:absolute; inset:36px; z-index:2; pointer-events:none;
  background:
    linear-gradient(to right, rgb(var(--orr-bone) / .46) 20px, transparent 20px) left top / 20px 1.5px,
    linear-gradient(to bottom, rgb(var(--orr-bone) / .46) 20px, transparent 20px) left top / 1.5px 20px,
    linear-gradient(to left, rgb(var(--orr-bone) / .46) 20px, transparent 20px) right top / 20px 1.5px,
    linear-gradient(to bottom, rgb(var(--orr-bone) / .46) 20px, transparent 20px) right top / 1.5px 20px,
    linear-gradient(to right, rgb(var(--orr-bone) / .46) 20px, transparent 20px) left bottom / 20px 1.5px,
    linear-gradient(to top, rgb(var(--orr-bone) / .46) 20px, transparent 20px) left bottom / 1.5px 20px,
    linear-gradient(to left, rgb(var(--orr-bone) / .46) 20px, transparent 20px) right bottom / 20px 1.5px,
    linear-gradient(to top, rgb(var(--orr-bone) / .46) 20px, transparent 20px) right bottom / 1.5px 20px;
  background-repeat:no-repeat;
}
#screens .screen.sf-menu.orr-base.orr-base > canvas.orr-base__lattice {
  position:absolute; inset:0; width:100%; height:100%; z-index:0; pointer-events:none;
}
#screens .orr-base #sf-base {
  --k-signal: var(--dp-lamp);
  position:relative; z-index:1;
  display:flex; flex-direction:column; gap:14px;
  padding:52px 56px 48px; min-width:0; min-height:0;
  overflow-y:auto; overscroll-behavior:contain; pointer-events:auto;
  scrollbar-width:thin; scrollbar-color:rgb(var(--orr-bone) / .22) transparent;
  color:var(--orr-ink);
}
#screens .orr-base #sf-base .base-title {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:22px; font-weight:800; font-stretch:100%;
  letter-spacing:.02em; line-height:1.2; text-transform:none;
  color:var(--orr-dim); margin:0; padding:0;
}
#screens .orr-base.is-claimed #sf-base .base-title {
  font-size:clamp(26px, min(3vw, 4.5vh), 38px); font-weight:800; font-stretch:125%;
  font-variation-settings:"wght" 800, "wdth" 125;
  letter-spacing:.01em; line-height:1.05; color:var(--orr-ink);
}
#screens .orr-base #sf-base .base-sub {
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:14px; line-height:1.45; color:var(--orr-ink); margin:0; padding:0;
}
#screens .orr-base #sf-base .base-sub + .base-sub { color:var(--orr-dim); }
#screens .orr-base #sf-base .base-foot { display:flex; align-items:center; gap:20px; justify-content:flex-end; margin:24px 0 0; padding:0; }
#screens .orr-base #sf-base .base-foot .orr-base__chartkey { margin-right:auto; }
#screens .orr-base #sf-base .orr-base__esc, #screens .orr-base #sf-base .orr-base__key {
  display:inline-flex; align-items:center; justify-content:center;
  min-width:30px; padding:4px 10px;
  border:1px solid rgb(var(--orr-bone) / .55);
  clip-path:polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-weight:600; letter-spacing:.12em; text-transform:uppercase;
  color:rgb(var(--orr-bone) / .8); white-space:nowrap;
}
#screens .orr-base #sf-base .orr-base__esc::before, #screens .orr-base #sf-base .orr-base__key::before { display:none; }
#screens .orr-base #sf-base .k-word.orr-base__chip:disabled {
  color:rgb(var(--orr-bone) / .78);
  border:1px solid rgb(var(--orr-bone) / .5);
  clip-path:polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
  padding:5px 12px; opacity:1;
}
#screens .orr-base #sf-base .k-word.orr-base__chip:disabled::after { display:none; }
#screens .orr-base #sf-base .orr-base__chartkey .orr-base__key { margin-left:10px; }
#screens .orr-base #sf-base .orr-lampkey.orr-base__lamp {
  min-width:180px; min-height:52px !important; justify-content:center;
}
#screens .orr-base #sf-base .k-word {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:14px; font-weight:600; letter-spacing:.12em; text-transform:uppercase;
  color:rgb(var(--orr-bone) / .85); padding:8px 2px; width:auto;
  translate:none; box-shadow:none; filter:none; text-align:left;
}
#screens .orr-base #sf-base .k-word::after {
  background:rgb(var(--orr-bone) / .5); height:1.5px; width:100%;
  transform:scaleX(0); transform-origin:left center; transition:transform .16s linear;
}
#screens .orr-base #sf-base .k-word:hover, #screens .orr-base #sf-base .k-word:focus-visible, #screens .orr-base #sf-base .k-word:active { color:rgb(var(--orr-bone)); }
#screens .orr-base #sf-base .k-word:hover::after, #screens .orr-base #sf-base .k-word:focus-visible::after { transform:scaleX(1); }
#screens .orr-base #sf-base .k-word--primary { color:rgb(var(--orr-bone) / .85); }
#screens .orr-base #sf-base .k-word--primary:is(:hover, :focus-visible, :active) { color:rgb(var(--orr-bone)); }
#screens .orr-base #sf-base .k-word:disabled { color:rgb(var(--orr-bone) / .38); opacity:1; }
#screens .orr-base #sf-base .k-word:disabled::after { display:none; }
#screens .orr-base #sf-base .k-word:focus-visible { outline:1.5px solid rgb(var(--orr-bone) / .8); outline-offset:4px; }
#screens .orr-base #sf-base .base-ico { display:inline-flex; align-items:center; margin-right:8px; vertical-align:-2px; }
#screens .orr-base #sf-base .base-ico svg { display:block; }
#screens .orr-base #sf-base .base-plan {
  position:relative; border:0; border-radius:0; box-shadow:none; background:none;
  display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:6px 28px; align-items:center;
  padding:18px 0 18px 26px; margin:8px 0 0;
}
#screens .orr-base #sf-base .base-plan::before {
  content:""; position:absolute; left:0; top:16px; bottom:16px; width:2px;
  background:rgb(var(--orr-bone) / .72); box-shadow:0 0 12px rgb(var(--orr-bone) / .35);
}
#screens .orr-base #sf-base .base-plan .base-plan-k, #screens .orr-base #sf-base .base-ledger > .base-plan-k {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-weight:600; letter-spacing:.16em; text-transform:uppercase;
  color:var(--orr-mute); margin:0;
}
#screens .orr-base #sf-base .base-plan .base-plan-title {
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:17px; font-weight:700; letter-spacing:0; text-transform:none;
  color:var(--orr-ink); margin:0;
}
#screens .orr-base #sf-base .base-plan .base-plan-body {
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:14px; line-height:1.45; color:var(--orr-dim); margin:0;
}
#screens .orr-base #sf-base .base-plan .base-plan-k { grid-column:1; grid-row:1; }
#screens .orr-base #sf-base .base-plan .base-plan-title { grid-column:1; grid-row:2; }
#screens .orr-base #sf-base .base-plan .base-plan-body { grid-column:1; grid-row:3; }
#screens .orr-base #sf-base .base-plan > .k-word { grid-column:2; grid-row:1 / span 3; align-self:center; justify-self:end; white-space:nowrap; }
#screens .orr-base #sf-base .base-plan--ok, #screens .orr-base #sf-base .base-plan--warn, #screens .orr-base #sf-base .base-plan--bad { background:none; border:0; }
#screens .orr-base #sf-base .base-plan--ok .base-plan-k, #screens .orr-base #sf-base .base-plan--warn .base-plan-k, #screens .orr-base #sf-base .base-plan--bad .base-plan-k { color:var(--orr-mute); }
#screens .orr-base #sf-base .base-sec-h {
  display:flex; align-items:center; gap:12px;
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-weight:600; letter-spacing:.2em; text-transform:uppercase;
  color:var(--orr-mute); margin:14px 0 0; padding:0;
}
#screens .orr-base #sf-base .base-sec-h::before { content:""; width:12px; height:1.5px; background:rgb(var(--orr-bone) / .46); flex:none; }
#screens .orr-base #sf-base .base-sec-h::after { content:""; flex:1; height:1px; background:rgb(var(--orr-bone) / .16); }
#screens .orr-base #sf-base .base-slots {
  position:relative; display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:4px 20px;
  border:0; background:none; padding:26px 0 4px; margin:0;
}
#screens .orr-base #sf-base .base-slots::before {
  content:""; position:absolute; left:0; right:0; top:0; height:7px; background:rgb(var(--orr-bone) / .085);
}
#screens .orr-base #sf-base .base-slots::after {
  content:""; position:absolute; left:0; right:0; top:3px; height:1.5px; background:rgb(var(--orr-bone) / .46);
  box-shadow:0 0 8px rgb(var(--orr-bone) / .22);
}
#screens .orr-base #sf-base .base-slot {
  position:relative; border:0; border-radius:0; box-shadow:none; background:none;
  padding:14px 0 0 2px; margin:0; opacity:1; min-width:0;
}
#screens .orr-base #sf-base .base-slot::before {
  content:""; position:absolute; left:9px; top:-22px; width:1.5px; height:22px;
  background:rgb(var(--orr-bone) / .46);
}
#screens .orr-base #sf-base .base-slot::after {
  content:""; position:absolute; left:7.25px; top:-26px; width:5px; height:5px; border-radius:50%;
  background:rgb(248 244 234); box-shadow:0 0 8px rgb(255 240 214 / .5);
}
#screens .orr-base #sf-base .base-slot.empty::after {
  background:transparent; box-shadow:none; box-sizing:border-box;
  border:1.5px solid rgb(var(--orr-bone) / .46);
}
#screens .orr-base #sf-base .base-slot .nm {
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:13px; font-weight:600; letter-spacing:0; text-transform:none;
  color:var(--orr-ink); margin:0 0 4px;
}
#screens .orr-base #sf-base .base-slot .eff {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; letter-spacing:.08em; text-transform:uppercase;
  font-variant-numeric:tabular-nums; color:var(--orr-dim); margin:0;
}
#screens .orr-base #sf-base .base-slot.empty { color:var(--orr-mute); font-size:13px; }
#screens .orr-base #sf-base .base-specializations {
  position:relative; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px 28px;
  border:0; background:none; padding:26px 0 0; margin:0;
}
#screens .orr-base #sf-base .base-specializations::before {
  content:""; position:absolute; left:0; right:0; top:0; height:7px; background:rgb(var(--orr-bone) / .085);
}
#screens .orr-base #sf-base .base-specializations::after {
  content:""; position:absolute; left:0; right:0; top:3px; height:1.5px; background:rgb(var(--orr-bone) / .46);
  box-shadow:0 0 8px rgb(var(--orr-bone) / .22);
}
#screens .orr-base #sf-base .base-spec {
  position:relative; border:0; border-radius:0; box-shadow:none; background:none;
  display:flex; flex-direction:column; gap:7px; align-content:start;
  padding:14px 0 0 12px; margin:0;
}
#screens .orr-base #sf-base .base-spec::before {
  content:""; position:absolute; left:0; top:-22px; width:1.5px; height:22px;
  background:rgb(var(--orr-bone) / .46);
}
#screens .orr-base #sf-base .base-spec:hover::before, #screens .orr-base #sf-base .base-spec:focus-within::before {
  top:-22px; bottom:0; height:auto;
  background:rgb(var(--orr-bone) / .8);
  box-shadow:0 0 8px rgb(var(--orr-bone) / .3);
}
#screens .orr-base #sf-base .base-spec.active::before {
  top:-22px; bottom:0; height:auto;
  background:var(--orr-hand);
  box-shadow:0 0 10px rgb(242 185 80 / .5);
}
#screens .orr-base #sf-base .base-spec::after {
  content:""; position:absolute; left:-2.75px; top:-27px; width:7px; height:7px; border-radius:50%;
  box-sizing:border-box; background:transparent;
  border:1.5px solid rgb(var(--orr-bone) / .46);
  transition:background-color .18s linear, border-color .18s linear, box-shadow .18s linear;
}
#screens .orr-base #sf-base .base-spec:hover::after, #screens .orr-base #sf-base .base-spec:focus-within::after {
  background:rgb(var(--orr-bone)); border-color:rgb(var(--orr-bone));
  box-shadow:0 0 8px rgb(255 240 214 / .5);
}
#screens .orr-base #sf-base .base-spec.active::after {
  background:var(--orr-hand); border-color:var(--orr-hand);
  box-shadow:0 0 10px rgb(242 185 80 / .6);
}
html.sf-reduce-motion #screens .orr-base #sf-base .base-spec::after { transition:none; }
#screens .orr-base #sf-base .base-spec .base-spec-tick {
  position:absolute; left:10px; top:-31px;
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-weight:600; letter-spacing:.08em; color:var(--orr-dim);
}
#screens .orr-base #sf-base .base-spec .nm {
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:15px; font-weight:700; letter-spacing:0; text-transform:none;
  color:var(--orr-ink); margin:0;
}
#screens .orr-base #sf-base .base-spec .verb {
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-weight:700; line-height:1.4; color:var(--orr-ink); margin:0;
}
#screens .orr-base #sf-base .base-spec .effect, #screens .orr-base #sf-base .base-spec .risk {
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:13px; line-height:1.4; color:var(--orr-dim); margin:0;
}
#screens .orr-base #sf-base .base-spec .k-word { align-self:flex-start; margin-top:4px; }
#screens .orr-base #sf-base .base-ledger {
  border:0; border-radius:0; box-shadow:none; background:none;
  display:flex; flex-direction:column; gap:14px; padding:8px 0 0; margin:0;
}
#screens .orr-base #sf-base .base-ledger-hero { display:flex; align-items:baseline; gap:16px; padding:4px 0 2px; margin:0; }
#screens .orr-base #sf-base .base-ledger-heronum {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:84px; font-weight:250; font-stretch:100%; line-height:1; letter-spacing:-.02em;
  font-variant-numeric:tabular-nums; color:rgb(248 244 234); margin:0;
}
#screens .orr-base #sf-base .base-ledger-herok {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-weight:600; letter-spacing:.16em; text-transform:uppercase;
  color:var(--orr-mute); margin:0;
}
#screens .orr-base #sf-base .base-ledger-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px 24px; margin:0; padding:0; }
#screens .orr-base #sf-base .base-ledger-cell { border:0; border-left:0; padding:0; margin:0; }
#screens .orr-base #sf-base .base-ledger-k {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-weight:600; letter-spacing:.16em; text-transform:uppercase;
  color:var(--orr-mute); margin:0;
}
#screens .orr-base #sf-base .base-ledger-v {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:15px; font-weight:500; font-variant-numeric:tabular-nums;
  color:var(--orr-ink); margin:5px 0 0;
}
#screens .orr-base #sf-base .base-ledger-v.is-threat { color:var(--orr-danger); }
#screens .orr-base #sf-base .base-freight { display:flex; gap:8px 28px; flex-wrap:wrap; margin:2px 0 0; padding:0; }
#screens .orr-base #sf-base .base-receipt {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; letter-spacing:.14em; text-transform:uppercase;
  color:rgb(var(--orr-bone) / .8); margin:0;
}
#screens .orr-base #sf-base .base-shop {
  position:relative; display:flex; flex-direction:column; gap:2px;
  border:0; background:none; padding:2px 0 2px 30px; margin:0;
}
#screens .orr-base #sf-base .base-shop::before {
  content:""; position:absolute; left:0; top:12px; bottom:12px; width:7px;
  background:rgb(var(--orr-bone) / .085);
}
#screens .orr-base #sf-base .base-shop::after {
  content:""; position:absolute; left:3px; top:12px; bottom:12px; width:1.5px;
  background:rgb(var(--orr-bone) / .46);
  box-shadow:0 0 8px rgb(var(--orr-bone) / .22);
}
#screens .orr-base #sf-base .base-mod {
  position:relative; border:0; border-radius:0; box-shadow:none; background:none;
  display:grid; grid-template-columns:minmax(0, 1.5fr) minmax(0, 1fr) auto; gap:4px 24px; align-items:center;
  padding:12px 0; margin:0;
}
#screens .orr-base #sf-base .base-mod::before {
  content:""; position:absolute; left:-23px; top:50%; width:16px; height:1.5px; margin-top:-1px;
  background:rgb(var(--orr-bone) / .46);
}
#screens .orr-base #sf-base .base-mod::after {
  content:""; position:absolute; left:-27px; top:50%; width:7px; height:7px; margin-top:-3.5px; border-radius:50%;
  box-sizing:border-box; background:transparent;
  border:1.5px solid rgb(var(--orr-bone) / .46);
}
#screens .orr-base #sf-base .base-mod:hover::after, #screens .orr-base #sf-base .base-mod:focus-within::after {
  background:var(--orr-hand); border-color:var(--orr-hand);
  box-shadow:0 0 10px rgb(242 185 80 / .6);
}
#screens .orr-base #sf-base .base-mod .nm {
  grid-column:1; grid-row:1;
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:15px; font-weight:700; letter-spacing:0; text-transform:none;
  color:var(--orr-ink); margin:0;
}
#screens .orr-base #sf-base .base-mod .desc {
  grid-column:1; grid-row:2;
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:13px; line-height:1.45; color:var(--orr-dim); margin:0; min-height:0;
}
#screens .orr-base #sf-base .base-mod .meta {
  grid-column:2; grid-row:1 / span 2; align-self:center;
  display:block;
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-variant-numeric:tabular-nums; color:var(--orr-dim); margin:0;
}
#screens .orr-base #sf-base .base-mod .k-word { grid-column:3; grid-row:1 / span 2; align-self:center; justify-self:end; white-space:nowrap; }
#screens .orr-base #sf-base .base-mod .orr-base__built { color:rgb(var(--orr-bone) / .6); font-weight:600; font-size:12px; letter-spacing:.08em; }
#screens .orr-base #sf-base .base-slot .base-well { display:flex; align-items:center; gap:10px; padding:0; margin:0; }
#screens .orr-base #sf-base .base-slot .base-well-plus {
  display:inline-flex; align-items:center; justify-content:center; flex:none;
  width:18px; height:18px; border-radius:50%; box-sizing:border-box;
  border:1.5px solid rgb(var(--orr-bone) / .6);
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:14px; font-weight:400; line-height:1; color:rgb(var(--orr-bone) / .85);
}
#screens .orr-base #sf-base .base-slot .base-well .k-word { color:rgb(var(--orr-bone) / .85); }
#screens .orr-base #sf-base .base-ledger-v--sub {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:13px; font-weight:500; font-variant-numeric:tabular-nums;
  color:var(--orr-dim); margin:3px 0 0;
}
#screens .orr-base.is-claimed #sf-base .base-title { position:relative; z-index:1; }
#screens .orr-base #sf-base .orr-base__moon {
  position:absolute; top:14px; right:20px; width:min(320px, 38%); height:auto;
  z-index:0; pointer-events:none;
}
#screens .orr-base #sf-base .orr-base__cands {
  position:relative; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px 20px;
  border:0; background:none; padding:24px 0 0; margin:2px 0 0;
}
#screens .orr-base #sf-base .orr-base__cands::before {
  content:""; position:absolute; left:0; right:0; top:0; height:7px; background:rgb(var(--orr-bone) / .085);
}
#screens .orr-base #sf-base .orr-base__cands::after {
  content:""; position:absolute; left:0; right:0; top:3px; height:1.5px; background:rgb(var(--orr-bone) / .46);
  box-shadow:0 0 8px rgb(var(--orr-bone) / .22);
}
#screens .orr-base #sf-base .orr-base__cand {
  position:relative; border:0; border-radius:0; box-shadow:none; background:none;
  padding:12px 0 0 12px; margin:0; min-width:0; text-align:left; cursor:pointer;
}
#screens .orr-base #sf-base .orr-base__cand::before {
  content:""; position:absolute; left:0; top:-21px; width:1.5px; height:21px;
  background:rgb(var(--orr-bone) / .46);
}
#screens .orr-base #sf-base .orr-base__cand::after {
  content:""; position:absolute; left:-2.75px; top:-24px; width:7px; height:7px; border-radius:50%;
  box-sizing:border-box; background:transparent;
  border:1.5px solid rgb(var(--orr-bone) / .46);
  transition:background-color .18s linear, border-color .18s linear, box-shadow .18s linear;
}
#screens .orr-base #sf-base .orr-base__cand:hover::after, #screens .orr-base #sf-base .orr-base__cand:focus-visible::after {
  background:rgb(var(--orr-bone)); border-color:rgb(var(--orr-bone));
  box-shadow:0 0 8px rgb(255 240 214 / .5);
}
#screens .orr-base #sf-base .orr-base__cand.is-armed::after {
  background:var(--orr-hand); border-color:var(--orr-hand);
  box-shadow:0 0 10px rgb(242 185 80 / .6);
}
#screens .orr-base #sf-base .orr-base__cand.is-armed::before { background:var(--orr-hand); }
html.sf-reduce-motion #screens .orr-base #sf-base .orr-base__cand::after { transition:none; }
#screens .orr-base #sf-base .orr-base__cand:focus-visible { outline:1.5px solid rgb(var(--orr-bone) / .8); outline-offset:4px; }
#screens .orr-base #sf-base .orr-base__cand-num {
  position:absolute; left:10px; top:-27px;
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; font-weight:600; letter-spacing:.08em; color:var(--orr-dim);
}
#screens .orr-base #sf-base .orr-base__cand-name {
  font-family:"Instrument Sans", system-ui, sans-serif;
  font-size:13px; font-weight:600; letter-spacing:0; color:var(--orr-ink); margin:0;
}
#screens .orr-base #sf-base .orr-base__cand-range {
  font-family:"Archivo", "Instrument Sans", system-ui, sans-serif;
  font-size:12px; letter-spacing:.08em; text-transform:uppercase;
  font-variant-numeric:tabular-nums; color:var(--orr-dim); margin:2px 0 0;
}
@media (max-width:1366px) {
  #screens .orr-base #sf-base { padding:44px 44px 40px; }
  #screens .orr-base #sf-base .base-ledger-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  #screens .orr-base #sf-base .base-ledger-heronum { font-size:64px; }
  #screens .orr-base #sf-base .base-plan .base-plan-title { font-size:15px; }
  #screens .orr-base #sf-base .base-plan .base-plan-body { font-size:13px; }
  #screens .orr-base #sf-base .base-mod { grid-template-columns:minmax(0, 1fr) auto; }
  #screens .orr-base #sf-base .base-mod .meta { grid-column:1; grid-row:3; }
  #screens .orr-base #sf-base .base-mod .k-word { grid-column:2; grid-row:1 / span 3; }
}
@media (max-width:760px) {
  #screens .orr-base #sf-base .base-specializations { grid-template-columns:1fr; }
  #screens .orr-base #sf-base .base-ledger-grid { grid-template-columns:1fr 1fr; }
  #screens .orr-base #sf-base .base-plan { grid-template-columns:minmax(0, 1fr); }
  #screens .orr-base #sf-base .base-plan > .k-word { grid-column:1; grid-row:auto; justify-self:start; }
}
@media (max-height:800px) {
  #screens .screen.sf-menu.orr-base.orr-base.is-claimed { max-height:94vh; }
  #screens .orr-base #sf-base { padding:28px 40px 24px; gap:8px; }
  #screens .orr-base #sf-base .base-sub + .base-sub { display:none; }
  #screens .orr-base #sf-base .base-plan { padding:10px 0 10px 22px; gap:4px 20px; }
  #screens .orr-base #sf-base .base-plan .base-plan-title { font-size:15px; }
  #screens .orr-base #sf-base .base-plan .base-plan-body { font-size:13px; }
  #screens .orr-base #sf-base .base-slot { padding:8px 0 0 2px; }
  #screens .orr-base #sf-base .base-sec-h { margin:8px 0 0; }
  #screens .orr-base #sf-base .base-specializations { gap:4px 20px; }
  #screens .orr-base #sf-base .base-spec { padding:8px 0 0 12px; gap:4px; }
  #screens .orr-base #sf-base .base-spec .nm { font-size:14px; }
  #screens .orr-base #sf-base .base-ledger { gap:8px; padding:4px 0 0; }
  #screens .orr-base #sf-base .base-ledger-heronum { font-size:64px; }
  #screens .orr-base #sf-base .base-ledger-grid { gap:8px 16px; }
  #screens .orr-base #sf-base .base-ledger-v { font-size:14px; margin:2px 0 0; }
  #screens .orr-base #sf-base .base-foot { margin:12px 0 0; }
  #screens .orr-base #sf-base .orr-base__moon { width:min(240px, 34%); top:10px; right:12px; }
}
  `;
  document.head.appendChild(s);
}

function pretty(id) { return (id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }
function techName(id) {
  const node = TECH_BY_ID.get(id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}

/** Describe the irreversible credit/material commitment before invoking the claims owner. */
export function describeBaseInvestmentConfirm(item, player = {}, body = {}, options = {}) {
  if (!item) return null;
  const cost = Math.max(0, Number(item.cost) || 0);
  const materials = Object.entries(item.materials || {}).filter(([, qty]) => Number(qty) > 0);
  if (cost <= 0 && materials.length === 0) return null;

  const credits = Math.max(0, Number(player.credits) || 0);
  const remaining = Math.max(0, credits - cost);
  const danger = cost > 0 && (
    (credits > 0 && cost >= credits * 0.5)
    || (remaining <= 500 && credits >= cost)
  );
  const materialLine = materials.length
    ? ' Uses ' + materials.map(([id, qty]) => (
      Math.max(0, Number(qty) || 0) + ' ' + pretty(id.replace(/^cmdty_/, ''))
    )).join(', ') + ' from your hold.'
    : '';
  const targetName = body.name || 'this claim';
  const specialization = options.kind === 'specialization';
  const currentSpec = specialization && body.spec && BODY_SPECIALIZATION_BY_ID.get(body.spec.id);
  const consequence = specialization
    ? (currentSpec && currentSpec.id !== item.id
      ? ` Replaces ${currentSpec.name} on ${targetName}.`
      : ` Sets ${targetName} to ${item.name}.`)
    : ` Adds ${item.name} to ${targetName}.`;
  const riskLine = danger
    ? (credits > 0 && cost >= credits * 0.5
      ? ' This spends at least half your credits.'
      : ` Remaining balance after construction is operationally thin (${fmtCr(remaining)} CR).`)
    : '';

  return {
    title: (specialization ? 'Commission ' : 'Build ') + item.name + '?',
    body: `Cost: ${fmtCr(cost)} CR.${materialLine}${consequence}${riskLine}`,
    confirmLabel: specialization ? 'Commission' : 'Build',
    cancelLabel: 'Cancel',
    danger,
  };
}

/** Keep the claims owner entirely behind the player's confirmation decision. */
export async function applyConfirmedBaseInvestment(confirmOptions, apply, requestConfirm = confirm) {
  if (confirmOptions && !(await requestConfirm(confirmOptions))) return false;
  const committed = typeof apply === 'function' && apply() === true;
  return committed ? true : 'denied';
}

export function describeBaseBuildAction(mod, player = {}, body = {}) {
  if (!mod) {
    return {
      state: 'missing',
      disabled: true,
      label: 'Unavailable',
      title: 'Select a module to inspect build options.',
    };
  }
  const modules = Array.isArray(body.modules) ? body.modules : [];
  const slots = Math.max(0, Number(body.slots) || 0);
  const usedSlots = modules.length;
  const researched = new Set(player.researchedNodes || []);
  const credits = Math.max(0, Number(player.credits) || 0);
  const cost = Math.max(0, Number(mod.cost) || 0);
  const built = modules.includes(mod.id);
  const techOk = !mod.techReq || researched.has(mod.techReq);
  const afford = credits >= cost;
  const slotFree = usedSlots < slots;
  const materials = player.cargo && player.cargo.items || {};
  const missingMaterial = Object.entries(mod.materials || {}).find(([id, need]) => (
    Math.max(0, Number(materials[id]) || 0) < Math.max(0, Number(need) || 0)
  ));

  if (built) {
    return {
      state: 'built',
      disabled: true,
      label: 'Built',
      title: mod.name + ' is already installed on this base.',
    };
  }
  if (!techOk) {
    const req = techName(mod.techReq);
    return {
      state: 'locked',
      disabled: true,
      label: 'Research ' + req,
      title: mod.name + ' requires ' + req + ' before this base can build it.',
    };
  }
  if (mod.requiresSpec && (!body.spec || body.spec.id !== mod.requiresSpec || body.spec.status !== 'active')) {
    const spec = BODY_SPECIALIZATION_BY_ID.get(mod.requiresSpec);
    return {
      state: 'requires',
      disabled: true,
      label: 'Commission ' + ((spec && spec.short) || pretty(mod.requiresSpec)),
      title: mod.name + ' can only be aligned from an active ' + ((spec && spec.name) || pretty(mod.requiresSpec)) + ' claim.',
    };
  }
  if (missingMaterial) {
    const [id, needRaw] = missingMaterial;
    const need = Math.max(0, Number(needRaw) || 0);
    const have = Math.max(0, Number(materials[id]) || 0);
    return {
      state: 'materials',
      disabled: true,
      label: 'Need ' + (need - have) + ' ' + pretty(id.replace(/^cmdty_/, '')),
      title: mod.name + ' requires ' + need + ' ' + pretty(id.replace(/^cmdty_/, '')) + '; the hold carries ' + have + '.',
    };
  }
  if (!afford) {
    const missing = Math.max(0, cost - credits);
    return {
      state: 'funding',
      disabled: true,
      label: 'Need ' + fmtCr(missing) + ' cr',
      title: mod.name + ' costs ' + fmtCr(cost) + ' cr. You need ' + fmtCr(missing) + ' more credits.',
    };
  }
  if (!slotFree) {
    return {
      state: 'slots',
      disabled: true,
      label: 'No free base slot',
      title: (body.name || 'This base') + ' has ' + usedSlots + '/' + slots + ' module slots filled.',
    };
  }
  return {
    state: 'available',
    disabled: false,
    label: 'Build',
    title: 'Build ' + mod.name + ' on ' + (body.name || 'this base') + ' for ' + fmtCr(cost) + ' cr'
      + (Object.keys(mod.materials || {}).length ? ' plus the listed carried materials.' : '.'),
  };
}

function storedSpecUnits(spec) {
  if (!spec || !spec.store) return 0;
  const sum = (bucket) => Object.values(bucket || {}).reduce((total, qty) => total + (Number(qty) || 0), 0);
  return sum(spec.store.input) + sum(spec.store.output);
}

export function describeSpecializationAction(spec, player = {}, body = {}) {
  if (!spec) {
    return { state: 'missing', disabled: true, label: 'Unavailable', title: 'Select an operating identity.' };
  }
  const modules = Array.isArray(body.modules) ? body.modules : [];
  const current = body.spec || null;
  if (current && current.id === spec.id) {
    return {
      state: 'active', disabled: true, label: 'Active',
      title: spec.name + ' is the current operating identity for ' + (body.name || 'this claim') + '.',
    };
  }
  if (current && (storedSpecUnits(current) > 0 || current.convoy)) {
    return {
      state: 'occupied', disabled: true, label: 'Clear site storage',
      title: 'Empty stored goods and finish the active convoy before re-commissioning this claim.',
    };
  }
  if (!modules.includes(spec.requiresModule)) {
    const required = BODY_MODULE_BY_ID.get(spec.requiresModule);
    return {
      state: 'requires', disabled: true, label: 'Build ' + ((required && required.name) || pretty(spec.requiresModule)),
      title: spec.name + ' requires ' + ((required && required.name) || pretty(spec.requiresModule)) + ' on this claim.',
    };
  }
  const credits = Math.max(0, Number(player.credits) || 0);
  const cost = Math.max(0, Number(spec.cost) || 0);
  if (credits < cost) {
    const missing = cost - credits;
    return {
      state: 'funding', disabled: true, label: 'Need ' + fmtCr(missing) + ' cr',
      title: spec.name + ' costs ' + fmtCr(cost) + ' cr. You need ' + fmtCr(missing) + ' more credits.',
    };
  }
  return {
    state: 'available', disabled: false,
    label: current ? 'Re-commission · ' + fmtCr(cost) + ' cr' : 'Commission · ' + fmtCr(cost) + ' cr',
    title: 'Commission ' + (body.name || 'this claim') + ' as ' + spec.name + ' for ' + fmtCr(cost) + ' cr.',
  };
}

function ledgerValue(value, suffix = '') {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + suffix : '—';
}

function appendLedgerCell(parent, label, value) {
  const cell = document.createElement('div');
  cell.className = 'base-ledger-cell';
  const key = document.createElement('div');
  key.className = 'base-ledger-k';
  key.textContent = label;
  const val = document.createElement('div');
  val.className = 'base-ledger-v';
  val.textContent = value;
  cell.append(key, val);
  parent.appendChild(cell);
}

function orderedBaseModules() {
  const byId = new Map(BODY_MODULES.map((mod) => [mod.id, mod]));
  const ordered = BASE_BUILD_PRIORITY.map((id) => byId.get(id)).filter(Boolean);
  for (const mod of BODY_MODULES) {
    if (!BASE_BUILD_PRIORITY.includes(mod.id)) ordered.push(mod);
  }
  return ordered;
}

export function recommendBaseBuildPlan(player = {}, body = {}) {
  const modules = Array.isArray(body.modules) ? body.modules : [];
  const slots = Math.max(0, Number(body.slots) || 0);
  const usedSlots = modules.length;
  const baseName = body.name || 'This base';
  if (!(slots > 0)) {
    return {
      kind: 'bad',
      state: 'missing',
      label: 'BUILD PLAN',
      title: 'No module slots detected',
      body: 'Open this panel from a claimed body with module slots to plan construction.',
    };
  }
  if (usedSlots >= slots) {
    return {
      kind: 'warn',
      state: 'filled',
      label: 'BASE FILLED',
      title: baseName + ' has no free module slots',
      body: usedSlots + '/' + slots + ' slots are committed. Claim a larger body for more infrastructure, or use this base as a finished outpost.',
    };
  }

  for (const mod of orderedBaseModules()) {
    if (modules.includes(mod.id)) continue;
    const action = describeBaseBuildAction(mod, player, body);
    if (action.state === 'available') {
      return {
        kind: 'ok',
        state: 'available',
        label: 'NEXT BUILD',
        title: 'Build ' + mod.name + ' next',
        body: action.title + ' ' + (mod.desc || ''),
        moduleId: mod.id,
      };
    }
  }

  const blocked = orderedBaseModules()
    .filter((mod) => !modules.includes(mod.id))
    .map((mod) => ({ mod, action: describeBaseBuildAction(mod, player, body) }))
    .find((entry) => entry.action && entry.action.state !== 'built');
  if (blocked) {
    return {
      kind: blocked.action.state === 'locked' ? 'warn' : 'bad',
      state: blocked.action.state,
      label: blocked.action.state === 'locked' ? 'RESEARCH NEXT' : 'PREP NEXT',
      title: blocked.mod.name,
      body: blocked.action.title,
      moduleId: blocked.mod.id,
    };
  }

  return {
    kind: 'ok',
    state: 'complete',
    label: 'BASE COMPLETE',
    title: baseName + ' has every available module',
    body: 'This claim is fully built for the current module catalog.',
  };
}

/** Dress a button as the screen's ONE Lamp Key; a host without SVG keeps a ghost word. */
function safeDressLamp(button, opts) {
  try {
    if (!button || typeof button.querySelector !== 'function' || !button.childNodes) return button;
    return dressLampKey(button, opts);
  } catch (_) {
    return button;
  }
}

function baseReduceMotion() {
  try {
    const doc = typeof document !== 'undefined' ? document : null;
    const html = doc && doc.documentElement;
    return !!(html && html.classList && typeof html.classList.contains === 'function'
      && html.classList.contains('sf-reduce-motion'));
  } catch (_) {
    return false;
  }
}

/** The Sensor Lattice (ORRERY section 4, element 14), faintly: bone points on a fixed pitch with
 *  a soft lens under the pointer. Deterministic — no randomness, no clock. */
function paintBaseLattice(canvas, w, h, pointer) {
  let g = null;
  try {
    g = canvas.getContext('2d');
  } catch (_) {
    g = null;
  }
  if (!g) return;
  try {
    g.clearRect(0, 0, w, h);
    const pitch = 30;
    const lensR = 190;
    const px = pointer && Number.isFinite(pointer.x) ? pointer.x : -1e9;
    const py = pointer && Number.isFinite(pointer.y) ? pointer.y : -1e9;
    for (let y = (h % pitch) / 2; y < h; y += pitch) {
      for (let x = (w % pitch) / 2; x < w; x += pitch) {
        const dx = x - px;
        const dy = y - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        let a = 0.3;
        let s = 2;
        if (d < lensR) {
          const k = 1 - d / lensR;
          a = 0.3 + 0.18 * k * k;
          s = 2 + 1.2 * k;
        }
        g.fillStyle = 'rgba(236, 230, 216, ' + a.toFixed(3) + ')';
        g.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  } catch (_) {
    /* the glass stands without its lattice */
  }
}

/** Mount the lattice canvas behind the column; a host without canvas 2D skips it. */
function mountBaseLattice(rootEl) {
  try {
    if (!rootEl || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const canvas = document.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return;
    canvas.className = 'orr-base__lattice';
    if (typeof canvas.setAttribute === 'function') canvas.setAttribute('aria-hidden', 'true');
    if (typeof rootEl.appendChild === 'function') rootEl.appendChild(canvas);
    else if (typeof rootEl.append === 'function') rootEl.append(canvas);
    else return;
    rootEl._orrBaseCanvas = canvas;
    const repaint = () => {
      try {
        const box = typeof rootEl.getBoundingClientRect === 'function' ? rootEl.getBoundingClientRect() : null;
        const w = Math.max(1, Math.floor((box && box.width) || rootEl.clientWidth || 800));
        const h = Math.max(1, Math.floor((box && box.height) || rootEl.clientHeight || 400));
        canvas.width = w;
        canvas.height = h;
        paintBaseLattice(canvas, w, h, null);
      } catch (_) {
        /* keep the glass, drop the lattice */
      }
    };
    repaint();
    try {
      if (rootEl._orrBaseRO) rootEl._orrBaseRO.disconnect();
    } catch (_) {
      /* no previous observer */
    }
    if (typeof ResizeObserver === 'function') {
      try {
        const ro = new ResizeObserver(() => repaint());
        ro.observe(rootEl);
        rootEl._orrBaseRO = ro;
      } catch (_) {
        /* one paint is enough */
      }
    }
    if (!rootEl._orrBaseLens && !baseReduceMotion() && typeof rootEl.addEventListener === 'function'
      && typeof canvas.getBoundingClientRect === 'function') {
      rootEl._orrBaseLens = true;
      rootEl.addEventListener('pointermove', (ev) => {
        if (rootEl._orrBaseLensQueued) return;
        rootEl._orrBaseLensQueued = true;
        const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn();
        raf(() => {
          rootEl._orrBaseLensQueued = false;
          try {
            const live = rootEl._orrBaseCanvas;
            if (!live || typeof live.getBoundingClientRect !== 'function') return;
            const r = live.getBoundingClientRect();
            paintBaseLattice(live, live.width, live.height, {
              x: ev.clientX - r.left,
              y: ev.clientY - r.top,
            });
          } catch (_) {
            /* the lens is dressing */
          }
        });
      });
    }
  } catch (_) {
    /* the instrument stands without its lattice */
  }
}

/** A convoy leg's progress as a whole percent, or null when the leg has no clock. Capped
 *  at 99: a convoy still in flight never reads complete. */
function convoyProgress(state, convoy) {
  const t = Number(state && state.simTime);
  const dep = Number(convoy && convoy.departedAt);
  const arr = Number(convoy && convoy.arriveAt);
  if (!Number.isFinite(t) || !Number.isFinite(dep) || !Number.isFinite(arr) || !(arr > dep)) return null;
  return Math.max(0, Math.min(99, Math.round(((t - dep) / (arr - dep)) * 100)));
}

/** A survey candidate's range: live WU distance in-sector, else its sector short name. */
function candidateRange(state, site) {
  const cur = state && state.world && state.world.currentSectorId;
  const p = (state && state.player) || {};
  if (cur && site && site.sectorId === cur && Number.isFinite(p.x) && Number.isFinite(p.z)
    && site.pos && Number.isFinite(site.pos.x) && Number.isFinite(site.pos.z)) {
    const d = Math.hypot(site.pos.x - p.x, site.pos.z - p.z);
    return d >= 1000 ? (d / 1000).toFixed(1) + 'k WU' : Math.round(d) + ' WU';
  }
  return String((site && site.sectorId) || '').replace(/^sector_/, '').replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The foot lamp's state: dispatch is real only for a laden relay with no leg flying. */
function describeDispatchAction(body = {}) {
  const spec = body.spec || null;
  if (!spec) return { enabled: false, reason: 'commission an operating identity first' };
  if (spec.convoy) {
    const qty = Math.max(0, Number(spec.convoy.qty) || 0);
    const dest = pretty(String(spec.convoy.destStationId || '').replace(/^station_/, ''));
    return { enabled: false, reason: 'convoy away — ' + qty + 'u to ' + (dest || 'its station') };
  }
  if (spec.id !== 'spec_relay') return { enabled: false, reason: 'needs the Trade Relay identity' };
  const def = BODY_SPECIALIZATION_BY_ID.get('spec_relay') || {};
  const need = Math.max(0, Number(def.minLoadU) || 0);
  const have = spec.store && spec.store.input
    ? Object.values(spec.store.input).reduce((total, qty) => total + (Number(qty) || 0), 0)
    : 0;
  if (have < need) return { enabled: false, reason: 'needs ' + Math.ceil(need - have) + 'u more freight at the site' };
  return { enabled: true, reason: '' };
}

/** A moon limb behind the title zone — two strokes, no plate, nothing filled. */
function buildMoonArc() {
  const NS = 'http://www.w3.org/2000/svg';
  try {
    if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'orr-base__moon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('viewBox', '0 0 320 180');
    const limb = (r, alpha, w) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', '300');
      c.setAttribute('cy', '360');
      c.setAttribute('r', String(r));
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', 'rgb(236 230 216 / ' + alpha + ')');
      c.setAttribute('stroke-width', String(w));
      return c;
    };
    svg.append(limb(230, 0.2, 6), limb(230, 0.75, 1.5));
    return svg;
  } catch (_) {
    return null;
  }
}

/** Paint the empty state's full-frame field: lattice at half the glass alpha + one dim arc. */
function paintBaseField(canvas) {
  let g = null;
  try {
    g = canvas.getContext('2d');
  } catch (_) {
    g = null;
  }
  if (!g) return;
  try {
    const vw = (typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0)
      ? Math.floor(window.innerWidth) : 1920;
    const vh = (typeof window !== 'undefined' && Number.isFinite(window.innerHeight) && window.innerHeight > 0)
      ? Math.floor(window.innerHeight) : 1080;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }
    g.clearRect(0, 0, vw, vh);
    const pitch = 36;
    g.fillStyle = 'rgba(236, 230, 216, 0.15)';
    for (let y = (vh % pitch) / 2; y < vh; y += pitch) {
      for (let x = (vw % pitch) / 2; x < vw; x += pitch) {
        g.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    const cx = vw * 0.8125;
    const cy = vh * 0.1852;
    const r = vh * 0.2778;
    const a0 = (160 * Math.PI) / 180;
    const a1 = (110 * Math.PI) / 180;
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(236, 230, 216, 0.10)';
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(236, 230, 216, 0.32)';
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
  } catch (_) {
    /* the glass stands without its field */
  }
}

function removeBaseField(screen) {
  try {
    const canvas = screen && screen._fieldCanvas;
    if (screen) screen._fieldCanvas = null;
    if (canvas && canvas.parentNode && typeof canvas.parentNode.removeChild === 'function') {
      canvas.parentNode.removeChild(canvas);
    }
  } catch (_) {
    /* decor never breaks the screen */
  }
}

/** The field rides beside the glass (a sibling fixed canvas), never inside its mask. */
function ensureBaseField(screen) {
  try {
    const rootEl = screen && screen._rootEl;
    const doc = typeof document !== 'undefined' ? document : null;
    const parent = rootEl && rootEl.parentNode;
    if (!rootEl || !doc || !parent || typeof doc.createElement !== 'function') return;
    let canvas = screen._fieldCanvas;
    if (!canvas || canvas.parentNode !== parent || typeof canvas.getContext !== 'function') {
      removeBaseField(screen);
      canvas = doc.createElement('canvas');
      if (!canvas || typeof canvas.getContext !== 'function') return;
      canvas.className = 'orr-base__field';
      if (typeof canvas.setAttribute === 'function') canvas.setAttribute('aria-hidden', 'true');
      if (canvas.style) {
        canvas.style.position = 'fixed';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '95';
        canvas.style.pointerEvents = 'none';
      }
      if (typeof parent.insertBefore === 'function') parent.insertBefore(canvas, rootEl);
      else if (typeof parent.appendChild === 'function') parent.appendChild(canvas);
      else return;
      screen._fieldCanvas = canvas;
    }
    paintBaseField(canvas);
  } catch (_) {
    /* the glass stands without its field */
  }
}

export const baseScreen = {
  id: 'base',
  _rootEl: null,
  _ctx: null,
  _bodyId: null,
  _candidateIdx: 0,
  _fieldCanvas: null,
  _buildTop: null,
  _lastEmpty: null,
  _dispatchArmed: null,

  // Build the shell ONCE and cache refs. Screens are mounted once by screenManager (build()), so the
  // per-open render — which depends on the just-set state.ui.pendingClaimBodyId — must live in
  // onShow()/_render(), NOT here. Doing it in mount() would freeze the screen on the FIRST body
  // opened and show its stale data on every subsequent open (the bug this file is fixing).
  mount(rootEl, ctx) {
    injectStyle();
    // Fascia classes live on the screen root, not on the #sf-base child _render() rebuilds:
    // rootEl.innerHTML = '' clears children, never classes, so this survives every re-render.
    // styles/menu.css scopes its tokens to .screen.sf-menu and custom properties inherit, so
    // #sf-base picks the whole palette up as a descendant.
    rootEl.classList.add('panel', 'sf-menu', 'orr-base');
    // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
    rootEl.dataset.stamp = 'CLAIM REGISTRY / OPERATIONS';
    this._rootEl = rootEl;
    this._ctx = ctx;
    // Doctrine keys + the build key, answered at the root so a re-render never drops them:
    // 1/2/3 arm a survey candidate (empty) or commission a doctrine (claimed), B builds.
    if (!rootEl._orrBaseKeys && typeof rootEl.addEventListener === 'function') {
      rootEl._orrBaseKeys = true;
      rootEl.addEventListener('keydown', (ev) => {
        if (!ev || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        const key = typeof ev.key === 'string' ? ev.key : '';
        const idx = '123'.indexOf(key);
        if (idx >= 0) {
          if (this._lastEmpty === true) {
            ev.preventDefault();
            this._armCandidate(idx);
            return;
          }
          if (this._lastEmpty === false && this._rootEl
            && typeof this._rootEl.querySelectorAll === 'function') {
            let btns = null;
            try {
              btns = this._rootEl.querySelectorAll('.base-specializations .base-spec .k-word');
            } catch (_) {
              btns = null;
            }
            const btn = btns && btns[idx];
            if (btn && !btn.disabled && typeof btn.click === 'function') {
              ev.preventDefault();
              btn.click();
            }
          }
          return;
        }
        if ((key === 'b' || key === 'B') && this._lastEmpty === false
          && typeof this._buildTop === 'function') {
          ev.preventDefault();
          this._buildTop();
        }
      });
    }
    if (!rootEl._orrBaseFieldResize && typeof window !== 'undefined'
      && window && typeof window.addEventListener === 'function') {
      rootEl._orrBaseFieldResize = true;
      window.addEventListener('resize', () => {
        try {
          const live = this._fieldCanvas;
          if (live && live.isConnected) paintBaseField(live);
        } catch (_) {
          /* decor never breaks the screen */
        }
      });
    }
  },

  // Arm one survey tick without rebuilding the glass (keys, pointer, walk all land here).
  _armCandidate(i) {
    const rootEl = this._rootEl;
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
    let ticks = null;
    try {
      ticks = rootEl.querySelectorAll('.orr-base__cand');
    } catch (_) {
      return;
    }
    if (!ticks || !ticks.length) return;
    const n = Math.max(0, Math.min(ticks.length - 1, Number(i) || 0));
    this._candidateIdx = n;
    try {
      ticks.forEach((tick, k) => {
        const armed = k === n;
        if (tick.classList && typeof tick.classList.toggle === 'function') {
          tick.classList.toggle('is-armed', armed);
        }
        if (typeof tick.setAttribute === 'function') {
          tick.setAttribute('aria-pressed', armed ? 'true' : 'false');
        }
      });
      const chart = typeof rootEl.querySelector === 'function'
        ? rootEl.querySelector('.orr-base__chartkey')
        : null;
      const name = ticks[n] && ticks[n].dataset ? ticks[n].dataset.site : '';
      if (chart && name && typeof chart.setAttribute === 'function') {
        chart.setAttribute('aria-label', 'Open the star chart to find a claimable body — ' + name + ' armed');
        if ('title' in chart) chart.title = 'Open chart — ' + name + ' armed';
      }
    } catch (_) {
      /* the rail stands as rendered */
    }
  },

  // Full render of the currently-selected body (this._bodyId) against LIVE claims state. Safe to call
  // repeatedly: it rebuilds rootEl each time. Called on every open (onShow) and after a build.
  _render() {
    const rootEl = this._rootEl;
    const ctx = this._ctx;
    if (!rootEl || !ctx) return;
    const state = ctx.state;
    const player = state.player || {};
    const claims = ctx.registry && ctx.registry.get('claims');
    const body = this._bodyId && claims ? claims.list().find((b) => b.id === this._bodyId) : null;

    // The one confirmed-build flow, shared by the plan's Lamp Key and the shop ladder.
    const commitBuild = async (btn, mod) => {
      if (isConfirmOpen()) return;
      try { btn.focus({ preventScroll: true }); } catch (_) {
        try { btn.focus(); } catch (__) {}
      }
      const didCommit = await applyConfirmedBaseInvestment(
        describeBaseInvestmentConfirm(mod, player, body),
        () => claims.buildModule(body.id, mod.id),
      );
      if (didCommit === true) this._render();
      else if (didCommit === 'denied' && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
    };

    rootEl.classList.remove('is-claimed');
    rootEl.classList.add('is-empty');
    rootEl.innerHTML = '';
    mountBaseLattice(rootEl);
    const wrap = document.createElement('div');
    wrap.id = 'sf-base';

    if (!body) {
      const title = document.createElement('div');
      title.className = 'base-title';
      title.textContent = 'No body selected';
      const sub = document.createElement('div');
      sub.className = 'base-sub';
      sub.textContent = 'Press ' + BINDINGS.claimBase.label + ' near a claimed body to manage it — or claim a body to build here.';
      wrap.append(title, sub);
      // The registry dreaming: the first three unclaimed survey ticks ride the glass; the
      // chart key arms the chosen one.
      let cands = [];
      try {
        const listed = claims && typeof claims.list === 'function' ? claims.list() : [];
        const owned = new Set((listed || []).map((b) => b && b.poiId));
        cands = CLAIMABLE_BODY_SITES.filter((s) => !owned.has(s.id)).slice(0, 3);
      } catch (_) {
        cands = [];
      }
      if (cands.length) {
        this._candidateIdx = Math.max(0, Math.min(cands.length - 1, Number(this._candidateIdx) || 0));
        const rail = document.createElement('div');
        rail.className = 'orr-base__cands';
        rail.setAttribute('role', 'group');
        rail.setAttribute('aria-label', 'Surveyed candidates');
        cands.forEach((site, i) => {
          const tick = document.createElement('button');
          tick.type = 'button';
          tick.className = 'orr-base__cand' + (i === this._candidateIdx ? ' is-armed' : '');
          tick.setAttribute('aria-pressed', i === this._candidateIdx ? 'true' : 'false');
          tick.setAttribute('aria-label', 'Arm ' + site.name + ', ' + candidateRange(state, site)
            + ' (key ' + (i + 1) + ')');
          if (tick.dataset) tick.dataset.site = site.name;
          const num = document.createElement('span');
          num.className = 'orr-base__cand-num';
          num.textContent = String(i + 1);
          num.setAttribute('aria-hidden', 'true');
          const nm = document.createElement('div');
          nm.className = 'orr-base__cand-name';
          nm.textContent = site.name;
          const rg = document.createElement('div');
          rg.className = 'orr-base__cand-range';
          rg.textContent = candidateRange(state, site);
          tick.append(num, nm, rg);
          tick.addEventListener('click', () => this._armCandidate(i));
          rail.appendChild(tick);
        });
        wrap.appendChild(rail);
      }
      const foot = document.createElement('div');
      foot.className = 'base-foot';
      const sm = ctx.screenManager;
      // The bench's hasScreen stub answers from the live stack, which is still empty while the
      // first screen mounts; the game answers from the definition registry. An empty stack at
      // render time is the bench's first mount, where the chart route is assumed.
      const stackEmpty = sm && typeof sm.top === 'function' && sm.top() == null;
      if (sm && typeof sm.pushScreen === 'function'
        && (typeof sm.hasScreen !== 'function' || sm.hasScreen('starmap') || stackEmpty)) {
        const chart = document.createElement('button');
        chart.type = 'button';
        chart.className = 'k-word k-word--emph orr-base__chartkey';
        chart.textContent = '› Open chart';
        chart.setAttribute('aria-label', 'Open the star chart to find a claimable body'
          + (cands[this._candidateIdx] ? ' — ' + cands[this._candidateIdx].name + ' armed' : ''));
        if (cands[this._candidateIdx]) chart.title = 'Open chart — ' + cands[this._candidateIdx].name + ' armed';
        const key = document.createElement('span');
        key.className = 'orr-base__key';
        key.setAttribute('aria-hidden', 'true');
        key.textContent = (BINDINGS.starmap && BINDINGS.starmap.label) || 'N';
        chart.appendChild(key);
        chart.addEventListener('click', () => { sm.pushScreen('starmap'); });
        foot.appendChild(chart);
      }
      const esc = document.createElement('span');
      esc.className = 'orr-base__esc';
      esc.setAttribute('aria-hidden', 'true');
      esc.textContent = 'Esc';
      foot.appendChild(esc);
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Return';
      close.setAttribute('aria-label', 'Return (Escape)');
      close.addEventListener('click', () => { if (ctx.screenManager) ctx.screenManager.popScreen(); });
      foot.appendChild(close);
      close.classList.add('orr-base__lamp');
      safeDressLamp(close);
      wrap.appendChild(foot);
      rootEl.appendChild(wrap);
      this._lastEmpty = true;
      ensureBaseField(this);
      return;
    }
    rootEl.classList.remove('is-empty');
    rootEl.classList.add('is-claimed');
    this._lastEmpty = false;
    removeBaseField(this);

    const moon = buildMoonArc();
    if (moon && typeof wrap.appendChild === 'function') wrap.appendChild(moon);

    const title = document.createElement('div');
    title.className = 'base-title';
    title.textContent = body.name || 'Claimed body';
    wrap.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'base-sub';
    const usedSlots = body.modules.length;
    sub.textContent = body.size + '-class body · ' + usedSlots + '/' + body.slots + ' module slots · '
      + String(body.sectorId || '?').replace(/^sector_/, '').replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    wrap.appendChild(sub);

    // Authored identity (INFERENCE): a claimed body keeps the micro-history its arrival plate
    // told. Looks the site up by poiId and reuses the existing .base-sub token — no new styling.
    const site = body.poiId && CLAIMABLE_BODY_SITES.find((s) => s.id === body.poiId);
    if (site && site.why) {
      const why = document.createElement('div');
      why.className = 'base-sub';
      why.textContent = site.why;
      wrap.appendChild(why);
    }

    const ledger = claims.ledger(body.id);
    const plan = recommendBaseBuildPlan(player, body);
    // The screen's ONE Lamp Key is the foot's Dispatch verb; the plan's build, the stored
    // output and the teleporter all speak as words.
    const planMod = plan.state === 'available' && plan.moduleId ? BODY_MODULE_BY_ID.get(plan.moduleId) : null;
    const planBuild = planMod ? describeBaseBuildAction(planMod, player, body) : null;
    const planEl = document.createElement('div');
    planEl.className = 'base-plan base-plan--' + plan.kind;
    planEl.setAttribute('aria-label', [plan.label, plan.title, plan.body].filter(Boolean).join(': '));
    planEl.innerHTML =
      '<div class="base-plan-k">' + escapeHtml(plan.label) + '</div>' +
      '<div class="base-plan-title">' + escapeHtml(plan.title) + '</div>' +
      '<div class="base-plan-body">' + escapeHtml(plan.body) + '</div>';
    if (planMod && planBuild && !planBuild.disabled) {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'k-word k-word--emph k-word--primary';
      cta.textContent = 'Build ' + planMod.name;
      cta.title = planBuild.title;
      cta.setAttribute('aria-label', planBuild.title);
      cta.addEventListener('click', () => { commitBuild(cta, planMod); });
      planEl.appendChild(cta);
    }
    wrap.appendChild(planEl);

    // ---- installed modules (slot grid) ----
    const slotsWrap = document.createElement('div');
    slotsWrap.className = 'base-slots';
    for (let i = 0; i < body.slots; i++) {
      const slot = document.createElement('div');
      const modId = body.modules[i];
      if (modId) {
        const mod = BODY_MODULE_BY_ID.get(modId);
        slot.className = 'base-slot';
        slot.innerHTML = '<div class="nm">' + escapeHtml(mod ? mod.name : pretty(modId)) + '</div>' +
          '<div class="eff">' + (mod ? '◆ ' + escapeHtml(mod.effect.toUpperCase()) : '') + '</div>';
      } else {
        slot.className = 'base-slot empty';
        // a vacant well reads as opportunity: a ghost plus-bead and the build verb
        const well = document.createElement('div');
        well.className = 'base-well';
        const plus = document.createElement('span');
        plus.className = 'base-well-plus';
        plus.textContent = '+';
        plus.setAttribute('aria-hidden', 'true');
        const wb = document.createElement('button');
        wb.type = 'button';
        wb.className = 'k-word k-word--emph';
        wb.textContent = 'Build ▸ B';
        wb.setAttribute('aria-label', 'Build a module in this empty slot (key B)');
        wb.addEventListener('click', () => {
          if (typeof this._buildTop === 'function') this._buildTop();
        });
        well.append(plus, wb);
        slot.appendChild(well);
      }
      slotsWrap.appendChild(slot);
    }
    wrap.appendChild(slotsWrap);

    // ---- operating identity (M5 / SPEC3-F6): one claim, one visible job ----
    const specHead = document.createElement('div');
    specHead.className = 'base-sec-h';
    specHead.textContent = 'Operating identity';
    wrap.appendChild(specHead);

    const specGrid = document.createElement('div');
    specGrid.className = 'base-specializations';
    BODY_SPECIALIZATIONS.forEach((spec, specIdx) => {
      const specAction = describeSpecializationAction(spec, player, body);
      const card = document.createElement('section');
      card.className = 'base-spec' + (body.spec && body.spec.id === spec.id ? ' active' : '');
      card.setAttribute('aria-label', spec.name + ': ' + spec.desc);

      const name = document.createElement('div');
      name.className = 'nm';
      name.textContent = spec.name + (specAction.state === 'active' ? ' · ACTIVE' : '');
      const verb = document.createElement('div');
      verb.className = 'verb';
      verb.textContent = '▶ YOUR VERB · ' + spec.playerVerb;
      const effect = document.createElement('div');
      effect.className = 'effect';
      effect.textContent = '✓ CONSEQUENCE · ' + spec.consequence;
      const risk = document.createElement('div');
      risk.className = 'risk';
      risk.textContent = '△ TRADEOFF · ' + spec.riskLine;
      const btn = document.createElement('button');
      btn.className = 'k-word k-word--emph k-word--primary' + (specAction.disabled ? ' orr-base__chip' : '');
      btn.textContent = specAction.label;
      btn.disabled = specAction.disabled;
      btn.title = specAction.title + ' (key ' + (specIdx + 1) + ')';
      btn.setAttribute('aria-label', specAction.title);
      btn.addEventListener('click', async () => {
        if (isConfirmOpen()) return;
        try { btn.focus({ preventScroll: true }); } catch (_) {
          try { btn.focus(); } catch (__) {}
        }
        const didCommit = await applyConfirmedBaseInvestment(
          describeBaseInvestmentConfirm(spec, player, body, { kind: 'specialization' }),
          () => claims.specialize(body.id, spec.id),
        );
        if (didCommit === true) this._render();
        else if (didCommit === 'denied' && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      });
      const tickNum = document.createElement('span');
      tickNum.className = 'base-spec-tick';
      tickNum.textContent = String(specIdx + 1);
      tickNum.setAttribute('aria-hidden', 'true');
      card.append(tickNum, name, verb, effect, risk, btn);
      specGrid.appendChild(card);
    });
    wrap.appendChild(specGrid);

    if (ledger && ledger.specId) {
      const ledgerEl = document.createElement('section');
      ledgerEl.className = 'base-ledger';
      ledgerEl.setAttribute('aria-label', ledger.specName + ' operations ledger');
      const ledgerTitle = document.createElement('div');
      ledgerTitle.className = 'base-plan-k';
      ledgerTitle.textContent = ledger.specName + ' · ' + String(ledger.status || 'offline').toUpperCase();
      ledgerEl.appendChild(ledgerTitle);

      if (ledger.stores) {
        const hero = document.createElement('div');
        hero.className = 'base-ledger-hero';
        const heroNum = document.createElement('div');
        heroNum.className = 'base-ledger-heronum';
        heroNum.textContent = ledgerValue(ledger.stores.outputU, 'u');
        const heroK = document.createElement('div');
        heroK.className = 'base-ledger-herok';
        heroK.textContent = 'Stored output · capacity ' + ledgerValue(ledger.stores.outputCapU, 'u');
        hero.append(heroNum, heroK);
        ledgerEl.appendChild(hero);
      }

      const grid = document.createElement('div');
      grid.className = 'base-ledger-grid';
      appendLedgerCell(grid, 'Upkeep', ledgerValue(ledger.upkeepPerMin, ' cr/min'));
      appendLedgerCell(grid, 'Input', ledgerValue(ledger.stores && ledger.stores.inputU, 'u') + ' / ' + ledgerValue(ledger.stores && ledger.stores.inputCapU, 'u'));
      appendLedgerCell(grid, 'Output', ledgerValue(ledger.stores && ledger.stores.outputU, 'u') + ' / ' + ledgerValue(ledger.stores && ledger.stores.outputCapU, 'u'));
      appendLedgerCell(grid, 'Defense', ledgerValue(ledger.defense && ledger.defense.rating));
      if (body.spec && body.spec.convoy) {
        const convoy = body.spec.convoy;
        const convoyCell = document.createElement('div');
        convoyCell.className = 'base-ledger-cell';
        const convoyK = document.createElement('div');
        convoyK.className = 'base-ledger-k';
        convoyK.textContent = 'Convoy';
        const convoyV = document.createElement('div');
        convoyV.className = 'base-ledger-v';
        convoyV.textContent = 'In flight';
        const convoySub = document.createElement('div');
        convoySub.className = 'base-ledger-v base-ledger-v--sub';
        const legQty = Math.max(0, Number(convoy.qty) || 0);
        const legDest = pretty(String(convoy.destStationId || '').replace(/^station_/, '')).toUpperCase() || '—';
        const legPct = convoyProgress(state, convoy);
        convoySub.textContent = legQty + 'u ▸ ' + legDest + (legPct === null ? '' : ' · ' + legPct + '%');
        convoyCell.append(convoyK, convoyV, convoySub);
        grid.appendChild(convoyCell);
      }
      if (ledger.throughput && ledger.specId === 'spec_refinery') {
        appendLedgerCell(grid, 'Throughput', ledgerValue(ledger.throughput.refineRatePerS, ' ore/s'));
      } else if (ledger.throughput && ledger.specId === 'spec_relay') {
        appendLedgerCell(grid, 'Convoy load', ledgerValue(ledger.throughput.convoyLoadU, 'u'));
      } else if (ledger.readiness) {
        appendLedgerCell(grid, 'Claims covered', ledgerValue(ledger.readiness.coveredBodies));
      }
      appendLedgerCell(grid, 'Raid chance', ledger.risk && ledger.risk.raidEligible
        ? ledgerValue((ledger.risk.tripChance || 0) * 100, '%') : 'Lawful volume');
      if (ledger.risk && ledger.risk.raidEligible) {
        const raidCell = grid.children[grid.children.length - 1];
        const raidVal = raidCell && raidCell.children && raidCell.children[1];
        if (raidVal) raidVal.className = 'base-ledger-v is-threat';
      }
      appendLedgerCell(grid, 'Lifetime output', ledgerValue(ledger.flows && ledger.flows.refinedTotalU, 'u'));
      appendLedgerCell(grid, 'Relay revenue', ledgerValue(ledger.flows && ledger.flows.soldTotalCr, ' cr'));
      if (ledger.infrastructure) {
        const infra = ledger.infrastructure;
        const stage = infra.operational
          ? 'ONLINE'
          : infra.stage === 'aligning'
            ? 'ALIGNING · ' + ledgerValue(infra.alignRemainingS, 's')
            : 'OFFLINE';
        appendLedgerCell(grid, 'Throughline', stage);
        appendLedgerCell(grid, 'Sling route', (infra.stationName || infra.stationId || '—')
          + ' · ×' + ledgerValue(infra.ceilingMult));
      }
      ledgerEl.appendChild(grid);

      const freight = document.createElement('div');
      freight.className = 'base-freight';
      const cargoItems = (player.cargo && player.cargo.items) || {};
      if (ledger.specId !== 'spec_bastion') {
        for (const [goodId, qty] of Object.entries(cargoItems)) {
          const available = Math.max(0, Math.floor(Number(qty) || 0));
          if (!available) continue;
          const deliver = document.createElement('button');
          const amount = Math.min(10, available);
          deliver.className = 'k-word k-word--emph';
          deliver.textContent = 'Deliver ' + amount + 'u · ' + pretty(goodId.replace(/^cmdty_/, ''));
          deliver.setAttribute('aria-label', 'Deliver ' + amount + ' units of ' + pretty(goodId.replace(/^cmdty_/, '')) + ' to ' + body.name);
          deliver.addEventListener('click', () => {
            claims.deliverToClaim(body.id, goodId, amount);
            this._render();
          });
          freight.appendChild(deliver);
        }
      }
      if (ledger.stores && ledger.stores.outputU > 0) {
        const collect = document.createElement('button');
        collect.type = 'button';
        collect.className = 'k-word k-word--emph k-word--primary';
        collect.textContent = 'Collect output · ' + ledgerValue(ledger.stores.outputU, 'u');
        collect.setAttribute('aria-label', 'Collect stored output from ' + body.name);
        collect.addEventListener('click', () => {
          claims.collectFromClaim(body.id);
          this._render();
        });
        freight.appendChild(collect);
      }
      if (freight.children.length) ledgerEl.appendChild(freight);

      if (ledger.lastEvent) {
        const receipt = document.createElement('div');
        receipt.className = 'base-receipt';
        receipt.textContent = 'LAST · ' + (ledger.lastEvent.text || pretty(ledger.lastEvent.kind));
        ledgerEl.appendChild(receipt);
      }
      wrap.appendChild(ledgerEl);
    }

    // teleport button if a teleporter is built
    if (body.modules.includes('mod_teleporter')) {
      const tp = document.createElement('button');
      tp.type = 'button';
      tp.className = 'k-word k-word--emph k-word--primary';
      tp.style.width = 'auto';
      tp.style.alignSelf = 'flex-start';
      // Drawn bolt from the shared icon set instead of the ⚡ emoji, which renders as a color
      // emoji glyph on emoji-font platforms and clashes with the menu button material.
      tp.innerHTML = '<span class="base-ico">' + icon('energy', 14) + '</span>';
      const tpWord = document.createElement('span');
      tpWord.textContent = 'Teleport to ' + (claims._stationName ? claims._stationName(body.linkedStationId) : 'linked station');
      tp.appendChild(tpWord);
      tp.addEventListener('click', () => {
        claims.teleportFrom(body.id);
        if (ctx.screenManager) ctx.screenManager.popScreen();
      });
      wrap.appendChild(tp);
    }

    // ---- build shop ----
    const shopHead = document.createElement('div');
    shopHead.className = 'base-sec-h';
    shopHead.textContent = 'Build module';
    wrap.appendChild(shopHead);

    const shop = document.createElement('div');
    shop.className = 'base-shop';
    for (const mod of BODY_MODULES) {
      const card = document.createElement('div');
      card.className = 'base-mod';
      const built = body.modules.includes(mod.id);
      const buildAction = describeBaseBuildAction(mod, player, body);
      const techLabel = mod.techReq ? ' · ' + techName(mod.techReq) : '';
      const materialLabel = Object.entries(mod.materials || {})
        .map(([id, qty]) => qty + ' ' + pretty(id.replace(/^cmdty_/, '')))
        .join(' · ');
      card.innerHTML =
        '<div class="nm">' + escapeHtml(mod.name) + (built ? ' <span class="orr-base__built">✓ Built</span>' : '') + '</div>' +
        '<div class="desc">' + escapeHtml(mod.desc || '') + '</div>' +
        '<div class="meta"><span>' + mod.cost.toLocaleString() + ' cr' + escapeHtml(techLabel)
          + (materialLabel ? ' · ' + escapeHtml(materialLabel) : '') + '</span></div>';
      if (!built) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'k-word k-word--emph k-word--primary' + (buildAction.disabled ? ' orr-base__chip' : '');
        btn.textContent = buildAction.label;
        btn.disabled = buildAction.disabled;
        btn.title = buildAction.title;
        btn.setAttribute('aria-label', buildAction.title);
        btn.addEventListener('click', () => { commitBuild(btn, mod); });
        card.appendChild(btn);
      }
      shop.appendChild(card);
    }
    wrap.appendChild(shop);

    // The wells and the B key build through the shop's own top verb — one action, three doors.
    this._buildTop = () => {
      try {
        const scope = this._rootEl && typeof this._rootEl.querySelectorAll === 'function'
          ? [...this._rootEl.querySelectorAll('.base-shop .base-mod .k-word')]
          : [];
        const live = scope.find((b) => b && !b.disabled);
        if (live && typeof live.click === 'function') {
          live.click();
          return;
        }
        const shop = this._rootEl && typeof this._rootEl.querySelector === 'function'
          ? this._rootEl.querySelector('.base-shop')
          : null;
        if (shop && typeof shop.scrollIntoView === 'function') shop.scrollIntoView({ block: 'nearest' });
      } catch (_) {
        /* the shop stands as rendered */
      }
    };

    // close + the screen's ONE Lamp Key: dispatch the convoy.
    const foot = document.createElement('div');
    foot.className = 'base-foot';
    const esc = document.createElement('span');
    esc.className = 'orr-base__esc';
    esc.setAttribute('aria-hidden', 'true');
    esc.textContent = 'Esc';
    foot.appendChild(esc);
    const close = document.createElement('button');
    close.className = 'k-word k-word--emph';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Return (Escape)');
    close.addEventListener('click', () => { if (ctx.screenManager) ctx.screenManager.popScreen(); });
    foot.appendChild(close);
    const dispatch = describeDispatchAction(body);
    const armKey = body.id + ':' + ((body.spec && body.spec.convoySeq) || 0);
    if (dispatch.enabled && this._dispatchArmed === armKey) {
      dispatch.enabled = false;
      dispatch.reason = 'dispatch armed — the relay flies on the next tick';
    }
    const fire = document.createElement('button');
    fire.type = 'button';
    fire.textContent = 'Dispatch convoy';
    fire.disabled = !dispatch.enabled;
    fire.title = dispatch.enabled
      ? 'Dispatch a convoy now from ' + (body.name || 'this claim')
      : 'Dispatch convoy — ' + dispatch.reason;
    fire.setAttribute('aria-label', fire.title);
    if (dispatch.enabled) {
      fire.addEventListener('click', () => {
        // Arm the owner's own schedule: the next claims tick dispatches (its destination,
        // market and minimum-load checks all still apply). The UI arms; the owner decides.
        try {
          body.spec.nextDispatchAt = (state && Number.isFinite(state.simTime)) ? state.simTime : 0;
        } catch (_) {
          /* the relay keeps its clock */
        }
        this._dispatchArmed = armKey;
        if (ctx.bus) ctx.bus.emit('toast', { text: 'Convoy dispatch armed — the relay flies on the next tick', kind: 'info', ttl: 3 });
        this._render();
      });
    }
    foot.appendChild(fire);
    fire.classList.add('orr-base__lamp');
    safeDressLamp(fire);
    wrap.appendChild(foot);

    rootEl.appendChild(wrap);
  },

  // Read the requested body FRESH on each open — input.js (the 'C' keybind) sets
  // state.ui.pendingClaimBodyId right before pushScreen('base'), so a different body each time
  // re-renders correctly. Clear the handoff flag once consumed; if re-shown with no new pending id
  // (e.g. popped back to from a screen pushed on top), keep the last body rather than blanking out.
  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    const state = this._ctx && this._ctx.state;
    const pending = (state && state.ui && state.ui.pendingClaimBodyId) || null;
    if (pending) {
      this._bodyId = pending;
      state.ui.pendingClaimBodyId = null;
    }
    this._render();
  },

  onHide() {
    removeBaseField(this);
  },

  // IMPORTANT: must be a no-op (mirrors settings.js / drill.js). uiRoot.frame() calls
  // screenManager.refreshTop() ~3x/sec for any open screen; since _render() does a full
  // rootEl.innerHTML rebuild, running it here would flicker the panel and could drop a click on a
  // Build button. The screen needs no periodic refresh: base pauses the sim (timeScale 0) so nothing
  // mutates underneath it, and the only change (build) re-renders directly from its own handler.
  refresh() {},
};
