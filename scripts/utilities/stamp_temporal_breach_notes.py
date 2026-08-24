"""Stamp provenance notes into the temporal-validity-ON breach artifact.

One-off operational script (Batch 3-5 review, fix 3): the OFF default for
SQUISH_TEMPORAL_VALIDITY needs committed evidence. This annotates the captured
breach report so future readers know what it is and how to reproduce it.
"""
import io
import json

PATH = 'tests/golden/reports/temporal-validity-on-breach.json'

with io.open(PATH, encoding='utf-8') as f:
    report = json.load(f)

report['notes'] = {
    'purpose': (
        'Committed evidence for the decision to keep SQUISH_TEMPORAL_VALIDITY '
        'OFF by default. This run enables the flag; every overall metric '
        'breaches its golden gate threshold.'
    ),
    'howProduced': (
        'SQUISH_TEMPORAL_VALIDITY=true bun tests/golden/run-eval.ts '
        '--out tests/golden/reports/temporal-validity-on-breach.json --quiet '
        '(exit code 1: threshold breach). All other env identical to the '
        'pinned canonical baseline env (see tests/golden/README.md), so the '
        'only delta vs baseline-report.json is the temporal-validity penalty.'
    ),
    'breach': (
        'recallAt5 {r:.3f} < 0.85; mrr {m:.3f} < 0.82; hitAt1 {h:.3f} < 0.78'
    ).format(
        r=report['overall']['recallAt5'],
        m=report['overall']['mrr'],
        h=report['overall']['hitAt1'],
    ),
    'baseline': {
        'recallAt5': 0.935,
        'mrr': 0.904,
        'hitAt1': 0.870,
        'source': 'tests/golden/baseline-report.json (pinned env)',
    },
    'diagnosis': (
        'The flat staleness penalty (-0.30 on the served composite) is too '
        'blunt on aged corpora: golden memories are seeded at fixed Jan-2026 '
        'timestamps and many legitimately contain historical/temporal '
        'references, so isLikelyStale() fires on relevant must-hit documents '
        'and demotes them below non-stale distractors.'
    ),
    'decision': (
        'Flag stays opt-in until the staleness signal is scoped (e.g. only '
        'penalize when the query itself references current state). Re-run '
        'this exact command after any change to temporal-validity.ts and '
        're-commit this artifact alongside any default flip.'
    ),
}

with io.open(PATH, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(report, f, indent=2)
    f.write('\n')

print('notes stamped:', PATH)
