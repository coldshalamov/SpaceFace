#!/usr/bin/env node
/**
 * Report asset lifecycle vs three registries. Graphics sprint integrator + Thread C tool.
 * Usage: node scripts/report-asset-status.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'assets/ships/parts/parts_manifest.json');
const statusPath = path.join(root, 'assets/ASSET_STATUS.json');
const partsLibraryPath = path.join(root, 'src/render/partsLibrary.js');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function slotUrlsFromPartsLibrary(src) {
  const slots = {};
  const re = /slots:\s*Object\.freeze\(\{([\s\S]*?)\}\),/m;
  const m = src.match(re);
  if (!m) return slots;
  const block = m[1];
  for (const line of block.split('\n')) {
    const slot = line.match(/^\s*(\w+):\s*Object\.freeze\(\[/);
    if (!slot) continue;
    const name = slot[1];
    slots[name] = [];
  }
  const arrayRe = /(\w+):\s*Object\.freeze\(\[([\s\S]*?)\]\)/g;
  let am;
  while ((am = arrayRe.exec(block)) !== null) {
    const urls = [...am[2].matchAll(/'([^']+\.glb)'/g)].map((x) => x[1]);
    slots[am[1]] = urls;
  }
  return slots;
}

function inferLifecycle(part, slots, libSlots) {
  if (part.status === 'blocked') return 'BLOCKED';
  const file = part.file || '';
  const category = part.category || '';
  let slotName = category === 'hulls' ? 'hull'
    : category === 'engines' ? 'engine'
    : category === 'weapons' ? 'weapon'
    : category === 'cockpits' ? 'cockpit'
    : category === 'fins' ? 'fin'
    : category === 'greebles' ? 'greeble'
    : category === 'gear' ? 'gear'
    : category === 'pods' ? 'pod'
    : category?.startsWith('place') || file.startsWith('places/') ? 'place'
    : null;
  const inManifestSlot = slotName && (slots[slotName] || []).some((u) => u.endsWith(file));
  const inLib = slotName && (libSlots[slotName] || []).some((u) => u.endsWith(file) || file.endsWith(u.replace(/^.*\//, '')));
  if (inManifestSlot && inLib) return 'MANIFEST_SLOT';
  if (inManifestSlot) return 'MANIFEST_SLOT';
  if (part.file && fs.existsSync(path.join(root, 'assets/ships/parts', part.file))) return 'SOURCE_GLB';
  return 'CONCEPT';
}

const manifest = readJson(manifestPath);
const slots = manifest.runtimeSlots || {};
const parts = manifest.parts || [];
const libSrc = fs.readFileSync(partsLibraryPath, 'utf8');
const libSlots = slotUrlsFromPartsLibrary(libSrc);
const status = fs.existsSync(statusPath) ? readJson(statusPath) : { assets: {} };

const LIFECYCLE_ENUM = status.lifecycle_enum || [
  'CONCEPT', 'PENDING_RENDER', 'SOURCE_GLB', 'RELEASE_BUILT',
  'MANIFEST_SLOT', 'RUNTIME_MAP', 'VISIBLE_IN_PLAY', 'BLOCKED',
];

const rows = parts.map((part) => {
  const id = part.id;
  const ledger = status.assets?.[id] || {};
  return {
    id,
    file: part.file,
    blocked: part.status === 'blocked',
    inferred: inferLifecycle(part, slots, libSlots),
    ledger_lifecycle: ledger.lifecycle || null,
    ledger_valid: !ledger.lifecycle || LIFECYCLE_ENUM.includes(ledger.lifecycle),
    iterations: ledger.iterations || null,
    wired: ledger.wired || [],
  };
});

// Ledger-only assets (tracked in ASSET_STATUS.json without a manifest row) —
// the home of PENDING_RENDER place commissions whose GLB is not built yet.
for (const [id, ledger] of Object.entries(status.assets || {})) {
  if (parts.some((part) => part.id === id)) continue;
  rows.push({
    id,
    file: ledger.file || null,
    blocked: false,
    inferred: null,
    ledger_lifecycle: ledger.lifecycle || null,
    ledger_valid: !ledger.lifecycle || LIFECYCLE_ENUM.includes(ledger.lifecycle),
    iterations: ledger.iterations || null,
    wired: ledger.wired || [],
  });
}

const blocked = rows.filter((r) => r.blocked);
const manifestOnly = rows.filter((r) => r.inferred === 'MANIFEST_SLOT' && !r.ledger_lifecycle);
const pendingRender = rows.filter((r) => r.ledger_lifecycle === 'PENDING_RENDER');
const invalidLedger = rows.filter((r) => r.ledger_lifecycle && !r.ledger_valid);
// pending_render fallback contract (ASSET_EXPERIENCE_PROGRAM §4): an unbuilt GLB
// must stay out of every wired registry — flag any that slipped.
const wiredPending = pendingRender.filter((r) =>
  (r.inferred && r.inferred !== 'CONCEPT') || (r.wired && r.wired.length));

console.log('Asset status report');
console.log('parts:', rows.length, '| blocked:', blocked.length, '| pending_render:', pendingRender.length);
if (blocked.length) console.log('blocked:', blocked.map((r) => r.id).join(', '));
if (manifestOnly.length) console.log('manifest_slot (wire pending):', manifestOnly.length);
if (pendingRender.length) console.log('pending_render:', pendingRender.map((r) => r.id).join(', '));
if (invalidLedger.length) console.log('WARN  ledger lifecycle not in lifecycle_enum:', invalidLedger.map((r) => `${r.id}=${r.ledger_lifecycle}`).join(', '));
if (wiredPending.length) console.log('WARN  pending_render asset appears wired:', wiredPending.map((r) => r.id).join(', '));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
}