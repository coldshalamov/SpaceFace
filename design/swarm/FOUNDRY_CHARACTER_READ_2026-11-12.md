# A surviving opponent, not a surviving prop, owns the read

Exact parent: [60a8ceb](https://github.com/coldshalamov/SpaceFace/tree/60a8ceb402129b6c01a3d0c66e8726f224fa91c4), draft PR942.

## Connected experience decision
After declining the first exit, the player learns to recover control: shed the
Leecher in11, read the Ghost's charge and changing flank in12, then cross the
Cutter's plated nose and use loose matter against a Glassback in13. Surviving
matter may be unavailable after earlier fights. That consequence should remove
the optional environmental encounter, not shorten the primary ship's introduction.

The existing no-surface fallback is useful in11, where otherwise no opponent
would occupy the room. In12/13 it admitted ordinary Brood at600/480 active ticks
instead of1080, even though the Ghost/Cutter already occupied the foreground.
This is an intentional revision of that previously tested creative contract,
not a claim that all earlier behavior was an accidental coding defect.

The earned e20a7254 trace supports this priority: round13 starts88761; Brood is0
at89210(age449),22 at89330(age569), and142 at89810(age1049), while ship admissions
remain1. Exact placement rejection reason was not logged. Round12 did retain its
single Leecher before1080; its hull loss must not be attributed to this fallback.

## Assembly and practical toolbox
- `src/data/swarmFoundryScore.js`: marks12/13 with existing `characterForeground`,
  already used for Kraken19. All20 authored Foundry rounds and their budgets remain. The separate larger-game twenty-concept map is unchanged.
- `src/systems/swarmBrood.js`: optional Leecher/Glassback placement failure now
  respects that flag. Existing1080 active-tick reserve clock and18-body paced
  admission do the work. No new director, enemies, props or replenishment.
- `swarmOpeningLeecher.js` / `swarmOpeningGlassback.js`: unchanged physical
  eligibility and clear-route selection preserve original matter and losses.
- `survivalWave.js` and native Ghost doctrine retain real attack/relocation and
  ship admission. Missing secondary geometry still leaves meaningful combat.
- Existing successful environmental entrance, collision feedback, shards, damage,
  purse, rewards and exit decisions remain owned by their present systems.

No new asset need established. Reuse current enemy silhouettes, charge cues and
physical banks; model production stays with local agents. Adventure remains
outside this bounded Swarm increment: no #939 uncertain-write retry, denied
mission/source edit or UI1074 overlap.

## Evidence and acceptance boundaries
New missing-terrain cases cover11/12/13, actual primary ship identity, no early
Brood, finite owed population, pause/idle and fresh retry. The native Ghost
control/dodge case now also checks at most one optional Leecher through1050;
this is staged round/kit/pose with production input/physics, not earned play.
Exact test results and independent review are retained in the handoff bundle.

There is no new screenshot or rendered review. This increment does not establish
whether players notice the charge/flank, naturally find a surviving throw object,
choose an escape from shards, or enjoy eighteen seconds of primary pressure.
Run the joined11–13 passage on the final candidate before changing damage,
quotas or terrain eligibility. Ordinary Swarm campaign Save/Continue remains
unsupported; existing campaign-save protection is not Swarm continuation.

## Durable goal delta
| Marker | State / owner | Evidence / next executable action | User-dependent operation |
|---|---|---|---|
| SF-WORLD-DIRECTION | Open / creative direction | Optional world consequence no longer cancels primary read; assess comprehension in joined11–13 | None for authorized scene edits |
| SF-SECTOR-COHERENCE | Open / scene integration | Same surviving arena, no refill; record exact selected/absent matter at earned13 | Rendered acceptance needs supported co-located runtime |
| SF-LIVING-WORLD | Open / physics and world owners | Destruction/displacement still matter; verify accessible throw and shard escape | No new asset approval inferred |
| SF-GAME | Open / integration reviewer | Focused/native regression is not full earned or visual acceptance; review full passage next | Final acceptance remains with user |
| SF-ASSETBANK / SF-ASSET-QUALITY | Open / review and integration | Existing assets reused, no competing authoring lane | Local makers retain production |

Orchard, chime, publication recovery and Adventure handoffs are not erased or
promoted into this scene's priority. No goal closes from this document or tests.
