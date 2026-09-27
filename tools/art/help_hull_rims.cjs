// The steer ghost: each hull's plan-render silhouette as a rim of light (an ice core over a soft bloom),
// cut from the render's own alpha. Writes assets/ui/generated/help/rim/ship_<id>.rim.webp (1024²,
// the same frame as the top render, so it sits on the hull exactly).
const sharp = require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp');
const fs = require('fs');
const ROOT = 'C:/Users/93rob/Documents/GitHub/SpaceFace/';
const OUT = ROOT + 'assets/ui/generated/help/rim/';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  for (const id of ['kestrel', 'pelican', 'wasp', 'hornet']) {
    const src = ROOT + `assets/ui/renders/hulls/ship_${id}.top.webp`;
    const alphaImg = await sharp(src).ensureAlpha().extractChannel(3).median(7).raw().toBuffer({ resolveWithObject: true });
    const data = alphaImg.data; const info = alphaImg.info;
    const W = info.width, H = info.height;
    const a = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) a[i] = data[i] > 110 ? 1 : 0;
    // rim = the silhouette minus its 3px erosion
    const er = new Uint8Array(W * H);
    const r = 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!a[y * W + x]) continue;
      let keep = 1;
      for (let dy = -r; dy <= r && keep; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !a[yy * W + xx]) { keep = 0; break; }
      }
      er[y * W + x] = keep;
    }
    const edge = Buffer.alloc(W * H);
    for (let i = 0; i < W * H; i++) edge[i] = a[i] && !er[i] ? 255 : 0;
    const edgeImg = sharp(edge, { raw: { width: W, height: H, channels: 1 } });
    const bl0 = await edgeImg.clone().blur(6).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    if (bl0.info.channels !== 1) throw new Error("bloom channels " + bl0.info.channels);
    const bloom = bl0.data;
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const core = edge[i] / 255;
      const bl = Math.min(1, (bloom[i] / 255) * 2.2) * 0.45;
      const alpha0 = Math.max(core, bl); const alpha = alpha0 < 0.1 ? 0 : alpha0;
      // core: near-white ice; bloom: ice
      const t = alpha > 0 ? core / alpha : 0;
      out[i * 4] = Math.round(143 + (236 - 143) * t);
      out[i * 4 + 1] = Math.round(203 + (247 - 203) * t);
      out[i * 4 + 2] = 255;
      out[i * 4 + 3] = Math.round(alpha * 255);
    }
    await sharp(out, { raw: { width: W, height: H, channels: 4 } }).webp({ lossless: true }).toFile(OUT + `ship_${id}.rim.webp`);
    console.log('rim', id);
  }
})();
