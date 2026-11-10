<!-- LIFETIME: DURABLE -->
# THE WORKING FLEET — hulls that carry their trade

*Companion to THE_WORKING_LIGHT.md (the signal code) and THE_WORKING_TRADES.md (the
professions). Those two documents describe what working crews SHOW and DO. This one
describes what their ships ARE — the twelve occupational hull families of the
`npc_activity_pack` incubator, authored so a pilot can name a stranger's trade from
silhouette alone, before the HUD or the lamps confirm it.*

> **Design-candidate boundary:** metre values below are nominal fiction briefs. Eight
> generated GLB envelopes currently differ; the exact table is in the pack's
> `INTEGRATION.md`. Preserve the concepts, but reconcile each selected family before
> promotion. The current packet has no whole-asset or runtime acceptance.

*Doctrine, inherited from the Lane Guild manual: believe the motion first, the lamps
second, the paint never. This pack adds a fourth line ahead of all three — believe the
HULL. Paint can be resprayed and lamps can be forged, but nobody bolts a fake ore
basket to a raider; mass is the one thing not worth lying about.*

---

## 0. Reading rules — how a hull tells its trade

Every family below obeys the same five construction laws. They are what make the fleet
read as one universe rather than fourteen art styles:

1. **The trade hardware is the protagonist.** Crew cab small and bolted where it fits;
   the drill, tank row, crane or push-cradle owns the silhouette. A ship whose biggest
   mass is its job cannot be mistaken for a fighter.
2. **Function is asymmetric.** Work happens on a working side. Booms, shears, plate
   racks and cranes sit off-axis, and the wear sits under them. Symmetry reads as
   military or civilian; working asymmetry reads as a tool.
3. **Engines tell the economics.** A tug is mostly engine, a liner hides its drives, a
   barge's drives are an afterthought at the end of a spine. Thrust-to-mass is visible
   fiction: it says what the owner paid for.
4. **Light color is the trade code.** Amber = mass and cutting. Blue-white = service.
   Green = survey. Orange = salvage. Arc-blue = authority. Red-white = emergency.
   Warm floods = work in progress. This extends the Working Light's cadence code into
   a color register that survives where cadence needs motion to read.
5. **Hazard is written on the hull.** Volatile cargo carries red bands and stand-off
   frames. Cutting gear carries amber chevrons. A soft-dock face carries scuffed white
   padding. The universe paints its dangers because its insurers make it.

At R1 camera ranges (95–165 world units) only laws 1–3 survive; 4 reads in motion;
5 is a close-approach reward. That ordering is deliberate.

**Where this pack begins.** Three trades already have whole-ship hulls bound at
runtime — the courier flies the Helios Lark, the working miner the Helios Cradle,
the general hauler the Helios Span. This pack does not re-author them. It starts at
the nine roles with no craft asset of any kind (tanker, tug, salvage, survey, repair,
customs, construction, rescue — and smuggler, deliberately omitted, §13) plus the two
weight classes the Helios family leaves open at either end of the mining economy: the
one-crew prospector below the Cradle, and the bulk ore carrier above it.

---

## 1. PROSPECTOR SKIFF — `prospector_skiff`

**Trade:** single-crew claim prospecting (THE_WORKING_TRADES §5, Cal of the One Claim).
**Serves:** job kind `miner` (light variant); the fiction's missing Prospector hull.
**Signals:** `reading_the_dark` while hunting, `blind_cone` at the seam,
`home_under_rock` going home.

A 16-metre hull that is half tool-bench. Short survey wand forward (a wand, not a
Ranger's spine — one emitter, hand-aimed), two articulated working arms folded along
the port flank, a claim-stake launcher on the starboard bow with a three-round rack of
paint spikes, and four external filter drums slung under the belly like saddlebags.
One engine, oversized for the mass, because a prospector's margin is being first.
Chevron on the tail hand-painted, one diode dead on purpose — the Guild tell that this
boat is owned, not leased.

**Work state:** arms unfold to the seam, wand lights the amber cone, drums breathe
dust. **Distress:** the stake launcher is the flare gun — a claim spike fired at
nothing, strobing, is a prospector calling for help in the only language they own.

## 2. ORE CARRIER — `ore_barge`

**Trade:** bulk ore logistics — the leg between claim and refinery.
**Serves:** the heavy end of job kind `miner`'s economy (the Cradle cuts, the barge
carries); the Drift "graduation hull" the Prospector dossier names; the visual weight
class the unused Ironback def and roleless Atlas leave empty.
**Signals:** `heavy_burn` loaded, `home_under_rock`, `spilling_the_count` at the
refinery, `stacking` flown wide and early because forty loaded metres do not stop.

Forty-four metres of open-topped honesty. Six ore baskets in two rows of three,
loaded proud so the cargo is visible from a sector away (Guild law: show your mass).
A single loading boom on a bow pivot for trimming the fill — a shovel, not a drill;
the barge does not cut rock and its silhouette must never claim it does. Rugged armor
plate over the forward third where basket spill sandblasts paint. Industrial floods
on masts angled down into the baskets, lit whenever the baskets are worked. Drives at
the end of a short spine, small against the body, because a barge measures profit in
tonnes, not transit time.

**Work state:** boom over the baskets, floods on, dust off the fill line, tally lamp
stepping its five-point ring. **Variants:** `ore_barge_b` swaps the basket rows for a
single center trough and offsets the boom pivot to port — same trade, different yard.

## 3. VOLATILES TANKER — `volatiles_tanker`

**Trade:** pressurised liquids and gases — water ice melt, reactor volatiles, fuel.
**Serves:** job kind `hauler` (hazard-cargo variant); commodity runs for
`cmdty_ice_water` and station fuel.
**Signals:** `heavy_burn` loaded, `clean_burn` empty, `mouth_open` at the coupling.

Three formed pressure spheres in a stand-off truss cradle, or (variant B) four
insulated horizontal cylinders wrapped in amber lagging — either way the cargo IS the
ship. Red volatile bands at every tank equator, repeated on the truss ends where a
docking error would hit first. All piping external, insulated, and routed along the
dorsal spine to a single armored coupling probe at the bow — the one piece of this
ship anyone else touches, so it is caged, lit, and painted like a warning. Crew cab
underslung far aft, behind a blast bulkhead, which every tanker crew will tell you is
regulation and every tanker crew knows is theatre.

**Work state:** coupling probe extended, its cage lit white; tank-status lamps walk
the spine. A tanker's `mouth_open` glows at the BOW, not amidships — couplings before
cranes. **Never shows:** a cutting cone. A tanker that lights amber near your bow is
wrong, and you should already be turning.

## 4. SCRAP SWEEPER — `scrap_sweeper`

**Trade:** debris-field cleanup — the municipal cousin of salvage.
**Serves:** the debris-cleanup role; the civic answer to `cmdty_scrap_metal` and the
five wreck classes; the reason old battlefields eventually stop being navigation
hazards.
**Signals:** `blind_cone` semantics at the mouth (a sweeper's cone points where it
eats), `home_under_rock` hauling the cage home, `spilling_the_count` at the scrap
yard.

Twenty metres of which the front five are mouth. A wide bow scoop — two flared lips
around a lit collector throat, amber-chevroned on both edges because the one thing a
sweeper must never be ambiguous about is which end swallows. A dorsal magnet boom
for the pieces too big to inhale, and an open lattice debris cage aft where a
freighter would have a hold, its catch visible through the bars (show your mass, even
when your mass is garbage). Stubby paired drives set wide and low, clear of the cage.
Municipal rust-orange paint, patched, never washed — a sweeper is the working fleet's
least glamorous hull, and the pack is honest about it.

**Work state:** throat lit, boom sweeping, cage filling. **Never shows:** shears or
umbrellas — a sweeper collects, it does not cut, and the missing cutting gear is what
separates its silhouette from the salvage cutter at a glance.

## 5. REPAIR TENDER — `repair_tender`

**Trade:** hull repair at the client's position (THE_WORKING_TRADES §3, Sola
Patchline).
**Serves:** job kind `tender`; gives `hull_open` the plate rack, weld boom and
"do not push" bar the dossier specifies and the VFX currently mimes.
**Signals:** `hull_open` on station, `spine_wake` re-departing, `clean_burn` between
clients (a tender never carries cargo — its cycle is the only one with DEPART and no
LOAD in the whole kernel).

Built on a freighter frame the way the fiction demands (the Mule shape, not the
Drifter it currently flies as): broad, flat-flanked, more workshop than ship. Port
flank is a curved plate rack — hull skins clamped in a row like books, readable at
range as a striped quarter-circle. Starboard bow carries the welding boom, folded in
transit, elbowed out on station with a lamp-petal head. Dorsal umbilical drum with a
soft-dock collar; ventral rails where the mag-shoed crew walk. Four corner lamps,
static red, and the swing-out white bar across the cold drive: crew outside, do not
push.

**Work state:** boom out, petals lit blue-white, red corners on, bar deployed —
four simultaneous silhouette changes, which is why a working tender is the most
recognisable object in the pack. **Distress:** a tender's distress is someone ELSE's
distress; it flies `breaking_the_pattern` only when its own hull is the casualty.

## 6. YARD TUG — `yard_tug`

**Trade:** moving other hulls (THE_WORKING_TRADES §6, Pim Berth-Hand).
**Serves:** the fiction's Lighter/Tug — a full dossier with zero code presence; the
future dock-approach choreography seam.
**Signals:** `stacking` — flown for the OTHER hull; the tug's own approach is the
client's approach.

Twenty-six metres of which eleven are engine. Two oversized drive blocks shoulder-
mounted on a spine frame, a bow push-cradle with padded ribs scuffed white from a
thousand kisses, hip nudge-keels with replaceable polymer shoes, and an aft winch
tower with the towing drum and its painted capacity plate. High bridge over the
cradle so the pilot looks DOWN the client's hull. Almost no cargo volume: a tug that
carries freight is a tug whose owner has given up on the yard contract.

**Work state:** cradle floods on, drum turning, nudge thrusters ticking in count —
"seven, eight, nine, kiss." **Tow state:** drum line out astern, `heavy_burn` flown
honestly for the combined mass.

## 7. SALVAGE CUTTER — `salvage_cutter`

**Trade:** wreck-breaking (THE_WORKING_TRADES §2, Bram of the Second Cut).
**Serves:** job kind `salvor`; resolves the fiction↔code hull contradiction by
authoring the cutter the dossier describes.
**Signals:** `picking_the_bones` at the hulk, `home_under_rock` hauling the take,
`spilling_the_count` at the yard.

A hull that looks assembled from its own inventory: soot-brown over freighter grey,
patched with plates that match nothing, including one bright unpainted replacement
amidships. Three hooded amber work-lamp umbrellas on articulated arms, aimed DOWN —
salvage light is confession light, hooded so the glare doesn't blind the cutters.
Hydraulic plate-shears on the starboard bow knuckle, jaw open in transit because the
closing cylinder leaks and Bram will fix it when it fails. Tether reels at both hips,
an open-backed scrap cradle where a freighter would have a hold, and a chained stack
of recovered drums riding the dorsal spine.

**Work state:** umbrellas out and lit, shears at the seam throwing arc-white, scrap
arcing back into the cradle. **Condition variants:** this family ships in `worn`
(default) and `damaged` — the damaged variant is missing one umbrella arm at the
shoulder, the honest wound of a trade that works inside collapsing structures.

## 8. SURVEY PIN — `survey_pin`

**Trade:** long-baseline survey (THE_WORKING_TRADES §1, Ness of the Cold Pin).
**Serves:** job kind `surveyor`; gives the mesh-less VFX boom a real spine, paddles
and range-mast.
**Signals:** `reading_the_dark` in every phase but the dock — the only trade whose
work state IS its transit state.

Low-mass and over-instrumented: a slender 22-metre hull under a dorsal sensor spine
half its own length, two array paddles spread like moth wings ahead of amidships, a
range-mast triangle at the tail, and the cold boom pin that crabs out 90° from the
nose when the ship is on survey — the whole vessel flies sideways-looking, which is
why a working surveyor's motion reads wrong to anyone who hasn't crewed one. Ash-grey
with one cold-blue strip; gel drums for the printers racked externally where the
dossier says a surveyor's real money lives.

**Work state:** boom crabbed, green pulse-ring off the pin, paddles feathering.
**Reaction (authored in code already):** paints the stranger, then slides to keep the
boom between you and the belly.

## 9. LINER SHUTTLE — `liner_shuttle`

**Trade:** people, on schedule.
**Serves:** traffic role `express` (speed 247 on a cargo Mule today — the pack gives
that number a hull that explains it) and the civilian-transport slot. Reference art
exists at `assets/ships/massline_express_liner_v1/` (reference-only, no source); this
family is authored consistent with its long-fuselage window-row language.
**Signals:** `clean_burn` flown fast and level; `stacking` in a long, flat, buttered
approach that is the brand promise made visible.

The one family allowed to be pretty. A bone-white 34-metre fuselage with a full-length
row of lit cabin windows — the only window row in the pack, which makes it legible as
"people inside" at any range where a window row resolves at all. Drives faired into
the tail, intakes hidden, a raked bow with the operator's mark. Underslung baggage
pannier with the same container footprint as everything else in this economy, because
even dignity checks luggage.

**Work state:** none — a liner working looks like a liner cruising, and the schedule
is the performance. **Never shows:** external tools of any kind. A liner silhouette
with a boom on it is a medevac conversion or a lie.

## 10. CUSTOMS CUTTER — `customs_cutter`

**Trade:** inspection and interdiction (Concord's Ref 44-C made physical).
**Serves:** the `patrol_scan` encounter surface and the law-side of patrol; the
authority silhouette the pack's civil hulls are all implicitly measured against.
**Signals:** `on_the_pin` flown in the regulated blue-white metronome; the inspection
lamp is its own vocabulary — a steady arc-blue bar no honest trade carries.

Authority without cartoon: a 24-metre wedge with clean navy-arc paint, a dorsal
sensor fin, and a bow inspection array — a squared emitter frame around the nose that
reads at range as a ship wearing a judge's collar. Boarding collar on the ventral
line, hardpoint fairings kept flush (the message is procedure, not menace), high-
contrast registry plates lit at all times, because the one hull that never hides its
name is the one that takes yours.

**Work state:** inspection frame lit arc-blue, sweep lamp locked on the client
instead of sweeping — the fiction's "a patrol that doesn't sweep is not a patrol"
inverted into law: a cutter that stops sweeping has CHOSEN you. **Never shows:**
cargo of any kind.

## 11. RESCUE LIFTER — `rescue_lifter`

**Trade:** answering `breaking_the_pattern`.
**Serves:** traffic role `rescue` (today an unmarked Drifter); the responder's
red-white authority the fiction names and nothing renders.
**Signals:** a responder code of its own — red-white flown STEADY where the victim's
alternates; floods on approach are part of the signal ("we see you").

A 28-metre hull that is half hospital, half crane. Forward casualty bay with a wide
soft-lit mouth and padded jaws (the same soft-dock white as the tug's cradle — one
vocabulary, two trades), a dorsal grapple boom with a basket stretcher cradle, four
mast floods rigged to light a debris field like a work yard, and paired red-white
identity bars running the full flank — the only hull in the pack whose paint IS a
signal, sanctioned because the whole point is being seen from as far as physics
allows. Underslung triage pods in the universal container footprint.

**Work state:** bay mouth open and lit, grapple out, floods up, red-white steady.
**Cost of wrong (per the Guild manual's format):** faking the lifter's bars is the
one forgery every faction hangs for, including the ones that shrug at everything
else.

## 12. CONSTRUCTION RIG — `construction_rig`

**Trade:** building the next station, platform, relay or ring.
**Serves:** the industrial-route future (poi family `convoy_industrial_route`); the
origin story of every dock the other eleven families visit.
**Signals:** `hull_open` semantics at fleet scale — red corners and weld-stitch, but
on a hull that dwarfs the tender; `on_the_pin` while holding over the site.

The pack's big silhouette: a 48-metre open truss spine carrying two tower cranes on
traversing rings, a rack of prefab truss segments loaded crossways (visible cargo,
Guild law, same as the barge's proud ore), a spool of habitat ring segments aft, and
a detachable foreman's cab riding the spine like a railcar. Floods everywhere — a
construction site is the brightest civilian object in any sector, and honest about
it. Hazard chevrons on every crane throat and truss end.

**Work state:** cranes traversed outboard, segment mid-hoist on the hook, weld stars
at the interface, red corners at the working ends. **Idle state:** cranes parked
inboard along the spine — the silhouette folds from "site" to "ship", which is the
family's own deploy/stow read.

---

## 13. The deliberate omissions

**No smuggler hull.** The Working Light's smuggler entry codifies the trade's signal
as ABSENCE — clean burn while heavy, one violet pin, lamps that don't match the
motion. A distinctive smuggler silhouette would contradict the world's own law: the
smuggler's ship is a courier_packet, a liner_shuttle, or a battered independent
volatiles_tanker whose lamps are wrong for its mass. The pack therefore ships
smuggling as METADATA — the integration manifest marks which families are legitimate
smuggler skins and which tells betray them (wear map wrong for the claimed route,
cadence too perfect, secondary systems dead).

**No pirate hull.** Same logic, from §5 of the manual: a raider is a COSTUME until
the weigh. Raiders fly captured working hulls with forged signals; the existing
`ship_hornet` already covers the moment the costume comes off. What the pack adds is
the costume's seams, documented per family as "what a forger gets wrong."

These two omissions are why every other family's identity work matters: deception
only reads in a world where honesty has a shape.

---

## 14. Faction application notes (markings come later, form does not change)

Faction identity is applied paint, lamp discipline and wear — never new geometry.
Per the Working Light §4: Meridian runs factory-timed lamps and crisp livery on the
teal logistics families; Drift claim rigs heat-stain the ochre industrial families
and paint chevrons by hand; Concord's customs cutters are the only regulated
blue-white; Free Frontier fades everything and lets one side go dimmer; the Reach
mimics all of it with a wear map that never matches the route. The pack's material
roles (`npcwork_hull_paint_*`) are the faction hook: recolor the paint roles, keep
the trade roles, and a family changes owner without changing trade — which is the
entire point of a trade-first silhouette language.
