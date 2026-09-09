# SpaceFace — Accessibility Compliance Matrix

Status as of this commit. Three new files add the first dedicated accessibility layer:

- `src/ui/accessibility.js` — controller: `applyAccessibility(settings)`, colorblind palette + redundant-shape
  registry (`SEMANTIC_PALETTE`), `getMotionReduced()` / `getFlashReduced()`, `ACCESSIBILITY_SETTINGS_SCHEMA`.
- `styles/accessibility.css` — palette classes, high-contrast overrides, reduced-motion (`@media` + class),
  reduced-flash, UI-scale (`--sf-ui-scale` + `clamp()`), dyslexia font, safe-area-inset HUD padding.
- `design/ACCESSIBILITY.md` — this document.

These files are **WIRE-READY but NOT WIRED**: the lead later links the CSS in `index.html`, imports
`applyAccessibility` (call on boot + every `settings:changed`), and imports `SEMANTIC_PALETTE` into
`src/ui/radar.js` to recolor canvas blips. Until then the new code is inert.

## Verified baseline (grep, this commit)

Honest starting point — these claims were checked, not assumed:

| Probe | Result |
|---|---|
| `prefers-reduced-motion` in `src/` | **0** (the new `styles/accessibility.css` is the first) |
| `colorblind` / `protanopia` / `deuteranopia` / `tritanopia` in `src/` | **0** |
| `aria-*`, `role=`, `tabindex`, `alt=` in `src/` | **0** — no ARIA / no semantic roles anywhere in the DOM UI |
| Audio subtitles / captions for sound cues | **0** (the `caption`/`subtitle` grep hits are asset comments in `uiRoot.js`/`renderer.js`, not features) |
| High-contrast mode | **0** before this layer |

What **did** already exist and counts toward accessibility:

- `settings.video.motionReduce` toggle (settings.js:245) — suppresses camera shake / FOV punch / hit-stop;
  read by `src/render/feel.js:131` and `src/render/vfx.js:674`. (Vestibular support — real, shipped.)
- Full **key rebinding** for flight actions (settings.js:116-372) + "arrow keys always also work."
- **Master mute** + per-bus volume sliders (settings.js:230-233).
- **Damage-numbers** toggle (settings.js:255) and **UI scale** slider `uiScale` 0.75–1.5x (settings.js:246).
- CSS-variable theming (`styles/ui.css:8-9`) — the hook the colorblind palettes ride on.

## EU EAA relevance

The **European Accessibility Act (Directive (EU) 2019/882)** applies from **28 June 2025** to consumer
products and services placed on the EU market. SpaceFace is a **commerce game** (it sells/trades commodities,
runs a market and a shipyard) **with comms-style elements** (alerts, mission text, faction messaging). A
purely offline single-player video game is not itself an EAA-listed service, but the EAA's listed scope
includes **e-commerce services** and **electronic communications** — so the commerce/market surfaces and any
networked/storefront layer are the parts most likely to fall in scope, and the EAA points to **EN 301 549**
(which references **WCAG 2.1 AA**) as the conformance baseline. Designing to WCAG 2.1 AA now de-risks any
future store/web/commerce front. The four rows below are organized by the WCAG/assistive axes
(motor, visual, auditory, cognitive).

---

## Compliance matrix

Legend: **EXISTS** = shipped before this layer · **ADDS** = provided by these three new files (once the lead
wires them) · **TODO** = still missing.

### Motor

| Capability | Status | Where / Note |
|---|---|---|
| Remappable controls | **EXISTS** | Flight-action rebinding, conflict-checked (`settings.js:116-372`). |
| No timing-critical-only input | **EXISTS** | Auto-fire toggle (`F`) and target-nearest reduce twitch demand (`settings.js` keybind table). |
| Visible keyboard focus ring | **ADDS** | `:focus-visible` outline + high-contrast focus ring (`accessibility.css`). |
| Large / scalable hit-and-read UI | **ADDS** | `--sf-ui-scale` 1–2x via `clamp()` scales HUD + menu type (`accessibility.css`). |
| Full keyboard nav of menus / market / shipyard | **TODO** | No `tabindex`/focus-trap/roving model today (grep: 0). Needs DOM work in the screen modules — out of scope for these files. |
| Single-button / dwell / remapped-pointer play | **TODO** | Not addressed. |

### Visual

| Capability | Status | Where / Note |
|---|---|---|
| Colorblind palettes (protan/deutan/tritan) | **ADDS** | `PALETTES` + `applyAccessibility` set `--sf-*` vars and `sf-cb-*` class; CSS re-declares bar gradients (`accessibility.css`). |
| **Color not the sole channel** | **ADDS (partial)** | `SEMANTIC_PALETTE` pairs every state with a redundant `shape`/`icon`. **Bars** already have text labels (HULL/SHLD/…), so they pass today. **Radar blips do NOT** — see "Radar caveat" below; the shape data ships, but `radar.js` must consume it (TODO). |
| High-contrast mode | **ADDS** | `html.sf-high-contrast` raises border weight, opaque panels, brighter ink, kills blur (`accessibility.css`). |
| Scalable UI (low-vision) | **ADDS** | `--sf-ui-scale` clamp (see Motor). |
| Dyslexia-readable font | **ADDS** | `html.sf-dyslexia` swaps to a legible stack + loosens spacing; mono telemetry preserved (`accessibility.css`). No web font bundled (zero build step) — lead may add OpenDyslexic to the stack front. |
| Contrast ratio audit (WCAG 1.4.3 AA, 4.5:1) | **TODO** | The new palettes target perceptual separation but have not been numerically audited against AA on every surface. |
| Screen-reader / ARIA semantics | **TODO** | 0 ARIA in the DOM today. The whole UI is `<div>`-based with no roles/labels — a large, separate effort. |

### Auditory

| Capability | Status | Where / Note |
|---|---|---|
| Master mute + independent SFX/music volume | **EXISTS** | `settings.js:230-233`. |
| Visual redundancy for audio cues (no audio-only info) | **EXISTS (partial)** → strengthened | Alerts/toasts already show combat/low-shield/wanted states visually (`hud.js`, `alerts.js`); the colorblind-safe + icon-redundant alert styling here makes those clearer. |
| Captions / subtitles for spoken or sound cues | **TODO** | No caption system (grep: 0). The game is largely text+SFX with no voice, so impact is low, but any future VO needs captions. |
| Mono / audio-balance / visual-alarm-only options | **TODO** | Not addressed. |

### Cognitive

| Capability | Status | Where / Note |
|---|---|---|
| Tutorial hints toggle | **EXISTS** | `settings.gameplay.tutorialHints` (`settings.js:254`). |
| Difficulty options (incl. Casual) | **EXISTS** | `casual / standard / veteran / ironman` (`settings.js:252`). |
| **Reduce motion** (vestibular) | **EXISTS** → exposed | `settings.video.motionReduce`, read by `feel.js`/`vfx.js`. `getMotionReduced()` mirrors this same field (single source of truth) for any new consumer. |
| **Reduce flashing** (photosensitivity) — *separate flag* | **ADDS** | NEW `settings.accessibility.flashReduce` → `html.sf-reduce-flash` tames death-flash/strobe/pulse, and `getFlashReduced()` for vfx. Deliberately distinct from reduce-motion (two flags, two needs). |
| Reduced CSS animation everywhere | **ADDS** | `@media (prefers-reduced-motion)` **and** `html.sf-reduce-motion` (belt-and-suspenders for users who never open settings). |
| Adjustable text size | **ADDS** | UI-scale clamp (see Motor/Visual). |
| Consistent, predictable layout | **EXISTS** | Design-system tokens/components (`ui.css` Phase 5). |

---

## Radar caveat (the one place to not overstate)

`src/ui/radar.js` draws blips on a **`<canvas>`** with hardcoded JS hex (`COL` radar.js:18-21,
`FACTION_COLOR` :13-17, applied in `blipColor` :23-35). **CSS cannot recolor a canvas.** Therefore:

- `styles/accessibility.css` does **nothing** for radar blips. Claiming otherwise would be false.
- The colorblind blip remap + redundant shapes live in JS: `SEMANTIC_PALETTE`, `semanticColor(state, mode)`
  and `semanticShape(state)` in `src/ui/accessibility.js`. **Wiring is TODO**: the lead imports these into
  `radar.js` and replaces the `COL` lookup + the uniform-square draw (radar.js:102-103) with per-state
  `semanticColor`/`semanticShape`. Until that edit lands, radar hostility is still color-only.

The states needing shape redundancy (because color is currently their only differentiator):

| State | Today | Redundant shape (provided) |
|---|---|---|
| hostile (`e.team !== playerTeam && e.team !== 0`, radar.js:30,33) | red square | `triangle` ▲ |
| neutral (team 0, radar.js:34) | grey square | `square` ■ |
| friendly (faction tint, radar.js:31) | tinted square | `diamond` ◆ |
| ally / player (radar.js:113-114, COL.player) | cyan triangle | `chevron` ➤ |
| target (radar.js:105-108) | white ring (already shape-redundant) | `ring` ◎ |

(Asteroid dot :99, pickup diamond :97, station square :100-101 are already shape-distinct.)

---

## Settings the lead should add (not edited here)

See `ACCESSIBILITY_SETTINGS_SCHEMA` in `src/ui/accessibility.js`. Proposed `settings.accessibility` subtree
for the NEW fields; the two EXISTS fields stay where they are:

| Field | Path | Status |
|---|---|---|
| `colorblindMode` (`none`/`protanopia`/`deuteranopia`/`tritanopia`) | `accessibility.colorblindMode` | NEW |
| `highContrast` | `accessibility.highContrast` | NEW |
| `flashReduce` | `accessibility.flashReduce` | NEW |
| `dyslexiaFont` | `accessibility.dyslexiaFont` | NEW |
| `motionReduce` | `video.motionReduce` | EXISTS — do **not** add a duplicate (settings.js:245 already renders it) |
| `uiScale` | `uiScale` (root) | EXISTS — note the **range conflict**: shipped 0.75–1.5x vs task spec 1–2x, and `--ui-scale` (uiRoot.js:290) vs new `--sf-ui-scale`. `applyAccessibility()` sets both vars to keep things working; the lead picks one. |

## Wiring checklist (lead, later phase)

1. `index.html`: add `<link rel="stylesheet" href="./styles/accessibility.css" />` **after** `styles/ui.css`.
2. `main.js`: `import { applyAccessibility } from './ui/accessibility.js'`; call it on boot and on `settings:changed`.
3. `settings.js`: add an "Accessibility" tab driven by `ACCESSIBILITY_SETTINGS_SCHEMA` (reuse the existing
   `rowToggle`/`rowSelect`/`rowSlider` helpers).
4. `radar.js`: import `SEMANTIC_PALETTE` / `semanticColor` / `semanticShape`; recolor + reshape blips by state.
5. `vfx.js` / feel: optionally consult `getFlashReduced()` to gate any procedural flash.
6. Reconcile the `--ui-scale` vs `--sf-ui-scale` collision and the UI-scale range.
