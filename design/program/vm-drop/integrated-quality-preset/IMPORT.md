# IMPORT — integrated-quality-preset (PERF backlog #86–#94 group)

## What it is

An **opt-in "Integrated GPU" quality preset** — one Settings → Video surface that bundles
the already-plumbed (or cheap) levers from
`design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md` items **#86–#94**:

| # | Item | Landed? | How |
|---|---|---|---|
| 86 | Shadows off | **yes** | `video.shadows = false` (already Medium default; documented in preset) |
| 87 | Reduced bloom / bloom off | **yes** | `bloomStrength: 0.28`, `bloomLevels: 1` (bloom stays on, cheaper) |
| 88 | Render scale 0.85 + sharpening | **yes** | `renderScale: 0.85`, `sharpen: true` (WebGL1-safe unsharp in bloom composite) |
| 89 | Opt-in dynamic resolution | **flag only** | Sets `dynamicResolution: true`. **Needs `dynres-target-pool` first** so integrated is allowed (`_dynResAllowed`). |
| 90 | 30 / 45 fps cap | **yes** | Preset sets `frameCap: 30`; `FRAME_CAP_OPTIONS` gains **45** |
| 91 | Lower NPC traffic density | **deferred** | No cheap density setting; preset contract forbids sim/content changes |
| 92 | 512² hull-texture tier | **deferred** | No texture-tier plumbing; would need loader/residency work |
| 93 | Post effects off | **yes** | `postFx: false` zeroes grade/vignette/grain in `resolveEffectiveSectorPost` |
| 94 | Particle density | **yes** | `particleQuality: 'low'` |

**Default picture unchanged** — `DEFAULT_QUALITY_PRESET` remains `medium`. The game may
*suggest* the Integrated GPU preset when `detectGpu` reports `integrated`; it never
auto-applies (PERF_WHAT_MATTERS: bloom-off is illegal as a silent default fix).

## Apply order

```bash
git fetch origin
git checkout -B import/integrated-quality-preset origin/master

# Optional but recommended for #89 dynres on integrated:
#   git am design/program/vm-drop/dynres-target-pool/patches/*.patch

git am design/program/vm-drop/integrated-quality-preset/patches/*.patch
npm run check:integrated-quality-preset
npm run check:baseline -- --json   # expect same known soft-GPU reds as baseline-before.md
```

To abort: `git am --abort`.

## PERF backlog items claimed

- **#86–#90, #93–#94** (bundled into one opt-in preset)
- **#89** only the settings flag + documentation; enablement depends on `dynres-target-pool`
- **#91, #92** deferred (see DONE.md)

## What still needs owner-GPU verification

- Live fps / hitch with Integrated GPU preset on the Intel/ANGLE machine (this VM is soft-GPU).
- Visual check that sharpen at 0.85 scale looks acceptable (not over-crisp).
- With `dynres-target-pool` applied: dynres actually engages for integrated when the preset is on.
- Confirm the one-time suggestion toast appears on integrated hardware and does not re-fire after the player already selected Integrated GPU.

## What this does **not** wire

- Does not merge to master (importer decides).
- Does not change default Medium picture / does not auto-apply on detectGpu.
- Does not invent NPC traffic density or 512² hull texture systems.
- Does not push the scratch branch `vm-work/integrated-quality-preset`.
