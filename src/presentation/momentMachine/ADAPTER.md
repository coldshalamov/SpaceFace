# Moment Machine adapter (not applied)

Conflicting file: `src/ui/screens/clips.js`.

That screen owns the existing GIF/MP4 export (`exportClip` → `encodeClipBytes`). `src/ui/screens/replay.js` and `src/systems/killReplay.js` stay untouched. The patch below is not applied. `hook.js` only returns a request whose `targetFile` is `src/ui/screens/clips.js` and whose `applied` flag is false.

## Exact patch

`src/presentation/momentMachine/CLIP_EXPORT.patch` is the diff. `git apply --check` accepts it and this campaign does not apply it. It adds one import and `exportLoggedMoment` after `exportClip`. It does not replace `exportClip`, the Replay tape, or the kill-replay recorder.

## Test

`test/moment-machine/moment-machine.test.mjs` reads that patch, checks the path it would edit, and checks `src/ui/screens/clips.js` does not contain `analyzeMomentStream` or `exportLoggedMoment`.
