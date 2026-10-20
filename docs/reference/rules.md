---
title: Rules reference
description: What triggers each ZcashFlight rule, its default severity, and how findings are grouped.
audience: developer, security engineer
type: reference
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Rules reference

Rules are deterministic: the same events and policy always give the same findings. No model decides whether something is a leak. Severities are defaults for triage, not universal ratings. What matters in your app depends on the data, the recipient and your policy.

## Rule A

**Sensitive data in requests.** SARIF ID `ZF-A`. Default severity **high**.

Fires when an outbound request carries a protected data class (in the URL, a header, or the body) to a host that isn't in `destinations:`, or that is listed without that class in `allow:`.

Grouped by destination and code path, so three checkouts that send the same field give one finding with three occurrences. Example: *Address, amount and memo sent to analytics*, when a checkout hands its ZIP 321 payment request to an analytics SDK. The fix names the field that carried the request.

## Rule B

**Sensitive data in logs.** SARIF ID `ZF-B`. Default severity **high**.

Fires when console output (`console.log`, `info`, `warn`, `error`, `debug`) or a file listed in `logs:` contains a protected data class that the log source's `allow:` doesn't permit. JSON-lines logs keep field names as context, so `{"amount_zats": 125000000}` counts as an amount. Example: *Transaction ID written to a log.*

## Rule C

**Transaction type and public exposure.** SARIF ID `ZF-C`. Default severity **medium**. Requires `transactions.shielded_only: true`.

Fires on a wallet send over JSON-RPC (`z_sendmany`, `sendtoaddress`, `sendmany`, `z_shieldcoinbase`, `z_mergetoaddress`) when:

- a recipient is a transparent or TEX address, or
- the funds come from the transparent pool (except `z_shieldcoinbase` into a shielded address: shielding is the recommended move, not an exposure), or
- `privacyPolicy` reveals something (`AllowRevealedRecipients`, `AllowRevealedAmounts`, `AllowRevealedSenders`, `AllowFullyTransparent`, `AllowLinkingAccountAddresses`, `NoPrivacy`).

Example: *Payment sent to a transparent address.*

## Rule D

**Third-party data flows.** SARIF ID `ZF-D`. Default severity **medium**.

Fires when the app contacts a non-local host that isn't in `destinations:`, even with no protected fields, because the request alone reveals that something happened and when. When protected data is in the request, rule A reports it instead. Example: *Checkout activity revealed to a price API.*

## Severity overrides

Spending keys and seed phrases make any finding **critical**. Viewing keys make it at least **high**.

## Finding IDs

Each finding has a 10-character ID computed from the rule, the destination, the code path (files and function names, not line numbers) and the data classes. That keeps IDs stable when unrelated code moves, so `compare` can report a finding as closed, still open or new, and the baseline can accept it.

## Code location

For live runs, ZcashFlight records your project's own stack frames (innermost first, outside `node_modules`) and points the finding at the line where a protected field is handed over by name (for a ZIP 321 request, the field that carried the request). For wallet sends, it points at the first caller outside the RPC client. Proxy captures and HAR imports carry no stack, so their findings have no code location rather than a guessed one. Log-file lines carry no stack either, so they are matched to the source line containing the log's literal text, preferring files the app was seen running.
