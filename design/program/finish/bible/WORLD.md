<!-- LIFETIME: ACTIVE_PROGRAM -->
# WORLD — sectors, factions, the journey, the voice

Facts (ids, names, existing lore) live in code: `src/data/sectors.js`, `src/data/factions/*.js`,
`src/story/`, `docs/worldbuilding`. This file is the **intent** that makes them a coherent, readable
world. Reconcile with the code; keep authored lore; sharpen it toward play.

## 1. The ten sectors — one screenshot each

Every sector must be identifiable from one gameplay-zoom screenshot without labels (master plan W3).
Each has: **a palette and light**, **a sky**, **a resident job**, **a hazard that's a verb**, **its
Hotspots**, **its sound**.

| Sector | Palette / light | Sky | Resident job | Hazard as a verb | Hotspots | Sound |
|---|---|---|---|---|---|---|
| **Helios Prime** | warm white sun, gold highlights, blue shadows | a bright sun disc, a ringed gas giant | trade and mining — the busy heart | asteroid belt for slingshots | Big Dig, Station rush hour, Ring Circuit | radio chatter, traffic hum |
| **Ceres Belt** | dusty amber, low sun | dense belt, dust streaks | heavy industry, shipbreaking, freight | dust lanes that hide you (and pirates) | Shipbreaker, Throughline | grinding, distant hammering |
| **Tethys Junction** | neon teal and magenta | a crossroads of jump lanes | trade crossroads, smuggling | lane currents you can ride | Junction Market, Split Station | market noise, gang radio |
| **Vesta Forge** | molten orange on black | the forge glow on a red giant | foundries | heat lanes | Forge, Red Cable Yard | hiss, pours, clanks |
| **Pallas Drift** | bright reef colours, coral-like debris | a scattered reef field | salvage, sport | high-bounce debris | Drift Derby | crowd roar, pinball pings |
| **Io Reach** | volcanic yellow and sulphur green | a volcanic moon | moonlet herding, mining | eruption plumes that push | Shepherd's Ring | rumble, tug engines |
| **Charon Expanse** | cold blue-violet, faint light | a dim distant sun | scavenging, old battlefields | dark zones where only lights show | Hull Garden | quiet, wind-like static |
| **Sker Haven** | red and black, harsh lights | a red dwarf | piracy, black markets | minefields | Pirate Citadel | bass music, threats |
| **Veil Nebula** | violet and electric blue storm | a living nebula | navigation, research | storm walls and lightning | Lighthouse | thunder, eerie tones |
| **Ashfall Reach** | grey ash and ember orange | a dying, ash-choked system | frontier towing, endings | ash drifts that slow | Towed Moonlet, Gladiator Pit | ember crackle, crowd |

## 2. The fourteen factions — read them at a glance

Each faction needs a **visual grammar** (KIT K4/K5: livery, kit style, light pattern), a **driving
style** (CHAOS CH-61 personalities skew), a **voice**, and **what they want from you**. Reconcile
with `src/data/factions/*` and `design/foundry/FACTION_SURFACE_LANGUAGE.md`.

| Faction | Role in the world | Livery and kit | Light pattern | Driving style | Voice | Wants |
|---|---|---|---|---|---|---|
| **Solar Concord Navy** (`faction_scn`) | the law | clean white-blue, uniform plates | blue-white strobes | disciplined, formation | clipped, procedural | order; fines; your cooperation |
| **Meridian Trade Syndicate** (`faction_mts`) | corporate freight | polished teal-gold, logo panels | steady running lights | cautious, by the lanes | polite, transactional | cargo delivered; no trouble |
| **Drift Miners Collective** (`faction_dmc`) | miners' union | dust-yellow, tool racks, patched | work floodlights | slow, careful, stubborn | gruff, solidarity | fair prices; protection |
| **Free Frontier** (`faction_free`) | independents | mismatched, personal liveries | varied | individualist | laid-back, funny | to be left alone |
| **Crimson Reach** (`faction_reach`) | the big pirate fleet | red-black, skull stripes, scrap armour | red running lights, dark when hunting | aggressive, packs | swagger, threats | loot; fear |
| **The Pitborn** (`faction_pitborn`) | gang from the Split Station | rust and scrap, welded junk | flickering, broken lights | reckless | street slang | turf; respect |
| **Ascendant Choir** (`faction_choir`) | a zealot cult | magenta-white, spires, halos | pulsing halo rings | protective of each other | chanting, cryptic (short!) | converts; relics |
| **The Quiet** (`faction_quiet`) | silent watchers | matte black, no markings | almost none | ghostly, stealthy | silence, or one word | secrets |
| **Helix Directorate** (`faction_helix`) | research and corporate science | white and green, sensor arrays | precise grid lights | careful, scanning | clinical | data; specimens |
| **The Archive** (`faction_archive`) | record keepers | bronze, document holds | soft amber | slow, neutral | formal | records of what you did |
| **The Fulfillment** (`faction_fulfillment`) | logistics megacorp | orange-white, container racks | warning beacons | relentless, on schedule | automated, cheerful-sinister | throughput |
| **The Understory** (`faction_understory`) | the underground | dark green, hidden compartments | dim | sneaky | whispers | smuggling partners |
| **The Vael** (`faction_vael`) | mysterious others | organic-crystal hulls | bioluminescent | alien | strange, minimal | unknown |
| **The Verge-Layers** (`faction_verge_layers`) | frontier builders | grey-orange, construction kit | construction strobes | busy, practical | builder banter | infrastructure |

**Rule:** from the top-down camera, a reviewer names a ship's faction from livery and lights alone (R5).

## 3. The shape of the journey (Adventure)

Master plan W1 owns the Journey doc; this is the creative direction it should start from. It uses
the existing spine (`src/story/campaign47a/`) and endings A–E — **arrange, don't rewrite**.

| Act | Where | You are | You learn | Signature set piece | Ends with |
|---|---|---|---|---|---|
| **1. The Hitch** (≈ 60–90 min) | Helios | a nobody with a rope | flying, the Line, towing, the first heat, the ship sheet | the Big Dig raid: pirates hit the rig, you choose a side | a choice that splits into trade / combat / outlaw loops |
| **2. The Belt** (≈ 2–3 h) | Ceres, Tethys | a rising name | heists, hijacks, convoys, gangs, a heavier ship | the Shipbreaker heist: steal the reactor core | a betrayal; the first named hunter |
| **3. The Fire** (≈ 2–3 h) | Vesta, Pallas, Io | a player in the war | factions, the Juggernaut ladder, sieges | the Towed Moonlet: you decide where it lands | the factions go to open war |
| **4. The Edge** (≈ 2 h) | Charon, Sker, Veil, Ashfall | someone who can change the system | everything at once | the finale chosen by your deeds (endings A–E) | an ending that names what you did |

Side content hangs off every act: Hotspot activities, bounties, races, the Gladiator Pit (Swarm).
**Rule:** at any moment the player can see what to do next (master plan W1 check), and the world is
always busy around them (CHAOS life count).

## 4. The voice of the world

- **Barks** ≤ 8 words, in character, one at a time, never lore over action (R10).
- **Briefs** ≤ 3 sentences: who, what, what's in it for you.
- **Labels** plain: "Hijack", "Tow", "Repair 22 cr" — not "Custody Transfer Clause".
- **Tone:** wry, working-class space; people have jobs and opinions; the funny and the dangerous sit
  side by side (GTA radio, Firefly crews, Freelancer bar talk).
- **Lore** belongs in the bar, the codex and the quiet ruins — never over the action.

**Examples (target voice):** shuttle after a near-miss: *"Lane's not yours, pal!"* · police at heat 1:
*"Unregistered hull, cut your engines."* · Crimson Reach on spotting cargo: *"Ooh. Heavy. Ours now."* ·
Drift miner when you save their rig: *"Owe you a drink. Maybe two."* · Choir zealot: *"The halo holds."*
