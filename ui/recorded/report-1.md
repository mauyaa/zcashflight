## ZcashFlight · ZecShop

**5 privacy leaks found.**

Run 1 · testnet · 20 Oct 2026, 12:34 UTC · fingerprint `2aa8 f30c` · 14 requests, 5 log lines, 7 kept off the network

| | Finding | Rule | Where | Code |
|---|---|---|---|---|
| 🟧 high | Address and amount sent to analytics | A · Sensitive data in requests | `analytics.example.com` | `server.ts:56` |
| 🟧 high | Transaction ID written to a log | B · Sensitive data in logs | `logs/server.log` | `server/broadcast.ts:9` |
| 🟧 high | Memo sent to error monitoring | A · Sensitive data in requests | `errors.example.io` | `server.ts:88` |
| 🟨 medium | Checkout activity revealed to a price API | D · Third-party data flows | `api.coingecko.com` | `lib/prices.ts:5` |
| 🟨 medium | Payment sent to a transparent address | C · Transaction type and public exposure | `127.0.0.1:18232` | `lib/refund.ts:9` |

<details><summary><b>Address and amount sent to analytics</b> · high · <code>server.ts:56</code></summary>

Scenario **checkout**, 3 occurrences. Evidence is masked.

```
POST https://analytics.example.com/v1/track
body.props.recipient: utest1dh…lcr2   (unified-address, checksum-verified)
body.props.amount: ••••   (amount, by field name)
```

**Fix:** Send event names, not payment data.
- Drop `props.recipient`, `props.amount` from the analytics payload.
- If you need conversion numbers, count them on your server without identifiers.
- Re-run ZcashFlight to confirm the event no longer carries protected fields.

**Read:** [Zcash privacy recommendations](https://zcash.readthedocs.io/en/latest/rtd_pages/privacy_recommendations_best_practices.html)

**Reproduce:** `zcashflight run --scenario checkout` → `Scenario step: POST /api/checkout` → `Observed: POST https://analytics.example.com/v1/track`

</details>

<details><summary><b>Transaction ID written to a log</b> · high · <code>server/broadcast.ts:9</code></summary>

Scenario **refunds**, 1 occurrence. Evidence is masked.

```
2026-10-20T12:34:27.209Z DEBUG broadcast ok txid=b78c…1ab8
log: b78c…1ab8   (txid, by field name)
```

**Fix:** Log what happened, not who or how much.
- Stop interpolating `log` into log lines.
- Log a locally generated correlation ID; keep the txid ↔ ID mapping out of logs.
- Add a logger redaction rule for Zcash identifiers as a second line of defence.

**Read:** [Zcash privacy recommendations](https://zcash.readthedocs.io/en/latest/rtd_pages/privacy_recommendations_best_practices.html)

**Reproduce:** `zcashflight run --scenario refunds` → `Scenario step: POST /api/checkout` → `Observed in logs/server.log`

</details>

<details><summary><b>Memo sent to error monitoring</b> · high · <code>server.ts:88</code></summary>

Scenario **errors**, 1 occurrence. Evidence is masked.

```
POST https://errors.example.io/api/42/store/
body.extra.memo: •••• (26 chars)   (memo, by field name)
```

**Fix:** Scrub error reports before they leave the app.
- Remove `extra.memo` from the error context.
- Add a scrubbing hook (e.g. Sentry beforeSend) that strips Zcash identifiers, memos and amounts.
- Attach your own random correlation ID instead, so you can still debug.

**Read:** [Zcash privacy recommendations](https://zcash.readthedocs.io/en/latest/rtd_pages/privacy_recommendations_best_practices.html)

**Reproduce:** `zcashflight run --scenario errors` → `Scenario step: POST /api/checkout` → `Observed: POST https://errors.example.io/api/42/store/`

</details>

<details><summary><b>Checkout activity revealed to a price API</b> · medium · <code>lib/prices.ts:5</code></summary>

Scenario **checkout**, 3 occurrences. Evidence is masked.

```
GET https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd
```

**Fix:** Every third-party call reveals that something happened, and when.
- Move this price API call off the user's path: fetch on a schedule on your server and cache it.
- If the call must stay, add the host to destinations: with a purpose so the exposure is a documented decision.

**Read:** [Zcash privacy recommendations](https://zcash.readthedocs.io/en/latest/rtd_pages/privacy_recommendations_best_practices.html)

**Reproduce:** `zcashflight run --scenario checkout` → `Scenario step: POST /api/checkout` → `Observed: GET https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd`

</details>

<details><summary><b>Payment sent to a transparent address</b> · medium · <code>lib/refund.ts:9</code></summary>

Scenario **refunds**, 1 occurrence. Evidence is masked.

```
POST http://127.0.0.1:18232/
body.params[1][0].address: tmUS…Wzhs   (transparent-p2pkh, checksum-verified)
```

**Fix:** Keep funds in the shielded pool end to end.
- Send to the customer's unified (or Sapling/Orchard) address, never a transparent one.
- Pass privacyPolicy "FullPrivacy" to z_sendmany so the wallet refuses revealing transactions.
- Reject transparent refund addresses at input validation.

**Read:** [Addresses and value pools](https://zcash.readthedocs.io/en/latest/rtd_pages/addresses.html) · [ZIP 316: Unified addresses](https://zips.z.cash/zip-0316) · [z_sendmany privacy policies](https://zcash.github.io/rpc/z_sendmany.html)

**Reproduce:** `zcashflight run --scenario refunds` → `Scenario step: POST /api/checkout` → `Observed: POST http://127.0.0.1:18232/`

</details>

**Tested:** checkout · refunds · errors · Outbound fetch and http(s) requests from the app process · Console output and logs/server.log · Wallet RPC sends (z_sendmany, sendtoaddress, sendmany)

**Not tested:** Browser and mobile clients · Network metadata such as IP address and request timing at the transport layer

<sub>ZcashFlight checks observable application behaviour in these tests. It does not decrypt transactions, deanonymise users, or certify that an app is private in all circumstances.</sub>