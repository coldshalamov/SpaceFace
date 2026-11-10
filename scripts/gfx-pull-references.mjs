// Modern-parity reference puller.
//
// Consumes the JSON manifest produced by the grok research agent (see
// design/graphics-sprints/MODERN_PARITY_LOOP.md §2) and materialises the actual reference images
// into .devshots/gfx/refs/<sceneType>/ so the codex reviewer can be handed real pixels.
//
// COPYRIGHT: reference frames are third-party press/store screenshots. They are pulled into the
// gitignored .devshots tree for critique only and are NEVER committed. What IS committed is the
// provenance manifest (game, year, urls, the rendering lesson) written to
// design/graphics-sprints/MODERN_PARITY_REFERENCES.json.
//
// Run: node scripts/gfx-pull-references.mjs --manifest <grok-output.json> [--limit 6]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const argv = parseArgs(process.argv.slice(2));
const MANIFEST = argv.manifest;
const OUT_DIR = argv.out || '.devshots/gfx/refs';
const PROVENANCE = argv.provenance || 'design/graphics-sprints/MODERN_PARITY_REFERENCES.json';
const PER_SCENE_LIMIT = Number(argv.limit || 5);
const TIMEOUT_MS = Number(argv.timeoutMs || 20000);

if (!MANIFEST || !existsSync(MANIFEST)) {
  console.error('usage: node scripts/gfx-pull-references.mjs --manifest <grok-output.json>');
  process.exit(2);
}

const raw = readFileSync(MANIFEST, 'utf8');
const references = extractReferences(raw);
if (!references.length) {
  console.error('[refs] no references found in manifest — is it the grok JSON envelope?');
  process.exit(2);
}
console.log(`[refs] manifest holds ${references.length} candidate references`);

// Keep scene types balanced: an over-represented game must not dominate one scene's rubric.
const byScene = new Map();
for (const ref of references) {
  const list = byScene.get(ref.sceneType) || [];
  if (list.length < PER_SCENE_LIMIT) list.push(ref);
  byScene.set(ref.sceneType, list);
}

const results = [];
for (const [sceneType, list] of byScene) {
  const dir = join(OUT_DIR, sceneType);
  mkdirSync(dir, { recursive: true });
  for (const ref of list) {
    const record = { ...ref, localPath: null, bytes: 0, contentType: null, error: null };
    try {
      const got = await resolveImage(ref);
      const ext = extensionFor(got.contentType, got.url);
      const path = join(dir, `${safeId(ref.id || ref.game)}${ext}`);
      writeFileSync(path, Buffer.from(got.buffer));
      record.localPath = path.replace(/\\/g, '/');
      record.bytes = got.buffer.byteLength;
      record.contentType = got.contentType;
      record.resolvedUrl = got.url;
      console.log(`[refs] ${sceneType.padEnd(16)} ${ref.game} -> ${record.localPath} (${(got.buffer.byteLength / 1024).toFixed(0)} KB)`);
    } catch (e) {
      record.error = e.message;
      console.warn(`[refs] ${sceneType.padEnd(16)} ${ref.game} FAILED: ${e.message}`);
    }
    results.push(record);
  }
}

// Provenance is the committed artefact. Strip nothing: attribution is the point.
mkdirSync(dirname(PROVENANCE), { recursive: true });
writeFileSync(PROVENANCE, JSON.stringify({
  note: 'Reference frames are third-party screenshots used for critique only. Image bytes live in the gitignored .devshots tree and are never committed. This file is the provenance/attribution record.',
  sceneTypes: [...byScene.keys()],
  references: results.map(({ localPath, bytes, contentType, resolvedUrl, error, ...rest }) => ({
    ...rest, contentType, bytes, resolvedUrl, fetched: !!localPath, error,
  })),
}, null, 2));

const ok = results.filter((r) => r.localPath).length;
console.log(`[refs] fetched ${ok}/${results.length} into ${OUT_DIR}`);
console.log(`[refs] provenance: ${PROVENANCE}`);
// A scene type with no usable reference cannot be reviewed, so fail closed on it.
const barren = [...byScene.keys()].filter((s) => !results.some((r) => r.sceneType === s && r.localPath));
if (barren.length) {
  console.error(`[refs] FAIL — scene types with zero usable references: ${barren.join(', ')}`);
  process.exit(1);
}

async function resolveImage(ref) {
  const tried = [];
  for (const url of [ref.imageUrl, ref.pageUrl].filter(Boolean)) {
    try {
      const direct = await fetchImage(url);
      if (direct) return direct;
      tried.push(`${url} (not an image)`);
      // Not image bytes — treat it as an HTML page and mine it for a hero image.
      const page = await fetchText(url);
      const candidate = firstImageFromHtml(page, url);
      if (candidate) {
        const viaPage = await fetchImage(candidate);
        if (viaPage) return viaPage;
        tried.push(`${candidate} (og:image not an image)`);
      }
    } catch (e) {
      tried.push(`${url} (${e.message})`);
    }
  }
  throw new Error(`no image bytes; tried: ${tried.join(' | ')}`);
}

async function fetchImage(url) {
  const res = await fetchWithTimeout(url);
  const ct = String(res.headers.get('content-type') || '');
  if (!res.ok || !/^image\//i.test(ct)) return null;
  const buffer = await res.arrayBuffer();
  // Guard against 1x1 trackers and error placeholders masquerading as images.
  if (buffer.byteLength < 8000) return null;
  return { buffer, contentType: ct, url };
}

async function fetchText(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // Several publisher CDNs 403 a bare fetch; a normal desktop UA is enough.
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function firstImageFromHtml(html, baseUrl) {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (og) return absolutise(og[1], baseUrl);
  const img = html.match(/<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i);
  return img ? absolutise(img[1], baseUrl) : null;
}

function absolutise(url, baseUrl) {
  try { return new URL(url, baseUrl).toString(); } catch { return url; }
}

function extensionFor(contentType, url) {
  if (/jpe?g/i.test(contentType)) return '.jpg';
  if (/png/i.test(contentType)) return '.png';
  if (/webp/i.test(contentType)) return '.webp';
  const m = String(url).match(/\.(jpe?g|png|webp)(?:[?#]|$)/i);
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : '.img';
}

function safeId(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ref';
}

// grok --output-format json wraps the model answer; be liberal about the envelope shape so a CLI
// version bump does not silently break the puller.
function extractReferences(text) {
  const direct = tryParse(text);
  const fromEnvelope = direct && findReferences(direct);
  if (fromEnvelope) return fromEnvelope;
  // Fall back to the largest JSON object embedded in the stream.
  const matches = text.match(/\{[\s\S]*\}/g) || [];
  for (const m of matches.sort((a, b) => b.length - a.length)) {
    const found = findReferences(tryParse(m));
    if (found) return found;
  }
  return [];
}

function findReferences(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    if (node.length && node.every((v) => v && typeof v === 'object' && 'sceneType' in v)) return node;
    for (const v of node) { const f = findReferences(v, depth + 1); if (f) return f; }
    return null;
  }
  if (typeof node === 'object') {
    if (Array.isArray(node.references)) return node.references;
    for (const v of Object.values(node)) {
      if (typeof v === 'string' && v.includes('sceneType')) {
        const f = findReferences(tryParse(v), depth + 1); if (f) return f;
      }
      const f = findReferences(v, depth + 1); if (f) return f;
    }
  }
  return null;
}

function tryParse(s) { try { return JSON.parse(s); } catch { return null; } }

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}
