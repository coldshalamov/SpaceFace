// Color+lighting audit: inventory every VFX emitter, material role, and sector
// rig against docs/visual-assets/COLOR_LIGHTING_STANDARD.md. Read-only; fails on
// drift. Usage: node scripts/audit-color-lighting.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(ROOT + p, 'utf8');
const failures = [];
const notes = [];
function check(name, ok, detail = '') {
  if (ok) notes.push(`ok   ${name}`);
  else failures.push(`FAIL ${name} ${detail}`.trim());
}

// 1. Pools stay fixed (light COUNT is shader-program state).
{
  const vfx = read('src/render/vfx.js');
  check('event pool = 6', /EVENT_LIGHT_POOL_SIZE\s*=\s*6/.test(vfx));
  const wl = read('src/render/weapons/weaponLights.js');
  check('weapon pool = 2', /WEAPON_LIGHT_POOL_SIZE\s*=\s*2/.test(wl));
  check('no new PointLight owners',
    (vfx.match(/new THREE\.PointLight/g) || []).length <= 1
    && (wl.match(/new THREE\.PointLight/g) || []).length <= 1,
    'a second PointLight constructor appeared');
}
// 2. Sector rigs inside standard bounds.
{
  const { SECTOR_VISUAL_PROFILES } = await import('../src/data/sectorVisualProfiles.js');
  for (const [id, p] of Object.entries(SECTOR_VISUAL_PROFILES)) {
    const l = p.lighting || {};
    check(`${id} lighting bounds`,
      l.ambient >= 0.12 && l.ambient <= 0.25
      && l.key >= 2.2 && l.key <= 3.6
      && l.rim >= 0.9 && l.rim <= 1.8
      && l.fill >= 0.35 && l.fill <= 0.8,
      JSON.stringify(l));
    check(`${id} post bounds`,
      p.post.exposure >= 0.9 && p.post.exposure <= 1.05
      && p.post.bloomStrengthScale >= 0.9 && p.post.bloomStrengthScale <= 1.2
      && p.post.bloomThresholdBias <= 0,
      JSON.stringify(p.post));
  }
}
// 2b. The Look: every mood complete and inside the standard (docs/visual-assets/LOOK.md).
{
  const { LOOK_MOODS, resolveLookMood, resolveLookMoodId } = await import('../src/data/lookMoods.js');
  const { SECTOR_VISUAL_PROFILES } = await import('../src/data/sectorVisualProfiles.js');
  for (const id of Object.keys(LOOK_MOODS)) {
    const m = resolveLookMood(id);
    check(`mood ${id} surface bounds`,
      m.surface.albedoGamma >= 0.9 && m.surface.albedoGamma <= 1.1
      && m.surface.albedoSaturation >= 1 && m.surface.albedoSaturation <= 1.3
      && m.surface.bandMix >= 0 && m.surface.bandMix <= 0.5
      && m.surface.coatRoughness >= 0.15 && m.surface.coatRoughness <= 0.4
      && m.surface.paintCeiling <= 0.75,
      JSON.stringify(m.surface));
    check(`mood ${id} post bounds`,
      m.post.grade >= 0.5 && m.post.grade <= 1
      && m.post.vignette >= 0.1 && m.post.vignette <= 0.4
      && m.post.contrast >= 1 && m.post.contrast <= 1.3
      && m.post.saturation >= 1 && m.post.saturation <= 1.3
      && m.post.ink >= 0 && m.post.ink <= 0.4,
      JSON.stringify(m.post));
  }
  for (const [id, p] of Object.entries(SECTOR_VISUAL_PROFILES)) {
    check(`${id} wears a mood`, Object.prototype.hasOwnProperty.call(LOOK_MOODS, resolveLookMoodId(p)));
  }
}
// 3. Director covers the VFX kinds that call _flashLight.
{
  const vfx = read('src/render/vfx.js');
  const flashes = (vfx.match(/this\._flashLight\(/g) || []).length;
  const { VFX_LIGHT_KINDS, VFX_LIGHT_PRESETS } = await import('../src/render/vfxColorLightDirector.js');
  check('_flashLight is the single VFX light choke point', flashes >= 20, `calls=${flashes}`);
  for (const kind of VFX_LIGHT_KINDS) {
    check(`director preset: ${kind}`, !!VFX_LIGHT_PRESETS[kind]
      || !!(await import('../src/render/vfxColorLightDirector.js')).presetFor(kind));
  }
}
// 4. Forge finishes carry calibrated response (no invented physics).
{
  const forge = read('tools/blender/forge/forge.py');
  check('forge FINISHES present', /'paint'.*role='hull'/.test(forge) && /'glass'/.test(forge)
    && /'glow_drive'/.test(forge));
  const fam = read('src/render/industrialMaterialFamilies.js');
  check('material families intact', /painted_shell/.test(fam) && /worn_tool_metal/.test(fam));
}
// 5. Bloom defaults unchanged (threshold 1.0, strength 0.52).
{
  const bloom = read('src/render/bloom.js');
  check('bloom threshold 1.0', /let threshold = 1\.0;/.test(bloom));
  check('bloom strength 0.52', /DEFAULT_BLOOM_STRENGTH\s*=\s*0\.52/.test(bloom));
}

for (const n of notes) console.log(n);
if (failures.length) {
  console.log('');
  for (const f of failures) console.log(f);
  console.log(`\ncolor+lighting audit: ${failures.length} FAILING`);
  process.exit(1);
} else console.log('\ncolor+lighting audit: OK');
