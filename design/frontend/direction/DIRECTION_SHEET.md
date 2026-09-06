<!-- LIFETIME: DURABLE -->
# The direction sheet — Cinematic Minimal, tuned for SpaceFace

**Status:** DECIDED 2026-09-06 under the owner's delegation (receipt:
[`PQ-187-01-REPORT.md`](../../program/roadmap/receipts/PQ-187-01-REPORT.md)). This sheet is the
aesthetic authority for every player-facing screen and the HUD. `design/FRONTEND_DIRECTION.md` §13
says why; `CANONICAL_BUILD_MAP.md` §20.14 is the task series. A frame is right when it matches this
sheet; a reviewer checks a frame with §9. Nobody is asked to choose between options — the sheet
decides, and the owner's veto is exercised by looking at the game.

---

## 1. The idea in one paragraph

**The world is the interface.** SpaceFace already owns the best picture a space game can have: a
lit hull in a hangar rig, a deep-field sky, a station with traffic, a chart drawn as a star system.
Every screen is a shot of that world with a few enormous words and one column of quiet data laid
over it. Nothing is boxed. There are no panels, cards, plates, chips or borders — grouping is done
by distance and by hairline rules, the way a film title card or a museum wall does it. One display
face at hero size carries the identity; one text face carries everything else; one signal colour
marks the single thing you can act on. The frame changes temperature with the game's state — warm
when docked, cold when wanted, white-hot in the Crucible — so you know before you read. Motion is a
cut with a short settle; sound is low and tonal and rare. It looks like a film about a working
frontier, not like a dashboard.

## 2. What it looks like, screen by screen

Each line says what fills the frame, what the one huge thing is, where the words hang, and what
colour the frame goes. These pictures are the targets the packets build toward; a builder copies
the line for their screen into the receipt and the reviewer checks the capture against it.

### The shell

- **Title.** The starter hull in the hangar rig fills the right two-thirds of the frame, lit warm
  key / cool fill against the sky, turning very slowly. Top-left, the game's name in the display
  face at the largest size on the scale. Down the left edge, five words — Continue, New Game, Load,
  Settings, Quit — at menu size; the focused word is full-strength bone with a short gold rule
  under it, the rest at 62 %. Bottom-left, the version in fine print. No plate, no logo lockup, no
  buttons. The menu arrives after the hull: the words stamp in one after another over a third of a
  second.
- **New game.** The sky. Three hulls side by side, each lit in its rig, each with its name at
  section size and one sentence under it saying how it plays. The focused hull is at full
  strength; the others dim to 62 %. One word at the bottom: Launch. That is the whole screen.
- **Load.** Saves as portraits: your hull as it is in that save, scars and all, with the ship's
  name huge, the sector and the date in fine print, the credits as a hero number. Six across at
  1920, the focused one full-strength. No timestamps list.
- **Settings.** The world stays behind at 25 % scrim. A left column of section words (Display,
  Controls, Audio, Accessibility, Game); the chosen section's controls to the right as rows with
  hairlines, each row a label and its value; toggles are two words with the live one at full
  strength. Nothing is a slider unless it is a number; numbers are tabular.
- **Pause.** The world held, not hidden: the frozen game at 0 % scrim, one word — Paused — at
  screen-title size top-left, and the four resume/settings/photo/quit words down the left edge. The
  HUD dims to 38 % rather than disappearing.
- **Game over.** A still. The wreck or the last frame, cooled with the wanted-blue scrim. Two
  lines: what killed you, at screen-title size; the telegraph you missed, at emphasis size. What
  you keep, as three numbers. Retry, Load, Title as three words.
- **Photo mode.** Everything gone except a fine-print hint at the bottom edge that fades after two
  seconds.

### Flight

- **The HUD.** The sky and the ship are the picture; the instruments sit at the frame's edges and
  never in the middle. Bottom-left: speed as a hero number, heat as a thin bone bar beneath it,
  the ship's mode in one word. Bottom-right: the Power Rail as a row of short words with the live
  one at full strength. Top-right: the target's name at emphasis size with its distance as a
  tabular number, nothing else until you lock. The comms tape is one line at the top edge in
  62 % bone. Everything is 62 % bone until it matters, then 100 %. The attention rules in
  `design/HUD_FLIGHT_ATTENTION.md` are floor: quiet instruments, one receipts channel, no keys on
  the windshield.
- **First undock.** The station shell peels away with a cut and the HUD arrives element by element
  as the systems come online — speed, then heat, then the rail, then the target — each with its own
  low tone, over about one second.
- **Going wanted.** The whole frame cools: the scrim turns to the wanted blue, bone text goes a
  degree whiter, and the signal colour turns red everywhere at once, with one sustained cold tone.
  The Footprint and the HUD change together. Nothing flashes. It stays that way until you are clear.

### The station

- **Docking.** Arrival, not a menu: the berth with your hull in it, ambient work in the background,
  the station's name at hero size, one line of local news in emphasis size, and the six instruments
  as six words in a row along the bottom edge. The frame warms to the docked scrim. A low swell.
- **Station home (Orbital Command).** The same berth shot, resting. The six words are the
  navigation; the focused word is full strength. Credits as a tabular number top-right. No grid
  of tiles.
- **Market.** The berth darkened to the docked scrim. Left half: the commodity table in the dense
  register — name, buy, sell, stock — twelve rows visible with hairlines, the selected row marked
  by a gold rule on its left edge. Right half: the selected commodity's name at screen-title size
  and its price at hero size, one sentence of why the price is what it is, and Buy and Sell as two
  words with a quantity beside them. Three enormous numbers, a sentence, and a table.
- **Ledger.** Your money as one hero number; beneath it the last twelve entries as hairline rows,
  incomes in the good green and costs in the bad red as text colour only; the page controls as
  two words.
- **Contracts.** Each contract is a row: the job in one line, the payout as a tabular number, the
  faction's crest small at the row's left. The selected one opens on the right half: the payout at
  hero size, the route in a sentence, the risk in a sentence, Accept as one word.
- **Factions.** The faction's crest at its largest size on the right, its name at screen-title
  size, your standing as one word and one number; the other factions as a column of names on the
  left, the focused one full strength.
- **Industry.** The station's work as three or four hero numbers with a word each; the detail as
  hairline rows.
- **The bar.** The room, lit warm, at 25 % scrim. Rumours as a column of sentences; the chosen one
  at emphasis size with its source's name and the two words it offers.
- **Shipworks.** The hull at full bleed in the rig; the parts as a column of words on the left;
  the selected part's name at screen-title size, its effect as one number that changes on the
  hull's bands, Install as one word. The hull turns to show the socket.

### The instruments

- **THE SHIP.** The hull at full bleed, orbitable. Labels pinned to the hull by hairline leaders.
  The four bands — handling, power, condition, capability — as four hero numbers along the bottom
  edge with a word each; the selected band explains itself in one sentence. Nothing boxed.
- **THE FOOTPRINT.** The consequence graph as the picture, drawn in bone hairlines on the sky; the
  node you trace at full strength, the rest at 38 %; your heat as a hero number; the frame goes
  wanted-cold when you are wanted.
- **THE RANGE.** The drill box on the sky; the teaching voice as one sentence at emphasis size;
  the rung's name at screen-title size; the score as a tabular number. Four rungs, four words.
- **The chart.** The sector drawn as a star system at full bleed; the selected place's name at
  screen-title size in the corner with one sentence and the route's time; traffic, heat and
  contract pins as hairline marks on the map, never as a legend panel. The inspector is one column
  of words and numbers, not tabs.

### The modes

- **Crucible door.** The arena at 0 % scrim; the signal colour is white here. Seed, ruleset, arena
  and hull as four words with their values, changeable in place; the daily seed named; Enter as
  one word. A stranger reads it in five seconds.
- **Crucible draft.** Cards are one line and one glyph each, three across, on the sky; the focused
  card full strength.
- **Crucible results.** The run as a story: the best chain as a hero number, the moments as a
  column of sentences, the cause of death and its telegraph as two lines, the build code as fine
  print, Retry as one word. A still, not a form.
- **Asteroid Works.** Keeps its own accepted warm law (`design/ASTEROID_WORKS_DESIGN_LAW.md`): the
  same two faces, its own amber signal, its own numerals. This sheet's composition, motion and
  never-list apply; nothing else changes there.

### The reading screens

- **Missions log.** One column of missions as sentences with hairlines; the focused mission opens
  on the right with its name at screen-title size, its next step as one sentence, its reward as a
  number. The sky behind at 25 %.
- **Codex.** A left column of entry names; the entry as a readable measure of text at body size
  with a plate image where one exists; the entry title at screen-title size. A book, not a wiki.
- **Help.** The controls as hairline rows of action and key; the current profile named; nothing
  else.
- **Tech tree.** The lanes drawn as hairline paths on the sky; nodes as words; the selected node's
  name at screen-title size with its cost as a number and Unlock as a word.

## 3. Faces and the scale

| Role | Face | Setting |
|---|---|---|
| Display (names, hero numbers, screen titles) | **Bricolage Grotesque**, variable, weight 800, optical size 96, width 100 | letter-spacing −0.03 em, line-height 0.9, sentence case — never all-caps as decoration |
| Text (everything else) | **Instrument Sans**, variable | 400 for body, 500 for the focused word; line-height 1.4; measure ≤ 64 ch |
| Data numerals | Instrument Sans with `font-variant-numeric: tabular-nums` (present in the vendored file) | right-aligned in tables |
| Hero numerals | Bricolage Grotesque, tabular | the one number the screen is about |

No monospace face on any player surface except inside Asteroid Works, where the accepted law
licenses it. Saira SemiCondensed and the IBM Plex trio retire as screens migrate; `PQ-184`
deletes the files last. The variable Bricolage is vendored under OFL in `PQ-187.02`; the static 600
in the repo today is not the display face.

**The scale** (px at 1920 wide; ×0.75 at 1280 with a 12 px floor; ×1.25 at 2560):

| Step | px | Used for |
|---|---|---|
| fine print | 12 | version, build hash, column headers, hints |
| data | 14 | table cells, ledger rows |
| body | 16 | sentences, codex text, settings labels |
| emphasis | 20 | the telegraph line, the target's name, the teaching voice |
| subhead | 28 | empty-state sentences, section leads |
| menu | 40 | menu words, the six instrument words, band words |
| hero number | 56 | speed, heat, credits on the HUD and ledger |
| screen title | 80 | the selected thing's name |
| hero | 112 | the station's name, the selected commodity's price |
| name | 160 | the game's name on the title |

Every screen has at least one element at 56 px or larger. If a screen has nothing worth setting
that large, the screen is not finished.

## 4. Colour and temperature

| Token | Value | Role |
|---|---|---|
| bone | `#EAE6DF` | all text and rules; at 100 % (focused / primary), 62 % (resting), 38 % (tertiary) |
| hairline | bone at 14 % | every rule and leader line, 1 px |
| ink | `#0A0B0D` | the only painted background, used where no scene exists (loading, fallback) |
| signal | `#F2B950` gold | the one thing you can act on now; the selected row's rule; the hero number when it is a decision |
| wanted | `#FF4D3D` | replaces signal everywhere while wanted; the cause-of-death line |
| good / bad | `#9BD8A0` / `#FF7A6B` | numerals only, as text colour — never a chip, never a fill |

**Temperature states** — the whole frame changes, not a badge:

| State | Scrim over the scene | Signal | Text |
|---|---|---|---|
| flight | none | gold | bone |
| menus over the sky | `#07090F` at 0–25 % | gold | bone |
| docked | `#1A1410` at 45 % on dense screens, 25 % on the berth | gold | bone |
| wanted | `#06080F` at 35 % | red | `#E4E8F0` (a degree cooler) |
| Crucible | none | white `#FFFFFF` | bone |
| Asteroid Works | its own law | its amber | its own |

No other colours exist. A faction is identified by its crest and its name, never by a tint.

## 5. Composition

- **Every screen is a shot.** The scene object anchors it: the hull, the berth, the chart, the
  arena. If a screen has no scene behind it yet, that is the packet's first job, not a reason to
  paint a background.
- **The interface hangs from one edge.** Menus and lists hang from the left; the HUD from the
  bottom and top edges; screen titles sit top-left. The middle of the frame belongs to the world.
- **Margins** are 5 % of the width (96 px at 1920). Text measure never exceeds 64 characters.
- **No boxes.** No panels, cards, plates, borders, chips, badges, pills or filled buttons. Groups
  are made by distance and hairlines. A list is rows with hairlines.
- **Focus is strength, not a frame.** The focused item is at 100 %, its siblings at 62 %, the rest
  at 38 %. A gold rule marks the actionable one. Nothing gets an outline except the accessibility
  focus ring, which is a 2 px bone rule at 100 % and always visible on keyboard focus.
- **Buttons are words.** Primary: the word in signal colour, a 2 px signal rule beneath it on
  focus. Secondary: bone at 62 %, 100 % on focus. Destructive: the wanted red word. Inputs: a
  hairline underline. Toggles: two words, the live one at 100 % with the rule.
- **Empty state:** one sentence at subhead size at 62 %. No illustration, no icon, no "nothing
  here yet" card.
- **Icons** are the 24 px stroke set, used only where a glyph is faster than a word (row glyphs,
  the HUD). Never as decoration, never in menus. The faction crests are the one large iconography,
  at 96–240 px.

## 6. The dense register

Cinematic Minimal fails on the market and the ledger unless density is designed. This is the
design; a dense screen that departs from it is wrong.

- Row height 40 px at 1920 (32 at 1280). Twelve rows visible before scrolling.
- Row text at data size, Instrument Sans 400, 62 %; the row's name at 100 %. Numbers at emphasis
  size, tabular, right-aligned, 100 %.
- Column headers at fine-print size, 38 %, uppercase with +0.08 em tracking — the only place
  tracking is permitted.
- The selected row: a 2 px gold rule on its left edge, its name at 500 weight; its key number is
  repeated at hero size on the other half of the screen with the sentence that explains it.
- The table occupies at most half the frame width so the world stays in the shot.
- Sorting is a header click; the sorted header goes to 100 %. Filters are words in a row above
  the table, the live one at 100 % with the rule.

## 7. Motion

- **Screen change:** a cut, then a settle — the new screen's words come in from the edge they hang
  from by 12 px with opacity 0→1 over 120–160 ms, easing `cubic-bezier(0.2, 0, 0, 1)` (slow-fast).
  Nothing crossfades.
- **Hero type stamps in:** opacity 0→1 with a 4 px settle, whole words at once, never letter by
  letter.
- **Focus change:** 80 ms strength change. Instant under reduced motion.
- **Temperature change:** 400 ms for the scrim and signal colour on docking and going wanted, the
  only transitions longer than 160 ms.
- **Every motion names its state variable.** No motion runs without a state that started it; none
  loops; none is longer than the numbers above. Reduced motion: every transition is a plain cut,
  temperature changes included.
- Never: pulsing, breathing, scanlines, glitch, typewriter text, parallax on menus, bounce.

## 8. Sound

At most eight samples, low and tonal, routed through the existing `audio:cue` bus:

| Cue | Character | Length |
|---|---|---|
| open | a soft low thud | ≤ 250 ms |
| close | the same, lower | ≤ 250 ms |
| move (focus) | a barely-there tick | ≤ 60 ms |
| confirm | one clear tone | ≤ 300 ms |
| deny | a dull two-note fall | ≤ 300 ms |
| dock | a low swell | ≤ 900 ms |
| undock | the swell reversed, faster | ≤ 600 ms |
| wanted | one sustained cold tone | ≤ 1.2 s |

No beeps, no chirps, no sci-fi computer voice. Silence is the default; a screen with no state
change makes no sound.

## 9. The review — how a frame is judged

A reviewer (memoryless, sees only the capture and this sheet) answers these for the screen's line in
§2 and the rules in §3–§8. Any "no" fails the frame. One exception: a capture in which the world object
the sheet puts in the shot (hull, berth, chart, arena) is missing while the DOM is right is a **capture
defect** — headless captures of THE SHIP today show no hull — and is returned to the capture seam, never
passed by painting a background and never failed as a frame.

1. Is the world in the shot — a hull, a berth, a chart, an arena, or the sky — and not a painted
   background?
2. Is there one element at 56 px or larger, and is it the thing the screen is about?
3. Do the words hang from one edge, leaving the middle to the world?
4. Are there zero boxes, panels, cards, plates, chips, badges, pills, borders or filled buttons?
5. Is there exactly one signal colour in view, on the actionable thing?
6. Is the frame's temperature the one §4 gives for this state?
7. Are the faces Bricolage (display) and Instrument Sans (text), with tabular numerals in data?
8. Is any text below 12 px, any measure over 64 characters, any all-caps beyond column headers?
9. Is there any glow, gradient, glass, blur, neon, cyan, scanline, hexagon, wireframe or cockpit
   framing?
10. For a dense screen: does it follow §6 — row height, twelve rows, half-width, the selected row's
    number repeated at hero size?
11. For a clip: is every motion a cut plus a settle within the §7 numbers, and does it stop?

## 10. What survives and what retires

**Survives (the bones):** the screen manager and screen memory; the three-anchor HUD layout, the
Power Rail and its slot-claim contract, the receipts channel; the station OS and its six
instruments; the instruments' centerpieces and verbs (orbit the hull, trace the graph, fly the
box, push the chart); the 24 px stroke icon set and the fourteen crests; the hangar-rig hull
render; the chart's star-system drawing; the four data states and entity links; the accessibility
floor (12 px, contrast, reduced motion, forced colours, keyboard and pad reachability); the
performance floor (≤ 2 ms UI frame, ≤ 1,500 DOM nodes).

**Retires (the skin), screen by screen as each migrates:** the menu plate; every panel, card and
bordered group; chips and badges as decoration; Saira SemiCondensed and the IBM Plex trio;
monospace as a look; the cyan-adjacent accents; tracked-out uppercase labels beyond column
headers; the uniform fade between screens; the filled and bordered buttons; the tile grids.

## 11. The never-list

Glow. Gradient fills. Glass or blur panels. Neon. Cyan. Wireframe. Scanlines. Hexagons. Chamfered
corners. Cockpit, visor or windshield framing. Tracked-out caps as decoration. Monospace as a look.
Boxes around groups. Chips, badges, pills as decoration. Icon-everything menus. More than one
signal colour. Tints per faction. Illustrated empty states. Uniform fades. Looping or pulsing
motion. Typewriter text. Sci-fi beeps. A second display face. A "variant" of this direction.
