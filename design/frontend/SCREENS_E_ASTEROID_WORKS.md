<!-- LIFETIME: DURABLE -->
# Asteroid Works — a cutaway you bore

**Status:** binding idea-spec for the mining minigame chrome. Playfield law and the
2026-08-20 owner defects live in
[`../program/ASTEROID_WORKS_PLAYFIELD.md`](../program/ASTEROID_WORKS_PLAYFIELD.md).
Admitted execution is [`../program/roadmap/active/PQ-130.md`](../program/roadmap/active/PQ-130.md).

Read [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md) first. This file only supplies
the **idea** — centerpiece, verb, and what the chrome is allowed to be — because the
grammar already decided type, colour roles, motion, and the CREST / STAGE / APRON
skeleton.

`SCREENS_D` B.10 (“leave the drill screen alone and use it as the bar”) is **void**.
Owner playtest outranks it.

---

## 1. Archetype

| Surface | Archetype | Primary manipulation | Centerpiece |
|---|---|---|---|
| **ASTEROID WORKS** | a cutaway you bore | **BORE** — tap one cell, hold to cruise and to cut | the live 3D cross-section of **this** rock |

One-line silhouette test: with every label removed, you still see a rock face, a
tunnel, a vehicle, and ore/gas as geology — not a webpage with a tiny 3D inset.

This is the same family as THE RANGE (a playable inset). It is not THE SHIP, not a
form, and not a log.

---

## 2. STAGE is the board

The cutaway is the majority of the screen. That is the owner ruling, not a layout
preference.

- **CREST** — thin identity strip: site name, claim state, one alert line, yield,
  retract. No hero title over the rock.
- **STAGE** — the playfield, edge to edge of the theater. Local camera on the rover.
  No black well beside a letterboxed postage stamp.
- **APRON** — the command card (DRIVE / BUILD, the 3×3, pulse survey). This is the
  one chrome block that must stay on screen because it is the verb.
- **DRAWER** — manifest tape, site-systems trivia, long inspector copy. Off the
  default drive view; available without covering the board.

If chrome and board compete, the board wins. A layout that spends most of the
window on HUD has already failed the silhouette test.

---

## 3. What the picture must say

The STAGE carries identity. Chrome confirms.

| Subject | On the board | In the apron / drawer |
|---|---|---|
| Unsurveyed stone | Anonymous mass in this asteroid’s body color, hatch or cool if you must mark “unknown” | “Unsurveyed” as a kicker, not a paragraph |
| Silicate / basalt | Distinct strata in the stone itself | Swatch that **matches** the board |
| Ore vein | The cell is mineralized + a cluster that reads at play size, tinted by the ore | Name, once-yield chip, farm-forever chip, MK lock if any |
| Gas pocket | The block is cracked and seeping. Never a crystal | Hazard chip: tap beside, do not bore |
| Rover | A vehicle that fills most of a cell | Energy / temp as instruments, not prose |
| Machine | The machine mesh + contact ring overlay when placing | Status as a lamp + one sentence |

Surveyed silicate and unsurveyed stone must not be a squint test.

---

## 4. Hover is an instrument, not a tutor

Mouseover / cursor on a cell shows:

1. A **material plate** (large swatch or 3×3 contact ring when neighbors matter).
2. **Consequence chips** — BORE 2u once · FARM forever · HAZARD · LOCKED MK2.
   Shape + word, not colour alone.
3. At most **one** body line. Hardness is a bar, not “Hardness 0.96 · 0% cut”
   as a sentence.

First-time teaching already prints on the manifest tape. It does not reprint on
every hover. The UI never invents; chips and lines come from an enumerated bank
the same way `causeLedger` does.

Contact ring stays the machine primitive. Show it for machines and placement
ghosts, and for geology when the player is deciding whether to hollow a neighbor.
Do not hide it, and do not replace it with a paragraph.

---

## 5. Drive feel

- **Tap** an empty cell direction: the rover steps **one** cell and stops.
- **Hold** past a short delay: cruise, still one cell at a time, at a speed a
  person can steer in a tunnel.
- **Hold on rock**: bore. A short tap on rock is a bite you can see, not a
  silent no-op and not a launch.
- Browser key-repeat is not a movement clock. The drill clock is.

This is not hitch work. If frames still hitch after cadence is honest, that is
`PQ-129`.

---

## 6. Type, colour, motion

Grammar law, applied here:

- Nothing under 12 px. The live inspector kickers and strata swatch labels that
  sit at 8.5–11 px are defects, not style.
- Colour by meaning: `--sf-you` for the rover / a gain, `--sf-foe` for gas and
  hull damage, `--sf-goal` for a vein you can take or a lock you can lift,
  `--sf-calm` for chrome, `--sf-paper` for words. Cyan only as the material-lane
  meaning already assigned in the console brief.
- Motion only with a named variable: rover step, bore progress, survey pulse,
  conveyor flow. No idle fog on the board.

---

## 7. Out of scope

New machines, formations, thermal, signature, cluster/station assembly, and any
rewrite of the contact-ring **sim**. Presentation of the game that already
exists.

---

## 8. Done

The screen is done when the silhouette test passes, the STAGE is the majority,
a surveyed vein and an unsurveyed cell are distinct at play size, the rover is
findable, tap moves one cell, and the context bay is readable with the text
removed. Capture at 1920×1080 and 1280×720, default and reduced-motion.
