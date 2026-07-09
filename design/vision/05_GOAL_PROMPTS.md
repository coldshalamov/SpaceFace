# 05 — Goal Prompts (copy-paste for autonomous agents)

**Authority:** `00_CONSTITUTION.md` + the wave section in `03_MASTER_BUILD_PLAN.md`.  
**Always:** stay on `master`; `git add -N` new files; no golden hacks; no `git reset --hard`.

---

## Prefer the full overnight run

For “do everything / go to bed,” **do not use per-wave prompts.**  
Use: **`design/vision/OVERNIGHT_GOAL.md`** (full pipeline A→D with QA, review, docs, harvest).

Per-wave prompts below are for scoped daytime sessions only.

---

## Universal preamble (paste at top of every goal)

```
You are building SpaceFace. Read these fully before coding:
1) design/vision/00_CONSTITUTION.md
2) design/vision/06_OPERATING_MODEL.md  (quality ritual, tools, must-haves, anti-derivative)
3) design/vision/03_MASTER_BUILD_PLAN.md — only the wave I name
4) design/vision/01_CURRENT_STATE.md — relevant domain rows
5) ARCHITECTURE.md sections that touch your files (sim vs render, ownership)

Product law: playable fun first; open chart travel; massline toy; easy piloting; liquid-glass strategy UI (data not prose); original identity (not Freelancer cosplay); no sore thumbs; assist-first difficulty.
Where design/spec2/00_MASTER_TASTE.md conflicts (anti-glass, minimalism-for-its-own-sake), the vision constitution wins.
Technical law: 60Hz fixed sim, determinism via state.rng, sim never imports Three.js, no silent runtime deps.

OPEN-ENDED DUTY: research peers and implement common-sense must-haves (06 §5) inside this wave without waiting for the human to list them. Plan and implement. Spawn subagents for research, review, art, and checks. Use image gen, video gen, Blender MCP, and screenshot iteration (10–20 passes for visual/feel) with weighted scoring; fix dimensions ≤4 before claiming done. Expand automated tests when bug classes recur. Fun/lame judgment is mandatory.

Acceptance: automated checks + PLAYTEST RUBRIC + quality score sheet + no sore thumbs on touched surfaces. Transcripts are not proof.
Update design/vision/01_CURRENT_STATE.md when done (PLAY column honest).
Print a 15-line summary: files, checks, score totals, playtest evidence paths, remaining risks.
```

---

## W1 — Playable combat & massline (start here)

```
[UNIVERSAL PREAMBLE]

GOAL: Wave 1 from design/vision/03_MASTER_BUILD_PLAN.md (W1-A..G; prefer full wave, else W1-A+B+C+D first).

MUST DELIVER:
- Flight that is easy/pleasant to pilot (not weird pin-spin); bank reads as banking
- Wider massline latch (soft snap / generous cone); nose spool lever stronger than localPos 0.38
- Flyby Focus: high-speed near hostiles → time slow + camera frame player+targets + expanded latch magnet
- Starter combat fairness (undock grace, TTK, less zip-murder)
- Enemy motion feels intentional in browser play (not check-only)
- Discoverable autopilot/pursuit + combat computer vs gunnery mode
- Fix starter ship sore thumbs (floating white/emissive hood junk); kick off rename off Freelancer "Kestrel" display name
- Deduce any other peer-game must-haves that block "playable pilot fantasy" and implement if small

PLAYTEST RUBRIC (required evidence):
- Feel matrix (06 §4.2) ≥80; controllability & fairness ≥7
- 10 min starter play: ≤2 deaths OR written blockers with video/shots
- 5/5 scripted flyby latch attempts succeed with Focus or soft latch
- Cold-start: set course to station without reading docs (prompt or UI label)
- .devshots/vision/w1-*  (iterate 10–20 on ship/bank/latch if visual); no sore thumb on hero frame

CHECKS: run + extend massline/flight/ai/combat tests; fix regressions you cause.
Do NOT start empire building, multiplayer, or full UI glass redesign (mode labels OK).
```

---

## W2 — Freelancer density & travel

```
[UNIVERSAL PREAMBLE]

GOAL: Wave 2 — dense starter neighborhood + seamless-feeling gates.

MUST DELIVER:
- Starter system feels full: ≥3 named landmarks findable; traffic; belt/stations not one tiny pile in a void
- Radar/map answers "what's near me?"
- Gate jump: no loading screen UI; amortize spawns; continuous player feel
- Encounter director presence felt in open cruise (at least 2 encounter types)

PLAYTEST RUBRIC:
- From spawn, list 3 destinations found within 2 minutes
- Jump to neighbor sector without black load screen
- 15 min cruise not empty for >60s stretches without a readable interest

Update 01_CURRENT_STATE world rows + 04_ASSET_TRUTH if new placeables wired.
```

---

## W3 — Liquid glass strategy UI

```
[UNIVERSAL PREAMBLE]

GOAL: Wave 3 — liquid glass + data-dense strategy UI; purge station prose walls.

MUST DELIVER:
- Design tokens + modular components used by station hub + flight chrome
- Market / missions / outfit: numbers first; delete purpose-essay banners
- Modes (gunnery / computer / focus) and autopilot visible
- Prefer hierarchy over more panels

PLAYTEST RUBRIC:
- 5-second screenshot test: stranger names primary actions
- Dock market: understand best sell in <10s without tutorial paragraph
- No wall-of-text in default station tabs

CHECKS: ui-a11y, wcag-contrast, ui identity/perf as applicable.
```

---

## W4 — Asset flood & wonder

```
[UNIVERSAL PREAMBLE]
Also read: design/vision/04_ASSET_TRUTH.md, assets/AGENTS.md, design/graphics-sprints/00_ORCHESTRATION.md

GOAL: Wave 4 — hero ships/stations/landmarks; populate ASSET_STATUS; wire only good assets.

RULES:
- Blender exclusive lock; quality ritual iterations; never wire blocked wholeships
- Thread C owns partsLibrary/runtime maps
- check:assets:live + visual-stability green for anything marked VISIBLE

PLAYTEST RUBRIC:
- Side-by-side .devshots before/after for 3 places + player ship
- No silent procedural fallback on player hull
```

---

## W5 — Living cosmos

```
[UNIVERSAL PREAMBLE]

GOAL: Wave 5 — player-visible economy/faction/event ripples on a dense stage (requires W2).

MUST DELIVER:
- At least 3 director encounter types in open play with telegraph
- Trade volume or violence leaves a readable market/faction trace
- One-voice / non-spam presentation

PLAYTEST: "I caused X and saw Y" story in one session.
```

---

## W6 — Empire / building (only after M0–M3)

```
[UNIVERSAL PREAMBLE]

GOAL: Wave 6 — claims/automation as visible places (Mindustry-adjacent light).

Do not start unless 01_CURRENT_STATE marks W1 PLAY-DONE and W2 density acceptable.
```

---

## Integrator / status refresh (any time)

```
Read design/vision/* and refresh 01_CURRENT_STATE.md + 04_ASSET_TRUTH.md from live tree and check runs.
Do not implement features. Output a short delta report of doc drift vs checks.
```
