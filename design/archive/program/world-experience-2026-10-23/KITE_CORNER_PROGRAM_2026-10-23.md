# Kite’s Corner: The falling corner

## Player experience

At Ceres, an optional **Kite’s Corner** button beside Help opens a short service-room programme in the existing station workspace. It introduces the Red Kite falling corner, shows a wide pass, then a cleaner pass, and closes with a comparison. These are recorded native flight poses presented as a course diagram, not a live game camera or an official race broadcast.

**Return to services** restores the previous facility and returns keyboard focus to the programme button. The destination rail and Undock remain available. Choosing a destination also leaves the programme. The feature does not add a rail destination, overwrite destination memory, start a job, award a reward, or write campaign/race state. Existing station actions retain their own behavior.

## Actual flight, not invented results

The offline recorder uses the existing simulation, `flightV3`, native physics and `killReplay` pose producer. Both passes use a **Hornet, medium class, radius 16 WU**, with the same spawn and approach inputs. After spawning, the recorder supplies controls only: no pose or velocity corrections, teleports, or fabricated crossing samples. The lesson is turn timing, not a generic braking/boost tip. The second pass is cleaner, not claimed optimal.

Both runs enter the same section at tick 27 and cross gate 1 at tick 134. The entry plane is 300 WU before the gate along the incoming course direction; the exit plane is 350 WU beyond it along the outgoing direction.

| Pass | Exit tick | Section ticks at 60 Hz | Exact section time | Display |
| --- | ---: | ---: | --- | ---: |
| Wide / Left it late | 316 | 289 | 289/60 s = 4.816666… s | 4.82 s |
| Cleaner / Make the handoff | 275 | 248 | 248/60 s = 4.133333… s | 4.13 s |

The replay contains 53 and 46 actual 10 Hz pose frames respectively. The nominal gate aperture is **140 WU**, or 70 WU on either side of the course centre. The recorded Hornet’s centre must pass within **±54 WU**, accounting for its 16 WU hull radius. Earlier light-class and 247-tick cleaner drafts were superseded by these matched-approach medium-hull recordings. The corrected preview makes the nominal aperture and hull clearance explicit.

## Reproducibility and source provenance

Recording source is pinned to public commit `736b4b7bca6ce41672f39ef1981ccb81c8df3bfe`. All 277 imported source modules were checked against exact public Git blob hashes. The source map began at `eff6c16e528719d27b57b51a5b8a7258acfcc4ec`; the verified source delta updates only `crew.js` and `longBerth.js`. Native controller, physics, ship, course and replay modules retain their verified public hashes. Two final recordings in separate processes were byte-identical.

- Full native tape SHA-256: `e3777528ba0d4fb1e944f86971d0eeaa43dbb0cc335dce630be7209f9d8f0aad`
- Recorder SHA-256: `6bc353ef61dd44fd05316eaf35b3d5f5ccf20ae3665177a9e462626ab41f5a35`
- Canonical 277-module hash-ledger SHA-256: `e79c6b1e3476be13138b435a0db7f6c66292b4fbd9047209276f1468560266c5` (JSON keys sorted, compact separators).

The viewer-test helper closure was checked separately, not inferred from the recording closure. The exact bytes loaded for `src/ui/orrery/svg.js` match public Git blob `8a681b1283871d4b44439a40381ad1f890407852` (SHA-256 `ec92f1b348ef275a370d855d4fb8402369a8c7edb9d462fc2b31ca363d932b6d`). `src/ui/orrery/motion.js` matches blob `fe721b64fe37b75f89bbb9c12bc6e7e83f92653c` (SHA-256 `d6b91527f27e6cf6eef7f514a17105d37975d3f936596d987f72f20e15eb0878`). Test import logs record these same blob hashes; the loader rejects mismatched bytes.

## Focused verification and fixes

The focused `test/kite-corner-program.test.mjs` suite passes **15/15**, with independent source review. Syntax checks pass for the data, viewer and station owner. Tests cover actual data/course binding, malformed/stale tape rejection, the measured path difference, bounded playback, service handoffs, Ceres-only discovery, focus return, mission-attention guards and state preservation.

Reduced motion starts paused with selectable completed stills. Preference changes update controls without reopening. Each pass holds its actual final recorded frame briefly so the viewer visibly completes the exit; this presentation hold does not change recorded elapsed time or generate another physical sample. Hide, undock, station change and dispose cancel playback and detach document/bus listeners. Mission updates do not reopen a hidden facility or interrupt the programme. Initial failing boundary/harness logs and superseded recording evidence are retained with the recovery evidence.

## Integration and acceptance limits

The station mount depends on [PR #558](https://github.com/coldshalamov/SpaceFace/pull/558), reviewed prerequisite head `700f106ddf23e9c9583ac865f143a25cb134eba8`. That repair removes only dangling calls to a station-life module that was never delivered. Long Berth lookup and arrival receipts remain intact. The Kite mount is a separately identifiable delta on that repair, not a broader station rewrite.

This is focused source, native-recording and deterministic DOM/lifecycle evidence. **No browser playtest, full game boot, full station renderer import, rendered station screenshot, native-UI input acceptance or normal top-down visual acceptance has been performed.** Owner tests execute the actual mount/navigation/refresh bodies with explicit service/DOM doubles. Viewer tests exercise the actual viewer with controlled animation callbacks. Native flight recording validates the recorded path, not the complete UI runtime. Package registration/publication and broader acceptance must preserve these distinctions.
