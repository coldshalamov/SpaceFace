# PQ-187.02 remote handoff

**Status: NOT DONE.** The kit foundation is implemented, but the variable Bricolage binary has not
been vendored, Instrument Sans tabular figures have not been verified against its real bytes, and
the four requested repository commands have not completed. This is not a leaf-closeout receipt.

Base: `873584d9e6301e23edfc599bdf48f74c16bc787a`.
Branch: `codex/chatgpt-pq187-02-20260906`.
Early structural checkpoint: `b6a905565ae3f6210ac294598614ad28e3c3c4d9`.
Remote-only work; no unpushed Codex state was available or used.

## Delivered foundation

`styles/kit.css` is opt-in. `_uilab.html` loads it and the existing `styles/fonts.css`; no runtime
screen or old stylesheet has been migrated. The page contains words, disabled/current/danger
states, foot navigation, twelve-row selectable/sortable tables and lists, three hero sizes, all ten
type tokens, prose/empty states, inputs/select/range/toggle, pin/leader, three existing Helix crest
sizes, rule, meter, temperature controls, reduced-motion control and a finite stamp demonstration.
Fixture prices and inventory are not an economy change. The page intentionally has no pretend hull.

The existing snapshot probe's `data-lab="shots"` / `data-shot` interface is retained. Sections are
`kit-words`, `kit-register`, `kit-components`, `kit-type` and `kit-temperature`. Optional
`?shot=kit-register&temp=docked&motion=reduce` isolates a section. The old probe is unchanged.

Module entry point: `src/ui/kit/index.js`.

- `words`, `rows`, `table`, `hero`, `title` and `el` provide the component DOM. Keyboard listeners
  are component-scoped. Navigation skips disabled words, stops silently at boundaries and keeps
  one roving tab stop. Sorting and selection retain native table geometry and visible focus.
- `bindTemperature(bus, state)` returns an apply callback with `.dispose()`. It reads, never writes,
  game state. Works wins over Crucible, then wanted, docked and the ordinary screen/flight state.
  The real Crucible owner uses `state.run.kind/phase`, not the illustrative `state.crucible.run`
  path. The mode, dock, heat, run and screen-top events are subscribed and released together.
- `cut(previous, next, { state })` requires a named state and changes visibility synchronously.
  `settle(next, { state, from })` and `stamp(elements, { state })` return cancellation functions.
  Each settle is 140 ms; replacement cancels old work. OS or application reduced-motion makes a
  plain cut, including when reduction changes during an active CSS settle. No idle motion exists.

The scale uses dimensionally valid `100vw / 1920px`, not length-valued `/ 1920`. Reference sizes are
12/14/16/20/28/40/56/80/112/160, scaled 0.75–1.25; the three smallest retain a 12 px floor.
Dense rows retain the direction sheet's 32 px minimum. Essential small descriptions and table
headings use 62% bone: 38% bone is only approximately 3.05:1 over kit ink, versus 6.41:1 at 62%.
The 38% token remains available for disabled/decorative use. This calculation is not a WCAG pass
against the live world. Font synthesis is disabled on display numerals/headings so a missing 800
face is not disguised by artificial bolding.

## Sound ownership

`bindSound(bus)` acquires the bounded `palette.js` profile on the existing `RECIPES` array and
returns a disposer. `audioSystem.js` and `synth.js` cache references to those objects; the profile
preserves object identity instead of replacing array entries. All eight IDs are checked before
any mutation. Reference-counted leases restore the original complete descriptors after the last
release, including original repeats/reverb fields. Import alone does not install the profile.
No existing recipe source file is edited.

Five semantic calls (`open`, `close`, `move`, `confirm`, `deny`) go through `audio:cue`. Dock,
undock and wanted keep their existing game emitters; the kit does not emit duplicates. The eight
recipes are finite, single sine oscillators with low-pass filters, bounded gain and no random
pitch, layers, reverb tail, repeats or loop. The existing engine retains all context creation,
voice limits, mute, volume, priority and teardown ownership. The lab binds a **muted event
observer**, not a second mixer or a new AudioContext; it is not an audible audition.

The synth's envelope includes a fixed 40 ms decay and has an additional 20 ms post-envelope
cleanup tail. The move envelope is 51 ms (71 ms including that owner's cleanup), not a claimed
60 ms total voice lifetime. Other envelope durations are 224/224/265/243/790/520/1090 ms for
open/close/confirm/deny/dock/undock/wanted. Audition and state-event integration remain local.
The old runtime `ui_hover` emitter is not removed by this packet; no other screen is migrated.

## Font blocker and executable closeout

The base only declares Bricolage at weight 600. It is **not** the required three-axis face.
`styles/fonts.css` and the existing font binaries are unchanged by this remote delivery.
The OFL has been copied to `styles/fonts/bricolage-grotesque-OFL.txt` (source: `google/fonts`
blob `a397658a5c4ab27c349964553b7caca61a4346f6`; trailing whitespace normalized).

`styles/fonts/vendor-kit-font.py` provides the remaining operation, not evidence it happened:

```sh
python styles/fonts/vendor-kit-font.py --fetch
python styles/fonts/vendor-kit-font.py --check
```

It requires Python `fonttools` and `brotli`. The helper fetches the immutable `fontsource/font-files`
blob `42c558b61ba40e340cfccf50786dcda816f3d30b` (Latin, all three axes), verifies Git blob identity
and WOFF2 contents, requires `wght=200..800`, `wdth=75..100`, `opsz=12..96`, and checks ASCII coverage.
It verifies the unchanged base Instrument Sans blob `8611e41b14c75cfc8360e50d0d22a22d20a1de50`,
instantiates weights 400/500/700, applies its `tnum` substitutions and requires equal advances for
all ten digits. Only after those checks does it write the new font and append the variable face
to `fonts.css`, preserving its existing contents. A differing existing face or declaration is
refused, not overwritten. `--check` performs no network access or writes.

Remote `--fetch` failed: `URLError: <urlopen error [Errno -3] Temporary failure in name resolution>`.
Remote `--check` correctly failed: `FileNotFoundError: NOT DONE: variable font has not been vendored`.
The GitHub text API worked, but direct clone/font downloads did not produce a complete checkout
or verified font bytes in the execution environment. Do not promote the font declaration or
claimed metrics merely because the helper exists.

## Checks actually performed

| Check | Result and boundary |
|---|---|
| `node --test src/ui/kit/kit.test.mjs` | 7/7 pass: state precedence, subscriptions/disposal, eight envelope bounds, profile identity/restoration, atomic validation, reduced cut, motion replacement/cleanup. Recipe fixtures, not an audible game. |
| JS syntax; Python helper compilation | Pass for authored modules/helper. |
| Offline Chromium 144 DOM composition at 1280×720, 1920×1080, 2560×1080 | Pass for declared type scale/floor, row minima, no horizontal document overflow, table half-frame fit, 323 DOM elements, keyboard navigation, temperature switching, reduced cut and market selection. Fonts fell back; a synthetic recipe registry was used. These are not normal-route or three-width acceptance captures. |
| `npm run check:baseline` | Attempted; blocked by `ENOENT` opening `/mnt/data/pq187/SpaceFace/package.json` in the sparse verification mirror after clone failed. Not an inherited repository red. |
| `npm run probe:frontend-snapshot` | Not completed. No full checkout; normal localhost browser navigation also failed with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Offline composition is not a substitute. |
| `npm run check:type-floor` | Not run: same missing complete pinned checkout. The offline 12 px measurements are narrower evidence. |
| `npm run check:wcag-contrast` | Not run: same missing complete pinned checkout. No inherited failure or repository-wide green is claimed. |

## Codex local closeout

Finish and commit the font operation first, then run all four requested commands on the actual
candidate. Record an exact inherited red only if reproduced at the pinned base. Audition through
the existing audio owner, including muted/zero-UI-volume behavior and no duplicate dock/undock/
wanted voices. Wire temperature and sound lifetimes only in the separately owned route integration.

The inspected hull seam is `src/ui/shipPreviewMount.js`, base blob
`22d5e3718c900300a2929229e74766785d77c3fd`: `createShipPreviewMount` constructs a WebGL renderer
directly and exposes `onFirstFrame` and `onAssetSettled` options. Constructor failure must remain
visible; a background wash or dummy hull does not close it. The inspected matrix capture path,
`scripts/capture-ui-matrix.mjs` blob `70bc1eaaf061ca1195415f943ad938a57f4dae3b`, launches headless
without explicit GPU flags and applies neutral ground before the title is ready. Its regression
frames therefore do not prove a visible live hull.

Codex owns headed/GPU hull readiness, 1280/1920/2560 captures, candidate/route/settings/hash-bound
artifacts, memoryless visual review, performance/mute checks and acceptance. No title route,
PQ-187.03 work, global ledgers, queue/NOW records or old screen styles were changed here.
