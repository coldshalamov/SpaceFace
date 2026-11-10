// src/ui/orrery/manifestLayouts.js — the Manifest table's own layout sheet.
//
// Layout and type only: the stake table, the hand, the mid-game portfolio and the
// table record. Class names, roles and data hooks are the screen's; nothing here
// introduces a second token root or a new stylesheet under styles/.
//
// ui-polish-390: the body columns (`.manifest-body > section`), mid-game hold
// panels (`.manifest-portfolio > section`), hand cards (`.manifest-card`) and the
// table record (`.manifest-log`) upgrade from unbound Newgrounds plates (no border /
// no radius / no fill) to the promise-scale hairline card (1px bone ~18% / radius 10 /
// faint fill) so the berth table matches statistics empty-state / Help terms /
// Records Wall bands / Save-Load ledger / Mission Log stage. Chrome only — padding
// is the card's inset, content order unchanged. Scoped to `.orr-manifest`.
// Selectors/IDs unchanged. Narrow frames also let the opponent heading wrap so
// "Across the table: The berth regular" stays on-frame at 390×844.
import { injectOrrery } from './tokens.js';

const BONE = '236 230 216';
const MF = 'html body #screens > .k-screen.orr-manifest.orr-manifest';

export function injectManifestLayouts(doc = globalThis.document) {
  injectOrrery(doc);
  if (!doc?.head || doc.getElementById('sf-manifest-layout')) return;
  const style = doc.createElement('style'); style.id = 'sf-manifest-layout';
  style.textContent = `
  ${MF} {display:grid!important;grid-template-rows:auto minmax(0,1fr) auto;gap:20px;padding:clamp(24px,4vw,72px);}
  ${MF} .manifest-body {overflow:auto;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,1fr);gap:28px;align-content:start;}
  ${MF} .manifest-hand {display:grid;gap:10px;align-content:start;}
  ${MF} .manifest-portfolio {display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-block:20px;}
  ${MF} .manifest-tonnes {font-family:var(--dp-face-numeral);font-size:clamp(40px,7vh,86px);font-variant-numeric:tabular-nums;line-height:1.1;}
  ${MF} .manifest-log {max-height:11em;overflow:auto;}
  ${MF} .manifest-log p {margin-block:6px;}
  ${MF} .manifest-card {text-align:left;min-height:48px;white-space:normal;}
  ${MF} .manifest-card small {display:block;font-size:12px;color:var(--dp-ink-dim);}
  ${MF} .manifest-rules {max-width:72ch;}
  ${MF} .manifest-actions {display:flex;flex-wrap:wrap;gap:12px 24px;margin-block:18px;padding:0;list-style:none;}

  /* reading plates: promise-scale hairline cards (were unbound Newgrounds plates) */
  ${MF} .manifest-body > section {
    box-sizing:border-box;
    min-width:0;
    border:1px solid rgb(${BONE} / .18);
    border-radius:10px;
    background:rgb(${BONE} / .025);
    padding:clamp(12px, 1.5vh, 18px) clamp(14px, 1.5vw, 20px);
  }
  ${MF} .manifest-portfolio > section {
    box-sizing:border-box;
    min-width:0;
    border:1px solid rgb(${BONE} / .18);
    border-radius:10px;
    background:rgb(${BONE} / .025);
    padding:clamp(10px, 1.3vh, 16px) clamp(12px, 1.4vw, 18px);
  }
  ${MF} .manifest-card {
    box-sizing:border-box;
    border:1px solid rgb(${BONE} / .18);
    border-radius:10px;
    background:rgb(${BONE} / .025);
    padding:10px 14px;
  }
  ${MF} .manifest-log {
    box-sizing:border-box;
    border:1px solid rgb(${BONE} / .18);
    border-radius:10px;
    background:rgb(${BONE} / .025);
    padding:10px 14px;
  }
  /* narrow: opponent heading wraps instead of clipping the sector/name */
  ${MF} .manifest-body > section :is(.k-row__name, .k-display, h2) {
    overflow-wrap:anywhere; white-space:normal; min-width:0;
  }

  @media(max-width:760px){
    ${MF}{gap:12px;padding:20px;}
    ${MF} .manifest-body{grid-template-columns:1fr;}
    ${MF} .manifest-hand{grid-template-columns:repeat(2,minmax(0,1fr));}
    ${MF} .manifest-log{max-height:6em;}
    ${MF} .manifest-body > section,
    ${MF} .manifest-portfolio > section,
    ${MF} .manifest-card,
    ${MF} .manifest-log { border-radius:8px; }
  }
  /* short frames: compress card chrome with the shared densify bands */
  @media (max-height:820px) {
    ${MF} .manifest-body > section,
    ${MF} .manifest-portfolio > section,
    ${MF} .manifest-card,
    ${MF} .manifest-log { border-radius:8px; }
  }
  @media (max-height:460px) {
    ${MF} .manifest-body > section,
    ${MF} .manifest-portfolio > section,
    ${MF} .manifest-card,
    ${MF} .manifest-log { border-radius:8px; }
  }
  @media (max-height:400px) {
    ${MF} .manifest-body > section,
    ${MF} .manifest-portfolio > section,
    ${MF} .manifest-card,
    ${MF} .manifest-log { border-radius:6px; }
  }
  `;
  doc.head.appendChild(style);
}
