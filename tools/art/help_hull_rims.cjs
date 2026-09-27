// The Help rig's steer ghost: each hull's plan-render silhouette as one outer rim of light -- an ice
// core over a soft bloom -- cut from the render's own alpha. Interior holes are filled, specks under
// 600 px² dropped, and the outline smoothed (a 2.5 px blur re-thresholded) so it reads as a phosphor
// silhouette, not a trace of every panel. Writes assets/ui/generated/help/rim/ship_<id>.rim.webp
// (1024², the same frame as the top render, so it sits on the hull exactly).
//   node tools/art/help_hull_rims.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const OUT = ROOT + 'assets/ui/generated/help/rim/';
fs.mkdirSync(OUT, { recursive: true });

function components(mask, W, H) {
  // label 4-connected components of 1s; returns { label, sizes }
  const label = new Int32Array(W * H).fill(-1);
  const sizes = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    stack.push(i); label[i] = id;
    while (stack.length) {
      const k = stack.pop(); n++;
      const x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (mask[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(n);
  }
  return { label, sizes };
}

(async () => {
  for (const id of ['kestrel', 'pelican', 'wasp', 'hornet']) {
    const src = ROOT + `assets/ui/renders/hulls/ship_${id}.top.webp`;
    const { data, info } = await sharp(src).ensureAlpha().extractChannel(3).median(7).raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    let mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = data[i] > 110 ? 1 : 0;
    // fill the holes: whatever background the frame's border cannot reach is inside the hull
    const bg = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) bg[i] = mask[i] ? 0 : 1;
    const { label: bl } = components(bg, W, H);
    const outside = new Set();
    for (let x = 0; x < W; x++) { outside.add(bl[x]); outside.add(bl[(H - 1) * W + x]); }
    for (let y = 0; y < H; y++) { outside.add(bl[y * W]); outside.add(bl[y * W + W - 1]); }
    for (let i = 0; i < W * H; i++) if (!mask[i] && !outside.has(bl[i])) mask[i] = 1;
    // drop specks
    const { label, sizes } = components(mask, W, H);
    for (let i = 0; i < W * H; i++) if (mask[i] && sizes[label[i]] < 600) mask[i] = 0;
    // smooth the outline: blur and re-threshold
    const smo = await sharp(Buffer.from(mask.map((v) => v * 255)), { raw: { width: W, height: H, channels: 1 } }).blur(2.5).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    if (smo.info.channels !== 1 || smo.data.length !== W * H) throw new Error('smooth channels ' + smo.info.channels);
    const sm = smo.data;
    for (let i = 0; i < W * H; i++) mask[i] = sm[i] > 127 ? 1 : 0;
    // the rim: the silhouette minus its 3px erosion
    const r = 3;
    const edge = Buffer.alloc(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      let inner = 1;
      for (let dy = -r; dy <= r && inner; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !mask[yy * W + xx]) { inner = 0; break; }
      }
      edge[i] = inner ? 0 : 255;
    }
    const bl0 = await sharp(edge, { raw: { width: W, height: H, channels: 1 } }).blur(6).extractChannel(0).raw().toBuffer();
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const core = edge[i] / 255;
      const bloom = Math.min(1, (bl0[i] / 255) * 2.2) * 0.25;
      const a0 = Math.max(core, bloom);
      const a = a0 < 0.06 ? 0 : a0;
      const t = a > 0 ? core / a : 0;
      out[i * 4] = Math.round(143 + (236 - 143) * t);
      out[i * 4 + 1] = Math.round(203 + (247 - 203) * t);
      out[i * 4 + 2] = 255;
      out[i * 4 + 3] = Math.round(a * 255);
    }
    await sharp(out, { raw: { width: W, height: H, channels: 4 } }).webp({ lossless: true }).toFile(OUT + `ship_${id}.rim.webp`);
    console.log('rim', id);
  }
})();
