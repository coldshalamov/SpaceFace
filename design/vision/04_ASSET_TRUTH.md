# 04 — Asset Truth (wired vs not)

**Snapshot:** 2026-07-09  
**Masters:** `assets/AGENTS.md`, `assets/QUEUE.md`, `assets/ASSET_STATUS.json`, `npm run check:asset-status`, `check:assets:live`, `check:asset-reachability`.

---

## 1. Pipeline (lifecycle)

```
CONCEPT → SOURCE_GLB → RELEASE_BUILT → MANIFEST_SLOT → RUNTIME_MAP → VISIBLE_IN_PLAY
                                                              ↘ BLOCKED
```

| Stage | Meaning |
|---|---|
| SOURCE | `assets/ships/parts/**` authoring |
| RELEASE | `assets/ships/release/parts/**` — **default runtime** |
| MANIFEST | `parts_manifest.json` / release manifest |
| RUNTIME_MAP | `partsLibrary.js` maps (`HULL_FILE_*`, `PLACE_FILES`, etc.) |
| VISIBLE | Player sees it in default flight/UI |
| BLOCKED | Must not wire (e.g. accessory-only wholeships) |

`assets/ASSET_STATUS.json` exists but **`assets: {}` is empty** — lifecycle tracking not populated. **Wave 4-E** should fill it.

---

## 2. Inventory counts (approx.)

| Location | Count | Role |
|---|---:|---|
| GLBs total under `assets/ships` | ~143 | Ships + places |
| `assets/ships/parts` | ~72 | Authoring |
| `assets/ships/release` | ~70 | Live runtime candidates |
| Place props in release/places | ~23 | Stations, rocks, gate, dressing |
| Portraits | 8+ role set | Bar LIVE |
| Cinematics | intro stills + mp4 | Menu LIVE |
| Concept / bible / ore sheets / fx jpgs | many | **REFERENCE only** |
| Wholeships | 3 tracked | **BLOCKED** |

---

## 3. Ship rendering paths (agents get this wrong)

| Path | Used for | Notes |
|---|---|---|
| Code-native (`kestrelHero.js`, etc.) | Player Kestrel & some heroes | Not the wholeship GLB |
| Modular hull parts (`HULL_FILE_BY_DEF_ID`) | Many ships | Release parts |
| Whole-ship GLB map | **EMPTY** (`WHOLE_SHIP_FILE_BY_DEF_ID = {}`) | Do not wire blocked wholeships |
| Procedural fallback | Missing GLB | **Silent** — looks like boxes; forbidden for default ship if avoidable |

**Blocked wholeships (check-asset-status):**

- `wholeship_kestrel` — accessory-only, no hull body  
- `wholeship_pelican` — same  
- `wholeship_wasp` — same  

---

## 4. Place / world assets (wired names)

Release place set includes (wired via `partsLibrary` PLACE list):

- Stations: trade_hub, refinery, military, blackmarket, fab, mining, research  
- Gate: `place_gate_jump_ring`  
- Dressing: lane_beacon, nav_buoy, billboard, dead_hulk, debris, conveyor_barge, mining_drone  
- Rocks: seamed + rock_a/b/c + graffiti  
- Dock interiors: shipyard UI-only (not full flight dock backdrop)

**Gap:** ~half-dozen *kinds* of world dressing relative to Freelancer density fantasy. Need landmarks, cargo yards, platforms, unique sector monuments (`assets/QUEUE.md` lists many **queued, not built**).

---

## 5. Queue (not built) — priority for Wave 4

From `assets/QUEUE.md`:

1. **Repair wholeships** (or abandon in favor of strong modular/code-native heroes)  
2. **Claim module props** (hopper, battery mast, hangar, hab ring, sensor, silo, teleport) — empire wave  
3. **Hunter signature rails** (12) — combat identity  
4. **Landmarks** (beacon spire, wreck cathedral, veil obelisk, pit anchor, vault maw, tower crown)  
5. **Module visual variants** (battery S/M/L, drill, cargo, shield, claw, winch)  

---

## 6. Graphics sprint threads (ops)

| Thread | Domain | Blender? |
|---|---|---|
| A Kit quality | Ship parts quality | Exclusive |
| B World identity | Landmarks/stations style | After lock |
| C Backend wiring | maps, `partsLibrary`, anchors | No Blender |
| D Presentation code | VFX/camera/feel | No Blender |
| E Wholeship repair | Blocked wholeships | Exclusive vs A |

See `design/graphics-sprints/00_ORCHESTRATION.md`.

---

## 7. “Do we need better graphics?” — honest answer

**Yes** — for wonder, marketing, and place identity.  
**But** graphics alone will not fix unplayable combat or empty-feeling sectors.

**Recommended production ratio during M0–M1:**

- ~60% play systems (W1–W2)  
- ~40% assets/VFX that support those (hero ships, starter landmarks, latch/focus VFX)

After M0 PLAY-DONE, flip toward heavier asset flood (W4).

---

## 8. Authoring tools (full stack)

| Tool | Role |
|---|---|
| **Blender MCP** | Hero meshes, hard-surface, export GLB |
| **Image generation** | Concepts, trim/wear refs, **cinematic portraits**, UI mockups, texture guides |
| **Video generation** | Motion refs (bank, cruise, gate, massline) for feel review |
| **Subagents** | Parallel art + review + checks |
| **Screenshot ritual** | 10–20 iters + weighted scores (`06_OPERATING_MODEL.md`) |

Blender rules:

- One Blender owner at a time (lock files)  
- Export → release build → manifest → runtime map → check:assets:live  
- Never wire blocked wholeships  
- Prefer fewer **hero** assets with iterations over dozens of clay dumps  
- Image/video outputs are **authoring** until wired; do not leave cartoony portraits as final if regen is in scope

---

## 9. Quick verification commands

```bash
npm run check:asset-status
npm run check:assets:live
npm run check:asset-reachability
npm run check:visual-stability
npm run report:asset-status   # if present
```
