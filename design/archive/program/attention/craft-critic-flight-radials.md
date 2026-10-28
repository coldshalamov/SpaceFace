# Craft critic — flight radial surfaces

Independent pixel review against the ORRERY bar: consistent, high-detail, creative, interactive,
non-generic — "clean, expensive, a cockpit from the future", never recognisable as CSS. Palette law:
warm bone at rest, one amber Hand on the current choice, ice only for data in motion, red only for
threat.

Evidence (fresh shots, this review): `.devshots/ui-bench/critic/`
`comms-radial-1920.png`, `comms-radial-1280.png`, `wingman-radial-1920.png`,
`wingman-radial-1280.png`, `orrery-flight-1920.png`, `orrery-flight-1280.png` (+ `_*crop*` zooms).
Surfaces: `src/ui/commsRadial.js`, `src/ui/orrery/wingmanLayouts.js`,
`src/ui/orrery/flight-radialsLayouts.js`.

## Score table — 0–10 per axis

| Surface | Viewport | Hierarchy | Readability | State clarity | ORRERY fit | Polish | Verdict |
|---|---|---|---|---|---|---|---|
| comms-radial | 1920x1080 | 8 | 7 | 8 | 7 | 6 | **NOT PASSED** |
| comms-radial | 1280x720 | 8 | 6 | 8 | 7 | 6 | **NOT PASSED** |
| wingman-radial | 1920x1080 | 9 | 7 | 8 | 9 | 7 | **PASS** |
| wingman-radial | 1280x720 | 9 | 8 | 8 | 9 | 7 | **PASS** |
| orrery-flight | 1920x1080 | 9 | 8 | 8 | 9 | 8 | **PASS** |
| orrery-flight | 1280x720 | 8 | 7 | 8 | 9 | 8 | **PASS** |

Verdict rule: PASS = mean ≥8 and every axis ≥7.

## Surface notes

**wingman-radial** — the strongest surface. A true command dial: bezel tick ring, four wedge
sectors with midline bearing pips, amber north index, hub readout "ALL WINGS / 2 CRAFT / TAB".
The Hand is unambiguous: ATTACK TARGET carries amber wedge fill, amber border arc, amber numeral
1, amber icon. Bone elsewhere. Loses points only for the tell-chip bleed (finding 1) and two
ambiguous glyphs (findings 6, 7). At 720 it scales cleanly, stays centered, no collisions.

**orrery-flight** — the HUD composition is genuinely "cockpit from the future": ship-silhouette
integrity dial with concentric hull/shield/armor arcs, leader-line connectors (PAYLOAD → LINE
SPACE is amber-current), ice scope-sweep radar with curved "RANGE 4.0K WU" bezel type, compass
tape, amber diamond waypoint "4.1K WU ETA 38S", red "RAIDER · 2.1K" edge chip. Palette
discipline is the best in the set. Nits: engraved ring microtext is illegible (decorative, so
harmless), notification bullets are plain hollow circles, and at 720 the radar takes ~28% of
width while the speed label compresses to "73 WU/S".

**comms-radial** — real strengths: the hail deck's curved selector spine with three bearing pips
(amber on ROUTE), the ice oscilloscope waveform under "FREQ 3.90K", floating-type RADIO block,
and the right contact rail whose amber spine segment + dimmed "STATUS UNAVAILABLE" row read as
telemetry, not table rows. But it carries the two worst defects: the FLYBY tell bleeds through
the deck, and the deck's outer silhouette is a rounded-corner dark slab — the most card-like
shape in the set. The contact rail also degrades at 720 (finding 4).

## Findings

1. **Doctrine tell chip bleeds through translucent radial fills — both radials, both viewports.**
   The "× FLYBY — Break the beam" tell (`src/ui/hud.js` ~2678+, `sf-tell--FLYBY`) renders
   *behind* the open radials and ghosts through: comms deck right of the ROUTE row at 1920
   (clearly legible dark-red "× FLYBY / Break the…" through the panel fill; still visible as
   "…ak the beam" at 720) and through the SCREEN wedge at 1920 (faint "eam" between the SCREEN
   label and its numeral 2 — see `_crop-ghost4.png`/`_crop-ghost3.png`). The fills are dark but
   not opaque. Either suppress world/tell chips while a radial is open, or raise the scrim/fill
   opacity so nothing behind is readable. This is the single largest "not expensive" tell on
   the screens.
2. **Hail deck outer silhouette reads as a CSS card.** Rounded-corner dark translucent slab over
   a busy orange wreck field — the instrument language (spine arc, pips, waveform, floating
   type) all lives *inside* a shape that is still a card. Chamfer or faceted bezel, etched
   edge-light, or letting sections float on the spine without a bounding slab would bring it in
   line with the radar and gauge faces.
3. **Contact-rail stat glyphs read as tofu.** The "▱▱▱" three hollow-square glyph cluster before
   "89 ▸ 49" / "152 ▸ 2" / "450 ▸ 18" reads as missing-glyph boxes at both viewports
   (`_crop-contacts2.png`, `_crop-contacts-1280.png`). Replace with drawn pips/segments or a
   labelled datum.
4. **Contact rail overflows at 720.** "Relief-Freighter Choir-/Tender" hyphen-wraps mid-name and
   the second line crowds the ALLY tag at the extreme right edge; "CRADLE" and "NEUTRAL" on the
   FIELD COIL row kern together; ALLY/NEUTRAL sit ~4px from the right screen edge. Give the rail
   a right safe-margin and ellipsize/display-name shorten rather than wrap.
5. **Hail deck nearly touches the ability rail at 720.** ~15px gutter between the deck's left
   margin and the ability column, and the translucent fill creeps over the tail of "LINE SPACE"
   ("…PACE" visible inside the panel's left margin, `_crop-hail-1280.png`). Dock the deck clear
   of the column or pull the column's connector lines under the deck.
6. **Unexplained second glyph on ATTACK TARGET wedge.** A dim hollow octagon sits beside the
   amber target reticle inside the selected wedge (`_crop-wingfan-1920.png`) — no legible
   state meaning. Remove it or give it a readable function.
7. **Ambiguous wedge iconography.** REGROUP's diagonal double-arrow reads as a window-resize
   cursor; HEAVE TO's circled glyph reads as a pause symbol; ROUTE's zigzag reads as lightning.
   Replace with converge/heave-specific marks consistent with `equipmentGlyphs.js`.
8. **"● TAKING FIRE" prompt dot reads amber, not red** (comms shots, top-center). Palette law
   reserves red for threat — TAKING FIRE is the one label on these surfaces that arguably *is*
   threat. Either recolor to threat red or demote to bone if it's informational.
9. **Hub divider "●●" between ALL WINGS and 2 CRAFT** is an unexplained ornament where the rest
   of the HUD uses "·" as the datum separator — unify.

## What already meets the bar

- Radar scope: bezel ticks, ice sweep beam, curved range type, amber contact leader — the
  strongest single instrument in the frame.
- Ship-integrity dial: silhouette-as-dial-face with arc gauges and leader lines; the amber
  connector to the current key is exactly "the Hand".
- Palette discipline on orrery-flight: ice strictly on motion data (speed, sweep, deltas),
  amber strictly on the current choice/objective, red strictly on the raider. Exemplary.
- Wingman dial: bezel, wedges, bearing pips, numeral-keyed sectors — radial commands as an
  instrument, not a menu.
