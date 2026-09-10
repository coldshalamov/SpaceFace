```yaml
packet: P15
title: Keyart — Crucible mode/arena/difficulty tiles and the backdrop plates (opaque + masked PNG)
lane: IMG
tool: ChatGPT 6 Pro (image generation + scripting VM)
dependsOn: [P01, P05]
current: [crucible-door, codex, help]
inputs: [design/frontend/direction/approved/kit-notes.md, design/frontend/direction/approved/frame-crucible-door.png, design/frontend/direction/approved/plate-crucible-door.png, design/frontend/direction/approved/frame-codex.png]
returns: P15-return.zip
turns: 1 (+1 correction)
```

# P15 — Keyart tiles and backdrop plates

## Objective

The pictures inside the tiles and behind the screens that have no live scene: five **arena
tiles**, five **mode tiles**, four **difficulty tiles**, and three **backdrop plates** (a hangar
wall, a berth service bay, a workshop bench) that stand in for the live world when the game cannot
draw one (constrained GPUs, headless captures, reading screens). Hull tiles are **not** here — they
are rendered from the real 3D models in P16.

## Read

`_COMMON` → `inputs/` (match the Crucible door frame's arena look; match `kit-notes.md` light and
palette) → `03_CONVENTIONS.md` §2.

## Deliverables

| Set | Files | @1x size | Notes |
|---|---|---|---|
| Arena tiles | `tile-arena-ricochet-foundry` · `-lagrange-crucible` · `-cinder-sluice` · `-cryo-drift` · `-storm-lattice` | 640×360 | lit sets from a high three-quarter camera: Foundry = hard metal banks and machinery under forge light; Lagrange = orbital debris fields and gravity-well shimmer; Cinder = a channel of cooling slag and dust; Cryo = ice, cold blue-white light, drifting bergs; Storm = a lattice of charged pylons with lightning. Same lens, same horizon height, same grade. Opaque, plus `-masked` versions with a vignette alpha for tile windows |
| Mode tiles | `tile-mode-swarm` · `-gauntlet` · `-daily` · `-weekly` · `-ghost` | 320×320 | emblematic scenes: a wall of light ships (Swarm); a corridor of gates (Gauntlet); a calendar-stamped berth (Daily); a week-long route board (Weekly); a translucent copy of the Kestrel (Ghost) |
| Difficulty tiles | `tile-difficulty-1..4` | 320×160 | four states of the same equipment: pristine · used · battered · burning |
| Backdrop plates | `plate-backdrop-hangar-wall` · `-berth-bay` · `-workshop-bench` | 1920×1080 | quiet, dark, warm, out-of-focus in the far field, sharp in the near field; nothing that competes with text; each with a `-cold` variant (wanted temperature) |
| Contact sheet | `_contact-sheet.png` | | |

## Acceptance

1. All files; arena tiles share lens/horizon/grade (a strip of the five in `NOTES.md`).
2. Every tile reads inside a 160 px-wide smoked window (test that crop in `NOTES.md`).
3. Backdrop plates keep 4.5:1 text contrast with bone text over their busiest region.
4. Nothing looks like concept art or a painting; everything looks like the game's own render.

## The way this gets faked

Generic sci-fi wallpaper; five arenas that are the same picture with a colour cast; plates with a
bright focal object in the text region.
