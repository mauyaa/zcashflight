---
title: Product brief
description: Why ZcashFlight exists, who it is for, what it does today, and how we will know it works.
audience: evaluator, contributor
type: explanation
owner: product owner
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Product brief

## One-line definition

ZcashFlight helps **Zcash wallet and payment developers** **find and fix privacy leaks before release** by **running their app's real flows and checking every request and log line against a privacy policy, with Zcash-aware detection**.

## Problem

For teams building Zcash wallets and payment apps, the application around a shielded transaction can publish what the transaction protects: the recipient and amount sent to analytics, the transaction ID kept in logs, the memo attached to error reports, a refund routed to a transparent address. Each one links shielded activity to an identity or a time outside the chain. Today they rely on code review and manual traffic inspection, but neither is repeatable, neither runs on every change, and neither proves a fix held.

**Evidence:**

- Zcash's documentation warns that metadata leakage and network-level linkability can undermine privacy ([privacy recommendations](https://zcash.readthedocs.io/en/latest/rtd_pages/privacy_recommendations_best_practices.html)). *Published guidance.*
- The four ZecShop leaks come from patterns that are common in web apps generally: analytics events with payload properties, interpolated debug logs, error context objects, and legacy address fields. *Assumption, based on the authors' experience. The prevalence in Zcash codebases has not been measured.*
- We have not interviewed Zcash wallet teams yet. *Next evidence required (see Risks).*

**We will know the problem is meaningfully reduced when** a team can run ZcashFlight in CI on every pull request and a reintroduced leak fails the build with evidence that names the line.

## Alternatives, and their gap

| Alternative | What it does well | The gap |
|---|---|---|
| Code review | Catches intent | Not repeatable; misses leaks inside SDK calls and logger formats |
| Manual proxy inspection (mitmproxy, DevTools) | Shows real traffic | Manual, unrecorded, and nobody re-checks it after a fix |
| Secret scanners (gitleaks, trufflehog) | Find keys committed to source | Look at code at rest, not data the running app sends; don't know Zcash addresses, memos or amounts |
| CipherScan | Explorer, wallet scanning and on-chain privacy analytics | On-chain view; doesn't test the application layer or verify fixes |
| Nym × Zcash | Network-layer privacy (mixnet) | Protects transport metadata; doesn't stop the app sending the data itself |

## Principles and promise

- **Evidence over assumptions.** Every finding shows what was observed, masked, and where in the code it came from.
- **Local first.** The tool runs on the developer's machine and masks at capture; it never uploads.
- **Repeatable.** The same scenarios and rules every time, so a fix can be verified and a regression caught.
- **No deanonymisation.** It tests your app's behaviour, never other people's activity.

**Promise to the user:** *point it at your app and you get a list of what leaked, the line that leaked it and the fix. After you fix it, run it again and see it closed.*

## Audience and jobs

| Who | Job to be done |
|---|---|
| Zcash wallet developer (primary) | "Before I ship, show me what my app sends that it shouldn't." |
| Payment app / merchant integrator | "Prove our checkout doesn't leak customers' addresses or amounts to vendors." |
| Security engineer | "Give me a repeatable test I can put in CI, with findings I can triage." |
| Evaluator or grant reviewer | "Is this privacy claim backed by evidence?" |

Out of scope as users: consumers and wallet end users.

## Core journey

**Trigger:** a release, a new SDK, or a privacy review. **First action:** `zcashflight run` on the app, or the sample. **Decision:** which findings to fix and which to accept as deliberate. **Outcome:** a clean comparison, a report and a CI gate. **Recovery:** if the app doesn't start or nothing is heard, the tool says why and what to change (see [troubleshooting](../guides/troubleshooting.md)).

## Scope

| | |
|---|---|
| **In v0.1** | Node app capture; proxy for other stacks; HAR import; ZIP 321 payment-request detection; rules A–D; compare; CI gate; SARIF, HTML and Markdown; dashboard; sample app, validation suite, and a before/after proof on a real Zebra + Zallet regtest chain |
| **Planned** | Custom rule plugins; mobile (iOS/Android) capture; team history; local ZIP 316 receiver decoding (today the wallet resolves receivers) |
| **Out of scope** | Decrypting shielded data; identifying users; scanning third-party wallets; network anonymity; certifying an app as private |
| **Not yet proven** | That teams adopt it in CI; the false-positive rate on large real codebases |

## Measures

| Measure | Target | Today |
|---|---|---|
| Seeded exposures detected | 100% of the validation suite | 19/19 (`npm run validate`) |
| False positives on look-alikes | 0 | 0/8 |
| Raw values in stored data | 0 | 0, asserted in tests |
| Repeat-run consistency | Identical fingerprint | Asserted in `test/zecshop.test.ts` |
| Time to first result | Under 2 minutes from clone | `npm run demo` (measured locally; not user-tested) |
| Activation (planned) | A team runs it in CI | Not measured yet |

## Differentiation

Testable distinctions, not adjectives:

1. Detection uses Zcash encodings and checksums, so it can tell a real unified address from random text.
2. It inspects runtime behaviour, not source code at rest, so leaks inside SDK calls and log formatters are visible.
3. It understands wallet RPC: `z_sendmany` recipients' pools and `privacyPolicy` values.
4. It verifies fixes, by comparing runs through stable finding IDs.
5. It holds itself to its own rule: mask at capture, sinkhole by default, no dependencies.

## Risks and next evidence

| Risk | Mitigation | Next evidence |
|---|---|---|
| Overlap with existing tools | Focus on the application layer and fix verification | Review with 3–5 wallet teams |
| False positives on real codebases | Checksums, field context, a baseline for accepted findings | Run on two open-source Zcash apps |
| Coverage gaps (non-Node, mobile) | Proxy and HAR now; native hooks later | Track requests for other stacks |
| The tool itself becomes a leak | Mask at capture; tests assert no raw storage; [threat model](../trust/threat-model.md) | External review of the masking code |
| Overstated guarantees | Every report lists what was not tested | Usability test of report wording |
