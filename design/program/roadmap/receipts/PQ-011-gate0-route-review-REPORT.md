# PQ-011 Mass Seed — player-route and visual review (Gate 0, lane 2)

**Provenance:** the review agent (Opus) executed browser beats 1-5 and 7-11 with full capture +
machine-truth instrumentation, then died on a session limit with its transcript lost before writing
a verdict. The LEAD completed the review from the surviving disk state: eyes-on judgment of the
captures (each judgment below marked LEAD-VIEWED was personally viewed by the integrating lead),
machine-truth JSON (route-A/B/C.out.json), plus lead-executed completions: beat 6+7-real
(beat67.mjs), the Electron subset (beat-electron*.mjs), and the binding/parity investigations.
Master under review: 2d616dfa (browser beats) / 3a812b90 (lead completions — the massSeed
id-aliasing fix landed between; it does not touch any beat surface reviewed here).

**Evidence:** `.devshots/pq011-mass-seed-route/` (100+ captures), scratchpad route-lane/*.out.json.

## Per-beat verdicts

| Beat | Verdict | Evidence + judgment |
|---|---|---|
| 1. Deploy + travel | **PASS** (LEAD-VIEWED beat1-travel.png, f03) | Ordinary route (live tutorial scene). Pill "SEED → LOCK 0.9s" truthful countdown. Travel device readable in early frames; leaves frame quickly (fixed ~416 WU range). Deploy event publishes exact spawnPos/lockPos/lockAt/activeAt/expireAt at launch (route-A). |
| 2. Lock marker truth | **PASS with P2** (LEAD-VIEWED beat2) | Published lockPos exact to 1e-14 vs final anchor. Marker projection function truthful but the lock point is ALWAYS off-screen at default zoom (fixed range > frame); markShown=false, pill-only during travel. P2-A filed. |
| 3. Lock → active | **PASS** (LEAD-VIEWED beat3-active + closeup) | Phase pills exact ("SEED FRAME LOCK…" → "ANCHOR 26s"); eligibility flips exactly at active (entElig false→true); locked event on schedule. Anchor visual: distinct frame-lock device (X-strut pylons, gyro ring, beacon core) — NOT an orb, no ring language, crisp read, contained glow (bible laws 1/6 satisfied). |
| 4. Latch via ordinary acquisition | **PASS** (LEAD-VIEWED beat4-preview/latched) | Acquisition preview selects the seed (precision-pick, status ready); tether:latched with previewMatched:true; attachment att_000001 on the seed. |
| 5. Useful direction change | **PASS with P2** (LEAD-VIEWED beat5-orbit-f05, after-release) | Entry heading 0° at 123.5 WU/s → swing (taut amber tether, banked ship, SPD readout live) → release heading 147.9°: a ~148° turn through the anchor. P2-C: exit speed 18.7 WU/s (85% energy loss through the swing) — the turn is real but heavily damped; reads as an over-damped swing rather than a slingshot. Owner: massline orbit/reel tuning (PQ-005/T05 lane), NOT the seed (the anchor held fixed; physics correct). |
| 6. Hostile pressure | **PARTIAL** (lead-executed beat67) | 3 hostiles spawned (documented injection: SF.helpers.spawnEntity — spawn only); latch-under-pressure succeeded with hostiles alive nearby through the swing. The minimal injected AI never enrolled as firing hostiles (contacts showed NEUTRAL; no autonomous fire) — the "under sustained fire" observation was NOT achieved on the route. Sim-level counterplay (destruction during tether in every phase) is covered by the 49-test suite; the residual gap is an ENCOUNTER-AI evidence gap, not a seed-behavior gap. |
| 7. Destruction + exact cleanup | **PASS** (lead-executed, LEAD-VIEWED beat7-realdestroy-f03) | Original agent's beat-7 method was invalid (direct hull=0 write bypasses the damage router — seed correctly immortal to state surgery; captures beat7-destroy-* show a NON-destruction and are excluded from evidence). Lead redo through the REAL combat path (projectile:hit, real hostile owner, 2×30 kinetic): massSeed:destroyed + massSeed:tetherCut + collapsed{seed_destroyed}; after: phase idle, 0 seed entities, 0 attachments, cooldown set; "MASSLINE BROKEN" floor announcement; pill → "SEED READY IN 5s" (cooldown class). Zero visual/HUD residue in the viewed frame. |
| 8. Expiry + cleanup | **PASS** (LEAD-VIEWED beat8-warning) | "ANCHOR COLLAPSE IN 6s" amber pill — text is the primary channel (not color-only) + "Anchor seed destabilizing" toast; collapsing{seed_expired}→collapsed on exact schedule (route-B events); after: idle/0/0, cooldown pill "SEED READY IN 5s". |
| 9. Reduced motion | **PASS** (LEAD-VIEWED beat9-rm-warning) | Best default-distance view of the device: warning state carried entirely by POSE (amber diamond beacon on the frame, amber pill, toast); acquisition truthfully PICK·100%·READY through warning. Information preserved without motion. |
| 10. Reduced flash | **PASS** (LEAD-VIEWED beat10-rf-collapse-f03) | Same state language under flash suppression; collapse information persists. |
| 11. Save/Continue | **PASS** (LEAD-VIEWED beat11-after-reload) | Post-load: no seed, no cable, sane HUD/contacts, cooldown persisted (83.767 per agent's last in-flight report + capture). Normalize-away policy presents cleanly. |
| E. Electron parity | **PASS** (lead-executed beat-electron*) | Real menu route (New Game → Launch clicks), hardware GPU (ANGLE Intel D3D11): deploy/travel pill, lock→active + eligibility, latch via ordinary acquisition (tether:latched previewMatched:true), real-path destruction with exact cleanup + cooldown pill. Full parity with browser. |

## Rejection-standard sweep (mandate checklist)

- Unreadable orb: NO — frame-lock device, distinct silhouette (LEAD-VIEWED close + default distance).
- Generic expanding rings as primary cue: NONE observed in any viewed frame.
- Excessive bloom: NO — beacon glow contained; struts/frame crisp (law-6 clean close-up verified).
- Detached effects: NONE observed (tether, markers, chips all tracked entities).
- Misleading HUD state: NONE — every pill/chip matched machine truth at every sampled beat.
- Works only in isolated preview: NO — everything above ran in the live tutorial scene on the
  ordinary route, plus the real Electron menu route.

## Findings (named, non-blocking)

- **P2-A offscreen lock cue:** the fixed ~416 WU travel range puts the lock point off-screen at
  default zoom for the whole travel; markShown=false leaves the pill as the only spatial channel.
  Suggested: reuse the PQ-006 world-anchored offscreen cue idiom for the travel/lock marker.
- **P2-B HUD overlap:** the utility pill (ANCHOR …s) overlaps the expanded tether-control panel
  text; acquisition preview chips can overlap flight-control buttons (beat5-f05, beat8-warning).
  Owner: HUD layout (massSeedHud/masslineHud anchoring).
- **P2-C over-damped swing:** 148° turn but 123.5→18.7 WU/s through the orbit; judge against the
  canonical "release backward down your own wake" — currently the escape turn works but sheds most
  speed. Owner: massline orbit/reel tuning lane (pre-existing PQ-005 behavior, not PQ-011).
- **EVIDENCE GAP (not a defect):** "under sustained hostile fire" beat not achieved on-route (the
  injected minimal AI never fired). Counterplay-by-destruction is proven on-route via the real
  combat path + at sim level in every phase. A natural-encounter pressure observation should ride
  the next combat-lane route session (PQ-012 consumers or PQ-014 encounter evidence).
- **Probe hygiene note:** the harness luminance probe (gl.readPixels post-composite without
  preserveDrawingBuffer) always reads 0 — its numbers are meaningless; PNG capture is the evidence.
  The dead agent's beat7-destroy-* captures document a NON-destruction (invalid method) — excluded.

## Overall recommendation

**ROUTE_ACCEPTED** — with the three P2s and the pressure-evidence gap recorded as named follow-ups.
The mandated observations (launch/travel/lock readability, ordinary-acquisition latch, useful
direction change, destruction cleanup, expiry cleanup, reduced-motion/flash, save/Continue,
browser+Electron parity) are all evidenced; no rejection standard was tripped.

ROUTE_REVIEW_DONE
