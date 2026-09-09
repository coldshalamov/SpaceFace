# THE LONG AFTERMATH
### How ships die in inhabited space, and what is left when they do

Companion to [THE_COMMON_YARD](THE_COMMON_YARD.md) (fixed plant), [THE_WORKING_FLEET](THE_WORKING_FLEET.md)
(occupational craft) and [THE_WORKING_LIGHT](THE_WORKING_LIGHT.md) (the light law). Those three
describe machinery that works. This one describes machinery that has stopped.

Governing constraint for the pack built from this document: it is a STAGING family. The Wreck
Cathedral, `place_dead_hulk`, `place_debris_chunk` and the live wreck manifests are untouched. See
`assets/incubator/wreck_aftermath_pack/evidence/EXISTING_COVERAGE.md` for the audit that proves it.

---

## §0 · Why a wreck is not a rock

A wreck is the only object in the game that is required to be *legible as a former thing*. An
asteroid can be a shape. A station can be a silhouette. A wreck has failed at its job, and the
player can only feel that if they can still see what the job was.

This gives the pack one hard acceptance test, and everything below exists to serve it:

> A player who sees the wreck with no label, no scan, and no text should be able to say
> **"that used to be a freighter"** — and then, a beat later, **"something hit the engine section"**
> and **"someone has already been here."**

Three readings, in that order: **class**, then **cause**, then **history**. A wreck that only
delivers the first is set dressing. A wreck that delivers all three is a story.

The failure mode to design against is the *exploded box pile*. Random debris reads as texture, not
event. Texture is forgettable. The eye needs to reconstruct a whole from the parts, and it can only
do that if the parts were once arranged.

---

## §1 · The fracture law (why breaks land where they land)

Ships do not shatter. Ships **come apart at the places engineers already knew were weak**, and the
player has seen those places on every intact hull in the game. Six rules, applied in order:

**1. The spine breaks in a bay, not at a frame.** Every hull in this fiction is built on a
longitudinal spine with transverse frames at intervals. A frame is the strong ring; the bay between
two frames is the weak span. So a hull snaps *between* its visible modules, never through the middle
of one. The exposed break shows a ring of frame stubs — a rib fan — because the frames survive what
the plating between them does not.

**2. Pressure vessels rupture outward and stay attached.** A tank that lets go does not vanish; it
petals. The shell splits along its weld seam and folds outward like a peeled fruit, still anchored
by its saddles. An outward petal is the single clearest read of "this burst from inside."

**3. Mass stays; area leaves.** Dense compact modules — drive blocks, reactors, ore hoppers, armor
citadels — remain roughly where they were, because momentum is expensive to change. Large-area
lightweight structure — radiators, solar wings, antenna booms, hull plating — is what shears off
and drifts. If a heavy thing has drifted far and a light thing has not, the picture reads as wrong
even to a viewer who could not say why.

**4. Everything that leaves, leaves along a vector.** A separated section drifted **away from its
break plane**, and it kept the rotation the parting torque gave it. It did not land in a tasteful
composition. Authored drift means: offset along the break normal, plus a tumble about an axis that
is not aligned to anything. Two sections must never be parallel.

**5. Fire starts where the energy was.** Drives, reactors, volatile tankage, munition stores,
capacitor banks. Fire does not start in a passenger lounge unless something carried it there — and
if it did, the scorch trail should be visible on the way.

**6. Damage is directional.** Something arrived from a direction. The near face is holed, scorched
and dished inward; the far face is intact paint. A wreck damaged evenly on all sides did not have
anything happen to it — it just decayed, which is a different and much quieter story. **Symmetry is
the enemy.** No wreck in this pack is mirror-symmetric.

---

## §2 · What salvagers took first (the history layer)

Salvage is an economy, and economies are predictable. A stripped wreck is stripped in a
**specific order**, and the order is legible:

| Taken | Why | What it leaves behind |
| --- | --- | --- |
| 1. Drive bells & thruster assemblies | Highest value per tonne, standard fittings, no permit | Open engine throats, bare mount rings, cut feed lines |
| 2. Reactor core & capacitor banks | Valuable, and dangerous to leave | Empty shielded cavity, cut cage bars, the hazard placard still bolted on |
| 3. Sensor & comms gear | Small, portable, resells clean | Bare masts, stub mounts, hanging cable |
| 4. Cargo (if any survived) | Obvious | Open hold doors, empty racks, cut clamp stubs |
| 5. Hull plating | Bulk scrap, slow work, cut with a torch | **Neat rectangular openings with straight cut edges**, framing exposed in tidy rows |
| Never taken | | Frames, spine, armor citadel, bulkheads — too big, too cheap |

The tell that separates *salvaged* from *destroyed* is the **edge quality**. Battle damage is
ragged, dished, and scorched. Salvage cuts are **straight, clean, square, and repeated** — a torch
follows the framing because that is the easy line. When a player sees a neat rectangular hole next
to a ragged one, they have read "someone came here afterwards" without a single word of text.

A heavily stripped wreck is therefore mostly *frames* — a skeleton with the skin cut away — and it
should read as skeletal, not as damaged.

---

## §3 · The state ladder (time is a material)

Five states. A hull may sit anywhere on the ladder, and the ladder is **cumulative**: a derelict has
been through cooling first.

**FRESH — minutes.** The violent one. Metal at the break is still incandescent; internal fires burn
orange in the cavities; severed power runs arc white-blue; atmosphere and coolant vent in hard
straight jets, because there is still pressure behind them. Emergency lighting is on and the
strobes still run. Debris is close in and has not dispersed. **This is the beautiful one.**

**COOLING — hours.** Fires are out or guttering. Break metal has gone from white to a deep red glow
along the thickest sections only — the thin plate cooled first, so the glow survives in the ribs and
the spine, which is exactly where it reads best. Venting is a slow drift, not a jet. Emergency power
is failing: lights are dim, intermittent, and the wrong color. Debris has spread.

**DERELICT — decades.** Nothing is hot. Nothing is lit. Nothing vents. Paint has gone chalk and
faded off the sun-facing side; the shadow side keeps its color, which is a free storytelling detail.
The surface is micro-pitted matte from dust. Every soft thing — insulation, cable jacket, seals —
has embrittled and either cracked off or hangs in stiff frozen curls. A derelict is defined by
**absence**: absence of light, absence of motion, absence of heat.

**PARTIALLY SALVAGED.** Steps 1–3 of §2 are done. Drive bells gone, sensors gone, a few plates off.
The wreck is still obviously a wreck, and still obviously a *freighter*.

**HEAVILY STRIPPED.** Steps 1–5 done. Frames and spine only, skin cut away in tidy panels. Class
identity now rests entirely on **proportion and framing rhythm** — the reason ore hoppers must have
a distinctive frame spacing is so the player can still name the ship after the skin is gone.

---

## §4 · The color law (against the dreary wreck)

The existing wreck language in this game is charcoal and grey. That is a legitimate mood and it is
also, at volume, invisible: a dark grey object against black space has nothing to show but its
outline. This pack deliberately spends color.

Against black, a fresh wreck should be **beautiful and terrible**. The palette is not decoration —
each entry is a *fact* about the wreck's state, and a player learns to read them:

| Element | Reads as | Discipline |
| --- | --- | --- |
| **Exposed hot metal** — white-yellow at the break, falling through orange to deep red with thickness | Recent, violent, thermal | Only at breaks and only on thick sections. Thin plate is always cold. |
| **Internal fire** — orange/red glow *inside* cavities, never on the outer skin | There is still something burning in there | Must be occluded by structure. A fire you can see all of is a lamp. |
| **Electrical arcing** — white-blue, geometrically thin, at severed conduit ends | Power is still live and unrouted | Thin. The hottest color must own the least screen area or it whites out. |
| **Coolant / atmosphere venting** — pale cyan-white plumes | Pressure remains; the hull is still losing something | Direction shows where the breach is. |
| **Scorched paint revealing faction history** | Someone owned this, and something burned it | Scorch must be *edge-lit by what it hides* — a half-burned Concord chevron says more than a clean one. |
| **Emergency lighting** — hard amber and red | The ship's own systems are still trying | Sparse. Two or three, not a runway. |
| **Cooling emissive cracks** — dull red seams tracing structural lines | The heat is leaving along the frames | Follows real geometry, never a decal scatter. |
| **Drifting particulate** | Recent, and nobody has cleaned up | Density falls with state age. |

**Restraint rule.** Emissive above roughly 3.0 tone-maps to white and destroys the color code
outright — a lesson this project has now paid for twice. Arcing lives at ~2.8–3.0 and is
*geometrically tiny*; fires at 2.0–2.4; cooling cracks at 1.2–1.6. Separation between them comes
from **hue and screen area, not strength**.

**The state ladder is a light budget.** Fresh spends all of it. Derelict spends none. A derelict
that still has a blinking light has not been abandoned — it has been *staffed*, and that is a
completely different story to tell.

---

## §5 · The six hulls

Each family must survive the skin being cut off. Class identity therefore lives in **proportion,
frame rhythm, and one unmistakable silhouette feature** — never in paint alone.

| Family | Was | Identity that survives dismemberment | How it died |
| --- | --- | --- | --- |
| **Ore freighter** | Bulk hauler, spine + hopper string | Repeated deep hoppers on an exposed open spine; the rhythm is the read | Spine failed mid-string under load; bow and stern parted, one hopper split and spilled |
| **Liner** | Civilian passenger transport | Continuous window rows, a fat pressurized hab drum, boat bays | Hab drum decompressed and petalled outward; bow survives intact |
| **Corvette** | Patrol warship (Concord) | Armor citadel, turret barbettes, lean fast proportions | Cut through the keel by a lance; turret sheared off its ring |
| **Mining barge** | Asteroid extraction platform | Enormous cutter head on a boom, ore bins, working-face asymmetry | Boom root sheared; the cutter head is the heavy thing that stayed |
| **Survey ship** | Research / survey | Big dish, sensor mast, delicate solar wings, a lab can | Impact took the wings; the lab module is intact and **still sealed** |
| **Carrier** | Smuggler / pirate conversion | Mismatched patch plates on stolen bones, an improvised flight deck, hidden holds | Blew outward from an internal hold; the crew stripped it themselves before leaving |

**The carrier is the odd one out and should be.** It was never built — it was assembled from other
ships' parts, so its "original" state was already a wreck of a kind. Its damage came from inside.
Its salvage was done by the people who flew it. It is the family where the fracture reads as
*betrayal* rather than *battle*.

**The corvette carries the law.** It is the one hull that maps to the `military` wreck class, the
only class flagged `restricted: true` in `src/data/wreckClasses.js` — stripping it without a permit
is a crime. So its stripped variant is not a story about scrap value. It is **evidence**.

---

## §6 · Ordinary aftermath (not every fight leaves a hero)

Most combat should leave something, and it must not be a hero wreck — a landmark that appears after
every skirmish stops being a landmark by the third one.

The aftermath kit is the answer: eight recognizable *components* that could have come off any hull.
Each one still obeys §1 (broken at a joint, not shattered), §2 (some show salvage cuts) and §4
(fresh ones still glow). A drifting engine section says "a ship died here" as clearly as a hull
does, costs a fraction of the screen and the budget, and never claims to be a monument.

The fragment kit below them is smaller still — plate curls, rib clusters, cable bundles — shared
across all six families, because at the size a fragment occupies on screen there is no legibility
to be gained from making it family-specific.

---

## §7 · The navigable gap

Every hero wreck must offer at least one **flyable** opening: a torn bay, a split hold, a gap
between separated sections. This is where a wreck stops being scenery and becomes terrain.

The gap is a measured commitment, not a vibe. The player hull is 28 m. A gap must present at least
**40 m of clear span** — enough that a pilot commits to it rather than scraping through — and the
builder asserts the clearance rather than trusting the eye. A gap you cannot fit through is worse
than no gap at all, because the player will try.

The best gaps are **consequences**: the freighter's is the hole where a hopper used to be; the
liner's is the decompression petal; the corvette's is the lance cut itself. The hole in the ship is
the thing that killed the ship. That is the whole fiction in one shape.
