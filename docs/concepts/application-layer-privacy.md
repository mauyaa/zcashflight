---
title: Application-layer privacy
description: Why a shielded transaction is not the whole privacy story, and what ZcashFlight checks instead.
audience: developer, evaluator
type: explanation
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Application-layer privacy

## Three layers, three different protections

| Layer | What can leak | What protects it |
|---|---|---|
| **Chain** | Sender, recipient, amount, memo | Shielded pools (Sapling, Orchard) and zero-knowledge proofs |
| **Network** | IP address, timing, which node you talk to | Tor, Nym mixnet, careful node choice |
| **Application** | Anything the app itself sends or writes: analytics, logs, error reports, third-party APIs, refund paths | Nothing by default. This is the layer ZcashFlight tests |

A user who chooses a shielded payment has made a decision about the chain layer. The app they use can undo it at the application layer without ever touching the chain.

## How it goes wrong

These four patterns are ordinary in web development, which is why they're easy to miss:

1. **Analytics payloads.** `track('checkout', { recipient, amount })` makes "who paid whom and how much" a row in a vendor's database, with a timestamp and usually a device ID.
2. **Interpolated logs.** `log.debug(\`broadcast ok txid=${txid}\`)` puts a transaction ID next to a server timestamp and, often, a request ID tied to a session.
3. **Error context.** `reportError(err, { extra: { memo } })` sends memo text, often the most personal field, to an error service, along with everything else in scope.
4. **Pool downgrades.** Refunding to a stored transparent address, or sending with `AllowRevealedRecipients`, puts the recipient on chain in the clear.

There's a fifth, quieter one. **Calling any third party on the payment path** tells that party a payment happened and when, even with no fields at all. Correlated with a block time, that can be enough.

## Why tests miss it

Functional tests check that the payment worked. It did. The leak is a side effect: an extra field, an extra request, an extra log line. You only see it by observing everything the app sends while it runs, which is what ZcashFlight automates.

## What ZcashFlight deliberately does not do

It doesn't look at the chain, decrypt anything, or try to identify anyone. It observes **your own app**, in **your test environment**, with **test data**, and reports what left. That keeps the tool on the right side of the line it exists to defend.

## Further reading

- [Zcash privacy recommendations](https://zcash.readthedocs.io/en/latest/rtd_pages/privacy_recommendations_best_practices.html)
- [Addresses and value pools](https://zcash.readthedocs.io/en/latest/rtd_pages/addresses.html)
- [ZIP 316: unified addresses](https://zips.z.cash/zip-0316) · [ZIP 320: TEX addresses](https://zips.z.cash/zip-0320)
- [`z_sendmany` and its privacy policies](https://zcash.github.io/rpc/z_sendmany.html)
