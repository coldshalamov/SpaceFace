// VFX system (ARCHITECTURE §2.4, §4.4; design/specs/10). A purely-cosmetic presentation layer.
// It owns a pooled GPU particle cloud, three instanced additive sprite buckets, and one sorted
// normal-blended smoke bucket, and is
// driven entirely by event-bus events — it NEVER writes sim state. update(frameDt) is called every
// animation frame inside renderFrame (after render.draw), so it integrates/ages pools and the new
// state is drawn on the following frame. Determinism is irrelevant here: VFX may use Math.random()
// (cosmetic, never serialized).
//
// ── NAVIGATION INDEX (2,765 lines) — grep destinations for common queries ──
//   Public surface:  EVENT_LIGHT_POOL_SIZE (L15), eventLightPoolSizeFor (L16), vfx{} (L85), createVfxPrecompileSalvo (L2510)
//   Lifecycle:       init (L88) · inspect/diagnostics (L126) · _initPools (L147) · _subscribe (L256) · update (L1928)
//   Spawn helpers:   _spawnParticle (L318) · _spawnSprite (L337) · _activate/_retireParticle (L371/377) · _activate/_retireSprite (L394/399)
//   Combat effects:  _onFire/muzzle flash (L590) · _onProjectileHit (L635) · _onDamage/shield ripple (L676) · _impactSparks (L746)
//   Explosions:      _onKilled · _onDestroyed · _queueExplosion · _emitExplosionPhase
//   Mining:          _initMiningBeam (L1072) · _onMiningStart/Stop (L1112/1128) · _updateMiningBeam (L1136) · _onMiningTick (L1607) · _onMiningYield (L1649) · _initSeamMarkers (L1397)
//   Tether:          _initTetherCable (L1202) · _updateTetherCable (L1278) · _onTetherSnap (L1461) · _onTetherLatch (L1483) · _initArcPreview/_updateArcPreview (rung 12, after _updateTetherCable)
//   Cruise/jump:     _onCruiseCharging/Engaged/Dropped · _onDirectTravelPresentationCue · _spawnTravelVectorWake
//   Engine trails:   _onThrust (L1670) · _emitEngineTrail (L1849) · _emitReverseNozzleTrail (L1691) · _onBoost (L1729) · _onDash (L1761)
//   AI cues:         _onAiTelegraph (doctrine FLYBY/TETHER/CHARGE) · _updateDoctrineTells · _onAiFlee · _onAiFormationBroken
//   Presentation:    _onPresentationCue (L772) · _presentationStyle (L863) · _spawnPresentationSprite (L828)
//   Trails/sockets:  _refreshTrailCandidates (L463) · _trailSocketObjects (L560) · _writeTrailSocketPose (L496)
//   Energy volumes:  _initEnergy (L1971) · _updateEnergy (L1961)  [createEnergyVolume imported from ./energy/]
//   Pickup/loot:     _onPickup (L1828) · _onChargeDetonated (L1553)
//   Event→handler wiring: see _subscribe (L256). Full event routing map: docs/EVENT_ROUTING.md
// ── end index ──
import * as THREE from 'three';
import { createEnergyVolume, createMasslineRibbonMaterial, createPlumeMaterial, createPlumeVolume, updateEnergyMaterial } from './energy/energyMaterials.js';
import {
  buildParticleTrailMaterial,
  commitTrailStreakInstances,
  createPrecompileTrailSurfaces,
  createRibbonTrail,
  initTrailStreakPool,
  updateTrailStreakInstance,
} from './engineTrailSurfaces.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import {
  partIdFromSlotUrls,
  resolveEngineProfile,
  resolveEngineProfileId,
  getEngineProfileBase,
  resolveMuzzleProfile,
  resolveProjectileTrailProfile,
  resolveImpactPresentationProfile,
  buildProjectileTrailSpawnPlan,
  createProjectileTrailSpawnPlanScratch,
  assertProjectileTrailProfileContracts,
} from './vfxProfiles.js';
import { createRenderFrameMembrane } from './frameCoordinates.js';
import { fieldFalloff } from '../core/fields/fieldKernel.js'; // PQ-012: VFX density mirrors the kernel falloff (gauges must not lie)
import { applyFlashAccessibility, resolveVfxAccessibilityProfile } from './vfxAccessibility.js';
import {
  createStationSideEventVfxFrameScratch,
  resolveStationSideEventVfxProfile,
  STATION_SIDE_EVENT_VFX_CAPACITY,
  writeStationSideEventVfxFrame,
} from './stationSideEventVfx.js';
import {
  createNpcJobSignatureFrameScratch,
  resolveNpcJobSignature,
  writeNpcJobSignatureFrame,
  NPC_JOB_SIGNATURE_CAPACITY,
  NPC_JOB_SIGNATURE_DRAW_RANGE,
  deployFraction,
  resolveNpcJobReaction,
  NPC_JOB_REACTION,
} from './npcJobSignatureVfx.js';
import { ContinuousPlumeSystem } from './thruster/systems/continuousPlume.js';
import { RcsImpulseSystem } from './thruster/systems/rcsImpulse.js';
import {
  FamilyProductionFleet,
  FLEET_MAX_SHIPS,
  FLEET_SOCKETS_PER_SHIP,
} from './thruster/systems/familyFleet.js';
import {
  KESTREL_MAIN_PLUME_RECIPE,
  KESTREL_RCS_RECIPE,
} from './thruster/recipes/kestrelRecipes.js';
import {
  resolveThrusterRecipes,
  collectThrusterTextureIds,
  listThrusterRecipePacks,
} from './thruster/recipes/registry.js';
import { PersistentCombatBeamPool } from './combat/persistentBeams.js';
import {
  explosionPattern01,
  explosionPatternSigned,
  PhasedExplosionLifecycle,
} from './combat/phasedExplosions.js';
import {
  commitInstancedSpriteBuckets,
  createInstancedSpriteBuckets,
  resetInstancedSpriteBuckets,
  writeInstancedSprite,
  writeInstancedSpriteFields,
} from './combat/instancedSpritePool.js';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  replaceDynamicBufferAttribute,
} from './dynamicBufferRanges.js';
import { resolveRcsFirings, resolveActuatorScale, mainDriveDemand } from './rcsJets.js';
import { PROPULSION_PROFILES } from '../core/flight/propulsionCatalog.js';
import { resolveForceNeonScale, resolveTumbleContinuousVfxPlan } from './masslinePresentation.js';
import { shipPitchCandidates } from './shipPitchPresentation.js';
import {
  DEFAULT_VFX_ADMISSION_PRIORITY,
  deriveVfxAdmissionMetadata,
  normalizeVfxAdmissionPriority,
} from '../presentation/vfxAdmissionPriority.js';

const EMPTY_TRAIL_SOCKETS = Object.freeze([]);
const EMPTY_PROJECTILE_DATA = Object.freeze({});
const PROJECTILE_TRAIL_DIAG_CLASSES = Object.freeze([
  'kinetic', 'rail', 'missile', 'plasma', 'pulse', 'emp', 'other',
]);

// ── RCS truth (ledger RC-3) ──────────────────────────────────────────────────────────────────
// Signed actuator demand selects the correct nozzles. The pooled production recipe owns their
// directional shape, reduced-motion behavior, and lifecycle; no second particle-puff owner exists.
// The event-light pool size is part of the shader-program cache key (three bakes visible light
// count into every program). Keep the visible-light count invariant across live settings changes;
// accessibility scales intensity at the event choke point instead of adding/removing lights and
// forcing a whole-scene shader recompile.
export const EVENT_LIGHT_POOL_SIZE = 6;
export function eventLightPoolSizeFor(_video) {
  return EVENT_LIGHT_POOL_SIZE;
}

export function richEngineTrailsEnabled(video) {
  if (!video || video.engineTrails === false) return false;
  if (video.particleQuality === 'low' || video.motionReduce) return false;
  return true;
}

// Duplicate lightweight external texture loader (same as visualFactory) so VFX can use our generated fx_* and ore assets without extra modules.
// Falls back silently.
const _extTexVfx = new Map();
function getExternalTexture(path) {
  if (_extTexVfx.has(path)) return _extTexVfx.get(path);
  const tex = new THREE.TextureLoader().load(
    path,
    () => { tex.needsUpdate = true; },
    undefined,
    () => { /* silent fallback to procedural */ }
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _extTexVfx.set(path, tex);
  return tex;
}

// Thruster masks are authored as linear flow/envelope data, not display color. Keeping them in a
// separate cache avoids the old external-texture helper's sRGB transform and gives the shader the
// exact deterministic bytes generated by scripts/generate-thruster-textures.mjs.
const _thrusterTexVfx = new Map();
function getThrusterTexture(id) {
  if (_thrusterTexVfx.has(id)) return _thrusterTexVfx.get(id);
  if (typeof document === 'undefined' && typeof Image === 'undefined') {
    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    tex.name = `sf-thruster-test:${id}`;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    tex.userData.spacefaceThrusterTexture = true;
    tex.userData.headlessPlaceholder = true;
    _thrusterTexVfx.set(id, tex);
    return tex;
  }
  const tex = new THREE.TextureLoader().load(
    `assets/fx/thruster/${id}.png`,
    () => { tex.needsUpdate = true; },
    undefined,
    () => { tex.userData.spacefaceLoadFailed = true; },
  );
  tex.name = `sf-thruster:${id}`;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.userData.spacefaceThrusterTexture = true;
  _thrusterTexVfx.set(id, tex);
  return tex;
}

function loadKestrelThrusterTextures() {
  // Loads the full live propulsion-family texture set (shared deterministic pack).
  // Name retained for existing thruster-pack checks that grep this symbol.
  const textures = Object.create(null);
  const ids = collectThrusterTextureIds();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!textures[id]) textures[id] = getThrusterTexture(id);
  }
  // Ensure accepted Kestrel substrate textures remain present even if registry drifts.
  for (const recipe of [KESTREL_MAIN_PLUME_RECIPE, KESTREL_RCS_RECIPE]) {
    for (const layer of recipe.layers) {
      const id = layer.texture && layer.texture.id;
      if (id && !textures[id]) textures[id] = getThrusterTexture(id);
    }
  }
  return textures;
}

// ---- pool caps by particle-quality setting (spec: low/med/high -> 1500/3000/4000) ----
const PARTICLE_CAP = { low: 1500, med: 3000, medium: 3000, high: 4000 };
const PARTICLE_POSITION = 0;
const PARTICLE_COLOR = 1;
const PARTICLE_SIZE = 2;
const PARTICLE_ALPHA = 3;
const PARTICLE_TRAIL_AXIS = 4;
const PARTICLE_TRAIL_STRETCH = 5;
const INSTANCED_MATRIX_BUFFER = 0;
const INSTANCED_COLOR_BUFFER = 1;
const PARTICLE_BUFFER_BINDINGS = Object.freeze([
  Object.freeze({ name: 'position', key: 'position' }),
  Object.freeze({ name: 'color', key: 'aColor' }),
  Object.freeze({ name: 'size', key: 'aSize' }),
  Object.freeze({ name: 'alpha', key: 'aAlpha' }),
  Object.freeze({ name: 'trail-axis', key: 'aTrailAxis' }),
  Object.freeze({ name: 'trail-stretch', key: 'aTrailStretch' }),
]);
const SPRITE_CAP = 256;
// Dedicated procedural streak-mesh pool (ShaderMaterial planes) — not the additive sprite pool.
const TRAIL_STREAK_CAP = 96;
const CONTACT_SPARK_COOLDOWN_TICKS = 6;
const COLLISION_PRESENTATION_CACHE_CAP = 128;

// Sprite "kinds" — drive how a pooled sprite ages (scale/opacity curve).
const SPR_FLASH = 0;   // punch-out flash (muzzle, impact, explosion core): scale grows, opacity fades
const SPR_RING = 1;    // expanding shockwave / shield ripple ring: radius eases out, opacity fades
const SPR_PUFF = 2;    // soft drifting puff (dust, smoke): gentle grow + drift, opacity fades
const SPR_FRESNEL = 3; // shield-hit fresnel ripple: bright rim ring that snaps to size then fades
const SPR_COMBUSTION = 4; // asymmetric flame body: irregular edge, directional aspect, fast core-to-sheath fade

// Per-quality spawn multiplier so "punchier" effects scale with the particle budget instead of
// blindly multiplying spawns against a 1500-particle low cap (where recycle is O(cap) per spawn).
const QUALITY_BURST = { low: 0.55, med: 0.8, medium: 0.8, high: 1.0 };
const BOOST_BURST_NOZZLE_CLEARANCE = 0.9;
const TRAIL_NOZZLE_CLEARANCE = 0.35;
const ENERGY_PLUME_NOZZLE_CLEARANCE = 1.15;
const ENERGY_PLUME_WIDTH_CLEARANCE = 1.05;
const TETHER_MARKER_SURFACE_EPS = 0.12;

// ---- HDR energy radiance vs. the bloom setting (see _bloomRadianceScale) ----
// Bloom is a SPILL control, not an on/off switch for the energy layer. These four constants define
// how far a bloom setting moves emitted radiance:
//   OFF     — bloom disabled: energy volumes still radiate, they just stop bleeding into neighbours.
//   FLOOR   — the value at bloomStrength 0 with bloom enabled.
//   SPAN    — how much radiance one full reference-strength step buys.
//   CEILING — the top of the ramp, so a maxed slider is loud but still bounded.
const BLOOM_REFERENCE_STRENGTH = 0.35;  // bloom.js DEFAULT_BLOOM_STRENGTH
const BLOOM_OFF_RADIANCE = 0.9;
const BLOOM_RADIANCE_FLOOR = 0.62;
const BLOOM_RADIANCE_SPAN = 0.78;
const BLOOM_RADIANCE_CEILING = 2.4;

// ---- Massline presentation (grammar §9.2 / §9.2.1) ----
// The rope is the signature verb and is meant to be the brightest object on screen.
// NOTE ON THE COLOUR RAMP: the red end is RARE BY DESIGN. The line is deliberately near-unbreakable
// (combatDefs tether_standard.breakTension, automaticBreakPolicy 'extreme_load_only') and a break is
// an ENGINEERED event, not an ambient one. These constants read strain/load telemetry; none of them
// touches a break threshold, and nothing here is tuned to make the red end easier to reach.
const TETHER_RELEASE_FADE_RATE = 3.5;   // /s — clean release fades out quickly
const TETHER_SNAP_FADE_RATE = 2.6;      // /s — a break holds long enough to show its recoil
const TETHER_SNAP_WHIP_S = 0.30;        // seconds of violent recoil after a break
const TETHER_LOAD_SHIVER_WU = 0.52;     // peak lateral shiver at full presentation load (~10 px)
// Where the load ramp switches from "working" to "fighting". tether.load is a phase-floored
// presentation signal (tetherGameplay LOAD_BASE_BY_PHASE): slack 0 / capture 0.35 / loaded 0.55 /
// overload 0.9. Measured with scripts/probe-tether-visual-drive.mjs (640-mass rock, full main
// thrust opposing the line, 240 ticks): load peaks at 0.55 and phase never leaves loaded. So a gate
// at 0.5 engages on a real hard pull, and everything above 0.72 stays out of ordinary play — which
// is the point. See the note at the strain read in _updateTetherCable.
const TETHER_TAUT_LOAD = 0.5;
const TETHER_OVERLOAD_LOAD = 0.88;
const TETHER_SPARK_LOAD = 0.72;
// The capture floor. Load below this is "the line just caught"; the visible-strain reads measure
// how far PAST it the line is, so a merely-captured line is quiet and a worked one is not.
const TETHER_CAPTURE_FLOOR = 0.35;

// Engine-trail relevance gating (quality-preserving: far/offscreen NPCs emit less; player/target stay full).
const TRAIL_TIER = Object.freeze({ FULL: 'full', NORMAL: 'normal', REDUCED: 'reduced', SKIP: 'skip' });
const TRAIL_NORMAL_PLAYER_DIST = 2200;
const TRAIL_CAMERA_NORMAL_DIST = 1300;
const TRAIL_SKIP_PLAYER_DIST = 3600;
const TRAIL_CAMERA_SKIP_DIST = 2800;
const TRAIL_SCREEN_CHECK_MAX = 8;
const TRAIL_REDUCED_CADENCE = 3;
const TRAIL_REDUCED_EMIT_CAP = 18;

// M1 doctrine telegraphs (ai:telegraph). Sim already holds fire ≥30 ticks; VFX sustains a
// doctrine-specific world cue for that window, linked to the live enemy or a truthful offscreen
// directional marker. Fixed pool — no per-event allocation in the update loop.
// Lifetime ownership: state.tick / startTick / deadlineTick (pause/tab render dt must not
// consume the pre-consequence window). Frame-dt age is only a headless fallback when tick is absent.
const DOCTRINE_TELL_POOL = 4;
const DOCTRINE_TELL_KIND = Object.freeze({
  FLYBY: 'flyby',
  TETHER: 'tether',
  CHARGE: 'charge',
  GENERIC: 'generic',
});
// 30 ticks @ 60 Hz = 0.5s; floor keeps a readable window even if payload omits durationTicks.
const DOCTRINE_TELL_MIN_LIFE = 0.5;
const DOCTRINE_TELL_PULSE = 0.11;
const DOCTRINE_TELL_OFFSCREEN_R = 58;

// Optional subsystem cadence (Hz) — runs at the stated Hz when active, slept when inactive.
// The player Hitch continuous plume is intentionally NOT cadence-gated: it is ship-attached
// nozzle geometry, and lagging pose updates at high speed creates a ghosted double thruster.
const VFX_SEAM_MARKERS_HZ = 20;
// Loot magnet comet trails. The magnet itself is real physics (src/systems/mining.js: range 420,
// accel 900 wu/s², velocity-inheriting homing) and it already works — but a drop flying home looked
// like a small drifting rock, so the single most repeated reward in the game read as nothing. This
// draws it as light. Cadence-gated and fully asleep when nothing is homing.
const VFX_LOOT_MAGNET_HZ = 24;
const LOOT_MAGNET_DRAW_RANGE = 460;      // wu; slightly beyond MAGNET_RANGE so entry is not a pop
const LOOT_MAGNET_MIN_SPEED = 26;        // wu/s; below this a drop is drifting, not being pulled
const LOOT_MAGNET_MAX_TRAILED = 24;      // hard cap on simultaneously trailed drops
const VFX_RIBBON_TRAILS_HZ = 30;
const VFX_PROJECTILE_TRAILS_HZ = 45;
const VFX_SEAM_DRAW_RANGE = 640;
// Ambient station movers are event-driven, pooled VFX. Twelve pose writes per second is enough for
// their slow docking/orbit paths and leaves the ordinary frame asleep when no side-event is active.
const VFX_STATION_SIDE_EVENTS_HZ = 12;
const VFX_STATION_SIDE_EVENT_DRAW_RANGE = 1500;
// NPC work signatures ("The Working Light"). Same 12 Hz as the station movers: the underlying job
// phases change on the order of seconds, so a faster pose write would buy nothing, and the shared
// cadence keeps the two ambient layers from beating against each other. Slept entirely when no live
// job is in range — an empty sector costs one integer compare per frame.
const VFX_NPC_JOB_SIGNATURE_HZ = 12;
// The cut beam's fallback length when the worked rock cannot be resolved, in world units. Long
// enough to read as contact with something out of frame, short enough not to cross a lane.
const NPC_JOB_CUT_BEAM_FALLBACK = 26;
// Furthest a barge may claim to be cutting. Beyond this the geometry says it is pointing at a rock,
// not touching one, so the beam reverts to the short local one. Sized against the camera's ~45-50
// unit visible ground-plane depth (design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md): a real cut
// crosses at most a couple of frames' worth of space, never hundreds of units.
const NPC_JOB_CUT_BEAM_MAX_REACH = 110;
// PQ-012 continuous field flow (design/vfx/FIELD_TOOL_READABILITY_BIBLE.md §4/§10). Advected pooled
// particles at 30 Hz; slept when no field is deployed. Pool share is a small slice of PARTICLE_CAP
// (≤ ~10 per field per emission, ≤ FIELD_FLOW_MAX_FIELDS fields).
const VFX_FIELD_FLOW_HZ = 30;
const FIELD_FLOW_GOLDEN = 2.399963229728653; // golden angle — even, deterministic spawn distribution
const FIELD_FLOW_MAX_FIELDS = 6;

function emptyTrailBudgetDiag() {
  return {
    trailCandidates: 0,
    trailEmittersFull: 0,
    trailEmittersNormal: 0,
    trailEmittersReduced: 0,
    trailEmittersSkipped: 0,
    trailParticlesSpawned: 0,
    trailStreaksSpawned: 0,
    trailSpritesSpawned: 0, // legacy alias mirrored from trailStreaksSpawned for perfRuntime
  };
}

function resetTrailBudgetDiag(diag) {
  diag.trailCandidates = 0;
  diag.trailEmittersFull = 0;
  diag.trailEmittersNormal = 0;
  diag.trailEmittersReduced = 0;
  diag.trailEmittersSkipped = 0;
  diag.trailParticlesSpawned = 0;
  diag.trailStreaksSpawned = 0;
  diag.trailSpritesSpawned = 0;
  return diag;
}

function emptyProjectileTrailDiag() {
  const diag = {
    candidates: 0,
    particlesSpawned: 0,
    streaksSpawned: 0,
    spritesSpawned: 0,
    byClass: {},
  };
  for (let i = 0; i < PROJECTILE_TRAIL_DIAG_CLASSES.length; i++) {
    diag.byClass[PROJECTILE_TRAIL_DIAG_CLASSES[i]] = { particles: 0, streaks: 0, sprites: 0 };
  }
  return diag;
}

function resetProjectileTrailDiag(diag) {
  diag.candidates = 0;
  diag.particlesSpawned = 0;
  diag.streaksSpawned = 0;
  diag.spritesSpawned = 0;
  for (let i = 0; i < PROJECTILE_TRAIL_DIAG_CLASSES.length; i++) {
    const totals = diag.byClass[PROJECTILE_TRAIL_DIAG_CLASSES[i]];
    totals.particles = 0;
    totals.streaks = 0;
    totals.sprites = 0;
  }
  return diag;
}

function fieldFrac(x) { return x - Math.floor(x); } // PQ-012 low-discrepancy spawn distribution (no RNG)

/** Hex nibble from charCode (0-9/A-F/a-f). -1 if invalid. Module-scoped — no per-call alloc. */
function hexNibbleFromCharCode(c) {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}

function createCurvedVaneGeometry() {
  const geom = new THREE.BufferGeometry();
  const segments = 3;
  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const r = 0.18 + t * 0.82;
    const angle = t * 0.65;
    const cx = r * Math.cos(angle);
    const cz = r * Math.sin(angle);

    const nx = Math.cos(angle + Math.PI / 2);
    const nz = Math.sin(angle + Math.PI / 2);

    const w = 0.20 * (1.0 - 0.55 * t);
    const h = 0.08 * (1.0 - 0.70 * t);

    positions.push(cx - nx * w,  h, cz - nz * w);
    positions.push(cx + nx * w,  h, cz + nz * w);
    positions.push(cx + nx * w, -h, cz + nz * w);
    positions.push(cx - nx * w, -h, cz - nz * w);

    normals.push(-nx, 0.7, -nz,  nx, 0.7, nz,  nx, -0.7, nz,  -nx, -0.7, -nz);
  }

  for (let i = 0; i < segments; i++) {
    const b = i * 4;
    indices.push(b, b + 1, b + 5);
    indices.push(b, b + 5, b + 4);
    indices.push(b + 3, b + 7, b + 6);
    indices.push(b + 3, b + 6, b + 2);
    indices.push(b + 1, b + 2, b + 6);
    indices.push(b + 1, b + 6, b + 5);
    indices.push(b, b + 4, b + 7);
    indices.push(b, b + 7, b + 3);
  }
  indices.push(0, 3, 2); indices.push(0, 2, 1);
  const last = segments * 4;
  indices.push(last, last + 1, last + 2); indices.push(last, last + 2, last + 3);

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setIndex(indices);
  return geom;
}

function emptyVfxSubsystemDiag() {
  return {
    trails: 0,
    ribbons: 0,
    projectileTrails: 0,
    miningBeam: 0,
    tetherCable: 0,
    seamMarkers: 0,
    combatBeams: 0,
    explosions: 0,
    energy: 0,
    particles: 0,
    sprites: 0,
    eventLights: 0,
    fieldFlow: 0,       // PQ-012 continuous field flow particles emitted this frame (pool share)
    lootMagnet: 0,      // magnet-pulled drops drawn as incoming light this frame
    stationSideEvents: 0, // seeded station operations drawn on pooled sprite/trail substrates
    npcJobSignatures: 0,  // "The Working Light" — live NPC jobs showing their working state
  };
}

export const vfx = {
  name: 'vfx',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._t = 0;
    this._scene = null;
    this._subs = [];
    this._trailCandidates = [];
    this._ribbonCandidates = [];
    this._trailCacheDirty = true;
    this._trailListRef = null;
    this._trailListLength = -1;
    this._socketScratch = { x: 0, y: 0, z: 0, forwardX: -1, forwardY: 0, forwardZ: 0, angle: Math.PI, rotationY: 0 };
    this._socketWorldPos = new THREE.Vector3();
    this._socketWorldQuat = new THREE.Quaternion();
    this._socketWorldScale = new THREE.Vector3();
    this._socketForward = new THREE.Vector3();
    this._socketLocalForward = new THREE.Vector3();
    this._socketForwardQuat = new THREE.Quaternion();
    this._socketReferenceForward = new THREE.Vector3(-1, 0, 0);
    this._driveScratch = {
      drive: 0, throttle: 0, speed: 0, speedDrive: 0, boost: 0,
      cruise: 0, reverse: 0, retroOnly: false, brake: 0,
    };
    this._mainDriveDemandScratch = { main: 0, reverse: 0, retroOnly: false };
    this._productionDriveSignals = {
      cruise: 0, reverse: 0, retroOnly: false, brake: 0, speedDrive: 0,
    };
    this._productionEngineProfileId = null;
    // Sized to the fleet's sanity ceiling, not its initial allocation — the fleet ship
    // table grows on demand, and this scratch must be able to name every owned ship.
    this._productionOwnedIds = new Array(FLEET_MAX_SHIPS);
    this._productionOwnedCount = 0;
    // Eager trail culling scratch — first live frame must not allocate these.
    this._trailContextScratch = {
      playerId: null,
      playerX: 0,
      playerZ: 0,
      playerTeam: null,
      targetId: null,
      radarRange: 4000,
      cameraX: 0,
      cameraZ: 0,
      camera: null,
      state: null,
    };
    this._trailScreenCheckScratch = { remaining: TRAIL_SCREEN_CHECK_MAX };
    this._cFaction = new THREE.Color('#88aaff');
    // Scratch for parsing faction thruster hex → RGB without per-frame Color alloc on set.
    this._factionRgbScratch = { r: 0.533, g: 0.667, b: 1.0 };
    this._rcsPoseScratch = { x: 0, z: 0, rot: 0, radius: 6 };
    this._rcsDefaultScale = resolveActuatorScale(null);
    this._rcsScaleCache = new Map();
    for (const driveId of Object.keys(PROPULSION_PROFILES)) {
      this._rcsScaleCache.set(driveId, resolveActuatorScale(PROPULSION_PROFILES[driveId]));
    }
    this._productionPlumeSockets = [
      { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
      { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
      { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
      { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
    ];
    this._productionPlumeSocketView = this._productionPlumeSockets.slice(0, 1);
    this._productionThrusterA11y = {
      reducedMotion: false,
      reducedFlash: false,
      lowQuality: false,
      qualityTier: 'high',
    };
    this._productionThrusterOpts = {
      boost: 0,
      a11y: this._productionThrusterA11y,
      cruise: 0,
      reverse: 0,
      retroOnly: false,
      brake: 0,
      speedDrive: 0,
    };
    this._rcsOrigins = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this._rcsAxes = [[1, 0, 0], [-1, 0, 0], [1, 0, 0], [-1, 0, 0]];
    this._productionRcsFirings = [];
    Object.defineProperty(this._productionRcsFirings, '__rcsRecords', {
      value: [{}, {}, {}, {}],
      configurable: true,
    });
    this._zeroPos = { x: 0, z: 0 };
    // M2: VFX particle/sprite/trail XZ is frame-local; spawn inputs stay galactic-global.
    this._frameMembrane = createRenderFrameMembrane().reset(ctx.state);
    this._spawnLocalXZ = { x: 0, z: 0 };
    this._combatBeamLocalizer = (x, z, out) => this._toLocalXZ(x, z, out);
    this._beamDamageCueNext = new Map();
    this._explosions = new PhasedExplosionLifecycle({ capacity: 24 });
    this._collisionContactTicks = new Map();
    this._collisionMediumTicks = new Map();
    this._spawnAdmissionPriority = DEFAULT_VFX_ADMISSION_PRIORITY;
    this._admissionSerial = 0;
    this._explosionEmitter = (phase, entry) => {
      const previousPriority = this._spawnAdmissionPriority;
      this._spawnAdmissionPriority = normalizeVfxAdmissionPriority(entry && entry.priority);
      try {
        return this._emitExplosionPhase(phase, entry);
      } finally {
        this._spawnAdmissionPriority = previousPriority;
      }
    };
    this._flashAccessibilityScratch = { life: 0, size0: 0, size1: 0, opacity0: 0, opacity1: 0 };
    this._entityLocalXZ = { x: 0, z: 0 };
    // Renderer prepareFrame calls this on frameOriginSeq change (no effect erasure).
    if (ctx.state && ctx.state.render) {
      ctx.state.render.vfxReprojectFrame = (dx, dz) => this.reprojectFrame(dx, dz);
    }
    this._liveSpriteCount = 0;
    this._activeLightCount = 0;
    this._presentationCueCount = 0;
    this._presentationParticleCount = 0;
    this._presentationLightCount = 0;
    this._lastPresentationCue = null;
    this._trailFrameIndex = 0;
    this._trailBudgetDiag = emptyTrailBudgetDiag();
    this._trailSpawnScratch = { particles: 0, streaks: 0 };
    this._vfxSubsystemLast = emptyVfxSubsystemDiag();
    // Tier-1 causal counter sink, refreshed per update frame. Null while counters are disabled, so
    // the spawn hot paths pay one null check and nothing else (perfCounters zero-cost contract).
    this._tier1Spawn = null;
    this._cadenceSeam = 0;
    this._cadenceRibbon = 0;
    this._cadenceProjectileTrail = 0;
    this._cadenceLootMagnet = 0;
    this._cadenceStationSideEvent = 0;
    this._lootMagnetLive = 0;
    this._stationSideEventSlots = [];
    for (let i = 0; i < STATION_SIDE_EVENT_VFX_CAPACITY; i++) {
      this._stationSideEventSlots.push({
        alive: false,
        age: 0,
        duration: 0,
        eventId: null,
        stationId: null,
        entityId: null,
        kind: null,
        profile: null,
        bearing: 0,
        fromX: 0,
        fromZ: 0,
        toX: 0,
        toZ: 0,
        centerX: 0,
        centerZ: 0,
        lastEmitStep: -1,
        frame: createStationSideEventVfxFrameScratch(),
      });
    }
    this._stationSideEventCursor = 0;
    this._stationSideEventActive = 0;
    this._stationSideEventStarts = 0;
    this._lastStationSideEventKind = null;
    // NPC work signatures. Unlike the station movers above these are NOT event-installed: the
    // renderer PULLS the live job bag each cadence tick (see _updateNpcJobSignatures). A slot is
    // therefore a pure per-job scratch cache keyed by jobId, not a lifecycle record — a job that
    // disappears simply stops matching and its slot is reused, so there is no retire path to leak.
    this._cadenceNpcJobSignature = 0;
    this._npcJobSignatureSlots = [];
    for (let i = 0; i < NPC_JOB_SIGNATURE_CAPACITY; i++) {
      this._npcJobSignatureSlots.push({
        jobId: null,
        profileId: null,
        elapsed: 0,
        lastEmitStep: -1,
        seed: 0,
        gen: -1, // declared here so the slot's hidden class never changes on first claim
        deploy: 0,        // 0 stowed .. 1 gear fully out
        reaction: 'none', // what this hull is doing about the player
        reactionT: 0,     // 0 .. 1 as the player closes
        frame: createNpcJobSignatureFrameScratch(),
      });
    }
    this._npcJobSignatureActive = 0;
    this._npcJobSignatureDrawn = 0;
    this._lastNpcJobSignatureId = null;
    this._projectileCandidates = [];
    this._projectileCacheDirty = true;
    this._projectileListRef = null;
    this._projectileListLength = -1;
    this._projectileTrailDiag = emptyProjectileTrailDiag();
    this._projectileTrailPlanScratch = createProjectileTrailSpawnPlanScratch();
    this._projectileTrailsWereRelevant = false;
    this._seamMarkersWereRelevant = false;
    this._energyPlumeWasRelevant = false;
    this._doctrineTells = [];
    for (let i = 0; i < DOCTRINE_TELL_POOL; i++) {
      this._doctrineTells.push({
        alive: false, age: 0, life: 0, pulse: 0, entityId: null, targetId: null,
        kind: DOCTRINE_TELL_KIND.GENERIC, doctrineId: null, telegraphKind: null,
        durationTicks: 30, startTick: null, deadlineTick: null,
        offscreen: false, reduced: false,
      });
    }
    this._doctrineTellActive = 0;
    this._doctrineTellStarts = 0;
    this._lastDoctrineTell = null;
    this._doctrineTellScreenScratch = new THREE.Vector3();

    // colour scratch objects (reused; no per-event allocation)
    this._c0 = new THREE.Color();
    this._c1 = new THREE.Color();
    this._ctmp = new THREE.Color();
    this._cFaction = new THREE.Color('#88aaff');

    this._initPools();
    // The renderer's loading-stage residency pass runs after every system has initialized. Publish
    // the exact live VFX roots so their already-created textures are uploaded under the loading
    // shell instead of on the first ambient impact during exposed flight. The getter stays live
    // because particle-quality changes can replace the point-cloud geometry without changing the
    // renderer/VFX ownership boundary.
    if (ctx.state && ctx.state.render) {
      ctx.state.render.collectVfxGpuResidencyRoots = () => this._vfxOwnerRoots();
    }
    // Measurement-only VFX owner seam. It snapshots only roots this system owns;
    // event lights remain visible/intensity-driven to avoid shader recompiles.
    this._perfVfxIsolationRestore = null;
    if (ctx.state && ctx.state.render) {
      ctx.state.render.perfVfxIsolation = {
        hideAll: () => this._hidePerfVfxRoots(),
        restore: () => this._restorePerfVfxRoots(),
        reassert: () => this._reassertPerfVfxRoots(),
        inspect: () => ({
          active: !!this._perfVfxIsolationRestore,
          hidden: this._perfVfxIsolationRestore ? this._perfVfxIsolationRestore.length : 0,
          scope: this._perfVfxIsolationRestore ? 'vfx_owner_roots' : null,
        }),
      };
    }
    this._subscribe();
  },

  _vfxOwnerRoots() {
    const roots = [];
    const seen = new Set();
    const add = (object) => {
      if (!object || object.isObject3D !== true || seen.has(object)) return;
      seen.add(object);
      roots.push(object);
    };
    add(this._points);
    add(this._trailStreakPool && this._trailStreakPool.mesh);
    add(this._spriteBatches && this._spriteBatches.glow.mesh);
    add(this._spriteBatches && this._spriteBatches.ring.mesh);
    add(this._spriteBatches && this._spriteBatches.smoke.mesh);
    add(this._spriteBatches && this._spriteBatches.combustion.mesh);
    if (this._miningBeam) { add(this._miningBeam.mesh); add(this._miningBeam.glow); }
    if (this._tetherCable) {
      for (const key of ['mesh', 'glow', 'band', 'anchor', 'anchorCore', 'targetHalo']) add(this._tetherCable[key]);
    }
    add(this._arcPreview && this._arcPreview.mesh);
    add(this._seamMarkers && this._seamMarkers.mesh);
    add(this._combatBeams && this._combatBeams.group);
    if (this._energy) {
      add(this._energy.ribbon);
      add(this._energy.plumeSystem && this._energy.plumeSystem.group);
      add(this._energy.rcsSystem && this._energy.rcsSystem.group);
    }
    for (const trail of this._ribbonTrails?.values?.() || []) add(trail.getMesh?.());
    return roots;
  },

  _perfVfxRoots() {
    return this._vfxOwnerRoots();
  },

  _hidePerfVfxRoots() {
    if (this._perfVfxIsolationRestore) throw new Error('VFX isolation already active');
    const restore = this._perfVfxRoots().map((object) => [object, object.visible]);
    this._perfVfxIsolationRestore = restore;
    this._reassertPerfVfxRoots();
    return { active: true, hidden: restore.length, scope: 'vfx_owner_roots' };
  },

  _reassertPerfVfxRoots() {
    if (!this._perfVfxIsolationRestore) return { active: false, hidden: 0 };
    const captured = new Set(this._perfVfxIsolationRestore.map(([object]) => object));
    for (const object of this._perfVfxRoots()) {
      if (captured.has(object)) continue;
      this._perfVfxIsolationRestore.push([object, object.visible]);
      captured.add(object);
    }
    for (const [object] of this._perfVfxIsolationRestore) if (object) object.visible = false;
    return { active: true, hidden: this._perfVfxIsolationRestore.length };
  },

  _restorePerfVfxRoots() {
    const restore = this._perfVfxIsolationRestore;
    if (!restore) return { restored: true, active: false, restoredCount: 0 };
    for (const [object, wasVisible] of restore) if (object) object.visible = wasVisible;
    this._perfVfxIsolationRestore = null;
    return { restored: true, active: false, restoredCount: restore.length, scope: 'vfx_owner_roots' };
  },

  inspect() {
    const last = this._lastPresentationCue ? { ...this._lastPresentationCue } : null;
    const lastTell = this._lastDoctrineTell ? { ...this._lastDoctrineTell } : null;
    return {
      schema: 'spaceface.vfxInspect.v1',
      sceneAttached: !!this._scene,
      particleCap: this._cap || 0,
      particleBurst: this._burst || 0,
      liveParticles: this._liveCount || 0,
      liveSprites: this._liveSpriteCount || 0,
      activeLights: this._activeLightCount || 0,
      presentation: {
        applied: this._presentationCueCount || 0,
        particlesSpawned: this._presentationParticleCount || 0,
        lightsActivated: this._presentationLightCount || 0,
        last,
      },
      doctrineTells: {
        starts: this._doctrineTellStarts || 0,
        active: this._doctrineTellActive || 0,
        last: lastTell,
      },
      trails: this._trailBudgetDiag ? { ...this._trailBudgetDiag } : emptyTrailBudgetDiag(),
      projectileTrails: this._projectileTrailDiag ? { ...this._projectileTrailDiag } : emptyProjectileTrailDiag(),
      subsystems: {
        lastFrame: this._vfxSubsystemLast ? { ...this._vfxSubsystemLast } : emptyVfxSubsystemDiag(),
      },
      // Declared share, per PERF_BUDGET doctrine: how many drops the magnet presentation is
      // currently trailing, against its own cap.
      lootMagnet: {
        trailed: this._lootMagnetLive || 0,
        cap: LOOT_MAGNET_MAX_TRAILED,
      },
      stationSideEvents: {
        active: this._stationSideEventActive || 0,
        starts: this._stationSideEventStarts || 0,
        lastKind: this._lastStationSideEventKind || null,
        capacity: STATION_SIDE_EVENT_VFX_CAPACITY,
      },
      // `active` counts live jobs in the bag; `drawn` counts those that survived virtualization and
      // range culling to actually paint. The gap between them IS the cull, so a regression that
      // silently stops drawing is visible here rather than only in a screenshot.
      npcJobSignatures: {
        active: this._npcJobSignatureActive || 0,
        drawn: this._npcJobSignatureDrawn || 0,
        lastSignal: this._lastNpcJobSignatureId || null,
        reacting: this._npcJobReacting || 0,
        lastReaction: this._lastNpcJobReaction || null,
        capacity: NPC_JOB_SIGNATURE_CAPACITY,
      },
    };
  },

  // -------------------------------------------------------------------------
  // Pool construction
  // -------------------------------------------------------------------------
  _initPools() {
    const state = this.state;
    const scene = state.render && state.render.scene;
    if (!scene) { this._scene = null; return; } // render not up yet (e.g. unit test) — degrade to no-op
    this._scene = scene;

    const q = (state.settings.video && state.settings.video.particleQuality) || 'high';
    const cap = PARTICLE_CAP[q] || PARTICLE_CAP.high;
    this._cap = cap;
    this._burst = QUALITY_BURST[q] || 1.0; // scales discrete-effect spawn counts

    this._initEventLights();
    this._initRibbonTrails();
    this._initMiningBeam();
    this._initTetherCable();
    this._initArcPreview();
    this._initSeamMarkers();
    this._initCombatBeams();
    this._initFieldGeometry();
    // ---- GPU point cloud ----
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(cap * 3);
    const colors = new Float32Array(cap * 3);
    const sizes = new Float32Array(cap);
    const alphas = new Float32Array(cap);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    const trailAxes = new Float32Array(cap);
    const trailStretch = new Float32Array(cap);
    geo.setAttribute('aTrailAxis', new THREE.BufferAttribute(trailAxes, 1));
    geo.setAttribute('aTrailStretch', new THREE.BufferAttribute(trailStretch, 1));
    geo.setDrawRange(0, 0);

    const mat = buildParticleTrailMaterial();
    this._particleMat = mat;

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; // particles are world-scattered; never cull the whole cloud
    points.renderOrder = 10;
    scene.add(points);

    this._points = points;
    this._pGeo = geo;
    this._pPos = positions;
    this._pCol = colors;
    this._pSize = sizes;
    this._pAlpha = alphas;
    this._pTrailAxis = trailAxes;
    this._pTrailStretch = trailStretch;

    // per-particle CPU state (Structure-of-Arrays; index == particle slot)
    this._px = new Float32Array(cap);
    this._py = new Float32Array(cap);
    this._pz = new Float32Array(cap);
    this._vx = new Float32Array(cap);
    this._vy = new Float32Array(cap);
    this._vz = new Float32Array(cap);
    this._age = new Float32Array(cap);
    this._life = new Float32Array(cap);
    this._drag = new Float32Array(cap);
    this._size0 = new Float32Array(cap);
    this._size1 = new Float32Array(cap);
    this._cr0 = new Float32Array(cap); this._cg0 = new Float32Array(cap); this._cb0 = new Float32Array(cap);
    this._cr1 = new Float32Array(cap); this._cg1 = new Float32Array(cap); this._cb1 = new Float32Array(cap);
    this._particleTrailAxis = new Float32Array(cap);
    this._particleTrailStretch = new Float32Array(cap);
    this._particleAdmissionPriority = new Float64Array(cap);
    this._particleAdmissionPriority.fill(DEFAULT_VFX_ADMISSION_PRIORITY);
    this._particleAdmissionSerial = new Float64Array(cap);
    this._particleAdmissionSerial.fill(-1);
    this._alive = new Uint8Array(cap);
    this._head = 0;        // round-robin allocation cursor
    this._liveCount = 0;
    this._pDrawMax = 0;
    this._activeParticles = new Int32Array(cap);
    this._activeParticlePos = new Int32Array(cap);
    this._activeParticlePos.fill(-1);
    // GPU point records are packed in active-list order. Keep the last packed source-slot identity
    // so immutable trail shape channels move only when a slot is added, recycled, or swapped.
    this._pPackedParticleSlots = new Int32Array(cap);
    this._pPackedParticleSlots.fill(-1);
    this._freeParticles = new Int32Array(cap);
    for (let i = 0; i < cap; i++) this._freeParticles[i] = cap - 1 - i;
    this._freeParticleCount = cap;
    this._bindParticleDynamicBuffers();

    // ---- discrete sprite pool (flash / ring / smoke / fresnel) ----
    // Smoke owns an irregular alpha field and ordinary blending; it must not reuse the additive
    // circular glow card used by energy flashes.
    const tex = makeGlowTexture();
    const ringTex = makeRingTexture();
    const smokeTex = makeSmokeTexture();
    const combustionTex = makeCombustionTexture();
    this._glowTex = tex;
    this._ringTex = ringTex;
    this._trailStreakPool = initTrailStreakPool(scene, TRAIL_STREAK_CAP);
    this._ts = [];
    for (let i = 0; i < TRAIL_STREAK_CAP; i++) {
      this._ts.push({
        alive: false, age: 0, life: 1, size0: 1, size1: 1, op0: 1,
        x: 0, y: 0, z: 0, vx: 0, vz: 0, ax: 1, az: 0, stretch: 3.2, r: 1, g: 1, b: 1,
        admissionPriority: DEFAULT_VFX_ADMISSION_PRIORITY, admissionSerial: -1,
      });
    }
    this._trailStreakColor = new THREE.Color();
    this._tsHead = 0;
    this._liveTrailStreakCount = 0;
    this._activeTrailStreaks = new Int32Array(TRAIL_STREAK_CAP);
    this._activeTrailStreakPos = new Int32Array(TRAIL_STREAK_CAP);
    this._activeTrailStreakPos.fill(-1);
    this._freeTrailStreaks = new Int32Array(TRAIL_STREAK_CAP);
    for (let i = 0; i < TRAIL_STREAK_CAP; i++) this._freeTrailStreaks[i] = TRAIL_STREAK_CAP - 1 - i;
    this._freeTrailStreakCount = TRAIL_STREAK_CAP;

    // Thruster flame sprites use the procedural glow texture (makeGlowTexture above). The
    // assets/fx/*.jpg contact sheets are authoring-only and must not be live-referenced —
    // check:asset-reachability rejects them outside bundled roots.
    this._spr = []; // parallel CPU state
    this._spriteBatches = createInstancedSpriteBuckets(
      scene, SPRITE_CAP, tex, ringTex, smokeTex, combustionTex,
    );
    for (let i = 0; i < SPRITE_CAP; i++) {
      this._spr.push({
        alive: false, kind: SPR_FLASH, age: 0, life: 1, size0: 1, size1: 1,
        op0: 1, op1: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0, roll: 0, aspect: 1,
        admissionPriority: DEFAULT_VFX_ADMISSION_PRIORITY, admissionSerial: -1,
        r: 1, g: 1, b: 1,
      });
    }
    this._sHead = 0;
    this._activeSprites = new Int32Array(SPRITE_CAP);
    // Normal-blended smoke must be written far-to-near. Keep its ordering workspace bounded and
    // resident so dense explosions do not allocate or sort unrelated additive sprite families.
    this._smokeSpriteOrder = new Int32Array(SPRITE_CAP);
    this._activeSpritePos = new Int32Array(SPRITE_CAP);
    this._activeSpritePos.fill(-1);
    this._freeSprites = new Int32Array(SPRITE_CAP);
    for (let i = 0; i < SPRITE_CAP; i++) this._freeSprites[i] = SPRITE_CAP - 1 - i;
    this._freeSpriteCount = SPRITE_CAP;
    this._liveSpriteCount = 0;

    // Dedicated soft flame material slot for gaseous thrust (fx_thruster_main.jpg prepared for future use / richer shapes).
    // Currently the overlapping soft-glow puffs + softened point cloud provide the blend; swapping maps here is a one-line follow-up.
    this._flameMaterial = null;

    // Tier-1 pool-capacity events: initial pool construction is the baseline "active capacity".
    const tier1Init = state.perfRuntime && state.perfRuntime.tier1;
    if (tier1Init && tier1Init.isEnabled()) {
      tier1Init.countVfxPoolGrowth('particle-pool-init', cap);
      tier1Init.countVfxPoolGrowth('sprite-pool-init', SPRITE_CAP);
      tier1Init.countVfxPoolGrowth('trail-streak-pool-init', TRAIL_STREAK_CAP);
    }
  },

  _bindParticleDynamicBuffers() {
    if (!this._scene || !this._points || !this._pGeo) {
      this._particleDynamicBufferOwner = null;
      return null;
    }
    const attributes = PARTICLE_BUFFER_BINDINGS.map(({ name, key }) => {
      const attribute = this._pGeo.getAttribute(key);
      attribute.setUsage(THREE.DynamicDrawUsage);
      return { name, attribute };
    });
    // Points draw through BufferGeometry.drawRange; this count is the coordinator's matching
    // eligibility signal and does not alter Three.js point-cloud draw semantics.
    this._points.count = this._pDrawMax || 0;
    this._particleDynamicBufferOwner = registerDynamicBufferOwner(this._scene, {
      id: 'vfx-particle-cloud',
      mesh: this._points,
      attributes,
    });
    return this._particleDynamicBufferOwner;
  },

  // Reconcile the one GPU point cloud with the live particle-quality setting. The Points object,
  // material, sprite pools, and subscriptions stay stable; only its geometry/SoA capacity moves.
  // This makes current→max→current a resource migration rather than a second VFX init.
  _syncParticleQuality() {
    const video = this.state && this.state.settings && this.state.settings.video || {};
    const quality = video.particleQuality || 'high';
    const nextCap = PARTICLE_CAP[quality] || PARTICLE_CAP.high;
    this._burst = QUALITY_BURST[quality] || 1.0;
    if (!this._scene || !this._points || !this._pGeo || nextCap === this._cap) return false;

    const oldGeo = this._pGeo;
    const oldCap = this._cap || 0;
    const oldLiveCount = this._liveCount || 0;
    const oldActive = this._activeParticles;
    const oldActivePos = this._activeParticlePos;
    const old = {};
    const scalarFields = [
      '_px', '_py', '_pz', '_vx', '_vy', '_vz', '_age', '_life', '_drag',
      '_size0', '_size1', '_cr0', '_cg0', '_cb0', '_cr1', '_cg1', '_cb1',
      '_particleTrailAxis', '_particleTrailStretch',
    ];
    for (const field of scalarFields) old[field] = this[field];
    old._pPos = this._pPos;
    old._pCol = this._pCol;
    old._pSize = this._pSize;
    old._pAlpha = this._pAlpha;
    old._pTrailAxis = this._pTrailAxis;
    old._pTrailStretch = this._pTrailStretch;
    old._pPackedParticleSlots = this._pPackedParticleSlots;
    old._particleAdmissionPriority = this._particleAdmissionPriority;
    old._particleAdmissionSerial = this._particleAdmissionSerial;
    if (!old._particleAdmissionPriority || old._particleAdmissionPriority.length !== oldCap) {
      old._particleAdmissionPriority = new Float64Array(oldCap);
      old._particleAdmissionPriority.fill(DEFAULT_VFX_ADMISSION_PRIORITY);
    }
    if (!old._particleAdmissionSerial || old._particleAdmissionSerial.length !== oldCap) {
      old._particleAdmissionSerial = new Float64Array(oldCap);
      old._particleAdmissionSerial.fill(-1);
      for (let cursor = 0; cursor < oldLiveCount; cursor++) {
        const slot = oldActive[cursor];
        if (slot >= 0 && slot < oldCap) old._particleAdmissionSerial[slot] = cursor;
      }
    }

    // A quality downgrade is itself an admission event. Retain the most important residents; for
    // equal priority, dropping the oldest first matches saturated-pool eviction semantics.
    let retainedActive = null;
    if (oldLiveCount > nextCap) {
      retainedActive = Array.from({ length: oldLiveCount }, (_, cursor) => oldActive[cursor]);
      retainedActive.sort((a, b) => old._particleAdmissionPriority[b]
        - old._particleAdmissionPriority[a]
        || old._particleAdmissionSerial[b] - old._particleAdmissionSerial[a]);
    }

    const geo = new THREE.BufferGeometry();
    this._pPos = new Float32Array(nextCap * 3);
    this._pCol = new Float32Array(nextCap * 3);
    this._pSize = new Float32Array(nextCap);
    this._pAlpha = new Float32Array(nextCap);
    this._pTrailAxis = new Float32Array(nextCap);
    this._pTrailStretch = new Float32Array(nextCap);
    geo.setAttribute('position', new THREE.BufferAttribute(this._pPos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this._pCol, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this._pSize, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this._pAlpha, 1));
    geo.setAttribute('aTrailAxis', new THREE.BufferAttribute(this._pTrailAxis, 1));
    geo.setAttribute('aTrailStretch', new THREE.BufferAttribute(this._pTrailStretch, 1));

    for (const field of scalarFields) {
      if (field === '_pTrailAxis' || field === '_pTrailStretch') continue;
      this[field] = new Float32Array(nextCap);
    }
    this._alive = new Uint8Array(nextCap);
    this._activeParticles = new Int32Array(nextCap);
    this._activeParticlePos = new Int32Array(nextCap);
    this._activeParticlePos.fill(-1);
    this._pPackedParticleSlots = new Int32Array(nextCap);
    this._pPackedParticleSlots.fill(-1);
    this._particleAdmissionPriority = new Float64Array(nextCap);
    this._particleAdmissionPriority.fill(DEFAULT_VFX_ADMISSION_PRIORITY);
    this._particleAdmissionSerial = new Float64Array(nextCap);
    this._particleAdmissionSerial.fill(-1);
    this._freeParticles = new Int32Array(nextCap);

    const keep = Math.min(oldLiveCount, nextCap);
    for (let dst = 0; dst < keep; dst++) {
      const src = retainedActive ? retainedActive[dst] : oldActive[dst];
      if (!(src >= 0 && src < oldCap)) continue;
      for (const field of scalarFields) this[field][dst] = old[field][src];
      // The old GPU attributes are already packed in active-list order, independently of the
      // stable CPU slot. Preserve the exact last-presented record only while its identity matches;
      // recycle/retire can invalidate a packed index before the next integration has rewritten it.
      const packedSource = oldActivePos && oldActivePos[src] >= 0 ? oldActivePos[src] : dst;
      const dst3 = dst * 3;
      const packedIdentityValid = !!old._pPackedParticleSlots
        && old._pPackedParticleSlots[packedSource] === src;
      if (packedIdentityValid) {
        const src3 = packedSource * 3;
        this._pPos[dst3] = old._pPos[src3];
        this._pPos[dst3 + 1] = old._pPos[src3 + 1];
        this._pPos[dst3 + 2] = old._pPos[src3 + 2];
        this._pCol[dst3] = old._pCol[src3];
        this._pCol[dst3 + 1] = old._pCol[src3 + 1];
        this._pCol[dst3 + 2] = old._pCol[src3 + 2];
        this._pSize[dst] = old._pSize[packedSource];
        this._pAlpha[dst] = old._pAlpha[packedSource];
        this._pTrailAxis[dst] = old._pTrailAxis[packedSource];
        this._pTrailStretch[dst] = old._pTrailStretch[packedSource];
      } else {
        const life = old._life[src];
        const t = life > 1e-8 ? Math.max(0, Math.min(1, old._age[src] / life)) : 1;
        this._pPos[dst3] = old._px[src];
        this._pPos[dst3 + 1] = old._py[src];
        this._pPos[dst3 + 2] = old._pz[src];
        this._pCol[dst3] = old._cr0[src] + (old._cr1[src] - old._cr0[src]) * t;
        this._pCol[dst3 + 1] = old._cg0[src] + (old._cg1[src] - old._cg0[src]) * t;
        this._pCol[dst3 + 2] = old._cb0[src] + (old._cb1[src] - old._cb0[src]) * t;
        this._pSize[dst] = old._size0[src] + (old._size1[src] - old._size0[src]) * t;
        this._pAlpha[dst] = 1 - t;
        this._pTrailAxis[dst] = old._particleTrailAxis[src];
        this._pTrailStretch[dst] = old._particleTrailStretch[src];
      }
      this._alive[dst] = 1;
      this._particleAdmissionPriority[dst] = old._particleAdmissionPriority[src];
      this._particleAdmissionSerial[dst] = old._particleAdmissionSerial[src];
      this._activeParticles[dst] = dst;
      this._activeParticlePos[dst] = dst;
      this._pPackedParticleSlots[dst] = dst;
    }

    this._cap = nextCap;
    this._liveCount = keep;
    this._head = keep % nextCap;
    this._pDrawMax = keep;
    this._freeParticleCount = nextCap - keep;
    for (let i = 0; i < this._freeParticleCount; i++) this._freeParticles[i] = nextCap - 1 - i;
    if (!Number.isFinite(this._admissionSerial)) this._admissionSerial = keep;
    geo.setDrawRange(0, keep);
    this._pGeo = geo;
    this._points.geometry = geo;
    if (this._particleDynamicBufferOwner) {
      for (let index = 0; index < PARTICLE_BUFFER_BINDINGS.length; index++) {
        const { key } = PARTICLE_BUFFER_BINDINGS[index];
        const attribute = geo.getAttribute(key);
        attribute.setUsage(THREE.DynamicDrawUsage);
        replaceDynamicBufferAttribute(
          this._particleDynamicBufferOwner,
          index,
          attribute,
          'particle-quality',
        );
      }
      commitDynamicBufferOwner(this._particleDynamicBufferOwner, keep);
    } else {
      for (const attr of Object.values(geo.attributes)) {
        attr.setUsage(THREE.DynamicDrawUsage);
        attr.needsUpdate = true;
      }
      this._points.count = keep;
    }
    if (oldGeo && oldGeo !== geo && typeof oldGeo.dispose === 'function') oldGeo.dispose();
    // Tier-1 pool-capacity event: the particle cloud migrated to a new capacity.
    const tier1Grow = this.state && this.state.perfRuntime && this.state.perfRuntime.tier1;
    if (tier1Grow && tier1Grow.isEnabled()) tier1Grow.countVfxPoolGrowth('particle-pool-grow', nextCap);
    return true;
  },

  _subscribe() {
    const bus = this.bus;
    const add = (name, fn) => this._subs.push(bus.on(name, fn));

    add('tether:attached', (p) => this._onTetherLatch(p));
    add('tether:broken', (p) => this._onTetherSnap(p));
    add('combat:fire', (p) => this._onFire(p));
    add('combat:beamStop', (p) => this._onBeamStop(p));
    add('projectile:hit', (p) => this._onProjectileHit(p));
    add('combat:damage', (p) => this._onDamage(p));
    add('physics:impact', (p) => this._onPhysicsImpact(p));
    add('collision', (p) => this._onCollision(p));
    // SF-10: the PQ-009 collision-consequence receipts (a hull slammed into terrain — the concussion
    // cannon's kill move) had no renderer. Wire the wall-impact payoff on pooled substrates: consumes
    // the receipt's pos/normal/count directly (no broadphase query), scales with reduced-flash, and
    // emits no juice cue so cue-count contracts stay frozen.
    add('combat:collisionConsequence', (p) => this._onCollisionConsequence(p));
    add('combat:collisionDebris', (p) => this._onCollisionDebris(p));
    add('entity:killed', (p) => { this._markEntityCacheDirty(); this._onKilled(p); });
    add('entity:destroyed', (p) => { this._markEntityCacheDirtyIfTrailType(p); this._onDestroyed(p); });
    add('entity:spawned', (p) => this._markEntityCacheDirtyIfTrailType(p));
    add('ship:appearanceChanged', (p) => { this._invalidateTrailSocket(p && p.id); this._markEntityCacheDirty(); });
    add('sector:enter', () => { this._markEntityCacheDirty(); this._markProjectileCacheDirty(); this._combatBeams?.clear(); this._beamDamageCueNext.clear(); this._explosions.clear(); this._clearTrailStreaks(); this._resetCollisionPresentation(); this._clearStationSideEvents(); this._resetEnergyForBoundary(); });
    add('sector:exit', () => this._clearStationSideEvents());
    add('game:newGame', () => { this._explosions.clear(); this._clearTrailStreaks(); this._resetCollisionPresentation(); });
    add('save:loaded', () => { this._markEntityCacheDirty(); this._markProjectileCacheDirty(); this._combatBeams?.clear(); this._beamDamageCueNext.clear(); this._explosions.clear(); this._clearTrailStreaks(); this._resetCollisionPresentation(); this._clearStationSideEvents(); this._resetEnergyForBoundary(); });
    add('settings:changed', (p) => {
      if (!p || p.section !== 'video') return;
      if (p.key === 'particleQuality' || p.key == null) this._syncParticleQuality();
    });
    add('player:death', (p) => this._explode({ pos: p && p.pos, radius: 12 }, true));
    add('mining:start', (p) => this._onMiningStart(p));
    add('mining:stop', () => this._onMiningStop());
    add('mining:tick', (p) => this._onMiningTick(p));
    add('mining:yield', (p) => this._onMiningYield(p));
    add('station:sideEvent', (p) => this._onStationSideEvent(p));
    add('ship:thrust', (p) => this._onThrust(p));
    add('ship:boostStart', (p) => this._onBoost(p, true));
    add('ship:boostStop', (p) => this._onBoost(p, false));
    add('ship:dash', (p) => this._onDash(p));                      // Phase 3 dash impulse — violet afterburner burst
    add('cruise:charging', (p) => this._onCruiseCharging(p));
    add('cruise:engaged', (p) => this._onCruiseEngaged(p));
    add('cruise:dropped', (p) => this._onCruiseDropped(p));
    add('charge:detonated', (p) => this._onChargeDetonated(p));
    add('ai:telegraph', (p) => this._onAiTelegraph(p));
    add('ai:flee', (p) => this._onAiFlee(p));
    add('ai:formationBroken', (p) => this._onAiFormationBroken(p));
    add('presentation:cue', (p) => this._onDirectMiningPresentationCue(p));
    add('presentation:cue', (p) => this._onDirectTravelPresentationCue(p));
    add('presentation:vfxCue', (p) => this._onPresentationCue(p));
    add('pickup:collected', (p) => this._onPickup(p));
  },

  // Spec2/02 §3 juice-stack trace: emit a presentation cue + audio cue for every
  // significant combat/AI/cruise moment so headless contract checks can count them.
  // Always emits the cue pair (even headless) so audio and downstream systems see the event.
  _emitJuiceCue(id, p, magnitude = 1) {
    const pos = this._posFrom(p, p && (p.targetId ?? p.entityId ?? p.sourceId ?? p.id));
    const reduced = this._isReduced();
    this.bus.emit('presentation:vfxCue', {
      id,
      lane: id.split('.')[0],
      pos: pos || (p && p.pos) || null,
      magnitude,
      flashReduced: reduced,
    });
    this.bus.emit('audio:cue', { id });
  },

  _isReduced() {
    const settings = this.state && this.state.settings;
    const v = settings && settings.video;
    const a = settings && settings.accessibility;
    // motionReduce lives under video; flashReduce is authored under accessibility (and may be
    // mirrored onto video by settings UI). Either flag must keep danger tells readable, not silent.
    return !!(
      (v && (v.motionReduce || v.flashReduce))
      || (a && a.flashReduce)
    );
  },

  // -------------------------------------------------------------------------
  // M2 frame-local membrane (spawn inputs are galactic-global; GPU state is local)
  // -------------------------------------------------------------------------
  _syncFrameMembrane() {
    if (!this._frameMembrane) return null;
    const rebase = this._frameMembrane.sync(this.state);
    if (rebase.changed) this.reprojectFrame(rebase.dx, rebase.dz);
    return rebase;
  },

  _toLocalXZ(x, z, out) {
    const target = out || this._spawnLocalXZ || { x: 0, z: 0 };
    if (!this._frameMembrane) {
      target.x = Number.isFinite(x) ? x : 0;
      target.z = Number.isFinite(z) ? z : 0;
      return target;
    }
    // Reuse target as the global input scratch (globalToFrame reads before writing).
    const gx = Number.isFinite(x) ? x : 0;
    const gz = Number.isFinite(z) ? z : 0;
    target.x = gx;
    target.z = gz;
    return this._frameMembrane.toLocal(target, target);
  },

  /**
   * Shift all live local VFX anchors by origin rebase delta. Does not retire effects or lower quality.
   * Aligns the internal membrane to the current world origin so a later sync is a no-op (no double shift).
   */
  reprojectFrame(dx, dz) {
    const ox = Number.isFinite(dx) ? dx : 0;
    const oz = Number.isFinite(dz) ? dz : 0;
    if (ox !== 0 || oz !== 0) {
      // Particles
      if (this._px && this._pz && this._alive) {
        const n = this._cap || 0;
        for (let i = 0; i < n; i++) {
          if (!this._alive[i]) continue;
          this._px[i] += ox;
          this._pz[i] += oz;
        }
      }
      // Sprites
      if (this._spr) {
        for (let i = 0; i < this._spr.length; i++) {
          const st = this._spr[i];
          if (!st || !st.alive) continue;
          st.x += ox;
          st.z += oz;
        }
      }
      // Trail streaks
      if (this._ts) {
        for (let i = 0; i < this._ts.length; i++) {
          const st = this._ts[i];
          if (!st || !st.alive) continue;
          st.x += ox;
          st.z += oz;
        }
      }
      // Event lights
      if (this._lights) {
        for (const slot of this._lights) {
          if (!slot || !slot.obj) continue;
          slot.obj.position.x += ox;
          slot.obj.position.z += oz;
        }
      }
      // Ribbon engine trails store history in frame-local sample buffers — shift, then rebuild.
      if (this._ribbonTrails && this._ribbonTrails.size) {
        for (const trail of this._ribbonTrails.values()) {
          if (!trail) continue;
          if (typeof trail.reproject === 'function') trail.reproject(ox, oz);
          if (typeof trail.rebuild === 'function') trail.rebuild(null, null, this._t);
        }
      }
    }
    // Prevent double-reproject when both renderer prepareFrame and vfx.update observe the same seq.
    if (this._frameMembrane) this._frameMembrane.reset(this.state);
  },

  // -------------------------------------------------------------------------
  // Particle / sprite allocation
  // -------------------------------------------------------------------------
  _lowestPriorityParticleSlot() {
    if (this._liveCount <= 0) return -1;
    const active = this._activeParticles;
    let lowest = active[0];
    for (let cursor = 1; cursor < this._liveCount; cursor++) {
      const candidate = active[cursor];
      if (this._particleAdmissionPriority[candidate] < this._particleAdmissionPriority[lowest]
        || (this._particleAdmissionPriority[candidate] === this._particleAdmissionPriority[lowest]
          && this._particleAdmissionSerial[candidate] < this._particleAdmissionSerial[lowest])) {
        lowest = candidate;
      }
    }
    return lowest;
  },

  _lowestPrioritySpriteSlot() {
    if (this._liveSpriteCount <= 0) return -1;
    const active = this._activeSprites;
    let lowest = active[0];
    for (let cursor = 1; cursor < this._liveSpriteCount; cursor++) {
      const candidate = active[cursor];
      const a = this._spr[candidate];
      const b = this._spr[lowest];
      if (a.admissionPriority < b.admissionPriority
        || (a.admissionPriority === b.admissionPriority
          && a.admissionSerial < b.admissionSerial)) lowest = candidate;
    }
    return lowest;
  },

  _spawnParticle(
    x, z, vx, vz, life, size0, size1, c0, c1, drag, y, vy, trailAxis, trailStretch,
    admissionPriority,
  ) {
    if (!this._scene) return;
    assertDynamicBufferOwnerWritable(this._particleDynamicBufferOwner);
    const cap = this._cap;
    const priority = normalizeVfxAdmissionPriority(
      admissionPriority,
      this._spawnAdmissionPriority,
    );
    // Prefer an O(1) free stack. Saturation alone pays the bounded, allocation-free priority scan.
    let i;
    if (this._freeParticleCount > 0) i = this._freeParticles[--this._freeParticleCount];
    else {
      i = this._lowestPriorityParticleSlot();
      if (i < 0 || priority < this._particleAdmissionPriority[i]) return null;
      this._retireParticle(i);
      i = this._freeParticles[--this._freeParticleCount];
    }
    this._head = (i + 1) % cap;
    this._particleAdmissionPriority[i] = priority;
    this._particleAdmissionSerial[i] = this._admissionSerial++;
    if (!this._alive[i]) this._activateParticle(i);

    // Galactic-global spawn → frame-local GPU pose (Helios origin-zero is identity).
    const local = this._toLocalXZ(x, z, this._spawnLocalXZ);
    this._px[i] = local.x; this._py[i] = y || 0; this._pz[i] = local.z;
    this._vx[i] = vx; this._vy[i] = vy || 0; this._vz[i] = vz;
    this._age[i] = 0; this._life[i] = life; this._drag[i] = drag;
    this._size0[i] = size0; this._size1[i] = size1;
    this._cr0[i] = c0.r; this._cg0[i] = c0.g; this._cb0[i] = c0.b;
    this._cr1[i] = c1.r; this._cg1[i] = c1.g; this._cb1[i] = c1.b;
    this._particleTrailAxis[i] = Number.isFinite(trailAxis) ? trailAxis : 0;
    this._particleTrailStretch[i] = Number.isFinite(trailStretch) ? trailStretch : 0;
    const packedIndex = this._activeParticlePos[i];
    if (packedIndex >= 0 && this._pPackedParticleSlots) {
      this._pPackedParticleSlots[packedIndex] = -1;
    }
    this._alive[i] = 1;
    if (this._tier1Spawn) this._tier1Spawn.countVfxEmissions(1, 'particle');
    return i;
  },

  _spawnSprite(
    kind, x, y, z, life, size0, size1, op0, op1, color, vx, vz, aspect = 1, roll = null,
    admissionPriority,
  ) {
    if (!this._scene) return null;
    if (kind === SPR_FLASH || kind === SPR_COMBUSTION) {
      const authored = this._flashAccessibilityScratch;
      authored.life = life;
      authored.size0 = size0;
      authored.size1 = size1;
      authored.opacity0 = op0;
      authored.opacity1 = op1;
      applyFlashAccessibility(
        authored,
        resolveVfxAccessibilityProfile(this.state && this.state.settings),
        authored,
      );
      life = authored.life;
      size0 = authored.size0;
      size1 = authored.size1;
      op0 = authored.opacity0;
      op1 = authored.opacity1;
    }
    const priority = normalizeVfxAdmissionPriority(
      admissionPriority,
      this._spawnAdmissionPriority,
    );
    const n = SPRITE_CAP;
    let i;
    if (this._freeSpriteCount > 0) i = this._freeSprites[--this._freeSpriteCount];
    else {
      i = this._lowestPrioritySpriteSlot();
      if (i < 0 || priority < this._spr[i].admissionPriority) return null;
      this._retireSprite(i);
      i = this._freeSprites[--this._freeSpriteCount];
    }
    this._sHead = (i + 1) % n;

    const local = this._toLocalXZ(x, z, this._spawnLocalXZ);
    const st = this._spr[i];
    const wasAlive = st.alive;
    st.alive = true; st.kind = kind; st.age = 0; st.life = life;
    st.admissionPriority = priority;
    st.admissionSerial = this._admissionSerial++;
    st.size0 = size0; st.size1 = size1; st.op0 = op0; st.op1 = op1;
    st.x = local.x; st.y = y || 0; st.z = local.z; st.vx = vx || 0; st.vz = vz || 0;
    st.roll = Number.isFinite(roll) ? roll : Math.random() * Math.PI * 2;
    st.aspect = Math.max(0.35, Math.min(3.5, Number(aspect) || 1));

    if (!wasAlive) this._activateSprite(i);
    this._ctmp.set(color);
    st.r = this._ctmp.r;
    st.g = this._ctmp.g;
    st.b = this._ctmp.b;
    if (this._tier1Spawn) this._tier1Spawn.countVfxEmissions(1, 'sprite');
    return st;
  },

  _lowestPriorityTrailStreakSlot() {
    if (this._liveTrailStreakCount <= 0) return -1;
    const active = this._activeTrailStreaks;
    let weakest = active[0];
    for (let cursor = 1; cursor < this._liveTrailStreakCount; cursor++) {
      const candidateIndex = active[cursor];
      const candidate = this._ts[candidateIndex];
      const resident = this._ts[weakest];
      if (candidate.admissionPriority < resident.admissionPriority
        || (candidate.admissionPriority === resident.admissionPriority
          && candidate.admissionSerial < resident.admissionSerial)) weakest = candidateIndex;
    }
    return weakest;
  },

  _claimTrailStreak(admissionPriority) {
    const priority = normalizeVfxAdmissionPriority(
      admissionPriority,
      this._spawnAdmissionPriority,
    );
    let index;
    if (this._freeTrailStreakCount > 0) {
      index = this._freeTrailStreaks[--this._freeTrailStreakCount];
    } else {
      index = this._lowestPriorityTrailStreakSlot();
      if (index < 0 || priority < this._ts[index].admissionPriority) return -1;
    }
    this._tsHead = (index + 1) % TRAIL_STREAK_CAP;
    const slot = this._ts[index];
    slot.admissionPriority = priority;
    slot.admissionSerial = this._admissionSerial++;
    return index;
  },

  _spawnTrailStreak(x, y, z, life, size0, size1, op0, color, vx, vz, admissionPriority) {
    if (!richEngineTrailsEnabled(this.state && this.state.settings && this.state.settings.video)) return null;
    if (!this._scene || !this._trailStreakPool) return null;
    const i = this._claimTrailStreak(admissionPriority);
    if (i < 0) return null;
    const st = this._ts[i];
    const wasAlive = st.alive;
    const width = Math.max(0.04, size0);
    const length = Math.max(0.5, size1);
    const baseSize = width / 0.42;
    const local = this._toLocalXZ(x, z, this._spawnLocalXZ);
    st.alive = true;
    st.age = 0;
    st.life = life;
    st.size0 = baseSize;
    st.size1 = baseSize;
    st.op0 = op0;
    st.x = local.x;
    st.y = y || 0;
    st.z = local.z;
    st.vx = vx || 0;
    st.vz = vz || 0;
    st.ax = st.vx;
    st.az = st.vz;
    if (Math.hypot(st.ax, st.az) < 1e-6) { st.ax = 1; st.az = 0; }
    st.stretch = length / baseSize;
    this._trailStreakColor.set(color);
    st.r = this._trailStreakColor.r;
    st.g = this._trailStreakColor.g;
    st.b = this._trailStreakColor.b;
    if (!wasAlive) this._activateTrailStreak(i);
    this._writeTrailStreakInstance(i, this._activeTrailStreakPos[i], baseSize, op0);
    this._commitTrailStreakInstances();
    if (this._tier1Spawn) this._tier1Spawn.countVfxEmissions(1, 'trail-streak');
    return st;
  },

  // Projectile rail wisps — thin constant-width streak; not gated on engineTrails setting.
  _spawnProjectileTrailStreak(
    x, y, z, life, width, length, op0, color, vx, vz, axisX = null, axisZ = null,
    admissionPriority,
  ) {
    if (!this._scene || !this._trailStreakPool) return null;
    const i = this._claimTrailStreak(admissionPriority);
    if (i < 0) return null;
    const st = this._ts[i];
    const wasAlive = st.alive;
    const w = Math.max(0.04, width);
    const len = Math.max(0.5, length);
    const baseSize = w / 0.42;
    const local = this._toLocalXZ(x, z, this._spawnLocalXZ);
    st.alive = true;
    st.age = 0;
    st.life = life;
    st.size0 = baseSize;
    st.size1 = baseSize;
    st.op0 = op0;
    st.x = local.x;
    st.y = y || 0;
    st.z = local.z;
    st.vx = vx || 0;
    st.vz = vz || 0;
    st.ax = Number.isFinite(axisX) ? axisX : st.vx;
    st.az = Number.isFinite(axisZ) ? axisZ : st.vz;
    if (Math.hypot(st.ax, st.az) < 1e-6) { st.ax = 1; st.az = 0; }
    st.stretch = len / baseSize;
    this._trailStreakColor.set(color);
    st.r = this._trailStreakColor.r;
    st.g = this._trailStreakColor.g;
    st.b = this._trailStreakColor.b;
    if (!wasAlive) this._activateTrailStreak(i);
    this._writeTrailStreakInstance(i, this._activeTrailStreakPos[i], baseSize, op0);
    this._commitTrailStreakInstances();
    return st;
  },

  _activateTrailStreak(i) {
    this._activeTrailStreakPos[i] = this._liveTrailStreakCount;
    this._activeTrailStreaks[this._liveTrailStreakCount++] = i;
  },

  _retireTrailStreak(i) {
    const st = this._ts[i];
    if (!st || !st.alive) return;
    st.alive = false;
    st.admissionPriority = DEFAULT_VFX_ADMISSION_PRIORITY;
    st.admissionSerial = -1;
    const pos = this._activeTrailStreakPos[i];
    if (pos >= 0) {
      const lastPos = --this._liveTrailStreakCount;
      const moved = this._activeTrailStreaks[lastPos];
      if (pos !== lastPos) {
        this._activeTrailStreaks[pos] = moved;
        this._activeTrailStreakPos[moved] = pos;
      }
      this._activeTrailStreakPos[i] = -1;
    }
    this._freeTrailStreaks[this._freeTrailStreakCount++] = i;
  },

  _clearTrailStreaks() {
    if (!this._ts || !this._activeTrailStreaks) return false;
    while (this._liveTrailStreakCount > 0) {
      this._retireTrailStreak(this._activeTrailStreaks[this._liveTrailStreakCount - 1]);
    }
    this._tsHead = 0;
    if (this._trailStreakPool) this._commitTrailStreakInstances();
    return true;
  },

  _writeTrailStreakInstance(i, packedIndex, scale, opacity) {
    const s = this._ts[i];
    updateTrailStreakInstance(this._trailStreakPool, packedIndex, {
      x: s.x, y: s.y, z: s.z, vx: s.ax, vz: s.az,
      width: scale * 0.42,
      length: scale * (s.stretch || 3.2),
      opacity,
      color: s,
    });
  },

  _commitTrailStreakInstances() {
    const scroll = ((this._t || 0) * 0.35) % 1;
    commitTrailStreakInstances(this._trailStreakPool, this._liveTrailStreakCount, {
      scroll,
      time: this._t || 0,
    });
  },

  _activateParticle(i) {
    this._alive[i] = 1;
    this._activeParticlePos[i] = this._liveCount;
    this._activeParticles[this._liveCount++] = i;
  },

  _retireParticle(i) {
    if (!this._alive[i]) return;
    this._alive[i] = 0;
    const pos = this._activeParticlePos[i];
    if (pos >= 0) {
      const lastPos = --this._liveCount;
      const moved = this._activeParticles[lastPos];
      if (pos !== lastPos) {
        this._activeParticles[pos] = moved;
        this._activeParticlePos[moved] = pos;
        if (this._pPackedParticleSlots) this._pPackedParticleSlots[pos] = -1;
      }
      this._activeParticlePos[i] = -1;
      if (this._pPackedParticleSlots) this._pPackedParticleSlots[lastPos] = -1;
    }
    if (this._particleAdmissionPriority) {
      this._particleAdmissionPriority[i] = DEFAULT_VFX_ADMISSION_PRIORITY;
    }
    if (this._particleAdmissionSerial) this._particleAdmissionSerial[i] = -1;
    this._freeParticles[this._freeParticleCount++] = i;
  },

  _activateSprite(i) {
    this._activeSpritePos[i] = this._liveSpriteCount;
    this._activeSprites[this._liveSpriteCount++] = i;
  },

  _retireSprite(i) {
    const st = this._spr[i];
    if (!st || !st.alive) return;
    st.alive = false;
    const pos = this._activeSpritePos[i];
    if (pos >= 0) {
      const lastPos = --this._liveSpriteCount;
      const moved = this._activeSprites[lastPos];
      if (pos !== lastPos) {
        this._activeSprites[pos] = moved;
        this._activeSpritePos[moved] = pos;
      }
      this._activeSpritePos[i] = -1;
    }
    st.admissionPriority = DEFAULT_VFX_ADMISSION_PRIORITY;
    st.admissionSerial = -1;
    this._freeSprites[this._freeSpriteCount++] = i;
  },

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  _factionPalette(factionId) {
    const pals = (this.state.content && this.state.content.factionPalettes) || null;
    if (pals && factionId && pals[factionId]) return pals[factionId];
    return null;
  },
  _engineColor(e) {
    const fid = (e && (e.factionId || (e.data && e.data.factionId))) || null;
    const pal = this._factionPalette(fid);
    return (pal && pal.thruster) || '#88AAFF';
  },
  _entityMeshMeta(entityId) {
    return this.helpers && this.helpers.entityMeshMeta
      ? this.helpers.entityMeshMeta(entityId)
      : null;
  },
  /**
   * Pure profile id — no object allocation, no object-literal cache miss path.
   * resolveEngineProfileId accepts null meta + defIdFallback without constructing wrappers.
   */
  _engineProfileIdFor(e) {
    if (!e) return 'engine_ion_small';
    const meta = this._entityMeshMeta(e.id);
    const defId = e.data && typeof e.data.defId === 'string' ? e.data.defId : null;
    return resolveEngineProfileId(meta || null, defId);
  },

  /**
   * Frozen base engine profile — no faction tint object allocation on the hot path.
   * Faction hue is applied at emit time via _engineColor when needed.
   */
  _engineProfile(e) {
    return getEngineProfileBase(this._engineProfileIdFor(e));
  },
  _muzzleProfile(p, owner) {
    const meta = p && p.ownerId != null ? this._entityMeshMeta(p.ownerId) : null;
    const idx = Number.isFinite(p && p.hardpointIdx) ? p.hardpointIdx : 0;
    const weaponPartId = meta ? partIdFromSlotUrls(meta.slots, 'weapon', idx) : null;
    const profile = resolveMuzzleProfile(p && p.weaponId, weaponPartId);
    if (owner) {
      const accent = this._shieldColor(owner.factionId || (owner.data && owner.data.factionId));
      profile.accentColor = profile.lane === 'energy' ? accent : profile.accentColor;
    }
    return profile;
  },
  _shieldColor(factionId) {
    const pal = this._factionPalette(factionId);
    return (pal && (pal.accent || pal.emissive)) || '#66ccff';
  },
  _ent(id) {
    if (id == null) return null;
    return this.state.entities.get(id) || null;
  },
  // resolve a {x,z} position from a payload, falling back to an entity transform
  _posFrom(p, entId) {
    if (p && p.pos && typeof p.pos.x === 'number') return p.pos;
    if (p && p.hitPoint && typeof p.hitPoint.x === 'number') return p.hitPoint;
    if (p && p.position && typeof p.position.x === 'number') return p.position;
    if (p && p.contactPos && typeof p.contactPos.x === 'number') return p.contactPos;
    if (p && p.fromPos && typeof p.fromPos.x === 'number') return p.fromPos;
    if (p && p.toPos && typeof p.toPos.x === 'number') return p.toPos;
    const e = this._ent(entId);
    return e ? e.pos : null;
  },

  _markEntityCacheDirty() {
    this._trailCacheDirty = true;
  },

  _markProjectileCacheDirty() {
    this._projectileCacheDirty = true;
  },

  _markEntityCacheDirtyIfTrailType(p) {
    const t = p && p.type;
    if (!t || t === 'ship' || t === 'drone') this._markEntityCacheDirty();
    if (t === 'projectile') this._markProjectileCacheDirty();
  },

  _refreshTrailCandidates() {
    const list = this.state.entityList || [];
    if (!this._trailCacheDirty && this._trailListRef === list && this._trailListLength === list.length) return;
    this._trailCandidates.length = 0;
    this._ribbonCandidates.length = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || (e.type !== 'ship' && e.type !== 'drone')) continue;
      this._trailCandidates.push(e);
      if ((e.radius || 0) >= 22) this._ribbonCandidates.push(e);
    }
    this._trailListRef = list;
    this._trailListLength = list.length;
    this._trailCacheDirty = false;
  },

  _invalidateTrailSocket(id) {
    if (id == null) {
      for (const e of this._trailCandidates) {
        if (e && e.view) {
          delete e.view.__vfxTrailSocket;
          delete e.view.__vfxTrailSockets;
          delete e.view.__vfxRcsSockets;
        }
      }
      return;
    }
    const e = this._ent(id);
    if (e && e.view) {
      delete e.view.__vfxTrailSocket;
      delete e.view.__vfxTrailSockets;
      delete e.view.__vfxRcsSockets;
    }
  },

  _writeTrailSocketPose(x, y, z, forwardX, forwardY, forwardZ) {
    const scratch = this._socketScratch;
    const fx = Number.isFinite(forwardX) ? forwardX : -1;
    const fy = Number.isFinite(forwardY) ? forwardY : 0;
    const fz = Number.isFinite(forwardZ) ? forwardZ : 0;
    const len = Math.hypot(fx, fy, fz) || 1;
    scratch.x = Number.isFinite(x) ? x : 0;
    scratch.y = Number.isFinite(y) ? y : 0;
    scratch.z = Number.isFinite(z) ? z : 0;
    scratch.forwardX = fx / len;
    scratch.forwardY = fy / len;
    scratch.forwardZ = fz / len;
    scratch.angle = Math.atan2(scratch.forwardZ, scratch.forwardX);
    scratch.rotationY = Math.PI - scratch.angle;
    return scratch;
  },

  _trailSocketPoseFromObject(socket) {
    socket.updateWorldMatrix(true, false);
    socket.matrixWorld.decompose(this._socketWorldPos, this._socketWorldQuat, this._socketWorldScale);
    const f = socket.userData && socket.userData.forward || [-1, 0, 0];
    const fx = Array.isArray(f) ? f[0] : f.x;
    const fy = Array.isArray(f) ? f[1] : f.y;
    const fz = Array.isArray(f) ? f[2] : f.z;
    this._socketForward.set(
      Number.isFinite(fx) ? fx : -1,
      Number.isFinite(fy) ? fy : 0,
      Number.isFinite(fz) ? fz : 0,
    );
    if (this._socketForward.lengthSq() < 1e-8) this._socketForward.set(-1, 0, 0);
    this._socketForward.normalize().applyQuaternion(this._socketWorldQuat).normalize();
    // Mesh matrix is frame-local; spawn helpers expect galactic-global XZ (convert once here).
    const globalXZ = this._entityLocalXZ;
    globalXZ.x = this._socketWorldPos.x;
    globalXZ.z = this._socketWorldPos.z;
    if (this._frameMembrane) this._frameMembrane.toGlobal(globalXZ, globalXZ);
    return this._writeTrailSocketPose(
      globalXZ.x,
      this._socketWorldPos.y,
      globalXZ.z,
      this._socketForward.x,
      this._socketForward.y,
      this._socketForward.z,
    );
  },

  _trailSocketWorldPose(e) {
    const sockets = this._trailSocketObjects(e);
    if (sockets.length) return this._trailSocketPoseFromObject(sockets[0]);
    if (this.helpers.socketWorldPose) {
      const pose = this.helpers.socketWorldPose(e.id, 'SOCKET_Trail_Main');
      if (pose) {
        return this._writeTrailSocketPose(
          pose.x, pose.y || 0, pose.z,
          pose.forwardX, pose.forwardY, pose.forwardZ,
        );
      }
    }
    if (this.helpers.socketWorldPos) {
      const pos = this.helpers.socketWorldPos(e.id, 'SOCKET_Trail_Main');
      if (pos) {
        const cf = Math.cos(e && e.rot || 0);
        const sf = Math.sin(e && e.rot || 0);
        return this._writeTrailSocketPose(pos.x, pos.y || 0, pos.z, -cf, 0, -sf);
      }
    }
    return null;
  },

  _trailSocketObjects(e) {
    const view = e && e.view;
    const root = view && view.root;
    if (root && typeof root.traverse === 'function') {
      let cache = view.__vfxTrailSockets;
      const assetState = root.userData && root.userData.authoredAssetState;
      const compositionId = root.userData && root.userData.authoredCompositionId;
      const childCount = root.children ? root.children.length : 0;
      if (!cache || cache.root !== root || cache.assetState !== assetState
        || cache.compositionId !== compositionId || cache.childCount !== childCount) {
        const sockets = [];
        const drivePlumes = [];
        root.traverse((o) => {
          if (!o || !o.userData || o.userData.spacefaceEnergyPlume) return;
          if (isTrailSocketObject(o)) sockets.push(o);
          else if (isDrivePlumeAnchor(o)) drivePlumes.push(o);
        });
        sockets.sort(sortTrailAnchors);
        drivePlumes.sort(sortTrailAnchors);
        cache = view.__vfxTrailSockets = {
          root,
          assetState,
          compositionId,
          childCount,
          sockets: sockets.length ? sockets : drivePlumes,
        };
        view.__vfxTrailSocket = { root, socket: cache.sockets[0] || null };
      }
      return cache.sockets;
    }
    return EMPTY_TRAIL_SOCKETS;
  },

  _rcsSocketObjects(e) {
    const view = e && e.view;
    const root = view && view.root;
    if (!root || typeof root.getObjectByName !== 'function') return null;
    let cache = view.__vfxRcsSockets;
    const assetState = root.userData && root.userData.authoredAssetState;
    const compositionId = root.userData && root.userData.authoredCompositionId;
    const childCount = root.children ? root.children.length : 0;
    if (!cache || cache.root !== root || cache.assetState !== assetState
      || cache.compositionId !== compositionId || cache.childCount !== childCount) {
      cache = view.__vfxRcsSockets = {
        root,
        assetState,
        compositionId,
        childCount,
        port: root.getObjectByName('SOCKET_RCS_Port') || null,
        starboard: root.getObjectByName('SOCKET_RCS_Starboard') || null,
      };
    }
    return cache;
  },

  _writeRcsSocketPose(socket, origin, axis) {
    if (!socket || !origin || !axis) return false;
    socket.updateWorldMatrix(true, false);
    socket.matrixWorld.decompose(this._socketWorldPos, this._socketWorldQuat, this._socketWorldScale);
    const f = socket.userData && socket.userData.forward;
    const arrayForward = Array.isArray(f);
    const fx = arrayForward ? f[0] : (f && f.x);
    const fy = arrayForward ? f[1] : (f && f.y);
    const fz = arrayForward ? f[2] : (f && f.z);
    this._socketForward.set(
      Number.isFinite(fx) ? fx : 0,
      Number.isFinite(fy) ? fy : 0,
      Number.isFinite(fz) ? fz : 0,
    );
    if (this._socketForward.lengthSq() < 1e-8) return false;
    this._socketForward.normalize().applyQuaternion(this._socketWorldQuat).normalize();
    const globalXZ = this._entityLocalXZ;
    globalXZ.x = this._socketWorldPos.x;
    globalXZ.z = this._socketWorldPos.z;
    if (this._frameMembrane) this._frameMembrane.toGlobal(globalXZ, globalXZ);
    const local = this._toLocalXZ(globalXZ.x, globalXZ.z, this._spawnLocalXZ);
    origin[0] = local.x;
    origin[1] = this._socketWorldPos.y;
    origin[2] = local.z;
    axis[0] = this._socketForward.x;
    axis[1] = this._socketForward.y;
    axis[2] = this._socketForward.z;
    return true;
  },

  _trailSocketWorldPos(e) {
    return this._trailSocketWorldPose(e);
  },

  // -------------------------------------------------------------------------
  // Event handlers (each pushes pooled visuals; no per-event allocation of GPU objects)
  // -------------------------------------------------------------------------
  _initCombatBeams() {
    if (!this._scene || this._combatBeams) return;
    this._combatBeams = new PersistentCombatBeamPool(THREE, {
      maxBeams: 16,
      timeoutS: 0.14,
      scene: this._scene,
    });
    this._scene.add(this._combatBeams.group);
  },

  _onFire(p) {
    if (!this._scene) return;
    let origin = (p.from && typeof p.from.x === 'number')
      ? p.from
      : ((p.origin && typeof p.origin.x === 'number') ? p.origin : this._posFrom(p, p.ownerId));
    if (!origin && this.helpers.socketWorldPos && p.ownerId != null) {
      const sock = this.helpers.socketWorldPos(p.ownerId, 'SOCKET_Weapon_Front');
      if (sock) origin = sock;
    }
    if (!origin) return;
    let base = this._dirAngle(p.dir, p.ownerId);
    const owner = this._ent(p.ownerId);
    // Off-axis muzzle scatter while tumbling — guns whip with the thrash.
    const scatter = owner && owner.presentation && owner.presentation.tumble
      ? Math.max(0, owner.presentation.tumble.muzzleScatter || 0)
      : 0;
    if (scatter > 0.05) {
      base += (Math.random() - 0.5) * scatter * 1.1;
    }
    const profile = this._muzzleProfile(p, owner);
    if (p.continuous === true && p.to && this._combatBeams) {
      const startsBefore = this._combatBeams.startCount;
      if (!this._combatBeams.upsert(p, this._t, profile)) return;
      // A sustained beam gets one source ignition. The pool's actual inactive→active transition is
      // authoritative, so malformed or compatibility receipts cannot strobe merely by omitting
      // phase:'update'.
      if (this._combatBeams.startCount === startsBefore) return;
    }
    const burst = this._burst || 1;
    switch (profile.lane) {
      case 'beam': this._spawnMuzzleBeam(origin, base, profile, burst); break;
      case 'energy': this._spawnMuzzleEnergy(origin, base, profile, burst); break;
      case 'explosive': this._spawnMuzzleExplosive(origin, base, profile, burst); break;
      default: this._spawnMuzzleBallistic(origin, base, profile, burst); break;
    }
  },

  _onBeamStop(p) {
    if (this._combatBeams) this._combatBeams.stop(p);
    if (p && p.ownerId != null) {
      const prefix = `${String(p.ownerId)}:`;
      for (const key of this._beamDamageCueNext.keys()) {
        if (key.startsWith(prefix)) this._beamDamageCueNext.delete(key);
      }
    }
  },

  _spawnMuzzleBallistic(origin, base, profile, burst) {
    const sm = profile.sizeMul || 1;
    const col = profile.accentColor || '#ffcc88';
    const mx = origin.x + Math.cos(base) * 1.5, mz = origin.z + Math.sin(base) * 1.5;
    const rail = profile.family === 'rail';
    const siege = profile.variant === 'siege-lance';
    if (rail) {
      const length = (siege ? 8.5 : 5.4) * sm;
      this._spawnProjectileTrailStreak(mx, 0.28, mz, siege ? 0.10 : 0.075,
        (siege ? 0.38 : 0.27) * sm, length * 1.22, 0.96, '#f4fbff',
        Math.cos(base) * 24, Math.sin(base) * 24);
      for (const offset of [-0.24, 0.24]) {
        const a = base + offset;
        this._spawnProjectileTrailStreak(origin.x, 0.18, origin.z, 0.09,
          0.17 * sm, 2.8 * sm, 0.58, '#8ecfff', Math.cos(a) * 18, Math.sin(a) * 18);
      }
    } else {
      this._spawnProjectileTrailStreak(mx, 0.16, mz, 0.085 * sm, 0.22 * sm, 3.2 * sm,
        0.72, profile.coreColor || '#ffffff', Math.cos(base) * 20, Math.sin(base) * 20);
    }
    this._flashLight({ x: origin.x, z: origin.z }, profile.coreColor || '#ffffff', (rail ? 4.2 : 2.4) * sm, 12, rail ? 150 : 78);
    // Mechanical muzzles eject only a few lateral casing glints. The previous forward orange fan
    // made every ordinary shot look like the same detached impact explosion.
    if (!rail) {
      this._c0.set('#fff0c8'); this._c1.set('#50463b');
      const side = base + Math.PI * 0.5;
      const casingCount = Math.max(1, Math.round(2 * burst * (profile.rapid ? 0.6 : 1)));
      for (let k = 0; k < casingCount; k++) {
        const a = side + (Math.random() - 0.5) * 0.34;
        const sp = 12 + Math.random() * 16;
        this._spawnParticle(origin.x, origin.z, Math.cos(a) * sp, Math.sin(a) * sp,
          0.18, 0.85, 0.08, this._c0, this._c1, 2.8, 0, 0);
      }
    }
  },

  _spawnMuzzleEnergy(origin, base, profile, burst) {
    const sm = profile.sizeMul || 1;
    const col = profile.accentColor || '#39d0ff';
    const mx = origin.x + Math.cos(base) * 1.6, mz = origin.z + Math.sin(base) * 1.6;
    const emp = profile.family === 'emp';
    const thermal = profile.variant === 'thermal-bolt';
    if (emp) {
      for (const offset of [-0.42, 0, 0.42]) {
        const a = base + offset;
        this._spawnProjectileTrailStreak(mx, 0.24, mz, 0.12, 0.19 * sm,
          (2.2 + Math.abs(offset) * 2) * sm, 0.72, offset === 0 ? '#f4ffff' : '#668cff',
          Math.cos(a) * 22, Math.sin(a) * 22);
      }
    } else if (thermal) {
      this._spawnSprite(SPR_COMBUSTION, mx, 0.18, mz, 0.15, 0.55 * sm, 1.35 * sm,
        0.42, 0, '#ff6a24', Math.cos(base) * 4, Math.sin(base) * 4, 1.8, base);
      for (const offset of [-0.22, 0, 0.22]) {
        const a = base + offset;
        this._spawnProjectileTrailStreak(mx, 0.18, mz, 0.16, 0.25 * sm,
          (2.1 + (offset === 0 ? 1.4 : 0)) * sm, 0.62, col,
          Math.cos(a) * 16, Math.sin(a) * 16);
      }
    } else {
      this._spawnProjectileTrailStreak(mx, 0.20, mz, 0.095, 0.24 * sm, 4.8 * sm,
        0.78, profile.coreColor || '#e8f8ff', Math.cos(base) * 25, Math.sin(base) * 25);
    }
    this._flashLight({ x: origin.x, z: origin.z }, profile.lightColor || col,
      (emp ? 3.8 : thermal ? 3.2 : 2.1) * sm, 11, emp ? 145 : 105);
  },

  _spawnMuzzleExplosive(origin, base, profile, burst) {
    const sm = profile.sizeMul || 1;
    const col = profile.accentColor || '#ff8844';
    const mx = origin.x + Math.cos(base) * 1.4, mz = origin.z + Math.sin(base) * 1.4;
    const torpedo = profile.variant === 'torpedo';
    this._spawnProjectileTrailStreak(origin.x, 0.15, origin.z, torpedo ? 0.16 : 0.12,
      (torpedo ? 0.34 : 0.25) * sm, (torpedo ? 5.2 : 3.8) * sm, 0.76,
      profile.coreColor || '#fff0d0', -Math.cos(base) * 13, -Math.sin(base) * 13);
    this._spawnSprite(SPR_COMBUSTION, mx, 0.14, mz, torpedo ? 0.20 : 0.14,
      (torpedo ? 0.9 : 0.65) * sm, (torpedo ? 1.8 : 1.3) * sm, 0.58, 0,
      '#ff7a24', -Math.cos(base) * 3, -Math.sin(base) * 3, 2.2, base + Math.PI);
    this._spawnSprite(SPR_PUFF, origin.x - Math.cos(base) * 0.9, 0, origin.z - Math.sin(base) * 0.9,
      0.38 * sm, 1.15 * sm, 3.6 * sm, 0.24, 0.0, '#3a312d',
      -Math.cos(base) * 8, -Math.sin(base) * 8, 2.6, base + Math.PI);
    this._flashLight({ x: origin.x, z: origin.z }, profile.lightColor || col, (torpedo ? 4.4 : 3.1) * sm, 10, torpedo ? 160 : 115);
  },

  _spawnMuzzleBeam(origin, base, profile, burst) {
    const sm = profile.sizeMul || 1;
    const col = profile.accentColor || '#66ccff';
    const mx = origin.x + Math.cos(base) * 2.0, mz = origin.z + Math.sin(base) * 2.0;
    const continuous = profile.family === 'beam';
    this._spawnProjectileTrailStreak(mx, 0.24, mz, 0.09 * sm,
      0.22 * sm, 5.4 * sm, 0.88, profile.coreColor || '#d8f0ff',
      Math.cos(base) * 18, Math.sin(base) * 18);
    this._flashLight({ x: mx, z: mz }, profile.lightColor || col, 2.4 * sm, 18, 70);
  },

  // resolve a heading angle from a payload `dir` that may be a number (radians), a {x,z} vector, or
  // absent (fall back to the owner entity's rotation, else +X).
  _dirAngle(dir, ownerId) {
    if (typeof dir === 'number') return dir;
    if (dir && typeof dir.x === 'number' && typeof dir.z === 'number') return Math.atan2(dir.z, dir.x);
    const e = this._ent(ownerId);
    return e ? e.rot : 0;
  },

  _onProjectileHit(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, p.targetId);
    if (!pos) return;
    const tgt = this._ent(p.targetId);
    const fid = (tgt && tgt.factionId) || null;
    const hitShield = tgt && tgt.shield > 0;
    const profile = resolveImpactPresentationProfile(p && p.weaponId, p);
    const scale = profile.scale || 1;
    const approach = p && (p.approach || p.dir) || null;
    let ax = approach && Number(approach.x) || 0;
    let az = approach && Number(approach.z) || 0;
    const approachLen = Math.hypot(ax, az) || 1;
    ax /= approachLen;
    az /= approachLen;
    let nx = p && p.normal && Number(p.normal.x);
    let nz = p && p.normal && Number(p.normal.z);
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-6) {
      nx = -ax || 1;
      nz = -az;
    }
    const normalLength = Math.hypot(nx, nz) || 1;
    nx /= normalLength;
    nz /= normalLength;
    const normalAngle = Math.atan2(nz, nx);
    // Contact geometry lies exactly on the gameplay collider. Depth-tested streaks centered there
    // lost half (or all) of their area inside the target hull at the chase camera. Bias release
    // residue a fraction of a world unit along the outward normal while keeping the gouge attached.
    const surfaceX = pos.x + nx * 0.42 * scale;
    const surfaceZ = pos.z + nz * 0.42 * scale;
    const shieldColor = this._shieldColor(fid);
    const materialColor = hitShield ? shieldColor : profile.accentColor;
    const burst = this._burst || 1;

    switch (profile.mode) {
      case 'proximity-burst': {
        // Flak is a proximity-fuzed volume event, not a surface incidence gouge. The profile had
        // declared this mode since PQ-023, but without a renderer branch it fell through to the
        // autocannon default below. Two crossed, pooled streaks make the compact ignition a piece of
        // directional structure instead of the shared circular flash card. Keep the light below
        // autocannon so dense point-defense fire does not wash the scene; the primary identity is
        // still the full-volume fragment spread and its longer outward release.
        const flakTangentX = -nz;
        const flakTangentZ = nx;
        this._spawnProjectileTrailStreak(surfaceX, 0.28, surfaceZ,
          profile.life * 0.68, 0.28 * scale, 3.4 * scale, 0.82,
          profile.coreColor, nx * 1.2, nz * 1.2, nx, nz);
        this._spawnProjectileTrailStreak(
          surfaceX + flakTangentX * 0.16 * scale, 0.25,
          surfaceZ + flakTangentZ * 0.16 * scale,
          profile.life * 0.58, 0.14 * scale, 2.2 * scale, 0.58,
          profile.accentColor, flakTangentX * 2.4, flakTangentZ * 2.4,
          flakTangentX, flakTangentZ);
        const fragmentStreaks = Math.max(6, Math.round(6 * burst));
        for (let k = 0; k < fragmentStreaks; k++) {
          const a = normalAngle + (k / fragmentStreaks) * Math.PI * 2
            + (k % 2 ? 0.10 : -0.06);
          const speed = (18 + (k % 3) * 6) * scale;
          this._spawnProjectileTrailStreak(
            surfaceX + Math.cos(a) * 0.22 * scale, 0.20,
            surfaceZ + Math.sin(a) * 0.22 * scale,
            profile.life * (1.05 + (k % 3) * 0.12),
            (0.12 + (k % 2) * 0.035) * scale,
            (3.0 + (k % 3) * 0.72) * scale,
            k % 2 ? 0.66 : 0.78,
            k % 2 ? profile.accentColor : profile.coreColor,
            Math.cos(a) * speed, Math.sin(a) * speed,
            Math.cos(a), Math.sin(a));
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, Math.PI * 2,
          16, 48, Math.max(12, Math.round(profile.fragmentCount * burst * 0.8)),
          profile.life * 1.35, 1.15 * scale,
          profile.coreColor, '#6b5545', 1.65);
        break;
      }
      case 'penetration-streak': {
        // Rail contact leaves a narrow axial cut fixed at the contact while a much smaller exit fan
        // departs along the surface normal. The cooler ionized scar survives the launch-white core,
        // so release frames retain a family-specific line rather than collapsing to a few points.
        this._spawnProjectileTrailStreak(surfaceX, 0.3, surfaceZ,
          profile.life * 1.75, 0.32 * scale, 13.5 * scale, 1.0, profile.coreColor, 0, 0, ax, az);
        this._spawnProjectileTrailStreak(surfaceX - ax * 0.55 * scale, 0.2, surfaceZ - az * 0.55 * scale,
          profile.life * 2.35, 0.18 * scale, 8.8 * scale, 0.64, materialColor,
          nx * 1.8, nz * 1.8, ax, az);
        this._spawnProjectileTrailStreak(surfaceX, 0.2, surfaceZ,
          profile.life * 2.05, 0.28 * scale, 5.2 * scale, 0.58, '#6cbfe8',
          nx * 6, nz * 6, nx, nz);
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 0.46, 48, 86,
          Math.max(3, Math.round(profile.fragmentCount * burst * 0.65)), 0.24, 0.88,
          '#ffffff', '#70808a', 3.2);
        break;
      }
      case 'thermal-splash': {
        // Plasma becomes a lopsided attached thermal body, then peels into a few broad tongues.
        // Two overlapping sheared volumes keep the contact visible at the gameplay camera without
        // turning it into the missile family's three-lobed combustion burst or a generic flash.
        this._spawnSprite(SPR_COMBUSTION, surfaceX, 0.22, surfaceZ, profile.life * 1.08,
          1.35 * scale, 4.6 * scale, 0.92, 0, profile.accentColor,
          nx * 2.4, nz * 2.4, 1.5, normalAngle);
        const tx = -nz;
        const tz = nx;
        this._spawnSprite(SPR_COMBUSTION,
          surfaceX + tx * 0.55 * scale, 0.20, surfaceZ + tz * 0.55 * scale,
          profile.life * 0.9, 0.9 * scale, 3.2 * scale, 0.62, 0, '#ffb04c',
          nx * 1.8 + tx * 1.2, nz * 1.8 + tz * 1.2, 1.15, normalAngle - 0.45);
        this._spawnProjectileTrailStreak(surfaceX, 0.24, surfaceZ, 0.18 * scale,
          0.38 * scale, 4.2 * scale, 0.90, profile.coreColor, 0, 0, nx, nz);
        const tendrils = Math.max(3, Math.round(3 * burst));
        for (let k = 0; k < tendrils; k++) {
          const a = normalAngle + (k - (tendrils - 1) * 0.5) * 0.30 + (Math.random() - 0.5) * 0.12;
          this._spawnProjectileTrailStreak(surfaceX, 0.16, surfaceZ, 0.32 + Math.random() * 0.14,
            0.30 * scale, (2.7 + Math.random() * 2.0) * scale, 0.64, profile.accentColor,
            Math.cos(a) * (9 + Math.random() * 10), Math.sin(a) * (9 + Math.random() * 10));
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 1.35, 10, 30,
          Math.round(profile.fragmentCount * burst * 0.55), profile.life, 1.45,
          profile.coreColor, '#4a1608', 1.35);
        // Normal-blended cooling plasma remains attached after the additive tongues peel away.
        this._spawnSprite(SPR_PUFF,
          surfaceX - ax * 0.45 * scale, 0.08, surfaceZ - az * 0.45 * scale,
          profile.life * 1.45, 1.0 * scale, 5.4 * scale, 0.34, 0,
          '#8a341e', nx * 1.8, nz * 1.8, 2.35, normalAngle + 0.22);
        break;
      }
      case 'combustion-burst': {
        // Missile contact is a clustered, asymmetric ignition volume followed by casing debris.
        // It never reuses the orange line starburst or an expanding ring.
        for (let k = -1; k <= 1; k++) {
          const ignitionAngle = normalAngle + k * 0.48;
          const offset = Math.abs(k) * 0.8 * scale;
          this._spawnSprite(SPR_COMBUSTION,
            surfaceX + Math.cos(ignitionAngle) * offset, 0.2,
            surfaceZ + Math.sin(ignitionAngle) * offset,
            (0.24 + Math.abs(k) * 0.08) * scale,
            (k === 0 ? 1.5 : 1.0) * scale, (k === 0 ? 4.4 : 3.0) * scale,
            k === 0 ? 0.94 : 0.68, 0,
            k === 0 ? profile.coreColor : profile.accentColor,
            Math.cos(ignitionAngle) * 4, Math.sin(ignitionAngle) * 4,
            k === 0 ? 1.6 : 2.2, ignitionAngle);
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 1.65, 24, 58,
          Math.round(profile.fragmentCount * burst * 0.7), 0.52, 1.55,
          '#f0d0a4', '#41362e', 1.8);
        this._spawnSprite(SPR_PUFF, surfaceX - ax * 1.3, 0, surfaceZ - az * 1.3,
          profile.life * 1.1, 2.0 * scale, 6.2 * scale, 0.42, 0, '#554038',
          -ax * 7, -az * 7, 2.4, Math.atan2(-az, -ax));
        const missileTangentX = -nz;
        const missileTangentZ = nx;
        this._spawnSprite(SPR_PUFF,
          surfaceX + missileTangentX * 0.75 * scale, 0.04,
          surfaceZ + missileTangentZ * 0.75 * scale,
          profile.life * 1.45, 1.45 * scale, 5.3 * scale, 0.34, 0, '#5f463c',
          -ax * 4 + missileTangentX * 2.2, -az * 4 + missileTangentZ * 2.2,
          2.75, Math.atan2(-az, -ax) - 0.32);
        for (let k = 0; k < 4; k++) {
          const fragmentAngle = normalAngle + (k - 1.5) * 0.36;
          this._spawnProjectileTrailStreak(surfaceX, 0.18, surfaceZ,
            0.40 + k * 0.04, 0.10 * scale, (1.9 + k * 0.34) * scale,
            0.62, k % 2 ? '#d09a62' : '#ffe1b2',
            Math.cos(fragmentAngle) * (15 + k * 3), Math.sin(fragmentAngle) * (15 + k * 3));
        }
        break;
      }
      case 'disruption-arcs': {
        // EMP contact forks along the surface in several short, high-frequency branches.
        for (const offset of [-0.78, -0.28, 0.34, 0.82]) {
          const a = normalAngle + offset;
          this._spawnProjectileTrailStreak(pos.x, 0.28, pos.z, profile.life * (0.72 + Math.abs(offset) * 0.25),
            0.10 * scale, (2.6 + Math.abs(offset) * 2.2) * scale, 0.78,
            offset < 0 ? profile.coreColor : materialColor, Math.cos(a) * 20, Math.sin(a) * 20);
        }
        this._impactParticleCone(pos.x, pos.z, normalAngle, 1.3, 18, 36, profile.fragmentCount * burst, 0.20, 1.0, '#ffffff', materialColor, 3.8);
        break;
      }
      case 'sustained-contact': {
        this._spawnProjectileTrailStreak(surfaceX, 0.26, surfaceZ,
          profile.life * 2.0, 0.34 * scale, 5.4 * scale, 0.96, materialColor, 0, 0, nx, nz);
        const beamTangentX = -nz;
        const beamTangentZ = nx;
        for (let k = 0; k < 3; k++) {
          const side = k - 1;
          const scintillationAngle = normalAngle + side * 0.48;
          this._spawnProjectileTrailStreak(
            surfaceX + beamTangentX * side * 0.18 * scale, 0.24,
            surfaceZ + beamTangentZ * side * 0.18 * scale,
            0.15 + k * 0.02, 0.10 * scale, (2.1 + Math.abs(side) * 0.65) * scale,
            0.70, k === 1 ? profile.coreColor : materialColor,
            Math.cos(scintillationAngle) * (8 + Math.abs(side) * 5),
            Math.sin(scintillationAngle) * (8 + Math.abs(side) * 5));
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 0.52, 16, 28,
          Math.max(1, Math.round(profile.fragmentCount * burst * 0.5)), profile.life * 1.8,
          0.65, profile.coreColor, materialColor, 3.4);
        break;
      }
      default: {
        // Kinetic/autocannon: an attached incidence gouge and tight cool-metal fragment fan.
        this._spawnProjectileTrailStreak(surfaceX, 0.2, surfaceZ,
          0.26, 0.30 * scale, 4.2 * scale, 0.96, profile.coreColor, 0, 0, ax, az);
        for (let k = 0; k < 4; k++) {
          const fragmentAngle = normalAngle + (k - 1.5) * 0.24;
          this._spawnProjectileTrailStreak(surfaceX, 0.16, surfaceZ,
            0.28 + k * 0.03, 0.10 * scale, (1.8 + k * 0.34) * scale,
            0.68, k % 2 ? '#9c9388' : '#ffe0ad',
            Math.cos(fragmentAngle) * (15 + k * 4), Math.sin(fragmentAngle) * (15 + k * 4));
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 1.05, 28, 74,
          Math.round(profile.fragmentCount * burst * 0.7), profile.life * 1.5, 1.05,
          '#fff2d4', '#5b5650', 2.8);
        break;
      }
    }

    // Shield material bends a pair of streaks along the surface; it never adds a full impact ring.
    if (hitShield) {
      const tx = -nz;
      const tz = nx;
      this._spawnProjectileTrailStreak(pos.x, 0.18, pos.z, 0.18, 0.21 * scale, 3.4 * scale,
        0.48, shieldColor, 0, 0, tx, tz);
      this._spawnProjectileTrailStreak(pos.x, 0.18, pos.z, 0.18, 0.19 * scale, 2.7 * scale,
        0.38, shieldColor, 0, 0, -tx, -tz);
    }
    this._flashLight({ x: pos.x, z: pos.z }, hitShield ? shieldColor : profile.accentColor,
      profile.lightPeak * scale, 13, 110 * scale);
  },

  _impactParticleCone(x, z, base, spread, speedMin, speedMax, count, life, size, color0, color1, drag) {
    this._c0.set(color0);
    this._c1.set(color1);
    const n = Math.max(1, count | 0);
    for (let k = 0; k < n; k++) {
      const a = base + (Math.random() - 0.5) * spread;
      const speed = speedMin + Math.random() * Math.max(0, speedMax - speedMin);
      this._spawnParticle(x, z, Math.cos(a) * speed, Math.sin(a) * speed,
        life * (0.78 + Math.random() * 0.44), size * (0.72 + Math.random() * 0.48), 0,
        this._c0, this._c1, drag, 0, 0);
    }
  },

  _onDamage(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, p.targetId);
    if (!pos) return;
    const tgt = this._ent(p.targetId);
    const fid = (tgt && tgt.factionId) || p.factionId || null;
    const impactProfile = resolveImpactPresentationProfile(p && p.weaponId, p);
    let nx = p && p.normal && Number(p.normal.x);
    let nz = p && p.normal && Number(p.normal.z);
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-6) {
      const approach = p && p.approach;
      nx = approach && Number.isFinite(approach.x) ? -approach.x : 1;
      nz = approach && Number.isFinite(approach.z) ? -approach.z : 0;
    }
    const normalLength = Math.hypot(nx, nz) || 1;
    nx /= normalLength;
    nz /= normalLength;
    const normalAngle = Math.atan2(nz, nx);
    if (impactProfile.family === 'beam') {
      if (this._combatBeams) this._combatBeams.retarget(p, this._t);
      const cueKey = `${String(p.attackerId)}:${String(p.targetId)}:${String(p.weaponId)}`;
      const now = Number(this.state && this.state.simTime) || this._t;
      if (!p.brokeShield && now < (this._beamDamageCueNext.get(cueKey) || 0)) return;
      this._beamDamageCueNext.set(cueKey, now + 0.08);
    }
    // NOTE: on combat:damage, `p.type` is the DAMAGE type (kinetic/energy/…), not a shield flag — so
    // the shield branch keys off `shieldAbsorbed` (authoritative: true when any shield HP absorbed
    // damage this hit) plus `brokeShield` (shield HP just hit zero). Both trigger shield VFX.
    if (p.shieldAbsorbed || p.brokeShield) {
      this._emitJuiceCue('combat.damage.shield', p, p.brokeShield ? 2 : 1);
      const col = this._shieldColor(fid);
      const r = (tgt && tgt.radius) || 8;
      const cx = tgt ? tgt.pos.x : pos.x, cz = tgt ? tgt.pos.z : pos.z;

      if (p.brokeShield) {
        // Shield break: five fixed tangent tears crawl around the shell. No screen-facing annulus.
        this._flashLight({ x: cx, z: cz }, '#39d0ff', 7.2, 9, 240);
        this._c0.set(col); this._c1.set('#102040');
        const bn = Math.max(8, Math.round(14 * (this._burst || 1)));
        for (let k = 0; k < bn; k++) {
          const a = normalAngle + (Math.random() - 0.5) * 2.5;
          const dist = r * (0.78 + Math.random() * 0.3);
          const sp = 24 + Math.random() * 34;
          this._spawnParticle(cx + Math.cos(a) * dist, cz + Math.sin(a) * dist,
            Math.cos(a) * sp, Math.sin(a) * sp, 0.36, 2.0, 0.0, this._c0, this._c1, 2.0, 0, 0);
        }
        for (let k = 0; k < 5; k++) {
          const a = normalAngle - 1.25 + k * 0.62 + Math.random() * 0.16;
          const tx = -Math.sin(a);
          const tz = Math.cos(a);
          this._spawnProjectileTrailStreak(cx + Math.cos(a) * r * 0.75, 0.22, cz + Math.sin(a) * r * 0.75,
            0.28, 0.12, r * (0.45 + Math.random() * 0.28), 0.58, col,
            0, 0, tx, tz);
        }
      } else {
        // Ordinary shield receipt reinforces only the local tangent scar already established by
        // the weapon-family contact. It cannot become another generic circular flash.
        this._spawnProjectileTrailStreak(pos.x, 0.2, pos.z, 0.14, 0.20,
          Math.min(4.2, r * 0.55), 0.40, col, 0, 0, -nz, nx);
        this._flashLight({ x: pos.x, z: pos.z }, col, 2.8, 11, 110);
      }
    }
    if (p.armorHit) {
      this._emitJuiceCue('combat.damage.armor', p, 1);
      // Material response is a tight, cool-metal reflected fan. Weapon color remains in the
      // preceding contact event instead of recoloring every hull into the same orange spray.
      const count = Math.max(5, Math.min(10, Math.round(8 * (this._burst || 1))));
      this._impactParticleCone(pos.x, pos.z, normalAngle, 0.82, 24, 56, count,
        0.23, 0.82, '#f6ead2', '#514c46', 2.8);
      this._spawnProjectileTrailStreak(pos.x, 0.16, pos.z, 0.17, 0.18, 2.2,
        0.44, '#b7aa96', 0, 0, nx, nz);
      this._flashLight({ x: pos.x, z: pos.z }, '#d8c39e', 1.6, 13, 72);
    }
    if (p.hullHit) {
      this._emitJuiceCue('combat.damage.hull', p, 1);
      // Hull penetration vents one directional smoke tongue and a few hot internal fragments.
      this._spawnSprite(SPR_PUFF, pos.x + nx * 0.3, 0, pos.z + nz * 0.3,
        0.58, 1.2, 3.8, 0.48, 0.0, '#292521', nx * 5, nz * 5,
        2.2, normalAngle);
      this._spawnSprite(SPR_COMBUSTION, pos.x, 0.14, pos.z, 0.22, 0.55, 1.35,
        0.42, 0, impactProfile.family === 'plasma' ? '#ff6a24' : '#d87332',
        nx * 2, nz * 2, 1.7, normalAngle);
      this._impactParticleCone(pos.x, pos.z, normalAngle, 0.95, 9, 24,
        Math.max(3, Math.round(5 * (this._burst || 1))), 0.48, 0.78,
        '#ffb36a', '#3a1710', 1.2);
      this._flashLight({ x: pos.x, z: pos.z }, '#ff7040', 2.2, 11, 90);
    }
    // player hits get a camera kick — STRONGER, proportional to damage
    if (p.isPlayer && (p.amount || 0) > 0) this.bus.emit('camera:shake', { amount: Math.min(0.5, 0.08 + (p.amount || 0) * 0.015) });
  },

  _impactSparks(x, z, dir, color, n) {
    this._c0.set('#ffffff'); this._c1.set(color);
    const base = dir ? Math.atan2(dir.z, dir.x) + Math.PI : Math.random() * Math.PI * 2; // reflect-ish
    const count = Math.max(5, Math.round(n * (this._burst || 1)));
    // primary spark spray — tighter cone along the reflection direction, fast and bright
    for (let k = 0; k < count; k++) {
      const a = base + (Math.random() - 0.5) * 1.4;
      const sp = 22 + Math.random() * 40;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.15, 2.0, 0.0, this._c0, this._c1, 2.8, 0, 0);
    }
    // secondary slower sparks — wider spread, dimmer, for lingering debris feel
    this._c0.set('#ffc060'); this._c1.set('#401008');
    const slow = Math.max(2, Math.round(count * 0.35));
    for (let k = 0; k < slow; k++) {
      const a = base + (Math.random() - 0.5) * 2.4;
      const sp = 8 + Math.random() * 15;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.25, 1.5, 0.3, this._c0, this._c1, 1.5, 0, 0);
    }
    // hot impact flash — BIGGER white core punch
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.08, 2.8, 5.0, 1.0, 0.0, '#ffffff', 0, 0);
    // coloured outer halo — larger and longer
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.15, 4.0, 7.0, 0.65, 0.0, color, 0, 0);
    // impact light flash
    this._flashLight({ x, z }, color, 2.5, 14, 100);
  },

  _onPresentationCue(p) {
    if (!this._scene || !p) return;
    // Cruise owns its directional travel grammar directly below. Keep the legacy cue receipt for
    // audio/contracts, but do not fan it back into the generic presentation particle family.
    if (typeof p.id === 'string' && p.id.startsWith('cruise.')) return;
    const particlesRequested = budgetInt(p.particles);
    const lightsRequested = budgetInt(p.lights);
    if (particlesRequested <= 0 && lightsRequested <= 0) return;
    const pos = this._presentationPos(p);
    if (!pos) return;

    const style = this._presentationStyle(p);
    const radius = this._presentationRadius(p);
    const angle = this._dirAngle(p.direction, p.sourceId);
    const admissionPriority = normalizeVfxAdmissionPriority(p.admissionPriority);
    const particlesSpawned = particlesRequested > 0
      ? this._spawnPresentationParticles(
        p, pos, style, particlesRequested, angle, radius, admissionPriority,
      )
      : 0;
    if (particlesRequested > 0) {
      this._spawnPresentationSprite(p, pos, style, radius, admissionPriority);
    }

    const maxLights = Math.min(lightsRequested, this._LIGHT_NPOOL || 0);
    let lightsActivated = 0;
    for (let i = 0; i < maxLights; i++) {
      const off = i - (maxLights - 1) * 0.5;
      const dx = Math.cos(angle + Math.PI / 2) * off * radius * 0.35;
      const dz = Math.sin(angle + Math.PI / 2) * off * radius * 0.35;
      if (this._flashLight(
        { x: pos.x + dx, z: pos.z + dz },
        style.lightColor || style.color0,
        style.lightPeak,
        style.lightDecay,
        style.lightDistance,
        admissionPriority,
      )) {
        lightsActivated++;
      }
    }

    this._presentationCueCount++;
    this._presentationParticleCount += particlesSpawned;
    this._presentationLightCount += lightsActivated;
    this._lastPresentationCue = {
      id: p.id || null,
      lane: p.lane || null,
      material: p.material || 'unknown',
      particlesRequested,
      particlesSpawned,
      lightsRequested,
      lightsActivated,
      flashReduced: !!p.flashReduced,
      admissionPriority,
    };
  },

  _onDirectMiningPresentationCue(p) {
    const id = p && p.id || '';
    if (!id.startsWith('mining.')) return;
    const tags = Array.isArray(p.tags) ? p.tags : [];
    if (id === 'mining.seam.quality') {
      if (tags.includes('on_seam')) {
        this._miningSeamPulseId = p.targetId;
        this._miningSeamPulseUntil = (this.state && this.state.simTime || 0) + 0.6;
      } else if (this._miningSeamPulseId === p.targetId) {
        this._miningSeamPulseId = null;
      }
      return;
    }
    if (!this._scene) return;
    const pos = this._posFrom(p, p.targetId);
    if (!pos) return;
    const target = this._ent(p.targetId);
    const radius = Math.max(4, target && target.radius || 8);
    if (id === 'mining.fracture.anticipation') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.5, radius * 0.45, radius * 1.12, 0.62, 0, '#ffb35c', 0, 0);
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.78, radius * 0.3, radius * 0.86, 0.38, 0, '#d7e6ff', 0, 0);
      return;
    }
    if (id === 'mining.fracture.released') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.42, radius * 0.7, radius * 2.6, 0.72, 0, '#ffb35c', 0, 0);
      this._spawnSprite(SPR_PUFF, pos.x, 0, pos.z, 0.85, radius * 0.65, radius * 2.1, 0.34, 0, '#d7e6ff', 0, 0);
      return;
    }
    if (id === 'mining.rich_core.exposed') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.7, radius * 0.3, radius * 1.5, 0.82, 0, '#8d66ff', 0, 0);
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 1.0, radius * 0.18, radius * 1.05, 0.58, 0, '#d7e6ff', 0, 0);
      this._flashLight({ x: pos.x, z: pos.z }, '#8d66ff', 2.8, 8, 150);
      return;
    }
    if (id === 'mining.rich_core.charge') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.75, radius * 0.78, radius * 0.34, 0.62, 0, '#d7e6ff', 0, 0);
      return;
    }
    if (id === 'mining.rich_core.completed') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.58, radius * 0.25, radius * 2.2, 0.9, 0, '#8d66ff', 0, 0);
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.82, radius * 0.18, radius * 1.55, 0.7, 0, '#d7e6ff', 0, 0);
      this._c0.set('#d7e6ff'); this._c1.set('#8d66ff');
      const count = Math.max(6, Math.min(12, Math.round(8 * (this._burst || 1))));
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 7 + Math.random() * 12;
        this._spawnParticle(pos.x, pos.z, Math.cos(a) * speed, Math.sin(a) * speed,
          0.65 + Math.random() * 0.3, 3.0, 0.45, this._c0, this._c1, 1.6, 0, 3 + Math.random() * 4);
      }
      this._flashLight({ x: pos.x, z: pos.z }, '#d7e6ff', 3.8, 7, 180);
      return;
    }
    if (id === 'mining.rich_core.fizzle') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.55, radius * 1.1, radius * 0.2, 0.54, 0, '#ff5c5c', 0, 0);
      return;
    }
    if (id === 'mining.chunk.tether_required') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.82, radius * 0.9, radius * 1.35, 0.58, 0, '#ffb35c', 0, 0);
    }
  },

  _onDirectTravelPresentationCue(p) {
    const id = p && p.id || '';
    if (!id.startsWith('travel.') || id.startsWith('travel.cruise.')) return;
    if (!this._scene) return;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    const pos = p.position || this._posFrom(p, p.targetId ?? p.sourceId) || (player && player.pos);
    if (!pos) return;
    const reduced = this._isReduced();
    const payload = p.payload || {};
    const heading = Number.isFinite(payload.heading)
      ? payload.heading
      : (player && Number.isFinite(player.rot) ? player.rot : 0);
    const supplied = p.direction;
    const dx = supplied && Number.isFinite(supplied.x) ? supplied.x : Math.cos(heading);
    const dz = supplied && Number.isFinite(supplied.z) ? supplied.z : Math.sin(heading);
    const palette = this._travelPalette(p.tags);
    const critical = id === 'travel.interdiction.triggered' || id === 'travel.jump.failed';
    if (reduced && !critical) {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.48, 4, 11, 0.24, 0, palette.primary, dx * 2, dz * 2);
      return;
    }

    if (id === 'travel.gate.approach') {
      for (let i = 0; i < 3; i++) {
        const offset = 10 + i * 9;
        this._spawnSprite(SPR_RING, pos.x - dx * offset, 0, pos.z - dz * offset,
          0.58 + i * 0.12, 4 + i, 9 + i * 2, 0.5 - i * 0.1, 0, i === 0 ? '#39d0ff' : '#d7e6ff', dx * 5, dz * 5);
      }
      return;
    }
    if (id === 'travel.corridor.continuity') {
      for (let i = -1; i <= 1; i++) {
        const along = i * 10;
        this._spawnSprite(SPR_RING, pos.x + dx * along, 0, pos.z + dz * along,
          0.55 + (i + 1) * 0.08, 3.5, 7.5, 0.2 + (i + 1) * 0.08, 0, palette.primary, dx * 5, dz * 5);
      }
      return;
    }
    if (id === 'travel.jump.aligning') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.72, 16, 6, 0.55, 0, '#39d0ff', 0, 0);
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.92, 24, 9, 0.3, 0, '#d7e6ff', 0, 0);
      return;
    }
    if (id === 'travel.jump.commit_window') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.48, 13, 5, 0.68, 0, '#ffb35c', dx * 4, dz * 4);
      return;
    }
    if (id === 'travel.jump.committed') {
      this._spawnTravelVectorWake(pos, dx, dz, 24, '#d7e6ff', '#39d0ff', 78, 1.15);
      this._spawnSprite(SPR_RING, pos.x + dx * 5, 0, pos.z + dz * 5, 1.18, 4, 24, 0.58, 0, '#39d0ff', dx * 18, dz * 18);
      return;
    }
    if (id === 'travel.transition.continuity') {
      this._spawnSprite(SPR_RING, pos.x - dx * 8, 0, pos.z - dz * 8, 1.18, 14, 3, 0.38, 0, '#d7e6ff', dx * 22, dz * 22);
      return;
    }
    if (id === 'travel.arrival.oriented') {
      this._spawnTravelVectorWake(pos, dx, dz, reduced ? 5 : 12, palette.secondary, palette.primary, 38, 0.62);
      this._spawnSprite(SPR_RING, pos.x + dx * 8, 0, pos.z + dz * 8, 0.68, 4, 16, 0.52, 0, palette.primary, dx * 6, dz * 6);
      return;
    }
    if (id === 'travel.arrival.sector_identity') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.9, 7, 24, 0.38, 0, palette.primary, 0, 0);
      return;
    }
    if (id === 'travel.discovery.mapped') {
      // Discovery already owns the map/toast/postcard receipt. Keep this semantic cue visual-silent
      // so arrival remains one readable world-space beat instead of another concentric ring.
      return;
    }
    if (id === 'travel.interdiction.triggered') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.6, 26, 8, reduced ? 0.44 : 0.72, 0, '#ff5c5c', 0, 0);
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.82, 34, 12, reduced ? 0.26 : 0.42, 0, '#ffb35c', 0, 0);
      this._spawnTravelVectorWake(pos, -dx, -dz, reduced ? 4 : 10, '#ffb35c', '#ff5c5c', 34, 0.54);
      return;
    }
    if (id === 'travel.jump.failed') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.58, 14, 4, reduced ? 0.4 : 0.62, 0, '#ff5c5c', 0, 0);
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.8, 20, 7, reduced ? 0.2 : 0.3, 0, '#ffb35c', 0, 0);
      return;
    }
    if (id === 'travel.recovery.resumed') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.72, 4, 17, 0.44, 0, '#39d0ff', dx * 3, dz * 3);
      return;
    }
    if (id === 'travel.aftermath.contested') {
      // The immediately preceding interdiction receipt owns the danger compression rings.
      return;
    }
    if (id === 'travel.aftermath.clear') {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.82, 5, 20, 0.32, 0, palette.secondary, 0, 0);
    }
  },

  _travelPalette(tags) {
    const list = Array.isArray(tags) ? tags : [];
    if (list.includes('palette_belt')) return { primary: '#ffb35c', secondary: '#d7e6ff' };
    if (list.includes('palette_fringe')) return { primary: '#ff5c5c', secondary: '#ffb35c' };
    if (list.includes('palette_anomaly')) return { primary: '#8d66ff', secondary: '#54ffb0' };
    return { primary: '#39d0ff', secondary: '#d7e6ff' };
  },

  _spawnTravelVectorWake(pos, dx, dz, count, color0, color1, speed, life) {
    this._c0.set(color0);
    this._c1.set(color1);
    const nx = -dz;
    const nz = dx;
    for (let i = 0; i < count; i++) {
      const row = i % 5;
      const lateral = (row - 2) * 1.7;
      const behind = 4 + Math.floor(i / 5) * 3.2;
      const x = pos.x - dx * behind + nx * lateral;
      const z = pos.z - dz * behind + nz * lateral;
      const stride = speed * (0.72 + row * 0.06);
      this._spawnParticle(x, z, dx * stride, dz * stride, life, 2.1, 0, this._c0, this._c1, 0.7, 0, 0);
    }
  },

  _presentationPos(p) {
    const pos = this._posFrom(p, p.targetId ?? p.sourceId);
    if (pos) return pos;
    const player = this._ent(this.state && this.state.playerId);
    return player ? player.pos : null;
  },

  _presentationRadius(p) {
    const e = this._ent(p && p.targetId);
    const base = (e && e.radius) || 8;
    const mag = Math.max(1, Math.min(6, Number(p && p.magnitude) || 1));
    return Math.max(4, base * (0.7 + Math.log2(mag + 1) * 0.18));
  },

  _spawnPresentationSprite(p, pos, style, radius, admissionPriority) {
    const reduced = !!(p && p.flashReduced);
    const kind = reduced ? SPR_RING : style.spriteKind;
    const opacity = reduced ? Math.min(style.spriteOpacity, 0.42) : style.spriteOpacity;
    this._spawnSprite(
      kind, pos.x, 0, pos.z, style.spriteLife,
      radius * style.spriteSize0, radius * style.spriteSize1,
      opacity, 0.0, style.color0, 0, 0, 1, null, admissionPriority,
    );
    if (!reduced && style.echoRing) {
      this._spawnSprite(
        SPR_RING, pos.x, 0, pos.z, style.spriteLife * 1.25,
        radius * style.spriteSize0 * 0.7, radius * style.spriteSize1 * 1.35,
        opacity * 0.55, 0.0, style.color1, 0, 0, 1, null, admissionPriority,
      );
    }
  },

  _spawnPresentationParticles(p, pos, style, requested, angle, radius, admissionPriority) {
    const burst = this._burst || 1;
    const count = Math.max(1, Math.min(requested, Math.round(requested * burst)));
    this._c0.set(style.color0);
    this._c1.set(style.color1);
    const radial = style.radial || (p && p.id && (p.id.includes('shield') || p.id.includes('signal') || p.id.includes('branch')));
    let spawned = 0;
    for (let k = 0; k < count; k++) {
      const a = radial ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * style.spread;
      const sp = style.speed0 + Math.random() * style.speedJitter;
      const dist = radial ? Math.random() * radius * 0.45 : (Math.random() - 0.5) * radius * 0.35;
      const sx = pos.x + Math.cos(a) * dist;
      const sz = pos.z + Math.sin(a) * dist;
      const slot = this._spawnParticle(
        sx, sz,
        Math.cos(a) * sp, Math.sin(a) * sp,
        style.life0 + Math.random() * style.lifeJitter,
        style.size0, style.size1,
        this._c0, this._c1,
        style.drag,
        style.y, style.vy,
        0, 0, admissionPriority,
      );
      if (slot != null) spawned++;
    }
    return spawned;
  },

  _presentationStyle(p) {
    const id = (p && p.id) || '';
    const lane = (p && p.lane) || '';
    if (id === 'combat.near_miss' || lane.includes('combat_near_miss')) {
      return presentationStyle('#d7e6ff', '#ffb35c', SPR_FLASH, {
        spread: 0.18,
        lightPeak: 0,
        lightDistance: 0,
        speed0: 52,
        speedJitter: 20,
        life0: 0.18,
        lifeJitter: 0.08,
        size0: 0.8,
        size1: 0.08,
        spriteLife: 0.12,
        spriteSize0: 0.25,
        spriteSize1: 1.5,
        spriteOpacity: 0.5,
      });
    }
    if (id === 'shield.collapse' || lane.includes('shield')) {
      return presentationStyle('#ffffff', '#66ccff', SPR_FRESNEL, { radial: true, echoRing: true, lightPeak: 6.0, lightDistance: 220, speed0: 24, speedJitter: 44, size0: 2.1 });
    }
    if (id === 'subsystem.disabled' || lane.includes('subsystem')) {
      return presentationStyle('#fff4c0', '#ff8a30', SPR_FLASH, { spread: 1.35, lightPeak: 3.2, lightDistance: 120, speed0: 34, speedJitter: 34, size0: 1.8 });
    }
    if (id === 'tether.break' || lane.includes('tether_break')) {
      return presentationStyle('#ffffff', '#5fe0ff', SPR_RING, { echoRing: true, lightPeak: 5.0, lightDistance: 190, speed0: 46, speedJitter: 58, size0: 2.4 });
    }
    // Massline force cues MUST sit above the generic tether.* catch-all: whip_impact id is
    // `tether.whip_impact` and would otherwise return the mild cyan ring instead of neon force.
    // UVP neon pass: force cues scale above hull-neutral via resolveForceNeonScale.
    if (id === 'tether.whip_impact' || lane.includes('whip_impact') || (lane.includes('whip') && !lane.includes('tether_break'))) {
      const neon = resolveForceNeonScale('whip', this._forceNeonMetrics({
        severity: p && p.magnitude != null ? Number(p.magnitude) / 100 : 0.6,
        rating: p && (p.rating || (Array.isArray(p.tags) ? p.tags.find((t) => t === 'crushing' || t === 'solid' || t === 'glance') : null)),
      }));
      return presentationStyle('#ffffff', '#ff8a40', SPR_FLASH, {
        radial: true,
        lightPeak: 3.4 * neon.lightPeak,
        lightDistance: 160 + neon.coreWhite * 50,
        speed0: 48 * neon.particleBoost,
        speedJitter: 52,
        life0: 0.28,
        size0: 1.9 * neon.energy * 0.5,
        size1: 0.12,
        drag: 1.2,
        spriteOpacity: Math.min(1, 0.7 * neon.energy),
        forceNeonKind: 'whip',
        forceNeonEnergy: neon.energy,
        forceNeonLightPeak: neon.lightPeak,
      });
    }
    if (id === 'massline.throw' || lane.includes('massline_throw')) {
      const neon = resolveForceNeonScale('throw', this._forceNeonMetrics());
      return presentationStyle('#fff8e8', '#ffb347', SPR_FLASH, {
        spread: 0.35,
        lightPeak: 4.2 * neon.lightPeak,
        lightDistance: 170 + neon.coreWhite * 40,
        speed0: 58 * neon.particleBoost,
        speedJitter: 44,
        size0: 2.0 * (0.9 + neon.coreWhite * 0.35),
        size1: 0.15,
        spriteOpacity: Math.min(1, 0.72 * neon.energy),
        forceNeonKind: 'throw',
        forceNeonEnergy: neon.energy,
        forceNeonLightPeak: neon.lightPeak,
      });
    }
    if (id === 'ship.tumble' || lane.includes('massline_tumble') || id === 'ship.tumble.recover') {
      const neon = resolveForceNeonScale('tumble', this._forceNeonMetrics({
        rcsThrash: lane.includes('recover') ? 0.2 : 0.7,
      }));
      return presentationStyle('#ffe2d6', '#ff5a48', SPR_PUFF, {
        radial: true,
        lightPeak: 2.6 * neon.lightPeak,
        lightDistance: 120,
        speed0: 22 * neon.particleBoost,
        speedJitter: 40,
        life0: 0.5,
        size0: 1.6 * neon.energy * 0.55,
        size1: 0.25,
        drag: 1.4,
        forceNeonKind: 'tumble',
        forceNeonEnergy: neon.energy,
        forceNeonLightPeak: neon.lightPeak,
      });
    }
    if (id.startsWith('tether.') || lane.includes('tether')) {
      return presentationStyle('#dffcff', '#2bb7ff', SPR_RING, { lightPeak: 3.0, lightDistance: 140, speed0: 28, speedJitter: 30, size0: 1.8 });
    }
    // SF-10 vector-mine detonation — a fast cool-blue radial SHOVE (an impulse front driven outward),
    // deliberately a punch-flash burst rather than a primary ring (graphics-checkpoint reject list),
    // and distinct from the impulse charge's rings and the red tumble puff.
    if (id === 'combat.vectorMine.detonate') {
      return presentationStyle('#e6f2ff', '#5aa0ff', SPR_FLASH, { radial: true, lightPeak: 3.2, lightDistance: 170, speed0: 52, speedJitter: 40, life0: 0.32, size0: 1.8, size1: 0.2, drag: 1.1 });
    }
    // SF-10 RCS-disruptor tell — small, fast ion-blue sparks skittering off the hull (attitude
    // drift), a punch-flash spark spray distinct from both the tumble puff and the mine shove.
    if (id === 'ship.rcsDisrupt') {
      return presentationStyle('#d8f4ff', '#5f8cff', SPR_FLASH, { radial: true, lightPeak: 1.8, lightDistance: 90, speed0: 30, speedJitter: 46, life0: 0.3, size0: 0.9, size1: 0.1, drag: 1.6 });
    }
    if (lane.includes('pod_beacon') || id.includes('objective')) {
      return presentationStyle('#fff0a8', '#ffcc44', SPR_RING, { radial: true, echoRing: true, lightPeak: 3.4, lightDistance: 160, speed0: 18, speedJitter: 22, life0: 0.45 });
    }
    if (lane.includes('comms')) {
      return presentationStyle('#e6fbff', '#5fd7ff', SPR_PUFF, { radial: true, lightPeak: 0, lightDistance: 0, speed0: 10, speedJitter: 18, life0: 0.55, size0: 1.7, size1: 0.2, drag: 0.9 });
    }
    if (lane.includes('branch') || id.includes('branch')) {
      return presentationStyle('#fff8d8', '#f5d06f', SPR_RING, { radial: true, echoRing: true, lightPeak: 4.0, lightDistance: 180, speed0: 18, speedJitter: 32, life0: 0.5 });
    }
    // PQ-012 field deploy/collapse event beats (one-shot punch, NOT the continuous flow — that is
    // the pooled advected particles in _updateFieldFlow). Distinct per kind; the boundary/direction
    // read lives in the continuous flow, so these are brief state-change pulses only.
    if (lane === 'field' || id.startsWith('field.')) {
      if (id.startsWith('field.repulsor')) {
        return presentationStyle('#fff2d0', '#ffb35c', SPR_FLASH, { radial: true, lightPeak: 2.6, lightDistance: 150, speed0: 62, speedJitter: 40, life0: 0.3, size0: 1.8, size1: 0.2, drag: 1.2 });
      }
      if (id.startsWith('field.cone')) {
        return presentationStyle('#eaffff', '#39d0ff', SPR_FLASH, { spread: 0.4, lightPeak: 2.0, lightDistance: 130, speed0: 54, speedJitter: 30, life0: 0.28, size0: 1.5, size1: 0.15 });
      }
      // well — cool inward cyan sink pulse
      return presentationStyle('#a6f0ff', '#39d0ff', SPR_FLASH, { radial: true, lightPeak: 2.8, lightDistance: 150, speed0: 40, speedJitter: 46, life0: 0.32, size0: 1.6, size1: 0.2, drag: 1.1 });
    }
    return presentationStyle('#ffffff', '#b060ff', SPR_RING, { radial: true, lightPeak: 3.2, lightDistance: 150, speed0: 18, speedJitter: 32 });
  },

  _collisionPairKey(aId, bId) {
    const a = String(aId);
    const b = String(bId);
    return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  },

  _boundedCollisionTickWrite(map, key, tick) {
    if (!map) return;
    if (!map.has(key) && map.size >= COLLISION_PRESENTATION_CACHE_CAP) {
      const oldest = map.keys().next();
      if (!oldest.done) map.delete(oldest.value);
    }
    map.set(key, tick);
  },

  _admitLowCollisionContact(p) {
    if (!this._collisionContactTicks) this._collisionContactTicks = new Map();
    const tick = Number.isFinite(p && p.tick)
      ? Math.max(0, Math.trunc(p.tick))
      : Math.max(0, Math.trunc(this.state && this.state.tick || 0));
    const key = this._collisionPairKey(p && p.aId, p && p.bId);
    const previous = this._collisionContactTicks.get(key);
    if (Number.isFinite(previous) && tick - previous < CONTACT_SPARK_COOLDOWN_TICKS) return false;
    this._boundedCollisionTickWrite(this._collisionContactTicks, key, tick);
    return true;
  },

  _rememberMediumCollision(p) {
    if (!this._collisionMediumTicks) this._collisionMediumTicks = new Map();
    const tick = Number.isFinite(p && p.tick)
      ? Math.max(0, Math.trunc(p.tick))
      : Math.max(0, Math.trunc(this.state && this.state.tick || 0));
    const key = this._collisionPairKey(p && p.targetId, p && p.otherId);
    this._boundedCollisionTickWrite(this._collisionMediumTicks, key, tick);
  },

  _consumeMediumCollision(p) {
    if (!this._collisionMediumTicks) return false;
    const tick = Number.isFinite(p && p.tick)
      ? Math.max(0, Math.trunc(p.tick))
      : Math.max(0, Math.trunc(this.state && this.state.tick || 0));
    const key = this._collisionPairKey(p && p.targetId, p && p.otherId);
    if (this._collisionMediumTicks.get(key) !== tick) return false;
    this._collisionMediumTicks.delete(key);
    return true;
  },

  _resetCollisionPresentation() {
    if (this._collisionContactTicks) this._collisionContactTicks.clear();
    if (this._collisionMediumTicks) this._collisionMediumTicks.clear();
  },

  _collisionContactAxis(p) {
    let nx = Number(p && p.normal && p.normal.x);
    let nz = Number(p && p.normal && p.normal.z);
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-8) {
      const a = this.state && this.state.entities && this.state.entities.get(p && p.aId);
      const b = this.state && this.state.entities && this.state.entities.get(p && p.bId);
      nx = Number(a && a.pos && a.pos.x) - Number(b && b.pos && b.pos.x);
      nz = Number(a && a.pos && a.pos.z) - Number(b && b.pos && b.pos.z);
    }
    const length = Math.hypot(nx, nz);
    if (!(length > 1e-8)) return 0;
    return Math.atan2(nz / length, nx / length);
  },

  _collisionPatternSerial(p) {
    let hash = Math.trunc(Number(p && p.tick) || Number(this.state && this.state.tick) || 0);
    for (let channel = 0; channel < 2; channel++) {
      const value = channel === 0
        ? p && (p.aId ?? p.targetId)
        : p && (p.bId ?? p.otherId);
      const text = String(value);
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    }
    return hash | 0;
  },

  _emitLowCollisionContact(p) {
    if (!this._scene || !p || !p.pos) return false;
    const accessibility = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    const reduced = accessibility.flashOpacityScale < 1;
    const base = this._collisionContactAxis(p);
    const nx = Math.cos(base);
    const nz = Math.sin(base);
    const tx = -nz;
    const tz = nx;
    const serial = this._collisionPatternSerial(p);
    const count = reduced ? 2 : 4;
    this._c0.set('#fff4dc');
    this._c1.set('#8b6b4b');
    for (let k = 0; k < count; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const angle = base + Math.PI + side * (0.22 + Math.floor(k / 2) * 0.18)
        + explosionPatternSigned(serial, 'terrain-spall', k, 21) * 0.06;
      const speed = (reduced ? 9 : 14) + explosionPattern01(serial, 'terrain-spall', k, 22) * (reduced ? 5 : 12);
      this._spawnParticle(p.pos.x, p.pos.z, Math.cos(angle) * speed, Math.sin(angle) * speed,
        reduced ? 0.20 : 0.30, reduced ? 0.65 : 0.9, 0,
        this._c0, this._c1, 2.6, 0, 0, angle, reduced ? 1.8 : 2.6);
    }
    // A short tangent scar and one local dust tongue keep the contact direction readable without
    // escalating a routine solver contact into damage, control, or destruction presentation.
    this._spawnProjectileTrailStreak(p.pos.x, 0.16, p.pos.z,
      reduced ? 0.20 : 0.28, 0.05, reduced ? 1.1 : 1.8,
      (reduced ? 0.24 : 0.46) * accessibility.flashOpacityScale,
      '#ead6b8', 0, 0, tx, tz);
    this._spawnSprite(SPR_PUFF, p.pos.x - nx * 0.12, 0.04, p.pos.z - nz * 0.12,
      reduced ? 0.36 : 0.52, 0.45, reduced ? 1.1 : 1.8,
      (reduced ? 0.12 : 0.22) * accessibility.flashOpacityScale, 0,
      '#786a5b', nx * 1.2, nz * 1.2, 2.2, base);
    return true;
  },

  _onPhysicsImpact(p) {
    // Shipping SG-02/Rapier publishes physics:impact but not the legacy `collision` companion.
    // Custom physics publishes both, so it deliberately stays on _onCollision to avoid double VFX.
    if (!p || !p.pos || p.backend !== 'rapier-dynamic' || !this._admitLowCollisionContact(p)) return false;
    return this._emitLowCollisionContact(p);
  },

  _onCollision(p) {
    if (!p || !p.pos || !this._admitLowCollisionContact(p)) return false;
    return this._emitLowCollisionContact(p);
  },

  _onKilled(p) {
    this._emitJuiceCue('combat.damage.kill', p, 2);
    this._queueExplosion(p, this._isCapitalKill(p) ? 'capital' : 'ordinary');
  },

  _isCapitalKill(p) {
    if (!p) return false;
    if (p.capital) return true;
    if ((p.radius || 0) >= 55) return true;
    const cls = String(p.victimClass || p.type || '').toLowerCase();
    return /capital|flagship|cruiser|gunship|battleship|dread/i.test(cls);
  },
  _onDestroyed(p) {
    // entity:destroyed fires for ALL entities (incl. projectiles/pickups). Only blow up things with
    // meaningful size; projectiles/pickups despawn cleanly. entity:killed already handled ships, so
    // here we cover asteroids/wrecks/drones that never emit entity:killed.
    // saveSystem._clearEntities() emits reason:'save_restore' for every live entity before
    // rehydrate — silent despawn only (no explosion/particles/lights). Prevents F9 restore
    // from filling the particle cap and hitching 100–250ms. Real combat/mining/sector destroys
    // omit this reason and still explode.
    if (p && p.reason === 'save_restore') return;
    if (!this._scene) return;
    const t = p.type;
    if (t === 'projectile' || t === 'pickup' || t === 'fx') return;
    if (t === 'ship') return; // ships handled by entity:killed (avoid double explosion)
    this._explode(p, false);
  },

  _queueExplosion(p, classId) {
    if (!this._scene || !this._explosions) return false;
    const presentation = p && p.presentation && typeof p.presentation === 'object'
      ? p.presentation
      : null;
    const pos = presentation && presentation.position
      ? presentation.position
      : this._posFrom(p, p && p.id);
    if (!pos) return false;
    const direction = presentation && Object.hasOwn(presentation, 'direction')
      ? presentation.direction
      : p && (p.direction || p.vel || p.approach) || null;
    const normal = presentation && Object.hasOwn(presentation, 'normal')
      ? presentation.normal
      : p && p.normal || null;
    const targetVelocity = presentation && Object.hasOwn(presentation, 'targetVelocity')
      ? presentation.targetVelocity
      : p && (p.targetVelocity || p.vel) || null;
    const admission = deriveVfxAdmissionMetadata(p || {}, this.state);
    const entry = this._explosions.start({
      classId,
      x: pos.x,
      z: pos.z,
      radius: Math.max(2, Number(p && p.radius) || 6),
      direction,
      normal,
      targetVelocity,
      cause: presentation && presentation.cause || p && p.cause || 'generic',
      sourceType: p && (p.type || p.victimClass) || null,
      priority: admission.admissionPriority,
    });
    return !!entry;
  },

  _emitExplosionPhase(phase, entry) {
    if (entry && entry.cause && entry.cause !== 'generic') {
      this._emitCausalExplosionPhase(phase, entry);
      return;
    }
    const x = entry.x;
    const z = entry.z;
    const r = entry.radius;
    // Radius already carries most of the visual scale. A large extra class multiplier made capital
    // events cover half the gameplay frame with one texture card, so class identity now comes from
    // phase count, spread, duration and debris structure instead of an unchecked size multiplier.
    const isSmall = entry.classId === 'small';
    const classScale = entry.classId === 'capital' ? 1.12 : (isSmall ? 0.90 : 1);
    const scale = classScale * Math.max(0.78, Math.min(1.65, Math.sqrt(r / 8)));
    const burst = this._burst || 1;
    const accessibility = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    const reduced = accessibility.flashOpacityScale < 1;
    const dirAngle = Math.atan2(entry.dirZ, entry.dirX);
    const tangentX = -entry.dirZ;
    const tangentZ = entry.dirX;

    if (phase === 'ignition') {
      // Capital destruction starts in several separated machinery zones and propagates across the
      // source footprint. A single radius-scaled card became a fullscreen soft disc even though its
      // alpha mask was irregular. Ordinary events retain two offset ignition pockets; small events
      // use one compact pocket. Accessibility prunes a zone, but does not change the visual grammar.
      const zoneCount = entry.classId === 'capital' ? (reduced ? 3 : 4)
        : (entry.classId === 'ordinary' ? 2 : 1);
      const zoneSpacing = entry.classId === 'capital' ? 0.25 : 0.13;
      for (let k = 0; k < zoneCount; k++) {
        const centered = k - (zoneCount - 1) * 0.5;
        const along = centered * r * zoneSpacing
          + explosionPatternSigned(entry.serial, phase, k, 0) * r * 0.025;
        const across = explosionPatternSigned(entry.serial, phase, k, 1)
          * r * (entry.classId === 'capital' ? 0.11 : 0.055);
        const px = x + entry.dirX * along + tangentX * across;
        const pz = z + entry.dirZ * along + tangentZ * across;
        const hot = k === Math.floor(zoneCount * 0.5);
        const life = entry.classId === 'capital'
          ? 0.38 + explosionPattern01(entry.serial, phase, k, 2) * 0.12
          : 0.16 + explosionPattern01(entry.serial, phase, k, 2) * 0.06;
        this._spawnSprite(SPR_COMBUSTION, px, 0.25 - k * 0.008, pz, life,
          r * (isSmall ? 0.095 : (hot ? 0.075 : 0.058)) * scale,
          r * (entry.classId === 'capital' ? 0.17 : (isSmall ? 0.30 : 0.22)) * scale,
          isSmall ? 0.82 : (hot ? 0.68 : 0.48), 0,
          hot ? '#fff3d5' : (k % 2 ? '#ff9a3a' : '#ff6a28'),
          entry.dirX * (1.0 + k * 0.35) + tangentX * centered * 0.8,
          entry.dirZ * (1.0 + k * 0.35) + tangentZ * centered * 0.8,
          1.18 + Math.abs(centered) * 0.14,
          dirAngle + explosionPatternSigned(entry.serial, phase, k, 3) * 0.34);
      }
      // Kills spray LIGHT (grammar §9.2). The combustion structure above is deliberately irregular
      // and deliberately not a radial flower — that discipline is about SILHOUETTE and it stays.
      // What was missing is energy: every card above sits between 0.32 and 0.68 opacity on a mid
      // orange, so nothing in a ship's death ever crossed 1.0 in linear HDR and nothing ever fed
      // the bloom bright pass. A destruction read as a cluster of dull orange blobs.
      //
      // These two additions are small, short and near-white. They are the hot core the phase always
      // implied, and because they are compact they add heat without adding coverage.
      const ignitionCore = r * (isSmall ? 0.10 : 0.06) * scale;
      this._spawnSprite(SPR_FLASH, x, 0.30, z,
        entry.classId === 'capital' ? 0.13 : (isSmall && !reduced ? 0.14 : 0.09),
        ignitionCore, ignitionCore * (isSmall ? (reduced ? 3.25 : 5.2) : 2.6),
        reduced ? 0.72 : 1.0, 0.0, '#ffffff',
        entry.dirX * 2, entry.dirZ * 2, isSmall ? 1.8 : 2.25, dirAngle);
      if (isSmall) {
        // A compact body's identity is a hot asymmetric snap and departing fragments. Full motion
        // gets a three-point biased envelope plus one offset combustion lobe so the event survives
        // the ordinary chase camera; reduced mode retains its accepted quieter two-fragment fallback.
        // Neither path borrows the ordinary shock ring.
        const fragmentCount = reduced ? 2 : 3;
        for (let k = 0; k < fragmentCount; k++) {
          const angleOffset = reduced
            ? (k === 0 ? -0.46 : 0.46)
            : (k === 0 ? -0.72 : (k === 1 ? 0.08 : 0.58));
          const a = dirAngle + angleOffset;
          this._spawnProjectileTrailStreak(
            x + Math.cos(a) * r * 0.04, 0.23,
            z + Math.sin(a) * r * 0.04,
            reduced ? 0.30 : 0.38 + k * 0.03,
            (reduced ? 0.09 : 0.11) * scale,
            (reduced ? 2.8 : 4.3 + k * 0.35) * scale,
            reduced ? 0.34 : (k === 1 ? 0.78 : 0.68),
            k === 0 ? '#fff0c0' : '#ff8a38',
            Math.cos(a) * (reduced ? 18 : 22 + k * 2) * scale,
            Math.sin(a) * (reduced ? 18 : 22 + k * 2) * scale,
            Math.cos(a), Math.sin(a));
        }
        if (!reduced) {
          const lobeAngle = dirAngle - 0.34;
          this._spawnSprite(SPR_COMBUSTION,
            x + entry.dirX * r * 0.05 + tangentX * r * 0.10, 0.24,
            z + entry.dirZ * r * 0.05 + tangentZ * r * 0.10,
            0.24, r * 0.055 * scale, r * 0.20 * scale,
            0.68, 0, '#ffb05a',
            Math.cos(lobeAngle) * 4.5, Math.sin(lobeAngle) * 4.5,
            1.34, lobeAngle);
        }
      } else {
        this._spawnSprite(SPR_RING, x, 0.28, z,
          entry.classId === 'capital' ? 0.30 : 0.20,
          r * 0.05 * scale, r * (entry.classId === 'capital' ? 0.55 : 0.40) * scale,
          reduced ? 0.30 : 0.52, 0.0, '#fff0c0', 0, 0);
      }
      this._flashLight({ x, z }, '#fff0c0', (entry.classId === 'capital' ? 12 : 7.5) * scale, 11, 120 + r * 5);
      return;
    }

    if (phase === 'internal' || phase === 'internal-secondary') {
      const side = phase === 'internal' ? -1 : 1;
      const offset = r * (phase === 'internal' ? 0.28 : 0.48) * side;
      const internalColor = phase === 'internal' ? '#ff9a36' : '#e94b24';
      const internalRoll = dirAngle + side * (phase === 'internal' ? 0.42 : 0.62);
      const pocketCount = entry.classId === 'capital' ? (reduced ? 2 : 3) : 2;
      const baseX = x + tangentX * offset + entry.dirX * r * 0.13;
      const baseZ = z + tangentZ * offset + entry.dirZ * r * 0.13;
      for (let k = 0; k < pocketCount; k++) {
        const centered = k - (pocketCount - 1) * 0.5;
        const px = baseX + entry.dirX * centered * r * 0.15
          + tangentX * explosionPatternSigned(entry.serial, phase, k, 0) * r * 0.045;
        const pz = baseZ + entry.dirZ * centered * r * 0.15
          + tangentZ * explosionPatternSigned(entry.serial, phase, k, 0) * r * 0.045;
        const life = entry.classId === 'capital'
          ? 0.52 + explosionPattern01(entry.serial, phase, k, 1) * 0.14
          : 0.26 + explosionPattern01(entry.serial, phase, k, 1) * 0.08;
        this._spawnSprite(SPR_COMBUSTION, px, 0.20 - k * 0.006, pz, life,
          r * (k === 1 ? 0.082 : 0.062) * scale,
          r * (entry.classId === 'capital' ? 0.23 : 0.28) * scale,
          k === 1 ? 0.54 : 0.40, 0, k === 1 ? '#ffd08a' : internalColor,
          tangentX * side * (2.0 + k * 0.7) + entry.dirX * centered,
          tangentZ * side * (2.0 + k * 0.7) + entry.dirZ * centered,
          1.18 + k * 0.11,
          internalRoll + centered * 0.24
            + explosionPatternSigned(entry.serial, phase, k, 2) * 0.18);
      }
      this._impactParticleCone(baseX, baseZ, dirAngle + side * 0.8, 0.86, 8, 25,
        Math.round((reduced ? 3 : 5) * burst * scale), 0.38, 0.42 * scale,
        '#ffe0a0', '#6a1608', 1.5);
      return;
    }

    if (phase === 'breakup') {
      // Capital hulls fail along several structural seams before the main rupture. These short hot
      // cuts and displaced combustion pockets make the progression travel across the source scale
      // instead of jumping from a center flash directly to a radial starburst.
      const seamCount = reduced ? 3 : 5;
      for (let k = 0; k < seamCount; k++) {
        const centered = k - (seamCount - 1) * 0.5;
        const along = centered * r * 0.19;
        const across = explosionPatternSigned(entry.serial, phase, k, 0) * r * 0.19;
        const px = x + entry.dirX * along + tangentX * across;
        const pz = z + entry.dirZ * along + tangentZ * across;
        const seamAngle = dirAngle + centered * 0.13
          + explosionPatternSigned(entry.serial, phase, k, 1) * 0.22;
        this._spawnProjectileTrailStreak(px, 0.25, pz,
          0.42 + explosionPattern01(entry.serial, phase, k, 2) * 0.22,
          r * 0.012 * scale, r * (0.23 + explosionPattern01(entry.serial, phase, k, 3) * 0.15) * scale,
          k === Math.floor(seamCount * 0.5) ? 0.54 : 0.34,
          k % 2 ? '#ff6b2c' : '#ffd39a',
          Math.cos(seamAngle) * (4 + k), Math.sin(seamAngle) * (4 + k),
          Math.cos(seamAngle), Math.sin(seamAngle));
        if (k % 2 === 0) {
          this._spawnSprite(SPR_COMBUSTION, px, 0.20, pz,
            0.48 + explosionPattern01(entry.serial, phase, k, 4) * 0.16,
            r * 0.055 * scale, r * 0.19 * scale, 0.38, 0,
            k === 2 ? '#fff0be' : '#c84524',
            entry.dirX * 2 + tangentX * centered, entry.dirZ * 2 + tangentZ * centered,
            1.34, seamAngle + 0.34);
        }
      }
      return;
    }

    if (phase === 'rupture') {
      // Uneven overlapping combustion volumes form a biased tear, never a radial flower. Thin hot
      // tongues are intentionally limited to one or two forward-biased fragments; the later debris
      // phase owns the wider structural fan.
      const lobeBase = entry.classId === 'capital' ? 9 : (isSmall ? 4 : 6);
      const lobeCount = Math.max(3, Math.round(lobeBase * burst * (reduced ? 0.68 : 1)));
      for (let k = 0; k < lobeCount; k++) {
        const normalized = lobeCount > 1 ? k / (lobeCount - 1) - 0.5 : 0;
        const longitudinal = r * scale * (
          explosionPatternSigned(entry.serial, phase, k, 0)
          * (entry.classId === 'capital' ? 0.16 : 0.12)
          + normalized * 0.08);
        const lateral = r * scale * (normalized * (entry.classId === 'capital' ? 0.28 : 0.22)
          + explosionPatternSigned(entry.serial, phase, k, 1) * 0.05);
        const roll = dirAngle + normalized * 0.22
          + explosionPatternSigned(entry.serial, phase, k, 2) * 0.31;
        const heat = 1 - Math.min(1, Math.abs(normalized) * 2);
        const lobeColor = heat > 0.58 ? '#fff1c4' : (heat > 0.20 ? '#ff8a32' : '#d94720');
        this._spawnSprite(SPR_COMBUSTION,
          x + entry.dirX * longitudinal + tangentX * lateral, 0.22,
          z + entry.dirZ * longitudinal + tangentZ * lateral,
          (entry.classId === 'capital' ? 0.72 : 0.48)
            + explosionPattern01(entry.serial, phase, k, 3) * 0.22,
          r * scale * (0.12 + explosionPattern01(entry.serial, phase, k, 4) * 0.07),
          r * scale * (0.25 + explosionPattern01(entry.serial, phase, k, 5) * 0.15),
          heat > 0.58 ? 0.46 : 0.32, 0,
          lobeColor,
          entry.dirX * (3 + explosionPattern01(entry.serial, phase, k, 6) * 5) * scale
            + tangentX * normalized * 3,
          entry.dirZ * (3 + explosionPattern01(entry.serial, phase, k, 6) * 5) * scale
            + tangentZ * normalized * 3,
          1.08 + explosionPattern01(entry.serial, phase, k, 7) * 0.30, roll);
        const tongueCount = entry.classId === 'capital' ? 2 : 1;
        if (k < tongueCount) {
          const debrisAngle = dirAngle + (k ? 0.42 : -0.28)
            + explosionPatternSigned(entry.serial, phase, k, 8) * 0.12;
          this._spawnProjectileTrailStreak(
            x + Math.cos(debrisAngle) * r * 0.10, 0.24,
            z + Math.sin(debrisAngle) * r * 0.10,
            0.36 + explosionPattern01(entry.serial, phase, k, 9) * 0.16,
            r * 0.012 * scale,
            r * scale * (0.24 + explosionPattern01(entry.serial, phase, k, 10) * 0.14),
            reduced ? 0.20 : 0.34, k % 2 ? '#ff7a2c' : '#ffd08a',
            Math.cos(debrisAngle) * (10 + explosionPattern01(entry.serial, phase, k, 11) * 10) * scale,
            Math.sin(debrisAngle) * (10 + explosionPattern01(entry.serial, phase, k, 11) * 10) * scale);
        }
      }
      // A normal-blended, lopsided cooling sheath preserves the rupture silhouette when reduced
      // flash shortens additive combustion. It expands slowly, stays directional, and cannot read
      // as a clean ring because it uses the eroded smoke mask with an offset center and 2:1 aspect.
      this._spawnSprite(SPR_PUFF,
        x - entry.dirX * r * 0.08 + tangentX * r * 0.07, 0.12,
        z - entry.dirZ * r * 0.08 + tangentZ * r * 0.07,
        entry.classId === 'capital' ? 0.92 : 0.68,
        r * scale * 0.11, r * scale * (entry.classId === 'capital' ? 0.42 : 0.36),
        reduced ? 0.30 : 0.24, 0,
        reduced ? '#a65335' : '#7e3e2d',
        entry.dirX * 1.8 + tangentX * 0.7, entry.dirZ * 1.8 + tangentZ * 0.7,
        2.15, dirAngle + 0.31);
      this._impactParticleCone(x, z, dirAngle,
        entry.classId === 'capital' ? 1.55 : (entry.classId === 'small' ? 1.15 : 1.42),
        14, entry.classId === 'capital' ? 42 : 36,
        Math.round((entry.classId === 'capital' ? 10 : 6) * burst * scale * (reduced ? 0.62 : 1)),
        entry.classId === 'capital' ? 0.72 : 0.52, 0.36 * scale,
        '#ffe3a0', '#65301d', 1.35);
      // Rupture heat. Two compact white cores offset along the tear axis (never centred, so they
      // cannot rebuild the radial flower the phase is written to avoid). Brightness carries the
      // energy and the combustion cards carry the shape; neither job is done by making the orange
      // cards bigger.
      for (const side of [-1, 1]) {
        const coreAlong = r * scale * 0.09 * side;
        const coreAcross = r * scale * 0.05 * side;
        this._spawnSprite(SPR_FLASH,
          x + entry.dirX * coreAlong + tangentX * coreAcross, 0.30,
          z + entry.dirZ * coreAlong + tangentZ * coreAcross,
          entry.classId === 'capital' ? 0.20 : 0.13,
          r * scale * (isSmall ? 0.10 : 0.07), r * scale * (isSmall ? 0.30 : 0.19),
          reduced ? 0.62 : (side < 0 ? 1.0 : 0.78), 0.0, side < 0 ? '#ffffff' : '#fff3d0',
          entry.dirX * (5 + 3 * side) * scale, entry.dirZ * (5 + 3 * side) * scale,
          1.6 + 0.5 * side, dirAngle + side * 0.22);
      }
      if (!isSmall) {
        // The old expanding ring made every ordinary/capital rupture read as the same radial pulse.
        // A bounded fork of hot tear-axis shears now carries the pressure outward while keeping the
        // killing direction legible. Reduced mode retains one primary shear instead of changing
        // grammar or disabling the cue.
        const shearCount = reduced ? 1 : 2;
        for (let k = 0; k < shearCount; k++) {
          const side = k === 0 ? -1 : 1;
          const shearAngle = dirAngle + side * (entry.classId === 'capital' ? 0.48 : 0.36);
          const shearX = Math.cos(shearAngle);
          const shearZ = Math.sin(shearAngle);
          this._spawnProjectileTrailStreak(
            x + tangentX * side * r * 0.08, 0.26,
            z + tangentZ * side * r * 0.08,
            entry.classId === 'capital' ? 0.52 : 0.38,
            r * scale * 0.028,
            r * scale * (entry.classId === 'capital' ? 0.72 : 0.54),
            reduced ? 0.24 : (side < 0 ? 0.46 : 0.34),
            side < 0 ? '#ffd49a' : '#ff8a42',
            shearX * (entry.classId === 'capital' ? 14 : 10) * scale,
            shearZ * (entry.classId === 'capital' ? 14 : 10) * scale,
            shearX, shearZ);
        }
      }
      this._flashLight({ x, z }, '#ffa050', (entry.classId === 'capital' ? 13 : 8.0) * scale, 5.5, 180 + r * 7);
      const shake = entry.classId === 'capital' ? 0.62 : (entry.classId === 'small' ? 0.16 : 0.34);
      // A ship blowing up is a WORLD event: send where it happened so the consumer can fall it off
      // with distance. Untagged, this kicked the player's camera identically whether the wreck was on
      // their nose or across the sector — measured as six unearned kicks in ~30 s of tutorial flight.
      this.bus.emit('camera:shake', { amount: reduced ? shake * 0.55 : shake, position: { x, z } });
      return;
    }

    if (phase === 'debris') {
      // Debris is made of narrow moving fragments with a few subordinate sparks. Large point
      // sprites became floating orange beads after the combustion phase had cooled.
      const fanCount = Math.max(3, Math.round((entry.classId === 'capital' ? 14 : isSmall ? 5 : 8)
        * burst * (reduced ? 0.65 : 1)));
      const fanSpread = entry.classId === 'capital' ? 1.92 : 1.52;
      for (let k = 0; k < fanCount; k++) {
        const normalized = fanCount > 1 ? k / (fanCount - 1) - 0.5 : 0;
        const a = dirAngle + normalized * fanSpread
          + explosionPatternSigned(entry.serial, phase, k, 0) * 0.11;
        const speed = (entry.classId === 'capital' ? 14 : 11)
          + explosionPattern01(entry.serial, phase, k, 1) * (entry.classId === 'capital' ? 34 : 24);
        const longLived = entry.classId === 'capital' && k % 4 === 0;
        this._spawnProjectileTrailStreak(
          x + Math.cos(a) * r * 0.08, 0.23, z + Math.sin(a) * r * 0.08,
          (longLived ? 1.75 : (entry.classId === 'capital' ? 0.92 : 0.62))
            + explosionPattern01(entry.serial, phase, k, 2) * 0.34,
          (0.05 + explosionPattern01(entry.serial, phase, k, 3) * 0.05) * scale,
          (0.8 + explosionPattern01(entry.serial, phase, k, 4)
            * (entry.classId === 'capital' ? 1.7 : 1.15)) * scale,
          reduced ? 0.20 : (0.32 + explosionPattern01(entry.serial, phase, k, 5) * 0.20),
          k % 3 === 0 ? '#ffe1ad' : '#c96a35',
          Math.cos(a) * speed * scale, Math.sin(a) * speed * scale,
          Math.cos(a), Math.sin(a));
      }
      if (entry.classId === 'capital') {
        const reverseCount = reduced ? 2 : 4;
        for (let k = 0; k < reverseCount; k++) {
          const normalized = reverseCount > 1 ? k / (reverseCount - 1) - 0.5 : 0;
          const a = dirAngle + Math.PI + normalized * 1.18
            + explosionPatternSigned(entry.serial, phase, k, 6) * 0.10;
          const speed = 9 + explosionPattern01(entry.serial, phase, k, 7) * 24;
          this._spawnProjectileTrailStreak(x, 0.21, z,
            1.0 + explosionPattern01(entry.serial, phase, k, 8) * 0.44,
            (0.045 + explosionPattern01(entry.serial, phase, k, 9) * 0.045) * scale,
            (0.72 + explosionPattern01(entry.serial, phase, k, 10) * 1.25) * scale,
            reduced ? 0.15 : 0.27,
            k % 2 ? '#aa4a28' : '#d8b58c', Math.cos(a) * speed, Math.sin(a) * speed,
            Math.cos(a), Math.sin(a));
        }
      }
      this._impactParticleCone(x, z, dirAngle, fanSpread,
        12, entry.classId === 'capital' ? 46 : 34,
        Math.round((entry.classId === 'capital' ? 9 : 5) * burst * (reduced ? 0.6 : 1)),
        entry.classId === 'capital' ? 1.2 : 0.8, 0.34 * scale,
        '#f2d2a2', '#33231c', 0.72);
      return;
    }

    if (phase === 'pressure') {
      // Space pressure is a broken pair of faint vapor shears. The gaps and unequal segment lengths
      // prevent the cue from rebuilding a ring when multiple destruction events overlap.
      const segmentCount = reduced ? 1 : 2;
      for (const side of [-1, 1]) {
        for (let segment = 0; segment < segmentCount; segment++) {
          const along = (segment - (segmentCount - 1) * 0.5) * r * 0.32;
          const segmentScale = 0.82 + explosionPattern01(entry.serial, phase, segment, side + 2) * 0.28;
          this._spawnSprite(SPR_PUFF,
            x + tangentX * side * r * (0.20 + segment * 0.07) + entry.dirX * along,
            0,
            z + tangentZ * side * r * (0.20 + segment * 0.07) + entry.dirZ * along,
            (entry.classId === 'capital' ? 0.78 : 0.50) * segmentScale,
            r * 0.12 * scale, r * (entry.classId === 'capital' ? 0.53 : 0.42) * scale * segmentScale,
            reduced ? 0.055 : 0.082, 0, '#675a52',
            tangentX * side * (6 + segment * 2), tangentZ * side * (6 + segment * 2),
            2.8, Math.atan2(tangentZ * side, tangentX * side) + (segment ? 0.20 : -0.14));
        }
      }
      return;
    }

    if (phase === 'residue') {
      const puffs = Math.max(2, Math.round((entry.classId === 'capital' ? 7 : 4) * burst * (reduced ? 0.72 : 1)));
      for (let k = 0; k < puffs; k++) {
        const normalized = puffs > 1 ? k / (puffs - 1) - 0.5 : 0;
        const a = dirAngle + normalized * 1.86
          + explosionPatternSigned(entry.serial, phase, k, 0) * 0.23;
        const distance = r * scale * (0.12 + explosionPattern01(entry.serial, phase, k, 1) * 0.34);
        const speed = 1.2 + explosionPattern01(entry.serial, phase, k, 2) * 3.8;
        this._spawnSprite(SPR_PUFF,
          x + Math.cos(a) * distance, 0, z + Math.sin(a) * distance,
          (entry.classId === 'capital' ? 2.15 : 1.08)
            + explosionPattern01(entry.serial, phase, k, 3) * (entry.classId === 'capital' ? 0.65 : 0.32),
          r * scale * (0.12 + explosionPattern01(entry.serial, phase, k, 4) * 0.07),
          r * scale * (0.34 + explosionPattern01(entry.serial, phase, k, 5) * 0.22),
          reduced ? 0.20 : 0.24, 0,
          k % 2 ? (reduced ? '#81736b' : '#625b57') : (reduced ? '#a06547' : '#744c3d'),
          Math.cos(a) * speed, Math.sin(a) * speed,
          1.18 + explosionPattern01(entry.serial, phase, k, 6) * 0.54,
          a + explosionPatternSigned(entry.serial, phase, k, 7) * 0.28);
      }
      // A few slow cooling fragments keep the source direction legible inside the residue without
      // turning the smoke into identical circular puffs or extending gameplay obstruction.
      const emberCount = entry.classId === 'capital' ? (reduced ? 2 : 4) : 2;
      for (let k = 0; k < emberCount; k++) {
        const a = dirAngle + (k - (emberCount - 1) * 0.5) * 0.52
          + explosionPatternSigned(entry.serial, phase, k, 8) * 0.12;
        this._spawnProjectileTrailStreak(x, 0.18, z,
          entry.classId === 'capital' ? 1.65 + k * 0.11 : 0.78 + k * 0.08,
          0.045 * scale, (0.72 + k * 0.23) * scale,
          reduced ? 0.13 : 0.23, k % 2 ? '#a64b2c' : '#d78a52',
          Math.cos(a) * (4 + k * 1.8), Math.sin(a) * (4 + k * 1.8),
          Math.cos(a), Math.sin(a));
      }
    }
  },

  _spawnCauseFragment(entry, x, z, angle, life, width, length, opacity, color, speed, travelScale) {
    const axisX = Math.cos(angle);
    const axisZ = Math.sin(angle);
    const inheritedX = Number.isFinite(entry.targetVelocityX) ? entry.targetVelocityX : 0;
    const inheritedZ = Number.isFinite(entry.targetVelocityZ) ? entry.targetVelocityZ : 0;
    const breakupSpeed = Math.max(0, Math.min(42, Number(speed) || 0)) * travelScale;
    return this._spawnProjectileTrailStreak(
      x, 0.24, z, life, width, length, opacity, color,
      inheritedX + axisX * breakupSpeed,
      inheritedZ + axisZ * breakupSpeed,
      axisX, axisZ,
    );
  },

  _emitCausalExplosionPhase(phase, entry) {
    const cause = entry.cause;
    const x = entry.x;
    const z = entry.z;
    const r = entry.radius;
    const classScale = entry.classId === 'capital' ? 1.12 : (entry.classId === 'small' ? 0.90 : 1);
    const scale = classScale * Math.max(0.78, Math.min(1.65, Math.sqrt(r / 8)));
    const accessibility = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    const reduced = accessibility.flashOpacityScale < 1;
    const motionReduced = !!(this.state && this.state.settings && this.state.settings.video
      && this.state.settings.video.motionReduce);
    const travelScale = motionReduced ? 0.42 : (reduced ? 0.72 : 1);
    const opacityScale = accessibility.flashOpacityScale;
    const dirAngle = Math.atan2(entry.dirZ, entry.dirX);
    let contactX = entry.hasNormal ? entry.normalX : entry.dirX;
    let contactZ = entry.hasNormal ? entry.normalZ : entry.dirZ;
    if (cause === 'terrain_collision') {
      const incomingDot = contactX * entry.targetVelocityX + contactZ * entry.targetVelocityZ;
      if (incomingDot > 0) { contactX = -contactX; contactZ = -contactZ; }
    }
    const contactAngle = Math.atan2(contactZ, contactX);
    const tangentX = -contactZ;
    const tangentZ = contactX;
    const tangentAngle = Math.atan2(tangentZ, tangentX);
    const flashLife = Math.max(accessibility.flashMinLife, reduced ? 0.11 : 0.075);

    if (phase === 'contact-compression') {
      // Terrain starts at real contact: one flattened axis-locked compression, never an omnidirectional
      // pre-contact burst. Normal is unoriented, so target motion selects its outward half-space.
      this._spawnSprite(SPR_FLASH, x, 0.24, z, flashLife,
        r * 0.055 * scale,
        r * 0.24 * scale,
        0.92, 0, '#fff0d0', contactX * 2, contactZ * 2, 2.8, contactAngle);
      this._spawnCauseFragment(entry, x, z, contactAngle, reduced ? 0.24 : 0.34,
        0.08 * scale, 2.8 * scale, 0.66 * opacityScale, '#f1d2a0', 18, travelScale);
      if (accessibility.eventLightPeakScale > 0) {
        this._flashLight({ x, z }, '#ffc080', 6.4 * scale, 12, 100 + r * 3);
      }
      return;
    }

    if (phase === 'terrain-spall') {
      const count = reduced ? 2 : 4;
      for (let k = 0; k < count; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const fan = (Math.floor(k / 2) + 1) * 0.13;
        const angle = tangentAngle + (side < 0 ? Math.PI : 0) + side * fan;
        this._spawnCauseFragment(entry, x + tangentX * side * r * 0.05,
          z + tangentZ * side * r * 0.05, angle,
          reduced ? 0.30 : 0.46, 0.055 * scale, (1.8 + k * 0.25) * scale,
          (reduced ? 0.30 : 0.58) * opacityScale, '#c9a878', 15 + k * 2, travelScale);
      }
      this._spawnSprite(SPR_PUFF, x - contactX * r * 0.04, 0.08, z - contactZ * r * 0.04,
        reduced ? 0.55 : 0.78, r * 0.08 * scale, r * 0.30 * scale,
        (reduced ? 0.20 : 0.30) * opacityScale, 0, '#7c6650',
        contactX * 2 * travelScale, contactZ * 2 * travelScale, 2.7, tangentAngle);
      return;
    }

    if (phase === 'collision-shear') {
      // Craft-on-craft contact is bilateral. Both unoriented normal halves survive, so swapping the
      // contact normal sign cannot change the read or pretend one hull was stationary terrain.
      const perSide = reduced ? 1 : 2;
      for (const side of [-1, 1]) {
        for (let k = 0; k < perSide; k++) {
          const angle = contactAngle + (side < 0 ? Math.PI : 0) + side * k * 0.18;
          this._spawnCauseFragment(entry, x + contactX * side * r * 0.06,
            z + contactZ * side * r * 0.06, angle,
            reduced ? 0.28 : 0.42, 0.07 * scale, (2.6 + k * 0.5) * scale,
            (reduced ? 0.36 : 0.68) * opacityScale, '#dbe8f1', 20 + k * 3, travelScale);
        }
      }
      this._spawnSprite(SPR_FLASH, x, 0.25, z, flashLife,
        r * 0.05 * scale,
        r * 0.25 * scale,
        0.84, 0, '#ffffff', 0, 0, 2.6, contactAngle);
      if (accessibility.eventLightPeakScale > 0) {
        this._flashLight({ x, z }, '#dcecff', 6.8 * scale, 12, 110 + r * 3);
      }
      return;
    }

    if (phase === 'ignition') {
      const ignitionAngle = cause === 'ship_collision' ? contactAngle : dirAngle;
      this._spawnSprite(SPR_FLASH, x, 0.28, z, flashLife,
        r * 0.055 * scale,
        r * (cause === 'kinetic' ? 0.28 : 0.20) * scale,
        cause === 'kinetic' ? 0.94 : 0.86, 0, '#ffffff',
        Math.cos(ignitionAngle) * 2, Math.sin(ignitionAngle) * 2,
        cause === 'kinetic' ? 3.1 : 2.3, ignitionAngle);
      if (cause !== 'kinetic') {
        const pockets = reduced ? 1 : (cause === 'explosive' ? 3 : 2);
        for (let k = 0; k < pockets; k++) {
          const centered = k - (pockets - 1) * 0.5;
          this._spawnSprite(SPR_COMBUSTION,
            x + entry.dirX * centered * r * 0.12 - entry.dirZ * r * 0.05,
            0.20,
            z + entry.dirZ * centered * r * 0.12 + entry.dirX * r * 0.05,
            reduced ? 0.24 : 0.38 + k * 0.04,
            r * 0.055 * scale, r * 0.19 * scale,
            reduced ? 0.42 : 0.46, 0,
            k % 2 ? '#ffd08a' : '#e45b28',
            entry.dirX * (2 + k) * travelScale, entry.dirZ * (2 + k) * travelScale,
            1.5, ignitionAngle + centered * 0.26);
        }
      }
      if (accessibility.eventLightPeakScale > 0) {
        this._flashLight({ x, z }, cause === 'kinetic' ? '#fff0d0' : '#ff9a48',
          (cause === 'kinetic' ? 5.8 : 8.2) * scale, 11, 110 + r * 4);
      }
      return;
    }

    if (phase === 'kinetic-tear') {
      const count = reduced ? 2 : 4;
      for (let k = 0; k < count; k++) {
        const centered = k - (count - 1) * 0.5;
        const angle = dirAngle + centered * (reduced ? 0.18 : 0.16);
        this._spawnCauseFragment(entry,
          x - entry.dirZ * centered * r * 0.025, z + entry.dirX * centered * r * 0.025,
          angle, reduced ? 0.25 : 0.38 + k * 0.025,
          0.045 * scale, (3.4 + k * 0.38) * scale,
          (reduced ? 0.30 : 0.70 - Math.abs(centered) * 0.08) * opacityScale,
          k % 2 ? '#f4d3a0' : '#d9e2e8', 24 + k * 2, travelScale);
      }
      return;
    }

    if (phase === 'internal' || phase === 'internal-secondary') {
      const secondary = phase === 'internal-secondary';
      const side = secondary ? 1 : -1;
      const count = reduced ? 1 : (secondary ? 3 : 2);
      for (let k = 0; k < count; k++) {
        const centered = k - (count - 1) * 0.5;
        const px = x - entry.dirZ * side * r * (secondary ? 0.28 : 0.17)
          + entry.dirX * centered * r * 0.12;
        const pz = z + entry.dirX * side * r * (secondary ? 0.28 : 0.17)
          + entry.dirZ * centered * r * 0.12;
        this._spawnSprite(SPR_COMBUSTION, px, 0.18, pz,
          reduced ? 0.28 : 0.46 + k * 0.05,
          r * 0.06 * scale, r * (secondary ? 0.28 : 0.20) * scale,
          reduced ? 0.42 : (secondary ? 0.54 : 0.42), 0,
          secondary ? '#ff6930' : '#ffc06a',
          (-entry.dirZ * side * (3 + k) + entry.dirX * centered) * travelScale,
          (entry.dirX * side * (3 + k) + entry.dirZ * centered) * travelScale,
          1.5, dirAngle + side * (secondary ? 0.92 : 0.58));
      }
      return;
    }

    if (phase === 'breakup') {
      const count = reduced ? 2 : 4;
      for (let k = 0; k < count; k++) {
        const centered = k - (count - 1) * 0.5;
        const baseAngle = cause === 'ship_collision' ? contactAngle : dirAngle;
        const angle = baseAngle + centered * (cause === 'kinetic' ? 0.18 : 0.44);
        this._spawnCauseFragment(entry, x, z, angle, reduced ? 0.34 : 0.56,
          0.06 * scale, (2.8 + k * 0.42) * scale,
          (reduced ? 0.27 : 0.54) * opacityScale, '#e7c79c', 20 + k * 2, travelScale);
      }
      return;
    }

    if (phase === 'rupture') {
      const count = reduced ? 2 : (cause === 'explosive' ? 7 : (cause === 'ship_collision' ? 6 : 4));
      const spread = cause === 'kinetic' ? 0.48 : (cause === 'explosive' ? 2.2 : 1.4);
      for (let k = 0; k < count; k++) {
        let angle;
        if (cause === 'ship_collision') {
          const side = k % 2 === 0 ? -1 : 1;
          angle = contactAngle + (side < 0 ? Math.PI : 0)
            + side * Math.floor(k / 2) * 0.24;
        } else if (cause === 'terrain_collision') {
          const normalized = count > 1 ? k / (count - 1) - 0.5 : 0;
          angle = contactAngle + normalized * spread;
        } else {
          const normalized = count > 1 ? k / (count - 1) - 0.5 : 0;
          angle = dirAngle + normalized * spread;
        }
        this._spawnCauseFragment(entry, x, z, angle,
          reduced ? 0.28 : 0.48 + k * 0.025,
          0.055 * scale, (2.4 + k * 0.24) * scale,
          (reduced ? 0.27 : 0.58) * opacityScale,
          k % 2 ? '#e7a15d' : '#f4dfb8', 18 + k * 1.5, travelScale);
      }
      const ruptureAngle = cause === 'terrain_collision' || cause === 'ship_collision'
        ? contactAngle : dirAngle;
      this._spawnSprite(SPR_FLASH, x, 0.27, z, flashLife,
        r * 0.06 * scale,
        r * 0.25 * scale,
        0.90, 0, '#ffffff',
        Math.cos(ruptureAngle) * 3, Math.sin(ruptureAngle) * 3, 2.7, ruptureAngle);
      if (accessibility.eventLightPeakScale > 0) {
        this._flashLight({ x, z }, '#ff9a50', 8.4 * scale, 7, 140 + r * 5);
      }
      this.bus.emit('camera:shake', {
        amount: (reduced ? 0.16 : 0.30) * (entry.classId === 'capital' ? 1.5 : 1),
        position: { x, z },
      });
      return;
    }

    if (phase === 'debris') {
      const baseCount = cause === 'explosive' ? 7 : (cause === 'kinetic' ? 4 : 6);
      const count = reduced ? Math.max(2, Math.floor(baseCount * 0.45)) : baseCount;
      for (let k = 0; k < count; k++) {
        const normalized = count > 1 ? k / (count - 1) - 0.5 : 0;
        let baseAngle = dirAngle;
        let spread = cause === 'kinetic' ? 0.62 : 1.8;
        if (cause === 'terrain_collision') { baseAngle = contactAngle; spread = 1.28; }
        if (cause === 'ship_collision') {
          const side = k % 2 === 0 ? -1 : 1;
          baseAngle = contactAngle + (side < 0 ? Math.PI : 0);
          spread = 0.72;
        }
        const angle = baseAngle + normalized * spread
          + explosionPatternSigned(entry.serial, phase, k, 15) * 0.08;
        this._spawnCauseFragment(entry, x, z, angle,
          reduced ? 0.42 : 0.72 + k * 0.035,
          (0.045 + explosionPattern01(entry.serial, phase, k, 16) * 0.025) * scale,
          (1.0 + explosionPattern01(entry.serial, phase, k, 17) * 1.1) * scale,
          (reduced ? 0.20 : 0.42) * opacityScale,
          k % 2 ? '#bd7b4c' : '#dac5aa', 12 + k * 2, travelScale);
      }
      return;
    }

    if (phase === 'pressure') {
      const axisAngle = cause === 'ship_collision' ? contactAngle : dirAngle;
      const axisX = Math.cos(axisAngle);
      const axisZ = Math.sin(axisAngle);
      const sideX = -axisZ;
      const sideZ = axisX;
      for (const side of [-1, 1]) {
        const segments = reduced ? 1 : (cause === 'explosive' ? 2 : 1);
        for (let k = 0; k < segments; k++) {
          this._spawnSprite(SPR_PUFF,
            x + sideX * side * r * (0.16 + k * 0.08) + axisX * k * r * 0.10,
            0,
            z + sideZ * side * r * (0.16 + k * 0.08) + axisZ * k * r * 0.10,
            reduced ? 0.42 : 0.62 + k * 0.11,
            r * 0.10 * scale, r * (cause === 'explosive' ? 0.52 : 0.38) * scale,
            (reduced ? 0.04 : 0.085) * opacityScale, 0, '#655a54',
            sideX * side * 5 * travelScale, sideZ * side * 5 * travelScale,
            2.8, Math.atan2(sideZ * side, sideX * side));
        }
      }
      return;
    }

    if (phase === 'residue') {
      const count = reduced ? 2 : (cause === 'explosive' ? 5 : 3);
      for (let k = 0; k < count; k++) {
        const normalized = count > 1 ? k / (count - 1) - 0.5 : 0;
        const baseAngle = cause === 'terrain_collision' ? tangentAngle : dirAngle;
        const angle = baseAngle + normalized * (cause === 'terrain_collision' ? 1.1 : 1.7)
          + explosionPatternSigned(entry.serial, phase, k, 18) * 0.16;
        const distance = r * (0.10 + explosionPattern01(entry.serial, phase, k, 19) * 0.24);
        this._spawnSprite(SPR_PUFF,
          x + Math.cos(angle) * distance, 0, z + Math.sin(angle) * distance,
          reduced ? 0.78 : 1.18 + k * 0.08,
          r * 0.10 * scale, r * (0.28 + k * 0.025) * scale,
          (reduced ? 0.16 : 0.24) * opacityScale, 0,
          cause === 'terrain_collision' ? '#6f604f' : '#5e514a',
          (entry.targetVelocityX * 0.06 + Math.cos(angle) * 2) * travelScale,
          (entry.targetVelocityZ * 0.06 + Math.sin(angle) * 2) * travelScale,
          1.8, angle);
      }
    }
  },

  _explode(p, big) {
    if (!this._scene) return false;
    const radius = Math.max(3, p && p.radius || 6);
    const classId = big || radius >= 45 ? 'capital' : (radius < 9 ? 'small' : 'ordinary');
    return this._queueExplosion(p, classId);
  },

  // -------------------------------------------------------------------------
  // Seeded station-side operations. The simulation director owns occurrence, path, and lifetime;
  // VFX owns a fixed six-record pool that samples those paths onto the existing instanced trail and
  // sprite substrates. No ambient event creates a sim entity here, and duplicate event ids are a
  // no-op. Each family has a silhouette + trajectory read, not merely a different tint.
  // -------------------------------------------------------------------------
  _onStationSideEvent(p) {
    const profile = resolveStationSideEventVfxProfile(p && p.kind);
    const from = p && p.from;
    const to = p && p.to;
    if (!profile || !from || !to
      || !Number.isFinite(from.x) || !Number.isFinite(from.z)
      || !Number.isFinite(to.x) || !Number.isFinite(to.z)) return false;

    const eventId = p.eventId == null ? null : String(p.eventId);
    const slots = this._stationSideEventSlots;
    if (!slots || !slots.length) return false;
    if (eventId != null) {
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].alive && slots[i].eventId === eventId) return false;
      }
    }

    let station = this._ent(p.stationId);
    if (!station && typeof p.stationId === 'string') {
      const numericId = Number(p.stationId);
      if (Number.isFinite(numericId)) station = this._ent(numericId);
    }
    // Orbit/crawl paths require their station center. Refuse a phantom local loop if the station
    // vanished on a sector boundary before the renderer saw the event.
    if ((profile.trajectory === 'hull-crawl' || profile.trajectory === 'docking-orbit')
      && (!station || !station.pos)) return false;

    let slot = null;
    for (let i = 0; i < slots.length; i++) {
      const index = (this._stationSideEventCursor + i) % slots.length;
      if (!slots[index].alive) {
        slot = slots[index];
        this._stationSideEventCursor = (index + 1) % slots.length;
        break;
      }
    }
    if (!slot) {
      slot = slots[this._stationSideEventCursor];
      this._stationSideEventCursor = (this._stationSideEventCursor + 1) % slots.length;
    } else {
      this._stationSideEventActive++;
    }

    slot.alive = true;
    slot.age = 0;
    slot.duration = Math.max(0.25, Math.min(180,
      Number.isFinite(p.durationS) ? p.durationS : profile.defaultDurationS));
    slot.eventId = eventId;
    slot.stationId = station && station.id != null ? station.id : p.stationId;
    slot.entityId = p.entityIds && p.entityIds.length ? p.entityIds[0] : null;
    slot.kind = profile.id;
    slot.profile = profile;
    slot.bearing = Number.isFinite(p.bearing) ? p.bearing : 0;
    slot.fromX = from.x;
    slot.fromZ = from.z;
    slot.toX = to.x;
    slot.toZ = to.z;
    slot.centerX = station && station.pos ? station.pos.x : (from.x + to.x) * 0.5;
    slot.centerZ = station && station.pos ? station.pos.z : (from.z + to.z) * 0.5;
    slot.lastEmitStep = -1;

    this._stationSideEventStarts++;
    this._lastStationSideEventKind = profile.id;
    // Wake on the next render frame without waiting a whole cadence interval.
    this._cadenceStationSideEvent = Math.max(
      this._cadenceStationSideEvent || 0,
      1 / VFX_STATION_SIDE_EVENTS_HZ,
    );
    return true;
  },

  _retireStationSideEvent(slot) {
    if (!slot || !slot.alive) return;
    slot.alive = false;
    slot.eventId = null;
    slot.stationId = null;
    slot.entityId = null;
    slot.kind = null;
    slot.profile = null;
    slot.lastEmitStep = -1;
    this._stationSideEventActive = Math.max(0, this._stationSideEventActive - 1);
  },

  _clearStationSideEvents() {
    const slots = this._stationSideEventSlots;
    if (slots) {
      for (let i = 0; i < slots.length; i++) this._retireStationSideEvent(slots[i]);
    }
    this._stationSideEventActive = 0;
    this._cadenceStationSideEvent = 0;
  },

  _stationSideEventsRelevant() {
    return (this._stationSideEventActive || 0) > 0;
  },

  _updateStationSideEvents(step) {
    const slots = this._stationSideEventSlots;
    if (!slots || !slots.length) return 0;
    const settings = this.state && this.state.settings || null;
    const video = settings && settings.video || null;
    const accessibility = settings && settings.accessibility || null;
    const reducedMotion = !!(
      (video && video.motionReduce)
      || (accessibility && accessibility.motionPreference === 'reduce')
    );
    const player = this.helpers && this.helpers.player
      ? this.helpers.player()
      : this._ent(this.state.playerId);
    const drawRange2 = VFX_STATION_SIDE_EVENT_DRAW_RANGE * VFX_STATION_SIDE_EVENT_DRAW_RANGE;
    let emitted = 0;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot.alive) continue;
      slot.age += step;
      if (slot.age >= slot.duration) {
        this._retireStationSideEvent(slot);
        continue;
      }

      const station = this._ent(slot.stationId);
      if (station && station.pos) {
        slot.centerX = station.pos.x;
        slot.centerZ = station.pos.z;
      } else if (slot.profile.trajectory === 'hull-crawl'
        || slot.profile.trajectory === 'docking-orbit') {
        this._retireStationSideEvent(slot);
        continue;
      }
      if (player && player.pos) {
        const playerDx = slot.centerX - player.pos.x;
        const playerDz = slot.centerZ - player.pos.z;
        if (playerDx * playerDx + playerDz * playerDz > drawRange2) continue;
      }
      const frame = writeStationSideEventVfxFrame(
        slot.profile,
        slot.age,
        slot.duration,
        slot.fromX,
        slot.fromZ,
        slot.toX,
        slot.toZ,
        slot.centerX,
        slot.centerZ,
        slot.bearing,
        reducedMotion,
        slot.frame,
      );

      // A budgeted patrol has a real sim ship. Decorate its live pose rather than drawing a second
      // fake mover; the pure from→to path remains the fallback if spawning degraded to cosmetics.
      const entity = slot.entityId != null ? this._ent(slot.entityId) : null;
      if (slot.kind === 'patrol_launch' && slot.entityId != null
        && (!entity || entity.alive === false || !entity.pos)) {
        this._retireStationSideEvent(slot);
        continue;
      }
      if (entity && entity.alive !== false && entity.pos) {
        frame.x = entity.pos.x;
        frame.z = entity.pos.z;
        let dx = entity.vel && Number(entity.vel.x) || 0;
        let dz = entity.vel && Number(entity.vel.z) || 0;
        const speed = Math.hypot(dx, dz);
        if (speed <= 1e-5) {
          const heading = Number.isFinite(entity.rot) ? entity.rot : slot.bearing;
          dx = Math.cos(heading);
          dz = Math.sin(heading);
        }
        const length = Math.hypot(dx, dz) || 1;
        frame.dirX = dx / length;
        frame.dirZ = dz / length;
        frame.normalX = -frame.dirZ;
        frame.normalZ = frame.dirX;
      }

      if (frame.emitStep === slot.lastEmitStep) continue;
      slot.lastEmitStep = frame.emitStep;
      emitted += this._emitStationSideEventAccent(slot, reducedMotion);
    }
    return emitted;
  },

  _emitStationSideEventAccent(slot, reducedMotion) {
    const frame = slot.frame;
    const x = frame.x;
    const z = frame.z;
    const dx = frame.dirX;
    const dz = frame.dirZ;
    const nx = frame.normalX;
    const nz = frame.normalZ;
    let emitted = 0;

    if (slot.kind === 'hauler_dock') {
      // Broad parallel cargo rails + a periodic nose lamp: a heavy docking silhouette, never a
      // fighter streak or a circular marker.
      emitted += this._spawnStationSideEventStreak(x + nx * 0.64, 0.42, z + nz * 0.64,
        reducedMotion ? 0.58 : 0.34, 0.26, 2.7, 0.48, '#ffb35c', 0, 0, dx, dz);
      emitted += this._spawnStationSideEventStreak(x - nx * 0.64, 0.42, z - nz * 0.64,
        reducedMotion ? 0.58 : 0.34, 0.26, 2.7, 0.48, '#ffb35c', 0, 0, dx, dz);
      if (frame.accentSlot % 3 === 0 && this._spawnSprite(
        SPR_FLASH,
        x + dx * 1.35,
        0.44,
        z + dz * 1.35,
        0.12,
        0.32,
        0.48,
        0.42,
        0,
        '#fff2d0',
        0,
        0,
        1.5,
        Math.atan2(dz, dx),
      )) emitted++;
    } else if (slot.kind === 'patrol_launch') {
      // A sharp launch chevron and a central drive trace. When entityIds are present this follows
      // the actual neutral patrol ship instead of inventing a second hull.
      const backX = x - dx * 0.45;
      const backZ = z - dz * 0.45;
      const drift = reducedMotion ? 0 : 5;
      emitted += this._spawnStationSideEventStreak(backX + nx * 0.34, 0.5, backZ + nz * 0.34,
        reducedMotion ? 0.42 : 0.22, 0.14, 1.7, 0.68, '#d7e6ff',
        -dx * drift, -dz * drift, dx * 0.76 - nx * 0.65, dz * 0.76 - nz * 0.65);
      emitted += this._spawnStationSideEventStreak(backX - nx * 0.34, 0.5, backZ - nz * 0.34,
        reducedMotion ? 0.42 : 0.22, 0.14, 1.7, 0.68, '#d7e6ff',
        -dx * drift, -dz * drift, dx * 0.76 + nx * 0.65, dz * 0.76 + nz * 0.65);
      emitted += this._spawnStationSideEventStreak(x - dx * 0.9, 0.44, z - dz * 0.9,
        reducedMotion ? 0.48 : 0.24, 0.10, 3.1, 0.48, '#39d0ff',
        -dx * drift, -dz * drift, dx, dz);
    } else if (slot.kind === 'repair_drone') {
      // The crawler leaves a dotted, long-cooling stitch row. There is no ejecta: repair adds
      // material, and that absence is part of its grayscale read.
      const rowOffset = (frame.accentSlot - 3) * 0.34;
      const stitchX = x + dx * rowOffset;
      const stitchZ = z + dz * rowOffset;
      emitted += this._spawnStationSideEventStreak(stitchX, 0.34, stitchZ,
        1.35, 0.075, 0.52, 0.50, '#ffb35c', 0, 0, dx, dz);
      emitted += this._spawnStationSideEventStreak(x, 0.48, z,
        reducedMotion ? 0.52 : 0.34, 0.22, 0.92, 0.46, '#70808a', 0, 0, dx, dz);
      if (frame.accentSlot % 2 === 0 && this._spawnSprite(
        SPR_FLASH,
        stitchX,
        0.4,
        stitchZ,
        0.12,
        0.30,
        0.48,
        0.48,
        0,
        '#ffc35c',
        0,
        0,
      )) emitted++;
    } else if (slot.kind === 'cargo_tractor') {
      // A compact tractor and broad cargo pod remain physically separated by a visible straight
      // tether. The pair orbits the docking bubble; it cannot be mistaken for an unladen ship.
      const podGap = 2.45;
      const podX = x - dx * podGap;
      const podZ = z - dz * podGap;
      emitted += this._spawnStationSideEventStreak(x, 0.44, z,
        reducedMotion ? 0.56 : 0.34, 0.20, 1.05, 0.58, '#39d0ff', 0, 0, dx, dz);
      emitted += this._spawnStationSideEventStreak(podX + nx * 0.34, 0.38, podZ + nz * 0.34,
        reducedMotion ? 0.56 : 0.34, 0.25, 1.35, 0.48, '#ffb35c', 0, 0, dx, dz);
      emitted += this._spawnStationSideEventStreak(podX - nx * 0.34, 0.38, podZ - nz * 0.34,
        reducedMotion ? 0.56 : 0.34, 0.25, 1.35, 0.48, '#ffb35c', 0, 0, dx, dz);
      emitted += this._spawnStationSideEventStreak(x - dx * (podGap * 0.5), 0.4, z - dz * (podGap * 0.5),
        reducedMotion ? 0.56 : 0.34, 0.055, podGap - 0.75, 0.36, '#d7e6ff', 0, 0, dx, dz);
    }
    return emitted;
  },

  _spawnStationSideEventStreak(
    x, y, z, life, width, length, opacity, color, vx, vz, axisX, axisZ,
  ) {
    return this._spawnProjectileTrailStreak(
      x, y, z, life, width, length, opacity, color, vx, vz, axisX, axisZ,
    ) ? 1 : 0;
  },

  // -------------------------------------------------------------------------
  // NPC work signatures — "The Working Light" (design/fiction/THE_WORKING_LIGHT.md).
  //
  // The job kernel already knows what every civilian hull is doing; until now nothing drew it, so a
  // miner mid-cut and a hauler asleep at a waypoint were the same silent shape. This layer PULLS the
  // live job bag each cadence tick and paints the working state onto the SAME instanced trail/sprite
  // substrates everything else here uses — no per-ship mesh, no new draw call, no sim writes.
  //
  // Pull rather than listen: the runtime emits `npcjobs:*` on PHASE COMPLETION, so a slot installed
  // from an event is permanently one phase stale, and a dropped event leaves a ghost signalling a job
  // that ended. Reading the bag makes the renderer stateless about lifecycle instead.
  // -------------------------------------------------------------------------

  /** Cheap enough to run every frame: returns on the first key without allocating an array. */
  _npcJobSignaturesRelevant() {
    const bag = this.state && this.state.npcJobs;
    const byId = bag && bag.byId;
    if (!byId) return false;
    // eslint-disable-next-line no-unreachable-loop -- existence probe; the first key is the answer.
    for (const key in byId) { if (byId[key]) return true; break; }
    return false;
  },

  _sleepNpcJobSignatures() {
    const slots = this._npcJobSignatureSlots;
    if (slots) {
      for (let i = 0; i < slots.length; i++) {
        slots[i].jobId = null;
        slots[i].profileId = null;
        slots[i].lastEmitStep = -1;
        slots[i].elapsed = 0;
      }
    }
    this._npcJobSignatureActive = 0;
    this._npcJobSignatureDrawn = 0;
    this._cadenceNpcJobSignature = 0;
  },

  /**
   * Is this hull heavy?
   *
   * Derived from the PHASE GRAPH, never from `job.payload`. The kernel treats payload as a static
   * cargo INTENT and never clears it at unload (npcJobs.js:299-300), so reading it would report every
   * hauler that ever carried anything as permanently full — and "Amber heartbeat means mass" is the
   * single most-consulted line in the Code. A hauler is heavy between LOAD and UNLOAD; a miner is
   * heavy on RETURN; a patrol is never heavy.
   */
  _npcJobLoaded(kind, phase) {
    if (kind === 'hauler') return phase === 'depart' || phase === 'transit' || phase === 'approach';
    if (kind === 'miner') return phase === 'return' || phase === 'unload';
    return false;
  },

  /**
   * The rock a miner is cutting, or null.
   *
   * traffic._buildJobSpec names the field waypoint `field:<entityId>` (traffic.js:_buildJobSpec), so
   * the route itself carries the identity of the worked body. Recovering it lets the cut beam
   * terminate on the real asteroid — EVE's motionless-barge-on-rock read — instead of projecting a
   * fake beam into empty space. If the rock is gone (depleted, sector churn) the caller falls back.
   */
  _npcJobWorkTarget(job) {
    const route = job && job.route;
    if (!Array.isArray(route)) return null;
    for (let i = 0; i < route.length; i++) {
      const wp = route[i];
      const id = wp && wp.id;
      if (typeof id !== 'string' || !id.startsWith('field:')) continue;
      const numeric = Number(id.slice(6));
      if (!Number.isFinite(numeric)) continue;
      const rock = this._ent(numeric);
      // The TYPE check is the load-bearing one, not the liveness check. `job.route` is PERSISTED —
      // npcJobsRuntime serializes the kernel record and the save owner writes it out — so this id
      // survives a save/reload, while entity ids are handed out fresh on restore. Without this
      // guard a restored barge would happily cut whatever now holds its old rock's id: a station,
      // another ship, a pickup. That failure is silent and looks like an art bug, not a stale
      // reference. A miss simply falls back to the forward-projected beam.
      if (rock && rock.type === 'asteroid' && rock.alive !== false && rock.pos) return rock;
    }
    return null;
  },

  _updateNpcJobSignatures(step) {
    const slots = this._npcJobSignatureSlots;
    const byId = this.state && this.state.npcJobs && this.state.npcJobs.byId;
    if (!slots || !slots.length || !byId) return 0;

    const settings = this.state && this.state.settings || null;
    const video = settings && settings.video || null;
    const accessibility = settings && settings.accessibility || null;
    const reducedMotion = !!(
      (video && video.motionReduce)
      || (accessibility && accessibility.motionPreference === 'reduce')
    );
    const player = this.helpers && this.helpers.player
      ? this.helpers.player()
      : this._ent(this.state.playerId);
    const drawRange2 = NPC_JOB_SIGNATURE_DRAW_RANGE * NPC_JOB_SIGNATURE_DRAW_RANGE;

    // Generation stamp: slots claimed this tick are off-limits for reuse, so two jobs can never
    // fight over one slot within a single pass and produce a strobing half-drawn code.
    const gen = (this._npcJobSignatureGen = ((this._npcJobSignatureGen | 0) + 1) | 0);
    let emitted = 0;
    let active = 0;
    let drawn = 0;
    let reacting = 0;

    for (const jobId in byId) {
      const entry = byId[jobId];
      if (!entry) continue;
      const job = entry.job;
      if (!job || job.corrupt) continue;
      active++;

      // A virtualized job has no hull on screen; there is nothing to light.
      if (entry.entityId == null) continue;
      const ent = this._ent(entry.entityId);
      if (!ent || ent.alive === false || !ent.pos) continue;

      if (player && player.pos) {
        const dx = ent.pos.x - player.pos.x;
        const dz = ent.pos.z - player.pos.z;
        if (dx * dx + dz * dz > drawRange2) continue;
      }

      const profile = resolveNpcJobSignature(
        entry.kind,
        job.phase,
        this._npcJobLoaded(entry.kind, job.phase),
      );
      if (!profile) continue;

      let slot = null;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].jobId === jobId) { slot = slots[i]; break; }
      }
      if (!slot) {
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].gen !== gen && slots[i].jobId === null) { slot = slots[i]; break; }
        }
      }
      if (!slot) {
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].gen !== gen) { slot = slots[i]; break; }
        }
      }
      if (!slot) continue; // pool saturated this tick; the remaining hulls simply stay dark

      if (slot.jobId !== jobId) {
        slot.jobId = jobId;
        slot.profileId = null;
        // Stable per-job de-phasing so eight patrols do not blink in lockstep and read as one
        // machine. Derived from the id string, not RNG, so it survives save/reload unchanged.
        let h = 2166136261;
        for (let i = 0; i < jobId.length; i++) {
          h ^= jobId.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        slot.seed = (h >>> 0) % 1000;
      }
      slot.gen = gen;

      // A phase change restarts the code from its first beat. A signal caught mid-cycle is a
      // different signal — the Code counts beats, so a chevron that begins on its second lamp is
      // simply a different claim.
      if (slot.profileId !== profile.id) {
        slot.profileId = profile.id;
        slot.elapsed = 0;
        slot.lastEmitStep = -1;
      }
      slot.elapsed += step;

      const frame = writeNpcJobSignatureFrame(
        profile,
        slot.elapsed,
        Number.isFinite(ent.rot) ? ent.rot : 0,
        ent.vel ? ent.vel.x : 0,
        ent.vel ? ent.vel.z : 0,
        slot.seed,
        reducedMotion,
        slot.frame,
      );
      drawn++;

      // Working gear swings out to work and folds back to fly. Derived from phase + time-in-phase,
      // never stored, so a hull can never be caught flying with its jaws still open.
      slot.deploy = deployFraction(job.phase, slot.elapsed, reducedMotion);

      // And the hull notices you. The reaction rides on top of the job — the barge is still mining,
      // it has just stopped advertising it — so it changes presentation only and never the sim.
      let reactionDist = Infinity;
      if (player && player.pos) {
        reactionDist = Math.hypot(ent.pos.x - player.pos.x, ent.pos.z - player.pos.z);
      }
      const reaction = resolveNpcJobReaction(entry.kind, reactionDist, job.phase);
      slot.reaction = reaction.id;
      slot.reactionT = reaction.intensity;
      if (reaction.id !== NPC_JOB_REACTION.NONE) {
        reacting++;
        this._lastNpcJobReaction = reaction.id;
      }

      if (frame.emitStep === slot.lastEmitStep) continue;
      slot.lastEmitStep = frame.emitStep;
      this._lastNpcJobSignatureId = profile.id;
      emitted += this._emitNpcJobSignature(slot, profile, ent, job, reducedMotion);
      emitted += this._emitNpcJobReaction(slot, ent, reducedMotion);
    }

    // Release slots whose job vanished this tick, so a departed hull's cache cannot be mistaken for
    // a live one when ids are recycled.
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].gen !== gen && slots[i].jobId !== null) {
        slots[i].jobId = null;
        slots[i].profileId = null;
        slots[i].lastEmitStep = -1;
        slots[i].elapsed = 0;
      }
    }

    this._npcJobSignatureActive = active;
    this._npcJobSignatureDrawn = drawn;
    this._npcJobReacting = reacting;
    return emitted;
  },

  /**
   * Draw one beat of one hull's signal.
   *
   * SUBSTRATE CHOICE IS PHYSICAL, and it was wrong the first time. Lamps are point sources, so they
   * are sprites — a soft bright core that grows and fades, which is what a blinking navigation light
   * actually looks like. Only genuinely LINEAR things are streaks: a cut beam, a sweep, a chevron
   * arm, a transfer boom, a plume. Drawing a lamp as a stretched quad produced a flat opaque orange
   * BAR beside the hull rather than a light on it — visible, correctly placed, and obviously wrong.
   *
   * Every branch is a distinct SILHOUETTE and CADENCE, not a re-tint: at the distance this reads at,
   * arrangement and blink rhythm carry the meaning and colour is a close-range bonus.
   */
  _emitNpcJobSignature(slot, profile, ent, job, reducedMotion) {
    const frame = slot.frame;
    const x = ent.pos.x;
    const z = ent.pos.z;
    const dx = frame.dirX;
    const dz = frame.dirZ;
    const nx = frame.normalX;
    const nz = frame.normalZ;
    // Signals scale with the hull. A Meridian bulk mule's lamp bank is physically bigger than a
    // courier's, and the Code is read on hulls from 6 to 30 units across.
    const r = Math.max(3, Number(ent.radius) || 6);
    const beat = frame.beat;
    let emitted = 0;

    switch (profile.rhythm) {
      case 'spine-wake': {
        // "Bow lamp, midships, stern, one beat each." One lamp walks the keel; the hull's LENGTH is
        // the message, so the read is a travelling light rather than a flash in place.
        const along = (1 - beat) * r * 1.05;
        emitted += this._spawnJobLamp(x + dx * along, 0.42, z + dz * along, r, 0.085, '#e8f0ff', reducedMotion);
        break;
      }

      case 'load-heartbeat': {
        // The loaded heartbeat: port and starboard amber together, then a rest. Two lamps firing as
        // a PAIR is what separates mass from every single-lamp code in the book.
        if (beat === 0) {
          const off = r * 0.92;
          emitted += this._spawnJobLamp(x + nx * off, 0.46, z + nz * off, r, 0.12, '#ffb35c', reducedMotion);
          emitted += this._spawnJobLamp(x - nx * off, 0.46, z - nz * off, r, 0.12, '#ffb35c', reducedMotion);
        }
        break;
      }

      case 'empty-bar': {
        // "Three dim whites in a row" — hold open for hire. Deliberately dim and ventral: an empty
        // hull is announcing that it is not worth the interdiction maths.
        const lateral = (beat - 1) * r * 0.62;
        emitted += this._spawnJobLamp(x + nx * lateral, 0.24, z + nz * lateral, r, 0.062, '#cfe4ff', reducedMotion, 0.5);
        break;
      }

      case 'bow-final': {
        // Steady green bow lamp every beat — "green final is a promise" — plus one lateral thruster
        // tick that alternates sides, which is the stepped bleed-off the Code describes.
        emitted += this._spawnJobLamp(x + dx * r * 1.15, 0.44, z + dz * r * 1.15, r, 0.105, '#7dffb0', reducedMotion);
        const side = beat === 0 ? 1 : -1;
        emitted += this._spawnStationSideEventStreak(
          x + nx * side * r * 0.7, 0.38, z + nz * side * r * 0.7,
          reducedMotion ? 0.34 : 0.22, r * 0.05, r * 0.38, 0.50, '#b8ccdd',
          -nx * side * 3, -nz * side * 3, -nx * side, -nz * side,
        );
        break;
      }

      case 'work-cone': {
        // The blind cone. Three things at once, because extraction is the loudest thing a civilian
        // hull ever does: a beam onto the face, spall coming off it, and a red flank lamp walking
        // the arc nobody may enter. The beam is the one place a stretched quad is the right shape.
        const rock = this._npcJobWorkTarget(job);
        const noseX = x + dx * r * 0.8;
        const noseZ = z + dz * r * 0.8;
        let bx = dx;
        let bz = dz;
        let reach = NPC_JOB_CUT_BEAM_FALLBACK;
        if (rock && rock.pos) {
          const rx = rock.pos.x - noseX;
          const rz = rock.pos.z - noseZ;
          const dist = Math.hypot(rx, rz);
          // The range gate matters as much as the aim. A barge in WORK holds position wherever it
          // happened to arrive — the kernel's route position is advisory, not a teleport — so it can
          // legitimately be hundreds of units short of the rock its route names. Measured live: a
          // working barge 434 units from its own seam, which would draw a 423-unit lance across the
          // whole frame and well past it. That is not a cut, it is a targeting line. Past the gate
          // the hull keeps its work code and its flank strobe but shows the short local beam, which
          // reads as "rigged and running" rather than claiming a contact it does not have.
          if (dist > 1e-3 && dist <= NPC_JOB_CUT_BEAM_MAX_REACH) {
            bx = rx / dist;
            bz = rz / dist;
            // Stop at the rock's surface, not its centre — a beam that vanishes inside the body
            // reads as a bug, and the spall belongs on the face.
            reach = Math.max(2, dist - (Number(rock.radius) || 6));
          }
        }
        const midX = noseX + bx * reach * 0.5;
        const midZ = noseZ + bz * reach * 0.5;
        emitted += this._spawnStationSideEventStreak(
          midX, 0.40, midZ,
          reducedMotion ? 0.34 : 0.20, r * 0.10, reach, 0.62, '#ffcf7a', 0, 0, bx, bz,
        );
        // Spall off the face: thrown BACK along the beam, spreading. Contact is the channel that
        // proves the link is doing work rather than merely pointing.
        const hitX = noseX + bx * reach;
        const hitZ = noseZ + bz * reach;
        if (!reducedMotion) {
          const spread = (beat - 1.5) * 0.34;
          const sx = -bx * Math.cos(spread) + bz * Math.sin(spread);
          const sz = -bz * Math.cos(spread) - bx * Math.sin(spread);
          emitted += this._spawnStationSideEventStreak(
            hitX, 0.36, hitZ,
            0.62, r * 0.035, r * 0.28, 0.55, '#d8b083', sx * 11, sz * 11, sx, sz,
          );
        }
        if (this._spawnSprite(
          SPR_FLASH, hitX, 0.42, hitZ,
          0.16, r * 0.10, r * 0.26, 0.62, 0, '#ffe0a8', 0, 0, 1.2, Math.atan2(bz, bx),
        )) emitted++;
        // "Do not enter this arc." The red lamp walks the forbidden flank, one quarter per beat.
        const arc = (beat / 4) * Math.PI - Math.PI * 0.5;
        const ax = dx * Math.cos(arc) - dz * Math.sin(arc);
        const az = dz * Math.cos(arc) + dx * Math.sin(arc);
        // The forbidden arc widens as the magnet arms come out — the cone you may not enter is
        // literally the reach of the deployed gear.
        const armed = 0.55 + 0.50 * (slot.deploy || 0);
        emitted += this._spawnJobLamp(x + ax * r * armed, 0.50, z + az * r * armed, r, 0.10, '#ff6a5c', reducedMotion);
        break;
      }

      case 'pin-sweep': {
        // "A patrol that doesn't sweep is not a patrol." A beam riding a rotating bearing — genuinely
        // linear, so genuinely a streak — plus a steady mast lamp at the hull.
        const sx = Math.cos(frame.sweepAngle);
        const sz = Math.sin(frame.sweepAngle);
        emitted += this._spawnStationSideEventStreak(
          x + sx * r * 1.5, 0.52, z + sz * r * 1.5,
          reducedMotion ? 0.52 : 0.30, r * 0.045, r * 0.80, 0.60, '#9ed8ff', 0, 0, sx, sz,
        );
        // Mast lamp: identity survives after the sweep detail dies at range. The research is explicit
        // that nav lights should outlive job detail.
        if (beat === 0) {
          emitted += this._spawnJobLamp(x, 0.62, z, r, 0.095, '#dceeff', reducedMotion);
        }
        break;
      }

      case 'mouth-open': {
        // Hatch aperture spill plus a transfer arm. Three beats against a two-swing arm never line
        // up, which is what makes the cadence read as irregular without any randomness at all.
        const side = beat === 1 ? -1 : 1;
        const mouthX = x + nx * side * r * 0.85;
        const mouthZ = z + nz * side * r * 0.85;
        if (this._spawnSprite(
          SPR_PUFF, mouthX, 0.38, mouthZ,
          0.90, r * 0.20, r * 0.46, 0.46, 0, '#ffcf9a', 0, 0, 1, 0,
        )) emitted++;
        emitted += this._spawnStationSideEventStreak(
          mouthX + nx * side * r * 0.5, 0.44, mouthZ + nz * side * r * 0.5,
          reducedMotion ? 0.62 : 0.42, r * 0.055, r * 0.85, 0.52, '#cbb89a',
          0, 0, nx * side, nz * side,
        );
        break;
      }

      case 'tally': {
        // "Spilling the count." The one signal a bystander is meant to literally count, so it is
        // fast, regular and paired with the dust that proves the hold is actually emptying.
        const ring = (beat / 5) * Math.PI * 2;
        const tx = Math.cos(ring);
        const tz = Math.sin(ring);
        emitted += this._spawnJobLamp(x + tx * r * 0.75, 0.58, z + tz * r * 0.75, r, 0.09, '#ff9a3c', reducedMotion);
        if (!reducedMotion && beat % 2 === 0 && this._spawnSprite(
          SPR_PUFF, x - dx * r * 0.9, 0.30, z - dz * r * 0.9,
          1.10, r * 0.16, r * 0.55, 0.32, 0, '#9a8570', -dx * 4, -dz * 4, 1, 0,
        )) emitted++;
        break;
      }

      case 'return-chevron': {
        // Load-strobe AND the chevron. Two amber lamps stacked, walked so the chevron has a
        // direction — "if the chevron points home, don't offer them a side job."
        const off = r * 0.92;
        emitted += this._spawnJobLamp(x + nx * off, 0.46, z + nz * off, r, 0.12, '#ffb35c', reducedMotion);
        emitted += this._spawnJobLamp(x - nx * off, 0.46, z - nz * off, r, 0.12, '#ffb35c', reducedMotion);
        const rise = beat === 0 ? 0.56 : 0.76;
        const back = r * (beat === 0 ? 0.35 : 0.75);
        emitted += this._spawnStationSideEventStreak(
          x - dx * back + nx * r * 0.34, rise, z - dz * back + nz * r * 0.34,
          reducedMotion ? 0.64 : 0.42, r * 0.045, r * 0.50, 0.64, '#ffd08a',
          0, 0, dx * 0.78 + nx * 0.62, dz * 0.78 + nz * 0.62,
        );
        emitted += this._spawnStationSideEventStreak(
          x - dx * back - nx * r * 0.34, rise, z - dz * back - nz * r * 0.34,
          reducedMotion ? 0.64 : 0.42, r * 0.045, r * 0.50, 0.64, '#ffd08a',
          0, 0, dx * 0.78 - nx * 0.62, dz * 0.78 - nz * 0.62,
        );
        break;
      }

      case 'pulse-ring': {
        // "Pulse. Wait. Pulse." An expanding shell-flash, and a single cool pin held out on the
        // boom. The whole read is the SILENCE between beats — a fast pulse means lost or lying —
        // so the ring is large and short-lived rather than bright and frequent.
        if (beat === 0 && this._spawnSprite(
          SPR_RING, x, 0.44, z,
          reducedMotion ? 1.30 : 0.86, r * 0.55, r * 3.4, 0.44, 0, '#8fe6ff', 0, 0, 1, 0,
        )) emitted++;
        // The survey pin sits off the nose on its boom, crabbed to one side — the dossier's
        // "slender boom that can crab ninety degrees off the nose". It never blinks off.
        // The boom SWINGS. Stowed it lies along the hull; deployed it crabs ninety degrees off the
        // nose, which is the dossier's own description and the whole silhouette change of the trade.
        const swing = 0.18 + 1.07 * (slot.deploy || 0);
        const pinX = x + dx * r * 0.5 + nx * r * swing;
        const pinZ = z + dz * r * 0.5 + nz * r * swing;
        emitted += this._spawnJobLamp(pinX, 0.58, pinZ, r, 0.075, '#bfe8ff', reducedMotion, 0.7);
        emitted += this._spawnStationSideEventStreak(
          x + dx * r * 0.3 + nx * r * swing * 0.55, 0.54, z + dz * r * 0.3 + nz * r * swing * 0.55,
          reducedMotion ? 0.90 : 0.62, r * 0.035, r * (0.35 + 0.75 * (slot.deploy || 0)), 0.34,
          '#7fc4e0', 0, 0, nx, nz,
        );
        break;
      }

      case 'salvage-umbrella': {
        // Hooded floods aimed DOWN at the hull being stripped, plus intermittent cutter arcs. The
        // Code is emphatic that umbrellas-on is what separates recovery from a kill still in
        // progress, so they are the constant and the arc is the flicker.
        // The umbrellas UNFOLD. Stowed they sit tight against the hull; open they reach out over
        // the plate being stripped, which is what stops passing traffic reading this as a kill.
        const spread = 0.22 + 0.78 * (slot.deploy || 0);
        const hood = (beat % 3) - 1;
        emitted += this._spawnStationSideEventStreak(
          x + nx * hood * r * 0.7 * spread + dx * r * 0.3, 0.20, z + nz * hood * r * 0.7 * spread + dz * r * 0.3,
          reducedMotion ? 0.74 : 0.52, r * 0.11, r * (0.16 + 0.28 * spread), 0.50, '#ffb35c', 0, 0, dx, dz,
        );
        // Cutter arc: short, bright, and off half the beats — a wreck fights back in a way a rock
        // does not, which is what makes this irregular where the miner's work cone is even.
        if (beat % 2 === 0) {
          const bite = r * (0.9 + (beat / 6) * 0.5);
          if (this._spawnSprite(
            SPR_FLASH, x + dx * bite, 0.40, z + dz * bite,
            0.13, r * 0.08, r * 0.22, 0.78, 0, '#dff0ff', 0, 0, 1.4, Math.atan2(dz, dx),
          )) emitted++;
          if (!reducedMotion) {
            const fling = (beat === 0 ? 1 : -1) * 0.8;
            emitted += this._spawnStationSideEventStreak(
              x + dx * bite, 0.36, z + dz * bite,
              0.70, r * 0.03, r * 0.30, 0.46, '#9fb0bd',
              (dx + nx * fling) * 9, (dz + nz * fling) * 9, dx + nx * fling, dz + nz * fling,
            );
          }
        }
        break;
      }

      case 'men-at-work': {
        // Static red corners bracketing the open bay — the Code's own words — carried every beat so
        // they read as continuous presence, not a warning flash. The welding stars carry the rhythm.
        for (const side of [1, -1]) {
          emitted += this._spawnJobLamp(
            x + nx * side * r * 0.8 + dx * r * 0.55, 0.30,
            z + nz * side * r * 0.8 + dz * r * 0.55,
            r, 0.07, '#ff4a3a', reducedMotion, 0.66,
          );
        }
        // Weld stars on the client's plate, alternating along the seam. No ejecta anywhere: repair
        // ADDS material, and that absence is the channel separating this from a salvor's arc.
        const seam = (beat === 0 ? 0.5 : -0.5) * r;
        if (this._spawnSprite(
          SPR_FLASH, x + dx * r * 1.05 + nx * seam, 0.46, z + dz * r * 1.05 + nz * seam,
          reducedMotion ? 0.34 : 0.19, r * 0.06, r * 0.30, 0.88, 0, '#cfe4ff', 0, 0, 1, null,
        )) emitted++;
        // One drive cold: a tender on a call-out is a soft target by necessity, and the Code says
        // so with a "do not push" bar across the dead engine.
        emitted += this._spawnStationSideEventStreak(
          x - dx * r * 1.0, 0.36, z - dz * r * 1.0,
          reducedMotion ? 0.80 : 0.58, r * 0.045, r * 0.62, 0.40, '#e8eef4', 0, 0, nx, nz,
        );
        break;
      }

      case 'distress-alternate': {
        // "Red-white is not a negotiation." A whole-hull alternating flash, the fastest and largest
        // signal in the Code, because its entire job is to break any rhythm the reader has locked on.
        const hot = beat === 0;
        if (this._spawnSprite(
          SPR_FLASH, x, 0.46, z,
          0.20, r * 0.45, r * 1.15, hot ? 0.82 : 0.68, 0,
          hot ? '#ff5a4a' : '#ffffff', 0, 0, 1, 0,
        )) emitted++;
        // Asymmetric plume: a wounded hull does not burn politely.
        const skew = frame.chatter * 0.5;
        emitted += this._spawnStationSideEventStreak(
          x - dx * r * 1.1, 0.40, z - dz * r * 1.1,
          reducedMotion ? 0.40 : 0.26, r * 0.075, r * 0.9, 0.58, '#ffa070',
          0, 0, -dx + nx * skew, -dz + nz * skew,
        );
        break;
      }

      default:
        break;
    }

    return emitted;
  },

  /**
   * Draw this hull's response to the player closing.
   *
   * A reaction is an OVERLAY, not a mode. The job's own signal keeps running underneath — the barge
   * is still mining, it has just stopped advertising it — which is what makes the reaction read as a
   * crew decision rather than a state machine flipping. Each one is in the trade's own currency,
   * from its dossier's "how they react to a stranger closing" entry.
   */
  _emitNpcJobReaction(slot, ent, reducedMotion) {
    const t = slot.reactionT;
    if (!t || slot.reaction === NPC_JOB_REACTION.NONE) return 0;
    const frame = slot.frame;
    const x = ent.pos.x;
    const z = ent.pos.z;
    const dx = frame.dirX;
    const dz = frame.dirZ;
    const nx = frame.normalX;
    const nz = frame.normalZ;
    const r = Math.max(3, Number(ent.radius) || 6);
    const player = this.helpers && this.helpers.player
      ? this.helpers.player()
      : this._ent(this.state.playerId);
    let emitted = 0;

    switch (slot.reaction) {
      case NPC_JOB_REACTION.PAINT: {
        // The narrow secondary beam, swung onto YOU rather than round the sky. A patrol boat and a
        // survey rig answer a stranger with the same gesture and mean different things by it.
        if (!player || !player.pos) break;
        const ax = player.pos.x - x;
        const az = player.pos.z - z;
        const len = Math.hypot(ax, az) || 1;
        const ux = ax / len;
        const uz = az / len;
        const reach = Math.min(len, r * 6);
        emitted += this._spawnStationSideEventStreak(
          x + ux * reach * 0.5, 0.56, z + uz * reach * 0.5,
          reducedMotion ? 0.44 : 0.26, r * 0.03 * (0.6 + t), reach, 0.30 + 0.34 * t,
          '#a8e4ff', 0, 0, ux, uz,
        );
        break;
      }

      case NPC_JOB_REACTION.FLINCH: {
        // Weld stops mid-stroke. The tell is the ABSENCE of the next star plus the corners coming up
        // hard — the Code's "men at work" turning from a notice into a warning.
        for (const side of [1, -1]) {
          emitted += this._spawnJobLamp(
            x + nx * side * r * 0.8 + dx * r * 0.55, 0.32,
            z + nz * side * r * 0.8 + dz * r * 0.55,
            r, 0.075 + 0.03 * t, '#ff3a2a', reducedMotion, 0.5 + 0.4 * t,
          );
        }
        break;
      }

      case NPC_JOB_REACTION.WATCH: {
        // Umbrellas tilt toward you and stay on. Dousing them would read as a kill in progress, and
        // the Code is explicit that umbrellas-on is the difference. So: keep cutting, tilt, watch.
        if (!player || !player.pos) break;
        const ax = player.pos.x - x;
        const az = player.pos.z - z;
        const len = Math.hypot(ax, az) || 1;
        emitted += this._spawnStationSideEventStreak(
          x + (ax / len) * r * 0.95, 0.24, z + (az / len) * r * 0.95,
          reducedMotion ? 0.80 : 0.58, r * 0.09, r * 0.5, 0.34 + 0.30 * t,
          '#ffb35c', 0, 0, ax / len, az / len,
        );
        break;
      }

      case NPC_JOB_REACTION.GO_DARK: {
        // "Loud greedy cut raises attention." The floods die back and one cold hull lamp stays lit
        // so you can still see there is somebody there — going fully dark is a smuggler's move and
        // a licensed barge will not risk being read that way.
        if (t > 0.35) {
          emitted += this._spawnJobLamp(x, 0.60, z, r, 0.05, '#7f93a6', reducedMotion, 0.30);
        }
        break;
      }

      case NPC_JOB_REACTION.BRIGHTEN: {
        // An insured hull's defence is being boringly, expensively legitimate. Its running lamps go
        // UP, not down: look at me, I am exactly what my manifest says.
        const off = r * 1.05;
        emitted += this._spawnJobLamp(x + nx * off, 0.50, z + nz * off, r, 0.09 + 0.04 * t, '#ffd9a0', reducedMotion, 0.55 + 0.35 * t);
        emitted += this._spawnJobLamp(x - nx * off, 0.50, z - nz * off, r, 0.09 + 0.04 * t, '#ffd9a0', reducedMotion, 0.55 + 0.35 * t);
        break;
      }

      default:
        break;
    }
    return emitted;
  },

  /**
   * One navigation/work lamp: a soft bright core that grows slightly and fades.
   *
   * `scale` is a FRACTION OF HULL RADIUS, not world units, so the same code reads the same on a
   * 6-unit courier and a 30-unit bulk mule. Reduced motion holds the lamp longer and grows it less,
   * so the signal stays countable without the sharp blink.
   */
  _spawnJobLamp(x, y, z, r, scale, color, reducedMotion, opacity = 0.85) {
    const size0 = r * scale;
    return this._spawnSprite(
      SPR_FLASH,
      x, y, z,
      reducedMotion ? 0.62 : 0.34,
      size0,
      size0 * (reducedMotion ? 1.35 : 2.1),
      opacity,
      0,
      color,
      0, 0,
      1,
      null,
    ) ? 1 : 0;
  },

  // ---- mining beam visual (energy line from ship to contact point) ----------
  _miningBeam: null,
  _initMiningBeam() {
    if (!this._scene) return;
    // Flat ribbon quad stretched between two endpoints; additive-blended, ore-tinted.
    // 4 vertices forming a thin quad (2 triangles) — width controlled per-update.
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(4 * 3); // 4 verts, xyz
    const uv = new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]);
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.usage = THREE.DynamicDrawUsage;
    geo.setAttribute('position', posAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex([0, 1, 2, 1, 3, 2]);

    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#60d0ff'),
      transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.visible = false;
    this._scene.add(mesh);

    // Core glow — a second, wider, dimmer beam layered underneath for bloom feel.
    const geo2 = geo.clone();
    const mat2 = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#60d0ff'),
      transparent: true, opacity: 0.25,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    const glow = new THREE.Mesh(geo2, mat2);
    glow.frustumCulled = false;
    glow.renderOrder = 9;
    glow.visible = false;
    this._scene.add(glow);

    this._miningBeam = { mesh, glow, active: false, t: 0, color: '#60d0ff' };
  },

  _onMiningStart(p) {
    if (!this._miningBeam) {
      if (!this._scene) return;
      this._initMiningBeam();
    }
    if (!this._miningBeam) return;
    this._miningBeam.active = true;
    this._miningBeam.t = 0;
    this._miningBeam.targetId = (p && p.targetId) || null;
    this._miningBeam.verb = (p && p.verb) || 'extract';
    const target = p && p.targetId ? this._ent(p.targetId) : null;
    let col = '#60d0ff';
    if (this._miningBeam.verb === 'cut') {
      col = '#fffaf0';
    } else if (this._miningBeam.verb === 'repair') {
      col = '#ffc35c';
    } else if (this._miningBeam.verb === 'transfer') {
      col = '#39d0ff';
    } else if (target && target.data) {
      col = oreColor(target.data.typeId);
    }
    this._miningBeam.color = col;
    if (this._miningBeam.mesh && this._miningBeam.mesh.material) this._miningBeam.mesh.material.color.set(col);
    if (this._miningBeam.glow && this._miningBeam.glow.material) this._miningBeam.glow.material.color.set(col);
  },

  _onMiningStop() {
    if (!this._miningBeam) return;
    this._miningBeam.active = false;
    this._miningBeam.mesh.visible = false;
    this._miningBeam.glow.visible = false;
  },

  // Called each frame from update() to reposition the beam quad between ship and contact.
  _updateMiningBeam(dt) {
    const beam = this._miningBeam;
    if (!beam || !beam.active) return;
    beam.t += dt;

    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    if (!player || !player.alive) { this._onMiningStop(); return; }

    const target = beam.targetId ? this._ent(beam.targetId) : null;
    if (!target || !target.alive) { this._onMiningStop(); return; }

    const verb = beam.verb || 'extract';
    const reduced = this.state && this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce;

    const cf = Math.cos(player.rot), sf = Math.sin(player.rot);
    const fwd = (player.radius || 6) * 0.7;
    const sxG = player.pos.x + cf * fwd, szG = player.pos.z + sf * fwd;

    const dx = sxG - target.pos.x, dz = szG - target.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const r = target.radius || 6;
    const txG = target.pos.x + (dx / dist) * r, tzG = target.pos.z + (dz / dist) * r;
    const sLocal = this._toLocalXZ(sxG, szG, this._spawnLocalXZ);
    const tLocal = this._toLocalXZ(txG, tzG, this._entityLocalXZ);
    const sx = sLocal.x, sz = sLocal.z;
    const tx = tLocal.x, tz = tLocal.z;

    const nx = -(dz / dist), nz = (dx / dist);
    let pulse = 1.0;
    let w = 0.8;
    let gw = 2.5;

    if (verb === 'cut') {
      w = 0.4;
      gw = 1.2;
    } else if (verb === 'repair') {
      w = 0.5;
      gw = 1.5;
      pulse = reduced ? 1.0 : (1.0 + 0.15 * Math.sin(beam.t * 8));
    } else if (verb === 'transfer') {
      w = 0.9;
      gw = 2.2;
      pulse = reduced ? 1.0 : (1.0 + 0.1 * Math.sin(beam.t * 6));
    } else { // extract
      pulse = reduced ? 1.0 : (1.0 + 0.3 * Math.sin(beam.t * 12));
      w = 0.8 * pulse;
      gw = 2.5 * pulse;
    }

    const corePos = beam.mesh.geometry.attributes.position.array;
    corePos[0] = sx + nx * w; corePos[1] = 1.5; corePos[2] = sz + nz * w;
    corePos[3] = sx - nx * w; corePos[4] = 1.5; corePos[5] = sz - nz * w;
    corePos[6] = tx + nx * w; corePos[7] = 1.5; corePos[8] = tz + nz * w;
    corePos[9] = tx - nx * w; corePos[10] = 1.5; corePos[11] = tz - nz * w;
    beam.mesh.geometry.attributes.position.needsUpdate = true;
    beam.mesh.visible = true;
    beam.mesh.material.opacity = verb === 'cut' ? 0.9 : (0.6 + 0.2 * Math.sin(beam.t * 8));

    const glowPos = beam.glow.geometry.attributes.position.array;
    glowPos[0] = sx + nx * gw; glowPos[1] = 1.5; glowPos[2] = sz + nz * gw;
    glowPos[3] = sx - nx * gw; glowPos[4] = 1.5; glowPos[5] = sz - nz * gw;
    glowPos[6] = tx + nx * gw; glowPos[7] = 1.5; glowPos[8] = tz + nz * gw;
    glowPos[9] = tx - nx * gw; glowPos[10] = 1.5; glowPos[11] = tz - nz * gw;
    beam.glow.geometry.attributes.position.needsUpdate = true;
    beam.glow.visible = true;
    beam.glow.material.opacity = verb === 'cut' ? 0.3 : (0.15 + 0.1 * Math.sin(beam.t * 6));

    if (verb === 'cut') {
      if (Math.random() < (reduced ? 0.3 : 0.7)) {
        const spallAngle = Math.atan2(-dz, -dx) + (Math.random() - 0.5) * 0.6;
        const spallSpeed = 10 + Math.random() * 15;
        this._spawnProjectileTrailStreak(txG, 0.5, tzG, 0.6, 0.08, 0.6, 0.8, '#fffaf0',
          Math.cos(spallAngle) * spallSpeed, Math.sin(spallAngle) * spallSpeed,
          Math.cos(spallAngle), Math.sin(spallAngle));
      }
    } else if (verb === 'repair') {
      if (Math.random() < (reduced ? 0.2 : 0.5)) {
        const beadOffset = (Math.random() - 0.5) * (target.radius || 6) * 0.4;
        const bx = txG + nx * beadOffset, bz = tzG + nz * beadOffset;
        this._spawnSprite(SPR_FLASH, bx, 0.5, bz, 0.4, 0.5, 0.8, 0.8, 0, '#ffc35c', 0, 0, 0, 0);
      }
    } else if (verb === 'transfer') {
      if (Math.random() < (reduced ? 0.3 : 0.6)) {
        const frac = (beam.t * 2 + Math.random()) % 1.0;
        const px = sxG + (txG - sxG) * frac, pz = szG + (tzG - szG) * frac;
        this._spawnParticle(px, pz, nx * 2, nz * 2, 0.2, 0.8, 0.0, '#39d0ff', '#d7e6ff', 2.0, 0, 0);
      }
    } else { // extract
      if (Math.random() < (reduced ? 0.3 : 0.6)) {
        const frac = Math.random();
        const px = sxG + (txG - sxG) * frac, pz = szG + (tzG - szG) * frac;
        const drift = 3 + Math.random() * 5;
        this._c0.set('#ffffff'); this._c1.set(beam.color);
        this._spawnParticle(px, pz, (Math.random() - 0.5) * drift, (Math.random() - 0.5) * drift,
          0.15 + Math.random() * 0.15, 1.0, 0.0, this._c0, this._c1, 4.0, 0, 0);
      }
    }
  },

  // -------------------------------------------------------------------------
  // Tether cable (GDD §4.3): the player-facing read of the massline. A segmented additive ribbon
  // between the ship's NOSE and the latched target: bows with slack, straightens and heats
  // cyan→amber→red with tether.load / tether.phase (the presentation signals — sim writes, we
  // read). Physical tether.strain is an UPPER path only, never the sole key: see the long note at
  // the strain read in _updateTetherCable for why (it is ~1e-4 in real play). Runs a decaying
  // traveling wave for the first beat after latch (the "whip"). Cut = quick fade;
  // break = spark burst at both ends (tether:broke). Pure cosmetics — never touches sim state.
  // -------------------------------------------------------------------------
  _initTetherCable() {
    if (!this._scene) return;
    const SEG = 24;
    const verts = (SEG + 1) * 2;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(verts * 3);
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.usage = THREE.DynamicDrawUsage;
    geo.setAttribute('position', posAttr);
    const idx = [];
    for (let i = 0; i < SEG; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    const along = new Float32Array((SEG + 1) * 2);
    const side = new Float32Array((SEG + 1) * 2);
    const glowAlong = new Float32Array((SEG + 1) * 2);
    const glowSide = new Float32Array((SEG + 1) * 2);
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const ai = i * 2;
      along[ai] = t; along[ai + 1] = t;
      side[ai] = -1; side[ai + 1] = 1;
      glowAlong[ai] = t; glowAlong[ai + 1] = t;
      glowSide[ai] = -1; glowSide[ai + 1] = 1;
    }
    const alongAttr = new THREE.BufferAttribute(along, 1);
    const sideAttr = new THREE.BufferAttribute(side, 1);
    alongAttr.usage = THREE.StaticDrawUsage;
    sideAttr.usage = THREE.StaticDrawUsage;
    geo.setAttribute('aAlong', alongAttr);
    geo.setAttribute('aSide', sideAttr);

    // Core draw: the white-hot filament. `sheath: 0` selects the tight cross-section that saturates
    // to white and runs far above 1.0 in linear HDR, which is what clips through ACES and feeds the
    // bloom bright pass. Grammar §9.2 — the taut Massline is meant to be the brightest thing here.
    const mat = createMasslineRibbonMaterial({
      name: 'sf-tether-core',
      color: 0x39d0ff,
      intensity: 6.2,
      opacity: 0.78,
      pulseSpeed: 3.1,
      sheath: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.visible = false;
    this._scene.add(mesh);

    const glowGeo = geo.clone();
    const glowAlongAttr = new THREE.BufferAttribute(glowAlong, 1);
    const glowSideAttr = new THREE.BufferAttribute(glowSide, 1);
    glowAlongAttr.usage = THREE.StaticDrawUsage;
    glowSideAttr.usage = THREE.StaticDrawUsage;
    glowGeo.setAttribute('aAlong', glowAlongAttr);
    glowGeo.setAttribute('aSide', glowSideAttr);
    // Halo draw: the wide saturated sheath around the core. `sheath: 1` keeps the tension colour
    // instead of washing to white, so the cable reads as a coloured volume with a white centre
    // rather than as one flat tinted stripe.
    const glowMat = createMasslineRibbonMaterial({
      name: 'sf-tether-halo',
      color: 0x39d0ff,
      intensity: 2.8,
      opacity: 0.2,
      pulseSpeed: 2.4,
      sheath: 1,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.frustumCulled = false;
    glow.renderOrder = 9;
    glow.visible = false;
    this._scene.add(glow);

    const BANDS = 10;
    const bandGeo = new THREE.BufferGeometry();
    const bandPos = new Float32Array(BANDS * 4 * 3);
    const bandPosAttr = new THREE.BufferAttribute(bandPos, 3);
    bandPosAttr.usage = THREE.DynamicDrawUsage;
    bandGeo.setAttribute('position', bandPosAttr);
    const bandIdx = [];
    for (let i = 0; i < BANDS; i++) {
      const a = i * 4;
      bandIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    bandGeo.setIndex(bandIdx);
    const bandMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#d7e6ff'),
      transparent: true, opacity: 0.16,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.frustumCulled = false;
    band.renderOrder = 11;
    band.visible = false;
    this._scene.add(band);

    // The hitch ring used to be 28% of its own radius thick, which at anchor scale drew a ~20px
    // solid donut of flat additive colour — it read as a HUD element pasted into the world rather
    // than as the point where a rope is biting into a rock. Thin it to a bright band and let
    // targetHalo (below) supply the soft outer falloff, so ring + halo together give the same
    // hot-core / saturated-surround structure as the rope itself.
    const anchorGeo = new THREE.RingGeometry(0.87, 1.0, 48);
    anchorGeo.rotateX(-Math.PI / 2);
    const anchorMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#39d0ff'),
      transparent: true, opacity: 0.52,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      forceSinglePass: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const anchor = new THREE.Mesh(anchorGeo, anchorMat);
    anchor.frustumCulled = false;
    anchor.renderOrder = 12;
    anchor.visible = false;
    this._scene.add(anchor);

    // The hitch core: a genuine soft hot point, not a flat disc. A CircleGeometry fans from a single
    // centre vertex, so painting the centre white and the rim black and blending additively gives a
    // real radial falloff for the cost of one vertex-colour attribute — the same white-core /
    // coloured-surround structure the rope has, at the point where the force is applied.
    const anchorCoreGeo = new THREE.CircleGeometry(0.42, 32);
    anchorCoreGeo.rotateX(-Math.PI / 2);
    {
      const vertCount = anchorCoreGeo.attributes.position.count;
      const falloff = new Float32Array(vertCount * 3);
      falloff[0] = 1; falloff[1] = 1; falloff[2] = 1;   // fan centre
      anchorCoreGeo.setAttribute('color', new THREE.BufferAttribute(falloff, 3));
    }
    const anchorCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#a6f0ff'),
      vertexColors: true,
      transparent: true, opacity: 0.74,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      forceSinglePass: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const anchorCore = new THREE.Mesh(anchorCoreGeo, anchorCoreMat);
    anchorCore.frustumCulled = false;
    anchorCore.renderOrder = 13;
    anchorCore.visible = false;
    this._scene.add(anchorCore);

    const targetHaloGeo = new THREE.RingGeometry(0.92, 1.0, 56);
    targetHaloGeo.rotateX(-Math.PI / 2);
    const targetHaloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#39d0ff'),
      transparent: true, opacity: 0.18,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      forceSinglePass: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const targetHalo = new THREE.Mesh(targetHaloGeo, targetHaloMat);
    targetHalo.frustumCulled = false;
    targetHalo.renderOrder = 8;
    targetHalo.visible = false;
    this._scene.add(targetHalo);

    this._tetherCable = {
      mesh, glow, band, anchor, anchorCore, targetHalo, SEG, BANDS,
      along, side, glowAlong, glowSide,
      wasActive: false,
      lastSourceId: null,
      lastTargetId: null,
      lastAttachmentId: null,
      lastRemote: false,
      endpointScratch: {
        ax: 0, az: 0, bx: 0, bz: 0,
        dirX: 1, dirZ: 0, chord: 0, targetRadius: 4,
      },
      latchAge: 999,      // seconds since latch (drives the whip wave)
      snapAge: 999,       // seconds since break (drives the violent recoil whip)
      fade: 0,            // 0..1 visibility envelope (release = fade out, latch = snap in)
      fadeRate: TETHER_RELEASE_FADE_RATE,
      bowSide: 1,
      strainSmooth: 0,
      loadSmooth: 0,
      reelGlow: 0,
    };
    this._tetherColorCool = new THREE.Color('#39d0ff');
    this._tetherColorWarm = new THREE.Color('#ffb35c');
    this._tetherColorHot = new THREE.Color('#ff5c5c');
    this._tetherColorWhite = new THREE.Color('#eaffff');
  },

  // -------------------------------------------------------------------------
  // Arc preview (massline rung 12): a faint dashed ribbon ahead of the ship showing the PREDICTED
  // sling exit — direction from telemetry.arcPreview.exitAngle, length scaled to peakSpeed,
  // shown only while tethered + the preview reads viable (masslineTelemetry rung 11 owns the
  // data; we only read it). Pure cosmetics — never touches sim state; Math.random shimmer is
  // fine here (VFX is exempt from the determinism rule).
  // -------------------------------------------------------------------------
  _arcPreview: null,
  _initArcPreview() {
    if (!this._scene) return;
    const DASHES = 9;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(DASHES * 4 * 3);
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.usage = THREE.DynamicDrawUsage;
    geo.setAttribute('position', posAttr);
    const idx = [];
    for (let i = 0; i < DASHES; i++) {
      const a = i * 4;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#7ce4ff'),
      transparent: true, opacity: 0.22,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;   // under the cable/bands so the live line stays the hero read
    mesh.visible = false;
    this._scene.add(mesh);
    this._arcPreview = { mesh, DASHES, fade: 0, t: 0 };
  },

  _updateArcPreview(dt) {
    const arc = this._arcPreview;
    if (!arc) return;
    arc.t += dt;
    const tether = this.state.player && this.state.player.tether;
    const telemetry = this.state.player && this.state.player.masslineTelemetry;
    const preview = telemetry && telemetry.arcPreview;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    const show = !!(tether && tether.active && preview && preview.viable && player && player.alive);

    // Opacity envelope tied to viability: snap in while the sling would convert, quick fade when
    // it stops reading viable (or the line drops).
    arc.fade = show ? Math.min(1, arc.fade + dt * 6) : Math.max(0, arc.fade - dt * 6);
    if (arc.fade <= 0.01 || !player || !preview) {
      if (arc.mesh.visible) arc.mesh.visible = false;
      return;
    }

    // Ray from just off the hull along the predicted exit vector; length scales with the
    // convertible speed so a hotter swing draws a longer throw.
    // Direction is origin-invariant; start point is projected to frame-local for mesh verts.
    const ux = Math.cos(preview.exitAngle), uz = Math.sin(preview.exitAngle);
    const px = -uz, pz = ux;   // ray perpendicular
    const startR = (player.radius || 6) + 2;
    const sLocal = this._toLocalXZ(player.pos.x + ux * startR, player.pos.z + uz * startR, this._spawnLocalXZ);
    const sx = sLocal.x, sz = sLocal.z;
    const len = Math.max(24, Math.min(130, (preview.peakSpeed || 0) * 0.8));

    const DASHES = arc.DASHES;
    const dashLen = (len / DASHES) * 0.55;      // 55% dash, 45% gap
    const posArr = arc.mesh.geometry.attributes.position.array;
    for (let i = 0; i < DASHES; i++) {
      const t0 = (i / DASHES) * len;
      const tip = 1 - (i / DASHES) * 0.55;      // taper toward the far end
      const w = 0.55 * tip;
      const x0 = sx + ux * t0, z0 = sz + uz * t0;
      const x1 = sx + ux * (t0 + dashLen), z1 = sz + uz * (t0 + dashLen);
      const o = i * 12;
      posArr[o] = x0 + px * w; posArr[o + 1] = 1.45; posArr[o + 2] = z0 + pz * w;
      posArr[o + 3] = x0 - px * w; posArr[o + 4] = 1.45; posArr[o + 5] = z0 - pz * w;
      posArr[o + 6] = x1 + px * w; posArr[o + 7] = 1.45; posArr[o + 8] = z1 + pz * w;
      posArr[o + 9] = x1 - px * w; posArr[o + 10] = 1.45; posArr[o + 11] = z1 - pz * w;
    }
    arc.mesh.geometry.attributes.position.needsUpdate = true;
    // Faint by design (a hint, not a HUD element): gentle pulse + a whisper of dash shimmer.
    arc.mesh.material.opacity = (0.16 + 0.08 * Math.sin(arc.t * 7) + Math.random() * 0.03) * arc.fade;
    arc.mesh.visible = true;
  },

  _arcPreviewActive() {
    const arc = this._arcPreview;
    if (!arc) return false;
    if (arc.fade > 0.001) return true;
    const tether = this.state.player && this.state.player.tether;
    const preview = this.state.player && this.state.player.masslineTelemetry
      && this.state.player.masslineTelemetry.arcPreview;
    return !!(tether && tether.active && preview && preview.viable);
  },

  _updateTetherCable(dt) {
    const cable = this._tetherCable;
    if (!cable) return;
    const playerTether = this.state.player && this.state.player.tether;
    const remoteTether = this.state.player && this.state.player.remoteMassline;
    const remote = !!(remoteTether && remoteTether.active
      && remoteTether.sourceId != null && remoteTether.targetId != null);
    const tether = remote ? remoteTether : playerTether;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    const source = remote ? this._ent(tether.sourceId) : player;
    const active = !!(tether && tether.active && player && player.alive && source && source.alive);
    const target = active ? this._ent(tether.targetId) : null;
    const live = active && target && target.alive;
    const sourceId = live ? source.id : null;
    const targetId = live ? target.id : null;
    const attachmentId = live && tether.attachmentId != null ? tether.attachmentId : null;
    const identityChanged = live && (cable.lastSourceId !== sourceId
      || cable.lastTargetId !== targetId
      || cable.lastAttachmentId !== attachmentId
      || cable.lastRemote !== remote);

    if (live && (!cable.wasActive || identityChanged)) {
      cable.latchAge = 0; cable.snapAge = 999; cable.fade = 1;
      cable.fadeRate = TETHER_RELEASE_FADE_RATE;
      cable.lastSourceId = sourceId;
      cable.lastTargetId = targetId;
      cable.lastAttachmentId = attachmentId;
      cable.lastRemote = remote;
    }
    cable.wasActive = live;
    cable.latchAge += dt;
    cable.snapAge += dt;
    // Release fades quickly; a BREAK holds the line on screen for its recoil (see _onTetherSnap),
    // because a cable that simply disappears at the instant of the most violent event in the game
    // is the single biggest missed beat in the whole massline presentation.
    cable.fade = live ? 1 : Math.max(0, cable.fade - dt * (cable.fadeRate || TETHER_RELEASE_FADE_RATE));
    if (cable.fade <= 0 || !player) {
      if (cable.mesh.visible) setTetherCableVisible(cable, false);
      return;
    }
    const sourceEnt = live ? source : this._ent(cable.lastSourceId);
    const anchorEnt = live ? target : this._ent(cable.lastTargetId);
    if (!sourceEnt || !anchorEnt) { setTetherCableVisible(cable, false); return; }

    // Ordinary line: player nose -> target surface. Remote heads: source surface -> target surface;
    // the player remains the controller but is never smuggled in as a physical third endpoint.
    // Stations use a small collision radius so docking feels sane, but their visible body/ring is
    // much larger. Using the collision radius made lines attach to empty space in station centers.
    // Chord math stays galactic-global; mesh buffer writes are frame-local.
    const endpoints = cable.endpointScratch;
    if (!writeTetherVisualEndpoints(sourceEnt, anchorEnt, cable.lastRemote, endpoints)) {
      setTetherCableVisible(cable, false);
      return;
    }
    const axG = endpoints.ax;
    const azG = endpoints.az;
    const bxG = endpoints.bx;
    const bzG = endpoints.bz;
    const tr = endpoints.targetRadius;
    // The cable chord remains slightly inset for a firm latch, while the attachment markers sit
    // just outside the target surface. This bounded offset clears coplanar skin without pulling
    // the markers through unrelated foreground geometry.
    const mxG = anchorEnt.pos.x - endpoints.dirX * (tr + TETHER_MARKER_SURFACE_EPS);
    const mzG = anchorEnt.pos.z - endpoints.dirZ * (tr + TETHER_MARKER_SURFACE_EPS);
    let dx = bxG - axG; let dz = bzG - azG;
    const chord = endpoints.chord;
    const aLocal = this._toLocalXZ(axG, azG, this._spawnLocalXZ);
    const bLocal = this._toLocalXZ(bxG, bzG, this._entityLocalXZ);
    const bx = bLocal.x, bz = bLocal.z;
    const mLocal = this._toLocalXZ(mxG, mzG, this._entityLocalXZ);
    const ax = aLocal.x, az = aLocal.z;
    const mx = mLocal.x, mz = mLocal.z;
    const visualTime = Number.isFinite(this.state && this.state.simTime)
      ? this.state.simTime
      : (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);
    const px = -dz / chord, pz = dx / chord;   // chord perpendicular

    // Slack bow from REAL slack (restLength - distance): a line reeled longer than the gap hangs
    // lazy; a stretched line snaps straight. The bow lags the swing — it flips away from the
    // player's tangential velocity so the cable trails like a real line under centripetal motion.
    // WHY NOTHING HERE KEYS OFF tether.strain ALONE.
    //
    // tether.strain is the honest physical ratio lastTension / breakTension, and breakTension is
    // 10500000 (src/data/combatDefs.js tether_standard) because the Massline is deliberately
    // near-unbreakable. Measured with scripts/probe-tether-visual-drive.mjs — 640-mass asteroid
    // latched, full main thrust opposing the line for 240 ticks, line HELD — strain peaked at
    // 1.0e-4. Every threshold this file used to key on strain (taut > 0.7, overload > 0.95,
    // sparks > 0.55, the shiver amplitude) was therefore unreachable dead code: the rope always
    // rendered at its slack core width no matter how hard you pulled.
    //
    // The fix is NOT to renormalize strain — the enormous breakTension is a hand-tuned protected
    // value and making the rope look about to snap during ordinary play re-introduces exactly the
    // feeling that tuning removed. Instead the visible reads key off tether.load / tether.phase,
    // which are presentation-oriented and actually vary in play (same probe: load 0 → 0.55, phase
    // slack → capture → loaded). strainSmooth is kept and used as an UPPER path only: if physical
    // strain ever does climb — an engineered extreme-load event — it overtakes the presentation
    // read rather than being ignored. It never lowers it.
    const strain = Math.max(0, Math.min(1.5, (tether && tether.strain) || 0));
    cable.strainSmooth += (strain - cable.strainSmooth) * Math.min(1, dt * 8);
    const loadRaw = tether && Number.isFinite(tether.load)
      ? Math.max(0, Math.min(1, tether.load))
      : Math.min(1, strain);   // saves from before tether.load existed: degrade to the strain read
    cable.loadSmooth += (loadRaw - cable.loadSmooth) * Math.min(1, dt * 8);
    const rest = (tether && tether.restLength) || 0;
    const slack = Math.max(0, rest - chord);
    const tangential = sourceEnt.vel ? (sourceEnt.vel.x * px + sourceEnt.vel.z * pz) : 0;
    if (Math.abs(tangential) > 4) cable.bowSide = tangential > 0 ? -1 : 1;
    // The bow flattens as the line works. Keyed off the smoothed load, not strainSmooth: against a
    // 10.5M breakTension the old term was a constant 1.0 and the bow never straightened.
    const slackBow = Math.min(slack * 0.42, 24)
      * Math.max(0.15, 1 - Math.min(1, Math.max(cable.loadSmooth, cable.strainSmooth)))
      * cable.bowSide;

    // Whip waves. Two envelopes, because a latch and a break are not the same event:
    //   LATCH — a decaying traveling sine for ~0.55 s: the line settling onto its anchor.
    //   SNAP  — a much harder, faster, shorter recoil (~0.30 s) at roughly double the amplitude and
    //           frequency, forced white-hot through uWhip. This is the violent whip the design asks
    //           for; the line used to just vanish on break.
    const latchEnv = Math.max(0, 1 - cable.latchAge / 0.55);
    const snapEnv = Math.max(0, 1 - cable.snapAge / TETHER_SNAP_WHIP_S);
    const snapping = snapEnv > 0;
    const whipT = snapping ? cable.snapAge : cable.latchAge;
    const whipEnv = snapping ? snapEnv * snapEnv : latchEnv * latchEnv;
    const whipFreq = snapping ? 46 : 26;
    const whipHarmonic = snapping ? 5 : 3;
    const whipAmp = whipEnv * Math.min(chord * (snapping ? 0.52 : 0.28), snapping ? 52 : 26);

    // Load color: cool cyan → amber → hot red with presentation load (rung 04) — a loaded line
    // reads loaded even at low strain. Winch-active reel ramps a separate HDR glow read.
    // `l` is the working read: presentation load, with physical strain able to overtake it.
    const l = Math.min(1, Math.max(cable.loadSmooth, cable.strainSmooth));
    const reelTarget = tether && tether.reeling ? Math.max(0, Math.min(1, tether.reelStrength || 0)) : 0;
    cable.reelGlow += (reelTarget - cable.reelGlow) * (1 - Math.exp(-(reelTarget > cable.reelGlow ? 11 : 6) * Math.max(0, dt || 0)));
    if (l < 0.55) this._ctmp.lerpColors(this._tetherColorCool, this._tetherColorWarm, l / 0.55);
    else this._ctmp.lerpColors(this._tetherColorWarm, this._tetherColorHot, (l - 0.55) / 0.45);
    // Winching lifts the line's heat, but it must not erase the tension colour: with the shader's
    // own reel term this used to triple-count and a fully-winched cable read as a plain white
    // noodle, losing the one channel that tells you how hard it is pulling.
    if (cable.reelGlow > 0.01) this._ctmp.lerp(this._tetherColorWhite, cable.reelGlow * 0.20);
    // A parting line is white-hot regardless of what load it was carrying a frame ago: the physical
    // load telemetry is already gone by the time the break event lands.
    if (snapEnv > 0) this._ctmp.lerp(this._tetherColorWhite, Math.min(1, snapEnv * 0.95));
    // Taut / overload, re-keyed. `phase === 'loaded'` is the sim's own statement that the line is
    // past capture and pulling, so it engages the instant the state does; the smoothed load gate is
    // the continuous fallback (and the only path when a save predates tether.phase). Overload keeps
    // its physical escape hatch — if strain ever really does approach the envelope, it still fires.
    const phase = tether && tether.phase;
    const taut = phase === 'loaded' || phase === 'overload' || cable.loadSmooth > TETHER_TAUT_LOAD;
    const overload = phase === 'overload' || l > TETHER_OVERLOAD_LOAD || cable.strainSmooth > 0.95;
    // Visible-strain read: how far PAST the capture floor the line is working. Feeds the shader's
    // uStrain brightness chatter and the hitch tremble, so a line that has merely caught stays
    // quiet while a line being fought is unmistakable. Deliberately below `l` so the shader's
    // "hot-looking vs genuinely strained" split survives instead of collapsing onto one number.
    // (The geometry shiver keys off `l` directly — it needs the larger amplitude to read at all.)
    const s = Math.max(0, Math.min(1, (l - TETHER_CAPTURE_FLOOR) / (1 - TETHER_CAPTURE_FLOOR)));
    // Bloom is a spill control, not a switch: the cable still radiates with bloom disabled, and a
    // player who raises the slider gets a genuinely hotter rope (see _bloomRadianceScale).
    const radiance = this._bloomRadianceScale();
    // The core carries HEAT and the halo carries COLOUR. The core intensity is deliberately high
    // enough that the filament clips through ACES — that white centre against the coloured falloff
    // is the whole "liquid neon" read (grammar §9.2) and is what the old flat 4.8-7.4 could not do.
    // UVP force-neon: taut / loaded lines push energy above hull-neutral; slack stays quieter.
    const neon = resolveForceNeonScale('taut', this._forceNeonMetrics({ load: l }));
    const neonMul = taut ? neon.energy : (1 + (neon.energy - 1) * 0.35);
    const ribbonFrame = {
      time: visualTime,
      color: this._ctmp,
      tension: l,
      // uStrain in the ribbon shader. Fed the past-capture working read, not tether.strain: the
      // physical ratio is ~1e-4 against a 10.5M breakTension, so uStrain*uStrain was always 0 and
      // the shader's brightness chatter never ran. (energyMaterials.js still documents this uniform
      // as "physical strain" — that comment needs the same correction; it is not this file.)
      strain: s,
      whip: whipEnv,
      overload,
      reel: cable.reelGlow,
      pulseSpeed: 2.8 + l * 1.4 + cable.reelGlow * 4.8 + neon.coreWhite * 1.2,
      // Core: the filament cross-section (pow 9-18) concentrates almost all of this into the middle
      // ~15% of the ribbon, so a number this size buys a two-to-four pixel white line, not a slab.
      intensity: (2.2 + l * 1.7 + cable.reelGlow * 1.5 + whipEnv * 2.1) * radiance * neonMul,
      opacity: (taut ? 0.74 : 0.62) * cable.fade,
    };
    updateEnergyMaterial(cable.mesh.material, ribbonFrame);
    updateEnergyMaterial(cable.glow.material, {
      ...ribbonFrame,
      // Halo: wide and coloured. Its centre needs to clear the bright-pass threshold so the rope
      // gets a real bloom skirt, but only its centre — push this higher and the sheath saturates
      // across its whole width and the cable stops being a cable and becomes a plume.
      intensity: (1.5 + l * 1.5 + cable.reelGlow * 1.2 + whipEnv * 1.7) * radiance * neonMul,
      opacity: (0.24 + 0.20 * l + cable.reelGlow * 0.20 + whipEnv * 0.16) * cable.fade,
    });
    cable.band.material.color.copy(this._ctmp);
    cable.band.material.opacity = Math.min(0.9,
      (0.20 + 0.42 * l + cable.reelGlow * 0.22 + whipEnv * 0.2
        + (tether && tether.phase === 'capture' ? 0.08 : 0)) * cable.fade);

    // Widths, in world units, at roughly 18.7 screen px per wu at the default game camera (fov 50,
    // zoom 72, 60-degree elevation). Read these as pixels:
    //   core  ~0.26-0.36 wu half-width  ->  10-13 px of ribbon carrying a 3-4 px white filament
    //   halo  ~0.62-1.20 wu half-width  ->  23-45 px of coloured sheath
    // The taut line still reads thinner than the slack one — that intent is good and kept — and
    // load swells both slightly so a heavy pull is legible in silhouette alone.
    const w = (taut ? 0.26 : 0.34) + l * 0.08 + whipEnv * 0.08;
    const gw = 0.62 + 0.55 * l + whipEnv * 0.45 + cable.reelGlow * 0.30;
    const SEG = cable.SEG;
    const corePos = cable.mesh.geometry.attributes.position.array;
    const glowPos = cable.glow.geometry.attributes.position.array;
    // Visible strain, in geometry rather than in colour: a loaded line shivers. The amplitude is
    // quadratic in LOAD (see the strain note above — physical strain is ~1e-4 in real play, so the
    // old s*s term was a hard zero and this whole effect never ran). Quadratic keeps the intent: a
    // just-captured line barely trembles (~1 px), a worked line clearly does (~3 px), and a line at
    // the edge of its envelope is unmistakably fighting (~8 px). Purely cosmetic — VFX is exempt
    // from the determinism rule and this never touches sim state.
    // Two components at different spatial frequencies. A single per-segment term aliased into a
    // sawtooth at 40 segments and read as jagged lightning rather than a cable under load.
    const shiverAmp = l * l * TETHER_LOAD_SHIVER_WU * Math.min(1, chord / 40);
    const shiverPhase = visualTime * 41;
    const shiverPhaseFast = visualTime * 97;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const arc = Math.sin(Math.PI * t);
      const wave = whipAmp * Math.sin(Math.PI * whipHarmonic * t - whipT * whipFreq) * arc;
      const shiver = shiverAmp * arc
        * (Math.sin(shiverPhase + t * 21.7) * 0.72 + Math.sin(shiverPhaseFast + t * 47.3) * 0.28);
      const off = slackBow * arc + wave + shiver;
      const cx = ax + dx * t + px * off;
      const cz = az + dz * t + pz * off;
      const o = i * 6;
      corePos[o] = cx + px * w; corePos[o + 1] = 1.5; corePos[o + 2] = cz + pz * w;
      corePos[o + 3] = cx - px * w; corePos[o + 4] = 1.5; corePos[o + 5] = cz - pz * w;
      glowPos[o] = cx + px * gw; glowPos[o + 1] = 1.4; glowPos[o + 2] = cz + pz * gw;
      glowPos[o + 3] = cx - px * gw; glowPos[o + 4] = 1.4; glowPos[o + 5] = cz - pz * gw;
    }
    cable.mesh.geometry.attributes.position.needsUpdate = true;
    cable.glow.geometry.attributes.position.needsUpdate = true;
    const bandPos = cable.band.geometry.attributes.position.array;
    const ux = dx / chord;
    const uz = dz / chord;
    // Strain ladder. These used to be short wide rectangles wider than the rope itself, which read
    // as loose rungs floating alongside the cable rather than as load banding running through it.
    // Now they hug the core (only slightly proud of it) and lengthen as the line loads.
    const bandHalfLen = Math.min(1.9, Math.max(0.5, chord / (SEG * 3.2))) * (1 + l * 0.55);
    const bandHalfWidth = w * 1.22 + 0.10 + l * 0.14;
    for (let i = 0; i < cable.BANDS; i++) {
      const t = (i + 1) / (cable.BANDS + 1);
      const arc = Math.sin(Math.PI * t);
      const wave = whipAmp * Math.sin(Math.PI * whipHarmonic * t - whipT * whipFreq) * arc;
      const shiver = shiverAmp * arc
        * (Math.sin(shiverPhase + t * 21.7) * 0.72 + Math.sin(shiverPhaseFast + t * 47.3) * 0.28);
      const off = slackBow * arc + wave + shiver;
      const cx = ax + dx * t + px * off;
      const cz = az + dz * t + pz * off;
      const o = i * 12;
      bandPos[o] = cx - ux * bandHalfLen + px * bandHalfWidth; bandPos[o + 1] = 1.55; bandPos[o + 2] = cz - uz * bandHalfLen + pz * bandHalfWidth;
      bandPos[o + 3] = cx - ux * bandHalfLen - px * bandHalfWidth; bandPos[o + 4] = 1.55; bandPos[o + 5] = cz - uz * bandHalfLen - pz * bandHalfWidth;
      bandPos[o + 6] = cx + ux * bandHalfLen + px * bandHalfWidth; bandPos[o + 7] = 1.55; bandPos[o + 8] = cz + uz * bandHalfLen + pz * bandHalfWidth;
      bandPos[o + 9] = cx + ux * bandHalfLen - px * bandHalfWidth; bandPos[o + 10] = 1.55; bandPos[o + 11] = cz + uz * bandHalfLen - pz * bandHalfWidth;
    }
    cable.band.geometry.attributes.position.needsUpdate = true;
    const isLargeAnchor = tr >= 18 || anchorEnt.type === 'station';
    cable.anchor.position.set(mx, 1.62, mz);
    const anchorScale = isLargeAnchor
      ? Math.max(6.5, Math.min(28, tr * 0.24))
      : Math.max(3.8, Math.min(18, tr * 0.16));
    // The hitch breathes with load and shivers with strain, so the point where the force is actually
    // applied is the second-loudest thing after the rope itself. The ring used to sit at a fixed
    // radius on a fixed opacity, which read as a flat HUD donut pasted onto the world.
    const hitchBreath = 1 + l * 0.16 + Math.sin(visualTime * (6 + l * 9)) * (0.03 + s * 0.09);
    cable.anchor.scale.setScalar(anchorScale * hitchBreath);
    cable.anchor.rotation.y = visualTime * (1.8 + l * 2.6 + cable.reelGlow * 4.0);
    cable.anchor.material.color.copy(this._ctmp);
    cable.anchor.material.opacity = Math.min(1,
      (0.52 + 0.40 * l + whipEnv * 0.32 + cable.reelGlow * 0.34) * cable.fade);
    cable.anchorCore.position.set(mx, 1.64, mz);
    // The hitch core is the white-hot point of contact — it stays near-white while the ring keeps
    // the tension colour, mirroring the core/halo split on the rope itself.
    cable.anchorCore.scale.setScalar(Math.max(1.4, anchorScale * (0.44 + l * 0.16)) * hitchBreath);
    cable.anchorCore.rotation.y = -visualTime * (2.4 + l * 3.2);
    cable.anchorCore.material.color.copy(this._ctmp).lerp(this._tetherColorWhite, 0.45 + l * 0.35 + whipEnv * 0.2);
    cable.anchorCore.material.opacity = Math.min(1,
      (0.72 + 0.28 * l + whipEnv * 0.28 + cable.reelGlow * 0.42) * cable.fade);
    // Body outline for large anchors only — "this whole thing is what you have hold of". A small
    // rock does not need it: the hitch ring plus its gradient core already reads, and drawing a
    // second big ring around an ordinary asteroid put a flat disc over the play area for no
    // information gain.
    cable.targetHaloActive = isLargeAnchor;
    if (cable.targetHalo) {
      const haloLocal = this._toLocalXZ(anchorEnt.pos.x, anchorEnt.pos.z, this._entityLocalXZ);
      cable.targetHalo.position.set(haloLocal.x, 1.58, haloLocal.z);
      cable.targetHalo.scale.setScalar(Math.max(anchorScale * 1.6, tr * 1.08));
      cable.targetHalo.rotation.y = visualTime * 0.65;
      cable.targetHalo.material.color.copy(this._ctmp);
      cable.targetHalo.material.opacity = isLargeAnchor
        ? (0.20 + 0.20 * l + whipEnv * 0.12) * cable.fade
        : 0;
    }
    setTetherCableVisible(cable, true);

    // Sparks crawling the line — the about-to-part read, and the RAREST thing this effect does.
    //
    // This gate used to read `s > 0.55` against physical strain. It was harmless only because
    // strain is ~1e-4 in real play, and it was a live trap: the moment anyone renormalized strain
    // the rope would have sparked permanently. It now keys off the same load read as everything
    // else, at TETHER_SPARK_LOAD (0.72) — above the 0.55 'loaded' floor that a hard pull reaches,
    // so ordinary play NEVER sparks (measured: 0 spark ticks in 240 ticks of full opposing thrust
    // on a 640-mass rock), and only an overload phase or a genuinely large strain gets here.
    // A break is an engineered event; its telegraph has to be too.
    // Spawn expects galactic-global XZ.
    if (l > TETHER_SPARK_LOAD) {
      const heat = (l - TETHER_SPARK_LOAD) / (1 - TETHER_SPARK_LOAD);
      const sparkChance = heat * 0.9 * (this._burst || 1);
      const sparks = Math.random() < sparkChance ? (overload ? 2 : 1) : 0;
      for (let k = 0; k < sparks; k++) {
        const frac = Math.random();
        this._c0.set('#ffffff'); this._c1.copy(this._tetherColorHot);
        const lateral = (Math.random() - 0.5) * (14 + heat * 26);
        this._spawnParticle(axG + dx * frac, azG + dz * frac,
          px * lateral, pz * lateral,
          0.12 + Math.random() * 0.14, 1.0 + heat * 0.8, 0.0, this._c0, this._c1, 3.2, 1.4, 0);
      }
    }
  },

  // -------------------------------------------------------------------------
  // Mining seam markers (GDD §5.1): asteroids carry 1-4 fracture seams (asteroid.data.seams,
  // deterministic) where beam yield is 100% vs 35% off-seam — this layer makes them AIMABLE.
  // Always faintly visible in close range (discoverable by flying near), blazing for the scanner
  // highlight window after a C-pulse. One InstancedMesh, zero per-frame allocation.
  // -------------------------------------------------------------------------
  _initSeamMarkers() {
    if (!this._scene) return;
    const { mesh, capacity: CAP } = createSeamMarkerPipelineMesh();
    const dynamicBufferOwner = registerDynamicBufferOwner(this._scene, {
      id: 'vfx-seam-markers',
      mesh,
      attributes: [
        { name: 'matrix', attribute: mesh.instanceMatrix },
        { name: 'color', attribute: mesh.instanceColor },
      ],
    });
    this._scene.add(mesh);
    this._seamMarkers = { mesh, CAP, dynamicBufferOwner };
    this._seamMat4 = new THREE.Matrix4();
    this._seamDim = new THREE.Color('#ffb35c');     // amber — visible but quiet
    this._seamHot = new THREE.Color('#d7e6ff');     // scanner-lit — aim here
    this._seamLock = new THREE.Color('#39d0ff');    // active seam confirmation
    this._miningSeamPulseId = null;
    this._miningSeamPulseUntil = 0;
  },

  _updateSeamMarkers(dt) {
    const sm = this._seamMarkers;
    if (!sm) return;
    const state = this.state;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(state.playerId);
    if (!player) {
      if (!commitDynamicBufferOwner(sm.dynamicBufferOwner, 0) && sm.mesh.count) sm.mesh.count = 0;
      return;
    }
    assertDynamicBufferOwnerWritable(sm.dynamicBufferOwner);
    const simTime = state.simTime || 0;
    const pulse = 0.82 + 0.18 * Math.sin(this._t * 4.2);
    let n = 0;
    const list = state.entityList || [];
    for (let i = 0; i < list.length && n < sm.CAP; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'asteroid') continue;
      const seams = e.data && e.data.seams;
      if (!seams || !seams.length) continue;
      // Range cull stays galactic-global (origin-invariant); instance matrices are frame-local.
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      if (dx * dx + dz * dz > 640 * 640) continue;      // draw range
      const scanned = (e.data.scanHighlightUntil || 0) > simTime;
      const seamLocked = e.id === this._miningSeamPulseId && simTime <= this._miningSeamPulseUntil;
      const cr = Math.cos(e.rot || 0), sr = Math.sin(e.rot || 0);
      for (let s = 0; s < seams.length && n < sm.CAP; s++) {
        const lo = seams[s].localOffset || { x: 0, z: 0 };
        const wxG = e.pos.x + lo.x * cr - lo.z * sr;
        const wzG = e.pos.z + lo.x * sr + lo.z * cr;
        const wLocal = this._toLocalXZ(wxG, wzG, this._spawnLocalXZ);
        const scale = (seamLocked ? 1.8 : scanned ? 1.5 : 0.9) * pulse * Math.min(2.2, 0.7 + (e.radius || 8) * 0.05);
        this._seamMat4.makeScale(scale, 1, scale);
        this._seamMat4.setPosition(wLocal.x, 1.8, wLocal.z);
        sm.mesh.setMatrixAt(n, this._seamMat4);
        this._ctmp.copy(seamLocked ? this._seamLock : scanned ? this._seamHot : this._seamDim);
        if (scanned || seamLocked) this._ctmp.multiplyScalar(pulse * 1.15);
        sm.mesh.setColorAt(n, this._ctmp);
        n++;
      }
    }
    if (sm.dynamicBufferOwner) {
      if (n > 0) {
        markDynamicBufferItems(sm.dynamicBufferOwner, INSTANCED_MATRIX_BUFFER, 0, n);
        markDynamicBufferItems(sm.dynamicBufferOwner, INSTANCED_COLOR_BUFFER, 0, n);
      }
      commitDynamicBufferOwner(sm.dynamicBufferOwner, n);
    } else if (sm.mesh.count !== n || n > 0) {
      sm.mesh.count = n;
      sm.mesh.instanceMatrix.needsUpdate = true;
      if (sm.mesh.instanceColor) sm.mesh.instanceColor.needsUpdate = true;
    }
  },

  // Snap burst at both cable ends when the line breaks under load (tether:broken).
  // Top-50 rank-2 massline pack: louder break — dual-end sparks + white-hot flash + longer scatter.
  _tetherBreakMatchesCable(p, cable = this._tetherCable) {
    if (!p || !cable || !(cable.wasActive || cable.fade > 0.001)) return false;
    if (cable.lastSourceId == null || cable.lastTargetId == null) return false;
    if (p.targetId != null && !sameTetherIdentity(p.targetId, cable.lastTargetId)) return false;
    // actorId names the controller that cut the attachment; it is not necessarily the rendered
    // remote source. Only an explicitly published source/owner id may constrain that endpoint.
    const receiptSourceId = p.sourceId != null ? p.sourceId : (p.ownerId != null ? p.ownerId : null);
    if (receiptSourceId != null && !sameTetherIdentity(receiptSourceId, cable.lastSourceId)) return false;

    const receiptAttachmentId = p.attachmentId;
    const retainedAttachmentId = cable.lastAttachmentId;
    if (receiptAttachmentId != null || retainedAttachmentId != null) {
      return receiptAttachmentId != null && retainedAttachmentId != null
        && sameTetherIdentity(receiptAttachmentId, retainedAttachmentId);
    }
    // Legacy presentation receipts did not carry attachmentId. Target identity is the narrowest
    // safe fallback; a receipt without either identity cannot claim the retained cable.
    return p.targetId != null && sameTetherIdentity(p.targetId, cable.lastTargetId);
  },

  _onTetherSnap(p) {
    const cable = this._tetherCable;
    if (!cable || !this._scene || !this._tetherBreakMatchesCable(p, cable)) return false;
    const source = this._ent(cable.lastSourceId);
    const target = this._ent(cable.lastTargetId);
    if (!source || !target) return false;
    const endpoints = cable.endpointScratch || (cable.endpointScratch = {});
    const hasEndpoints = writeTetherVisualEndpoints(source, target, cable.lastRemote, endpoints);

    this._emitJuiceCue('presentation.tether.break', p, 1.5);
    // Do NOT hide the cable. A break is the most violent thing the massline ever does and it used
    // to be the only event in the game with no line on screen at all: the ribbon was hidden on the
    // same frame the sparks appeared. Hold it, whip it, and let it burn out.
    //
    // This is presentation only. The line is deliberately near-unbreakable and a break is an
    // ENGINEERED event (bomb-web hub, cutting charge), never an ambient one — nothing here changes
    // when a break happens, only what it looks like when one does.
    cable.snapAge = 0;
    cable.latchAge = 999;
    cable.fadeRate = TETHER_SNAP_FADE_RATE;
    cable.wasActive = false;
    if (cable.fade < 1) cable.fade = 1;
    // A valid receipt can still describe overlapping endpoints (for example, a source embedded in
    // a despawning target). Keep the retained line's fade state, but do not stack two identical
    // bursts or divide a zero-length recoil chord.
    if (!hasEndpoints) return true;

    // Trailing streak: the recoiling line reads as light dragged through space. Anisotropic sprites
    // stretched ALONG the broken chord (the instanced pool already carries aspect + roll), laid down
    // from each end toward the middle so both halves visibly snap back.
    const dx = endpoints.bx - endpoints.ax;
    const dz = endpoints.bz - endpoints.az;
    const chord = endpoints.chord;
    const ux = dx / chord, uz = dz / chord;
    const roll = Math.atan2(uz, ux);
    const px = -uz, pz = ux;
    const lash = Math.max(4, Math.round(9 * (this._burst || 1)));
    for (let k = 0; k < lash; k++) {
      const f = (k + 0.5) / lash;
      // Recoil is fastest at the ends and slowest mid-span, like a real parting cable.
      const endBias = Math.abs(f - 0.5) * 2;
      const recoil = (28 + 120 * endBias) * (f < 0.5 ? -1 : 1);
      const lateral = (Math.random() - 0.5) * 46;
      this._spawnSprite(
        SPR_FLASH,
        endpoints.ax + dx * f, 1.5, endpoints.az + dz * f,
        0.16 + Math.random() * 0.14,
        Math.min(14, chord * 0.16), 1.2,
        0.95, 0.0,
        k % 3 === 0 ? '#ffffff' : '#ffb35c',
        ux * recoil + px * lateral, uz * recoil + pz * lateral,
        3.5, roll,
      );
    }

    // Spark exactly at the two visible cable endpoints. The prior 34-per-end burst could consume 68
    // particle slots before the recoil ribbon and lights were admitted; preserve the dual-end read
    // with a quality-scaled 14..22 budget instead.
    this._c0.set('#ffffff'); this._c1.set('#ff5c5c');
    for (let end = 0; end < 2; end++) {
      const endX = end === 0 ? endpoints.ax : endpoints.bx;
      const endZ = end === 0 ? endpoints.az : endpoints.bz;
      const n = Math.min(22, Math.max(14, Math.round(22 * (this._burst || 1))));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = 34 + Math.random() * 110;
        // Spark trails inherit their own direction so they streak instead of dotting.
        this._spawnParticle(endX, endZ, Math.cos(a) * v, Math.sin(a) * v,
          0.24 + Math.random() * 0.34, 1.5, 0.0, this._c0, this._c1, 4.2, 0, 0, a, 0.85);
      }
      this._spawnSprite(SPR_FLASH, endX, 0, endZ, 0.10, 4.6, 9.5, 1.0, 0.0, '#fff2e2', 0, 0);
      // The recoil ring is a shock, not a smoke cloud: fast, thin and hot. At 16 wu it swallowed the
      // whole ship in a flat orange donut for a third of a second.
      this._spawnSprite(SPR_RING, endX, 0.9, endZ, 0.26, 1.4, 8.5, 0.55, 0.0, '#ffc9a0', 0, 0);
      this._flashLight({ x: endX, z: endZ }, '#ffb0a0', 5.4, 12, 200);
    }
    return true;
  },

  // Latch spark at BOTH ends when a tether attaches (tether:attached).
  // Top-50 rank-2: nose + target cyan ring, denser sparks, punchier light (Steam still readable).
  _onTetherLatch(p) {
    this._emitJuiceCue('presentation.tether.attach', p, 1);
    if (!this._scene) return;
    const target = p && p.targetId != null ? this._ent(p.targetId) : null;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    this._c0.set('#a6f0ff'); this._c1.set('#39d0ff');
    const ends = [];
    if (player && player.pos) {
      const cf = Math.cos(player.rot || 0), sf = Math.sin(player.rot || 0);
      const noseR = (player.radius || 6);
      ends.push({ x: player.pos.x + cf * noseR, z: player.pos.z + sf * noseR });
    }
    if (target && target.pos) ends.push({ x: target.pos.x, z: target.pos.z });
    if (!ends.length) return;
    for (const pos of ends) {
      const n = Math.max(12, Math.round(20 * (this._burst || 1)));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = 18 + Math.random() * 42;
        this._spawnParticle(pos.x, pos.z, Math.cos(a) * v, Math.sin(a) * v,
          0.28 + Math.random() * 0.24, 1.55, 0.0, this._c0, this._c1, 3.4, 0, 0);
      }
      this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.07, 3.0, 5.8, 0.9, 0.0, '#a6f0ff', 0, 0);
      this._flashLight({ x: pos.x, z: pos.z }, '#39d0ff', 3.2, 12, 140);
    }
  },

  // Cruise state juice (spec2/02 §1 + §3), sharing the same directional travel grammar as jumps.
  // Locked palette only; no radial starburst or generic flash.
  _onCruiseCharging(p) {
    this._emitJuiceCue('cruise.charging', p, 1);
    if (!this._scene) return;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    if (!player || !player.pos) return;
    const dx = Math.cos(player.rot || 0), dz = Math.sin(player.rot || 0);
    if (!this._isReduced()) this._spawnTravelVectorWake(player.pos, dx, dz, 8, '#d7e6ff', '#39d0ff', 22, 0.48);
    this._spawnSprite(SPR_RING, player.pos.x - dx * 4, 0, player.pos.z - dz * 4,
      0.62, 12, 5, this._isReduced() ? 0.24 : 0.5, 0, '#39d0ff', dx * 3, dz * 3);
  },

  _onCruiseEngaged(p) {
    this._emitJuiceCue('cruise.engaged', p, 2);
    if (!this._scene) return;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    if (!player || !player.pos) return;
    const dx = Math.cos(player.rot || 0), dz = Math.sin(player.rot || 0);
    if (!this._isReduced()) this._spawnTravelVectorWake(player.pos, dx, dz, 20, '#d7e6ff', '#39d0ff', 62, 0.72);
    this._spawnSprite(SPR_RING, player.pos.x + dx * 5, 0, player.pos.z + dz * 5,
      0.72, 4, 22, this._isReduced() ? 0.28 : 0.62, 0, '#39d0ff', dx * 12, dz * 12);
  },

  _onCruiseDropped(p) {
    this._emitJuiceCue('cruise.dropped', p, 1);
    if (!this._scene) return;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    if (!player || !player.pos) return;
    const dx = Math.cos(player.rot || 0), dz = Math.sin(player.rot || 0);
    const quiet = p && p.reason === 'manual';
    const primary = quiet ? '#39d0ff' : '#ff5c5c';
    if (!quiet && !this._isReduced()) {
      this._spawnTravelVectorWake(player.pos, -dx, -dz, 10, '#ffb35c', '#ff5c5c', 30, 0.48);
    }
    this._spawnSprite(SPR_RING, player.pos.x, 0, player.pos.z,
      quiet ? 0.35 : 0.55, quiet ? 8 : 18, quiet ? 12 : 5, this._isReduced() ? 0.24 : (quiet ? 0.34 : 0.62), 0, primary, 0, 0);
  },

  _onChargeDetonated(p) {
    this._emitJuiceCue('combat.damage.charge', p, 2);
    if (!this._scene || !p || !p.pos) return;
    const pos = p.pos;
    const r = Math.max(4, p.radius || 12);
    const neon = resolveForceNeonScale('impulse', this._forceNeonMetrics());
    const op = Math.min(1, 0.85 * neon.energy * 0.55);
    // white core + palette shockwave, radius-scaled (spec2/02 §3) — neon-boosted force layer
    this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.10, r * 0.6 * neon.energy * 0.55, r * 2.2 * neon.energy * 0.5, 1.0, 0.0, '#ffffff', 0, 0);
    this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.55, r * 0.4, r * 3.5 * neon.particleBoost * 0.7, Math.min(1, 0.85 * neon.energy * 0.5), 0.0, '#39d0ff', 0, 0);
    this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.70, r * 0.6, r * 4.5 * neon.particleBoost * 0.7, Math.min(1, 0.55 * neon.energy * 0.55), 0.0, '#ffb35c', 0, 0);
    this._c0.set('#ffffff'); this._c1.set('#39d0ff');
    const burst = Math.max(10, Math.round(24 * (this._burst || 1) * neon.particleBoost));
    for (let k = 0; k < burst; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = (20 + Math.random() * 55) * neon.particleBoost;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * v, Math.sin(a) * v,
        0.25 + Math.random() * 0.25, 1.8 * neon.energy * 0.55, 0.0, this._c0, this._c1, 2.0, 0, 0);
    }
    this._flashLight({ x: pos.x, z: pos.z }, '#39d0ff', 6.0 * neon.lightPeak, 8, 220 + neon.coreWhite * 40);
    void op;
  },

  // SF-10 wall-impact payoff (combat:collisionConsequence). A light hull slammed into terrain /
  // structure by a concussion slug, a mine shove, or a massline throw. A compressive PUNCH plus
  // directional dust skimming the contact — NOT a fireball (this is kinetic) and NOT a primary ring
  // (graphics-checkpoint reject list). Scale tracks the receipted deltaV; a tumble reads harder.
  // Pooled sprites/lights only; reduced-flash aware; consumes the receipt geometry (no query).
  _onCollisionConsequence(p) {
    if (!this._scene || !p || !p.pos) return false;
    const realControl = p.control === 'stagger' || p.control === 'tumble';
    const realDamage = Math.max(0, Number(p.impactDamage) || 0) > 0;
    if (!realControl && !realDamage) return false;
    this._rememberMediumCollision(p);
    const pos = p.pos;
    const acc = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    const reduced = acc.flashOpacityScale < 1;
    const dv = Math.max(0, Number(p.deltaV) || 0);
    const hard = p.control === 'tumble';
    const magnitude = Math.max(0.6, Math.min(2.4, dv / 14));
    const scale = magnitude * acc.flashSizeScale;
    const op = acc.flashOpacityScale;
    const nx = Number(p.normal && p.normal.x) || 0;
    const nz = Number(p.normal && p.normal.z) || 0;
    const nlen = Math.hypot(nx, nz) || 1;
    const ox = -nx / nlen, oz = -nz / nlen;        // outward from the struck surface
    const tx = -oz, tz = ox;                        // tangent along the surface
    const terrain = p.surface === 'terrain';
    // Compression punch: a tight, brief flash driven outward along the contact, not a soft disc.
    this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.10, 1.1 * scale, 3.4 * scale, 0.9 * op, 0.0,
      terrain ? '#ffe9c4' : '#dfefff', ox * 6, oz * 6);
    // Dust / spall skimming the surface, thrown outward + fanned along the tangent.
    const puffs = reduced ? (hard ? 2 : 1) : (hard ? 5 : 3);
    for (let k = 0; k < puffs; k++) {
      const spread = (k - (puffs - 1) * 0.5) * 0.5;
      const vx = ox * (10 + dv * 0.4) + tx * spread * 14;
      const vz = oz * (10 + dv * 0.4) + tz * spread * 14;
      this._spawnSprite(SPR_PUFF, pos.x, 0.05, pos.z, 0.5 + 0.2 * scale, 1.6 * scale, 4.2 * scale,
        0.42 * op, 0.0, terrain ? '#c9a878' : '#aac4e0', vx, vz);
    }
    // The medium rung always retains one normal-locked compression bar. Reduced settings shorten
    // travel/count/opacity but never erase the contact direction or substitute a circular flash.
    this._spawnProjectileTrailStreak(pos.x, 0.18, pos.z,
      reduced ? 0.24 : (hard ? 0.44 : 0.34),
      (reduced ? 0.07 : 0.10) * scale,
      (reduced ? 1.8 : (hard ? 4.8 : 3.4)) * scale,
      (reduced ? 0.28 : 0.60) * op,
      terrain ? '#f0d0a0' : '#d4e6f5',
      ox * (reduced ? 4 : 10), oz * (reduced ? 4 : 10), ox, oz);
    const lightPeak = 2.6 * magnitude * acc.eventLightPeakScale;
    if (lightPeak > 0.01) {
      this._flashLight({ x: pos.x, z: pos.z }, terrain ? '#ffcaa0' : '#bcd8ff', lightPeak, 9, 120 + dv * 3);
    }
    return true;
  },

  // Deterministic debris count from the receipt → directional fragments flung off the contact along
  // the surface normal. Pooled particle substrate (discrete event, no per-frame allocation) and the
  // receipt's normal/count are consumed directly — never a spatial-hash query.
  _onCollisionDebris(p) {
    if (!this._scene || !p || !p.pos || !this._consumeMediumCollision(p)) return false;
    const acc = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    const count = Math.max(0, Math.min(18, Math.round(Number(p.count) || 0)));
    if (count <= 0) return false;
    const pos = p.pos;
    const nx = Number(p.normal && p.normal.x) || 0;
    const nz = Number(p.normal && p.normal.z) || 0;
    const nlen = Math.hypot(nx, nz) || 1;
    const baseAng = Math.atan2(-nz / nlen, -nx / nlen); // outward from the surface
    const terrain = p.surface === 'terrain';
    this._c0.set(terrain ? '#d8c090' : '#c4d8ec');
    this._c1.set(terrain ? '#6a4a28' : '#33506e');
    const emit = Math.max(1, Math.round(count * (acc.flashOpacityScale < 1 ? 0.5 : 1)));
    const serial = this._collisionPatternSerial(p);
    for (let k = 0; k < emit; k++) {
      const a = baseAng + explosionPatternSigned(serial, 'terrain-spall', k, 23) * 0.7;
      const v = 24 + explosionPattern01(serial, 'terrain-spall', k, 24) * 60;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * v, Math.sin(a) * v,
        0.3 + explosionPattern01(serial, 'terrain-spall', k, 25) * 0.35,
        1.2, 0.0, this._c0, this._c1, 2.2, 0, 0, a,
        acc.flashOpacityScale < 1 ? 1.8 : 2.8);
    }
    return true;
  },

  // AI telegraph / flee / formation break markers (spec2/02 §3 + M1 doctrine tells).
  // Doctrine telegraphs are enemy-linked (or truthful offscreen direction) and sustain for the
  // full pre-consequence window (default ≥30 sim ticks). Sim owns the hold-fire gate; VFX only
  // presents — never writes sim state, never uses wall-clock for lifetime.
  // Lifetime: state.tick / startTick / deadlineTick so pause/tab render frames cannot burn the window.
  _onAiTelegraph(p) {
    this._emitJuiceCue('ai.telegraph', p, 1);
    if (!this._scene) return;
    this._beginDoctrineTell(p || {});
  },

  _classifyDoctrineTell(p) {
    const kind = String((p && p.kind) || '');
    const doctrineId = String((p && p.doctrineId) || '');
    if (kind === 'engine_flare' || doctrineId === 'interceptor_flyby') return DOCTRINE_TELL_KIND.FLYBY;
    if (kind === 'attach_spool' || doctrineId === 'tether_control_raider') return DOCTRINE_TELL_KIND.TETHER;
    if (kind === 'weapon_charge' || doctrineId === 'ranged_disengager') return DOCTRINE_TELL_KIND.CHARGE;
    return DOCTRINE_TELL_KIND.GENERIC;
  },

  _doctrineTellStyle(tellKind, reduced) {
    // Locked palette tokens (spec2/00 §3). Reduced-motion/flash keeps shape+direction readable
    // with rings only, lower peak opacity, and no event lights.
    if (tellKind === DOCTRINE_TELL_KIND.FLYBY) {
      return {
        color0: '#ff5c5c', color1: '#ffb35c', light: '#ff7040',
        coreOp: reduced ? 0.55 : 0.78, ringOp: reduced ? 0.48 : 0.62,
        linkOp: reduced ? 0.42 : 0.55, useLight: !reduced,
      };
    }
    if (tellKind === DOCTRINE_TELL_KIND.TETHER) {
      return {
        color0: '#39d0ff', color1: '#d7e6ff', light: '#5fd7ff',
        coreOp: reduced ? 0.52 : 0.72, ringOp: reduced ? 0.46 : 0.58,
        linkOp: reduced ? 0.40 : 0.55, useLight: !reduced,
      };
    }
    if (tellKind === DOCTRINE_TELL_KIND.CHARGE) {
      return {
        color0: '#ffb35c', color1: '#ffffff', light: '#ffcc66',
        coreOp: reduced ? 0.55 : 0.80, ringOp: reduced ? 0.48 : 0.65,
        linkOp: reduced ? 0.42 : 0.58, useLight: !reduced,
      };
    }
    return {
      color0: '#ffcc44', color1: '#ffb35c', light: '#ffcc44',
      coreOp: reduced ? 0.45 : 0.55, ringOp: reduced ? 0.40 : 0.55,
      linkOp: reduced ? 0.35 : 0.45, useLight: !reduced,
    };
  },

  _beginDoctrineTell(p) {
    const entityId = p.entityId;
    const targetId = p.targetId != null ? p.targetId : (this.state && this.state.playerId);
    const tellKind = this._classifyDoctrineTell(p);
    const durationTicks = Math.max(30, Math.floor(Number(p.durationTicks) || 30));
    // Prefer payload tick, else live sim tick; null → headless age/life fallback only.
    const startTick = Number.isInteger(p.tick) ? p.tick
      : (this.state && Number.isInteger(this.state.tick) ? this.state.tick : null);
    const deadlineTick = startTick != null ? startTick + durationTicks : null;
    // Frame-dt life is only used when tick is unavailable (headless / no sim clock).
    const life = Math.max(DOCTRINE_TELL_MIN_LIFE, durationTicks / 60);
    const reduced = this._isReduced();
    const enemy = this._ent(entityId);
    const offscreen = !this._doctrineTellOnScreen(enemy);

    // Prefer reusing a slot already tracking this entity; else free → LRU (soonest deadline / lowest life).
    let slot = null;
    const pool = this._doctrineTells;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].alive && pool[i].entityId === entityId) { slot = pool[i]; break; }
    }
    if (!slot) {
      for (let i = 0; i < pool.length; i++) {
        if (!pool[i].alive) { slot = pool[i]; break; }
      }
    }
    if (!slot) {
      let worst = pool[0];
      for (let i = 1; i < pool.length; i++) {
        const a = pool[i];
        const aRem = a.deadlineTick != null && Number.isInteger(this.state && this.state.tick)
          ? (a.deadlineTick - this.state.tick)
          : (a.life - a.age);
        const wRem = worst.deadlineTick != null && Number.isInteger(this.state && this.state.tick)
          ? (worst.deadlineTick - this.state.tick)
          : (worst.life - worst.age);
        if (aRem < wRem) worst = a;
      }
      slot = worst;
    }

    const wasAlive = slot.alive;
    slot.alive = true;
    slot.age = 0;
    slot.life = life;
    slot.pulse = 0;
    slot.entityId = entityId;
    slot.targetId = targetId;
    slot.kind = tellKind;
    slot.doctrineId = p.doctrineId || null;
    slot.telegraphKind = p.kind || null;
    slot.durationTicks = durationTicks;
    slot.startTick = startTick;
    slot.deadlineTick = deadlineTick;
    slot.offscreen = offscreen;
    slot.reduced = reduced;
    if (!wasAlive) this._doctrineTellActive = Math.min(DOCTRINE_TELL_POOL, (this._doctrineTellActive || 0) + 1);
    this._doctrineTellStarts = (this._doctrineTellStarts || 0) + 1;
    this._lastDoctrineTell = {
      kind: tellKind,
      telegraphKind: slot.telegraphKind,
      doctrineId: slot.doctrineId,
      entityId,
      targetId,
      durationTicks,
      life,
      startTick,
      deadlineTick,
      offscreen,
      reduced,
      tick: startTick,
    };

    this._spawnDoctrineTellPulse(slot, true);
  },

  _doctrineTellOnScreen(entity) {
    if (!entity || !entity.pos) return false;
    const camera = this.state && this.state.render && this.state.render.camera;
    if (!camera || typeof camera.project !== 'function') {
      // Headless / no camera: treat as on-screen if near the player so link cues still fire.
      const pp = this._playerPos();
      const d = Math.hypot((entity.pos.x || 0) - (pp.x || 0), (entity.pos.z || 0) - (pp.z || 0));
      return d < 900;
    }
    const scratch = this._doctrineTellScreenScratch || this._trailScreenScratch;
    const local = this._toLocalXZ(
      Number.isFinite(entity.pos.x) ? entity.pos.x : 0,
      Number.isFinite(entity.pos.z) ? entity.pos.z : 0,
      this._entityLocalXZ,
    );
    scratch.set(local.x, 0, local.z);
    scratch.project(camera);
    const pad = 0.12;
    return scratch.x >= -1 - pad && scratch.x <= 1 + pad
      && scratch.y >= -1 - pad && scratch.y <= 1 + pad
      && scratch.z >= -1 && scratch.z <= 1;
  },

  _doctrineTellEndpoints(slot) {
    const enemy = this._ent(slot.entityId);
    const target = this._ent(slot.targetId) || this._ent(this.state && this.state.playerId);
    const player = this.helpers && this.helpers.player
      ? this.helpers.player()
      : this._ent(this.state && this.state.playerId);
    const enemyPos = enemy && enemy.pos ? enemy.pos : null;
    const targetPos = (target && target.pos) || (player && player.pos) || null;
    return { enemy, target, player, enemyPos, targetPos };
  },

  _spawnDoctrineTellPulse(slot, isStart) {
    if (!this._scene || !slot) return;
    const style = this._doctrineTellStyle(slot.kind, slot.reduced);
    const { enemy, enemyPos, targetPos, player } = this._doctrineTellEndpoints(slot);
    const onScreen = this._doctrineTellOnScreen(enemy);
    slot.offscreen = !onScreen;

    // Truthful offscreen directional cue near the player along the real enemy bearing.
    if (!onScreen || !enemyPos) {
      const origin = (player && player.pos) || targetPos || this._playerPos();
      if (!origin) return;
      let dx = 0;
      let dz = 1;
      if (enemyPos) {
        dx = (enemyPos.x || 0) - (origin.x || 0);
        dz = (enemyPos.z || 0) - (origin.z || 0);
      } else if (Number.isFinite(slot._lastDx) && Number.isFinite(slot._lastDz)) {
        dx = slot._lastDx;
        dz = slot._lastDz;
      }
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      slot._lastDx = dx;
      slot._lastDz = dz;
      const cx = (origin.x || 0) + ux * DOCTRINE_TELL_OFFSCREEN_R;
      const cz = (origin.z || 0) + uz * DOCTRINE_TELL_OFFSCREEN_R;
      this._spawnDoctrineTellOffscreenCue(slot, style, cx, cz, ux, uz, isStart);
      return;
    }

    // On-screen: mark the live enemy and draw a contact link toward the actual target.
    const r = (enemy && enemy.radius) || 8;
    this._spawnDoctrineTellEnemyMark(slot, style, enemyPos.x, enemyPos.z, r, isStart);
    if (targetPos) {
      this._spawnDoctrineTellLink(slot, style, enemyPos.x, enemyPos.z, targetPos.x, targetPos.z, isStart);
    }
  },

  _spawnDoctrineTellEnemyMark(slot, style, x, z, r, isStart) {
    const reduced = slot.reduced;
    const life = reduced ? 0.38 : (isStart ? 0.48 : 0.28);
    const s0 = Math.max(4, r * 0.9);
    const s1 = Math.max(10, r * (slot.kind === DOCTRINE_TELL_KIND.CHARGE ? 3.2 : 2.6));
    // Rings carry the tell under reduced flash; full mode adds a core flash on start only.
    this._spawnSprite(SPR_RING, x, 0, z, life, s0, s1, style.ringOp, 0.0, style.color0, 0, 0);
    if (isStart && !reduced) {
      this._spawnSprite(SPR_FLASH, x, 0, z, 0.18, s0 * 0.55, s1 * 0.75, style.coreOp, 0.0, style.color1, 0, 0);
    } else if (isStart && reduced) {
      this._spawnSprite(SPR_RING, x, 0, z, 0.42, s0 * 0.7, s1 * 0.95, style.coreOp * 0.9, 0.0, style.color1, 0, 0);
    }
    if (slot.kind === DOCTRINE_TELL_KIND.FLYBY) {
      // Engine-flare twin rings trailing the intercept read.
      this._spawnSprite(SPR_RING, x, 0, z, life * 1.15, s0 * 0.55, s1 * 1.35, style.ringOp * 0.7, 0.0, style.color1, 0, 0);
    } else if (slot.kind === DOCTRINE_TELL_KIND.TETHER) {
      this._spawnSprite(SPR_FRESNEL, x, 0, z, life * 1.1, s0 * 0.8, s1 * 1.1, style.ringOp * 0.85, 0.0, style.color0, 0, 0);
    } else if (slot.kind === DOCTRINE_TELL_KIND.CHARGE) {
      this._spawnSprite(SPR_FLASH, x, 0, z, reduced ? 0.28 : 0.22, s0 * 0.4, s0 * 1.1, style.coreOp, 0.0, style.color1, 0, 0);
    }
    if (style.useLight && isStart) {
      this._flashLight({ x, z }, style.light, reduced ? 1.4 : 2.6, 9, 140);
    }
  },

  _spawnDoctrineTellLink(slot, style, ax, az, bx, bz, isStart) {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz) || 1;
    const ux = dx / dist;
    const uz = dz / dist;
    const reduced = slot.reduced;
    const segs = reduced ? 5 : (isStart ? 9 : 6);
    const burstMul = this._burst || 1;
    const n = Math.max(3, Math.round(segs * burstMul));
    this._c0.set(style.color0);
    this._c1.set(style.color1);

    // Contact-linked filament: samples the real segment so the tell cannot lie about who is aiming.
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const px = ax + dx * t;
      const pz = az + dz * t;
      const drift = (Math.random() - 0.5) * (reduced ? 2.5 : 5);
      const pxp = -uz * drift;
      const pzp = ux * drift;
      const sp = (reduced ? 4 : 8) + Math.random() * (reduced ? 6 : 14);
      // Doctrine-shaped motion bias along the link.
      let vx = ux * sp * 0.35 + pxp * 0.4;
      let vz = uz * sp * 0.35 + pzp * 0.4;
      if (slot.kind === DOCTRINE_TELL_KIND.FLYBY) {
        vx = ux * sp * 1.4;
        vz = uz * sp * 1.4;
      } else if (slot.kind === DOCTRINE_TELL_KIND.TETHER) {
        vx = ux * sp * 0.25 + pxp;
        vz = uz * sp * 0.25 + pzp;
      } else if (slot.kind === DOCTRINE_TELL_KIND.CHARGE) {
        vx = ux * sp * 0.9;
        vz = uz * sp * 0.9;
      }
      this._spawnParticle(
        px + pxp * 0.2, pz + pzp * 0.2,
        vx, vz,
        (reduced ? 0.28 : 0.22) + Math.random() * 0.12,
        slot.kind === DOCTRINE_TELL_KIND.CHARGE ? 2.2 : 1.6,
        0.15,
        this._c0, this._c1,
        2.2, 0, 0,
      );
    }

    // Midpoint accent so the link reads at a glance even when ships are small on screen.
    const mx = ax + dx * 0.5;
    const mz = az + dz * 0.5;
    const midLife = reduced ? 0.36 : 0.24;
    if (slot.kind === DOCTRINE_TELL_KIND.TETHER) {
      this._spawnSprite(SPR_RING, mx, 0, mz, midLife, 3.5, 9.0, style.linkOp, 0.0, style.color0, 0, 0);
    } else if (slot.kind === DOCTRINE_TELL_KIND.CHARGE) {
      this._spawnSprite(SPR_FLASH, mx, 0, mz, midLife * 0.85, 2.5, 6.5, style.linkOp, 0.0, style.color1, 0, 0);
    } else if (slot.kind === DOCTRINE_TELL_KIND.FLYBY) {
      this._spawnSprite(SPR_PUFF, mx, 0, mz, midLife, 3.0, 8.0, style.linkOp * 0.85, 0.0, style.color1, ux * 6, uz * 6);
    }

    // Target end tick — confirms who is under threat without HUD text.
    this._spawnSprite(
      reduced ? SPR_RING : SPR_FLASH,
      bx, 0, bz,
      reduced ? 0.32 : 0.16,
      3.0, reduced ? 8.0 : 6.0,
      style.linkOp * 0.9, 0.0, style.color0, 0, 0,
    );
  },

  _spawnDoctrineTellOffscreenCue(slot, style, cx, cz, ux, uz, isStart) {
    const reduced = slot.reduced;
    const life = reduced ? 0.42 : 0.32;
    // Directional chevron of rings/particles pointing at the real bearing (not a random edge).
    this._spawnSprite(SPR_RING, cx, 0, cz, life, 5.0, 14.0, style.ringOp, 0.0, style.color0, 0, 0);
    if (isStart) {
      this._spawnSprite(
        reduced ? SPR_RING : SPR_FLASH,
        cx, 0, cz, life * 0.9, 3.5, 9.0, style.coreOp, 0.0, style.color1, 0, 0,
      );
    }
    this._c0.set(style.color0);
    this._c1.set(style.color1);
    const n = reduced ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const along = 6 + i * (reduced ? 4.5 : 5.5);
      const px = cx + ux * along;
      const pz = cz + uz * along;
      const sp = 10 + i * 3;
      this._spawnParticle(
        px, pz,
        ux * sp, uz * sp,
        0.22 + i * 0.02, 1.8, 0.1,
        this._c0, this._c1, 2.4, 0, 0,
      );
    }
    // Kind glyph so FLYBY / TETHER / CHARGE remain distinct off-screen.
    if (slot.kind === DOCTRINE_TELL_KIND.TETHER) {
      this._spawnSprite(SPR_FRESNEL, cx, 0, cz, life * 1.1, 4.0, 11.0, style.ringOp * 0.8, 0.0, style.color0, 0, 0);
    } else if (slot.kind === DOCTRINE_TELL_KIND.CHARGE) {
      this._spawnSprite(SPR_FLASH, cx, 0, cz, life * 0.85, 3.0, 7.5, style.coreOp, 0.0, style.color1, 0, 0);
    } else if (slot.kind === DOCTRINE_TELL_KIND.FLYBY) {
      this._spawnSprite(SPR_PUFF, cx + ux * 8, 0, cz + uz * 8, life, 4.0, 10.0, style.linkOp, 0.0, style.color1, ux * 12, uz * 12);
    }
    if (style.useLight && isStart) {
      this._flashLight({ x: cx, z: cz }, style.light, 1.8, 10, 110);
    }
  },

  _updateDoctrineTells(dt) {
    const pool = this._doctrineTells;
    if (!pool || !this._doctrineTellActive) return;
    const tick = this.state && Number.isInteger(this.state.tick) ? this.state.tick : null;
    let live = 0;
    for (let i = 0; i < pool.length; i++) {
      const slot = pool[i];
      if (!slot.alive) continue;
      // Tick-owned lifetime: paused/tab render frames (dt) must not burn the sim warning window.
      if (slot.deadlineTick != null && tick != null) {
        if (tick > slot.deadlineTick) {
          slot.alive = false;
          slot.startTick = null;
          slot.deadlineTick = null;
          continue;
        }
      } else {
        // Headless fallback only when sim tick is unavailable.
        slot.age += dt;
        if (slot.age >= slot.life) {
          slot.alive = false;
          continue;
        }
      }
      live++;
      // Re-resolve on/off screen each pulse so a flyby that enters frame gains the enemy link.
      // Pulse cadence still uses frame dt (visual only; does not retire the tell).
      slot.pulse += dt;
      if (slot.pulse >= DOCTRINE_TELL_PULSE) {
        slot.pulse = 0;
        // Keep reduced flag current if the player toggles accessibility mid-telegraph.
        slot.reduced = this._isReduced();
        this._spawnDoctrineTellPulse(slot, false);
      }
    }
    this._doctrineTellActive = live;
  },

  _onAiFlee(p) {
    this._emitJuiceCue('ai.flee', p, 1);
    if (!this._scene) return;
    const e = this._ent(p && p.entityId);
    if (!e || !e.pos) return;
    this._c0.set('#a6f0ff'); this._c1.set('#39d0ff');
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 10 + Math.random() * 20;
      this._spawnParticle(e.pos.x, e.pos.z, Math.cos(a) * v, Math.sin(a) * v,
        0.3 + Math.random() * 0.2, 1.0, 0.0, this._c0, this._c1, 2.5, 0, 0);
    }
    this._spawnSprite(SPR_FLASH, e.pos.x, 0, e.pos.z, 0.30, e.radius || 8, (e.radius || 8) * 2.0, 0.6, 0.0, '#a6f0ff', 0, 0);
  },

  _onAiFormationBroken(p) {
    this._emitJuiceCue('ai.formation_broken', p, 1);
    if (!this._scene) return;
    // No specific entity id; flash at the player's position as a tactical cue.
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    if (!player || !player.pos) return;
    this._spawnSprite(SPR_RING, player.pos.x, 0, player.pos.z, 0.60, 8.0, 24.0, 0.5, 0.0, '#ff8840', 0, 0);
  },

  _onMiningTick(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, null);
    if (!pos) return;
    const col = oreColor(p.oreType);
    // Top-50 rank-9: denser contact spray so beam mining reads as real work, not a whisper.
    // Spray sparks outward from the contact point, biased away from the miner so they fan
    // off the rock face like molten chips. Bigger, brighter, more numerous than before.
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    let backA = null;
    if (player) {
      const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
      if (dx * dx + dz * dz > 1) backA = Math.atan2(dz, dx);
    }
    // Hot white-to-ore sparks — wider spray, faster, longer life
    this._c0.set('#fffaf0'); this._c1.set(col);
    const n = Math.max(12, Math.round(22 * (this._burst || 1)));
    for (let k = 0; k < n; k++) {
      // Spray perpendicular to beam (away from rock face) for a fan effect
      const a = backA != null
        ? backA + Math.PI + (Math.random() - 0.5) * 2.4  // fan away from ship
        : Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 40;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.38 + Math.random() * 0.22, 2.2, 0.2, this._c0, this._c1, 2.5, 0, 0);
    }
    // A few slow-drifting embers that linger (amber → dim)
    this._c0.set('#ffb040'); this._c1.set('#401800');
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 7;
      this._spawnParticle(pos.x + (Math.random() - 0.5) * 4, pos.z + (Math.random() - 0.5) * 4,
        Math.cos(a) * sp, Math.sin(a) * sp, 0.65 + Math.random() * 0.45, 2.0, 0.0, this._c0, this._c1, 1.5, 0, 0);
    }
    // Ore-chip micro chunks (heavier, slower) — readable as rock break fragments
    this._c0.set(col); this._c1.set('#2a2018');
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * 12;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.55 + Math.random() * 0.3, 2.6, 0.4, this._c0, this._c1, 1.8, 0, 2 + Math.random() * 4);
    }
    // Bright contact flash — bigger, punchier
    this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.18, 2.8, 5.8, 0.85, 0.0, col, 0, 0);
    // Drifting dust / debris cloud
    this._spawnSprite(SPR_PUFF, pos.x, 0, pos.z, 0.55, 2.2, 5.0, 0.55, 0.0, col,
      (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    // Strong ore-tinted dynamic light at contact — brighter, wider
    this._flashLight({ x: pos.x, z: pos.z }, col, 4.6, 3.8, 155);
  },

  _onMiningYield(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, null);
    if (!pos) return;
    const col = oreColor(p.commodityId);
    const qty = p.qty || 1;
    // Top-50 rank-9 ore-chunk yield: denser burst + crack ring so pickup pops.
    const burstN = Math.min(32, 10 + qty * 3);
    this._c0.set('#ffffff'); this._c1.set(col);
    for (let k = 0; k < burstN; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 16 + Math.random() * 30;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.35 + Math.random() * 0.25, 2.4, 0.35, this._c0, this._c1, 2.0, 0, 5 + Math.random() * 10);
    }
    // Chunky ore fragments (slower, larger life)
    this._c0.set(col); this._c1.set('#1a1410');
    const chunkN = Math.min(12, 4 + qty);
    for (let k = 0; k < chunkN; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 8 + Math.random() * 16;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.7 + Math.random() * 0.4, 3.2, 0.6, this._c0, this._c1, 1.4, 0, 3 + Math.random() * 6);
    }
    // Bright flash + expanding break ring to punctuate the yield
    this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.35, 3.4, 7.0, 0.95, 0.0, col, 0, 0);
    this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.45, 2.4, 14.0, 0.55, 0.0, col, 0, 0);
    this._spawnSprite(SPR_PUFF, pos.x, 0, pos.z, 0.6, 3.0, 7.0, 0.45, 0.0, col, 0, 0);
    this._flashLight({ x: pos.x, z: pos.z }, col, 6.0, 4.5, 200);
  },

  /**
   * Production family plume owns the player always, plus NPCs sticky-bound from the
   * last fleet endFrame (trails run before energy in the frame; sticky avoids dual draw).
   */
  _usesProductionThruster(e) {
    if (!e || e.type !== 'ship') return false;
    if (e.id === this.state.playerId) return true;
    const owned = this._productionOwnedIds;
    const n = this._productionOwnedCount | 0;
    if (!owned || !n) return false;
    const id = e.id;
    for (let i = 0; i < n; i++) {
      if (owned[i] === id) return true;
    }
    return false;
  },

  /** @deprecated use _engineProfileIdFor — kept as alias for older call sites. */
  _productionEngineProfileIdFor(e) {
    return this._engineProfileIdFor(e);
  },

  _onThrust(p) {
    // Authoritative trail is the per-frame velocity-driven emitter in update(); this handler simply
    // gives an extra burst when an explicit ship:thrust event arrives (most ships drive it per-frame).
    const id = p && (p.id != null ? p.id : p.shipId);
    const e = this._ent(id);
    if (!e) return;
    if (this._usesProductionThruster(e)) return;
    const reverse = p && Number.isFinite(p.reverse) ? Math.max(0, Math.min(1, p.reverse)) : 0;
    const nozzles = p && Array.isArray(p.nozzles) ? p.nozzles : EMPTY_TRAIL_SOCKETS;
    if (reverse > 0) {
      for (let i = 0; i < nozzles.length; i++) {
        const n = nozzles[i];
        if (n && (n.role === 'reverse-left' || n.role === 'reverse-right')) {
          this._emitReverseNozzleTrail(e, n.role, reverse * Math.max(0.25, Math.min(1, Number.isFinite(n.strength) ? n.strength : 1)));
        }
      }
    }
    const explicit = p && Number.isFinite(p.throttle) ? p.throttle : null;
    const drive = explicit != null ? explicit : (this._engineDriveFor(e).drive || 1);
    if (drive > 0.03) this._emitEngineTrail(e, drive, 1 / 60);
  },

  _emitReverseNozzleTrail(e, role, strength) {
    if (!this._scene || !e || !(strength > 0)) return;
    if (this._usesProductionThruster(e)) return;
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    const rx = -sf, rz = cf;
    const side = role === 'reverse-left' ? -1 : 1;
    const radius = e.radius || 6;
    const px = e.pos.x + cf * radius * 0.72 + rx * side * radius * 0.34;
    const pz = e.pos.z + sf * radius * 0.72 + rz * side * radius * 0.34;
    const dirX = (cf + rx * side) * Math.SQRT1_2;
    const dirZ = (sf + rz * side) * Math.SQRT1_2;
    const dir = Math.atan2(dirZ, dirX);
    const col = this._engineColor(e);
    const burst = this._burst || 1;
    const svx = (e.vel && e.vel.x) || 0;
    const svz = (e.vel && e.vel.z) || 0;
    this._spawnSprite(SPR_FLASH, px, 0, pz, 0.08, 1.8, 3.8 + strength * 2.0, 0.74, 0.0, '#ffffff', dirX * 2, dirZ * 2);
    this._spawnSprite(SPR_FLASH, px, 0, pz, 0.14, 2.6, 5.8 + strength * 2.8, 0.42, 0.0, col, dirX * 2, dirZ * 2);
    this._c0.set('#ffffff');
    this._c1.set(col);
    const count = Math.max(2, Math.round((3 + strength * 4) * burst));
    for (let k = 0; k < count; k++) {
      const a = dir + (Math.random() - 0.5) * 0.42;
      const sp = 36 + strength * 48 + Math.random() * 28;
      this._spawnParticle(
        px + (Math.random() - 0.5) * 0.9,
        pz + (Math.random() - 0.5) * 0.9,
        svx + Math.cos(a) * sp,
        svz + Math.sin(a) * sp,
        0.16 + strength * 0.10,
        1.2 + strength * 1.1,
        0.0,
        this._c0,
        this._c1,
        1.6,
        0,
        0
      );
    }
  },

  _onBoost(p, on) {
    const e = this._ent(p && p.shipId);
    if (!e || !this._scene) return;
    if (this._usesProductionThruster(e)) return;
    if (on) {
      // Boost ignition: a tight rear-nozzle kick, not a ship-sized bloom.
      const col = this._engineColor(e);
      const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
      const sock = this._trailSocketWorldPose(e);
      const exhaustX = sock ? sock.forwardX : -cf;
      const exhaustZ = sock ? sock.forwardZ : -sf;
      const rawBx = sock ? sock.x : e.pos.x - cf * (e.radius + 2);
      const rawBz = sock ? sock.z : e.pos.z - sf * (e.radius + 2);
      const bx = rawBx + exhaustX * BOOST_BURST_NOZZLE_CLEARANCE;
      const bz = rawBz + exhaustZ * BOOST_BURST_NOZZLE_CLEARANCE;
      const svx = (e.vel && e.vel.x) || 0;
      const svz = (e.vel && e.vel.z) || 0;
      this._spawnSprite(SPR_FLASH, bx, 0, bz, 0.14, 3.5, 7.5, 0.78, 0.0, '#ffffff', 0, 0);
      this._spawnSprite(SPR_FLASH, bx, 0, bz, 0.22, 4.5, 10, 0.46, 0.0, col, 0, 0);
      this._spawnSprite(SPR_RING, bx, 0, bz, 0.18, 2, 8, 0.45, 0.0, col, exhaustX * 5, exhaustZ * 5);
      this._flashLight({ x: bx, z: bz }, col, 2.2, 14, 80);
      this._c0.set('#ffffff'); this._c1.set(col);
      const baseA = sock ? sock.angle : Math.atan2(-sf, -cf);
      const n = Math.max(10, Math.round(22 * (this._burst || 1)));
      for (let k = 0; k < n; k++) {
        const a = baseA + (Math.random() - 0.5) * 0.42;
        const sp = 90 + Math.random() * 80;
        this._spawnParticle(bx, bz, svx + Math.cos(a) * sp, svz + Math.sin(a) * sp, 0.34, 2.5, 0.0, this._c0, this._c1, 1.4, 0, 0);
      }
    }
  },

  // Phase 3 dash: pure thruster juice — hot violet afterburner kick at the nozzles, brief energy
  // flash, no HUD word-pop. Distinct from sustained boost (whiter core, longer rear streak, punch).
  _onDash(p) {
    const e = this._ent(p && p.shipId);
    if (!e || !this._scene) return;
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    const sock = this._trailSocketWorldPose(e);
    const exhaustX = sock ? sock.forwardX : -cf;
    const exhaustZ = sock ? sock.forwardZ : -sf;
    const bx = sock ? sock.x : e.pos.x - cf * (e.radius + 2);
    const bz = sock ? sock.z : e.pos.z - sf * (e.radius + 2);
    // Hot energy palette: white-hot core → violet plasma → deep purple falloff
    const HOT = '#f0e8ff', VIOLET = '#c98cff', PLASMA = '#9b4dff', DEEP = '#5a1fb8';
    const svx = (e.vel && e.vel.x) || 0;
    const svz = (e.vel && e.vel.z) || 0;
    // Nozzle ignition — hot flash + expanding energy ring at thrusters (not the nose)
    this._spawnSprite(SPR_FLASH, bx, 0, bz, 0.18, 5.5, 11, 0.95, 0.0, HOT, 0, 0);
    this._spawnSprite(SPR_FLASH, bx, 0, bz, 0.28, 4.0, 12, 0.7, 0.0, VIOLET, 0, 0);
    this._spawnSprite(SPR_RING, bx, 0, bz, 0.26, 2.5, 10, 0.75, 0.0, VIOLET, exhaustX * 7, exhaustZ * 7);
    this._flashLight({ x: bx, z: bz }, VIOLET, 2.8, 16, 95);
    // Afterburner streak: fast rear particles (hot core → purple exhaust)
    this._c0.set(HOT); this._c1.set(DEEP);
    const baseA = sock ? sock.angle : Math.atan2(-sf, -cf);
    const n = Math.max(12, Math.round(28 * (this._burst || 1)));
    for (let k = 0; k < n; k++) {
      const a = baseA + (Math.random() - 0.5) * 0.38;
      const sp = 110 + Math.random() * 100;
      const life = 0.38 + Math.random() * 0.22;
      const size = 2.6 + Math.random() * 1.4;
      // Alternate hot-white→violet and violet→deep for a layered plasma look
      if (k & 1) { this._c0.set(HOT); this._c1.set(PLASMA); }
      else { this._c0.set(VIOLET); this._c1.set(DEEP); }
      this._spawnParticle(bx, bz, svx + Math.cos(a) * sp, svz + Math.sin(a) * sp, life, size, 0.0, this._c0, this._c1, 1.35, 0, 0);
    }
    if (e.id === this.state.playerId) this.helpers.camera && this.helpers.camera.addTrauma(0.28);
  },

  // Collection. The moment a drop lands is the payoff for the whole mining/flyby loop and it used
  // to be a 12-particle puff. Now it reads as light ARRIVING: a stretched streak laid along the
  // last leg of the drop's path into the hull, a hot pop at the intake, and a short spray that
  // implodes rather than scattering — so the eye is pulled to the ship, which is where the number
  // the player actually cares about is counting up.
  _onPickup(p) {
    if (!this._scene || !p.pos) return;
    const col = p.kind === 'credits' ? '#ffcc44' : oreColor(p.commodityId);
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    this._spawnSprite(SPR_FLASH, p.pos.x, 1.2, p.pos.z, 0.22, 3.0, 5.6, 0.9, 0.0, col, 0, 0);
    this._c0.set('#ffffff'); this._c1.set(col);

    if (player && player.pos) {
      const dx = player.pos.x - p.pos.x, dz = player.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const ux = dx / dist, uz = dz / dist;
      const roll = Math.atan2(uz, ux);
      const leg = Math.min(dist, 22);

      // The arrival streak: three overlapping stretched sprites along the final approach, brightest
      // nearest the hull, so the light visibly resolves INTO the ship rather than fading in place.
      for (let k = 0; k < 3; k++) {
        const f = (k + 1) / 4;
        this._spawnSprite(SPR_FLASH,
          player.pos.x - ux * leg * f, 1.3, player.pos.z - uz * leg * f,
          0.16 + k * 0.04, leg * (0.34 + 0.12 * k), 0.4,
          0.75 - k * 0.16, 0.0, k === 0 ? '#ffffff' : col,
          ux * 90, uz * 90, 3.4, roll);
      }
      // Imploding spray: particles converge on the intake instead of scattering away from it.
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 12;
        const sx = player.pos.x + Math.cos(a) * r;
        const sz = player.pos.z + Math.sin(a) * r;
        const pull = 42 + Math.random() * 46;
        this._spawnParticle(sx, sz, -Math.cos(a) * pull, -Math.sin(a) * pull,
          0.20 + Math.random() * 0.12, 1.5, 0.0, this._c0, this._c1, 1.2, 1.6, 0,
          a + Math.PI, 0.8);
      }
      this._spawnSprite(SPR_FLASH, player.pos.x, 1.4, player.pos.z, 0.14, 2.6, 5.2, 0.9, 0.0, '#ffffff', 0, 0);
      this._spawnSprite(SPR_RING, player.pos.x, 1.0, player.pos.z, 0.26, 1.2, 6.5, 0.5, 0.0, col, 0, 0);
      this._flashLight({ x: player.pos.x, z: player.pos.z }, col, 3.4, 7.0, 110);
    } else {
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 12 + Math.random() * 18;
        this._spawnParticle(p.pos.x, p.pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
          0.3 + Math.random() * 0.15, 1.8, 0.0, this._c0, this._c1, 3.0, 2, 6 + Math.random() * 10);
      }
    }
  },

  // engine trail emitter — called per ship per frame from update(), throttled by accumulator
  _emitEngineTrail(e, throttle, dt, out = this._trailSpawnScratch) {
    const result = out || (this._trailSpawnScratch = { particles: 0, streaks: 0 });
    result.particles = 0;
    result.streaks = 0;
    if (!this._scene) return result;
    if (this._usesProductionThruster(e)) return result;
    const drive = Math.max(0, Math.min(1.35, Number.isFinite(throttle) ? throttle : 0));
    if (drive <= 0.03) return result;
    const prof = this._engineProfile(e);
    // Faction exhaust identity without allocating a blended profile object:
    // lerp frozen base.coreColor toward faction thruster (matches prior blendHex 0.38).
    const factionThruster = this._engineColor(e);
    this._cFaction.set(prof.coreColor || '#88aaff');
    if (factionThruster) this._cFaction.lerp(this._ctmp.set(factionThruster), 0.38);
    const col0 = this._cFaction;
    const streakLenMul = prof.streakLenMul || 1;
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    const boostBlend = e.flags && e.flags.boosting ? 1 : 0;
    const cruising = e.id === this.state.playerId && this.state.player && this.state.player.cruise && this.state.player.cruise.phase === 'cruising';
    const cruiseBlend = cruising ? 1 : 0;
    // FR-4: engine glow reads SPEED — the faction plume color lerps toward white-hot as the ship
    // nears its top-end (cruise = 4x maxSpeed). Suppressed while cruising so cyan (the cruise-STATE
    // cue, FR-6) owns that state exclusively. Locked strain-amber is never used as a speed hue.
    const _trailSpd = Math.hypot((e.vel && e.vel.x) || 0, (e.vel && e.vel.z) || 0);
    const _trailMax = Math.max(1, e.maxSpeed || (e.data && e.data.maxSpeed) || 1);
    const glowT = cruiseBlend > 0 ? 0 : Math.min(1, _trailSpd / (_trailMax * 4));
    // Hero assets carry SOCKET_Trail_Main at the authored nozzle; originate the plume there so it
    // leaves the real engine, not a center-derived point (spec §9.9, §14.2). Falls back to the
    // radial-behind formula for procedural ships that have no socket.
    let bx, bz, baseA;
    const sock = this._trailSocketWorldPose(e);
    if (sock) {
      bx = sock.x; bz = sock.z; baseA = sock.angle;
    }
    else {
      const back = (e.radius || 4) * 0.85;
      bx = e.pos.x - cf * back;
      bz = e.pos.z - sf * back;
      baseA = Math.atan2(-sf, -cf);
    }
    const nozzleClearance = TRAIL_NOZZLE_CLEARANCE + boostBlend * 0.65 + cruiseBlend * 0.55;
    bx += Math.cos(baseA) * nozzleClearance;
    bz += Math.sin(baseA) * nozzleClearance;

    // Ship velocity must be added to exhaust so particles are "born" with the nozzle's world motion.
    // This makes the jet shoot *out of the nozzle* (correct local direction) and then trail behind
    // when the ship is moving (inertia). Without this, plumes always shoot heading-relative only and
    // look detached or sideways when sliding.
    const svx = (e.vel && e.vel.x) || 0;
    const svz = (e.vel && e.vel.z) || 0;

    // Legacy ships use the same pooled streak substrate, but never the old moving point-particle
    // exhaust. Those particles accumulated into long diagonal bead chains whenever an NPC crossed
    // the camera. Alternate a narrow hot core and broader colored sheath at the nozzle; their life
    // is deliberately shorter than an object-width traversal, and inherited ship velocity keeps
    // the layers attached instead of leaving detached cards in world space.
    const corePass = ((this._trailFrameIndex + (Number(e.id) || 0)) & 1) === 0;
    if (corePass) this._c0.set('#ffffff');
    else this._c0.copy(col0);
    if (glowT > 0) this._c0.lerp(this._ctmp.set('#ffffff'), glowT * (corePass ? 0.25 : 0.6));
    if (boostBlend > 0) this._c0.lerp(this._ctmp.set(prof.boostCore || '#a6d8ff'), corePass ? 0.35 : 0.62);
    if (cruiseBlend > 0) this._c0.lerp(this._ctmp.set(prof.cruiseCore || '#39d0ff'), corePass ? 0.28 : 0.58);
    const drift = 2.0 + drive * 2.6 + boostBlend * 1.8 + cruiseBlend * 1.5;
    const pvx = svx + Math.cos(baseA) * drift;
    const pvz = svz + Math.sin(baseA) * drift;
    const life = 0.075 + drive * 0.018 + boostBlend * 0.018 + cruiseBlend * 0.015;
    const width = (corePass ? 0.26 : 0.54) * (1 + drive * 0.18 + boostBlend * 0.34 + cruiseBlend * 0.24);
    const length = (corePass ? 2.9 : 4.7)
      * (1 + drive * 0.32 + boostBlend * 0.62 + cruiseBlend * 0.48) * streakLenMul;
    this._spawnTrailStreak(
      bx, 0, bz, life, width, length, corePass ? 0.62 : 0.34,
      this._c0, pvx, pvz,
    );
    result.streaks = 1;
    return result;
  },

  // -------------------------------------------------------------------------
  // Per-frame integration (called inside renderFrame; frameDt = wall-clock seconds)
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // PQ-012 continuous field flow (Well / Repulsor / Cone) — advected pooled particles.
  // Reads state.fields.active (the fields system's published mirror). INSTANCED pooled particles
  // only (reuses the shipped GPU point cloud); zero per-frame allocation; deterministic spawn
  // distribution (low-discrepancy sequence, no Math.random per bible §9). The three flow
  // signatures carry DIRECTION and BOUNDARY by construction (bible §4):
  //   Well     — particles born at the rim flow INWARD and converge on a hot sink (cool→hot).
  //   Repulsor — particles born at the core flow OUTWARD, decelerating into a pile at the rim (hot→cool).
  //   Cone     — particles fill the wedge and flow downstream along dir (teal directed current).
  // Reduced-motion drops flow speed (direction still drifts, no fast flashing); reduced-flash drops
  // count + size (dimmer). Both preserve direction + boundary.
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // PQ-012 frame-device geometry strand (FIELD_TOOL_READABILITY_BIBLE §4)
  // Geometry carries primary read at 1x default camera; particles enrich.
  // -------------------------------------------------------------------------
  _initFieldGeometry() {
    if (!this._scene || this._fieldGeomInitialized) return;
    this._fieldGeomInitialized = true;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x2b3138,
      roughness: 0.48,
      metalness: 0.72,
      side: THREE.DoubleSide,
    });

    const crispPipMat = new THREE.MeshBasicMaterial({
      color: 0x39d0ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });

    const crispBermMat = new THREE.MeshStandardMaterial({
      color: 0x2b3138,
      roughness: 0.48,
      metalness: 0.72,
      side: THREE.DoubleSide,
    });

    const crispChevronMat = new THREE.MeshBasicMaterial({
      color: 0x39d0ff,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });

    const crispBankMat = new THREE.MeshBasicMaterial({
      color: 0x39d0ff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });

    const vaneGeo = createCurvedVaneGeometry();
    const vaneCap = 48;
    const vaneMesh = new THREE.InstancedMesh(vaneGeo, frameMat, vaneCap);
    vaneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    vaneMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(vaneCap * 3), 3);
    vaneMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    vaneMesh.frustumCulled = false;
    vaneMesh.renderOrder = 9;
    vaneMesh.count = 0;
    this._scene.add(vaneMesh);

    const pipGeo = new THREE.ConeGeometry(0.5, 1.4, 3);
    pipGeo.rotateX(Math.PI / 2);
    const pipCap = 96;
    const pipMesh = new THREE.InstancedMesh(pipGeo, crispPipMat, pipCap);
    pipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pipMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(pipCap * 3), 3);
    pipMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    pipMesh.frustumCulled = false;
    pipMesh.renderOrder = 10;
    pipMesh.count = 0;
    this._scene.add(pipMesh);

    const knotGeo = new THREE.OctahedronGeometry(0.5, 0);
    const knotCap = 12;
    const knotMesh = new THREE.InstancedMesh(knotGeo, frameMat, knotCap);
    knotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    knotMesh.frustumCulled = false;
    knotMesh.renderOrder = 8;
    knotMesh.count = 0;
    this._scene.add(knotMesh);

    const domeGeo = new THREE.IcosahedronGeometry(1.0, 1);
    const domeCap = 12;
    const domeMesh = new THREE.InstancedMesh(domeGeo, frameMat, domeCap);
    domeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    domeMesh.frustumCulled = false;
    domeMesh.renderOrder = 8;
    domeMesh.count = 0;
    this._scene.add(domeMesh);

    const ribGeo = new THREE.BoxGeometry(0.35, 0.12, 1.0);
    const ribCap = 64;
    const ribMesh = new THREE.InstancedMesh(ribGeo, frameMat, ribCap);
    ribMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ribMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ribCap * 3), 3);
    ribMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    ribMesh.frustumCulled = false;
    ribMesh.renderOrder = 9;
    ribMesh.count = 0;
    this._scene.add(ribMesh);

    const bermGeo = new THREE.DodecahedronGeometry(0.7, 0);
    const bermCap = 96;
    const bermMesh = new THREE.InstancedMesh(bermGeo, crispBermMat, bermCap);
    bermMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bermMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bermCap * 3), 3);
    bermMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    bermMesh.frustumCulled = false;
    bermMesh.renderOrder = 10;
    bermMesh.count = 0;
    this._scene.add(bermMesh);

    const chevronGeo = new THREE.ConeGeometry(0.45, 0.95, 3);
    chevronGeo.rotateZ(-Math.PI / 2);
    const chevronCap = 96;
    const chevronMesh = new THREE.InstancedMesh(chevronGeo, crispChevronMat, chevronCap);
    chevronMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    chevronMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(chevronCap * 3), 3);
    chevronMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    chevronMesh.frustumCulled = false;
    chevronMesh.renderOrder = 10;
    chevronMesh.count = 0;
    this._scene.add(chevronMesh);

    const bankGeo = new THREE.BoxGeometry(0.18, 0.1, 1.0);
    const bankCap = 24;
    const bankMesh = new THREE.InstancedMesh(bankGeo, crispBankMat, bankCap);
    bankMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bankMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bankCap * 3), 3);
    bankMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    bankMesh.frustumCulled = false;
    bankMesh.renderOrder = 9;
    bankMesh.count = 0;
    this._scene.add(bankMesh);

    const coreEnergyGeo = new THREE.OctahedronGeometry(1.0, 0);
    const coreVols = [];
    for (let i = 0; i < 6; i++) {
      const vol = createEnergyVolume(coreEnergyGeo, {
        name: `field-core-vol-${i}`,
        colorA: '#39d0ff',
        colorB: '#a6f0ff',
        coreIntensity: 4.5,
        haloIntensity: 1.5,
        haloScale: 1.25,
      });
      vol.visible = false;
      this._scene.add(vol);
      coreVols.push(vol);
    }

    this._fieldGeom = {
      vaneMesh,
      pipMesh,
      knotMesh,
      domeMesh,
      ribMesh,
      bermMesh,
      chevronMesh,
      bankMesh,
      coreVols,
      deployStart: new Map(),
      dynamicBufferOwners: {
        vane: registerFieldGeometryBufferOwner(this._scene, 'vane', vaneMesh),
        pip: registerFieldGeometryBufferOwner(this._scene, 'pip', pipMesh),
        knot: registerFieldGeometryBufferOwner(this._scene, 'knot', knotMesh),
        dome: registerFieldGeometryBufferOwner(this._scene, 'dome', domeMesh),
        rib: registerFieldGeometryBufferOwner(this._scene, 'rib', ribMesh),
        berm: registerFieldGeometryBufferOwner(this._scene, 'berm', bermMesh),
        chevron: registerFieldGeometryBufferOwner(this._scene, 'chevron', chevronMesh),
        bank: registerFieldGeometryBufferOwner(this._scene, 'bank', bankMesh),
      },
    };

    this._fieldMat4 = new THREE.Matrix4();
    this._fieldQuat = new THREE.Quaternion();
    this._fieldVec3 = new THREE.Vector3();
    this._fieldScale = new THREE.Vector3();
    this._fieldColor = new THREE.Color();
    this._fieldColor2 = new THREE.Color();
    this._fieldLeanQuat = new THREE.Quaternion();
    this._fieldActiveIds = new Set();
  },

  _updateFieldGeometry(dt) {
    if (!this._scene) return;
    if (!this._fieldGeomInitialized) this._initFieldGeometry();
    const fg = this._fieldGeom;
    if (!fg) return;

    const active = this.state.fields && this.state.fields.active;
    const activeList = Array.isArray(active) ? active : [];
    const activeIds = this._fieldActiveIds;
    activeIds.clear();

    if (activeList.length === 0) {
      if (fg.deployStart.size > 0) fg.deployStart.clear();

      commitFieldGeometryBuffer(fg.dynamicBufferOwners.vane, fg.vaneMesh, 0);
      commitFieldGeometryBuffer(fg.dynamicBufferOwners.pip, fg.pipMesh, 0);
      commitFieldGeometryBuffer(fg.dynamicBufferOwners.knot, fg.knotMesh, 0);
      commitFieldGeometryBuffer(fg.dynamicBufferOwners.dome, fg.domeMesh, 0);
      commitFieldGeometryBuffer(fg.dynamicBufferOwners.rib, fg.ribMesh, 0);
      commitFieldGeometryBuffer(fg.dynamicBufferOwners.berm, fg.bermMesh, 0);
      commitFieldGeometryBuffer(fg.dynamicBufferOwners.chevron, fg.chevronMesh, 0);
      commitFieldGeometryBuffer(fg.dynamicBufferOwners.bank, fg.bankMesh, 0);

      for (let i = 0; i < fg.coreVols.length; i++) {
        if (fg.coreVols[i].visible) fg.coreVols[i].visible = false;
      }
      return;
    }

    assertFieldGeometryBuffersWritable(fg.dynamicBufferOwners);

    const settings = this.state && this.state.settings;
    const v = settings && settings.video;
    const a = settings && settings.accessibility;
    const motionReduce = !!(v && v.motionReduce);
    const flashReduce = !!((v && v.flashReduce) || (a && a.flashReduce));
    const now = (this.state && Number.isFinite(this.state.simTime)) ? this.state.simTime : this._t;

    for (const f of activeList) {
      if (f && f.id) {
        activeIds.add(f.id);
        if (!fg.deployStart.has(f.id)) {
          fg.deployStart.set(f.id, now);
        }
      }
    }
    for (const id of fg.deployStart.keys()) {
      if (!activeIds.has(id)) fg.deployStart.delete(id);
    }

    let vaneCount = 0;
    let pipCount = 0;
    let knotCount = 0;
    let domeCount = 0;
    let ribCount = 0;
    let bermCount = 0;
    let chevronCount = 0;
    let bankCount = 0;
    let coreVolCount = 0;

    const mat4 = this._fieldMat4;
    const quat = this._fieldQuat;
    const leanQuat = this._fieldLeanQuat;
    const vec3 = this._fieldVec3;
    const scale = this._fieldScale;
    const col = this._fieldColor;
    const col2 = this._fieldColor2;

    const numFields = Math.min(activeList.length, 6);

    for (let fi = 0; fi < numFields; fi++) {
      const field = activeList[fi];
      if (!field || !field.center || !(field.radius > 0)) continue;

      const cx = field.center.x;
      const cz = field.center.z;
      const R = field.radius;
      const kind = field.kind;
      const engaged = !!field.engaged;
      const pal = field.palette || null;

      const startTime = fg.deployStart.get(field.id) || now;
      const elapsed = Math.max(0, now - startTime);
      const easeVal = Math.min(1.0, elapsed / 0.35);
      const deploy = easeVal * easeVal * (3.0 - 2.0 * easeVal);

      const baseOpacity = engaged ? (flashReduce ? 0.75 : 0.95) : 0.35;

      if (kind === 'well') {
        const knotRadius = 1.6;
        mat4.compose(
          vec3.set(cx, 0, cz),
          quat.setFromAxisAngle(vec3.set(0, 1, 0), motionReduce ? 0 : this._t * 0.8),
          scale.setScalar(knotRadius)
        );
        fg.knotMesh.setMatrixAt(knotCount++, mat4);

        if (coreVolCount < fg.coreVols.length) {
          const vol = fg.coreVols[coreVolCount++];
          vol.position.set(cx, 0, cz);
          vol.scale.setScalar(1.5);
          vol.visible = true;
          updateEnergyMaterial(vol.userData.energyCore, {
            time: this._t,
            colorA: pal ? pal.filament : '#39d0ff',
            colorB: pal ? pal.core : '#a6f0ff',
            intensity: flashReduce ? 2.0 : (engaged ? 4.8 : 3.0),
            opacity: baseOpacity,
            pulse: engaged ? 0.2 : 0,
          });
          updateEnergyMaterial(vol.userData.energyHalo, {
            time: this._t,
            colorA: pal ? pal.filament : '#39d0ff',
            colorB: pal ? pal.core : '#a6f0ff',
            intensity: flashReduce ? 1.0 : 1.5,
            opacity: baseOpacity * 0.4,
          });
        }

        const numVanes = 6;
        const vaneRadius = 4.2;
        const vaneSpan = 2.8;
        const vaneWidth = 0.8;
        const swirlAngle = motionReduce ? 0 : -this._t * 1.5;

        for (let i = 0; i < numVanes; i++) {
          if (vaneCount >= 48) break;
          const baseAngle = (i / numVanes) * Math.PI * 2 + swirlAngle;
          const radOffset = vaneRadius * (0.3 + 0.7 * deploy);
          const vx = cx + Math.cos(baseAngle) * radOffset;
          const vz = cz + Math.sin(baseAngle) * radOffset;

          quat.setFromAxisAngle(vec3.set(0, 1, 0), baseAngle);

          mat4.compose(
            vec3.set(vx, 0, vz),
            quat,
            scale.set(vaneSpan * (0.4 + 0.6 * deploy), 1.0, vaneWidth * (0.4 + 0.6 * deploy))
          );
          fg.vaneMesh.setMatrixAt(vaneCount, mat4);
          col.set(pal ? pal.filament : '#39d0ff');
          fg.vaneMesh.setColorAt(vaneCount, col);
          vaneCount++;
        }

        const numPips = 12;
        const pipSize = 2.0;
        for (let i = 0; i < numPips; i++) {
          if (pipCount >= 96) break;
          const pipAngle = (i / numPips) * Math.PI * 2;
          const px = cx + Math.cos(pipAngle) * R;
          const pz = cz + Math.sin(pipAngle) * R;

          const tangAngle = pipAngle + Math.PI / 2;
          quat.setFromAxisAngle(vec3.set(0, 1, 0), tangAngle);

          if (engaged && !motionReduce) {
            leanQuat.setFromAxisAngle(vec3.set(1, 0, 0), -0.28);
            quat.multiply(leanQuat);
          }

          mat4.compose(
            vec3.set(px, 0, pz),
            quat,
            scale.setScalar(pipSize)
          );
          fg.pipMesh.setMatrixAt(pipCount, mat4);
          col.set(pal ? pal.filament : '#39d0ff');
          fg.pipMesh.setColorAt(pipCount, col);
          pipCount++;
        }
      } else if (kind === 'repulsor') {
        const domeRadius = 1.8;
        mat4.compose(
          vec3.set(cx, 0, cz),
          quat.setFromAxisAngle(vec3.set(0, 1, 0), motionReduce ? 0 : this._t * 0.3),
          scale.set(domeRadius, domeRadius * 0.5, domeRadius)
        );
        fg.domeMesh.setMatrixAt(domeCount++, mat4);

        if (coreVolCount < fg.coreVols.length) {
          const vol = fg.coreVols[coreVolCount++];
          vol.position.set(cx, 0, cz);
          vol.scale.setScalar(1.5);
          vol.visible = true;
          updateEnergyMaterial(vol.userData.energyCore, {
            time: this._t,
            colorA: pal ? pal.coreWarm : '#ffb35c',
            colorB: pal ? pal.rib : '#ffc878',
            intensity: flashReduce ? 2.0 : (engaged ? 4.5 : 2.8),
            opacity: baseOpacity,
            pulse: engaged ? 0.15 : 0,
          });
          updateEnergyMaterial(vol.userData.energyHalo, {
            time: this._t,
            colorA: pal ? pal.berm : '#39d0ff',
            colorB: pal ? pal.coreWarm : '#ffb35c',
            intensity: flashReduce ? 0.8 : 1.5,
            opacity: baseOpacity * 0.35,
          });
        }

        const numRibs = 8;
        const ribMinR = 1.8;
        const ribMaxR = 5.2;
        const ribLen = ribMaxR - ribMinR;

        for (let i = 0; i < numRibs; i++) {
          if (ribCount >= 64) break;
          const ribAngle = (i / numRibs) * Math.PI * 2;
          const midR = (ribMinR + ribMaxR) * 0.5;
          const rx = cx + Math.cos(ribAngle) * midR;
          const rz = cz + Math.sin(ribAngle) * midR;

          quat.setFromAxisAngle(vec3.set(0, 1, 0), ribAngle);
          mat4.compose(
            vec3.set(rx, 0, rz),
            quat,
            scale.set(0.4, 0.2, ribLen)
          );
          fg.ribMesh.setMatrixAt(ribCount, mat4);

          const pulseT = motionReduce ? 0.5 : ((this._t * 3.0 + i * 0.25) % 1.0);
          col.set(pal ? pal.rib : '#ffc878').lerp(col2.set(pal ? pal.berm : '#39d0ff'), pulseT);
          fg.ribMesh.setColorAt(ribCount, col);
          ribCount++;
        }

        const numLobes = 14;
        const lobeSize = 2.2;
        for (let i = 0; i < numLobes; i++) {
          if (bermCount >= 96) break;
          const lobeAngle = (i / numLobes) * Math.PI * 2;
          const rLobe = R * (0.96 + 0.08 * Math.sin(lobeAngle * 3.5 + (motionReduce ? 0 : this._t * 2.0)));
          const bx = cx + Math.cos(lobeAngle) * rLobe;
          const bz = cz + Math.sin(lobeAngle) * rLobe;

          quat.setFromAxisAngle(vec3.set(0, 1, 0), lobeAngle + i);
          mat4.compose(
            vec3.set(bx, 0, bz),
            quat,
            scale.setScalar(lobeSize * (1.0 + 0.15 * Math.sin(i * 1.7)))
          );
          fg.bermMesh.setMatrixAt(bermCount, mat4);
          col.set(pal ? pal.berm : '#39d0ff');
          fg.bermMesh.setColorAt(bermCount, col);
          bermCount++;
        }
      } else if (kind === 'cone') {
        const dirx = field.dir ? field.dir.x : 1;
        const dirz = field.dir ? field.dir.z : 0;
        const mainAngle = Math.atan2(dirz, dirx);
        const halfAngle = field.halfAngleRad || 0.5;

        const px = -dirz;
        const pz = dirx;

        if (coreVolCount < fg.coreVols.length) {
          const vol = fg.coreVols[coreVolCount++];
          vol.position.set(cx, 0, cz);
          vol.scale.setScalar(1.5);
          vol.visible = true;
          updateEnergyMaterial(vol.userData.energyCore, {
            time: this._t,
            colorA: pal ? pal.bank : '#39d0ff',
            colorB: pal ? pal.pulse : '#a6f0ff',
            intensity: flashReduce ? 2.0 : (engaged ? 4.5 : 2.8),
            opacity: baseOpacity,
          });
          updateEnergyMaterial(vol.userData.energyHalo, {
            time: this._t,
            colorA: pal ? pal.bank : '#39d0ff',
            colorB: pal ? pal.bank : '#39d0ff',
            intensity: flashReduce ? 0.8 : 1.4,
            opacity: baseOpacity * 0.35,
          });
        }

        const corridorLen = R;
        const numBankChevrons = 10;
        const chevronSize = 2.6;

        for (let side = -1; side <= 1; side += 2) {
          for (let i = 0; i < numBankChevrons; i++) {
            if (chevronCount >= 96) break;
            const tDist = (i / (numBankChevrons - 1));
            const d = corridorLen * (0.10 + 0.86 * tDist);
            const wedgeWidth = 1.4 * d * Math.tan(halfAngle);

            const bx = cx + dirx * d + px * (side * wedgeWidth * 0.5);
            const bz = cz + dirz * d + pz * (side * wedgeWidth * 0.5);

            quat.setFromAxisAngle(vec3.set(0, 1, 0), mainAngle);

            const exitFade = tDist > 0.8 ? (1.0 - (tDist - 0.8) / 0.2) : 1.0;

            mat4.compose(
              vec3.set(bx, 0, bz),
              quat,
              scale.setScalar(chevronSize * exitFade)
            );
            fg.chevronMesh.setMatrixAt(chevronCount, mat4);

            col.set(pal ? pal.chevron : '#39d0ff');
            fg.chevronMesh.setColorAt(chevronCount, col);
            chevronCount++;
          }

          const numRailSegs = 5;
          for (let rIdx = 0; rIdx < numRailSegs; rIdx++) {
            if (bankCount >= 24) break;
            const tRail = (rIdx + 0.5) / numRailSegs;
            const midD = corridorLen * (0.15 + 0.7 * tRail);
            const midWidth = 1.4 * midD * Math.tan(halfAngle);
            const rx = cx + dirx * midD + px * (side * midWidth * 0.5);
            const rz = cz + dirz * midD + pz * (side * midWidth * 0.5);

            const bankAngle = Math.atan2(dirz * corridorLen + pz * (side * midWidth * 0.5), dirx * corridorLen + px * (side * midWidth * 0.5));
            quat.setFromAxisAngle(vec3.set(0, 1, 0), bankAngle);

            mat4.compose(
              vec3.set(rx, 0, rz),
              quat,
              scale.set(0.35, 0.12, 2.8)
            );
            fg.bankMesh.setMatrixAt(bankCount, mat4);
            col.set(pal ? pal.bank : '#39d0ff');
            fg.bankMesh.setColorAt(bankCount, col);
            bankCount++;
          }
        }
      }
    }

    for (let i = coreVolCount; i < fg.coreVols.length; i++) {
      fg.coreVols[i].visible = false;
    }

    commitFieldGeometryBuffer(fg.dynamicBufferOwners.vane, fg.vaneMesh, vaneCount);
    commitFieldGeometryBuffer(fg.dynamicBufferOwners.pip, fg.pipMesh, pipCount);
    commitFieldGeometryBuffer(fg.dynamicBufferOwners.knot, fg.knotMesh, knotCount);
    commitFieldGeometryBuffer(fg.dynamicBufferOwners.dome, fg.domeMesh, domeCount);
    commitFieldGeometryBuffer(fg.dynamicBufferOwners.rib, fg.ribMesh, ribCount);
    commitFieldGeometryBuffer(fg.dynamicBufferOwners.berm, fg.bermMesh, bermCount);
    commitFieldGeometryBuffer(fg.dynamicBufferOwners.chevron, fg.chevronMesh, chevronCount);
    commitFieldGeometryBuffer(fg.dynamicBufferOwners.bank, fg.bankMesh, bankCount);
  },

  _fieldFlowRelevant() {
    const f = this.state && this.state.fields;
    return !!(f && Array.isArray(f.active) && f.active.length > 0);
  },

  _hexRgb(hex) {
    if (!hex) return this._fieldFlowWhite || (this._fieldFlowWhite = { r: 1, g: 1, b: 1 });
    let cache = this._hexRgbCache;
    if (!cache) cache = this._hexRgbCache = new Map();
    let c = cache.get(hex);
    if (!c) { const col = new THREE.Color(hex); c = { r: col.r, g: col.g, b: col.b }; cache.set(hex, c); }
    return c;
  },

  _updateFieldFlow() {
    const active = this.state.fields.active;
    if (!Array.isArray(active) || active.length === 0) return 0;
    const settings = this.state && this.state.settings;
    const v = settings && settings.video;
    const a = settings && settings.accessibility;
    const motionReduce = !!(v && v.motionReduce);
    const flashReduce = !!((v && v.flashReduce) || (a && a.flashReduce));
    let emitted = 0;
    const n = Math.min(active.length, FIELD_FLOW_MAX_FIELDS);
    for (let fi = 0; fi < n; fi++) emitted += this._emitFieldFlow(active[fi], fi, motionReduce, flashReduce);
    this._fieldFlowSeq = ((this._fieldFlowSeq || 0) + 1) >>> 0;
    return emitted;
  },

  _emitFieldFlow(field, fieldIndex, motionReduce, flashReduce) {
    if (!field || !field.center || !(field.radius > 0)) return 0;
    const R = field.radius;
    const pal = field.palette || null;
    let count = flashReduce ? 6 : 11;
    if (!field.engaged) count = Math.max(3, count - 3); // dormant → sparse "parked machine" read
    const sizeScale = flashReduce ? 0.62 : 1;
    const speedScale = motionReduce ? 0.28 : 1;
    // Velocity-aligned streak elongation. Under reduced-motion the flow is slow, so LONGER streaks
    // keep DIRECTION readable in a still frame (bible §2/§11 "readable statically") — the dashes
    // point the way the flow would move. Full-motion uses a subtler streak.
    const stretch = motionReduce ? 1.7 : 0.7;
    const seqBase = (this._fieldFlowSeq || 0) + fieldIndex * 101;
    let emitted = 0;
    for (let j = 0; j < count; j++) {
      const t = seqBase + j;
      const a01 = fieldFrac(t * 0.61803398875);
      const r01 = fieldFrac(t * 0.75487766625 + 0.137);
      if (this._emitFieldParticle(field, R, pal, a01, r01, sizeScale, speedScale, stretch)) emitted++;
    }
    return emitted;
  },

  _emitFieldParticle(field, R, pal, a01, r01, sizeScale, speedScale, stretch) {
    const cx = field.center.x, cz = field.center.z;
    if (field.kind === 'cone') {
      const dirx = field.dir ? field.dir.x : 1, dirz = field.dir ? field.dir.z : 0;
      const half = field.halfAngleRad || 0.5;
      const d = R * (0.08 + 0.88 * r01);                    // distance from apex along the axis
      const lateral = (a01 * 2 - 1) * d * Math.tan(half) * 0.92; // the widening wedge
      const px = cx + dirx * d + (-dirz) * lateral;
      const pz = cz + dirz * d + (dirx) * lateral;
      const speed = (120 + 90 * fieldFalloff(field, d)) * speedScale;
      const vx = dirx * speed, vz = dirz * speed;
      const c0 = this._hexRgb(pal ? pal.bank : '#39d0ff');
      const c1 = this._hexRgb(pal ? pal.chevron : '#39d0ff');
      const life = Math.max(0.18, ((R - d) / Math.max(30, speed)) * 0.9);
      this._spawnParticle(px, pz, vx, vz, life, 1.4 * sizeScale, 0.4 * sizeScale, c0, c1, 0.35, 0, 0, Math.atan2(vz, vx), stretch);
      return true;
    }
    const ang = a01 * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    if (field.kind === 'repulsor') {
      const rad = R * (0.10 + 0.14 * r01);                  // born near the core
      const px = cx + ca * rad, pz = cz + sa * rad;
      const speed = (185 + 55 * (1 - r01)) * speedScale;
      const vx = ca * speed - sa * speed * 0.12, vz = sa * speed + ca * speed * 0.12; // outward + slight swirl
      const c0 = this._hexRgb(pal ? pal.coreWarm : '#ffb35c');
      const c1 = this._hexRgb(pal ? pal.berm : '#39d0ff');
      this._spawnParticle(px, pz, vx, vz, 1.05, 1.4 * sizeScale, 0.4 * sizeScale, c0, c1, 1.15, 0, 0, Math.atan2(vz, vx), stretch);
      return true;
    }
    // well — born rim-biased, flow inward + swirl, converge on the hot sink
    const rad = R * (0.5 + 0.48 * r01);
    const px = cx + ca * rad, pz = cz + sa * rad;
    const speed = (150 + 120 * (1 - r01)) * speedScale;
    const vx = -ca * speed + (-sa) * speed * 0.45, vz = -sa * speed + (ca) * speed * 0.45; // inward + tangential swirl
    const c0 = this._hexRgb(pal ? pal.filament : '#39d0ff');
    const c1 = this._hexRgb(pal ? pal.core : '#39d0ff');
    const life = Math.max(0.2, (rad / Math.max(30, speed)) * 1.05);
    this._spawnParticle(px, pz, vx, vz, life, 1.5 * sizeScale, 0.4 * sizeScale, c0, c1, 0.2, 0, 0, Math.atan2(vz, vx), stretch);
    return true;
  },

  update(frameDt) {
    // Refresh the Tier-1 sink once per frame: spawn paths then pay a single null check.
    const tier1Perf = this.state && this.state.perfRuntime;
    const tier1Counter = tier1Perf && tier1Perf.tier1;
    this._tier1Spawn = tier1Counter && tier1Counter.isEnabled() ? tier1Counter : null;
    if (!this._scene) {
      // render may have come up after vfx.init (defensive) — try once to attach pools
      if (this.state.render && this.state.render.scene) { this._initPools(); this._subscribeOnce(); }
      if (!this._scene) return;
    }
    if (this._perfVfxIsolationRestore) {
      this._reassertPerfVfxRoots();
      return;
    }
    // Observe frameOriginSeq even if renderer already reprojected — same-origin is a no-op.
    this._syncFrameMembrane();
    let dt = frameDt;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1; // clamp pauses/tab-switches so particles don't teleport
    this._t += dt;
    const trailScroll = (this._t * 0.35) % 1;
    if (this._particleMat) {
      if (this._particleMat.uniforms.uTrailScroll) this._particleMat.uniforms.uTrailScroll.value = trailScroll;
      if (this._particleMat.uniforms.uTrailTime) this._particleMat.uniforms.uTrailTime.value = this._t;
    }

    const sub = this._vfxSubsystemLast;
    sub.trails = this._emitTrails(dt) ? 1 : 0;
    sub.ribbons = this._updateRibbonTrails(dt) ? 1 : 0;
    if (this._projectileTrailsRelevant()) {
      const projWake = !this._projectileTrailsWereRelevant;
      this._projectileTrailsWereRelevant = true;
      let projStep = this._consumeCadence('_cadenceProjectileTrail', dt, VFX_PROJECTILE_TRAILS_HZ);
      if (projWake) {
        this._cadenceProjectileTrail = 0;
        projStep = Math.max(projStep, dt);
      }
      if (projStep > 0) {
        this._emitProjectileTrails(projStep);
        sub.projectileTrails = 1;
      } else {
        sub.projectileTrails = 0;
      }
    } else {
      this._projectileTrailsWereRelevant = false;
      resetProjectileTrailDiag(this._projectileTrailDiag);
      sub.projectileTrails = 0;
    }
    if (this._miningBeamActive()) {
      this._updateMiningBeam(dt);
      sub.miningBeam = 1;
    } else {
      sub.miningBeam = 0;
    }
    if (this._tetherCableActive()) {
      this._updateTetherCable(dt);
      sub.tetherCable = 1;
    } else {
      sub.tetherCable = 0;
    }
    // Massline UVP: continuous tumble thrash puffs + spin ribbons while status_tumbling / drifting.
    this._updateTumbleBodyLanguageVfx(dt);
    // M1 doctrine telegraphs — sustain FLYBY/TETHER/CHARGE cues across the pre-fire window.
    if (this._doctrineTellActive > 0) this._updateDoctrineTells(dt);
    if (this._arcPreviewActive()) {
      this._updateArcPreview(dt);
      sub.arcPreview = 1;
    } else {
      sub.arcPreview = 0;
    }
    if (this._stationSideEventsRelevant()) {
      const stationStep = this._consumeCadence(
        '_cadenceStationSideEvent',
        dt,
        VFX_STATION_SIDE_EVENTS_HZ,
      );
      sub.stationSideEvents = stationStep > 0 && this._updateStationSideEvents(stationStep) > 0 ? 1 : 0;
    } else {
      this._cadenceStationSideEvent = 0;
      sub.stationSideEvents = 0;
    }
    // "The Working Light" — civilian hulls showing what job they are on. Asleep in any sector with
    // no live NPC job, which costs one existence probe per frame and nothing else.
    if (this._npcJobSignaturesRelevant()) {
      const jobStep = this._consumeCadence(
        '_cadenceNpcJobSignature',
        dt,
        VFX_NPC_JOB_SIGNATURE_HZ,
      );
      sub.npcJobSignatures = jobStep > 0 && this._updateNpcJobSignatures(jobStep) > 0 ? 1 : 0;
    } else {
      this._sleepNpcJobSignatures();
      sub.npcJobSignatures = 0;
    }
    if (this._seamMarkersRelevant()) {
      const seamWake = !this._seamMarkersWereRelevant;
      this._seamMarkersWereRelevant = true;
      let seamStep = this._consumeCadence('_cadenceSeam', dt, VFX_SEAM_MARKERS_HZ);
      if (seamWake) {
        this._cadenceSeam = 0;
        seamStep = Math.max(seamStep, dt);
      }
      if (seamStep > 0) {
        this._updateSeamMarkers(seamStep);
        sub.seamMarkers = 1;
      } else {
        sub.seamMarkers = 0;
      }
    } else {
      this._seamMarkersWereRelevant = false;
      this._sleepSeamMarkers();
      sub.seamMarkers = 0;
    }
    // Loot magnet — drops being vacuumed in read as light flying at you.
    if (this._lootMagnetRelevant()) {
      const lootStep = this._consumeCadence('_cadenceLootMagnet', dt, VFX_LOOT_MAGNET_HZ);
      sub.lootMagnet = lootStep > 0 ? this._updateLootMagnet(lootStep) : (sub.lootMagnet || 0);
    } else {
      this._lootMagnetLive = 0;
      sub.lootMagnet = 0;
    }
    // PQ-012 continuous field flow — cadence-gated pooled emission; slept when no field is deployed.
    if (this._fieldFlowRelevant()) {
      const flowStep = this._consumeCadence('_cadenceFieldFlow', dt, VFX_FIELD_FLOW_HZ);
      sub.fieldFlow = flowStep > 0 ? this._updateFieldFlow() : (sub.fieldFlow || 0);
      this._updateFieldGeometry(dt);
    } else {
      sub.fieldFlow = 0;
      if (this._fieldGeomInitialized) this._updateFieldGeometry(dt);
    }
    sub.energy = this._updateEnergy(dt) ? 1 : 0;
    // PQ-013 planetary skim — band scroll + reentry sheath pool; slept when no site is registered
    // (dormant sectors cost one boolean read; the sheath slots exist only after first relevance).
    if (this._planetSkimRelevant()) {
      this._initPlanetSkim();
      sub.planetSkim = this._updatePlanetSkim(dt) ? 1 : 0;
    } else {
      if (this._planetSkim) this._sleepPlanetSkim();
      sub.planetSkim = 0;
    }
    sub.explosions = this._explosions.update(dt, this._explosionEmitter) > 0 ? 1 : 0;
    if (this._combatBeams) {
      sub.combatBeams = this._combatBeams.update(
        this._t,
        this._combatBeamLocalizer,
        resolveVfxAccessibilityProfile(this.state && this.state.settings),
      ) > 0 ? 1 : 0;
    } else {
      sub.combatBeams = 0;
    }
    if (this._liveCount > 0) {
      this._integrateParticles(dt);
      sub.particles = 1;
    } else {
      this._integrateParticles(dt);
      sub.particles = 0;
    }
    if (this._liveSpriteCount > 0) {
      this._integrateSprites(dt);
      sub.sprites = 1;
    } else {
      sub.sprites = 0;
    }
    if (this._liveTrailStreakCount > 0) {
      this._integrateTrailStreaks(dt);
      sub.trails = 1;
    }
    sub.eventLights = this._decayEventLights(dt) ? 1 : 0;
    this._publishVfxSubsystemDiag();
  },

  // -------------------------------------------------------------------------
  // Loot magnet presentation.
  //
  // The pull itself is real and already tuned (src/systems/mining.js — 420 wu range, 900 wu/s²,
  // velocity-inheriting so a combat flyby sweeps drops up). What was missing is that it LOOKED like
  // nothing: a drop being vacuumed in at 280 wu/s rendered as a small tumbling rock, so the most
  // frequently repeated reward in the game had no reward read at all.
  //
  // Here each homing drop gets a stretched additive comet trail oriented along its own velocity
  // (the instanced sprite pool already carries aspect + roll) plus a bright head, tinted by the ore
  // it carries. Cost is bounded three ways: a cadence gate, a hard cap on trailed drops, and a
  // whole-subsystem sleep when nothing is homing.
  // -------------------------------------------------------------------------
  _lootMagnetRelevant() {
    const state = this.state;
    if (!state) return false;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(state.playerId);
    if (!player || !player.alive || !player.pos) return false;
    const list = state.entityList;
    if (!list || !list.length) return false;
    const r2 = LOOT_MAGNET_DRAW_RANGE * LOOT_MAGNET_DRAW_RANGE;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'pickup' || !e.pos) continue;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      if (dx * dx + dz * dz > r2) continue;
      const vx = (e.vel && e.vel.x) || 0, vz = (e.vel && e.vel.z) || 0;
      if (vx * vx + vz * vz >= LOOT_MAGNET_MIN_SPEED * LOOT_MAGNET_MIN_SPEED) return true;
    }
    return false;
  },

  _updateLootMagnet(step) {
    const state = this.state;
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(state.playerId);
    if (!player || !player.pos) { this._lootMagnetLive = 0; return 0; }
    const list = state.entityList || [];
    const r2 = LOOT_MAGNET_DRAW_RANGE * LOOT_MAGNET_DRAW_RANGE;
    const burst = this._burst || 1;
    let drawn = 0;
    for (let i = 0; i < list.length && drawn < LOOT_MAGNET_MAX_TRAILED; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'pickup' || !e.pos) continue;
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > r2) continue;
      const vx = (e.vel && e.vel.x) || 0, vz = (e.vel && e.vel.z) || 0;
      const speed = Math.hypot(vx, vz);
      if (speed < LOOT_MAGNET_MIN_SPEED) continue;
      drawn++;

      const data = e.data || {};
      const col = data.kind === 'credits' ? '#ffcc44' : oreColor(data.commodityId);
      // Closing hard reads hotter and longer: the trail is a speed gauge you never have to read.
      const rush = Math.min(1, speed / 260);
      const roll = Math.atan2(vz, vx);
      const stretch = 1.5 + rush * 2.0;

      // Head: a small white-cored spark riding the drop itself.
      this._spawnSprite(SPR_FLASH, e.pos.x, 1.2, e.pos.z,
        0.16 + rush * 0.10, 1.5 + rush * 1.3, 0.5,
        0.55 + rush * 0.35, 0.0, '#ffffff', vx * 0.35, vz * 0.35,
        Math.min(3.5, stretch), roll);
      // Tail: a coloured streak laid down behind it, drifting slower so it reads as a wake.
      this._spawnSprite(SPR_FLASH, e.pos.x - vx * step * 1.4, 1.1, e.pos.z - vz * step * 1.4,
        0.24 + rush * 0.16, 1.1 + rush * 1.9, 0.35,
        0.30 + rush * 0.28, 0.0, col, vx * 0.18, vz * 0.18,
        Math.min(3.5, stretch * 1.25), roll);
      // A couple of trailing embers so the wake has grain rather than being one clean smear.
      if (burst > 0.7) {
        this._c0.set('#ffffff'); this._c1.set(col);
        const jitter = (Math.random() - 0.5) * 8;
        this._spawnParticle(
          e.pos.x - vx * step, e.pos.z - vz * step,
          vx * 0.22 - vz * 0.02 + jitter, vz * 0.22 + vx * 0.02 + jitter,
          0.22 + Math.random() * 0.16, 0.9 + rush * 0.7, 0.0,
          this._c0, this._c1, 2.4, 1.1, 0, roll, 0.7 + rush * 0.5,
        );
      }
    }
    this._lootMagnetLive = drawn;
    return drawn > 0 ? 1 : 0;
  },

  _consumeCadence(field, dt, hz) {
    const stepTarget = 1 / Math.max(1, hz);
    let acc = this[field] || 0;
    acc += dt;
    if (acc < stepTarget) {
      this[field] = acc;
      return 0;
    }
    const steps = Math.floor(acc / stepTarget);
    this[field] = acc - steps * stepTarget;
    return steps * stepTarget;
  },

  _miningBeamActive() {
    return !!(this._miningBeam && this._miningBeam.active);
  },

  _tetherCableActive() {
    const cable = this._tetherCable;
    if (!cable) return false;
    if (cable.fade > 0.001) return true;
    const tether = this.state.player && this.state.player.tether;
    const remote = this.state.player && this.state.player.remoteMassline;
    return !!((tether && tether.active) || (remote && remote.active));
  },

  _seamMarkersRelevant() {
    const state = this.state;
    const player = this.helpers && this.helpers.player
      ? this.helpers.player()
      : this._ent(state.playerId);
    if (!player || !player.pos) return false;
    const px = player.pos.x || 0;
    const pz = player.pos.z || 0;
    const range2 = VFX_SEAM_DRAW_RANGE * VFX_SEAM_DRAW_RANGE;
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'asteroid') continue;
      const seams = e.data && e.data.seams;
      if (!seams || !seams.length) continue;
      const dx = e.pos.x - px;
      const dz = e.pos.z - pz;
      if (dx * dx + dz * dz <= range2) return true;
    }
    return false;
  },

  _sleepSeamMarkers() {
    const sm = this._seamMarkers;
    if (!sm || !sm.mesh) return;
    if (!commitDynamicBufferOwner(sm.dynamicBufferOwner, 0) && sm.mesh.count) sm.mesh.count = 0;
  },

  _energyMaterialsEnabled() {
    const video = this.state.settings && this.state.settings.video;
    return !!(video && video.energyMaterials);
  },

  _productionThrusterEnabled() {
    // Compact core propulsion feedback is part of flight readability, not optional wake dressing.
    // The Engine trails preference selects the lightweight core+sheath presentation below rather
    // than erasing the main drive and RCS completely.
    return true;
  },

  _extendedEngineTrailsEnabled() {
    const video = this.state.settings && this.state.settings.video;
    return !video || video.engineTrails !== false;
  },

  // Radiance multiplier for HDR energy volumes (grammar §9.2, build plan §2.5 item 3).
  //
  // This scales EMITTED RADIANCE, not visibility. Two defects were fixed here on 2026-07-27:
  //
  //  * It returned 0 when bloom was off, which killed ALL energy radiance. That is wrong by
  //    construction: an energy volume is additive with toneMapped:false, so it is a light source in
  //    its own right. Turning bloom off should stop it SPILLING into its surroundings, not delete
  //    it. Bloom-off is selected automatically on software GL, so the weakest hardware was the
  //    hardware that lost the energy layer entirely.
  //  * It clamped to `strength / 0.35` in [0,1], so every bloom setting at or above the 0.35
  //    default produced an identical result and the slider bought nothing above default. The
  //    massline is supposed to be the brightest object on screen; a ceiling at the default value is
  //    exactly the mildness this pass exists to remove.
  //
  // The reference point stays 0.35 (bloom.js DEFAULT_BLOOM_STRENGTH) so the default look is a
  // deliberate, named value rather than an emergent one.
  _bloomRadianceScale() {
    const video = this.state.settings && this.state.settings.video;
    let strength = video && Number.isFinite(video.bloomStrength)
      ? video.bloomStrength
      : BLOOM_REFERENCE_STRENGTH;
    if (strength > 1) strength *= 0.5;   // legacy 0..2 sliders fold onto 0..1
    strength = Math.max(0, Math.min(1, strength));
    if (video && video.bloom === false) return BLOOM_OFF_RADIANCE;
    const scaled = BLOOM_RADIANCE_FLOOR + (strength / BLOOM_REFERENCE_STRENGTH) * BLOOM_RADIANCE_SPAN;
    return Math.max(BLOOM_OFF_RADIANCE, Math.min(BLOOM_RADIANCE_CEILING, scaled));
  },

  _energyPlumeRelevant() {
    if (!this._productionThrusterEnabled()) return false;
    const energy = this._energy;
    if (energy && (
      energy.plumeDrive > 0.02
      || energy.boostBlend > 0.02
      || (energy.rcsSystem && energy.rcsSystem.pool.activeImpulseCount > 0)
    )) return true;
    // Activity-gated, never "alive ship = awake": the idle-sleep invariant requires the energy
    // subsystem to do zero work when no ship is thrusting (master semantics, fleet-extended).
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (player && player.alive && player.type === 'ship' && this._usesProductionThruster(player)) {
      const actuators = this._actuatorsFor(player);
      if (actuators && (
        Math.abs(actuators.lateral || 0) > 0.001
        || Math.abs(actuators.yaw || 0) > 0.001
        || (actuators.reverse || 0) > 0.001
      )) return true;
      const turn = this.state.input && Number.isFinite(this.state.input.turnIntent)
        ? Math.abs(this.state.input.turnIntent)
        : 0;
      const driveInfo = this._engineDriveFor(player);
      if (driveInfo.drive > 0.03 || driveInfo.boost > 0 || turn > 0.2) return true;
    }
    // NPC fleet wake: any tracked candidate under thrust keeps production awake. The candidate
    // list is already refreshed by _emitTrails earlier in the frame, so this adds no spatial
    // pass and no allocation; idle ships (drive ~0, no boost) do not wake the subsystem.
    const list = this._trailCandidates;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || !e.alive || e.type !== 'ship') continue;
        if (player && e.id === player.id) continue;
        if (e.flags && e.flags.docked) continue;
        const d = this._engineDriveFor(e);
        if (d.drive > 0.03 || d.boost > 0) return true;
      }
    }
    return false;
  },

  _energyMasslineRelevant() {
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (!player || !player.alive) return false;
    const attachments = this.state.combat
      && this.state.combat.attachments
      && this.state.combat.attachments.byId;
    if (!attachments) return false;
    for (const key in attachments) {
      const a = attachments[key];
      if (!a || a.state !== 'active') continue;
      if (a.ownerId === player.id && this._tetherCable) continue;
      if (a.ownerId !== player.id && a.targetId !== player.id) continue;
      const otherId = a.ownerId === player.id ? a.targetId : a.ownerId;
      const other = this.state.entities.get(otherId);
      if (other && other.alive) return true;
    }
    return false;
  },

  _publishVfxSubsystemDiag() {
    const perf = this.state.perfRuntime;
    if (perf && typeof perf.recordVfxSubsystems === 'function') {
      perf.recordVfxSubsystems(this._vfxSubsystemLast);
    }
  },

  // (defensive) only used if pools attached lazily; avoids double-subscription
  _subscribeOnce() { if (!this._subs.length) this._subscribe(); },

  // -------------------------------------------------------------------------
  // Production energy materials. The Kestrel plume is a batched, directional replacement for the
  // old polygon volume + particle beads, and remains legible without bloom. The Massline ribbon
  // continues to use its dedicated energy volume. Purely cosmetic — never sim state.
  // -------------------------------------------------------------------------
  _updateEnergy(dt) {
    const productionThrusterEnabled = this._productionThrusterEnabled();
    const legacyEnergyMaterialsEnabled = this._energyMaterialsEnabled();
    if (!productionThrusterEnabled && !legacyEnergyMaterialsEnabled) {
      this._disposeEnergy();
      return false;
    }
    // The production Hitch exhaust is the ship's primary propulsion feedback. It follows the
    // Engine trails setting and must not disappear because a legacy profile disabled the older
    // HDR-energy-material experiment. That legacy toggle continues to own only the Massline volume.
    const plumeRelevant = productionThrusterEnabled && this._energyPlumeRelevant();
    const masslineRelevant = legacyEnergyMaterialsEnabled && this._energyMasslineRelevant();
    if (!plumeRelevant && !masslineRelevant) {
      if (this._energy) {
        this._hideEnergyPlumes(0);
        if (this._energy.ribbon) this._energy.ribbon.visible = false;
      }
      return false;
    }
    if (!this._energy) this._initEnergy();
    if (!this._energy) return false;
    let active = false;
    if (plumeRelevant) {
      // Full display-rate pose/drive sample. Cadence here used to leave the jet one frame
      // behind the hull at high speed (~8u lag at SPD 255 / 30 Hz), which read as a doubled,
      // flickering thruster. The continuous plume is a few instanced cards — cheap enough.
      this._energyPlumeWasRelevant = true;
      this._updateEnergyPlume(dt);
      active = true;
    } else {
      this._energyPlumeWasRelevant = false;
      this._hideEnergyPlumes(0);
    }
    if (masslineRelevant) {
      this._updateEnergyMassline(dt);
      active = true;
    } else if (this._energy.ribbon) {
      this._energy.ribbon.visible = false;
    }
    return active;
  },

  // ── PQ-013 planetary skim presentation ─────────────────────────────────────────────────────
  // Bands scroll on the planet entity's visual (userData.planetVisual.timeMats, cosmetic _t
  // family); the Sheath is a bounded pool of 5 bow-shock slots (player + 4 tracked ships), each a
  // thin ionization cone (skim read) + a two-layer plasma volume (commit/breakup read) — the
  // spike-proven construction (scripts/spike-pq013-planetary-sheath.mjs, REPORT.md Phase 1).
  // Accessibility: REDUCED_FLASH scales opacity ×0.3 / size ×0.68 and caps uBoost (no white-hot
  // peak — bible §7.4 names exactly these profile constants); REDUCED_MOTION freezes the scroll
  // clock (bands hold as a long-exposure static field) while pose/coverage stay truthful.
  _planetSkimRelevant() {
    const p = this.state && this.state.planet;
    return !!(p && p.active);
  },

  _initPlanetSkim() {
    if (!this._scene || this._planetSkim) return;
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(new THREE.Vector2(0.22 + Math.pow(t, 0.72) * 3.1, -4 * t)); // apex x=0 → skirt x=-4
    }
    const geo = new THREE.LatheGeometry(pts, 40);
    geo.rotateZ(-Math.PI / 2); // lathe axis +Y → +X (the plume shader's axis convention)
    const slots = [];
    for (let i = 0; i < 5; i++) {
      const thin = new THREE.Mesh(geo, createPlumeMaterial({
        name: `sf-planet-sheath-thin-${i}`, colorA: 0x39d0ff, colorB: 0x2a7fb8,
        intensity: 2.6, opacity: 0.4, core: 0.5, boost: 0.1, swirl: 0.35, fork: 0.3,
      }));
      const plasma = createPlumeVolume(geo, {
        name: `sf-planet-sheath-plasma-${i}`, colorA: 0xffb35c, colorB: 0xff5c5c,
        // Route-gated tune: 3.4/0.7 tripped the 2% white-out gate at the commit framing by 0.14%;
        // the amber->red ramp carries the read, the white-hot apex only needs a whisper.
        coreIntensity: 3.0, haloIntensity: 1.5, coreOpacity: 0.62, haloOpacity: 0.26,
        boost: 0.82, swirl: 0.5, fork: 0.6,
      });
      thin.visible = false;
      plasma.visible = false;
      thin.frustumCulled = false;
      plasma.traverse((o) => { o.frustumCulled = false; });
      this._scene.add(thin);
      this._scene.add(plasma);
      slots.push({ thin, plasma });
    }
    this._planetSkim = { geo, slots, t: 0, localScratch: { x: 0, z: 0 } };
  },

  _sleepPlanetSkim() {
    const ps = this._planetSkim;
    if (!ps) return;
    for (const slot of ps.slots) { slot.thin.visible = false; slot.plasma.visible = false; }
  },

  _updatePlanetSkim(dt) {
    const ps = this._planetSkim;
    const state = this.state;
    const p = state.planet;
    if (!ps || !p || !p.active) return false;
    const profile = resolveVfxAccessibilityProfile(state.settings);
    const reducedMotion = profile.id === 'reduced-motion' || profile.id === 'reduced-motion-and-flash';
    const reducedFlash = profile.flashOpacityScale < 1;
    if (!reducedMotion) ps.t += dt; // cosmetic scroll clock only — gameplay state never reads it

    // Band scroll on the planet entity's visual.
    const planetEntity = state.entities && state.entities.get ? state.entities.get(p.entityId) : null;
    const visual = planetEntity && planetEntity.mesh && planetEntity.mesh.userData
      ? planetEntity.mesh.userData.planetVisual : null;
    if (visual && Array.isArray(visual.timeMats)) {
      for (const mat of visual.timeMats) updateEnergyMaterial(mat, { time: ps.t });
    }

    // Sheath slots: player first, then tracked ships (bounded by the pool).
    let used = 0;
    let anyVisible = false;
    const assign = (e, rec) => {
      if (used >= ps.slots.length || !e || e.alive === false || !rec) return;
      const heat = rec.heat || 0;
      const stage = rec.stage;
      if (heat < 0.03 && !stage) return;
      const slot = ps.slots[used++];
      const hot = stage === 'commit' || stage === 'breakup' || stage === 'descent';
      const mesh = hot ? slot.plasma : slot.thin;
      const other = hot ? slot.thin : slot.plasma;
      other.visible = false;
      mesh.visible = true;
      anyVisible = true;
      const local = this._toLocalXZ(e.pos.x, e.pos.z, ps.localScratch);
      const rot = e.rot || 0;
      const cf = Math.cos(rot), sf = Math.sin(rot);
      const nose = (e.radius || 8) * 0.9;
      const k = Math.max(0.6, (e.radius || 8) / 10) * profile.flashSizeScale;
      mesh.position.set(local.x + cf * nose, 0, local.z + sf * nose);
      mesh.rotation.y = -rot;
      if (hot) {
        mesh.scale.set(3.6 * k, 2.0 * k, 2.0 * k);
        const boost = Math.min(reducedFlash ? 0.6 : 1, 0.35 + heat * 0.5);
        updateEnergyMaterial(mesh.userData.energyCore.material, { time: ps.t, boost, opacity: 0.62 * profile.flashOpacityScale });
        updateEnergyMaterial(mesh.userData.energyHalo.material, { time: ps.t, boost, opacity: 0.26 * profile.flashOpacityScale });
      } else {
        mesh.scale.set(3.2 * k, 1.6 * k, 1.6 * k);
        updateEnergyMaterial(mesh.material, {
          time: ps.t,
          boost: Math.min(reducedFlash ? 0.5 : 1, heat),
          opacity: 0.4 * Math.min(1, 0.35 + heat * 2) * profile.flashOpacityScale,
        });
      }
    };

    const player = state.entities.get(state.playerId);
    assign(player, p.player);
    const ships = p.ships || {};
    for (const id in ships) {
      if (used >= ps.slots.length) break;
      const e = state.entities.get(Number.isFinite(Number(id)) ? Number(id) : id);
      assign(e, ships[id]);
    }
    for (let i = used; i < ps.slots.length; i++) {
      ps.slots[i].thin.visible = false;
      ps.slots[i].plasma.visible = false;
    }
    return anyVisible || !!visual;
  },

  _initEnergy() {
    if (!this._scene) return;
    const textures = loadKestrelThrusterTextures();
    const fleet = new FamilyProductionFleet(THREE, {
      textures,
      maxShips: FLEET_MAX_SHIPS,
      socketsPerShip: FLEET_SOCKETS_PER_SHIP,
    });
    fleet.attachToScene(this._scene);
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    const profileId = this._engineProfileIdFor(player);
    const pack = resolveThrusterRecipes(profileId);
    this._productionEngineProfileId = pack.profileId;

    // Massline ribbon: a thin tube energy volume drawn between the player and a tethered target.
    // Reuses the energy shader (turbulent core + halo) rather than the dedicated ribbon shader so it
    // needs no per-vertex aAlong/aSide attributes (the tube geometry already provides them implicitly).
    const ribbonGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 8, 1, true);
    ribbonGeo.translate(0, 0.5, 0); // pivot at one end so we can scale along the tether axis
    ribbonGeo.rotateX(Math.PI / 2);
    const ribbonCore = createEnergyVolume(ribbonGeo, {
      name: 'sf-energy-massline',
      colorA: 0x42f5d4, colorB: 0x2ad4ff,
      coreIntensity: 5.0, haloIntensity: 2.2, noiseScale: 2.4, flowSpeed: 3.2, pulse: 1.4,
    });

    ribbonCore.visible = false;
    this._scene.add(ribbonCore);
    // Compatibility aliases: plumeSystem/rcsSystem point at the player's active family.
    const playerPlume = fleet.familyPlume(profileId) || fleet.families[0].plume;
    const playerRcs = fleet.playerRcsSystem() || fleet.families[0].rcs;
    this._energy = {
      fleet,
      plumeSystem: playerPlume,
      rcsSystem: playerRcs,
      thrusterTextures: textures,
      engineProfileId: pack.profileId,
      recipePack: pack,
      ribbon: ribbonCore,
      ribbonGeo,
      plumeDrive: 0,
      boostBlend: 0,
      rcsCooldown: 0,
      fleetDiag: null,
    };
  },

  /**
   * Fleet owns every live family at init — no per-frame rebind/dispose.
   * Kept as a no-op alias so older call sites remain safe.
   */
  _ensureProductionThrusterFamily(profileId) {
    const energy = this._energy;
    if (!energy || !energy.fleet) return;
    const id = profileId || 'engine_ion_small';
    energy.engineProfileId = id;
    energy.recipePack = resolveThrusterRecipes(id);
    energy.plumeSystem = energy.fleet.familyPlume(id) || energy.plumeSystem;
    energy.rcsSystem = energy.fleet.playerRcsSystem() || energy.rcsSystem;
    this._productionEngineProfileId = id;
  },

  _updateEnergyPlume(dt) {
    const energy = this._energy;
    if (!energy) return;
    const a11y = this._productionThrusterA11y;
    const video = this.state.settings && this.state.settings.video || {};
    const accessibility = this.state.settings && this.state.settings.accessibility || {};
    const particleQuality = video.particleQuality || 'high';
    a11y.reducedMotion = !!video.motionReduce;
    a11y.reducedFlash = !!accessibility.flashReduce;
    const compactPropulsion = !this._extendedEngineTrailsEnabled();
    a11y.lowQuality = particleQuality === 'low' || compactPropulsion;
    a11y.qualityTier = compactPropulsion
      ? 'low'
      : (particleQuality === 'med' ? 'medium' : particleQuality);

    // Test/harness fallback: single plumeSystem mock without a fleet table.
    if (!energy.fleet) {
      const player = this.state.entities && this.state.entities.get(this.state.playerId);
      if (!player || !player.alive) {
        this._hideEnergyPlumes(0);
        energy.plumeDrive = 0;
        energy.boostBlend = 0;
        return;
      }
      const driveInfo = this._engineDriveFor(player);
      const socketCount = this._writeProductionPlumeSockets(player);
      const opts = this._productionThrusterOpts;
      opts.boost = driveInfo.boost;
      opts.cruise = driveInfo.cruise;
      opts.reverse = driveInfo.reverse;
      opts.retroOnly = driveInfo.retroOnly;
      opts.brake = driveInfo.brake;
      opts.speedDrive = driveInfo.speedDrive;
      opts.a11y = a11y;
      if (energy.plumeSystem && typeof energy.plumeSystem.update === 'function') {
        const result = energy.plumeSystem.update(
          dt,
          driveInfo.drive,
          socketCount > 0 ? this._productionPlumeSocketView : null,
          opts,
        );
        energy.plumeDrive = result.drive;
        energy.boostBlend = result.boostBlend;
        energy.driveMode = result.mode;
      }
      this._updateProductionRcs(player, dt, a11y);
      return;
    }

    const fleet = energy.fleet;
    fleet.beginFrame(a11y);

    // Retention-safe two-phase (no per-frame arrays / closures):
    // 1) retainShip every eligible survivor by entityId (player first)
    // 2) beginAdmitPhase then admitShip newcomers into vacant/departed slots only
    // Candidate order cannot steal warmed survivors.
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    const rgb = this._factionRgbScratch;

    // Phase 1 — reclaim persistent slots only (no stale-slot reuse).
    if (player && player.alive && player.type === 'ship') {
      const profileId = this._engineProfileIdFor(player);
      const ship = fleet.retainShip(player.id, profileId, true);
      if (ship) {
        const socketCount = this._writeProductionPlumeSockets(player);
        fleet.setShipSockets(ship, this._productionPlumeSocketView, socketCount);
        fleet.setShipDrive(ship, this._engineDriveFor(player));
        this._factionThrusterRgbInto(player, rgb);
        fleet.setShipFactionRgb(ship, rgb.r, rgb.g, rgb.b);
        energy.engineProfileId = profileId;
        energy.plumeSystem = fleet.familyPlume(profileId);
        energy.rcsSystem = fleet.playerRcsSystem();
      }
    }

    this._refreshTrailCandidates();
    const list = this._trailCandidates;
    const ctx = this._trailContext();
    const screenChecks = this._trailScreenChecks();
    // Phase 1 — only historical owners (hadEntity). Newcomers must not burn screen-check
    // budget here: retainShip would return null anyway, but tier resolution is not free.
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'ship') continue;
      if (player && e.id === player.id) continue;
      if (e.flags && e.flags.docked) continue;
      if (!fleet.hadEntity(e.id)) continue;
      const tier = this._resolveTrailTier(e, ctx, screenChecks);
      if (tier === TRAIL_TIER.SKIP) continue;
      if (tier === TRAIL_TIER.REDUCED && !this._trailCadenceAllows(e, tier)) continue;
      const profileId = this._engineProfileIdFor(e);
      const ship = fleet.retainShip(e.id, profileId, false);
      if (!ship) continue;
      const socketCount = this._writeProductionPlumeSockets(e);
      fleet.setShipSockets(ship, this._productionPlumeSocketView, socketCount);
      fleet.setShipDrive(ship, this._engineDriveFor(e));
      this._factionThrusterRgbInto(e, rgb);
      fleet.setShipFactionRgb(ship, rgb.r, rgb.g, rgb.b);
    }

    // Phase 2 — only true newcomers (!hadEntity) after every survivor had a retain chance.
    // Each candidate is tier-resolved in exactly one phase (no double screen-check cost).
    fleet.beginAdmitPhase();
    if (player && player.alive && player.type === 'ship' && !fleet.hasEntity(player.id)) {
      const profileId = this._engineProfileIdFor(player);
      const ship = fleet.admitShip(player.id, profileId, true);
      if (ship) {
        const socketCount = this._writeProductionPlumeSockets(player);
        fleet.setShipSockets(ship, this._productionPlumeSocketView, socketCount);
        fleet.setShipDrive(ship, this._engineDriveFor(player));
        this._factionThrusterRgbInto(player, rgb);
        fleet.setShipFactionRgb(ship, rgb.r, rgb.g, rgb.b);
        energy.engineProfileId = profileId;
        energy.plumeSystem = fleet.familyPlume(profileId);
        energy.rcsSystem = fleet.playerRcsSystem();
      }
    }
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'ship') continue;
      if (player && e.id === player.id) continue;
      if (e.flags && e.flags.docked) continue;
      if (fleet.hadEntity(e.id)) continue;
      if (fleet.hasEntity(e.id)) continue;
      const tier = this._resolveTrailTier(e, ctx, screenChecks);
      if (tier === TRAIL_TIER.SKIP) continue;
      if (tier === TRAIL_TIER.REDUCED && !this._trailCadenceAllows(e, tier)) continue;
      const profileId = this._engineProfileIdFor(e);
      // Always attempt admit when tier-eligible. At cap, admitShip returns null and
      // increments saturated so overflow is truthful (legacy fallback, not silent drop).
      const ship = fleet.admitShip(e.id, profileId, false);
      if (!ship) continue;
      const socketCount = this._writeProductionPlumeSockets(e);
      fleet.setShipSockets(ship, this._productionPlumeSocketView, socketCount);
      fleet.setShipDrive(ship, this._engineDriveFor(e));
      this._factionThrusterRgbInto(e, rgb);
      fleet.setShipFactionRgb(ship, rgb.r, rgb.g, rgb.b);
    }

    const diag = fleet.endFrame(dt);
    energy.fleetDiag = diag;
    // Sticky production ownership for the next trail pass (no alloc).
    let owned = 0;
    for (let i = 0; i < fleet.ships.length && owned < this._productionOwnedIds.length; i++) {
      const s = fleet.ships[i];
      if (!s.alive) continue;
      this._productionOwnedIds[owned++] = s.entityId;
    }
    this._productionOwnedCount = owned;
    // Awake signal is thrust, not admission: a parked nearby ship must not pin the energy
    // subsystem awake (idle-sleep invariant).
    energy.plumeDrive = diag && (diag.shipsActive - (diag.idleShips || 0)) > 0 ? 1 : 0;
    // Player drive snapshot for sleep/relevance heuristics.
    if (player && player.alive) {
      const pd = this._engineDriveFor(player);
      energy.plumeDrive = Math.max(energy.plumeDrive, pd.drive);
      energy.boostBlend = pd.boost;
    }
    this._updateProductionRcs(player, dt, a11y);
  },

  _writeProductionPlumeSockets(player) {
    const authored = this._trailSocketObjects(player);
    const count = Math.min(this._productionPlumeSockets.length, Math.max(1, authored.length));
    this._productionPlumeSocketView.length = count;
    for (let i = 0; i < count; i++) {
      const out = this._productionPlumeSockets[i];
      this._productionPlumeSocketView[i] = out;
      let pose = null;
      if (authored[i]) pose = this._trailSocketPoseFromObject(authored[i]);
      else if (i === 0) pose = this._trailSocketWorldPose(player);
      if (pose) {
        const local = this._toLocalXZ(pose.x, pose.z, this._spawnLocalXZ);
        out.x = local.x;
        out.y = pose.y;
        out.z = local.z;
        // Shader extends along -axis. Authored socket forward is exhaust direction.
        out.ax = -pose.forwardX;
        out.ay = -pose.forwardY;
        out.az = -pose.forwardZ;
      } else {
        const cf = Math.cos(player.rot || 0);
        const sf = Math.sin(player.rot || 0);
        const back = (player.radius || 4) * 0.85;
        const local = this._toLocalXZ(player.pos.x - cf * back, player.pos.z - sf * back, this._spawnLocalXZ);
        out.x = local.x;
        out.y = 0;
        out.z = local.z;
        out.ax = cf;
        out.ay = 0;
        out.az = sf;
      }
    }
    return count;
  },

  _updateProductionRcs(player, dt, a11y) {
    const energy = this._energy;
    if (!energy) return;
    // Player RCS rides the active family system (signed telemetry is player-only).
    const rcsSystem = (energy.fleet && energy.fleet.playerRcsSystem()) || energy.rcsSystem;
    if (!rcsSystem) return;
    energy.rcsSystem = rcsSystem;
    energy.rcsCooldown = Math.max(0, energy.rcsCooldown - dt);
    const actuators = this._actuatorsFor(player);
    if (actuators && energy.rcsCooldown <= 0) {
      const pose = this._rcsPoseScratch;
      pose.x = player.pos && Number.isFinite(player.pos.x) ? player.pos.x : 0;
      pose.z = player.pos && Number.isFinite(player.pos.z) ? player.pos.z : 0;
      pose.rot = player.rot || 0;
      pose.radius = player.radius || 6;
      const firings = resolveRcsFirings(
        actuators,
        pose,
        this._rcsScaleFor(player._flightFrame),
        this._productionRcsFirings,
      );
      let fired = 0;
      const authoredSockets = this._rcsSocketObjects(player);
      for (let i = 0; i < firings.length && fired < this._rcsOrigins.length; i++) {
        const jet = firings[i];
        if (!(jet.intensity > 0.001)) continue;
        const origin = this._rcsOrigins[fired];
        const axis = this._rcsAxes[fired];
        const authoredSocket = jet.role === 'rcs-port'
          ? authoredSockets && authoredSockets.port
          : (jet.role === 'rcs-starboard' ? authoredSockets && authoredSockets.starboard : null);
        if (authoredSocket) {
          // A composition exposes one lateral RCS nozzle per side. Pure translation resolves bow
          // and stern forces on the same side; draw the strongest one once at the authored nozzle
          // instead of stacking two identical impulses at one position.
          let strongest = i;
          for (let j = 0; j < firings.length; j++) {
            if (firings[j].role !== jet.role) continue;
            if (firings[j].intensity > firings[strongest].intensity) strongest = j;
          }
          if (strongest !== i) continue;
          let earlierTie = false;
          for (let j = 0; j < i; j++) {
            if (firings[j].role === jet.role && firings[j].intensity === jet.intensity) {
              earlierTie = true;
              break;
            }
          }
          if (earlierTie) continue;
        }
        if (!this._writeRcsSocketPose(authoredSocket, origin, axis)) {
          const local = this._toLocalXZ(jet.x, jet.z, this._spawnLocalXZ);
          origin[0] = local.x; origin[1] = 0; origin[2] = local.z;
          axis[0] = jet.dirX; axis[1] = 0; axis[2] = jet.dirZ;
        }
        energy.rcsSystem.fire(origin, axis, jet.intensity);
        fired++;
      }
      if (fired > 0) energy.rcsCooldown = a11y.reducedMotion ? 0.18 : 0.11;
    }
    energy.rcsSystem.update(dt, a11y);
  },

  _hideEnergyPlumes() {
    const energy = this._energy;
    if (!energy) return;
    if (energy.fleet) energy.fleet.reset();
    else {
      if (energy.plumeSystem) energy.plumeSystem.reset();
      if (energy.rcsSystem) energy.rcsSystem.reset();
    }
    energy.plumeDrive = 0;
    energy.boostBlend = 0;
    energy.rcsCooldown = 0;
    // Production plume is hidden — never leave sticky ownership suppressing fallback trails.
    this._clearProductionOwnership();
  },

  _resetEnergyForBoundary() {
    this._hideEnergyPlumes();
    this._energyPlumeWasRelevant = false;
    if (this._energy && this._energy.ribbon) this._energy.ribbon.visible = false;
  },

  _updateEnergyMassline(dt) {
    const { ribbon } = this._energy;
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (!player || !player.alive) { ribbon.visible = false; return; }
    // Find an active attachment owned or targeted by the player to render the ribbon along.
    const attachments = this.state.combat && this.state.combat.attachments && this.state.combat.attachments.byId;
    let att = null;
    if (attachments) {
      for (const key in attachments) {
        const a = attachments[key];
        // Player-OWNED tethers are drawn by the segmented tether cable (sag/whip/strain) — the
        // straight HDR ribbon here would double-draw as a stiff stick on top of it. The ribbon
        // still covers attachments where the player is the TARGET (something latched onto us).
        if (a.state === 'active' && a.ownerId === player.id && this._tetherCable) continue;
        if (a.state === 'active' && (a.ownerId === player.id || a.targetId === player.id)) { att = a; break; }
      }
    }
    if (!att) { ribbon.visible = false; return; }
    const other = this.state.entities.get(att.ownerId === player.id ? att.targetId : att.ownerId);
    if (!other || !other.alive) { ribbon.visible = false; return; }
    const dx = other.pos.x - player.pos.x, dz = other.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (!(dist > 0.5)) { ribbon.visible = false; return; }
    const pLocal = this._toLocalXZ(player.pos.x, player.pos.z, this._spawnLocalXZ);
    ribbon.position.set(pLocal.x, 0, pLocal.z);
    ribbon.rotation.y = Math.atan2(dz, dx);
    ribbon.scale.set(1, 1, dist);
    ribbon.visible = true;
    // Tension from the massline controller telemetry (set by attachments.js); overload drives the
    // chatter + color shift baked into the energy shader via the pulse uniform.
    const ml = att.masslineTelemetry;
    const tension = ml ? Math.min(1, ml.tensionFraction || 0) : 0;
    const overload = !!(ml && ml.overloadRatio > 1);
    const core = ribbon.userData.energyCore;
    const halo = ribbon.userData.energyHalo;
    const intensity = 2.2 + tension * 2.4 + (overload ? 1.8 : 0);
    const radianceScale = this._bloomRadianceScale();
    // Radiance is free to run above 1 (that is what makes a core clip to white); COVERAGE is not —
    // an alpha above ~0.8 on an additive volume stops reading as a volume and starts reading as a
    // painted decal. Clamp the two independently.
    const opacityScale = Math.min(1.35, Math.sqrt(radianceScale));
    if (core) updateEnergyMaterial(core.material, { time: this._t, intensity: intensity * radianceScale, opacity: 0.42 * opacityScale, pulse: 1.0 + tension * 0.9 });
    if (halo) updateEnergyMaterial(halo.material, { time: this._t, intensity: intensity * 0.35 * radianceScale, opacity: 0.11 * opacityScale, pulse: 1.0 + tension * 0.6 });
  },

  _disposeEnergy() {
    if (!this._energy) return;
    if (this._energy.fleet) {
      this._energy.fleet.dispose();
    } else {
      const plumeSystem = this._energy.plumeSystem;
      const rcsSystem = this._energy.rcsSystem;
      if (plumeSystem && plumeSystem.group && plumeSystem.group.parent) plumeSystem.group.parent.remove(plumeSystem.group);
      if (rcsSystem && rcsSystem.group && rcsSystem.group.parent) rcsSystem.group.parent.remove(rcsSystem.group);
      if (plumeSystem) plumeSystem.dispose();
      if (rcsSystem) rcsSystem.dispose();
    }
    if (this._energy.ribbon && this._energy.ribbon.parent) this._energy.ribbon.parent.remove(this._energy.ribbon);
    disposeEnergyVolumeMaterials(this._energy.ribbon);
    if (this._energy.ribbonGeo) this._energy.ribbonGeo.dispose();
    this._energy = null;
    this._clearProductionOwnership();
  },

  // ---------------------------------------------------------------------------------------------
  // RCS truth (ledger RC-3): the renderer consumes SIGNED actuator demand.
  //
  // Slice 0 published the demand; nothing read it. Presentation kept guessing nozzles from input
  // keys, so a turn fired both bow retros and every jet the pilot did not personally command —
  // assist drift-kill, autopilot manoeuvres, governor counter-thrust — was invisible. These three
  // methods are the consumer half. They add no physics and re-derive nothing: the sign, the
  // per-nozzle magnitudes and the drive-state flags all arrive from the telemetry seam.
  // ---------------------------------------------------------------------------------------------

  /** Per-drive normalization denominators, cached by driveId (the catalogue is immutable). */
  _rcsScaleFor(frame) {
    const driveId = frame && typeof frame.driveId === 'string' ? frame.driveId : null;
    return driveId && this._rcsScaleCache.get(driveId) || this._rcsDefaultScale;
  },

  /** Signed player actuator truth published by flightV3; presentation never re-simulates physics. */
  _actuatorsFor(e) {
    if (!e || e.id !== this.state.playerId) return null;
    const state = this.state;
    const runtime = state.flightRuntime;
    const telemetry = runtime && runtime.telemetry;
    return telemetry && telemetry.actuators ? telemetry.actuators : null;
  },

  _engineDriveFor(e, out = this._driveScratch) {
    if (!out) {
      out = this._driveScratch = {
        drive: 0, throttle: 0, speed: 0, speedDrive: 0, boost: 0,
        cruise: 0, reverse: 0, retroOnly: false, brake: 0,
      };
    }
    if (!e) {
      out.drive = 0; out.throttle = 0; out.speed = 0; out.speedDrive = 0; out.boost = 0;
      out.cruise = 0; out.reverse = 0; out.retroOnly = false; out.brake = 0;
      return out;
    }
    const frame = e._flightFrame || {};
    const vx = e.vel && Number.isFinite(e.vel.x) ? e.vel.x : 0;
    const vz = e.vel && Number.isFinite(e.vel.z) ? e.vel.z : 0;
    const speed = Math.hypot(vx, vz);
    const maxFromEntity = Number.isFinite(e.maxSpeed) ? e.maxSpeed : 0;
    const maxFromFrame = Number.isFinite(frame.maxSpeed) ? frame.maxSpeed : 0;
    const maxSpeed = Math.max(1, maxFromEntity || maxFromFrame || 120);
    let throttle = 0;
    if (Number.isFinite(frame.throttle)) throttle = Math.max(0, Math.min(1.15, frame.throttle));
    else if (Number.isFinite(frame.commandedThrottle)) throttle = Math.max(0, Math.min(1.15, frame.commandedThrottle));
    if (e.id === this.state.playerId) {
      const inp = this.state.input;
      if (inp && Number.isFinite(inp.moveZ) && inp.moveZ > 0) throttle = Math.max(throttle, Math.min(1.15, inp.moveZ));
    }
    // Physics beats keys. When the flight computer has published signed demand, the plume follows
    // the thrust the drive is ACTUALLY producing — which includes assist and autopilot thrust the
    // pilot never commanded, and excludes the key the pilot is holding while the governor ignores it.
    const actuators = this._actuatorsFor(e);
    const md = mainDriveDemand(
      actuators,
      this._rcsScaleFor(frame),
      this._mainDriveDemandScratch,
    );
    if (md) throttle = md.main;
    const reverse = md ? Math.max(0, md.reverse || 0) : Math.max(0, actuators && actuators.reverse || 0);
    const retroOnly = !!(md && md.retroOnly);
    const cf = Math.cos(e.rot || 0);
    const sf = Math.sin(e.rot || 0);
    const forwardSpeed = Number.isFinite(frame.forwardSpeed) ? frame.forwardSpeed : (vx * cf + vz * sf);
    let forwardDrive = Math.min(1.1, Math.max(0, forwardSpeed) / Math.max(35, maxSpeed * 0.75));
    let speedDrive = Math.min(1, speed / Math.max(40, maxSpeed * 0.75));
    // A ship on its retros has a cold main nozzle. The speed-derived glow used to keep the engine
    // lit while the bow jets fired, which read as accelerating into your own brake — the same class
    // of lie as firing the wrong RCS jet. Damped rather than hard-zeroed so a hard brake at speed
    // still shows a residual thermal glow instead of snapping to black.
    if (retroOnly) { forwardDrive *= 0.18; speedDrive *= 0.18; }
    let boost = e.flags && e.flags.boosting ? 1 : 0;
    const cruising = e.id === this.state.playerId
      && this.state.player
      && this.state.player.cruise
      && this.state.player.cruise.phase === 'cruising';
    const cruise = cruising ? 1 : 0;
    // Brake continuum: residual forward heat while reverse/no throttle at speed.
    let brake = 0;
    if (retroOnly || reverse > 0.05) brake = Math.min(1, 0.35 + speedDrive * 0.65);
    else if (throttle < 0.08 && speedDrive > 0.2) brake = Math.min(1, speedDrive * 0.55);
    let drive = Math.min(1.35, Math.max(throttle, forwardDrive * 0.85, speedDrive * 0.40) + boost * 0.45);
    // Dead thruster look when presentation marks drive-disabled / tumbling thrash fade-out.
    // boost must be `let` — deadThruster path multiplies it in place for the out.boost write.
    const tumblePres = e.presentation && e.presentation.tumble;
    if (tumblePres && Number.isFinite(tumblePres.deadThruster) && tumblePres.deadThruster > 0.05) {
      const kill = Math.max(0, Math.min(1, tumblePres.deadThruster));
      drive *= (1 - kill * 0.92);
      boost *= (1 - kill);
    }
    out.drive = drive;
    out.throttle = throttle;
    out.speed = speed;
    out.speedDrive = speedDrive;
    out.boost = boost;
    out.cruise = cruise;
    out.reverse = reverse;
    out.retroOnly = retroOnly;
    out.brake = brake;
    return out;
  },

  _forceNeonMetrics(extra = {}) {
    const settings = this.state && this.state.settings || {};
    return {
      motionReduce: !!(settings.video && settings.video.motionReduce),
      flashReduce: !!(settings.accessibility && settings.accessibility.flashReduce),
      ...extra,
    };
  },

  /**
   * Continuous tumble / drift body-language VFX. Reads presentation intent written by
   * updateShipPitchPresentation; never writes sim. Cadence-gated thrash puffs + spin ribbons.
   */
  _updateTumbleBodyLanguageVfx(dt) {
    if (!this._scene || !this.state || this.state.mode !== 'flight') return;
    if (!this._tumbleVfxCd) this._tumbleVfxCd = new Map();
    const reduced = this._isReduced();
    const list = shipPitchCandidates(this.state);
    const cd = this._tumbleVfxCd;
    for (const e of list) {
      if (!e || !e.alive || !e.pos) continue;
      if (e.id === this.state.playerId) continue;
      const tumble = e.presentation && e.presentation.tumble;
      const plan = resolveTumbleContinuousVfxPlan(tumble || {});
      if (!plan.active) {
        if (cd.has(e.id)) cd.delete(e.id);
        continue;
      }
      if (!plan.spawnThrash && !plan.spawnRibbon && !plan.spawnHullBlur && !tumble.recovering) continue;
      const thrash = plan.thrash;
      const ribbon = plan.ribbon;
      const hullBlur = plan.hullBlur;
      const hz = Math.max(4, plan.thrashCadenceHz || 8);
      const period = 1 / hz;
      let age = cd.get(e.id) || 0;
      age += Math.max(0, dt || 0);
      if (age < period) {
        cd.set(e.id, age);
        continue;
      }
      cd.set(e.id, age - period);
      const neon = resolveForceNeonScale('tumble.continuous', this._forceNeonMetrics({
        rcsThrash: thrash,
        poseIntensity: tumble.poseIntensity,
      }));
      const r = Math.max(3, e.radius || 6);
      const ang = (e.rot || 0) + (e.angVel || 0) * 0.08;
      // Frantic RCS thrash: alternating side puffs that weaken as thrash falls (then-failing).
      if (plan.spawnThrash && !reduced) {
        const side = (Math.sin((e.id || 0) + age * 17) > 0 ? 1 : -1);
        const px = e.pos.x + Math.cos(ang + side * 1.2) * r * 0.7;
        const pz = e.pos.z + Math.sin(ang + side * 1.2) * r * 0.7;
        const vx = Math.cos(ang + side * 1.2) * (12 + thrash * 28) * neon.particleBoost;
        const vz = Math.sin(ang + side * 1.2) * (12 + thrash * 28) * neon.particleBoost;
        this._spawnSprite(SPR_PUFF, px, 0.05, pz, 0.22 + thrash * 0.18, 0.9 * thrash + 0.4, 2.2,
          0.35 + thrash * 0.35, 0, '#ffe0d0', vx, vz);
      }
      // Spin ribbon: short directional streak opposite angular motion.
      if (plan.spawnRibbon) {
        const tx = -Math.sin(ang) * (18 + ribbon * 40);
        const tz = Math.cos(ang) * (18 + ribbon * 40);
        this._c0.set('#ffe2d6');
        this._c1.set('#ff5a48');
        this._spawnParticle(
          e.pos.x, e.pos.z,
          tx * 0.35, tz * 0.35,
          0.18 + ribbon * 0.2,
          1.2 * neon.energy * 0.5, 0.05,
          this._c0, this._c1,
          1.3, 0, 0,
        );
      }
      // Hull blur / motion smear — soft ghost puffs along spin (consumes presentation.tumble.hullBlur).
      if (plan.spawnHullBlur && !reduced) {
        const smear = hullBlur;
        const sx = -Math.sin(ang) * r * (0.35 + smear * 0.55);
        const sz = Math.cos(ang) * r * (0.35 + smear * 0.55);
        this._spawnSprite(
          SPR_PUFF,
          e.pos.x - sx * 0.4, 0.02, e.pos.z - sz * 0.4,
          0.16 + smear * 0.14,
          1.1 + smear * 1.4,
          2.8 + smear * 1.6,
          0.18 + smear * 0.22,
          0,
          '#ffc8b8',
          -sx * (4 + smear * 10),
          -sz * (4 + smear * 10),
        );
      }
      // Recover settle flash once when recovering starts (very light).
      if (tumble.recovering && thrash < 0.05 && ribbon < 0.25 && age < period * 1.5) {
        this._spawnSprite(SPR_FLASH, e.pos.x, 0, e.pos.z, 0.12, r * 0.3, r * 1.1, 0.35, 0, '#dfefff', 0, 0);
      }
    }
    // Bound map growth: drop ids for dead entities occasionally.
    if (cd.size > 48) {
      for (const id of cd.keys()) {
        const ent = this.state.entities && this.state.entities.get(id);
        if (!ent || !ent.alive) cd.delete(id);
      }
    }
  },

  // Approximate commanded throttle for the plume: forward input, forward speed, or boost blend.
  _throttleFor(player) {
    return this._engineDriveFor(player).drive;
  },

  // -------------------------------------------------------------------------
  // Event lights (V2 §11 Tier-A rendering finish). A small pool of dynamic PointLights grabbed on
  // "hero" events — muzzle flashes, explosions near the player, mining impacts, shield breaks — so
  // they actually light their surroundings instead of just spraying additive sprites. This is the
  // single biggest "sheen" upgrade for a low, bounded cost: capped at NPOOL simultaneous lights,
  // player-proximate only (distant NPC fights don't light up), and decayed each frame.
  // -------------------------------------------------------------------------
  _LIGHT_NPOOL: EVENT_LIGHT_POOL_SIZE,
  _initEventLights() {
    if (!this._scene) return;
    // The pool is structural shader state and therefore exists at every quality/accessibility
    // setting. _flashLight applies the current accessibility intensity profile on every event, so
    // motion/flash reduction remains live without changing the visible PointLight count.
    this._activeLightCount = 0;
    this._lights = [];
    for (let i = 0; i < this._LIGHT_NPOOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 400, 2.0); // color, intensity, distance, decay
      // Pool lights stay VISIBLE forever and flash via intensity only. three bakes the visible
      // light COUNT into every shader program, so toggling .visible forces a synchronous
      // whole-scene shader recompile (measured multi-second stalls on Intel/ANGLE). The count
      // must never change at runtime — precompile.js warms shaders against this same count.
      this._scene.add(l);
      this._lights.push({
        slot: i,
        obj: l,
        intensity: 0,
        peak: 0,
        decay: 0,
        t: 0,
        active: false,
        admissionPriority: DEFAULT_VFX_ADMISSION_PRIORITY,
        admissionSerial: -1,
      });
    }
    this._freeLights = new Int32Array(this._LIGHT_NPOOL);
    for (let i = 0; i < this._LIGHT_NPOOL; i++) this._freeLights[i] = this._LIGHT_NPOOL - 1 - i;
    this._freeLightCount = this._LIGHT_NPOOL;
    // Retained as an inspectable last-grab cursor; free allocation is stack-backed.
    this._lightCur = 0;
  },

  // Grab a pool light, position it at {x,z} (y lifted slightly above the plane), set its color +
  // peak intensity, and arm a decay rate. Intensity eases up over ~50ms then decays exponentially
  // — reads as a sharp flash, not a fade-in. `decayRate` ~ 6-10 (higher = snappier).
  // `color` may be a hex number (0xffb060) OR a CSS string ('#ffb060') — normalized internally.
  // `pos` is galactic-global XZ (same as entity.pos / event payloads); GPU placement is frame-local.
  _flashLight(pos, color, peak, decayRate, dist, admissionPriority) {
    const pool = this._lights;
    if (!pool || !pos) return false;
    const accessibility = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    peak *= accessibility.eventLightPeakScale;
    if (peak <= 0) return false;
    // Cull if the event is far from the player (lights far away contribute nothing visible but
    // still cost a per-fragment eval). Generous radius so nearby fights still light up.
    // Distance uses global coordinates so the cull is origin-invariant.
    const pp = this._playerPos();
    const d = Math.hypot((pos.x || 0) - pp.x, (pos.z || 0) - pp.z);
    if (d > 700) return false;
    const priority = normalizeVfxAdmissionPriority(
      admissionPriority,
      this._spawnAdmissionPriority,
    );
    let slotIndex;
    if (this._freeLightCount > 0) {
      slotIndex = this._freeLights[--this._freeLightCount];
    } else {
      slotIndex = 0;
      for (let i = 1; i < pool.length; i++) {
        const candidate = pool[i];
        const resident = pool[slotIndex];
        if (candidate.admissionPriority < resident.admissionPriority
          || (candidate.admissionPriority === resident.admissionPriority
            && candidate.admissionSerial < resident.admissionSerial)) slotIndex = i;
      }
      if (priority < pool[slotIndex].admissionPriority) return false;
    }
    const slot = pool[slotIndex];
    this._lightCur = (slotIndex + 1) % pool.length;
    const obj = slot.obj;
    if (!slot.active) {
      slot.active = true;
      this._activeLightCount++;
    }
    const local = this._toLocalXZ(pos.x || 0, pos.z || 0, this._spawnLocalXZ);
    obj.position.set(local.x, 12, local.z); // lift above the play plane
    if (typeof color === 'number') obj.color.setHex(color);
    else obj.color.set(color); // CSS string ('#ffb060', 'rgb(...)', named)
    if (dist) obj.distance = dist;
    slot.peak = peak;
    slot.intensity = peak * 0.3; // start ramped partway (fast attack)
    slot.decay = decayRate || 8;
    slot.t = 0;
    slot.admissionPriority = priority;
    slot.admissionSerial = this._admissionSerial++;
    return true;
  },

  _decayEventLights(dt) {
    const pool = this._lights;
    if (!pool || this._activeLightCount <= 0) return false;
    const ATTACK = 0.05; // seconds to reach peak after the initial partial ramp
    for (const slot of pool) {
      if (slot.peak <= 0) continue;
      slot.t += dt;
      if (slot.t < ATTACK) {
        // fast attack toward peak
        slot.intensity += (slot.peak - slot.intensity) * Math.min(1, dt / ATTACK);
      } else {
        // exponential decay toward 0
        slot.intensity += -slot.intensity * slot.decay * dt;
        if (slot.intensity < 0.02) {
          slot.intensity = 0;
          slot.peak = 0;
          if (slot.active) {
            slot.active = false;
            this._activeLightCount = Math.max(0, this._activeLightCount - 1);
            slot.admissionPriority = DEFAULT_VFX_ADMISSION_PRIORITY;
            slot.admissionSerial = -1;
            this._freeLights[this._freeLightCount++] = slot.slot;
          }
        }
      }
      slot.obj.intensity = slot.intensity;
    }
    return this._activeLightCount > 0;
  },

  _playerPos() {
    const e = this.state.entities.get(this.state.playerId);
    return e ? e.pos : this._zeroPos;
  },

  /**
   * Persistent trail context — mutates preallocated scratch, never allocates.
   */
  _trailContext() {
    // Preallocated at VFX init — mutate in place, never allocate.
    const ctx = this._trailContextScratch;
    const state = this.state;
    const player = state.entities.get(state.playerId);
    const playerPos = player && player.pos ? player.pos : this._zeroPos;
    const camera = state.render && state.render.camera;
    const camPos = camera && camera.position;
    ctx.playerId = state.playerId;
    ctx.playerX = playerPos.x || 0;
    ctx.playerZ = playerPos.z || 0;
    ctx.playerTeam = player && player.team;
    ctx.targetId = state.player && state.player.targetId;
    ctx.radarRange = (state.ui && Number.isFinite(state.ui.radarRange)) ? state.ui.radarRange : 4000;
    ctx.cameraX = camPos && Number.isFinite(camPos.x) ? camPos.x : playerPos.x || 0;
    ctx.cameraZ = camPos && Number.isFinite(camPos.z) ? camPos.z : playerPos.z || 0;
    ctx.camera = camera;
    ctx.state = state;
    return ctx;
  },

  /** Persistent screen-check budget for trail/fleet culling — no per-call `{ remaining }`. */
  _trailScreenChecks() {
    this._trailScreenCheckScratch.remaining = TRAIL_SCREEN_CHECK_MAX;
    return this._trailScreenCheckScratch;
  },

  /**
   * Resolve faction thruster RGB into preallocated scratch (no Color/object/string alloc).
   * Direct charCode nibble parse — no String.slice / substring on the hot path.
   * @param {object} e entity
   * @param {{r:number,g:number,b:number}} out
   */
  _factionThrusterRgbInto(e, out) {
    const hex = this._engineColor(e) || '#88AAFF';
    if (typeof hex === 'string' && hex.length >= 7 && hex.charCodeAt(0) === 35) {
      const r0 = hexNibbleFromCharCode(hex.charCodeAt(1));
      const r1 = hexNibbleFromCharCode(hex.charCodeAt(2));
      const g0 = hexNibbleFromCharCode(hex.charCodeAt(3));
      const g1 = hexNibbleFromCharCode(hex.charCodeAt(4));
      const b0 = hexNibbleFromCharCode(hex.charCodeAt(5));
      const b1 = hexNibbleFromCharCode(hex.charCodeAt(6));
      if (r0 >= 0 && r1 >= 0 && g0 >= 0 && g1 >= 0 && b0 >= 0 && b1 >= 0) {
        out.r = (r0 * 16 + r1) / 255;
        out.g = (g0 * 16 + g1) / 255;
        out.b = (b0 * 16 + b1) / 255;
        return out;
      }
    }
    out.r = 0.533;
    out.g = 0.667;
    out.b = 1.0;
    return out;
  },

  /** Clear sticky production ownership so fallback trails are not suppressed after hide. */
  _clearProductionOwnership() {
    this._productionOwnedCount = 0;
    const ids = this._productionOwnedIds;
    if (ids) {
      for (let i = 0; i < ids.length; i++) ids[i] = null;
    }
  },

  _trailTierFor(e, ctx) {
    if (!e || !e.alive) return TRAIL_TIER.SKIP;
    if (e.id === ctx.playerId) return TRAIL_TIER.FULL;
    if (ctx.targetId != null && e.id === ctx.targetId) return TRAIL_TIER.FULL;

    const px = e.pos && Number.isFinite(e.pos.x) ? e.pos.x : 0;
    const pz = e.pos && Number.isFinite(e.pos.z) ? e.pos.z : 0;
    // playerX/Z are galactic-global; cameraX/Z are frame-local (Three camera).
    const distPlayer = Math.hypot(px - ctx.playerX, pz - ctx.playerZ);
    const local = this._toLocalXZ(px, pz, this._entityLocalXZ);
    const distCamera = Math.hypot(local.x - ctx.cameraX, local.z - ctx.cameraZ);
    const data = e.data || {};

    if (data.wingmanOf || data.isWingman) return TRAIL_TIER.NORMAL;
    if (ctx.playerTeam != null && e.team === ctx.playerTeam) return TRAIL_TIER.NORMAL;
    if (isHostileToPlayer(e, ctx.playerTeam, ctx.state) && distPlayer <= TRAIL_NORMAL_PLAYER_DIST) {
      return TRAIL_TIER.NORMAL;
    }
    if (distPlayer <= TRAIL_NORMAL_PLAYER_DIST && distCamera <= TRAIL_CAMERA_NORMAL_DIST) {
      return TRAIL_TIER.NORMAL;
    }
    if (
      isHostileToPlayer(e, ctx.playerTeam, ctx.state)
      && distPlayer <= ctx.radarRange
      && distCamera <= TRAIL_CAMERA_NORMAL_DIST * 1.35
    ) {
      return TRAIL_TIER.NORMAL;
    }
    if (distPlayer > ctx.radarRange) return TRAIL_TIER.SKIP;
    if (distCamera > TRAIL_CAMERA_SKIP_DIST && distPlayer > TRAIL_SKIP_PLAYER_DIST) return TRAIL_TIER.SKIP;
    if (
      distCamera > TRAIL_CAMERA_NORMAL_DIST * 1.15
      && distPlayer > TRAIL_NORMAL_PLAYER_DIST
      && ctx.camera
    ) {
      return 'screen-check';
    }
    return TRAIL_TIER.REDUCED;
  },

  _trailOnScreen(e, ctx) {
    const camera = ctx.camera;
    if (!camera || typeof camera.project !== 'function') return true;
    const scratch = this._trailScreenScratch;
    const local = this._toLocalXZ(
      e.pos && Number.isFinite(e.pos.x) ? e.pos.x : 0,
      e.pos && Number.isFinite(e.pos.z) ? e.pos.z : 0,
      this._entityLocalXZ,
    );
    scratch.set(local.x, 0, local.z);
    scratch.project(camera);
    const pad = 0.18;
    return scratch.x >= -1 - pad && scratch.x <= 1 + pad
      && scratch.y >= -1 - pad && scratch.y <= 1 + pad
      && scratch.z >= -1 && scratch.z <= 1;
  },

  _resolveTrailTier(e, ctx, screenChecks) {
    let tier = this._trailTierFor(e, ctx);
    if (tier !== 'screen-check') return tier;
    if (screenChecks.remaining <= 0) return TRAIL_TIER.REDUCED;
    screenChecks.remaining--;
    return this._trailOnScreen(e, ctx) ? TRAIL_TIER.REDUCED : TRAIL_TIER.SKIP;
  },

  _trailCadenceAllows(e, tier) {
    if (tier === TRAIL_TIER.FULL || tier === TRAIL_TIER.NORMAL) return true;
    if (tier !== TRAIL_TIER.REDUCED) return false;
    const id = (e && e.id) | 0;
    return ((this._trailFrameIndex + id) % TRAIL_REDUCED_CADENCE) === 0;
  },

  _recordTrailBudget(tier, spawned) {
    const diag = this._trailBudgetDiag;
    if (tier === TRAIL_TIER.FULL) diag.trailEmittersFull++;
    else if (tier === TRAIL_TIER.NORMAL) diag.trailEmittersNormal++;
    else if (tier === TRAIL_TIER.REDUCED) diag.trailEmittersReduced++;
    if (spawned) {
      diag.trailParticlesSpawned += spawned.particles || 0;
      diag.trailStreaksSpawned += spawned.streaks || 0;
      diag.trailSpritesSpawned = diag.trailStreaksSpawned;
    }
  },

  _publishTrailBudgetDiag() {
    const perf = this.state.perfRuntime;
    if (perf && typeof perf.recordVfxTrails === 'function') perf.recordVfxTrails(this._trailBudgetDiag);
  },

  _refreshProjectileCandidates() {
    const list = this.state.entityList || [];
    if (!this._projectileCacheDirty && this._projectileListRef === list && this._projectileListLength === list.length) return;
    this._projectileCandidates.length = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'projectile') continue;
      this._projectileCandidates.push(e);
    }
    this._projectileListRef = list;
    this._projectileListLength = list.length;
    this._projectileCacheDirty = false;
  },

  _projectileTrailsRelevant() {
    this._refreshProjectileCandidates();
    return this._projectileCandidates.length > 0;
  },

  _recordProjectileTrailClass(diag, cls, kind) {
    const totals = diag.byClass[cls] || diag.byClass.other;
    totals[kind]++;
  },

  _executeProjectileTrailPlan(plan, diag) {
    const cls = plan.class || 'kinetic';
    const { x: bx, z: bz } = plan.origin;
    const { x: vx, z: vz } = plan.vel;
    const { x: backX, z: backZ } = plan.backVel;
    const trailAxis = plan.trailAxis;

    if ((plan.mode === 'streak' || plan.mode === 'tracer') && plan.streak) {
      const streak = this._spawnProjectileTrailStreak(
        bx, 0, bz, plan.life, plan.streak.width, plan.streak.length, plan.streak.opacity,
        plan.coreColor, vx * 0.12, vz * 0.12,
      );
      if (streak) {
        diag.streaksSpawned++;
        this._recordProjectileTrailClass(diag, cls, 'streaks');
      } else {
        const fb = plan.streak.fallback || {};
        this._c0.set(plan.coreColor); this._c1.set(plan.tailColor);
        this._spawnParticle(bx, bz, vx * 0.06, vz * 0.06, plan.life, fb.size0 || 0.28, 0.0,
          this._c0, this._c1, plan.drag, 0, 0, trailAxis, fb.stretch || 2.2);
        diag.particlesSpawned++;
        this._recordProjectileTrailClass(diag, cls, 'particles');
      }
      return true;
    }

    if (plan.mode === 'propelled' && plan.streak && plan.sprite) {
      // The attached hot exhaust is continuous at the 45 Hz projectile cadence. Cooling vapor is
      // sampled at one-third cadence and stretched down-axis, so it overlaps into a coherent wake
      // instead of a row of independent smoke beads.
      const exhaust = this._spawnProjectileTrailStreak(
        bx, 0.12, bz, Math.min(0.12, plan.life * 0.4), plan.streak.width,
        plan.streak.length, plan.streak.opacity, plan.coreColor,
        vx * 0.04, vz * 0.04, backX, backZ,
      );
      if (exhaust) {
        diag.streaksSpawned++;
        this._recordProjectileTrailClass(diag, cls, 'streaks');
      }
      if (plan.emitSmoke) {
        this._spawnSprite(SPR_PUFF, bx + backX * 0.45, 0, bz + backZ * 0.45,
          plan.life, plan.sprite.size0, plan.sprite.size1,
          0.22, 0.0, plan.tailColor, backX * 7, backZ * 7,
          plan.sprite.aspect || 2.5, Math.atan2(backZ, backX));
        diag.spritesSpawned++;
        this._recordProjectileTrailClass(diag, cls, 'sprites');
      }
      return true;
    }

    if (plan.mode === 'thermal-wake' && plan.streak) {
      // Two attached, overlapping streams create a directional thermal volume. Both share the
      // projectile axis and retire before gaps can form at the 45 Hz emitter cadence; unlike the
      // former point-particle recipe, neither layer can become a detached ball or bead trail.
      const inner = this._spawnProjectileTrailStreak(
        bx, 0.17, bz, plan.life, plan.streak.width, plan.streak.length,
        plan.streak.opacity, plan.coreColor, vx * 0.055, vz * 0.055, backX, backZ,
      );
      const sheath = this._spawnProjectileTrailStreak(
        bx + backX * 0.22, 0.12, bz + backZ * 0.22, plan.life * 1.25,
        plan.streak.width * 1.85, plan.streak.length * 0.72,
        plan.streak.opacity * 0.32, plan.tailColor,
        vx * 0.035, vz * 0.035, backX, backZ,
      );
      if (inner) {
        diag.streaksSpawned++;
        this._recordProjectileTrailClass(diag, cls, 'streaks');
      }
      if (sheath) {
        diag.streaksSpawned++;
        this._recordProjectileTrailClass(diag, cls, 'streaks');
      }
      return true;
    }

    if (plan.particle) {
      for (let pi = 0; pi < plan.emitCount; pi++) {
        const j = (Math.random() - 0.5) * 0.5;
        this._c0.set(plan.coreColor); this._c1.set(plan.tailColor);
        this._spawnParticle(bx + j, bz + j, vx * 0.03, vz * 0.03, plan.life,
          plan.particle.size0, plan.particle.size1,
          this._c0, this._c1, plan.drag, 0, 0, trailAxis, plan.particle.stretch);
        diag.particlesSpawned++;
        this._recordProjectileTrailClass(diag, cls, 'particles');
      }
      return true;
    }
    return false;
  },

  _emitProjectileTrails(dt) {
    if (!this._scene) return false;
    resetProjectileTrailDiag(this._projectileTrailDiag);
    this._refreshProjectileCandidates();
    const list = this._projectileCandidates;
    const diag = this._projectileTrailDiag;
    diag.candidates = list.length;
    if (!list.length) return false;

    const video = this.state.settings && this.state.settings.video;
    const q = (video && video.particleQuality) || 'high';
    const qualityMul = q === 'low' ? 0.45 : (q === 'med' || q === 'medium' ? 0.72 : 1.0);
    const motionMul = (video && video.motionReduce) ? 0.5 : 1.0;
    const burst = (this._burst || 1) * qualityMul * motionMul;
    this._projectileTrailFrameIndex = ((this._projectileTrailFrameIndex || 0) + 1) >>> 0;

    let anySpawned = false;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || e.type !== 'projectile') continue;
      const data = e.data || EMPTY_PROJECTILE_DATA;
      const prof = resolveProjectileTrailProfile(data.weaponId, data);
      const plan = buildProjectileTrailSpawnPlan(prof, e, burst, this._projectileTrailPlanScratch);
      if (plan.skip) continue;
      if (plan.mode === 'propelled') {
        plan.emitSmoke = ((this._projectileTrailFrameIndex + i) % 3) === 0;
      }
      if (this._executeProjectileTrailPlan(plan, diag)) anySpawned = true;
    }
    return anySpawned;
  },

  // per-frame engine-trail emission for every thrusting ship/drone (steady-state, pooled)
  _emitTrails(dt) {
    this._trailAcc = (this._trailAcc || 0) + dt;
    // emit at ~60 Hz cadence (one trail particle per ship per ~16ms)
    if (this._trailAcc < 0.016) return false;
    const step = this._trailAcc; this._trailAcc = 0;
    this._trailFrameIndex++;
    resetTrailBudgetDiag(this._trailBudgetDiag);
    this._refreshTrailCandidates();
    const list = this._trailCandidates;
    const ctx = this._trailContext();
    const screenChecks = this._trailScreenChecks();
    let reducedEmitted = 0;
    this._trailBudgetDiag.trailCandidates = list.length;

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || (e.type !== 'ship' && e.type !== 'drone')) continue;
      if (e.flags && e.flags.docked) continue;

      const driveInfo = this._engineDriveFor(e);
      if (driveInfo.drive < 0.055) continue; // idle ships emit nothing
      const tier = this._resolveTrailTier(e, ctx, screenChecks);
      if (tier === TRAIL_TIER.SKIP) {
        this._trailBudgetDiag.trailEmittersSkipped++;
        continue;
      }
      if (tier === TRAIL_TIER.REDUCED) {
        if (!this._trailCadenceAllows(e, tier)) {
          this._trailBudgetDiag.trailEmittersSkipped++;
          continue;
        }
        if (reducedEmitted >= TRAIL_REDUCED_EMIT_CAP) {
          this._trailBudgetDiag.trailEmittersSkipped++;
          continue;
        }
        reducedEmitted++;
      }
      const spawned = this._emitEngineTrail(e, driveInfo.drive, step, this._trailSpawnScratch);
      this._recordTrailBudget(tier, spawned);
      // Damage smoke: a wounded ship trails smoke so its state is readable at a glance (V2 §9:
      // particles are information). Two tiers — wounded (<40% hull) gets wispy grey smoke,
      // critical (<18%) adds orange embers + denser smoke. Even a stationary/idle damaged ship
      // smokes, so you can spot a limping enemy without HUD readouts.
      if (tier !== TRAIL_TIER.SKIP && e.hullMax && e.hull < e.hullMax) {
        const frac = e.hull / e.hullMax;
        if (frac < 0.40) this._emitDamageSmoke(e, frac, step);
      }
    }
    this._publishTrailBudgetDiag();
    return true;
  },

  // Persistent damage smoke/ember trail for wounded ships. Severe wounds smoke harder and add hot
  // embers; the smoke lingers (low drag, long life) so it leaves a visible trail even when slow.
  // c0/c1 are the color scratch pair; we reuse this._c0/_c1 like the other emitters.
  _SMOKE_GREY: '#3a3a40',
  _SMOKE_DARK: '#18181c',
  _EMBER_HOT: '#ff7a2c',
  _EMBER_DIM: '#7a2a10',
  // Ribbon trails for medium-large ships: maintained per entity, updated each trail tick
  _ribbonTrails: null,
  _initRibbonTrails() { this._ribbonTrails = new Map(); },

  _updateRibbonTrails(dt) {
    if (!this._ribbonTrails || !this._scene) return false;
    if (!richEngineTrailsEnabled(this.state && this.state.settings && this.state.settings.video)) return false;
    this._refreshTrailCandidates();
    if (!this._ribbonCandidates.length) return false;
    const ribbonStep = this._consumeCadence('_cadenceRibbon', dt, VFX_RIBBON_TRAILS_HZ);
    if (ribbonStep <= 0) return false;
    const state = this.state;
    const ctx = this._trailContext();
    const screenChecks = this._trailScreenChecks();
    let active = false;
    for (const e of this._ribbonCandidates) {
      if (!e.alive || (e.type !== 'ship' && e.type !== 'drone')) continue;
      if (e.flags && e.flags.docked) { const rt = this._ribbonTrails.get(e.id); if (rt) rt.clear(); continue; }
      const tier = this._resolveTrailTier(e, ctx, screenChecks);
      if (tier === TRAIL_TIER.SKIP || !this._trailCadenceAllows(e, tier)) continue;
      const driveInfo = this._engineDriveFor(e);
      const speed = Math.hypot((e.vel && e.vel.x) || 0, (e.vel && e.vel.z) || 0);
      if (speed < 4 && driveInfo.drive < 0.04) continue;
      let trail = this._ribbonTrails.get(e.id);
      if (!trail) {
        const w = Math.max(2.5, (e.radius || 14) * 0.16);
        trail = createRibbonTrail(this._scene, this._engineColor(e), 30, w);
        this._ribbonTrails.set(e.id, trail);
      }
      // sample from engine nozzle (rear of ship); socket/entity XZ are galactic-global → frame-local
      const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
      const back = (e.radius || 14) * 0.88;
      const sock = this._trailSocketWorldPose(e);
      const txG = sock ? sock.x : e.pos.x - cf * back;
      const tzG = sock ? sock.z : e.pos.z - sf * back;
      const local = this._toLocalXZ(txG, tzG, this._spawnLocalXZ);
      trail.push(local.x, local.z, sock ? sock.angle + Math.PI : e.rot);
      trail.rebuild(0.16 + Math.min(1, driveInfo.drive) * 0.38 + driveInfo.boost * 0.12, (this._t * 0.35) % 1, this._t);
      active = true;
    }
    // dispose dead entities
    for (const [id, trail] of this._ribbonTrails) {
      const e = state.entities.get(id);
      if (!e || !e.alive) { trail.dispose(); this._ribbonTrails.delete(id); }
    }
    return active;
  },

  _emitDamageSmoke(e, frac, dt) {
    if (!this._scene) return;
    // severity 0..1: 0 at the wound threshold (40%), 1 at death's door (0%)
    const severe = Math.max(0, Math.min(1, (0.40 - frac) / 0.40));
    // emit rate scales with severity; cap so a swarm of wounded ships can't drown the pool.
    // throttle the smoke to ~every other trail tick to stay cheap, harder when critical.
    this._smokeAcc = (this._smokeAcc || 0) + dt * (0.6 + severe * 1.4);
    if (this._smokeAcc < 0.032) return;
    const n = this._smokeAcc >= 0.064 ? 2 : 1;
    this._smokeAcc = 0;

    const r = e.radius || 4;
    // emit from a few offsets around the hull center (a burning ship doesn't smoke from one point)
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    // carry slightly with the ship's motion so the trail streams behind
    const vx = -(e.vel.x || 0) * 0.15;
    const vz = -(e.vel.z || 0) * 0.15;

    for (let k = 0; k < n; k++) {
      // pick a spot on the hull: alternate rear-ish and mid-side so the smoke looks like it's
      // venting from multiple breaches, not a single exhaust.
      const off = (k === 0 ? -0.3 : 0.25) * r + (Math.random() - 0.5) * r * 0.4;
      const lat = (Math.random() - 0.5) * r * 0.7;
      const sx = e.pos.x + cf * off - sf * lat;
      const sz = e.pos.z + sf * off + cf * lat;

      // grey smoke puff: grows, drifts back, fades. Long life + low drag = a lingering trail.
      this._c0.set(this._SMOKE_GREY); this._c1.set(this._SMOKE_DARK);
      const drift = 4 + Math.random() * 6;
      const da = Math.atan2(-(e.vel.z || drift), -(e.vel.x || 0)) + (Math.random() - 0.5) * 1.2;
      this._spawnParticle(
        sx, sz,
        vx + Math.cos(da) * drift * 0.4, vz + Math.sin(da) * drift * 0.4,
        0.9 + severe * 0.6,        // life: longer when worse
        2.2 + severe * 1.5,        // size0: small
        6.0 + severe * 5.0,        // size1: billows out
        this._c0, this._c1,
        0.6,                        // drag: low, so it lingers
        1.5 + Math.random() * 2.0,  // y: rises above the deck
        3.0 + Math.random() * 2.0,  // vy: buoyant rise
      );

      // critical-only hot embers: bright orange sparks that flicker out fast — reads as "this ship
      // is about to die" without needing a health bar. Sparse so it doesn't spam the pool.
      if (severe > 0.55 && Math.random() < 0.5) {
        this._c0.set(this._EMBER_HOT); this._c1.set(this._EMBER_DIM);
        const ea = Math.random() * Math.PI * 2;
        const es = 10 + Math.random() * 16;
        this._spawnParticle(
          sx, sz,
          Math.cos(ea) * es, Math.sin(ea) * es,
          0.35, 1.0, 0.2,
          this._c0, this._c1,
          2.5, 1.0 + Math.random() * 1.5, 6.0 + Math.random() * 4.0,
        );
      }
    }
  },


  _integrateParticles(dt) {
    const dynamicOwner = this._particleDynamicBufferOwner;
    assertDynamicBufferOwnerWritable(dynamicOwner);
    if (this._liveCount <= 0) {
      this._pGeo.setDrawRange(0, 0);
      this._pDrawMax = 0;
      commitDynamicBufferOwner(dynamicOwner, 0);
      return;
    }
    const pos = this._pPos, col = this._pCol, size = this._pSize, alpha = this._pAlpha;
    const active = this._activeParticles;
    const packedSlots = this._pPackedParticleSlots;
    let cursor = 0;
    while (cursor < this._liveCount) {
      const i = active[cursor];
      let age = this._age[i] + dt;
      const life = this._life[i];
      if (age >= life) {
        this._retireParticle(i);
        continue;
      }
      this._age[i] = age;
      const t = age / life;

      const dr = this._drag[i];
      const damp = 1 - Math.min(1, dr * dt);
      this._vx[i] *= damp; this._vy[i] *= damp; this._vz[i] *= damp;
      this._px[i] += this._vx[i] * dt;
      this._py[i] += this._vy[i] * dt;
      this._pz[i] += this._vz[i] * dt;

      // CPU particle slots remain stable for lifetime/recycling semantics. GPU records instead
      // follow the already-dense active list so a high recycled slot cannot turn two particles
      // into a capacity-wide upload and hole-filled draw.
      const i3 = cursor * 3;
      pos[i3] = this._px[i]; pos[i3 + 1] = this._py[i]; pos[i3 + 2] = this._pz[i];
      col[i3] = this._cr0[i] + (this._cr1[i] - this._cr0[i]) * t;
      col[i3 + 1] = this._cg0[i] + (this._cg1[i] - this._cg0[i]) * t;
      col[i3 + 2] = this._cb0[i] + (this._cb1[i] - this._cb0[i]) * t;
      size[cursor] = this._size0[i] + (this._size1[i] - this._size0[i]) * t;
      alpha[cursor] = 1 - t;
      if (!packedSlots || packedSlots[cursor] !== i) {
        this._pTrailAxis[cursor] = this._particleTrailAxis[i];
        this._pTrailStretch[cursor] = this._particleTrailStretch[i];
        if (dynamicOwner) {
          markDynamicBufferItems(dynamicOwner, PARTICLE_TRAIL_AXIS, cursor);
          markDynamicBufferItems(dynamicOwner, PARTICLE_TRAIL_STRETCH, cursor);
        }
        if (packedSlots) packedSlots[cursor] = i;
      }
      cursor++;
    }
    this._pDrawMax = this._liveCount;
    this._pGeo.setDrawRange(0, this._liveCount);
    if (dynamicOwner) {
      if (this._liveCount > 0) {
        markDynamicBufferItems(dynamicOwner, PARTICLE_POSITION, 0, this._liveCount);
        markDynamicBufferItems(dynamicOwner, PARTICLE_COLOR, 0, this._liveCount);
        markDynamicBufferItems(dynamicOwner, PARTICLE_SIZE, 0, this._liveCount);
        markDynamicBufferItems(dynamicOwner, PARTICLE_ALPHA, 0, this._liveCount);
      }
      commitDynamicBufferOwner(dynamicOwner, this._liveCount);
    } else if (this._liveCount > 0) {
      this._pGeo.attributes.position.needsUpdate = true;
      this._pGeo.attributes.aColor.needsUpdate = true;
      this._pGeo.attributes.aSize.needsUpdate = true;
      this._pGeo.attributes.aAlpha.needsUpdate = true;
      this._pGeo.attributes.aTrailAxis.needsUpdate = true;
      this._pGeo.attributes.aTrailStretch.needsUpdate = true;
    }
  },

  _integrateTrailStreaks(dt) {
    if (this._liveTrailStreakCount <= 0) return;
    const st = this._ts;
    const active = this._activeTrailStreaks;
    let cursor = 0;
    while (cursor < this._liveTrailStreakCount) {
      const i = active[cursor];
      const s = st[i];
      s.age += dt;
      const t = s.age / s.life;
      if (t >= 1) { this._retireTrailStreak(i); continue; }
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      const scale = s.size0 + (s.size1 - s.size0) * t;
      const op = s.op0 * (1 - t * 0.85);
      this._writeTrailStreakInstance(i, cursor, scale, op);
      cursor++;
    }
    this._commitTrailStreakInstances();
  },

  _integrateSprites(dt) {
    resetInstancedSpriteBuckets(this._spriteBatches);
    if (this._liveSpriteCount <= 0) {
      commitInstancedSpriteBuckets(this._spriteBatches);
      return;
    }
    const st = this._spr, active = this._activeSprites;
    const smokeOrder = this._smokeSpriteOrder;
    let smokeCount = 0;
    let cursor = 0;
    while (cursor < this._liveSpriteCount) {
      const i = active[cursor];
      const s = st[i];
      s.age += dt;
      const t = s.age / s.life;
      if (t >= 1) { this._retireSprite(i); continue; }
      let scale, op;
      if (s.kind === SPR_RING) {
        const e = easeOutCubic(t);
        scale = s.size0 + (s.size1 - s.size0) * e;
        op = s.op0 * (1 - t);
      } else if (s.kind === SPR_FRESNEL) {
        // shield ripple: snap out to full radius fast (rim feel), then a short bright pulse fade
        const e = easeOutCubic(Math.min(1, t * 2.2));
        scale = s.size0 + (s.size1 - s.size0) * e;
        // pulse: bright spike near impact then quadratic fade-out
        op = s.op0 * (1 - t) * (0.6 + 0.4 * Math.cos(t * Math.PI * 3));
        if (op < 0) op = 0;
      } else if (s.kind === SPR_PUFF) {
        scale = s.size0 + (s.size1 - s.size0) * t;
        op = s.op0 + (s.op1 - s.op0) * t;
        s.x += s.vx * dt; s.z += s.vz * dt;
      } else if (s.kind === SPR_COMBUSTION) {
        // Combustion develops quickly, then contracts optically as the hot core cools. The card is
        // deliberately anisotropic and irregular, so overlapping events form flame volumes rather
        // than a stack of expanding circular glows.
        const develop = easeOutCubic(Math.min(1, t * 2.4));
        scale = s.size0 + (s.size1 - s.size0) * develop;
        op = s.op0 * Math.max(0, 1 - t * (0.75 + t * 0.25));
        s.x += s.vx * dt; s.z += s.vz * dt;
      } else { // SPR_FLASH — quick punch
        const e = easeOutCubic(Math.min(1, t * 1.2));
        scale = s.size0 + (s.size1 - s.size0) * e;
        op = s.op0 * (1 - t * t);
      }
      s.y += 0; // sprites live on play plane
      if (s.kind === SPR_PUFF) {
        smokeOrder[smokeCount++] = i;
        cursor++;
        continue;
      }
      const bucketKind = s.kind === SPR_COMBUSTION
        ? 'combustion'
        : (s.kind === SPR_RING || s.kind === SPR_FRESNEL);
      writeInstancedSpriteFields(
        this._spriteBatches,
        bucketKind,
        s.x,
        s.y,
        s.z,
        scale,
        scale * s.aspect,
        scale / Math.sqrt(s.aspect),
        s.roll,
        s.r,
        s.g,
        s.b,
        op,
      );
      cursor++;
    }

    // Three.js cannot sort the instances inside one transparent InstancedMesh. Sort only the
    // normal-blended smoke instances by camera distance before writing them; glow and rings stay
    // in their cheaper additive path. Insertion sort is allocation-free and efficient for this
    // bounded, usually small pool whose ordering changes gradually between adjacent frames.
    const camera = this.state && this.state.render && this.state.render.camera;
    const camX = camera && camera.position ? camera.position.x : 0;
    const camY = camera && camera.position ? camera.position.y : 0;
    const camZ = camera && camera.position ? camera.position.z : 0;
    for (let a = 1; a < smokeCount; a++) {
      const index = smokeOrder[a];
      const sprite = st[index];
      const dx = sprite.x - camX;
      const dy = sprite.y - camY;
      const dz = sprite.z - camZ;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      let b = a - 1;
      while (b >= 0) {
        const previous = st[smokeOrder[b]];
        const pdx = previous.x - camX;
        const pdy = previous.y - camY;
        const pdz = previous.z - camZ;
        const previousDistanceSq = pdx * pdx + pdy * pdy + pdz * pdz;
        if (previousDistanceSq >= distanceSq) break;
        smokeOrder[b + 1] = smokeOrder[b];
        b--;
      }
      smokeOrder[b + 1] = index;
    }
    for (let orderIndex = 0; orderIndex < smokeCount; orderIndex++) {
      const s = st[smokeOrder[orderIndex]];
      const t = s.age / s.life;
      const scale = s.size0 + (s.size1 - s.size0) * t;
      writeInstancedSpriteFields(
        this._spriteBatches,
        'smoke',
        s.x,
        s.y,
        s.z,
        scale,
        scale * s.aspect,
        scale / Math.sqrt(s.aspect),
        s.roll,
        s.r,
        s.g,
        s.b,
        s.op0 + (s.op1 - s.op0) * t,
      );
    }
    commitInstancedSpriteBuckets(this._spriteBatches);
  },
};

function _makeProjectileTrailSelfCheckHarness(projectiles, video = {}) {
  const scene = new THREE.Scene();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12 };
  const entities = new Map([[player.id, player]]);
  const entityList = [player, ...projectiles];
  for (const p of projectiles) entities.set(p.id, p);
  const state = {
    playerId: player.id,
    entities,
    entityList,
    settings: {
      video: {
        particleQuality: 'high',
        motionReduce: false,
        engineTrails: false,
        bloom: true,
        ...video,
      },
    },
    render: { scene },
    content: {},
  };
  const system = Object.create(vfx);
  system.init({ state, bus: { on() {} }, helpers: {} });
  return system;
}

function _selfCheckProjectile(id, weaponId, extraData = {}) {
  return {
    id,
    type: 'projectile',
    alive: true,
    pos: { x: 100 + id * 20, z: 50 },
    vel: { x: 280, z: 40 },
    rot: 0,
    radius: 1.2,
    data: { weaponId, kind: 'bullet', ...extraData },
  };
}

export function runProjectileTrailEmissionSelfCheck() {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  const projectiles = [
    _selfCheckProjectile(10, 'wpn_autocannon_m', { damageType: 'kinetic' }),
    _selfCheckProjectile(11, 'wpn_missile_rack_m', { kind: 'missile', damageType: 'explosive' }),
    _selfCheckProjectile(12, 'wpn_plasma_cannon_m', { damageType: 'thermal' }),
    _selfCheckProjectile(13, 'wpn_railgun_m', { damageType: 'kinetic' }),
    _selfCheckProjectile(14, 'wpn_pulse_laser_m', { damageType: 'energy' }),
  ];
  const system = _makeProjectileTrailSelfCheckHarness(projectiles);
  system._markProjectileCacheDirty();
  for (let f = 0; f < 8; f++) system.update(1 / 60);

  const pt = system.inspect().projectileTrails;
  if (pt.candidates < 5) fail(`expected 5 projectile candidates, got ${pt.candidates}`);
  if (pt.streaksSpawned <= 0) fail('projectile trails should spawn directional streak geometry');
  if (!pt.byClass.kinetic || pt.byClass.kinetic.streaks <= 0 || pt.byClass.kinetic.particles > 0) {
    fail('kinetic class should emit a brief directional tracer without a glowing particle body');
  }
  if (!pt.byClass.missile || pt.byClass.missile.streaks <= 0) {
    fail('missile class should emit attached exhaust; bounded vapor remains intentionally cadence-sampled');
  }
  if (!pt.byClass.plasma || pt.byClass.plasma.streaks <= 0 || pt.byClass.plasma.particles > 0) {
    fail('plasma class should emit a connected thermal wake without detached particles');
  }
  if (!pt.byClass.pulse || pt.byClass.pulse.streaks <= 0 || pt.byClass.pulse.particles > 0) {
    fail('pulse class should emit a connected streak without heat particles');
  }
  if (!pt.byClass.rail || pt.byClass.rail.streaks <= 0) fail('rail class should emit thin streaks');

  // Inspect rail geometry in an isolated harness. The mixed-family pool deliberately interleaves
  // missile, plasma, rail, and pulse instances, so selecting its first live slot does not prove a
  // rail dimension and became invalid as soon as plasma gained a wider connected sheath.
  const railSystem = _makeProjectileTrailSelfCheckHarness([
    _selfCheckProjectile(20, 'wpn_railgun_m', { damageType: 'kinetic' }),
  ]);
  railSystem._markProjectileCacheDirty();
  for (let f = 0; f < 3; f++) railSystem.update(1 / 60);
  const live = railSystem._trailStreakPool && railSystem._trailStreakPool.mesh.count > 0
    ? railSystem._trailStreakPool.mesh
    : null;
  const liveIndex = railSystem._ts ? railSystem._ts.findIndex((s) => s.alive) : -1;
  const st = liveIndex >= 0 ? railSystem._ts[liveIndex] : null;
  let railScale = null;
  if (!live) fail('rail streak mesh should be visible');
  else {
    const packedIndex = railSystem._activeTrailStreakPos[liveIndex];
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    live.getMatrixAt(packedIndex, matrix);
    scale.setFromMatrixScale(matrix);
    railScale = scale;
    if (scale.x >= 0.2) fail(`rail streak width must stay thin, got ${scale.x}`);
    if (scale.z <= 3) fail(`rail streak length must stay long, got ${scale.z}`);
  }
  if (!st || st.size0 !== st.size1) fail('projectile rail streak must use constant width (size0 === size1)');

  if (errors.length) throw new Error(`projectile trail emission self-check failed:\n${errors.join('\n')}`);
  return {
    ok: true,
    projectileTrails: pt,
    rail: live && railScale
      ? { width: railScale.x, length: railScale.z, size0: st && st.size0, size1: st && st.size1 }
      : null,
    subsystem: system.inspect().subsystems.lastFrame.projectileTrails,
  };
}

export function assertProjectileTrailSleepContracts() {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  const idle = _makeProjectileTrailSelfCheckHarness([]);
  idle.update(1 / 60);
  const idleFrame = idle.inspect().subsystems.lastFrame;
  if (idleFrame.projectileTrails !== 0) {
    fail(`idle harness should sleep projectile trails, got ${idleFrame.projectileTrails}`);
  }

  const wake = _makeProjectileTrailSelfCheckHarness([
    _selfCheckProjectile(42, 'wpn_railgun_m', { damageType: 'kinetic' }),
  ]);
  wake._markProjectileCacheDirty();
  for (let i = 0; i < 4; i++) wake.update(1 / 60);
  const wakeFrame = wake.inspect().subsystems.lastFrame;
  if (wakeFrame.projectileTrails !== 1) {
    fail(`alive projectile should wake projectile trail subsystem, got ${wakeFrame.projectileTrails}`);
  }
  const wakeDiag = wake.inspect().projectileTrails;
  if (wakeDiag.streaksSpawned <= 0 && wakeDiag.particlesSpawned <= 0) {
    fail('woken projectile trail subsystem should spawn pooled wisps');
  }

  if (errors.length) throw new Error(`projectile trail sleep contracts failed:\n${errors.join('\n')}`);
  return {
    ok: true,
    idle: { projectileTrails: idleFrame.projectileTrails },
    wakeup: { projectileTrails: wakeFrame.projectileTrails, streaksSpawned: wakeDiag.streaksSpawned },
  };
}

function _isProjectileTrailGateImport() {
  if (typeof process === 'undefined' || !Array.isArray(process.argv) || !process.argv[1]) return false;
  const entry = String(process.argv[1]).replace(/\\/g, '/');
  return entry.endsWith('check-sg08-render-vfx.mjs') || entry.endsWith('check-vfx-frame-sleep.mjs');
}

function _assertProjectileTrailWiringGuards() {
  if (typeof vfx._projectileTrailsRelevant !== 'function') {
    throw new Error('vfx must gate projectile trails with _projectileTrailsRelevant()');
  }
  if (typeof vfx._emitProjectileTrails !== 'function') {
    throw new Error('vfx must emit projectile trails from _emitProjectileTrails()');
  }
  console.log('ok    projectile trail wiring guards');
}

export function runProjectileTrailGateEvidenceSync() {
  const profiles = assertProjectileTrailProfileContracts();
  console.log('PASS profile contracts', JSON.stringify(profiles));

  const sleep = assertProjectileTrailSleepContracts();
  console.log('ok    projectile trail sleep', JSON.stringify(sleep.idle));
  console.log('ok    projectile trail wakeup', JSON.stringify(sleep.wakeup));

  const emission = runProjectileTrailEmissionSelfCheck();
  console.log('PASS emission self-check', JSON.stringify(emission));

  _assertProjectileTrailWiringGuards();
  return { ok: true, profiles, sleep, emission };
}

export async function runProjectileTrailGoalEvidence() {
  return runProjectileTrailGateEvidenceSync();
}

if (_isProjectileTrailGateImport()) {
  try {
    runProjectileTrailGateEvidenceSync();
  } catch (err) {
    console.error('FAIL projectile trail gate evidence', err);
    process.exitCode = 1;
    throw err;
  }
}

export function createVfxPrecompileSalvo() {
  const group = new THREE.Group();
  group.name = 'SF_Precompile_VFX_Salvo';

  const count = 12;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * 4;
    positions[i * 3 + 1] = (i % 3) * 0.5;
    positions[i * 3 + 2] = Math.sin(a) * 4;
    colors[i * 3] = i % 2 ? 1 : 0.35;
    colors[i * 3 + 1] = 0.78;
    colors[i * 3 + 2] = i % 2 ? 0.28 : 1;
    sizes[i] = 3 + (i % 4);
    alphas[i] = 0.85;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setDrawRange(0, count);
  const material = buildParticleTrailMaterial();
  const points = new THREE.Points(geometry, material);
  points.name = 'SF_Precompile_PooledParticleBurst';
  points.frustumCulled = false;
  group.add(points);

  const glow = makeGlowTexture();
  const ring = makeRingTexture();
  const smoke = makeSmokeTexture();
  const combustion = makeCombustionTexture();
  const precompileTrail = createPrecompileTrailSurfaces();
  precompileTrail.ribbon.position.set(-8, 1, -4);
  precompileTrail.streak.position.set(10, 1, -6);
  precompileTrail.streak.scale.set(0.8, 1, 4);
  group.add(precompileTrail.ribbon);
  group.add(precompileTrail.streak);

  // Seam markers are instanced, vertex-coloured, additive, double-sided circles. None of the
  // generic sprite or trail probes has that exact program key, so an inactive seam pool can leave
  // its shader unlinked until a nearby asteroid wakes it during a measured flight window.
  const seamMarkers = createSeamMarkerPipelineMesh({ visibleInstances: 1 });
  seamMarkers.mesh.name = 'SF_Precompile_SeamMarkers';
  seamMarkers.mesh.position.set(0, 0.1, -7);
  group.add(seamMarkers.mesh);

  const spriteBatches = createInstancedSpriteBuckets(group, 6, glow, ring, smoke, combustion);
  resetInstancedSpriteBuckets(spriteBatches);
  writeInstancedSprite(spriteBatches, false, {
    x: -3, y: 1.5, z: -6, scale: 5, opacity: 0.8, roll: 0, r: 1, g: 0.85, b: 0.5,
  });
  writeInstancedSprite(spriteBatches, false, {
    x: 0, y: 1.5, z: -6, scale: 7, opacity: 0.6, roll: 0.4, r: 1, g: 0.5, b: 0.25,
  });
  writeInstancedSprite(spriteBatches, true, {
    x: 3, y: 1.5, z: -6, scale: 8, opacity: 0.8, roll: 0, r: 0.4, g: 0.8, b: 1,
  });
  writeInstancedSprite(spriteBatches, true, {
    x: 6, y: 1.5, z: -6, scale: 9, opacity: 0.65, roll: 0.2, r: 0.55, g: 0.96, b: 1,
  });
  writeInstancedSprite(spriteBatches, 'smoke', {
    x: 0, y: 1.2, z: -9, scale: 6, opacity: 0.5, roll: 0.7, r: 0.24, g: 0.21, b: 0.19,
  });
  writeInstancedSprite(spriteBatches, 'combustion', {
    x: 6, y: 1.2, z: -9, scale: 5, scaleX: 8, scaleY: 4, opacity: 0.65,
    roll: 0.35, r: 1, g: 0.34, b: 0.08,
  });
  commitInstancedSpriteBuckets(spriteBatches);

  // Warm the exact production thruster shader/material path during startup for every live
  // engine family (VP-220). Without this staging draw the player ship suppresses its legacy
  // trail immediately, then compiles plume layers on the first real burn — and a late compile
  // can leave the pilot with no propulsion feedback. Recipe-driven so startup and live draw
  // cannot silently drift apart.
  const thrusterTextures = loadKestrelThrusterTextures();
  const packs = listThrusterRecipePacks();
  for (let i = 0; i < packs.length; i++) {
    const pack = packs[i];
    const plume = new ContinuousPlumeSystem(THREE, pack.main, {
      textures: thrusterTextures,
      maxSockets: 1,
      distortionEnabled: false,
    });
    plume.update(1 / 60, 1, [{ x: -18 + i * 2.5, y: 1, z: -12, ax: 1, ay: 0, az: 0 }], {
      boost: i === 0 ? 0.65 : 0.2,
      a11y: { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' },
    });
    plume.group.name = i === 0
      ? 'SF_Precompile_Hitch_Main_Plume'
      : `SF_Precompile_Family_${pack.profileId}`;
    plume.group.userData.precompileStaging = true;
    plume.group.userData.engineProfileId = pack.profileId;
    group.add(plume.group);
  }

  // Deliberately NO light here: precompile.js tops the scene up to the exact runtime event-light
  // pool count. An extra salvo light would warm shaders against count+1 — every warmed program
  // would then miss the cache in real gameplay and recompile mid-combat.
  return group;
}

function registerFieldGeometryBufferOwner(scene, name, mesh) {
  const attributes = [{ name: 'matrix', attribute: mesh.instanceMatrix }];
  if (mesh.instanceColor) attributes.push({ name: 'color', attribute: mesh.instanceColor });
  return registerDynamicBufferOwner(scene, {
    id: `vfx-field-${name}`,
    mesh,
    attributes,
  });
}

function assertFieldGeometryBuffersWritable(owners) {
  assertDynamicBufferOwnerWritable(owners.vane);
  assertDynamicBufferOwnerWritable(owners.pip);
  assertDynamicBufferOwnerWritable(owners.knot);
  assertDynamicBufferOwnerWritable(owners.dome);
  assertDynamicBufferOwnerWritable(owners.rib);
  assertDynamicBufferOwnerWritable(owners.berm);
  assertDynamicBufferOwnerWritable(owners.chevron);
  assertDynamicBufferOwnerWritable(owners.bank);
}

function commitFieldGeometryBuffer(owner, mesh, count) {
  if (owner) {
    if (count > 0) {
      markDynamicBufferItems(owner, INSTANCED_MATRIX_BUFFER, 0, count);
      if (mesh.instanceColor) markDynamicBufferItems(owner, INSTANCED_COLOR_BUFFER, 0, count);
    }
    commitDynamicBufferOwner(owner, count);
    return;
  }
  mesh.count = count;
  if (count > 0) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

export function createSeamMarkerPipelineMesh({ visibleInstances = 0 } = {}) {
  const capacity = 96;
  const geometry = new THREE.CircleGeometry(1.5, 10);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.count = Math.max(0, Math.min(capacity, Math.floor(Number(visibleInstances) || 0)));
  if (mesh.count > 0) {
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.instanceColor.setXYZ(0, 1, 0.7, 0.36);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  return { mesh, capacity };
}

// ---------------------------------------------------------------------------
// pure helpers (module scope)
// ---------------------------------------------------------------------------
function isTrailSocketObject(object) {
  if (!object || !object.userData || !object.userData.spacefaceSocket) return false;
  const name = String(object.name || '');
  return name === 'SOCKET_Trail_Main' || /^SOCKET_Trail_/i.test(name);
}

function isDrivePlumeAnchor(object) {
  if (!object || !object.userData || object.userData.spacefaceEnergyPlume) return false;
  const tags = object.userData.spacefaceTags || {};
  if (tags.drive === 'plume') return true;
  if (object.userData.damageRole === 'plume') return true;
  return /(?:^|_)Plume(?:_|$)/i.test(String(object.name || ''));
}

function sortTrailAnchors(a, b) {
  const an = String(a && a.name || '');
  const bn = String(b && b.name || '');
  if (an === 'SOCKET_Trail_Main') return -1;
  if (bn === 'SOCKET_Trail_Main') return 1;
  return an.localeCompare(bn);
}

function disposeEnergyVolumeMaterials(group) {
  if (!group || typeof group.traverse !== 'function') return;
  group.traverse((object) => {
    const material = object && object.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      if (entry && typeof entry.dispose === 'function') entry.dispose();
    }
  });
}

function dirOf(rot) { return { x: Math.cos(rot), z: Math.sin(rot) }; }
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

function budgetInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.floor(n));
}

function presentationStyle(color0, color1, spriteKind, overrides = {}) {
  return {
    color0,
    color1,
    lightColor: overrides.lightColor || color1,
    spriteKind,
    spriteLife: overrides.spriteLife || 0.34,
    spriteSize0: overrides.spriteSize0 || 0.5,
    spriteSize1: overrides.spriteSize1 || 3.6,
    spriteOpacity: overrides.spriteOpacity || 0.82,
    echoRing: !!overrides.echoRing,
    radial: !!overrides.radial,
    spread: overrides.spread || 0.85,
    speed0: overrides.speed0 || 24,
    speedJitter: overrides.speedJitter || 30,
    life0: overrides.life0 || 0.32,
    lifeJitter: overrides.lifeJitter || 0.22,
    size0: overrides.size0 || 1.8,
    size1: overrides.size1 ?? 0.0,
    drag: overrides.drag || 2.2,
    y: overrides.y || 0,
    vy: overrides.vy || 0,
    lightPeak: overrides.lightPeak || 0,
    lightDecay: overrides.lightDecay || 9,
    lightDistance: overrides.lightDistance || 140,
    // Optional UVP force-neon diagnostics (ignored by spawn path; used by tests / probes).
    forceNeonKind: overrides.forceNeonKind || null,
    forceNeonEnergy: overrides.forceNeonEnergy ?? null,
    forceNeonLightPeak: overrides.forceNeonLightPeak ?? null,
  };
}

function setTetherCableVisible(cable, visible) {
  if (!cable) return;
  if (cable.mesh) cable.mesh.visible = visible;
  if (cable.glow) cable.glow.visible = visible;
  if (cable.band) cable.band.visible = visible;
  if (cable.anchor) cable.anchor.visible = visible;
  if (cable.anchorCore) cable.anchorCore.visible = visible;
  if (cable.targetHalo) cable.targetHalo.visible = visible && cable.targetHaloActive === true;
}

function sameTetherIdentity(a, b) {
  return a === b || (a != null && b != null && String(a) === String(b));
}

// Writes the exact galactic-global cable endpoints used by both the live mesh and break VFX.
// The caller owns `out`; the frame update therefore stays allocation-free.
function writeTetherVisualEndpoints(source, target, remote, out) {
  if (!source || !target || !out || !source.pos || !target.pos) return false;
  const sourceX = Number(source.pos.x);
  const sourceZ = Number(source.pos.z);
  const targetX = Number(target.pos.x);
  const targetZ = Number(target.pos.z);
  if (!Number.isFinite(sourceX) || !Number.isFinite(sourceZ)
    || !Number.isFinite(targetX) || !Number.isFinite(targetZ)) return false;

  let ax;
  let az;
  if (remote) {
    const sourceDx = targetX - sourceX;
    const sourceDz = targetZ - sourceZ;
    const sourceDistance = Math.hypot(sourceDx, sourceDz);
    if (!(sourceDistance > 1e-6)) return false;
    const sourceRadius = tetherVisualRadius(source);
    ax = sourceX + (sourceDx / sourceDistance) * sourceRadius * 0.88;
    az = sourceZ + (sourceDz / sourceDistance) * sourceRadius * 0.88;
  } else {
    const rot = Number.isFinite(source.rot) ? source.rot : 0;
    const noseRadius = Number.isFinite(source.radius) && source.radius > 0 ? source.radius : 6;
    ax = sourceX + Math.cos(rot) * noseRadius;
    az = sourceZ + Math.sin(rot) * noseRadius;
  }

  const targetDx = targetX - ax;
  const targetDz = targetZ - az;
  const targetDistance = Math.hypot(targetDx, targetDz);
  if (!(targetDistance > 1e-6)) return false;
  const dirX = targetDx / targetDistance;
  const dirZ = targetDz / targetDistance;
  const targetRadius = tetherVisualRadius(target);
  const bx = targetX - dirX * targetRadius * 0.88;
  const bz = targetZ - dirZ * targetRadius * 0.88;
  const chordX = bx - ax;
  const chordZ = bz - az;
  const chord = Math.hypot(chordX, chordZ);
  // Overlapping visual radii can reverse the surface chord even though its magnitude is non-zero.
  // Treat that as degenerate so the break cannot emit two stacked or inverted endpoint bursts.
  if (!(chord > 1e-6) || chordX * dirX + chordZ * dirZ <= 1e-6) return false;

  out.ax = ax;
  out.az = az;
  out.bx = bx;
  out.bz = bz;
  out.dirX = dirX;
  out.dirZ = dirZ;
  out.chord = chord;
  out.targetRadius = targetRadius;
  return true;
}

function tetherVisualRadius(entity) {
  const data = entity && entity.data || {};
  if (entity && entity.type === 'station') {
    const explicit = Number(data.masslineRadius);
    if (Number.isFinite(explicit) && explicit > 0) return Math.max(24, explicit);
    for (const value of [data.visualRadius, data.stationRadius, data.placeRadius, data.dockRadius, entity && entity.radius]) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) {
        // dockRadius is the interact bubble; using it as a hull radius pushes station masslines
        // past the authored model so the cable appears latched to empty space.
        return Math.max(24, n * 0.62);
      }
    }
    return 24;
  }
  const candidates = [
    data.masslineRadius,
    data.visualRadius,
    data.dockRadius,
    data.stationRadius,
    data.placeRadius,
    entity && entity.radius,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) {
      const minimum = entity && entity.type === 'station' ? 24 : 3.5;
      return Math.max(minimum, n);
    }
  }
  return 4;
}

// ore/commodity -> tint (cosmetic; falls back to a warm amber)
function oreColor(id) {
  if (!id) return '#d8a050';
  if (id.indexOf('ice') >= 0 || id.indexOf('water') >= 0) return '#9fd8e8';
  if (id.indexOf('volatile') >= 0 || id.indexOf('gas') >= 0) return '#40d090';
  if (id.indexOf('crystal') >= 0 || id.indexOf('lumin') >= 0) return '#b060ff';
  if (id.indexOf('silica') >= 0 || id.indexOf('silicate') >= 0) return '#c8c0a8';
  if (id.indexOf('titanium') >= 0 || id.indexOf('platin') >= 0 || id.indexOf('alloy') >= 0) return '#c0c8d0';
  if (id.indexOf('copper') >= 0) return '#d08050';
  if (id.indexOf('exotic') >= 0 || id.indexOf('xenium') >= 0) return '#ff60c0';
  if (id.indexOf('iron') >= 0 || id.indexOf('ore') >= 0 || id.indexOf('metal') >= 0) return '#c08040';
  return '#d8a050';
}

// shared radial-gradient glow sprite texture (one canvas for the whole pool)
function makeGlowTexture() {
  const size = 64;
  const cv = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (!cv) { const t = new THREE.Texture(); return t; }
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// shared hollow-ring sprite texture (shockwave / shield-fresnel rim). Bright at a mid radius, fading
// both inward and outward so an additive sprite reads as a thin glowing annulus rather than a disc.
function makeRingTexture() {
  const size = 64;
  const cv = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (!cv) { const t = new THREE.Texture(); return t; }
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.04)');
  grd.addColorStop(0.78, 'rgba(255,255,255,0.95)'); // bright rim
  grd.addColorStop(0.9, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// Irregular deterministic smoke/vapor card. Rotated instances break repetition further; ordinary
// alpha blending preserves dark residue against black space instead of making it disappear under
// additive blending. The lopsided lobes are deliberately not a circular radial gradient.
function makeSmokeTexture() {
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  let seed = 0x51f15e;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const lobes = Array.from({ length: 9 }, () => ({
    x: 0.22 + rnd() * 0.56,
    y: 0.22 + rnd() * 0.56,
    sx: 0.10 + rnd() * 0.19,
    sy: 0.08 + rnd() * 0.21,
    weight: 0.45 + rnd() * 0.65,
  }));
  const voids = [
    { x: 0.34, y: 0.38, sx: 0.10, sy: 0.08, weight: 0.72 },
    { x: 0.61, y: 0.56, sx: 0.13, sy: 0.09, weight: 0.58 },
    { x: 0.47, y: 0.72, sx: 0.09, sy: 0.12, weight: 0.48 },
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let density = 0;
      for (const lobe of lobes) {
        const dx = (u - lobe.x) / lobe.sx;
        const dy = (v - lobe.y) / lobe.sy;
        density += Math.exp(-(dx * dx + dy * dy) * 1.8) * lobe.weight;
      }
      for (const pocket of voids) {
        const dx = (u - pocket.x) / pocket.sx;
        const dy = (v - pocket.y) / pocket.sy;
        density -= Math.exp(-(dx * dx + dy * dy) * 1.7) * pocket.weight;
      }
      // A warped superellipse clips the lobes without recovering a circular radial-gradient edge.
      const ux = (u - 0.49) * 1.75 + Math.sin(v * 17) * 0.045;
      const vy = (v - 0.51) * 1.58 + Math.sin(u * 13 + 0.8) * 0.05;
      const edge = Math.max(0, 1 - (Math.pow(Math.abs(ux), 2.35) + Math.pow(Math.abs(vy), 1.82)));
      const turbulence = 0.82 + 0.18 * Math.sin(u * 31 + Math.sin(v * 19) * 2.2)
        * Math.cos(v * 27 - u * 7);
      const alpha = Math.max(0, Math.min(1, (density * 0.48 - 0.14) * edge * turbulence));
      const offset = (y * size + x) * 4;
      const body = 205 + Math.round(Math.min(1, density * 0.18) * 44);
      data[offset] = body;
      data[offset + 1] = body;
      data[offset + 2] = body;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'SF_VFX_IrregularSmoke';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Directional, asymmetric combustion mask. It is built from overlapping advected lobes and eroded
// pockets, not a radial polar waveform: the latter produced hard five-point flowers at gameplay
// distance. Multiple rotated instances now merge into a feathered turbulent volume while remaining
// one bounded draw bucket; there is no expanding circular-disc stage.
function makeCombustionTexture() {
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  const lobes = [
    { x: 0.22, y: 0.52, sx: 0.16, sy: 0.21, weight: 1.00 },
    { x: 0.37, y: 0.42, sx: 0.22, sy: 0.17, weight: 0.83 },
    { x: 0.48, y: 0.61, sx: 0.25, sy: 0.18, weight: 0.74 },
    { x: 0.64, y: 0.47, sx: 0.24, sy: 0.14, weight: 0.59 },
    { x: 0.76, y: 0.57, sx: 0.16, sy: 0.11, weight: 0.38 },
  ];
  const pockets = [
    { x: 0.43, y: 0.50, sx: 0.105, sy: 0.070, weight: 0.34 },
    { x: 0.62, y: 0.59, sx: 0.125, sy: 0.065, weight: 0.28 },
    { x: 0.70, y: 0.38, sx: 0.105, sy: 0.070, weight: 0.22 },
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const shearV = v + Math.sin(u * 15.0 + 0.6) * 0.022 + Math.sin(u * 31.0) * 0.009;
      let density = 0;
      for (let i = 0; i < lobes.length; i++) {
        const lobe = lobes[i];
        const dx = (u - lobe.x) / lobe.sx;
        const dy = (shearV - lobe.y) / lobe.sy;
        density += Math.exp(-(dx * dx + dy * dy) * 1.55) * lobe.weight;
      }
      for (let i = 0; i < pockets.length; i++) {
        const pocket = pockets[i];
        const dx = (u - pocket.x) / pocket.sx;
        const dy = (shearV - pocket.y) / pocket.sy;
        density -= Math.exp(-(dx * dx + dy * dy) * 1.7) * pocket.weight;
      }
      const verticalEdge = Math.max(0, 1 - Math.pow(Math.abs((v - 0.51) * 1.78), 2.15));
      const horizontalEdge = Math.max(0, Math.min(1, u * 8.0))
        * Math.max(0, Math.min(1, (1 - u) * 7.2));
      const erosion = 0.88
        + Math.sin(u * 29.0 + Math.sin(v * 17.0) * 1.8) * 0.07
        + Math.cos(v * 37.0 - u * 11.0) * 0.05;
      const internalTurbulence = 0.5 + 0.5 * Math.sin(u * 43.0 + Math.sin(v * 23.0) * 2.1)
        * Math.cos(v * 39.0 - u * 9.0);
      const field = Math.max(0, density * verticalEdge * horizontalEdge
        * erosion * (0.86 + internalTurbulence * 0.14) - 0.075);
      // Wide feathering is intentional: mipmapping then retains an irregular flame mass instead
      // of collapsing the alpha edge into a rigid emblem at the normal chase camera.
      const alpha = Math.max(0, Math.min(1, field * 1.42));
      const coreDx = (u - 0.27) / 0.28;
      const coreDy = (v - 0.52) / 0.27;
      const core = Math.max(0, Math.min(1, Math.exp(-(coreDx * coreDx + coreDy * coreDy) * 1.5)));
      // Wide luminance range restores an internal hot core and cooler turbulent sheath after the
      // family tint is applied. A nearly white mask made every lobe read as one flat soft smudge.
      const luminosity = Math.round(105 + core * 125 + internalTurbulence * 25);
      const offset = (y * size + x) * 4;
      // Near-neutral texels let the per-family profile colors remain distinct. The previous baked
      // orange texture multiplied every tint back into the same red/orange palette.
      data[offset] = luminosity;
      data[offset + 1] = luminosity;
      data[offset + 2] = Math.round(luminosity * (0.94 + core * 0.06));
      data[offset + 3] = Math.round(alpha * (0.66 + core * 0.34) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'SF_VFX_IrregularCombustion';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
