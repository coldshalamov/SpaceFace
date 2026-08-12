# Portfolio Review — freeflight living-world 5x (post-REVISE)

**Date:** 2026-08-11  
**Workflow:** freeflight read+act tranche (tools · combat doctrine · contact intel ladder)  
**Scale:** 5x composition after individual revise  
**Evidence basis:** live shipped seams + unit characterization tests; not a headed 5–10 min route reel  
**Unit dispositions (fresh re-review):** U1 KEEP · U2 REVISE residual · U3 KEEP · U4 KEEP · U5 KEEP  

---

## Portfolio identity

| Field | Value |
|---|---|
| Workflow | Ordinary freeflight: notice work, read cargo, scoop better, face a heavy commit threat |
| Requested scale | 5 accepted production units (composition review) |
| Shared scope / route | Freeflight contact + mining/salvage + ordinary hostile brawler |
| Candidate revision | Post-revise KEEP candidates |
| Units under review | U1–U5 (below) |

### Units (frozen identities)

| ID | Unit | Player-facing claim after revise |
|---|---|---|
| **U1** | Fitted tractor magnet | Ordinary scoop uses fitted `magnetRange` (Tractor Beam M **560** above mining floor **420**); Tideline unique is **wreck-only** whole-mass pull (ore scoop owned by mining path; unique **780** magnet on derived max-wins) |
| **U2** | `brawler_commit` doctrine | Bruiser Brawler spawns with first-class doctrine; fire admitted in **commit**; choreography + presentation adapters + audio keyed |
| **U3** | Work hail | Stamp-gated **worker** channel; **STATUS** = phase + tactical means; **IDENTIFY** = callsign · role · chain (no means clone) |
| **U4** | Manifest ~CR | Trader channel **MANIFEST**: value-ranked top 2 lines, `+N MORE`, `~X CR` catalog estimate; empty cargo honest |
| **U5** | Target lock WORK phase-only | Always-on panel `livingWorkStatusText(..., { depth: 'lock' })` → phase only; hail STATUS is the deep layer |

---

## Coherence

- **Shared fantasy:** The frontier keeps working when you look at it. Tools extend reach; traffic answers with job truth or freight value; heavies commit instead of only buzzing past.
- **Shared construction language:** Stamp-gated living data (Ceres causal / job), pure contact-hail copy, ships-derived magnet, doctrine fire windows + presentation grammar.
- **Required contrasts:** free thin lock vs opt-in hail depth; worker STATUS/IDENTIFY vs trader ROUTE/MANIFEST; ordinary scoop vs unique whole-wreck; brawler commit vs interceptor strike/extend.
- **Family vs co-location:** Not one manufacturing family. This is a **cross-axis freeflight ecology** (tool + threat + intel ladder). Coherent as a 5-minute “read the system and act” set; not a single arsenal to clone wholesale.

---

## Diversity matrix

| Unit | Function | Physical role | World role | Visual / temporal silhouette | State / incident | Player opportunity | Layer | Tempo | Frequency |
|---|---|---|---|---|---|---|---|---|---|
| **U1** | Tool / scoop range | Ore magnet radius; Tideline wreck tractor | Industrial self-upgrade + rare unique | Felt reach, VFX trails in range; no HUD slogan required | Fitted module state | Scoop farther; rare whole-wreck haul | Foreground (player body) | Sustained | Common fit / rare unique |
| **U2** | Threat grammar | Close commit fire window | Hostile heavy identity | Wedge · warm orange · engine_flare → commit → breakaway | Doctrine phase machine | Read telegraph, stand/fight or break | Foreground (hostile) | Burst | Intermittent spawn |
| **U3** | Contact intel (deep) | None (comms) | Living work voice | Short modal lines, TTL | Causal stamp / job gate | Approach, stand off, investigate chain | Mid (opt-in UI) | Burst (player) | When stamped worker locked |
| **U4** | Contact intel (economic) | None (comms) | Freight value read | Ranked cargo + ~CR | Manifest lines | Steal / escort / ignore / prioritise | Mid (opt-in UI) | Burst (player) | When trader (or unstamped freight) locked |
| **U5** | Contact intel (thin free) | None (panel) | Always-on work glance | Single `WORK · PHASE` bit on intent row | Causal phase only | Notice work without hail tax | Foreground HUD | Ambient while locked | Common on stamped contacts |

**Pairwise distinctness:** U3≠U5 by depth contract (means vs phase). U3≠U4 by channel gate (worker vs trader). U1 ordinary ≠ Tideline by pickup skip + wreck eligibility. U2 claims distinctness from interceptor via commit phase + longer window — **see residual role-kinship**.

---

## Attention hierarchy (composed)

Intended stack (matches code comments on U3/U5):

1. **Combat / survival (loud):** U2 telegraph → fire → breakaway when a brawler is live.  
2. **Always-on selection (free, thin):** U5 phase-only `WORK · …` appended to target intent when stamped.  
3. **Opt-in depth (player tax):** U3 STATUS means / IDENTIFY chain; U4 MANIFEST ~CR + ranked lines.  
4. **Sustained body feel:** U1 scoop/wreck pull without competing for text attention.

**Observation:** Hierarchy design is sound. **Pressure point:** U5 packs onto an already dense intent row  
`INTENT · MOTIVE · THREAT · WORK · …` — free layer is correct; row density is the cost.

---

## Role overlap and collapse

| Pair | Overlap? | Verdict |
|---|---|---|
| U5 lock ↔ U3 STATUS | Deliberate ladder (phase free / means hail) | **No collapse** — KEEP grammar |
| U3 STATUS ↔ U3 IDENTIFY | Means vs identity+chain | **No collapse** |
| U3 worker ↔ U4 trader | Stamp gate; unstamped miner keeps MANIFEST | **No collapse**; residual: jobId-only workers open thin worker channel and lose MANIFEST |
| U4 MANIFEST ↔ other cargo HUD | Hail-only value story | **No collapse** in this set |
| U1 scoop ↔ Tideline unique | Pickups vs whole wrecks | **No collapse** (revise fixed double-force) |
| **U2 brawler ↔ interceptor_flyby** | Shared flyby skeleton: ingress → flare → timed action → pass/timeout egress → breakaway ≥600 → reform; shared wedge silhouette; phase SFX still flyby family | **Unresolved soft role-collapse / identity residual** — unit D3 still open → portfolio cannot freeze U2 as a distinct “knife-fight heavy” exemplar |

**Unresolved role-collapse:** **U2 only** (vs existing interceptor flyby grammar), not among U1/U3/U4/U5.

---

## Cadence

| Unit | Cadence | Notes |
|---|---|---|
| U1 | Continuous while scooping / unique active | Does not spike UI |
| U2 | Burst cycles while engaged | Fire gated to commit; still cycles like a longer flyby |
| U3 / U4 | Player-initiated; short request/receipt TTL | Correct quiet default |
| U5 | Ambient while target locked + stamped | Silent when no stamp (no false WORK) |

**Rhythm as a set:** ambient industrial (U1/U5) + rare opt-in text (U3/U4) + intermittent combat (U2). Good contrast **if** U2 stops reading as “heavy flyby.”

---

## Quiet contrast

- No stamp → no WORK line (U5).  
- No hail → no STATUS / MANIFEST wall.  
- Empty manifest honest (`NO DECLARED CARGO`).  
- Tideline does not also yank ordinary pickups.  
- **Risk:** combat + dense intent row can erase quiet on the same contact; not a multi-unit text pile-up.

---

## Density

- Three units are text-intel; they share one channel tree (lock thin / hail deep / trader vs worker) rather than three always-on panels — good.  
- One physical tool + one combat grammar prevent “all HUD” portfolio.  
- Intent-row packing is the only local density defect worth watching (U5).

---

## Performance

| Unit | Cost character | Portfolio risk |
|---|---|---|
| U1 | Existing scoop path; Tideline spatial query wrecks-only | Low |
| U2 | Existing doctrine runtime + cue/audio map | Low (no new always-on) |
| U3 / U4 | Pure functions on hail events | Negligible |
| U5 | `targetIntelReadout` throttled with panel slow path | Low |

No composition-level performance red flag. Do not “fix density” by removing U5 WORK bits.

---

## Accessibility

- Target panel: `role="status"`, aria-label includes work phase when present; panel `aria-live="off"` avoids chatter.  
- Hail is opt-in readable text.  
- U2: color `#ff8a3c` vs flyby `#ffb35c` is hue-adjacent; shape shared (wedge). Distinctness must come from **motion/tempo and ship silhouette**, which residual D3 undercuts.  
- Reduced-motion: presentation stages exist; not portfolio-blocking.

---

## Player opportunity

During a composed freeflight pocket, the set supports:

| Verb family | Supported by |
|---|---|
| Notice world work without assignment | U5 (and stamped U3 path) |
| Distinguish roles / threats | U2 (intent), U3/U5 (work), trader vs worker channels |
| Choose approach | U3 means (“do not enter cut arc”), U4 ~CR value |
| Physical improvise | U1 scoop/wreck; flight vs U2 commit |
| Steal / salvage / investigate | U4 value read; U1 salvage reach; U3 chain name |
| Fight with readable pressure | U2 **only if** commit identity leaves flyby twin residual |

**Gap (not collapse):** this tranche does not wire a “help the worker” verb; opportunity is informational + tool + threat. Acceptable for a read+act 5x if framed that way.

---

## Route-level observation (headless / structural)

| Lens | Finding |
|---|---|
| Session duration | Not reeled this review; composition claims rest on shipped seams + unit tests |
| Activity / decision rhythm | See Cadence |
| Longest empty interval | Hail quiet-by-default helps; U2 residual does not affect empty traffic |
| Attention collisions | U5 on intent row; U2/flyby kinship if both hostiles present |
| Units not naturally co-encountered | Tideline unique is rare/hero; may not co-star on same 5 min as all others — OK for frequency band |

---

## Redundancy and hierarchy actions

- **Competing for same read:** U2 vs interceptor presentation family (open). U5 vs U3 closed by depth.  
- **Should become variants:** U2 still behaves like a **timed flyby variant** until stick/knife or non-pass egress is authored.  
- **Missing ordinary/common:** unstamped freight still has U4; good.  
- **Missing spectacle/rare:** Tideline unique is the rare industrial pole.  
- **Missing aftermath:** no portfolio unit owns post-fight / post-hail residue (out of scope).  
- **Do not remove:** U5 phase-only free layer; U3 means depth; U4 ranking/~CR; U1 single scoop resolver.

---

## Player-value test (portfolio)

| Question | Answer |
|---|---|
| Notice something operating without them? | **Yes** — stamped WORK on lock |
| Identify different roles or threats? | **Partial** — work/freight clear; brawler vs flyby still soft |
| Meaningful approaches? | **Yes** — means + ~CR + stand-off copy |
| Physically improvise? | **Yes** — magnet + flight |
| Help / exploit / steal / fight / salvage / investigate? | **Yes** except dedicated help verb |
| Visible consequence? | Scoop/wreck pull yes; hail is informational; fight consequence needs distinct U2 feel |
| Remember the place afterward? | Intel ladder yes; U2 not yet a memorable heavy identity |

---

## Reusable grammar vs authored limits

### Safe to reuse (grammar)

1. **Lock thin / hail deep** for living stamps (`depth: 'lock'` vs STATUS means map).  
2. **Stamp-gated contact kinds** so freighter MANIFEST is not stolen by role name alone (with the jobId residual noted).  
3. **Manifest ranking:** top-N by catalog value + `+N MORE` + `~CR` estimate (read-only, no economy write).  
4. **Fitted magnet max-wins into derived + single scoop resolver** above mining floor.  
5. **Unique tractor wreck-only** when ordinary scoop already outranges unique’s old pickup annulus.  
6. **Doctrine fire-phase table + live choreography ID** as the contract for “doctrine is real.”

### Must remain authored (limits)

1. **Causal phase/cue → player language maps** (`CAUSAL_PHASE_LABEL`, `CAUSAL_MEANS`) — content, not auto-inferred.  
2. **Tideline whole-wreck eligibility and encounter fiction** — unique identity.  
3. **Brawler identity parameters that actually leave the flyby skeleton** (stick range, non-pass egress, silhouette/SFX distinctness) — **not yet earned**.  
4. **Which roles open worker vs trader** and whether jobId alone is enough.  
5. **Hero unique loot power premiums** (energy, range) per wreck program.

### Do not multiply yet

- U2 as “new heavy doctrine family siblings” until residual D3 is closed.  
- Worker hail copy variants that re-clone STATUS into IDENTIFY or into lock.  
- Parallel always-on cargo ~CR on the target panel (would collapse U4 opt-in tax).

---

## Portfolio verdict

### **REVISE named unit: U2** — portfolio not full KEEP

| Disposition | Scope |
|---|---|
| **KEEP** composition roles for **U1, U3, U4, U5** | Hierarchy, channel split, magnet/tideline split hold under composition |
| **REVISE U2** before portfolio freeze / multiply | Unresolved **role-kinship collapse** with `interceptor_flyby` (timed pass commit, shared wedge/flare family, flyby-family phase SFX) |
| No CUT among U1/U3/U4/U5 | No redundancy requiring deletion |
| Not BLOCKED by missing upstream frameworks | Residual is implementation identity on U2 |

**One-line verdict:** The intel ladder + scoop tool compose cleanly; the combat slot still needs a true brawler identity before this 5x is a KEEP portfolio.

### Soft follow-ups (non-blocking for U1/U3/U4/U5 KEEP)

- Intent-row density when WORK is present (optional dedicated work subline).  
- jobId-only workers: thin STATUS and no MANIFEST — product choice, not named-defect reopen.  
- Unit test for multi-line MANIFEST ranking + `+N MORE`.

---

## Propagation recipe (after U2 revise lands)

| Question | Answer |
|---|---|
| Safe to multiply now? | **U1, U3, U4, U5 grammar only** — not U2 siblings |
| Parameters that may vary | Phase/means map entries; commodity sets for ~CR; tractor tier radii above floor; which work roles stamp |
| Must remain authored | Unique wreck abilities; means copy; doctrine motion that is not flyby-pass |
| Next evidence | Headed freeflight pocket with stamped miner + hauler hail + fitted tractor scoop + one bruiser engage; reel proves brawler ≠ flyby |
| Did not scale | Declaring brawler KEEP from fire-window + choreography wiring alone |

---

## Unit freeze table (for program / next revise)

| Unit | Unit disposition | Portfolio role | Action |
|---|---|---|---|
| U1 | KEEP | Common industrial tool + rare unique pole | Freeze; multiply tier siblings carefully |
| U2 | REVISE (D3 residual) | Heavy threat exemplar | **Revise identity** then re-compose |
| U3 | KEEP | Opt-in deep work voice | Freeze ladder with U5 |
| U4 | KEEP | Opt-in freight value | Freeze; keep off always-on panel |
| U5 | KEEP | Free thin work glance | Freeze depth contract |

**Portfolio composition status: REVISE (U2) — no unresolved role-collapse among U1/U3/U4/U5.**
