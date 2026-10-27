// src/ui/orrery/achievementsLayouts.js — the ORRERY composition for the meta-ledger screens this
// unit owns (design/frontend/ORRERY.md §6 Meta): Records Wall (statistics) and Achievements
// (the medal orrery, src/ui/orrery/constellationMedals.js). The statistics composition stands
// here because the unit's one new layout home is this file; the achievements section carries the
// polish the shared constellation sheet (src/ui/orrery/constellationLayouts.js, another lane's
// file) does not. Layout and type only. Nothing here draws a box: readings sit on pools of shade
// with soft edges, the deeds hang off a ladder rail, the one filled shape stays the Lamp Key.
// Scoped to each screen's root (#screens > .k-screen.orr-statistics / .con-achievements) so
// nothing reaches another screen. Injected AFTER statisticsLayouts/constellationLayouts by the
// screens themselves, so these rules win the cascade ties they need.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'orr-meta-ledger-layouts';
const BONE = '236 230 216';
const WARM = '248 244 234';

const LABEL = `font-family:var(--dp-face-label, "Archivo"), "Archivo", system-ui, sans-serif; font-stretch:112%; font-weight:650; text-transform:uppercase; font-variation-settings:normal;`;
const READ = `font-family:var(--dp-face-read, "Instrument Sans"), "Instrument Sans", system-ui, sans-serif; font-stretch:100%; font-variation-settings:normal; text-transform:none;`;
const NUMERAL = `font-family:var(--dp-face-numeral, "Archivo"), "Archivo", system-ui, sans-serif; font-stretch:100%; font-weight:250; font-variation-settings:"wght" 250, "wdth" 100;
  font-variant-numeric:tabular-nums lining-nums; letter-spacing:-.01em;`;
const POOL = (inset = '-40px -56px') => `content:""; position:absolute; z-index:-1; inset:${inset}; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .82), rgb(4 6 9 / .6) 58%, rgb(4 6 9 / 0));`;

const S = 'html body #screens > .k-screen.orr-statistics';

const STATISTICS = `
/* the stage becomes a two-column composition: the wall of deeds and readings, the career
   instrument pinned beside it. statisticsLayouts.js owns the frame (padding, foot, short-frame
   bands); this sheet owns the split. */
${S} > .sf-statistics.k-stage.orr-statistics__stage {
  max-width:min(1560px, 100%) !important;
  display:grid !important;
  grid-template-columns:minmax(0, 1fr) clamp(280px, 23vw, 400px) !important;
  column-gap:clamp(30px, 3.4vw, 76px) !important;
  align-items:start !important;
  /* a tall scroll folds out at its foot instead of slicing the last row mid-glyph
     (the authored pattern of this sheet's own short-frame bands) */
  -webkit-mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 44px), transparent 100%) !important;
  mask-image:linear-gradient(180deg, #000 0, #000 calc(100% - 44px), transparent 100%) !important;
}
${S} .orr-statistics__wall { min-width:0; position:relative; z-index:1; }

/* the witnessed deeds: rungs hanging off a ladder rail, each by when it happened */
${S} .orr-statistics__rungs { list-style:none; margin:0 0 clamp(20px, 3vh, 40px); padding:0 0 0 24px; position:relative; }
${S} .orr-statistics__rungs::before { content:""; position:absolute; left:3px; top:12px; bottom:12px; width:1.5px; background:rgb(${BONE} / .4); }
${S} .orr-statistics__rung { position:relative; margin:0 0 clamp(16px, 2.4vh, 30px); }
${S} .orr-statistics__rung:last-child { margin-bottom:0; }
${S} .orr-statistics__rung::before { content:""; position:absolute; left:-21px; top:.6em; width:10px; height:1.5px; background:rgb(${BONE} / .6); }
${S} .orr-statistics__rung-title { margin:0; ${READ} font-weight:600; font-size:clamp(16px, min(1.05vw, 1.9vh), 20px); line-height:1.25; color:rgb(${WARM}); }
${S} .orr-statistics__rung-text { margin:3px 0 0; ${READ} font-size:clamp(13.5px, .82vw, 16.5px); line-height:1.4; color:rgb(${BONE} / .86); max-width:58ch; }
${S} .orr-statistics__rung-meta { margin:7px 0 0; ${LABEL} font-size:12px; letter-spacing:.18em; color:rgb(${BONE} / .78); }

/* the sheet under the deeds keeps its own groups (styled by statisticsLayouts.js); only its
   footing moves off the wall's last rung */
${S} .orr-statistics__sheet { margin:0; padding:0; }

/* a fresh ledger: one voice, then the scale of what would be counted */
${S} .orr-statistics__empty { margin:clamp(4px, 1vh, 10px) 0 0; max-width:52ch; }
${S} .orr-statistics__promise-scale { list-style:none; margin:clamp(18px, 3vh, 34px) 0 0; padding:clamp(12px, 1.8vh, 20px) 0 0;
  border-top:1px solid rgb(${BONE} / .22); display:flex; flex-wrap:wrap; gap:clamp(14px, 1.8vw, 38px) clamp(18px, 2.4vw, 48px); }
${S} .orr-statistics__promise-word { ${LABEL} font-size:12px; letter-spacing:.22em; color:rgb(${BONE} / .68); display:inline-flex; align-items:center; gap:10px; }
${S} .orr-statistics__promise-word::before { content:""; width:1.5px; height:10px; background:rgb(${BONE} / .5); }

/* the career instrument: the hero reading, the short facts ruled under it */
${S} .orr-statistics__career { position:sticky; top:0; min-width:0; display:flex; flex-direction:column;
  gap:clamp(4px, .8vh, 10px); padding:clamp(6px, 1.2vh, 16px) 0 clamp(12px, 2vh, 28px); }
${S} .orr-statistics__career::before { ${POOL('-8% -18% -12% -26%')} }
${S} .orr-statistics__hero { display:flex; flex-direction:column; gap:clamp(4px, .8vh, 10px); }
${S} .orr-statistics__hero-label { ${LABEL} font-size:12px; letter-spacing:.24em; color:rgb(${BONE} / .82); }
${S} .orr-statistics__hero-n { margin:0; ${NUMERAL} font-size:clamp(52px, min(4.4vw, 8.5vh), 92px); line-height:.9; color:var(--dp-phos, #dfeeff);
  text-shadow:0 0 14px rgb(143 203 255 / .22); white-space:nowrap; }
${S} .orr-statistics__hero-u { ${LABEL} font-size:clamp(12px, .66vw, 14px); letter-spacing:.18em; color:rgb(${BONE} / .82); margin-left:10px; }
${S} .orr-statistics__hero-rule { height:1.5px; margin:clamp(8px, 1.4vh, 18px) 0 clamp(4px, .8vh, 10px);
  background:linear-gradient(90deg, rgb(${BONE} / .42), rgb(${BONE} / 0)); }
${S} .orr-statistics__facts { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
${S} .orr-statistics__fact { display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:baseline; column-gap:18px;
  padding:clamp(5px, .7vh, 9px) 0; border-top:1px solid rgb(${BONE} / .2); }
${S} .orr-statistics__fact:first-child { border-top:0; padding-top:0; }
${S} .orr-statistics__fact-w { ${LABEL} font-size:12px; letter-spacing:.18em; color:rgb(${BONE} / .8); }
${S} .orr-statistics__fact-n { ${NUMERAL} font-size:clamp(19px, 1.5vw, 27px); line-height:1.05; color:var(--dp-phos, #dfeeff);
  text-shadow:0 0 14px rgb(143 203 255 / .2); white-space:nowrap; }

/* narrow frames: one column; the career instrument condenses to a band over the wall —
   the width axis and tracking absorb the squeeze, the 12px floor holds */
@media (max-width:1100px) {
  ${S} > .sf-statistics.k-stage.orr-statistics__stage { grid-template-columns:minmax(0, 1fr) !important; row-gap:clamp(10px, 1.6vh, 20px) !important; }
  ${S} .orr-statistics__career { position:static; padding:0 0 clamp(6px, 1vh, 12px); }
  ${S} .orr-statistics__career::before { inset:-10% -12% -18% -8%; }
  ${S} .orr-statistics__hero { flex-direction:row; align-items:baseline; column-gap:clamp(14px, 2vw, 28px); }
  ${S} .orr-statistics__hero-n { font-size:clamp(38px, 5.4vw, 62px); }
  ${S} .orr-statistics__hero-rule { display:none; }
  ${S} .orr-statistics__facts { flex-direction:row; flex-wrap:wrap; column-gap:clamp(16px, 2.2vw, 36px); row-gap:2px; }
  ${S} .orr-statistics__fact { display:inline-flex; align-items:baseline; column-gap:9px; border-top:0; padding:0; }
  ${S} .orr-statistics__fact-n { font-size:clamp(16px, 1.7vw, 22px); }
}
`;

const A = 'html body #screens > .k-screen.con-achievements';

const ACHIEVEMENTS = `
/* achievements polish over constellationLayouts.js (kept here so that shared sheet stays owned by
   the research lane): the reading column's earned rim already carries the date, so nothing else
   in the column needs to; the column breathes against the frame's foot at the tall end. */
${A} > .con-medal-read { padding-bottom:clamp(20px, 5vh, 64px); }
/* the count figure pairs its numeral with its "of" word on one baseline */
${A} .con-medal-read__figure { align-items:baseline; }
`;

const CSS = STATISTICS + ACHIEVEMENTS;

export function injectMetaLedgerLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
