---
title: How ZcashFlight handles your data
description: What the ZcashFlight CLI and local dashboard observe, keep and send (nothing leaves your machine).
audience: developer, security reviewer
type: policy
owner: security/privacy owner
status: published
product_version: 0.1.0
last_reviewed: 2026-10-19
---

# How ZcashFlight handles your data

| | In short |
|---|---|
| **Who** | ZcashFlight runs on your machine, as you. The project operates no server and receives nothing. |
| **What** | Requests your app sends, its console output and the log files you list, during a test run only. |
| **Kept** | Findings in `.zcashflight/runs/` with detected protected values masked. Detection is not a general-purpose secret scrubber. |
| **Shared** | With no one. No telemetry, no update check, no account. Third-party calls your app makes during tests are answered locally. |
| **Your choices** | Delete `.zcashflight/` at any time; turn the sinkhole off only if you mean to send real requests. |

The hosted demo page has its own notice: [demo site privacy](docs/trust/demo-site-privacy.md).

ZcashFlight's job is to look at sensitive data, which makes it a new place that data could leak from. The rest of this page says exactly what it touches, what it keeps, and where it goes.

## What is collected

During a run, only the app ZcashFlight started, and only for the length of the run:

| Observed | Kept |
|---|---|
| Outbound `fetch` / `http(s)` requests: method, URL, headers, body | Masked URL, header **names**, body **field names**, masked matches, byte count |
| `console.*` output | Masked line (truncated to 400 characters), masked matches |
| `process.stdout` / `stderr` writes and raw writes to file descriptors 1 and 2 | Same as console. The app's own output is passed through unchanged |
| New lines in the log files listed in `logs:` | Same as console |
| Wallet RPC send calls | Method, which pools are touched, `privacyPolicy` |
| Stack frames inside your project | File, line, column, function name. Source is read in memory to choose the location, but source snippets are not stored in new runs |

**Never inspected or recorded:** `Authorization`, `Cookie`, `Proxy-Authorization` and `X-Api-Key` headers; anything from processes ZcashFlight didn't start; incoming requests to your app; HTTPS bodies through the proxy (host only).

Those headers' values are excluded; their names may be listed. URL usernames and passwords are removed. Imported logs, including NDJSON, are inspected again rather than trusted as masked capture data. HAR exports retain request semantics; log imports do not.

## Masking happens at capture

The collector runs inside the app process and masks every match **before** writing anything:

- Seed phrases and spending keys become `[redacted seed phrase]` and `[redacted spending key]`.
- Viewing keys keep only their prefix: `uviewtest1…[redacted]`.
- Addresses keep their prefix and last four characters, `utest1dh…lcr2`, which is enough to recognise your own test address and not enough to use it.
- Transaction IDs keep the first and last four characters. Amounts become `••••`. Memos become `•••• (26 chars)`.

To show that two findings involve the same value, each match carries `ref`: an HMAC-SHA256 of the value under a random 256-bit key. The key is created per run, passed to the app in an environment variable, held in memory only, and discarded when the run ends. Refs therefore link repeats **within** a run and cannot be linked **across** runs, or reversed.

The dashboard's "hold for proof" shows *how* a value was recognised (`unified address · testnet · encoding and checksum verified`), never the value itself, because ZcashFlight doesn't have it.

## Where it goes

- **Capture file:** `.zcashflight/tmp/capture-<id>.ndjson`, masked events only, deleted at the end of the run.
- **Run file:** `.zcashflight/runs/NNNN.json`, masked findings and statistics. Review before sharing: names, paths, policy metadata and unrecognised text can still be sensitive. Add `.zcashflight/` to `.gitignore` if you do not want to commit it.
- **Network:** intercepted non-local fetch and HTTP(S) requests are answered locally with `sinkhole: true` (the default). Automatic fetch redirects are rejected in this mode; use manual redirects and explicit fetch calls to keep every hop visible. Raw sockets and uninstrumented clients remain outside this protection.

ZcashFlight has no telemetry, no update check, no account and no server. It has zero runtime dependencies.

## The dashboard

`zcashflight ui` listens on `127.0.0.1` only. Every API call needs a random per-session token that is embedded in the page it serves. Requests whose `Host` header isn't local are refused, which blocks DNS-rebinding attacks from web pages. The page sets a strict Content-Security-Policy and `no-referrer`, and loads no third-party resources: no fonts, CDNs or analytics, and its photos are bundled.

## Test data

Use synthetic data. `zcashflight synth` produces testnet identifiers with valid encodings and **random payloads**, so detectors treat them as real but no key exists for them. Never point ZcashFlight at production data or real user funds.

## Limits

ZcashFlight reports what it observed in your scenarios. Network-level metadata (IP address, TLS fingerprints, transport timing), mobile and browser clients, and code paths your scenarios don't exercise are outside what a run can see, and every report says so.

Masking covers recognised Zcash identifiers and supported field context, not arbitrary credentials or personal information. The app's original console output, stdout and log files are not rewritten. Request bodies of every common type are read in memory up to 5 MB (including Blob, FormData, streams, and gzip/deflate/br); anything that cannot be read is reported as uninspected, never as clean, and its raw bytes are not stored. Historical run files and recorded assets are not retroactively scrubbed by these fixes. Use synthetic inputs and inspect artifacts before sharing.
