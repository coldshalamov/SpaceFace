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
  const A = await raw('c16-arr1920.png'), F = await raw('c16-focus1920.png');

  // 1. Arc track band: core = argmax in x1090-1212; band = median of core+/-{3,4} excl bars(>120); glass right side
  console.log('--- voice track (arrival): y coreX core band glass ratio ---');
  for (let y = 390; y <= 730; y += 20) {
    let peak = 0, cx = 0;
    for (let x = 1090; x <= 1212; x++) { const L = lum(A, x, y); if (L > peak) { peak = L; cx = x; } }
    const adj = [lum(A, cx - 4, y), lum(A, cx - 3, y), lum(A, cx + 3, y), lum(A, cx + 4, y)].filter(v => v < 120);
    const band = adj.length ? med(adj) : NaN;
    const glass = med([1218, 1224, 1230, 1236].map(x => lum(A, x, y)));
    console.log(y, cx, peak.toFixed(0), band.toFixed ? band.toFixed(0) : band, glass.toFixed(0), ratioG(band, glass).toFixed(2));
  }

  // 2. Preview envelope: arrival vs focus on inner side x1100-1160, rows; max |delta| + focus luma there
  console.log('--- inner-side delta A->F per row: y, maxDelta@x, focusLum, arrLum ---');
  for (let y = 420; y <= 720; y += 15) {
    let md = 0, mx = 0;
    for (let x = 1095; x <= 1165; x++) { const d = lum(F, x, y) - lum(A, x, y); if (d > md) { md = d; mx = x; } }
    console.log(y, `d+${md.toFixed(0)}@${mx}`, 'F' + lum(F, mx, y).toFixed(0), 'A' + lum(A, mx, y).toFixed(0));
  }

  // 3. Standing tick hunt: fine diff x1140-1210 y355-475, print cells with |d|>25
  console.log('--- standing region diffs |d|>25 (x,y: A->F) ---');
  let out = [];
  for (let y = 355; y <= 475; y += 2) for (let x = 1140; x <= 1210; x += 2) {
    const d = lum(F, x, y) - lum(A, x, y);
    if (Math.abs(d) > 25) out.push(`${x},${y}:${lum(A, x, y).toFixed(0)}->${lum(F, x, y).toFixed(0)}`);
  }
  console.log(out.slice(0, 40).join(' '));

  // 4. Leader level run: row 455 x1000-1130 arrival
  console.log('--- leader rows 453-457 x1010-1120 (arrival), step 10 ---');
  for (let y = 453; y <= 457; y++) {
    let r = [];
    for (let x = 1010; x <= 1120; x += 10) r.push(`${x}:${lum(A, x, y).toFixed(0)}`);
    console.log('y' + y, r.join(' '));
  }

  // 5. Tab rail y1053-1059 + the (760,1040) diff: compare A/F x740-780 y1035-1065 max delta
  console.log('--- tab rail band rows (arrival) x200-800 mean ---');
  for (let y = 1051; y <= 1061; y++) {
    let s = 0, n = 0; for (let x = 200; x <= 800; x += 4) { s += lum(A, x, y); n++; }
    console.log('y' + y, (s / n).toFixed(0));
  }
  let md = 0, mx = 0, my = 0;
  for (let y = 1030; y <= 1070; y++) for (let x = 730; x <= 790; x++) {
    const d = Math.abs(lum(F, x, y) - lum(A, x, y)); if (d > md) { md = d; mx = x; my = y; }
  }
  console.log('tabrail maxdiff', md.toFixed(0), 'at', mx, my, 'A' + lum(A, mx, my).toFixed(0), 'F' + lum(F, mx, my).toFixed(0));

  // 6. Focus row left edge fine scan y=556 x600-690 + vertical edge x=660 y530-580
  console.log('--- focus y=556 x600-690 step2 ---');
  { let r = []; for (let x = 600; x <= 690; x += 2) r.push(`${x}:${lum(F, x, 556).toFixed(0)}`); console.log(r.join(' ')); }
})();
