# BLIND REVIEW `<ID>`

**Mode:** read-only. Do not edit the candidate or acceptance gates.

## Contract under review

## Hash-bound candidate artifacts

## References

Candidate/baseline ordering is randomized. Author scores, iteration counts, and completion claims are withheld.

## Required review

1. List critical, major, and minor defects with exact frame/artifact evidence.
2. Check every required view and player-facing state.
3. Distinguish plan, execution, presentation, calibration, and pipeline defects.
4. Identify missing evidence; missing is not pass.
5. Return `PASS`, `REVISE`, or `REJECT`. `PASS` requires zero critical/major defects.

## Structured verdict

```json
{
  "packetId": "",
  "reviewerId": "",
  "reviewerModel": "",
  "reviewerModelFamily": "",
  "reviewerSessionId": "",
  "candidateHash": "",
  "verdict": "PASS | REVISE | REJECT",
  "defects": [
    {
      "id": "",
      "severity": "critical | major | minor",
      "class": "scope | technical | runtime | temporal | quality | operational",
      "evidence": [],
      "requiredRepair": ""
    }
  ],
  "missingEvidence": [],
  "requiredNextEvidence": []
}
```

The final output must validate against
`design/production/schemas/blind-review-verdict.schema.json`. A `PASS` with any critical/major
defect or missing required evidence is invalid even if the JSON structure validates.
