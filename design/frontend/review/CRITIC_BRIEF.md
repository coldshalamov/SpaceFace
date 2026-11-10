# ORRERY station-tab critic brief (shared by every critic this session)

> **CURRENT REVIEW DIRECTION:** Read [`../STATION_STANDARD.md`](../STATION_STANDARD.md) first.
> The owner judged ORRERY-approved screens "sloppy": no borders, monochrome buttons, arcs for
> everything, tiny tracked caps, clipped and overlapping text, money that does not look like money.
> **Do not score ORRERY fidelity or require a fixed numeric rating.** Use the Standard's checklist as
> prompts, not automatic pass/fail; explain how the screen works for its purpose, including control use,
> accessibility, readability, and polish. Familiar patterns are not defects by themselves.

Review the assigned SpaceFace screen and states for concrete effects on the player. Unless the
task includes implementation, report findings without editing product files. Stills establish
appearance; control and player-route claims need their relevant direct checks.

## Read first
- `../STATION_STANDARD.md` and the current amendment in `../ORRERY.md`, then only the assigned surface's intent.
- The relevant stills or live states. Crop or measure pixels when that can resolve a specific
  clipping, contrast or visibility question; crops and measurements are not a fixed report quota.

## Visual context
- Preserve SpaceFace's warm bone, amber action, cool data and red threat language where it helps
  the player. Panels, borders, tables, familiar controls and other structures are valid when they
  make the decision clearer. Avoid decorative CSS imitations of physical materials.
- **Owner ruling 2026-10-04 (the map and the minimap):** the Chart's GROUND and the radar's contacts may
  carry colour and glow. Each holder's space on the chart wears its own hue (`chartWorld.js` DOMINION,
  re-tinted so none sits on the Hand's amber or on threat red), borders and tokens glow, and the radar's
  contact classes carry their stance hues with a halo (`tacticalMapGrammar.js` TACTICAL_MAP_PALETTE).
  Do NOT score that as a palette violation. The two lines that hold: amber stays the Hand/route, red stays
  threat. Structural rings, rails, words and keys on the chart keep the bone rest light.
- Ruling: where the hero instrument has an arm (Missions route beam, Factions orbit arm, Ledger tape
  Hand, Bar contact arm) that arm IS the Hand and the rail's chosen row is bone.
- Use readable type and aligned figures. Judge selection, focus and disabled states by whether
  players can identify and use them, rather than requiring a particular rail or numeral recipe.

## Bench artefacts (do not score these)
- The toast at the foot ("TRADE CLEARED  BOUGHT 0U CARGO  -0 cr") is the bench's fake event.
- "CYCLE 0001" everywhere: the bench sim clock is 0.
- Motion is frozen (html.sf-reduce-motion) so nothing breathes/decrypts in a still.
- The station tab rail's needle at the very foot (under the tab words) is bone by ruling.
- A hold-state shot is frozen at 46% of the hold ring on purpose.

## Assessment
Consider organization, hierarchy, legibility, accessibility, polish and interaction clarity.
Give a concise qualitative assessment. Name material strengths and issues with concrete examples; there
is no numeric score or threshold for acceptance. Do not mistake a stylistic preference for a player-facing
defect.

## Report
1. State whether the assigned outcome works, and any material limits of the check.
2. List actionable findings by consequence: identify the element, the player-visible problem and
   the smallest useful fix. Include coordinates or measurements only when they explain the issue.
3. Resolve prior material findings if this is a follow-up; do not repeat settled reviews for confidence.
4. Keep optional design ideas separate from defects and acceptance requirements.

## OWNER CRITERIA (historical; superseded 2026-10-30)
(a) ~~"avoid super thin wireframe looks and generic elements"~~ — retired as written: it was applied as a ban on
    borders, buttons and tables. Keep the *intent* (no hairline-only decoration that carries no data), but a
    1px-bordered panel, a real table or a real button is **correct**, not generic.
(b) ~~"every screen a mini app with a distinct signature interaction"~~ — retired as a pass gate. A signature
    interaction is welcome but never excuses a clipped label, an overlap or an unreadable figure.
Do not require sections 7(a)/(b) or a checklist pass in new reports; use relevant checklist prompts to
identify specific player-facing effects.

## Historical visibility observation (2026-09-26)
An earlier composition measured a .085-alpha band at about 1.16:1 against its background, making
the band difficult to see. That is a diagnostic example, not a universal weight, luminance or shape
threshold. Assess the information and controls on their actual composited background.
