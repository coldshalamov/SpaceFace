```yaml
packet: P11
title: Control kit — keys, toggles, sliders, steppers, inputs, status lights, focus ring (transparent PNG + SVG)
lane: IMG
tool: ChatGPT 6 Pro (image generation + scripting VM)
dependsOn: [P10]
current: [settings, station-market]
inputs: [design/frontend/direction/approved/kit-notes.md, design/frontend/direction/approved/crops-controls.png, design/frontend/direction/approved/crops-bench.png, design/frontend/direction/approved/frame-settings.png]
returns: P11-return.zip
turns: 1 (+1 correction)
```

# P11 — Control kit: everything the player presses

## Objective

Every interactive control as a **state-complete sprite set** matching the approved frames: keys
(the game's buttons), toggles, sliders, steppers, text inputs, status lights and the focus ring.
Registration across states must be exact so code can swap images without layout shift.

## Read

`_COMMON` (all) → `inputs/kit-notes.md` and the control crops → `03_CONVENTIONS.md` §2 (sprite
sets, registration) and §6.

## Deliverables (@1x; ship @2x)

**Keys** (nine-slice so labels of any length fit; slice ~18)

| id | @1x | states |
|---|---|---|
| `key.primary` | 240×56 | rest · hover · pressed · disabled · focus |
| `key.secondary` | 240×56 | rest · hover · pressed · disabled · focus |
| `key.hazard` | 240×56 | rest · hover · pressed · disabled · focus (safety stripe on the left cap) |
| `key.legend` (the backlit legend tab used for filters, tabs, destinations) | 160×40 | rest · lit · hover · disabled · focus |
| `key.small` (a compact secondary: "New seed", "Back") | 120×36 | rest · hover · pressed · disabled · focus |
| `key.socket` (a square key holding an icon) | 56×56 | rest · lit · hover · pressed · disabled · focus |

The **primary** key carries the amber backlight; **legend** keys carry light behind the text
region only; **hover** raises the edge light, **pressed** sinks the plate 2 px (bake the shift into
the sprite: the visible plate moves, the sprite bounds do not), **disabled** turns the light off and
lowers contrast, **focus** adds the keyboard focus ring (see below) baked for reference only —
code will draw the real ring.

**Toggle** `toggle.switch` 72×32 — a two-position machined switch: off-rest · off-hover · on-rest ·
on-hover · disabled-off · disabled-on. The lit legend is drawn by code; leave the legend area clear.

**Slider** `slider.track` 240×12 nine-slice (etched track with a lit fill region to be masked by
code: deliver `slider.track` unlit and `slider.fill` lit tileable 64×12) · `slider.thumb` 24×24:
rest · hover · pressed · disabled.

**Stepper** `stepper.well` 160×44 nine-slice (the engraved readout well) · `stepper.minus` and
`stepper.plus` 44×44: rest · hover · pressed · disabled.

**Input** `input.underline` 240×40 nine-slice: rest · focus (lit underline) · error (red) ·
disabled.

**Status lights** `light.dot` 12×12 and `light.bar` 24×6: amber · white · red · green × on · dim ·
off (18 files each set). Halo baked in, soft, ≤ 8 px spread.

**Focus ring** `focus.ring` as an SVG nine-slice-able frame (`focus-ring.svg`, 2 px bone at 100 %
with a 1 px dark keyline so it survives on any plate) plus a PNG reference.

**Scrollbar** `scroll.track` 8×64 tileable · `scroll.thumb` 8×32 nine-slice: rest · hover.

**Contact sheet** `_contact-sheet.png` with every state in a row per control.

## Acceptance

1. All controls, all states, exact registration (overlay test in `NOTES.md`).
2. Keys match the approved frames' key crops at 100 %; the pressed state reads as a physical press.
3. The focus ring is visible on the darkest and the lightest plate (contrast ≥ 3:1 both).
4. Manifest validates; ids exactly as listed; no baked text.

## The way this gets faked

Rounded rectangles with a colour swap per state; a "pressed" state that is just darker; a toggle
that is an iOS pill; a slider that is a flat bar; status lights without a real halo.
