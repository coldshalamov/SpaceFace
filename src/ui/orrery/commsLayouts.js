// Flight contact actions and their contact header.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-comms';
const F = 'html body #sf-commsfan';

const CSS = `
${F} { box-sizing:border-box; width:min(380px,calc(100vw - 32px)); bottom:clamp(100px,16vh,150px);
  max-height:calc(95dvh - 110px); padding:0; isolation:isolate; overflow:hidden; pointer-events:auto;
  border:1px solid var(--sf-pop-seam) !important; border-radius:8px;
  background:var(--sf-pop-glass) !important; box-shadow:var(--sf-pop-shadow) !important; }
${F}[hidden] { display:none; }
${F}::before { content:none; }
${F} .sf-commsfan__fan { display:grid; grid-template-rows:auto minmax(0,1fr) auto; max-height:inherit; gap:0; }
${F} .sf-commsfan__hub { order:0; grid-template-columns:34px minmax(0,1fr) auto; row-gap:2px; column-gap:10px;
  min-width:0; padding:14px 14px 12px; border:0; border-bottom:1px solid var(--dp-rule); background:none;
  color:var(--dp-ink); border-radius:7px 7px 0 0; box-shadow:none; }
${F} .sf-commsfan__hub:is(:hover,:focus-visible) { background:var(--dp-field); }
${F} .sf-commsfan__hub::before, ${F} .sf-commsfan__wedge::before, ${F} .sf-commsfan__wedge::after { content:none; }
${F} .sf-commsfan__crest { grid-column:1; grid-row:1 / span 2; width:34px; height:34px;
  color:var(--dp-ice); border:1px solid var(--dp-rule); border-radius:50%; }
${F} .sf-commsfan__pilot { grid-column:2; grid-row:1; color:var(--dp-ink);
  font:750 20px/1.15 var(--dp-face-display); letter-spacing:0; overflow-wrap:anywhere; }
${F} .sf-commsfan__class { grid-column:2; grid-row:2; color:var(--dp-ink-dim);
  font:550 13px/1.15 var(--dp-face-read); letter-spacing:0; }
${F} .sf-commsfan__deckhint { position:static; grid-column:3; grid-row:1 / span 2; align-self:center;
  color:var(--dp-ink-dim); padding:6px 8px; border:1px solid var(--dp-rule);
  border-radius:4px; font:620 12px/1.1 var(--dp-face-read); text-transform:none; letter-spacing:0; }
${F} .sf-commsfan__hub:is(:hover,:focus-visible) .sf-commsfan__deckhint { color:var(--dp-hand-hot); border-color:var(--dp-hand); }
${F} .sf-commsfan__wedgehost { order:1; gap:4px; padding:8px 10px; overflow:auto; overscroll-behavior:contain; }
${F} .sf-commsfan__wedge { display:grid; grid-template-columns:25px minmax(0,1fr) 26px; align-items:center;
  height:auto; min-height:42px; margin:0; padding:6px 9px; gap:9px; color:var(--dp-ink); text-shadow:none;
  border:1px solid transparent; border-radius:5px; background:transparent; box-shadow:none; }
${F} .sf-commsfan__wedge:not(.is-dim):is(:hover,:focus-visible) { background:var(--dp-field);
  border-color:var(--dp-rule-hi); color:var(--dp-hand-hot); }
${F} :is(.sf-commsfan__wedge,.sf-commsfan__hub,.sf-commsfan__close):focus-visible { outline:2px solid var(--dp-hand); outline-offset:-2px; }
${F} .sf-commsfan__wedge.is-dim { color:var(--dp-ink-dim); opacity:1; cursor:default; }
${F} .sf-commsfan__wedge.is-dim .sf-commsfan__verb { text-decoration:none; }
${F} .sf-commsfan__action-copy { display:grid; gap:3px; }
${F} .sf-commsfan__verb { font:650 15px/1.15 var(--dp-face-read); letter-spacing:0; text-transform:none; color:inherit; }
${F} .sf-commsfan__why { font:500 12px/1.25 var(--dp-face-read); letter-spacing:0; text-transform:none; color:var(--dp-ink-dim); }
${F} .sf-commsfan__why:empty { display:none; }
${F} .sf-commsfan__glyph { width:22px; height:22px; }
${F} .sf-commsfan__keychip { display:grid; place-items:center; width:24px; height:22px; padding:0; border:1px solid var(--dp-rule);
  border-radius:3px; background:var(--dp-metal-0); color:var(--dp-ink-dim); font:650 12px/1 var(--dp-face-read); }
${F} .sf-commsfan__close { order:2; justify-self:end; margin:0 10px 8px; min-height:34px; padding:6px 8px;
  background:transparent; border:1px solid var(--dp-rule); border-radius:4px; color:var(--dp-ink);
  font:620 13px/1.1 var(--dp-face-read); cursor:pointer; }
${F} .sf-commsfan__close:hover { border-color:var(--dp-line-hi); }
${F} .sf-commsfan__close kbd { margin-left:3px; color:var(--dp-ink-dim); }
@media (max-height:580px), (max-width:760px) {
  ${F} { top:50%; bottom:auto; transform:translate(-50%,-50%); max-height:calc(100dvh - 24px); }
}
@media (pointer:coarse) {
  ${F} :is(.sf-commsfan__wedge,.sf-commsfan__close) { min-height:44px; }
  ${F} :is(.sf-commsfan__keychip,.sf-commsfan__close kbd) { visibility:hidden; }
}
@media (forced-colors:active) {
  ${F} { border-color:CanvasText !important; background:Canvas !important; color:CanvasText !important; }
}
`;

export function injectCommsLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
