# Moment Machine adapter (not applied)

The selector and the exporter are callable without editing the live screens. This note is the withheld last step. Do not treat it as landed.

## Left untouched

- `src/ui/screens/clips.js` — existing Clips reel and `encodeClipBytes` GIF/MP4 path
- `src/ui/screens/replay.js` — thirty-second Replay tape
- `src/ui/screens/clipExport.js` — current file encoder
- `src/systems/killReplay.js` — Adventure tape producer
- `src/sim/killcamTape.js` — five-second kill-cam ring
- `src/chronicler/**` — fact ledger
- `src/render/cameraDirector.js` — live camera

Those files stay the owners of recording and of the current buttons. Moment Machine only reads the shapes they already publish.

## What the screens would call

Inside the existing Clips export action, after the player has a recording and without replacing that action:

```javascript
import { analyzeMomentStream } from '../../presentation/momentMachine/index.js';
import { resolveReplayRecording } from './replay.js';

const recording = resolveReplayRecording(ctx);
const analysis = analyzeMomentStream({
  adventureTape: recording,
  chronicle: ctx.state && ctx.state.chronicler,
});
const request = analysis.exportRequest;
```

`request` is `{ action: 'export-selected-moment', momentId, inTick, outTick, format: 'webm', replacesReplay: false, replacesLiveCamera: false }`. The screen would pass that id to the CLI. It would not hide the Replay instrument, would not start an always-on encoder, and would not write ship positions.

Encode stays offline:

```bash
node tools/moment-machine/cli.mjs ingest --tape recording.json
node tools/moment-machine/cli.mjs batch --out tools/moment-machine/out
```

If `recording.samples` is absent, ingest reports `tape-positions-unrecorded` and the shot plan does not invent pre-roll. The five-second kill ring is shorter than fifteen seconds, so it is not exported as a moment.

## Conflict

`src/ui/screens/clips.js` and `src/ui/screens/replay.js` are shared with the ORRERY frontend lane and with other campaign agents in this checkout. This campaign does not edit them. Apply the import above only when those paths are free.
