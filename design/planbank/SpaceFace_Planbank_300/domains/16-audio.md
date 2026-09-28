# 16 — Action voice, spatial sound and musical restraint

**Current lane:** THE EAR  
**Build-map connections:** PQ-158; CV-EAR, CV-HAND  
**15 proposed packets:** SF-226–SF-240

## Existing foundation, not a blank slate

Audio already has hybrid authored/synth recipes, priority ducking, spatial environment mixing, Massline/bomb families and a self-owned runtime loop. It is init-only in the registry, not an ordinary update-order system.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

Do not add a second audio update loop or AudioContext. Preserve gesture resume, bounded voices, sample licensing and desired-loop recovery. Critical information needs a nonaudio equivalent; loudness is not importance.

## Reusable implementation workflow

1. Follow the canonical event to the current sound binding and priority policy. Check whether a silent result is missing sample readiness, authorization or mixing rather than a missing recipe.
2. Author onset, body and release plus the physical parameter they express. Select one memorable signature and subordinate supporting layers.
3. Use current voice admission, spatialization and ducking. Gate duplicate triggers and make loop stop/restart ownership explicit.
4. Provide concise semantic captions or existing visual equivalent for important direction/state. Keep music and ambient beds out of the way of the action.
5. Test first gesture, mute/unmute, suspended context, repeated events, overlapping sources and pooled/removed entities. Inspect voice counts and release behavior.
6. Listen through a complete fight and a quiet work cycle, not isolated sample playback. Adjust hierarchy and spectral separation before increasing gains or adding layers.

## Ordinary-route proof

Start with no gesture/unlock, enter normal flight, combine engines, rope, impacts and comms, then pause/resume and revisit a quieter destination.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-13: Audio Music And World Sound](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-13_AUDIO_MUSIC_AND_WORLD_SOUND.md)
- [WF-12: Vfx Camera Lighting And Visual Feel](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-226 — A Massline release distinct from a break](../plans/16-audio/SF-226-a-massline-release-distinct-from-a-break.md) — deepening
- [SF-227 — Engine voice that communicates effort, not only speed](../plans/16-audio/SF-227-engine-voice-that-communicates-effort-not-only-speed.md) — deepening
- [SF-228 — A heavy impact with space around it](../plans/16-audio/SF-228-a-heavy-impact-with-space-around-it.md) — deepening
- [SF-229 — Bomb families with recognizable mechanisms](../plans/16-audio/SF-229-bomb-families-with-recognizable-mechanisms.md) — deepening
- [SF-230 — A field heard through its force direction](../plans/16-audio/SF-230-a-field-heard-through-its-force-direction.md) — deepening
- [SF-231 — Comms that yields to the player's immediate problem](../plans/16-audio/SF-231-comms-that-yields-to-the-player-s-immediate-problem.md) — deepening
- [SF-232 — A working place with an audible cycle](../plans/16-audio/SF-232-a-working-place-with-an-audible-cycle.md) — deepening
- [SF-233 — A quiet-sector bed that leaves room for discovery](../plans/16-audio/SF-233-a-quiet-sector-bed-that-leaves-room-for-discovery.md) — deepening
- [SF-234 — Music that follows an actual encounter arc](../plans/16-audio/SF-234-music-that-follows-an-actual-encounter-arc.md) — deepening
- [SF-235 — A successful input with a specific answer](../plans/16-audio/SF-235-a-successful-input-with-a-specific-answer.md) — deepening
- [SF-236 — Spatial sound that remains attached through origin shifts](../plans/16-audio/SF-236-spatial-sound-that-remains-attached-through-origin-shifts.md) — deepening
- [SF-237 — A sound budget that preserves the player's own verb](../plans/16-audio/SF-237-a-sound-budget-that-preserves-the-player-s-own-verb.md) — deepening
- [SF-238 — Audio resume without a burst of expired history](../plans/16-audio/SF-238-audio-resume-without-a-burst-of-expired-history.md) — deepening
- [SF-239 — Captions that carry useful semantics without becoming a log](../plans/16-audio/SF-239-captions-that-carry-useful-semantics-without-becoming-a-log.md) — deepening
- [SF-240 — An audio family accepted in the whole mix](../plans/16-audio/SF-240-an-audio-family-accepted-in-the-whole-mix.md) — deepening

## Owner reading map

- [`src/audio/audioSystem.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/audioSystem.js)
- [`src/audio/cuePriorityBus.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/cuePriorityBus.js)
- [`src/audio/environmentMix.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/environmentMix.js)
- [`src/audio/masslineInstrument.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/masslineInstrument.js)
- [`src/audio/bombAudio.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/bombAudio.js)
- [`src/audio/themeMatrix.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/audio/themeMatrix.js)
- [`src/data/audioRecipes.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/audioRecipes.js)
- [`src/ui/captions.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/ui/captions.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
