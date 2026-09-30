const sharp = require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp');
const V = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/ui-review/view/';
const O = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/ui-review/crops/';
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
async function raw(name) {
  const { data, info } = await sharp(V + name).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
const px = (I, x, y) => [I.data[(y * I.w + x) * I.ch], I.data[(y * I.w + x) * I.ch + 1], I.data[(y * I.w + x) * I.ch + 2]];
const lum = (I, x, y) => { const [r, g, b] = px(I, x, y); return luma(r, g, b); };
(async () => {
  const A = await raw('c16-arr1920.png'), F = await raw('c16-focus1920.png'), D = await raw('c16-arr1280.png');

  // 1. Leader level luma: y445-446 x1030-1100 mean; dot: x1015-1035 y440-450 max
  { let s = 0, n = 0; for (let y = 445; y <= 446; y++) for (let x = 1040; x <= 1095; x++) { s += lum(A, x, y); n++; }
    console.log('leader level mean:', (s / n).toFixed(0)); }
  { let m = 0, mp = ''; for (let y = 440; y <= 450; y++) for (let x = 1015; x <= 1035; x++) { const L = lum(A, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log('leader dot max:', m.toFixed(0) + '@' + mp); }
  // elbow luma: sample (1112,453),(1118,460)
  console.log('elbow 1112,453:', lum(A, 1112, 453).toFixed(0), '1118,460:', lum(A, 1118, 460).toFixed(0));

  // 2. Amber + bright scan x20-70 y370-470 (arrival): amber = R-B>60 & R>120
  { let amber = [], bright = [];
    for (let y = 370; y <= 470; y++) for (let x = 20; x <= 70; x++) {
      const [r, g, b] = px(A, x, y);
      if (r - b > 60 && r > 120) amber.push(`${x},${y}:(${r},${g},${b})`);
      if (luma(r, g, b) > 190) bright.push(`${x},${y}:${luma(r, g, b).toFixed(0)}`);
    }
    console.log('AMBER pixels:', amber.slice(0, 25).join(' ') || 'NONE');
    console.log('BRIGHT>190:', bright.slice(0, 25).join(' ') || 'NONE'); }

  // 3. Bar direction: row 480 arrival x1100-1210 step 4
  { let r = []; for (let x = 1100; x <= 1210; x += 4) r.push(`${x}:${lum(A, x, 480).toFixed(0)}`); console.log('row480arr', r.join(' ')); }
  // envelope row 521 focus x1120-1200 step 4
  { let r = []; for (let x = 1120; x <= 1200; x += 4) r.push(`${x}:${lum(F, x, 521).toFixed(0)}`); console.log('row521foc', r.join(' ')); }
  // reply1 envelope row 482 arrival x1120-1200 step 4
  { let r = []; for (let x = 1120; x <= 1200; x += 4) r.push(`${x}:${lum(A, x, 482).toFixed(0)}`); console.log('row482arr', r.join(' ')); }

  // 4. 1280: ladder hunt x8-60 y180-320 max; dial track max x680-780 y380-540; arc core x750-830 y250-500
  { let m = 0, mp = ''; for (let y = 180; y <= 320; y++) for (let x = 8; x <= 60; x++) { const L = lum(D, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log('1280 ladder max:', m.toFixed(0) + '@' + mp); }
  { let m = 0, mp = ''; for (let y = 380; y <= 540; y++) for (let x = 680; x <= 780; x++) { const L = lum(D, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log('1280 dial max:', m.toFixed(0) + '@' + mp); }
  { let m = 0, mp = ''; for (let y = 250; y <= 500; y++) for (let x = 750; x <= 830; x++) { const L = lum(D, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log('1280 arc max:', m.toFixed(0) + '@' + mp); }

  // 5. New zoom crops
  const jobs = [
    ['c16-focus1920.png', 'c16-ztick1F.png', 1030, 595, 50, 40, 8],
    ['c16-arr1920.png', 'c16-ztick2A.png', 1055, 690, 50, 30, 8],
    ['c16-arr1920.png', 'c16-ztick3A.png', 1105, 785, 45, 30, 8],
    ['c16-focus1920.png', 'c16-ztick3F.png', 1105, 785, 45, 30, 8],
    ['c16-focus1920.png', 'c16-zstandF.png', 1175, 380, 40, 60, 6],
    ['c16-arr1920.png', 'c16-zstandA.png', 1155, 430, 40, 45, 6],
    ['c16-focus1920.png', 'c16-zenv.png', 1120, 495, 70, 150, 4],
  ];
  for (const [src, out, left, top, width, height, k] of jobs) {
    await sharp(V + src).extract({ left, top, width, height }).resize(width * k, height * k, { kernel: 'nearest' }).png().toFile(O + out);
    console.log('wrote', out);
  }
})();
