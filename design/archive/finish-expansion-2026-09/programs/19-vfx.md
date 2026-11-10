# SFQ-P19 — Force-readable VFX with materially distinct lifecycles

The player sees where force began, what it acted on, and what continued after the source stopped.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 2. **Existing owners to search:** PQ-134 / PQ-139 / current material VFX owners; effect briefs F01–F32.

## Baseline and uncertainty

The current VFX standard explicitly rejects both generic ball-puffs and thin/frozen wire effects. It calls for substantial evolving material, unequal motion, local contact and persistent cooling. These tasks refine existing owners, not install another VFX engine.

Sources: [S01](../audit/SOURCES.md#s01), [S13](../audit/SOURCES.md#s13), [S21](../audit/SOURCES.md#s21). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md`
- `src/render/vfx.js`
- `src/render/actionVfx.js`
- `src/render/vfxProfiles.js`
- `src/render/bombPresentation.js`
- `src/render/vfx/statusMatterVfx.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B181](../builds/SFQ-B181.md) | Make nozzle and history agree | Current thrust and the actual flown path look connected but remain separate truths. |
| [SFQ-B182](../builds/SFQ-B182.md) | Make each weapon family visibly distinct | A player recognizes a shove, coherent beam, ballistic hit and reactive material by motion and shape. |
| [SFQ-B183](../builds/SFQ-B183.md) | Make impulses explain displacement | A shove or slam depicts the actual contact point and direction before its aftermath. |
| [SFQ-B184](../builds/SFQ-B184.md) | Give fields volume without hiding the fight | Well, Repulsor, Tarburst and admitted precursor fields have distinct substantial forms. |
| [SFQ-B185](../builds/SFQ-B185.md) | Make surface reactions follow matter | Goo, burn, shield and fracture effects conform to the affected object and state. |
| [SFQ-B186](../builds/SFQ-B186.md) | Make destruction depend on material and cause | Rock, armor, reactor and volatile cargo fail differently. |
| [SFQ-B187](../builds/SFQ-B187.md) | Show biological and machine work | Feeding, relay pulses, repair, token transfer and containment are animated processes. |
| [SFQ-B188](../builds/SFQ-B188.md) | Budget visual attention | Critical threat, player action, reward and ambient texture have a stable hierarchy. |
| [SFQ-B189](../builds/SFQ-B189.md) | Harden every effect lifecycle | Spawn, pause, source death, rebase, menu, load and disposal are correct. |
| [SFQ-B190](../builds/SFQ-B190.md) | Converge effects in real combinations | The final art reads when several tools and materials interact. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I073](../inference/SFQ-I073.md) | Release stops new emission | Existing residue cools, but no new active parcel appears. |
| [SFQ-I074](../inference/SFQ-I074.md) | Effect anchor survives origin shift | The same contact stays on its body before and after rebasing. |
| [SFQ-I075](../inference/SFQ-I075.md) | Paused material stops advancing | Pause and resume do not jump the consequential animation. |
| [SFQ-I076](../inference/SFQ-I076.md) | Minor impact keeps its own scale | A scrape remains a scrape and a lethal slam still gets its large response. |

## Playable scenes

Use a current ordinary route that exposes the stated player problem.

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
