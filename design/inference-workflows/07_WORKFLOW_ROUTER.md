# Workflow Router — Which Inference Loop to Fire

Use this when the problem is described as a symptom rather than a department.

With no symptom given, run `node scripts/inference-detect.mjs` first: the
director board suggests a mode and lists starved domains. Only eight workflows
have structural metrics feeding them (see `WORKFLOW_INDEX.json` `detect` field);
the other eleven are reachable only through the board's starved / opportunity /
integration / recovery cells — never through a count.

## “The world is empty / nothing happens near me”

Primary: `WF-03` Sector & World Composition, `WF-01` NPC & Living World, `WF-08` player-interruptible activities, then `WF-16` variants/states after an exemplar works. Use `WF-17` when accepted ingredients need to become one route.

## “There are NPCs, but they all look/act the same”

Use `WF-01` for occupations/routes/incidents, `WF-11` for occupational asset families, `WF-16` for useful siblings/states, and `WF-13` for work/traffic audio identity.

## “Combat is still hold-fire-until-dead”

Use `WF-02` enemy ecology, `WF-05` physical tools, `WF-15` TTK/impulse/recovery tuning, then `WF-12` impact/destruction presentation.

## “The Massline/flight/targeting feels weird or overengineered”

Use `WF-18` first to recover the simple contract, `WF-15` for controlled feel experiments, `WF-14` only if information/input remains the issue, and `WF-12` only after the maneuver works.

## “The graphics are dark, primitive, generic or freelancer-ish”

Use `WF-11` for forms/materials/families, `WF-12` for VFX/camera/lighting, `WF-13` for sound, `WF-03` when composition is the real failure, and `WF-17` for a full reference-quality slice.

## “Stations/planets/objects are fixtures or menu entrances”

Use `WF-04`, then `WF-03` for the surrounding pocket, `WF-01` for traffic/work, `WF-08` for activities and `WF-10` for discovery.

## “Mining/automation has no reason to exist”

Use `WF-06` visible value chains, `WF-07` capability/infrastructure progression, `WF-04` exterior industry, `WF-16` visible growth states and `WF-17` for a complete manual→automation→world-change slice.

## “The game needs more weapons/modules/builds”

Use `WF-05`, `WF-07`, `WF-02` and `WF-15`. Do not use `WF-16` until one exemplar is accepted.

## “There are many missions, but they feel repetitive”

Use `WF-08`, `WF-03`, `WF-01`, `WF-09` and `WF-10` depending on whether the deficit is activity, location, participants, consequence or curiosity.

## “The story is thin or delivered badly”

Use `WF-09`, `WF-10`, `WF-01` and `WF-16`.

## “We have good ingredients but the actual game is still not good”

Use `WF-17`. If it reveals a foundational defect, route that to `WF-18`/`WF-15` instead of inventing around it.

## “An agent technically implemented it but missed the point”

Use `WF-18`; make deletion and simplification valid outcomes.

## “We made one good thing; now produce breadth”

Use `WF-16`, with `WF-11` for asset families or the appropriate behavioral workflow.

## “The game cannot support the density/quality we want”

Use `WF-19`; every unit must name the visible content tranche it enables.

## Portfolio combinations

### Lived industrial pocket

```text
WF-03 1x → WF-01 3x → WF-06 1x → WF-08 1x → WF-11 3x → WF-17 1x
```

### Physics-combat recovery

```text
WF-18 1x → WF-15 3x → WF-02 3x → WF-05 3x → WF-12 5x → WF-17 1x
```

### Planetary system expansion

```text
WF-04 3x → WF-10 3x → WF-01 3x → WF-06 3x → WF-08 3x → WF-17 5x
```

### Professional asset multiplication

```text
WF-11 1x → live review → WF-16 3x → composition review → WF-19 1x if scale bottlenecks → WF-11/16 5x
```

### Story-rich lived region

```text
WF-01 3x → WF-09 3x → WF-10 3x → WF-08 3x → WF-16 3x → WF-17 5x
```

Use the smallest workflow that attacks the causal deficit. Do not invoke five departments when one upstream recovery will change the result. Conversely, do not ask a tuning workflow to manufacture missing content breadth.
