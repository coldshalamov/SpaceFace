// ORRERY save berth: the one object a save's hull stands on (design/frontend/ORRERY.md §6 Meta, Save/Load).
//
// A landing ring seen in perspective: a lit floor (a soft pool of bone light that fades to the rim), a
// far rim drawn light, a near rim with body (a band with its core and bloom, ticks cut through it), and
// under a hull a contact shadow. The same drawing serves at two sizes: the hero berth under the chosen
// save's hull (and, empty, where no hull is on file), and a small station berth on the filmstrip for every
// slot. It is an image (a data URI), so the sheet places it with `background` and nothing is laid out
// per frame. Strokes do not scale with the box: the band keeps its weight at every size.

const BONE = '236,230,216';
const CX = 200;
const CY = 50;
const RX = 196;
const RY = 46;

const WEIGHTS = {
  // the hero under a hull (1920: ~860 x 150 px)
  hero: { floor: [0.15, 0.07, 0.02], far: [1.8, 0.42], band: [9, 0.26], core: [2.6, 0.82], bloom: [18, 0.08], inner: [1.6, 0.24], tick: [1.6, 0.5], shadow: 0.62 },
  // a slot on the filmstrip (1920: ~150 x 30 px)
  station: { floor: [0.2, 0.1, 0.03], far: [1.4, 0.46], band: [4.5, 0.3], core: [2, 0.78], bloom: [9, 0.12], inner: [1.2, 0.26], tick: [1.2, 0.46], shadow: 0 },
};

const n2 = (v) => Math.round(v * 100) / 100;

/** The berth as an SVG document string. `hull` adds the contact shadow a standing hull throws. */
export function berthSvg({ size = 'hero', hull = false } = {}) {
  const w = WEIGHTS[size] || WEIGHTS.hero;
  const ns = "vector-effect='non-scaling-stroke'";
  const stroke = (a, width) => `fill='none' stroke='rgb(${BONE})' stroke-opacity='${a}' stroke-width='${width}' ${ns}`;
  const parts = [];
  parts.push("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 100' preserveAspectRatio='none'>");
  parts.push('<defs>'
    + `<radialGradient id='f'><stop offset='0' stop-color='rgb(${BONE})' stop-opacity='${w.floor[0]}'/>`
    + `<stop offset='.62' stop-color='rgb(${BONE})' stop-opacity='${w.floor[1]}'/>`
    + `<stop offset='1' stop-color='rgb(${BONE})' stop-opacity='${w.floor[2]}'/></radialGradient>`
    + `<radialGradient id='s'><stop offset='0' stop-color='#000' stop-opacity='${w.shadow}'/><stop offset='.7' stop-color='#000' stop-opacity='${n2(w.shadow * 0.45)}'/>`
    + "<stop offset='1' stop-color='#000' stop-opacity='0'/></radialGradient>"
    + '</defs>');
  // the lit floor
  parts.push(`<ellipse cx='${CX}' cy='${CY}' rx='${RX}' ry='${RY}' fill='url(#f)'/>`);
  // the inner ring on the floor
  parts.push(`<ellipse cx='${CX}' cy='${CY}' rx='${n2(RX * 0.8)}' ry='${n2(RY * 0.8)}' ${stroke(w.inner[1], w.inner[0])}/>`);
  // the contact shadow under a hull
  if (hull && w.shadow > 0) parts.push(`<ellipse cx='${CX}' cy='${CY - 3}' rx='${n2(RX * 0.44)}' ry='${n2(RY * 0.36)}' fill='url(#s)'/>`);
  // the far rim: light
  parts.push(`<path d='M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX + RX} ${CY}' ${stroke(w.far[1], w.far[0])}/>`);
  // the near rim: bloom, band, core
  const near = `M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 0 ${CX + RX} ${CY}`;
  parts.push(`<path d='${near}' ${stroke(w.bloom[1], w.bloom[0])} stroke-linecap='round'/>`);
  parts.push(`<path d='${near}' ${stroke(w.band[1], w.band[0])}/>`);
  parts.push(`<path d='${near}' ${stroke(w.core[1], w.core[0])} stroke-linecap='round'/>`);
  // ticks cut through the near rim's band, a longer one at the front
  const ticks = [];
  const count = size === 'station' ? 12 : 36;
  for (let i = 1; i < count; i += 1) {
    const a = Math.PI * (i / count);
    const major = i === count / 2 || (size === 'hero' && i % 6 === 0);
    const k = major ? 0.86 : 0.93;
    const x0 = CX + RX * Math.cos(a);
    const y0 = CY + RY * Math.sin(a);
    const x1 = CX + RX * k * Math.cos(a);
    const y1 = CY + RY * k * Math.sin(a);
    ticks.push(`M ${n2(x0)} ${n2(y0)} L ${n2(x1)} ${n2(y1)}`);
  }
  parts.push(`<path d='${ticks.join(' ')}' ${stroke(w.tick[1], w.tick[0])}/>`);
  parts.push('</svg>');
  return parts.join('');
}

/** The berth as a CSS background image. */
export function berthImage(o) {
  return `url("data:image/svg+xml,${encodeURIComponent(berthSvg(o))}")`;
}
