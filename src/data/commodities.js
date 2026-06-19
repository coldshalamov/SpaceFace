// src/data/commodities.js – canonical tradeable commodities.
// 33 cmdty_* IDs per ARCHITECTURE §3.6.1. Pure data, no imports.
// basePrice (cr/u): price at equilibrium stock. volatility: event amplitude.
// elasticity: price curve steepness. legality: 'legal'|'restricted'|'contraband'.
// volPerU / massPerU: hold footprint. producedBy/consumedBy: station-type roles.
// Station types: trade_hub, refinery, mining, fab, military, blackmarket, research

export const COMMODITIES = [
  // --- RAW ORES ---
  { id: 'cmdty_ore_iron',           name: 'Iron Ore',              category: 'raw ore',   basePrice: 28,  volatility: 0.20, elasticity: 0.40, legality: 'legal',      volPerU: 1.0, massPerU: 0.8, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_ore_copper',         name: 'Copper Ore',            category: 'raw ore',   basePrice: 40,  volatility: 0.22, elasticity: 0.40, legality: 'legal',      volPerU: 1.0, massPerU: 0.9, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','fab'] },
  { id: 'cmdty_ore_titanium',       name: 'Titanium Ore',          category: 'raw ore',   basePrice: 65,  volatility: 0.25, elasticity: 0.45, legality: 'legal',      volPerU: 1.0, massPerU: 0.7, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery'] },
  { id: 'cmdty_silicate',           name: 'Silicate Rock',         category: 'raw ore',   basePrice: 8,   volatility: 0.15, elasticity: 0.30, legality: 'legal',      volPerU: 1.0, massPerU: 0.6, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','fab','trade_hub'] },
  { id: 'cmdty_ice_water',          name: 'Water Ice',             category: 'raw ore',   basePrice: 12,  volatility: 0.15, elasticity: 0.30, legality: 'legal',      volPerU: 1.4, massPerU: 0.5, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['trade_hub','military','research'] },
  { id: 'cmdty_volatiles',          name: 'Ice Volatiles',         category: 'raw ore',   basePrice: 35,  volatility: 0.22, elasticity: 0.45, legality: 'legal',      volPerU: 1.4, massPerU: 0.5, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','military','trade_hub'] },
  { id: 'cmdty_ore_platinoid',      name: 'Platinoid Ore',         category: 'raw ore',   basePrice: 150, volatility: 0.32, elasticity: 0.55, legality: 'legal',      volPerU: 1.0, massPerU: 1.4, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery'] },

  // --- GAS ---
  { id: 'cmdty_gas_hydrogen',       name: 'Hydrogen Gas',          category: 'gas',       basePrice: 20,  volatility: 0.20, elasticity: 0.38, legality: 'legal',      volPerU: 2.5, massPerU: 0.1, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_gas_helium3',        name: 'Helium-3',              category: 'gas',       basePrice: 80,  volatility: 0.28, elasticity: 0.50, legality: 'legal',      volPerU: 2.5, massPerU: 0.1, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','research'] },

  // --- CRYSTAL ---
  { id: 'cmdty_crystal_silica',     name: 'Silica Crystal',        category: 'crystal',   basePrice: 55,  volatility: 0.24, elasticity: 0.42, legality: 'legal',      volPerU: 1.0, massPerU: 1.1, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['fab','research'] },
  { id: 'cmdty_crystal_lumin',      name: 'Luminite Crystal',      category: 'crystal',   basePrice: 105, volatility: 0.30, elasticity: 0.46, legality: 'legal',      volPerU: 1.0, massPerU: 1.0, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['fab','research'] },

  // --- EXOTIC ---
  { id: 'cmdty_exotic_xenium',      name: 'Xenium',                category: 'exotic',    basePrice: 320, volatility: 0.55, elasticity: 0.55, legality: 'legal',      volPerU: 1.0, massPerU: 1.2, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['research','blackmarket'] },

  // --- REFINED ---
  { id: 'cmdty_refined_metals',     name: 'Refined Metals',        category: 'refined',   basePrice: 85,  volatility: 0.25, elasticity: 0.45, legality: 'legal',      volPerU: 0.5, massPerU: 0.7, fineMult: 0,   producedBy: ['refinery'],                       consumedBy: ['fab','military'] },
  { id: 'cmdty_alloys',             name: 'Composite Alloys',      category: 'refined',   basePrice: 140, volatility: 0.28, elasticity: 0.42, legality: 'legal',      volPerU: 0.5, massPerU: 0.6, fineMult: 0,   producedBy: ['refinery','fab'],                 consumedBy: ['fab','military'] },
  { id: 'cmdty_polymers',           name: 'Polymers',              category: 'refined',   basePrice: 70,  volatility: 0.24, elasticity: 0.40, legality: 'legal',      volPerU: 1.2, massPerU: 0.7, fineMult: 0,   producedBy: ['refinery'],                       consumedBy: ['fab','trade_hub'] },
  { id: 'cmdty_fuel_cells',         name: 'Fuel Cells',            category: 'refined',   basePrice: 95,  volatility: 0.26, elasticity: 0.50, legality: 'legal',      volPerU: 0.8, massPerU: 0.6, fineMult: 0,   producedBy: ['refinery'],                       consumedBy: ['trade_hub','military','mining'] },

  // --- COMPONENT ---
  { id: 'cmdty_comp_hullplate',     name: 'Hull Plate',            category: 'component', basePrice: 165, volatility: 0.28, elasticity: 0.40, legality: 'legal',      volPerU: 0.7, massPerU: 1.0, fineMult: 0,   producedBy: ['fab','refinery'],                 consumedBy: ['military','fab'] },
  { id: 'cmdty_comp_circuitry',     name: 'Circuitry',             category: 'component', basePrice: 200, volatility: 0.36, elasticity: 0.40, legality: 'legal',      volPerU: 0.6, massPerU: 0.3, fineMult: 0,   producedBy: ['fab'],                            consumedBy: ['research','military'] },

  // --- TECH ---
  { id: 'cmdty_microchips',         name: 'Microchips',            category: 'tech',      basePrice: 185, volatility: 0.35, elasticity: 0.40, legality: 'legal',      volPerU: 0.7, massPerU: 0.2, fineMult: 0,   producedBy: ['fab'],                            consumedBy: ['military','trade_hub','research'] },
  { id: 'cmdty_electronics',        name: 'Electronics',           category: 'tech',      basePrice: 150, volatility: 0.32, elasticity: 0.40, legality: 'legal',      volPerU: 0.9, massPerU: 0.5, fineMult: 0,   producedBy: ['fab'],                            consumedBy: ['trade_hub','military'] },
  { id: 'cmdty_quantum_cores',      name: 'Quantum Cores',         category: 'tech',      basePrice: 340, volatility: 0.45, elasticity: 0.46, legality: 'legal',      volPerU: 0.9, massPerU: 0.3, fineMult: 0,   producedBy: ['research'],                       consumedBy: ['military','fab'] },

  // --- CONSUMER ---
  { id: 'cmdty_consumer_goods',     name: 'Consumer Goods',        category: 'consumer',  basePrice: 110, volatility: 0.28, elasticity: 0.45, legality: 'legal',      volPerU: 1.0, massPerU: 0.5, fineMult: 0,   producedBy: ['fab','trade_hub'],                consumedBy: ['trade_hub','mining'] },
  { id: 'cmdty_textiles',           name: 'Textiles',              category: 'consumer',  basePrice: 60,  volatility: 0.22, elasticity: 0.40, legality: 'legal',      volPerU: 1.0, massPerU: 0.6, fineMult: 0,   producedBy: ['fab'],                            consumedBy: ['trade_hub'] },

  // --- LUXURY ---
  { id: 'cmdty_luxury_goods',       name: 'Luxury Goods',          category: 'luxury',    basePrice: 190, volatility: 0.40, elasticity: 0.42, legality: 'legal',      volPerU: 0.9, massPerU: 0.4, fineMult: 0,   producedBy: ['trade_hub','fab'],                consumedBy: ['trade_hub','blackmarket'] },
  { id: 'cmdty_art',                name: 'Art & Antiques',        category: 'luxury',    basePrice: 300, volatility: 0.45, elasticity: 0.50, legality: 'restricted', volPerU: 0.7, massPerU: 0.3, fineMult: 0.8, producedBy: ['trade_hub'],                      consumedBy: ['trade_hub','blackmarket'] },

  // --- FOOD ---
  { id: 'cmdty_food',               name: 'Provisions',            category: 'food',      basePrice: 40,  volatility: 0.20, elasticity: 0.30, legality: 'legal',      volPerU: 1.0, massPerU: 0.7, fineMult: 0,   producedBy: ['trade_hub'],                      consumedBy: ['mining','military','blackmarket'] },

  // --- MED ---
  { id: 'cmdty_medical',            name: 'Medical Supplies',      category: 'med',       basePrice: 150, volatility: 0.30, elasticity: 0.40, legality: 'legal',      volPerU: 0.8, massPerU: 0.4, fineMult: 0,   producedBy: ['research','fab'],                 consumedBy: ['trade_hub','mining','military'] },

  // --- SALVAGE ---
  { id: 'cmdty_scrap_metal',        name: 'Scrap Metal',           category: 'salvage',   basePrice: 8,   volatility: 0.18, elasticity: 0.30, legality: 'legal',      volPerU: 1.0, massPerU: 0.9, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','fab'] },
  { id: 'cmdty_salvage_electronics',name: 'Salvage Electronics',   category: 'salvage',   basePrice: 55,  volatility: 0.25, elasticity: 0.40, legality: 'legal',      volPerU: 0.6, massPerU: 0.4, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['fab','military'] },

  // --- CONTRABAND ---
  { id: 'cmdty_narcotics',          name: 'Narcotics',             category: 'contraband',basePrice: 220, volatility: 0.55, elasticity: 0.60, legality: 'contraband', volPerU: 0.6, massPerU: 0.2, fineMult: 1.2, producedBy: ['blackmarket'],                    consumedBy: ['blackmarket'] },
  { id: 'cmdty_stolen_goods',       name: 'Stolen Goods',          category: 'contraband',basePrice: 150, volatility: 0.50, elasticity: 0.55, legality: 'contraband', volPerU: 1.0, massPerU: 0.8, fineMult: 1.5, producedBy: ['blackmarket'],                    consumedBy: ['blackmarket'] },

  // --- MILITARY (restricted) ---
  { id: 'cmdty_weapons',            name: 'Weapon Systems',        category: 'military',  basePrice: 280, volatility: 0.40, elasticity: 0.48, legality: 'restricted', volPerU: 0.9, massPerU: 1.5, fineMult: 1.2, producedBy: ['military'],                       consumedBy: ['military','blackmarket'] },
  { id: 'cmdty_munitions',          name: 'Munitions',             category: 'military',  basePrice: 115, volatility: 0.32, elasticity: 0.48, legality: 'restricted', volPerU: 0.6, massPerU: 1.1, fineMult: 0.8, producedBy: ['military','fab'],                 consumedBy: ['military','blackmarket'] },
];
