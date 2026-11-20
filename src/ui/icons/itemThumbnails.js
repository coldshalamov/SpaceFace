// Unified item thumbnail & paint customization swatch resolver across SpaceFace interfaces.
// Maps commodities, weapons, modules, bombs, ships, blueprints, swarm fortify devices,
// outpost modules, and paint/finish/wear/decal options to studio-lit raster WebP plates
// (assets/ui/thumbs/*.webp, assets/ui/generated/armory/*.webp, assets/ui/renders/hulls/*.hero.webp)
// paired with domain tint/glow accents, size/unique pip marks, and crisp SVG fallbacks.

import { runtimeAssetUrl } from '../../core/runtimeAssetUrl.js';
import { hullPosterUrl } from '../hullPosters.js';
import { arsenalIcon } from '../orrery/arsenalGlyphs.js';
import { equipmentKind, equipmentIcon, equipmentSvg } from '../orrery/equipmentGlyphs.js';

const STYLE_ID = 'sf-item-thumbs-style';

const THUMB_ROOT = 'assets/ui/thumbs/';
const ARMORY_ROOT = 'assets/ui/generated/armory/';

const TONE = Object.freeze({
  bone: '236 230 216',
  hand: '242 185 80',
  ice: '143 203 255',
  cool: '159 213 207',
  copper: '222 122 69',
  thermal: '255 131 71',
  bio: '84 222 152',
  exotic: '201 120 255',
  hazard: '255 88 71',
  gold: '242 193 78',
  mineral: '148 164 182',
  slate: '125 144 164',
});

const CSS = `
.sf-thumb {
  --sf-thumb-rgb: ${TONE.bone};
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--sf-thumb-size, 36px);
  height: var(--sf-thumb-size, 36px);
  padding: 3px;
  box-sizing: border-box;
  border-radius: 5px;
  border: 1px solid rgb(var(--sf-thumb-rgb) / .34);
  background:
    radial-gradient(circle at 50% 42%, rgb(var(--sf-thumb-rgb) / .22), rgb(13 21 27 / .92) 76%),
    rgb(10 15 20);
  overflow: hidden;
  vertical-align: middle;
  user-select: none;
}
.sf-thumb--xs { --sf-thumb-size: 24px; padding: 2px; border-radius: 4px; }
.sf-thumb--sm { --sf-thumb-size: 30px; padding: 2px; border-radius: 4px; }
.sf-thumb--md { --sf-thumb-size: 40px; padding: 3px; border-radius: 5px; }
.sf-thumb--lg { --sf-thumb-size: 52px; padding: 4px; border-radius: 6px; }
.sf-thumb--hero { --sf-thumb-size: 74px; padding: 5px; border-radius: 8px; }
.sf-thumb--hull {
  background:
    radial-gradient(ellipse at 50% 54%, rgb(var(--sf-thumb-rgb) / .2), rgb(9 14 19 / .96) 78%),
    rgb(8 12 16);
}
.sf-thumb--unique {
  border-color: rgb(${TONE.gold} / .68);
  background:
    radial-gradient(circle at 50% 42%, rgb(${TONE.gold} / .28), rgb(15 19 24 / .95) 76%),
    rgb(10 14 18);
}
.sf-thumb__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
  filter: drop-shadow(0 2px 4px rgb(0 0 0 / .65));
}
.sf-thumb__pips {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  gap: 1.5px;
  pointer-events: none;
}
.sf-thumb__pip {
  width: 2px;
  height: 5px;
  border-radius: 1px;
  background: rgb(var(--sf-thumb-rgb) / .88);
}
.sf-thumb__star {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  color: rgb(${TONE.gold});
  pointer-events: none;
}
.sf-thumb__crest {
  position: absolute;
  left: 2px;
  bottom: 2px;
  width: 12px;
  height: 12px;
  padding: 1px;
  box-sizing: border-box;
  border-radius: 2px;
  background: rgb(7 10 14 / .82);
  border: 1px solid rgb(var(--sf-thumb-rgb) / .3);
  color: rgb(236 230 216 / .9);
  pointer-events: none;
  display: grid;
  place-items: center;
}
.sf-thumb--xs .sf-thumb__crest,
.sf-thumb--sm .sf-thumb__crest,
.sf-thumb--xs .sf-thumb__pips { display: none; }
.sf-thumb__crest svg { width: 100%; height: 100%; display: block; }
.sf-thumb__svg {
  width: 76%;
  height: 76%;
  color: rgb(var(--sf-thumb-rgb));
  display: block;
}
.sf-paint-preview {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 44px;
  height: 30px;
  border-radius: 4px;
  border: 1px solid rgb(${TONE.bone} / .28);
  background: rgb(11 16 22);
  overflow: hidden;
  box-sizing: border-box;
}
.sf-paint-preview svg {
  width: 100%;
  height: 100%;
  display: block;
}
@media (forced-colors: active) {
  .sf-thumb, .sf-paint-preview {
    background: Canvas;
    border-color: ButtonText;
  }
  .sf-thumb__pip { background: Highlight; }
}
`;

export function injectItemThumbnailStyles(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const thumbAsset = (file) => runtimeAssetUrl(`${THUMB_ROOT}${file}`, import.meta.url);
const armoryAsset = (file) => runtimeAssetUrl(`${ARMORY_ROOT}${file}`, import.meta.url);

// Per-commodity exact specimen mapping (handles all 66 commodities in src/data/commodities.js)
const COMMODITY_SPEC = Object.freeze({
  cmdty_ore_iron: { src: 'ore_iron.webp', rgb: TONE.mineral },
  cmdty_ore_copper: { src: 'ore_copper.webp', rgb: TONE.copper },
  cmdty_ore_titanium: { src: 'ore_titanium.webp', rgb: TONE.ice },
  cmdty_silicate: { src: 'silicate.webp', rgb: TONE.slate },
  cmdty_ice_water: { src: 'ice_water.webp', rgb: TONE.ice },
  cmdty_volatiles: { src: 'ice_volatiles.webp', rgb: TONE.bio },
  cmdty_ore_platinoid: { src: 'ore_precious.webp', rgb: TONE.gold },
  cmdty_ore_bronzium: { src: 'ore_nickel.webp', rgb: TONE.copper },
  cmdty_ore_silverium: { src: 'ore_silver.webp', rgb: TONE.bone },
  cmdty_ore_goldium: { src: 'ore_gold.webp', rgb: TONE.gold },
  cmdty_ore_platinium: { src: 'ore_platinum.webp', rgb: TONE.ice },
  cmdty_ore_einsteinium: { src: 'ore_stellarite.webp', rgb: TONE.cool },
  cmdty_gem_emerald: { src: 'gem_emerald.webp', rgb: TONE.bio },
  cmdty_gem_ruby: { src: 'gem_ruby.webp', rgb: TONE.hazard },
  cmdty_gem_diamond: { src: 'crystal_quartz.webp', rgb: TONE.bone },
  cmdty_exotic_amazonite: { src: 'gem_prism.webp', rgb: TONE.cool },
  cmdty_gas_hydrogen: { src: 'gas_cylinder.webp', rgb: TONE.hand },
  cmdty_gas_helium3: { src: 'gas_helium3.webp', rgb: TONE.ice },
  cmdty_crystal_silica: { src: 'crystal_quartz.webp', rgb: TONE.bone },
  cmdty_crystal_lumin: { src: 'crystal_lumin.webp', rgb: TONE.bio },
  cmdty_exotic_xenium: { src: 'exotic_xenium.webp', rgb: TONE.exotic },
  cmdty_filament_sample: { src: 'bio_specimen.webp', rgb: TONE.bio },
  cmdty_live_specimen: { src: 'bio_specimen.webp', rgb: TONE.cool },
  cmdty_dmc_black_box: { src: 'salvage_wreck.webp', rgb: TONE.copper },
  cmdty_calcified_filament: { src: 'bio_chitin.webp', rgb: TONE.hand },
  cmdty_conductive_fiber: { src: 'bio_specimen.webp', rgb: TONE.cool },
  cmdty_relay_nodule: { src: 'bio_specimen.webp', rgb: TONE.ice },
  cmdty_membrane_laminate: { src: 'bio_chitin.webp', rgb: TONE.bio },
  cmdty_cyst_resin: { src: 'bio_chitin.webp', rgb: TONE.copper },
  cmdty_nerve_glass: { src: 'gem_prism.webp', rgb: TONE.cool },
  cmdty_host_archive_sample: { src: 'bio_specimen.webp', rgb: TONE.exotic },
  cmdty_sterile_shell: { src: 'bio_chitin.webp', rgb: TONE.bone },
  cmdty_spore_chimney_core: { src: 'bio_specimen.webp', rgb: TONE.bio },
  cmdty_interface_tissue: { src: 'bio_specimen.webp', rgb: TONE.thermal },
  cmdty_glass_back_scale: { src: 'bio_chitin.webp', rgb: TONE.cool },
  cmdty_spore_catalyst: { src: 'exotic_xenium.webp', rgb: TONE.bio },
  cmdty_gate_handshake: { src: 'base_teleporter.webp', rgb: TONE.ice },
  cmdty_inertial_datum: { src: 'quantum_core.webp', rgb: TONE.cool },
  cmdty_revocation_beacon: { src: 'fortify_gravity_beacon.webp', rgb: TONE.exotic },
  cmdty_unbroken_lens: { src: 'gem_prism.webp', rgb: TONE.gold },
  cmdty_refined_metals: { src: 'refined_metals.webp', rgb: TONE.mineral },
  cmdty_alloys: { src: 'alloys.webp', rgb: TONE.ice },
  cmdty_polymers: { src: 'polymers.webp', rgb: TONE.bone },
  cmdty_fuel_cells: { src: 'fuel_cells.webp', rgb: TONE.hand },
  cmdty_purified_silica: { src: 'purified_silica.webp', rgb: TONE.bone },
  cmdty_regocrete: { src: 'silicate.webp', rgb: TONE.slate },
  cmdty_control_unit: { src: 'tech_electronics.webp', rgb: TONE.cool },
  cmdty_comp_hullplate: { src: 'alloys.webp', rgb: TONE.slate },
  cmdty_comp_circuitry: { src: 'circuitry.webp', rgb: TONE.gold },
  cmdty_microchips: { src: 'circuitry.webp', rgb: TONE.ice },
  cmdty_electronics: { src: 'tech_electronics.webp', rgb: TONE.ice },
  cmdty_quantum_cores: { src: 'quantum_core.webp', rgb: TONE.cool },
  cmdty_consumer_goods: { src: 'polymers.webp', rgb: TONE.bone },
  cmdty_textiles: { src: 'polymers.webp', rgb: TONE.hand },
  cmdty_luxury_goods: { src: 'luxury_trunk.webp', rgb: TONE.gold },
  cmdty_art: { src: 'luxury_trunk.webp', rgb: TONE.copper },
  cmdty_food: { src: 'food_provisions.webp', rgb: TONE.hand },
  cmdty_medical: { src: 'medical_supply.webp', rgb: TONE.cool },
  cmdty_scrap_metal: { src: 'salvage_wreck.webp', rgb: TONE.mineral },
  cmdty_salvage_electronics: { src: 'salvage_wreck.webp', rgb: TONE.copper },
  cmdty_classified_salvage: { src: 'salvage_wreck.webp', rgb: TONE.hazard },
  cmdty_narcotics: { src: 'contraband.webp', rgb: TONE.hazard },
  cmdty_stolen_goods: { src: 'contraband.webp', rgb: TONE.copper },
  cmdty_weapons: { src: 'munitions.webp', rgb: TONE.copper },
  cmdty_munitions: { src: 'munitions.webp', rgb: TONE.hand },
  cmdty_impulse_charge: { src: 'bomb_emp.webp', rgb: TONE.ice },
});

const CATEGORY_COMMODITY_FALLBACK = Object.freeze({
  'raw ore': { src: 'ore_iron.webp', rgb: TONE.mineral },
  gas: { src: 'gas_cylinder.webp', rgb: TONE.hand },
  crystal: { src: 'crystal_quartz.webp', rgb: TONE.ice },
  exotic: { src: 'exotic_xenium.webp', rgb: TONE.exotic },
  bioresource: { src: 'bio_specimen.webp', rgb: TONE.bio },
  protocol: { src: 'quantum_core.webp', rgb: TONE.cool },
  refined: { src: 'refined_metals.webp', rgb: TONE.mineral },
  component: { src: 'alloys.webp', rgb: TONE.slate },
  tech: { src: 'circuitry.webp', rgb: TONE.ice },
  consumer: { src: 'polymers.webp', rgb: TONE.bone },
  luxury: { src: 'luxury_trunk.webp', rgb: TONE.gold },
  food: { src: 'food_provisions.webp', rgb: TONE.hand },
  med: { src: 'medical_supply.webp', rgb: TONE.cool },
  salvage: { src: 'salvage_wreck.webp', rgb: TONE.copper },
  contraband: { src: 'contraband.webp', rgb: TONE.hazard },
  military: { src: 'munitions.webp', rgb: TONE.copper },
});

const BOMB_SPRITE = Object.freeze({
  bomb_frag: { src: 'bomb_frag.webp', rgb: TONE.hand },
  bomb_concussion: { src: 'bomb_concussion.webp', rgb: TONE.copper },
  bomb_emp: { src: 'bomb_emp.webp', rgb: TONE.ice },
  bomb_goo: { src: 'bomb_goo.webp', rgb: TONE.hand },
  bomb_singularity: { src: 'bomb_singularity.webp', rgb: TONE.exotic },
  bomb_thermite: { src: 'bomb_thermite.webp', rgb: TONE.thermal },
  bomb_scrambler: { src: 'bomb_scrambler.webp', rgb: TONE.hand },
  bomb_anchor: { src: 'bomb_anchor.webp', rgb: TONE.mineral },
});

const FORTIFY_SPRITE = Object.freeze({
  gravity_beacon: { src: 'fortify_gravity_beacon.webp', rgb: TONE.exotic },
  repulsor_pylon: { src: 'fortify_pylon.webp', rgb: TONE.hand },
  tesla_pair: { src: 'fortify_tesla.webp', rgb: TONE.ice },
  kinetic_turret: { src: 'fortify_turret.webp', rgb: TONE.copper },
  reflector_fin: { src: 'fortify_reflector.webp', rgb: TONE.gold },
});

const BASE_SPRITE = Object.freeze({
  mod_depot: { armory: 'cargo.webp', rgb: TONE.cool },
  mod_refinery: { src: 'base_refinery.webp', rgb: TONE.thermal },
  mod_teleporter: { src: 'base_teleporter.webp', rgb: TONE.ice },
  mod_throughline_sling: { src: 'wpn_railgun.webp', rgb: TONE.ice },
  mod_sensor_post: { armory: 'sensor.webp', rgb: TONE.cool },
  mod_defense: { src: 'fortify_turret.webp', rgb: TONE.copper },
  spec_refinery: { src: 'base_refinery.webp', rgb: TONE.thermal },
  spec_relay: { src: 'base_teleporter.webp', rgb: TONE.ice },
  spec_bastion: { src: 'fortify_turret.webp', rgb: TONE.hand },
});

function inferSize(id, obj) {
  const explicit = obj && (obj.size || obj.slotSize);
  if (explicit === 'S' || explicit === 'M' || explicit === 'L') return explicit;
  const s = String(id || '').toLowerCase();
  if (/_l(?:$|_)/.test(s)) return 'L';
  if (/_m(?:$|_)/.test(s)) return 'M';
  if (/_s(?:$|_)/.test(s)) return 'S';
  return '';
}

function resolveEquipmentSprite(id, obj) {
  const s = String(id || obj?.defId || '').toLowerCase();
  const isUnique = s.startsWith('unique_') || obj?.unique === true;
  if (BOMB_SPRITE[s]) return { url: thumbAsset(BOMB_SPRITE[s].src), rgb: BOMB_SPRITE[s].rgb, size: '', unique: false };
  if (FORTIFY_SPRITE[s]) return { url: thumbAsset(FORTIFY_SPRITE[s].src), rgb: FORTIFY_SPRITE[s].rgb, size: '', unique: false };
  if (BASE_SPRITE[s]) {
    const b = BASE_SPRITE[s];
    return { url: b.src ? thumbAsset(b.src) : armoryAsset(b.armory), rgb: b.rgb, size: '', unique: false };
  }

  let file = null;
  let fromThumb = false;
  let rgb = TONE.bone;

  if (/^mod_line_head|whip|bridle|snare|sweep|coupler|mass_flail|massline|tether|winch_hd/.test(s)) {
    file = 'mod_line_head.webp'; fromThumb = true; rgb = TONE.hand;
  } else if (/cloak|quiet_mask|veil_step/.test(s)) {
    file = 'mod_cloak.webp'; fromThumb = true; rgb = TONE.cool;
  } else if (/drone_bay|knitbots/.test(s)) {
    file = 'mod_drone_bay.webp'; fromThumb = true; rgb = TONE.ice;
  } else if (/pulse_laser|mirrorjaw|hardlight_prism/.test(s)) {
    file = 'wpn_pulse_laser.webp'; fromThumb = true; rgb = TONE.ice;
  } else if (/beam_laser|heavy_beam|veil_cutter|lighthouse/.test(s)) {
    file = 'wpn_beam_laser.webp'; fromThumb = true; rgb = TONE.ice;
  } else if (/railgun|siege_lance|mass_driver/.test(s)) {
    file = 'wpn_railgun.webp'; fromThumb = true; rgb = TONE.copper;
  } else if (/torpedo|singularity_mortar/.test(s)) {
    file = 'wpn_torpedo.webp'; fromThumb = true; rgb = TONE.thermal;
  } else if (/disc_launcher|glaive|debris_orbit/.test(s)) {
    file = 'wpn_disc.webp'; fromThumb = true; rgb = TONE.mineral;
  } else if (/arc_caster|conductive_primer|quantum_sympathy|polarity_inverter/.test(s)) {
    file = 'wpn_arc.webp'; fromThumb = true; rgb: TONE.ice;
  } else if (/thermal_cooker|plasma_cone|saucer_annihilator|fire_lance/.test(s)) {
    file = 'wpn_thermal.webp'; fromThumb = true; rgb: TONE.thermal;
  } else if (/sticky_detonator|concussion_cannon|vector_mine/.test(s)) {
    file = s.includes('mine') ? 'mine.webp' : 'cannon.webp';
    fromThumb = false; rgb = TONE.copper;
  } else if (/snarl|web/.test(s)) {
    file = 'wpn_arc.webp'; fromThumb = true; rgb: TONE.exotic;
  } else if (/gravity|wellhead|grav_anchor|pylon|repulsion_trap|seismic_gong|viscosity|momentum_sink|inertial_shunt/.test(s)) {
    file = s.includes('well') || s.includes('anchor') ? 'fortify_gravity_beacon.webp' : 'gravity.webp';
    fromThumb = file.startsWith('fortify_'); rgb = TONE.exotic;
  } else if (/plasma/.test(s)) {
    file = 'plasma.webp'; fromThumb = false; rgb = TONE.thermal;
  } else if (/emp|rcs_disruptor|ecm/.test(s)) {
    file = 'emp.webp'; fromThumb = false; rgb = TONE.ice;
  } else if (/missile|barrage|nestbreaker/.test(s)) {
    file = 'missile.webp'; fromThumb = false; rgb = TONE.thermal;
  } else if (/autocannon|flak|ironsong|bank_stream/.test(s)) {
    file = 'cannon.webp'; fromThumb = false; rgb = TONE.copper;
  } else if (/saucer_death_ray/.test(s)) {
    file = 'wpn_beam_laser.webp'; fromThumb = true; rgb = TONE.exotic;
  } else if (/shield|aegis|decoy|chaff|smokesong|choir_bell/.test(s)) {
    file = 'shield.webp'; fromThumb = false; rgb = TONE.ice;
  } else if (/engine|thruster|afterburner|jump|warp|pale_coil|swing_drive|boomerang|pinball|harbor_brake/.test(s)) {
    file = 'engine.webp'; fromThumb = false; rgb = TONE.hand;
  } else if (/mining|drill|pulverizer|extractor|scoop_ring|deep_scoop|splitburner/.test(s)) {
    file = 'drill.webp'; fromThumb = false; rgb = TONE.copper;
  } else if (/cargo|hold|smuggler|quarantine|loot_magnet|collector_maw|compactor|rack/.test(s)) {
    file = 'cargo.webp'; fromThumb = false; rgb = TONE.cool;
  } else if (/winch|tractor|tideline|claw_anchor|battering_ram|ram_plate|bumper/.test(s)) {
    file = s.includes('tractor') || s.includes('winch') || s.includes('claw') ? 'winch.webp' : 'armor.webp';
    fromThumb = false; rgb = TONE.hand;
  } else if (/thermal_sink|cryo|cooler|purge/.test(s)) {
    file = 'cooler.webp'; fromThumb = false; rgb = TONE.ice;
  } else if (/repair|nanobot|patch_kit/.test(s)) {
    file = 'repair.webp'; fromThumb = false; rgb = TONE.bio;
  } else if (/sensor|scanner|survey|triangulation|signature|truesight|pds_servo|targeting|market_data|filament_contrast|host_cartography|echo_recorder|quadrille|double_entry|first_notch|regular_mass/.test(s)) {
    file = s.includes('computer') || s.includes('quadrille') || s.includes('avionics') ? 'avionics.webp' : 'sensor.webp';
    fromThumb = false; rgb = TONE.cool;
  } else if (/charge_rack|charge_vector|ordnance|ammo|munitions/.test(s)) {
    file = 'supply.webp'; fromThumb = false; rgb = TONE.hand;
  } else if (/piercing|forked|bank|ion_payload|incendiary|relay_arc|tether_capacitor|conductive_path|herald|storm_carom|sanction|governor/.test(s)) {
    file = 'avionics.webp'; fromThumb = false; rgb = TONE.exotic;
  } else {
    // Fallback by equipmentKind
    const ek = equipmentKind(obj && typeof obj === 'object' ? obj : { defId: s });
    const BY_KIND = {
      cannon: ['cannon.webp', false, TONE.copper],
      rail: ['wpn_railgun.webp', true, TONE.copper],
      laser: ['wpn_pulse_laser.webp', true, TONE.ice],
      plasma: ['plasma.webp', false, TONE.thermal],
      missile: ['missile.webp', false, TONE.thermal],
      emp: ['emp.webp', false, TONE.ice],
      web: ['wpn_arc.webp', true, TONE.exotic],
      shield: ['shield.webp', false, TONE.ice],
      engine: ['engine.webp', false, TONE.hand],
      thruster: ['engine.webp', false, TONE.hand],
      winch: ['mod_line_head.webp', true, TONE.hand],
      drill: ['drill.webp', false, TONE.copper],
      cargo: ['cargo.webp', false, TONE.cool],
      cooler: ['cooler.webp', false, TONE.ice],
      repair: ['repair.webp', false, TONE.bio],
      sensor: ['sensor.webp', false, TONE.cool],
      gravity: ['gravity.webp', false, TONE.exotic],
      ricochet: ['wpn_disc.webp', true, TONE.gold],
      ammo: ['supply.webp', false, TONE.hand],
      armor: ['armor.webp', false, TONE.mineral],
    };
    const pick = BY_KIND[ek];
    if (pick) {
      [file, fromThumb, rgb] = pick;
    }
  }

  return {
    url: file ? (fromThumb ? thumbAsset(file) : armoryAsset(file)) : null,
    rgb: isUnique ? TONE.gold : rgb,
    size: inferSize(s, obj),
    unique: isUnique,
  };
}

/**
 * Resolve item thumbnail spec for any catalog entity:
 * { id, defId, hullId, kind, category, size, unique, legality }
 */
export function resolveItemThumbSpec(input) {
  const obj = input && typeof input === 'object' ? input : null;
  let id = obj ? (obj.defId || obj.hullId || obj.id || '') : String(input || '');
  id = String(id || '');

  // Strip blueprint prefixes like bp_refine_metals / bp_build_cargopod_m / bp_ship_pelican
  if (id.startsWith('bp_') && obj?.outputs?.id) {
    return resolveItemThumbSpec({ id: obj.outputs.id, kind: obj.outputs.kind });
  }

  // Handle hull offers & ship blueprints
  if (id.startsWith('ship_') || obj?.kind === 'hull' || obj?.kind === 'ship') {
    const shipId = id.startsWith('ship_') ? id : String(obj?.hullId || obj?.defId || '');
    const poster = hullPosterUrl(shipId, obj?.hullView || 'hero') || hullPosterUrl(shipId, 'top');
    return {
      kind: 'hull',
      id: shipId,
      url: poster,
      rgb: TONE.hand,
      size: '',
      unique: false,
      crestId: '',
    };
  }

  // Handle Swarm Armory upgrade services ("service" offers reference base defId)
  if (obj?.kind === 'service') {
    if (id === 'svc_weld' || id === 'svc_hull' || id.includes('repair') || id.includes('hull')) {
      return { kind: 'service', id, url: armoryAsset('repair.webp'), rgb: TONE.bio, size: '', unique: false, crestId: id };
    }
    if (id === 'svc_ordnance' || id.includes('ordnance') || id.includes('ammo')) {
      return { kind: 'service', id, url: thumbAsset('munitions.webp'), rgb: TONE.hand, size: '', unique: false, crestId: id };
    }
    if (obj.defId && obj.defId !== id) {
      return resolveItemThumbSpec({ ...obj, kind: 'item', id: obj.defId });
    }
    // Extract defId when encoded in service id or upgrades
    const upgradeId = obj.upgradeDefId || obj.targetDefId || (id.startsWith('svc_') ? id.slice(4) : id);
    if (upgradeId && /^(wpn_|mod_|unique_|tool_|bomb_)/.test(upgradeId)) {
      return resolveItemThumbSpec({ id: upgradeId, kind: 'item' });
    }
  }

  // Handle Commodities
  if (id.startsWith('cmdty_') || obj?.kind === 'commodity') {
    const exact = COMMODITY_SPEC[id];
    const cat = String(obj?.category || '').toLowerCase();
    const fallback = CATEGORY_COMMODITY_FALLBACK[cat] || { src: 'cargo.webp', isArmory: true, rgb: TONE.cool };
    const spec = exact || fallback;
    const rgb = obj?.legality === 'contraband' ? TONE.hazard
      : obj?.legality === 'restricted' ? TONE.hand
      : spec.rgb;
    return {
      kind: 'commodity',
      id,
      url: spec.isArmory ? armoryAsset(spec.src) : thumbAsset(spec.src),
      rgb,
      size: '',
      unique: false,
      crestId: '',
    };
  }

  // Handle weapons, modules, bombs, fortify devices, base outpost modules
  const eq = resolveEquipmentSprite(id, obj);
  const arsenalMarkup = id ? arsenalIcon(id, 12) : '';
  return {
    kind: 'equipment',
    id,
    url: eq.url,
    rgb: eq.rgb,
    size: eq.size,
    unique: eq.unique,
    crestId: arsenalMarkup ? id : '',
    fallbackSpec: obj || { defId: id },
  };
}

function sizePipsHtml(size, unique) {
  if (unique) {
    return '<svg class="sf-thumb__star" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 0.8 7.6 4.4 11.2 6 7.6 7.6 6 11.2 4.4 7.6 0.8 6 4.4 4.4Z"/></svg>';
  }
  const n = size === 'L' ? 3 : size === 'M' ? 2 : size === 'S' ? 1 : 0;
  if (!n) return '';
  let pips = '';
  for (let i = 0; i < n; i++) pips += '<i class="sf-thumb__pip"></i>';
  return `<span class="sf-thumb__pips" aria-hidden="true">${pips}</span>`;
}

/**
 * Return HTML string for a decorative item thumbnail (`aria-hidden="true"`).
 * Sizes: 'xs' (24px), 'sm' (30px), 'md' (40px), 'lg' (52px), 'hero' (74px).
 */
export function itemThumbHtml(input, { size = 'md', className = '', showCrest = true, showPips = true } = {}) {
  const spec = resolveItemThumbSpec(input);
  const sizeCls = `sf-thumb--${size}`;
  const kindCls = spec.kind === 'hull' ? ' sf-thumb--hull' : '';
  const uniqueCls = spec.unique ? ' sf-thumb--unique' : '';
  const extraCls = className ? ` ${escapeHtml(className)}` : '';

  let inner = '';
  if (spec.url) {
    inner += `<img class="sf-thumb__img" src="${escapeHtml(spec.url)}" alt="" draggable="false" decoding="async" loading="lazy">`;
  } else {
    const svg = equipmentIcon(spec.fallbackSpec || spec.id, 24);
    inner += svg ? svg.replace('<svg ', '<svg class="sf-thumb__svg" ') : '';
  }

  if (showPips && spec.kind !== 'hull') {
    inner += sizePipsHtml(spec.size, spec.unique);
  }
  if (showCrest && spec.crestId && (size === 'md' || size === 'lg' || size === 'hero')) {
    const crest = arsenalIcon(spec.crestId, 12);
    if (crest) inner += `<span class="sf-thumb__crest" aria-hidden="true">${crest}</span>`;
  }

  return `<span class="sf-thumb ${sizeCls}${kindCls}${uniqueCls}${extraCls}" style="--sf-thumb-rgb:${spec.rgb}" aria-hidden="true">${inner}</span>`;
}

/**
 * Create a DOM thumbnail element for DOM-based builders (Crucible, HUD Cargo, Fortify, etc.).
 */
export function itemThumbElement(input, opts = {}, doc = globalThis.document) {
  if (!doc || typeof doc.createElement !== 'function') return null;
  injectItemThumbnailStyles(doc);
  const wrap = doc.createElement('span');
  wrap.innerHTML = itemThumbHtml(input, opts);
  const node = wrap.firstElementChild;
  if (!node) return null;
  // Clean fallback node without regex assumptions if needed
  return node;
}

/**
 * Visual paint/finish/wear/decal preview plate for Shipworks Paint Rack rows.
 * Renders a crisp 44x30 mini wing/hull swatch showing real material sheen, scratches,
 * trim stripe or stencil emblem so players see every customization option clearly.
 */
export function paintOptionThumbHtml(kind, row, current = {}) {
  const hullHex = escapeHtml(current.hullColor || '#5c6b78');
  const trimHex = escapeHtml(current.accentColor || '#d49a45');
  const id = escapeHtml(row?.id || 'stock');

  if (kind === 'hull') {
    const c = row?.hex ? escapeHtml(row.hex) : '#596672';
    const dashed = !row?.hex;
    return `<span class="sf-paint-preview" aria-hidden="true">`
      + `<svg viewBox="0 0 44 30">`
      + `<defs><linearGradient id="sp-h-${id}" x1="0" y1="0" x2="1" y2="1">`
      + `<stop offset="0%" stop-color="${c}" stop-opacity="${dashed ? '0.55' : '1'}"/>`
      + `<stop offset="55%" stop-color="${c}" stop-opacity="${dashed ? '0.45' : '0.82'}"/>`
      + `<stop offset="100%" stop-color="#11161b" stop-opacity="0.72"/></linearGradient></defs>`
      + `<path d="M5 24 L15 6 L39 6 L33 24 Z" fill="url(#sp-h-${id})" stroke="${dashed ? '#9aa7b4' : 'rgba(255,255,255,0.28)'}" stroke-width="1"${dashed ? ' stroke-dasharray="3 2"' : ''}/>`
      + `<path d="M9 19 L28 19" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>`
      + `</svg></span>`;
  }

  if (kind === 'accent') {
    const a = row?.hex ? escapeHtml(row.hex) : '#d49a45';
    const dashed = !row?.hex;
    return `<span class="sf-paint-preview" aria-hidden="true">`
      + `<svg viewBox="0 0 44 30">`
      + `<rect x="2" y="2" width="40" height="26" rx="2" fill="#232c35"/>`
      + `<path d="M4 23 L17 5 L25 5 L12 23 Z" fill="${a}" fill-opacity="${dashed ? '0.28' : '0.95'}" stroke="${dashed ? '#9aa7b4' : 'none'}" stroke-dasharray="${dashed ? '2 2' : 'none'}"/>`
      + `<path d="M18 23 L31 5 L35 5 L22 23 Z" fill="${a}" fill-opacity="${dashed ? '0.2' : '0.68'}"/>`
      + `</svg></span>`;
  }

  if (kind === 'finish') {
    const finishId = String(row?.id || '').toLowerCase();
    let grad = '<stop offset="0%" stop-color="#4e5964"/><stop offset="100%" stop-color="#2c353d"/>';
    let glint = '';
    if (finishId.includes('lacquer') || finishId.includes('gloss')) {
      grad = '<stop offset="0%" stop-color="#7c8b99"/><stop offset="42%" stop-color="#4a5866"/><stop offset="50%" stop-color="#e8f3ff"/><stop offset="62%" stop-color="#27313a"/><stop offset="100%" stop-color="#192027"/>';
      glint = '<path d="M12 3 L24 3 L14 27 L4 27 Z" fill="rgba(255,255,255,0.24)"/>';
    } else if (finishId.includes('satin')) {
      grad = '<stop offset="0%" stop-color="#687683"/><stop offset="50%" stop-color="#8b9aa8"/><stop offset="100%" stop-color="#313b44"/>';
      glint = '<ellipse cx="22" cy="14" rx="14" ry="6" fill="rgba(255,255,255,0.12)"/>';
    } else if (finishId.includes('anodized') || finishId.includes('irid')) {
      grad = '<stop offset="0%" stop-color="#3f6e8c"/><stop offset="52%" stop-color="#6b5aa6"/><stop offset="100%" stop-color="#28465e"/>';
      glint = '<path d="M4 18 Q22 6 40 16" fill="none" stroke="rgba(160,235,255,0.45)" stroke-width="2"/>';
    } else if (finishId.includes('bare') || finishId.includes('brushed')) {
      grad = '<stop offset="0%" stop-color="#87939e"/><stop offset="50%" stop-color="#5e6974"/><stop offset="100%" stop-color="#3d464f"/>';
      glint = '<path d="M4 9 H40 M4 14 H40 M4 19 H40 M4 24 H40" stroke="rgba(255,255,255,0.16)" stroke-width="0.8"/>';
    } else {
      // Matte stealth
      grad = '<stop offset="0%" stop-color="#343b42"/><stop offset="100%" stop-color="#1e242a"/>';
    }
    return `<span class="sf-paint-preview" aria-hidden="true">`
      + `<svg viewBox="0 0 44 30">`
      + `<defs><linearGradient id="sp-f-${id}" x1="0" y1="0" x2="1" y2="1">${grad}</linearGradient></defs>`
      + `<rect x="3" y="3" width="38" height="24" rx="2" fill="url(#sp-f-${id})" stroke="rgba(236,230,216,0.22)"/>`
      + glint
      + `</svg></span>`;
  }

  if (kind === 'wear') {
    const w = Number(row?.wear ?? 0);
    let marks = '';
    if (w > 0.05) {
      marks += '<path d="M8 10 L18 14 M26 8 L33 12" stroke="#b9b09f" stroke-width="1.2" opacity="0.65"/>';
    }
    if (w > 0.3) {
      marks += '<path d="M6 21 L17 17 M20 23 L35 16 M14 6 L20 12" stroke="#d9c6a3" stroke-width="1.4" opacity="0.82"/>';
    }
    if (w > 0.6) {
      marks += '<circle cx="15" cy="18" r="5" fill="rgba(28,16,12,0.7)"/><path d="M11 19 L25 9 M28 22 L38 11" stroke="#f09254" stroke-width="1.5" opacity="0.85"/>';
    }
    return `<span class="sf-paint-preview" aria-hidden="true">`
      + `<svg viewBox="0 0 44 30">`
      + `<rect x="3" y="3" width="38" height="24" rx="2" fill="#46525e" stroke="rgba(236,230,216,0.22)"/>`
      + `<path d="M3 15 H41" stroke="rgba(0,0,0,0.28)" stroke-width="1"/>`
      + marks
      + `</svg></span>`;
  }

  // Markings / Decal preview
  const d = String(row?.decalId || row?.id || '').toLowerCase();
  let glyph = '<circle cx="22" cy="15" r="4" fill="none" stroke="rgba(236,230,216,0.35)" stroke-dasharray="2 2"/>';
  if (/chevron/.test(d)) {
    glyph = `<path d="M12 20 L22 9 L32 20 L28 20 L22 13 L16 20 Z" fill="${trimHex}"/>`;
  } else if (/stripe|band|racing/.test(d)) {
    glyph = `<path d="M6 27 L18 3 H25 L13 27 Z M22 27 L34 3 H38 L26 27 Z" fill="${trimHex}"/>`;
  } else if (/hazard|warn|caution/.test(d)) {
    glyph = `<path d="M4 25 L12 5 H17 L9 25 Z M18 25 L26 5 H31 L23 25 Z M32 25 L40 5 H41 V11 L37 25 Z" fill="#f2b950"/>`;
  } else if (/wing|bird|star|crest|insignia/.test(d)) {
    glyph = `<path d="M8 12 L22 17 L36 12 L33 17 L22 22 L11 17 Z" fill="${trimHex}"/>`;
  } else if (/numeral|squad|code|tail/.test(d)) {
    glyph = `<path d="M14 9 V21 M22 9 V21 M14 15 H22 M28 9 H33 V21 H28" fill="none" stroke="${trimHex}" stroke-width="2.2"/>`;
  } else if (!/none|clean|bare|stock/.test(d)) {
    glyph = `<path d="M13 15 L22 8 L31 15 L22 22 Z" fill="none" stroke="${trimHex}" stroke-width="2"/><circle cx="22" cy="15" r="2.2" fill="${trimHex}"/>`;
  }
  return `<span class="sf-paint-preview" aria-hidden="true">`
    + `<svg viewBox="0 0 44 30">`
    + `<rect x="3" y="3" width="38" height="24" rx="2" fill="${hullHex}" fill-opacity="0.45" stroke="rgba(236,230,216,0.25)"/>`
    + glyph
    + `</svg></span>`;
}
