---
title: Detection reference
description: Which Zcash identifiers ZcashFlight recognises, how each is proven, and how each is masked.
audience: developer, security engineer
type: reference
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Detection reference

An identifier only counts when its encoding is real. Each hit records its **proof**: `checksum`, `wordlist` or `context` (the field or label it was found in).

## Identifiers proven by checksum

| Kind | Mainnet / testnet / regtest prefix | Encoding | Payload check | Data class |
|---|---|---|---|---|
| Unified address (ZIP 316) | `u` / `utest` / `uregtest` | Bech32m, no length cap | ≥ 32 bytes | address |
| Unified full viewing key | `uview` / `uviewtest` / `uviewregtest` | Bech32m | ≥ 32 bytes | viewing key |
| Unified incoming viewing key | `uivk` / `uivktest` / `uivkregtest` | Bech32m | ≥ 32 bytes | viewing key |
| TEX address (ZIP 320) | `tex` / `textest` / `texregtest` | Bech32m | 20 bytes | address |
| Sapling address | `zs` / `ztestsapling` / `zregtestsapling` | Bech32 | 43 bytes | address |
| Sapling extended full viewing key | `zxviews` / `zxviewtestsapling` / … | Bech32 | ≥ 32 bytes | viewing key |
| Sapling incoming viewing key | `zivks` / `zivktestsapling` / … | Bech32 | ≥ 32 bytes | viewing key |
| Sapling extended spending key | `secret-extended-key-main` / `-test` / `-regtest` | Bech32 | ≥ 32 bytes | spending key |
| Transparent P2PKH | `t1` (0x1CB8) / `tm` (0x1D25) | Base58Check | 22 bytes | address |
| Transparent P2SH | `t3` (0x1CBD) / `t2` (0x1CBA) | Base58Check | 22 bytes | address |
| Sprout address | `zc` (0x169A) / `zt` (0x16B6) | Base58Check | 66 bytes | address |
| Sprout spending key | 0xAB36 / 0xAC08 | Base58Check | 34 bytes | spending key |
| Transparent private key (WIF) | 0x80 / 0xEF | Base58Check | 33 bytes, or 34 ending 0x01 | spending key |

A WIF key's version byte is shared with Bitcoin, so a Bitcoin WIF private key is also reported. That is deliberate: a private key leaving the app is critical whichever chain it belongs to.

## Proven by a valid ZIP 321 payment request

A `zcash:` URI anywhere in a URL, header, body or log line is parsed against [ZIP 321](https://zips.z.cash/zip-0321). It counts only if it is valid: the ABNF grammar, `paramindex` without leading zeros, no duplicate parameters, an address for every index, amounts as decimal ZEC with at most 8 decimals and at most 21,000,000, memos as base64url (no `+`, `/` or padding) of at most 512 bytes, no memo for a transparent address, no unknown `req-` parameter, no `amount` with `req-asset`, and every address checksum-valid and not Sprout.

A valid request is reported field by field under the field that carried it, for example `body.props.payment_request[zip321].address`, `[zip321].amount` and `[zip321].memo` (with `[zip321.1]` for the second payment). The address keeps its checksum proof; the amount and memo are proven by the request itself. An invalid URI isn't credited as a payment request, but any valid address inside it is still found by the checksum scan.

## Proven by word list

**Seed phrase:** 12 or more consecutive words from the BIP-39 English list (2048 words, sha256 `2f5eed53…dbda`), separated only by spaces or commas. A field named `seed`, `mnemonic`, `recovery_phrase` or `backup_phrase` holding 12 or more words also counts.

## Proven by context

| Data class | Recognised when |
|---|---|
| Transaction ID | 64 hex characters in a field named `txid`, `tx_id`, `tx_hash`, `transaction_id` or `tx`, or after `txid=` / `txid:` in text. A bare 64-hex string is **not** treated as a txid, because hashes are everywhere |
| Amount | A number in a field named `amount`, `value`, `zats`, `zatoshis`, `zec`, `total`, `price`, `balance` or `amount_zec`, or text like `1.25 ZEC`, `0.5 TAZ`, `125000 zats` |
| Memo | A non-empty string in a field named `memo`, `memo_text`, `note` or `message_memo`, or text like `memo="…"` |

## Where it looks

URL path and query, every header except `Authorization`, `Cookie`, `Proxy-Authorization` and `X-Api-Key` (never inspected), and the body: JSON, form-encoded or plain text. Percent-encoded values are matched too.

## Masking

| Data class | Stored as |
|---|---|
| Address | Prefix and the first two data characters, then the last four: `utest1dh…lcr2`, `tmUS…Wzhs` |
| Transaction ID | First four and last four: `b78c…1ab8` |
| Amount | `••••`. Bare numbers are only replaced where they stand alone, never inside an IP address or version |
| Memo | `•••• (26 chars)` |
| Viewing key | `uviewtest1…[redacted]` |
| Spending key, seed phrase | `[redacted spending key]`, `[redacted seed phrase]` |

Each hit also carries `ref`: an HMAC-SHA256 of the value under a per-run random key held only in memory. It links repeats within one run and cannot be linked across runs.
