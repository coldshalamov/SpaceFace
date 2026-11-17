// The installed ship is visible alongside equipment inspection. This sheet owns only
// the new ship surface; the canonical armory sheet still owns the catalog and purchases.
const S = 'html body #screens > .k-screen.orr-crucible.sf-crucible-draft.orr-visual-armory';
const CSS = `
${S} { user-select:none; -webkit-user-select:none; }
${S} :is(input,textarea,[contenteditable="true"]) { user-select:text; -webkit-user-select:text; }
${S} .orr-armory-ship { order:-1; min-width:0; width:100%; margin:0 0 16px; padding:0 0 14px; border-bottom:1px solid var(--armory-rule,var(--dp-line)); }
${S} .orr-armory-ship-head { display:flex; justify-content:space-between; gap:12px; align-items:baseline; margin:0 0 4px; }
${S} .orr-armory-ship-head > span { font:600 12px/1.4 var(--dp-face-read,'Instrument Sans'),sans-serif; color:var(--armory-cool,var(--dp-ink-dim)); letter-spacing:.08em; text-transform:uppercase; }
${S} .orr-armory-ship-name { margin:0; font:750 24px/1.2 var(--dp-face-display,'Archivo'),sans-serif; color:var(--dp-ink); letter-spacing:-.025em; }
${S} .orr-armory-ship-stage { position:relative; isolation:isolate; width:100%; height:clamp(170px,21vh,260px); overflow:hidden; background:radial-gradient(ellipse at 50% 60%,#304955,#12212b 65%,#0c171e); border:1px solid var(--armory-rule,var(--dp-line)); border-radius:3px; }
${S} .orr-armory-ship-stage > .k-stage__poster,
${S} .orr-armory-ship-stage > .k-world--stage { position:absolute !important; inset:0 !important; display:block !important; width:100% !important; height:100% !important; min-width:0 !important; max-width:none !important; max-height:none !important; margin:0 !important; object-fit:contain; pointer-events:none; }
${S} .orr-armory-ship-stage > .k-stage__poster { z-index:2 !important; opacity:1; transition:opacity 160ms ease; }
${S} .orr-armory-ship-stage > .k-world--stage { z-index:1 !important; opacity:0; }
${S} .orr-armory-ship-stage.is-live > .k-stage__poster { opacity:0; }
${S} .orr-armory-ship-stage.is-live > .k-world--stage { opacity:1; }
${S} .orr-armory-ship-note { margin:7px 0 0; color:var(--dp-ink-dim); font:500 13px/1.5 var(--dp-face-read,'Instrument Sans'),sans-serif; }
@media(max-width:760px) { ${S} .orr-armory-ship-stage { height:190px; } }
@media(max-height:650px) and (min-width:761px) { ${S} .orr-armory-ship-stage { height:150px; } }
@media(prefers-reduced-motion:reduce) { ${S} .orr-armory-ship-stage > .k-stage__poster { transition:none; } }
${S.replace('html ', 'html.sf-reduce-motion ')} .orr-armory-ship-stage > .k-stage__poster { transition:none; }
`;

export function injectSwarmArmoryShip(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('sf-swarm-armory-ship-style')) return;
  const style = doc.createElement('style'); style.id = 'sf-swarm-armory-ship-style';
  style.textContent = CSS; doc.head.appendChild(style);
}
