---
title: ZECATHON 2026 submission
description: Submission text for ZcashFlight: pitch, problem, how it works, what is real and what is a harness, measured results and links.
audience: judge
type: reference
owner: maintainer
status: draft
product_version: 0.1.0
last_reviewed: 2026-10-21
---

# ZcashFlight · ZECATHON 2026 submission

**Track:** Core & Tooling
**Repository:** <https://github.com/mauyaa/zcashflight> (MIT)
**npm:** <https://www.npmjs.com/package/zcashflight> (`npx zcashflight init`)
**Recorded replay:** <https://zcashflight.vercel.app> (replays a recorded run of the sample app; it does not scan anything)
**Video:** to be added after recording

## One line

A CLI and GitHub Action that runs your Zcash app's real flows and catches leaked addresses, amounts, memos and transaction IDs before you ship.

## The problem

A shielded Zcash payment hides who paid whom and how much on chain. The app around it often doesn't: the checkout sends its payment request to analytics, a debug log keeps the txid, an error tracker attaches the memo, a refund goes to an old transparent address. Each mistake publishes off chain what the user chose to shield, and functional tests never notice, because the payment still works.

## How it works

ZcashFlight starts the app under a small in-process collector (`node --import`), drives the scenarios in `zcashflight.yml` (checkout, refunds, errors), and inspects every outbound request, console line, stdout write and log file:

- **Zcash-specific detection:** addresses and keys by their real encodings and checksums (unified, Sapling, TEX, transparent, viewing and spending keys), ZIP 321 payment requests parsed to the spec, BIP-39 seed phrases, and txids, amounts and memos by context.
- **Masked at capture:** values are masked inside the app process before anything is written, with per-run keyed references; requests to third parties are answered locally (sinkhole), so test data never reaches them; no telemetry.
- **Evidence and a fix:** each finding has the masked evidence, the destination, the line of code that sent it (only when a stack frame proves it), and a fix. The same scenarios run again to prove it closed, and a CI gate (`--ci`, SARIF, a GitHub Action) keeps it closed.
- **Never silent:** anything it sees but can't read (an unknown body type, a body over 5 MB, a decompression bomb, binary data, an HTTPS proxy tunnel) is reported as uninspected, never as clean; `strict: true` fails the build on it.

**For** merchant and payment backends, bots, explorers and web front ends. Mobile and Rust wallets are covered only through the proxy (plain HTTP in full, HTTPS host only) or a HAR export.

## What is real and what is a harness

| Part | Real or harness |
|---|---|
| Detection, masking, rules, reports, CI gate | Real |
| `npm run regtest` | Real Zebra node and Zallet wallet on a local regtest chain (via Z3); payments, sweeps and refunds are real transactions. The customer's wallet (a second account in the same Zallet) and block mining are a test harness |
| `npm run demo` | The same sample app against a mock wallet RPC, so it runs anywhere without Docker |
| ZecShop | A deliberately leaky sample built for this project |
| Channel and corpus tests | Synthetic fixtures with synthetic identifiers (`zcashflight synth`) |
| Analytics, error monitoring, price API | Not real: answered locally by the sinkhole |
| The hosted site | A recorded replay of the sample app |

## Results

Measured on 21 Oct 2026 · Windows 11 · Node 24.18.0 · commit `7238064`, from a fresh clone (the real-chain proof in the working copy of the same commit).

| What | Command | Result |
|---|---|---|
| Real chain (Zebra + Zallet regtest) | `npm run regtest` | 5 leaks found → all 5 closed after the fixes; CI gate exit 1 → 0; 8 real transactions |
| Mock-wallet sample | `npm run demo` | 5 → 0; exit 1 → 0 |
| Detection corpus | `npm run validate` | 54 / 54 seeded exposures found · 0 / 26 false positives · 0 raw values stored |
| Leak channels | `npm test` | 9 / 9 reference channels (base64, gzip, FormData, Blob, batch array, query string, stdout, console, JSON), from 3 / 9 before this work |
| Independent projects | `zcashflight run` on local clones | A: 2 findings → closed by a 2-line fix · B: no leaks detected |
| Whole suite | `npm test` | 115 / 115 |
| CI | GitHub Actions | Windows, macOS, Linux × Node 22, 24 |

**Independent projects** (21 Oct 2026, local clones, synthetic data only, anonymised until the maintainers are contacted): [project A](case-studies/project-a.md), an event ticket checkout, logged the payment txid next to the invoice id on every payment webhook (2 high findings; a two-line fix closed both; disclosure drafted, not sent). [Project B](case-studies/project-b.md), a signed-invoice reference checkout: no leaks detected in the tested scenarios. Neither run covers the whole project. A clean run means no leaks were detected in the tested scenarios, never a privacy guarantee. The full list of what is not tested is in the [README](../README.md#not-tested).

## Built during the hackathon

Written for ZECATHON 2026 within the build window (28 Sep – 28 Oct 2026). All code and assets date from 18 Oct 2026 onwards; the first commit collects the first two days of work, and every change since is its own commit. Existing open-source tools are used only at run time for testing (Z3, Zebra, Zallet); none of their code is included.

## Links

- Repository: <https://github.com/mauyaa/zcashflight>
- Real-chain guide: [docs/guides/regtest.md](guides/regtest.md)
- Threat model: [docs/trust/threat-model.md](trust/threat-model.md)
- Recorded replay: <https://zcashflight.vercel.app>
