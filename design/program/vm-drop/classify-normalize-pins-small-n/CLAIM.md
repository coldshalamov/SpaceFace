# CLAIM — classify-normalize-pins-small-n

Quiet `classifyWorld` → `normalizePinReasons` is dominated by 0–2 pin lists.
Skip `Set.clear` + `sort` on that path; keep Set+sort for rare n≥3.

Primary KPI: portable microbench ≥1.5× (soft-GPU fps not claimed).
