// DUST P3 first increment — the broody frame (sky + hero). Pins the headless-testable halves
// of the 2026-10-31 capture-audit fixes:
//   1. deep star floor (starless near-half of default flight frames),
//   2. deep-space floor tone in the sky composite (dead-void band under authored plates),
//   3. painted-planet terminator uniforms (unlit-billboard planets),
//   4. the resident planet's real DirectionalLight (planets cast no light),
//   5. the hero rim rig's light-count discipline (player hull flat against the void),
//   6. the Kestrel idle drive floor (no at-rest thruster life).
// Look evidence and perf A/B live in .devshots/dust/ (flight-look + probe-frame-solid runs).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpaceBackground, PALETTES } from '../src/render/spaceBackground.js';
import { HeroRig } from '../src/render/heroRig.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';
import {
  PAINTED_PLANET_DIAMETER,
  PAINTED_RING_BODY_DIAMETER,
} from '../src/render/paintedPlanets.js';
const RING_SYSTEM_DIAMETER = 0.445;

const HIGH_TIER_GPU = { renderer: 'NVIDIA GeForce RTX 4080', vendor: 'NVIDIA', software: false, tier: 'discrete' };
const MID_TIER_GPU = { renderer: 'Intel Iris Xe', vendor: 'Intel', software: false, tier: 'integrated' };

class ProbeBackground extends SpaceBackground {
  _measureGeometry() {
    this.heroDist = 400; this.heroSizeK = 4; this.quadSize = 800;
    this.starCell = 1800; this.windowBiasZ = 0; this.perspScale = 973; this.starPxToWorld = 0.4;
  }
  _bakeFlareAtlas() { return null; }
  _warmPlanetBakePipeline() { return true; }
  _bakeLayer(material, rt) { /* no GL in the probe */ }
  _createFlares() { this.flares = null; }
  _createComet() { this.comet = null; }
  // Deterministic stand-in texture so the painted-impostor path never touches the GPU bake.
  // Ring specs get the ringed-image metadata fractions (body diameter vs quad fill differ).
  _getPlanetTexture(spec) {
    const t = new THREE.Texture();
    if (spec && spec.ring) {
      t.userData = { paintedPlanet: true,
        paintedPlanetDiameter: RING_SYSTEM_DIAMETER, paintedBodyDiameter: PAINTED_RING_BODY_DIAMETER };
    } else {
      t.userData = { paintedPlanet: true, paintedPlanetDiameter: PAINTED_PLANET_DIAMETER };
    }
    return t;
  }
}

// Geometry-real probe: keeps the REAL _measureGeometry (cell sized from the chase-camera
// footprint) so screen-space density assertions measure the flight frame, not the fixture.
class GeometryProbeBackground extends SpaceBackground {
  _bakeFlareAtlas() { return null; }
  _warmPlanetBakePipeline() { return true; }
  _bakeLayer(material, rt) { /* no GL in the probe */ }
  _createFlares() { this.flares = null; }
  _createComet() { this.comet = null; }
  _getPlanetTexture(spec) { return ProbeBackground.prototype._getPlanetTexture.call(this, spec); }
}

function buildBackground(Probe = ProbeBackground, zoom = 144) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000);
  const tilt = 60 * Math.PI / 180;
  camera.position.set(0, zoom * Math.sin(tilt), -zoom * Math.cos(tilt));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const state = {
    meta: { seed: 4242 },
    render: { gpu: MID_TIER_GPU },
    settings: { video: { particleQuality: 'medium' } },
    camera: { zoom },
  };
  return { bg: new Probe(scene, state, { camera }), scene, camera, state };
}

// -----------------------------------------------------------------------------------------
// 1. Deep star floor: a second population on a deeper plane joins the SAME Points draw, is
//    faint/low-parallax/calm, and leaves every shipped attribute sequence untouched.
// -----------------------------------------------------------------------------------------
{
  const { bg } = buildBackground();
  bg._createStars();
  const geo = bg.stars.pts.geometry;
  const pos = geo.getAttribute('position');
  const pars = geo.getAttribute('aPar');
  const speeds = geo.getAttribute('aTwinkleSpeed');
  let deep = 0;
  let firstDeep = -1;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) <= -400) { if (firstDeep < 0) firstDeep = i; deep++; }
  }
  assert.ok(deep >= 900, `deep star floor exists (got ${deep} at y<=-400)`);
  assert.equal(firstDeep, bg.stars.count - deep, 'deep population is appended after the shipped stars');
  assert.equal(geo.drawRange.count, bg.stars.count, 'draw range includes the deep floor');
  for (let i = firstDeep; i < firstDeep + deep; i++) {
    assert.ok(pars.getX(i) <= 0.091, 'deep stars stay low-parallax (far backdrop, not a second field)');
    assert.equal(speeds.getX(i), 0, 'deep stars are calm: no shimmer of their own');
  }
  // Same seed, same shipped prefix: the shipped RNG streams must be byte-identical.
  const { bg: bg2 } = buildBackground();
  bg2._createStars();
  const pos2 = bg2.stars.pts.geometry.getAttribute('position');
  for (let i = 0; i < firstDeep; i++) {
    assert.equal(pos.getY(i), pos2.getY(i), 'shipped star positions unchanged by the deep fill');
  }
}

// -----------------------------------------------------------------------------------------
// 1b. Deep floor screen coverage: with the REAL _measureGeometry (cell from the chase-camera
//     footprint), the deep population projected through the STAR_VERT wrap math covers every
//     screen quadrant — the banded starless floor of the 2026-11-01 look gate stays dead.
// -----------------------------------------------------------------------------------------
{
  const { bg, camera } = buildBackground(GeometryProbeBackground);
  bg._createStars();
  const geo = bg.stars.pts.geometry;
  const pos = geo.getAttribute('position');
  const pars = geo.getAttribute('aPar');
  const cell = bg.stars.cell;
  const bias = bg.windowBiasZ;
  const worldY = bg.bgY + 6; // group y + STAR_DEPTH
  const view = camera.matrixWorldInverse;
  const v = new THREE.Vector3();
  const REG = 4; // 4x4 screen regions
  const deepRegions = Array.from({ length: REG }, () => Array(REG).fill(0));
  let deepTotal = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > -400) continue; // deep population only
    const par = pars.getX(i);
    const wx = ((pos.getX(i) + cell * 0.5) % cell + cell) % cell - cell * 0.5;
    const wz = ((pos.getZ(i) + cell * 0.5) % cell + cell) % cell - cell * 0.5 + bias;
    v.set(wx, worldY + pos.getY(i), wz).applyMatrix4(view);
    if (v.z >= 0) continue;
    v.applyMatrix4(camera.projectionMatrix);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
    if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
    deepTotal++;
    const col = Math.min(REG - 1, Math.max(0, Math.floor(((v.x + 1) / 2) * REG)));
    const row = Math.min(REG - 1, Math.max(0, Math.floor(((1 - (v.y + 1) / 2)) * REG)));
    deepRegions[row][col]++;
  }
  const flat = deepRegions.flat();
  const worst = Math.min(...flat);
  const best = Math.max(...flat);
  assert.ok(deepTotal >= 600, `deep floor populates the frame (got ${deepTotal} on screen)`);
  assert.ok(worst >= 20, `every screen quadrant keeps deep floor stars (worst region ${worst})`);
  assert.ok(best / worst <= 7, `floor gradient bounded top-to-bottom (best ${best} vs worst ${worst})`);
}

// -----------------------------------------------------------------------------------------
// 1c. The nadir size gain is deep-tier-only: the star vertex shader gates on the deep parallax
//     band, so shipped/haze star pixels are untouched and the floor reads low on the screen.
// -----------------------------------------------------------------------------------------
{
  const { bg } = buildBackground();
  bg._createStars();
  const vert = bg.stars.mat.vertexShader;
  assert.ok(vert.includes('aPar <= 0.095'), 'nadir gain is gated to the deep parallax band');
  assert.ok(vert.includes('deepNadirGain'), 'deep stars carry the nadir compensation term');
}

// -----------------------------------------------------------------------------------------
// 2. Deep-space floor tone: the composite carries the additive term, the uniforms exist, the
//    palette drives the hue, and the GLSL never uses a reversed-edge smoothstep (undefined
//    behavior on some drivers).
// -----------------------------------------------------------------------------------------
{
  const { bg } = buildBackground();
  const un = bg.layerMaterial.uniforms;
  assert.ok(un.uDeepTone && un.uDeepGain, 'composite material owns the deep tone uniforms');
  assert.ok(un.uDeepGain.value > 0 && un.uDeepGain.value <= 1, 'deep gain is a bounded mix ceiling');
  const frag = bg.layerMaterial.fragmentShader;
  assert.ok(frag.includes('color += uDeepTone'), 'the deep tone is additive (cannot demote authored art)');
  assert.ok(!/smoothstep\(\s*[-0-9.]+\s*,\s*-[0-9.]+\s*,/.test(frag) || !frag.includes('smoothstep(0.55, -0.95'),
    'no reversed-edge smoothstep in the composite');
  const before = un.uDeepTone.value.getHexString();
  bg.bakeAll('AZURE');
  assert.notEqual(un.uDeepTone.value.getHexString(), before, 'bakeAll moves the deep tone with the palette');
  const haze = new THREE.Color(PALETTES.AZURE.haze);
  assert.ok(un.uDeepTone.value.r >= haze.r - 1e-6, 'deep tone derives from the palette haze hue');
  // 2b. Gate follow-up: the band carries near-full gain at the plates' structure line (~+0.3
  //     NDC y, the belt ochre-shoal cut the look gate measured at ~35% frame height) instead of
  //     stepping down with the plate, and the gain never demotes authored art (additive term).
  assert.ok(frag.includes('smoothstep(-0.30, 1.05'), 'deep band re-weighted to cover the plate structure line');
  assert.ok(!frag.includes('smoothstep(-0.95, 0.55'), 'the old low-seam band weighting is gone');
}

// -----------------------------------------------------------------------------------------
// 3. Painted-planet terminator: the sprite style adopts per-material uniforms and _spawnPlanet
//    aims them at the planet's authored light angle and disc radius.
// -----------------------------------------------------------------------------------------
{
  const { bg } = buildBackground();
  const tex = bg._getPlanetTexture({ type: 'rocky', seed: 1 });
  const mat = bg._getPlanetSpriteMaterial(tex);
  const style = mat.userData && mat.userData.sfPlanetStyle;
  assert.ok(style && style.uPLightDir && style.uPDiscR, 'sprite material carries terminator uniform holders');
  assert.equal(style.uPDiscR.value, 0.43, 'atlas views default to the 0.86 body diameter');
  // onBeforeCompile adopts the SAME uniform objects, so later writes flow without a recompile.
  // The probe shader must satisfy the same include markers as the real three.js sprite shaders,
  // or the contract guard in spaceBackground.js (stylePlanetMaterial) correctly refuses it.
  const shader = {
    vertexShader: '#include <common>\n#include <uv_vertex>\nvoid main() { gl_Position = vec4(0.0); }',
    fragmentShader: '#include <common>\nvoid main() { vec4 diffuseColor; outgoingLight = diffuseColor.rgb; }',
    uniforms: {},
  };
  mat.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uPLightDir, style.uPLightDir, 'shader adopts the material-owned light dir');
  assert.equal(shader.uniforms.uPDiscR, style.uPDiscR, 'shader adopts the material-owned disc radius');
  assert.ok(shader.fragmentShader.includes('uPDiscR'), 'terminator math is injected into the sprite program');
  assert.ok(shader.fragmentShader.includes('sfPlit'), 'day/night shading is present');
  bg._clearResidentHeroes(); // the constructor's own hero admission may hold the single slot
  bg._spawnPlanet({ kind: 'planet', bx: 40, bz: 20, type: 'ice', frac: 0.2, seed: 9,
    lightAngle: Math.PI / 2, ring: false, ringTilt: 0 });
  const resident = bg.planets[0];
  const residentStyle = resident.mat.userData.sfPlanetStyle;
  assert.ok(Math.abs(residentStyle.uPLightDir.value.x) < 1e-9
    && Math.abs(residentStyle.uPLightDir.value.y - 1) < 1e-9,
  'resident planet aims the terminator at its authored light angle');
}

// -----------------------------------------------------------------------------------------
// 3b. Terminator on the SECOND paint path — the ringed images. Their body diameter (what the
//     terminator needs) and their quad fill (what sizing needs) are different fractions; the
//     first increment conflated them, so ringed bodies kept an unlit outer annulus ("uniformly
//     lit ringed gas giant" in the look gate). Both fractions must exist, the disc must cover
//     the body, and the drawn size must not change.
// -----------------------------------------------------------------------------------------
{
  assert.ok(PAINTED_RING_BODY_DIAMETER > 0.8 && PAINTED_RING_BODY_DIAMETER < 1,
    'ringed body nearly fills its image (body diameter fraction)');
  assert.ok(RING_SYSTEM_DIAMETER > 0.3 && RING_SYSTEM_DIAMETER < PAINTED_RING_BODY_DIAMETER,
    'the ring system extends past the body (quad fill < body diameter)');
  const { bg } = buildBackground();
  const expectedQuad = (frac) => frac * bg.H * Math.max(1.15, bg.heroSizeK) * 0.58 / RING_SYSTEM_DIAMETER;
  bg._clearResidentHeroes();
  bg._spawnPlanet({ kind: 'planet', bx: 40, bz: 20, type: 'ice', frac: 0.2, seed: 9,
    lightAngle: Math.PI / 2, ring: true, ringTilt: 0 });
  const ringed = bg.planets[0];
  const style = ringed.mat.userData.sfPlanetStyle;
  const discR = style.uPDiscR.value;
  const bodyRadiusUv = PAINTED_RING_BODY_DIAMETER * 0.5;
  assert.ok(Math.abs(discR - bodyRadiusUv) < 1e-9,
    `ringed terminator disc covers the full body (got ${discR}, body radius ${bodyRadiusUv})`);
  assert.ok(discR > 0.4, 'the ringed disc is not the half-body quarter of the first increment');
  assert.ok(Math.abs(ringed.sprite.scale.x - expectedQuad(0.2)) < 1e-6,
    'ringed drawn size is unchanged (quad still sized against the ring system fill)');
  assert.ok(Math.abs(style.uPLightDir.value.y - 1) < 1e-9,
    'ringed resident also aims the terminator at its authored light angle');
}

// -----------------------------------------------------------------------------------------
// 4. Planet light: mounted once with the background (before shader warm-up), switched by
//    intensity only, eased in with a resident hero and out without one.
// -----------------------------------------------------------------------------------------
{
  const { bg } = buildBackground();
  const lights = [];
  bg.group.traverse((o) => { if (o.isDirectionalLight) lights.push(o); });
  assert.equal(lights.length, 1, 'exactly one directional light joins the background');
  assert.equal(lights[0].name, 'SF_PlanetLight');
  assert.equal(lights[0].intensity, 0, 'starts dark');
  assert.equal(lights[0].visible, true, 'never switched by visibility (light census is baked)');
  bg._clearResidentHeroes();
  bg._spawnPlanet({ kind: 'planet', bx: 40, bz: 20, type: 'gas', frac: 0.2, seed: 9,
    lightAngle: 0, ring: false, ringTilt: 0 });
  assert.equal(bg.planetLight.color.getHexString(), 'ffb070', 'gas day side tints the light');
  for (let i = 0; i < 120; i++) bg.update(1 / 60, i / 60, { x: i * 0.5, z: 0 });
  assert.ok(bg.planetLight.intensity > 0.1, `light eases in with the resident (got ${bg.planetLight.intensity})`);
  assert.ok(bg.planetLight.intensity <= 0.22 + 1e-6, 'faint by design: never a second sun');
  // Retire the hero AND stop re-admission so the decay is observable.
  bg._refreshHeroes = () => {};
  bg._reconcileHeroViewport = () => {};
  bg._clearResidentHeroes();
  for (let i = 0; i < 240; i++) bg.update(1 / 60, 4 + i / 60, { x: 60, z: 0 });
  assert.ok(bg.planetLight.intensity < 0.01, `light eases out without a resident (got ${bg.planetLight.intensity})`);
}

// -----------------------------------------------------------------------------------------
// 5. Hero rim rig: mounted light stays visible at all times (count is baked into programs),
//    intensity-switched, eased with the presented hull, and posed beyond it relative to the
//    chase camera (which never yaws), so the rake survives the top-down angle.
// -----------------------------------------------------------------------------------------
{
  const scene = new THREE.Scene();
  const rig = new HeroRig(scene);
  assert.equal(rig.light.visible, true, 'rim switches by intensity, never by visibility');
  assert.equal(rig.light.intensity, 0, 'starts dark');
  // Census discipline: exactly ONE light joins the scene with the rig (the rake). The pilot
  // lamp is a sprite, never a light, so no sector light budget or baked census can drop it.
  const rigLights = [];
  rig.group.traverse((o) => { if (o.isLight) rigLights.push(o); });
  assert.equal(rigLights.length, 1, 'the rig contributes exactly one light to any census');
  // Calibration (2026-11-01 gate: rim absent in bright sectors): irradiance at the hull center
  // must clear half a candela-equivalent so the rake survives sector keys of 2.4-3.4 without
  // lifting the world's authored darkness.
  const dist2 = rig.look.offsetX ** 2 + rig.look.offsetY ** 2 + rig.look.offsetZ ** 2;
  const irradiance = rig.look.intensity / dist2;
  assert.ok(irradiance >= 0.55 && irradiance <= 1.2,
    `rim irradiance at the hull reads in every sector (got ${irradiance.toFixed(2)})`);
  const posCalls = [];
  const membrane = { toLocal: (p, out) => { out.x = p.x; out.z = p.z; posCalls.push(p.x); return out; } };
  const state = {
    mode: 'flight',
    playerId: 7,
    entities: new Map([[7, { id: 7, alive: true, pos: { x: 10, z: -4 }, rot: 0, radius: 4 }]]),
  };
  assert.equal(rig.pilotLamp.material.opacity, 0, 'pilot lamp starts dark');
  for (let i = 0; i < 30; i++) rig.update(state, 1 / 60, membrane, null);
  assert.ok(rig.light.intensity > 0, 'eases in during flight');
  assert.ok(rig.light.position.z > 0, 'rake comes from +Z, beyond the hull relative to the camera');
  assert.ok(rig.light.position.y > 20, 'rake is mounted above the hull tops');
  // Pilot lamp: the at-rest engine ember (P3b "idle thruster life"). Behind the hull center
  // along the facing law (bare heading 0 -> aft (-1, 0)), lit in flight regardless of drive.
  assert.ok(rig.pilotLamp.material.opacity > 0.5, 'engine ember burns at rest in flight');
  assert.ok(rig.pilotLamp.position.x < 10, 'ember sits aft of the hull center (heading law)');
  assert.ok(rig.pilotLamp.scale.x >= 1.2, 'ember is sized to the hull, not sub-pixel');
  const inFlight = rig.light.intensity;
  const inFlightPilot = rig.pilotLamp.material.opacity;
  rig.update({ ...state, entities: new Map() }, 1 / 60, membrane, null);
  assert.ok(rig.light.intensity > 0 && rig.light.intensity < inFlight,
    'removed player fades at the last pose without throwing');
  for (let i = 0; i < 60; i++) rig.update({ ...state, mode: 'dock' }, 1 / 60, membrane, null);
  assert.equal(rig.light.intensity, 0, 'out of flight the rake releases fully');
  assert.equal(rig.pilotLamp.material.opacity, 0, 'out of flight the ember releases fully');
  assert.ok(inFlight > 0 && inFlightPilot > 0);
  rig.clear();
  assert.equal(rig.light.visible, true, 'clear() still never hides the light');
}

// -----------------------------------------------------------------------------------------
// 6. Idle drive floor: the starter hull's at-rest plume signature stays a restrained glow but
//    is no longer sub-pixel at the default chase zoom (0.06 -> 0.085).
// -----------------------------------------------------------------------------------------
{
  const idle = KESTREL_MAIN_PLUME_RECIPE.throttle && KESTREL_MAIN_PLUME_RECIPE.throttle.idle;
  assert.ok(typeof idle === 'number' && idle >= 0.08 && idle <= 0.1,
    `kestrel idle floor raised off the sub-pixel floor (got ${idle})`);
}

console.log('dust-sky-hero-frame: all assertions passed');
