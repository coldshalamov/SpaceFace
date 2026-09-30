const sharp = require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp');
const V = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/ui-review/view/';
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const ratioG = (L1, L2) => { const a = lin(L1), b = lin(L2); return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)); };
async function raw(name) {
  const { data, info } = await sharp(V + name).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
const px = (I, x, y) => [I.data[(y * I.w + x) * I.ch], I.data[(y * I.w + x) * I.ch + 1], I.data[(y * I.w + x) * I.ch + 2]];
const lum = (I, x, y) => { const [r, g, b] = px(I, x, y); return luma(r, g, b); };
const med = a => { a = [...a].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
(async () => {
  const A = await raw('c16-arr1920.png'), F = await raw('c16-focus1920.png'), D = await raw('c16-arr1280.png');
  // 1. Numerals, corrected boxes, both shots
  for (const [x0, y0, x1, y1, n] of [[1035, 600, 1056, 626, 'n1'], [1058, 695, 1086, 730, 'n2'], [1108, 793, 1136, 821, 'n3']]) {
    for (const [I, s] of [[A, 'arr'], [F, 'foc']]) {
      let m = 0, mp = '';
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const L = lum(I, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
      console.log(n, s, m.toFixed(0) + '@' + mp);
    }
  }
  // tick3 region diff A vs F (rotation check): count |d|>12 in x1105-1150 y785-815
  { let n = 0; for (let y = 785; y <= 815; y++) for (let x = 1105; x <= 1150; x++) if (Math.abs(lum(F, x, y) - lum(A, x, y)) > 12) n++;
    console.log('tick3-region changed px:', n); }
  // 2. Koda tick: extent rows 434-446 x28-75 (arrival+focus), siblings: Maera row excl arm x44-60 y388-394, Kessler y488-494, Neve y538-544
  console.log('--- koda row profile y440 x28-75 arr/foc ---');
  { let rA = [], rF = []; for (let x = 28; x <= 75; x += 2) { rA.push(lum(A, x, 440).toFixed(0)); rF.push(lum(F, x, 440).toFixed(0)); }
    console.log('A:', rA.join(',')); console.log('F:', rF.join(',')); }
  for (const [y0, y1, n] of [[388, 394, 'maera-x44-60'], [488, 494, 'kessler'], [538, 544, 'neve']]) {
    let mA = 0, mF = 0;
    for (let y = y0; y <= y1; y++) for (let x = 36; x <= 60; x++) { mA = Math.max(mA, lum(A, x, y)); mF = Math.max(mF, lum(F, x, y)); }
    console.log(n, 'A' + mA.toFixed(0), 'F' + mF.toFixed(0));
  }
  // 3. Arc middle rows: inner glass (x1100-1120 med) + band both sides
  console.log('--- arc middle: y band innerGlass ratioInner outerGlass ratioOuter ---');
  const coreX = { 550: 1136, 570: 1136, 590: 1137, 610: 1139, 630: 1143, 650: 1149 };
  for (const y of [550, 570, 590, 610, 630, 650]) {
    const cx = coreX[y];
    const band = med([lum(A, cx - 4, y), lum(A, cx - 3, y), lum(A, cx + 3, y), lum(A, cx + 4, y)].filter(v => v < 120));
    const ig = med([1100, 1105, 1110, 1115, 1120].map(x => lum(A, x, y)));
    const og = med([1218, 1224, 1230, 1236].map(x => lum(A, x, y)));
    console.log(y, band.toFixed(0), ig.toFixed(0), ratioG(band, ig).toFixed(2), og.toFixed(0), ratioG(band, og).toFixed(2));
  }
  // 4. 1280 arc band spot: find track core rows 300-460, band+glass
  console.log('--- 1280 arc: y coreX core band glass ratio ---');
  for (let y = 300; y <= 460; y += 40) {
    let m = 0, cx = 0;
    for (let x = 740; x <= 830; x++) { const L = lum(D, x, y); if (L > m) { m = L; cx = x; } }
    const band = med([lum(D, cx - 3, y), lum(D, cx + 3, y)]);
    const glass = med([lum(D, cx + 14, y), lum(D, cx + 18, y)]);
    console.log(y, cx, m.toFixed(0), band.toFixed(0), glass.toFixed(0), ratioG(band, glass).toFixed(2));
  }
  // 1280 dial + ladder band
  { let m = 0; for (let y = 400; y <= 425; y++) for (let x = 770; x <= 790; x++) m = Math.max(m, lum(D, x, y));
    console.log('1280 dial cursor region max:', m.toFixed(0)); }
  { let s = 0, n = 0; for (let y = 240; y <= 290; y++) for (let x = 36; x <= 42; x++) { s += lum(D, x, y); n++; }
    console.log('1280 ladder band mean x36-42 y240-290:', (s / n).toFixed(0), 'glass x30:', lum(D, 30, 265).toFixed(0)); }
})();
