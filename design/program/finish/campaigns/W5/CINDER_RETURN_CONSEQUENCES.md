# Cinder: the return to Rook

## Candidate and intent

Unpublished local candidate on exact PR #939 parent `e421c2b9404724c7c26e9ac2c92f78eff6982d46`, tree `f6ccf6409f142cd9acb5a9f7410472c53de611d8`. GitHub was checked before and after work: branch `dot/scale4-freight-return-20261108`, open, draft and unmerged, same head. Repository owner permission was reported as admin. No source was edited in the shared checkout. No denied path, publication, merge, deployment, user computer or new execution thread was used.

The previous earned Cinder delivery closed correctly: one original hull, one 25-credit sale and a separate 700-credit contract payment. Its departure conversation then disappeared. The gap was a return to the person who commissioned the work, not another payment system or another batch of enemies.

The next scene makes the difference matter:

- A successful delivery receives recognition for bringing actual material, not merely a name. Rook reads the canonical contract amount, distinguishes the separate pad purchase, and offers no repeat reward.
- A no-pay return keeps the recorded zero payment. The current campaign normalizer drops the clearance-only method to null; that retained account therefore admits that its copy does not say what happened to each hull. It grants no replacement hull, pay or invented delivery proof, and lets the player continue. An explicit preserved clearance-only method can support the fuller empty-delivery account.
- Asking about the double invoice gives Rook a defensive answer. This is conversation, not a newly implemented investigation or faction decision.
- The player can ask what the garden takes, explicitly mark the existing outside-mouth approach, or open the current Journal. No automatic travel, free cargo, feeding or growth follows from speaking.
- Returning after the accepted Compost growth acknowledges a changed garden. The optional 240-tonne paid run remains distinct from the first player-fed growth that advances the story, and an already-paid run is not offered again.

This develops the existing people-and-materials direction: commission, physical work, a return with consequences, then a different use for the same Line. It uses the current Rook contact, station Bar, real wreck/cargo ownership, authored Rookside garden and canonical navigation. No visual assets were added or replaced. The living asset toolbox and story treatment were consulted as design context, not treated as evidence that the new scene was rendered.

## Source and ownership

Two production files:

- `src/ui/station/cinderReturnConversation.js`: pure read of settled facts, conversation choices/replies and explicit UI navigation intents.
- `src/ui/station/cinderDepartureConversation.js`: a small adapter admitting the return scene into the existing contact/choice protocol.

The unchanged Bar controller already fences this protocol against stale buttons, hidden visits, selected-contact changes, Save/Continue and synchronous event-driven interruption. Reusing it avoids another click, offer or conversation-state owner. Existing departure and offer guards remain in place.

A return requires the unique accepted Cinder step receipt and a unique canonical mission settlement with the same simulation timestamp, source and route endpoints. Current campaign step receipts lack a mission ID; the code does not pretend otherwise. A duplicate, missing, future, unsupported legacy or contradictory record fails closed. The explicit null-method plus zero-pay combination supports only a limited closed-account reading, not a claimed hull disposition. The completed contract amount is read from the payment receipt, not inferred from current balance or a cumulative market total. No exact hull identity, individual sale price, casualty attribution or second invoice amount is reconstructed from missing history.

The garden bearing follows the existing receiver position and west offset. An unavailable receiver has no course choice. A destroyed receiver is described as requiring new feed for regrowth. Receipt and garden changes invalidate old choices. Later campaign steps retain the personal account without replacing the current objective with an obsolete garden route.

## Fresh earned route

The input is the preceding task's retained successful delivery save, not a new fully replayed campaign. The full previous combat/tow history remains in `CINDER_LAWFUL_DELIVERY.md`; this candidate does not relabel it as fresh evidence.

On this candidate's frozen source:

1. Production title Continue restored 1,415 credits, one Rook sale and Cinder receipt `m_5:completed`, reward 700.
2. A programmatic pilot supplied native keyboard events for 773 ticks, about 12.88 simulated seconds and 444.633 WU travelled, from the saved flight position to Expanse.
3. The production berth range query confirmed `station_expanse`; the normal docking-intent/UI commit route was used. No body position, velocity, credit or story completion was injected. The committed docked ship was at `(9041.1528, 27986.9517)` with speed zero.
4. The real contact generator and reply handlers read the earned settlement, explained the distinct Compost payment and emitted one non-autopilot course to the existing garden's outside-mouth point `(10495.788, 27989.314)`.
5. Production Save and title Continue retained 1,415 credits, the unchanged receipt and one Rook deal. No second sale or payment was created.

The native replay invokes conversation handlers directly. Separate mounted-controller tests exercise the actual Bar code with a constrained fake DOM. Neither layer is a rendered player click-through, and the native run does not claim a new feed, garden growth or physical return from the garden. No-pay and post-growth return conversations are focused fixtures in this candidate, not newly earned native branches. Independent review reproduced the no-pay normalization using actual board acceptance, Wasp deaths, wreck retirement and mission settlement in a staged owner harness. The stored method was null, which exposed a defect in the first candidate and its overly optimistic fixture. The actual retained earned terminal-loss save was also inspected and has the same null method and zero-pay receipt. The final regression invokes the real campaign normalizer and requires that limited account to remain reachable.

## Checks

- 49 focused and mounted-controller checks pass, including the unchanged departure/offer tests.
- 251 aggregate checks pass, zero failures/skips, covering the above plus Cinder retention/escape/intake, Rook market/brake, law desk, runtime/clock, campaign logs, Compost first-feed/cold-save and route focus.
- Both changed production modules pass `node --check`.
- Existing player-facing-label checks pass. That narrow script does not by itself validate every new sentence or layout.
- Exact-parent patch application check passes.
- Executed source closure: 812 modules/reads in the focused run, 2,772 in aggregate, 766 for labels, and 1,998 in the earned berth run. Zero untouched-source mismatches. The manifest separately records the inherited non-UTF-8 `breakwaterSpur/freight.js` import's replacement decoding; raw Git identity and executed decoded-source identity are not conflated.

No simulation writer changed. The focused owner suites and actual native continuation establish the claimed behavior; no new full reference-scenario comparison or full CI run is claimed.

## Remaining acceptance and reproduction

`rendered: false`. The installed Playwright package's expected Chromium executable was checked and is absent. No browser was installed or alternate machine used. Text geometry, real DOM parsing, pointer reachability, keyboard accessibility in a real browser, portrait appearance, audio, FPS and human playability remain unverified. The complete New Game-to-Cinder-to-garden journey has not been freshly replayed.

Artifacts in the current engineering workspace: `/workspace/shared/cinder-return-consequences/`.

- `source/`, `candidate.patch`, `paths.json`, `manifest.json`: frozen candidate, exact hashes and source closure.
- `parent-overlay.json`, `parent-entries.json`: reconstructed immutable parent; the entries hash to the published parent tree.
- `overlay.json`: executable candidate overlay. The report is non-executable and listed separately in the patch/manifest.
- `focused-v2.log`, `aggregate-v2.log`, `labels-v2.log`, `audit.log`: check results.
- `native/final-earned-berth/result.json`, `slots.json`, `native/final-earned-berth.log`: route and continuation evidence.
- `final-native-overlay.json`, `native/final-earned-berth.mjs`: executed native source cohort and probe.

From `/workspace/shared/SpaceFace`:

```sh
D=/workspace/shared/cinder-return-consequences
HELIOS_OVERLAY="$D/overlay.json" HELIOS_RUN=review \
  node --require "$D/exact-fs.cjs" --loader "$D/exact-loader.mjs" "$D/run-aggregate.mjs"
python3 "$D/audit.py"
```

For the native replay, copy `final-native-overlay.json` and its virtual `scripts/cinder-return-earned-berth.mjs` script, change only the script's OUT to a new scratch directory, and update that virtual value in the copied overlay. Run the same exact loader/hook with the new overlay. Do not overwrite the original saves, logs or source evidence. The shared checkout is not the source baseline.
