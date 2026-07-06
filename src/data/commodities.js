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
  { id: 'cmdty_ore_bronzium',       name: 'Nickel Ore',            category: 'raw ore',   basePrice: 60,  volatility: 0.22, elasticity: 0.40, legality: 'legal',      volPerU: 1.0, massPerU: 0.9, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub','fab'] },
  { id: 'cmdty_ore_silverium',      name: 'Silver Ore',            category: 'raw ore',   basePrice: 100, volatility: 0.25, elasticity: 0.45, legality: 'legal',      volPerU: 1.0, massPerU: 0.7, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_ore_goldium',        name: 'Gold Ore',              category: 'raw ore',   basePrice: 250, volatility: 0.28, elasticity: 0.50, legality: 'legal',      volPerU: 1.0, massPerU: 1.1, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_ore_platinium',      name: 'Platinum Ore',          category: 'raw ore',   basePrice: 750, volatility: 0.30, elasticity: 0.52, legality: 'legal',      volPerU: 1.0, massPerU: 1.4, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_ore_einsteinium',    name: 'Stellarite Ore',        category: 'raw ore',   basePrice: 2000, volatility: 0.35, elasticity: 0.55, legality: 'legal',     volPerU: 1.0, massPerU: 1.5, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_gem_emerald',        name: 'Raw Emerald',           category: 'raw ore',   basePrice: 5000, volatility: 0.40, elasticity: 0.60, legality: 'legal',     volPerU: 0.8, massPerU: 0.8, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['trade_hub','refinery'] },
  { id: 'cmdty_gem_ruby',           name: 'Raw Ruby',              category: 'raw ore',   basePrice: 20000, volatility: 0.45, elasticity: 0.65, legality: 'legal',    volPerU: 0.8, massPerU: 0.8, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['trade_hub','refinery'] },
  { id: 'cmdty_gem_diamond',        name: 'Raw Diamond',           category: 'raw ore',   basePrice: 100000, volatility: 0.50, elasticity: 0.70, legality: 'legal',   volPerU: 0.8, massPerU: 0.8, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['trade_hub','refinery'] },
  { id: 'cmdty_exotic_amazonite',   name: 'Prism Shard',           category: 'raw ore',   basePrice: 500000, volatility: 0.60, elasticity: 0.80, legality: 'legal',   volPerU: 0.8, massPerU: 0.8, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['trade_hub','research'] },

  // --- GAS ---
  { id: 'cmdty_gas_hydrogen',       name: 'Hydrogen Gas',          category: 'gas',       basePrice: 20,  volatility: 0.20, elasticity: 0.38, legality: 'legal',      volPerU: 2.5, massPerU: 0.1, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','trade_hub'] },
  { id: 'cmdty_gas_helium3',        name: 'Helium-3',              category: 'gas',       basePrice: 80,  volatility: 0.28, elasticity: 0.50, legality: 'legal',      volPerU: 2.5, massPerU: 0.1, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['refinery','research'] },

  // --- CRYSTAL ---
  { id: 'cmdty_crystal_silica',     name: 'Silica Crystal',        category: 'crystal',   basePrice: 55,  volatility: 0.24, elasticity: 0.42, legality: 'legal',      volPerU: 1.0, massPerU: 1.1, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['fab','research'] },
  { id: 'cmdty_crystal_lumin',      name: 'Phosphor Crystal',      category: 'crystal',   basePrice: 105, volatility: 0.30, elasticity: 0.46, legality: 'legal',      volPerU: 1.0, massPerU: 1.0, fineMult: 0,   producedBy: ['mining'],                         consumedBy: ['fab','research'] },

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
  { id: 'cmdty_impulse_charge',     name: 'Impulse Charge',        category: 'military',  basePrice: 180, volatility: 0.25, elasticity: 0.50, legality: 'restricted', volPerU: 2.0, massPerU: 2.0, fineMult: 1.0, producedBy: ['military','fab'],                 consumedBy: ['military','blackmarket'] },
];

// Trade-terminal flavor: display names, physical descriptions, and in-world lore notes.
// Merged onto COMMODITIES at module load; balance fields above are unchanged.
export const COMMODITY_FLAVOR = {
  cmdty_ore_iron: {
    displayName: 'Slag-Iron Ore, Ceres Belt',
    desc: 'Magnetite-rich rubble in sealed ore drums.',
    lore: 'Ceres miners strip it by the hold. Helios refineries pay on arrival weight, not assay.',
  },
  cmdty_ore_copper: {
    displayName: 'Verdantite Copper, Kuiper Drift',
    desc: 'Green-stained chalcopyrite chunks in mesh-lined crates.',
    lore: 'Drift cutters sell it raw. Meridian fabs quote delivery before the refinery lot clears customs.',
  },
  cmdty_ore_titanium: {
    displayName: 'Blackspire Titanium, Vael Fringe',
    desc: 'Ilmenite grit bonded in vacuum-cast briquettes.',
    lore: 'Fringe claims run lean yields. Refinery buyers know a Vael load waited months in cold storage.',
  },
  cmdty_silicate: {
    displayName: 'Cinder Silicate, Outer Reach',
    desc: 'Crushed feldspar aggregate in breathable bulk sacks.',
    lore: 'Reach quarries sell cheap by the tonne. Fabs blend it into hull filler nobody prices separately.',
  },
  cmdty_ice_water: {
    displayName: 'Bluepack Ice, Helios Lanes',
    desc: 'Comet-core water ice in insulated liner drums.',
    lore: 'Helios lane tankers skim comet tails for it. Military outposts and research labs book standing orders.',
  },
  cmdty_volatiles: {
    displayName: 'Frostbite Volatiles, Ceres Cold Yards',
    desc: 'Mixed methane and ammonia ice in pressure-rated pods.',
    lore: 'Cold yards harvest it from outer ice. Refineries crack it; military buys the fraction lists quietly.',
  },
  cmdty_ore_platinoid: {
    displayName: 'Deep Vein Platinoid, Meridian Claims',
    desc: 'Dense PGM nodules in lead-lined sample cases.',
    lore: 'Meridian survey crews guard these assay tags. Refinery buyers meet the courier, not the miner.',
  },
  cmdty_ore_bronzium: {
    displayName: 'Ridge Nickel, Concord Survey Belt',
    desc: 'Laterite nickel ore in magnetic separation bins.',
    lore: 'Concord survey maps mark the good ridges. Trade hubs move it onward while fabs wait on alloy lots.',
  },
  cmdty_ore_silverium: {
    displayName: 'Lunar Argentite, Helios Moons',
    desc: 'Silver sulfide fines in vacuum-sealed foil packs.',
    lore: 'Helios moon shafts produce steady lots. Refineries assay it; trade desks markup on purity rumors.',
  },
  cmdty_ore_goldium: {
    displayName: 'Sunfall Gold Ore, Meridian Core',
    desc: 'Microscopic gold in quartz matrix, assay-stamped.',
    lore: 'Meridian core-sector assays travel under escort. Trade hubs price the rumor before refinery bars ship.',
  },
  cmdty_ore_platinium: {
    displayName: 'Crown Platinum, Vael Deep Claims',
    desc: 'Platinum-group pebbles in tamper-sealed grav cans.',
    lore: 'Vael deep rigs pay fines for overclaiming. Refineries and trade desks both post armed pickup windows.',
  },
  cmdty_ore_einsteinium: {
    displayName: 'Stellarite Lattice, Reach Anomaly Fields',
    desc: 'Unstable transuranic lattice in magnetized shield casks.',
    lore: 'Reach anomaly miners wear debt on their lungs. Refinery bids arrive with hazard waivers countersigned.',
  },
  cmdty_gem_emerald: {
    displayName: 'Veridian Rough, Ceres Gem Pits',
    desc: 'Uncut emerald crystals in foam-lined shock cases.',
    lore: 'Ceres pit bosses grade by luster, not mass. Trade hubs move stones before refineries cut to spec.',
  },
  cmdty_gem_ruby: {
    displayName: 'Bloodstar Ruby, Meridian Auction Lots',
    desc: 'Uncut corundum rubies wrapped in static-proof mesh.',
    lore: 'Meridian auctions leak prices a week early. Refinery cutters and trade desks fight over the same crate.',
  },
  cmdty_gem_diamond: {
    displayName: 'Voidwhite Diamond, Vael High Auction',
    desc: 'Raw carbonado diamonds in zero-g rated lockboxes.',
    lore: 'Vael high auctions move single stones. Trade rumors outrun the refinery cutter invoice by a sector.',
  },
  cmdty_exotic_amazonite: {
    displayName: 'Prism Shard, Reach Lab Auction',
    desc: 'Iridescent lattice shards that refract in vacuum light.',
    lore: 'Reach lab auctions license every gram. Research institutes outbid trade desks; miners never see closing price.',
  },
  cmdty_gas_hydrogen: {
    displayName: 'Lane Hydrogen, Helios Collectors',
    desc: 'Compressed hydrogen in filament-wound pressure spheres.',
    lore: 'Helios collectors skim it from stellar wind. Refinery crackers buy bulk before trade hubs bottle retail lots.',
  },
  cmdty_gas_helium3: {
    displayName: 'Luna Helium-3, Concord Extraction Yards',
    desc: 'Tritium-depleted helium-3 in cryogenic dewar pods.',
    lore: 'Concord yards meter every dewar leaving Luna. Research reactors book years ahead; refineries get overrun.',
  },
  cmdty_crystal_silica: {
    displayName: 'Clearspire Silica, Ceres Crystal Vats',
    desc: 'Optical-grade silica boules in padded isolation racks.',
    lore: 'Ceres vats grow them slow. Fabs cut optics while research benches hoard the clear lots first.',
  },
  cmdty_crystal_lumin: {
    displayName: 'Lantern Phosphor, Meridian Glow Works',
    desc: 'Photoactive crystal rods that store ambient charge.',
    lore: 'Meridian glow works grade by decay curve. Fabs embed them in panels; research wants the unstable cuts.',
  },
  cmdty_exotic_xenium: {
    displayName: 'Black Xenium, Vael Fringe Labs',
    desc: 'Resonant xenon-class isotope in braided shield tubes.',
    lore: 'Fringe labs assay it under blackout orders. Research pays triple; Vael blackmarket runners quote higher still.',
  },
  cmdty_refined_metals: {
    displayName: 'Helios Bar Stock, Refinery Grade',
    desc: 'Stamped ingot stacks of smelted structural metals.',
    lore: 'Helios refineries stamp heat lots on every bar. Military fabs clear manifests before civilian orders ship.',
  },
  cmdty_alloys: {
    displayName: 'Forgeplate Alloy, Meridian Mills',
    desc: 'Pre-mixed composite sheets rated for vacuum welding.',
    lore: 'Meridian mills batch to military spec first. Fabs re-roll what refinery overflow cannot clear same cycle.',
  },
  cmdty_polymers: {
    displayName: 'Flexweave Polymer, Helios Chemical Yards',
    desc: 'Extruded polymer ribbon on spooled industrial cores.',
    lore: 'Helios yards extrude by the kilometer. Fabs laminate hull seals; trade hubs retail cut lengths at markup.',
  },
  cmdty_fuel_cells: {
    displayName: 'Cellbank Fuel, Ceres Depot Standard',
    desc: 'Sealed fusion cells in shock-rated transport crates.',
    lore: 'Ceres depots refill mining tugs on credit. Military requisitions jump the queue; trade hubs sell the remainder.',
  },
  cmdty_comp_hullplate: {
    displayName: 'Ironweave Hull Plate, Concord Shipyards',
    desc: 'Pre-drilled armor panels with weld-guide fiducials.',
    lore: 'Concord yards stamp registry codes on every sheet. Military docks take priority lots; fabs get overrun cuts.',
  },
  cmdty_comp_circuitry: {
    displayName: 'Traceway Circuitry, Meridian Fab Lines',
    desc: 'Multi-layer printed boards in antistatic clamshell trays.',
    lore: 'Meridian fab lines run three shifts on navy orders. Research benches pay late fees for cleared export lots.',
  },
  cmdty_microchips: {
    displayName: 'Gatestack Microchips, Helios Logic Foundry',
    desc: 'Silicon dies on wafer frames in vacuum packs.',
    lore: 'Helios foundry gates test every lot twice. Military procurement holds allocation; trade desks sell what slips through.',
  },
  cmdty_electronics: {
    displayName: 'Shelf Electronics, Ceres Trade Standard',
    desc: 'Assembled modules: relays, boards, and harness bundles.',
    lore: 'Ceres trade standard means shelf-ready boxes. Military requisitions tag priority SKUs before retail lots list.',
  },
  cmdty_quantum_cores: {
    displayName: 'Coherence Core, Reach Research Annex',
    desc: 'Stabilized quantum matrices in magnetically damped housings.',
    lore: 'Reach annex ships under Concord seal. Military fabs get allocation; civilian buyers wait on declassified lots.',
  },
  cmdty_consumer_goods: {
    displayName: 'Lane Consumer Kit, Meridian Retail',
    desc: 'Assorted hab goods packed for long haul resale.',
    lore: 'Meridian retail kits stock trade hubs first. Mining camps buy them marked up before the next convoy.',
  },
  cmdty_textiles: {
    displayName: 'Driftweave Textiles, Ceres Loomworks',
    desc: 'Synthetic fabric bolts rated for vacuum hab cycles.',
    lore: 'Ceres loomworks dye by contract number. Trade hubs move bolts; miners patch suits from offcut bins.',
  },
  cmdty_luxury_goods: {
    displayName: 'Velvet Lot Luxury, Helios Promenade',
    desc: 'Curated status goods in tamper-evident gift cases.',
    lore: 'Helios promenade shops invoice by provenance story. Trade desks resell; Vael runners skim what customs misses.',
  },
  cmdty_art: {
    displayName: 'Vaulted Antiques, Meridian Collector Circuit',
    desc: 'Authenticated artworks with chain-of-custody manifests attached.',
    lore: 'Meridian collector circuit tracks every transfer. Trade halls display openly; Vael lockers pay cash, no questions.',
  },
  cmdty_food: {
    displayName: 'Hardtack Provisions, Ceres Galley Standard',
    desc: 'Shelf-stable meal bricks and hydroponic supplement packs.',
    lore: 'Ceres galleys stock the standard brick. Mining camps burn through it; blackmarket repacks near-expiry lots cheap.',
  },
  cmdty_medical: {
    displayName: 'Trauma Crate Medical, Concord Field Standard',
    desc: 'Sterile kits: sutures, stabilizers, and dose-sealed meds.',
    lore: 'Concord field standard clears military stock first. Trade hubs backfill miners; research fabs feed the refill pipeline.',
  },
  cmdty_scrap_metal: {
    displayName: 'Hulk Scrap, Vael Salvage Yards',
    desc: 'Twisted hull plating and frame cuttings in loose piles.',
    lore: 'Vael salvage yards sort by alloy hint. Refineries melt it cheap; fabs cherry-pick plate with registry stamps intact.',
  },
  cmdty_salvage_electronics: {
    displayName: 'Derelict Boards, Outer Reach Pickings',
    desc: 'Stripped nav boards and relay packs from wreck hulks.',
    lore: 'Reach pickers strip wrecks before Concord patrols note them. Fabs refurbish what military buyers do not seize first.',
  },
  cmdty_narcotics: {
    displayName: 'Lane Dust, Vael Locker Trade',
    desc: 'Vacuum-sealed pouches of refined stimulant resin.',
    lore: 'Vael lockers move it dockside after dark. Blackmarket ledgers clear same-day; Concord fines double if you are holding.',
  },
  cmdty_stolen_goods: {
    displayName: 'Ghost Lot Cargo, Unmarked Tags',
    desc: 'Mixed seized freight with serial plates filed smooth.',
    lore: 'Vael runners flip ghost lots between blackmarket booths. No manifest survives a second sale; buyers count fast.',
  },
  cmdty_weapons: {
    displayName: 'Ordnance Line Weapons, Concord Armories',
    desc: 'Ship-mounted weapon assemblies in armored transit crates.',
    lore: 'Concord armories log every crate by hull ID. Military docks clear allotments; Vael brokers quote what fell off the manifest.',
  },
  cmdty_munitions: {
    displayName: 'Casehard Munitions, Helios Arsenal Lots',
    desc: 'Guided warheads and belted ammunition in sealed magazines.',
    lore: 'Helios arsenal lots move under escort schedules. Military buyers take allocation; blackmarket strips what convoys lose.',
  },
  cmdty_impulse_charge: {
    displayName: 'Spike Impulse Charge, Meridian Ordnance',
    desc: 'High-yield breaching charges in mag-safe foam cradles.',
    lore: 'Meridian ordnance fills military racks first. Blackmarket charges match serials to wrecks nobody reports missing.',
  },
};

for (const cmdty of COMMODITIES) {
  const flavor = COMMODITY_FLAVOR[cmdty.id];
  if (!flavor) continue;
  Object.assign(cmdty, flavor);
}
