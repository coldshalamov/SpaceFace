# 09 — Sound (the last lane; the game must read muted)

**Director, 2026-11-18.** Ruling R8: the owner plays with sound off, so **every sound has a visual
twin** and the game reads completely muted — that rule binds every other page. Audio still gets an
A-list pass because players and viewers have sound on. This lane runs last and never displaces picture
or feel work. Doc 18 §1 (the rope as an instrument, one voice per gun family, places that keep time,
layered music, silence used) is the content and stands.

## What is there (`02` D12)

`assets/audio` is 134 MB, produced by `generate-samples.mjs` and `generate-themes.mjs`; the mixer and
the score director (`src/audio/scoreDirector.js`, `src/audio/masslineInstrument.js`) are good
architecture driving synthesised loops and one-shots. The size ceiling in doc 18 (~12 MiB) is far
exceeded by uncompressed WAV.

## The plan

1. **Format first:** encode everything to Opus/OGG (stereo where it matters); target ≤ 20 MB.
2. **Thirty hero sounds** from professional royalty-free libraries (e.g. the Sonniss GDC bundles,
   free for commercial use), layered and pitched by physics through the existing mixer: latch clack,
   tension creak that rises with load, release twang and its perfect-release overtone, impact crunch
   scaled by mass, shield shatter, hull breach, explosion with a sub-drop, boost ignition, one voice per
   gun family, the freight horn, the crusher, the furnace.
3. **Music:** a licensed or commissioned score — Swarm's driving loop that adds a layer every ten
   rounds and follows the style meter (`04` §4); town themes in quiet/working/trouble layers. Generated
   music only if it survives a blind comparison against a licensed track.
4. **Real space for reverb:** convolution impulse responses for hangars, corridors and the board's
   tunnels, replacing noise-times-decay reverb (`src/audio/environmentMix.js`).
5. **The visual twin check:** for each of the thirty hero sounds, name its picture (the creak = the
   cable's colour; the overtone = the release flash; the horn = the lane lights).

## Done when

A stranger listening with eyes closed to thirty seconds of Swarm can tell a throw from a gunshot from
a collision; the build's audio is ≤ 20 MB; muted play loses nothing.
