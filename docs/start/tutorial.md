---
title: "Tutorial: find and fix your first leak"
description: Learn the scan, prove, fix, verify loop on ZecShop, a sample checkout with five seeded leaks.
audience: developer, evaluator
type: tutorial
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Tutorial: find and fix your first leak

**What you will learn:** how ZcashFlight finds a leak, what its evidence means, and how a re-run proves a fix. It takes about ten minutes.

**Starting state:** a checkout of this repository and Node 22.18 or later. You'll work in `examples/zecshop`, a small Zcash checkout with a mock wallet RPC (it answers `z_sendmany` the way zallet does). It contains five realistic mistakes. All addresses in it are synthetic testnet values.

## 1. Scan the app as shipped

```bash
node bin/zcashflight.js run --dir examples/zecshop
```

ZcashFlight starts ZecShop with its collector loaded, runs three scenarios (checkout, refunds, errors) and evaluates what the app sent and logged.

**Checkpoint:** you see `5 privacy leaks found.` and `7 kept off the network`. Those seven are the requests to analytics, the error reporter and the price API. During the test they were answered locally and never sent.

## 2. Read one finding

Take the first:

```
high     Address and amount sent to analytics
         A · to analytics.example.com · server.ts:56
         body.props.recipient: utest1dh…lcr2 (checksum ✓)
```

- **Rule A** means protected data went somewhere the policy doesn't allow. `analytics.example.com` is listed in `zcashflight.yml`, but with `allow: []`, so it may receive event names only.
- **server.ts:56** is where the value was handed over: `track('checkout', { recipient, amount })`. ZcashFlight records your code's own stack frames, so it points past the HTTP client to the line you'd change.
- **checksum ✓** means this is a real unified-address encoding, not something that only looks like one. The value itself was masked inside the app; ZcashFlight never stored it.

Open `examples/zecshop/.zcashflight/runs/0001.json` and search for `utest1dh7u`. You won't find it. Only `utest1dh…lcr2` is there.

## 3. Fix it

The fixes are real code changes, kept side by side so you can compare them:

```bash
diff examples/zecshop/seeded/lib/analytics.ts examples/zecshop/fixes/lib/analytics.ts
```

Apply all five:

```bash
node examples/zecshop/scripts/fixes.ts apply
```

## 4. Verify

```bash
node bin/zcashflight.js run --dir examples/zecshop
```

```bash
node bin/zcashflight.js compare --dir examples/zecshop
```

**Result:** `All 5 leaks closed. No leaks detected in these tests.`, then `run 1 → run 2: clean` with five `closed` lines. Findings are matched by a stable ID (rule, destination, code path and data classes, not line numbers), so a fix that moves code around still counts as the same finding.

## 5. Watch a regression get caught

Bring one leak back, then run the CI gate:

```bash
cp examples/zecshop/seeded/lib/errors.ts examples/zecshop/lib/errors.ts
```

```bash
node bin/zcashflight.js run --dir examples/zecshop --ci
```

It exits with code 1 and marks `Memo sent to error monitoring` as **new**. In CI, that fails the pull request.

Restore the sample when you're done:

```bash
node examples/zecshop/scripts/fixes.ts reset
```

## What you learned

ZcashFlight turns "is this private?" into a test with evidence: scan, prove, fix, verify. Next, [run it on your own app](quickstart.md) or read [why application-layer privacy matters](../concepts/application-layer-privacy.md).
