<!-- LIFETIME: STABLE -->
# 05 — Asset roster

Every asset family the game still needs, with a priority, a source and a reason. **P0** serves the
§33 swarm core and the first hour, **P1** the campaign, **P2** depth.

**Source rules.** *Reuse* names an existing model (in `src/data/modelTruthCensus.json`), data row or
system. *Kit* means a reusable dressing set (geometry plus material) applied to existing bodies;
kits are how one model serves several factions. *New* means a new body built with Forge
(`tools/blender/forge/FORGE.md`), judged by looking at the live renderer at the gameplay camera
(`scripts/fleet-look.mjs`, `scripts/flight-look.mjs`). Generated 2D art is allowed where the owner
ruled it (memory: authored 2D images anywhere): portraits, planets, rock and creature textures,
icons.

**Two laws for every body below.**

1. **Silhouette first.** The role reads from shape and engine colour at the chase camera with no
   marker (01 §4).
2. **Scale cues.** Anything above T3 carries windows, ladders, stripes or doors that state its size
   (01 §4).

---

## 1. The Katamari ladder — throwables (the most important table in this file)

The player must *always* see something they can just barely move (§33 rows 483 and 485). Each tier
needs at least six bodies that read as that tier at a glance. Mass is the design target in tonnes.

| Tier | Mass (t) | Bodies | Source | P |
|---|---|---|---|---|
| **T0** | ≤ 5 | pebble rocks (3 shapes); debris shards (reuse `aftermath_frag_*`); buoy caps; mail pods; crate S | reuse plus **new pebble set** | P0 |
| **T1** | 5–30 | cargo pod (reuse `cargo_pod_standard`, `_hazmat`, `_breached`); ore rock S; ice block; crystal S; lane buoy (reuse); decoy pod; **ballast ball S** | reuse plus **new ballast ball, ice and crystal families** | P0 |
| **T2** | 30–300 | container (reuse `pod_cargo_container`); ore rock M; slag berg S; ice spire S; homestead module; toll pylon; habitat pod (reuse); **ballast ball M** | reuse plus new | P0 |
| **T3** | 300–3,000 | container rack (reuse); ore rock L; slag berg L; hopper lid (reuse `aftermath_deb_ore_freighter_hopper_lid`); wreck sections (reuse `aftermath_wreck_corvette_*`); **light hulls as projectiles** (Wasp, Corsair, Reaver); **ballast ball L** | mostly reuse | P0 |
| **T4** | 3k–30k | hauler hulls (reuse traffic hulls); ore-freighter drive bell and ring span (reuse); Breaker chunks (reuse `ceres_breaker`); station modules (**new kit**); Anchor-beast rocks; Bristle-ram cages | reuse plus kit | P1 |
| **T5** | 30k–150k | derelict freighter (reuse traffic hauler with stripped states); **station chunk** (new: a broken ring section); dreadnought plates (from `dreadnought_boss`); Hive-hulk sections | new plus reuse | P1 |
| **T6** | the whole thing | **the Iron Maw** (a whole derelict dreadnought, B7's last tow); a Fulfillment Clerk capital | reuse `dreadnought_boss` with a tow rig | P1 |

**Throwables must break into the next tier down.** A T3 wreck section that hits hard enough splits
into T2 and T1 pieces (the existing `hullBurst` and `hullFracture` modules). That is what keeps the
arena full of ammunition (§33 row 487).

## 2. Rock and material families

Today's `src/data/physicsMaterials.js` defines materials **per body class** (ship, rock, pod…).
A rock-throwing game needs materials **per substance**. These are new (row 509), and they layer on
top of the body classes without replacing them.

| Substance | Feel | Restitution | Break behaviour | Impact VFX | Colour language | Where |
|---|---|---|---|---|---|---|
| **Metallic ore** | heavy, dense | low | dents; splits into 2–3 chunks only at high energy | white sparks, ringing flash | gunmetal with blue sheen | Ceres, Hyperion |
| **Silicate** | ordinary rock | medium | crumbles into many chunks | dust puff, chips | warm grey and tan | everywhere |
| **Ice** | light, brittle | medium | shatters into ricocheting shards; **loses mass in sunlight** | glitter burst and mist | white and cyan, translucent | Nereid, Haumea |
| **Slag** | hot, soft | very low (it sticks) | deforms; ignites spore drift | glowing splash, embers | black crust over orange glow | Vesta |
| **Crystal** | rings | high | shatters; **resonates** (Choir bells, Phoebe) | prismatic flash plus a ring pulse | violet and clear | Phoebe, Veil |
| **Reef metal** | springy | very high | rarely breaks | bright bounce flash | rust and teal | Pallas |
| **Cooked rock** | radioactive | medium | crumbles; leaves a glowing patch | green-white glow | black with green fissures | Charon, Rhea |
| **Vethari wreck-bone** | very light, very strong | medium | almost never breaks | dull chime | ivory and grey, alien curves | Ashfall, the Bolus |
| **Bloom husk** | soft, sticky | very low | squashes; sticks to what it hits | spore puff | green veins on brown | wherever the Bloom is |
| **Junk (ballast)** | magnetic | low | sheds parts that stick to other junk | scrap rattle, sparks | rust, primer and gold | Pitborn yards, Cull arenas |

Each needs a material in the look owner (`src/data/lookMoods.js` with `LOOK.md`), a physics entry,
an impact VFX family (§9), and generated textures. Hand-made rock bodies: **5 today, 24 needed**
(three sizes by eight substances) (P0).

## 3. Player ships

The 15 hulls (`src/data/ships.js`) stay one per role. Hitch stays frozen (`build_map.md` §26). What
is missing is **choice within a role** and **visible growth**:

- **Line Class on the hull (P0).** The winch head, cable thickness and tow aura grow visibly with the
  Line Class (08 §2). A Class VII Hitch looks like it could tow a station.
- **Three frames per hull (P1)**, built as module-driven visual kits, not new hulls:
  - *Light*: stripped plating, bigger engines, faster.
  - *Heavy*: armour cheeks, ram plate, slower.
  - *Line*: an oversized winch boom and anchor pads, which raise the Line Class cap.

  This answers §31.0 fault 5 ("a player cannot choose within a role") without commissioning 30 hulls.
- **Wear and provenance (P1).** Repairs, welds (Slate's seams) and trophy decals accumulate on the
  hull the player flies, which is VISION's "my fucking ship" (row 440 exists).

## 4. Enemy, faction and machine bodies

Consolidated from 02 and 03. Each faction gets **a kit first** (so every existing hull can wear its
identity), then the new roles it needs.

| Faction | Kit (P) | New bodies |
|---|---|---|
| Concord | white enamel and beacon kit (P1) | Picket P1 · Commander mast variant P1 · Clamp Tender P1 · Scale Barge P1 · Gate Frigate P2 |
| Meridian | gold ticker-strip kit (P1) | Spine Tug P1 · Coupler link P1 · Toll Pylon P1 · Broker Yacht P2 |
| Drift | hi-vis cage kit (exists as Cradle) | Claim pylon P1 · Rockhound P2 |
| Reach | trophy and ram kit (exists as Span) | **Nest Carrier P0** · Trophy Barge P2 |
| Quiet | matte no-light kit (exists as Rig) | Runner P1 · Relay buoy-ship P2 |
| Vael | nacre and script-etch kit (P1) | Override Tender P1 · Lien Anchor P1 · Hazard Crawler P2 · Addendum Barge P2 |
| Frontier | patch-quilt kit (P1) | Homestead modules ×6 P1 |
| Choir | bronze, bell and ribbon kit (P1) | Bell P1 · Censer P2 · Reliquary Carrier P2 |
| Helix | white-glass seal kit (P1) | Adjudicator skin P1 · Lien Drone P1 · Auditor Frigate P2 · Adjudicator 44-C boss P2 |
| Understory | **Overgrowth kit P0** (it also makes Bloom Husks) | Gardener skiff P1 · Garden ×5 stages P1 |
| Fulfillment | hospital-white barcode kit (P1) | Re-router Hauler P1 · Clerk capital P2 |
| Archive | indigo scriptorium kit (P1) | Censor Frigate P1 · Abbot Cruiser P2 · Indexer P2 · Page drones P2 |
| Pitborn | **junk and string-light kit P0** | **Yardmaster** (procedural from the 43 wreck pieces) P1 · **Ballast balls ×5 sizes P0** |
| Verge | nacre-lattice material (P1) | Measure Engine P1 · Gate Auditor P1 · Surveyor Prism P1 · Debris Sorter P1 · Executor, Appeals Clerk, Witness, Sleeping Jury ×12 P2 |
| Bloom | filament VFX P0 | Lantern cyst P0 · Glassback P0 · Wake eel P1 · Bellows P1 · Bristle ram P1 · Furnace maw P1 · Blind shepherd P1 · Husk variants P1 (Overgrowth kit) · Hive-hulk P1 · Veil ray P2 · Anchor beast P2 · Spore drift P1 (VFX) |

## 5. Stations and places

Seven generic archetypes (`station_blackmarket`, `_fab`, `_military`, `_mining`, `_refinery`,
`_research`, `_trade_hub`) serve 14 factions. The fix is **faction station kits** (row 512): a
dressing set per faction applied to the archetype it already uses (signage, lights, banners,
silhouette add-ons), so the same refinery reads as Drift orange in Ceres and Vael nacre in the
Veil.

New places:

| Place | What it is | P |
|---|---|---|
| Cull arena dressing | crowd lights, banners, a scoreboard and Ma Sprocket's booth for the existing arenas | P0 |
| Evidence Locker | a Concord station holding seized cargo; a heist target | P1 |
| Gate Audit platform | a scaffold welding a gate shut over cycles; wreckable | P1 |
| Homestead frame | a frame the six modules snap onto (Barn Raising) | P1 |
| Understory Garden | five growth stages; persistent | P1 |
| Reading room | an Archive station interior variant | P1 |
| Directorate Tower | Helios; windows lit like ledger rows | P1 |
| Toll Pylon arch | Meridian lane arch | P1 |
| Trophy Wall | Sker Haven; your trophies hang here | P1 |
| Capsized station | Kepler Scar dressing | P2 |
| Lit Path buoys | Sedna Dark; the player builds the path | P2 |

## 6. Characters and portraits

- **Canon cast portraits (P1).** Kessler, Slate, Drift, Rook, Hale, Sula Dree, Callum, Wex, Sump,
  Voss, the Witness (shown only in the terminal register), Elroy (memory only), Vale (never shown;
  a signature only).
- **New faces (P1).** The eleven in 03 §4.2.
- **Culture portrait pools (P1).** Eight cultures (03 §2) × eight faces, so local contacts look like
  they belong to their station (`localPortraits.js` today has a pool of seven).
- **Machine-people bodies (P2).** The twelve new Orphaned Shift machines (03 §4.3). Each is one small
  hero prop with a readable face-light.

## 7. Technology — the player's toolbox

### 7.1 Line heads (the Line's attachments)

Line heads change **what the Line does**, never a percentage (§33 row 489). Each comes from a
faction and has a provenance rarity (08 §3).

| Head | What it does | From | Rarity floor |
|---|---|---|---|
| **Standard** | latch, reel, swing, release | the Tessera | Stock |
| **Coupler** | chains held bodies into a train (the flail's root) | Meridian | Worked |
| **Breaker** | a slammed rock splits into throwable chunks | Drift | Worked |
| **Barb** | hooks a light ship and drags it | Reach | Worked |
| **Weld** | sticks the held object where it touches | Frontier (`glueMeetMassRuntime`) | Worked |
| **Hush** | the held object's mass is hidden from scales | Quiet | Named |
| **Override** | fire the thrusters of a held ship (`tool_thruster_hijacker`) | Vael | Named |
| **Bell** | slams ring and shatter nearby crystal | Choir | Named |
| **Spore** | the held object grows a sticky rot-skin | Understory | Named |
| **Index** | scanning while holding reveals full provenance | Archive | Storied |
| **Evidence Clamp** | staples two objects together | Concord (black market) | Storied |
| **Magnet** | pulls nearby junk onto the held object (Katamari accretion) | Pitborn | Storied |
| **Seal** | sticks a Directorate fine on an enemy; lawful ships hunt it | Helix (via the Archive) | Relic |
| **Multi-latch** | two lines at once | Verge (Measure fragments) | Relic |

### 7.2 The field powers: a recommended merge (the owner picks; §33 row 493)

Today about eight powers push or pull bodies. The recommended set has five, each with one colour
and one outcome:

1. **Pull** (amber). Merges Well and Gravity Marker. It drags bodies to a point.
2. **Shove** (red). Merges Repulsor, Blast and the concussion bomb. It pushes everything out.
3. **Pin** (cyan). Merges Mass Seed and Grav Anchor. It fixes a body in place and makes an anchor.
4. **Bomb** (orange). Drift bombs stay, minus concussion, which Shove now covers.
5. **Rig** (white). The Cone and Skim collector stay as toggles.

While its key is held, every power **outlines each body it will move and draws its predicted
path**.

### 7.3 The arsenal: keep, merge or move (the owner picks; `build_map.md` §34 row 550)

`src/data/weapons.js` holds about twenty physics tools beside the guns. Most of them push, pull,
stick or stop bodies in slightly different ways, which is a direct cause of "I don't know what my
powers do". The recommendation below gives every tool one home: a gun that stays, one of the five
merged powers (§7.2), or a Line head (§7.1). **Read each tool's live behaviour in `weapons.js` and its
owner before acting**, because a name can hide a behaviour. Where the live behaviour differs from
the guess here, the behaviour decides the home.

| Tool (`weapons.js` id) | Recommendation | Why |
|---|---|---|
| Concussion Cannon S / M | **keep** (the shove gun) | the gun-side physics verb; already the boss body-launcher |
| Mass Driver (`wpn_mass_driver`) | **keep** (the fling cannon) | launches mass: rock-is-the-gun in a gun slot |
| Thermal Cooker | **keep** | heat feeds slag, spore drift, Lantern cysts and Furnace maws |
| EMP Disruptor M | **keep** | disable; it rhymes with Archive redaction |
| Vector Mine M | **keep** under Bomb | the mine family |
| Snarl Webcaster | **keep** | a snare; enemy Weaver webs mirror it |
| Gravity Marker S | **merge → Pull** (as Pull's tag mode) | tag a body so Pull takes it |
| Gravity Wellhead M | **merge → Pull** (the launcher form) | the same outcome as the Well |
| Momentum Sink S | **merge → Pin** | it stops a body |
| Grav Anchor (`tool_grav_anchor`) | **merge → Pin** | it fixes a body in place |
| Inertial Shunt S | **merge → Shove** | momentum out |
| Polarity Inverter | **merge → Shove** or **cut** | an inverted field is a shove |
| Viscosity Field | **merge → Bomb** (the goo charge; `bomb_goo` exists) | slow-field ordnance |
| Sticky Detonator | **merge → Bomb** (the sticky charge) | the Charge / Blast pair |
| Conductive Primer | **merge** into the payload modules (`mod_relay_arc` family) | it is a combo enabler, not a weapon |
| Thruster Hijacker | **move → Override Head** | a Line head (§7.1) |
| RCS Disruptor M | **move → Override Head** | the same outcome |
| Seismic Gong | **move → Bell Head** | resonance |
| Quantum Sympathy | **move → a Relic Line head, "Sympathy"** (linked bodies share momentum) | a rule-breaker belongs at Relic tier |
| Hardlight Prism | **keep or move → Weld Head**, after reading its behaviour | if it makes cover, it is the Weld Head's cousin |

The result is about six physics guns plus five powers plus fourteen heads, each with one job,
instead of about twenty overlapping tools.

### 7.4 Line Class hardware

Measure Engine fragments (Verge) and winch rebuilds (Slate) raise the Line Class (08 §2). Each class
has a visible hull state (§3).

## 8. Commodities

Most Bloom materials already exist (`cmdty_filament_sample`, `cyst_resin`, `nerve_glass`,
`glass_back_scale`, `spore_catalyst`, `membrane_laminate` and others). Add only what the factions
need (check `src/data/commodities.js` first):

| New commodity | Who buys | Note |
|---|---|---|
| `rot_compost` | Understory sells; homesteads buy | the only clean air feedstock in the outer sectors |
| `backordered_goods` | everyone | Fulfillment spill loot; carries a random original order |
| `relic_certified` | Choir | pings home (02 §8) |
| `vethari_bone` | illegal everywhere; the Archive pays | very light, very strong |
| `ballast_scrap` | Pitborn | junk by the tonne |

## 9. VFX language

One family per meaning, and every one readable with **sound off** (the owner plays muted).

| Family | When | Must show |
|---|---|---|
| **Impact by tier** | every mass hit | hit-stop scaled by mass, sparks or dust by substance (§2), a shockwave ring at T3 and above, camera kick at T4 and above |
| **Break** | a body splits | chunks with spin; the chunks are live throwables |
| **Line states** | latch, strain, release | a thick cable that glows hotter with strain; the held body rim-lit in the Line's cyan; the release arc drawn while held; a release flash (§33 row 492) |
| **Bloom coupling** | linked swarm | faint green filaments; they flare and snap on a panic cascade |
| **Power identity** | Pull, Shove, Pin, Bomb | one colour each (§7.2); a held-key preview of affected bodies |
| **Tonnage** | the Line holds a new record mass | a brief tonnage stamp on the hull: `412 T. CORRECT.` |
| **Faction tells** | Helix perfection, Concord commander, Choir resonance | a gold seam on unmasked Helix, the commander's mast light, bell ripples |
| **Persistence** | a garden grows, a light is placed, a scar stays | a small permanent visual change at the place |

The budget stays with the player-truth `vfx_coverage` gate: peak effects can reach about 10 % of the
screen (§33 row 487) while threats stay readable.

## 10. Interface marks

Power glyphs for the five merged powers (§7.2). A Line Class badge. The Tonnage Logged counter. A
faction mark for each of the 14 factions (each needs one 24 px mark that reads at HUD size).
Provenance rarity marks (08 §3). All of these are ORRERY library elements (`src/ui/orrery/`),
because screens compose library elements and never hand-roll boxes.
