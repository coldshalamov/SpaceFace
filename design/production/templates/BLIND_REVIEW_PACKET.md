# BLIND REVIEW `<ID>`

**Mode:** read-only. Do not edit the candidate or acceptance gates.

## Contract under review

## Hash-bound candidate artifacts

## References

Attach the hash-bound admired/failure media from the quality card plus reviewer-captured held-out
candidate views. Candidate/baseline ordering is randomized. Author identity, scores, iteration
counts, and completion claims are withheld.

## Required review

1. List critical, major, and minor defects with exact frame/artifact evidence.
2. Check every required view and player-facing state.
3. Distinguish plan, execution, presentation, calibration, and pipeline defects.
4. Identify missing evidence; missing is not pass.
5. Return `PASS`, `REVISE`, or `REJECT`. `PASS` requires zero critical/major defects.

## Structured verdict

```json
{
  "schemaVersion": 1,
  "packetId": "",
  "candidateHash": "",
  "verdict": "PASS | REVISE | REJECT",
  "defects": [
    {
      "id": "",
      "severity": "critical | major | minor",
      "class": "scope | technical | runtime | temporal | quality | operational",
      "evidenceRefs": [],
      "requiredRepair": ""
    }
  ],
  "missingEvidence": [],
  "requiredNextEvidence": []
}
```

The reviewer output validates against
`design/production/schemas/blind-review-payload.schema.json`. Do not assert reviewer/model/session
identity; the controller derives those from the actual run and wraps the payload as
`blind-review-verdict.schema.json` v2. A `PASS` with any critical/major defect or missing required
evidence is invalid even if the JSON structure validates.
