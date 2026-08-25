# Squish Calibration Report

Generated: 2026-08-24T17:07:27.816Z

Evidence artifact for the claim: **Squish knows when it does not know.**
Confidence is query-conditioned, derived from subsystem agreement
(semantic + lexical + graph + temporal + conflict + retention), and
measured — not marketed — against graded fixtures.

## Retrieval quality (golden set)

| metric    | value  |
| --------- | ------ |
| Recall@5  | 0.9348 |
| MRR       | 0.9043 |
| HitRate@1 | 0.8696 |

## Confidence calibration (golden set)

| metric       | value  | note                                        |
| ------------ | ------ | ------------------------------------------- |
| ECE (10-bin) | 0.0413 | expected calibration error, lower is better |
| Brier        | 0.1139 | mean squared confidence error               |
| observations | 46     |                                             |

Freshness ablation: ECE on=0.0413, off=0.0304.

### Reliability by confidence band

| band    | n  | avg confidence | actual hit-rate | gap    |
| ------- | -- | -------------- | --------------- | ------ |
| 0.8–0.9 | 39 | 0.839          | 0.872           | +0.033 |
| 0.9–1.0 | 7  | 0.947          | 0.857           | -0.090 |

### Selective accuracy (accept only confidence >= t)

| threshold | coverage | accuracy |
| --------- | -------- | -------- |
| 0.50      | 1.000    | 0.870    |
| 0.55      | 1.000    | 0.870    |
| 0.60      | 1.000    | 0.870    |
| 0.65      | 1.000    | 0.870    |
| 0.70      | 1.000    | 0.870    |
| 0.75      | 1.000    | 0.870    |
| 0.80      | 1.000    | 0.870    |
| 0.85      | 0.152    | 0.857    |
| 0.90      | 0.152    | 0.857    |
| 0.95      | 0.043    | 1.000    |

## Memory bench (contradiction / temporal / abstention)

Macro penalty score 0.446 (range -1..+1), micro 0.481, confident-wrong 17.

| category               | n  | score  | correct | wrong | guardRate |
| ---------------------- | -- | ------ | ------- | ----- | --------- |
| fact-update            | 60 | 0.483  | 16      | 6     | 0.900     |
| planted-falsehood      | 20 | 0.950  | 19      | 0     | 1.000     |
| conditional-preference | 30 | 0.750  | 15      | 0     | 1.000     |
| unanswerable           | 20 | -0.400 | 3       | 11    | 0.150     |

_Scoring is LLM-free (rank + calibrated tier only); confident-wrong rates are a lower bound on real answer-model harm._

---

Regenerate: `bun run report:calibration`
