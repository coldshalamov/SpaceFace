# SFQ-P20 — Sound, music and silence as mechanical information

Without looking at a meter, the pilot can hear mass, load, danger and release.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 2. **Existing owners to search:** PQ-158 / current audio recipes and voice arbitration; F-series audio requirements.

## Baseline and uncertainty

Audio systems and recipes already exist. Old documents claiming muted or identical sounds are not proof of present defects; audition the current game before replacing anything.

Sources: [S01](../audit/SOURCES.md#s01), [S07](../audit/SOURCES.md#s07), [S14](../audit/SOURCES.md#s14), [S21](../audit/SOURCES.md#s21). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/audio/audioSystem.js`
- `src/audio/bombAudio.js`
- `src/data/audioRecipes.js`
- `src/systems/barkDirector.js`
- `src/render/feel.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B191](../builds/SFQ-B191.md) | Hear the actual weight of contact | Scout scrape and freighter slam differ in transient, pitch, body and decay. |
| [SFQ-B192](../builds/SFQ-B192.md) | Make the Massline speak load | Latch, increasing tension, safe release and break have distinct sounds. |
| [SFQ-B193](../builds/SFQ-B193.md) | Give each weapon a sonic verb | Gun, shove, field, parasite and pressure sac carry different timing and texture. |
| [SFQ-B194](../builds/SFQ-B194.md) | Make engine audio track intention and motion separately | Thrust, boost, idle and inherited speed remain distinguishable. |
| [SFQ-B195](../builds/SFQ-B195.md) | Keep threat information audible under density | Critical warnings survive explosions without a wall of alarms. |
| [SFQ-B196](../builds/SFQ-B196.md) | Give ordinary work a convincing soundscape | Mines, yards and traffic produce local purposeful sounds. |
| [SFQ-B197](../builds/SFQ-B197.md) | Contrast fungus with machinery | Biological tension and ancient precision sound like different material processes. |
| [SFQ-B198](../builds/SFQ-B198.md) | Make music support pace without stealing it | Exploration, danger and recovery transition coherently around actual play. |
| [SFQ-B199](../builds/SFQ-B199.md) | Finish audio settings and delivery | Device changes, mute, focus, restart and volume controls behave predictably. |
| [SFQ-B200](../builds/SFQ-B200.md) | Mix by the weakest actual route | Sound quality is judged in play, not isolated asset auditions. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I077](../inference/SFQ-I077.md) | Loop dies with its emitter | No hum remains after the originating object is gone. |
| [SFQ-I078](../inference/SFQ-I078.md) | Denied action differs from success | Repeated held input does not retrigger the cue each frame. |
| [SFQ-I079](../inference/SFQ-I079.md) | Caption names the actual warning | The textual warning agrees with the action and direction when known. |
| [SFQ-I080](../inference/SFQ-I080.md) | Volume change reaches both shells | Browser and Electron use the same stored mix value. |

## Playable scenes

Use a current ordinary route that exposes the stated player problem.

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
