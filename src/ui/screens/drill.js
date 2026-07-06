// Drill lens screen (V2 §7 / cut-list #27). The 2D ant-farm mining view. Renders the vein cross-
// section to a canvas, handles WASD / Arrow key movement and directional drilling input locally,
// and shows yield, drill warnings, and elegant item acquisition toasts.
import { DRILL_CONST, drillTierReqForOre } from '../../systems/drill.js';
import { COMMODITIES } from '../../data/commodities.js';

const { COLS, ROWS, TILE } = DRILL_CONST;
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

const STYLE_ID = 'sf-drill-style';

function titleCaseWords(value) {
  return String(value || '').replace(/^cmdty_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function commodityName(id) {
  const commodity = COMMODITY_BY_ID.get(id);
  return (commodity && commodity.name) || titleCaseWords(id || 'ore');
}

function legendIconImg(iconKey, size = 22) {
  const img = document.createElement('img');
  img.width = size;
  img.height = size;
  img.className = 'drill-legend-icon';
  img.alt = '';
  const tpl = SVG_TEMPLATES[iconKey];
  if (tpl) img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(tpl);
  return img;
}

function makeLegendItem(label, iconKey, opts = {}) {
  const item = document.createElement('span');
  item.className = 'drill-legend-item'
    + (opts.warn ? ' warn' : '')
    + (opts.locked ? ' locked' : '');

  if (opts.icons) {
    opts.icons.forEach((key, i) => {
      item.appendChild(legendIconImg(key));
      if (i < opts.icons.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'drill-legend-arrow';
        arrow.textContent = '→';
        item.appendChild(arrow);
      }
    });
  } else if (iconKey) {
    item.appendChild(legendIconImg(iconKey));
  }

  const text = document.createElement('span');
  text.className = 'drill-legend-label';
  text.textContent = label;
  item.appendChild(text);

  if (opts.badge) {
    const badge = document.createElement('span');
    badge.className = 'drill-legend-badge' + (opts.warn ? ' bad' : '');
    badge.textContent = opts.badge;
    item.appendChild(badge);
  }

  return item;
}

function collectFieldLegendData(field) {
  const ores = new Set();
  let hasGas = false;
  if (!field) return { ores: [], hasGas: false };
  for (let c = 0; c < field.length; c++) {
    for (let r = 0; r < field[c].length; r++) {
      const tile = field[c][r];
      if (!tile) continue;
      if (tile.type === 'vein' && tile.ore) ores.add(tile.ore);
      if (tile.type === 'gas') hasGas = true;
    }
  }
  return {
    ores: [...ores].sort((a, b) => {
      const pa = COMMODITY_BY_ID.get(a)?.basePrice || 0;
      const pb = COMMODITY_BY_ID.get(b)?.basePrice || 0;
      return pa - pb;
    }),
    hasGas,
  };
}

function renderDrillLegend(gridEl, field, drillTier = 1) {
  if (!gridEl) return;
  gridEl.replaceChildren();

  gridEl.appendChild(makeLegendItem('Regolith', 'dirt'));
  gridEl.appendChild(makeLegendItem('Basalt', 'rock'));

  const { ores, hasGas } = collectFieldLegendData(field);

  if (hasGas) {
    gridEl.appendChild(makeLegendItem('Gas (disguised as dirt)', null, {
      icons: ['dirt', 'gasRevealed'],
      warn: true,
      badge: 'AVOID',
    }));
  }

  for (const oreId of ores) {
    const req = drillTierReqForOre(oreId);
    const locked = drillTier < req;
    gridEl.appendChild(makeLegendItem(commodityName(oreId), oreId, {
      locked,
      badge: locked ? `MK${req}` : null,
    }));
  }

  if (ores.length === 0) {
    const note = document.createElement('span');
    note.className = 'drill-legend-note';
    note.textContent = 'No ore veins on initial scan — dig deeper to expose deposits.';
    gridEl.appendChild(note);
  }
}

// Spark/glow colors for minerals
const ORE_SPARK_COLOR = {
  cmdty_ore_iron: '#c8a878',
  cmdty_ore_copper: '#14b8a6',
  cmdty_silicate: '#b8b8d0',
  cmdty_ore_titanium: '#d0d8e8',
  cmdty_ore_platinoid: '#e8d850',
  cmdty_ice_water: '#9ad8ff',
  cmdty_ore_bronzium: '#94a3b8',
  cmdty_ore_silverium: '#d0d8e8',
  cmdty_ore_goldium: '#fff275',
  cmdty_ore_platinium: '#d7e6ff',
  cmdty_ore_einsteinium: '#8d66ff',
  cmdty_gem_emerald: '#5cffbe',
  cmdty_gem_ruby: '#ff5c5c',
  cmdty_gem_diamond: '#39d0ff',
  cmdty_exotic_amazonite: '#00ffd5',
};

// Inline SVG assets for rover, drill bit, blocks, and minerals
const SVG_TEMPLATES = {
  rover: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <defs>
      <linearGradient id="chassisGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="45%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>
      <linearGradient id="armorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#0369a1" />
      </linearGradient>
      <linearGradient id="canopyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0ea5e9" />
        <stop offset="40%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#0284c7" />
      </linearGradient>
    </defs>
    <!-- Shadow -->
    <ellipse cx="32" cy="54" rx="24" ry="4" fill="rgba(0, 0, 0, 0.5)" />
    <!-- Treads/Tracks -->
    <rect x="4" y="42" width="56" height="14" rx="6" fill="#090d16" stroke="#1e293b" stroke-width="2.5" />
    <circle cx="12" cy="49" r="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
    <circle cx="32" cy="49" r="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
    <circle cx="52" cy="49" r="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
    <path d="M 4 49 L 8 42 L 56 42 L 60 49 L 56 56 L 8 56 Z" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4,3" />
    <!-- Hydraulic shocks -->
    <line x1="20" y1="36" x2="20" y2="44" stroke="#475569" stroke-width="4" />
    <line x1="44" y1="36" x2="44" y2="44" stroke="#475569" stroke-width="4" />
    <!-- Main Chassis body -->
    <path d="M 8 40 L 14 20 L 48 20 L 54 40 Z" fill="url(#chassisGrad)" stroke="#1e293b" stroke-width="2" />
    <!-- Layered metal armor plates -->
    <path d="M 11 38 L 15 22 L 30 22 L 28 38 Z" fill="url(#armorGrad)" opacity="0.9" />
    <path d="M 32 38 L 34 22 L 47 22 L 51 38 Z" fill="url(#armorGrad)" opacity="0.95" />
    <!-- Rivets/Bolts -->
    <circle cx="16" cy="24" r="1.2" fill="#e2e8f0" />
    <circle cx="28" cy="24" r="1.2" fill="#e2e8f0" />
    <circle cx="34" cy="24" r="1.2" fill="#e2e8f0" />
    <circle cx="45" cy="24" r="1.2" fill="#e2e8f0" />
    <!-- Cockpit / Glass Canopy -->
    <path d="M 22 20 L 30 8 L 44 20 Z" fill="#0f172a" stroke="#1e293b" stroke-width="2" />
    <path d="M 24 19 L 30 10 L 42 19 Z" fill="url(#canopyGrad)" stroke="#e0f2fe" stroke-width="1" />
    <!-- Gloss sheen reflection -->
    <polygon points="33,11 39,19 36,19 31,12" fill="#ffffff" opacity="0.5" />
    <!-- Exhaust vent pipe on back -->
    <rect x="6" y="24" width="6" height="12" fill="#334155" rx="1.5" stroke="#0f172a" stroke-width="1" />
    <line x1="6" y1="28" x2="12" y2="28" stroke="#020617" />
    <line x1="6" y1="31" x2="12" y2="31" stroke="#020617" />
    <line x1="6" y1="34" x2="12" y2="34" stroke="#020617" />
    <!-- Spotlight light beam -->
    <polygon points="50,30 64,24 64,36" fill="rgba(255,179,92,0.25)" />
    <!-- Headlight casing -->
    <path d="M 48 27 L 53 27 L 51 32 Z" fill="#ffb35c" stroke="#b45309" stroke-width="1" />
    <circle cx="50" cy="29" r="1.5" fill="#ffffff" />
  </svg>`,

  drillBit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <defs>
      <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#94a3b8" />
        <stop offset="45%" stop-color="#475569" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
    </defs>
    <!-- Heavy mounting block bracket -->
    <rect x="0" y="6" width="6" height="20" fill="#334155" stroke="#0f172a" stroke-width="1.5" />
    <circle cx="3" cy="16" r="2.5" fill="#64748b" />
    <!-- Main gear socket collar -->
    <rect x="6" y="9" width="4" height="14" fill="#475569" stroke="#0f172a" stroke-width="1.5" />
    <!-- Reinforced Cone -->
    <path d="M 10 5 L 29 16 L 10 27 Z" fill="url(#metalGrad)" stroke="#0f172a" stroke-width="2" />
    <!-- Flutes and helical grooving -->
    <path d="M 10 8 Q 19 16 10 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" />
    <path d="M 13 10 Q 23 16 13 22" fill="none" stroke="#ffffff" stroke-width="1.5" />
    <path d="M 17 13 Q 27 16 17 19" fill="none" stroke="#94a3b8" stroke-width="1.5" />
    <!-- Tungsten tip ring -->
    <polygon points="28,14 32,16 28,18" fill="#38bdf8" stroke="#0284c7" stroke-width="0.75" />
  </svg>`,

  dirt: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#3a2e22" />
    <!-- Soil strata lines -->
    <path d="M 0 8 L 15 15 L 25 5 L 40 12" fill="none" stroke="#2a1f16" stroke-width="2.5" />
    <path d="M 0 25 L 20 32 L 40 22" fill="none" stroke="#2a1f16" stroke-width="2.5" />
    <!-- Little soil rocks/detritus -->
    <polygon points="6,24 10,21 12,25 8,27" fill="#4d3d2e" stroke="#211810" stroke-width="1" />
    <polygon points="28,12 32,10 34,14 30,16" fill="#4d3d2e" stroke="#211810" stroke-width="1" />
    <polygon points="18,30 23,28 24,33 19,34" fill="#2a1f16" />
    <!-- Small grain specs -->
    <circle cx="5" cy="5" r="1" fill="#4d3d2e" />
    <circle cx="35" cy="35" r="1.2" fill="#4d3d2e" />
    <circle cx="16" cy="18" r="1" fill="#4d3d2e" />
  </svg>`,

  rock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#25252b" />
    <!-- Fractured crystalline cracks -->
    <path d="M 0 0 L 14 12 L 20 0 M 14 12 L 26 22 L 40 16 M 26 22 L 22 40 M 14 12 L 0 28 L 22 40" fill="none" stroke="#141417" stroke-width="2.5" />
    <!-- Facet highlight and shading -->
    <polygon points="14,12 26,22 22,40 0,28" fill="rgba(255,255,255,0.04)" />
    <polygon points="26,22 40,16 40,40 22,40" fill="rgba(0,0,0,0.22)" />
    <!-- Little shiny flecks -->
    <polygon points="8,8 10,6 12,9 9,10" fill="#64748b" opacity="0.3" />
    <polygon points="32,28 35,26 36,30 33,31" fill="#475569" opacity="0.4" />
  </svg>`,

  gas: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <!-- Unrevealed gas looks identical to normal dirt to preserve stealth -->
    <rect width="40" height="40" fill="#3a2e22" />
    <path d="M 0 8 L 15 15 L 25 5 L 40 12" fill="none" stroke="#2a1f16" stroke-width="2.5" />
    <path d="M 0 25 L 20 32 L 40 22" fill="none" stroke="#2a1f16" stroke-width="2.5" />
    <polygon points="6,24 10,21 12,25 8,27" fill="#4d3d2e" stroke="#211810" stroke-width="1" />
  </svg>`,

  gasRevealed: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <!-- Revealed gas pocket showing toxic venting clouds -->
    <rect width="40" height="40" fill="#2c2018" />
    <path d="M 0 8 L 15 15 L 25 5 L 40 12" fill="none" stroke="#1b120c" stroke-width="2" />
    <!-- Pulsing gas cloud pattern -->
    <path d="M 8 16 Q 20 4 32 16 T 20 36 Z" fill="rgba(180,60,200,0.4)" stroke="rgba(180,60,200,0.8)" stroke-width="2.5" />
    <circle cx="20" cy="18" r="6" fill="rgba(180,60,200,0.6)" />
    <!-- Danger indicator -->
    <path d="M 20 12 L 23 18 H 17 Z" fill="#facc15" />
    <rect x="19" y="15" width="2" height="2" fill="#000" />
  </svg>`,

  // Default mineral matrix with detailed crystals protruding
  cmdty_silicate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#3a2e22" />
    <path d="M 0 20 Q 20 10 40 25 M 15 0 Q 22 20 10 40" fill="none" stroke="#2a1f16" stroke-width="4.5" />
    <!-- Multi-faceted gray silicate crystals -->
    <polygon points="8,14 16,10 20,18 12,22 6,18" fill="#94a3b8" stroke="#475569" stroke-width="1" />
    <polygon points="12,10 16,10 16,18 12,18" fill="#cbd5e1" />
    <polygon points="22,24 30,20 32,28 24,30" fill="#64748b" stroke="#334155" stroke-width="1" />
    <polygon points="26,20 30,20 30,28 26,28" fill="#94a3b8" />
  </svg>`,

  cmdty_ice_water: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#2d3748" />
    <path d="M 0 20 Q 20 10 40 25 M 15 0 Q 22 20 10 40" fill="none" stroke="#1a202c" stroke-width="4" />
    <!-- Glacial Ice crystals -->
    <polygon points="12,6 26,10 22,24 8,18" fill="#bae6fd" stroke="#0284c7" stroke-width="1.5" />
    <polygon points="12,6 20,10 18,24 10,18" fill="#e0f2fe" />
    <polygon points="20,20 34,16 30,30 16,28" fill="#38bdf8" stroke="#0369a1" stroke-width="1" opacity="0.8" />
    <polygon points="20,20 28,16 26,30 18,28" fill="#bae6fd" opacity="0.8" />
  </svg>`,

  cmdty_ore_iron: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#3a2e22" />
    <path d="M 0 20 Q 20 10 40 25 M 15 0 Q 22 20 10 40" fill="none" stroke="#251b12" stroke-width="4" />
    <!-- Heavy textured iron blobs -->
    <rect x="8" y="10" width="10" height="10" rx="3" fill="#c8a878" stroke="#785830" stroke-width="1.5" />
    <circle cx="11" cy="13" r="1.5" fill="#f5e0b8" />
    <rect x="22" y="18" width="12" height="10" rx="4" fill="#a08058" stroke="#583818" stroke-width="1.5" />
    <circle cx="26" cy="22" r="1.8" fill="#c8a878" />
  </svg>`,

  cmdty_ore_copper: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#2a2418" />
    <path d="M 0 20 Q 20 10 40 25 M 15 0 Q 22 20 10 40" fill="none" stroke="#1a140c" stroke-width="4" />
    <!-- Malachite / verdigris copper — round botryoidal nodules, green-teal palette -->
    <circle cx="14" cy="16" r="7" fill="#0f766e" stroke="#134e4a" stroke-width="1.5" />
    <circle cx="14" cy="16" r="4.5" fill="#2dd4bf" opacity="0.85" />
    <circle cx="12" cy="14" r="1.8" fill="#99f6e4" />
    <circle cx="28" cy="24" r="8" fill="#115e59" stroke="#0f766e" stroke-width="1.5" />
    <circle cx="28" cy="24" r="5" fill="#14b8a6" opacity="0.9" />
    <circle cx="26" cy="22" r="2" fill="#5eead4" />
    <path d="M 8 30 Q 20 26 32 32" fill="none" stroke="#0d9488" stroke-width="2" opacity="0.6" />
  </svg>`,

  cmdty_ore_bronzium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#2d3238" />
    <path d="M 0 20 Q 20 10 40 25 M 15 0 Q 22 20 10 40" fill="none" stroke="#1a1f24" stroke-width="4" />
    <!-- Nickel ore — cool gray industrial ingot plates, angular not round -->
    <rect x="7" y="9" width="14" height="10" rx="1" fill="url(#nickelPlateGrad)" stroke="#475569" stroke-width="1.5" transform="rotate(-8 14 14)" />
    <rect x="9" y="11" width="6" height="6" fill="#e2e8f0" opacity="0.45" transform="rotate(-8 14 14)" />
    <polygon points="22,18 34,14 32,28 20,30" fill="url(#nickelShardGrad)" stroke="#64748b" stroke-width="1.5" />
    <polygon points="22,18 28,14 26,28 20,30" fill="#cbd5e1" opacity="0.55" />
    <line x1="24" y1="16" x2="30" y2="26" stroke="#f8fafc" stroke-width="1" opacity="0.5" />
    <defs>
      <linearGradient id="nickelPlateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f1f5f9" />
        <stop offset="45%" stop-color="#94a3b8" />
        <stop offset="100%" stop-color="#475569" />
      </linearGradient>
      <linearGradient id="nickelShardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#cbd5e1" />
        <stop offset="50%" stop-color="#64748b" />
        <stop offset="100%" stop-color="#334155" />
      </linearGradient>
    </defs>
  </svg>`,

  cmdty_ore_silverium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#3a2e22" />
    <path d="M 0 20 Q 20 10 40 25 M 15 0 Q 22 20 10 40" fill="none" stroke="#251b12" stroke-width="4" />
    <!-- Silver ore shards -->
    <polygon points="18,6 30,16 20,30 8,20" fill="url(#silverDetailedGrad)" stroke="#475569" stroke-width="1.5" />
    <polygon points="18,6 24,16 20,30 14,20" fill="#ffffff" opacity="0.65" />
    <polygon points="24,16 30,16 20,30" fill="#94a3b8" opacity="0.5" />
    <defs>
      <linearGradient id="silverDetailedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="40%" stop-color="#cbd5e1" />
        <stop offset="100%" stop-color="#334155" />
      </linearGradient>
    </defs>
  </svg>`,

  cmdty_ore_goldium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#36291e" />
    <path d="M 0 20 Q 20 10 40 25 M 15 0 Q 22 20 10 40" fill="none" stroke="#251b12" stroke-width="4.5" />
    <!-- Rich heavy gold nugget cluster -->
    <path d="M 12 12 Q 20 6 28 14 T 20 30 T 8 20 Z" fill="url(#goldDetailedGrad)" stroke="#854d0e" stroke-width="2" />
    <!-- Golden reflection sparks -->
    <polygon points="12,12 20,10 22,18 14,20" fill="#fef08a" opacity="0.75" />
    <polygon points="20,10 28,14 24,22 22,18" fill="#eab308" opacity="0.6" />
    <circle cx="16" cy="14" r="2.5" fill="#ffffff" opacity="0.9" />
    <defs>
      <linearGradient id="goldDetailedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fde047" />
        <stop offset="50%" stop-color="#ca8a04" />
        <stop offset="100%" stop-color="#713f12" />
      </linearGradient>
    </defs>
  </svg>`,

  cmdty_ore_platinium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#2d3748" />
    <path d="M 0 20 Q 20 10 40 25" fill="none" stroke="#1a202c" stroke-width="4" />
    <!-- Platinum geometric blades -->
    <polygon points="20,6 32,16 20,32 8,16" fill="url(#platDetailedGrad)" stroke="#38bdf8" stroke-width="1.5" />
    <polygon points="20,6 26,16 20,32 14,16" fill="#e0f2fe" />
    <polygon points="26,16 32,16 20,32" fill="#0284c7" opacity="0.6" />
    <defs>
      <linearGradient id="platDetailedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="35%" stop-color="#bae6fd" />
        <stop offset="100%" stop-color="#0369a1" />
      </linearGradient>
    </defs>
  </svg>`,

  cmdty_ore_einsteinium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#282236" />
    <path d="M 0 20 Q 20 10 40 25" fill="none" stroke="#120c1c" stroke-width="4.5" />
    <!-- Shimmering dark matter crystals -->
    <polygon points="20,6 30,16 20,30 10,16" fill="url(#einsDetailedGrad)" stroke="#d946ef" stroke-width="2" />
    <polygon points="20,6 25,16 20,30 15,16" fill="#fae8ff" />
    <!-- Energy spark center -->
    <circle cx="20" cy="16" r="4.5" fill="#ffffff" />
    <defs>
      <linearGradient id="einsDetailedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f0abfc" />
        <stop offset="50%" stop-color="#c084fc" />
        <stop offset="100%" stop-color="#581c87" />
      </linearGradient>
    </defs>
  </svg>`,

  cmdty_gem_emerald: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#223626" />
    <path d="M 0 20 Q 20 10 40 25" fill="none" stroke="#0c1c0f" stroke-width="4" />
    <!-- Highly faceted hex emerald crystals -->
    <polygon points="20,4 30,10 30,24 20,30 10,24 10,10" fill="url(#emDetailedGrad)" stroke="#10b981" stroke-width="2" />
    <polygon points="20,8 26,12 26,22 20,26 14,22 14,12" fill="#a7f3d0" opacity="0.65" />
    <polygon points="20,8 20,26" stroke="#059669" stroke-width="1.5" />
    <defs>
      <linearGradient id="emDetailedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#34d399" />
        <stop offset="50%" stop-color="#059669" />
        <stop offset="100%" stop-color="#064e3b" />
      </linearGradient>
    </defs>
  </svg>`,

  cmdty_gem_ruby: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#362222" />
    <path d="M 0 20 Q 20 10 40 25" fill="none" stroke="#1c0c0c" stroke-width="4" />
    <!-- Rich ruby cluster -->
    <polygon points="20,4 30,12 26,28 14,28 10,12" fill="url(#rubyDetailedGrad)" stroke="#ef4444" stroke-width="2" />
    <polygon points="20,8 26,14 23,24 17,24 14,14" fill="#fecaca" opacity="0.6" />
    <polygon points="20,4 20,28" stroke="#dc2626" stroke-width="1.5" />
    <defs>
      <linearGradient id="rubyDetailedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f87171" />
        <stop offset="50%" stop-color="#dc2626" />
        <stop offset="100%" stop-color="#7f1d1d" />
      </linearGradient>
    </defs>
  </svg>`,

  cmdty_gem_diamond: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#222f3d" />
    <path d="M 0 20 Q 20 10 40 25" fill="none" stroke="#0f172a" stroke-width="4" />
    <!-- Prismatic sky-blue diamond prisms -->
    <polygon points="20,5 31,14 20,29 9,14" fill="url(#diaDetailedGrad)" stroke="#38bdf8" stroke-width="2" />
    <polygon points="20,5 26,14 20,21 14,14" fill="#ffffff" />
    <polygon points="26,14 31,14 20,29" fill="#0284c7" opacity="0.6" />
    <defs>
      <linearGradient id="diaDetailedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="40%" stop-color="#bae6fd" />
        <stop offset="100%" stop-color="#0369a1" />
      </linearGradient>
    </defs>
  </svg>`,

  cmdty_exotic_amazonite: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <rect width="40" height="40" fill="#1b2830" />
    <path d="M 0 20 Q 20 10 40 25" fill="none" stroke="#091216" stroke-width="4.5" />
    <!-- Shimmering turquoise branches -->
    <polygon points="10,10 26,8 30,24 16,30 8,22" fill="url(#amzDetailedGrad)" stroke="#00f5ff" stroke-width="2" />
    <polygon points="14,14 22,12 24,20 18,22" fill="#e0fefe" opacity="0.7" />
    <!-- Glowing internal spark -->
    <circle cx="20" cy="18" r="3" fill="#ffffff" />
    <defs>
      <linearGradient id="amzDetailedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#22d3ee" />
        <stop offset="50%" stop-color="#06b6d4" />
        <stop offset="100%" stop-color="#4f46e5" />
      </linearGradient>
    </defs>
  </svg>`,
};

// Synchronously load SVGs into Image structures (browser only — guarded so the module imports
// cleanly under Node, where the static check-ui-screen-imports harness evaluates it).
const IMAGES = {};
if (typeof Image !== 'undefined') {
  for (const key in SVG_TEMPLATES) {
    const img = new Image();
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(SVG_TEMPLATES[key]);
    IMAGES[key] = img;
  }
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.drill-screen {
  display: flex; flex-direction: row; gap: 20px; width: 98vw; max-width: 1440px; height: 86vh;
  margin: 0 auto; padding: 15px; box-sizing: border-box; pointer-events: auto; justify-content: center;
  align-items: stretch;
}
.drill-title { font-family:var(--mono); letter-spacing:.24em; font-size:16px; color:var(--accent);
  text-shadow:0 0 16px rgba(57,208,255,.4); text-transform:uppercase; margin-bottom: 4px; }
.drill-side-panel {
  width: 280px; flex-shrink: 0; background: rgba(8, 12, 20, 0.95);
  border: 1px solid var(--panel-edge); border-radius: 8px; padding: 16px;
  display: flex; flex-direction: column; gap: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);
  font-family: var(--mono); color: var(--ink-dim); overflow-y: auto; box-sizing: border-box;
}
.drill-side-panel .panel-section {
  display: flex; flex-direction: column; gap: 8px;
  border-bottom: 1px solid rgba(57, 208, 255, 0.1); padding-bottom: 14px;
}
.drill-side-panel .panel-section:last-child {
  border-bottom: none;
}
.drill-side-panel .sec-title {
  font-size: 10px; color: var(--accent); letter-spacing: 0.12em; text-transform: uppercase;
  text-shadow: 0 0 8px rgba(57,208,255,0.25); display: flex; align-items: center; gap: 6px;
  margin-bottom: 4px; border-bottom: 1px dashed rgba(57, 208, 255, 0.15); padding-bottom: 4px;
}
.drill-side-panel .readout-row {
  display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;
}
.drill-side-panel .readout-row .lbl { color: var(--ink-mute); }
.drill-side-panel .readout-row .val { color: var(--accent); }
.drill-side-panel .readout-row .val.good { color: #22c55e; }
.drill-side-panel .readout-row .val.warn { color: #f97316; }
.drill-side-panel .readout-row .val.bad { color: #ef4444; }

.drill-center-panel {
  flex-grow: 1; display: flex; flex-direction: column; gap: 12px; align-items: center;
  justify-content: center; min-width: 0;
}
.drill-canvas-wrap {
  position: relative; border: 1px solid var(--panel-edge); border-radius: 8px;
  background: linear-gradient(180deg,#0a0d14 0%,#050709 100%); overflow: hidden;
  box-shadow: 0 0 45px rgba(0,0,0,0.8) inset; width: 100%; max-width: 900px;
}
.drill-canvas {
  display: block; width: 100%; height: auto; image-rendering: pixelated;
}
.sonar-canvas {
  background: rgba(4, 6, 12, 0.95); border: 1px solid rgba(57, 208, 255, 0.15);
  border-radius: 6px; display: block; margin: 4px auto 0; width: 100%; height: auto; max-width: 246px;
}
.drill-hud { display:flex; gap:18px; font-family:var(--mono); font-size:12px; color:var(--ink-dim);
  letter-spacing:.06em; align-items:center; flex-wrap:wrap; justify-content:center; }
.drill-hud .v { color:var(--accent); }
.drill-hud .warn { color:#ff8a4a; }
.drill-legend {
  display:flex; flex-direction:column; gap:8px; width:100%; max-width:900px;
  font-family:var(--mono); color:var(--ink-mute);
}
.drill-legend-title {
  font-size:10px; color:var(--accent); letter-spacing:0.14em; text-transform:uppercase;
  text-align:center; text-shadow:0 0 8px rgba(57,208,255,0.2);
}
.drill-legend-grid {
  display:flex; flex-wrap:wrap; gap:10px 14px; justify-content:center; align-items:center;
  padding:10px 12px; border:1px solid rgba(57,208,255,0.12); border-radius:6px;
  background:rgba(6,10,18,0.55);
}
.drill-legend-item {
  display:inline-flex; align-items:center; gap:6px; font-size:10px; color:var(--ink-dim);
  padding:3px 6px; border-radius:4px; background:rgba(255,255,255,0.02);
}
.drill-legend-item.warn { color:#ffb35c; }
.drill-legend-item.locked { color:#ff8a4a; }
.drill-legend-icon {
  width:22px; height:22px; border-radius:2px; border:1px solid rgba(57,208,255,0.18);
  image-rendering:pixelated; flex-shrink:0; background:#0a0d14;
}
.drill-legend-arrow { font-size:9px; color:var(--ink-mute); opacity:0.7; }
.drill-legend-label { letter-spacing:0.04em; white-space:nowrap; }
.drill-legend-badge {
  font-size:8px; font-weight:bold; letter-spacing:0.08em; padding:1px 4px; border-radius:3px;
  background:rgba(57,208,255,0.12); color:var(--accent); border:1px solid rgba(57,208,255,0.22);
}
.drill-legend-badge.bad {
  background:rgba(255,92,92,0.14); color:#ff8a4a; border-color:rgba(255,92,92,0.35);
}
.drill-legend-note {
  font-size:10px; color:var(--ink-mute); font-style:italic; letter-spacing:0.03em;
}
.drill-foot { display:flex; gap:10px; justify-content:center; margin-top:4px; }
.drill-foot button.sf-btn { width:auto; padding:9px 22px; }

/* Custom Toasts and Overlay alerts */
.drill-toast-container { position:absolute; right:12px; top:12px; display:flex; flex-direction:column; gap:8px; pointer-events:none; z-index:100; max-width:280px; }
.drill-item-toast { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:6px; background:rgba(10,15,26,0.94); border:1px solid rgba(57,208,255,0.25); box-shadow:0 6px 20px rgba(0,0,0,0.6); font-family:var(--mono); font-size:12px; color:#d7e6ff; transform:translateX(130%); transition:transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s; opacity:0; }
.drill-item-toast.show { transform:translateX(0); opacity:1; }
.drill-item-toast.warn { border-color:#ffb35c; color:#ffb35c; }
.drill-item-toast.bad { border-color:#ff5c5c; color:#ff5c5c; }
.drill-item-toast .icon { width:22px; height:22px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.drill-item-toast .icon img { width:100%; height:100%; object-fit:contain; }
.drill-item-toast .details { display:flex; flex-direction:column; gap:2px; }
.drill-item-toast .value { font-size:10px; color:#39d0ff; font-weight:bold; }

/* Drill Extraction Summary Modal */
.drill-summary-modal {
  position: absolute;
  left: 0; top: 0; width: 100%; height: 100%;
  background: rgba(4, 6, 10, 0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  opacity: 0; transition: opacity 0.22s ease-out;
  pointer-events: auto;
}
.drill-summary-modal.active {
  opacity: 1;
}
.drill-summary-box {
  background: rgba(10, 14, 23, 0.96);
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  padding: 24px;
  min-width: 380px; max-width: 480px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.85);
  display: flex; flex-direction: column; gap: 16px;
  transform: scale(0.92); transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.drill-summary-modal.active .drill-summary-box {
  transform: scale(1);
}
.drill-summary-box .title {
  font-family: var(--mono);
  font-size: 13px;
  letter-spacing: .16em;
  color: var(--accent);
  text-shadow: 0 0 10px rgba(57,208,255,0.3);
  text-align: center;
  border-bottom: 1px solid rgba(57,208,255,0.15);
  padding-bottom: 10px;
  text-transform: uppercase;
}
.drill-summary-box .item-list {
  display: flex; flex-direction: column; gap: 8px;
  max-height: 240px; overflow-y: auto;
}
.drill-summary-box .item-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; border-bottom: 1px dashed rgba(255,255,255,0.06);
}
.drill-summary-box .item-row .left {
  display: flex; align-items: center; gap: 10px;
}
.drill-summary-box .item-row .icon {
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
}
.drill-summary-box .item-row .icon img {
  width: 100%; height: 100%; object-fit: contain;
}
.drill-summary-box .item-row .name {
  font-family: var(--mono); font-size: 12px; color: var(--ink-dim);
}
.drill-summary-box .item-row .value {
  font-family: var(--mono); font-size: 12px; color: var(--accent);
}
.drill-summary-box .total-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 8px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);
  font-family: var(--mono); font-size: 12px; font-weight: bold; color: #ffffff;
}
.drill-summary-box .total-row .val {
  color: var(--accent);
}
.drill-summary-box button.sf-btn {
  margin-top: 8px; align-self: center; width: 140px;
}
`;
  document.head.appendChild(s);
}

export const drillScreen = {
  id: 'drill',

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'drill-screen';

    // ==========================================
    // 1. LEFT TELEMETRY PANEL
    // ==========================================
    const leftPanel = document.createElement('div');
    leftPanel.className = 'drill-side-panel left-panel';
    
    // Header
    const leftHeader = document.createElement('div');
    leftHeader.className = 'panel-section';
    leftHeader.innerHTML = `
      <div class="sec-title">◆ DOCK LINK DIAGNOSTICS ◆</div>
      <div class="readout-row"><span class="lbl">STATUS</span><span class="val good">CONNECTED</span></div>
      <div class="readout-row"><span class="lbl">TENSION</span><span class="val" data-tension>OK (18 N)</span></div>
      <div class="readout-row"><span class="lbl">POWER LINK</span><span class="val good" data-power>100%</span></div>
    `;
    leftPanel.appendChild(leftHeader);
    
    // Sonar section
    const sonarSec = document.createElement('div');
    sonarSec.className = 'panel-section';
    sonarSec.innerHTML = `
      <div class="sec-title">◆ SEISMIC RADAR SWEEP ◆</div>
    `;
    const sonarCanvas = document.createElement('canvas');
    sonarCanvas.className = 'sonar-canvas';
    sonarCanvas.width = 240;
    sonarCanvas.height = 130;
    sonarSec.appendChild(sonarCanvas);
    leftPanel.appendChild(sonarSec);
    const sonarCtx = sonarCanvas.getContext('2d');
    
    // Controls list
    const controlSec = document.createElement('div');
    controlSec.className = 'panel-section';
    controlSec.innerHTML = `
      <div class="sec-title">◆ FLIGHT CONTROL ASSIST ◆</div>
      <div style="font-size:10px; color:var(--ink-mute); line-height:1.4;">
        [WASD / ARROWS] Pilot crawler<br>
        [W / UP] Fly up shaft to exit<br>
        [ESC] Manual eject crawler<br>
        <span style="color:var(--accent); display:block; margin-top:5px;">Note: Rare crystals require upgraded drill tier head modules.</span>
      </div>
    `;
    leftPanel.appendChild(controlSec);
    wrap.appendChild(leftPanel);

    // ==========================================
    // 2. CENTER PANEL (PRIMARY CANVAS)
    // ==========================================
    const centerPanel = document.createElement('div');
    centerPanel.className = 'drill-center-panel';
    
    const title = document.createElement('div');
    title.className = 'drill-title';
    title.textContent = '◆ DRILL FEED MONITOR ◆';
    centerPanel.appendChild(title);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'drill-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'drill-canvas';
    canvas.width = COLS * TILE;
    canvas.height = 18 * TILE;
    canvasWrap.appendChild(canvas);
    
    const toastContainer = document.createElement('div');
    toastContainer.className = 'drill-toast-container';
    canvasWrap.appendChild(toastContainer);
    centerPanel.appendChild(canvasWrap);
    
    // HUD row
    const hud = document.createElement('div');
    hud.className = 'drill-hud';
    hud.innerHTML =
      '<span>YIELD: <span class="v" data-yield>0</span></span>' +
      '<span>GAS HITS: <span class="warn" data-gas>0</span></span>' +
      '<span>CARGO: <span class="v" data-cargo>0%</span></span>' +
      '<span>TEMP: <span class="v" data-temp>0%</span></span>';
    centerPanel.appendChild(hud);

    // Legend — uses the same SVG tile icons as the field, scoped to this deposit.
    const legend = document.createElement('div');
    legend.className = 'drill-legend';
    const legendTitle = document.createElement('div');
    legendTitle.className = 'drill-legend-title';
    legendTitle.textContent = '◆ DEPOSIT TILE KEY ◆';
    legend.appendChild(legendTitle);
    const legendGrid = document.createElement('div');
    legendGrid.className = 'drill-legend-grid';
    legendGrid.setAttribute('data-drill-legend-grid', '');
    legend.appendChild(legendGrid);
    centerPanel.appendChild(legend);
    
    // Exit button
    const foot = document.createElement('div');
    foot.className = 'drill-foot';
    const exitBtn = document.createElement('button');
    exitBtn.className = 'sf-btn';
    exitBtn.textContent = 'Eject (ESC)';
    foot.appendChild(exitBtn);
    centerPanel.appendChild(foot);
    
    wrap.appendChild(centerPanel);

    // ==========================================
    // 3. RIGHT PANEL (ANALYSIS & MANIFEST)
    // ==========================================
    const rightPanel = document.createElement('div');
    rightPanel.className = 'drill-side-panel right-panel';
    
    const scanSec = document.createElement('div');
    scanSec.className = 'panel-section';
    scanSec.innerHTML = `
      <div class="sec-title">◆ SPECTRAL TILE SCAN ◆</div>
      <div id="drill-scan-target" style="font-size:11px; line-height:1.4; color:var(--ink-dim);">
        TARGETING: SCANNING STRATA...
      </div>
    `;
    rightPanel.appendChild(scanSec);
    
    const manifestSec = document.createElement('div');
    manifestSec.className = 'panel-section';
    manifestSec.innerHTML = `
      <div class="sec-title">◆ RUN EXTRACTION LOG ◆</div>
      <div id="drill-cargo-manifest-list" style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; padding-right:4px;">
        <div style="font-size:10px; color:var(--ink-mute);">No minerals extracted.</div>
      </div>
    `;
    rightPanel.appendChild(manifestSec);
    
    const engineSec = document.createElement('div');
    engineSec.className = 'panel-section';
    engineSec.innerHTML = `
      <div class="sec-title">◆ RIG ENGINE MODULE ◆</div>
      <div class="readout-row"><span class="lbl">DRILL HEAD</span><span class="val" data-drill-tier>BASIC MK1</span></div>
      <div class="readout-row"><span class="lbl">DRILL RATE</span><span class="val" data-drill-dps>8 HP/s</span></div>
    `;
    rightPanel.appendChild(engineSec);
    
    wrap.appendChild(rightPanel);
    rootEl.appendChild(wrap);

    const state = ctx.state;
    const drillSys = ctx.drill || (ctx.registry && ctx.registry.get('drill'));
    drillScreen._drillTier = drillSys ? drillSys.getDrillTier() : 1;
    drillScreen._drillDps = drillSys ? drillSys.getDrillDPS() : 8;

    // Toast triggers helper
    function triggerToast(text, kind = 'info', commodityId = null, qty = 0) {
      const t = document.createElement('div');
      t.className = `drill-item-toast ${kind}`;
      
      const iconWrap = document.createElement('div');
      iconWrap.className = 'icon';
      if (commodityId && IMAGES[commodityId]) {
        const img = document.createElement('img');
        img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(SVG_TEMPLATES[commodityId]);
        iconWrap.appendChild(img);
      } else {
        iconWrap.textContent = kind === 'bad' ? '⚠' : (kind === 'warn' ? '⚙' : '💎');
      }
      t.appendChild(iconWrap);
      
      const details = document.createElement('div');
      details.className = 'details';
      
      const mainText = document.createElement('span');
      mainText.textContent = text;
      details.appendChild(mainText);
      
      if (qty > 0 && commodityId) {
        const valueText = document.createElement('span');
        valueText.className = 'value';
        const basePrice = COMMODITY_BY_ID.get(commodityId)?.basePrice || 0;
        valueText.textContent = `Value: +${qty * basePrice} Cr`;
        details.appendChild(valueText);
      }
      t.appendChild(details);
      
      toastContainer.appendChild(t);
      setTimeout(() => t.classList.add('show'), 10);
      
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 250);
      }, 3000);
    }

    // ---- input (local; sim is paused so we own keys) ----
    const held = { left: false, right: false, up: false, down: false };
    
    let hoveredTile = null;
    const onMouseMove = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) * (canvas.width / rect.width);
      const my = (ev.clientY - rect.top) * (canvas.height / rect.height);
      const col = Math.floor(mx / TILE);
      const row = Math.floor((my + viewY) / TILE);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
        hoveredTile = { col, row, mouseX: mx, mouseY: my };
      } else {
        hoveredTile = null;
      }
    };
    const onMouseLeave = () => {
      hoveredTile = null;
    };
    const onKeyDown = (ev) => {
      const c = ev.code;
      if (c === 'ArrowLeft' || c === 'KeyA') { held.left = true; ev.preventDefault(); }
      else if (c === 'ArrowRight' || c === 'KeyD') { held.right = true; ev.preventDefault(); }
      else if (c === 'ArrowUp' || c === 'KeyW') { held.up = true; ev.preventDefault(); }
      else if (c === 'ArrowDown' || c === 'KeyS') { held.down = true; ev.preventDefault(); }
      else if (c === 'Escape') { exit(); }
    };
    const onKeyUp = (ev) => {
      const c = ev.code;
      if (c === 'ArrowLeft' || c === 'KeyA') held.left = false;
      else if (c === 'ArrowRight' || c === 'KeyD') held.right = false;
      else if (c === 'ArrowUp' || c === 'KeyW') held.up = false;
      else if (c === 'ArrowDown' || c === 'KeyS') held.down = false;
    };
    exitBtn.addEventListener('click', exit);

    function exit() {
      const d = state.drill;
      const total = d ? Object.values(d.yieldLog).reduce((a, b) => a + b, 0) : 0;
      
      // Phase 1: show overlay fade to black
      triggerDockFade(true);
      
      const camCtrl = state.render && state.render.cameraCtrl;
      if (camCtrl && typeof camCtrl.pushZoom === 'function') {
        camCtrl.pushZoom(0.18, 0.7); // back out zoom
      }
      
      setTimeout(() => {
        // Phase 2: pop screen
        if (ctx.screenManager) ctx.screenManager.popScreen();
        
        // Show summary modal if anything was mined
        if (d && total > 0) {
          showDrillSummaryModal(d.yieldLog);
        }
        
        // Phase 3: fade back in
        setTimeout(() => {
          triggerDockFade(false);
        }, 50);
      }, 400);
    }

    // ---- render + tick loop (rAF; we own time since sim is paused) ----
    const ctx2d = canvas.getContext('2d');
    let last = performance.now();
    let rafId = 0;
    let drillTheta = 0;
    let viewY = undefined;
    let particles = [];

    const gasHitFlash = { t: 0 };
    const yieldFlash = { t: 0, text: '' };

    const unsubs = [];

    // Register event subscriptions
    unsubs.push(ctx.bus.on('drill:yield', (p) => {
      const name = commodityName(p.commodityId);
      yieldFlash.t = 0.9; 
      yieldFlash.text = '+' + p.qty + ' ' + name;
      triggerToast(`+${p.qty} ${name} extracted`, 'info', p.commodityId, p.qty);
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'loot_collect' });
    }));

    unsubs.push(ctx.bus.on('drill:gasHit', (p) => {
      gasHitFlash.t = 0.6;
      triggerToast('⚠ GAS POCKET! Hull damaged', 'bad');
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'shield_break' });
    }));

    unsubs.push(ctx.bus.on('drill:warn', (p) => {
      triggerToast(p.text, 'warn');
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'mining_core_fizzle' });
    }));

    unsubs.push(ctx.bus.on('drill:spark', (p) => {
      if (!state.drill) return;
      const d = state.drill;
      // Spawn particles at the drill head interface
      const sx = p.col * TILE + TILE / 2;
      const sy = p.row * TILE + TILE / 2;
      const dir = d.avatar.faceDir || 'down';
      
      let cx = sx;
      let cy = sy;
      let vx = 0, vy = 0;
      
      if (dir === 'right') {
        cx = p.col * TILE;
        vy = (Math.random() - 0.5) * 35;
        vx = -15 - Math.random() * 25;
      } else if (dir === 'left') {
        cx = p.col * TILE + TILE;
        vy = (Math.random() - 0.5) * 35;
        vx = 15 + Math.random() * 25;
      } else if (dir === 'down') {
        cy = p.row * TILE;
        vx = (Math.random() - 0.5) * 35;
        vy = -15 - Math.random() * 25;
      }
      
      let color = '#d7e6ff';
      if (p.type === 'dirt') color = '#a78262';
      else if (p.type === 'rock') color = '#64748b';
      else if (p.type === 'gas') color = '#c084fc';
      else if (p.type === 'vein' && p.ore) {
        color = ORE_SPARK_COLOR[p.ore] || '#ffd700';
      }
      
      particles.push({
        x: cx,
        y: cy,
        vx: vx,
        vy: vy,
        color: color,
        size: 1.5 + Math.random() * 2,
        life: 0.2 + Math.random() * 0.15,
        maxLife: 0.35
      });
    }));

    function drawSonar(d) {
      if (!sonarCtx) return;
      const w = sonarCanvas.width;
      const h = sonarCanvas.height;
      sonarCtx.clearRect(0, 0, w, h);
      
      const cx = w / 2;
      const cy = h / 2;
      
      // Draw grid rings
      sonarCtx.strokeStyle = 'rgba(57, 208, 255, 0.08)';
      sonarCtx.lineWidth = 1;
      for (let r = 25; r <= 65; r += 20) {
        sonarCtx.beginPath();
        sonarCtx.arc(cx, cy, r, 0, Math.PI * 2);
        sonarCtx.stroke();
      }
      // Grid crosshairs
      sonarCtx.beginPath();
      sonarCtx.moveTo(cx - 70, cy); sonarCtx.lineTo(cx + 70, cy);
      sonarCtx.moveTo(cx, cy - 60); sonarCtx.lineTo(cx, cy + 60);
      sonarCtx.stroke();
      
      // Draw rotating radar sweep line
      const sweepAngle = (performance.now() * 0.0035) % (Math.PI * 2);
      
      // Draw sweep arc fade
      sonarCtx.fillStyle = 'rgba(57, 208, 255, 0.03)';
      sonarCtx.beginPath();
      sonarCtx.moveTo(cx, cy);
      sonarCtx.arc(cx, cy, 65, sweepAngle - 0.4, sweepAngle);
      sonarCtx.closePath();
      sonarCtx.fill();
      
      // Sweep leading line
      sonarCtx.strokeStyle = 'rgba(57, 208, 255, 0.35)';
      sonarCtx.beginPath();
      sonarCtx.moveTo(cx, cy);
      sonarCtx.lineTo(cx + Math.cos(sweepAngle) * 65, cy + Math.sin(sweepAngle) * 65);
      sonarCtx.stroke();
      
      // Draw detected ore deposits nearby (within 5-tile radius)
      if (d && d.field) {
        const ar = d.avatar.row;
        const ac = d.avatar.col;
        
        for (let dc = -4; dc <= 4; dc++) {
          for (let dr = -4; dr <= 4; dr++) {
            const tc = ac + dc;
            const tr = ar + dr;
            if (tc >= 0 && tc < COLS && tr >= 0 && tr < ROWS) {
              const tile = d.field[tc][tr];
              if (tile && tile.type === 'vein' && tile.ore) {
                // Calculate position relative to center of radar
                const px = cx + dc * 14;
                const py = cy + dr * 14;
                
                // Only show if inside radar range circle
                const dist = Math.hypot(dc * 14, dr * 14);
                if (dist <= 65) {
                  // Flash blips when radar sweeps past
                  const angleToBlip = Math.atan2(dr * 14, dc * 14);
                  let angleDiff = sweepAngle - angleToBlip;
                  if (angleDiff < 0) angleDiff += Math.PI * 2;
                  
                  if (angleDiff < 1.2) {
                    const color = ORE_SPARK_COLOR[tile.ore] || '#ffd700';
                    sonarCtx.fillStyle = color;
                    sonarCtx.shadowColor = color;
                    sonarCtx.shadowBlur = 4;
                    sonarCtx.beginPath();
                    sonarCtx.arc(px, py, 2.5, 0, Math.PI * 2);
                    sonarCtx.fill();
                    sonarCtx.shadowBlur = 0;
                  }
                }
              }
            }
          }
        }
      }
    }

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const d = state.drill;
      if (!d) return;

      // advance drilling from held keys
      drillSys.tickInput(held, dt);

      // spin drill bit if drilling
      if (d.avatar.isDrilling) {
        drillTheta += 38 * dt;
      }

      // Spawn exhaust steam particles
      if (Math.random() < 0.28 && (d.avatar.isDrilling || held.left || held.right || held.down || held.up)) {
        const dir = d.avatar.faceDir || 'down';
        const rx = d.avatar.col * TILE;
        const ry = d.avatar.row * TILE;
        let ex = rx + TILE / 2;
        let ey = ry + TILE / 2;
        let evx = 0, evy = 0;
        
        if (dir === 'right') {
          ex = rx;
          evx = -15 - Math.random() * 20;
          evy = (Math.random() - 0.5) * 8;
        } else if (dir === 'left') {
          ex = rx + TILE;
          evx = 15 + Math.random() * 20;
          evy = (Math.random() - 0.5) * 8;
        } else if (dir === 'down') {
          ey = ry;
          evy = -15 - Math.random() * 20;
          evx = (Math.random() - 0.5) * 8;
        } else if (dir === 'up') {
          ey = ry + TILE;
          evy = 15 + Math.random() * 20;
          evx = (Math.random() - 0.5) * 8;
        }
        
        particles.push({
          x: ex,
          y: ey,
          vx: evx,
          vy: evy,
          color: 'rgba(215, 230, 255, 0.45)', // soft vapor color
          size: 1.5 + Math.random() * 2,
          life: 0.3 + Math.random() * 0.2,
          maxLife: 0.5,
          isSteam: true
        });
      }

      // Spawn drill dust clouds
      if (d.avatar.isDrilling && Math.random() < 0.38 && d.avatar.drillTarget) {
        const tx = d.avatar.drillTarget.col * TILE + TILE / 2;
        const ty = d.avatar.drillTarget.row * TILE + TILE / 2;
        
        particles.push({
          x: tx + (Math.random() - 0.5) * TILE,
          y: ty + (Math.random() - 0.5) * TILE,
          vx: (Math.random() - 0.5) * 15,
          vy: -8 - Math.random() * 12, // drift upwards
          color: 'rgba(167, 130, 98, 0.35)', // dusty brown
          size: 2.0,
          life: 0.4 + Math.random() * 0.3,
          maxLife: 0.7,
          isDust: true
        });
      }

      // update particles
      particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      });
      particles = particles.filter((p) => p.life > 0);

      // flash timers
      if (gasHitFlash.t > 0) gasHitFlash.t -= dt;
      if (yieldFlash.t > 0) yieldFlash.t -= dt;

      drawSonar(d);
      render(dt);
      updateHud();
    }

    function render(dt) {
      const d = state.drill;
      if (!d) return;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);

      // Initialize rendering positions if first frame
      if (drillScreen._rx === undefined || isNaN(drillScreen._rx)) {
        drillScreen._rx = d.avatar.col * TILE;
        drillScreen._ry = d.avatar.row * TILE;
      }
      
      const targetX = d.avatar.col * TILE;
      const targetY = d.avatar.row * TILE;
      
      // Interpolate position smoothly based on frame tick dt
      drillScreen._rx += (targetX - drillScreen._rx) * 16 * dt;
      drillScreen._ry += (targetY - drillScreen._ry) * 16 * dt;

      // Camera view height
      const viewHeight = 18 * TILE;
      const targetViewY = drillScreen._ry - viewHeight / 2 + TILE / 2;
      
      // Initialize viewY if first frame
      if (viewY === undefined || isNaN(viewY)) {
        viewY = Math.max(0, Math.min(ROWS * TILE - viewHeight, targetViewY));
      } else {
        // Smooth camera follow
        viewY = viewY + (targetViewY - viewY) * 6 * dt;
        viewY = Math.max(0, Math.min(ROWS * TILE - viewHeight, viewY));
      }

      const startRow = Math.max(0, Math.floor(viewY / TILE) - 1);
      const endRow = Math.min(ROWS, Math.ceil((viewY + viewHeight) / TILE) + 1);

      // Draw background (outer space sky)
      ctx2d.fillStyle = '#060913';
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);

      // Draw cavern tunnels background below surface
      const tunnelTopY = Math.max(0, 0 - viewY);
      ctx2d.fillStyle = '#10141e';
      ctx2d.fillRect(0, tunnelTopY, canvas.width, Math.max(0, ROWS * TILE - viewY));

      // Draw tiles
      for (let c = 0; c < COLS; c++) {
        for (let r = startRow; r < endRow; r++) {
          const t = d.field[c][r];
          const x = c * TILE;
          const y = r * TILE - viewY;
          
          if (t.type === 'empty') {
            // grid lines inside dug caverns
            ctx2d.strokeStyle = 'rgba(57,208,255,0.03)';
            ctx2d.lineWidth = 1;
            ctx2d.strokeRect(x, y, TILE, TILE);
            continue;
          }

          let img = null;
          if (t.type === 'dirt') {
            img = IMAGES.dirt;
          } else if (t.type === 'rock') {
            img = IMAGES.rock;
          } else if (t.type === 'gas') {
            img = drillSys.isHazardRevealed(c, r) ? IMAGES.gasRevealed : IMAGES.dirt;
          } else if (t.type === 'vein' && t.ore) {
            img = IMAGES[t.ore];
          }

          if (img) {
            ctx2d.drawImage(img, x, y, TILE, TILE);
          } else if (t.type === 'vein' && t.ore) {
            // Missing tile art — draw a loud placeholder so ores never silently share another icon.
            ctx2d.fillStyle = 'rgba(255, 92, 92, 0.25)';
            ctx2d.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
            ctx2d.strokeStyle = '#ff5c5c';
            ctx2d.lineWidth = 1.5;
            ctx2d.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
            ctx2d.fillStyle = '#ffb35c';
            ctx2d.font = 'bold 8px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
            ctx2d.textAlign = 'center';
            ctx2d.fillText('?', x + TILE / 2, y + TILE / 2 + 3);
          }

          // Locked vein overlay — tier gate is per ore, not depth.
          if (t.type === 'vein' && t.ore) {
            const req = t.tierReq || drillTierReqForOre(t.ore);
            const tier = drillScreen._drillTier || 1;
            if (tier < req) {
              ctx2d.save();
              ctx2d.fillStyle = 'rgba(8, 12, 20, 0.55)';
              ctx2d.fillRect(x, y, TILE, TILE);
              ctx2d.strokeStyle = 'rgba(255, 92, 92, 0.85)';
              ctx2d.lineWidth = 1.5;
              ctx2d.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
              ctx2d.fillStyle = '#ff8a4a';
              ctx2d.font = 'bold 9px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
              ctx2d.textAlign = 'center';
              ctx2d.fillText(`MK${req}`, x + TILE / 2, y + TILE / 2 + 3);
              ctx2d.restore();
            }
          }

          // Damage cracks overlay
          if (t.maxHp > 0 && t.hp < t.maxHp) {
            const frac = 1 - (t.hp / t.maxHp);
            ctx2d.strokeStyle = 'rgba(0,0,0,' + (0.35 + frac * 0.4) + ')';
            ctx2d.lineWidth = 1.5;
            ctx2d.beginPath();
            ctx2d.moveTo(x + 2, y + 4); ctx2d.lineTo(x + TILE - 4, y + TILE - 2);
            if (frac > 0.5) {
              ctx2d.moveTo(x + TILE - 3, y + 2); ctx2d.lineTo(x + 3, y + TILE - 3);
            }
            ctx2d.stroke();
          }
        }
      }

      // Draw particles (sparks, steam, and dust)
      particles.forEach((p) => {
        ctx2d.fillStyle = p.color;
        const alpha = p.life / p.maxLife;
        ctx2d.globalAlpha = alpha;
        if (p.isSteam) {
          const size = p.size * (1 + (1 - alpha) * 1.5);
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y - viewY, size, 0, Math.PI * 2);
          ctx2d.fill();
        } else if (p.isDust) {
          const size = p.size * (1 + (1 - alpha) * 3);
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y - viewY, size, 0, Math.PI * 2);
          ctx2d.fill();
        } else {
          ctx2d.fillRect(p.x, p.y - viewY, p.size, p.size);
        }
      });
      ctx2d.globalAlpha = 1.0;

      // Draw avatar (rover & rotating drill)
      const rx = drillScreen._rx;
      const ry = drillScreen._ry - viewY;

      // --- Draw Massline Power Cable ---
      if (d.cableTrail && d.cableTrail.length > 0) {
        ctx2d.save();
        // Thick dark outer casing
        ctx2d.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx2d.lineWidth = 5;
        ctx2d.lineCap = 'round';
        ctx2d.lineJoin = 'round';
        ctx2d.beginPath();
        const startCol = Math.floor(COLS / 2);
        ctx2d.moveTo(startCol * TILE + TILE / 2, 0 - viewY);
        for (let i = 0; i < d.cableTrail.length; i++) {
          const pt = d.cableTrail[i];
          ctx2d.lineTo(pt.col * TILE + TILE / 2, pt.row * TILE + TILE / 2 - viewY);
        }
        ctx2d.lineTo(rx + TILE / 2, ry + TILE / 2);
        ctx2d.stroke();

        // Glowing inner core
        ctx2d.strokeStyle = '#0ea5e9';
        ctx2d.shadowColor = '#38bdf8';
        ctx2d.shadowBlur = 6;
        ctx2d.lineWidth = 2.2;
        ctx2d.stroke();

        // Pulsing energy stream flowing down cable
        ctx2d.strokeStyle = '#e0f2fe';
        ctx2d.shadowBlur = 0;
        ctx2d.lineWidth = 1.2;
        ctx2d.setLineDash([5, 12]);
        ctx2d.lineDashOffset = -performance.now() * 0.04;
        ctx2d.stroke();
        ctx2d.restore();
      }
      
      // --- Draw Headlight Spotlight Beam ---
      const dir = d.avatar.faceDir || 'down';
      const cx = rx + TILE / 2;
      const cy = ry + TILE / 2;
      let theta = 0;
      if (dir === 'left') theta = Math.PI;
      else if (dir === 'down') theta = Math.PI / 2;
      else if (dir === 'up') theta = -Math.PI / 2;
      else if (dir === 'right') theta = 0;

      ctx2d.save();
      // Draw volumetric radial gradient cone
      const beamGrad = ctx2d.createRadialGradient(cx, cy, 10, cx + Math.cos(theta) * 160, cy + Math.sin(theta) * 160, 90);
      beamGrad.addColorStop(0, 'rgba(255, 225, 140, 0.32)');
      beamGrad.addColorStop(0.3, 'rgba(255, 225, 140, 0.12)');
      beamGrad.addColorStop(1, 'rgba(255, 225, 140, 0)');
      
      ctx2d.fillStyle = beamGrad;
      ctx2d.beginPath();
      ctx2d.moveTo(cx, cy);
      ctx2d.arc(cx, cy, 180, theta - 0.28, theta + 0.28);
      ctx2d.closePath();
      ctx2d.fill();
      ctx2d.restore();
      
      ctx2d.save();
      
      // Rover shake animation when drilling
      let sx = 0, sy = 0;
      if (d.avatar.isDrilling) {
        sx = (Math.random() - 0.5) * 1.5;
        sy = (Math.random() - 0.5) * 1.5;
      }
      ctx2d.translate(rx + TILE / 2 + sx, ry + TILE / 2 + sy);

      // Rotate/Flip context based on faceDir
      const roverDir = d.avatar.faceDir || 'down';
      if (roverDir === 'left') {
        ctx2d.scale(-1, 1);
      } else if (roverDir === 'down') {
        ctx2d.rotate(Math.PI / 2);
      } else if (roverDir === 'up') {
        ctx2d.rotate(-Math.PI / 2);
      }

      // Draw rover body (1.4x tile size for chunkiness)
      const roverSize = TILE * 1.4;
      ctx2d.drawImage(IMAGES.rover, -roverSize / 2, -roverSize / 2, roverSize, roverSize);

      // Draw 3D auger drill bit procedurally
      const spinTime = performance.now() / 1000;
      drawAugerDrillBit(ctx2d, roverSize / 2, 4, TILE * 1.25, 0, spinTime);

      ctx2d.restore();

      // Gas-hit red flash overlay
      if (gasHitFlash.t > 0) {
        ctx2d.fillStyle = 'rgba(255,40,70,' + (gasHitFlash.t * 0.5) + ')';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Yield popup text above avatar
      if (yieldFlash.t > 0) {
        ctx2d.save();
        ctx2d.globalAlpha = Math.min(1, yieldFlash.t * 1.5);
        ctx2d.fillStyle = '#9af0ff';
        ctx2d.font = 'bold 14px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
        ctx2d.textAlign = 'center';
        ctx2d.shadowColor = '#000000';
        ctx2d.shadowBlur = 4;
        ctx2d.fillText(yieldFlash.text, rx + TILE / 2, ry - 8 - (1 - yieldFlash.t) * 20);
        ctx2d.restore();
      }

      // --- 3. Telemetry Thermal Temperature Gauge ---
      if (d.drillTemp !== undefined) {
        ctx2d.save();
        const gx = 12;
        const gy = 12;
        const gw = 8;
        const gh = 100;
        
        // Slot background
        ctx2d.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx2d.strokeStyle = 'rgba(57, 208, 255, 0.25)';
        ctx2d.lineWidth = 1;
        ctx2d.fillRect(gx, gy, gw, gh);
        ctx2d.strokeRect(gx, gy, gw, gh);
        
        // Temperature fill bar
        const fillHeight = (d.drillTemp / 100) * gh;
        const fy = gy + gh - fillHeight;
        
        let fillCol = '#39d0ff'; // Cyan
        if (d.overheated) {
          fillCol = (Math.floor(Date.now() / 200) % 2 === 0) ? '#ff5c5c' : '#ffb35c';
        } else if (d.drillTemp > 75) {
          fillCol = '#ff5c5c';
        } else if (d.drillTemp > 45) {
          fillCol = '#ffb35c';
        }
        
        ctx2d.fillStyle = fillCol;
        ctx2d.fillRect(gx + 1, fy + 1, gw - 2, fillHeight - 2);
        
        // Label
        ctx2d.fillStyle = 'rgba(215, 230, 255, 0.6)';
        ctx2d.font = 'bold 9px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
        ctx2d.textAlign = 'left';
        ctx2d.fillText('TEMP', gx, gy + gh + 12);
        
        if (d.overheated) {
          ctx2d.fillStyle = '#ff5c5c';
          ctx2d.fillText('OVERHEAT', gx + 14, gy + 12);
        }
        ctx2d.restore();
      }

      // --- 3.5 Depth telemetry markings ---
      ctx2d.save();
      ctx2d.fillStyle = 'rgba(57, 208, 255, 0.38)';
      ctx2d.font = 'bold 8.5px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
      ctx2d.textAlign = 'right';
      
      const stepY = TILE * 2;
      const startTick = Math.max(0, Math.floor(viewY / stepY) - 1);
      const endTick = Math.min(ROWS, Math.ceil((viewY + canvas.height) / stepY) + 1);
      
      for (let i = startTick; i <= endTick; i++) {
        const ty = i * stepY - viewY;
        ctx2d.fillRect(canvas.width - 5, ty, 5, 1);
        ctx2d.fillText(`${i * 10}M`, canvas.width - 9, ty + 3);
      }
      ctx2d.restore();

      // --- 3.7 Target locking reticles & hover tooltips ---
      
      // 3.7.1 Active Blocked Drill Target Reticle
      if (d.avatar.drillTarget && d.avatar.drillBlocked) {
        const tc = d.avatar.drillTarget.col;
        const tr = d.avatar.drillTarget.row;
        const tx = tc * TILE;
        const ty = tr * TILE - viewY;
        
        ctx2d.save();
        // Flashing red reticle
        const flash = Math.floor(performance.now() / 150) % 2 === 0;
        ctx2d.strokeStyle = flash ? '#ff5c5c' : 'rgba(255, 92, 92, 0.3)';
        ctx2d.lineWidth = 2;
        ctx2d.strokeRect(tx + 2, ty + 2, TILE - 4, TILE - 4);
        
        // Corner ticks
        ctx2d.beginPath();
        ctx2d.moveTo(tx, ty + 10); ctx2d.lineTo(tx, ty); ctx2d.lineTo(tx + 10, ty);
        ctx2d.moveTo(tx + TILE, ty + 10); ctx2d.lineTo(tx + TILE, ty); ctx2d.lineTo(tx + TILE - 10, ty);
        ctx2d.moveTo(tx, ty + TILE - 10); ctx2d.lineTo(tx, ty + TILE); ctx2d.lineTo(tx + 10, ty + TILE);
        ctx2d.moveTo(tx + TILE, ty + TILE - 10); ctx2d.lineTo(tx + TILE, ty + TILE); ctx2d.lineTo(tx + TILE - 10, ty + TILE);
        ctx2d.stroke();
        
        // Warning text block
        ctx2d.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx2d.fillRect(tx - 30, ty - 18, TILE + 60, 14);
        ctx2d.strokeStyle = '#ff5c5c';
        ctx2d.lineWidth = 1;
        ctx2d.strokeRect(tx - 30, ty - 18, TILE + 60, 14);
        
        ctx2d.fillStyle = '#ff5c5c';
        ctx2d.font = 'bold 8.5px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
        ctx2d.textAlign = 'center';
        
        const names = { 2: 'MK2 DRILL REQ', 3: 'MK3 DRILL REQ', 4: 'MK4 DRILL REQ' };
        const req = d.field[tc][tr]?.tierReq || 1;
        ctx2d.fillText(names[req] || 'UPGRADE DRILL', tx + TILE / 2, ty - 8);
        ctx2d.restore();
      }

      // 3.7.2 Hover Tooltip overlay
      if (hoveredTile) {
        const col = hoveredTile.col;
        const row = hoveredTile.row;
        const t = d.field[col][row];
        
        if (t && t.type !== 'empty') {
          const hx = col * TILE;
          const hy = row * TILE - viewY;
          
          ctx2d.save();
          // 1. Draw target indicator frame
          ctx2d.strokeStyle = 'rgba(57, 208, 255, 0.7)';
          ctx2d.lineWidth = 1.5;
          ctx2d.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
          
          // Outer corners
          ctx2d.beginPath();
          ctx2d.moveTo(hx - 3, hy + 6); ctx2d.lineTo(hx - 3, hy - 3); ctx2d.lineTo(hx + 6, hy - 3);
          ctx2d.moveTo(hx + TILE + 3, hy + 6); ctx2d.lineTo(hx + TILE + 3, hy - 3); ctx2d.lineTo(hx + TILE - 6, hy - 3);
          ctx2d.moveTo(hx - 3, hy + TILE - 6); ctx2d.lineTo(hx - 3, hy + TILE + 3); ctx2d.lineTo(hx + 6, hy + TILE + 3);
          ctx2d.moveTo(hx + TILE + 3, hy + TILE - 6); ctx2d.lineTo(hx + TILE + 3, hy + TILE + 3); ctx2d.lineTo(hx + TILE - 6, hy + TILE + 3);
          ctx2d.stroke();
          
          // 2. Draw HUD tooltip next to cursor
          let mx = hoveredTile.mouseX + 16;
          let my = hoveredTile.mouseY + 12;
          
          // Keep tooltip on screen
          const tw = 145;
          const th = 64;
          if (mx + tw > canvas.width) mx = hoveredTile.mouseX - tw - 12;
          if (my + th > canvas.height) my = hoveredTile.mouseY - th - 12;
          
          ctx2d.fillStyle = 'rgba(6, 10, 18, 0.95)';
          ctx2d.fillRect(mx, my, tw, th);
          ctx2d.strokeStyle = 'rgba(57, 208, 255, 0.35)';
          ctx2d.lineWidth = 1;
          ctx2d.strokeRect(mx, my, tw, th);
          
          // Faint left accent line
          ctx2d.fillStyle = 'rgba(57, 208, 255, 0.8)';
          ctx2d.fillRect(mx, my, 3, th);
          
          // Text fields
          ctx2d.fillStyle = '#ffffff';
          ctx2d.font = 'bold 9px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
          ctx2d.textAlign = 'left';
          
          let name = 'UNKNOWN STRATA';
          let subtitle = '';
          let reqText = 'Drill Head: Basic MK1';
          let valueText = '';
          let isBlocked = false;
          
          if (t.type === 'dirt') {
            name = 'SOFT REGOLITH';
            subtitle = 'HP: ' + Math.ceil(t.hp) + '/' + t.maxHp;
          } else if (t.type === 'rock') {
            name = 'SOLID BASALT';
            subtitle = 'HP: ' + Math.ceil(t.hp) + '/' + t.maxHp;
          } else if (t.type === 'gas') {
            name = 'GAS VENT POCKET';
            subtitle = 'HP: 1/1';
          } else if (t.type === 'vein' && t.ore) {
            name = commodityName(t.ore).toUpperCase();
            const basePrice = COMMODITY_BY_ID.get(t.ore)?.basePrice || 0;
            subtitle = `Density: High (${Math.ceil(t.hp)} HP)`;
            valueText = `Market Price: ${basePrice} Cr`;
            
            const tier = drillScreen._drillTier || 1;
            const req = t.tierReq || 1;
            const names = { 1: 'Basic MK1', 2: 'Carbon MK2', 3: 'Diamond MK3', 4: 'Ind. Heavy MK4' };
            reqText = `Min Engine: ${names[req] || 'MK' + req}`;
            if (tier < req) {
              isBlocked = true;
            }
          }
          
          ctx2d.fillText(name, mx + 8, my + 14);
          
          ctx2d.fillStyle = 'rgba(215, 230, 255, 0.6)';
          ctx2d.font = '8px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
          ctx2d.fillText(subtitle, mx + 8, my + 26);
          if (valueText) {
            ctx2d.fillText(valueText, mx + 8, my + 36);
          }
          
          if (isBlocked) {
            ctx2d.fillStyle = '#ff5c5c';
            ctx2d.font = 'bold 8px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
            ctx2d.fillText('⚠ UPGRADE DRILL TIER', mx + 8, my + 48);
          } else {
            ctx2d.fillStyle = 'rgba(57, 208, 255, 0.8)';
            ctx2d.fillText(reqText, mx + 8, my + 48);
          }
          
          ctx2d.restore();
        }
      }

      // --- 4. CRT Scanlines & Sonar Vignette Glow ---
      ctx2d.save();
      ctx2d.fillStyle = 'rgba(0, 0, 0, 0.05)';
      for (let y = 0; y < canvas.height; y += 4) {
        ctx2d.fillRect(0, y, canvas.width, 2);
      }
      
      const grad = ctx2d.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, canvas.width);
      grad.addColorStop(0, 'rgba(57, 208, 255, 0.01)');
      grad.addColorStop(1, 'rgba(5, 10, 20, 0.35)');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.restore();
    }

    function updateHud() {
      const d = state.drill;
      if (!d) return;
      const total = Object.values(d.yieldLog).reduce((a, b) => a + b, 0);
      hud.querySelector('[data-yield]').textContent = total;
      hud.querySelector('[data-gas]').textContent = d.gasHits;
      const cargo = state.player.cargo;
      const cargoUsed = cargo ? Math.round((cargo.usedVolume / cargo.capVolume) * 100) : 0;
      hud.querySelector('[data-cargo]').textContent = cargoUsed + '%';
      if (hud.querySelector('[data-temp]') && d.drillTemp !== undefined) {
        hud.querySelector('[data-temp]').textContent = Math.round(d.drillTemp) + '%';
        hud.querySelector('[data-temp]').className = d.overheated ? 'warn' : 'v';
      }

      // --- Update Cockpit Left Panel Readouts ---
      const tensionEl = leftPanel.querySelector('[data-tension]');
      if (tensionEl) {
        const baseTension = d.avatar.isDrilling ? 45 : 18;
        const variation = Math.sin(performance.now() * 0.005) * 4;
        tensionEl.textContent = `${Math.round(baseTension + variation)} N`;
        tensionEl.className = d.avatar.isDrilling ? 'val warn' : 'val';
      }
      const powerEl = leftPanel.querySelector('[data-power]');
      if (powerEl) {
        const powerPct = Math.max(0, 100 - (d.drillTemp * 0.15));
        powerEl.textContent = `${Math.round(powerPct)}%`;
        powerEl.className = d.drillTemp > 75 ? 'val warn' : 'val good';
      }

      // --- Update Cockpit Right Panel Readouts ---
      // 1. Drill Head & DPS engine specs (refresh live — outfitting can change mid-session)
      if (drillSys) {
        drillScreen._drillTier = drillSys.getDrillTier();
        drillScreen._drillDps = drillSys.getDrillDPS();
      }
      const tierEl = rightPanel.querySelector('[data-drill-tier]');
      if (tierEl) {
        const names = { 1: 'BASIC MK1', 2: 'CARBON MK2', 3: 'DIAMOND MK3', 4: 'IND. HEAVY MK4' };
        const tier = drillScreen._drillTier || 1;
        tierEl.textContent = names[tier] || `TIER MK${tier}`;
      }
      const dpsEl = rightPanel.querySelector('[data-drill-dps]');
      if (dpsEl) {
        const dps = drillScreen._drillDps || 8;
        dpsEl.textContent = `${dps} HP/s`;
      }

      // 2. Target scanner
      const scanEl = document.getElementById('drill-scan-target');
      if (scanEl) {
        let nc = d.avatar.col;
        let nr = d.avatar.row;
        const dir = d.avatar.faceDir || 'down';
        if (dir === 'left') nc--;
        else if (dir === 'right') nc++;
        else if (dir === 'down') nr++;
        else if (dir === 'up') nr--;

        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
          const t = d.field[nc][nr];
          if (t.type === 'empty') {
            scanEl.innerHTML = '<span style="color:var(--ink-mute);">TARGETING:</span> VACUUM STRATA';
          } else if (t.type === 'dirt') {
            scanEl.innerHTML = '<span style="color:#a78262; font-weight:bold;">SOFT REGOLITH</span><br>HP: ' + Math.ceil(t.hp) + '/' + t.maxHp + '<br>MIN TIER: MK1';
          } else if (t.type === 'rock') {
            scanEl.innerHTML = '<span style="color:#64748b; font-weight:bold;">SOLID BASALT STRATA</span><br>HP: ' + Math.ceil(t.hp) + '/' + t.maxHp + '<br>MIN TIER: MK1';
          } else if (t.type === 'gas') {
            scanEl.innerHTML = '<span style="color:#ff5c5c; font-weight:bold;">⚠ COMPRESSED VAPOR</span><br>COMPOSITION: GAS FIELD';
          } else if (t.type === 'vein' && t.ore) {
            const name = commodityName(t.ore);
            const basePrice = COMMODITY_BY_ID.get(t.ore)?.basePrice || 0;
            const req = t.tierReq || drillTierReqForOre(t.ore);
            const tier = drillScreen._drillTier || 1;
            const blocked = tier < req;
            const tierLine = blocked
              ? `<span style="color:#ff5c5c; font-weight:bold;">⚠ NEEDS MK${req} DRILL</span>`
              : `MIN TIER: MK${req}`;
            scanEl.innerHTML = `<span style="color:${ORE_SPARK_COLOR[t.ore] || '#ffd700'}; font-weight:bold;">${name.toUpperCase()} VEIN</span><br>EST VALUE: ${basePrice} Cr/u<br>${tierLine}`;
          }
        } else {
          scanEl.innerHTML = '<span style="color:var(--ink-mute);">TARGETING:</span> ASTEROID BOUNDARY';
        }
      }

      // 3. Cargo Manifest List
      const listEl = document.getElementById('drill-cargo-manifest-list');
      if (listEl) {
        const items = Object.entries(d.yieldLog).filter(([_, qty]) => qty > 0);
        if (items.length === 0) {
          listEl.innerHTML = '<div style="font-size:10px; color:var(--ink-mute);">No minerals extracted.</div>';
        } else {
          listEl.innerHTML = '';
          items.forEach(([commodityId, qty]) => {
            const name = commodityName(commodityId);
            const basePrice = COMMODITY_BY_ID.get(commodityId)?.basePrice || 0;
            const totalValue = qty * basePrice;

            const row = document.createElement('div');
            row.className = 'readout-row';
            row.style.borderBottom = '1px dashed rgba(255,255,255,0.05)';
            row.style.padding = '2px 0';

            row.innerHTML = `
              <span class="lbl">${name} (x${qty})</span>
              <span class="val">+${totalValue} Cr</span>
            `;
            listEl.appendChild(row);
          });
        }
      }
    }

    const startSession = () => {
      const asteroidId = (state.ui && state.ui.pendingDrillAsteroidId) || null;
      if (state.ui) state.ui.pendingDrillAsteroidId = null;
      if (!asteroidId || !drillSys) return;
      
      drillSys.begin(asteroidId);
      renderDrillLegend(legendGrid, state.drill?.field, drillSys.getDrillTier());
      held.left = held.right = held.up = held.down = false;
      drillTheta = 0;
      viewY = undefined;
      particles = [];
      
      gasHitFlash.t = 0;
      yieldFlash.t = 0;
      toastContainer.innerHTML = '';
      
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseleave', onMouseLeave);
      
      last = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(frame);
      this._active = true;
    };

    const stopSession = () => {
      if (!this._active) return;
      this._active = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      
      // Cleanup all bus listeners
      unsubs.forEach((unsub) => unsub());
      unsubs.length = 0;
      
      if (state.drill && drillSys) drillSys.end();
    };

    this._startSession = startSession;
    this._cleanup = stopSession;
  },

  onShow() { if (this._startSession) this._startSession(); },
  onHide() { if (this._cleanup) this._cleanup(); },
  refresh() {},
};

function triggerDockFade(show) {
  const fade = document.getElementById('sf-dock-overlay');
  if (!fade) return;
  if (show) {
    fade.hidden = false;
    fade.setAttribute('aria-hidden', 'false');
    fade.style.pointerEvents = 'auto';
    requestAnimationFrame(() => fade.classList.add('active'));
  } else {
    fade.classList.remove('active');
    setTimeout(() => {
      if (!fade.classList.contains('active')) {
        fade.style.pointerEvents = 'none';
        fade.setAttribute('aria-hidden', 'true');
        fade.hidden = true;
      }
    }, 420);
  }
}

function showDrillSummaryModal(yieldLog) {
  const root = document.getElementById('ui-root');
  if (!root) return;

  const items = Object.entries(yieldLog).filter(([_, qty]) => qty > 0);
  if (items.length === 0) return;

  const modal = document.createElement('div');
  modal.className = 'drill-summary-modal';
  
  const box = document.createElement('div');
  box.className = 'drill-summary-box';
  
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = '◆ DRILL EXTRACTION REPORT ◆';
  box.appendChild(title);
  
  const list = document.createElement('div');
  list.className = 'item-list';
  
  let totalCredits = 0;
  items.forEach(([commodityId, qty]) => {
    const name = commodityName(commodityId);
    const basePrice = COMMODITY_BY_ID.get(commodityId)?.basePrice || 0;
    const value = qty * basePrice;
    totalCredits += value;
    
    const row = document.createElement('div');
    row.className = 'item-row';
    
    const left = document.createElement('div');
    left.className = 'left';
    
    const icon = document.createElement('div');
    icon.className = 'icon';
    if (SVG_TEMPLATES[commodityId]) {
      const img = document.createElement('img');
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(SVG_TEMPLATES[commodityId]);
      icon.appendChild(img);
    } else {
      icon.textContent = '💎';
    }
    left.appendChild(icon);
    
    const nameText = document.createElement('span');
    nameText.className = 'name';
    nameText.textContent = `${name} (x${qty})`;
    left.appendChild(nameText);
    
    row.appendChild(left);
    
    const right = document.createElement('div');
    right.className = 'value';
    right.textContent = `+${value} Cr`;
    row.appendChild(right);
    
    list.appendChild(row);
  });
  box.appendChild(list);
  
  const totalRow = document.createElement('div');
  totalRow.className = 'total-row';
  totalRow.innerHTML = `<span>TOTAL ESTIMATED REVENUE:</span><span class="val">+${totalCredits} Cr</span>`;
  box.appendChild(totalRow);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'sf-btn';
  closeBtn.textContent = 'Acknowledge';
  closeBtn.onclick = () => {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 250);
  };
  box.appendChild(closeBtn);
  
  modal.appendChild(box);
  modal.style.pointerEvents = 'auto';
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 250);
    }
  });

  root.appendChild(modal);
  setTimeout(() => modal.classList.add('active'), 20);
}

function drawAugerDrillBit(ctx2d, x, y, size, angle, time) {
  ctx2d.save();
  ctx2d.translate(x, y);
  ctx2d.rotate(angle);
  
  const w = size;
  const h = size * 0.7;
  
  // 1. Bracket mount (carbon grey)
  ctx2d.fillStyle = '#1e293b';
  ctx2d.fillRect(-w/2, -h*0.35, w*0.18, h*0.7);
  ctx2d.strokeStyle = '#475569';
  ctx2d.lineWidth = 1.2;
  ctx2d.strokeRect(-w/2, -h*0.35, w*0.18, h*0.7);
  
  // 2. Drive shaft (chrome steel)
  const shaftG = ctx2d.createLinearGradient(0, -h*0.2, 0, h*0.2);
  shaftG.addColorStop(0, '#64748b');
  shaftG.addColorStop(0.5, '#f1f5f9');
  shaftG.addColorStop(1, '#334155');
  ctx2d.fillStyle = shaftG;
  ctx2d.fillRect(-w/2 + w*0.18, -h*0.2, w*0.14, h*0.4);
  
  // 3. Main screw cone
  const coneG = ctx2d.createLinearGradient(0, -h/2, 0, h/2);
  coneG.addColorStop(0, '#94a3b8');
  coneG.addColorStop(0.3, '#f8fafc');
  coneG.addColorStop(0.7, '#475569');
  coneG.addColorStop(1, '#0f172a');
  
  ctx2d.fillStyle = coneG;
  ctx2d.beginPath();
  const bx = -w/2 + w*0.32;
  ctx2d.moveTo(bx, -h/2);
  ctx2d.lineTo(w/2, 0);
  ctx2d.lineTo(bx, h/2);
  ctx2d.closePath();
  ctx2d.fill();
  
  ctx2d.strokeStyle = '#64748b';
  ctx2d.lineWidth = 1;
  ctx2d.stroke();
  
  // 4. Helical spiral grooves (scrolling curve strips inside cone)
  const scrollSpeed = 35.0; // px/sec
  const grooveSpacing = w * 0.22;
  const offset = (time * scrollSpeed) % grooveSpacing;
  
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.moveTo(bx, -h/2);
  ctx2d.lineTo(w/2, 0);
  ctx2d.lineTo(bx, h/2);
  ctx2d.closePath();
  ctx2d.clip();
  
  ctx2d.strokeStyle = 'rgba(15, 23, 42, 0.85)';
  ctx2d.lineWidth = 2.6;
  
  const numThreads = 6;
  for (let i = -1; i < numThreads; i++) {
    const gx = bx + i * grooveSpacing + offset;
    if (gx > w/2) continue;
    
    const tFrac = (w/2 - gx) / (w/2 - bx); // base to tip scale factor
    const gh = h * 0.5 * tFrac;
    
    ctx2d.beginPath();
    ctx2d.moveTo(gx, -gh);
    ctx2d.quadraticCurveTo(gx + grooveSpacing*0.4, 0, gx, gh);
    ctx2d.stroke();
    
    // Glowing cyan outline
    ctx2d.strokeStyle = 'rgba(57, 208, 255, 0.45)';
    ctx2d.lineWidth = 1.0;
    ctx2d.beginPath();
    ctx2d.moveTo(gx + 1.5, -gh);
    ctx2d.quadraticCurveTo(gx + 1.5 + grooveSpacing*0.4, 0, gx + 1.5, gh);
    ctx2d.stroke();
    
    ctx2d.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx2d.lineWidth = 2.6;
  }
  ctx2d.restore();
  
  // 5. High-energy drill tip
  ctx2d.fillStyle = '#39d0ff';
  ctx2d.shadowColor = '#0ea5e9';
  ctx2d.shadowBlur = 4;
  ctx2d.beginPath();
  ctx2d.arc(w/2, 0, 2.5, 0, Math.PI*2);
  ctx2d.fill();
  
  ctx2d.restore();
}
