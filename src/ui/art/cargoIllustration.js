/** Authored cargo specimens, not inventory screenshots. Every value and transaction remains native UI.
 * Fixed geometry is cheap to paint once on selection; no filter, texture download or render loop.
 */
import { escapeHtml } from '../comms.js';
const PALETTE = Object.freeze({
  ore: '#d5aa75', gas: '#9fc5cf', crystal: '#b2cbbb', exotic: '#ceb4a0',
  refined: '#bdc9ce', component: '#c5b17c', tech: '#a5c5cf', consumer: '#aab9a1',
  luxury: '#d5bc87', food: '#b6c593', med: '#c3d5cf', salvage: '#c9a28c', military: '#c0bca7', contraband: '#d3a59b',
});
export function cargoArtFamily(category) {
  if (category === 'raw ore') return 'ore';
  return Object.hasOwn(PALETTE, category) ? category : 'consumer';
}
const face = (points, fill, extra = '') => `<path d="${points}" fill="${fill}" stroke="#60757c" stroke-width="1.15" stroke-linejoin="bevel" ${extra}/>`;
const line = d => `<path d="${d}" fill="none" stroke="#b0c2c6" stroke-width="1.1" opacity=".65"/>`;
const screw = (x,y) => `<circle cx="${x}" cy="${y}" r="2.1" fill="#151e24" stroke="#9babad" stroke-width=".7"/><path d="m${x-1} ${y}h2" stroke="#bbc8c8" stroke-width=".65"/>`;
function caseBody(accent, wide = false) {
  const x=wide?22:40, w=wide?166:130;
  return face(`M${x} 69l38-22 ${w} 34-38 22Z`,'#65737b') +
    face(`M${x} 69l${w} 34v59L${x} 127Z`,'#374850') +
    face(`M${x+w} 103l38-22v59l-38 22Z`,'#192a32') +
    face(`M${x+6} 76l${w-12} 31v44l-${w-12}-31Z`,'#465962') +
    `<path d="M${x+20} 53l${w} 34m-${w-10}-40 ${w} 34M${x+15} 73v55m${w-31}-29v54" stroke="${accent}" stroke-width="6"/>` +
    line(`M${x+34} 55l${w-31} 26M${x+28} 87l${w-60} 17m-${w-60}-12 ${w-60} 17`) +
    face(`M${x+50} 107l30 8v10l-30-8Z`,'#18252b') +
    `<path d="M${x+55} 114l20 5" stroke="#93a3a4" stroke-width="2"/>` +
    [screw(x+9,80),screw(x+w-10,110),screw(x+9,119),screw(x+w-10,147)].join('');
}
function pressureVessel(accent) {
  return face('M65 53l21-15 76 22 13 23-15 59-22 16-71-25-15-21Z','#23363f') +
    `<path d="M64 55c-4-19 17-25 33-18l58 18c25 8 30 29 13 36l-20 7-78-22Z" fill="#78878d" stroke="#b6c1c0"/>`+
    face('M71 74l78 23-11 61-74-24Z','#40565f')+
    `<path d="m77 64 76 22m-83 6 77 24m-83-5 78 23" stroke="#182b33" stroke-width="8"/>
     <path d="m77 61 76 22m-83 6 77 24m-83-5 78 23" stroke="#72868d" stroke-width="3"/>
     <path d="m78 109 46 14-3 13-46-14Z" fill="${accent}"/>
     <path d="m86 119 24 7m-20-3v5m10-2v5" stroke="#243942" stroke-width="2"/>
     <ellipse cx="113" cy="59" rx="18" ry="9" fill="#233941" stroke="#b5c1c2" transform="rotate(17 113 59)"/>
     <path d="m109 42 17 5v12l-17-5Z" fill="#97a7aa"/><path d="m113 44 7 2v6l-7-2Z" fill="${accent}"/>` +
    screw(80,54)+screw(142,72)+screw(68,131)+screw(135,150);
}
function mineral(accent, crystal = false) {
  const shards = crystal ? [
    ['M61 105l12-58 18-19 8 56-9 39Z','#72938f'], ['M73 47l18-19 8 56-17 7Z',accent],
    ['M92 123l11-68 18-19 14 61-13 38Z','#8aabaa'], ['M103 55l18-19 14 61-18 11Z',accent],
    ['M123 137l22-62 23-19 8 47-31 46Z','#668c86'], ['M145 75l23-19 8 47-19 14Z',accent],
  ] : [
    ['M58 110l8-30 28-13 23 20-4 37-23 9Z','#8c9390'], ['M66 80l28-13 23 20-25 10Z',accent],
    ['M116 127l-8-33 26-32 23 2 24 36-12 27-24 13Z','#687e82'], ['M134 62l23 2 24 36-34-2-39-4Z',accent],
    ['M74 137l13-16 27 6 2 21-20 10Z','#74817a'], ['M87 121l27 6-18 13-22-3Z','#c8c5ae'],
  ];
  return face('M27 130l93-40 97 37-92 47Z','#1a2c34')+
    face('M27 130l98 37 92-40v12l-92 44-98-40Z','#445861')+
    `<path d="m32 130 93 32 86-35" fill="none" stroke="#9dadac" stroke-width="2"/>`+
    shards.map(([d,c])=>face(d,c)).join('')+line('M66 83l24 15-2 32M137 69l11 33-5 29')+
    face('M39 141l31 11v6l-31-11Z',accent);
}
function circuit(accent) {
  return face('M38 103l72-57 99 45-72 61Z','#203e43')+
    face('M38 103l99 49v9l-99-48Z','#465e64')+
    face('M137 152l72-61v9l-72 61Z','#14242a')+
    `<g stroke="${accent}" stroke-width="1.25" fill="none"><path d="m58 97 39 17 27-23 28 12m-75 23 20 9 20-18 33 15m-70-58 31 13 16-14 37 15m-113 18 39 19 30-26 44 20"/></g>`+
    face('M98 98l30-25 30 14-28 26Z','#adbabd')+
    face('M98 98l32 15v11l-32-16Z','#71848b')+
    face('M130 113l28-26v11l-28 26Z','#425a64')+
    `<path d="m107 98 21-16 20 9-19 16Z" fill="#354e57"/>`+
    [0,1,2,3,4].map(i=>`<path d="m${46+i*13} ${113+i*6}v7l6 3v-7" fill="${accent}"/>`).join('')+
    screw(56,100)+screw(111,56)+screw(196,90)+screw(134,144);
}
function medical(accent) {
  return caseBody(accent)+`<path d="m93 90 16 4v12l12 3v14l-12-3v12l-16-4v-12l-12-3V99l12 3Z" fill="${accent}" stroke="#d5dfd7"/>
    <path d="m72 57 77 20" stroke="#dce1d8" stroke-width="3"/>`;
}
function machinery(accent, salvaged = false) {
  return face('M36 105l71-43 101 37-69 51Z','#758891')+
    face('M36 105l103 45v22L36 128Z','#3d5662')+
    face('M139 150l69-51v22l-69 51Z','#1b2f38')+
    `<g transform="translate(125 98) rotate(22)"><ellipse rx="45" ry="26" fill="#243b46" stroke="#b3c3c6" stroke-width="4"/>
     <ellipse rx="32" ry="19" fill="#647982" stroke="${accent}" stroke-width="7"/><ellipse rx="21" ry="12" fill="#0d202a" stroke="#9dabad" stroke-width="2"/>
     <path d="M-35-15 35 15M-35 15 35-15M0-26v52" stroke="#9aaeb6" stroke-width="4"/>
     <ellipse rx="11" ry="7" fill="${accent}" stroke="#d2d8cd"/></g>`+
    [0,1,2,3].map(i=>line(`M${45+i*18} ${118+i*8}v9`)).join('')+
    (salvaged?`<path d="m82 57 18 5-8 20-16 3m95 52 19-4-7 22-17-7" fill="#b2937b" stroke="#ded1b9"/>`:'')+
    screw(45,107)+screw(138,158);
}
function ordnance(accent) {
  return face('M32 116l69-48 112 47-66 52Z','#2b3d45')+
    [0,1,2].map(i=>`<g transform="translate(${i*28} ${i*11})"><path d="M54 102 101 57l14 8-43 48Z" fill="#92978a" stroke="#c3c5b6"/>
      <path d="m54 102 18 11-7 12-17-10Z" fill="#394c50" stroke="#a7b5af"/>
      <path d="m101 57 16-8-2 16Z" fill="${accent}"/>
      <path d="m86 72 13 8" stroke="${accent}" stroke-width="6"/></g>`).join('')+
    face('M32 116l115 51v11L32 127Z','#455952')+screw(42,123);
}
export function cargoIllustration(commodity, { small = false } = {}) {
  const family=cargoArtFamily(commodity?.category), accent=PALETTE[family];
  let art;
  switch(family) {
    case 'ore': art=mineral(accent); break;
    case 'crystal': case 'exotic': art=mineral(accent,true); break;
    case 'gas': art=pressureVessel(accent); break;
    case 'component': case 'salvage': art=machinery(accent,family==='salvage'); break;
    case 'tech': art=circuit(accent); break;
    case 'med': art=medical(accent); break;
    case 'military': art=ordnance(accent); break;
    default: art=caseBody(accent,family==='refined');
  }
  return `<svg class="cd-cargo-art${small?' cd-cargo-art--small':''}" data-family="${family}" viewBox="0 0 240 190" fill="none" aria-hidden="true" focusable="false">
    <path d="M24 149l99 37 94-46" stroke="#6b858d" opacity=".35"/>${art}</svg>`;
}
/** Hold occupancy and the contemplated change, not a made-up packing simulation. */
export function cargoCapacityHtml(cargo = {}, delta = 0) {
  const cap=Number(cargo.capVolume),used=Number(cargo.usedVolume);
  if (!Number.isFinite(cap)||cap<=0||!Number.isFinite(used)) return '';
  const next=Math.max(0,used+(Number(delta)||0));
  const occupied=Math.min(1,Math.max(0,used/cap)), projected=Math.min(1,next/cap);
  const label=`Hold: ${Math.round(used)} of ${Math.round(cap)} units${delta?`; after trade ${Math.round(next)}`:''}`;
  return `<div class="cd-hold" aria-label="${escapeHtml(label)}" data-overflow="${next>cap}" data-direction="${delta<0?'sell':'buy'}">
    <div class="cd-hold__labels"><span>Hold occupancy</span><strong>${Math.round(used)} <small>/ ${Math.round(cap)} u</small></strong></div>
    <div class="cd-hold__track" aria-hidden="true"><span class="cd-hold__projected" style="transform:scaleX(${projected})"></span><span class="cd-hold__current" style="transform:scaleX(${occupied})"></span></div>
    ${delta?`<p class="cd-hold__projection">${delta>0?'+':''}${Math.round(delta)} u · ${Math.round(cap-next)} u free after trade</p>`:''}</div>`;
}
