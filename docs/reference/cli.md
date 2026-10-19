---
title: CLI reference
description: Every zcashflight command, flag and exit code.
audience: developer
type: reference
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# CLI reference

All commands accept `--dir <path>`: the project folder containing `zcashflight.yml`. It defaults to the current folder. Flags take a value either as `--flag value` or `--flag=value`. Colour is turned off when output isn't a terminal or `NO_COLOR` is set.

## `zcashflight run`

Starts the app from `app.start`, waits for `app.ready`, runs the scenarios, evaluates rules A–D and saves the run.

| Flag | Default | Meaning |
|---|---|---|
| `--scenario <name>` | all | Run one scenario; the others are listed as "not run" |
| `--ci` | off | Exit 1 on a finding at or above `--fail-on` that isn't in `zcashflight.baseline.json`; exit 2 if incomplete |
| `--fail-on <severity>` | `medium` | `low`, `medium`, `high` or `critical` |
| `--sarif <file>` | — | Also write SARIF 2.1.0 |
| `--report <file>` | — | Also write a report: `.html` for HTML, anything else for Markdown |

If `GITHUB_STEP_SUMMARY` is set, the Markdown report is appended to it.

**Exit codes:** 0 complete (or, with `--ci`, nothing new at or above the threshold); 1 (`--ci` only) gating findings; 2 failed or incomplete run, or a policy error.

## `zcashflight scan <file>…`

Inspects files offline with the same rules: `.har` (browser DevTools export), and all other files, including `.ndjson`, as logs. NDJSON is inspected and masked again; it is never trusted as an already-masked capture. To preserve request semantics, import HAR or re-run the scenarios. Without a `zcashflight.yml`, everything is protected and no destination is approved. Accepts `--ci`, `--fail-on` and `--sarif`.

## `zcashflight compare [a] [b]`

Compares two runs by finding ID and lists **closed**, **open** and **new**. With no arguments it compares the last two runs; with one, that run and the next. Exits 1 if the verdict is `regressed` (something new), otherwise 0.

## `zcashflight report [n]`

Prints or writes a run (default: the latest).

| Flag | Default | Meaning |
|---|---|---|
| `--format <f>` | `md` (or `html` if `--out` ends in `.html`) | `md`, `html`, `sarif` or `json` |
| `--out <file>` | stdout | Write to a file |

## `zcashflight ui`

Starts the local dashboard on `http://127.0.0.1:<port>/` and opens it. It listens on 127.0.0.1 only and needs a per-session token (embedded in the page it serves).

| Flag | Default |
|---|---|
| `--port <n>` | `4610` |
| `--no-open` | open the browser |

## `zcashflight proxy`

A local forward proxy for apps that aren't Node. Plain HTTP is inspected in full; HTTPS records the host only. Press Ctrl+C to evaluate and print findings.

| Flag | Default |
|---|---|
| `--port <n>` | `4601` |

## `zcashflight init`

Writes a starter `zcashflight.yml`. It refuses to overwrite an existing file unless you pass `--force`. If `package.json` has a `start` script, `app.start` becomes `npm start`.

## `zcashflight synth`

Prints synthetic identifiers for tests: unified, Sapling, transparent and TEX addresses, a unified viewing key, a Sapling spending key, a txid and a seed phrase. Encodings and checksums are valid; payloads are random, so no key exists for them.

| Flag | Default |
|---|---|
| `--mainnet` | testnet encodings |
| `--seed <text>` | `zcashflight` (deterministic output) |
| `--json` | table |

## `zcashflight list` · `version` · `help`

`list` shows past runs with their status and fingerprint. `version` prints the version. `help` prints usage.
