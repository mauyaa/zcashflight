---
title: "Case study: project A (event ticket checkout)"
description: ZcashFlight run against an independent open-source event checkout that takes Zcash through a payment processor. One finding, a two-line fix, verified closed.
audience: judge
type: reference
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-21
---

# Case study: project A (event ticket checkout)

**Anonymised.** The project is named here only after its maintainer has been told privately and has had time to respond. Nothing has been sent yet.

## The project

An independent open-source web app (MIT / Apache-2.0, Next.js) that sells event tickets: it loads events from an event platform, creates a Zcash invoice through a payment processor, and registers the attendee when the processor's signed webhook says the payment is confirmed. It writes structured JSON logs to the console, which on a hosted deployment end up in the host's log service.

## How it was run

| | |
|---|---|
| Date | 21 Oct 2026 |
| Environment | Windows 11, Node 24.18.0, Docker 29.6 (the project's local DynamoDB image, in memory) |
| Project commit | `b03e593` (14 May 2026), a fresh clone; dependencies installed with `npm ci --ignore-scripts` |
| ZcashFlight | this repository, working tree on top of `dc9c89a`; `zcashflight run --ci` |
| Data | synthetic only: a txid from `zcashflight synth`, a made-up webhook secret and API keys, `example.test` email. No real funds, users, accounts or production endpoints |
| Third parties | the event platform and the npm registry were answered locally by the sinkhole; nothing left the machine |

A small script wrote the policy with a freshly signed synthetic webhook (the app rejects signatures older than five minutes). Scenarios:

- `webhook-signed`: the payment processor's `confirmed` webhook, correctly signed, for an unknown invoice → `200`
- `webhook-unsigned`: the same body without a signature → `401`

**Not exercised:** checkout itself. It needs the event platform's API, which the app calls at a fixed HTTPS URL; with the sinkhole answering, invoice creation fails (`500`), so an earlier run that included checkout was incomplete and is not counted. Attendee registration, the admin pages and the dashboard were not run either.

## Result

| Run | Findings | Gate |
|---|---|---|
| Before | **high** Transaction ID written to the console log (`console.log`, signed webhook) · **high** the same on `console.warn` (unsigned webhook) · medium: app startup reached a third party (`registry.npmjs.org`) | exit 1 |
| After the fix | both txid findings **closed**; the startup call remains | exit 1 (startup call only) |

Evidence as stored (masked): `log.txid: 1f1b…8996 (context)`. A search of every file ZcashFlight wrote found 0 raw copies of the synthetic txid.

**Why it matters.** On every webhook the app logs the invoice id and the txid together, and when an order is created it logs the invoice id with the attendee's email. Anyone who can read the logs (the hosting provider's log service, a log aggregator, staff) can join an attendee's email to an on-chain transaction. The shielded payment hides its contents, but the log ties a named person to that transaction and its time. The unsigned case also means anyone can make the app log a txid of their choosing.

**The fix** (two lines, private patch): log `has_txid: Boolean(txid)` instead of the txid in the `webhook.received` and `webhook.unknown_session` events. The txid is still stored in the app's own database, which is where it is needed. The project's own test suite passes with the patch (21 / 21, vitest).

The npm-registry call is Next.js's development server checking for updates at startup; it does not happen in production and carries no Zcash data. It is reported because every third-party call is.

## What it taught us about ZcashFlight

- **Fixed:** traffic before the first scenario was blamed on the first scenario ("Checkout activity revealed…"). It is now labelled *app startup* (regression test in `test/privacy-regressions.test.ts`).
- **Limit:** no source line was shown, because Next.js bundles the server code and the stack frames point into `.next/` chunks. ZcashFlight shows a line only when a frame proves it, so it showed none.
- **Limit:** ZcashFlight flagged the txid; the email-to-invoice join that makes it serious was found by reading the code. Emails are not a Zcash data class.
- Signed webhooks need a fresh signature, so the policy was generated just before each run.

## Disclosure

Low to moderate severity: it needs log access, and no funds are at risk. A private note with the patch is drafted outside this repository and has **not** been sent. The project has no `SECURITY.md`, so the plan is a private message to the maintainer, then a public issue or PR only if they agree.
