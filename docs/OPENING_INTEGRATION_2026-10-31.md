# Opening experience integration — 2026-10-31

Base: `31a011002036e625c971d315f8da08a7a32687ee`. This candidate reconciles the
previously preserved Helios and Training increments onto current source. It is
not a replacement tree and does not include the separate older campaign overlay.

## Player outcomes

- At Helios, Kessler offers the actual next starter ticket and acknowledges only
  settled work. Active jobs, hull changes and missing equipment remain truthful.
- Hitch work follows available Helios iron, including dormant field records.
- Wasp work follows Nim Gatecut's moving hull rather than the station anchor,
  including its durable restored target identity. Existing ram/payout rules stay.
- Genuine first buoy delivery can trigger existing receiving machinery within
  the receipt's original time window. A queued but unseen scene can now retry
  after sector exit; a scene that fired is not duplicated. This was a reproduced
  integration defect, fixed by recording presentation only when the seam fires.
- Explicit Swarm Training offers actual fitted primary fire or physical debris,
  respects live bindings and optional release, and announces the held pack only
  on real admission, using its actual position. Ordinary Swarm remains immediate
  horde. Fortify's rerouted source-gate identity is preserved.
- Authored opening banks use current rating eligibility and stable slot identity;
  current collider-based admission remains authoritative.

## Preservation

Current mission/bar changes, native radii, optic spacing, brood/combat, worker
registries, save/quit, station loading and renderer code are retained. `index.html`
retains all current hints and adds only the newly required eager `verbSpeech.js` hint; obsolete preload hints are not restored.
All 779 existing npm scripts and non-script package fields remain unchanged;
eight focused test entry points are added. No models, assets, save schema,
credentials, CI workflows, deployment or new reward owner are changed.

## Verification

154 focused tests pass together: 76 Helios, 69 Swarm/arena and 9 mode-boundary.
The new queued-scene regression failed before its fix. Native production domain
differ → structured clone → facade tests retain receipt provenance and next-ticket
inputs, and actual bridge tests retain receiving/admission/voice payloads.
Six real Node imports pass without global shims: missions, survivalWave,
stationSideEventDirector, barContacts, simReadModel and simEventBridge.

A historical arena test assumed its first seed filled every target slot. The
untouched current baseline also admits 17 then refills to 18 under native collision
admission. Its replacement checks retained survivor identity/position and the
actual tier cap instead of pinning obsolete admission count. Runtime was not
changed to satisfy that test.

These are source/behavior and worker-wire checks. This sparse source materialization
is not a full application build. Rendered Adventure/Training play, full input-driven
work/settlement/Continue, performance, complete baseline suite and CI remain unrun.
Do not infer opening or whole-game acceptance from the focused test count.

## Next validation

Use the normal menu → Adventure → Helios → Bar → Kessler → Accept + Track route,
complete each starter job with ordinary controls, inspect earned receiving activity
and Continue, then compare ordinary immediate-horde Swarm with explicit Training.
Preserve all upstream open acceptance gates and existing lane owners.

## CI follow-up

The first PR run caught one introduced eager-source preload omission:
`./src/onboarding/verbSpeech.js`. The follow-up adds that single sorted entry,
preserving all 1,508 existing generated hints and hand-maintained hints.
Retail boot smoke passed on the first commit. Mobile browser jobs stopped in
packaging because their sparse checkout omits the existing Ruckus asset directory;
the same failure was reproduced in earlier PR runs with identical relevant
workflow/packaging/assets. The minimal workflow correction is pending and is not
part of this source fix. Other repository-wide check failures remain separately
under investigation; no all-CI-green claim is made.
