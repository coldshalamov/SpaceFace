// Geometry-only remasters share many unchanged paint maps. Encode identical source pixels and
// settings once, without changing texture quality or any release validation downstream.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encodeToKTX2 } from 'ktx2-encoder';
import { KHRTextureBasisu } from '@gltf-transform/extensions';

const CACHE = resolve(new URL('../../.devshots/ktx2-cache/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const pending = new Map();
const encoderVersion = JSON.parse(readFileSync(new URL('../../node_modules/ktx2-encoder/package.json', import.meta.url), 'utf8')).version;
const MAGIC = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function textureEncodingKey(image, options) {
  const settings = Object.fromEntries(Object.entries(options)
    .filter(([key]) => key !== 'slots' && key !== 'pattern')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, typeof value === 'function' ? value.toString() : value]));
  return hash(`ktx2-encoder-${encoderVersion}-v1\n${JSON.stringify(settings)}\n${hash(image)}`);
}

async function encodeCached(image, options) {
  const key = textureEncodingKey(image, options);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const file = resolve(CACHE, `${key}.ktx2`);
    try {
      const [bytes, checksum] = await Promise.all([readFile(file), readFile(`${file}.sha256`, 'utf8')]);
      if (bytes.subarray(0, 12).equals(MAGIC) && hash(bytes) === checksum) return bytes;
    } catch { /* A missing/incomplete cache entry is rebuilt from its source image. */ }
    const bytes = Buffer.from(await encodeToKTX2(image, options));
    if (!bytes.subarray(0, 12).equals(MAGIC)) throw new Error('Texture encoder returned a non-KTX2 payload');
    await mkdir(CACHE, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, file);
    await writeFile(`${file}.sha256`, hash(bytes));
    return bytes;
  })();
  pending.set(key, task);
  try { return await task; } catch (error) { pending.delete(key); throw error; }
}

export function cachedKtx2(options = {}) {
  return async function cachedKtx2Transform(document) {
    const root = document.getRoot();
    await Promise.all(root.listTextures().map(async (texture) => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(texture.getMimeType())) return;
      if (options.pattern && !options.pattern.test(texture.getName()) && !options.pattern.test(texture.getURI())) return;
      const slots = texture.getGraph().listParentEdges(texture)
        .filter((edge) => edge.getParent() !== root).map((edge) => edge.getName());
      if (options.slots && slots.length && !slots.some((slot) => options.slots.test(slot))) return;
      const image = texture.getImage();
      if (!image) throw new Error(`Missing source image for ${texture.getName()}`);
      texture.setImage(await encodeCached(image, options)).setMimeType('image/ktx2');
      document.createExtension(KHRTextureBasisu).setRequired(true);
    }));
  };
}
