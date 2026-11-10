# Sound spec — Field Hardware

`kit/sound-recipes.json` (recipes in the game's own shape) + `kit/sound.js` (a WebAudio player
for them). The game has no audio files: every sound is synthesised from a recipe, so these drop
into `src/data/audioRecipes.js` without a translation layer.

**Silence is the default.** The player starts muted and the game ships muted. A cue that has to
be heard to make a screen legible is a design failure, not an audio one.

## The voice

One instrument: a small machined thing with a damped body. Low, mechanical, short. No beeps, no
chirps, no rising arpeggios, nothing above ~4.2 kHz except the two ticks. Fourteen cues,
**4.98 s of audio in total** — nothing sustains past 900 ms except `ui_wanted`, which is the one
sustained tone the direction asks for.

## The cue table

Lengths are **computed** from the recipes by `FH.sound.duration()`, not asserted:
`node assets/ui/kit/tools/validate_sound.mjs` plays all fourteen in a real `AudioContext` and
prints them.

| id | Fires when | Character | Length | Peak gain | Replaces |
|---|---|---|---:|---:|---|
| `ui_key_press` | a key is pressed | a short thock: damped low body under a dry contact click | 76 ms | 0.90 | `sfx_ui_click` |
| `ui_plate_slide` | a BENCH plate arrives | a damped whoosh, top rolling off as it settles | 212 ms | 0.52 | — (new) |
| `ui_legend_on` | a legend lights | a barely-there tick | 12 ms | 0.14 | — (new) |
| `ui_legend_off` | a legend goes to rest | the same tick, duller | 10 ms | 0.10 | — (new) |
| `ui_confirm` | a commit succeeds | one clear tone, G4 with its octave beneath | 304 ms | 0.50 | `sfx_ui_confirm` |
| `ui_deny` | an action is refused | a dull two-note fall, a minor third | 323 ms | 0.55 | `sfx_ui_error` |
| `ui_open` | a screen opens | the plate slide with a low note under it | 268 ms | 0.70 | `sfx_ui_open` |
| `ui_back` | a screen closes | the open cue with its tone inverted | 228 ms | 0.62 | `sfx_ui_back` |
| `ui_tab` | moving between tabs or filters | a detent: drier than a key press, a fifth up | 61 ms | 0.62 | — (new) |
| `ui_dock` | docking completes | a low swell that arrives and clamps | 640 ms | 0.80 | `sfx_dock` |
| `ui_undock` | undocking | the swell reversed: the clamp lets go, the note falls | 620 ms | 0.80 | `sfx_undock` |
| `ui_wanted` | heat crosses into WANTED | ONE sustained cold tone; a minor second between two voices | 1 520 ms | 0.46 | — (new) |
| `ui_crucible_enter` | the Crucible door commits | a hard metallic strike with a long metal tail | 701 ms | 0.92 | — (new) |
| `ui_tick` | a stepper detent, a value crossing a gradation | at the edge of audibility; it fires often | 8 ms | 0.11 | — (new) |

`ui_wanted` is a **temperature change, not an alarm**: it plays once when the state flips and
does not repeat while the state holds. Nothing in the set loops.

## Why these numbers

- `ui_plate_slide` is **212 ms** because the BENCH slide is 180–220 ms. A cue longer than its
  motion is what makes an interface feel laggy even when it is not.
- `ui_key_press` is **78 ms** against a 60 ms press-down: the sound ends as the key bottoms out.
- `ui_legend_on` is 13 ms and quieter than everything else by a factor of four, because a
  legend lights up far more often than anything is pressed. If it is audible as an *event*
  rather than as texture, it is too loud.
- `ui_crucible_enter` is the only cue allowed to be loud. It is a door closing behind you.

## API

```js
FH.sound.load(recipesJson)      // accepts the file's { recipes: [...] } or a bare array
FH.sound.play(id, { gain, delay, force })   // -> { stop() }
FH.sound.duration(id)           // seconds, including a layer that starts late
FH.sound.setMuted(true|false)   // starts MUTED
FH.sound.setVolume(0..1)
FH.sound.attach(root)           // binds [data-fh-cue] on pointerdown, [data-fh-focus-cue] on focus
```

Two refusals built into the player, both floors rather than preferences:

- it never creates an `AudioContext` before a real user gesture (a context created earlier is
  suspended, and a suspended context silently plays nothing — which reads as "the audio is
  broken" rather than "the audio has not been unlocked");
- noise buffers are cached per colour. Allocating one per cue is the classic UI-audio leak.

## Open question for the owner (P41, not this session)

The game ships **muted by default**. These cues are authored to be pleasant at the default
volume if that is ever changed, but nothing here changes the default: raising it is a product
decision, and `FIELD_HARDWARE_PROGRAM.md` §7 lists it as a question P41 asks.
