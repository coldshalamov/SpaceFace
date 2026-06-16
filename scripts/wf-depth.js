export const meta = {
  name: 'spaceface-depth',
  description: 'Implement the depth systems: missions (direction), automation (passive income), and save/load',
  phases: [{ title: 'Depth systems', detail: 'missions, automation, save' }],
}

const CONTRACT = `You implement ONE system of the SpaceFace game by REPLACING its stub (cwd: C:\\Users\\93rob\\Documents\\GitHub\\SpaceFace). The full core loop already works & is verified: fly/fight/mine/dock/trade(economy)/jump(world)/factions/full UI are all implemented and live. You add a depth system.

READ FIRST: ARCHITECTURE.md (§0 constants, §2.3 update order, §3 GameState schema, §4.4 MASTER EVENT TABLE, §4.5 save). Your design spec under design/specs/. The systems you integrate with: src/systems/economy.js (sole credits writer — emit economy:grantCredits/economy:chargeCredits), src/systems/factions.js (emit faction:repDelta), src/systems/world.js (sectors/enterSector), src/systems/cargo.js, src/systems/combat.js (makeEnemySpawnSpec), src/systems/ships.js. Data in src/data/.

NON-NEGOTIABLE: export const <name> = { name, init(ctx){}, update(dt,state){}, ... } (keep the export name; do NOT edit main.js/registry.js/loop.js or other systems' files — only your own). init(ctx)={state,bus,three,registry,helpers}; subscribe in init, per-tick in update. Create entities only via ctx.helpers.spawnEntity. Events use ':' names per §4.4 with documented payloads. SINGLE-WRITER (§0.6): never write credits/rep/cargo directly — emit the intent events. DETERMINISM: use state.rng()/seeded streams, never Math.random(). Verify with node --check (no 'three' import).
RETURN a short note: file(s) written, events emitted+handled, state touched, simplifications.`

const tasks = [
  { key: 'missions', file: 'src/systems/missions.js', spec: '07-missions-contracts-story-spine.md', prompt:
    `Implement the \`missions\` system (src/systems/missions.js). Consume src/data/missions.js (MISSION_TYPES, STORY_BEATS, OFFER_MIX, MISSION_TUNING), commodities, sectors, factions.
    - Boards (§3.11): state.missions.boards[stationId]={refreshEpoch,slots:[offer]}. Generate offers deterministically (mulberry32(hash32(state.meta.seed,stationId,refreshEpoch))) per OFFER_MIX on dock:docked / when first viewed; refresh after MISSION_TUNING interval. Offer types: cargo delivery, bounty hunt, mining quota, etc. with reward formulas scaling with distance/risk/faction; include destination, cargo/target, reward, deadline, factionId.
    - Handle ui:acceptMission{missionId} → move to state.missions.active, emit mission:accepted. Track objectives by listening: economy:tradeCompleted + dock:docked at destination (delivery), entity:killed (bounty), mining:yield (quota). On success emit mission:completed{missionId,type,factionId,repMult} + economy:grantCredits + faction:repDelta + research:pointsChanged for some. mission:failed/expired on deadline. mission:updated for the board/HUD.
    - Story: 8-beat FSM (STORY_BEATS) advancing on triggers (first mine, first trade, first kill, first dock, etc.) → emit story:beatAdvanced + toast giving the player direction. update(dt): decrement TTLs, expire, check story triggers. The station Missions tab reads state.missions.boards[stationId]; the HUD objective tracker reads state.missions.active — populate both.`,
  },
  { key: 'automation', file: 'src/systems/automation.js', spec: '08-automation-passive-income-anti-idle-layer.md', prompt:
    `Implement the \`automation\` system (src/systems/automation.js) — the signature anti-idle passive-income layer. Consume src/data/automation.js (DRONES, TRADERS, OUTPOSTS, AUTO_BALANCE).
    - state.automation (§3.9): drones[], traders[], outposts[], fleet[]. Mining DRONES auto-mine nearby asteroids to a shared buffer (deploy near a field, sell/return). Hired TRADERS on a route generate passive credits per cycle (emit economy:grantCredits) minus upkeep (economy:chargeCredits) with a pirate-loss risk roll (state.automation.rng). OUTPOSTS produce income/goods over time.
    - Balance per AUTO_BALANCE: passive income is CAPPED relative to active earnings (passiveCapFrac), has upkeep + risk, supplements not replaces. Offline catch-up bounded by offlineCapSec. update(dt): accrue on cadences; emit automation:incomeCredited, automation:assetLost, automation:outpostRaided.
    - Handle purchase/assign intents from the AutomationPanel UI (ui:fleetOrder{shipId,order,targetRef} and a buy intent — read what src/ui/screens/automationPanel.js emits and handle those event names; if it calls registry.get('automation').<method>, expose those methods). First-pass: buying a trader and seeing capped passive credits accrue (with upkeep) is the bar. Expose the data the panel reads.`,
  },
  { key: 'save', file: 'src/save/saveSystem.js', spec: '11-procedural-audio-save-load-meta.md', prompt:
    `Implement the \`save\` system (src/save/saveSystem.js). src/save/checksum.js (fnv1a) and src/save/migrations.js (MIGRATIONS, CURRENT_VERSION) already exist — import them. Consume src/data/saveVersion.js.
    - Do NOT implement newGame() (main.js owns bootstrap; adding newGame would override boot). Implement serialize/save/load/autosave only.
    - Envelope (§4.5): { fmt:'spaceface-save', version, savedAt, playtimeS, slot, checksum, data:{[saveKey]:state} } using the §4.5 save-key→system map. For each serializable system, prefer calling its serialize() if it exposes one (economy/world/factions/missions/automation may); else read the documented state directly. Serialize entities as plain objects (player + persistent, pos/vel as {x,z}, NO mesh/THREE refs). checksum=fnv1a(JSON.stringify(data)).
    - localStorage (sf.save.<slot> + sf.save.index) + JSON export/import. Load: validate fmt+version → migrate(MIGRATIONS) → clear transient (despawn entities, dispose) → restore deps-first (player→cargo→economy→factions→world→entities→missions→automation→settings), calling each system's deserialize() if present → re-emit entity:spawned so render rebuilds meshes → rebuild state.rng from meta.seed → emit save:loaded. Handle game:save/game:load (F5/F9 routed by ui), and autosave on dock:docked/sector:enter/mission:completed (debounced ≤1 write/10s; never mid-jump). MUST be robust: a missing/corrupt/old save must never crash boot or the game.`,
  },
]

phase('Depth systems')
const results = await parallel(tasks.map((t) => () =>
  agent(`${CONTRACT}\n\n=== YOUR SYSTEM: ${t.key} ===\nDesign spec: design/specs/${t.spec}\nFile to write: ${t.file}\n\n${t.prompt}`,
    { label: `impl:${t.key}`, phase: 'Depth systems', agentType: 'general-purpose' }
  ).then((note) => ({ key: t.key, note })).catch((e) => ({ key: t.key, error: String(e) }))
))
return { results: results.filter(Boolean) }
