# REVIEWER DECISIONS — opinionated answers to the 27 open questions

> Reviewer: lead-plan review pass, 2026-07-20, against live HEAD `3d2dc765`.
> Every answer below picks a side. Where a decision belongs to the lead (new packet
> IDs, tombstones, NOW.md edits), it is stated as a **recommendation**, not executed.
> Cross-references: `../_PACKET/04_OPEN_QUESTIONS_FOR_THE_REVIEWER.md` (questions),
> `COLLISION_RESOLUTIONS.md` (mechanical application), `BUILD_PLAN_CORRECTED.md`
> (the plan that falls out of these decisions).

---

## A. Program-authority decisions

### Q1 — Fold, supersede, or parallel? → **(A) Fold-in, with the SF prompts retained as the upgraded design briefs.**

The repo's own rule settles the authority question: `PLAN_REGISTRY.md` — "only
`program/roadmap/**` owns packet work order." A parallel SF-XX ID space is the one
outcome the registry explicitly forbids, and full supersession would throw away two
things the SF plan does not replace: the roadmap's dependency graph and Wave-01 proof
(T01/T02/T03 are INTEGRATED with shipped code), and the depth-program's 26 chunks of
content scope the SF plan never covers (D1–D12 wrecks, E1–E8 planets, F1–F15 props,
G1–G15 NPCs, C-landmarks, B-ship-lines). But naive fold-in would lose the SF plan's
one genuine advantage: its prompt bodies are *better design briefs* than what they
duplicate (SF-20 > H1a's stub; SF-30 knows `shipLedger.js` already exists; SF-05
carries the controller math the roadmap's T05 lacks). So the fold is not "delete the
SF plan, use the old stubs" — it is: **each SF-XX outcome is executed under its
existing roadmap/depth/atlas ID, and the corrected SF prompt body becomes the binding
design brief attached to that ID.** The SF sequence as a *program* is retired as a
work order; as a *brief library* it survives at `design/sequential-build-plan/PLANS/`
with each prompt's frontmatter stamped `folded_into: <existing ID>` by the lead.
Concretely: SF-05 executes as T05; SF-20 executes as depth H1a; SF-30 executes as
depth A2; SF-33 executes as G17/G18; SF-35 executes as R12–R18. New authority is
created only where nothing exists (see Q3). This keeps one work order, preserves all
provenance, and upgrades the briefs — the three properties no other option has.

### Q2 — Is SF-00 redundant? → **Mostly yes: fold its audit duty into the lead's existing reconciliation; the one artifact worth keeping is the mapping table this review produces.**

`design/program/NOW.md`, `02_REMAINING_WORK.md`, and `PLAN_REGISTRY.md` already do
exactly what SF-00 asks (live truth, known reds, occupied lanes), and only the lead
may edit them — an SF-00 agent producing a second `SEQUENCE_BASELINE.md` would create
a competing status surface, which the registry forbids. The genuinely missing artifact
was *queue-specific*: "which existing ID does each SF-XX map to, and is it ready" —
and that artifact is **this REVIEW folder** (`BUILD_PLAN_CORRECTED.md` §A +
`COLLISION_RESOLUTIONS.md`). So: classify SF-00 as `ALREADY_SATISFIED` (by the program
roll-up + this review), do not run it as a prompt, and move its one still-live duty —
the broken `precheck` repair — into the baseline-closeout step (see Q25). Do not let
an implementer re-derive a baseline the lead already maintains.

### Q3 — Where do genuinely-new SF-XX prompts get IDs? → **Recommend the lead extend existing families; no new family letter.**

Seven prompts have no existing home. Recommended assignments (lead owns the actual
numbering; these are proposals): **SF-08 compound collision → new F-family packet
(F18)** — it is a foundation primitive everything else stands on. **SF-07/T19 is
rejected and receives no replacement ID** — the unsolicited pursuit-slot decision must
not be re-admitted under another name. **SF-11 Mass Seed → T20**, **SF-12 continuous field
kernel → T21**, **SF-13 mass-coupling statuses → T22** — the gravity-weapons trio is
one family of physics tools that hangs off the impulse kernel; keeping them adjacent
to the T-family (whose T08 whip they extend) minimizes cross-family dependencies.
**SF-29 twin bridle → T23** (a massline head, object-to-object). **SF-22 environmental
machinery/hazards → new W-family packet (W21)** — it is world content. Until the lead
stamps these, they live in `06_RETAINED_FUTURE_BACKLOG.md` per the registry's own
rule ("Lead assigns a roadmap ID before execution"). I deliberately do not propose a
new family letter: a seventh family would re-create the fragmentation this review
exists to remove.

### Q4 — Depth-program fate? → **Absorb the 5 overlapping chunks; retain the other 26 as FUTURE content scope. Do not tombstone.**

Tombstoning `design/depth-program/BUILD_PLAN.md` would orphan the only scope authority
for 26 content chunks the SF plan never touches (12 wrecks, 8 planets, 15 props, 15
NPCs, 15 landmarks, 20 ship-line entries, factions A1–A5, encounters H1–H8, the Band,
the Living Hull). The SF plan is a *second pass at the depth thesis with better
physics*, not a superset of the depth-program. For the five overlaps the rule is:
**ID stays depth; spec becomes the corrected SF brief.** H1a executes using SF-20's
brief (it is strictly richer — component roster, anti-placeholder list, task
decomposition). A2 executes using SF-30's brief (which correctly says *wire* the
existing `shipLedger.js`, not rebuild). S1–S4 fold into SF-31's pipeline brief. W1/W2
fold into SF-14's planetary slice. The unrecoverability of the 16 IP-CP chunks
(`PROGRESS_LEDGER.md:5–7` — the work lived in a dirty-tree satellite) does not change
this: IP-CP never meant "implemented," and I verify below (Q24) that all IP-CP chunks
are treated as TODO-at-HEAD with possible-artifact status. What the lead *should*
tombstone is narrower: the depth-program's §5 build-sequence for the five absorbed
chunks, replaced by a pointer to this corrected plan's ordering. The other 26 chunks
stay `ACTIVE SCOPE / FUTURE`, pulled into roadmap waves as content when their sector
arrives.

---

## B. Control & feel decisions

### Q5 — USER OVERRIDE 2026-07-24 → **Reject pursuit-slot/autopursuit; preserve G auto-target/draw-to-fly.**

The prior reviewer decision in this section was wrong. It converted uncertainty in an old transcript
into authority for a feature the user never requested, then retired the control the user did request.
That decision is revoked. G retains locked-target weapon lead and relative, clutchable draw-to-fly as
independent channels. MMB pursuit selection, target-relative bearing/range station keeping, pursuit
impulses, pursuit HUD/toasts, and any automatic combat maneuver controller are prohibited. Historical
receipts prove only that the rejected experiment once existed; they cannot re-authorize it. Do not
prototype, A/B, rename, or re-admit it.

### Q6 — USER OVERRIDE 2026-08-05 → **No tether flight mode; assist only the explicit forward+turn chord.**

The prior decision inferred a broad invisible controller from a narrow convenience
request. That inference was wrong. A latch creates a rope and changes no ordinary
flight control. While the player explicitly holds forward plus a turn direction, a
helper may replace only that turn input with the yaw rate implied by current relative
motion and line radius. It may not add radial correction, choose an orbit, change
thrust/strafe/brake/boost, clamp speed or yaw, steer toward the anchor, or introduce a
first-session grace mode. Releasing the chord returns raw steering immediately.

### Q7 — Massline key? → **Space is the canonical massline action; F remains as a legacy alias; both rebindable; migration via the T16 lead lease with default-change only for new input profiles.**

The user named the ergonomics himself (L1664): thumb on Space is the only finger that
is free while arrows steer. The binding: **Space press = latch/cut; Space held =
line-control modifier** (Up=reel, Down=pay-out, Left/Right=orbit direction,
Shift=boost-pump). F keeps working as an alias forever (muscle memory is not a
migration problem worth having). Because `src/systems/input.js` is a locked,
lead-only edit, this executes through the existing T16 input lease; the corrected
plan does not touch the file, it specifies the required `actions.*` semantics and
leaves the edit to the lease owner. Existing saves keep F-as-primary through a
profile default pinned at migration; new profiles get Space primary. The D+F chord
(L1663) dies: the input-history window (150–250 ms) means no simultaneity is ever
required.

### Q8 — Release-timing UI accessibility? → **Redundant channels: (1) rotating vignette segment that locks + expands in-window, (2) pulse-frequency ramp with a distinct triple-pulse at window close, (3) a filling chevron tick on the tether arc, (4) optional rising audio tick; amber→cyan palette, never red/green alone.**

Color is the garnish, never the signal. The primary cue is **geometric**: the
screen-edge vignette is a *rotating arc segment* that visibly decelerates and locks
in place as the release window opens, expands during the window, and snaps shut with
a triple pulse as it closes — fully readable with color filtering off. Secondary:
pulse frequency ramps 2 Hz → steady as the window opens (motion rhythm, distinct
under reduced-motion as an opacity step-ladder instead of a pulse). Tertiary: the
tether arc itself gains a sweeping tick mark that turns solid at the solution moment.
Palette is amber (not ready) → cyan (window) → amber-flash (closing), which is
colorblind-safe by hue *and* luminance; red/green is forbidden outright. Reduced-
motion mode collapses all of this to a static bracket + text-free glyph. This
specification is testable (`check:ui-a11y` + a colorblind-simulation capture), which
"add shape/pulse differences" was not.

### Q9 — Player impact hull damage? → **Zero hull damage from physics impacts; cost = knockback/tumble time + shield-flicker + heat + capacitor drain. No hull floor.**

The two laws don't actually conflict once you separate *damage* from *cost*: Law 2's
immunity is about hull HP, Law 7's "little or no hull damage" concedes the same while
listing the real costs. The user's fantasy (L457–458: blast himself off things,
Spider-Man off planets) requires consequence-free *bouncing*; a hull floor would
punish exactly the emergent mobility that is the game's UVP. The costs that remain
are real and legible: impact imparts knockback/tumble (lost control time), a shield
flicker (readable feedback), heat, and a capacitor hit proportional to absorbed
momentum — so ramming things is never free, but the punishment is resource-and-tempo,
not HP. Enemies take full momentum damage: asymmetry is the design ("player robust,
enemies expressive"). Capacitor coupling also creates the nice side effect that your
mobility budget and your blast-yourself budget compete.

### Q10 — Flyby Focus: dependency or nicety? → **Optional dependency: fix it as its own small bounded task in the same wave as the release predictor; targeting/release must pass acceptance without it; when present it must be sim-coupled time-scale, never render-coupled.**

The user noted it's broken (L1652). Making it a hard dependency couples the whole
control spine to a broken feature; ignoring it wastes the one tool that makes
high-speed tether acquisition and release timing humane on a trackpad. So: the
acquisition (SF-03) and release (SF-06) systems are specified, tuned, and accepted
*without* time dilation — Flyby Focus is a multiplier, not a crutch. In parallel, a
small bounded repair: trigger on high closing speed + hostile/interactable candidate,
ease time-scale toward 0.4–0.6 over ~150 ms, hold bounded, ease out; implemented by
scaling the sim accumulator ratio (fixed-step sim runs fewer steps per real second),
which keeps determinism and replay intact — scaling render dt instead is a forbidden
shortcut because it decouples input sampling from physics. It gets its own check
(`check:flyby-focus` exists) and its own receipt; nothing else blocks on it.

---

## C. Scope & restraint decisions

### Q11 — First physics-weapon set? → **Ship exactly three: concussion cannon, vector mine, RCS disruptor. Add the recoil lance as the fourth before the gold corridor. The other six defer.**

The three are confirmed: they are the three *verbs* (push, area-deny, disable), they
each demand a different enemy-response read (tumble, relocation, drift), and they are
the three the roadmap's impulse plumbing already half-supports (`impulseCharges.js`
has `anchorKick`, `slingBomb`, `tailPop` to model against). The recoil lance earns
its slot before G17 because it is a *mobility* weapon — fire backward to boost,
broadside to dodge — which directly serves the two declared fun sources
(physics-earned speed, blast-yourself-off-things) and costs little once the impulse
kernel exists. The rest defer with reasons: gravity puck and repulsor burst are
subsumed by the Mass Seed well/repulsor modes (building them as separate weapons
duplicates SF-11/12); anchor charge and tractor pulse are combo tools that need the
mass-coupling statuses (SF-13) to mean anything; ricochet slug requires compound
collision (SF-08) to be honest; tether cutter is explicitly "only after massline play
is reliable" per its own spec. Every weapon also gets `impulsePerHit` from the
universal kernel (user L1686) — including the starter cannon at near-zero.

### Q12 — Massline head order? → **Tractor → Elastic Whip → Frame Coupler → Monofilament → Transverse Snare → Twin Bridle. Drag Net defers to post-release. The Frame Coupler/Meteor Express inversion is resolved by deferring Meteor Express.**

Gravity 06's priority order stands, with the snare inserted next to its combat
sibling. Tractor first because it is the tow/rescue/cargo verb the economy loops
already want (T11/T12) and its force-law is the simplest possible head. Elastic Whip
second because it is the biggest fun-per-line-of-code in the set (spring energy is a
new *toy*, not a new weapon) and it rides the existing reel/pump. Frame Coupler third
— and this resolves the F15 ordering inversion: instead of pulling the coupler
forward to serve Meteor Express, **Meteor Express defers to post-corridor**; the
coupler lands at its natural priority and the meteor fantasy waits for it, no
inversion required. Monofilament and Transverse Snare fourth/fifth as the combat
pair. Twin Bridle sixth (object-to-object per the user's L1694 framing — see the
SF-29 brief, which guards this). Drag Net defers: it requires a large hull the
player plausibly doesn't own in the corridor, and "gobble up enemies and drag them
into a planet" is a power-fantasy capstone, not a first-pass toy. One feature flag
per head (F-q12), not one flag for all six.

### Q13 — First recomposition sector? → **Ceres Belt, reconciled as the physical sibling of roadmap W08's Ceres postcard; the 12 depth seeds stay future content.**

Ceres Belt is the gold-corridor mid-hub: recomposing it means every corridor run
(G17/G18) traverses the proof. The atlas program's W07–W10 own the *map/postcard*
semantics of Helios/Ceres/Tethys (10/11 on the textile journey already); SF-21's
recomposition is the *physical* composition of the same Ceres space — 2–4 separated
activity pockets, visible route, one monumental silhouette. They are the same sector
at two zoom levels, not two competing sector projects: the W08 postcard must render
the pockets SF-21 places. Sequencing consequence: SF-21 executes as a W-family packet
immediately after W08's postcard semantics, not before. The 12 depth-playbook seeds
(Carrier Grave, Silent Exchange, Blackglass Lease…) remain the authored future
sectors; none is the first because none is on the corridor.

### Q14 — Wreck Cathedral's sector? → **The graveyard pocket of the recomposed Ceres Belt for the first slice; sector-agnostic thereafter.**

Depth 04 never named a sector and shouldn't have had to: the first Wreck Cathedral is
a *site*, and sites live in pockets. Placing it as the mystery/graveyard pocket of
the Ceres Belt recomposition (Q13) does three things at once: it gives SF-20 a home
with normal-route reachability from the corridor, it gives SF-21 its required "one
monumental silhouette" for free, and it matches the user's lived diagnosis (L587:
every sector is a central cluster with nothing off-lane) by putting the hero object
deliberately *off*-lane, in the shadow. Thematic kinship with the Carrier Grave and
Blackglass Lease seeds is noted for when those sectors activate; the Cathedral itself
is a unique site, not a seed member.

### Q15 — Black holes, Lagrange nodes, gravity-course contracts? → **None before the gold corridor. Gravity-course contracts (slingshot time-trials) are the first post-corridor content wave; black holes and Lagrange nodes are post-release.**

The user's restraint warning (L1851) applies precisely here: all three are
handcrafted late content whose entire fun is already delivered cheaper by the
planet-sling release window (SF-06/SF-14). Gravity-course contracts are the only one
I'd revive early-*ish*, because they are pure reuse: authored sling route + release
windows + a timer, i.e. a mission template over proven primitives — that is a
post-corridor content wave candidate, not a system. Black holes ("authored zones,
bounded forces" — a bespoke physics art project) and Lagrange nodes (a map/physics
hybrid with no consumer yet) are post-release. If a build step ever claims one of
these is needed for the corridor, that step is wrong.

---

## D. Cross-package reconciliation decisions

### Q16 — VFX owner? → **One owner: a single physics-VFX language work item under the R-family (recommend a dedicated R-packet), canonical spec = gravity package doc 05; the atlas pack contributes only its speed/RCS/env content to the same library.**

Gravity doc 05 is the stronger spec — the 10-technique toolbox (instanced particles,
shader ribbons, SDF shapes, distortion buffer, depth-aware soft particles, mesh
shockwaves, flow-field advection, pooled emissive lights, GPU noise, camera trauma),
the five VFX laws, the massline anti-"HTML-bloom" layered redesign, and the ten
acceptance gates — and it directly answers the user's L1680 complaint. The atlas
pack's VFX doc duplicates ~80% of it; its unique content (speed-streaks for Travel
Burn, RCS nozzle truth, environment transitions) is *content* expressed in the same
language, not a second language. So: one VFX library, one owner (the R-family
presentation owner), gravity 05 as the binding spec, atlas content folded in as
consumer requirements. Two competing VFX systems is the explicitly forbidden outcome;
the merged forbidden-shortcut list lives in the SF-32 brief.

### Q17 — propulsionKernel owner? → **The physics/controls owner (gravity 06 "Agent A" = the roadmap physics seam) owns kernel internals; the atlas program owns Travel Burn as a consumer feature layered on top. No transfer; record the seam.**

Both packages "owning" propulsionKernel.js was a planning collision, not a real one:
the atlas program already built Travel Burn (its Wave-1 spine is route follower +
Travel Burn, and the textile journey is 10/11). The clean seam: kernel internals —
actuator allocation, governor law, capacitor/discharge model, authority integration —
have one owner, the physics/controls seam; Travel Burn is a flight-regime *flag* plus
a discharge *profile* consumed through that kernel's public interface, owned by the
atlas work. The depth-playbook's Agent A scope statement and the atlas pack's
propulsion-agent scope statement are reconciled by exactly this split: Agent A never
owned route planning or travel features; the atlas agent never owned actuator truth.
Any future change to governor law (e.g., orbit-assist radial correction budget) goes
through the physics owner; any change to *when Travel Burn is available* goes through
the atlas/travel owner.

### Q18 — Planet identity contract? → **One record, two aspects: the atlas record is the canonical identity (stable ID, 4096-WU global position, bounds/orbit, discovery state); the physics profile hangs off the same ID (attraction profile, atmosphere bands, collision/exclusion policy, sling anchors); a single planet-registration adapter consumes the atlas record and spawns physics+visual+collision together. No physics planet without an atlas record; no atlas planet without a physics-profile field.**

This is the general pattern the repo already half-enforces with `check:atlas-integrity`
("a new place is not done until atlas-integrity is green"). The join lives in one
adapter (planet factory/registration seam): given an atlas record, it must produce —
in one transaction — the visual body, the exclusion/collision policy, the bounded
attraction field (artistic-liberties profile, documented as such), the atmosphere
band definitions, and the map glyph/hologram, all keyed to the atlas stable ID.
Anything less produces the two failure modes the packages warned about in opposite
directions: a map planet you can't physically slingshot (atlas-only), or a gravity
ball that doesn't exist on the map (physics-only). SF-14's brief carries this
contract explicitly.

### Q19 — Wreck tiers? → **Three tiers, one atlas record type: (1) aftermath — small entity + atlas record; (2) site wreck — SF-19 World-Site instance + atlas record with `siteRef`; (3) monumental — the H1a/Cathedral pipeline + atlas record + provenance/ledger package. Map glyphs show tier and confidence; a tier ≥2 record must resolve to a reachable physical site.**

This reconciles the atlas's "lightweight wreck record" with the depth-program's
monumental sites without either side lying: the map never promises more than the
physics can deliver, because the atlas record carries the `siteRef` that the route
follower navigates to and the World-Site kernel instantiates. Tier 1 (the radius-9
class) is explicitly *flavor* — labeled as aftermath/debris on the map with low
confidence, so a player never flies 40 seconds to a glowing ball expecting the
Cathedral. The tier vocabulary lands in the atlas place schema and the SF-19/SF-20
briefs; `check:atlas-place-path` should grow a tier-resolution assertion.

### Q20 — Does Travel Burn survive the atlas inversion? → **Yes — SF-26's "travel infrastructure" half is `ALREADY_SATISFIED` by the atlas program; SF-26 narrows to its genuinely new half: player-manufactured physics/travel infrastructure (one sling anchor or acceleration ring), sequenced after the industrial claim exists to build it.**

The atlas program's own decision (D1, 2026-07-19) is that the spatial foundation
exists and only the route spine was missing — and the spine is now mostly proven
(textile journey 10/11, `check:route-follower` exists). Executing SF-26 as written
would rebuild decided work. What remains genuinely new in SF-26 is the *manufacturing
verb*: asteroid-ops output → a placed, permanent, physics/travel object that changes
a real route. That has no existing owner and depends on the industrial claim (SF-25)
to be buildable, so the corrected plan moves it late-P3, scoped to exactly one
manufactured object type (recommend: the acceleration ring — "a new movement verb,
not a percentage" per depth 05) plus one support structure (cargo catcher). The
route-follower/Travel-Burn half is recorded as `ALREADY_SATISFIED` with the atlas
program as authority.

---

## E. Implementation-risk decisions

### Q21 — Orbit-assist tuning methodology? → **Derive seed values analytically from ship stats, then grid-search ±50% in the deterministic lab against a fixed acceptance matrix. Concrete starting procedure in the SF-05 brief; "tune through playtesting" is not a method.**

An implementer handed `radialCorrection = -Kr*lengthError - Kd*vRadial` with no values
will flail. The procedure: (1) **Bounds from the ship**: `aRadialMax = 0.20 ×
shipMaxThrustAccel` (inside the design's 15–25% cap), `ωmax = ship's max yaw rate at
combat speed`, `Rmin = anchorCollisionRadius × 1.15`, `anchorMassRatioMin = 50`
(asteroids/stations qualify, fighters never). (2) **Gains from a settle-time spec**:
pick target settle time `Ts ≈ 2.0 s` for the radial loop; place the closed-loop pole
`ωn = 4/Ts = 2.0 rad/s`; slight over-damping `ζ = 1.0` to guarantee no overshoot into
the anchor; then `Kd = 2ζωn = 4.0` (in normalized authority units per unit radial
velocity) and `Kr = ωn² = 4.0` (per unit length error), each clamped so the commanded
correction never exceeds `aRadialMax`. (3) **Grid-search** `Kr, Kd ∈ [0.5×, 2×]` seed
× `Ts ∈ {1.5, 2.0, 2.5}` in the deterministic lab across the acceptance matrix
(3 line lengths × 3 approach speeds × 3 anchor masses): pass = no anchor contact,
tangent-dominant velocity within 2 s of engagement, 10 s sustained orbit, no
oscillation at 60 Hz sim. (4) Lock the winner, record the traces in the receipt, and
expose the constants in one named config (`orbitAssist.tuning.v1`) so a later balance
pass touches one file. The same method may tune the tractor head (SF-27); it must not
be used to resurrect the rejected pursuit controller.

### Q22 — Predictor cadence vs Arm-mode "frame"? → **"Frame" means "latest sampled solution." Predictor solves at 10–20 Hz; the Arm consumer evaluates every sim tick against the interpolated solution stream and cuts on the first tick inside the window. No 60 Hz re-solve.**

The two docs are reconciled, not chosen between: gravity 06's 10–20 Hz is the
*solver* cadence (perf budget); gravity 02's "next valid solution frame" is the
*consumer* semantics. Implementation: the predictor publishes a solution at 10–20 Hz
with the current window phase interval; between publishes, the consumer linearly
interpolates the window boundaries against sim time; Arm mode holds and cuts on the
first sim tick whose phase falls inside the interpolated window. Determinism is
preserved because the solver runs on sim ticks (every 3rd–6th tick), not wall time.
This gives Arm effective ~60 Hz responsiveness at 10–20 Hz cost, which is exactly
what a trackpad player needs when the window is ~300 ms.

### Q23 — NPC cargo: statistically or physically? → **Physically when materialized; statistically when virtualized — but statistical deltas still route through the cargo/economy owners as intents applied at virtualization boundaries. "Statistically" never means "the job controller writes state."**

Gravity 04's "statistically or physically" and gravity 06's "cargo remains sole cargo
writer" are both honored by putting the boundary at the right place: when an NPC is
off-screen/virtualized, the job controller advances phase and *accumulates a cargo
delta as intent records*; when the NPC materializes (or at day-tick), those intents
are submitted to `cargo`/`economy` owners, which apply or refuse them and emit
receipts. The job controller holds `cargoManifest` as *data*, never as state writes.
This preserves the single-writer membrane, keeps the offscreen economy honest
(virtualized miners actually produce, statistically), and keeps the GTA loop real:
a convoy you intercept mid-route has the cargo the intents said it picked up.

### Q24 — The 16 unrecoverable IP-CP chunks? → **Treat every IP-CP chunk as TODO-at-HEAD with possible-artifact status; re-verify at HEAD before any dependence. Verified concretely: A2's `shipLedger.js` exists in master with zero importers → wire it; everything else → assume nothing.**

"IP-CP" meant "a checkpoint satellite preserved surfaces," not "accepted," and the
work isn't in committed master. So no build step may *depend* on an IP-CP chunk
without first re-deriving its state at HEAD. Concretely for the chunks this plan
touches: **A2 (Ship's Ledger)** — I verified `src/ui/screens/shipLedger.js` exists at
HEAD with zero importers; the chunk becomes "wire + content pipeline," not "build."
**W1 (planets)** — no committed planet physics is assumed; SF-14 builds the slice
from the gravity brief, treating W1/W2 as scope provenance only. **S3/S4 (ship
families)** — re-verify any claimed asset at HEAD before SF-31 admits it into a
family; the checkpoint's `08_GRAPHICS_OVERHAUL_CHECKPOINT.md` is the admission gate.
**F1/F2/V1/V2/R1/R2/SP1/E1/A1/K1/D1/GT1** — not on the critical path; if a future
step touches one, same rule: re-verify, never inherit status. The roll-up language
stays as-is (only the lead edits it), but every brief in this plan treats IP-CP as
"unproven until re-run at HEAD."

### Q25 — Broad `npm run check` is dead? → **Repair the precheck assertion as part of the baseline-closeout step; it is small, in-scope, and the whole program needs broad verification at the integration gates.**

The failure is one stale assertion (`check-m1-tether-mass-grounding.mjs:24` expects
`check:ci` to inline a command it now delegates). Routing around it would leave the
integration steps (G17/G18, R12–R18) without their required broad gate and would
teach every later agent that red baseline tooling is normal. The fix is a bounded
harness repair (point the assertion at the delegation contract, or inline the
tether-mass command as the assertion expects — whichever the foundation refactor
intended), owned by the test/tooling seam, landed in the baseline step before any
physics work, with `check:sim:compare` re-verified green after. It is not scope
creep; it is the cost of having a verification strategy at all.

### Q26 — Physics membrane has ~17 violations? → **Route around existing violations; enforce the membrane on the new impulse path; register the 17 as named debt owned by an F-family packet with a release gate of zero new violations.**

SF-09 must not try to fix 17 legacy violations — that is a scope explosion across a
dozen owners mid-physics-program. Instead: the universal impulse kernel routes
through `physicsAuthority` by construction, ships with a mutation/contract test that
fails on any *new* direct velocity write in weapon/impulse paths, and the 17 known
violations (`POLISH_BRIEFING.md:70`, T2) are recorded as a named debt list. A
follow-on F-family packet repairs them file-by-file (they are mostly old combat and
UI feedback paths per the briefing); the release gate (R12–R18) requires "zero new
violations + debt list either closed or explicitly waived by the lead." This keeps
SF-09 bounded while making the membrane strictly *less* aspirational after it lands.

### Q27 — Minimum viable set for the bar? → **Three arcs: The Toy (controls+physics), The World (one sector, one wreck, jobs, one crime loop), The Proof (visual families + HUD/VFX + corridor). 22 of 36 prompts; the other 14 are Wave-2 or absorbed. See `CRITICAL_PATH.md`.**

The fun bar is: massline feels like a toy (SF-02→03→04→05→06), combat is physical
and twitchy (SF-09→10, enemy balance), direct auto-target/draw-to-fly remains trustworthy, the
planet fantasy lands (SF-11→12→14), the world is alive and criminal (SF-15→16),
there is one hero place worth flying to (SF-08→17→18→19→20), the story accumulates
without walls (SF-30), it looks like a shipped game (SF-31→32), and the corridor
proves it end-to-end (SF-33). Everything else is either absorbed into those
(SF-00/01/13/21-partial/23/24/25/26), Wave-2 (SF-22/27/28/29), or post-corridor
(SF-34, and SF-35 as the release gate itself). The detailed cut, with kill-order if
scope pressure rises, is in `CRITICAL_PATH.md`.

---

## F. The "stimulate questions" flags — dispositions

- **F-q1 (24 vs 12 vs Ceres):** The live atlas sector records are the only inventory
  truth; the 12 seeds are authored future content; "24" was aspirational scope and
  is retired as a number. Ceres Belt is first (Q13). No conflict remains once "atlas
  = truth, seeds = pipeline" is stated.
- **F-q2 (7-stage vs 5-stage):** Both kept, different jobs: the 7-stage ladder is the
  implementation/progression model; the 5-stage arc is the player-facing story frame.
  Mapping: Scrapper+Prospector ≈ pilot; Foreman ≈ operator; Engineer ≈ engineer;
  Network Builder+Constructor ≈ network builder; Regional Power ≈ regional power.
- **F-q3 (cloaked ballistic drift):** Lore, not a mechanic — no cloak system exists
  or is planned in this plan. Strike the phrase from any implementable brief; keep as
  flavor text only.
- **F-q4 (hidden anchor reveal):** Resolved by rule: hidden anchors/routes become
  revealed only through the progressive-survey channel (SF-23/A04). One mechanism,
  no bespoke reveal logic.
- **F-q5 (storm cells):** Cosmetic variance inside the atmosphere storm band for the
  first slice (density/turbulence noise on the band profile), not a system. If SF-14
  acceptance shows the storm band is unreadable without authored cells, it becomes a
  follow-on — not before.
- **F-q6 (Gravity Lens):** Deferred, per gravity 03's own defer. Not in this plan.
- **F-q7 (VFX prompt asymmetry):** Fixed in the SF-32 brief, which now carries named
  technique specs for the in-scope prompt-less effects (concussion: mesh shockwave +
  instanced debris + camera trauma; inertial shunt: SDF target bracket + ribbon tint
  shift; atmosphere skim: flow-field particles + depth-aware soft particles + heat
  distortion). Deferred effects defer their specs with their features.
- **F-q8 (autonomous bridle node):** Defined in the SF-29 brief: if the player
  releases mid-setup, endpoint A persists as a visible, expiring bridle anchor
  (~10 s) with a HUD marker; no invisible persistence.
- **F-q9 (Mass Seed as bridle endpoint):** Resolved: a Mass Seed anchor is a valid
  single endpoint for a twin bridle, never both; its separate use as a sling anchor
  is a different verb (anchoring, not bridling) and creates no grammar conflict.
- **F-q10 (LOD vs no-quality-reduction):** The distinction is made explicit in the
  SF-32 brief: LOD adjusts *density* (particle counts in pooled instanced systems,
  ribbon segment counts) as a function of camera scale; it never removes a *layer*
  (no dropping the energy sheath, the shockwave, or the soft-particle pass) and never
  changes default quality settings. Density is invisible at the zoom where it
  applies; layer removal is not.
- **F-q11 ("two focused iterations"):** Defined: one focused iteration = one
  implement → lab-trace → player-route-capture cycle against a named hypothesis.
  Stop condition: after two cycles the acceptance matrix still fails the core
  maneuver → stop, write the failure receipt, escalate to user/lead. No blind
  third iteration.
- **F-q12 (one flag for six variants):** One flag per head
  (`masslineHeadTractor`, `masslineHeadElasticWhip`, …). Per-head flags cost nothing
  and let each head land with independent acceptance. (See Q12.)
- **F-q13 (convoy→capital-hull stitch):** Made a writing requirement in the SF-30
  brief: ledger page 1 ("The Missing Convoy") must state that the convoy's
  destination was the Cathedral-class hull; one sentence stitches the thread.
- **F-q14 (depth files 07/09/12 under-digested):** Acknowledged. The corrected briefs
  cite the specific pasteable brief in `ORIGINALS/spaceface_depth_playbook/
  09_PASTEABLE_FEATURE_BRIEFS.md` per feature, and the anti-slop contract (07/11/12)
  is enforced through each brief's ≥5 forbidden shortcuts + acceptance evidence —
  which is those files' content operationalized.
- **F-q15 (ORIGINALS canonical):** Noted; no discrepancy encountered in this pass.
