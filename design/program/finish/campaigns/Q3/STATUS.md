<!-- LIFETIME: CAMPAIGN -->
# Q3 - status

**Owner:** Lane 7 QUALITY & VERDICTS. **Deliverable:** [RUBRIC.md](RUBRIC.md).

## Done

- One five-axis rubric (Readable, Coherent, Alive, Responsive, Earned), a pass rule, a never list,
  the reviewer procedure, and the evidence layout. It is written to be used by every lane, not to
  add a second review quota: one independent reviewer per visible claim, one verdict, findings fixed
  before landing.

## Applied

- The rubric is the gate named in `EXECUTION_STATUS_2026-11-06.md` for visible campaign slices.
  Gate E (X1/X3/X4/X5) uses the style bible and audio brief as its taste bars; Gate D uses the P1
  blind comprehension check. A campaign is not "optimal" on a code review alone.
- **2026-11-07 primary-screen pass:** six headed `ui-bench` captures (Shipworks, flight, market,
  THE SHIP, Help, Pause). One real defect found and fixed: Shipworks socket 03 printed the raw
  boolean "true" as the stock drive's name; it now reads "Drive / STOCK · M". Review:
  [`reviews/2026-11-07-primary-screens.md`](reviews/2026-11-07-primary-screens.md). The required
  second independent reader is still open.

## Next

- Apply it to the remaining visible slices as their fixers land: E6 pop-in (look check), X3
  Adventure glass before/after, X4 stems, X1 foundry finish. Store each pair under the campaign's
  `evidence/` folder.
