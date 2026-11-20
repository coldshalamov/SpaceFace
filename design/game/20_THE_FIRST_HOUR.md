# 20 — The first hour, designed end to end

The first hour covers every normally reachable choice from the title and from Adventure's opening.
Use this chapter for design and the [fleet queue](../program/fleet/QUEUE.md#whole-game-stability-and-performance)
for current work. Timings are design targets. Record actual route outcomes in the
[quality checkpoint](../program/fleet/QUALITY.md).

## The five rules of attention

1. **One focal point per moment.** At any second the player's eye has one obvious place to go — the brightest, most
   saturated, most moving thing on screen is the thing that matters. Everything else recedes (dimmer, smaller, still).
2. **One guidance voice, two owners (EC-G09: twelve systems can tell the player what to do today).** *What is next* is
   said by **one line only — the objective tracker**. *The verb* is said by **one world tag only — the aim tag on the thing
   under the cursor** (`#hud .sf-aimtag`). Show the action and the player's active binding. The onboarding panel,
   tutorial voice, act popups, first-use hints, comms nudges and the control bar defer to these two — at most one of them
   speaks at a time, and never while a verb tag is up. **On-screen text budget in a fight: ≤ 3 lines** besides the HUD
   instruments, priority: danger alert > verb tag > objective line > callout > receipts.
   A prompt sits on the object it is about (world-anchored chip: `F · LATCH` on the rock),
   appears when the action is possible, and leaves the moment it is done. No modal tutorial slides, no wall of keys.
3. **The HUD earns its place.** Calm flight shows only what you need this minute: speed, hull, the one objective line, the
   radar. Instruments arrive when their verb arrives (tow strain when you tow; power rail when you own a power). Combat
   brings combat readouts; peace takes them away.
4. **Every first success lands.** The first latch, first throw, first kill, first dock each get a beat: a camera kick or
   ease, one sound, one short word in the centre lane (`LATCHED`, `THROWN`, `CRUSHED`) — once, then quieter on repeats.
5. **Get to the first deliberate throw quickly.** On the default route, aim for thirty seconds from the title.
   Record cold boot, time spent choosing equipment, time from launch to effective control, and time to first throw separately.

## Controls: one verb at a time

The core set stays small and is introduced in this order, each by a situation:
| Verb | Keys (mouse+keyboard) | Pad | Touch | Taught when |
|---|---|---|---|---|
| Fly / aim | W A S D · mouse | left stick · right stick | drag anywhere | 0:00 — the ship is already moving toward the marked rock |
| The Line (latch / cut) | F or RMB tap | RB | TETHER key | 0:10 — the rock is in range; chip on the rock |
| Throw | RMB tap while swinging | RB | flick while latched | 0:20 — the derelict is in the swing's path |
| Boost | Shift | LB | push past the ring | 0:40 — the raid; distance to close |
| Fire | LMB hold | RT | GUN key | 1:00 — the raider; but the throw is the better answer |
| Powers 1–5 | 1–5 · Q wheel | d-pad · hold Y | POWERS edge | minute 15+, one per situation (doc 10 D6) |
| Dock | E | A | DOCK key | at Helios |
Esc/Start is Pause in flight. Settings, Help, the HUD and lessons use the same resolved bindings.
With Arm assist enabled, hold RMB until the throw is ready.
Rig toggles on a tap and shows the active cone or scoop state. Shove acts on press. Aimed powers
use the player's chosen press or release setting. A player must be able to keep steering while using each power.
**Accessibility floor:** text ≥ 12 px at 1280×720; reduced motion and reduced flash honoured by every new beat; colour never
the only signal (shape + word); subtitles for every voiced line; hold-to-toggle options for held verbs.

## Storyboard — first launch to the first door

| Time | Screen | The eye goes to | The player does | Must NOT be on screen |
|---|---|---|---|---|
| 0:00 | **Loading** | the authored moving intro with the Orrery progress ring and a visible skip | watches or skips | frozen picture, progress jitter, internal task names |
| 0:07 | **First-run question** (once per install) | one card: *Play* (shipped settings) — quality/motion folded in | clicks Play | multiple stacked config prompts |
| ready | **Title** | the engraved Orrery and its action rail over the live ship scene on desktop, with compact mode choices on phones | selects the full button by pointer, keyboard or pad | overlapping game art or inactive artwork boundaries |
| return | **Title** | Continue gives the saved place and ship | resumes or chooses a mode | technical save metadata |

**Swarm door** (doc 12):
| Beat | Screen | Eye | Does | Keep out |
|---|---|---|---|---|
| prepare | Match setup and starting ship | recognizable arena artwork and the selected hull at a useful scale | chooses a hull, with rules and difficulty explained in plain terms | quoted internal seeds, unexplained difficulty names, a separate Play bypass |
| fit | Ship equipment | the selected ship, real empty or fitted slots, and the equipment that fits | inspects, installs or borrows the desired gear, then launches the named round | automatic purchases, stock weapons inherited from Adventure, hidden replacements |
| launch | Round 1 drops in | the ship, space to turn, and the first clearly visible threat | flies, latches or uses the selected weapon | open-world notices, damaging unseen obstacles |
| first swing | The Line is taut | the useful trajectory and one throw prompt | throws into the pack | overlapping prompts |
| 0:20 | first chain | centre lane: `PILE-UP ×3` big, once; a short camera punch | grins | three other callouts at once |
| round end | Ship equipment | earned credits, current fit and clearly priced offers | keeps, changes or adds gear, then launches the next round | clipped cards, missing prices |
| death | Run results | round reached, cause of death when known, and Retry | retries the chosen run or returns to setup | disappearing results, lost setup |

Choosing a hull sets its structure, steering and legal slots. A fitting is an explicit decision.
Before spending, show the item, slot, displaced item and its destination, price and credits after
purchase. If a zero-credit start offers a loan, show how long the loan lasts. Retry preserves the
run choice, with a new run budget and the applicable starting equipment rules.

**Adventure door** (doc 16 B0 "Cold Start", doc 10 D6 — the ten beats):
| Time | Beat | Eye | Does | Teaching |
|---|---|---|---|---|
| 0:10 | New Game: name + ship (defaults fine) → **LAUNCH** | the LAUNCH key | launches | — |
| 0:12 | 1 · spawn: the 47-A rock marked, one caption of premise | the marked rock, bright against the field; the ship already drifting toward it | flies (WASD) | caption fades after 4 s |
| 0:30 | 3 · latch, reel, cut | chip on the rock with the current tether binding; then the tow strain arc | latches, reels | `LATCHED` beat |
| 0:45 | 4 · swing the rock through the derelict | the derelict lit as a target; chip `SWING THROUGH IT` | throws | `SMASHED` beat; debris |
| 1:30 | 5 · the raid | the raider's red ring; the rock field behind it | flings the raider into a rock (the throw again — not a gun drill) | `CRUSHED` beat |
| 3:00 | 6 · claimed salvage — take it or leave it | the salvage pod and its owner's tag | chooses | the first choice with a consequence |
| 4:00 | 7 · mine the sample | the seam glow | mines | — |
| 5:00 | 8 · **the Skim, as a scene** | the black-line ship dropping in; its line takes your tow; the escorts die on screen | watches, reacts | no text wall — it happens in front of you |
| 6:30 | 9 · Kessler's line, with a face | a portrait window, one line | — | — |
| 8:00 | 10 · dock at Helios into Lamps-Up | the station lamps coming up; `E · DOCK` chip | docks | first station visit: one recommended job (Orla's lamp), the alloy run lit |
| 8–20 | First paid station job | offer, cargo requirement, map course and named receiving berth | accepts, departs, navigates, delivers and sees pay | the tracker and comms name the same destination; a wrong berth does not close the job |
| 15–40 | powers, extra verbs, drills | one per ~90 s, by situation | — | never all at once |
| 20–60 | Pick another job, trade, explore or upgrade | the map, station departures and the next affordable improvement | decides what to pursue, saves and can resume it | clear blocked requirements, retained cargo and a way back from mistakes |

## Screen standards (every screen in the first hour)
- Fits and reads at 1280×720, 1366×650, 1280×620 and the phone sizes; nothing clipped; one primary action, lit.
- Text on a plate whenever it sits over the world; ≤ 3 notices at once; identical notices merge; no open-world chatter in
  an arena.
- Each screen answers in one glance: *where am I, what can I do, what should I do next.*

## Performance stance (owner 2026-11-12: lean to performance)
Use the existing visual and audio vocabulary. Keep silhouettes distinct from backdrop and effects.
Preserve the authored loading film and title composition when optimizing launch. Compare the
opening controls and visible motion before swapping either treatment.
Place readable landmarks along approaches. A body that can collide with the player needs warning and a visible shape.
Tune cost at the system that owns it and keep the authored visual intent. Measure frame gaps,
sim-to-wall ratio and input response in quiet flight and under combat pressure.

## How this is built and checked
Build a slice from the player's decision to its consequence and recovery. Give it one lead and keep
simulation, presentation and input ownership intact. Check the specific failure at its owner, then
take the integrated route through the ordinary title, job board or station. For a visual decision,
ask a fresh reader to identify the current state and the next available action from the actual screen.
Keep the [ten-minute card](18_SOUND_LOOK_AND_DONE.md#the-owners-ten-minute-card) for feel.

Check fresh and returning profiles, mouse and keyboard, pad, and touch. Cover all other ordinary
first-hour routes by the first decision and outcome they add. Gauntlet adds its distinct starting
rules and a retry. Circuits adds a scored finish and reset. Swarm practice and scheduled challenges
show what differs before launch. Adventure station services, cargo, salvage, mining, fitting and
map travel retain the state needed to return to the current job or resume from a save.
