---
title: "Case study: project B (signed merchant invoices)"
description: ZcashFlight run against an independent open-source reference checkout for signed ZIP 321 invoices. No leaks detected in the tested scenarios.
audience: judge
type: reference
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-21
---

# Case study: project B (signed merchant invoices)

**Anonymised**, for consistency with project A. Nothing was found that needs disclosing.

## The project

An independent open-source library (MIT / Apache-2.0, no runtime dependencies) that lets merchants sign ZIP 321 payment requests so wallets can verify who is asking for the payment. It ships a verification-only checkout example: a Node server that publishes a signed merchant registry and signs an invoice for one fixed test order. The example cannot send funds.

## How it was run

| | |
|---|---|
| Date | 21 Oct 2026 |
| Environment | Windows 11, Node 24.18.0 |
| Project commit | `3a9030e` (27 Sep 2026), a fresh clone; nothing to install |
| ZcashFlight | this repository, working tree on top of `dc9c89a`; `zcashflight run --ci` |
| Data | the project's own published testnet address fixture and ephemeral keys it generates at start |

Scenarios: `GET /api/config`; `POST /api/invoice` for the test order (`200`); the same with a client-supplied amount, which the server must refuse (`400`).

## Result

**No leaks detected in these tests.** CI gate exit 0. The app made no outbound requests and wrote one console line (its start-up banner). ZcashFlight listed `fetch`, `node:http(s)` and `process.stdout` as hooked but unused, and the usual not-instrumented channels.

This is a narrow result: the example is small and deliberately careful (it refuses client-supplied payment fields and makes no third-party calls), and only its two endpoints were exercised. The payment request is returned to the requesting browser, which is its purpose; ZcashFlight checks what the app sends elsewhere. It is not a statement that the library or any integration of it is private.

## What it taught us about ZcashFlight

- A zero-dependency Node server needs no policy beyond the start command and the scenarios.
- The "hooked, but nothing went through them" line matters for a clean result: it says which channels were watched but never used, rather than implying they were tested.
