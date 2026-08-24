#!/usr/bin/env node
// Keeps docs/visual-assets/SOFT_CARD_INVENTORY.json honest.
//
// This is not a taste ban on blur. It is a completeness ratchet: every live Points/Sprite/glow-card
// construction in the scanned trees must be listed, and a new file cannot pick up the N64 card
// without declaring it. New exception ids outside the star-sky allowlist fail.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INVENTORY_PATH = join(ROOT, 'docs/visual-assets/SOFT_CARD_INVENTORY.json');
const TEXT_EXTS = new Set(['.js', '.mjs', '.ts', '.tsx']);

const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
assert.equal(inventory.schema, 'spaceface.softCardInventory.v1', 'inventory schema mismatch');
assert.ok(Array.isArray(inventory.entries) && inventory.entries.length > 0, 'inventory has no entries');
assert.ok(Array.isArray(inventory.exceptionIds) && inventory.exceptionIds.length > 0, 'exception allowlist missing');
assert.ok(Array.isArray(inventory.scanRoots) && inventory.scanRoots.length > 0, 'scan roots missing');
assert.ok(Array.isArray(inventory.scanPatterns) && inventory.scanPatterns.length > 0, 'scan patterns missing');

const patterns = inventory.scanPatterns.map((source, index) => {
  try {
    return new RegExp(source);
  } catch (err) {
    throw new Error(`scanPatterns[${index}] is not valid regex: ${source}\n${err}`);
  }
});

const listedFiles = new Set();
const exceptionIds = new Set(inventory.exceptionIds);
for (const entry of inventory.entries) {
  assert.ok(entry && entry.id, 'inventory entry missing id');
  assert.ok(entry.status, `${entry.id}: missing status`);
  assert.ok(Array.isArray(entry.files) && entry.files.length > 0, `${entry.id}: missing files`);
  if (entry.status === 'exception') {
    assert.ok(exceptionIds.has(entry.id), `${entry.id}: exception status is not on the star-sky allowlist`);
  }
  for (const file of entry.files) {
    const abs = join(ROOT, file);
    assert.equal(statSync(abs).isFile(), true, `${entry.id}: listed file missing: ${file}`);
    listedFiles.add(normalize(file));
  }
}

for (const id of inventory.exceptionIds) {
  const hit = inventory.entries.some((entry) => entry.id === id && entry.status === 'exception');
  assert.ok(hit, `exceptionIds lists ${id} but no entry has that id with status exception`);
}

const discovered = new Set();
for (const root of inventory.scanRoots) {
  walk(join(ROOT, root), discovered);
}

const extra = [...discovered].filter((file) => !listedFiles.has(file)).sort();
const stale = [...listedFiles].filter((file) => !discovered.has(file)).sort();

assert.deepEqual(extra, [], `unlisted soft-card constructions (add them to SOFT_CARD_INVENTORY.json as banned-live, or do not add them):\n${extra.join('\n')}`);
assert.deepEqual(stale, [], `inventory lists files with no remaining soft-card marker (remove or update the entry):\n${stale.join('\n')}`);

assertPlayerPlumeConstruction();

console.log(`PASS  check:vfx-techniques  ${inventory.entries.length} entries, ${listedFiles.size} files`);

/**
 * Enforces the mechanically checkable half of the ban list in
 * docs/visual-assets/VFX_TECHNIQUE_STANDARD.md against the live player plume.
 *
 * The standard is only worth writing down if a banned construction fails a gate rather than being
 * caught by the owner in a screenshot. Three thruster passes were rejected for exactly the failures
 * asserted here, and each time the code looked reasonable in review.
 */
function assertPlayerPlumeConstruction() {
  const ribbons = readFileSync(join(ROOT, 'src/render/thruster/ribbon/plasmaRibbons.js'), 'utf8');
  const trail = readFileSync(join(ROOT, 'src/render/thruster/ribbon/contrailTrail.js'), 'utf8');
  const envelope = readFileSync(join(ROOT, 'src/render/thruster/ribbon/driveEnvelope.js'), 'utf8');
  const stream = readFileSync(join(ROOT, 'src/render/thruster/systems/plasmaStream.js'), 'utf8');

  // B13 — the jet and the flight history must be different objects. Merging them forces the jet to be
  // as long as the history window, which at cruise is hundreds of world units: a tail welded to the
  // hull, not a plume. Two separate modules, each attached independently.
  assert.match(stream, /new ContrailTrail/, 'B13: the contrail must be its own element, not the plume');
  assert.match(stream, /new PlasmaRibbonPlume/, 'B13: the plume must be its own element');
  // Matched against mechanisms rather than prose: the plume may describe why it holds no history, it
  // just may not have the machinery for one.
  assert.doesNotMatch(
    ribbons,
    /\bPLUME_SECONDS\b|_emitStation|samplePositions|\buEmitTex\b/,
    'B13: the plume must hold no flight history — that belongs to the contrail',
  );

  // B14 — a history trail may only occupy positions the nozzle actually occupied. Any advection along
  // the exhaust axis puts geometry where the ship has never been, which is what made the previous
  // build snap a full-length ribbon into place behind a stationary ship.
  assert.doesNotMatch(
    trail,
    /\baftX\b|\baftZ\b|exhaustSpeed/,
    'B14: the contrail must not advect along the exhaust axis',
  );
  assert.match(trail, /MIN_STEP_WU/, 'B14: contrail samples must be gated on real nozzle movement');

  // B9 — an effect that stops where its mesh stops has a flat chopped-off back edge. Every sheet needs
  // its own reach and its material has to reach zero before its geometry does, so the tail is where
  // many sheets independently run out rather than a plane where the mesh ends.
  assert.match(ribbons, /sheetReach/, 'B9: sheets must reach different distances, or the tail is a flat cut');
  assert.match(ribbons, /runout/, 'B9: sheet material must run out before its geometry does');
  // The contrail became an immutable world-space history (d3405236): strands no longer expire on a
  // per-strand age clock, so the old `lifeOut` symbol is gone. The B9 intent — material reaches
  // zero before the geometry does, and strands do not share one identical envelope — is now carried
  // by the history-position fade and the per-strand world seed.
  assert.match(trail, /1\.0\s*-\s*vLife/, 'B9: contrail material must run out along the recorded history, not cut at the mesh end');
  assert.match(trail, /worldSeed/, 'B9: contrail strands must vary by seed, or the tail is one repeated envelope');

  // The contrail is half of this effect, and it has shipped invisible once — tuned so faint that it was
  // technically present on the play route and could not be seen. Floors here, not taste.
  const trailOpacity = Number((trail.match(/uOpacity:\s*\{\s*value:\s*([\d.]+)/) || [])[1]);
  const trailRadiance = Number((trail.match(/uRadiance:\s*\{\s*value:\s*([\d.]+)/) || [])[1]);
  assert.ok(
    trailOpacity >= 0.02,
    `the contrail must be visible at the gameplay camera, opacity ${trailOpacity}`,
  );
  assert.ok(
    trailRadiance >= 0.3,
    `the contrail must be visible at the gameplay camera, radiance ${trailRadiance}`,
  );

  // B15 — deformation keyed only to state frozen at emission is a still form being translated. The
  // plume's structure has to be a function of time at a fixed pose, or gas never flows through it.
  assert.match(
    ribbons,
    /-\s*uTime\s*\*\s*uFlowRate/,
    'B15: plume structure must ride a travelling wave (position minus time), not frozen emission state',
  );
  assert.match(ribbons, /uFlicker/, 'B15: combustion is rough; a perfectly steady jet reads as a decal');

  // Transparency is material, not an animation channel. Scaling opacity by the drive is the cheat that
  // makes a plume read as a decal fading in rather than as an engine lighting.
  assert.doesNotMatch(
    envelope,
    /out\.opacity\s*=\s*base\.opacity\s*\*/,
    'opacity must not be scaled by the drive; the throttle moves length, heat and reach',
  );
  assert.match(
    envelope,
    /out\.jetLength\s*=/,
    'the throttle must move the jet length, which is what reads as the drive coming up',
  );

  // B7 — a ribbon with no view-dependent term is a strip of plastic tape. The grazing term is the
  // entire reason this construction reads as sheets rather than as wire.
  assert.match(
    ribbons,
    /1\.0\s*\/\s*max\(\s*facing/,
    'B7: the ribbon material must brighten at grazing angles (1/|N·V|)',
  );
  // The cross-section must have interior vertices, or every sheet carries one constant normal and
  // the grazing term above can never vary across a sheet.
  assert.match(ribbons, /RIBBON_ACROSS\s*=\s*([3-9]|\d\d)/, 'B7: sheets need a curved cross-section');

  // B8 — nothing above 1.0 means nothing for bloom to catch.
  assert.match(ribbons, /uRadiance/, 'B8: plume must expose an HDR radiance term');
  assert.match(ribbons, /toneMapped:\s*false/, 'B8: additive HDR plume must opt out of tone mapping');

  // B4/B5 — no point sprites and no bare emissive primitives standing in for the effect.
  assert.doesNotMatch(ribbons, /\bPoints\b|PointsMaterial/, 'B4: no point sprites in the plume');
  assert.doesNotMatch(
    ribbons,
    /SphereGeometry|ConeGeometry|CapsuleGeometry/,
    'B5: no untextured emissive primitives standing in for exhaust',
  );

  // B12 — an isotropic density field cannot produce a crease. The volumetric plume must stay off the
  // player path; it is kept in the tree only for reference.
  assert.doesNotMatch(
    stream,
    /new VolumetricPlumeSystem/,
    'B12: the player plume must not be an isotropic raymarched density field',
  );

  // B10 — visual state driven straight off an input pops. Every transition needs an envelope, and
  // release must be slower than attack.
  assert.doesNotMatch(
    stream,
    /Math\.max\(drive,\s*throttle/,
    'B10: plume intensity must come from the smoothed envelope, not a raw max of live inputs',
  );
  assert.match(envelope, /spoolRiseTau/, 'B10: drive needs an explicit spool envelope');
  const rates = {};
  for (const m of envelope.matchAll(/(spoolRiseTau|spoolFallTau|boostRiseTau|boostFallTau):\s*([\d.]+)/g)) {
    rates[m[1]] = Number(m[2]);
  }
  assert.ok(
    rates.spoolFallTau > rates.spoolRiseTau,
    `B10: the drive must cool slower than it lights (rise ${rates.spoolRiseTau}, fall ${rates.spoolFallTau})`,
  );
  assert.ok(
    rates.boostFallTau > rates.boostRiseTau,
    `B10: boost must cool slower than it blasts (rise ${rates.boostRiseTau}, fall ${rates.boostFallTau})`,
  );
  // 3 tau reaches ~95%. The owner asked for full thrust in half to three-quarters of a second.
  const spoolS = rates.spoolRiseTau * 3;
  assert.ok(
    spoolS > 0.4 && spoolS < 0.9,
    `B10: spool-to-full should land near 0.5-0.75s, computed ${spoolS.toFixed(2)}s`,
  );

  // B11 — the flight history must be laid down in world space and left there. The jet is allowed to be
  // nozzle-local, because a real jet genuinely does stand still relative to its bell; the trail is not.
  assert.match(
    trail,
    /uPathTex|_path\b/,
    'B11: the contrail must record world-space positions rather than inherit the current pose',
  );
}

function normalize(file) {
  return file.replace(/\\/g, '/');
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(abs, out);
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTS.has(extname(entry.name))) continue;
    const text = readFileSync(abs, 'utf8');
    if (!patterns.some((pattern) => pattern.test(text))) continue;
    out.add(normalize(relative(ROOT, abs)));
  }
}
