<!-- LIFETIME: ACTIVE_PACKET -->
# Massline presentation UVP — tumble body language, force neon, fling feel

```yaml
queueId: MASSLINE-PRESENTATION-UVP
lifecycle: claimed
acceptance: unproven
packetRevision: 1
owner: grok-implementer
baseRequirement: master; preserve concurrent dirty renderer/UI foreign work
related: design/PHYSICAL_PLAY_GRAMMAR.md §9; MASSLINE_PHYSICS_HANDOFF.md §3.4; PQ-023 leaf language (not reopening closed gold-corridor milestone)
```

## Outcome

When the player flings, whips, or disables a ship, the victim **looks** helpless for the whole
status window: multi-axis thrash, failing RCS, spin ribbons, dead main drive when drifting, and a
clear recover settle. Force cues (taut Massline, throw, whip, continuous tumble, impulse charges)
read as the brightest layer against grey hulls. Clean/razor releases, important tumble starts, and
whip severity tiers punch the same feel layer as kills/boost/snap.

Ordinary route: latch hostile → orbit/reel → release throw or whip into body → observe sustained
tumble language + neon force beat + camera/feel punch → recover cue when RCS catches.

## Multi-pass plan review (measure twice)

### Pass 1 — first cut (scope dump)

| Slice | First idea | Risk |
|---|---|---|
| A Body language | Full 3-axis mesh root rewrite + per-NPC RCS fleet admission | Touches dirty `renderer.js`; caps/perf; sim bleed |
| B Force neon | Global bloom raise + retune every VFX handler | Washes hulls; fights restraint tests |
| C Feel | Long hit-stop on every tumble | Nausea; motionReduce gap; spam in multi-target flings |

### Pass 2 — second cut (constraints first)

Constraints from higher authority and live tree:

1. **Presentation only** — no physics authority, tumble scheduling, or player-tumble immunity changes.
2. **Disjoint from foreign dirty paths** — large concurrent `renderer.js` / sandbox / prewarm work is protected; prefer new pure modules + existing pitch/VFX/feel owners.
3. **PQ-023 gold-corridor is closed** — this is a new UVP leaf, not a milestone reopen.
4. **Player never tumbles** — body language is NPC/victim (+ drive-disabled drift), not player self-spin cinema.
5. **Pure functions first** — test pose intensity, neon scale, feel selection without Three/DOM.
6. **Additive continuous state while status is live** — one-shot puffs alone fail the “if you can’t see it” product bar for sustained control loss.

Best shape after pass 2:

- **A:** Drive `entity.bank` / `entity.pitch` (already applied to hull in presentation pose) from
  pure tumble/drift mapping + attach `entity.presentation.tumble` intent for VFX. Continuous thrash
  puffs and spin ribbons via pooled VFX, not full NPC RCS fleet rewrite. Dead thruster by zeroing
  presentation drive scale when drifting. Recover already emits `massline:tumbleEnd` — feel + short
  settle cue consume it.
- **B:** Per-cue neon multipliers on Massline force lanes only (taut ribbon intensity, throw/whip/
  tumble presentation styles, charge detonation flash/light). Hull materials untouched.
- **C:** Pure `resolveMasslineFeelPunch` + `feel.js` subscriptions for `tether:releaseRated`,
  `massline:tumbled`, `tether:whipImpact`; motionReduce returns informational null / no vestibular.

### Pass 3 — third cut (failure modes)

| Failure | Mitigation |
|---|---|
| Bank fight with flight bank writer | While tumbling/drifting, presentation **owns** bank/pitch for that craft this frame (last writer before render). Flight authority for control remains zero via existing tumbleStates. |
| Continuous VFX spam / pool blowout | Cadence-gated thrash (≤ ~12 Hz) and capped particle budgets per ship; reduced-flash shrinks counts. |
| Feel spam on swarm tumbles | Importance gate: named/ace/player-adjacent tumble full punch; ordinary thrash reduced; whip tiers scale trauma. |
| Dirty renderer collision | **No** rewrite of `_applyPresentationPose` contract beyond existing bank/pitch fields; no sector-prewarm edits. |
| Sim determinism | Render-phase only; pure mappers use simTime/angVel/status reads, no RNG authority. Cosmetic VFX may use existing vfx random pools. |

### Reverse review ×3 (best version confirmation)

1. **A→C:** Body language without feel still sells helplessness at a glance; neon without feel still sells force; feel without A is a camera jolt with nothing to look at → **A first, then B, then C** in code order.
2. **C→A:** Feel on whip/tumble/release is cheap and high confidence; if only C ships, UVP still thin → keep A as primary investment.
3. **B alone:** Brighter rope without tumble language is lipstick → B amplifies A/C, does not replace them.

**Selected best version:** pure `src/render/masslinePresentation.js` + pitch presentation consume +
narrow VFX force/tumble continuous consumers + feel subscribers + focused unit tests. No physics
rewrite. Thin STABLE map pointer only.

## Live seams

| Domain | Current owner | Seam to reuse | New seam |
|---|---|---|---|
| tumble status | `tumbleStates`, `combat/tumbleStatus`, `status_tumbling` | `massline:tumbled`, `massline:tumbleEnd` | none (read-only) |
| pose | `shipPitchPresentation`, presentationWorld bank/pitch | hull.rotation.x/z | pure tumble pose targets |
| RCS / thrusters | `vfx` production plume/RCS | `_engineDriveFor`, pooled sprites | thrash puffs + dead-drive scale via presentation intent |
| force VFX | `vfx` tether cable, presentation styles, `_onChargeDetonated` | load/strain ribbon, style table | neon scale pure helpers |
| feel | `feel.js` | `_trigger`, trauma | massline punch resolver + bus hooks |

## Write set

- `design/program/roadmap/active/MASSLINE_PRESENTATION_UVP.md` (this packet)
- `CANONICAL_BUILD_MAP.md` — thin §1 routing pointer only
- `src/render/masslinePresentation.js` (new pure)
- `src/render/shipPitchPresentation.js`
- `src/render/vfx.js` (narrow force/tumble continuous + neon)
- `src/render/feel.js`
- `test/massline-presentation-uvp.test.mjs` (new)
- `test/ship-pitch-presentation.test.mjs` (extend if needed)

## Non-goals

- Physics / player tumble immunity / golden re-records
- PQ-023 milestone re-acceptance, headed H1/H3 campaigns
- Snarl/capstan/hitchhiking/arena authoring
- Foreign dirty `renderer.js` prewarm/sandbox work

## Performance budget

- Per tumbling/drifting ship: O(1) pure mapping per frame; ≤1 thrash spawn cadence window; spin ribbon ≤ few streaks/particles per second.
- No new materials/programs; no new entity types; no save fields.
- motionReduce/flashReduce prune vestibular + particle intensity.

## Verification

- Unit: pure mappers (pose, neon, feel selection)
- `npm run check:baseline`
- Diff: no tumbleStates control semantics / player immunity changes

## Checklist

- [x] Multi-pass brainstorm recorded (this section)
- [x] Pure mapping + body language hooks
- [x] Force neon pass
- [x] Feel punches
- [x] Focused tests + baseline

## Implementation receipt (focused)

- Pure mappers: `src/render/masslinePresentation.js`
- Pose/RCS intent: `src/render/shipPitchPresentation.js` → `entity.bank`/`pitch` + `entity.presentation.tumble`
- Force neon + continuous thrash: `src/render/vfx.js` (no foreign `renderer.js` prewarm edits)
- Feel: `src/render/feel.js` via `resolveMasslineFeelPunch` (FOV/trauma only; **no** timeScale hit-stop)
- Tests: `test/massline-presentation-uvp.test.mjs` (6) + existing pitch tests (2)
- Owned baseline subset green: massline, flight-v3, save-schema, m1-tether-mass, render-package-plan
- Full `check:baseline` still red on this dirty tree from **pre-existing foreign** sandbox/ui-screen-imports + 47-A hash drift (same actual hash with presentation files reverted to HEAD)
- Physics / tumbleStates / player immunity: untouched
