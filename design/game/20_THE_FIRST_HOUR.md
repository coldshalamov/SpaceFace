# 20 — The first hour, designed end to end

**Status: DRAFT** — timings are design targets until the measured demo route (`scripts/fleet/looks/demo-route.mjs`) and RECON-G10 replace them; each row gains "exists today (owner)" and "observable" columns before packets are cut. Authority for the demo (owner, 2026-11-12: "someone needs to think about how we create the optimal game
experience … from the first loading screen to every UI and the game"). Where 10/16/19 and this disagree on the first hour,
this wins. Owner of the plan: the lead. Every beat below is judged on screen through `scripts/fleet/looks/demo-route.mjs`.

## The five rules of attention

1. **One focal point per moment.** At any second the player's eye has one obvious place to go — the brightest, most
   saturated, most moving thing on screen is the thing that matters. Everything else recedes (dimmer, smaller, still).
2. **One guidance voice, two owners (EC-G09: twelve systems can tell the player what to do today).** *What is next* is
   said by **one line only — the objective tracker**. *The verb* is said by **one world tag only — the aim tag on the thing
   under the cursor** (`#hud .sf-aimtag`, today "LINE TARGET"): `RMB · LATCH`, `CLICK · THROW`, `E · DOCK`. The onboarding panel,
   tutorial voice, act popups, first-use hints, comms nudges and the control bar defer to these two — at most one of them
   speaks at a time, and never while a verb tag is up. **On-screen text budget in a fight: ≤ 3 lines** besides the HUD
   instruments, priority: danger alert > verb tag > objective line > callout > receipts.
   **The world teaches, not panels.** A prompt sits on the object it is about (world-anchored chip: `RMB · LATCH` on the rock),
   appears when the action is possible, and leaves the moment it is done. No modal tutorial slides, no wall of keys.
3. **The HUD earns its place.** Calm flight shows only what you need this minute: speed, hull, the one objective line, the
   radar. Instruments arrive when their verb arrives (tow strain when you tow; power rail when you own a power). Combat
   brings combat readouts; peace takes them away.
4. **Every first success lands.** The first latch, first throw, first kill, first dock each get a beat: a camera kick or
   ease, one sound, one short word in the centre lane (`LATCHED`, `THROWN`, `CRUSHED`) — once, then quieter on repeats.
5. **Thirty seconds to the first throw, in either door** (doc 18 bar 2). Nothing — cinematic, menu, config question, drill —
   stands between a new player and that.

## Controls: one verb at a time

The core set stays small and is introduced in this order, each by a situation:
| Verb | Keys (mouse+keyboard) | Pad | Touch | Taught when |
|---|---|---|---|---|
| Fly / aim | W A S D · mouse | left stick · right stick | drag anywhere | 0:00 — the ship is already moving toward the marked rock |
| The Line (latch / cut) | RMB tap | RB | TETHER key | 0:10 — the rock is in range; chip on the rock |
| Throw | release / RMB tap while swinging | RB | flick while latched | 0:20 — the derelict is in the swing's path |
| Boost | Space | LB | push past the ring | 0:40 — the raid; distance to close |
| Fire | LMB hold | RT | GUN key | 1:00 — the raider; but the throw is the better answer |
| Powers 1–5 | 1–5 · Q wheel | d-pad · hold Y | POWERS edge | minute 15+, one per situation (doc 10 D6) |
| Dock | E | A | DOCK key | at Helios |
Esc/Start is always Pause. Every key is rebindable (Settings → Controls); the Help screen shows the live bindings.
**Accessibility floor:** text ≥ 12 px at 1280×720; reduced motion and reduced flash honoured by every new beat; colour never
the only signal (shape + word); subtitles for every voiced line; hold-to-toggle options for held verbs.

## Storyboard — first launch to the first door

| Time | Screen | The eye goes to | The player does | Must NOT be on screen |
|---|---|---|---|---|
| 0:00 | **Loading** (~7 s) | the SPACEFACE mark and a single moving progress line | waits | percent jitter, tech words ("initializing systems") |
|      | | below it, one rotating **controls card** (WASD · mouse · RMB Line · Space) drawn as the game's own key art | reads it while waiting | — |
| 0:07 | **First-run question** (once per install) | one card: *Play* (shipped settings) — quality/motion folded in | clicks Play | multiple stacked config prompts |
| 0:09 | **Title** | **two big doors side by side: ADVENTURE and SWARM** over a live hero scene (a ship at work, a freight string passing) | picks a door | the long secondary list; dev entries; anything over the ship |
|      | | small row under the doors: Continue · Settings · Help · Quit | — | — |

**Swarm door** (doc 12; the demo's fastest "wow"):
| Time | Screen | Eye | Does | Must NOT |
|---|---|---|---|---|
| 0:10 | Swarm entrance | one primary button **PLAY** (Exhibition stake, Ricochet Foundry, default kit) — the full entrance (modes, stakes, arenas, kit) one click behind *Customise* | clicks PLAY | three setup screens before a fight |
| 0:13 | Round 1 drops in | the ship at centre, three light Wasps coming at it, **one chip on the nearest Wasp: `RMB · LATCH`** | latches | radio, open-world notices, pad tag soup |
| 0:18 | first swing | the Line taut, the pack behind; chip: `SWING · RMB TO THROW` | throws into the pack | — |
| 0:20 | first chain | centre lane: `PILE-UP ×3` big, once; a short camera punch | grins | three other callouts at once |
| round end | Armory (between rounds) | three cards, one recommended (lit); `Launch round 2` the obvious primary | buys or launches | clipped cards, cut prices |
| death | Run Over | what killed you (the dial), one line of *why*, `Run it again` primary | runs it again | — |

**Adventure door** (doc 16 B0 "Cold Start", doc 10 D6 — the ten beats):
| Time | Beat | Eye | Does | Teaching |
|---|---|---|---|---|
| 0:10 | New Game: name + ship (defaults fine) → **LAUNCH** | the LAUNCH key | launches | — |
| 0:12 | 1 · spawn: the 47-A rock marked, one caption of premise | the marked rock, bright against the field; the ship already drifting toward it | flies (WASD) | caption fades after 4 s |
| 0:30 | 3 · latch, reel, cut | chip on the rock `RMB · LATCH`; then the tow strain arc on the ship | latches, reels | `LATCHED` beat |
| 0:45 | 4 · swing the rock through the derelict | the derelict lit as a target; chip `SWING THROUGH IT` | throws | `SMASHED` beat; debris |
| 1:30 | 5 · the raid | the raider's red ring; the rock field behind it | flings the raider into a rock (the throw again — not a gun drill) | `CRUSHED` beat |
| 3:00 | 6 · claimed salvage — take it or leave it | the salvage pod and its owner's tag | chooses | the first choice with a consequence |
| 4:00 | 7 · mine the sample | the seam glow | mines | — |
| 5:00 | 8 · **the Skim, as a scene** | the black-line ship dropping in; its line takes your tow; the escorts die on screen | watches, reacts | no text wall — it happens in front of you |
| 6:30 | 9 · Kessler's line, with a face | a portrait window, one line | — | — |
| 8:00 | 10 · dock at Helios into Lamps-Up | the station lamps coming up; `E · DOCK` chip | docks | first station visit: one recommended job (Orla's lamp), the alloy run lit |
| 15–40 | powers, extra verbs, drills | one per ~90 s, by situation | — | never all at once |

## Screen standards (every screen in the first hour)
- Fits and reads at 1280×720, 1366×650, 1280×620 and the phone sizes; nothing clipped; one primary action, lit.
- Text on a plate whenever it sits over the world; ≤ 3 notices at once; identical notices merge; no open-world chatter in
  an arena.
- Each screen answers in one glance: *where am I, what can I do, what should I do next.*

## Performance stance (owner 2026-11-12: lean to performance)
Every beat above is built from what exists — camera eases, chips, plates, existing VFX and sounds — no new heavy systems.
The look pass (LOOK-04) makes the existing picture read (bodies over the sky, bloom only on emission); the demo tier keeps a
fixed internal resolution. A beat that costs frames is cut, not shipped.

## How this is built and checked
Packets per strip (title + loading; Swarm door; Adventure beats 1–5; beats 6–10; first station visit), each judged by the
demo route: seconds-to-first-throw, frames, every screen PNG, every on-screen string. The owner's ten-minute card is the
final word.
