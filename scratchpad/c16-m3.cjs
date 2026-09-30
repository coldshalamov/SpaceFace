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

  // 1. Leader hunt: rows 430-480, max in x1000-1120 + argmax
  console.log('--- leader hunt (arrival) row: max@x ---');
  for (let y = 430; y <= 480; y += 2) {
    let m = 0, mx = 0;
    for (let x = 1000; x <= 1120; x++) { const L = lum(A, x, y); if (L > m) { m = L; mx = x; } }
    if (m > 40) console.log(y, m.toFixed(0) + '@' + mx);
  }

  // 2. Tab bead neighborhood diff x750-775 y1050-1062
  console.log('--- tab bead diffs |d|>12 x750-775 y1050-1062 ---');
  { let o = []; for (let y = 1050; y <= 1062; y++) for (let x = 750; x <= 775; x++) {
      const d = lum(F, x, y) - lum(A, x, y); if (Math.abs(d) > 12) o.push(`${x},${y}:${lum(A, x, y).toFixed(0)}->${lum(F, x, y).toFixed(0)}`); }
    console.log(o.join(' ')); }

  // 3. Envelope bar map: rows 470-690 step 3, count cols x1100-1170 where F-A>+40 (added) and <-40 (removed); peak added luma
  console.log('--- envelope rows: added/removed/peakF ---');
  for (let y = 470; y <= 690; y += 3) {
    let add = 0, rem = 0, pk = 0;
    for (let x = 1100; x <= 1170; x++) { const d = lum(F, x, y) - lum(A, x, y); if (d > 40) { add++; pk = Math.max(pk, lum(F, x, y)); } if (d < -40) rem++; }
    if (add > 2 || rem > 2) console.log(y, `+${add}/-${rem}`, 'pk' + pk.toFixed(0));
  }

  // 4. Dial track: rows 590-800 step 20, core=argmax x1015-1095 (arrival)
  console.log('--- dial track (arrival): y coreX core band glass ---');
  for (let y = 590; y <= 800; y += 20) {
    let m = 0, cx = 0;
    for (let x = 1015; x <= 1095; x++) { const L = lum(A, x, y); if (L > m) { m = L; cx = x; } }
    const band = med([lum(A, cx - 3, y), lum(A, cx - 4, y), lum(A, cx + 3, y), lum(A, cx + 4, y)]);
    const glass = med([lum(A, cx - 12, y), lum(A, cx - 14, y)]);
    console.log(y, cx, m.toFixed(0), band.toFixed(0), glass.toFixed(0), ratioG(band, glass).toFixed(2));
  }

  // 5. Dial numerals: scan for glyph peaks near ticks. tick1 ~(1040,615)? find bright in boxes
  console.log('--- dial numeral boxes (arrival) max ---');
  const boxes = [[1025, 605, 25, 20], [1060, 690, 25, 22], [1100, 785, 25, 22]];
  for (const [x0, y0, w, h] of boxes) {
    let m = 0, mp = '';
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const L = lum(A, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log(`box ${x0},${y0}`, m.toFixed(0) + '@' + mp, 'glass' + lum(A, x0 + 2, y0 + h - 1).toFixed(0));
  }

  // 6. Standing tick color: focus pixels along (1195,405)-(1188,430): RGB
  console.log('--- standing tick RGB (focus) ---');
  for (const [x, y] of [[1196, 403], [1194, 409], [1192, 415], [1190, 421], [1188, 427]]) {
    const [r, g, b] = px(F, x, y); console.log(x, y, `rgb(${r},${g},${b})`, 'L' + luma(r, g, b).toFixed(0));
  }
  console.log('--- standing tick old pos (arrival) ---');
  for (const [x, y] of [[1180, 449], [1176, 453], [1174, 459], [1166, 463]]) {
    const [r, g, b] = px(A, x, y); console.log(x, y, `rgb(${r},${g},${b})`, 'L' + luma(r, g, b).toFixed(0));
  }
  // 7. Preview envelope bar RGB (focus)
  { const [r, g, b] = px(F, 1158, 510); console.log('envelope bar focus 1158,510', `rgb(${r},${g},${b})`); }
  // 8. Dial cursor arrow peak (arrival tick1, focus tick2)
  { let m = 0, mp = ''; for (let y = 595; y <= 635; y++) for (let x = 1030; x <= 1075; x++) { const L = lum(A, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log('dial cursor arr peak', m.toFixed(0) + '@' + mp); }
  { let m = 0, mp = ''; for (let y = 685; y <= 725; y++) for (let x = 1055; x <= 1100; x++) { const L = lum(F, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log('dial cursor focus peak', m.toFixed(0) + '@' + mp); }
})();
