// src/data/commodities.js – canonical tradeable commodities.
// 47 cmdty_* IDs: ARCHITECTURE §3.6.1 baseline plus classified-salvage addendum.
// Balance data only; flavor merged from commodityFlavor.js.
import { COMMODITY_FLAVOR } from './commodityFlavor.js';
export { COMMODITY_FLAVOR } from './commodityFlavor.js';
import { COMMODITY_MORAL_TAGS } from './commodityMoralTags.js'; // BP-12 CARGO_REPUTATION_GLYPH addendum
export { COMMODITY_MORAL_TAGS, MORAL_TAGS } from './commodityMoralTags.js';
// basePrice (cr/u): price at equilibrium stock. volatility: event amplitude.
// elasticity: price curve steepness. legality: 'legal'|'restricted'|'contraband'.
// volPerU / massPerU: hold footprint. producedBy/consumedBy: station-type roles.
// marketTier: minimum sector tier where stations may SELL this naturally occurring resource.
// Any station may still BUY it from the player, preserving exploration finds and liquidation.
// Station types: trade_hub, refinery, mining, fab, military, blackmarket, research

export const COMMODITIES = [
  // --- RAW ORES ---
  { id: 'cmdty_ore_iron',           name: 'Iron Ore',              category: 'raw ore',   basePrice: 14,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.0, massPerU: 0.8, fineMult: 0, marketTier: 0, producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_ore_copper',         name: 'Copper Ore',            category: 'raw ore',   basePrice: 24,  volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 1.0, massPerU: 0.9, fineMult: 0, marketTier: 1, producedBy: ['mining'],                         consumedBy: ['refinery','fab'] },
  { id: 'cmdty_ore_titanium',       name: 'Titanium Ore',          category: 'raw ore',   basePrice: 51,  volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 1.0, massPerU: 0.7, fineMult: 0, marketTier: 2, producedBy: ['mining'],                         consumedBy: ['refinery'] },
  { id: 'cmdty_silicate',           name: 'Silicate Rock',         category: 'raw ore',   basePrice: 7,   volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.0, massPerU: 0.6, fineMult: 0, marketTier: 0, producedBy: ['mining'],                         consumedBy: ['refinery','fab','trade_hub'] },
  { id: 'cmdty_ice_water',          name: 'Water Ice',             category: 'raw ore',   basePrice: 14,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.4, massPerU: 0.5, fineMult: 0, marketTier: 0, producedBy: ['mining'],                         consumedBy: ['trade_hub','military','research'] },
  { id: 'cmdty_volatiles',          name: 'Ice Volatiles',         category: 'raw ore',   basePrice: 29,  volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 1.4, massPerU: 0.5, fineMult: 0, marketTier: 1, producedBy: ['mining'],                         consumedBy: ['refinery','military','trade_hub'] },
  { id: 'cmdty_ore_platinoid',      name: 'Platinoid Ore',         category: 'raw ore',   basePrice: 140, volatility: 0.255, elasticity: 0.489971, legality: 'legal',      volPerU: 1.0, massPerU: 1.4, fineMult: 0, marketTier: 3, producedBy: ['mining'],                         consumedBy: ['refinery'] },
  { id: 'cmdty_ore_bronzium',       name: 'Nickel Ore',            category: 'raw ore',   basePrice: 28,  volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 1.0, massPerU: 0.9, fineMult: 0, marketTier: 1, producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub','fab'] },
  { id: 'cmdty_ore_silverium',      name: 'Silver Ore',            category: 'raw ore',   basePrice: 74, volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 1.0, massPerU: 0.7, fineMult: 0, marketTier: 2, producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_ore_goldium',        name: 'Gold Ore',              category: 'raw ore',   basePrice: 170, volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 1.0, massPerU: 1.1, fineMult: 0, marketTier: 2, producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_ore_platinium',      name: 'Platinum Ore',          category: 'raw ore',   basePrice: 466, volatility: 0.255, elasticity: 0.489971, legality: 'legal',      volPerU: 1.0, massPerU: 1.4, fineMult: 0, marketTier: 3, producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_ore_einsteinium',    name: 'Stellarite Ore',        category: 'raw ore',   basePrice: 839, volatility: 0.255, elasticity: 0.489971, legality: 'legal',     volPerU: 1.0, massPerU: 1.5, fineMult: 0, marketTier: 3, producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_gem_emerald',        name: 'Raw Emerald',           category: 'raw ore',   basePrice: 1676, volatility: 0.255, elasticity: 0.489971, legality: 'legal',     volPerU: 0.8, massPerU: 0.8, fineMult: 0, marketTier: 3, producedBy: ['mining'],                         consumedBy: ['trade_hub','refinery'] },
  { id: 'cmdty_gem_ruby',           name: 'Raw Ruby',              category: 'raw ore',   basePrice: 3543, volatility: 0.28, elasticity: 0.536492, legality: 'legal',    volPerU: 0.8, massPerU: 0.8, fineMult: 0, marketTier: 4, producedBy: ['mining'],                         consumedBy: ['trade_hub','refinery'] },
  { id: 'cmdty_gem_diamond',        name: 'Raw Diamond',           category: 'raw ore',   basePrice: 10630, volatility: 0.28, elasticity: 0.536492, legality: 'legal',   volPerU: 0.8, massPerU: 0.8, fineMult: 0, marketTier: 4, producedBy: ['mining'],                         consumedBy: ['trade_hub','refinery'] },
  { id: 'cmdty_exotic_amazonite',   name: 'Prism Shard',           category: 'raw ore',   basePrice: 15944, volatility: 0.28, elasticity: 0.536492, legality: 'legal',   volPerU: 0.8, massPerU: 0.8, fineMult: 0, marketTier: 4, producedBy: ['mining'],                         consumedBy: ['trade_hub','research'] },

  // --- GAS ---
  { id: 'cmdty_gas_hydrogen',       name: 'Hydrogen Gas',          category: 'gas',       basePrice: 32,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 2.5, massPerU: 0.1, fineMult: 0, marketTier: 0, producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_gas_helium3',        name: 'Helium-3',              category: 'gas',       basePrice: 102,  volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 2.5, massPerU: 0.1, fineMult: 0, marketTier: 2, producedBy: ['mining'],                         consumedBy: ['refinery','research'] },

  // --- CRYSTAL ---
  { id: 'cmdty_crystal_silica',     name: 'Silica Crystal',        category: 'crystal',   basePrice: 29,  volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 1.0, massPerU: 1.1, fineMult: 0, marketTier: 1, producedBy: ['mining'],                         consumedBy: ['fab','research'] },
  { id: 'cmdty_crystal_lumin',      name: 'Phosphor Crystal',      category: 'crystal',   basePrice: 85, volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 1.0, massPerU: 1.0, fineMult: 0, marketTier: 2, producedBy: ['mining'],                         consumedBy: ['fab','research'] },

  // --- EXOTIC ---
  { id: 'cmdty_exotic_xenium',      name: 'Xenium',                category: 'exotic',    basePrice: 739, volatility: 0.28, elasticity: 0.536492, legality: 'legal',      volPerU: 1.0, massPerU: 1.2, fineMult: 0, marketTier: 4, producedBy: ['mining'],                         consumedBy: ['research','blackmarket'] },

  // --- REFINED ---
  { id: 'cmdty_refined_metals',     name: 'Refined Metals',        category: 'refined',   basePrice: 91,  volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 0.5, massPerU: 0.7, fineMult: 0,   producedBy: ['refinery'],                       consumedBy: ['fab','military'] },
  { id: 'cmdty_alloys',             name: 'Composite Alloys',      category: 'refined',   basePrice: 143, volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 0.5, massPerU: 0.6, fineMult: 0,   producedBy: ['refinery','fab'],                 consumedBy: ['fab','military'] },
  { id: 'cmdty_polymers',           name: 'Polymers',              category: 'refined',   basePrice: 87,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.2, massPerU: 0.7, fineMult: 0,   producedBy: ['refinery'],                       consumedBy: ['fab','trade_hub'] },
  { id: 'cmdty_fuel_cells',         name: 'Fuel Cells',            category: 'refined',   basePrice: 97,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 0.8, massPerU: 0.6, fineMult: 0,   producedBy: ['refinery'],                       consumedBy: ['trade_hub','military','mining'] },

  // --- SITE INDUSTRY (asteroid-site chain; design/ASTEROID_SITES_BRIEF.md) ---
  { id: 'cmdty_purified_silica',    name: 'Purified Silica',       category: 'refined',   basePrice: 58,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 0.8, massPerU: 0.9, fineMult: 0,   producedBy: ['refinery','fab'],                 consumedBy: ['fab','research'] },
  { id: 'cmdty_regocrete',          name: 'Regocrete',             category: 'component', basePrice: 91,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.5, massPerU: 1.8, fineMult: 0,   producedBy: ['fab','trade_hub'],                consumedBy: ['mining','fab'] },
  { id: 'cmdty_control_unit',       name: 'Machine Control Unit',  category: 'tech',      basePrice: 215, volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 1.2, massPerU: 0.8, fineMult: 0,   producedBy: ['fab','trade_hub'],                consumedBy: ['mining','fab'] },

  // --- COMPONENT ---
  { id: 'cmdty_comp_hullplate',     name: 'Hull Plate',            category: 'component', basePrice: 109, volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 0.7, massPerU: 1.0, fineMult: 0,   producedBy: ['fab','refinery'],                 consumedBy: ['military','fab'] },
  { id: 'cmdty_comp_circuitry',     name: 'Circuitry',             category: 'component', basePrice: 172, volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 0.6, massPerU: 0.3, fineMult: 0,   producedBy: ['fab'],                            consumedBy: ['research','military'] },

  // --- TECH ---
  { id: 'cmdty_microchips',         name: 'Microchips',            category: 'tech',      basePrice: 143, volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 0.7, massPerU: 0.2, fineMult: 0,   producedBy: ['fab'],                            consumedBy: ['military','trade_hub','research'] },
  { id: 'cmdty_electronics',        name: 'Electronics',           category: 'tech',      basePrice: 109, volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 0.9, massPerU: 0.5, fineMult: 0,   producedBy: ['fab'],                            consumedBy: ['trade_hub','military'] },
  { id: 'cmdty_quantum_cores',      name: 'Quantum Cores',         category: 'tech',      basePrice: 400, volatility: 0.255, elasticity: 0.489971, legality: 'legal',      volPerU: 0.9, massPerU: 0.3, fineMult: 0,   producedBy: ['research'],                       consumedBy: ['military','fab'] },

  // --- CONSUMER ---
  { id: 'cmdty_consumer_goods',     name: 'Consumer Goods',        category: 'consumer',  basePrice: 85, volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.0, massPerU: 0.5, fineMult: 0,   producedBy: ['fab','trade_hub'],                consumedBy: ['trade_hub','mining'] },
  { id: 'cmdty_textiles',           name: 'Textiles',              category: 'consumer',  basePrice: 73,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.0, massPerU: 0.6, fineMult: 0,   producedBy: ['fab'],                            consumedBy: ['trade_hub'] },

  // --- LUXURY ---
  { id: 'cmdty_luxury_goods',       name: 'Luxury Goods',          category: 'luxury',    basePrice: 269, volatility: 0.23, elasticity: 0.442497, legality: 'legal',      volPerU: 0.9, massPerU: 0.4, fineMult: 0,   producedBy: ['trade_hub','fab'],                consumedBy: ['trade_hub','blackmarket'] },
  { id: 'cmdty_art',                name: 'Art & Antiques',        category: 'luxury',    basePrice: 720, volatility: 0.255, elasticity: 0.489971, legality: 'restricted', volPerU: 0.7, massPerU: 0.3, fineMult: 0.8, producedBy: ['trade_hub'],                      consumedBy: ['trade_hub','blackmarket'] },

  // --- FOOD ---
  { id: 'cmdty_food',               name: 'Provisions',            category: 'food',      basePrice: 73,  volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.0, massPerU: 0.7, fineMult: 0,   producedBy: ['trade_hub'],                      consumedBy: ['mining','military','blackmarket'] },

  // --- MED ---
  { id: 'cmdty_medical',            name: 'Medical Supplies',      category: 'med',       basePrice: 137, volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 0.8, massPerU: 0.4, fineMult: 0,   producedBy: ['research','fab'],                 consumedBy: ['trade_hub','mining','military'] },

  // --- SALVAGE ---
  { id: 'cmdty_scrap_metal',        name: 'Scrap Metal',           category: 'salvage',   basePrice: 10,   volatility: 0.18, elasticity: 0.344535, legality: 'legal',      volPerU: 1.0, massPerU: 0.9, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','fab'] },
  { id: 'cmdty_salvage_electronics',name: 'Salvage Electronics',   category: 'salvage',   basePrice: 36,  volatility: 0.205, elasticity: 0.394033, legality: 'legal',      volPerU: 0.6, massPerU: 0.4, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['fab','military'] },
  { id: 'cmdty_classified_salvage', name: 'Classified Salvage',    category: 'salvage',   basePrice: 136,  volatility: 0.23, elasticity: 0.442497, legality: 'restricted', volPerU: 0.6, massPerU: 0.4, fineMult: 0.8, producedBy: ['blackmarket'],                    consumedBy: ['military','blackmarket','fab'] },

  // --- CONTRABAND ---
  { id: 'cmdty_narcotics',          name: 'Narcotics',             category: 'contraband',basePrice: 576, volatility: 0.255, elasticity: 0.489971, legality: 'contraband', volPerU: 0.6, massPerU: 0.2, fineMult: 1.2, producedBy: ['blackmarket'],                    consumedBy: ['blackmarket'] },
  { id: 'cmdty_stolen_goods',       name: 'Stolen Goods',          category: 'contraband',basePrice: 322, volatility: 0.23, elasticity: 0.442497, legality: 'contraband', volPerU: 1.0, massPerU: 0.8, fineMult: 1.5, producedBy: ['blackmarket'],                    consumedBy: ['blackmarket'] },

  // --- MILITARY (restricted) ---
  { id: 'cmdty_weapons',            name: 'Weapon Systems',        category: 'military',  basePrice: 400, volatility: 0.255, elasticity: 0.489971, legality: 'restricted', volPerU: 0.9, massPerU: 1.5, fineMult: 1.2, producedBy: ['military'],                       consumedBy: ['military','blackmarket'] },
  { id: 'cmdty_munitions',          name: 'Munitions',             category: 'military',  basePrice: 109, volatility: 0.205, elasticity: 0.394033, legality: 'restricted', volPerU: 0.6, massPerU: 1.1, fineMult: 0.8, producedBy: ['military','fab'],                 consumedBy: ['military','blackmarket'] },
  { id: 'cmdty_impulse_charge',     name: 'Impulse Charge',        category: 'military',  basePrice: 322, volatility: 0.23, elasticity: 0.442497, legality: 'restricted', volPerU: 2.0, massPerU: 2.0, fineMult: 1.0, producedBy: ['military','fab'],                 consumedBy: ['military','blackmarket'] },
];

// Merge trade-terminal flavor onto each commodity record at module load.
for (const cmdty of COMMODITIES) {
  const flavor = COMMODITY_FLAVOR[cmdty.id];
  if (!flavor) continue;
  Object.assign(cmdty, flavor);
}

// BP-12 CARGO_REPUTATION_GLYPH: merge the moralTag addendum onto each record (one source of truth,
// same merge pattern as COMMODITY_FLAVOR above). moralTag is OPTIONAL — neutral cargo has none.
for (const cmdty of COMMODITIES) {
  const tag = COMMODITY_MORAL_TAGS[cmdty.id];
  if (tag) cmdty.moralTag = tag;
}
