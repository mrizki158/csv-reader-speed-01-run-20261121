# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/mrizki158/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/mrizki158/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in replacement for csv-reader 1.0.0: `solve.js` exports `run(input)` returning exactly csv-reader's answer `{columns, rows, errors}` for every input `{text, header}` — the same broken-row policy, the same errors in the same order — but reads the text with char-code scans and one string slice per clean field segment instead of building every field a character at a time. The unquoted scan is inlined into the record loop, quoted fields take a single slice when they hold no doubled quotes or line breaks, and only a stray CR, a doubled quote or a CR inside quotes splits a field into segments that are joined once. `main.ts` is the harness driver: it reads `/input/cases.json`, answers each case with `run`, and writes `/output/answers.json`, with V8's incremental marking turned off as the house driver runs.

Verified against the practice set (6/6 cases identical, driver outputs byte-identical to the baseline's) and about 2x faster than the house baseline in CPU time on it.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qe91xxve&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
