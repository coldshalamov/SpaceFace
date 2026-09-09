import assert from 'node:assert/strict';
import { closeSync, openSync, readSync } from 'node:fs';
import test from 'node:test';
import { Color } from 'three';

import { createGameState } from '../src/core/gameState.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { FACTION_PALETTES } from '../src/data/palettes.js';
import {
  resolveBackgroundComposition,
  resolveBackgroundStructure,
  resolveSectorVisualProfile,
  SECTOR_VISUAL_PROFILES,
} from '../src/data/sectorVisualProfiles.js';
import {
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_CINEMATIC_TOE,
  resolveEffectiveSectorPost,
  resolvePostToeFloorSrgb,
} from '../src/render/bloom.js';
import { resolveDeepFieldStructureRecipe } from '../src/render/deepFieldStructureRecipes.js';
import {
  applyAuthoredSurfaceTint,
  authoredPreloadPlanForEntity,
  authoredSurfaceTintRole,
  requiresProductionWholeShipForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { SpaceRenderGraph } from '../src/render/post/spaceRenderGraph.js';
import { render } from '../src/render/renderer.js';
import { KESTREL_HERO_COLORS } from '../src/render/ships/kestrelHero.js';
import { resolveBloomRadianceScale } from '../src/render/vfx.js';
import { SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';

function rgb01(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

function hslSaturation(hex) {
  const [r, g, b] = rgb01(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) * 0.5;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
}

function relativeLuminance(hex) {
  const linear = rgb01(hex).map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 1e-12, `${message}: expected ${expected}, got ${actual}`);
}

function readGlbJson(url) {
  const descriptor = openSync(url, 'r');
  try {
    const header = Buffer.alloc(20);
    assert.equal(readSync(descriptor, header, 0, header.length, 0), header.length);
    assert.equal(header.toString('ascii', 0, 4), 'glTF', 'release asset must be a binary glTF');
    assert.equal(header.toString('ascii', 16, 20), 'JSON', 'first GLB chunk must be JSON');
    const jsonLength = header.readUInt32LE(12);
    const jsonBytes = Buffer.alloc(jsonLength);
    let offset = 0;
    while (offset < jsonLength) {
      const read = readSync(descriptor, jsonBytes, offset, jsonLength - offset, 20 + offset);
      assert.ok(read > 0, 'release GLB JSON chunk ended early');
      offset += read;
    }
    return JSON.parse(jsonBytes.toString('utf8').replace(/\u0000+$/u, ''));
  } finally {
    closeSync(descriptor);
  }
}

function materialFromGlbDefinition(definition) {
  const factor = definition.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
  return {
    name: definition.name || '',
    userData: definition.extras || {},
    color: new Color().setRGB(factor[0], factor[1], factor[2]),
    emissive: new Color(0, 0, 0),
    needsUpdate: false,
  };
}

test('Helios receives a bespoke high-readability environment profile', () => {
  const profile = resolveSectorVisualProfile({
    id: 'sector_helios_prime',
    palette: SECTOR_PALETTE_CLASSES.core,
  });

  assert.equal(profile.id, 'helios_core');
  assert.equal(profile.skyPalette, 'AZURE');
  assert.equal(profile.background.nebulaOpacity, 0,
    'clear civilized space should not be covered by a full-screen nebula');
  assert.ok(profile.lighting.ambient <= 0.25,
    'space lighting needs directional form instead of flat ambient fill');
  assert.ok(profile.lighting.key >= profile.lighting.ambient * 6);
  assert.ok(profile.post.bloomStrengthScale >= 1);
  assert.equal(profile.background.structure.starDensity, 1.12,
    'starter-sector density stays within the prior measured vertex budget');
});

test('sector profiles own a stable background composition instead of only a color grade', () => {
  const helios = resolveBackgroundComposition(resolveSectorVisualProfile({
    id: 'sector_helios_prime',
    palette: SECTOR_PALETTE_CLASSES.core,
  }));
  const anomaly = resolveBackgroundComposition(resolveSectorVisualProfile({
    id: 'unknown-anomaly',
    palette: { ...SECTOR_PALETTE_CLASSES.anomaly },
  }));

  assert.equal(helios.signatureHero.kind, 'planet');
  assert.equal(helios.signatureHero.type, 'gas');
  assert.equal(helios.signatureHero.ring, true);
  assert.ok(helios.signatureHero.screenNdc[0] >= 0.5,
    'the Helios landmark stays in the right-side background rather than covering the player ship');
  assert.ok(helios.planetChance > anomaly.planetChance,
    'civilized core space favors celestial landmarks over anomalies');
  assert.ok(anomaly.wormholeChance > helios.wormholeChance,
    'anomaly space has its own recognizable hero-object grammar');
  assert.equal(Object.isFrozen(helios), true);
  assert.equal(Object.isFrozen(helios.signatureHero), true);
});

test('background composition resolution clamps malformed optional profile data', () => {
  const composition = resolveBackgroundComposition({
    background: {
      composition: {
        planetChance: 8,
        wormholeChance: -4,
        ringChance: Number.NaN,
        cometInterval: [90, 10],
      },
    },
  });

  assert.equal(composition.planetChance, 1);
  assert.equal(composition.wormholeChance, 0);
  assert.equal(composition.ringChance, 0.45);
  assert.deepEqual(composition.cometInterval, [10, 90]);
});

test('palette classes resolve stable visual families after save round-trips', () => {
  const copiedAnomalyPalette = { ...SECTOR_PALETTE_CLASSES.anomaly };
  const profile = resolveSectorVisualProfile({ id: 'sector_unknown', palette: copiedAnomalyPalette });

  assert.equal(profile.id, 'anomaly');
  assert.equal(profile.skyPalette, 'ION');
  assert.equal(profile.background.nebulaOpacity, 0,
    'anomaly identity must stay localized rather than lifting the full frame');
  const coreRecipe = resolveDeepFieldStructureRecipe(resolveBackgroundStructure(resolveSectorVisualProfile(null)));
  const anomalyRecipe = resolveDeepFieldStructureRecipe(resolveBackgroundStructure(profile));
  assert.notEqual(anomalyRecipe.id, coreRecipe.id,
    'anomaly identity comes from an authored spatial composition, not a color wash');
  assert.deepEqual(anomalyRecipe.ribbons, [],
    'the anomaly composition must not replace fullscreen gas with visible procedural wires');
  assert.ok(anomalyRecipe.starAssociations.length >= 2,
    'the anomaly composition retains deterministic localized stellar structure');
  assert.ok(profile.post.bloomStrengthScale >= 1,
    'sector identity may shape bloom without suppressing the live energy baseline');
});

test('visual profiles are immutable shared data and unknown sectors fall back safely', () => {
  const profile = resolveSectorVisualProfile(null);

  assert.equal(profile.id, 'core');
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.lighting), true);
  assert.throws(() => { profile.lighting.key = 99; }, TypeError);
});

test('live bloom defaults resolve through renderer and render-graph behavior for every sector', () => {
  const state = createGameState(0x046);
  const profiles = Object.values(SECTOR_VISUAL_PROFILES);
  const expected = {
    helios_core: { bloomStrength: 0.52, bloomThreshold: 1.00, exposure: 0.96 },
    core: { bloomStrength: 0.5408, bloomThreshold: 0.98, exposure: 0.96 },
    belt: { bloomStrength: 0.572, bloomThreshold: 0.94, exposure: 0.95 },
    fringe: { bloomStrength: 0.5616, bloomThreshold: 0.96, exposure: 0.94 },
    anomaly: { bloomStrength: 0.6032, bloomThreshold: 0.90, exposure: 0.95 },
  };

  assert.equal(DEFAULT_BLOOM_STRENGTH, 0.52);
  assert.equal(state.settings.video.bloom, true);
  assert.equal(state.settings.video.bloomStrength, DEFAULT_BLOOM_STRENGTH,
    'game-state and post-processor defaults must describe the same live route');

  for (const profile of profiles) {
    assert.ok(profile.post.bloomStrengthScale >= 1,
      `${profile.id} must not suppress the live bloom-strength baseline`);
    assert.ok(profile.post.bloomThresholdBias <= 0,
      `${profile.id} must not hide authored energy behind a higher threshold`);
    assert.ok(DEFAULT_BLOOM_STRENGTH * profile.post.bloomStrengthScale >= DEFAULT_BLOOM_STRENGTH,
      `${profile.id} must retain at least the default bloom energy`);
    const effective = resolveEffectiveSectorPost(state.settings.video, profile.post);
    const rendererEffective = render._applySectorPost.call(
      { _sectorPost: profile.post },
      render._normalizePostVideo(state.settings.video),
    );
    assertClose(effective.bloomStrength, expected[profile.id].bloomStrength,
      `${profile.id} effective strength`);
    assertClose(effective.bloomThreshold, expected[profile.id].bloomThreshold,
      `${profile.id} effective threshold`);
    assertClose(effective.exposure, expected[profile.id].exposure,
      `${profile.id} effective exposure`);
    assertClose(rendererEffective.bloomStrength, effective.bloomStrength,
      `${profile.id} renderer strength contract`);
    assertClose(rendererEffective.bloomThreshold, effective.bloomThreshold,
      `${profile.id} renderer threshold contract`);
  }

  const clamped = resolveEffectiveSectorPost(
    { bloomStrength: 0.9, bloomThreshold: 0.05 },
    { bloomStrengthScale: 2, bloomThresholdBias: -0.2 },
  );
  assert.equal(clamped.bloomStrength, 1, 'sector multiplication clamps to the supported slider ceiling');
  assert.equal(clamped.bloomThreshold, 0, 'negative sector bias cannot produce an invalid threshold');

  const anomaly = render._applySectorPost.call(
    { _sectorPost: SECTOR_VISUAL_PROFILES.anomaly.post },
    render._normalizePostVideo(state.settings.video),
  );
  let bloomPatch = null;
  let graphPatch = null;
  const rendererHarness = Object.create(render);
  Object.assign(rendererHarness, {
    state,
    _sectorPost: SECTOR_VISUAL_PROFILES.anomaly.post,
    _postOptionsSig: null,
    bloom: { setOptions(patch) { bloomPatch = { ...patch }; } },
    _renderGraph: { setOptions(patch) { graphPatch = { ...patch }; } },
    renderer: { toneMappingExposure: 0, toneMapping: null },
  });
  rendererHarness._syncPostOptions(true);
  for (const key of ['bloomStrength', 'bloomThreshold', 'exposure', 'grade', 'vignette', 'toe', 'grain']) {
    assertClose(graphPatch[key], bloomPatch[key], `post routes share ${key}`);
  }
  assert.equal(graphPatch.acesToneMapping, bloomPatch.acesToneMapping);
  assert.equal(graphPatch.grain, 0);

  const graph = new SpaceRenderGraph({
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
  }, { enabled: false, ...graphPatch });
  const diagnostics = graph.diagnostics();
  assertClose(diagnostics.bloomStrength, anomaly.bloomStrength, 'alternate graph strength contract');
  assertClose(diagnostics.bloomThreshold, anomaly.bloomThreshold, 'alternate graph threshold contract');
  assertClose(diagnostics.exposure, anomaly.exposure, 'alternate graph exposure contract');
  assertClose(diagnostics.grade, anomaly.grade, 'alternate graph grade contract');
  assertClose(diagnostics.vignette, anomaly.vignette, 'alternate graph vignette contract');
  assertClose(diagnostics.toe, anomaly.toe, 'alternate graph toe contract');
  assertClose(graph.compositeMaterial.uniforms.uToe.value, anomaly.toe, 'alternate graph live toe uniform');
  assert.match(graph.compositeMaterial.fragmentShader, /applySpacePostPresentation/,
    'alternate graph compiles the shared black-preserving presentation function');
  assert.doesNotMatch(graph.compositeMaterial.fragmentShader, /graded\s*\+=/,
    'alternate graph must not restore its former additive cyan black lift');
  graph.dispose();

  assertClose(resolveBloomRadianceScale({ bloom: true, bloomStrength: DEFAULT_BLOOM_STRENGTH }), 1.4,
    'the named direct-radiance baseline stays stable while the compositor owns spill strength');
  for (const strength of [0, Number.EPSILON, 0.1, 0.35, DEFAULT_BLOOM_STRENGTH, 1]) {
    assertClose(resolveBloomRadianceScale({ bloom: true, bloomStrength: strength }), 1.4,
      `source radiance must not double-scale bloom strength ${strength}`);
    assertClose(resolveBloomRadianceScale({ bloom: true, bloomStrength: strength }) * strength,
      1.4 * strength, `combined spill response stays linear at ${strength}`);
  }
  assert.equal(resolveBloomRadianceScale({ bloom: false, bloomStrength: DEFAULT_BLOOM_STRENGTH }), 1.4,
    'bloom-off changes compositor spill only, not authored source radiance');
});

test('the calibrated cinematic toe lands near the documented perceptual black floor', () => {
  assert.equal(DEFAULT_CINEMATIC_TOE, 0.0039);
  const bytes = resolvePostToeFloorSrgb().map((channel) => Math.round(channel * 255));
  assert.deepEqual(bytes, [11, 12, 14]);
  assert.ok(Math.max(...bytes) <= 16,
    'the toe must not restore the former byte-35 full-frame blue veil');
});

test('paint-driven faction hulls carry hue while sterile-white and structural-nacre identities stay exact', () => {
  const factionRows = Object.entries(FACTION_PALETTES);
  const materialIdentityExceptions = {
    faction_fulfillment: '#D8D8D0',
    faction_verge_layers: '#B0A8B8',
  };

  for (const [factionId, palette] of factionRows) {
    assert.match(palette.hull, /^#[0-9A-F]{6}$/i, `${factionId} hull is a valid color`);
    if (materialIdentityExceptions[factionId]) {
      assert.equal(palette.hull, materialIdentityExceptions[factionId],
        `${factionId} keeps its canon material identity instead of generic saturated paint`);
      continue;
    }
    assert.ok(hslSaturation(palette.hull) >= 0.25,
      `${factionId} paint-driven dominant hull must remain meaningfully saturated`);
  }
  assert.equal(new Set(factionRows.map(([, palette]) => palette.hull.toLowerCase())).size, factionRows.length,
    'dominant hull paint remains faction-distinct');
});

test('procedural Kestrel fallback keeps a cobalt shell with subordinate cyan contrast', () => {
  assert.equal(KESTREL_HERO_COLORS.shell, '#315f83');
  assert.equal(KESTREL_HERO_COLORS.frontier, '#4ecbe0');
  assert.ok(hslSaturation(KESTREL_HERO_COLORS.shell) >= 0.35,
    'the dominant Kestrel shell must not regress to warm grey');
  assert.ok(relativeLuminance(KESTREL_HERO_COLORS.frontier)
    - relativeLuminance(KESTREL_HERO_COLORS.shell) >= 0.3,
  'Free Frontier cyan remains a bright contrast against the dominant shell');
});

test('ordinary Kestrel route selects the authored GLB and applies its cobalt/cyan material roles', () => {
  const player = {
    id: 'player',
    isPlayer: true,
    type: 'ship',
    team: 0,
    data: { defId: NEW_GAME.shipId },
  };
  assert.equal(NEW_GAME.shipId, 'ship_kestrel');
  assert.equal(requiresProductionWholeShipForEntity(player), true,
    'ordinary player construction must require the production whole ship');
  const selection = wholeShipVisualForEntity(player, { requiredWholeShip: true });
  assert.equal(selection.file, 'wholeships/kestrel.glb');
  assert.equal(selection.assetId, 'SF_K0_KESTREL_BORROWED_TIME_V4');
  assert.deepEqual(authoredPreloadPlanForEntity(player, { requiredWholeShip: true }), {
    hull: ['wholeships/kestrel.glb'],
  },
    'the same pure selector used by flight residency must preload the authored body');

  const glb = readGlbJson(new URL(`../assets/ships/release/parts/${selection.file}`, import.meta.url));
  const definitions = new Map((glb.materials || []).map((material) => [material.name, material]));
  assert.ok(definitions.has('Material_Hull'), 'release GLB must expose its dominant hull material');
  assert.ok(definitions.has('Material_Accent_FrontierCyan'),
    'release GLB must expose its canonical cyan accent material');
  const hull = materialFromGlbDefinition(definitions.get('Material_Hull'));
  const accent = materialFromGlbDefinition(definitions.get('Material_Accent_FrontierCyan'));
  assert.equal(authoredSurfaceTintRole({}, hull), 'hull');
  assert.equal(authoredSurfaceTintRole({}, accent), 'accent');

  const free = FACTION_PALETTES.faction_free;
  applyAuthoredSurfaceTint(hull, free.hull, 'hull');
  applyAuthoredSurfaceTint(accent, free.accent, 'accent');
  assert.ok(hull.color.b > hull.color.r,
    'the authored hull material receives a cobalt/cyan identity bias instead of remaining neutral');
  assert.ok(accent.color.b - accent.color.r > hull.color.b - hull.color.r,
    'the authored cyan accent remains more chromatic than the dominant hull factor');
  assert.ok(relativeLuminance(free.accent) - relativeLuminance(free.hull) >= 0.3,
    'the live authored-route palette preserves bright cyan hierarchy over the dark hull');
});
