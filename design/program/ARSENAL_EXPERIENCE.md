# Arsenal experience — 11 October 2026

Owner request: audit and improve every built ship weapon and power. The standard is the
demolition-derby Swarm game throughout Adventure: mass is useful, a shove changes the situation,
and each tool tells the player what it is doing. This continues the existing owners; it does not
add another combat engine or replace the ORRERY interface.

Scope: all 39 canonical weapons (including the eleven emergent tools and five unique variants),
eight drift bombs, five baseline field powers, anchor snare, Gyre, Massline/heads, impulse charges,
hull bursts and the fitted support verbs. Catalog authority is `src/data/weapons.js`,
`emergentPrimitives.js`, `bombs.js`, `fields.js`, and `modules.js`. Historical unbuilt weapon
concepts are not presented as obtainable equipment. Product intent is `design/VISION.md`, GDD
§4/§6, SPEC3-F4, and the existing field/bomb/force-language lifecycle specifications.

## Audit findings and implementation plan

1. **Make force reach the world.** Complete the existing environmental delivery work: compact
   rocks become physical only when reached; loose cargo, wrecks, mines and bodies participate;
   authored response is independent of collision mass. Stations stay anchored. Direct hits,
   splash, continuous beams, fields and material blasts must use the same physics authority.
2. **Give displacement consequences.** Cone/Repulsor need actual tumble and rubble spin,
   player-attributed collisions and a visible player knockback budget. Polarity must close a
   useful distance within a fight. Gyre must gather, merge, grow, launch and collide rather than
   simply decorate a held object. Keep the player's input heading controllable during recoil.
3. **Make material choices matter.** Metal banks shots; crystal breaks into moving, ore-bearing
   fragments; volatile matter cooks into a chain blast; conductive wreckage links the electrical
   kit. Heat, warning, fracture, detonation and remaining debris need their own visible answers.
   Partial heat and pending consequences must survive the real save envelope.
4. **Repair effect identity.** Nine existing advanced weapon recipes were not registered with
   the force-language classifier, falling back to autocannon source/contact geometry. Register
   their authored forms; retain the separate field, bomb, beam, projectile and status owners.
   Remove the generic extra blast layered over all bomb payloads. Retain Gravity Mark for its
   true duration and retire it with the status. Cosmetic motion never supplies gameplay force.
5. **Let the player choose and operate the kit.** Give every exact weapon ID and active tool an
   authored SVG mark, with distinguishing tier/unique details. Use the same identity in the fit
   screen, Swarm draft/armory and flight power controls. Explain the physical use and tradeoff;
   fix EMP's damage claim and the obsolete independent Hull Burst key prompt.
6. **Close the connections.** Match beam contact and visible endpoint to the first actual skin,
   wire environmental audio/VFX events, register material simulation on browser and Node,
   migrate saves, then exercise the public launch/save route. Focused mechanics tests establish
   physical outcomes; render inspection establishes only the pictures actually inspected.

These are the additional systems this audit admits. More guns, larger particle counts, a second
renderer and cosmetic ship hardware without a gameplay purpose are not substitutes for these
repairs. Existing mounted gun sources remain attached to the ship's hardpoints. Tools whose action
is a field or remote attachment are identified by their source, affected matter and UI glyph.

## Weapon-by-weapon experience contract

Each row covers ignition/travel or sustain/contact/release. All source flashes cool and retire;
all projectiles have finite travel; beams end when fire stops; retained status geometry follows
its actual host and expires with its authoritative status. An empty field remains animated.
Names below correspond to exact IDs in `src/data/arsenalIdentity.js`.

| Weapon | Distinct lifecycle and target/world answer | Player pitfall addressed or retained tradeoff |
|---|---|---|
| Pulse Laser S | Coherent aperture → short bright bolts → shield ripple or hot contact → fast cooling; small physical nudge | Reliable starter rhythm; not sold as a demolition cannon |
| Pulse Laser M | Heavier pulse aperture/bolt/contact, larger authored shove | Upgrade preserves pulse identity and capacitor commitment |
| Mirrorjaw Pulse | Unique volley variant of pulse, separate SVG/readout | A faster follow-up, not a fictitious new mechanic |
| Autocannon S | Mechanical kick → metal slug/casing → directional chips and off-center hull rocking → spent matter | Armor bite and aim disruption are distinct from energy fire |
| Heavy Autocannon M | Heavier mechanical beat and slug impact with tumble torque | Recoil and firing gaps remain legible |
| Ironsong AC | Tight, fast heavy volley with its own mark | Lower per-slug bite versus greater pressure is explained |
| Flak/PD Turret S | Traversing source → flak volley → small fragment contacts/interception → fragments retire | Arc and intercept cadence mean it is not an invulnerability bubble |
| Concussion Cannon S | Broad pressure source → kicker slug → directional shove and hull tumble → moving target supplies aftermath | Low direct damage; collision is the payoff |
| Concussion Cannon M | Heavy pressure punch; rocks move under authored environmental response | Large rock mass no longer makes the visible hit useless |
| Bank Stream M | Rhythmic source → linked fast slugs → reflected path and surface spark → finite bounce/travel budget | Bank shots have visible cause and cannot multiply indefinitely |
| Beam Laser M | Aperture establishes a continuous cut → contact seat follows first skin → cut extinguishes | The drawn ray must not pass through cover that stopped damage |
| Veil Cutter | Longer-reaching beam variant with a separate mark | Precision/range versus heat cost |
| Heavy Beam L | Heavy coherent source → sustained long cut → thermal/physical contact → release cooling | Sustained exposure and capacitor use are visible commitments |
| Lighthouse Heavy Beam | Distinct heavy-beam upgrade/readout | Greater reach/brightness comes with greater heat |
| Railgun M | Rail shears launch a narrow fast spear → piercing contact and kick → short hard cooling | Lead and cadence, rather than an indistinguishable rapid bolt |
| Siege Lance L | Spinal source → massive penetrator → large directional rupture → long recovery | Whole-ship alignment and slow cycle are the price |
| Plasma Cannon M | Thermal lobes → hot slug → local splash with material heat/shove → cooling residue | Blast affects nearby matter once; does not double-hit its direct target |
| Missile Rack M | Launcher release → fueled seeking trail → physical contact/splash → debris and cooling | Lock, interception and cover retain counterplay |
| Nestbreaker Rack | Paired submunition salvo with unique SVG | Combined salvo and weaker individual warheads explained |
| Torpedo L | Heavy release → committed slow-turning warhead → broad blast → physical debris | Large targets and trapped formations are the useful opening |
| EMP Disruptor M | Forked current source → ion hit → subsystem disable/current contacts → recovery | Copy describes bypass/disable, not ordinary shield damage |
| Snarl Webcaster | Split filament source → web dart → tension between bodies → line retirement | Web geometry must not inherit autocannon muzzle/contact |
| Gravity Marker S | Open gravity jaws → marker → host-seated contracting marks → actual status expiry | Low damage prepares stronger coupling; retained mark communicates success |
| Momentum Sink S | Latching source → sink connection → velocity relationship/loading → release | Acquisition, held relationship and release differ from generic shot damage |
| Inertial Shunt S | Fitted wedge/impact gesture → closing-speed transfer → opposite target kick → recovery | Passive collision tool; UI must not invent a fire command |
| Vector Mine M | Deployed armed body → trigger → radial scatter impulse → moving bodies | No direct damage; collision credit follows the owner |
| Wellhead M | Planted emitter → sustained inward flow → shared physical clump → field drains | Must gather rocks and loose matter as well as ships |
| RCS Disruptor M | Control-disruption shot → hit → steering failure/drift → helm recovers | Disable window has a purpose and an end |
| Sticky Detonator | Adhesive source → sticky flight → host-following charge → remote blast/shrapnel | Surface attachment survives motion; one detonation per charge |
| Conductive Primer | Coating source → deposition → host coating carries nearby arcs → coating expires | Position/conductivity create payoff; not a disguised damage bolt |
| Grav Anchor | First body latch → second latch → contracting spring → collision/release | Two-body spring is distinct from the Gyre bowling-ball collector |
| Thermal Cooker | Hot throat opens → held heat → material warming/fracture/cookoff → cooling | Brief contact is preparation; retained heat has world consequences |
| Mass Driver | Mechanical driver opens → massive slug with shooter recoil → physical target kick → slug retires | Collision aftermath is the advertised damage path |
| Polarity Inverter | Alternating pole tag → retained polarity → unlike attraction/like repulsion → tag expiry | Pair closure must be visible in seconds, not glacial drift |
| Viscosity Field | Gel deposit → anisotropic drag field → bodies slow/heat ignites it → gel breaks down | A local material trap, not another gravity swirl |
| Hardlight Prism | Angled reflector establishes → incoming beam banks → contact brightens → reflector expires | Orientation and reflected trajectory communicate use |
| Thruster Hijacker | Attachment dart → host-mounted rogue drive → sustained spin/thrust → fuel/effect ends | The struck hull becomes a moving hazard |
| Seismic Gong | Host tag → repeated mass-weighted shock beats → neighboring matter jumps → pulse train ends | Host mass supplies a tactical choice |
| Quantum Sympathy | First tag → paired body link → impulse on one echoed to the other → unlink | A readable causal pair, not unexplained remote damage |

## Bomb lifecycle and aftermath

All eight share understandable handling (inherited velocity, safe/armed/warning/commit stages,
rebindable drop/select/detonate, finite bay capacity). They do **not** share a generic explosion.

| Payload | Commit, retained effect, target reaction and release |
|---|---|
| Frag | Cassette rupture throws directional fragments; hull/terrain contact chips and physical shoves outlive the flash |
| Concussion | A pressure drum expands outward, scatters bodies and retires; zero direct hull damage |
| Singularity | Unequal inward streams feed a throat; gathered bodies collide; supply drains as the well collapses |
| Goo | Wet folds coalesce, brake relative motion and leave host-bound corrosion; pores open and residue breaks down |
| EMP | Branching current hits systems; interruption is temporary; no false second pressure explosion |
| Thermite | Hot burst deposits persistent burn; heated volatile material may cook off; burn fades with its state |
| Havoc/Scrambler | Tangential force and target tumble interrupt aim; lateral shove is visible rather than purely radial |
| Ballast/Anchor | A ballast/mass effect settles on targets, makes steering sluggish, and releases with the status |

Native bomb presentation owns warning, field and detonation geometry. A shared pool may manage
resources, but payload form, material motion, lights and contact grammar remain payload-specific.

## Powers, heads and support tools

| Power/tool | Lifecycle and world effect |
|---|---|
| Clearing Cone | Source-to-tip streams establish a real forward footprint; swept hulls tumble and rubble spins/repels; cutoff travels to the tip on release |
| Repulsor | Separately advancing bowed fronts push matter outward, pile it at the edge and tumble hulls; old fronts peel away after shutdown |
| Well | Outer intake feeds a shearing throat; marks increase coupling; rocks/cargo/hulls gather; supply stops before remaining matter drains |
| Mass Seed | Projectile anchor arrives, jaws latch/ratchet and warn before expiry; gives Massline an actual temporary anchor; pieces unload separately |
| Skim Collector | Intake sheet follows the planet-band use case; lateral transport delivers the scoop; detached strokes erode on shutdown; clear out-of-band refusal |
| Anchor snare | Deployed anchor gathers orbital traffic with visible constraint/field; host motion matters; destroy/expire retires active boundary |
| Gyre Snare | Acquisition lash → gathered bodies → visible growing held clump → aim/release → traveling bowling body → collision/rupture; size/member constraints replace misleading tonnage refusal |
| Massline and standard head | Acquire/latch → visible loaded filament → reel/swing → release into real momentum; tension and target guidance follow the held relationship |
| Snare/anchor/cutting heads | Shared cable grammar, distinct latch/anchor/cut outcomes and equipment marks; no passive random line break |
| Impulse charge and detonator | Throw → physical attachment → armed tell → commanded directional shove → fragments/residue; remote command names what it commits |
| Gravity Bumper Mk1/Mk2 | Boost activates nose pressure wedge, contact throws a body, boost release retires it; upgrade changes reach/strength, not activation grammar |
| Fire Lance Mk1/Mk2 | Boost feeds a narrow hot nose volume, held contact burns, release cuts the supply; no nonexistent separate burst key |
| Grip Bumper Mk1/Mk2 | Boost catches an eligible hostile, nose constraint carries it, boost release lets it go; no hidden auto-throw |
| Cloak | Activation/capacitor commitment, visible player concealment read, enemy perception change, release/reveal; describe its actual activation rather than 'always active' |
| Veil Step/blink | Explicit activation, authored departure/arrival, valid landing and cooldown; a mobility verb rather than invisible passive equipment |
| Countermeasures | Release decoys → missile tracking break → decoy burnout; finite resource/cooldown and actual interception limits remain visible |
| Mining tools | Survey seam → contact cut/heat → fracture/chunks → collection; mineable ore is distinct from an optic structure |
| Drones | Deploy/recover, visible worker/combat body and task feedback; the drone is the physical component, not a fake muzzle flash |
| Scanner | Expanding scan and contact return → findings retained by information owners → pulse retires |
| Bullet time | Deliberate slow-time state → usable aim window → release/resume; simulation-linked effects respect pause/slow time |

## Shared target and world rules

- Translation and angular motion come from physics authority. NPC tumble interrupts its helm/fire
  for the authored window. Player recoil is bounded and recovers without silently changing input
  heading. Gun/field force and collision damage have stable causal ownership.
- Friendly-fire policy governs damage; it does not make loose bodies intangible. Immovable
  landmarks remain anchors. Physical fragments remain bodies that subsequent tools can use.
- Reflective contacts use the moving surface's reference frame and a finite bounce budget.
  A beam's visible endpoint and damage contact agree at the first skin.
- Fire and material heat are different from generic hull HP. Fragmentation preserves remaining
  ore, and chain reactions cannot fire the same source twice. Save/restore preserves material
  identity and pending work, including remapped entity identities.
- Source effects follow hardpoints; contacts follow victims; material residue follows the surface
  or its own physical trajectory. Gravity, electrical, adhesive, thermal, ballistic and constraint
  effects have different motion. Lights support those shapes within existing budgets.
- Reduced-motion/flash settings keep readable shapes and state. Removal, death, pause, rewind,
  sector changes and resource-pool reuse retire or rebind effects without ghost fields.

## Verification and implementation status

The six implementation units above are built on the default route. The physical unit is
`7a2389fe3`; authored presentation is `0739f463a`; identity and guidance are `548691923`, with
the Gyre status glyph in `ec54a3838`. World/weapon delivery is `07d681215`; first-surface beam
occlusion, including compact foreground cover and exhausted promotion budgets, is `74a9b07ff`.
Save integration `2e2f2d661` adds version 15 for pending material consequences and partial heat.

Direct evidence:

- Seed 7722, actual Rapier: Clearing Cone throws a radius-16 rock from x70 to x328.5;
  at 1.95s it hits at 182.9 WU/s and reduces a hostile hull from 500 to 40 HP. Player credit survives.
- Real save-envelope/load restores partial heat, a pending fracture and remapped entity references;
  restored fracture produces four physical shards. Deterministic run/reload comparisons pass.
- Seven integration tests and 15 optic tests pass, including crowded compact cover and promotion
  exhaustion. The 17 Swarm terrain fixtures and 59 Massline-head fixtures pass. Authority and
  combo checks pass; release feedback follows deliberate cuts rather than lost targets.
- All 39 weapon identities, eight bomb identities and active/support verbs have custom SVG assets
  (124 total). The actual outfitting shelf, Swarm armory and 47 weapon/bomb marks were inspected.
  The identity/UI suite passes 31 tests.
- Production-module renders were inspected at ignition, peak and cooling for the changed sources,
  Gravity Mark arrival/load/unload, and crystal/volatile heating. The 97 force-language checks,
  VFX sleep and technique checks pass. This is not an aesthetic verdict on every unmodified effect.
- Public Electron launch, visible hull/world, thrust, quick-save and Continue passed. Its only
  failed check exposed audio before first-gesture initialization; `fa73471bf` fixes that exact
  error, with 12 audio tests passing and later initialized cues still audible.
- The concurrently discovered exit-save quota bug is repaired: synchronous quota recovery uses
  the existing gzip format before eviction, duplicate unload events write once, and previous
  saves survive rejection. Forty-eight save compatibility/recovery tests passed; the final four
  focused quota/decoder/lifecycle cases passed.
- Final public browser route passed **16/16**: New Game, visible authored ship/world, thrust,
  quick-save, reload, Continue, and thrust after load; no uncaught errors, shader/link errors or
  missing assets. Player saves were isolated with `SPACEFACE_PLAYER_STORE_DIR=''`.

## Live visual follow-through — 11 October

The catalog review used the running browser game, its registered simulation/physics owners,
actual weapon definitions and normal renderer. Compatible loadouts and nearby targets were set
up in an isolated fixture after New Game → Launch. Each catalog weapon and all eight bomb
payloads were viewed; this is distinct from an unrestricted Adventure/Swarm playthrough.

The review found and repaired these additional player-visible failures:

- Gyre's filled intake and closed payload shells concealed its work. Open gathering channels,
  separated gripping/retention arcs and solid material-specific captured pieces expose the mass.
  Held-payload rendering exceptions were fixed, and the camera includes ship, mouth and payload
  without changing the player's selected zoom. A bounded 1.6-second release composition keeps
  the first bowling impacts visible, then eases home. A restrained light from the existing pool
  reveals the physical rubble without replacing it with an enclosing glow.
- Gyre aggregates could fracture before making successive useful contacts. They now retain
  energized cohesion during the throw, wake colliders along their swept path, retain material
  identity, and return to ordinary fracture at expiry. Heat can still rupture them.
- Held orbital motion leaked sideways into the throw, contradicting the indicated direction.
  The first launch impulse removes that artificial transverse motion relative to the carrier;
  deliberate carrier momentum and later collision deflections remain physical.
- Beam pixel sizing used distance from world origin. At distant coordinates a narrow beam
  became a broad white stripe. It now uses camera-to-source distance in the same render frame.
- Emergent tools simulated darts and retained mechanisms that had no renderer. They now have
  distinct travelling geometry, sticky charges, conductive fins, polarity poles, hijacker
  attachments, gong plates, first-target markers and actual two-body connections. Authoritative
  ledgers own presence; consumption, expiry, host removal and world changes retire the visuals.
- Viscosity covered ships with broad opaque green folds. Separated low wet ridges preserve its
  footprint while leaving actors visible. The target sigil's radiance was reduced to let contact
  effects read, and the Wellhead's inlet is geometrically distinct from the Gravity Mark source.
- Countermeasure deployment bursts ended well before their active effects. Chaff strips, a
  ship-following ECM mechanism and a world-anchored decoy now persist for their real lifetimes.
- Drone mining could inherit the player's target and emit from the wrong work face. Receipts
  now name the actual cutter and rock surface; contact matter and scars follow that target.
  Bullet-time's decorative camera movement now respects both reduced-motion preferences.

Direct mechanics evidence: seed 18122, real Rapier, combines radius-24 and radius-20 rocks into
an 8516t, radius-32.4 clump. At 405.6 WU/s it damages three 1200-HP hulls to 945/1022/1068,
imparts 344.4/309.1/40.0 WU/s, tumbles two, and retains player credit. A mixed small-rock feed
forms a 72t clump in 21 ticks. The five Gyre/material/activity suites pass 232 checks. The
additional aimed-release regression reduces unwanted transverse drift from 76.57 WU/s to
under 0.05 while preserving a carrier's deliberate 90 WU/s strafe; eight focused launch/replay
cases pass. In the running browser fixture, the same 8516t aggregate struck all three real
enemy hulls: 1200 HP became approximately 171/671/732, with speeds of 417/445/204 WU/s.
Camera framing passes 20 cases, including both world axes, reduced motion and the actual
controller's 526-WU bowling trajectory while keeping the ship visible.
The final running-game frame also kept the ship and moving aggregate visible at 65 ticks
after release, with collision debris along its path and all three target hulls damaged.

Focused rendering checks cover beam translation/rebase invariance, source identity, field sleep,
techniques and target selection (54 checks), emergent payload/material behavior (18), and
countermeasure lifetime/cleanup (27). Drone/cargo and bullet-time support checks pass 23 cases.
Two ownership regressions verify pooled Gyre light retirement and drone contact/scar targets.
Screenshots are temporary in-session review material; the resulting changes and findings are
recorded here rather than retaining a capture archive.

Verification boundaries: the earlier broad baseline retains stored topology/simulation-hash
differences; this work did not rewrite expected goldens. Deterministic/reload comparisons passed.
The fixture review does not establish hardware performance, encounter balance across all builds,
or quiet-host acceptance. No new quiet-host capture was produced.
