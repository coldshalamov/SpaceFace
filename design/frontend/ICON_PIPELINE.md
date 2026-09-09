<!-- LIFETIME: DURABLE -->
# Power Icon Pipeline


> **2026-08-30 IDENTITY NOTE:** the visual identity mandates in this document that predate the
> 2026-08 revision (neon cyan/teal/mint/purple accents, Saira SemiCondensed, tracked-out micro
> labels, coloured left rails, glass/glow treatments) are **superseded** by
> [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md) §3/§4 (2026-08 revision): neutral charcoal,
> one blue accent #4f8fdd, desaturated semantics, Plex Sans/Mono, no rails/glass/glow/tracking.
> Read this document for its structural and interaction design; take every colour, type, and
> surface treatment from the grammar.

**Status:** the authoring pipeline for the HUD Power Bar icon set and every other symbolic glyph in
the game. Binding on icon work. Companion to [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md).

**The problem this solves.** The owner asked for AI-generated icons showing "roughly what that thing
does, some stylistic representation of the power." The hard part of an AI icon set is **not
generating an icon — it is generating twenty that look like one set.** Twenty independent
generations produce twenty styles, which reads as asset-flip clutter and is worse than no icons.
This document fixes a single style anchor, one parameterised template, and a conversion target, so
every glyph lands in the same family.

---

## 1. The delivery format is decided: authored SVG, not raster

Generated raster art is **concept reference**, never a shipped asset. The shipped artifact is inner
SVG markup in the existing house format.

**Why — three technical reasons, not taste:**

1. **`currentColor` is load-bearing.** `src/ui/station/icons.js` draws every glyph with
   `stroke="currentColor"`, so one glyph automatically recolours for **ready / cooling / locked /
   unaffordable / just-fired**. A raster PNG needs five files and still cannot animate between them.
2. **`forced-colors` strips `background-image`.** Raster icons delivered as CSS backgrounds
   **disappear entirely** in Windows high-contrast mode. Stroked SVG survives.
3. **Scale.** The bar renders at 32–48 px, tooltips at 20 px, the Ship screen's capability list at
   24 px. One vector serves all three; raster needs a sprite set per density.

### The house format — match it exactly

From `src/ui/station/icons.js`: a **24 × 24** grid, inner markup only (the wrapper adds `<svg>`), with

```
fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
```

Secondary detail is expressed with `opacity="0.55"`–`0.85` on additional paths — **never** a second
colour and **never** a second stroke weight. Study `market`, `shipworks` and `resupply` in that file
before authoring; they are the reference for how much detail a 24 px glyph can carry.

---

## 2. The style anchor — paste verbatim into every generation

This paragraph is **fixed**. It does not get reworded per icon. It is the entire reason the set
coheres.

> **STYLE ANCHOR.** A single monochrome line-art pictogram on a plain dark background. Drawn as
> clean unfilled outlines with one uniform stroke weight and rounded caps and joins, like a precision
> aerospace panel marking or an ISO safety symbol. No fills, no gradients, no shading, no texture, no
> glow, no colour, no perspective, no 3D rendering, no drop shadow, no background scene, no text, no
> lettering, no numerals, no border or frame. Centred, symmetrical where the subject allows, with
> generous empty margin. The whole shape must remain readable when shrunk to 32 pixels. Industrial
> and functional rather than decorative or magical.

**Negative prompt (also fixed):**

> photorealistic, 3D render, gradient, glow, neon, lens flare, drop shadow, colour, filled shapes,
> text, letters, numbers, watermark, signature, frame, border, busy background, multiple objects,
> perspective, isometric, cute, cartoon mascot, fantasy runes, magic sparkles

---

## 3. The parameterised template

Exactly one variable region. Everything else is constant.

```
{STYLE_ANCHOR}

SUBJECT: {SUBJECT_LINE}
THE IDEA TO CONVEY: {EFFECT_LINE}
COMPOSITION HINT: {COMPOSITION_LINE}

Negative prompt: {NEGATIVE_PROMPT}
```

- **`SUBJECT_LINE`** — the physical object or event, concretely. Never the power's proper name; a
  model does not know what a "Massline" is.
- **`EFFECT_LINE`** — *what it does to the world*, because the owner asked the icon to show "roughly
  what that thing does." This is the field that makes a pictogram legible rather than decorative.
- **`COMPOSITION_LINE`** — the arrangement that keeps the silhouette distinct from its neighbours in
  the set.

### Terminal invocation

Generation is delegated to whichever image-capable CLI agent is available. The prompt file is the
contract; the tool is interchangeable.

```bash
# One icon, four candidates. Prompts live beside this doc.
codex exec --image "$(cat design/frontend/icon-prompts/power-well.txt)" \
  --out .devshots/icons/power-well/   # .devshots is gitignored — concept art is NOT committed
```

**Batch the whole set in one session where the tool allows it.** Same seed family, same session,
same anchor — cross-icon consistency is dramatically better from one batch than from twenty separate
runs on different days.

---

## 4. The power roster — prompts to author

These are the five powers **already bound to number keys** in `src/systems/input.js` and currently
absent from the HUD, plus the signature mechanic and the strongest candidates for the remaining
slots. Slot assignment itself is specified in
[`SCREENS_A_FLIGHT.md`](./SCREENS_A_FLIGHT.md).

| Key | Power | `SUBJECT_LINE` | `EFFECT_LINE` | `COMPOSITION_LINE` |
|---|---|---|---|---|
| — | **Massline** (tether, signature) | a taut cable running between two round bodies, one large and one small | two objects bound together so the small one is swung around the large one | strong diagonal; the cable is the dominant line; unmistakable at a glance |
| `4` | **Mass Seed** | a dense weighted sphere dropped in open space, with concentric rings around it | placing a heavy anchor point that other things bend toward | radial, centred, dot-and-rings |
| `5` | **Well** (pull) | a funnel of converging arrows collapsing to a single point | pulling loose objects inward to one place | arrows point INWARD; opposite of the repulsor |
| `6` | **Repulsor** (shove) | a burst of arrows radiating outward from a central point | shoving everything nearby violently away | arrows point OUTWARD; mirror of the well |
| `7` | **Clearing Cone** | a wide wedge projecting forward from a blunt nose, sweeping debris aside | pushing obstacles out of your path as you move | forward-facing triangle, asymmetric, motion to the right |
| `8` | **Skim Collector** | a wide scoop passing through banded layers, gathering a stream into itself | harvesting material by grazing along a surface | horizontal bands with a scoop crossing them |
| — | **Charge Throw** | a coiled spring behind a small object about to be launched | winding up energy to hurl something | tension at left, object leaving to the right |
| — | **Charge Detonate** | a compact core with fracture lines breaking outward | releasing stored energy as a burst | centred, radial cracks |
| — | **Countermeasure** | a small cluster of scattering flares leaving a body | throwing off pursuit or incoming fire | body at lower left, scatter to upper right |
| — | **Scan Pulse** | a single expanding ring emitted from a point, with faint returns | revealing what is out there | one bold ring, two faint echoes |
| — | **Cloak** | a solid outline dissolving into a dashed outline | becoming undetectable | left half solid, right half dashed |
| — | **Bullet Time** | a wide-open shutter aperture with a slowed sweep hand | stretching a moment out so you can act inside it | circular, mechanical |
| — | **Beacon** | a slender post emitting stacked broadcast arcs | marking a place so it can be found again | vertical, arcs to one side |
| — | **Fleet Command** | one lead chevron with two smaller chevrons falling in behind | directing others to act on your behalf | three chevrons in formation, lead largest |
| — | **Drone Bay** | an open hatch with a small craft leaving it | deploying an autonomous helper | hatch left, craft exiting right |
| — | **Travel Burn** | a long tapering exhaust trail behind a compact body | committing to sustained high speed | strong horizontal taper |

> **Symbol-family rule.** When two icons in this set share a silhouette, one of them is wrong.
>
> **Mirror pairs are a trap — learned by rendering, not by reasoning.** Well and Repulsor were first
> specified as exact mirrors (arrows in / arrows out). Prototyped at bar size in `_uilab.html`, they
> are **indistinguishable**: at 21–32 px the arrowheads collapse and both read as the same asterisk.
> Directional symmetry is elegant at 64 px and worthless at 32.
>
> **Therefore every mirror pair needs a second, non-directional channel:**
> - **Well (gathers)** — arrows inward **plus a solid filled centre dot**. Something is accumulating there.
> - **Repulsor (scatters)** — arrows outward **plus a broken or hollow centre ring**. Something burst apart.
> - **Mass Seed vs Scan Pulse** — both radial; Mass Seed has a **heavy filled core**, Scan Pulse an
>   **empty origin** with unequal echo weights.
>
> Apply the same rule to any future pair: *direction alone is never sufficient contrast at icon size.*

---

## 5. Conversion: generated art → shipped glyph

1. **Generate** 4 candidates per icon into `.devshots/icons/<name>/` (gitignored — concept art is
   never committed).
2. **Select** by the §6 acceptance tests, not by which is prettiest at full size.
3. **Author** the winner as inner SVG on the 24 × 24 grid in the house format. Trace by hand or
   auto-trace then simplify — the target is **under ~6 path elements**; a 24 px glyph cannot carry
   more. Redraw rather than trace when the model's shape is close but sloppy.
4. **Register** in the glyph map (extend `src/ui/station/icons.js`'s `RAW`, or a parallel
   `powerIcons.js` following the identical format) and render through `glyphSvg()` /
   `uiPrimitives.glyph()`.
5. **Verify** at 20 / 32 / 48 px, in default, colour-blind, and `forced-colors` modes.

---

## 6. Acceptance tests — an icon ships only if all pass

1. **The 32 px test.** Render at 32 px. If any element merges into another, simplify and re-author.
2. **The silhouette test.** Fill every path solid black. It must still be distinguishable from every
   other icon in the set. *This is the single most useful test and it is usually the one that fails.*
3. **The naming test.** Show it to someone who has not played the game with only the `EFFECT_LINE`
   as the answer set. They should be able to match icon to effect better than chance.
4. **The set test.** Lay all icons on one row. Any glyph that looks like it came from a different
   library gets redrawn. Stroke weight, corner radius, and optical density must be uniform.
5. **The state test.** Confirm it reads correctly in all bar states: ready, cooling, locked,
   unaffordable, just-fired — all of which are `currentColor` changes plus opacity.
6. **The mode test.** Legible under `forced-colors` and each colour-blind mode.

---

## 7. What icons must never do

- **Never carry meaning by colour alone.** The glyph is monochrome by construction; state colour is
  applied by the UI. A power whose *identity* depends on being orange has failed the brief.
- **Never contain text, letters, or numerals.** The key cap is drawn by the UI in real type — it is
  not part of the artwork.
- **Never be emoji or a unicode symbol.** `src/ui/screens/techTree.js` currently draws a `🔒` emoji
  straight onto a canvas; that is precisely the cheapness being removed.
- **Never ship a raster in a CSS `background-image`** — it vanishes under `forced-colors`.
- **Never invent a power that does not exist in code.** Every icon maps to a real bound verb or a
  real fitted module. An icon for an unimplemented ability is a promise the game breaks.

---

## 8. Storage

| Artifact | Location | Committed |
|---|---|---|
| Prompt files (one `.txt` per icon, template already filled) | `design/frontend/icon-prompts/` | **yes** — they are the reproducible source |
| Generated concept art | `.devshots/icons/<name>/` | no (gitignored) |
| Authored glyph markup | `src/ui/station/icons.js` or `src/ui/powerIcons.js` | **yes** — the shipped asset |

Committing the prompts and not the raster means the set can be regenerated or extended later in the
same style by any agent, without needing the original images or the original session.
