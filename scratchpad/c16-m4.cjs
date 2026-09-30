const sharp = require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp');
const V = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/ui-review/view/';
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
async function raw(name) {
  const { data, info } = await sharp(V + name).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
const px = (I, x, y) => [I.data[(y * I.w + x) * I.ch], I.data[(y * I.w + x) * I.ch + 1], I.data[(y * I.w + x) * I.ch + 2]];
const lum = (I, x, y) => { const [r, g, b] = px(I, x, y); return luma(r, g, b); };
(async () => {
  const A = await raw('c16-arr1920.png'), F = await raw('c16-focus1920.png'), D = await raw('c16-arr1280.png');

  // 1. Leader full scan: pixels >40 in x1020-1140 y445-465 (arrival)
  console.log('--- leader pixels>40 x1020-1140 y445-465 arr (runs) ---');
  for (let y = 445; y <= 465; y++) {
    let run = [], s = -1;
    for (let x = 1020; x <= 1140; x++) { const L = lum(A, x, y); if (L > 40 && s < 0) s = x; if (L <= 40 && s >= 0) { run.push(`${s}-${x - 1}`); s = -1; } }
    if (s >= 0) run.push(`${s}-1140`);
    if (run.length) console.log(y, run.join(' '));
  }

  // 2. Hand check: RGB at x36-40 y390-400 + y435-445 arrival
  console.log('--- hand hunt RGB (arrival) ---');
  for (let y = 390; y <= 400; y += 2) { const [r, g, b] = px(A, 37, y); console.log(`37,${y}`, `rgb(${r},${g},${b})`); }
  for (let y = 436; y <= 444; y += 2) { const [r, g, b] = px(A, 39, y); console.log(`39,${y}`, `rgb(${r},${g},${b})`); }

  // 3. Dial lower track: rows 715-805 step 5, max in x1040-1140 (arrival)
  console.log('--- dial lower track arr: y max@x ---');
  for (let y = 715; y <= 805; y += 5) {
    let m = 0, mx = 0;
    for (let x = 1040; x <= 1140; x++) { const L = lum(A, x, y); if (L > m) { m = L; mx = x; } }
    console.log(y, m.toFixed(0) + '@' + mx);
  }

  // 4. Numerals in FOCUS shot (cursor moved away from 1)
  console.log('--- numeral boxes focus max ---');
  for (const [x0, y0, w, h, n] of [[1025, 600, 30, 25, 'n1'], [1055, 690, 35, 25, 'n2'], [1095, 780, 35, 28, 'n3']]) {
    let m = 0, mp = '';
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const L = lum(F, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log(n, m.toFixed(0) + '@' + mp);
  }
  // numeral 1 in arrival away from cursor: box left of cursor
  { let m = 0, mp = ''; for (let y = 600; y <= 625; y++) for (let x = 1020; x <= 1042; x++) { const L = lum(A, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log('n1 arrival (left of cursor)', m.toFixed(0) + '@' + mp); }
  // tick marks on dial: cross-tick at tick2 arrival (no cursor there): rows 700-712, max x1060-1100
  { let m = 0, mp = ''; for (let y = 698; y <= 714; y++) for (let x = 1060; x <= 1100; x++) { const L = lum(A, x, y); if (L > m) { m = L; mp = `${x},${y}`; } }
    console.log('tick2 mark arrival', m.toFixed(0) + '@' + mp); }

  // 5. Reply1 envelope absolute (arrival rows 470-494, 551-575): max in x1100-1140
  console.log('--- reply1 envelope absolute (arrival) ---');
  for (let y = 470; y <= 494; y += 6) {
    let m = 0, mx = 0;
    for (let x = 1100; x <= 1140; x++) { const L = lum(A, x, y); if (L > m) { m = L; mx = x; } }
    console.log(y, m.toFixed(0) + '@' + mx);
  }
  // reply2 envelope absolute (focus rows 506-539, 599-635)
  console.log('--- reply2 envelope absolute (focus) ---');
  for (let y = 506; y <= 539; y += 8) {
    let m = 0, mx = 0;
    for (let x = 1100; x <= 1140; x++) { const L = lum(F, x, y); if (L > m) { m = L; mx = x; } }
    console.log(y, m.toFixed(0) + '@' + mx);
  }

  // 6. Tab rail regional? x400 y1053-1059 A vs F; header rule y103 x200; credits peak
  console.log('--- regional dim check A vs F ---');
  for (const [x, y] of [[400, 1053], [400, 1055], [200, 1055], [900, 1055], [200, 103], [39, 400], [650, 600]]) {
    console.log(`${x},${y}`, 'A' + lum(A, x, y).toFixed(0), 'F' + lum(F, x, y).toFixed(0));
  }
  // tab rail band full width profile A vs F at y1053
  { let rA = [], rF = []; for (let x = 40; x <= 900; x += 40) { rA.push(lum(A, x, 1053).toFixed(0)); rF.push(lum(F, x, 1053).toFixed(0)); }
    console.log('rail1053 A:', rA.join(',')); console.log('rail1053 F:', rF.join(',')); }

  // 7. Voice bar RGB sample (arrival): find bar peak row 480
  { let m = 0, mx = 0; for (let x = 1140; x <= 1200; x++) { const L = lum(A, x, 480); if (L > m) { m = L; mx = x; } }
    const [r, g, b] = px(A, mx, 480); console.log('voice bar arr', mx + ',480', `rgb(${r},${g},${b})`, m.toFixed(0)); }

  // 8. Hierarchy peaks (arrival): name, line, replies, contacts
  console.log('--- hierarchy peaks (arrival) ---');
  const spans = [[620, 380, 1120, 440, 'name'], [620, 440, 1010, 465, 'line'], [665, 495, 900, 520, 'reply1'], [665, 547, 900, 572, 'reply2'], [665, 599, 900, 624, 'reply3'], [80, 385, 300, 405, 'contact1'], [80, 435, 300, 455, 'contact2']];
  for (const [x0, y0, x1, y1, n] of spans) {
    let m = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m = Math.max(m, lum(A, x, y));
    console.log(n, m.toFixed(0));
  }
  // 9. 1280 spot: ladder band x~25? dial present? arc band?
  console.log('--- 1280 (720p) size check ---');
  console.log('D size', D.w, D.h);
  { let m = 0, mx = 0; for (let x = 20; x <= 32; x++) m = Math.max(m, lum(D, x, 260)); console.log('1280 ladder core y260 max20-32:', m.toFixed(0)); }
})();
