---
title: Quickstart — test your own app
description: By the end, ZcashFlight has run your app's scenarios and listed what leaked, with evidence.
audience: developer
type: how-to
owner: maintainer
status: published
product_version: 0.1.0
last_reviewed: 2026-10-18
---

# Quickstart: test your own app

**Goal:** by the end, ZcashFlight has started your app, run one scenario, and told you whether any protected data left it.

**Before you start, you need:**

- Node 22.18 or later (`node --version`).
- An app that starts with one command and answers HTTP on a local port. Node apps are captured directly. For other stacks, see [Test a non-Node app](../guides/non-node-apps.md).
- ZcashFlight on your PATH. It isn't on npm yet, so install it from a checkout once:

  ```bash
  git clone https://github.com/mauyaa/zcashflight && cd zcashflight && npm link
  ```

  Check it with `zcashflight version`, which prints `0.1.0`.
- **Test data only.** Use testnet or regtest and synthetic identifiers. Never point ZcashFlight at production data or real funds.

## Steps

1. In your app's folder, create a policy:

   ```bash
   zcashflight init
   ```

   This writes `zcashflight.yml`. If your `package.json` has a `start` script, the policy uses `npm start`.

2. Open `zcashflight.yml` and set three things:
   - `app.url` and `app.ready`: where your app listens, and a path that answers once it is up (for example `/health`).
   - `destinations`: hosts that may legitimately receive data, such as your wallet RPC. Anything not listed counts as a third party.
   - `scenarios`: one real flow. For example:

   ```yaml
   scenarios:
     - name: checkout
       steps:
         - request: POST /api/checkout
           json: { address: utest1…, amount: 0.1 }
   ```

   For a test address with a valid checksum, run `zcashflight synth`. These values are random and no key exists for them.

3. Run it:

   ```bash
   zcashflight run
   ```

## Check that it worked

The output starts with `zcashflight · <your app> · 1 scenario`, shows each step with its HTTP status, then either:

- `No leaks detected in these tests.`, or
- `N privacy leaks found.` with, for each one, the destination, the line of code, the masked evidence and a one-line fix.

A run file appears in `.zcashflight/runs/0001.json`. To see the same result in the browser, run `zcashflight ui`.

## If it didn't work

| You see | Do this |
|---|---|
| `Something is already listening on …` | Stop the other process on that port, or change `app.url` |
| `… exited before it was ready` | Run `app.start` yourself and fix the error it prints |
| `the app ran but nothing reached the collector` | The app isn't Node, or makes no requests. Set `app.proxy: true` |

More: [Troubleshooting](../guides/troubleshooting.md).

## Next

- [Run it in CI](../guides/run-in-ci.md), so a leak fails the pull request that introduces it.
- [Policy reference](../reference/policy.md): every key, including log allow-lists and step variables.
