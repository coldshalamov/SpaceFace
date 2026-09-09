<!-- LIFETIME: RECEIPT -->
# PQ-158.06 — Minimal action audio in the first playable

```text
DONE  PQ-158.06 — latch, a loaded line, a messy release, a good and a bad drill, a shield break, a weapon vent, a boost, a purchase, and a starved mill each request a voice on the same tick they happen, reduced-motion keeps them, and a 25-second Helios fight tape with sound shows telegraph → hit → shield crack → vent and boost.

WHAT I FOUND     Attach, shield crack, vent, boost and a completed buy already spoke. A taut line, a messy let-go, a drill in flight, and a starved mill did not. Playwright also forced mute, so a headed tape could never carry sound.

WHAT I CHANGED   Those four gaps now request their recipes on the live bus, with cooldowns so chatter cannot cover an attack. Automation can unmute only for an explicit capture. The fight tape is the live camera plus the mixer's own output.

WHAT YOU WILL FEEL   Hooking a rock clicks. The line creaks when it is working. Letting go badly snaps. A bite and a dry hole sound different. A shield dying, a vent, and a boost still cut through when motion is reduced.

THE NUMBERS      bar | before | after | target
                 named action receipts requesting a voice on the same tick | 5 of 10 on the default route | 10 of 10 | 10 of 10, delay <= 6 ticks
                 reduced-motion still requests every cue | unproven | 10/10 | keep every cue
                 fight tape audio+video | none | 25.4 s, vp8+opus | one normal-speed capture with audio

THE FRAMES       design/program/roadmap/receipts/PQ-158-06-fight.webm (25.4 s, audio+picture). Stills of the four beats: PQ-158-06-fight-anticipation.png, -contact.png (reticle 18), -consequence.png, -recovery.png.

NEXT             PQ-158.00 sample library and default unmute; PQ-158.02 Massline as an instrument
```

## Review

[Review](098716ed-dd21-4e68-98be-f647c345e332) — Bugbot found no bugs.

## Checks

| Check | Result |
|---|---|
| `node --test test/pq-158-06-action-audio.test.mjs` | 7 pass |
| `node scripts/capture-pq158-06-action-audio.mjs` | 25.4 s webm, audio+video, shield break + vent on the tape |
| `npm run check:baseline` | recorded below |

## What is met and what is not

| clause | evidence |
|---|---|
| each named event has a sound on the default route within 0.1 s | tick-indexed test; attach already via presentation, the four gaps via `minimalActionAudio.js` |
| one normal-speed capture with audio of a fight | `PQ-158-06-fight.webm` — telegraph, pulse hit (18), shield break, vent+boost |
| reduced-motion keeps every cue | test forces `motionReduce`; `play()` only ducks ambience, never these one-shots |

Default mute is unchanged. Unmute belongs to PQ-158.00 once the sample library lands. The fight tape opts the graph in with `__SF_CAPTURE_AUDIO`.

Clean / razor releases keep the presentation snap; only a messy let-go uses the binder so those two cannot stack.
