// UI polish overlay for the Circuits board (raceBoard) and the physics-venue board that shares its
// `.race-board` classes. Both mount as a `.k-screen`, whose kit grid ("title" / "hang stage" / "foot")
// auto-placed every child into zero-height rows: the fit selects and buttons (kit `.k-word`, 30px)
// spilled over the course cards and stacked on top of each other at 1280×720 and 960×540.
// This sheet gives the board its own document flow: a fit rail of labelled fields, three course
// cards, then the paint / recognition panels side by side. Scoped to `#screens .k-screen.race-board`;
// selectors/IDs unchanged, no data or launch logic touched.

const STYLE_ID = 'sf-orrery-race-board-layouts';
const R = 'html body #screens .k-screen.race-board';
const BONE = '236 230 216';
const ETCH = 'font-family:var(--dp-face-etch, "Archivo"), sans-serif !important; font-stretch:112% !important; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important; font-style:normal !important;';
const READ = 'font-family:var(--dp-face-read, "Instrument Sans"), system-ui, sans-serif !important; font-variation-settings:normal !important; font-stretch:100% !important; text-transform:none !important; letter-spacing:0 !important;';
const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23f2b950' stroke-width='1.6'/%3E%3C/svg%3E\")";

export const RACE_BOARD_LAYOUT_CSS = `
/* ---------- the board is a scrolling document, not the kit's three-row grid ---------- */
${R} {
  display:grid !important; grid-template-columns:repeat(2, minmax(0, 1fr)) !important;
  grid-template-areas:none !important; grid-template-rows:none !important; grid-auto-rows:auto !important;
  align-content:start !important; column-gap:16px !important; row-gap:0 !important;
  overflow-x:hidden !important; overflow-y:auto !important; overscroll-behavior:contain;
  padding:clamp(26px, 6vh, 72px) clamp(20px, 5vw, 96px) clamp(36px, 7vh, 80px) !important; }
${R}::before { position:fixed !important;
  background:linear-gradient(90deg, rgb(6 8 11 / .95), rgb(6 8 11 / .88) 55%, rgb(6 8 11 / .8)) !important; }
${R} > * { grid-column:1 / -1 !important; grid-area:auto / 1 / auto / -1 !important; min-width:0; max-width:1400px; }
${R} .k-word::after { display:none !important; }

/* ---------- head ---------- */
${R} > .k-title { margin:0 0 clamp(14px, 2.6vh, 26px) !important; }
${R} > .k-title > .k-sentence:first-child { ${ETCH} font-size:12px !important; letter-spacing:.18em !important;
  color:var(--dp-lamp, #f2b950) !important; margin:0 0 6px !important; }
${R} > .k-title > .k-display { font-size:clamp(28px, 3.6vw, 64px) !important; line-height:.95 !important; margin:0 0 10px !important; }
${R} > .k-title > .k-sentence:last-child { ${READ} font-size:clamp(13.5px, .95vw, 16px) !important; line-height:1.5 !important;
  color:rgb(${BONE} / .8) !important; max-width:68ch !important; }

/* ---------- fit rail: labelled fields + toggles, Back at the far end ---------- */
${R} > .race-board-tools { display:flex !important; flex-wrap:wrap !important; align-items:flex-end !important;
  gap:12px 14px !important; margin:0 0 10px !important; padding:14px 16px !important; box-sizing:border-box;
  background:rgb(14 17 22 / .82) !important; border:1px solid rgb(${BONE} / .1) !important; border-radius:2px; }
${R} .race-board-tools > label.k-sentence,
${R} .race-board-result > label.k-sentence { display:flex !important; flex-direction:column !important; gap:6px !important;
  ${ETCH} font-size:12px !important; line-height:1 !important; letter-spacing:.14em !important;
  color:var(--dp-ink-mute, #b0aea6) !important; margin:0 !important; max-width:none !important; }
${R} .race-board-tools > label.k-sentence { flex:1 1 150px !important; min-width:140px !important; max-width:240px !important; }
${R} .race-board-result > label.k-sentence { max-width:320px !important; margin:10px 0 6px !important; }
${R} select.k-word { appearance:none !important; -webkit-appearance:none !important; box-sizing:border-box !important;
  width:100% !important; min-height:40px !important; margin:0 !important; padding:8px 32px 8px 12px !important;
  ${READ} font-size:15px !important; font-weight:500 !important; line-height:1.2 !important; color:var(--dp-ink, #e8e2d4) !important;
  background:rgb(6 8 11 / .72) ${CHEVRON} no-repeat right 12px center / 10px 6px !important;
  border:1px solid rgb(${BONE} / .2) !important; border-radius:2px !important; cursor:pointer; }
${R} select.k-word option { background:#12161c; color:#e8e2d4; }
${R} select.k-word:hover:not(:disabled) { border-color:rgb(${BONE} / .42) !important; }
${R} select.k-word:disabled { opacity:.5 !important; cursor:not-allowed; }
${R} :is(select, button).k-word:focus-visible { outline:2px solid var(--dp-lamp, #f2b950) !important; outline-offset:2px !important; }
${R} .race-board-tools > button.k-word,
${R} .race-board-result > button.k-word { display:inline-flex !important; align-items:center !important; box-sizing:border-box !important;
  min-height:40px !important; margin:0 !important; padding:0 14px !important; white-space:nowrap !important;
  ${ETCH} font-size:12.5px !important; letter-spacing:.12em !important; line-height:1 !important;
  color:var(--dp-ink, #e8e2d4) !important; background:rgb(6 8 11 / .55) !important;
  border:1px solid rgb(${BONE} / .2) !important; border-radius:2px !important; box-shadow:none !important; text-shadow:none !important; }
${R} .race-board-tools > button.k-word:hover,
${R} .race-board-result > button.k-word:hover { border-color:rgb(${BONE} / .45) !important; }
${R} .race-board-tools > button.k-word[aria-pressed="true"] { color:var(--dp-lamp-hot, #ffd98c) !important; border-color:rgb(242 185 80 / .55) !important; }
${R} .race-board-tools > button.k-word:last-child { margin-left:auto !important; border-color:transparent !important; background:none !important;
  color:var(--dp-ink-mute, #b0aea6) !important; padding:0 6px !important; }
${R} .race-board-tools > button.k-word:last-child::before { content:"\\2039" / ""; margin-right:8px; font-size:18px; line-height:0; }
${R} .race-board-tools > button.k-word:last-child:hover { color:var(--dp-ink, #e8e2d4) !important; }
${R} > p.k-sentence { ${READ} font-size:13.5px !important; line-height:1.5 !important; color:rgb(${BONE} / .74) !important;
  max-width:96ch !important; margin:0 0 18px !important; }
${R} > p.k-sentence:last-child { margin:6px 0 0 !important; color:rgb(${BONE} / .62) !important; }

/* ---------- course cards ---------- */
${R} > .race-board-grid { display:grid !important; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)) !important;
  gap:16px !important; margin:0 0 16px !important; }
${R} .race-board-course { display:flex !important; flex-direction:column !important; padding:18px 18px 8px !important; box-sizing:border-box;
  background:rgb(14 17 22 / .86) !important; border:1px solid rgb(${BONE} / .1) !important; border-radius:2px; }
${R} .race-board-course > p.k-sentence:first-child { ${ETCH} font-size:12px !important; letter-spacing:.18em !important;
  color:var(--dp-lamp, #f2b950) !important; margin:0 0 4px !important; }
${R} .race-board-course > h2.k-t-sub, ${R} .race-board-result > h2.k-t-sub { font-family:var(--dp-face-display, "Archivo"), sans-serif !important;
  font-variation-settings:"wdth" 110, "wght" 800 !important; font-weight:800 !important; letter-spacing:-.005em !important;
  font-size:clamp(19px, 1.5vw, 26px) !important; line-height:1.1 !important; color:var(--dp-ink, #e8e2d4) !important; margin:0 !important; }
${R} .race-board-course > .race-map { width:100% !important; height:auto !important; max-height:150px !important; margin:10px 0 !important; }
${R} .race-board-course > p.k-sentence { ${READ} font-size:13.5px !important; line-height:1.45 !important;
  color:rgb(${BONE} / .78) !important; max-width:none !important; margin:0 0 6px !important; }
${R} .race-board-course > .race-map + p + p { ${ETCH} font-size:12px !important; letter-spacing:.04em !important; font-stretch:92% !important; font-variation-settings:"wdth" 92, "wght" 600 !important; color:var(--dp-ink-mute, #b0aea6) !important; font-variant-numeric:tabular-nums; }
${R} .race-board-contract { display:grid !important; justify-items:start; gap:4px !important; padding:12px 0 !important;
  border-top:1px solid rgb(${BONE} / .1); }
${R} .race-board-contract:not(.race-board-contract ~ .race-board-contract) { margin-top:6px !important; }
${R} .race-board-contract > p.k-sentence { ${READ} font-size:13px !important; line-height:1.4 !important; color:rgb(${BONE} / .74) !important; margin:0 !important; max-width:none !important; }
${R} .race-board-contract > button + p.k-sentence { font-size:12.5px !important; font-variant-numeric:tabular-nums; color:var(--dp-ink-mute, #b0aea6) !important; margin-top:3px !important; }
${R} .race-board-contract > button + p.k-sentence::first-letter { text-transform:uppercase; }
${R} .race-board-contract > button.k-word { display:inline-flex !important; align-items:center !important; box-sizing:border-box !important;
  min-height:38px !important; margin:0 !important; padding:0 16px !important; white-space:nowrap !important;
  ${ETCH} font-size:12.5px !important; letter-spacing:.12em !important; line-height:1 !important;
  color:var(--dp-lamp-hot, #ffd98c) !important; background:rgb(242 185 80 / .06) !important;
  border:1px solid rgb(242 185 80 / .5) !important; border-radius:2px !important; box-shadow:none !important; text-shadow:none !important; }
${R} .race-board-contract > button.k-word:hover:not(:disabled) { background:rgb(242 185 80 / .14) !important; border-color:var(--dp-lamp, #f2b950) !important; }
${R} .race-board-contract:not(.race-board-contract ~ .race-board-contract) > button.race-board-launch {
  color:#17120a !important; background:var(--dp-lamp, #f2b950) !important; border-color:var(--dp-lamp, #f2b950) !important; }
${R} .race-board-contract:not(.race-board-contract ~ .race-board-contract) > button.race-board-launch:hover:not(:disabled) { background:var(--dp-lamp-hot, #ffd98c) !important; }
${R} .race-board-contract > button.k-word:disabled { opacity:.42 !important; cursor:not-allowed; }

/* ---------- physics-venue board: lone Back rail, select + Launch straight in the card ---------- */
${R} > .race-board-tools:has(> button:only-child) { background:none !important; border-color:transparent !important; padding:0 !important; margin:0 0 12px !important; }
${R} > .race-board-tools:has(> button:only-child) > button.k-word { margin-left:-6px !important; }
${R} .race-board-course > h2.k-t-sub + p.k-sentence { margin:6px 0 4px !important; }
${R} .race-board-course > select.k-word { margin:10px 0 0 !important; }
${R} .race-board-course > button.k-word { align-self:flex-start; display:inline-flex !important; align-items:center !important; box-sizing:border-box !important;
  min-height:38px !important; margin:12px 0 10px !important; padding:0 18px !important; white-space:nowrap !important;
  ${ETCH} font-size:12.5px !important; letter-spacing:.12em !important; line-height:1 !important;
  color:#17120a !important; background:var(--dp-lamp, #f2b950) !important; border:1px solid var(--dp-lamp, #f2b950) !important;
  border-radius:2px !important; box-shadow:none !important; text-shadow:none !important; }
${R} .race-board-course > button.k-word:hover { background:var(--dp-lamp-hot, #ffd98c) !important; }

/* ---------- results / paint / recognition panels: two up, after the cards ---------- */
${R} > .race-board-result { padding:18px !important; margin:0 0 16px !important; box-sizing:border-box;
  background:rgb(14 17 22 / .86) !important; border:1px solid rgb(${BONE} / .1) !important; border-radius:2px; }
${R} > .race-board-grid ~ .race-board-result { grid-column:auto !important; grid-area:auto !important; }
${R} .race-board-result > p.k-sentence { ${READ} font-size:13.5px !important; line-height:1.45 !important;
  color:rgb(${BONE} / .78) !important; margin:6px 0 0 !important; max-width:none !important; }
${R} .race-board-result > h2 + p.k-sentence { color:rgb(${BONE} / .66) !important; }
${R} .race-board-result > button.k-word { margin-top:12px !important; }

@media (max-height: 620px) {
  ${R} .race-board-course > .race-map { max-height:110px !important; margin:6px 0 !important; }
}
@media (max-width: 900px) {
  ${R} { grid-template-columns:minmax(0, 1fr) !important; }
  ${R} > .race-board-grid ~ .race-board-result { grid-column:1 / -1 !important; }
}
@media (max-width: 560px) {
  ${R} { padding:22px 16px 40px !important; }
  ${R} .race-board-tools > label.k-sentence { flex:1 1 calc(50% - 7px) !important; max-width:none !important; min-width:0 !important; }
  ${R} .race-board-tools > button.k-word { flex:1 1 auto; justify-content:center; }
  ${R} .race-board-tools > button.k-word:last-child { flex:0 0 auto; }
}
/* 1080p band: lift the whole flow (no getBoundingClientRect positioning on this board). */
@media (min-width: 1800px) and (max-width: 2199px) and (min-height: 900px) { ${R} > * { zoom:1.14; } }
@media (min-width: 2200px) and (min-height: 1200px) { ${R} > * { zoom:1.4; } }
`;

export function injectRaceBoardLayouts() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = RACE_BOARD_LAYOUT_CSS;
  document.head.appendChild(style);
}
