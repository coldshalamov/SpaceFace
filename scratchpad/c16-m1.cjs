const sharp = require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp');
const V = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/ui-review/view/';
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = relLum(...a), y = relLum(...b); return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)); };
async function raw(name) {
  const { data, info } = await sharp(V + name).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
const px = (I, x, y) => [I.data[(y * I.w + x) * I.ch], I.data[(y * I.w + x) * I.ch + 1], I.data[(y * I.w + x) * I.ch + 2]];
const lum = (I, x, y) => { const [r, g, b] = px(I, x, y); return luma(r, g, b); };
(async () => {
  const A = await raw('c16-arr1920.png'), F = await raw('c16-focus1920.png');
  console.log('size', A.w, A.h, F.w, F.h);

  // 1. DIFF arrival vs focus: list changed regions (luma delta > 12), coarse grid 8px
  const blocks = new Map();
  for (let y = 0; y < A.h; y += 4) for (let x = 0; x < A.w; x += 4) {
    const d = Math.abs(lum(A, x, y) - lum(F, x, y));
    if (d > 12) { const k = `${Math.floor(x / 40) * 40},${Math.floor(y / 40) * 40}`; blocks.set(k, (blocks.get(k) || 0) + 1); }
  }
  console.log('--- changed 40px blocks (count>3) ---');
  [...blocks.entries()].filter(([k, n]) => n > 3).sort((a, b) => b[1] - a[1]).slice(0, 30)
    .forEach(([k, n]) => console.log(k, n));

  // 2. Voice arc band along length (arrival): scan rows, window x 1100-1210
  console.log('--- voice arc scan (arrival): y, peakX, peak, bandEst, glass, ratio ---');
  for (let y = 380; y <= 740; y += 20) {
    let peak = 0, peakX = 0; const vals = [];
    for (let x = 1100; x <= 1212; x++) { const L = lum(A, x, y); vals.push(L); if (L > peak) { peak = L; peakX = x; } }
    vals.sort((a, b) => a - b);
    const band = vals[Math.floor(vals.length * 0.82)];
    // glass: dark side right of arc
    let g = [];
    for (let x = 1216; x <= 1236; x++) g.push(lum(A, x, y));
    g.sort((a, b) => a - b);
    const glass = g[Math.floor(g.length / 2)];
    const bp = px(A, Math.round(peakX), y);
    const bandRGB = [band, band, band], glassRGB = [glass, glass, glass];
    console.log(y, peakX, peak.toFixed(0), band.toFixed(0), glass.toFixed(0), ratio(bandRGB, glassRGB).toFixed(2));
  }

  // 3. Reply spine column x=650 (arrival+focus), y 475-626
  console.log('--- reply spine x=649..651 mean per 8px (arr / focus) ---');
  for (let y = 475; y <= 626; y += 8) {
    const mA = (lum(A, 649, y) + lum(A, 650, y) + lum(A, 651, y)) / 3;
    const mF = (lum(F, 649, y) + lum(F, 650, y) + lum(F, 651, y)) / 3;
    console.log(y, mA.toFixed(0), mF.toFixed(0));
  }
  // seam check rows 520-530, 572-582 focus
  console.log('--- seam rows focus x=650 ---');
  for (let y = 519; y <= 530; y++) console.log('y' + y, lum(F, 650, y).toFixed(0));
  for (let y = 571; y <= 583; y++) console.log('y' + y, lum(F, 650, y).toFixed(0));

  // 4. Focused row bg: row y=556 (reply2 mid) x 660..960 step 20, focus vs arrival
  console.log('--- row y=556 focus vs arrival x660-960 ---');
  let row = [];
  for (let x = 660; x <= 960; x += 10) row.push(`${x}:${lum(F, x, 556).toFixed(0)}/${lum(A, x, 556).toFixed(0)}`);
  console.log(row.join(' '));
  console.log('--- col x=700 focus y520-600 step4 ---');
  row = [];
  for (let y = 520; y <= 600; y += 4) row.push(`${y}:${lum(F, 700, y).toFixed(0)}`);
  console.log(row.join(' '));

  // 5. Ladder band x=37 mean y 350-450 + core
  console.log('--- ladder x=35..42 mean per 10px (arrival) ---');
  for (let y = 350; y <= 450; y += 10) {
    let s = 0; for (let x = 35; x <= 42; x++) s += lum(A, x, y);
    console.log(y, (s / 8).toFixed(0), 'core39-40:', ((lum(A, 39, y) + lum(A, 40, y)) / 2).toFixed(0), 'glass30:', lum(A, 30, y).toFixed(0));
  }
})();
