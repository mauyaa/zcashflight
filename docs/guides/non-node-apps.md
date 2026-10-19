---
title: Test a non-Node app
description: Capture a Rust, Go, Python or other app's outbound traffic through ZcashFlight's local proxy.
audience: developer
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Test a non-Node app

**Outcome:** ZcashFlight sees what your app sends, whatever language it is written in.

**Before you start:** your app's HTTP client honours the `HTTP_PROXY` and `HTTPS_PROXY` environment variables. Most do: Rust `reqwest`, Go `net/http`, Python `requests`, curl.

**What the proxy can and cannot see:** plain HTTP requests are inspected in full (URL, headers, body). HTTPS requests are **not decrypted**. ZcashFlight records the destination host only, which is enough for rule D (third-party flows) but not for rules A–C. To inspect bodies, point the app at plain-HTTP test doubles of its services during the test, as ZecShop does with its mock wallet RPC.

## Steps (managed run)

1. In `zcashflight.yml`, turn the proxy on:

   ```yaml
   app:
     start: cargo run --release
     url: http://127.0.0.1:8080
     ready: /health
     proxy: true
   ```

2. Run as usual:

   ```bash
   zcashflight run
   ```

   ZcashFlight starts a proxy on a free local port and sets `HTTP_PROXY`, `HTTPS_PROXY` (and the lowercase forms) for your app.

## Steps (an app you start yourself)

1. Start the proxy:

   ```bash
   zcashflight proxy --port 4601
   ```

2. In another terminal, start your app through it and use it:

   ```bash
   HTTP_PROXY=http://127.0.0.1:4601 HTTPS_PROXY=http://127.0.0.1:4601 ./my-wallet-backend
   ```

3. Press Ctrl+C in the proxy terminal. ZcashFlight evaluates what it saw and prints the findings.

## Verify

The report's **Tested** line includes "plus traffic through the local proxy", and **Not tested** says "HTTPS bodies through the proxy (host only; not decrypted)". If you see `We heard nothing`, your client is ignoring the proxy variables.

## Next

- [Test a browser wallet](browser-wallets.md)
- [Policy reference](../reference/policy.md)
