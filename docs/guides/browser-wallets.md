---
title: Test a browser wallet or web checkout
description: Export a HAR file from your browser's DevTools while you use the app, and scan it with the same rules.
audience: developer
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Test a browser wallet or web checkout

**Outcome:** the requests a web app makes from the browser (analytics tags, RPC calls, error reporters) are checked against your policy.

**Before you start:** use a **test profile** with testnet funds or synthetic data. A HAR file contains everything the page sent, including cookies, so treat it as sensitive and delete it when you're done. ZcashFlight never stores the raw file's contents; it masks while reading.

## Steps

1. Open your app in Chrome, Edge or Firefox, open DevTools, and go to **Network**. Turn on **Preserve log**.
2. Do the flow you want to test, such as connect, receive, send or check out.
3. Right-click the request list and choose **Save all as HAR** (Firefox: **Save All As HAR**).
4. Scan it:

   ```bash
   zcashflight scan checkout.har
   ```

   With no `zcashflight.yml` in the folder, ZcashFlight protects everything and approves no destinations, so every third party is reported. Add a policy to approve the hosts you trust.

5. Delete the HAR file.

## Verify

The output lists findings with `via: har` in the run file, and **Tested** reads `Imported: checkout.har`. You can scan log files the same way: `zcashflight scan app.log`.

## Limits

A HAR contains no stack traces, so findings have no code location. Rules C (wallet RPC) apply only if the page calls a wallet RPC over HTTP.

## Next

- [Rules reference](../reference/rules.md)
- [Run in CI](run-in-ci.md)
