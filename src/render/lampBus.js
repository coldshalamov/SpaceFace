// The Lamp Bus (runtime owner; authored data: src/data/lampChannels.js).
//
// One shared clock, no per-frame work per lamp. Every lamp material that belongs to a channel carries the
// SAME two uniform objects (LAMP_UNIFORMS) plus two small per-material constant vectors; the fragment
// shader multiplies the lamp's emissive radiance by a flash-and-decay envelope. Consequences, by design:
//   * no extra draw calls, materials, textures or render targets (the lamp meshes already existed);
//   * no per-frame allocation and no per-lamp CPU: tickLampBus writes two numbers once a frame;
//   * the hook is installed on the AUTHORED lamp material at admission, so the ship-local clones the
//     damage system already makes for nav lamps (partsLibrary mutableMaterialFor ->
//     cloneMaterialPreservingShaderHooks) inherit it, and every clone gets its own phase from its own
//     uuid: sister hulls do not blink in unison, and phase stays put as a hull moves (a world-position hash
//     in the shader would scramble while the ship flies);
//   * signal-role lamps never installed the illustrated-surface shader, so this is a NEW small program
//     family (cache key LAMP_BUS_VERSION) and ILLUSTRATED_SURFACE_KEY is untouched: no hull program is
//     recompiled. It is compiled at admission through the retained program-specimen pass like any other
//     authored material state, not in flight.
// Reduced-flash flattens every channel to its steady gain through the shared uniform (no recompile).
import { Vector4 } from 'three';
import {
  LAMP_BUS_VERSION, LAMP_CHANNELS, LAMP_TIME_WRAP_S, lampPhaseForKey,
} from '../data/lampChannels.js';
import { canonicalizeSurfaceProgramFamilyKey } from './illustratedSurface.js';

const TAG = 'spacefaceLampBusHook';
const COMMON_NEEDLE = '#include <common>';
const EMISSIVE_NEEDLE = '#include <emissivemap_fragment>';

/**
 * Shared by every lamp-bus material (sfLamp*). tickLampBus is the only writer.
 *
 * The `lamp` tag and the double initial values are deliberate, not decoration. A bare `{ value: 0 }` shares
 * its V8 hidden class with every uniform three.js creates (`{ value: Vector3 }`, `{ value: null }` ...), and
 * that shared class has a Tagged `value` field, so every number written to it is boxed into a fresh heap
 * number: one allocation per write, every frame. A distinct shape with a double-initialised field keeps the
 * field unboxed, and a tick allocates nothing (test/lamp-bus.test.mjs measures it with three loaded).
 * three ignores extra properties on a uniform object. The first tick overwrites the starting values.
 */
export const LAMP_UNIFORMS = Object.freeze({
  sfLampTime: { lamp: 'time', value: 0.5 },
  // 1 = animate, 0 = reduced flash (every channel holds its steady gain). Starts effectively 0 (1e-9 keeps the
  // field a double): until the renderer ticks the bus, which stills, benches, probes and previews that never
  // run the entity sync do not, every lamp holds its calm steady glow instead of freezing at a random flash phase.
  sfLampMotion: { lamp: 'motion', value: 1e-9 },
});

/**
 * Once per frame, from the renderer. `timeS` is the presentation clock (the authored-motion clock: sim time
 * while the sim runs, wall time while it is frozen, so a docked ship's lamps keep their rhythm).
 */
export function tickLampBus(timeS, reducedFlash = false) {
  const t = Number.isFinite(timeS) ? timeS : 0;
  LAMP_UNIFORMS.sfLampTime.value = t - Math.floor(t / LAMP_TIME_WRAP_S) * LAMP_TIME_WRAP_S;
  LAMP_UNIFORMS.sfLampMotion.value = reducedFlash ? 0 : 1;
}

// GLSL mirror of lampGain() in src/data/lampChannels.js (that function is what tests evaluate).
//   sfLampShape = (period s, floor, steady, cycle offset)   sfLampFlash = (attack s, decay tau s, tap time s, tap amp)
export const LAMP_GAIN_GLSL = /* glsl */`
  uniform float sfLampTime;
  uniform float sfLampMotion;
  uniform vec4 sfLampShape;
  uniform vec4 sfLampFlash;
  float sfLampFlashShape(float sfT, float sfAttack, float sfTau) {
    return min(sfT / sfAttack, 1.0) * exp(-max(sfT - sfAttack, 0.0) / sfTau);
  }
  float sfLampGain() {
    float sfCycle = fract(sfLampTime / sfLampShape.x + sfLampShape.w);
    float sfT = sfCycle * sfLampShape.x;
    float sfFirst = sfLampFlashShape(sfT, sfLampFlash.x, sfLampFlash.y);
    float sfT2 = sfT - sfLampFlash.z;
    if (sfT2 < 0.0) sfT2 += sfLampShape.x;
    float sfSecond = sfLampFlash.w * sfLampFlashShape(sfT2, sfLampFlash.x, sfLampFlash.y);
    float sfAnimated = sfLampShape.y + (1.0 - sfLampShape.y) * max(sfFirst, sfSecond);
    return mix(sfLampShape.z, sfAnimated, sfLampMotion);
  }
`;

/**
 * Suffix for any cache that shares materials by their visible properties (partsLibrary sharedMaterialVariants).
 * A hooked lamp and a steady lamp of the same colour, emissive and roughness look identical to a property
 * signature: without this token the first one minted would be handed to both, and a trim line would blink (or a
 * beacon would not). Empty for every material that is not on a channel, so no existing key changes.
 */
export function lampShareToken(material) {
  const channel = material && material.userData && material.userData.spacefaceLampChannel;
  return channel ? `|lamp:${channel}` : '';
}

/**
 * Put a lamp material on a channel. Chains any existing onBeforeCompile, installs no new material, and is
 * idempotent. Returns true when the material is (now) on the bus.
 */
export function installLampBus(material, channelId) {
  const channel = LAMP_CHANNELS[channelId];
  if (!channel || !material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)
      || material.transparent || material.opacity < 1 || material.transmission > 0) return false;
  if (material.onBeforeCompile?.[TAG] === LAMP_BUS_VERSION) return true;
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey?.() || '';
  function lampBusShader(shader, renderer) {
    previousHook?.call(this, shader, renderer);
    if (!shader.fragmentShader.includes(COMMON_NEEDLE) || !shader.fragmentShader.includes(EMISSIVE_NEEDLE)) {
      throw new Error('[render] lamp bus: physical emissive shader contract changed');
    }
    shader.uniforms ??= {};
    // Shared objects, not copies: tickLampBus writes one value and every lamp program reads it.
    shader.uniforms.sfLampTime = LAMP_UNIFORMS.sfLampTime;
    shader.uniforms.sfLampMotion = LAMP_UNIFORMS.sfLampMotion;
    // Per-material constants. `this` is the material being compiled: a ship-local clone has its own uuid, so
    // each hull's nav lamps get their own stagger. Cosmetic hash; never state.rng.
    const phase = (channel.offset + lampPhaseForKey(this && this.uuid)) % 1;
    shader.uniforms.sfLampShape = { value: new Vector4(channel.period, channel.floor, channel.steady, phase) };
    shader.uniforms.sfLampFlash = {
      value: new Vector4(channel.attack, channel.tau, channel.tapAt, channel.tapAmp),
    };
    shader.fragmentShader = shader.fragmentShader
      .replace(COMMON_NEEDLE, `${COMMON_NEEDLE}\n${LAMP_GAIN_GLSL}`)
      .replace(EMISSIVE_NEEDLE, `${EMISSIVE_NEEDLE}\n  totalEmissiveRadiance *= sfLampGain();`);
  }
  Object.assign(lampBusShader, previousHook);
  lampBusShader[TAG] = LAMP_BUS_VERSION;
  material.onBeforeCompile = lampBusShader;
  const familyKey = canonicalizeSurfaceProgramFamilyKey(previousKey, LAMP_BUS_VERSION);
  material.customProgramCacheKey = () => familyKey;
  material.userData = { ...(material.userData || {}), spacefaceLampChannel: channelId };
  material.needsUpdate = true;
  return true;
}
