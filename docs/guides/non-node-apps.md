---
title: Test a non-Node app
description: Capture a Rust, Go, Python or other app's outbound traffic through ZcashFlight's local proxy.
audience: developer
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-21
---

# Test a non-Node app

**Outcome:** ZcashFlight sees what your app sends, whatever language it is written in.

**Before you start:** your app's HTTP client honours the `HTTP_PROXY` and `HTTPS_PROXY` environment variables. Most do: Rust `reqwest`, Go `net/http`, Python `requests`, curl.

**What the proxy can and cannot see** (tested with a standard-library Python app, [`test/fixtures/proxy-python`](../../test/fixtures/proxy-python), on 21 Oct 2026):

| Traffic | What ZcashFlight sees |
|---|---|
| Plain HTTP through the proxy | URL, headers and body (up to 5 MB, gzip/deflate/br decoded): full rules A–D. No code location, because there is no stack trace across processes |
| HTTPS through the proxy (`CONNECT`) | The destination host only. The request is **not decrypted**, and it is reported under "Not inspected" as `HTTPS request (CONNECT tunnel) … encrypted; only the host is visible`, never as clean. Under `strict: true` it fails the gate. With the sinkhole on (the default), the tunnel to a third party is refused, so the app gets a connection error instead of a response |
| Clients that ignore `HTTP_PROXY` / `HTTPS_PROXY`, or pin certificates | Nothing |
| The app's own logs and stdout | Only the log files you list in `logs:` |

To inspect HTTPS bodies, point the app at plain-HTTP test doubles of its services during the test, as ZecShop does with its mock wallet RPC. ZcashFlight does not install a certificate authority or intercept TLS.

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
