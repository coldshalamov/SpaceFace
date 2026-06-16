export const meta = {
  name: 'spaceface-polish',
  description: 'Polish pass: balance tuning, richer 3D meshes/textures, VFX + custom bloom, and deepening the shallow depth systems',
  phases: [{ title: 'Polish', detail: 'balance, art-meshes, vfx-bloom, depth — in parallel' }],
}

const CONTRACT = `You polish part of SpaceFace, a COMPLETE & WORKING Three.js space game (cwd: C:\\Users\\93rob\\Documents\\GitHub\\SpaceFace). Everything already works (fly/fight/mine/dock/trade/jump/upgrade/missions/automation/save + full UI). Your job improves quality WITHOUT breaking anything.

READ FIRST: ARCHITECTURE.md (§0 constants, §3 schema, §4.4 events), your design spec under design/specs/, and the files you touch. Run \`node --check\` on every file you write.
RULES: only edit the file(s) listed for you — do NOT edit main.js/registry.js/loop.js/eventBus or other tracks' files. Keep all export names + the system interface stable. Sim logic uses state.rng()/seeded streams, never Math.random() (cosmetic VFX may). Health is 4-layer (hull/armorHp/shield/cap). Entities live on the XZ plane; a ship mesh's +X axis is its nose and renderer sets mesh.rotation.y = -entity.rot, so keep that convention. Do NOT import 'three/addons' (vendored addons are not present) — use core 'three' + your own code only.
RETURN a short note of what you changed and why.`

const tasks = [
  { key: 'balance', file: 'src/data/*.js (numbers only)', spec: '04-ships-modules-tech-tree-progression.md', prompt:
    `Retune game BALANCE by editing NUMBERS in the data files only — do NOT change any id, export name, field name, file structure, or system logic. Files you may edit: src/data/commodities.js, ships.js, weapons.js, modules.js, tech.js, mining.js, missions.js, automation.js. READ src/systems/economy.js to understand how a commodity's basePrice becomes a market buy/sell price (so your prices yield real but not absurd margins), and src/systems/mining.js + ships.js for yield/stat formulas.
    TARGET PROGRESSION CURVE (player starts with 5000 cr in a Kestrel): a first meaningful upgrade (better mining laser, a cargo expander, or a T1 ship) should be affordable after ~15-20 min of active mining/trading; a mid-tier T2-T3 ship within a few hours; T4-T5 hulls a long-term goal (tens of hours). Tune: commodity basePrices/volatility so a good trade route nets a sane profit/hour; mining BEAMS dps + ASTEROIDS yieldU so early mining income matches; ship/module/weapon prices to ladder smoothly with no dead tiers or huge cliffs; weapon dmg/rof/energyCost so the starter can beat ONE low-level pirate but a pack is dangerous; tech costs; mission MISSION_TUNING reward scaling; automation AUTO_BALANCE so passive income stays a useful supplement (well under active earning).
    VERIFY: run \`node scripts/check-data.mjs\` AND \`node scripts/check-data-refs.mjs\` — both MUST stay clean (0 fail). Return a table of the key numbers you changed and the intended pacing.`,
  },
  { key: 'art-meshes', file: 'src/render/visualFactory.js + src/render/canvasTextures.js', spec: '10-art-vfx-direction-three-js-primitives-only.md', prompt:
    `Make the world look MUCH better using ONLY Three primitives + procedural canvas textures (no assets, no addons). Rewrite src/render/visualFactory.js (keep \`export function createVisualFactory()\` returning { build(entity) -> THREE.Object3D }) and enrich src/render/canvasTextures.js (export texture builders: noise/greeble/gradient/hull-panel/star). Consume src/data/palettes.js (FACTION_PALETTES, SECTOR_PALETTES, SHIP_RECIPES) and ships.js for class/role.
    - SHIPS: distinct silhouettes per role/class (fighter vs freighter vs miner vs capital) and per faction color (use entity.factionId / entity.team: team 0 = player cyan, team 1 = hostile red, else faction palette), built from layered primitives (hull body, wings/nacelles, cockpit, emissive engine glow + accent strips, panel-lined material via canvas texture). Nose MUST point +X. Scale to entity.radius. Use entity.data.defId / data.shipClass to pick the silhouette.
    - ASTEROIDS: stronger noise displacement + per-type tint/roughness (read data.typeId), a few crystal/metal variants. STATIONS: bigger greebled structures with rings, modules, blinking emissive lights. PICKUPS: glowing spinning gems by commodity color. PROJECTILES: bright tracers. Add subtle per-entity material variety. Keep it performant (cache geometries/materials/textures by key; don't allocate per-frame).
    - Build must never throw for any entity type (fallback to a simple mesh). node --check clean.`,
  },
  { key: 'vfx-bloom', file: 'src/render/vfx.js + src/render/bloom.js (new)', spec: '10-art-vfx-direction-three-js-primitives-only.md', prompt:
    `Two things. (1) Enrich src/render/vfx.js (keep \`export const vfx = { name:'vfx', init(ctx), update(frameDt) }\`): punchier explosions (multi-layer flash + shockwave ring + sparks + smoke), engine thrust trails, weapon muzzle flashes + impact sparks, shield-hit fresnel ripples, mining beam sparks, and a warp/jump streak — all pooled, additive, cosmetic Math.random allowed. Subscribe to the same events it already uses (combat:fire, projectile:hit, combat:damage, entity:killed/destroyed, mining:tick, ship:thrust/boost, jump:start) + emit camera:shake on big hits.
    (2) Write a SELF-CONTAINED bloom post-processor at src/render/bloom.js: \`export function createBloom(renderer, width, height)\` returning { render(scene, camera), setSize(w,h), dispose() } implemented with THREE.WebGLRenderTarget(s) + a fullscreen-quad ShaderMaterial pipeline (bright-pass threshold → separable gaussian blur (2-3 taps) → additive composite over the base scene render). INLINE all GLSL as strings; import only 'three' (NO three/addons). Keep it cheap (half-res blur targets). It must expose render(scene,camera) that draws the final composited image to the default framebuffer. The renderer will call createBloom and use bloom.render(scene,camera) instead of renderer.render — write it to that interface. node --check clean.`,
  },
  { key: 'depth', file: 'src/systems/automation.js + src/systems/missions.js', spec: '08-automation-passive-income-anti-idle-layer.md', prompt:
    `Deepen two systems (LOGIC only — do NOT change balance numbers in data/, and do NOT edit other systems' files).
    - src/systems/automation.js: make mining DRONES real flying entities. When a mining drone group is deployed, spawn actual type:'drone' entities (via helpers.spawnEntity) near the nearest asteroid field that orbit/seek asteroids and chip ore (you may reuse a small inline version of the mining math or emit mining-style yields), banking to the shared capped buffer; recall despawns them. Keep the existing capped-passive-income + upkeep + loss model intact (don't exceed AUTO_BALANCE caps). Traders/outposts can stay abstract.
    - src/systems/missions.js: make ESCORT missions real — spawn the escortee as a friendly (team 0) ship entity that travels toward the destination; mission fails if it dies, completes when it (and the player) reach the destination. Make DELIVERY/passenger missions track the actual cargo: on accept, note required commodity+qty; complete when the player docks at the destination WITH that cargo present in state.player.cargo (then consume it via the cargo removeCargo helper / emit the right event). Keep determinism (seeded streams).
    Verify node --check on both files.`,
  },
]

phase('Polish')
const results = await parallel(tasks.map((t) => () =>
  agent(`${CONTRACT}\n\n=== YOUR TRACK: ${t.key} ===\nDesign spec: design/specs/${t.spec}\nFiles: ${t.file}\n\n${t.prompt}`,
    { label: `polish:${t.key}`, phase: 'Polish', agentType: 'general-purpose' }
  ).then((note) => ({ key: t.key, note })).catch((e) => ({ key: t.key, error: String(e) }))
))
return { results: results.filter(Boolean) }
