# SPEC2 — Agent Dispatch Prompts

> **Manual prompt library — explicit activation required.** These lane briefs apply only when a
> user/lead selects and dispatches one. They are not repository-wide ownership law. For ordinary
> implementation, follow the applicable `AGENTS.md` and activated spec, and touch every integration
> seam required for a coherent player-facing result. A lane boundary prevents concurrent writers;
> it is not a permanent prohibition once ownership is free or coordinated.

Ready-to-paste briefs, one per implementing lane. Each is self-contained: a fresh agent with no
memory of this session should land in the right place from the prompt alone. Specs are the source of
truth — these prompts frame *who* does *what*, point at the spec, and pin the exact verification
commands (the INDEX gives these generically; this file makes them spec-specific from `package.json`).

## How to use
1. When using this library as a concurrent campaign, dispatch in **waves** and avoid simultaneous
   writers in overlapping files. Sequential/integrated work may cross the listed lanes.
2. Paste the **shared preamble** + the chosen lane's prompt into the agent.
3. Run the **review gate** yourself on each result before claiming it.

### Wave order (from INDEX.md — respects dependencies + file-conflict lanes)
| Wave | Spec | Best agent skill | Parallel-safe with |
|---|---|---|---|
| 1 | `01_MASSLINE_FEEL` | **Backend / physics** (deterministic sim, Rapier) | 03, 07 |
| 1 | `03_FIRST_HOUR` | **Content / narrative systems** | 01, 07 |
| 1 | `07_AUDIO_IDENTITY` | **Audio / systems** (procedural synth) | 01, 03 |
| 2 | `02_FLIGHT_CAMERA_JUICE` | **Frontend / graphics + feel** (after 01) | 05 |
| 2 | `05_ECONOMY_PROGRESSION` | **Backend / systems** (leans backend) | 02 |
| 3 | `04_WORLD_ALIVE` | **Backend / sim + AI** (after 02) | 06 |
| 3 | `06_UI_IDENTITY` | **Frontend** (after 04) | 04 |
| 4 | `08_RELEASE_READINESS` | **QA / release** (after all + 47a golden re-record) | — |
| ∞ | **Asset production** | **Blender MCP** (longform, see §10) | runs on its own lane; coordinate via `release.__lock/` |

---

## Shared preamble (paste into EVERY brief)

```
You are working in the SpaceFace repo. Read these before touching code, in this order:
  1. ARCHITECTURE.md — the technical contract (fixed 60 Hz sim, XZ plane, sim never imports Three.js,
     UI emits intents only, determinism via state.rng, no per-frame allocations in hot paths).
  2. design/GDD_2_0.md and root AGENTS.md — design authority and current repo policy.
  3. The specific activated spec named below. Implement its player-facing and behavioral outcome;
     treat numeric/visual recipes as starting hypotheses unless they encode a tested behavior or
     current technical contract. Choose the strongest coherent option supported by current evidence.

Non-negotiables:
- Explain deliberate changes to behavioral acceptance values in the same change. Historical visual
  values are not mandatory palette, glow, radius, shell, texture, or triangle ceilings. Transcripts
  are not evidence — checks and player-facing captures are.
- Never edit test/*.expected.json goldens to make a check pass (fix the code, or flag the golden for
  a deliberate re-record batch). Never add dependencies silently: build-time and runtime dependencies
  are allowed when they materially improve the result and document license, integration/maintenance,
  bundle/memory/performance, determinism/save, and browser/Electron parity impact as applicable.
- Acceptance assertions in the spec are the definition of done. If the named check script does not
  exist yet, WRITE IT (it is part of the task).
- Use the spec's named files as the ownership starting point, then touch the integration files needed
  for a coherent result. Respect active asset/render ownership signals before entering those lanes.
- Determinism: no Math.random() in sim (use state.rng); no wall-clock time in sim (use state.simTime).
- Print a 10-line summary when finished: files changed, check results, any spec number you adjusted
  and why.
```

---

## Wave 1

### 1. `01_MASSLINE_FEEL` — Backend / physics agent
```
Implement the player-facing and tested behavior in `design/spec2/01_MASSLINE_FEEL.md`. This is a physics fix: the tether uses a hard
Rapier rope joint that "boinks" the player elastically; replace it with a damped-spring radial
capture so momentum converts into swing instead of bouncing back.

You own: src/core/sg02DynamicBodyOwner.js (joint model, _createAttachmentJoints ~line 497),
         src/data/combatDefs.js (add `spring` blocks), src/systems/tetherGameplay.js (phase mirror
         only), and a NEW scripts/check-massline-feel.mjs.
Do NOT touch: src/render/vfx.js (visual already binds to the mirror), src/input/*, any UI.

The model (spec §2): replace RAPIER.JointData.rope() for tether_standard + attachment_massline with a
custom radial spring-damper impulse applied each physics tick by the sg02 owner. Purely radial,
pull-only (force clamped >= 0, line never pushes). The anti-boink is the CAPTURE RAMP: on the tick
stretch first goes >0 after >=0.1s slack, ramp K via smoothstep over CAPTURE_S=0.35s so the radial-
velocity kill spreads over ~21 ticks instead of 1. Derive damping C at runtime from live body masses
so zeta = C/(2*sqrt(K*mu)) lands 0.85-1.05 (mu = reduced mass). Max-stretch break guard at
stretch > restLength*0.45. Reel must never inject energy.

Tune table (spec §4): tether_standard spring {K:140, zeta:0.95, captureS:0.35};
attachment_massline spring {K:170, zeta:0.90, captureS:0.30}. Keep existing break blocks; verify the
three tether contracts still pass and adjust break.maxTension (NOT the spring) if overload needs it.

Definition of done — scripts/check-massline-feel.mjs must assert (spec §6), deterministic in the sim
harness:
  1. No boink: radial velocity after capture <= 15% of pre-taut magnitude, never reverses > 10%.
  2. Swing preserved: tangential speed at capture+0.5s >= 85% of pre-taut.
  3. Smoothness: per-tick speed delta during capture <= 9 wu/s (old rope did 40+).
  4. Arc monotonic: heading change accumulates one sign from taut to cut.
  5. Slingshot contract intact.
Regression floor (run all, must be green):
  node scripts/check-massline-feel.mjs
  node scripts/check-tether-gameplay.mjs
  npm run check:sg02:tether && npm run check:sg02:tether-break
  npm run check:sim:compare   # hashEqual:true is the pass bar pending the 47a golden re-record
```

### 2. `03_FIRST_HOUR` — Content / narrative systems agent
```
Implement the player-facing outcome in `design/spec2/03_FIRST_HOUR.md`. The problem is pacing, not deletion: the current
open teaches five things at once. Re-pace the first 15 minutes so one beat -> one verb -> silence
-> next beat. Write concise, characterful copy that remains readable during play; do not optimize for
a universal word, punctuation, or capitalization recipe.

You own: src/systems/onboarding.js, src/systems/story.js, src/data/missions.js (STORY_BEATS /
BEAT_CONTENT), src/contracts/ (47a scenario scripting), src/ui/screens/{mainMenu,newGame}.js, and a
NEW scripts/check-first-hour.mjs.
Do NOT touch: comms gating (shipped), control prompts.

The 6 beats (spec §2), each text-gated: a beat fires only when the previous beat's DONE fired AND
>=4s of text silence passed.
  B0 WAKE (0:00) "Thrust to the beacon." | B1 DERELICT (~1:30) tether trio | B2 FIRST SEAM (~3:00)
  scan+mine | B3 SNARE (~5:00) weak pirate interdicts, flees at 30% hull dumping cargo, death =
  full-heal respawn (no punishment spiral) | B4 DOCK (~7:00) sell flow + ONE recommended contract |
  B5 CHOICE (~12:00) three side-by-side offers (HAUL/BOUNTY/SURVEY); accepting any ends tutorial mode.

Menus (spec §3): 12s idle attract on title (render-only drift, no sim); NEW GAME pilot-name
autofocus, difficulty copy <=8 words, START disabled-state never visible >300ms; first-run single
full-screen line on black 2.5s "Helios System. Third shift. The manifest is wrong." then B0;
CONTINUE = 1s black-to-game fade with location name bottom-left.

Difficulty ramp (spec §4, tune DATA not systems): first kill <6min, first 1000cr <10min, first
module <20min, first jump <30min (verify via window.__SF_TELEMETRY__). Pirates within 2 sectors of
start: max archetype 'pirate', level 1-2, solo/pair, no sniper/capital until first jump. Economy
floor: B2 ore >=180cr (adjust station equilibrium, NOT prices).

Definition of done — scripts/check-first-hour.mjs (spec §5):
  1. Beats fire in order; no beat text before predecessor DONE + 4s silence.
  2. Urgent instructional transients are not obscured; useful persistent context remains available.
  3. Tutorial lines pass check:player-facing-labels and are readable in their real action window.
  4. B3 pirate flees <=30% hull, drops >=1 pickup; player death during B3 respawns <=3s.
Regression floor:
  node scripts/check-first-hour.mjs
  npm run check:onboarding && npm run check:first-15-runtime && npm run check:new-game-first-run
  npm run check:player-facing-labels
  # update these checks' expectations deliberately in the same PR — this spec supersedes prior
  # first-15 content. Document each expectation change.
```

### 3. `07_AUDIO_IDENTITY` — Audio / systems agent
```
Implement the audio identity outcome in `design/spec2/07_AUDIO_IDENTITY.md`. Preserve the useful
procedural foundation, but choose procedural, recorded, generated, licensed, or hybrid sources from
the strongest coherent result and document provenance and runtime cost.

Work through the live audio system, recipes, buses, and `scripts/check-audio-identity.mjs`; touch
additional integration seams when the activated result requires them. Prefer existing gameplay
events and add a typed event only when no coherent source exists.
Do NOT touch: sim, src/render/*, input.

Tune buses, headroom, ducking, and voice arbitration from representative quiet, travel, station, and
dense-combat captures. Historical numeric targets are starting profiles, not ambition ceilings.

Route gameplay audio through owned recipes and buses (spec §3); layered cues are allowed when the
mix remains legible. Each covered event should have an intentional response, and important
continuous states such as tether strain should remain audible without forcing one synthesis recipe.

Give sectors recognizably different ambience through composition, instrumentation, texture, spatial
behavior, and transition design. Judge the family in a listening tour rather than a fixed oscillator,
voice-count, or chord recipe.

Definition of done — scripts/check-audio-identity.mjs (spec §6):
  1. Important gameplay and UI events have reachable, intentional audio behavior with no dead ids.
  2. Representative quiet/travel/station/combat scenes retain headroom and priority-cue clarity;
     record measured peaks and voice behavior.
  3. Tether hum gain tracks strain monotonically (0 -> 0.9 sweep).
  4. Pads: crossfade <=4.5s, zero clicks/pops (zero-crossing check).
  5. Mute/volume settings apply within 100ms; per-bus sliders in Settings->Audio work.
Regression floor:
  node scripts/check-audio-identity.mjs
  npm run check:presentation   # includes sg08 mix profile + render vfx golden trace
```

---

## Wave 2 (after 01 lands)

### 4. `02_FLIGHT_CAMERA_JUICE` — Frontend / graphics + feel agent
```
Implement the behavior and player-facing feel required by design/spec2/02_FLIGHT_CAMERA_JUICE.md.
Preserve deterministic acceptance contracts; tune visual values when play evidence shows a stronger
result and document the reason alongside the change.

You own: src/render/camera.js (constants only), src/render/vfx.js, src/render/feel.js,
src/systems/cruise.js (NEW — fold in the staged brief at .tmp/multi-loop/20260703/brief-codex-6-cruise.md),
src/data/combatDefs.js (weapon cue tables), and a NEW scripts/check-juice-contract.mjs.
This spec BINDS to tether phases from 01 — do not start until 01_MASSLINE_FEEL is merged.

Cruise tier (spec §1): V toggles; 3.0s charge (cancel on damage/fire/boost); x4 maxSpeed, x2.5
accel, x0.25 turn; drop instantly on damage/manual/mass-lock (entity radius>=60 within 180wu).
Events cruise:charging/engaged/dropped{reason}. Presentation: charge = engine glow 1->2.2x
emissive + rising two-tone hum + thin cyan progress arc (world-space 24px, NOT a HUD bar) + camera
zoom +8%; engaged = 120ms white-cyan streak flash (respect flashReduce) + fov +14%; mass-lock drop =
'SNARED' banner (danger tier) + 0.35 trauma + descending pitch bend + 400ms zoom back; manual drop =
no drama, 200ms ease.

Camera (spec §2, camera.js constants only): default zoom 95->88; speed zoom band 0.88x-1.18x over
0->cruise (ease 1.4/s); look-ahead cap 18->26wu at cruise only; kill-cam kiss push-zoom 0.96x 250ms
on player kill only. Keep: no yaw-follow (locked), trauma model, aim bias.

Juice stack (spec §3 table): implement each event's readable cue outcome through the shared
presentation path. Listed timings, counts, colors, and layer recipes are starting candidates to tune
from representative combat evidence unless a value is asserted by a current behavioral/accessibility
check. Candidate examples include: shield hit
hex-ripple 220ms + pitch-rising tink; shield break full-ring flash 320ms + 40ms hit-stop + 0.3
trauma; armor hit 6-10 sparks + clank; hull hit smoke+ember + 0.08 trauma if player target; kill
small interior flash->2-stage breakup->shockwave 260ms + 60ms hit-stop + kill-cam; kill capital 3
sequential flashes over 800ms + 0.5 trauma at <=400wu scaled 1/d^2; tether latch whipcrack+60ms cyan
flash; tether snap 0.25 trauma; charge detonate trauma 0.2 epicenter 1/d^2. Rules: all pooled (no
allocation), all respect motionReduce/flashReduce, hit-stop NEVER stacks (one active, newest wins),
no effect >800ms except capital kills.

Flee/telegraph (spec §4): attackRun 0.5s engine flare; alphaStrike 0.8s port glow amber->red +
rising whine — PLAYER MUST BE ABLE TO DODGE; flee engine stutter + jettisoned cargo; formationBroken
wingmen wobble ±0.2rad 1.5s.

Definition of done — scripts/check-juice-contract.mjs (spec §5):
  1. Every §3 event emits its cue exactly once per trigger in a scripted 30s combat (count via
     presentation:vfxCue / audio:cue traces).
  2. Hit-stop concurrency == 1; total time-scaled ticks < 4% of scenario.
  3. motionReduce=true: zero trauma > 0.125, zero hit-stop, zero flashes > 120ms.
  4. Cruise: charge 3.0 +- 0.05s; mass-lock drop within 2 ticks.
  5. Frame budget: zero frames > 32ms attributable to vfx.
Regression floor:
  node scripts/check-juice-contract.mjs
  npm run check:presentation && npm run check:camera
  npm run check:flight:clean
```

### 5. `05_ECONOMY_PROGRESSION` — Backend / systems agent
```
Implement the player-facing and tested behavior in `design/spec2/05_ECONOMY_PROGRESSION.md`. The economy sim is the crown jewel — this
spec SURFACES it and paces the climb; it does NOT rebuild pricing math.

You own: src/ui/screens/{market,starmap,localmap}.js, src/systems/{economy,missions,mining}.js
(HOOKS only), src/data/{ships,modules,mining,commodities}.js (tuning), design/CONTENT_BIBLE.md
(update tables in the same PR), and a NEW scripts/check-price-memory.mjs.

Price memory (spec §1, Elite's market data as loot): state.player.marketMemory[stationId]
[commodityId] = {buy,sell,seenAt} written on every dock + market open; serialized in saves; NO
omniscience (visited stations only). Nav chart overlay: commodity selector -> stations annotate
last-seen sell price + age tint (fresh<10min cyan, <60min white, older gray italic). Market screen
"best known" line ("Best known sell: 212 cr — VESTA FORGE (14 min ago, 2 jumps)") click=sets course.
Trade ledger: last 10 trades with per-unit margin, green/red by profit.

Mining completions (spec §2): Rich cores (C2) — 15% of asteroids (deterministic per asteroid id)
expose a core on fracture: 3.5s shrinking ring minigame (reuse existing drill surface), hold RMB
release inside ring -> 3-8x rare ore (tier+1), miss -> fizzle (no punishment beyond loss); ring
window 22%->12% radius by sector tier. Tether-haul (C3) — chunks >20u can't be beamed, tether them
(attachables) and haul to refinery: pays mass*basePrice*0.8 minus 6% fee; new 'bulk_haul' contract
type on belt-station boards (existing mission plumbing). THE POINT: mining teaches the tether; the
tether feeds mining.

Ladder (spec §3, tune PRICES not incomes): Kestrel start -> first module 20min -> Wasp ~90min ->
freighter ~4h -> corvette w/turret ~8h -> sector-boss capital ~20h. Six role-kit modules
(DATA-only): mod_ram_plate, mod_winch_hd, mod_charge_rack, mod_drill_amp, mod_survey_suite,
mod_smuggler_hold — exact effects in spec §3; prices ladder 6k->38k; fit existing power/CPU budgets.
Sinks stay honest (repairs, refinery fees, charge ammo, survey data, tolls). NO fuel mechanic
(locked decision).

Definition of done (spec §5):
  1. check-price-memory.mjs: dock two stations, reload save, memory survives; overlay renders only
     visited stations; best-known line matches recorded data exactly.
  2. Rich core: deterministic per seed; hit pays 3-8x; miss pays 0 + one fizzle cue.
  3. Bulk haul: tether a 25u chunk to refinery -> credits = formula +- 1cr; contract completes via
     existing mission events.
  4. Six modules purchasable, fit budgets, each changes a derived stat measurably (deltas != 0).
Regression floor:
  node scripts/check-price-memory.mjs
  npm run check:balance            # green after price tuning
  npm run check:mining:2           # extended for rich-core, stays green
  npm run check:market-nav && npm run check:market-first-loop
```

---

## Wave 3 (after 02 lands)

### 6. `04_WORLD_ALIVE` — Backend / sim + AI agent
```
Implement the player-facing and tested behavior in `design/spec2/04_WORLD_ALIVE.md`. Pillar 4 is this spec's intent: the universe was here
before you. Charted space is charted; traffic flies its own routes.

You own: src/systems/{traffic,aiEncounter,missions,world}.js, src/data/{sectors,missions}.js, a NEW
src/systems/encounterDirector.js, and a NEW scripts/check-encounter-director.mjs.
Binds to cruise (spec2/02) — do not start until 02 lands.

Encounter director (spec §1): a registry rolling a WEIGHTED encounter budget per sector visit,
DETERMINISTIC via hash32(seed, sectorId, dayIndex). Max 1 major + 2 minor per 10min; NEVER during
dock/tutorial beats/within 30s of last encounter (cooldown owned here). Every encounter announces
through ONE one-voice line + a world telegraph, NEVER a modal.

Encounter shapes v1 (spec §2, Freelancer grammar + our physics verbs):
  - Interdiction (minor->major by rep): only while cruising through pirate-influence sectors.
    Mass-snare VFX ahead (violet rings collapsing, 1.2s warning — skilled player can V-drop+veer),
    cruise drops ('SNARED'), 2-4 pirates wedge. Toll offer within 3s: pay min(12% cargo value, 400cr)
    or fight. Paying feeds faction/econ sim (existing rep hooks).
  - Patrol scan (minor, lawful): "Cut thrust for scan." 15s beam. Clean -> tiny rep gain;
    contraband -> dump-or-run chase (existing systems; max 3 pursuers; tether-slingshot through
    rocks is the intended counterplay — no new mechanics).
  - Distress call (minor): wreck+survivor pod OR ambush bait (70/30 deterministic roll). Rescue =
    tow pod via tether to any station (C3 plumbing).
  - Named bounty (major): NAMED ship per faction, one gimmick loadout — tether-cutter (cuts your
    line every 8s), PD screen (missiles die, use guns/charges), or ram-plate (wants collision).
    Gimmick STATED on the board ("Countermeasures: massline cutter."). Kill -> unique salvage +
    faction ripple.
  - Convoy (ambient, not an encounter): 2 freighters + 1 escort on lanes; attackable; escorts call
    patrol within 20s.

Sector set dressing (spec §3): make palette classes PLACES (data + light spawning only).
  core: lane beacons every 400wu (emissive cyan), 1-2 station billboards, patrol wings ~3min.
  belt: dust-fog patches, slow conveyor barges, mining drones pecking rocks (visual loop), klaxon
    ping when blasting near a claimed rock.
  fringe: dead hulks (salvageable), flickering nav buoys (30% emissive duty), pirate graffiti decal.
  anomaly: violet particle updrafts, one 'whisper' comms line per 5min from CHN UNKNOWN (ambient
    tier), sensor ghosts (radar blips vanishing on approach — render hollow on overview).

Numbers (spec §4): ambient density core 6-9 / belt 3-5 / fringe 1-3 / anomaly 0-1 concurrent NPCs in
sensor range. Budget weights per class in spec §4. All rolls via state.rng — determinism holds.

Definition of done — scripts/check-encounter-director.mjs (spec §5):
  1. 30-min soak per palette class: counts within budget; zero encounters during dock/tutorial;
     min-gap >= 30s always.
  2. Interdiction fires only during cruise in pirate-influence sectors; warning precedes snare by
     >= 1.0s; V-drop + 90deg veer within warning avoids it.
  3. Toll payment moves credits + rep + clears hostility (assert all three).
  4. Determinism: same seed -> identical encounter log across 2 runs + reload.
  5. Encounter announcements register priority and dedupe behavior with the attention arbiter; scripted
     stress runs show no competing primary transient or blocking modal while persistent/accessibility
     context remains available.
Regression floor:
  node scripts/check-encounter-director.mjs
  npm run check:sg06:ai && npm run check:balance
  npm run check:sim:compare   # hashEqual:true
```

### 7. `06_UI_IDENTITY` — Frontend agent
```
Implement the behavioral intent of design/spec2/06_UI_IDENTITY.md. Do not treat its old numbers, palette, panel, glow, radius, or surface recipes as mandatory. No visor motifs remains a product preference; visual direction must be chosen and shown in screenshots.

You own: src/ui/{hud,radar,targetPanel}.js, src/ui/uiRoot.js (injectHudCss), styles/ui.css,
src/ui/screens/{localmap,starmap}.js (POLISH only), and a NEW scripts/check-ui-identity.mjs.
Verify check:ui-a11y, check:wcag-contrast, check:ui:perf after EVERY step.
Binds to encounter ghosts + named-bounty tags from 04 — do not start until 04 lands.

HUD hierarchy (spec §1): the proven reference is (a) bottom-left ship cluster, (b) bottom-center
status line+chips, (c) bottom-right radar+overview, with a top-center one-voice channel. Preserve
priority and eliminate unexplained clutter; a different composition is valid when supported by
current screenshots, viewport checks, and accessibility evidence.

Overview strip (spec §2, EVE's one great idea miniaturized) — right edge above radar: collapsible
(default open, O toggles, persists in settings.ui.overviewOpen). Row = [IFF chip][class glyph] NAME
dist closing/opening. mono 11px, row height 20px, max 8 rows + "+N" footer, width 188px. No panel
border — 1px left rule in IFF color per row. Sort hostiles(nearest)->neutrals->friendlies. Sensor
ghosts render hollow. Click=target, hover=1.5x rule width. IFF from SEMANTIC_PALETTE (colorblind-
safe). Updates 5Hz (not per-frame); memoize strings.

Target panel v2 (spec §3): name/class, three segmented bars (shield cyan / armor slate #8fa3bd /
hull red-amber) 72x5px 4px gaps, distance+closing, gimmick tag for named bounties ("MASSLINE
CUTTER"). In-world mirror: three thin arcs (shield outer -> hull inner, radius target.radius
+6/+9/+12, arc = fraction x 300deg, 0.55 opacity) — the arcs ARE the bars; a player never needs the
card to fight.

Radar honesty (spec §4): station/gate/wreck glyphs replace dots (square/ring/cross, 5px, from
SEMANTIC_PALETTE shape set); objective diamond gets 1px white outline; scan pings = pulsing hollow
'?' for TTL; bezel edge-arrows for off-screen objective + nearest hostile (max 2).

Maps (spec §5): local map legend footer, 150ms mouse-wheel zoom ease, hostile motion vector ticks
(velocity/3, max 24px). Nav chart sector cards = palette-class swatch stripe + security pips, price-
memory overlay (spec2/05), route line 3px marching dash.

Dialog chrome (spec §6 reference implementation): preserve coherent hierarchy, legible focus,
destructive-action clarity, measured transitions, and one arbiter instead of a separate toast stack.
The historical border, radius, color, and timing values are starting points; prove the current result
with screenshots plus accessibility and UI-performance checks.

Definition of done — scripts/check-ui-identity.mjs (spec §7):
  1. DOM audit in flight: no overlapping, orphaned, or unprioritized fixed-position surfaces at
     supported viewport sizes.
  2. Overview: 9+ contacts -> 8 rows + "+N"; clicks target; cadence <= 5Hz; IFF matches palette.
  3. Target arcs: fractions match entity hp +-1%; arcs vanish 250ms after target death.
  4. check:wcag-contrast green incl new elements; check:ui:perf green; check:ui-a11y green.
  5. Five-second test screenshots into .devshots/spec2/ui-* (flight-idle, combat, mining,
     overview-full) — a reviewer must name every element from the shots alone.
Regression floor:
  node scripts/check-ui-identity.mjs
  npm run check:ui-a11y && node scripts/check-wcag-contrast.mjs && npm run check:ui:perf
```

---

## Wave 4 (after all + 47a golden re-record)

### 8. `08_RELEASE_READINESS` — PC/browser QA / release agent
```
Implement the tested release outcomes in `design/spec2/08_RELEASE_READINESS.md`. This is an exit review — no features, only
BARS. A build that passes this file is demo-able as a PC/browser game. Run AFTER every other spec and
AFTER the 47a golden re-record batch (documented in BUILD_PLAN — do that re-record first, it
unblocks the whole suite).

Scope correction: SpaceFace is a PC/browser game. Do not add handheld-specific gates or gamepad-only
release blockers. Browser play is primary; packaged desktop is an optional shell that must boot the
same route when distributed.

Gating prerequisite: re-record the 47a goldens deliberately (the pending re-record batch), so
check:sim:compare can move from hashEqual:true to the real expected hashes. Document the batch.

Performance (spec §1, REAL HARDWARE not headless — headless numbers are driver-polluted, known):
60fps sustained, ZERO frames > 32ms during: 6-ship brawl, 3-asteroid fracture, station approach with
8 ambient NPCs, cruise through dust. Measure via check:hitch-budget on the primary PC browser route;
if a desktop shell is distributed, repeat in Electron after build:bundle. Boot-to-menu <5s,
menu-to-flight <3s. Heap growth <30MB over 30min soak;
entity/mesh counts return to baseline after sector round-trip. If bars fail: renderScale auto-tune
(0.85->0.7 under sustained >24ms, restore on calm, notify once via one-voice "Render scale
adjusted.") — implement only if needed.

Input (spec §2): KBM is primary. Every player verb has a documented KBM binding, visible prompts use
the live binding registry, and full KBM rebind persists + round-trips (check:settings-profile).
Controller support is optional PC support where it already exists; keep prompts accurate if touched,
but do not make gamepad-only play a release blocker. Browser viewport sanity: 1280x800 and common
desktop sizes have no clipping or required modal traps.

Content floor (spec §3): 8 factions, current authored 10-sector graph w/ palette identity, 13 hulls
+ 6 role-kit modules (spec2/05), 10 mission types + bulk-haul + named bounties, 8-beat story w/ B4
branch, 3 endings (verify reachable), 28-node tech tree, automation/claims loops functional
post-tutorial. Expanding beyond 10 sectors is future content production, not a PC/browser release
hygiene prerequisite unless GDD/BUILD_PLAN is explicitly revised.

Trust sweep (spec §4, the things reviewers dock $10 for): save anywhere except combat; autosave
checksum verified; Continue never dead-ends; pause instant+silent; alt-tab safe; window resize
reflows HUD anchors; ZERO console errors/warnings across a full loop (boot->tutorial->trade->fight->
jump->dock->save->load->quit); renderer.info.programs all valid (fragment 'precision highp float');
EVERY check in npm run check:ci green incl re-recorded 47a goldens; a11y palettes/motion/flash
honored everywhere; UI scale 0.85-1.25 without clipping.

Release capture ammunition (spec §5, produced by the BUILD not Photoshop): scripts/capture-capsule-
shots.mjs screenshots the 6 money moments (tether slingshot mid-arc, seam-lit asteroid, station
approach core palette, wedge formation telegraphing, cruise streaks, capital kill bloom) at
2560x1440. 60s gameplay capture script (devshots pipeline) hitting launch->scan->mine->interdiction->
slingshot escape->dock, UI NOT hidden. Demo slice: first-15 + one belt sector + one bounty,
save-disabled via ?demo build gate.

Definition of done (spec §6):
  1. scripts/check-release-soak.mjs completes the §4 loop with zero errors, all autosaves loadable.
  2. PC browser hitch run recorded into .devshots/spec2/perf-browser.json, all §1 bars met; add
     .devshots/spec2/perf-electron.json only when shipping the optional desktop shell.
  3. KBM first-15 runtime proof passes in browser; controller prompt coverage remains optional unless
     controller support is intentionally touched.
  4. Capsule shots + capture script outputs exist, pass five-second test.
  5. npm run check:ci fully green on the release-candidate commit.
Regression floor: npm run check:ci  (the whole suite — this spec IS the final gate)
```

---

## 9. Review gate (run by YOU on every agent's output)

```
1. git status — ONLY the spec's named files changed. Anything in assets/** or src/render/** that
   shouldn't be there = stop (active graphics lane).
2. Run the spec's acceptance script + the regression floor yourself. Don't trust the agent's transcript.
3. For anything visual: require representative `.devshots` captures and review hierarchy,
   readability, composition, identity, and behavior on the normal player route.
4. Reject functional regressions and weak player-facing quality. Historical taste tokens, fixed
   technique recipes, and ritual compliance are not independent rejection grounds.
5. If the agent changed a spec NUMBER, confirm the one-line justification is in the diff.
```

---

## 10. Asset production — Blender compatibility dispatch (longform only when explicitly activated)

When explicitly dispatched, this is a compatibility entry point for a bounded, current graphics packet.
It does not grant ownership of `assets/**`, authorize its historical phase list as a repository-wide
campaign, or replace `CANONICAL_BUILD_MAP.md`, the active packet, or current locks. Claim only the
exact source/candidate/evidence paths selected by the current dispatch; coordinate through the live
lock dirs (`assets/ships/release.__lock/`, `release.__building/`) and current owner signals.

```
You are the asset production agent for one bounded SpaceFace graphics packet. You may use Blender MCP
when it is available, while reproducible CLI source/export paths remain valid production tooling. Do
not turn this historical prompt into a broad asset-library rewrite: the current dispatch selects one
coherent asset/family outcome and exact write paths.

READ FIRST (in order):
  - CANONICAL_BUILD_MAP.md, AGENTS.md, and design/program/NOW.md — current dispatch, safety, and
    ownership are law.
  - assets/AGENTS.md, assets/ships/AGENTS.md, docs/visual-assets/README.md, and
    docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md — the latter owns G0-G7 craft and
    acceptance; a valid GLB is not accepted art.
  - For every Blender/GLB form or surfacing change, load
    .grok/skills/spaceface-blender-material-truth/SKILL.md before modeling. Give every changed
    camera-visible zone a concrete fiction/material disposition; substantive Tier A/B work requires
    the full preflight and component bill. Do not wait for a reviewer to identify plastic/clay,
    primitive-stacked, glowing-disk/torus, or fiction/material-incoherent output.
  - src/render/AGENTS.md for current asset/render contracts and ownership.
    The standing no first-person/visor/cockpit HUD decision remains current root policy.
  - assets/ships/parts/parts_manifest.json — the current runtime interoperability contract; update it
    coherently when a higher-quality asset needs a justified profile change.
  - ARCHITECTURE.md  — renderer features and the one-game-path rule.

MATERIAL-TRUTH ADDENDUM (mandatory for Blender/GLB form or surfacing authoring):
  - Write a canon-cited fiction/development agreement and component material bill before G1. Start
    from manufactured sections and interfaces, not Blender primitives or generic greebles.
  - If a component-only generated construction/material study is the selected way out of DCC
    vocabulary, use image generation directly when available. Otherwise use the bounded Codex CLI
    handoff in docs/visual-assets/AGENT_PROMPTS.md § E; do not substitute a whole-asset redesign,
    text-only ideation, or fabricated reference.
  - Keep the complete surfaced asset visible in connected Blender Material Preview or Rendered shading
    as the primary working view. Clay/channel views are diagnostics only. Headless Blender may build,
    export, or diagnose, but it cannot close G4 surface truth.
  - Render eligible evidence from the exact finalized source GLB, bind it to source and renderer
    hashes, and retain Browser/Electron/G7 gates as open when their real evidence is unavailable.

THE EXPORT CONTRACT (from the live manifest and loader):
  - Coordinate system: right-handed, forward +X, up +Y, starboard +Z, UNIT = metre, origin = mount
    point. Get this wrong and parts assemble sideways; the manifest checker rejects it.
  - Current material names and tint metadata must match the live loader/manifest where referenced.
    Richer material strategies are allowed when the loader, manifest, and checks are updated coherently.
  - The current baseColor/normal/ORM channels and 1024 resolution are compatibility defaults, not a
    texture-technique or resolution ceiling. Profile memory, upload cost, readability, and runtime use.
  - Budgets: use the live manifest/exporter profiles, currently 500-15,000 triangles per part and
    max 5,000,000 bytes per part, with higher kind-specific profiles for whole-ships and landmarks.
    Ship screen-space-validated LOD coverage (currently three hull levels). These are profiling alarms
    and compatibility defaults, not taste ceilings; revise them with manifest rationale and perf proof.
  - Sockets/hooks naming: SOCKET_Trail_Main, SOCKET_Weapon_Front, MOUNT_COCKPIT, MOUNT_ENGINE_L/R,
    MOUNT_FIN_L/R — match the existing hull entries exactly so assembly + tether/weapon anchors fit.
  - Merge static bolts/ribs/panels/repeated detail into a SMALL number of submeshes per material/
    animated role (AGENTS.md Performance Policy — do NOT ship dozens of one-off primitives that
    become tiny runtime pools or per-ship draw calls).

THE BUILD PIPELINE (how your work ships — you run this, code agents must not):
  1. Author/edit source .glb under assets/ships/parts/<category>/ (or assets/ships/<ship>/).
  2. Update assets/ships/parts/parts_manifest.json: every part needs id, category, priority, file,
     tris, bytes, textureSize, tintable, hooks, sockets, mount, bounds{min,max,dimensionsM}, note.
  3. Stage + validate + ship:  npm run build:sg04:release-assets
     (stages to release.__building/, validates compression/manifest, acquires release.__lock/,
     moves to assets/ships/release/). Use --resume-valid to continue a partial valid build.
  4. Verify:  npm run check:art
     (runs check-kestrel-asset, check-parts-manifest, check-sg04-release-assets, check-kestrel-hero,
     silhouette, damage, leak, lod, collision-debug, faction-ships, 47a:visuals).
  5. Never hand-edit files under assets/ships/release/ — the build owns them. Never delete
     release.__lock/ or release.__building/ mid-build.

HISTORICAL COVERAGE INVENTORY (reference only — audit live manifests/runtime maps; do not execute it
wholesale):
  Hulls (7 GLBs, 13 hull DATA entries in src/data/ships.js): hull_starter, hull_fighter,
    hull_corvette, hull_freighter, hull_gunship, hull_interceptor, hull_miner. Roles: starter,
    fighter (Wasp-class agile), freighter, corvette w/turret, gunship, interceptor, miner.
    Ships.js roles to cover: starter, scout, hauler, combat, capital-boss ladder.
  Cockpits: dome, recessed, slab.  Engines: industrial, ion_small, ion_twin, resonator.
  Fins: crystalline, radiator_grid, swept_smuggler, wedge.  Gear: skid_quad, skid_trio.
  Greebles: antennas, hatches, pipes, rcs, vents.  Pods: cargo_container, repair_patch, utility.
  Weapons: heavy_cannon, lance, pulse_cannon, turret_dual.  Wholeships: kestrel, pelican, wasp.

RETAINED COVERAGE IDEAS (not a current execution sequence; select only the active packet's bounded
outcome, then commit/verify it before another slice):

  PHASE 0 — AUDIT. Open every existing release .glb. For each: report tri count, byte size,
    material names, socket/hook names, bounds, LOD presence. Flag broken interoperability plus any
    geometry, byte-size, draw-call, or LOD profile that lacks current performance evidence. Output a
    table. Fix violations before adding anything new. Run npm run check:art and make it green.

  PHASE 1 — FILL GAPS. Every hull that has DATA in ships.js but no matching GLB silhouette gets one.
    Ensure each role on the spec2/05 ladder (starter->scout/Wasp->freighter->corvette->capital-boss)
    has a distinct, readable silhouette at the default camera zoom (88, spec2/02). Add any
    engine/cockpit/fin/weapon variants the assembly system references but lacks.

  PHASE 2 — VARIETY + LODs. Add 2-3 alternates per high-traffic category (engines, fins, weapons,
    greebles) so ships don't all look identical — but each must pass the readability test (a stranger
    can tell a freighter from a fighter at a glance). Validate LOD coverage at gameplay screen sizes;
    use as many levels as the asset and measured transition quality need.

  PHASE 3 — FACTION SKINS. Material_Hull is tintable; produce faction-readable materials informed by
    world history, current sector evidence, and the 8 factions. Existing sector palette blocks are
    references, not closed hue lists. Choose material, texture, decal, or geometry changes by the
    strongest readable result and measured draw-call/memory impact.

  PHASE 4 — WORLD SET DRESSING (spec2/04 calls for these as PLACES): lane beacons (emissive cyan,
    every 400wu), station billboards (unlit backs), conveyor barges + mining drones (visual-loop
    skins), dead hulks (salvageable wreck entities), nav buoys (flicker-capable), asteroids with
    visible seams (the scan target — spec2/03 B2), debris/chunk fragments (>20u for tether-haul,
    spec2/05 C3). Each needs its own manifest entry + budget.

  PHASE 5 — STORE-PAGE HEROES. The 6 money moments (spec2/08 §5): tether slingshot mid-arc, seam-lit
    asteroid, station approach, wedge formation, cruise streaks, capital kill bloom. Make sure the
    assets behind those shots read at 2560x1440 — these are what sell the game.

RULES THAT WILL GET YOUR WORK REJECTED IF BROKEN:
  - Any visor/helmet/cockpit-frame motif on a ship (00 §3 — standing user decision).
  - A translucent shell or bloom treatment that harms readability, hierarchy, stability, or measured
    performance and is not supported by current player-facing evidence.
  - A new hue introduced without a player-facing reason and screenshot evidence.
  - Dozens of un-merged one-off primitives (Performance Policy).
  - Shipping under assets/ships/release/ by hand instead of via build:sg04:release-assets.
  - Overwriting paths owned by a verified active graphics/asset process without coordination. Check
    markers, owner metadata, live processes, recent writes, and agent activity together; stale marker
    files do not reserve the lane.

WORKING RHYTHM: choose coherent batches that can be authored, wired, built, checked, and reviewed.
Keep representative `.devshots/` evidence for visible changes and update the current status surface
with proven outcomes and remaining work. Coordinate verified overlapping asset/render writers; do not
infer conflict merely because another code agent exists.
```
