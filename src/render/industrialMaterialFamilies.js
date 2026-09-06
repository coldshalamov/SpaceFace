// PQ-190.00 — named industrial material families for the style slice's six named things.
//
// WHY THIS EXISTS
// `authoredMaterialProfiles.js` gives every solid role one reflection number: envMapIntensity 2.1,
// or 2.8 for `mechanical`/`drive`. Its roughness/metalness clamps are all guarded by
// `if (!authoredSurface)` and these six assets all ship complete PBR map sets, so the clamps never
// run on them. These families distinguish coating, bare armour, brushed steel, refractory ceramic,
// rubber and printed markings while retaining their maps. The shipping-camera review decides
// whether that separation improves the image; uniform values alone cannot establish that result.
//
// WHAT A FAMILY IS
// Only a bounded response record: (envMapIntensity, roughness x, metalness x, emissiveIntensity).
// `roughness` and `metalness` are MULTIPLIERS over the authored map, not replacements —
// `partsLibrary.js` `installSingleSamplePackedOrmShader` emits `roughnessFactor *= texel.g` and
// `metalnessFactor *= texel.b`, matching stock three.js. Every one of these assets ships
// `metallicFactor = 1, roughnessFactor = 1`, so the factor slot is free and the texture carries
// 100% of the response. Scaling the factor shifts the whole surface while preserving every texel of
// authored wear. No map is ever assigned, cleared, retinted or re-baked here.
//
// HARD CONSTRAINTS
//   * No `material.clone()` — the `cloneMaterialPreservingShaderHooks` contract is never entered.
//   * No `onBeforeCompile` / `customProgramCacheKey` read or write; no forced `needsUpdate`. Every
//     property set here is a uniform, so nothing recompiles against the roughness-breakup or
//     packed-ORM hooks.
//   * Applied ONCE at the authored swap / blueprint load. No per-frame traversal, no per-frame
//     material mutation, no allocation in an update path.
//   * Idempotent and reversible: the authored values are snapshotted on first touch and every later
//     application derives from that snapshot, so f(f(x)) === f(x).
//   * An asset outside the six-item table, or a material outside its asset's table, is left exactly
//     as authored. There is no global material-name guess.
const BASE_STAMP = 'sfIndustrialBase';
const FAMILY_STAMP = 'sfIndustrialFamily';

/**
 * The eleven families. `env` is anchored to the existing SOLID_ENV_INTENSITY (2.1) /
 * SOLID_ENV_INTENSITY_METAL (2.8) ceiling in `authoredMaterialProfiles.js`, so this table
 * REDISTRIBUTES reflection rather than amplifying it: painted mass drops, tool edges rise. The
 * intent is contrast between substances. Live comparison owns brightness and legibility acceptance.
 *
 * Substance classification follows the material-truth preflight: intact paint/coating is dielectric,
 * bare steel is metallic, refractory ceramic is non-metallic and dry, glass is not dark polished metal.
 */
export const MATERIAL_FAMILIES = Object.freeze({
  // Intact coating over plate. The coating is dielectric, so metalness is pulled well down and the
  // surface reads as a satin colour mass instead of a mirror wearing a hull texture.
  painted_shell: Object.freeze({
    id: 'painted_shell', substance: 'coating-over-metal', env: 1.15, roughness: 1.06, metalness: 0.55,
  }),
  // Coating partly lost — field repair, service panels, a scavenger's plate. Still dielectric, but
  // the exposed metal underneath earns some of its reflection back.
  painted_shell_worn: Object.freeze({
    id: 'painted_shell_worn', substance: 'worn-coating', env: 1.35, roughness: 1.10, metalness: 0.72,
  }),
  // Bare armour and salvage plate: metallic, but structural mass is never glossy.
  bare_structure: Object.freeze({
    id: 'bare_structure', substance: 'bare-plate', env: 1.85, roughness: 0.98, metalness: 1.00,
  }),
  // Machinery, brushed steel, fasteners, exposed hardware. THIS is where the controlled highlight
  // lives — worn tool edges catch the light that the painted mass no longer does.
  worn_tool_metal: Object.freeze({
    id: 'worn_tool_metal', substance: 'machined-steel', env: 2.55, roughness: 0.86, metalness: 1.00,
  }),
  // Refractory liner: non-metal and dry. It must not pick up an environment sheen.
  thermal_ceramic: Object.freeze({
    id: 'thermal_ceramic', substance: 'refractory', env: 0.85, roughness: 1.08, metalness: 0.30,
  }),
  radiator_fin: Object.freeze({
    id: 'radiator_fin', substance: 'thermal-fin', env: 1.70, roughness: 0.94, metalness: 1.00,
  }),
  matte_seal: Object.freeze({
    id: 'matte_seal', substance: 'elastomer', env: 0.55, roughness: 1.12, metalness: 0.15,
  }),
  // Printed markings do not shine. Today they carry the same 2.1 as the plate they sit on, which is
  // motivates a separate response for printed markings.
  industrial_marking: Object.freeze({
    id: 'industrial_marking', substance: 'printed-marking', env: 0.60, roughness: 1.05, metalness: 0.35,
  }),
  // Glass keeps its authored smoothness and gets a real, bounded highlight.
  controlled_glass: Object.freeze({
    id: 'controlled_glass', substance: 'glass', env: 1.60, roughness: 1.00, metalness: 1.00,
  }),
  // ---- emissive lanes: three attention levels allocated by state, not permanent equal glow ----
  // Today the Kestrel's always-on trim sits at 2.2 and its drive core at 3.2 — a 1.45x separation
  // between "nav light" and "the drive currently making force". Lowering the trim buys the primary
  // event headroom without darkening anything: the drive's peak is untouched.
  // Only emissiveIntensity moves. No authored emissive HUE is changed anywhere, including
  // ashline_rig's misleadingly named warm-red `Material_Cyan` and the station's cool-blue window.
  state_emission_drive: Object.freeze({
    id: 'state_emission_drive', substance: 'drive-radiance', attention: 'primary', emissiveIntensity: 3.20,
  }),
  state_emission_trim: Object.freeze({
    id: 'state_emission_trim', substance: 'signal-trim', attention: 'secondary', emissiveIntensity: 1.15,
  }),
  state_emission_window: Object.freeze({
    id: 'state_emission_window', substance: 'occupied-window', attention: 'atmosphere', emissiveIntensity: 1.45,
  }),
  state_emission_structure: Object.freeze({
    id: 'state_emission_structure', substance: 'work-light', attention: 'atmosphere', emissiveIntensity: 1.30,
  }),
  state_emission_warm: Object.freeze({
    id: 'state_emission_warm', substance: 'warm-state-surface', attention: 'state', emissiveIntensity: 1.95,
  }),
  state_emission_cool: Object.freeze({
    id: 'state_emission_cool', substance: 'cool-state-surface', attention: 'state', emissiveIntensity: 1.85,
  }),
});

/**
 * Per-asset surfacing, keyed by the exact authored glTF material names read out of the shipped
 * release GLBs. Nothing outside these five tables is ever touched.
 *
 * `byMaterialName` is the precise mapping. `byRole` is the fallback for the ship route, where
 * `partsLibrary.js` renames shared materials to a program-family token and only the semantic role
 * survives — see `resolveMaterialFamilyId`. Each `byRole` entry is written so the coarser answer is
 * still the right substance for that asset; where it costs a distinction (the Kestrel's armour plate
 * collapsing into its painted shell, its stencils into the same) that is stated here rather than
 * being a silent surprise at the camera.
 */
export const INDUSTRIAL_ASSET_SURFACING = Object.freeze({
  // ---- 1. the starter -------------------------------------------------------------------------
  kestrel: Object.freeze({
    source: 'assets/ships/release/parts/wholeships/kestrel.glb',
    byMaterialName: Object.freeze({
      Material_Hull: 'painted_shell',
      Material_Accent_FrontierCyan: 'painted_shell',
      Material_Accent_WarningOrange: 'painted_shell',
      Material_ArmorDark: 'bare_structure',
      Material_RepairGreen: 'painted_shell_worn',
      Material_BrushedMetal: 'worn_tool_metal',
      Material_Mechanical: 'worn_tool_metal',
      Material_Radiator: 'radiator_fin',
      Material_EngineCeramic: 'thermal_ceramic',
      Material_Rubber: 'matte_seal',
      Material_Decal_Hazard: 'industrial_marking',
      Material_Decal_Stencils: 'industrial_marking',
      Material_V6_MarkingIvory: 'industrial_marking',
      Material_Glass_Canopy: 'controlled_glass',
      // The drive core keeps its peak; the always-on nav and hazard trim step back so the primary
      // event has somewhere to go. Authored hues are untouched.
      Material_Emissive_DriveCore: 'state_emission_drive',
      Material_Emissive_Cyan: 'state_emission_trim',
      Material_Emissive_Orange: 'state_emission_trim',
    }),
    // COST OF THE COARSE KEY: `hull` covers Material_Hull, Material_ArmorDark, Material_Decal_Stencils
    // and Material_V6_MarkingIvory, so on the renamed path the armour plate and the stencils read as
    // painted shell. `warning` covers both Material_Accent_WarningOrange and Material_Decal_Hazard.
    byRole: Object.freeze({
      hull: 'painted_shell',
      accent: 'painted_shell',
      warning: 'painted_shell',
      repair: 'painted_shell_worn',
      mechanical: 'worn_tool_metal',
      radiator: 'radiator_fin',
      ceramic: 'thermal_ceramic',
      rubber: 'matte_seal',
      glass: 'controlled_glass',
      drive: 'state_emission_drive',
      signal: 'state_emission_trim',
    }),
  }),

  // ---- 2. the contrasting enemy ---------------------------------------------------------------
  // A scavenger rig, not a maintained frontier ship: its hull is salvage plate whose coating is
  // long gone, so it takes `bare_structure` where the Kestrel takes `painted_shell`. That is the
  // contrast this leaf exists to prove, and it costs no texture change on either ship.
  //
  // `Material_Cyan` is NOT corrected. Its authored emission is [1, 0.07, 0.04] — warm red, despite
  // the name. That warm identity against the Kestrel's cool cyan drive IS the warm/cool separation
  // the direction asks for; re-hueing it to match its label would delete the thing being proved.
  ashline_rig: Object.freeze({
    source: 'assets/ships/release/parts/wholeships/ashline_rig.glb',
    byMaterialName: Object.freeze({
      Material_Hull: 'bare_structure',
      Material_Mechanical: 'worn_tool_metal',
      Material_Glass: 'controlled_glass',
      Material_Cyan: 'state_emission_warm',
      Material_Warm: 'state_emission_warm',
    }),
    byRole: Object.freeze({
      hull: 'bare_structure',
      mechanical: 'worn_tool_metal',
      glass: 'controlled_glass',
      signal: 'state_emission_warm',
      drive: 'state_emission_warm',
    }),
  }),

  // ---- 3. the useful solid object -------------------------------------------------------------
  // The frame ships `metalness 0.82, roughness 1.00` with NO maps: a metal with no reflection at
  // all, which is why the pod reads as a flat dark box rather than something with mass you could
  // pick up. `worn_tool_metal` gives its fittings a controlled highlight.
  pod_cargo_container: Object.freeze({
    source: 'assets/ships/release/parts/pods/pod_cargo_container.glb',
    byMaterialName: Object.freeze({
      Material_Hull: 'painted_shell',
      Material_Accent: 'painted_shell',
      Material_Mechanical: 'worn_tool_metal',
    }),
    byRole: Object.freeze({
      hull: 'painted_shell',
      accent: 'painted_shell',
      mechanical: 'worn_tool_metal',
    }),
  }),

  // ---- 4. the landmark ------------------------------------------------------------------------
  place_station_trade_hub: Object.freeze({
    source: 'assets/ships/release/parts/places/place_station_trade_hub.glb',
    byMaterialName: Object.freeze({
      SF_HullDark_K0PBR: 'painted_shell',
      SF_HullMid_K0PBR: 'painted_shell',
      SF_Armor_K0PBR: 'bare_structure',
      SF_ServiceAccess_PBR: 'painted_shell_worn',
      SF_Machinery_K0PBR: 'worn_tool_metal',
      SF_DockingContact_PBR: 'worn_tool_metal',
      SF_Radiator_PBR: 'radiator_fin',
      SF_IndustrialMarking_PBR: 'industrial_marking',
      SF_Window_PBR: 'state_emission_window',
      SF_StructuralLight_PBR: 'state_emission_structure',
      SF_AmberEmission: 'state_emission_warm',
      SF_CyanEmission: 'state_emission_cool',
    }),
    byRole: Object.freeze({
      hull: 'painted_shell',
      service: 'painted_shell_worn',
      mechanical: 'worn_tool_metal',
      docking: 'worn_tool_metal',
      radiator: 'radiator_fin',
      glass: 'state_emission_window',
    }),
  }),

  // ---- 5. the industrial machine --------------------------------------------------------------
  // DELIBERATELY EMPTY. `worksPartLoader.js`'s own header states "Never mutate blueprint materials
  // or geometry", and `cloneMaterialForInstance` enforces it by returning the SHARED material for
  // every `LOD[01]_refinery` primitive — the furnace jacket, stack and tank are permanent structural
  // surfacing on purpose. Giving them per-instance clones to carry a family would defeat atlas
  // sharing and invite exactly the live-update-drifts-into-static-surfacing failure that rule exists
  // to prevent. So the Refinery body keeps its authored response, and this asset's contribution to
  // the slice is the furnace HEAT below — a surface that is already instance-owned, already driven
  // by machine state, and has never actually radiated. See `applyWorksFurnaceHeat`.
  place_works_refinery: Object.freeze({
    source: 'assets/ships/release/parts/works/place_works_refinery.glb',
    byMaterialName: Object.freeze({}),
    byRole: Object.freeze({}),
  }),
});

/**
 * The furnace ember. A deep orange with the red channel saturated and a real green shoulder, so the
 * slit reads as radiating metal rather than a flat orange card. The existing state driver supplies
 * the intensity.
 */
export const WORKS_FURNACE_HEAT = Object.freeze({
  familyId: 'works_furnace_ember',
  emberHex: 0xff5a12,
  // The dark floor the live driver uses for a machine that is not running
  // (`asteroidRenderer3d.js`: `hot ? 1.25 + 0.55*sin : 0.08`). Assigned at bind time so the ember
  // starts cold: `bindAuthoredRefinery` also serves the PLACEMENT GHOST, which has no machine state
  // and never runs that driver. Without this the ghost would sit at three's default intensity of 1
  // — a furnace glowing on a machine that is not even built yet, the exact opposite of Law §5.
  darkIntensity: 0.08,
});

const FILE_STEM_TO_ASSET_KEY = Object.freeze({
  kestrel: 'kestrel',
  ashline_rig: 'ashline_rig',
  pod_cargo_container: 'pod_cargo_container',
  place_station_trade_hub: 'place_station_trade_hub',
  place_works_refinery: 'place_works_refinery',
});

function fileStem(value) {
  const token = String(value || '');
  if (!token) return '';
  const tail = token.split(/[\\/]/).pop() || '';
  return tail.replace(/\.glb$/i, '');
}

/**
 * Exact key resolution for the six named things. Returns `null` for everything else, which makes
 * `applyIndustrialMaterialFamilies` a no-op — an unrecognised asset is never touched.
 *
 * The sources are the identities each admission route already publishes:
 *   ships    — `authoredParts` from the `wrapShipWithAuthoredParts` swap payload. That list is
 *              `[...new Set(usedParts)]` where `noteUsed` pushes `record.url`
 *              (`partsLibrary.js:4937-4944`), so its elements are plain URL STRINGS, and the
 *              whole-ship hull record's url is the first of them (`noteUsed('hull', hullRecord)`
 *              at :4951). Record objects are accepted too because the place and station commits
 *              publish `authoredParts: [record.url]` through other shapes.
 *   cargo    — `boundary.userData.authoredPayloadAssetId` (set by `buildAuthoredCargoCapsule`)
 *   station  — `entity.data.archetypeGlb`
 *   works    — the loader's part id
 */
export function resolveIndustrialAssetKey(source = {}) {
  const parts = Array.isArray(source.authoredParts) ? source.authoredParts : null;
  if (parts) {
    for (const part of parts) {
      const url = typeof part === 'string' ? part : (part && (part.url || part.file || part.path));
      const key = FILE_STEM_TO_ASSET_KEY[fileStem(url)];
      if (key) return key;
    }
  }
  const userData = source.userData || null;
  if (userData) {
    const payload = FILE_STEM_TO_ASSET_KEY[fileStem(userData.authoredPayloadAssetId)];
    if (payload) return payload;
  }
  const data = source.entity && source.entity.data ? source.entity.data : null;
  if (data) {
    const archetype = FILE_STEM_TO_ASSET_KEY[fileStem(data.archetypeGlb)];
    if (archetype) return archetype;
    const payload = FILE_STEM_TO_ASSET_KEY[fileStem(data.authoredPayloadAssetId)];
    if (payload) return payload;
  }
  const explicit = FILE_STEM_TO_ASSET_KEY[fileStem(source.assetId || source.partId || source.file)];
  return explicit || null;
}

function authoredBaseline(material) {
  const existing = material.userData && material.userData[BASE_STAMP];
  if (existing) return existing;
  const base = {
    roughness: Number.isFinite(material.roughness) ? material.roughness : null,
    metalness: Number.isFinite(material.metalness) ? material.metalness : null,
    envMapIntensity: Number.isFinite(material.envMapIntensity) ? material.envMapIntensity : null,
    emissiveIntensity: Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : null,
    emissiveRgb: material.emissive?.isColor
      ? [material.emissive.r, material.emissive.g, material.emissive.b] : null,
  };
  material.userData = { ...(material.userData || {}), [BASE_STAMP]: base };
  return base;
}

/**
 * Resolution chain, in order:
 *   1. the authored glTF material name, when it survived into the live graph;
 *   2. `userData.spacefaceMaterialRole`, the coarse role `authoredMaterialProfiles.js` derives from
 *      that authored name at load time.
 *
 * Step 2 is required because the ship route renames shared materials:
 * `partsLibrary.js` `sharedMaterialFor` assigns `material.name = authoredMaterialName(...)`, which
 * yields a program-family token such as `SF_Shared_hull_hull`. The semantic role survives in
 * userData and is read by several live sites in `partsLibrary.js`, so it is a durable key — it is
 * simply coarser, and the per-asset `byRole` tables say exactly what that coarseness costs.
 */
export function resolveMaterialFamilyId(material, assetKey) {
  const surfacing = INDUSTRIAL_ASSET_SURFACING[assetKey];
  if (!surfacing || !material) return null;
  const byName = surfacing.byMaterialName[String(material.name || '')];
  if (byName) return byName;
  const role = String(material.userData?.spacefaceMaterialRole || '').trim().toLowerCase();
  return (role && surfacing.byRole[role]) || null;
}

function applyMaterialFamily(material, familyId) {
  const family = MATERIAL_FAMILIES[familyId];
  if (!family) return false;
  // Standard/physical only: `roughness`/`metalness`/`envMapIntensity` are meaningless elsewhere and
  // a basic or shader material must never be silently reinterpreted.
  if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return false;
  const base = authoredBaseline(material);

  if (Number.isFinite(family.roughness) && base.roughness !== null) {
    material.roughness = clamp(base.roughness * family.roughness, 0.02, 1);
  }
  if (Number.isFinite(family.metalness) && base.metalness !== null) {
    material.metalness = clamp(base.metalness * family.metalness, 0, 1);
  }
  if (Number.isFinite(family.env) && 'envMapIntensity' in material) {
    material.envMapIntensity = family.env;
  }
  if (Number.isFinite(family.emissiveIntensity)) {
    // Never light something the author left dark. A black emissive means "this surface does not
    // emit", and inventing radiance for it is exactly the permanent-glow failure this leaf exists to
    // avoid. The Refinery furnace slit is the one deliberate exception and has its own entry point.
    if (material.emissive && material.emissive.getHex() !== 0) {
      material.emissiveIntensity = family.emissiveIntensity;
    }
  }
  material.userData[FAMILY_STAMP] = familyId;
  return true;
}

/**
 * Apply the asset's family mapping to every material reachable from `root`, once.
 *
 * Shared materials are mutated IN PLACE and identically for every mesh that references them, so
 * `spacefaceBatchKey` grouping stays consistent and no batch is split. Node names, sockets, hooks,
 * transforms, geometry and collision meshes are never read for mutation — the traversal only visits
 * `object.material`.
 */
export function applyIndustrialMaterialFamilies(root, assetKey, options = {}) {
  const summary = {
    assetKey: assetKey || null, applied: 0, preserved: 0, families: {}, preservedNames: [],
  };
  const surfacing = INDUSTRIAL_ASSET_SURFACING[assetKey];
  if (!root || typeof root.traverse !== 'function' || !surfacing) return summary;
  const seen = options.seen instanceof Set ? options.seen : new Set();
  root.traverse((object) => {
    const materials = Array.isArray(object?.material)
      ? object.material
      : (object?.material ? [object.material] : []);
    for (const material of materials) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      const familyId = resolveMaterialFamilyId(material, assetKey);
      if (!familyId || !applyMaterialFamily(material, familyId)) {
        summary.preserved += 1;
        if (material.name && summary.preservedNames.length < 32) summary.preservedNames.push(material.name);
        continue;
      }
      summary.applied += 1;
      summary.families[familyId] = (summary.families[familyId] || 0) + 1;
    }
  });
  return summary;
}

/**
 * The Refinery furnace slit.
 *
 * `asteroidRenderer3d.js` has always driven this surface by machine state — hot while
 * running/throttled/limited, 0.08 otherwise — through `setFurnaceIntensity`, which sets
 * `emissiveIntensity` and nothing else. But `Material_slit_LOD0/LOD1` ship NO `emissiveFactor`, so
 * `GLTFLoader` leaves `emissive = 0x000000` and every emissive branch in
 * `authoredMaterialProfiles.js` is guarded by `emissive.getHex() !== 0`. The slit has been wired to
 * the sim the whole time and has never radiated: intensity x black is black.
 *
 * This assigns the ember colour the existing driver needs. The STATE MAP IS NOT TOUCHED — Asteroid
 * Works Law §5 (a starved or unpowered machine goes dark; the gold want chip carries the fault;
 * coral is lamp-only) stays exactly as ruled. This colours the heat; it does not re-map the states.
 */
export function applyWorksFurnaceHeat(materials) {
  const rows = Array.isArray(materials) ? materials : (materials ? [materials] : []);
  let lit = 0;
  for (const material of rows) {
    if (!material || !material.emissive || typeof material.emissive.setHex !== 'function') continue;
    if (material.userData?.[FAMILY_STAMP] === WORKS_FURNACE_HEAT.familyId) { lit += 1; continue; }
    authoredBaseline(material);
    material.emissive.setHex(WORKS_FURNACE_HEAT.emberHex);
    // Start cold. A live machine's driver overwrites this every frame; a placement ghost has no
    // driver at all, so the floor is what keeps an unbuilt furnace dark.
    material.emissiveIntensity = WORKS_FURNACE_HEAT.darkIntensity;
    material.userData = {
      ...(material.userData || {}),
      [FAMILY_STAMP]: WORKS_FURNACE_HEAT.familyId,
      sfFurnaceEmberHex: WORKS_FURNACE_HEAT.emberHex,
    };
    lit += 1;
  }
  return lit;
}

/** Test-only: restore a material to the values it was authored with. */
export function restoreAuthoredMaterialResponse(material) {
  const base = material && material.userData && material.userData[BASE_STAMP];
  if (!base) return false;
  if (base.roughness !== null) material.roughness = base.roughness;
  if (base.metalness !== null) material.metalness = base.metalness;
  if (base.envMapIntensity !== null) material.envMapIntensity = base.envMapIntensity;
  if (base.emissiveIntensity !== null) material.emissiveIntensity = base.emissiveIntensity;
  if (base.emissiveRgb && typeof material.emissive?.setRGB === 'function') {
    material.emissive.setRGB(...base.emissiveRgb);
  }
  if (material.userData[FAMILY_STAMP] === WORKS_FURNACE_HEAT.familyId) {
    delete material.userData.sfFurnaceEmberHex;
  }
  delete material.userData[FAMILY_STAMP];
  delete material.userData[BASE_STAMP];
  return true;
}

export const INDUSTRIAL_MATERIAL_BASE_STAMP = BASE_STAMP;
export const INDUSTRIAL_MATERIAL_FAMILY_STAMP = FAMILY_STAMP;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
