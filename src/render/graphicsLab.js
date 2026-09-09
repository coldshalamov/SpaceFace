// Graphics Lab — honest technique gap-map + live demos on the real render stack.
// Open: http://localhost:8123/graphics-lab.html
//
// NOT a "sliders for MeshStandardMaterial" toy. Shows what pro 3D forums teach, what SpaceFace
// actually has, and live comparisons using kestrelHero + env reflections + bloom (ACES off by default
// so bloom sliders are visible — ACES crushes highlight deltas in the composite pass).
// Dev-only — never loaded in normal play.

import * as THREE from 'three';
import { FACTION_PALETTES } from '../data/palettes.js';
import { createBloom } from './bloom.js';
import { buildKestrelHero } from './ships/kestrelHero.js';
import {
  makeHullPanelTexture, makeHullNormalMap, makeNoiseTexture,
  makeGreebleTexture, makeStarTexture, makeGradientTexture,
} from './canvasTextures.js';
import { configureMaterialLibrary, resolve as resolveMaterial } from './materialLibrary.js';
import {
  pbrHullMaterial, machineryMaterial, emissiveMaterial, decalMaterial,
} from './ships/shipKit.js';

// Wire material library to the same texture builders the live game uses.
configureMaterialLibrary({
  cache: (key, make) => make(),
  hullPanel: (opts) => makeHullPanelTexture(opts),
  greeble: (opts) => makeGreebleTexture(opts),
  noise: (opts) => makeNoiseTexture(opts),
  hullNormal: (opts) => makeHullNormalMap(opts),
  decal: (opts) => makeDecalSheetFallback(opts),
});

function makeDecalSheetFallback(opts = {}) {
  return makeGreebleTexture({ size: opts.size || 256, seed: opts.seed || 1, density: 0.8, accent: opts.accent || '#39d0ff' });
}

const GLOSSARY = [
  ['PBR (Physically Based Rendering)', 'Surfaces react to light using metalness + roughness instead of flat color. Paint reads as paint; bare metal catches highlights.'],
  ['Albedo / color map', 'The base surface color texture. Without it, hulls look like one flat gray plastic.'],
  ['Normal map', 'Fakes small bumps and panel seams so light slides across edges — the #1 fix for "flat boxes".'],
  ['Roughness map', 'Varies shininess across the surface (scratches dull, edges polish). Stops everything looking like chrome or matte uniformly.'],
  ['Metalness', '0 = painted/dielectric hull, 1 = bare metal. SpaceFace hulls stay ~0.16; exposed hardware ~0.78.'],
  ['Emissive', 'Surfaces that glow (engines, windows, weapon ports). Bloom picks these up — never paint the whole hull emissive.'],
  ['Bloom', 'Post-pass that makes bright emissive/additive pixels radiate. Without emissive highlights, bloom has nothing to work on.'],
  ['Additive blending', 'Projectiles, halos, particles add light on top (depthWrite:false). They glow without scene lights.'],
  ['Environment map (PMREM)', 'Reflections of the nebula/sky on metal trim and glass. Needs metalness + low roughness to read.'],
  ['Greeble / panel breakup', 'Small procedural detail (vents, rivets, seams) on canvas textures — not random floating boxes.'],
  ['Material roles', 'Named presets (bodyPrimary, trim, glass, hazard…) so every asset shares one visual language.'],
  ['Authored GLB parts', 'Ship hull pieces exported from Blender with UVs + PBR maps. Modular path in assets/ships/release/.'],
  ['ACES tone-mapping', 'Filmic highlight compression in bloom composite. At ACES=1, bloom strength changes are hard to see — not because bloom is broken.'],
];

const TECHNIQUE_CATALOG = [
  {
    title: 'Mesh authoring (what r/3Dmodeling posts actually show)',
    items: [
      { name: 'High-poly sculpt → clean retopo', status: 'NEED', pro: 'ZBrush/Blender sculpt defines form; game mesh is low-poly with baked detail.', sf: 'Procedural boxes/cones unless Blender MCP exports GLB with UVs.' },
      { name: 'UV unwrapping for texture painting', status: 'NEED', pro: 'Clean UV islands = sharp painted edges, no stretching.', sf: 'Canvas textures on primitives use auto UVs — OK for panels, not hero shapes.' },
      { name: 'Normal map bake from high-poly', status: 'PARTIAL', pro: 'Baked tangent normals carry micro-detail and edge wear.', sf: 'makeHullNormalMap is procedural seams only — not mesh-specific bakes.' },
      { name: 'AO / curvature / cavity bakes', status: 'NEED', pro: 'Dirt accumulates in cavities; edges polish on wear.', sf: 'No uv2 AO path on procedural geometry.' },
      { name: 'Trim sheets / modular kitbash', status: 'PARTIAL', pro: 'Reuse greeble panels across assets from one atlas.', sf: 'partsLibrary GLB modular hulls — pipeline exists, content thin.' },
      { name: 'Kitbash hard-surface booleans', status: 'NEED', pro: 'Complex silhouettes from joined mechanical parts.', sf: 'mergeGeometries on primitives — reads blocky without authored forms.' },
    ],
  },
  {
    title: 'Texturing (Substance Painter / Designer workflows)',
    items: [
      { name: 'Layered PBR stack (base, wear, dust, edge wear)', status: 'NEED', pro: 'Multiple masked layers per material channel.', sf: 'Single procedural albedo + grime overlay only.' },
      { name: 'Separate emissive mask (not whole-surface glow)', status: 'PARTIAL', pro: 'Windows/engines glow; hull paint does not.', sf: 'emissiveMaterial on specific meshes — agents skip this.' },
      { name: 'Detail normal (secondary UV / tileable)', status: 'NEED', pro: 'Fine surface grain at any distance.', sf: 'One normal map scale per hull.' },
      { name: 'Roughness variation from real references', status: 'PARTIAL', pro: 'Paint chips glossy; panels satin; grime matte.', sf: 'Value-noise roughnessMap — better than flat, not Substance-grade.' },
      { name: 'Decals (numbers, warnings, faction livery)', status: 'PARTIAL', pro: 'Projected or UV decals with opacity masks.', sf: 'makeDecalSheet / nose art in shipKit — underused.' },
    ],
  },
  {
    title: 'Shaders (Destiny / AAA forum showcase stuff)',
    items: [
      { name: 'Custom shader with detail maps + fresnel rim', status: 'NEED', pro: 'Per-asset shader graphs, not one StandardMaterial.', sf: 'MeshStandardMaterial + optional Physical for glass.' },
      { name: 'Parallax occlusion / height-blend', status: 'NA', pro: 'Depth on flat surfaces.', sf: 'Out of scope for browser perf budget.' },
      { name: 'Triplanar mapping', status: 'NA', pro: 'Seamless rocks/terrain without UVs.', sf: 'Not implemented.' },
      { name: 'Dissolve / damage reveal shaders', status: 'PARTIAL', pro: 'Animated death and damage states.', sf: 'kestrelDamage.js modulates emissive/parts — not shader dissolve.' },
      { name: 'Animated UV scroll (shields, holograms)', status: 'PARTIAL', pro: 'Energy surfaces feel alive.', sf: 'Beam UV scroll in vfx; shields use fresnel additive.' },
      { name: 'Iridescent / thin-film / anisotropic', status: 'NA', pro: 'Premium material reads on hero gear.', sf: 'Not in engine.' },
    ],
  },
  {
    title: 'Lighting & post (the "why it looks like a game" layer)',
    items: [
      { name: 'HDRI environment + accurate IBL', status: 'PARTIAL', pro: 'Everything reflects the same world.', sf: 'PMREM from nebula backdrop — lab was missing this until fixed.' },
      { name: 'SSAO / GTAO contact shadows', status: 'NEED', pro: 'Creases and contact darken — massive depth cue.', sf: 'Directional shadowMap only (optional).' },
      { name: 'SSR reflections', status: 'NA', pro: 'Real-time reflections on metal/glass.', sf: 'Env map only — no screen-space.' },
      { name: 'Volumetric fog / god rays', status: 'PARTIAL', pro: 'Light shafts through dust.', sf: 'FogExp2 + nebula sprites — no volumetrics.' },
      { name: 'Bloom (HDR bright extract)', status: 'HAVE', pro: 'Hot emissives radiate.', sf: 'bloom.js — strength hidden when ACES=1 (turn ACES down in lab).' },
      { name: 'Color grade LUT / film grain / vignette', status: 'HAVE', pro: 'Unified mood across frame.', sf: 'Inside bloom composite shader.' },
      { name: 'Depth of field / motion blur', status: 'NA', pro: 'Cinematic focus.', sf: 'Not implemented — top-down readability.' },
    ],
  },
  {
    title: 'What actually moves the needle for SpaceFace',
    items: [
      { name: 'Hero authored ships (kestrelHero bar)', status: 'HAVE', pro: 'Bespoke silhouette + material hierarchy.', sf: 'src/render/ships/kestrelHero.js — compare section uses this.' },
      { name: 'Blender → GLB with PBR maps', status: 'PARTIAL', pro: 'Industry-standard asset path.', sf: 'assets/ships/release/parts/ — run check:asset-status.' },
      { name: 'Concept → blockout → bake → export pipeline', status: 'NEED', pro: 'Factory line per ship, not one-off agent mesh.', sf: 'assets/AGENTS.md + Blender MCP — process doc, not automated.' },
      { name: 'Asking agents for "metalness sliders"', status: 'NA', pro: 'Forums never showcase this — they showcase meshes and bakes.', sf: 'Brief agents on silhouette + texture sets + material roles instead.' },
    ],
  },
];

const LOOKS_PRESETS = {
  live: {
    label: '1 · Live game (slow on Intel)',
    bloom: true, strength: 0.52, threshold: 1.0, shadows: true, env: true,
    minRoughness: 0, envScale: 1, metalScale: 1, outline: false,
    verdict: 'CURRENT. Shiny PBR + HDR bloom. This is the hitch pole (full scene into HDR).',
  },
  arcade: {
    label: '2 · Arcade paint (tiny GPU save)',
    bloom: true, strength: 0.4, threshold: 0.82, shadows: true, env: true,
    minRoughness: 0.72, envScale: 0.22, metalScale: 0.45, outline: false,
    verdict: 'KEEP THE MESHES. Less chrome, paint reads, engines still glow. Art direction, not a 2×.',
  },
  glowOff: {
    label: '3 · Glow off (the real speed lever)',
    bloom: false, strength: 0, threshold: 1, shadows: true, env: true,
    minRoughness: 0.62, envScale: 0.35, metalScale: 0.7, outline: false,
    verdict: 'FASTER. Measured Intel hitch is the HDR+bloom scene pass. This is that pass gone.',
  },
  fastest: {
    label: '4 · Glow off + no shadows (cheapest still using these meshes)',
    bloom: false, strength: 0, threshold: 1, shadows: false, env: false,
    minRoughness: 0.8, envScale: 0, metalScale: 0.2, outline: false,
    verdict: 'FASTER STILL. Darker, flatter. Same models. This is what “make it run faster with a look” actually is.',
  },
  outline: {
    label: '5 · Comic outline ON TOP of live (slower — trap)',
    bloom: true, strength: 0.52, threshold: 1.0, shadows: true, env: true,
    minRoughness: 0.55, envScale: 0.5, metalScale: 0.6, outline: true,
    verdict: 'SLOWER. Extra line draws. Hides cheap tubes AND Hitch. Do not ship this for performance.',
  },
};

const SECTIONS = [
  {
    id: 'looks',
    title: 'Looks vs speed',
    badge: 'Looks',
    desc: `<strong>This is the decision board.</strong> Same Hitch-class ship and the 47-A tube+ring payload.
Switch the preset. Watch the picture <em>and</em> the millisecond number.<br><br>
<strong>What actually 2×s this game:</strong> stop paying for the full-resolution HDR scene + bloom
every frame (Intel measured that as the hitch). Hidden faces on a cargo tube will not. A rotoscope
filter on top of live PBR will make it worse.<br><br>
<strong>What to do about look:</strong> keep the meshes, paint them like machines (preset 2).
Bring tubes up to Hitch <em>construction</em>, do not dump Hitch down to the tube.
Preset 3 is how you see the speed win. Preset 5 is the trap.`,
    prompt: `Do not add a rotoscope/outline filter for performance. Do not runtime-cull interior triangles for performance.

Do:
1. Keep Hitch/Helios meshes. Retarget hulls to matte paint (higher roughness, weaker env). Keep engines/Massline bright.
2. Replace live primitive props (47-A spindle, nav buoy, cargo pod) with authored shells at the chase camera.
3. Leave hitch work on the HDR/bloom scene submit (PQ-129). Do not collide with renderer.js / bloom.js / precompile.js.

Verify in graphics-lab.html → Looks vs speed. Compare presets 1–4. Ignore 5 except as a “do not ship” demo.`,
    controls: [
      {
        id: 'lookPreset',
        label: 'Preset',
        type: 'select',
        value: 'live',
        options: Object.keys(LOOKS_PRESETS),
        optionLabels: Object.fromEntries(Object.entries(LOOKS_PRESETS).map(([k, v]) => [k, v.label])),
      },
    ],
  },
  {
    id: 'catalog',
    title: 'Technique Catalog',
    badge: 'Catalog',
    layout: 'catalog',
    desc: 'What professionals on r/3Dmodeling and game-art forums actually showcase — mapped to what SpaceFace supports today. <strong>Destiny 2 is not a slider problem.</strong> It is sculpted meshes, baked maps, layered materials, custom shaders, and a huge content budget.',
    prompt: `Do NOT brief graphics work as "tune metalness/roughness on boxes."

Brief it as a pipeline:
1. Reference: [concept image / Destiny / Freelancer screenshot] — call out silhouette, material breaks, wear story
2. Author in Blender: high-form blockout → retopo → UV → bake normal/AO/roughness/metalness/emissive masks
3. Export GLB to assets/ships/release/parts/ per assets/AGENTS.md
4. Wire in partsLibrary.js or bespoke builder (kestrelHero.js pattern)
5. Verify: graphics-lab.html Compare (hero vs gray) + npm run check:assets:live

SpaceFace will never match Destiny with procedural gray boxes. The gap is authored mesh + baked texture sets.`,
    controls: [],
  },
  {
    id: 'compare',
    title: 'Bad vs Good',
    badge: 'Compare',
    desc: `<strong>Left:</strong> agent-default gray primitives.<br><br>
<strong>Right:</strong> the real <span class="tag-good">buildKestrelHero()</span> — lofted hull, material hierarchy, drive glow, env reflections. Still not Destiny 2 — but it is the actual quality bar in this repo. Primitive PBR boxes will never cross that bar.`,
    prompt: `Build a [SHIP NAME] hull using SpaceFace's material hierarchy — NOT flat gray MeshStandardMaterial.

Requirements:
- Hull: pbrHullMaterial or materialLibrary role bodyPrimary (metalness ~0.16, roughness ~0.62) with procedural albedo + normal + roughness maps from canvasTextures.js
- Exposed hardware: machineryMaterial (metalness ~0.78) for engines, gun housings, keel
- Trim edges: materialLibrary role trim (high metalness, low roughness) on rails/bevels
- Engines: emissiveSignal strips + additive Sprite halo (makeStarTexture) parented at nozzle sockets
- Faction palette from palettes.js: hull=[HULL HEX], accent=[ACCENT HEX]
- Compare against graphics-lab.html "Bad vs Good" section before claiming done`,
    controls: [],
  },
  {
    id: 'pbr',
    title: 'PBR Sliders',
    badge: 'PBR',
    desc: 'Drag sliders on the test sphere. <strong>Metalness</strong> separates paint from metal. <strong>Roughness</strong> controls highlight tightness. <strong>Emissive</strong> feeds bloom. Toggle maps to see why flat color fails.',
    prompt: `Tune PBR on [ASSET] using MeshStandardMaterial with these ranges (SpaceFace standard):
- Painted hull shell: metalness 0.12–0.20, roughness 0.55–0.70
- Bare machinery: metalness 0.70–0.85, roughness 0.35–0.50
- Trim/chrome rails: metalness 0.80+, roughness 0.25–0.40
- Emissive signals only on engines/status lights: emissiveIntensity 0.8–1.8 (not whole hull)
Attach: map (albedo), normalMap, roughnessMap from canvasTextures.js builders
Verify in graphics-lab.html PBR section — sphere must show panel seams and specular breakup`,
    controls: [
      { id: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.01, value: 0.16 },
      { id: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01, value: 0.62 },
      { id: 'emissive', label: 'Emissive intensity', min: 0, max: 2, step: 0.05, value: 0.04 },
      { id: 'useMaps', label: 'Texture maps', type: 'toggle', value: true },
    ],
  },
  {
    id: 'textures',
    title: 'Procedural Textures',
    badge: 'Textures',
    desc: 'SpaceFace generates all surface detail at runtime via <strong>&lt;canvas&gt;</strong> — no PNG files needed. Each swatch is what agents should wire into materials, not solid hex colors.',
    prompt: `Wire procedural canvas textures for [ASSET]:
- Albedo: makeHullPanelTexture({ size:1024, seed, hull, accent, panelCount:12, wear:0.5 })
- Normal: makeHullNormalMap({ size:1024, seed:seed+1, panelCount:12, bevel:0.55 })
- Roughness: makeNoiseTexture({ size:1024, seed:99, octaves:4, contrast:1.1 })
- Greeble overlay: makeGreebleTexture on a slightly larger shell mesh (transparent, depthWrite:false)
- Halo sprite: makeStarTexture for engine glow / projectile bloom
Do NOT ship a hull with only material.color set — match graphics-lab.html Texture section swatches`,
    controls: [
      { id: 'swatch', label: 'Swatch', type: 'select', options: ['albedo', 'normal', 'roughness', 'greeble', 'star', 'gradient'], value: 'albedo' },
      { id: 'panelCount', label: 'Panel count', min: 4, max: 24, step: 1, value: 12 },
    ],
  },
  {
    id: 'roles',
    title: 'Material Roles',
    badge: 'Roles',
    desc: 'Named roles from <code>materialLibrary.js</code>. Agents should call <code>resolve("bodyPrimary", pal)</code> etc. — not invent one-off gray materials per mesh.',
    prompt: `Use materialLibrary roles for [ASSET] — do not create ad-hoc colors:
- bodyPrimary: main hull (textured PBR paint)
- bodySecondary: inner/darker panels
- trim: edge metal catching rim light
- machineryMaterial (shipKit): exposed mechanical parts
- emissiveSignal: engine strips, beacons (bloom-friendly)
- glass: MeshPhysicalMaterial cockpit (transmission + clearcoat)
- hazard / reward: semantic colors for warnings and loot
Palette: FACTION_PALETTES.[faction_id]
Show all roles in graphics-lab.html Roles grid for review`,
    controls: [],
  },
  {
    id: 'ship',
    title: 'Ship Anatomy',
    badge: 'Ship',
    desc: 'A minimal fighter built from primitives but using the full material stack. Toggle layers to see what each contributes. This is the factory-line quality bar — not a gray merged box.',
    prompt: `Assemble [SHIP CLASS] from primitives with causal material hierarchy:
1. Fuselage: pbrHullMaterial panels (BoxGeometry/CylinderGeometry merged by material)
2. Wings/prow: bodySecondary or darker hull panels
3. Engine housings: machineryMaterial
4. Edge rails: trim material
5. Cockpit band: emissiveSignal or glass
6. Nozzle glow: emissiveMaterial + child Sprite (makeStarTexture, additive)
7. Optional: decalMaterial greeble shell slightly above hull (transparent overlay)
8. Thrust animation: scale engine glow with throttle; emit trail particles on thrust
Reference: graphics-lab.html Ship section + src/render/ships/kestrelHero.js gold standard`,
    controls: [
      { id: 'layerHull', label: 'Hull PBR', type: 'toggle', value: true },
      { id: 'layerMachinery', label: 'Machinery contrast', type: 'toggle', value: true },
      { id: 'layerTrim', label: 'Trim metal', type: 'toggle', value: true },
      { id: 'layerEmissive', label: 'Engine emissive', type: 'toggle', value: true },
      { id: 'layerHalo', label: 'Sprite halo', type: 'toggle', value: true },
      { id: 'layerDecal', label: 'Greeble decal', type: 'toggle', value: true },
      { id: 'spin', label: 'Turntable', type: 'toggle', value: true },
    ],
  },
  {
    id: 'thruster',
    title: 'Engine / Thruster',
    badge: 'Thruster',
    desc: '<strong>Thruster ≠ gray cylinder.</strong> Stack: dark nozzle (machinery) → hot emissive core → additive sprite plume → particle trail. Color from <code>pal.thruster</code>. Bloom makes it read as heat.',
    prompt: `Build engine/thruster VFX for [SHIP]:
- Nozzle mesh: machineryMaterial dark metal
- Inner core: emissiveSignal with pal.thruster color, emissiveIntensity 1.2–2.0
- Plume: THREE.Sprite with makeStarTexture or makeGradientTexture, AdditiveBlending, depthWrite:false
- Trail: pooled particles emitted from nozzle each frame (vel = -forward * 20–40, life 0.35s, additive)
- Throttle drives sprite scale/opacity and particle rate
- Color: FACTION_PALETTES[faction].thruster
Match graphics-lab.html Thruster section — must glow with bloom on`,
    controls: [
      { id: 'throttle', label: 'Throttle', min: 0, max: 1, step: 0.01, value: 0.85 },
      { id: 'plumeSize', label: 'Plume size', min: 0.5, max: 3, step: 0.05, value: 1.4 },
    ],
  },
  {
    id: 'projectile',
    title: 'Projectile / Bolt',
    badge: 'Bolt',
    desc: 'Combat bolts use <strong>additive</strong> materials (no lighting needed) plus a billboard halo sprite. Stretched cylinder aligned to velocity. This is why bullets read as energy, not gray pills.',
    prompt: `Implement [WEAPON] projectile visual:
- Core: CylinderGeometry stretched along fire direction, MeshBasicMaterial or emissive Standard
- blending: THREE.AdditiveBlending, transparent:true, depthWrite:false
- Halo: child Sprite with makeStarTexture, scale 3× bolt length, same color
- Muzzle flash on fire: Sprite 0.08s life, scale punch 1→1.6, white core + weapon color
- Trail (optional): ribbon or particle streak for railgun/missile
- Color from weapon def or pal.accent — NOT default 0x888888
Verify in graphics-lab.html Projectile section`,
    controls: [
      { id: 'boltColor', label: 'Bolt hue', min: 0, max: 360, step: 1, value: 195 },
      { id: 'boltSpeed', label: 'Pulse speed', min: 0, max: 3, step: 0.1, value: 1.2 },
      { id: 'haloScale', label: 'Halo scale', min: 1, max: 5, step: 0.1, value: 2.5 },
    ],
  },
  {
    id: 'lighting',
    title: 'Lighting Rig',
    badge: 'Lights',
    desc: 'SpaceFace uses 4 directional/ambient lights (key, rim, fill, ambient) — no per-ship point lights. Form comes from the <strong>tilted chase camera</strong> + material contrast. Toggle each to see what it does.',
    prompt: `Ensure [ASSET] reads under SpaceFace lighting rig (renderer.js):
- Key light: cool highlight from above-forward (defines form)
- Rim light: cool shadow-side separation
- Fill: soft front fill
- Ambient: prevents pure black shadows (low intensity)
- Camera: ~58° downward tilt — silhouettes must read in XZ plane
- Do NOT fix darkness by cranking ambient to 2.0 — fix materials/normal maps
- Shadows optional (DirectionalLight shadowMap on key)
Test with graphics-lab.html Lighting toggles`,
    controls: [
      { id: 'lightKey', label: 'Key light', type: 'toggle', value: true },
      { id: 'lightRim', label: 'Rim light', type: 'toggle', value: true },
      { id: 'lightFill', label: 'Fill light', type: 'toggle', value: true },
      { id: 'lightAmbient', label: 'Ambient', type: 'toggle', value: true },
    ],
  },
  {
    id: 'bloom',
    title: 'Bloom & Post',
    badge: 'Bloom',
    desc: 'Row of spheres at increasing emissive — <strong>threshold</strong> culls dim ones, <strong>strength</strong> scales the halo. If sliders seemed dead: ACES tone-map (default in game) compresses highlights so 0.3 vs 0.9 strength looks similar. <strong>Set ACES to 0</strong> in global controls to see bloom respond.',
    prompt: `Bloom sliders looked broken because ACES filmic tone-mapping in bloom.js composite crushes highlight deltas.

To tune bloom:
1. Set aces to 0 while calibrating, then re-enable for shipping mood
2. strength 0.15–0.45, threshold 0.65–0.85
3. Only emissive/additive pixels above threshold contribute — gray hulls correctly do nothing

Post-process cannot fix bad meshes. Fix authored emissive masks + hero assets first.`,
    controls: [
      { id: 'testEmissive', label: 'Test sphere emissive', min: 0, max: 4, step: 0.1, value: 2 },
    ],
  },
];

function statusClass(s) {
  if (s === 'HAVE') return 'status-have';
  if (s === 'PARTIAL') return 'status-partial';
  if (s === 'NEED') return 'status-need';
  return 'status-na';
}

function renderTechniqueCatalog(root) {
  root.innerHTML = `<h2>Professional technique gap-map</h2>
<p class="catalog-lead">Forums showcase sculpted meshes, baked texture sets, and shader breakdowns — not metalness sliders on boxes. SpaceFace is a browser game on a budget renderer. This table is the honest brief for what to build vs what to stop asking agents for.</p>
${TECHNIQUE_CATALOG.map((cat) => `
<section>
  <h3>${cat.title}</h3>
  <div class="technique-grid">
    ${cat.items.map((t) => `
    <article class="technique-card">
      <header><strong>${t.name}</strong><span class="status-badge ${statusClass(t.status)}">${t.status}</span></header>
      <p><strong>Pro:</strong> ${t.pro}</p>
      <p class="sf-path"><strong>SpaceFace:</strong> ${t.sf}</p>
    </article>`).join('')}
  </div>
</section>`).join('')}`;
}

function bakeLabEnvironment(renderer, scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#142238');
  bg.addColorStop(0.45, '#081018');
  bg.addColorStop(1, '#030508');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 8; i++) {
    const x = 80 + i * 110;
    const y = 120 + (i % 3) * 40;
    const r = 60 + (i % 4) * 25;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${i % 2 ? 60 : 30},${i % 2 ? 140 : 80},${180 + i * 5},0.35)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  scene.environment = envMap;
  return envMap;
}

function applyEnvMapToObject(root, envMap) {
  if (!envMap) return;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.metalness > 0.35 || m.isMeshPhysicalMaterial) {
        m.envMap = envMap;
        m.envMapIntensity = m.metalness > 0.6 ? 0.85 : 0.45;
        m.needsUpdate = true;
      }
    }
  });
}

// ---------------------------------------------------------------------------
export async function bootGraphicsLab() {
  const canvas = document.getElementById('lab-canvas');
  const nav = document.getElementById('section-nav');
  const paletteSelect = document.getElementById('palette-select');
  const sectionTitle = document.getElementById('section-title');
  const sectionDesc = document.getElementById('section-desc');
  const sectionControls = document.getElementById('section-controls');
  const agentPrompt = document.getElementById('agent-prompt');
  const viewportBadge = document.getElementById('viewport-badge');
  const glossaryEl = document.getElementById('glossary');
  const catalogWrap = document.getElementById('catalog-wrap');
  const viewportWrap = document.getElementById('viewport-wrap');
  const bloomDiagnostics = document.getElementById('bloom-diagnostics');
  const catalogRoot = document.getElementById('technique-catalog');

  renderTechniqueCatalog(catalogRoot);

  // Glossary
  glossaryEl.innerHTML = GLOSSARY.map(([term, def]) => `<dt>${term}</dt><dd>${def}</dd>`).join('');

  // Palette select
  const paletteEntries = Object.entries(FACTION_PALETTES);
  let activePalette = paletteEntries[0][1];
  paletteSelect.innerHTML = paletteEntries.map(([id, p]) =>
    `<option value="${id}">${id.replace('faction_', '')}</option>`).join('');
  paletteSelect.addEventListener('change', () => {
    activePalette = FACTION_PALETTES[paletteSelect.value];
    lab.rebuildPalette(activePalette);
  });

  // Renderer + scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x060912, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060912, 0.0008);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  camera.position.set(0, 9, 14);
  camera.lookAt(0, 0, 0);

  const envMap = bakeLabEnvironment(renderer, scene);

  const bloom = createBloom(renderer, canvas.clientWidth, canvas.clientHeight);
  bloom.setOptions({ enabled: true, strength: 0.35, threshold: 0.72, exposure: 1.0, aces: 0 });

  // Lights (match renderer.js mood) + shadows like live game
  const ambient = new THREE.AmbientLight(0x101826, 0.6);
  const key = new THREE.DirectionalLight(0xbfd4ff, 1.6);
  key.position.set(60, 140, 40);
  const rim = new THREE.DirectionalLight(0x35507a, 0.55);
  rim.position.set(-70, 50, -60);
  const fill = new THREE.DirectionalLight(0x6080a0, 0.35);
  fill.position.set(20, 30, 120);
  scene.add(ambient, key, rim, fill);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 200;
  key.shadow.camera.left = -40;
  key.shadow.camera.right = 40;
  key.shadow.camera.top = 40;
  key.shadow.camera.bottom = -40;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x080a10, roughness: 0.95, metalness: 0.1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  ground.receiveShadow = true;
  scene.add(ground);

  const lab = createLabContent(scene, activePalette, envMap);
  let activeSection = 'looks';
  const controlState = {};

  // Build nav
  SECTIONS.forEach((sec) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lab-nav-btn' + (sec.id === activeSection ? ' is-active' : '');
    btn.textContent = sec.title;
    btn.dataset.section = sec.id;
    btn.addEventListener('click', () => switchSection(sec.id));
    nav.appendChild(btn);
  });

  function switchSection(id) {
    activeSection = id;
    const sec = SECTIONS.find((s) => s.id === id);
    nav.querySelectorAll('.lab-nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.section === id));
    sectionTitle.textContent = sec.title;
    sectionDesc.innerHTML = sec.desc;
    agentPrompt.textContent = sec.prompt;
    viewportBadge.textContent = sec.badge;
    const isCatalog = sec.layout === 'catalog';
    catalogWrap.classList.toggle('hidden', !isCatalog);
    viewportWrap.classList.toggle('hidden', isCatalog);
    document.getElementById('controls-card').classList.toggle('hidden', isCatalog);
    buildSectionControls(sec);
    lab.setVisibleSection(id);
    fitCameraForSection(id);
  }

  function buildSectionControls(sec) {
    sectionControls.innerHTML = '';
    sec.controls.forEach((ctrl) => {
      if (controlState[ctrl.id] === undefined) controlState[ctrl.id] = ctrl.value;
      if (ctrl.type === 'toggle') {
        const label = document.createElement('label');
        label.className = 'lab-toggle';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!controlState[ctrl.id];
        input.addEventListener('change', () => { controlState[ctrl.id] = input.checked; });
        label.append(input, document.createTextNode(' ' + ctrl.label));
        sectionControls.appendChild(label);
      } else if (ctrl.type === 'select') {
        const label = document.createElement('label');
        label.className = 'lab-range';
        label.textContent = ctrl.label;
        const select = document.createElement('select');
        ctrl.options.forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = (ctrl.optionLabels && ctrl.optionLabels[opt]) || opt;
          if (opt === controlState[ctrl.id]) o.selected = true;
          select.appendChild(o);
        });
        select.addEventListener('change', () => {
          controlState[ctrl.id] = select.value;
          if (ctrl.id === 'lookPreset') applyLooksPresentation(select.value);
        });
        label.appendChild(select);
        sectionControls.appendChild(label);
      } else {
        const label = document.createElement('label');
        label.className = 'lab-range';
        label.innerHTML = `${ctrl.label} <span data-val="${ctrl.id}">${controlState[ctrl.id]}</span>`;
        const input = document.createElement('input');
        input.type = 'range';
        input.min = ctrl.min; input.max = ctrl.max; input.step = ctrl.step;
        input.value = controlState[ctrl.id];
        input.addEventListener('input', () => {
          controlState[ctrl.id] = parseFloat(input.value);
          label.querySelector(`[data-val="${ctrl.id}"]`).textContent = input.value;
        });
        label.appendChild(input);
        sectionControls.appendChild(label);
      }
    });
  }

  function fitCameraForSection(id) {
    if (id === 'looks') { camera.position.set(0, 16, 11); camera.lookAt(0, 0.4, 0); }
    else if (id === 'compare') { camera.position.set(0, 12, 28); camera.lookAt(2, 0, 0); }
    else if (id === 'textures') { camera.position.set(0, 5, 8); camera.lookAt(0, 0.5, 0); }
    else if (id === 'roles') { camera.position.set(0, 10, 12); camera.lookAt(0, 0, 0); }
    else if (id === 'bloom') { camera.position.set(0, 5, 9); camera.lookAt(0, 1.8, 0); }
    else { camera.position.set(0, 6, 11); camera.lookAt(0, 0.5, 0); }
  }

  // Global bloom controls
  const bloomEnabled = document.getElementById('bloom-enabled');
  const bloomStrength = document.getElementById('bloom-strength');
  const bloomThreshold = document.getElementById('bloom-threshold');
  const exposure = document.getElementById('exposure');
  const acesAmount = document.getElementById('aces-amount');
  const syncBloomUi = () => {
    bloom.setOptions({
      enabled: bloomEnabled.checked,
      strength: parseFloat(bloomStrength.value),
      threshold: parseFloat(bloomThreshold.value),
      exposure: parseFloat(exposure.value),
      aces: parseFloat(acesAmount.value),
    });
    document.getElementById('bloom-strength-val').textContent = bloomStrength.value;
    document.getElementById('bloom-threshold-val').textContent = bloomThreshold.value;
    document.getElementById('exposure-val').textContent = parseFloat(exposure.value).toFixed(2);
    document.getElementById('aces-amount-val').textContent = parseFloat(acesAmount.value).toFixed(2);
  };
  [bloomEnabled, bloomStrength, bloomThreshold, exposure, acesAmount].forEach((el) => el.addEventListener('input', syncBloomUi));
  syncBloomUi();

  document.getElementById('copy-prompt').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt.textContent);
      document.getElementById('copy-prompt').textContent = 'Copied!';
      setTimeout(() => { document.getElementById('copy-prompt').textContent = 'Copy prompt'; }, 1500);
    } catch (_) { /* clipboard may be blocked */ }
  });

  function applyLooksPresentation(presetKey) {
    const p = LOOKS_PRESETS[presetKey] || LOOKS_PRESETS.live;
    bloomEnabled.checked = p.bloom;
    bloomStrength.value = String(p.strength);
    bloomThreshold.value = String(p.threshold);
    renderer.shadowMap.enabled = p.shadows;
    key.castShadow = p.shadows;
    scene.environment = p.env ? envMap : null;
    syncBloomUi();
  }

  const origSwitch = switchSection;
  switchSection = function patchedSwitch(id) {
    origSwitch(id);
    if (id === 'looks') applyLooksPresentation(controlState.lookPreset || 'live');
    else {
      renderer.shadowMap.enabled = true;
      key.castShadow = true;
      scene.environment = envMap;
    }
  };

  switchSection('looks');

  function resize() {
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth;
    const h = Math.max(420, wrap.clientHeight || 520);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bloom.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let frameEmaMs = 16.7;
  let lastFrameMs = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dtMs = now - lastFrameMs;
    lastFrameMs = now;
    frameEmaMs = frameEmaMs * 0.9 + dtMs * 0.1;
    const t = clock.getElapsedTime();
    lab.update(t, controlState, activeSection);
    bloom.render(scene, camera);
    const d = bloom.diagnostics();
    const preset = LOOKS_PRESETS[controlState.lookPreset] || LOOKS_PRESETS.live;
    const looksLine = activeSection === 'looks'
      ? `\n${preset.verdict}`
      : '\nTip: ACES=0 to see strength/threshold change';
    bloomDiagnostics.textContent = `${frameEmaMs.toFixed(1)} ms  (${Math.max(1, 1000 / frameEmaMs).toFixed(0)} fps)  bloom: ${d.enabled ? 'on' : 'off'}  shadows: ${renderer.shadowMap.enabled ? 'on' : 'off'}${looksLine}`;
  }
  animate();

  lab.rebuildPalette = (pal) => lab.rebuildPaletteImpl(pal);
}

// ---------------------------------------------------------------------------
function createLabContent(scene, palette, envMap) {
  const root = new THREE.Group();
  scene.add(root);

  const sections = {};
  SECTIONS.forEach((s) => {
    const g = new THREE.Group();
    g.name = `section-${s.id}`;
    g.visible = false;
    root.add(g);
    sections[s.id] = g;
  });

  const state = { palette, sections, meshes: {}, envMap };

  buildLooksSection(sections.looks, state);
  buildCompareSection(sections.compare, state);
  buildPbrSection(sections.pbr, state);
  buildTextureSection(sections.textures, state);
  buildRolesSection(sections.roles, state);
  buildShipSection(sections.ship, state);
  buildThrusterSection(sections.thruster, state);
  buildProjectileSection(sections.projectile, state);
  buildLightingSection(sections.lighting, state);
  buildBloomSection(sections.bloom, state);

  return {
    setVisibleSection(id) {
      Object.values(sections).forEach((g) => { g.visible = false; });
      if (sections[id]) sections[id].visible = true;
    },
    rebuildPaletteImpl(pal) {
      state.palette = pal;
      rebuildAll(state);
    },
    update(t, controls, activeSection) {
      updateLooks(state, t, controls);
      updateCompare(state, t);
      updatePbr(state, controls);
      updateTextures(state, controls);
      updateShip(state, controls, t);
      updateThruster(state, controls, t);
      updateProjectile(state, controls, t);
      updateLighting(state, controls);
      updateBloomDemo(state, controls, t);
    },
  };
}

function palToMaterialPalette(pal) {
  return { hull: pal.hull, accent: pal.accent || pal.primary, emissive: pal.emissive || pal.accent };
}

function buildLooksSection(group, state) {
  const kestrel = buildKestrelHero({ radius: 5, vel: { x: 80, z: 0 } });
  kestrel.position.set(8, 0, 0);
  kestrel.rotation.y = Math.PI / 2;
  applyEnvMapToObject(kestrel, state.envMap);
  kestrel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  stampLookOriginals(kestrel);
  state.meshes.looksShip = kestrel;

  const tube = buildLooksPayload();
  tube.position.set(-9, 0.6, 0);
  stampLookOriginals(tube);
  state.meshes.looksPayload = tube;

  const shipLabel = makeTextSprite('HITCH-CLASS SHIP (keep this work)', '#7af7d0');
  shipLabel.position.set(8, 6.2, 0);
  const tubeLabel = makeTextSprite('47-A TUBE (below the bar)', '#ff6b6b');
  tubeLabel.position.set(-9, 4.2, 0);

  group.add(kestrel, tube, shipLabel, tubeLabel);
  state.meshes.looksGroup = group;
  state.meshes.looksOutlines = [];
}

function buildLooksPayload() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x6a7684, roughness: 0.38, metalness: 0.55 });
  const ring = new THREE.MeshStandardMaterial({ color: 0x4aa8c8, roughness: 0.22, metalness: 0.7, emissive: 0x1a4a58, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 4.6, 20).rotateZ(Math.PI / 2), hull);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.08, 10, 36).rotateY(Math.PI / 2), ring);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0xc47a22, roughness: 0.4, metalness: 0.3 }));
  tab.position.set(0.4, 1.15, 0);
  body.castShadow = hoop.castShadow = tab.castShadow = true;
  g.add(body, hoop, tab);
  return g;
}

function stampLookOriginals(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.userData.lookOriginal = mats.map((m) => ({
      roughness: m.roughness,
      metalness: m.metalness,
      envMapIntensity: m.envMapIntensity,
      emissiveIntensity: m.emissiveIntensity,
    }));
  });
}

function applyLooksMaterials(root, preset) {
  if (!root || !preset) return;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const orig = o.userData.lookOriginal || [];
    mats.forEach((m, i) => {
      const o0 = orig[i] || {};
      const baseR = Number.isFinite(o0.roughness) ? o0.roughness : m.roughness;
      const baseM = Number.isFinite(o0.metalness) ? o0.metalness : m.metalness;
      const baseE = Number.isFinite(o0.envMapIntensity) ? o0.envMapIntensity : (m.envMapIntensity || 1);
      m.roughness = Math.max(baseR, preset.minRoughness);
      m.metalness = Math.max(0, baseM * preset.metalScale);
      if ('envMapIntensity' in m) m.envMapIntensity = preset.env ? baseE * preset.envScale : 0;
      m.needsUpdate = true;
    });
  });
}

function setLooksOutlines(state, on) {
  const existing = state.meshes.looksOutlines || [];
  for (const line of existing) {
    if (line.parent) line.parent.remove(line);
    if (line.geometry) line.geometry.dispose();
    if (line.material) line.material.dispose();
  }
  state.meshes.looksOutlines = [];
  if (!on) return;
  const mat = new THREE.LineBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.85 });
  for (const root of [state.meshes.looksShip, state.meshes.looksPayload]) {
    if (!root) continue;
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const edges = new THREE.EdgesGeometry(o.geometry, 25);
      const line = new THREE.LineSegments(edges, mat);
      o.add(line);
      state.meshes.looksOutlines.push(line);
    });
  }
}

function updateLooks(state, t, controls) {
  if (state.meshes.looksShip) state.meshes.looksShip.rotation.y = Math.PI / 2 + t * 0.12;
  if (state.meshes.looksPayload) state.meshes.looksPayload.rotation.y = t * 0.2;
  const preset = LOOKS_PRESETS[controls && controls.lookPreset] || LOOKS_PRESETS.live;
  if (state.meshes._lookApplied !== controls.lookPreset) {
    state.meshes._lookApplied = controls.lookPreset;
    applyLooksMaterials(state.meshes.looksShip, preset);
    applyLooksMaterials(state.meshes.looksPayload, preset);
    setLooksOutlines(state, preset.outline);
  }
}

function rebuildAll(state) {
  const pal = state.palette;
  if (state.meshes.badShip) applyBadShipMaterials(state.meshes.badShip);
  if (state.meshes.pbrSphere) rebuildPbrMaterial(state, palToMaterialPalette(pal));
  if (state.meshes.demoShip) rebuildDemoShip(state, pal);
  if (state.meshes.thruster) rebuildThruster(state, pal);
  rebuildRoles(state, pal);
}

// --- Compare: gray agent-default vs real Kestrel hero ---
function buildCompareSection(group, state) {
  state.meshes.badShip = buildAgentDefaultShip(-14);
  const kestrel = buildKestrelHero({ radius: 5, vel: { x: 80, z: 0 } });
  kestrel.position.set(10, 0, 0);
  kestrel.rotation.y = Math.PI / 2;
  applyEnvMapToObject(kestrel, state.envMap);
  kestrel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  state.meshes.goodShip = kestrel;
  group.add(state.meshes.badShip, kestrel);

  const labelBad = makeTextSprite('AGENT DEFAULT', '#ff6b6b');
  labelBad.position.set(-14, 5, 0);
  const labelGood = makeTextSprite('KESTREL HERO (repo bar)', '#7af7d0');
  labelGood.position.set(10, 6, 0);
  group.add(labelBad, labelGood);
  applyBadShipMaterials(state.meshes.badShip);
}

function buildAgentDefaultShip(x) {
  const ship = new THREE.Group();
  ship.position.x = x;
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 2.4), new THREE.MeshStandardMaterial());
  body.position.y = 0.4;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 6), new THREE.MeshStandardMaterial());
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(3.8, 0.4, 0);
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1, 8), new THREE.MeshStandardMaterial());
  eng.rotation.x = Math.PI / 2; eng.position.set(-3, 0, 0);
  ship.add(body, nose, eng);
  return ship;
}

function applyBadShipMaterials(ship) {
  ship.traverse((o) => {
    if (!o.isMesh) return;
    o.material = new THREE.MeshStandardMaterial({ color: 0x555860, roughness: 0.5, metalness: 0.5 });
  });
}

function updateCompare(state, t) {
  if (state.meshes.badShip) state.meshes.badShip.rotation.y = t * 0.25;
  if (state.meshes.goodShip) state.meshes.goodShip.rotation.y = Math.PI / 2 + t * 0.2;
}

// --- PBR sphere ---
function buildPbrSection(group, state) {
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.8, 48, 32));
  sphere.position.y = 1.8;
  group.add(sphere);
  state.meshes.pbrSphere = sphere;
  rebuildPbrMaterial(state, palToMaterialPalette(state.palette));
}

function rebuildPbrMaterial(state, mp, opts = {}) {
  const sphere = state.meshes.pbrSphere;
  if (!sphere) return;
  const seed = 7;
  const useMaps = opts.useMaps !== false;
  if (useMaps) {
    sphere.material = pbrHullMaterial({ hull: mp.hull, accent: mp.accent, seed, panelCount: 14 });
  } else {
    sphere.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(mp.hull), roughness: 0.62, metalness: 0.16,
    });
  }
  if (opts.metalness !== undefined) sphere.material.metalness = opts.metalness;
  if (opts.roughness !== undefined) sphere.material.roughness = opts.roughness;
  if (opts.emissive !== undefined) {
    sphere.material.emissive = new THREE.Color(mp.accent);
    sphere.material.emissiveIntensity = opts.emissive;
  }
}

function updatePbr(state, controls) {
  const mp = palToMaterialPalette(state.palette);
  rebuildPbrMaterial(state, mp, {
    useMaps: controls.useMaps !== false,
    metalness: controls.metalness ?? 0.16,
    roughness: controls.roughness ?? 0.62,
    emissive: controls.emissive ?? 0.04,
  });
}

// --- Texture swatches ---
function buildTextureSection(group, state) {
  const holder = new THREE.Group();
  group.add(holder);
  state.meshes.textureHolder = holder;
  state.meshes.texturePlane = null;
}

function updateTextures(state, controls) {
  const holder = state.meshes.textureHolder;
  if (!holder) return;
  const swatch = controls.swatch || 'albedo';
  const panelCount = controls.panelCount ?? 12;
  const mp = palToMaterialPalette(state.palette);
  const seed = 11;

  let tex;
  if (swatch === 'albedo') tex = makeHullPanelTexture({ size: 512, seed, hull: mp.hull, accent: mp.accent, panelCount, wear: 0.5 });
  else if (swatch === 'normal') tex = makeHullNormalMap({ size: 512, seed: seed + 1, panelCount, bevel: 0.55 });
  else if (swatch === 'roughness') tex = makeNoiseTexture({ size: 512, seed: 99, octaves: 4, contrast: 1.2 });
  else if (swatch === 'greeble') tex = makeGreebleTexture({ size: 512, seed, density: 1, accent: mp.accent });
  else if (swatch === 'star') tex = makeStarTexture({ size: 128, color: mp.accent });
  else tex = makeGradientTexture({ size: 256, type: 'radial', stops: [[0, '#ffffff'], [0.35, mp.accent], [1, '#000000']] });

  if (!state.meshes.texturePlane) {
    state.meshes.texturePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    state.meshes.texturePlane.position.y = 2.5;
    holder.add(state.meshes.texturePlane);
  } else {
    state.meshes.texturePlane.material.map = tex;
    state.meshes.texturePlane.material.needsUpdate = true;
  }
}

// --- Material roles grid ---
function buildRolesSection(group, state) {
  state.meshes.roleMeshes = [];
  const roles = ['bodyPrimary', 'bodySecondary', 'trim', 'hazard', 'reward', 'glass', 'emissiveSignal'];
  const cols = 4;
  roles.forEach((role, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    mesh.position.set((col - 1.5) * 2.2, 1.2 + row * -1.5, 0);
    mesh.userData.role = role;
    group.add(mesh);
    state.meshes.roleMeshes.push(mesh);
  });
  rebuildRoles(state, state.palette);
}

function rebuildRoles(state, pal) {
  const mp = palToMaterialPalette(pal);
  (state.meshes.roleMeshes || []).forEach((mesh) => {
    const role = mesh.userData.role;
    if (role === 'emissiveSignal') mesh.material = resolveMaterial('emissiveSignal', mp, 1.6);
    else mesh.material = resolveMaterial(role, mp);
  });
}

// --- Demo ship with toggles ---
function buildShipSection(group, state) {
  state.meshes.demoShip = new THREE.Group();
  group.add(state.meshes.demoShip);
  rebuildDemoShip(state, state.palette);
}

function rebuildDemoShip(state, pal) {
  const ship = state.meshes.demoShip;
  if (!ship) return;
  while (ship.children.length) ship.remove(ship.children[0]);
  const mp = palToMaterialPalette(pal);
  const seed = 99;

  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 1.6), pbrHullMaterial({ hull: mp.hull, accent: mp.accent, seed, panelCount: 12 }));
  fuselage.name = 'layerHull'; fuselage.position.y = 0.3;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 8), pbrHullMaterial({ hull: mp.hull, accent: mp.accent, seed: seed + 1, panelCount: 8 }));
  nose.name = 'layerHull'; nose.rotation.z = -Math.PI / 2; nose.position.set(2.6, 0.3, 0);

  const engHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.9, 10), machineryMaterial());
  engHousing.name = 'layerMachinery'; engHousing.rotation.x = Math.PI / 2; engHousing.position.set(-2, 0.1, 0);

  const trimRail = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 1.7), resolveMaterial('trim', mp));
  trimRail.name = 'layerTrim'; trimRail.position.y = 0.72;

  const emissive = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.2), emissiveMaterial(pal.thruster || mp.accent, 1.8));
  emissive.name = 'layerEmissive'; emissive.position.set(-1.8, 0.05, 0);

  const decalShell = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.85, 1.65), decalMaterial({ hull: mp.hull, accent: mp.accent, seed, kind: 'greeble' }));
  decalShell.name = 'layerDecal';

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeStarTexture({ size: 64, color: pal.thruster || mp.accent }),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9,
  }));
  halo.name = 'layerHalo'; halo.scale.set(2.2, 2.2, 1); halo.position.set(-2.3, 0, 0);

  ship.add(fuselage, nose, engHousing, trimRail, emissive, decalShell, halo);
}

function updateShip(state, controls, t) {
  const ship = state.meshes.demoShip;
  if (!ship) return;
  ship.traverse((o) => {
    if (!o.name || !o.name.startsWith('layer')) return;
    const key = o.name;
    const on = controls[key] !== false;
    o.visible = on;
  });
  if (controls.spin !== false) ship.rotation.y = t * 0.45;
}

// --- Thruster ---
function buildThrusterSection(group, state) {
  state.meshes.thruster = new THREE.Group();
  group.add(state.meshes.thruster);
  state.meshes.thrusterParticles = [];
  rebuildThruster(state, state.palette);
}

function rebuildThruster(state, pal) {
  const g = state.meshes.thruster;
  if (!g) return;
  while (g.children.length) g.remove(g.children[0]);
  const mp = palToMaterialPalette(pal);

  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.2, 12), machineryMaterial('#141a22', 0.4, 0.8));
  housing.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.4, 10), emissiveMaterial(pal.thruster || mp.accent, 2));
  core.rotation.x = Math.PI / 2; core.position.x = -0.5;

  const plume = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGradientTexture({ size: 128, type: 'radial', stops: [[0, '#ffffff'], [0.4, pal.thruster || mp.accent], [1, '#000000']] }),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  plume.name = 'plume';
  plume.scale.set(1.4, 1.4, 1);
  plume.position.x = -1.1;

  g.add(housing, core, plume);
}

function updateThruster(state, controls, t) {
  const g = state.meshes.thruster;
  if (!g) return;
  const throttle = controls.throttle ?? 0.85;
  const plume = g.getObjectByName('plume');
  if (plume) {
    const sz = (controls.plumeSize ?? 1.4) * (0.5 + throttle * 0.8);
    plume.scale.set(sz * (1 + 0.1 * Math.sin(t * 20)), sz * 1.4, 1);
    plume.material.opacity = 0.4 + throttle * 0.55;
  }
  g.rotation.y = t * 0.2;
}

// --- Projectile ---
function buildProjectileSection(group, state) {
  state.meshes.projectile = new THREE.Group();
  group.add(state.meshes.projectile);
  const bolt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8),
    new THREE.MeshBasicMaterial({ color: 0x39d0ff }),
  );
  bolt.rotation.z = Math.PI / 2;
  bolt.name = 'bolt';
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeStarTexture({ size: 64, color: '#a0f0ff' }),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9,
  }));
  halo.name = 'boltHalo';
  halo.scale.set(2.5, 2.5, 1);
  state.meshes.projectile.add(bolt, halo);
}

function updateProjectile(state, controls, t) {
  const g = state.meshes.projectile;
  if (!g) return;
  const hue = (controls.boltColor ?? 195) / 360;
  const color = new THREE.Color().setHSL(hue, 0.85, 0.6);
  const bolt = g.getObjectByName('bolt');
  const halo = g.getObjectByName('boltHalo');
  const pulse = 0.85 + 0.15 * Math.sin(t * (controls.boltSpeed ?? 1.2) * 10);
  if (bolt) bolt.material.color.copy(color);
  if (halo) {
    halo.material.color.copy(color);
    const hs = (controls.haloScale ?? 2.5) * pulse;
    halo.scale.set(hs, hs, 1);
  }
  g.position.x = Math.sin(t * 2) * 1.5;
  g.rotation.y = t * 1.5;
}

// --- Lighting (uses scene lights; show test sphere) ---
function buildLightingSection(group, state) {
  const test = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 32, 24),
    pbrHullMaterial({ hull: '#c8d8f0', accent: '#39d0ff', seed: 3, panelCount: 10 }),
  );
  test.position.y = 1.5;
  group.add(test);
  state.meshes.lightTest = test;
}

function updateLighting(state, controls) {
  const scene = state.sections.lighting.parent;
  if (!scene) return;
  scene.traverse((o) => {
    if (o.isAmbientLight) o.visible = controls.lightAmbient !== false;
    if (o.isDirectionalLight) {
      if (o.color.getHex() === 0xbfd4ff) o.visible = controls.lightKey !== false;
      else if (o.color.getHex() === 0x35507a) o.visible = controls.lightRim !== false;
      else o.visible = controls.lightFill !== false;
    }
  });
}

// --- Bloom calibration: emissive intensity ladder ---
function buildBloomSection(group, state) {
  state.meshes.bloomSpheres = [];
  const intensities = [0, 0.3, 0.8, 1.5, 2.5, 4.0];
  intensities.forEach((ei, i) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 28, 20),
      new THREE.MeshStandardMaterial({
        color: 0x111118,
        emissive: new THREE.Color('#39d0ff'),
        emissiveIntensity: ei,
        roughness: 0.35,
        metalness: 0.1,
      }),
    );
    mesh.position.set((i - 2.5) * 1.6, 1.4, 0);
    mesh.userData.baseEmissive = ei;
    group.add(mesh);
    state.meshes.bloomSpheres.push(mesh);
  });
  state.meshes.bloomTest = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0x111118, emissive: new THREE.Color('#66ccff'), emissiveIntensity: 2,
      roughness: 0.3, metalness: 0.15,
    }),
  );
  state.meshes.bloomTest.position.set(0, 2.8, -2);
  group.add(state.meshes.bloomTest);

  const hint = makeTextSprite('ACES=0 → drag strength/threshold', '#8a9bb5');
  hint.position.set(0, 4.2, 0);
  hint.scale.set(5, 0.55, 1);
  group.add(hint);
}

function updateBloomDemo(state, controls, t) {
  const testEi = controls.testEmissive ?? 2;
  if (state.meshes.bloomTest) {
    state.meshes.bloomTest.material.emissiveIntensity = testEi * (0.9 + 0.1 * Math.sin(t * 2));
  }
  (state.meshes.bloomSpheres || []).forEach((m) => {
    if (m.material) m.material.emissiveIntensity = m.userData.baseEmissive;
  });
}

// --- Helpers ---
function makeTextSprite(text, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  c.width = 512; c.height = 64;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = 'bold 22px Segoe UI, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, c.width / 2, 40);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(4, 0.5, 1);
  return sprite;
}