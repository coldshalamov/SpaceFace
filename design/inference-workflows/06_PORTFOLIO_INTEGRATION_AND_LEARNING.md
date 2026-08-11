# Portfolio Integration, Multiplication, and Learning

## Why this step exists

A repository can contain excellent isolated assets, mechanics, events, and documents while the game remains empty or incoherent. Value is harvested only when accepted units share a route, reinforce one another, and create sustained play.

## The portfolio hierarchy

### Unit

One independently accepted piece: an occupation, enemy, world site, weapon, narrative thread, asset family, feel repair, or activity.

### Family

Related units sharing a coherent grammar: cargo assets, mining occupations, impulse weapons, wreck states, faction vessels.

### Pocket

A visible local composition where families perform a function and create opportunities.

### Sector

Several pockets connected by traffic, traversal, law/crime, landmarks, and visual rhythm.

### Corridor/session

Several sectors and loops producing a 30–90 minute arc.

A workflow should state which level it is changing. Do not claim sector depth from a source-only family.

## Integration sequence

1. **Freeze the accepted units.** Record exact identity and current review verdict.
2. **Compose before multiplying.** Place/wire the minimum set in one ordinary route.
3. **Observe competition.** Watch for visual clutter, duplicated roles, repeated timing, or system contention.
4. **Tune hierarchy.** Decide what is foreground, midground, background, common, rare, loud, quiet.
5. **Expose player opportunity.** The portfolio must produce follow/help/steal/fight/salvage/build decisions.
6. **Preserve causality.** Cargo, damage, law response, construction, and aftermath should follow current owners.
7. **Review the route.** Cold 5–10 minute portfolio review.
8. **Multiply only the successful grammar.** Build siblings, states, and new compositions after the exemplar works.

## Foreground, midground, background

Professional density uses layers.

### Foreground

Fully simulated, interruptible, collision-aware content inside immediate play.

### Midground

Real actors or structures with simplified updates, still promotable to foreground when approached.

### Background

Cheap but truthful signs of activity: distant work lights, small service craft, cargo motion, machinery, mining flashes, route crossings. Background activity may be presentation-only while distant, but it must not pretend to be an interactable actor that vanishes on approach.

A 5x portfolio should deliberately allocate units across these layers where relevant.

## Multiplication after acceptance

Once a pattern receives KEEP, ask:

- What functional siblings belong to the same manufacturing language?
- What state variants tell useful stories?
- What faction modifications change operation, not just paint?
- What composition variants produce different player decisions?
- Which parts can share atlases, sockets, LODs, VFX profiles, job kernels, or event structures?
- Which qualities must remain unique to protect identity?

This is the correct use of inference for “more.”

## Propagation ladder

1. one accepted exemplar;
2. one accepted family;
3. one accepted pocket composition;
4. one accepted sector/reference slice;
5. two contrasting sector applications;
6. only then broader galaxy rollout.

Do not infer that a system generalizes because one data row passes tests.

## Portfolio descriptors and pairwise distinctness

Individually accepted units can still form a weak portfolio. Before closing a
3x/5x tranche, place every unit on these descriptors and check pairs:

- player verb; silhouette; tempo (burst/sustained/ambient/decay);
- emotional tone (industry/threat/comedy/awe/quiet/dread);
- frequency (common/intermittent/rare/hero);
- scene layer (foreground/midground/background — see the camera-band budget in
  `design/vision/GAME_DIRECTION_EXPANSION.md` §4);
- spatial pattern; social/economic purpose; failure state; player relationship.

Two units sharing most descriptors are one unit wearing two names. A portfolio
that is all-foreground, all-burst, or all-industry fails even if every unit
passed review. Deliberate imbalance is fine when stated (a quiet sector SHOULD
skew quiet); accidental imbalance is the defect.

Note on concentration metrics: the detector flags label concentration in
registries, but uniform distribution is NOT the play target — good ecologies are
Pareto-shaped (many common grunts, rare specials). Fix concentration by adding
missing *kinds*, never by flattening spawn frequency.

## Learning record — write it to memory, not prose

Every run (1x included, and runs that shipped nothing) records itself:

```bash
node scripts/inference-record.mjs run --mode <mode> --domains <WF-XX,...> [--scope S] [--nx N]
node scripts/inference-record.mjs unit ...   # per unit: accepted AND rejected AND cut
```

That machine record (decay, saturation, blocked fingerprints, failed-twice,
reference rotation) is what future runs actually consume. The prose recipe below
is kept ONLY for what the fingerprint cannot carry — write it into the tranche's
receipt or portfolio review record, not into a new standalone document:

```text
Experience thesis:
Shared grammar and distinctness axes:
Successful owner seams:
What should be reused / what must remain authored:
Next sector/system suitable for propagation:
```

## Preventing a warehouse of parts

A source-only pack is allowed when its integration dependency is explicit, near-term, and bounded. Otherwise, prefer fewer production units that enter the game.

Reject or defer a portfolio when:

- no current pocket or route needs it;
- the integration owner is unknown;
- all value depends on future frameworks;
- contact sheets are the only evidence;
- variants lack distinct function/state/composition;
- the portfolio would exceed visible density or performance needs;
- the game still lacks a good exemplar of the underlying interaction.

## Ceres-first relationship

The professional Ceres reference-sector program remains the current benchmark for proving the method. These workflows may produce units for Ceres or later sectors, but they do not bypass the R5/five-minute gate or Physics-as-Spectacle sequence.

After Ceres, the strongest propagation tests are contrasting applications:

- Helios: commerce, service, customs, passenger/courier density;
- Tethys: gravity/atmosphere, tanker logistics, mass-driver theft;
- a lawless/research region: sparse but unusual activity and traversal.

The recipe should survive contrast, not clone Ceres everywhere.
