import { injectOrrery } from './tokens.js';
export function injectManifestLayouts() {
  injectOrrery();
  if (document.getElementById('sf-manifest-layout')) return;
  const style = document.createElement('style'); style.id = 'sf-manifest-layout';
  style.textContent = `
  .orr-manifest {display:grid!important;grid-template-rows:auto minmax(0,1fr) auto;gap:20px;padding:clamp(24px,4vw,72px);}
  .orr-manifest .manifest-body {overflow:auto;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,1fr);gap:28px;align-content:start;}
  .orr-manifest .manifest-hand {display:grid;gap:10px;align-content:start;}
  .orr-manifest .manifest-portfolio {display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-block:20px;}
  .orr-manifest .manifest-tonnes {font-family:var(--dp-face-numeral);font-size:clamp(40px,7vh,86px);font-variant-numeric:tabular-nums;line-height:1.1;}
  .orr-manifest .manifest-log {max-height:11em;overflow:auto;}
  .orr-manifest .manifest-log p {margin-block:6px;}
  .orr-manifest .manifest-card {text-align:left;min-height:48px;white-space:normal;}
  .orr-manifest .manifest-card small {display:block;font-size:12px;color:var(--dp-ink-dim);}
  .orr-manifest .manifest-rules {max-width:72ch;}
  .orr-manifest .manifest-actions {display:flex;flex-wrap:wrap;gap:12px 24px;margin-block:18px;padding:0;list-style:none;}
  @media(max-width:760px){.orr-manifest{gap:12px;padding:20px;}.orr-manifest .manifest-body{grid-template-columns:1fr;}.orr-manifest .manifest-hand{grid-template-columns:repeat(2,minmax(0,1fr));}.orr-manifest .manifest-log{max-height:6em;}}
  `;
  document.head.appendChild(style);
}
