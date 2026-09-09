// Authored operation engravings, not fictional equipment telemetry. Fixed path dictionaries
// keep mission/blueprint strings out of SVG markup and bound node count.
const SEALS = Object.freeze({
  cargo_delivery: '<path d="m48 31 18 10v23L48 74 30 64V41Zm0 0v23m-18-13 18 13 18-13M48 54v20M30 52l18 10 18-10"/>',
  courier: '<path d="M25 42h34l-9-9m9 9-9 9M71 63H37l9-9m-9 9 9 9M23 53h15m20 0h15"/>',
  bounty_hunt: '<circle cx="48" cy="52" r="17"/><circle cx="48" cy="52" r="5"/><path d="M48 27v10m0 30v10M23 52h10m30 0h10M35 39l-6-6m32 6 6-6M35 65l-6 6m32-6 6 6"/>',
  escort: '<path d="m48 27 22 12-5 25-17 14-17-14-5-25Zm0 13v24m-9-16 9-8 9 8M38 61l10 9 10-9"/>',
  survey: '<path d="m48 30 19 39-19-7-19 7Zm0 0v32M25 43a27 27 0 0 1 46 0M22 73h13m26 0h13"/><circle cx="48" cy="49" r="4"/>',
  passenger: '<path d="M31 70V52l7-8h20l7 8v18M38 70V57m20 13V57M29 76h38"/><circle cx="48" cy="33" r="8"/>',
  smuggling: '<path d="m48 29 23 13-23 13-23-13Zm-23 13v24l23 13 23-13V42M48 55v24M20 27l57 55M23 72l10-6m30-26 10-6"/>',
  salvage: '<path d="M36 29v21l12 12 12-12V29M36 29l-8 7v19l20 20 20-20V36l-8-7M40 43h16v11H40Z"/>',
  default: '<path d="M33 29h24l9 10v38H33Zm24 0v12h9M40 49h18M40 57h18M40 65h10"/>',
});
const ALIASES = Object.freeze({ escort_convoy: 'escort', courier_run: 'courier', passenger_transport: 'passenger', transport_passenger: 'passenger', smuggle: 'smuggling', survey_scan: 'survey', salvage_recovery: 'salvage' });
export function contractSealHtml(type) {
  const key = Object.hasOwn(SEALS, type) ? type : (Object.hasOwn(ALIASES, type) ? ALIASES[type] : 'default');
  return `<svg class="cd-contract-seal" viewBox="0 0 96 104" aria-hidden="true" focusable="false" fill="none">` +
    '<path d="M48 4 86 26v48L48 100 10 74V26Z" fill="currentColor" fill-opacity=".07" stroke="currentColor" stroke-width="1.2"/>' +
    '<path d="M48 11 80 30v40L48 92 16 70V30ZM23 27l25-14 25 14M23 77l25 14 25-14" stroke="currentColor" stroke-opacity=".35"/>' +
    '<path d="M6 40h9M6 48h9M6 56h9M81 40h9M81 48h9M81 56h9M39 5v7m9-12v12m9-7v7" stroke="currentColor"/>' +
    `<g stroke="currentColor" stroke-width="1.7" stroke-linejoin="miter" stroke-linecap="square">${SEALS[key]}</g></svg>`;
}
const MACHINES = Object.freeze({
  refine: '<path d="M177 103V50l10-9h28l10 9v53M184 42V28h8v13m17 0V28h8v13M177 61h48m-48 10h48m-48 20h48M225 55h18V37h22v66M242 71h24m-24 14h24M183 103v12m35-12v12m31-12v12m11-12v12M171 115h101M188 50v43m9-43v43m9-43v43m9-43v43M163 79h14m88-20h14"/><path d="m193 18 3-9m5 9 3-9m5 9 3-9" stroke="var(--cd-accent,#efb568)"/>',
  assemble: '<path d="M172 115h98M182 115v-8h78v8M198 106V91h46v15M175 90V42h15v48M250 90V42h15v48M175 42l18-17h53l19 17M190 43l13-9h33l14 9M220 35v19l-11 14 7 12m4-26 11 14-7 12M205 88h30v11h-30ZM167 76h16m75 0h16"/><circle cx="220" cy="27" r="4"/>',
  augment: '<path d="M173 44h36v62h-36ZM230 30h37v76h-37ZM178 51h26v13h-26Zm58-14h25v13h-25ZM179 77h24m-24 8h24m-24 8h24M236 59h25m-25 8h25m-25 8h25m-25 8h25m-25 8h25M190 43V27h22v-9M210 65h20m-20 8h20m-20 8h20M180 106v9m20-9v9m37-9v9m21-9v9M165 116h110"/><path d="m218 54 5 4-5 4m5 27-5 4 5 4" stroke="var(--cd-accent,#efb568)"/>',
  ship: '<path d="M163 114h114M169 114V28h102v86M169 35h102M180 36v60m80-60v60M206 79V48l14-21 14 21v31l16 17v9h-60v-9Zm0-14-14 8v15m42-23 14 8v15M213 47h14v25h-14Zm-7 58v9m28-9v9M180 61h26m28 0h26M179 94h13m56 0h13"/><path d="M211 86h18m-18 6h18m-18 6h18" stroke="var(--cd-accent,#efb568)"/>',
});
/** A category-specific process schematic. Adjacent DOM owns exact materials and outputs. */
export function fabricationArtworkHtml(category) {
  const key = Object.hasOwn(MACHINES, category) ? category : 'assemble';
  return `<svg class="cd-fabricator-art" viewBox="0 0 440 138" aria-hidden="true" focusable="false" fill="none">` +
    '<path d="M7 16v-9h15m411 9v-9h-15M7 122v9h15m411-9v9h-15M23 117h394" stroke="currentColor" stroke-opacity=".28"/>' +
    '<path d="m39 65 22-12 22 12v27l-22 12-22-12Zm0 0 22 13 22-13M61 78v26M90 81h57m-8-7 8 7-8 7M291 81h57m-8-7 8 7-8 7" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="m359 60 22-12 22 12v32l-22 12-22-12Zm0 0 22 13 22-13M381 73v31" fill="var(--cd-accent,#efb568)" fill-opacity=".12" stroke="var(--cd-accent,#efb568)" stroke-width="1.5"/>' +
    '<path d="M102 102h2m6 0h2m6 0h2m6 0h2M303 102h2m6 0h2m6 0h2m6 0h2" stroke="currentColor" stroke-opacity=".5"/>' +
    `<g stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="square">${MACHINES[key]}</g></svg>`;
}
/** Queue telemetry: non-finite, negative, or absent data never paints imaginary progress. */
export function fabricationProgress(queue) {
  if (!queue || !Number.isFinite(queue.total) || queue.total <= 0 || !Number.isFinite(queue.elapsed)) return null;
  const elapsed = Math.min(queue.total, Math.max(0, queue.elapsed));
  return Object.freeze({ percent: Math.floor(elapsed / queue.total * 100), remaining: Math.ceil(queue.total - elapsed) });
}
