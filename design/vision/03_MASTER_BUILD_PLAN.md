# 03 — Master Build Plan (point agents here)

**Status:** LIVE execution authority for product sprints (2026-07-09).  
**Ambitious scope:** yes — full premium Freelancer-class browser/PC sandbox.  
**Sequence:** playable fun → dense world → glass UI → wonder assets → living ripples → empire.

Use [`05_GOAL_PROMPTS.md`](./05_GOAL_PROMPTS.md) to dispatch.  
Update [`01_CURRENT_STATE.md`](./01_CURRENT_STATE.md) when a wave’s PLAY column changes.

---

## North-star milestones

| Milestone | Player can… | Approx. ambition |
|---|---|---|
| **M0 Playable Core** | Survive, fight fairly, massline tag on flyby, autopilot to station | 1–2 focused sprints |
| **M1 Freelancer Pocket** | One rich multi-system neighborhood, dense places, smooth gates | + world/content/assets |
| **M2 Glass Strategy Front** | Beautiful dense UI; dock/trade/fit without prose walls | Frontend reboot |
| **M3 Wonder Slice** | Store-page captures; hero ships/stations/landmarks | Heavy Blender + polish |
| **M4 Living Cosmos** | Events/economy/faction ripples you can see | Director + UX |
| **M5 Empire Layer** | Claims, automation, light building (Mindustry-adjacent) | After M0–M3 |
| **M6 Ship Demo** | Release soak, trailer captures, CI green, $30-bar claim | Release |

---

## Wave map (highest value first)

### WAVE 0 — Unify truth & kill harmful constraints
**Goal:** Agents stop implementing the wrong constitution.  
**Deliverables:** this vision pack (done when README points from `design/AGENTS.md`).  
**Playtest:** n/a  

---

### WAVE 1 — PLAYABLE COMBAT, FLIGHT & MASSLINE (highest priority)
**Milestone:** M0  
**Why first:** Game is “basically unplayable”; graphics won’t save that.  
**Process:** `06_OPERATING_MODEL.md` — screenshot/feel iterate, weighted scores, expand tests, fun judgment.

| ID | Workstream | Outcomes | Key files (likely) | Acceptance (PLAY + checks) |
|---|---|---|---|---|
| W1-A | **Ship body + piloting** | Easy to pilot; bank reads as flight lean; no pin-spin; nose vector clear; assist-first defaults | `flightV3.js`, propulsion, `renderer.js` hull bank | Feel matrix ≥80; controllability ≥7; shots of turn |
| W1-B | **Massline lever + latch** | Spool near nose; wide soft latch; Ctrl-nearest discoverable or default soft | `combatDefs.js` sockets, `tetherGameplay.js` | Flyby latch ≥80%; spool forward of COM; new latch tests |
| W1-C | **Flyby Focus** | High-speed near hostile → slow + frame zoom + magnet latch radius | feel/camera + input | GIF-quality moment; video or shot series |
| W1-D | **Combat fairness** | Starter TTK fair; undock grace; damage/accuracy nerf early threats | enemies data, weapons, combat, spawn | Deaths/10 min ≤ 2 |
| W1-E | **Enemy intention (play-proof)** | Approach/orbit/break readable; no zip murder | `ai/maneuver.js`, spawn levels, weapons | Fun judge: “they’re piloting” |
| W1-F | **Mode UX** | Gunnery vs Combat Computer vs Focus obvious; pursuit/autopilot labeled | HUD, control prompts, input toasts | Cold player finds goto + auto guns in 2 min |
| W1-G | **Starter sore thumbs + identity kickoff** | Fix floating white/emissive junk on starter hull; plan display rename off “Kestrel” | `kestrelHero.js`, ship display names | No sore thumb on hero shot; rename design noted or shipped |

**Out of scope for W1:** multiplayer, full empire, full glass reboot (mode labels OK).

**Detail specs to mine (not obey blindly):**  
`spec2/01_MASSLINE_FEEL`, `spec2/02_FLIGHT_CAMERA_JUICE`, `spec3/SPEC3-F3`, `SPEC3-F4`, `docs/handoffs/SG-06_INTENTIONAL_FLIGHT.md`, revamp BP-02/BP-07.

---

### WAVE 2 — FREELANCER DENSITY & TRAVEL
**Milestone:** M1  
**Why:** Empty void is the second rage-quit.

| ID | Workstream | Outcomes |
|---|---|---|
| W2-A | **Starter region redesign** | Helios (or new) has 3–5 findable hubs, belt you can see, traffic, gentle threats outside bubble |
| W2-B | **Content placement** | Fields/stations/POIs within play radius; radar/map always answers “what’s near?” |
| W2-C | **Gate travel feel** | No loading screen; streak transition; amortize spawn; prefetch neighbor assets |
| W2-D | **Encounter presence** | Director budgets *felt*: patrol, distress, interdiction, convoy — not empty cruise |
| W2-E | **Nav UX** | Map pick → autopilot; clear gate markers |

**Detail specs:** `spec2/04_WORLD_ALIVE`, `world-identity/*`, `WORLD_OVERHAUL_2_1`, revamp BP-01/BP-03/BP-11.

**Data today:** 10 sectors / ~15 stations — expand **density and findability**, not necessarily sector count first.

---

### WAVE 3 — LIQUID GLASS STRATEGY UI
**Milestone:** M2  

| ID | Workstream | Outcomes |
|---|---|---|
| W3-A | **Design tokens** | Glass materials, type scale, spacing, semantic colors, motion |
| W3-B | **Component library** | Modular panels/tables/chips (shared station + flight) |
| W3-C | **Station text purge** | Delete purpose essays; data-first market/missions/outfit |
| W3-D | **Flight chrome** | Modes, focus meter, massline state, target data — dense not noisy |
| W3-E | **One map surface** | Primary galaxy/local continuum; kill dual-map confusion |

**Anti-goal:** “Dense” ≠ more paragraphs.  
**Detail:** `FRONTEND_REBOOT_AUDIT.md` (inventory), **ignore** three-anchor as law if constitution glass/density needs more surface — hierarchy still required.

---

### WAVE 4 — GRAPHICS WONDER & ASSET FLOOD
**Milestone:** M3  
**Parallelizable** with late W2/W3 if Blender lock respected.

| ID | Workstream | Outcomes |
|---|---|---|
| W4-A | **Wholeship repair or hero paths** | Unblock or replace blocked wholeships; consistent player/NPC silhouettes; **original names** |
| W4-B | **Station & landmark kit** | Distinct trade/military/mining/blackmarket + 5+ landmarks from `assets/QUEUE.md` |
| W4-C | **World prop flood** | 2–3× placeable variety (wrecks, platforms, cargo yards, beacons) |
| W4-D | **Lighting / VFX / thrusters** | Night emissives, latch/focus VFX, kill readability |
| W4-E | **Pipeline hygiene** | Populate `ASSET_STATUS.json`; every LIVE asset has lifecycle row |
| W4-F | **Image/video gen pipeline** | Concept → texture/portrait plates → wire; **cinematic headshots** replace cartoony portraits |
| W4-G | **Mockups** | UI glass mockups via image gen before large DOM rewrites; motion refs via video gen |

**Process:** `06_OPERATING_MODEL.md` + `design/graphics-sprints/00_ORCHESTRATION.md` + Blender exclusive lock.  
**Quality:** **10–20** screenshot iterations per hero asset; weighted scores; subagent review.

---

### WAVE 5 — LIVING COSMOS (emergence)
**Milestone:** M4  

| ID | Workstream | Outcomes |
|---|---|---|
| W5-A | Director completeness | Interdiction, patrol scan, distress, named bounty — felt in open play |
| W5-B | Economy ripples | Player overtrade → shortage/convoy/pirate pressure with **visible** cause ledger |
| W5-C | Faction posture | Rep gates prices/dock/mission boards clearly |
| W5-D | Aftermath | Wrecks, salvage, battle scars linger briefly |

**External research #2 lives here** — after density so events have a stage.

---

### WAVE 6 — EMPIRE / BUILDING (Mindustry-adjacent)
**Milestone:** M5  

| ID | Workstream | Outcomes |
|---|---|---|
| W6-A | Claims as places | Visible outposts, not abstract UI only |
| W6-B | Automation with risk | Drones/traders you can see and lose |
| W6-C | Light build kit | Modular claim props (queue already lists them) |
| W6-D | Soft empire loop | Income + upkeep + defense pressure |

**Do not start** until M0 PLAY-DONE and M1 density acceptable.

---

### WAVE 7 — SHIP / DEMO / RELEASE
**Milestone:** M6  

| ID | Workstream |
|---|---|
| W7-A | Release soak green; zero console loop |
| W7-B | Capsule shots + 60s gameplay capture (massline flyby, dense station approach, trade) |
| W7-C | Strict perf budget comfortable |
| W7-D | Store page narrative + first-hour funnel |

---

## Parallelism (what can run together)

| Track | Can parallel with | Never parallel with |
|---|---|---|
| W1 combat/massline (code) | W4 asset authoring (Blender lock) | Second writer on `flightV3` / `tetherGameplay` |
| W2 world data | W4 assets | Blind density without W1 fairness (player still dies) |
| W3 UI | W4 assets | Rewriting HUD while W1 mode UX unstable — sequence W3 after W1-F or tightly integrate |
| W5 living | After W2 stage exists | — |
| W6 empire | After M0–M3 | — |

---

## Goal-prompt contract (every agent)

```
Read design/vision/00_CONSTITUTION.md and design/vision/03_MASTER_BUILD_PLAN.md wave <ID>.
Implement only that wave row. Playtest rubric is mandatory acceptance.
Do not apply superseded MASTER_TASTE rules that conflict with the constitution
(anti-glass, minimal-HUD-for-its-own-sake, difficulty-for-difficulty).
ARCHITECTURE.md technical constraints still hold.
Update design/vision/01_CURRENT_STATE.md on completion.
git add -N new files. No golden edits without named re-record reason.
```

Full templates: `05_GOAL_PROMPTS.md`.

---

## Success metrics (product, not vanity)

| Metric | M0 target | M3 target |
|---|---|---|
| Starter deaths / 10 min | ≤ 2 | ≤ 1 |
| Massline intentional latch / combat encounter | ≥ 1 | ≥ 2 |
| Minutes to first dock + sell | ≤ 8 | ≤ 5 |
| Named landmarks visible from spawn radar/map | ≥ 3 | ≥ 5 |
| Station market 5-second scannability | pass | pass |
| Store GIF moments available | 1 (flyby) | 6+ |

---

## Explicit backlog (do not confuse with next)

- Full multiplayer  
- Planetary landing / interiors  
- 1000 systems procgen  
- Permadeath default  
- Visor HUD  

These may be revisited post-M6 only.
