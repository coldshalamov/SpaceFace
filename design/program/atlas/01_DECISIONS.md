# Universe Atlas & Physical Travel — Architecture Decisions

**Status:** accepted 2026-07-19. Supersedes the sequencing proposed in the prompt pack's README.
**Authority:** this file ranks below `ARCHITECTURE.md` and `design/GDD_2_0.md`, above individual packet notes.
**Companion files:** `00_COMMON_CONTEXT.md` (the program brief), `02_EVIDENCE.md` (verified current state),
`03_LEDGER.md` (feature status).

---

## 0. The inversion

The prompt pack assumes a foundation problem — "build an Atlas, unify the maps." Verification
inverted that assumption. **The spatial foundation already exists and is sound.** The acute pain is
three small, numerically proven defects plus exactly one genuinely missing system.

| Prior-audit framing | Verified reality |
|---|---|
| "Spatial truth must be established" | `src/core/coordinates.js` already defines `global_v1` with frame-origin rebasing; `src/data/sectorCoordinates.js` already has frozen global origins for 24 sectors on a 4096 WU lattice. Sound. |
| "The map mixes local and global coordinates" | **Confirmed and localized**: one function, `buildSystemModel` (`src/ui/galaxyMap.js:1102`), plots sector-local zones alongside unconverted global entity positions. ~10 lines. |
| "Speed VFX scale unbounded" | **Confirmed and localized**: `intensity` in `src/render/feel.js:160` is documented `0..1` and never clamped. One missing clamp cascades into opacity, count and flow speed. |
| "Telemetry lacks signed actuator demand" | **Partially confirmed**: the kernel computes it; `computeFlightTelemetry` drops it. A forwarding seam, not new physics. |
| "`nav.autoTravel` has no consumer" | **Confirmed**: this is the one genuinely absent system. |

Consequence: the program is **not** "build the Atlas, then fix the map." It is **"make the existing
truth visible, then build the one missing spine, then grow semantics on top."** Every decision below
follows from that.

---

## D1 — Wave order

**Accepted.**

- **Slice 0 — "The Map Stops Lying."** Four packets on disjoint clean files: system-model frame fix
  (+ the missing player field), VFX intensity clamp, actuator-telemetry forwarding, minimum Atlas
  index. Ships first because *no later UI can be designed on top of a projection that lies*.
- **Wave 1 — the missing spine.** Route follower + Travel Burn. The only genuinely absent systems.
- **Wave 2 — semantics.** Map camera unification, map information architecture (rails / inspector /
  route ribbon), deep-space addressing on the chart.
- **Wave 3 — texture.** Velocity-language redesign, physical lane prototype, region-volume crossfade,
  content seeded along transit chords.

**Gate before Wave 2:** the route follower must drive the ship Helios → Tethys end-to-end through the
`professionalTravelPublicRoute` harness, engaged from a default-route UI action, with goldens
unmoved and Slice 0 landed. Without a real route executing, Wave 2's ribbon and inspector would be
presenting vapor — designing UI against imagined state.

**Rejected:** the pack's Wave 1 (`Atlas` + `Propulsion` as independent foundations). The Atlas is
mostly derivation, not construction, and propulsion changes are worthless until the map tells the
truth about where the propulsion is taking you.

---

## D2 — The Atlas is a derived read model plus a validator, not a registry

**Accepted.** `src/core/atlasIndex.js` + `scripts/check-atlas-integrity.mjs`. Nothing else.

The Atlas explicitly owns:

- **No coordinates.** `global_v1` is the coordinate system, full stop.
- **No persistence.** Discovery and confidence state already exists (`mapConfidenceForSector`,
  `discoveryForSector`, `isSectorCharted`). The Atlas may expose a discovery *tier*; it does not own it.
- **No live entities.** `entityIterator` is live truth; the Atlas is *chart* truth that live entities overlay.

Accepted record shape — deliberately small:

```
AtlasNode { id, kind: 'sector'|'station'|'gate'|'zone'|'poi',
            sectorId, globalPos: {x,z}, name, factionId?, services?, discoveryTier }
AtlasEdge { id, kind: 'gate-link'|'corridor', a, b,
            traverse: { type, distanceWU, baseTimeS }, hazards? }
```

Every node carries a canonical **global** position derived from its authored sector-local anchor.
That boundary conversion is the entire point: downstream consumers get one frame.

**Invariant — sector-local authoring is correct and stays.** It is the right frame for a human placing
a station. Convert at boundaries only. Any pass that "cleans up the frames" across `src/data/` is
rejected: it churns dozens of authored files for no behavioural gain and collides head-on with
concurrent content work.

**`check-atlas-integrity.mjs` is the answer to the product requirement** that adding a new place have
"an obvious, validated path into the Atlas." Authoring stays where it is; the check tells you if you
did it wrong.

**Explicitly not built:** a new authored atlas data file, an authoring editor, discovery-state
ownership, speculative per-node fields "for the strategic layer", or registration into `UPDATE_ORDER`
(this is a pure module — it must not tick). The durable strategic substrate is nothing more than
id-stable nodes and edges; fleet, logistics and territory will never need more than that from it.

---

## D2.1 — Map-model frame contract: `x/z` is global, `drawPos` is sector-local

**Accepted 2026-07-19**, during Slice 0, after the P1 implementer produced evidence that **inverted the
lead's first instruction**. Recorded because getting this backwards is the single easiest way to
recreate the defect the program exists to fix.

The lead initially specified "convert live entity positions down to sector-local so the model is
internally consistent." That is **wrong**, and the tree already knew it:

- `points.x/z` are not merely drawn. Three consumers feed them into `resolveCourseTarget` →
  `ui:setCourse` → `_onSetCourse` → `state.nav.autopilot.target`, which is a **global** sim coordinate:
  the map-open resolver (`galaxyMap.js:576-592`), `getSearchTargets` (`:3210-3226`), and the
  click-target push (`:5484-5489`).
- The siblings cited as "already correctly converted" do **not** overwrite `x/z`. They keep `x/z`
  global and add a *separate* local field: `buildClaimOwnershipMarkers` (`:987`) sets
  `marker.drawPos`; bearings set `drawCenter` / `drawFixedPos`.
- `test/claim-specializations.test.mjs:958-973` pins **both halves simultaneously**:
  `systemMarker.drawPos` deep-equals the authored sector-local position, while
  `resolveCourseTarget(...).pos` deep-equals the global entity position.

**Accepted contract, uniform across every mark in a map model:**

| Field | Frame | Purpose |
|---|---|---|
| `x` / `z` | **global** (`global_v1`) | the *actionable* frame — course payloads, autopilot targets, distance math |
| `drawPos` | **sector-local** for the model's `sectorId` | the *draw* frame — chart projection only |

Overwriting `x/z` with sector-local would have sent autopilot to the wrong sector in every
nonzero-origin system — the same class of bug as the original defect, merely relocated.

Two latent bugs fall out of applying the idiom uniformly, both fixed under this decision:

1. **Static station/gate/poi fallbacks** put *authored sector-local* anchors into `x/z`, so their
   course payloads were already wrong in nonzero-origin sectors. Nothing pinned this. They are
   converted **up** to global.
2. **`_drawSystem:5296`** pushes the global `nav.waypoint.pos` into the sector-local draw span, so the
   span blowout reproduces whenever a waypoint is armed — independently of the model. Converted at the
   draw site.

**This decision also anticipates D3.** Step 3 of the camera migration requires every builder to return
points in global coordinates. Uniform-global `x/z` moves the system builder *toward* that target
rather than away from it.

**Regression guards must be bidirectional.** A guard that only checks "live points have a `drawPos`"
lets the static path rot again. Assert, for every point regardless of provenance, that `x/z` and
`drawPos` differ by exactly `sectorGlobalOrigin(sectorId)` — in a nonzero-origin sector the two frames
are 12,288 WU apart and trivially distinguishable, which is precisely why the bug was invisible in
Helios at origin `(0,0)`.

---

## D3 — Unify the model contract and the camera state; keep the three builders as LOD strategies

**Accepted.** `buildGalaxyModel` / `buildSystemModel` / `buildLocalModel` represent 6,864 lines of
working, checked, content-bearing behaviour. They are not rewritten.

Migration, playable at every step:

1. Slice 0's frame fix lands in the current architecture (sector-local, internally consistent).
2. Introduce `mapCamera = { focusGlobal: {x,z}, spanWU }` alongside the existing zoom. `levelForZoom`
   becomes a function of `spanWU` with identical thresholds, so every existing check keeps passing.
3. Change the builder contract **one builder at a time**: each returns points in global coordinates
   and declares its frame; one projection maps global → screen through the camera. Order: galaxy
   (nearly global already) → system (invert Slice 0's conversion at the output boundary) → local
   (riskiest; carries remembered/dead-reckoned contacts).
4. Continuity then comes free: crossing a span threshold preserves `focusGlobal`, so scale changes
   read as *zooming* rather than *switching maps*. That single property delivers "concentric scales
   of one world."

**Local / System / Galaxy become framing bookmarks mechanically:** presets that tween
`{focusGlobal, spanWU}` — Local = player at ~3–4k span, System = current sector origin at ~10k,
Galaxy = chart centroid at lattice extent. Same keybinds, same muscle memory; the mental model
changes underneath them.

**Rejected:** continuous *rendering* morphs (geometry LOD blending across scales). Semantic zoom with
preserved focus and a short crossfade delivers ~90% of perceived continuity at ~5% of the cost.
Also rejected: a perspective-3D galaxy graph — it sacrifices route and label precision, which is the
whole job of the primary chart.

---

## D4 — Deep space is data sparsity with retained addressing, never absence

**Accepted.** Three layers, cheapest first.

**Addressing.** The player is always in exactly one Voronoi cell — `sectorMembershipAtGlobal()` already
computes this. Outside all zone radii, project the player's global position onto the chord between the
two nearest sector origins, yielding a readout of the form *"HELIOS ↔ TETHYS TRANSIT — 62%, 340 WU
off-axis."* That is a dot product against data that already exists. **This one readout, on HUD and
map, satisfies "never spatially undefined" by itself.**

**The chart.** The player marker never disappears at any scale. In deep space the chart shows the
transit chord, graticule ticks every 1024 WU (quarter-lattice — surveyor's ticks, in-identity), the
two endpoint sigils, progress along the chord, and the `projectedStop` marker already computed by
`estimateBrakingSolution`.

**Recovery verbs.** Three one-press actions built on existing `resolveCourseTarget` + local autopilot:
continue to nearest forward anchor, divert to nearest station, return to last anchor. Recovery is a
verb, not a menu.

**Reference transfer.** From *Starsector*: hyperspace-as-terrain (hazard volumes attached to atlas
edges) and the always-on-the-map property. **Not** taken: a separate hyperspace layer — SpaceFace is
one continuous plane and its strength is that deep space is the *same* map, sparse. From *Elite*:
nothing here; supercruise erases local space, the opposite of the continuity contract. Elite's lesson
belongs to arrival (D5).

**Ordering constraint:** do not seed deep-space content before addressing exists. Landmarks without
an address system are just more clutter.

---

## D5 — Travel Burn is the travel-drive axis, not a fourth assist regime

**Accepted.** Axes stay orthogonal:

- **Assist regime** — Assisted / Drift / Newtonian (exists; describes how input maps to force)
- **Control owner** — Manual / Local autopilot / Route follower (describes who commands)
- **Travel drive** — Off / Spooling / Engaged / Cooldown (new)

Orthogonality is what makes the decomposition compose: *route-follower + assisted + engaged* is
autopilot cruise; *manual + engaged* is hand-flown cruise; disruption is a forced drive-state
transition regardless of owner.

**The governor is shaped, never bypassed.** While Engaged, the cap becomes a moving target that ramps
up: `cap = min(travelCeiling, cap + rampRate*dt)`. On disengage, set the existing
`physicsEarnedMomentum` tag so velocity decays exponentially exactly as the tether-exit path already
does. The kernel's stated philosophy — *"momentum earned through play is spent, not confiscated"* —
already ships the decay mechanism; Travel Burn merely makes momentum **earnable by intent** instead of
only by slingshot. Symmetric ramp up, existing decay down, one governor throughout.

**One legible sentence unifies the propulsion verbs:** *thrust sets speed, boost raises the cap, dash
injects impulse, burn ramps the cap toward the ceiling.* Two fixes make it true:

- **Boost must never brake.** In the governed branch, when velocity exceeds cap and boost is held,
  clamp commanded forward to ≥ 0 (coast) instead of permitting the negative reverse command. Boost
  above cap then reads as "holding what I have", not a hidden anchor.
- **Dash sets `physicsEarnedMomentum`.** Dash-earned overspeed decays gently rather than being slammed
  by the governor — the same grammar as everything else. All three draw one energy pool; one gauge.

**The latch.** Input-level toggle, Num Lock default, rebindable, with laptop and controller bindings.
Braking breaks the latch; steering does not. Damage or lane disruption forces Cooldown — that is the
interdiction hook.

**Speed ceiling: yes, and proudly systemic.** Per drive family (`TORCH` high, `REACTION` modest — the
family system exists, use it for ship identity), drawn as a marked line on the velocity tape,
upgradeable by drive tier. The engineering reason is real: per-tick displacement must
stay well under collision-geometry scale and rebase cadence (`FRAME_REBASE_THRESHOLD_WU` = 8192) must
stay sane. Approached asymptotically through the ramp so it never reads as a wall.

> **Amendment (2026-07-19), on implementation.** This decision originally illustrated the tape marking
> as *"V-MAX 3,200"*. That number was written before the drive catalogue was consulted and **does not
> survive its own engineering justification** — it was an illustrative figure, not a derived one. The
> implementer flagged the discrepancy rather than silently coding to one or the other, which is the
> correct move; a decision record that drifts from the code becomes fiction.
>
> The binding rule is now the derivation, not a literal: the ceiling is a per-family multiple of each
> drive's own governed `combatSpeed` (`TRAVEL_CEILING_FAMILY_MULT` in `propulsionKernel.js`), clamped
> by the drive's `solverSpeedLimit` and by an absolute bound `TRAVEL_CEILING_ABSOLUTE_WU_S = 1200`.
> Measured across the shipped catalogue:
>
> | Drive | Family | combatSpeed | V-MAX |
> |---|---|---|---|
> | `drive_torch_l` | TORCH | 320 | **1120** |
> | `drive_pulse_plate_m` | PULSE_PLATE | 260 | 715 |
> | `drive_reaction_s` / `_m` / `_l` | REACTION | 210 / 195 / 170 | 473 / 439 / 383 |
> | `drive_gravimetric_s` / `_m` | GRAVIMETRIC | — | 252 / 225 |
> | `drive_field_sail_m` | SAIL | 95 | 190 |
>
> The absolute bound is where the engineering argument actually lives: at 1200 WU/s a 1/60 s tick
> displaces 20 WU, which stays well under hull-radius scale and leaves ~410 ticks between frame
> rebases. **TORCH lands 2.4–2.9× above every REACTION drive**, so the ship-identity intent this
> decision cared about is satisfied — by derivation rather than by a number picked in prose.

> **Amendment 2 (2026-07-19): there is no velocity tape.** This decision says V-MAX is "drawn as a
> marked line on the velocity tape", phrased as though describing an instrument that already ships.
> It does not exist. Verified: speed is a bare DOM numeric stat chip (`sf-stat--speed`,
> `src/ui/hud.js:806`) with a hover tip, and the "prograde tick" (`hud.js:1026`) is a world-projected
> velocity-vector marker, not a linear scale. `grep -niE "velocity-tape|speedTape|velocityTape"`
> across `hud.js` returns nothing. **There is no linear speed instrument anywhere to mark.**
>
> This is the second place D5 asserted something the codebase contradicts (the first was
> "V-MAX 3,200"). Both came from writing the decision in prose without reading the thing being
> decided about. The pattern is worth naming because it is cheap to avoid: **an ADR may specify a
> requirement freely, but the moment it names a specific artifact — a number, a widget, a file — that
> artifact must be checked or explicitly marked as to-be-built.**
>
> **Ruling: the tape is built as a *contextual* instrument, not a permanent one.** It is absent
> during ordinary flight and reveals only while the travel drive is spooling / engaged / cooling, or
> while the ship is approaching its ceiling — reusing the HUD's established appear-then-fade chip
> idiom rather than introducing a competing vocabulary. It must fade back out completely (an
> instrument that reveals and then stays is a permanent panel with extra steps), and `motionReduce`
> must suppress the *animation* without suppressing the *information*.
>
> This satisfies D9.9 rather than skirting it. D9.9 forbids new permanent panels **because** the
> reported density paradox — "too little useful information, yet crowded" — is a progressive-
> disclosure failure. An instrument that appears exactly when its information becomes load-bearing is
> the remedy that decision was reaching for, not an exception to it.

**Arrival.** What transfers from Elite is *deceleration as the player's problem with perfect
information* — the 75%-throttle discipline works because the instrument tells the truth. What must not
transfer is auto-magic arrival in manual mode: the product direction explicitly wants overshoot to be
possible. Therefore in a manual burn the HUD shows the stopping arc and a BRAKE NOW cue when
`projectedStop` reaches the arrival radius, and ignoring it means sailing past — that is gameplay. The
*route follower* auto-brakes; that is its job. The autopilot performs **flip-and-burn** whenever
`estimateBrakingSolution` reports it as `bestMode` — the math is already computed, it is a free
spectacle moment, and it teaches the physics by showing it.

**Golden safety:** governor changes are sim-affecting. Follow the MASSLINE2 recipe — feature flags
default ON live and pinned OFF in the golden harness, drive engagement only via input the golden
replays never press, snapshot-whitelist any new nav/drive fields.

---

## D6 — The route follower is a sequencer, not a new autopilot

**Accepted, and binding.** The local autopilot is green-checked with public dock receipts (five public
dock successes, one on a clean checkout: 96 s to `station_helios`, closest approach 154 WU). It is not
replaced.

The route follower owns `nav.route`, decomposes it into legs, and **delegates**: local autopilot for
terminal approach, travel drive for transit, gate handoff for sector transitions. `nav.autoTravel`
finally gets its reader.

**If any packet proposes new steering math, reject it.** Every navigation ask in this program is
sequencing existing controllers; every propulsion ask is governor shaping, input axes, and telemetry
forwarding.

Plot and engage remain **separate actions**, per the product direction.

---

## D7 — Velocity language: measurement, not anime

**Accepted for Wave 3.** Slice 0 ships the clamp only; the redesign is its own reviewed packet.

The current system fails philosophically as well as numerically — additive white streaks are a cartoon
idiom, and the user's complaint that it reads "cheap and cartoonish" is about vocabulary, not
magnitude. Governing principle: **at low speed the *world* conveys motion; at high speed the
*instruments* convey it; particles are only ever a whisper in between.**

| Band | Speed | Language |
|---|---|---|
| 0 — local / combat | ≤ 1× combat | Nothing. Parallax stars and the velocity tape do the work. A streak here is noise in the fight readout. |
| 1 — moderate travel | 1–2× | Sparse fine motes: thin, short, count ≤ ~24, alpha ≤ ~0.2, **normal compositing, not `lighter`**, desaturated warm-white with the faintest teal. Dust shearing past a hull, not lasers. |
| 2 — high travel / burn | 2–5× | Change vocabulary rather than intensity. Streaks get *fewer* and slightly longer, then stop growing. Load-bearing cues move to: increased background parallax rate (the deep-field tile layers become the primary speed signal — the *world* streaming); along-flow smear on bright background points only; HUD burn instrumentation (ceiling line, stopping arc, graticule ticks streaming along the tape). |
| 3 — extreme | > 5× | Streaks fade *out* almost entirely — the inversion is the point. At extreme velocity individual particles are physically invisible. What remains is field behaviour: barely-there full-screen directional grain (~4% opacity), visible region-boundary blending, a few WU of camera lead along the velocity vector, *reduced* shake, and the instruments rolling — velocity digits, sector address ticking over, transit progress advancing. |

Smoothness and quiet read as terrifying speed. This is the one thing Elite's supercruise genuinely
gets right (scale motion of bodies, not particle spam), and it suits the Surveyor's Table identity
because the speed sensation becomes literally *the instruments working hard*.

**Hard prohibitions:** no radial or peripheral vignette effects (that is the rejected visor framing);
no additive white saturation anywhere; `motionReduce` respected in every band.

**Region boundaries are part of this language.** Begin crossfading background and ambient ~1500 WU
before the Voronoi boundary and complete at it, so regions are volumes the player approaches, enters,
crosses and leaves.

---

## D8 — A lane is optional infrastructure on an atlas edge

**Accepted for Wave 3.**

What transfers from Freelancer: lanes are **physical segmented infrastructure** (objects in the world,
not UI); per-segment state; disruption dumps you into real space *at the disruption point, with its
authors present*; recovery means physically reaching the next intact segment. What does not transfer:
instanced systems and jump-tunnel loading screens — SpaceFace is continuous, and the M2a corridor
already proves continuous inter-sector traversal.

**The atlas edge is the corridor; a lane is optional infrastructure on it.** Physically: a chain of
beacon entities along the transit chord, spaced 1024 WU (the lattice quantum — everything sits on the
surveyor grid). Inside a lane segment's volume with the travel drive Engaged, the drive's `rampRate`
and `travelCeiling` are multiplied (×2–3). **The lane boosts your own drive; it never teleports.**
Zero new physics — a modifier on D5's governor ramp. Gates remain the endpoints; the lane is the
string between the pearls.

**Disruption and recovery reuse existing machinery.** A segment is `{intact | disrupted}`. A disrupted
segment drops the multiplier in its volume → the ceiling collapses → `physicsEarnedMomentum` decay
*spends* the excess velocity (confiscation-free slowdown, already implemented) → the player
decelerates into the ambush at the dead beacon, where `encounterDirector` places the pirates. Recovery
is reaching the next intact beacon and re-engaging. The route ribbon marks the disrupted segment in
hazard grammar; the itinerary never orphans because the route follower re-plans over the same edge.

**Minimum prototype — one packet, not a program:** one lane on the Helios → Tethys chord (the textile
mission route). Lazily-spawned beacon entities (47a recipe), flag-gated volume multiplier in the
kernel input, one scripted disruption, map rendering of the segment chain with state. Proven in the
`professionalTravelPublicRoute` harness plus one hand-flown session.

---

## D9 — Rejected approaches

Recorded so they are not re-proposed.

1. **The grand Atlas registry.** "Durable strategic substrate" is bait to build a CRM for space. The
   substrate is id-stable nodes and edges plus a validator; strategic features are future *consumers*.
2. **Rewriting `galaxyMap.js`.** The defects are a frame conversion and a missing field inside 6,864
   otherwise-working lines. Wrap and converge builder-by-builder; never big-bang.
3. **Global normalization of authored data.** Sector-local authoring is correct. Convert at boundaries.
4. **Continuous-zoom render morphing.** Semantic zoom with preserved focus is the product.
5. **A new flight model or a new autopilot.** The kernel is pure and good; the local autopilot is green
   with public receipts.
6. **Content before addressing.** Deep-space landmarks without the address system are more clutter.
7. **Doing the VFX language redesign instead of the clamp.** Clamp first; language is its own packet.
8. **Auto-brake in manual burn, and warp-as-default.** Both contradict the product direction —
   overshoot must be possible, and travel must be through the same universe.
9. **More permanent panels / more static labels.** The reported density paradox ("too little useful
   information, yet crowded") is a progressive-disclosure failure. Adding panels makes it worse.

---

## D10 — Concurrency and packet discipline

A foreign agent is writing this tree concurrently (visual-asset integration). Rules:

- **Dirty-file quarantine.** No packet may edit a file the foreign agent holds, except as a tiny append
  committed pathspec-limited within minutes. Never two packets in one file, ever.
- **Never clear `.git/index.lock`.** Age is not liveness. Use `git commit -- <paths>` only; a
  pathspec-limited commit cannot absorb a foreign agent's staged work.
- **`git add -N` new files immediately** (the preview-env gremlin deletes untracked new files).
- **Packet granularity:** one seam, one owner, one check, one commit, ≤ ~400 lines, zero shared files
  between concurrent packets.

**The single most likely execution failure is compound:** golden-hash movement from governor changes
plus a merge collision in `world.js`/`gameState.js` with the live foreign writer. Mitigated by
religious use of the MASSLINE2/47a golden-safety recipes and by the ownership rules above.

**Second most likely:** a route follower that is green in harness but unreachable in game. The
wired-features contract makes the plot → engage UI action on the default route part of Wave 1's
definition of done, not a follow-up.

> **D10.1 — Post-mortem (2026-07-19): the lead violated D10 and it cost two tree-wide breakages.**
>
> During Wave 1, **two agents were executing packet W1-A simultaneously**. The cause was the lead's,
> not either agent's: resuming a paused packet agent by message created a *second* live instance of
> a packet that was already running inside the workflow. D10 already said "never two packets in one
> file, ever" — the rule was right and the dispatcher broke it.
>
> Consequences, both in shared files, both detected and repaired by the agents themselves:
>
> 1. **`src/data/featureFlags.js`** — both appended a `TRAVEL_FLAGS` block, producing duplicate
>    `export const TRAVEL_FLAGS` / `export function travelFlag`. A hard `SyntaxError` in a module
>    imported by `flightV3`, `weapons` and the sim harness, so for ~2 minutes **every check in the
>    repo failed** with an error pointing at neither packet.
> 2. **`src/core/flight/propulsionKernel.js`** — one agent removed its own scaffold to hand over a
>    clean file, in the window after the other had wired `applySpeedGovernor` to *call* that
>    scaffold. `ReferenceError: normalizeTravelDrive is not defined` on every tick: **the ship would
>    not fly.**
>
> Rules added, all cheap:
>
> - **A resumed agent is a new writer.** Before resuming a paused packet agent, confirm the original
>   instance is not still live. Prefer re-scoping the *running* agent over resuming a stopped one.
> - **When two writers are found in one file, the lead takes the file** — not one of the agents. The
>   lead is the only actor guaranteed to see both sides.
> - **The blast radius rule that would have prevented both:** appending to a shared *module-level
>   declaration* (a flags object, a registry array, an enum) is never a "small additive edit". It is
>   a whole-repo edit, because a duplicate declaration is a syntax error for every importer.
>
> The agents' handling was the part that worked. Both refused to `git checkout` a shared path to
> "clean up" — which would have destroyed the other's work — reported the breakage unprompted, and
> one deliberately declined to fix a defect in the other's file on the grounds that two writers in
> one function was how the damage happened in the first place. **That restraint is the behaviour to
> preserve; the dispatch is the thing to fix.**

> **D10.2 — Quarantine by enumeration, never by glob (2026-07-19).**
>
> The lead wrote the quarantine list using `src/ui/screens/*.js`. Only **three** files in that
> directory were actually held by the concurrent agent (`base.js`, `gameOver.js`, `missionLog.js`);
> `settings.js` was clean the whole time. An implementer correctly obeyed the stated list and
> reported that the Travel Burn latch would ship rebindable in *data* but with **no visible rebind
> row**, because the row is driven by a hardcoded `REBINDABLE` array at `settings.js:78-80`. A
> keybind with no rebind row is not rebindable to a player, so an over-broad glob came within one
> report of silently dropping a stated requirement — and it would have looked like a complete packet.
>
> **Rule: the quarantine list is an enumeration of paths observed dirty in `git status`, never a
> pattern.** A glob quarantines files nobody is editing, and its cost is invisible: the implementer
> obeys, the feature quietly loses scope, and every test still passes. Re-derive the list from
> `git status --short` at the start of each wave rather than copying it forward.
>
> Corollary, and the reason this was caught at all: **an implementer who reports a constraint-driven
> gap instead of quietly absorbing it is doing the job correctly.** Both of this wave's over-broad
> constraints — this one and the `flightV3.js` forwarding point — surfaced because implementers
> flagged them rather than either guessing or silently shipping less.

---

## D11 — The finish line

Extend `scripts/lib/professionalTravelPublicRoute.mjs` into the full acceptance journey as
`check:journey:textile` — it already emits an `autoTravel` receipt and is the closest living ancestor
of the journey the product direction describes. **That check, green on a clean checkout, is the
program's finish line.**
