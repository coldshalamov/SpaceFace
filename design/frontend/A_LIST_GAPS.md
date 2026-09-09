<!-- LIFETIME: DURABLE -->
# A-List Gaps

**Status:** the things a top-tier game's frontend needs that **neither the game nor the rest of these
documents currently accounts for.** Companion to [`ADDITIONS.md`](./ADDITIONS.md) — that file lists
*features to add*; this one lists *standards to meet*.

**Why separate:** a game reaches A-list not by having more screens but by having none that fall over.
Every item below is a way a screen fails that no per-screen spec would catch, because the failure
only appears in a condition the author was not thinking about — a long German string, an empty data
set, a 21:9 monitor, a player returning after three weeks.

Each item is marked **VERIFIED MISSING** (checked against the codebase) or **UNSPECIFIED** (may exist
ad hoc, but no policy governs it).

---

## Tier 1 — the four that will visibly break the build

### 1. Text expansion — **VERIFIED MISSING from every spec**

This game has a **live localization system** (`src/localization/catalogs/en-US.generated.js`) and a
pseudo-localization capture harness. Every UI screenshot in `.devshots/alpha/m6-localization-reachability/`
is pseudo-localized — that is why the text reads `[Ŝþàãçêéf Àãçéé]`. The harness exists precisely to
inflate strings and expose layout breakage.

**Not one of the six frontend documents mentions text expansion.** Meanwhile the specs are full of
fixed-width slots, tight chips, `white-space: nowrap` readouts, and single-line capability sentences.
German runs ~35 % longer than English; Russian and Finnish worse. Every one of those would break.

**The policy, binding from Phase 0:**
- **No fixed-width text container.** Widths are `min-width` + `max-width` with the text allowed to
  wrap or the container allowed to grow.
- **Design against +40 %.** If a label reads correctly at 140 % of its English length, it ships.
- **`nowrap` requires justification** and is allowed only on numerals and key caps, which do not
  translate.
- **Never build a sentence by concatenation.** `"You can tow a " + n + "t hauler"` is unlocalisable;
  the whole sentence must be one catalog entry with a placeholder.
- **Capability sentences and verb lines get a two-line budget**, not one.
- **Every capture set runs in pseudo-loc**, not just English. It is already wired — use it.

### 2. Empty, loading, error and denied states — **UNSPECIFIED**

Only `galaxyMap.js` currently expresses empty states, and its Economy tab **returning empty until you
have personally priced two stations** is the exact symptom: a screen that is correct-but-blank reads
as broken.

**Every pane must define four states, and they are design work, not fallbacks:**

| State | Rule |
|---|---|
| **EMPTY** | Never blank, never a shrug. Say *what would fill this* and *how to make that happen*, with the verb attached: "No contracts here. Nearest board: Ceres — plot route." The existing 8-tab inspector already does this with stated unavailability reasons; that is the standard. |
| **LOADING** | Bound to real work (grammar §5 SPOOL), never a fixed timer. Show the shape of what is coming — a skeleton of the real layout, not a spinner in a void. |
| **ERROR** | Say what failed, whether it is recoverable, and give one action. Never a raw exception, never silence. |
| **DENIED** | The player tried something not allowed. Say *why* and *what would make it allowed* — the same enumerated-phrase discipline as tier 2. "Cannot dock: outstanding bounty ≥ 5,000. Pay it here." |

**A screen with an undesigned empty state is not finished.** Add it to grammar §12.

### 3. Screen state memory — **VERIFIED MISSING**

`galaxyMap.js` does not persist its layer toggles, its selected commodity, its zoom level, or its
inspector tab. **Every open is a fresh open.** A player who works with two layers on must re-toggle
them every single time.

**The policy:** every instrument remembers, per save, the state the player last chose — active tab,
filters, sort order, layer set, zoom/focus, scroll position, selected entity. Restore it on open.
This is invisible when done and infuriating when absent, and it is one of the clearest differences
between a hobby UI and a shipped one.

**Exception:** anything that would be *dangerous* to restore (a pending destructive confirmation)
resets. State memory restores context, never in-flight actions.

### 4. Responsive strategy — **VERIFIED MISSING**

The UI layer has exactly **one** breakpoint: `@media (max-width: 900px), (max-height: 650px)`. There
is no strategy for ultrawide, for 4K, or for a handheld.

**The policy:**
- **Ultrawide (21:9+):** the HUD's anchors must *not* stretch to the physical edges — a player cannot
  read the far corners of a 21:9 display while flying. Clamp the HUD to a centred 16:9-ish safe box
  and let the world fill the rest. **This is a genuine improvement on ultrawide, not a limitation.**
- **4K / high-DPI:** everything scales by a single root scalar, already present as `--ui-scale`.
  Nothing is sized in raw device pixels.
- **Small / handheld:** the instruments are pausing full-screen surfaces, which is the *good* case for
  a small display. The Rail and the HUD need a reduced-density variant, not a different design.
- **Every capture runs at three sizes**, not one: 2560×1080, 1920×1080, 1280×720.

---

## Tier 2 — the skill-tree and map specifics the owner named

### 5. Skill-tree UI — what an A-list tree has that this plan does not

The plan converts nodes into capability sentences and folds the tree into THE SHIP. Correct, and not
sufficient. A deep tree also needs:

| Need | Why | Notes |
|---|---|---|
| **Search within the tree** | 29 nodes now, more later. "Where is the thing that lets me tow bigger?" must be answerable. | shares the global-find resolver (`ADDITIONS.md` §7) |
| **"What leads to this?"** | Click a locked node → the full prerequisite chain lights up, with total cost and *how far away it is*. | this is the single most-used interaction in every good tree |
| **A planned path / queue** | Mark a distant node as your goal. The route to it stays highlighted, and the HUD's next-unlock readout points at it. | turns a tree into a *plan*, which is what makes progression feel directed |
| **Preview before commit** | Hovering an unearned node ghosts its effect into the handling/power bands, exactly as fitting preview already does. | `massDelta.js` already returns this shape |
| **Branch comparison** | Two branches side by side, expressed as what you would be able to *do*, not as stats. | pairs with compare mode |
| **Respec, or an explicit statement that there is none** | Players will not commit to a build if they fear a dead end. Either allow it or say clearly and early that choices are permanent. | **a product decision — flag to the owner, do not assume** |
| **Cost visible at all times** | Not only on the selected node. The shape of the curve should be readable from the whole view. | |

### 6. Map UI — what THE CHART still lacks

The Chart already has layers, an 8-tab inspector, staleness, bookmarks, search and route plotting —
and a legend. Still missing for A-list:

- **Measurement.** Drag between any two points and get distance, fuel and ETA *for your current
  ship*. Trivial to build, constantly used.
- **Route comparison.** Two candidate routes shown together with their trade-offs stated in words —
  the fast/safe/profitable triple the plan already proposes, but *side by side* rather than one at a time.
- **Fog-of-war as an authored look.** The staleness model exists but is expressed as tint. Unknown
  space should look *unknown* — deliberately drawn, not merely dimmed — so exploration has a visible
  frontier.
- **A "you are here" that survives zoom.** At galaxy scale the player marker must never be lost.
- **Layer presets.** Save a named layer combination ("trading", "hunting", "exploring") rather than
  toggling eight switches. Pairs with §3 state memory.

---

## Tier 3 — the standards that separate shipped from unfinished

### 7. Data presentation conventions — **UNSPECIFIED**
One decision each, applied everywhere: number formatting and thousands separators; unit display
(`t`, `WU`, `cr`, `/s`) and where the unit sits relative to the value; time and duration format;
relative vs absolute dates; how a sort is indicated; how a filter shows it is active; where a count
of hidden rows appears. **Inconsistency here is subconsciously read as cheapness**, which is exactly
the complaint being addressed.

### 8. List virtualization and UI frame budget — **VERIFIED MISSING**
No list in the build is windowed. The Chart's economy view alone is 47 commodities × 24 sectors, and
the Footprint's ledger is append-only with a declared cap. **Set a policy now:** any list that can
exceed ~200 rows is windowed, and the UI has a stated per-frame budget it may not exceed while the
sim is live.

### 9. Destructive-action policy — **UNSPECIFIED**
Selling a unique module, jettisoning cargo, abandoning a contract, overwriting a save. **One rule:**
reversible actions happen immediately with an undo affordance; irreversible ones require a confirm
that *names the consequence* ("This scraps the Capital Spool. It cannot be recovered."). Never a
bare "Are you sure?".

### 10. Key rebinding UI — **UNSPECIFIED**
Every letter is bound and several keys are contested. A rebinding surface must **detect and display
conflicts**, show which contexts a key is claimed in (flight vs prompt vs screen), and offer reset to
default per binding rather than only globally. `settings.js` has rebinding; it needs the conflict model.

### 11. Notification priority — **PARTIAL**
The one-voice arbiter governs the top-centre channel. There is no equivalent for the *receipt* lane,
the Rail's claim overlay and a re-entry digest arriving in the same second. **Define one priority
ladder across every transient channel**, with explicit ducking, so two systems can never talk over
each other.

### 12. Returning-player state — **UNSPECIFIED**
A player who loads a save after three weeks has forgotten what they were doing. On load, the game
should quietly re-establish: your ship, your active contract, where you were heading, what changed
in the world. This is the re-entry digest (`ADDITIONS.md` §4) applied to session start, and it is a
low-cost, high-affection feature.

### 13. Visual regression testing — **UNSPECIFIED**
Three demonstrated cases prove checks cannot see appearance: the clipped Mission Log card passes
everything; `check:ui-frame-sleep` cannot see compositor-side CSS keyframes; the tech tree renders in
the wrong font on every frame with nothing reporting it. **Capture a reference frame per screen per
mode and diff it in CI.** Without this, "a green check is not proof" stays permanently true.

### 14. Text and UI scaling — **PARTIAL**
`--ui-scale` exists. There is no player-facing control tied to it, and no verification that layouts
survive 125 % / 150 %. Accessibility text scaling is a WCAG expectation, not a nicety.

### 15. The missing meta screens — **VERIFIED MISSING**
- **Credits.** Absent. An open-source game with contributors and vendored assets needs one, and it is
  also where licences and attributions belong.
- **Statistics / records.** Partly absorbed by THE FOOTPRINT, but a "lifetime" view (distance flown,
  tonnage towed, ships slammed into asteroids) is cheap, and in a physics playground it is *funny*,
  which is worth more here than in most games.
- **Photo mode.** Absent. For a game whose pitch is "shiny exploding things" and whose art bible is
  about spectacle, the absence of a way to capture and share a moment is a real marketing gap. Even a
  minimal version — hide HUD, free camera, capture — pays for itself.

---

## What this changes about sequencing

Items **1, 2, 3, 4** are not features; they are **properties every screen must have.** Adding them
after the screens exist means touching every screen again.

They therefore belong in **Phase 0**, expressed as: the shared shell provides state memory, the four
required states, a responsive scalar and a text-expansion-safe layout primitive — so a screen author
gets them by construction rather than by remembering.

*That is the same lesson as the token block and the entity resolver: anything every screen needs must
exist before the first screen is built.*
