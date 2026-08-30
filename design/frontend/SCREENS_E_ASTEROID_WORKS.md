<!-- LIFETIME: DURABLE -->
# Asteroid Works — a cutaway you bore


> **2026-08-30 IDENTITY NOTE:** the visual identity mandates in this document that predate the
> 2026-08 revision (neon cyan/teal/mint/purple accents, Saira SemiCondensed, tracked-out micro
> labels, coloured left rails, glass/glow treatments) are **superseded** by
> [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md) §3/§4 (2026-08 revision): neutral charcoal,
> one blue accent #4f8fdd, desaturated semantics, Plex Sans/Mono, no rails/glass/glow/tracking.
> Read this document for its structural and interaction design; take every colour, type, and
> surface treatment from the grammar.

**Status:** idea-spec for the mining minigame chrome, now subordinate to
[`../ASTEROID_WORKS_DESIGN_LAW.md`](../ASTEROID_WORKS_DESIGN_LAW.md) — the 2026-08-20
owner design session's full positive design (art direction, chrome inventory, events,
invariants). Where this file and the design law disagree, **the law wins**. Playfield law,
spirit, vanilla-collapse ban, and the owner defects live in
[`../program/ASTEROID_WORKS_PLAYFIELD.md`](../program/ASTEROID_WORKS_PLAYFIELD.md).
Admitted execution is [`../program/roadmap/active/PQ-130.md`](../program/roadmap/active/PQ-130.md).

**Superseded by the law (2026-08-20):** the hover plate "parked in the apron" → a
**cursor lens** that travels beside the pointer (law §6.4); the always-visible 3×3
command card → an **earned palette** that does not exist until a Core is owned and
grows key by key (law §6.3); the STRATA legend bay → seam bodies with count chips on
the board itself (law §3.5); this file's Saira/tracked-caps/gunmetal voice → the law's
§3 warm palette, Instrument Sans / Spline Sans Mono / Bricolage, sentence case. Fog of
war is removed (law §2.3).

Read [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md) for structural rules (12 px
floor, colour-by-meaning, motion-as-needle). This file still supplies the **idea** —
centerpiece, verb, and what the chrome is allowed to be.

`SCREENS_D` B.10 (“leave the drill screen alone and use it as the bar”) is **void**.
Owner playtest outranks it.

---

## 1. Archetype

| Surface | Archetype | Primary manipulation | Centerpiece |
|---|---|---|---|
| **ASTEROID WORKS** | a cutaway you bore | **BORE** — tap one cell, hold to cruise and to cut | the live 3D cross-section of **this** rock |

One-line silhouette test, **text removed:** you see a rock face, a tunnel, a
vehicle, and geology. You do **not** see stacked dark rectangles around a small
grid. If the silhouette is a website, the screen has no idea in it.

This is the same family as THE RANGE (a playable inset). It is not THE SHIP, not
a form, and not a log.

---

## 2. The HUD is ugly, and that is the work

Owner follow-up: the chrome is not merely too large. **It looks cheap.** Size
and ugliness are one failure — pixels that do not earn their keep.

Named defects from the 2026-08-20 stills (do not “fix” these with a shorter
copy of the same shell):

| What you see | Why it is ugly, not just big |
|---|---|
| Cyan-framed playfield with a black well to the left | The mine is a **video embed** inside an app. A cutaway should *be* the screen, not sit in a clip window. |
| 264px Manifest rail reprinting “Upgrade required! Need Drill MK2” and tutorial paragraphs | A log is pretending to be a column of the game. First-time teaching printed once in a drawer is enough. A permanent reprint tape is clutter. |
| Site systems bay: Power —, Export —, Couriers —, empty bars | Instruments with nothing to say still occupy a third of the deck. Empty readouts that keep their bay are decoration. Collapse them. |
| Context bay: a title, two tutorial paragraphs, then a dark hole | A novel well. Hover should not be a blog. The empty remainder makes the panel look unfinished. |
| Command keypad: 20px faint line-SVGs, 8px names, dimmed in DRIVE | A grey icon font, not a physical keypad. Verbs you need should look pressable. Type under 12 px is already illegal. |
| Truncated keybind dump under the card | Debug overlay. Not an instrument. |
| Hazard-stripe deck seam + tracked Saira on every kicker | The template is shouting “console.” Hierarchy by structure, not by more amber. |

**Illegal “fixes”:** `--ao-deck` 208→160; hide the rail; `opacity: 0.6` on empty
bays; more stripes; move the same paragraphs into a tooltip; keep the three-bay
deck and give the canvas `flex: 1`.

**Legal direction:** the mine is the STAGE, edge to edge. Remaining chrome is a
**rig dashboard** — thin crest, pressable command plates, the two rig gauges that
move while you bore (temp, energy). Manifest, idle site-systems, the novel well,
and the keybind dump are drawers or they are gone from the default drive view.
When a drawer opens it does not cover the rock like a modal.

Ugliness test: would you rather look at the leftover chrome, or at the rock?
If the chrome still competes, it is still ugly.

---

## 3. STAGE is the board

- **CREST** — thin identity strip: site name, claim state, one alert line, yield,
  retract. Do not fatten it. No hero title over the rock.
- **STAGE** — the playfield, edge to edge of the theater. Local camera on the
  rover. No black well. No embed frame.
- **APRON** — DRIVE / BUILD, the 3×3 as a physical keypad, pulse survey, temp and
  energy as real bars. This is the one chrome block that stays, because it is
  the verb — and it has to *look* like a verb.
- **DRAWER** — manifest tape, idle site-systems, long inspector copy, keybind
  legend. Off the default drive view.

If chrome and board compete, the board wins.

---

## 4. What the picture must say

The STAGE carries identity. Chrome confirms.

| Subject | On the board | In the apron / drawer |
|---|---|---|
| Unsurveyed stone | Anonymous mass in this asteroid’s body color | “Unsurveyed” as a kicker, not a paragraph |
| Silicate / basalt | Distinct strata in the stone itself | Swatch that **matches** the board |
| Ore vein | The cell is mineralized + a cluster that reads at play size | Name, once-yield chip, farm-forever chip, MK lock if any |
| Gas pocket | The block is cracked and seeping. Never a crystal | Hazard chip: tap beside, do not bore |
| Rover | A vehicle you find in a second | Energy / temp as instruments, not prose |
| Machine | The machine mesh + contact ring overlay when placing | Status as a lamp + one sentence |

Surveyed silicate and unsurveyed stone must not be a squint test.

---

## 5. Hover is an instrument, not a tutor

Mouseover / cursor on a cell shows:

1. A **material plate** (large swatch or 3×3 contact ring when neighbors matter).
2. **Consequence chips** — BORE 2u once · FARM forever · HAZARD · LOCKED MK2.
   Shape + word, not colour alone.
3. At most **one** body line. Hardness is a bar, not a sentence.

The plate is small and dense, parked in the apron or on the STAGE as a spatial
callout the renderer owns. It is not a novel-sized well that sits empty until
prose arrives.

First-time teaching already prints on the tape. It does not reprint on every
hover. The UI never invents; chips and lines come from an enumerated bank.

Contact ring stays the machine primitive. Show it for machines, placement
ghosts, and geology when hollowing a neighbor is the decision. Do not replace
it with a paragraph.

---

## 6. Drive feel

- **Tap** an empty cell direction: the rover **seats** one cell and stops. It
  should feel like placing a heavy machine, not tapping a cursor.
- **Hold** past a short delay: cruise, still one cell at a time, at a speed a
  person can steer in a tunnel.
- **Hold on rock**: bore. A short tap on rock is a bite you can see, not a
  silent no-op and not a launch.
- Browser key-repeat is not a movement clock. The drill clock is.

This is not hitch work. If frames still hitch after cadence is honest, that is
`PQ-129`.

---

## 7. Type, colour, motion

Grammar law, applied here:

- Nothing under 12 px. Live kickers, keypad names, strata labels, and keybind
  dumps at 8–11 px are defects, not style.
- Colour by meaning: `--sf-you` for the rover / a gain, `--sf-foe` for gas and
  hull damage, `--sf-goal` for a vein you can take or a lock you can lift,
  `--sf-calm` for chrome, `--sf-paper` for words. Cyan only as the material-lane
  meaning already assigned in the console brief — **not** as a frame around the
  mine.
- Motion only with a named variable: rover step, bore progress, survey pulse,
  conveyor flow. No idle fog on the board. Empty gauges do not sit and pulse.

---

## 8. Out of scope

New machines, formations, thermal, signature, cluster/station assembly, and any
rewrite of the contact-ring **sim**. Presentation of the game that already
exists.

---

## 9. Done

The screen is done when:

- silhouette (text off) is rock + vehicle + thin dashboard, not a website;
- a surveyed vein and an unsurveyed cell are distinct at play size;
- the rover is findable in a second;
- tap moves one cell;
- leftover chrome looks like something you would touch;
- the context readout is readable with the text removed.

Capture the **whole theater** at 1920×1080 and 1280×720, default and
reduced-motion. A cropped cube is not evidence.
