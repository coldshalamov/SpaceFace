# SpaceFace — the game dossier for interface work

Everything a designer with no access to the repository needs to know about the game before drawing
a screen. Facts here are live as of 2026-09-10; strings in quotes are the exact words the game
shows today and should be reused verbatim unless the packet says otherwise.

---

## 1. What the game is

SpaceFace is a **top-down, third-person, physics-driven space sandbox** for desktop (browser and
Electron; 1920×1080 is the shipping frame, 1280×720 and 2560×1080 must also work). You personally
fly one ship with real momentum through a small, busy, living local universe: miners mine, haulers
haul, patrols patrol, pirates hunt traffic, prices move, factions remember. You fly, mine, trade,
fight, tow, tether, upgrade, and build passive income — and almost everything you see is something
you can interfere with.

The owner's fantasy, in the owner's words: *"I understand how this world moves, and I can use that
understanding to do ridiculous things."* The game's unique proposition is **physical agency inside a
working world**: hit a pirate with a concussion weapon and he tumbles into an asteroid; tether him
with the Massline and swing him into his wingman; drop a gravity well into a formation and fire
something explosive into the mess. The target feeling is *"Holy shit, I did that."*

The tone is **fast, colourful, physical, a little irreverent**. It is not grimdark, not military
sim, not a spreadsheet, not a cockpit sim. The camera is a chase camera above and behind the ship;
you see your ship in the world. There is no cockpit view and never will be.

## 2. The player's loop and the screens that carry it

| Loop | Screens (register in `02_ART_DIRECTION.md` §3) |
|---|---|
| Boot, choose, return | **Title** (POSTER), New game (POSTER), Load (BENCH), Settings (BENCH) |
| Fly and fight | **Flight HUD** (EDGE), pause overlay (EDGE), game over (POSTER) |
| Dock and do business | Docking arrival (POSTER), **Station**: Market, Shipworks, Industry, Missions/Contracts, Factions, Bar, Ledger (BENCH) |
| Understand the world and the ship | **The chart** (BENCH), **THE SHIP** (BENCH), THE FOOTPRINT (consequence graph), THE RANGE (practice box), missions log, codex, help, tech tree (BENCH) |
| Arena mode | **Crucible door** (POSTER), draft / refit (BENCH), results (POSTER) |
| Mining minigame | Asteroid Works (EDGE chrome over a 3D board; keeps its own accepted law) |

## 3. The world's nouns (use them; do not invent others)

- **Your ship:** the starter hull is the *Kestrel*, nicknamed **"Hitch"** — a scout-class tug
  ("Turns wide. Sluggish under load. Stops badly."), 32 t, Vector Reaction Drive M, one Pulse
  Laser S, one Mining Laser S, a Shield Booster S, 40 u cargo. Other hulls seen in the game: Pelican,
  Mule, Drifter, Thunderchild. Hulls are real 3D models and can be rendered for tiles.
- **Places:** Helios Prime / **Helios Station** ("Trade Hub · Class L · Solar Concord Navy"),
  Ceres Belt and Ceres Refinery, Vesta Forge, Tethys Junction, Pallas Drift, Io Reach, Dione Lane,
  Charon Expanse. The 47-A Recovery Site is the opening contract's target.
- **Factions:** Solar Concord Navy (the law at Helios), Tethys Legal, a Coalition, customs, belt
  outposts, pirates, understory salvors. Fourteen faction crests exist as vector art.
- **Systems the interface shows:** credits (cr), hull, fuel, hold (cargo units), munitions, heat
  (your wanted level: CLEAN / MARKED / WANTED), reputation per faction, sector law and jurisdiction,
  contracts with payouts and risk, commodity prices with demand and trend, tech nodes and modules,
  named ace pilots who remember you, a consequence ledger of what you did.
- **Physics verbs on keys 4–8:** Seed (mass seed), Well (gravity pull), Repel (shove), Cone
  (clearing cone), Skim (skim collector); plus Line (the Massline tether), tow, brake, boost. These
  are the game's signature tools and deserve real icons.
- **Crucible:** the arena mode. Modes: Swarm, Gauntlet, Daily, Weekly, Ghost. Starter builds:
  Web Weaver, Ricochet Runner, Baseline Energy, Baseline Kinetic, Physics Toolkit, Massline Rig.
  Arenas: Ricochet Foundry, Lagrange Crucible, Cinder Sluice, Cryo Drift, Storm Lattice. A seed
  number selects the run.

## 4. Exact live strings by screen (reuse verbatim)

**Title.** Wordmark "SPACEFACE". Status line "CONTRACT 47-A REMAINS OPEN". Save line "No save
found - New Game opens Contract 47-A in Helios." Menu: NEW GAME · CONTINUE · LOAD GAME · SETTINGS ·
CRUCIBLE · SIGNAL ARCHIVE · SANDBOX (dev builds only) · QUIT GAME. A version string sits bottom-left.

**Crucible door.** Title "Crucible". Tagline "Bring the swarm. Turn the room against it." Rows:
Mode (Swarm · Gauntlet · Daily · Weekly · Ghost) with the line "Clear a round. Spend the spoils or
save for a bigger toy. Push your build as far as it goes." and "No ghost for this seed yet."; Starter
build (Web Weaver · Ricochet Runner · Baseline Energy · Baseline Kinetic · Physics Toolkit ·
Massline Rig) with "Bank a stream of bullets around cover. Shove the pack into the rocks, then boost
through."; Arena (Ricochet Foundry · Lagrange Crucible · Cinder Sluice · Cryo Drift · Storm Lattice)
with "Hard banks, tight gaps and moving machinery. Turn pursuit into a pile-up."; Seed "4242" with
"New seed"; a collapsible "Records & challenges"; actions "Launch Swarm" and "Back".

**Flight HUD.** Top-centre one-line tip: "Light ships are ammunition. Swing a rock. Keep the
speed." Comms tape "BAND OFF ---". Sector law block: "SECTOR LAW · HIGH SECURITY · HELIOS PRIME ·
JURISDICTION · SOLAR CONCORD NAVY — Attacking civilians, patrols, or stations triggers dispatch.
Rapid patrol response; reserve units available." Contacts: "Local contacts 21" then rows like
"Derelict · 222 · ▸ 20 · ??? UNSCANNED", "Relief-Freighter · DERELICT · 708", "+17 · 5 WRECKS · 12
OTHER". Status "0 / 10" with ten segments. Band tabs "BAND · COMMS · HAIL —". Log "LOG KESSLER —
Kestrel, that pulse is the job. Tag the sealed mass. Do not open it." Objective "Recover the 47-A
sample from the marked rock · 47-A Recovery Site · 679 WU · ETA 7s". Ship block: ENERGY 80, DRIVE
100, a hull silhouette. Speed "95" with "weapons Pulse Laser S" and "class Hitch · Starter ·
Reaction". Action bar: "ORDNANCE  Y  R  SPACE  LINE · FIELDWORK  4 SEED  5 WELL  6 REPEL · RIG  7 CONE
8 SKIM". Radar: N, "RANGE 4.0K", "YOU". Bottom-right "OBJ 679U · HELIOS PRIME". A world tag on the
ship "Payload · TOW · 69% · READY".

**Station shell.** "HELIOS STATION — Trade Hub · Class L · Solar Concord Navy". Vitals "HULL 140 /
140 · FUEL 100 / 100 · HOLD 0 / 40 U · MUNITIONS Low · RESUPPLY · 66 MUN · 792 CR". "CREDITS 5,000
cr". "UNDOCK · READY". Destinations: MARKET · SHIPWORKS · INDUSTRY · MISSIONS · FACTIONS · BAR ·
LEDGER. Getting-started strip "1 SELL WHAT YOU HAULED · 2 JOB ON THE BOARD · 3 SAFE TO UNDOCK".

**Market.** "STATION EXCHANGE 45 / 45 visible", filters "ALL STOCK 45 · IN HOLD 0 · RAW & RARE 21 ·
INDUSTRY 12 · CIVILIAN 6 · SALVAGE 3 · MILITARY 3 · RESTRICTED 0", commodities like "IRON ORE · RAW
ORE · 79 CR · ▲ UP 6% · NORMAL DEMAND · Cyclic", detail "Iron Ore · Legal · RAW ORE", explanations
"Demand ↑ Trade Hub consumes Iron Ore · Tight core · No conflict · Cyclic", a price history, "BUY 79
cr / SELL 73 cr / GALACTIC AVG 28 cr / DEMAND Normal", trade console "BUY · SELL · Quantity 1 u ·
Total cost 79 cr · CONFIRM PURCHASE", "TRADE ROUTES — No profitable runs known from here yet".

**Missions / contracts.** Cards like "01 FIRST TRADE: 8U FUEL CELLS TO CERES · RECOMMENDED · SOLAR
CONCORD NAVY · 420 CR", detail "Solar Concord Navy · CARGO DELIVERY — First trade: 8u Fuel Cells to
Ceres — Helios logistics needs one reliable corridor haul…", "REWARD 420 cr", "RISK ASSESSMENT
ROUTINE", route "This station → in-sector → PREP fit + fuel → Ceres Refinery", outcome "SUCCESS +420
cr +3 Concord rep / FAILURE No collateral loss −2 faction rep / READINESS ROUTE CLEAR", action
"ACCEPT + BIND ROUTE", "ACTIVE MISSIONS 1 · Contract 47-A · TRACKED".

**THE SHIP.** "HITCH · Starter · T0 · ACTIVE", "SOUND 100%", hardpoints "UTILITY OPEN / S · ION
THRUSTER M PHYSICAL / M · CARGO OPEN / S · SHIELD BOOSTER S SYSTEM / S · PULSE LASER S PHYSICAL / S ·
MINING LASER S PHYSICAL / S", "DRAG TO ORBIT · PINCH TO ZOOM", dials MASS 32t · ENERGY 80 · SHIELD
115 · CARGO 40u · THRUST 145 · HEAT 10, bands "HANDLING Agility 22.71 · Top speed 145 · Inertia 27 ·
Brake 46.9 · scout · Vector Reaction Drive M", "POWER +2/s · CAP 80 · REGEN 12/s · DRAW 10/s",
"CONDITION SOUND — No living-hull marks yet", "WHAT YOU CAN DO NOW: BREAK AWAY INSTANTLY 150 IMPULSE ·
CARRY 40 UNITS · TOW THINGS THAT DO NOT WANT TO BE TOWED (NEXT)", "LOADOUT PRESETS 0/6", actions
"TAKE IT TO THE RANGE · RECORD · SELECT A SLOT", build identity "STARTER · 4/6 systems fitted · 14t
modules", slots Energy core 80 · Weapon 1/1 · Shield 1/1 · Engine 1/1 · Mining 1/1 · Utility 0/1.

**The chart.** "STAR CHART — NAV CHART / SURVEY TABLE", scopes LOCAL · SYSTEM · GALAXY, "WORKING 63 /
140 · thin security", lenses in groups PLACE (Services, Holdings, Discovery), FLOW (Route, Mission,
Pressure), TROUBLE (Events, Security, Faction, Hazard), "MARKET LENS · COMMODITY Iron Ore", sectors
drawn as star systems, "POSITION Helios Prime · TRACKING Beacon 345 WU · DESTINATION · NEXT LEG",
inspector tabs OVERVIEW · TRAVEL · MISSIONS · ECONOMY · THREAT · CAREERS · SERVICES · DISCOVERY ·
HISTORY, actions "RETURN TO SHIP", "FRAME SHIP + DESTINATION", "ENGAGE ROUTE", "CARGO DECK — NO
VIABLE DECK ROUTE".

## 5. What has been tried and rejected (do not produce these)

Ten passes have been made at this interface since July 2026. Every one converged on the same
result: **text in bordered boxes on a black or gray ground** — a settings page, an admin console, a
web dashboard. The owner's verdicts, in order: "generic AI sci-fi" (cyan wireframe, uppercase
monospace, cramped floating panels); "cheap Web game"; "gray, bleak, vibe-coded, harsh fonts";
"none of them look like games"; and on 2026-09-10, of the current screens: "a bit generic and
simple for an A-list spaceship game … equally bad each time."

Specifically rejected motifs: cockpit/visor/windshield framing and screen-edge arcs; pilot avatars
in corners; cyan-on-black wireframe; neon; monospace as a look; tracked-out uppercase labels
everywhere; cramped centred panels with the scene bleeding around them; shadcn-style neutral
cards (judged cheap); gray-blue palettes; a "minimal" treatment that is words on black.

The one thing the owner has liked: **Asteroid Works** — the mining board, which is real rock
texture under warm directional light with a physical machine and almost no chrome. Read that as
the taste signal: *material, light, physicality, warmth.*

## 6. Why this pass is different (so you know what is being asked of you)

The previous passes were styled in CSS by coding agents in one sitting each. This programme
produces the interface the way a studio does: **rendered style frames first** (pictures of the
finished screens, which you may be asked to make), then **produced assets** (plates, icons, marks,
rendered tiles, 3D sets), then code that assembles those assets to match the frames, then a review
that compares the live capture against the frame. Your work product is judged against the frames
and the art direction, never against the current screens. The current screens are shown to you only
as the *content inventory* (what must be present) and as the *before* picture.

## 7. Files in this packet's `current/` folder

Captures of the current screens at 1920×1080, named by surface. They show what information each
screen carries today. They are not references for look, layout, type, colour or composition.
