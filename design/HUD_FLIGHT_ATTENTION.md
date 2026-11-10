<!-- LIFETIME: ACTIVE -->
# HUD Flight Attention

**Status:** Activated execution plan (user-authorized 2026-08-13).  
**Does not replace:** `ARCHITECTURE.md`, `design/VISION.md`, `design/GDD_2_0.md` §8 and §9.4.  
**Supersedes for this pass:** `design/revamp/HUD_THREE_ANCHOR.md` and `design/revamp/GEMINI_HUD_BRIEF.md` as layout law. Those remain dated receipts.  
**Copy-paste operator:** [`HUD_FLIGHT_ATTENTION_GOAL.txt`](./HUD_FLIGHT_ATTENTION_GOAL.txt) (<4000 characters).

This plan is how the flight HUD becomes a physical-literacy layer instead of a website of boxed cards. Implement Flights 1–3 on the live default flight route. Flight 4 waits on a real current-hull silhouette.

## 1. One idea

The HUD has **jobs**, not a skin. It changes what it is doing based on what the player is doing.

| Job | What stays on the glass |
|---|---|
| Cruise | Ship instrument, speed, radar, one destination. The world is the show. |
| Massline latched | Bottom-center becomes the line: tension, length, release. World-space marks stay authoritative. |
| Fight | Target card, contacts, hit direction. Ship instrument gets loud only when hurt. Receipts go quiet. |
| Hurt | The corner ship instrument is the only thing in that corner that moves. |
| First use of a verb | One hint, stuck to the object. Never a paragraph of keys. |

Silence means healthy. Motion means change. A title on an instrument means the instrument failed.

Still no visor, helmet, screen-edge cockpit arc, or pilot face.

## 2. Success criteria

Done only when all of these are true on the **default flight route**, not a mock or lab-only HUD.

### Player

1. **Five-second still.** A stranger can point to hull, shields, speed, where to go, and the selected target without reading a title such as `SHIP CONDITION`.
2. **Combat.** No receipt or toast card covers radar, target, or contacts. No on-screen key laundry. One top-center voice.
3. **Teaching.** At most one first-use verb hint, attached to the thing (station, rock, latch candidate). After the first successful use, it never returns. Full binds live in Help / Pause / Settings only.
4. **Ship instrument.** Ring = shields. Silhouette fill = hull. One image, one size, centered. No `SHIP CONDITION`, no `NOMINAL`, no second pair of numbers unless hull or shields are actually low. The current left-offset fill is a defect, not a look.
5. **One destination.** Mission tracker, nav readout, and objective list collapse to **one line** that already carries distance/ETA. World diamond + radar mark stay. The diamond does not also wear a caption plate when the corner line is visible.
6. **Receipts, not website toasts.** One or two thin lines of HUD type in a reserved lane that cannot enter radar, ship, or objective. No card, stripe, drop shadow, or z-index above the HUD. Banned: `Target: …`, danger lines (those stay top-center), key reminders. Allowed: pay, cargo, cannot-do-that, save, standing.
7. **Ink on vacuum.** No glass plate around two numbers. No decorative cyan “power rail” on every box. Type large enough to read (stop 7–8px tracked-out kit labels). Color only means something.
8. **Massline.** While latched, bottom-center is the line instrument. No key chips. When cut, cruise HUD returns.
9. **Story HUD lies still fire** (`STABLE LOAD`, tag flicker, phase/legacy readouts). Those are content.
10. **Keep** radar, the contact roster (may collapse to a count at rest), target card when something is selected, prograde tick, hit-direction wedges, and existing world-space Massline marks.

### Technical

- `npm run check:baseline` before the first edit and after each flight.
- After HUD edits: `check:ui-a11y`, `check:wcag-contrast`, `check:player-facing-labels`, `check:ui-identity`, `check:ui:perf` as they apply. Update `check-ui-identity` / screen-import contracts if they encoded retired chrome; do not keep chrome to satisfy a string check.
- Do not re-record `test/*.expected.json`. Do not edit sim, `flight.js` / `flightDynamics.js`, or `ai.js` for this pass.
- Do not redesign station screens, maps, or the Help layout beyond ensuring the bind sheet remains the home for keys.
- Reduced-motion / flash-reduce still produce a legible static result. Color is never the only hull/shield/IFF cue.
- Compositor: no new `backdrop-filter` as polish. Fewer cards, not more.

## 3. Workflow

Stay on the current branch. Do not open a worktree unless the tree is actually blocked. Scope every commit to HUD files this pass owns.

### Order (do not skip)

1. **Read live owners** before editing: `src/ui/hud.js`, `src/ui/uiRoot.js`, `src/ui/toasts.js`, `src/ui/controlPrompts.js`, `src/ui/alerts.js`, `src/systems/onboarding.js` (`_updateControlBar` / `#control-hints`), `src/ui/hudMeta.js`, `styles/ui.css` toast/hint rules, `scripts/check-ui-identity.mjs`.
2. **Flight 1 — Silence.** Delete the flight-route key laundry (`#control-hints` and the onboarding flashes that refill it). Demote toast cards so they cannot cover HUD; start the reserved receipt lane even if typography is still rough. Merge the triple objective into one line. Strip `SHIP CONDITION` / `NOMINAL` / duplicate hull-shield numbers. Center the silhouette: ghost and fill must be the **same** box and size (the fill is currently a larger image pinned from the left).
3. **Flight 2 — Instruments.** Rebuild the ship as ring + silhouette (one language). Unbox the command deck. Contacts collapse to a count at rest (`N HOSTILE · M`) and expand in a fight or when opened. Heat only when hot. Receipts are thin HUD type, max two, short life, identical ones collapse. Combat is almost silent.
4. **Flight 3 — Verb HUD.** Massline owns bottom-center while latched (analog tension/length/release; agree with existing world-space release diamond). First-use hints attach to the object, teach-once, then die. Reserved-region collision is law: receipts, comms, Band chip, and objective arrow labels may not enter ship / objective / radar rectangles. Story lies still fire.
5. **Flight 4 — Your hull (only if honest).** Swap the generic scout for a tightly cropped silhouette of the ship the player is actually flying. Do not invent a second fake scout. If that art is not ready, stop after Flight 3 and say so in one sentence.
6. **Commit after each flight.** Push the current branch by explicit name. Then the next flight.
7. **Prove on the glass.** After each flight, capture cruise, fight, latch (if available), and low-hull. A green check is not the still-frame test.
8. **Cleanup, then stop.** See §6. Do not leave process residue.

### Seams to reuse

| Job | Owner |
|---|---|
| Flight HUD mount / layout | `src/ui/hud.js`, `injectHudCss` in `src/ui/uiRoot.js` |
| Toasts / receipts | `src/ui/toasts.js`, `#toasts` in `styles/ui.css` |
| One-voice danger | `src/ui/alerts.js`, `src/ui/voiceArbiter.js` |
| Key copy | `src/ui/controlPrompts.js`, Help / Settings — not the windshield |
| Teach-once | `src/systems/onboarding.js` + a first-use flag; do not revive the laundry bar |
| Story lies | `src/ui/hudMeta.js` — do not “clean” |
| Contacts / target / radar | keep; `check:ui-identity` already guards roster + target |
| Massline world marks | `src/ui/masslineHud.js` — complement, do not duplicate as key chips |
| Reserved rectangles | `resolveObjectiveHudLayout` in `src/ui/hud.js` — finish as the collision kernel |

### Non-goals

More panels. A HUD layout editor (quiet Ctrl-drag may stay). New fonts or a new palette. Station / map / menu redesign. HP halos on every enemy in the world. Deleting radar or the contact roster to look minimal. A cinematic or visor mode.

## 4. Instruments (implementation notes)

**Ship (bottom-left).** Ring empties with shields. Silhouette empties from the bottom with hull. Numbers appear on the instrument only when low. Energy / drive / fuel are thin ticks, no surrounding card. Weapon heat rows appear when hot; do not also keep a permanent HEAT bar that says the same thing.

**Speed (bottom-center).** One large number. Travel tape only while spooling, burning, or about to overshoot. Prograde tick stays in the world. No plate around two chips.

**Radar + contacts (bottom-right).** Radar stays. Roster may collapse at rest and must remain reachable (click-to-target, overflow truthful). Target card exists only while something is selected.

**Destination.** One line. Diamond in the world. Mark on the radar. That is the set.

**Receipts.** Same type family as HUD data, HUD z-layer (not 1000). Reserved slot that the layout kernel forbids from overlapping radar / ship / objective. Group identical lines. Max two.

**Teaching.** Delete `#control-hints` from the flight route. Help already owns the sheet. First-use is a single world-attached line, then `taught[verbId]` (or the existing onboarding equivalent) so it cannot return.

## 5. Banned (LLM / cheap-HUD anti-patterns)

- Visor, letterbox, film grain, helmet, pilot portrait, screen-edge cockpit arc
- More boxed cards to “organize” clutter
- Fake 3D CSS ship, hearts, emoji toast icons
- 7px tracked-out `SCI-FI` labels as atmosphere
- Flavor chrome: `SYS`, `NOMINAL`, `LINK ESTABLISHED`, `TACTICAL`
- Solving overlap by raising z-index
- `backdrop-filter` as polish
- Teaching a verb with a paragraph
- Keeping website toast cards and calling them “receipts”
- Deleting useful spatial tools (radar, roster, objective) to look premium
- Editing goldens, sim, or legacy flight/AI to make a UI check pass
- “Cleaning up” the story HUD lies
- A process ledger, review pile, or second HUD spec that restates this file

## 6. Cleanup of process artifacts

Required before the pass is called done. The plan file and the live HUD stay. Everything else this pass invented to *manage* the work goes away.

Delete or revert:

- Any `design/program/NOW.md` row this pass added
- Scratch notes, TODO dumps, extra HUD briefs, “status” markdown, review ledgers
- Temporary captures that are not durable player-facing evidence
- Dead CSS / JS for `#control-hints`, action-bar keycaps, unused toast-card skin if retired
- `window._sfShowHints` and other globals that only existed to flash the laundry list
- Duplicate injected style blocks left after moving rules
- Untracked junk this pass created

Do **not** delete: this plan, the goal prompt, Help / Settings bind UI, story HUD, radar, roster, or evidence stills that actually show the four jobs.

If a check still names retired chrome, update the check to the new contract, then remove the stale comment in `src/ui/AGENTS.md` that says the always-mounted flight hint bar owns map-key copy.

## 7. Layering after this pass

Receipts live **in** the HUD layer, in a reserved lane. They do not sit at z-index 1000 over the instruments. Alerts remain the one-voice floor above the playfield. Update the layering comment in `src/ui/AGENTS.md` when the toast stack is gone.

## 8. Honest stop

Flight 3 on the live route + §2 true in play = done.  
Flight 4 missing art = done, with one sentence naming the missing hull picture.  
Blocked only by a genuinely irreversible collision or a look call this plan does not settle — finish every unblocked flight first.
