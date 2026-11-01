<!-- LIFETIME: ACTIVE_PROGRAM -->
# Station Standard — organised, dense, legible (owner direction 2026-10-30)

**Status: current visual guidance where older ORRERY rules conflict.** The owner looked at the live Bar and
Market and called them sloppy: no borders, monochrome buttons, arcs everywhere, tiny tracked
low-resolution caps, truncated and lopsided text, and a credits figure that did not look like money.
Those were not accidents. They were the *output of ORRERY's absolutes* ("no borders, ever", "a quantity
is an arc", "never pills", 12 px tracked caps) applied faithfully, then graded by critics who scored
*fidelity to ORRERY*. This page replaces those absolutes with guidance aimed at player clarity and polish.
Its patterns and measurements are starting points, not a mandatory component recipe or pass quota. The
screen's purpose, readable content, usable controls, and accessibility take priority; adapt or depart
from a pattern when that produces a better player experience, and explain the choice when reviewing it.

The goal in one sentence: **a ship's console that is organised like a good terminal and lit like a
good game — structure first, atmosphere second.** Think trading terminal, flight-sim MFD, Elite /
EVE market windows, a ledger. Not a poster.

## 1. Applying the guidance

1. Fix **structure** before style: a shared grid, aligned columns, no clipping, no overlap.
2. Start with the **primitives** below when they suit the screen. Adapt or add a treatment when its job,
   controls, accessibility, or content density calls for it.
3. Inspect the real screen at the viewport(s) relevant to the change and use §7 as optional review
   prompts. Do not require unrelated viewport captures to establish a visual change.
4. Do not grade against ORRERY fidelity or a fixed checklist; describe concrete effects on the player.

## 2. Type — useful starting points

These type roles and ranges describe one workable starting palette. Choose face, size, weight, case,
and spacing for the content, viewport, and readability needs.

| Role | Face | Size | Use |
|---|---|---|---|
| **Title** | Archivo, `wdth` 100–125, 700–800 | 24–46 px | Screen/station name, one hero word per screen. Sentence or title case; caps only for one word. |
| **UI text** | Instrument Sans 400/500/600 | **13–16 px** (labels 13, body 14–15) | Labels, rows, sentences, buttons, tab names. Labels are small-caps-style *at most*: `letter-spacing ≤ .08em`. |
| **Figures** | `--dp-face-num` = Spline Sans Mono 500, tabular | 14–28 px (hero ≤ 36) | Every money amount, price, quantity, percentage, coordinate. Right-aligned, fixed-width columns. |

Examples:
- Keep type at or above the repository's `check-type-floor.mjs` minimum, and inspect actual readability
  on the affected surface. The 13 px label size is a useful target, not a separate universal floor.
- Long, widely tracked all-caps labels can be hard to scan; use case and tracking that suit the text.
- Mono can help align figures or codes; other readable faces can work for labels and data.
- Format money and quantities with clear units and grouping. `CR 18,400` and tabular figures are
  examples; avoid presentation that makes a value's magnitude or purpose unclear.

## 3. Surfaces — organize the content

- Hairlines and borders can separate related information; tune weight and contrast for the actual
  background and viewing size. Avoid CSS that imitates physical materials (bevels, brushed metal,
  screws, LED lenses, glossy material effects).
- A tinted panel, header strip, and spacing grid are useful ways to group dense content. Treat the
  listed token colors, corner radius, padding, and row heights as examples; use the layout that best
  supports the screen.
- Panels over the world get a **scrim** so text is ≥ 4.5:1; never let the 3D scene show through text.
- Avoid stacking effects that obscure content or make the grouping harder to read.
- No `box-shadow` glows, no `backdrop-filter` in flight.

## 4. Data — choose an appropriate representation

- When players need to compare fields across items, a table can help: align columns, label units,
  and make focus and selection apparent. The colors, row height, and hover treatment below are examples.
- Never hand-position cells with absolute offsets. Use `display:grid; grid-template-columns:` once per
  table and reuse it for header and rows.
- For quantities, a bar and figure, stepper, arc, dial, or plain value can fit depending on precision,
  interaction, and available space. For choices, use a list, ring, menu, or another control that makes
  the options and selection clear.

## 5. Buttons — states and hierarchy

| Kind | Look | When |
|---|---|---|
| **Primary** | Amber fill `#f2b950`, dark ink, modest radius and clear label (the values shown are a starting point) | The main commit action when the screen benefits from one. Use the hierarchy that makes multiple or alternate actions clear when needed. |
| **Secondary** | Transparent, 1px hairline `.4` alpha, bone label | Sell, Max, Repair, Insure, Rearm. |
| **Tertiary** | Text only, underline on hover | Dismiss, Quote breakdown, Help. |
| **Hover/focus** | Border → bone `.8`, fill `.08`; focus ring 2px amber outline, 2px offset | all |
| **Disabled** | `opacity .45`, no hover, `cursor:not-allowed`, explains why in `title`/tooltip | all |

`› WORD PRICE` text links are tertiary buttons at best; they must still look pressable (hover state,
min target 28 px high).

## 6. Layout and text integrity

- The existing station shell can provide consistent placement for its shared head, body, and foot.
  Preserve established navigation and controls when changing a tab; use positioning that keeps the
  content distinct and readable.
- **Never truncate a name or a status with an ellipsis.** Wrap to two lines, or move the secondary tag
  (role, "New arrival") to its own line under the name. Ellipsis is allowed only on a free-text preview
  that has a full-text tooltip.
- **Keep content and controls from colliding or clipping.** Captions, barks, and toasts need enough
  room to remain readable. Bench overlap/cut-off reports can identify issues; inspect the affected
  screen to determine their actual player impact.
- Low-contrast text is a defect: secondary text ≥ 4.5:1 on its real composited ground. "Faint" is not a
  style (`FIND A SERVICE`, station-wire lines were < 2:1).
- Amber can emphasize a selected or primary action; red can mark threat or loss; cool phosphor can
  distinguish live readings. Apply color semantics consistently, with other accents where the screen
  needs them.

## 7. Review prompts for concrete defects

Use these as diagnostic questions, not an automatic pass/fail score. A "yes" calls for a specific look at
the affected element: determine whether it harms comprehension, control use, accessibility, or polish,
then describe the smallest useful correction. A deliberate, player-serving exception is acceptable.

1. Are labels and figures easy to read at the size and viewport where they appear?
2. Is any name, status or tag clipped with `…`, or hidden by overflow?
3. Does anything overlap anything else, or sit on a busy background without a scrim?
4. Is a quantity represented in a way that makes its value and interaction clear?
5. Are actions recognizable and their relative importance clear?
6. Are related fields aligned well enough to support comparison?
7. Are two things on screen competing as "the hero number"?
8. Are figures proportional-width, unaligned, or missing a unit/header?
9. Is grouping clear without unnecessary lines, panels, or other decoration?
10. Is secondary text under 4.5:1?
11. Would a player ask "what is that for?" about any decorative element (ticks, spines, rings) that
    carries no data?

For decorative details, consider whether they help orientation, hierarchy, feedback, or atmosphere.
Remove or simplify them when they distract from the player's task.

## 8. Reference and review method

- Real interfaces such as Elite Dangerous / EVE Online market windows or flight-sim MFDs can provide
  useful references when the same information problem is present. Compare concrete organization and
  legibility questions rather than scoring resemblance.
- Choose viewports that exercise the changed layout and its relevant responsive breakpoints; 1440×900,
  1920×1080, and 1280×720 are useful reference sizes, not a per-change quota.
- Walk the controls (`node scripts/ui-bench.mjs --shot=<id> --walk`).
- If independent feedback would help, ask about the concrete player task, clarity, controls,
  accessibility, and polish. There is no required critic format, axis list, or numeric score.

## 9. What ORRERY still contributes (keep)

Warm bone ink, amber for a selected or primary action, red for threat, the 12 px machine floor,
produced art, reduced-motion/flash behavior, and the Chart and flight cluster/speed dial are useful
existing references. Preserve the shared `--dp-*` token root; use `--dp-face-num` where it suits the
content. These motifs do not impose a one-accent-per-screen or one-control layout.

## 10. Implementation status

`src/ui/orrery/stationStandard.js` (injected by `stationApp.js` after the older layout sheets, with
higher specificity) applies §2–§6 to the station head (purse, vitals), the Market, and the Bar. Other
tabs and screens migrate when touched; do **not** add new `!important` stacks in `*Layouts.js` for
these concerns — extend the standard sheet or, better, delete the superseded rule.
