# Swarm Expansion — Swarm as its own game

2026-10-02 — owner brainstorm, second pass. Companion to [`SWARM_ARCADE.md`](./SWARM_ARCADE.md)
(the meta-game, juice, screens). That pass mostly re-dressed what already exists. The owner asked
for more: "a deep brainstorm with all of gaming in mind, comparatively", new enemy types, attacks,
environments, multiple levels to choose from — "expand this swarm mode as a separate game
essentially" — and said Adventure and the wider game may expand too. This document is that list.

Sizes are relative (S / M / L / XL), not schedules.

## 1. The edge nobody else has

Every game in §2 is a wave game. None of them has SpaceFace's physics: banking shots off rocks,
throwing hulls into each other, tagging them for a gravity well, webbing two together and swinging
the knot into a wall, trap-and-detonate escapes. The Crucible's own line is right: **"Bring the
swarm. Turn the room against it."**

So the expansion filter is: **every new enemy, arena, weapon and mode should give the player more
things to throw, more things to throw them into, or more reasons to do it.** That is how Swarm
stops being "Vampire Survivors in space" and becomes something people describe to each other.

## 2. What Swarm is competing with

| Game | Why it is addictive | What Swarm takes |
|---|---|---|
| Vampire Survivors / Brotato / Halls of Torment | hundreds of enemies, absurd escalation, weapon evolutions, a character roster, cheap runs | real crowd scale (§4 B1), weapon levels + evolutions (B7), pilots (B8) |
| Geometry Wars / Robotron / Nex Machina / Resogun | pure arcade score chase, smart bombs, multiplier pickups, a grid that warps with every explosion | smart bomb, multiplier drops, a neon "Grid" arena (B4), score as spectacle |
| Nova Drift | build a ship from body + weapon + shield + mods that combine wildly | rule-breaking mods and set bonuses (B7) |
| Risk of Rain 2 | stacking items, a teleporter event per stage, loops, artifacts | stages with a finale event (B5), stacking passives (B7), mutators as artifacts |
| Hades | failure moves the story on; heat; gods offering boons; characters you return to | story across runs and sponsors offering boons (B9), Threat tiers |
| Slay the Spire / FTL | a route map of choices between fights: elite, shop, event, rest | the run as a journey on a route map (B5) |
| Dead Cells / Enter the Gungeon | biomes with personality, branching paths, secrets, bosses with patterns | biomes (B4), bosses (B3), secret routes |
| Bloons TD / Kingdom Rush | a ladder of levels, an upgrade beat between waves, stars per level, every level a step up | the level-and-upgrade rhythm (B6), stars (SWARM_ARCADE §6.3) |
| Orcs Must Die / Sanctum / Dungeon Defenders | you fight *and* build traps | **not taken** — placeable turrets/pylons are a separate, later job (owner, 2026-10-02) |
| CoD Zombies / Gears Horde | farthest round wins, mystery box, perk machines, barricades, easter eggs, secret bosses | mystery box, perk stations, hidden easter-egg bosses (B10) |
| Left 4 Dead | an AI director and special infected that break your plan | specialist enemies with hard counters (B2) |
| Helldivers 2 | call-in stratagems, mission objectives, friendly-fire comedy | call-ins (B7), round objectives (B5) |
| Deep Rock Galactic | mission types, biomes, a crew you love, the swarm as weather | round objectives, biomes, pilots |
| Cuphead / Furi | handcrafted boss duels with learnable phases | a real boss roster (B3) |
| Balatro | numbers getting stupidly big, joker synergies, the "I broke it" moment | legendaries that bend rules, score that explodes on screen |
| Galaga / Gradius / Ikaruga | formation attacks, dive bombers, power-up bars, polarity | formation drones, dive attacks (B2) |
| Rez / Tetris Effect / Thumper | the music and the action are one thing | spawns and explosions on the beat (B9) |
| Smash TV / The Running Man | it's a TV show: a host, prizes, a crowd | the Crucible as a broadcast bloodsport (B9) |
| Super Mario Maker / Trackmania | players make and share levels | arena editor using the share codes that already exist (B12) |

## 3. What is holding Swarm back (ranked)

1. **It is not a swarm.** At most 10–30 hulls are on you, and the whole game is capped at 40 ships
   (`spawnBudget.js` `HARD_MAX`). Every enemy is a full physics ship with AI, guns and a detailed
   model. The genre's "swarm" means hundreds.
2. **Every enemy is a ship like yours.** 19 enemy types on about six hull models (wasp, bastion,
   drifter, hornet, leviathan…): pirates, zealots, lawmen. Few silhouettes, few attack patterns —
   mostly "flies at you and shoots a gun".
3. **One real boss.** Four boss rounds, but only the Dreadnought is built as a boss. The others are
   groups of ordinary archetypes.
4. **Five arenas that all feel like one room.** Industrial interiors with different force laws
   (pull, current, freeze, conduct). No darkness, no stars, no black hole, no corridors, no moving
   arena, no alien place.
5. **The run has no shape.** An endless counter. No route, no destination, no choice of where to go
   next, no stage finale.
6. **Every round is "kill everything".** No defend, escort, hold, collect, assassinate or survive
   objectives.
7. **The shop is Adventure's shop.** Cargo scanners, heavy-duty winches, prospecting rigs and bays
   in an arcade shooter. Only one evolution (`storm_carom`) exists, so builds rarely "become"
   something.
8. **No abilities.** No smart bomb, no ultimate, no call-in. All the flair comes from weapons.
9. **The level-up rhythm is flat.** Tower-defense games feel additive because you clear a level,
   upgrade, and the next level is visibly a step up. Swarm's rounds blur into each other, and an
   upgrade is a row bought from a list.
10. **No character.** No host, no crowd, no rivals, no reason you are in the Crucible, no pilots.

## 4. Big bets

### B1 — A real swarm: the Brood tier (XL)
Two populations instead of one:
- **Ships** (today's 10–30): smart, armed, physical, threatening.
- **Brood** (new): 100–400 light bodies at once. Simple flocking on a flat array, collision radii
  only, deterministic (`state.rng`, sim time), instanced rendering. They feel the field kernel
  (wells, repulsors, currents), die against rocks and in explosions, and can be thrown, so **room
  kills scale from 3 at a time to 40 at a time**.
- Brood are *designed objects*, not soft sprites: small modelled creatures/drones, instanced (the
  render tree already batches asteroids this way).
- This single change is what lets every effect in SWARM_ARCADE (multi-kills, PILE-UP, chains of
  100) actually happen.

### B2 — New enemy families and an attack language (L)
**The Brood** (an alien swarm — the headline faction; §9 decision 2):
- *Mites* — tiny, hundreds, flock and dive. Fodder and ammunition.
- *Spitters* — lob acid arcs with a ground marker.
- *Chargers* — wind up with a line telegraph, then dash. Dodge so they hit a rock.
- *Leechers* — latch on and slow you; shake them off by scraping a wall.
- *Burrowers* — hide inside asteroids and burst out.
- *Splitters* — pop into three smaller ones.
- *Brood Mothers* — stream mites until killed.
- *Hive Nodes* — rooted spawners; a round can be "destroy the nodes".
- *Tendrils* — segmented worms (Centipede): shoot a middle segment and it splits in two.

**The Machine** (a rogue Foundry intelligence — fits Ricochet Foundry):
- *Formation drones* — fly Galaga patterns and dive-bomb.
- *Beam turrets* — sweeping lasers you dodge; a sweep also cuts the pack.
- *Shield linkers* — beam a shield between two allies; throw something through the beam to break
  it.
- *Repair drones* — rebuild wrecks into enemies unless you clear the wreckage.
- *Sawblades* — bounce around the room; hazardous, and useful to you.
- *Magnet sentries* — bend your shots.
- *Assemblers* — build a new enemy from debris over 5 seconds.

**The existing pilots** (pirates, zealots, ghosts, corsairs) stay as the smart, human tier.

**Attack families**, each telegraphed and dodgeable: sweeping beams · spiral volleys · walls with
one gap · homing swarms you can shoot down · lobbed area attacks with a ground marker · dashes with
a line telegraph · tether grabs · acid pools · gravity pulls · EMP (one weapon offline for 3 s) ·
cloaking · mimics disguised as pickups.

### B3 — A boss roster (L)
Ten handcrafted, multi-phase bosses with learnable patterns. Each one is beaten with the room, not
just the gun:
1. **Brood Queen** — egg sacs are weak points; she floods the room with mites; final phase she
   hunts you.
2. **The Tendril** — a giant segmented worm through the asteroid field; sling it into itself.
3. **The Crusher** — the Foundry itself is the boss; pistons and walls move; turn them on it.
4. **Mothership** — bigger than the screen; destroy the launch bays, then the core.
5. **The Rival** — a named pilot flying a copy of *your* build. A duel (Furi, a Nemesis rival).
6. **Binary Twins** — two bosses orbiting each other; their tether is the weak point; throw
   something into it.
7. **Storm Leviathan** — a living eel in the Storm Lattice; conduct its lightning back through the
   relays.
8. **The Gravity Engine** — a singularity generator; everything spirals in, including the pack.
9. **Iron Maw** — today's Dreadnought, rebuilt with phases.
10. **The Producer** — the show's own weapon, as the finale (if §9 decision 1 is the broadcast).

Every boss gets an intro card, a health bar, a theme, and a cosmetic for beating it.

### B4 — Biomes and levels (L, one at a time)
Keep the five rooms. Add places that change how you fly, not just the colour:
- **Asteroid Mill** — destructible rocks break into smaller rocks (Asteroids). Ore you shake loose
  is a mid-fight power-up.
- **Nebula Veil** — near-dark. Lightning flashes reveal silhouettes; flares light the room.
- **Event Horizon** — a black hole rim. Everything drifts inward; enemies that fall in are kills;
  sling around the edge.
- **Corona** — a dying star. Solar flares sweep the arena on a clock. Shadows behind rocks are safe;
  enemies in the open burn.
- **Derelict Spine** — corridors inside a megastructure: doors, vents that blast, kill funnels.
- **Comet Run** — a moving arena drifting along a comet's tail; a scrolling shmup interlude.
- **Ring Shepherd** — a gas-giant ring; ice chunks orbit as a moving conveyor of cover.
- **The Hive** — inside the Brood. Living walls grow shut, spawn sacs, acid pools.
- **Wormhole Junction** — the arena edges wrap: fly out one side, appear on the other; shots too.
- **The Grid** — a neon simulation with a background grid that warps with every explosion (Geometry
  Wars). Pure arcade, the daily-challenge home.

### B5 — The run as a journey: the Circuit (L)
- A run is **4–5 stages**. Each stage is a biome of 3–5 rounds plus a stage boss; then
  **Overtime** (endless) for score.
- Between stages, pick the next destination on a **route map** (Slay the Spire / FTL). Node types:
  Fight · Elite · Armory · Event card ("a derelict is broadcasting — salvage it or leave it") ·
  Treasure (pick a legendary) · Repair dock · Mystery box · Challenge · Boss.
- **Round objectives** break up "kill everything": survive 60 s · destroy the hive nodes · defend the
  beacon · escort the freighter · hold the zone · collect cores while swarmed · assassinate the
  commander · reach the gate.
- A full Circuit is a ~30–40 minute run you can *win*, which is what makes the meta-ladder in
  SWARM_ARCADE feel finite and the next run feel close.

### B6 — The level-up rhythm: the tower-defense *feeling* (M)
Owner, 2026-10-02: the tower-defense comparison is about the experience — "swarm levels and
upgrade intermittently" — not about building towers. The beat to nail is: **clear a level → upgrade
→ the next level is harder, and you can feel that you are stronger.**
- **Levels you can name and count.** Rounds belong to a numbered, named level on a ladder
  (SWARM_ARCADE §6.2 zones; B5 stages). The level card says what is new in it.
- **An upgrade beat that lands.** Every clear is a moment, not a menu: the haul counts up, the
  armory opens on "what's new for you", and the ship visibly changes when you fit something — a new
  barrel, a brighter shot, a louder gun.
- **Proof you got stronger.** The results of each level compare to the last: faster clear, bigger
  chain, more room kills. The next level's preview says how much harder it is.
- **Stars and the ladder** (SWARM_ARCADE §6.3) give every level a reason to be replayed.
- **Placeable help is parked.** Turrets, pylons or barricades you place in the arena would be fun,
  but are a separate job and miss the point of a physics-blast arcade swarm game. Not in this
  program.

### B7 — The arcade arsenal (L)
- **Swarm-native weapons** built for density: Arc Caster (chain lightning) · Disc Launcher
  (ricochet saws) · Micro-missile Barrage · Rail Lance (pierces a line) · Plasma Cone ·
  **Singularity Mortar** (a small black hole that pulls the pack together, then pops) · Debris
  Orbit (rocks you capture orbit you as a shield) · Glaive (boomerang) · Time Bubble · Mine Spitter.
- **Weapon levels 1–5** bought in the armory; at max level plus a matching passive, it **evolves**
  (Vampire Survivors). One evolution exists today; aim for 15–20.
- **Stacking passives** (Risk of Rain) and **legendaries that bend rules** (Isaac, Balatro):
  - *Domino* — every kill shoves its neighbours.
  - *Volatile Hulls* — anything you throw explodes on impact.
  - *Chain Feeder* — +1% damage per point of chain.
  - *Echo* — every 5th shot fires twice.
  - *Graviton Heart* — your ship is a weak gravity well.
  - *Bumper Walls* — arena walls bounce enemies back like a pinball table.
  - *Second Sun* — kills ignite whatever is close.
- **Take Adventure-only gear out of the Swarm shop**: cargo, prospecting, scanners, winches, bays.
- **Abilities**, separate from guns:
  - *Smart bomb* — limited charges, clears the screen (Geometry Wars).
  - *Overdrive* — charged by the chain: ×3 fire rate, the music swells.
  - *Call-ins* (Helldivers): Orbital Lance, Turret Drop, Drone Wing, Shield Dome, Decoy, Supply
    Drop.
- The dash keeps a short invulnerable window so dodging through a gap is a skill.

### B8 — Pilots and companions (M)
- **8 pilots**, each with a passive, an ultimate, a starting kit, a voice and a look. Examples:
  - *The Wrecker* — throws hit twice as hard; ult Shockwave.
  - *The Gunner* — fire rate; ult Bullet Storm.
  - *The Ace* — dash resets on every kill.
  - *The Juggler* — thrown hulls fly further and bounce once more.
  - *The Scavenger* — chips are worth double; ult Magnet Storm.
  - *The Zealot* — ex-Choir; heals on kills; ult Hymn (the room freezes).
  - *The Saboteur* — traps and mines.
  - *The Stray* — a Brood defector; mites ignore it for a while.
- Pilots unlock through challenges and stars; each has a mastery track.
- **Companions**: hire a wingman for a run (Adventure's wingman system exists) or carry a drone.

### B9 — Character: the Show (M, then ongoing)
Give the Crucible a reason to exist, and the gratuitous effects a reason to be on screen:
- **The Crucible is a broadcast bloodsport** — the most-watched show in the Helios Reach.
- **A host and a colour commentator** call your kills, chains and deaths.
- **A hype meter** (the chain): at full hype, the crowd throws gifts into the arena.
- **Sponsors** are Adventure's factions. They offer contracts ("kill 20 with the room: +perk") and
  boons between rounds (Hades), and put their decals on your hull.
- **Crowd votes** between rounds: pick 1 of 2 twists ("The crowd demands double darts! ×1.5
  pay").
- **A ranked ladder of named rival pilots** who appear as ghosts and as the Rival boss.
- **Story across runs**: why you are fighting (a debt, a sentence, a title), the producer, and a
  mystery — where does the Brood come from? — that connects to Adventure's alien lore.
- **Music on the beat**: spawns and big explosions land on the beat; layers stack with hype.

### B10 — Modes (M each)
- **Circuit** (the main run, B5) · **Overtime** (endless after a Circuit) · **Boss Rush** (exists
  as Boss Circuit) · **Daily / Weekly** (exist).
- **Chaos** — 1,000 mites, everything maxed, for laughs.
- **Duel** — 1v1 rivals.
- **Time Attack** — fastest Circuit.
- **Hardcore** — one life, no Second Wind.
- **Exhibition** (exists — the sandbox).
- **Custom Lab** — stack any mutators.
- **Secrets** (CoD Zombies): hidden easter-egg steps in arenas that open a secret boss or room.
- **Mystery box and perk stations** inside arenas.

### B11 — Single-player (owner, 2026-10-02)
Swarm stays single-player: no co-op, no versus. Competition stays asynchronous — ghosts (exist),
leaderboards, the daily and weekly boards, shared run codes.

### B12 — Creator tools (L)
An arena editor: place rocks, force fields, machines and spawn gates, script waves, and share them
by code (share codes already exist). Feature community arenas as the daily challenge.

## 5. Expanding Adventure with the same work

One game path means most of this lands in Adventure too:
- **The Brood and the Machine become Adventure threats.** Incursions are sector events where the
  swarm overruns a station and you fight it off — the Brood tier reused in the open world.
  Infestation zones can use the contamination bands that already exist (`alienEcology.js`,
  C0–C5).
- **Swarm bosses become world bosses**: a Brood Queen that roams, bounty contracts on the Tendril.
- **The Crucible becomes a place.** A station you can fly to and enter the show for money and fame.
  Sponsors are factions, so Crucible fame feeds reputation. Adventure already has arena sites
  (`adventureArenaSites.js`).
- **The arsenal is shared**: weapons, abilities and deployables built for Swarm are acquirable in
  Adventure through its own economy.
- **Pilots and companions** become Adventure crew and wingmen.
- The Saucer stays a Swarm-only unlock (SWARM_ARCADE §11 decision 3).

## 6. Quick wins (little new technology)

1. Take Adventure-only items (cargo, prospecting, scanners, winches, bays) out of the Swarm shop.
2. Hide Adventure HUD instruments in a swarm run (SWARM_ARCADE §7.5).
3. Chain hero + kill popups (SWARM_ARCADE §5).
4. Write 10+ evolutions from existing weapons and modules (data).
5. A smart bomb on the existing repulsion/impulse kernel.
6. Elite affixes through the existing doctrine stamps and stat scaler.
7. Crowd votes between rounds using the existing mutators.
8. Wrap-around edges or bumper walls as an arena law.
9. Boss intro cards and health bars for the four existing boss rounds.
10. Two round objectives from existing systems: survive a timer, defend a beacon.

## 7. Suggested order

1. **Additive and loud** — SWARM_ARCADE steps 1–2 (bank, Hangar, juice), the level-up rhythm
   (B6), plus the quick wins.
2. **A real swarm** — the Brood tier (B1), the Brood family (B2), the Asteroid Mill and the Hive
   (B4), the Brood Queen and the Tendril (B3).
3. **A journey** — the Circuit with route map and objectives (B5), the arsenal with levels,
   evolutions, legendaries and abilities (B7).
4. **A world** — the Show (B9), pilots (B8), the Machine faction, the rest of the biomes and
   bosses; Adventure incursions (§5).
5. **Sharing** — arena editor (B12), global boards.

## 8. Laws that still hold

- One game path: Swarm content runs on the same sim, physics and assets as Adventure.
- Determinism: the Brood tier and every new system use `state.rng` and sim time.
- Performance comes from algorithms, batching and instancing, never from cutting the look.
- A camera-facing soft square or disc is never a designed object. Brood bodies are modelled.
- Every effect obeys reduced-motion and reduced-flash settings.

## 9. Owner decisions (answered 2026-10-02)

1. **The fiction.** The Crucible is a broadcast bloodsport: host, crowd, sponsors, rivals (B9).
2. **The swarm faction.** Both, with the Brood as the headline and the Machine second. Adventure's
   alien lore says the fungus colonises dead hulls but never flies a ship (`alienEcology.js`), so
   the Brood is written as its own creature, not as that fungus, unless the owner later rules the
   lore changes.
3. **Tower defense.** The *feeling* only: levels you clear and upgrade between (B6). No placeable
   turrets or pylons in this program; "environmental help" like that is a separate, later job.
4. **Co-op.** Never. Swarm is single-player (B11).
